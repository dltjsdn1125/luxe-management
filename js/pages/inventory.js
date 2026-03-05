// 주류 관리 페이지
const InventoryPage = {
    filterBranch: null,   // null = 전체, 'string' = 지점명
    filterStaffId: null,  // 하위 호환
    _expandedBranches: new Set(),
    periodType: 'today',
    customFrom: null,
    customTo: null,
    _charts: [],

    _destroyCharts() {
        this._charts.forEach(c => { try { c.destroy(); } catch(e){} });
        this._charts = [];
    },

    async _getEffectiveBranchId() {
        const staff = await DB.getAll('staff');
        const branches = await DB.getAll('branches');
        // 관리자 + 지점 필터 선택 시 해당 지점 ID
        if (Auth.isAdmin() && this.filterBranch) {
            const b = branches.find(x => x.name === this.filterBranch);
            return b ? b.id : null;
        }
        let staffId = await Auth.getStaffId();
        if (!staffId) return null;
        const s = staff.find(x => x.id === staffId);
        if (!s?.branch_name) return null;
        const b = branches.find(x => x.name === s.branch_name);
        return b ? b.id : null;
    },

    _getInvForLiquor(inventory, liquorId, branchId) {
        if (!inventory.length) return null;
        const hasBranch = inventory.some(i => 'branch_id' in i);
        if (!hasBranch) return inventory.find(i => i.liquor_id === liquorId);
        // 지점 선택 시: 해당 지점 재고만 사용 (legacy fallback 제거 → 지점별로 다른 수치 표시)
        if (branchId) {
            return inventory.find(i => i.liquor_id === liquorId && i.branch_id === branchId) || null;
        }
        // 전체 선택 시: 공용 재고(branch_id NULL) 사용
        return inventory.find(i => i.liquor_id === liquorId && !i.branch_id) || inventory.find(i => i.liquor_id === liquorId);
    },

    async render(container) {
        this._destroyCharts();
        const isAdmin = Auth.isAdmin();
        const range = PeriodFilter.getRange(this.periodType, this.customFrom, this.customTo);
        const staff = await DB.getAll('staff');

        // 지점 staff ID 목록 결정
        let staffIds = null;
        if (!isAdmin) {
            const staffId = await Auth.getStaffId();
            const myStaff = staff.find(s => s.id === staffId);
            staffIds = myStaff?.branch_name
                ? staff.filter(s => s.branch_name === myStaff.branch_name).map(s => s.id)
                : [staffId];
        } else if (this.filterBranch) {
            staffIds = staff.filter(s => s.branch_name === this.filterBranch).map(s => s.id);
        }

        const [liquors, allInventory, orders, salesInRange] = await Promise.all([
            DB.getAll('liquor'),
            DB.getAll('liquor_inventory'),
            DB.getFiltered('liquor_orders', { from: range.from, to: range.to, staffIds, staffField: 'entered_by', orderField: 'date', orderAsc: false }),
            DB.getFiltered('daily_sales',   { from: range.from, to: range.to, orderField: 'date', orderAsc: false }),
        ]);
        const effectiveBranchId = await this._getEffectiveBranchId();

        // 지점 목록
        const branchNames = [...new Set(staff.map(s => s.branch_name).filter(Boolean))].sort();

        // 발주내역: 지점별 → 직원별 아코디언 구조 생성
        const buildOrderAccordion = (ordersToShow) => {
            if (!isAdmin) {
                // 비관리자: 단순 테이블
                return ordersToShow.map(o => {
                    const lq = liquors.find(l => l.id === o.liquor_id);
                    return `<tr class="hover:bg-slate-800/30">
                        <td class="px-4 py-3 text-slate-400 font-mono text-xs">${o.date}</td>
                        <td class="px-4 py-3 font-semibold text-white">${lq ? lq.name : o.liquor_name || '-'}</td>
                        <td class="px-4 py-3 text-center font-mono text-emerald-500">+${o.quantity}</td>
                        <td class="px-4 py-3 text-slate-500 hidden sm:table-cell">${o.supplier || '-'}</td>
                        <td class="px-4 py-3 text-right font-mono text-white">${Format.won(o.total_cost)}</td>
                        <td class="px-4 py-3 text-right text-slate-500 text-xs">-</td>
                    </tr>`;
                }).join('');
            }

            // 관리자: 지점별 그룹핑
            const branchesToShow = this.filterBranch ? [this.filterBranch] : branchNames;
            let html = '';
            branchesToShow.forEach(bn => {
                const bStaff = staff.filter(s => s.branch_name === bn);
                const bStaffIds = bStaff.map(s => s.id);
                const bOrders = ordersToShow.filter(o => bStaffIds.includes(o.entered_by));
                if (bOrders.length === 0) return;

                const bTotal = bOrders.reduce((s, o) => s + (o.total_cost || 0), 0);
                const bQty = bOrders.reduce((s, o) => s + (o.quantity || 0), 0);
                const branchRowId = 'inv_branch_' + bn.replace(/\s/g, '_');
                const isExpanded = this._expandedBranches.has(bn);

                // 직원별 서브 행
                const staffRows = bStaff.map(sv => {
                    const sOrders = bOrders.filter(o => o.entered_by === sv.id);
                    if (sOrders.length === 0) return '';
                    const sTotal = sOrders.reduce((s, o) => s + (o.total_cost || 0), 0);
                    const sQty = sOrders.reduce((s, o) => s + (o.quantity || 0), 0);
                    const roleLabel = sv.role === 'president' ? '영업사장' : sv.role === 'manager' ? '영업실장' : '스탭';
                    const roleColor = sv.role === 'president' ? 'text-yellow-300' : sv.role === 'manager' ? 'text-blue-300' : 'text-slate-400';
                    // 직원 발주 세부 행
                    const detailRows = sOrders.map(o => {
                        const lq = liquors.find(l => l.id === o.liquor_id);
                        return `<tr class="inv-staff-detail hidden bg-slate-950/60 border-l-2 border-blue-500/20" data-staff-group="${branchRowId}_${sv.id}">
                            <td class="pl-16 pr-4 py-2 text-slate-500 font-mono text-[10px]">${o.date}</td>
                            <td class="px-4 py-2 text-slate-300 text-xs">${lq ? lq.name : o.liquor_name || '-'}</td>
                            <td class="px-4 py-2 text-center font-mono text-emerald-400 text-xs">+${o.quantity}</td>
                            <td class="px-4 py-2 text-slate-500 text-xs hidden sm:table-cell">${o.supplier || '-'}</td>
                            <td class="px-4 py-2 text-right font-mono text-slate-300 text-xs">${Format.won(o.total_cost)}</td>
                            <td class="px-4 py-2"></td>
                        </tr>`;
                    }).join('');

                    return `
                    <tr class="inv-branch-detail hidden hover:bg-slate-800/20 cursor-pointer border-l-2 border-slate-700/50 inv-staff-toggle"
                        data-branch-group="${branchRowId}" data-staff-id="${sv.id}" data-staff-group-id="${branchRowId}_${sv.id}">
                        <td class="pl-10 pr-4 py-2.5">
                            <div class="flex items-center gap-2">
                                <span class="material-symbols-outlined text-slate-600 text-sm">subdirectory_arrow_right</span>
                                <span class="material-symbols-outlined text-slate-500 text-xs inv-staff-chevron transition-transform" data-staff-chevron="${branchRowId}_${sv.id}">chevron_right</span>
                                <span class="${roleColor} text-[10px] font-bold">${roleLabel}</span>
                                <span class="text-slate-300 text-xs font-semibold">${sv.name}</span>
                                <span class="text-slate-600 text-[10px]">${sOrders.length}건</span>
                            </div>
                        </td>
                        <td class="px-4 py-2.5 text-slate-300 text-xs font-mono" colspan="2">총 ${sQty}병</td>
                        <td class="px-4 py-2.5 hidden sm:table-cell"></td>
                        <td class="px-4 py-2.5 text-right font-mono text-slate-300 text-xs">${Format.won(sTotal)}</td>
                        <td class="px-4 py-2.5"></td>
                    </tr>
                    ${detailRows}`;
                }).join('');

                html += `
                <!-- 지점 헤더 행 -->
                <tr class="inv-branch-header hover:bg-slate-800/50 cursor-pointer transition-colors border-b border-slate-700/50 inv-branch-toggle"
                    data-branch-toggle="${branchRowId}" data-branch-name="${bn}">
                    <td class="px-4 py-3.5">
                        <div class="flex items-center gap-3">
                            <span class="material-symbols-outlined text-slate-500 text-base inv-branch-chevron transition-transform ${isExpanded ? 'rotate-90' : ''}" data-branch-chevron="${branchRowId}">chevron_right</span>
                            <div class="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
                                <span class="material-symbols-outlined text-blue-400 text-sm">store</span>
                            </div>
                            <div>
                                <span class="font-bold text-white text-sm">${bn}</span>
                                <span class="text-[10px] text-slate-500 ml-2">${bOrders.length}건 · ${bStaff.filter(sv => bOrders.some(o => o.entered_by === sv.id)).length}명</span>
                            </div>
                        </div>
                    </td>
                    <td class="px-4 py-3.5 text-right font-bold text-white" colspan="2">${bQty}병</td>
                    <td class="px-4 py-3.5 hidden sm:table-cell"></td>
                    <td class="px-4 py-3.5 text-right font-bold text-white">${Format.won(bTotal)}</td>
                    <td class="px-4 py-3.5"></td>
                </tr>
                ${staffRows}`;
            });

            // 미분류(지점 없는 직원 발주)
            const assignedStaffIds = staff.filter(s => s.branch_name).map(s => s.id);
            const unassignedOrders = ordersToShow.filter(o => !assignedStaffIds.includes(o.entered_by));
            if (unassignedOrders.length > 0) {
                html += unassignedOrders.map(o => {
                    const lq = liquors.find(l => l.id === o.liquor_id);
                    const sv = staff.find(s => s.id === o.entered_by);
                    return `<tr class="hover:bg-slate-800/30">
                        <td class="px-4 py-3 text-slate-400 font-mono text-xs">${o.date}</td>
                        <td class="px-4 py-3 font-semibold text-white">${lq ? lq.name : '-'}</td>
                        <td class="px-4 py-3 text-center font-mono text-emerald-500">+${o.quantity}</td>
                        <td class="px-4 py-3 text-slate-500 hidden sm:table-cell">${o.supplier || '-'}</td>
                        <td class="px-4 py-3 text-right font-mono text-white">${Format.won(o.total_cost)}</td>
                        <td class="px-4 py-3 text-xs text-slate-500">${sv ? sv.name : '-'}</td>
                    </tr>`;
                }).join('');
            }

            return html || `<tr><td colspan="6" class="px-6 py-12 text-center text-slate-500">발주 내역이 없습니다.</td></tr>`;
        };

        container.innerHTML = `
        <div class="max-w-[1600px] mx-auto p-4 md:p-6 space-y-6">
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
                <h2 class="text-xl md:text-2xl font-bold flex items-center gap-2">
                    <span class="material-symbols-outlined text-blue-500">inventory_2</span>
                    주류 재고 관리
                </h2>
                <div class="flex gap-2">
                    <button id="btn-export-inventory" class="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 px-3 rounded-md transition-all flex items-center gap-1">
                        <span class="material-symbols-outlined text-sm">download</span> 엑셀
                    </button>
                    ${isAdmin ? `<button id="btn-add-liquor" class="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 px-3 rounded-md transition-all flex items-center gap-1">
                        <span class="material-symbols-outlined text-sm">add</span> 주종 추가
                    </button>` : ''}
                    <button id="btn-add-order" class="text-xs bg-blue-500 hover:bg-blue-600 text-white py-2 px-3 rounded-md transition-all flex items-center gap-1 font-bold">
                        <span class="material-symbols-outlined text-sm">shopping_cart</span> 발주 등록
                    </button>
                </div>
            </div>

            ${PeriodFilter.renderUI(this.periodType, this.customFrom, this.customTo, 'iv')}

            ${isAdmin ? `
            <!-- 지점 필터 탭 -->
            <div class="flex flex-wrap gap-2 items-center">
                <button class="inv-branch-filter px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${!this.filterBranch ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}" data-branch="">
                    전체 (${branchNames.length}개 지점)
                </button>
                ${branchNames.map(bn => `<button class="inv-branch-filter px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${this.filterBranch === bn ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}" data-branch="${bn}">${bn}</button>`).join('')}
            </div>` : ''}

            <!-- 재고 현황 카드 (지점별 필터) -->
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                ${liquors.map(l => {
                    const inv = InventoryPage._getInvForLiquor(allInventory, l.id, effectiveBranchId);
                    const qty = inv ? inv.quantity : 0;
                    const threshold = inv ? inv.alert_threshold : 10;
                    const pct = Math.min(100, (qty / Math.max(threshold * 5, 1)) * 100);
                    const isLow = qty <= threshold;
                    const colorCls = isLow ? 'red-300' : qty <= threshold * 2 ? 'amber-300' : 'emerald-500';
                    const statusText = isLow ? 'LOW STOCK' : qty <= threshold * 2 ? 'MODERATE' : 'STABLE';

                    return `
                    <div class="bg-slate-900 border ${isLow ? 'border-red-300/30 bg-gradient-to-br from-slate-900 to-red-900/10' : 'border-slate-800 hover:border-blue-500/50'} p-4 md:p-5 rounded-xl transition-colors group">
                        <div class="flex justify-between items-start mb-3 md:mb-4">
                            <div>
                                <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">${l.name}</p>
                                <p class="text-[10px] text-slate-600">원가 ${Format.number(l.cost_price)} / 판매 ${Format.number(l.sell_price)}</p>
                            </div>
                            <span class="material-symbols-outlined ${isLow ? 'text-red-300' : 'text-blue-500'} bg-${colorCls}/10 p-1.5 rounded-lg text-sm">${isLow ? 'warning' : 'liquor'}</span>
                        </div>
                        <div class="flex items-end justify-between">
                            <div>
                                <span class="text-2xl md:text-3xl font-black ${isLow ? 'text-red-300' : 'text-white'}">${qty}</span>
                                <span class="text-slate-500 text-sm ml-1">병</span>
                            </div>
                            <span class="text-[10px] text-${colorCls} font-bold bg-${colorCls}/10 px-2 py-0.5 rounded ${isLow ? 'animate-pulse' : ''}">${statusText}</span>
                        </div>
                        <div class="mt-3 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                            <div class="h-full bg-${colorCls} rounded-full" style="width:${pct}%"></div>
                        </div>
                        ${isAdmin ? `<div class="mt-3 flex gap-2">
                            <button class="text-[10px] text-blue-500 font-bold hover:underline" data-edit-liquor="${l.id}">수정</button>
                            <button class="text-[10px] text-slate-500 hover:text-red-300" data-delete-liquor="${l.id}">삭제</button>
                        </div>` : ''}
                    </div>`;
                }).join('')}
            </div>

            <!-- 차트 영역 -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <!-- 월별 발주량 vs 판매량 비교 -->
                <div class="bg-slate-900 rounded-xl border border-slate-800 p-4 md:p-6">
                    <h4 class="text-sm font-bold mb-4 flex items-center gap-2">
                        <span class="material-symbols-outlined text-blue-500 text-base">bar_chart</span>
                        월별 발주량 vs 판매량
                    </h4>
                    <div class="relative h-64"><canvas id="chart-order-vs-sales"></canvas></div>
                </div>

                <!-- 주종별 매출 기여 비율 -->
                <div class="bg-slate-900 rounded-xl border border-slate-800 p-4 md:p-6">
                    <h4 class="text-sm font-bold mb-4 flex items-center gap-2">
                        <span class="material-symbols-outlined text-purple-500 text-base">pie_chart</span>
                        주종별 매출 기여 비율
                    </h4>
                    <div class="relative h-64"><canvas id="chart-liquor-revenue"></canvas></div>
                </div>

                <!-- 월별 발주 추이 -->
                <div class="bg-slate-900 rounded-xl border border-slate-800 p-4 md:p-6 lg:col-span-2">
                    <h4 class="text-sm font-bold mb-4 flex items-center gap-2">
                        <span class="material-symbols-outlined text-emerald-500 text-base">trending_up</span>
                        월별 발주 추이 (금액)
                    </h4>
                    <div class="relative h-64"><canvas id="chart-order-trend"></canvas></div>
                </div>
            </div>

            <!-- 발주 내역 (지점→직원 아코디언) -->
            <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <div class="p-4 border-b border-slate-800 flex items-center justify-between">
                    <h3 class="font-bold flex items-center gap-2">
                        <span class="material-symbols-outlined text-blue-500">history</span> 발주 내역
                        ${isAdmin && this.filterBranch ? `<span class="text-xs font-normal text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">${this.filterBranch}</span>` : ''}
                    </h3>
                    ${isAdmin ? `<button id="btn-expand-all-inv" class="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                        <span class="material-symbols-outlined text-sm">unfold_more</span> 전체 펼치기
                    </button>` : ''}
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-sm" style="min-width:520px">
                        <thead class="bg-slate-800/50 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            <tr>
                                <th class="px-4 py-3">지점 / 직원 / 날짜</th>
                                <th class="px-4 py-3">주종</th>
                                <th class="px-4 py-3 text-center">수량</th>
                                <th class="px-4 py-3 hidden sm:table-cell">공급업체</th>
                                <th class="px-4 py-3 text-right">금액</th>
                                <th class="px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-800" id="inv-order-tbody">
                            ${buildOrderAccordion(orders)}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;

        this.bindEvents(container, liquors, allInventory, orders, effectiveBranchId);
        const chartBranchStaffIds = (isAdmin && this.filterBranch) ? staff.filter(s => s.branch_name === this.filterBranch).map(s => s.id) : null;
        await this.renderCharts(liquors, chartBranchStaffIds);
    },

    async renderCharts(liquors, chartBranchStaffIds) {
        if (typeof Chart === 'undefined') return;
        if (typeof ChartDataLabels !== 'undefined') Chart.register(ChartDataLabels);
        const chartColors = ['#3b82f6', '#10b981', '#8b5cf6', '#FCD34D', '#fca5a5', '#06b6d4', '#ec4899'];
        const gridColor = 'rgba(148,163,184,0.1)';
        const tickColor = '#64748b';
        const dlCount = { color: '#fff', font: { size: 10, weight: 'bold' }, formatter: v => v > 0 ? v : '', anchor: 'end', align: 'end', offset: -2 };
        const dlWon = { color: '#fff', font: { size: 10, weight: 'bold' }, formatter: v => v > 0 ? (v/10000).toFixed(0) + '만' : '', anchor: 'end', align: 'end', offset: -2 };

        // 1. 월별 발주량 vs 판매량 - 최근 6개월만 DB 레벨 쿼리
        const d0 = new Date(); d0.setMonth(d0.getMonth() - 5);
        const chartFrom = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}-01`;
        const chartTo = Format.today();
        const chartStaffIds = (chartBranchStaffIds && chartBranchStaffIds.length > 0) ? chartBranchStaffIds : null;
        const [allOrders, allSales] = await Promise.all([
            DB.getFiltered('liquor_orders', { from: chartFrom, to: chartTo, staffIds: chartStaffIds, staffField: 'entered_by', limit: 5000 }),
            DB.getFiltered('daily_sales', { from: chartFrom, to: chartTo, staffIds: chartStaffIds, staffField: 'entered_by', limit: 5000 }),
        ]);
        const months = {};
        const last6 = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(); d.setMonth(d.getMonth() - i);
            const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
            last6.push(key);
            months[key] = { ordered: 0, sold: 0 };
        }
        allOrders.forEach(o => {
            const m = o.date ? o.date.substring(0, 7) : '';
            if (months[m] !== undefined) months[m].ordered += (o.quantity || 0);
        });
        allSales.forEach(s => {
            const m = s.date ? s.date.substring(0, 7) : '';
            if (months[m] !== undefined && s.liquor_items) {
                s.liquor_items.forEach(item => { months[m].sold += (item.qty || 0) + (item.service || 0); });
            }
        });

        const ctx1 = document.getElementById('chart-order-vs-sales');
        if (ctx1) {
            this._charts.push(new Chart(ctx1, {
                type: 'bar',
                data: {
                    labels: last6.map(k => k.substring(2)),
                    datasets: [
                        { label: '발주량', data: last6.map(k => months[k].ordered), backgroundColor: 'rgba(59,130,246,0.7)', borderRadius: 4 },
                        { label: '판매량', data: last6.map(k => months[k].sold), backgroundColor: 'rgba(16,185,129,0.7)', borderRadius: 4 }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false }, datalabels: dlCount },
                    scales: {
                        x: { grid: { color: gridColor }, ticks: { color: tickColor } },
                        y: { grid: { color: gridColor }, ticks: { color: tickColor } }
                    }
                }
            }));
        }

        // 2. 주종별 매출 기여 비율 (판매 금액 기준)
        const revByLiquor = {};
        allSales.forEach(s => {
            if (s.liquor_items) {
                s.liquor_items.forEach(item => {
                    revByLiquor[item.name] = (revByLiquor[item.name] || 0) + (item.subtotal || 0);
                });
            }
        });
        const revEntries = Object.entries(revByLiquor).sort((a, b) => b[1] - a[1]);

        const ctx2 = document.getElementById('chart-liquor-revenue');
        if (ctx2) {
            this._charts.push(new Chart(ctx2, {
                type: 'doughnut',
                data: {
                    labels: revEntries.map(e => e[0]),
                    datasets: [{
                        data: revEntries.map(e => e[1]),
                        backgroundColor: chartColors.slice(0, revEntries.length),
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false }, datalabels: { color: '#fff', font: { size: 11, weight: 'bold' }, formatter: (v, c) => { const total = c.dataset.data.reduce((a, b) => a + b, 0); const pct = total > 0 ? Math.round(v / total * 100) : 0; return pct >= 5 ? c.chart.data.labels[c.dataIndex] + '\n' + pct + '%' : ''; }, textAlign: 'center' } }
                }
            }));
        }

        // 3. 월별 발주 추이 (금액)
        const orderAmtByMonth = {};
        last6.forEach(k => { orderAmtByMonth[k] = 0; });
        allOrders.forEach(o => {
            const m = o.date ? o.date.substring(0, 7) : '';
            if (orderAmtByMonth[m] !== undefined) orderAmtByMonth[m] += (o.total_cost || 0);
        });

        const ctx3 = document.getElementById('chart-order-trend');
        if (ctx3) {
            this._charts.push(new Chart(ctx3, {
                type: 'line',
                data: {
                    labels: last6.map(k => k.substring(2)),
                    datasets: [{
                        label: '발주 금액',
                        data: last6.map(k => orderAmtByMonth[k]),
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16,185,129,0.1)',
                        fill: true,
                        tension: 0.3,
                        pointRadius: 5,
                        pointBackgroundColor: '#10b981'
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false }, datalabels: { ...dlWon, anchor: 'end', align: 'top', offset: 4 } },
                    scales: {
                        x: { grid: { color: gridColor }, ticks: { color: tickColor } },
                        y: { grid: { color: gridColor }, ticks: { color: tickColor, callback: v => '₩' + (v/10000).toFixed(0) + '만' } }
                    }
                }
            }));
        }
    },

    bindEvents(container, liquors, allInventory, orders, effectiveBranchId) {
        document.getElementById('btn-export-inventory').addEventListener('click', () => {
            ExcelExport.exportOrders(orders, liquors);
        });

        PeriodFilter.bindEvents(container, 'iv', (type, from, to) => {
            this.periodType = type; this.customFrom = from; this.customTo = to;
            App.renderPage('inventory');
        });

        // 지점 필터 탭
        container.querySelectorAll('.inv-branch-filter').forEach(btn => {
            btn.addEventListener('click', () => {
                this.filterBranch = btn.dataset.branch || null;
                this._expandedBranches.clear();
                App.renderPage('inventory');
            });
        });

        // 발주 내역 지점 아코디언 토글
        container.querySelectorAll('.inv-branch-toggle').forEach(row => {
            row.addEventListener('click', () => {
                const bid = row.dataset.branchToggle;
                const bn = row.dataset.branchName;
                const detailRows = container.querySelectorAll(`.inv-branch-detail[data-branch-group="${bid}"]`);
                const chevron = container.querySelector(`[data-branch-chevron="${bid}"]`);
                if (this._expandedBranches.has(bn)) {
                    this._expandedBranches.delete(bn);
                    detailRows.forEach(r => r.classList.add('hidden'));
                    chevron?.classList.remove('rotate-90');
                } else {
                    this._expandedBranches.add(bn);
                    detailRows.forEach(r => r.classList.remove('hidden'));
                    chevron?.classList.add('rotate-90');
                }
            });
        });

        // 직원 서브 아코디언 토글
        container.querySelectorAll('.inv-staff-toggle').forEach(row => {
            row.addEventListener('click', (e) => {
                e.stopPropagation();
                const sgid = row.dataset.staffGroupId;
                const detailRows = container.querySelectorAll(`.inv-staff-detail[data-staff-group="${sgid}"]`);
                const chevron = container.querySelector(`[data-staff-chevron="${sgid}"]`);
                const isHidden = detailRows.length > 0 && detailRows[0].classList.contains('hidden');
                detailRows.forEach(r => r.classList.toggle('hidden', !isHidden));
                chevron?.classList.toggle('rotate-90', isHidden);
            });
        });

        // 전체 펼치기/접기
        let allExpanded = false;
        document.getElementById('btn-expand-all-inv')?.addEventListener('click', (e) => {
            allExpanded = !allExpanded;
            container.querySelectorAll('.inv-branch-detail').forEach(r => r.classList.toggle('hidden', !allExpanded));
            container.querySelectorAll('.inv-branch-chevron').forEach(c => c.classList.toggle('rotate-90', allExpanded));
            if (allExpanded) {
                container.querySelectorAll('.inv-branch-toggle').forEach(r => this._expandedBranches.add(r.dataset.branchName));
            } else {
                this._expandedBranches.clear();
                container.querySelectorAll('.inv-staff-detail').forEach(r => r.classList.add('hidden'));
                container.querySelectorAll('[data-staff-chevron]').forEach(c => c.classList.remove('rotate-90'));
            }
            const btn = e.currentTarget;
            btn.innerHTML = allExpanded
                ? '<span class="material-symbols-outlined text-sm">unfold_less</span> 전체 접기'
                : '<span class="material-symbols-outlined text-sm">unfold_more</span> 전체 펼치기';
        });

        const addLiquorBtn = document.getElementById('btn-add-liquor');
        if (addLiquorBtn) addLiquorBtn.addEventListener('click', () => {
            App.showModal('주종 추가', `
                <div class="space-y-4">
                    <div class="space-y-2"><label class="text-xs font-medium text-slate-400">주종 이름</label>
                        <input id="lq-name" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" placeholder="예: 다이아 17"/></div>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2"><label class="text-xs font-medium text-slate-400">원가</label>
                            <input id="lq-cost" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono" placeholder="0"/></div>
                        <div class="space-y-2"><label class="text-xs font-medium text-slate-400">판매가</label>
                            <input id="lq-sell" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono" placeholder="0"/></div>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2"><label class="text-xs font-medium text-slate-400">초기 재고</label>
                            <input id="lq-qty" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" type="number" value="0"/></div>
                        <div class="space-y-2"><label class="text-xs font-medium text-slate-400">경고 기준</label>
                            <input id="lq-alert" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" type="number" value="10"/></div>
                    </div>
                </div>
            `, async () => {
                const name = document.getElementById('lq-name').value.trim();
                if (!name) { App.toast('주종 이름을 입력해주세요.', 'error'); return; }
                const liquor = await DB.insert('liquor', {
                    name, cost_price: Format.parseNumber(document.getElementById('lq-cost').value),
                    sell_price: Format.parseNumber(document.getElementById('lq-sell').value)
                });
                await DB.insert('liquor_inventory', {
                    liquor_id: liquor.id,
                    quantity: parseInt(document.getElementById('lq-qty').value) || 0,
                    alert_threshold: parseInt(document.getElementById('lq-alert').value) || 10
                });
                App.toast('주종이 추가되었습니다.', 'success');
                App.renderPage('inventory');
            });
        });

        document.getElementById('btn-add-order').addEventListener('click', () => {
            App.showModal('발주 등록', `
                <div class="space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2"><label class="text-xs font-medium text-slate-400">발주일</label>
                            <input id="ord-date" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" type="date" value="${Format.today()}"/></div>
                        <div class="space-y-2"><label class="text-xs font-medium text-slate-400">주종</label>
                            <select id="ord-liquor" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm">
                                ${liquors.map(l => `<option value="${l.id}" data-cost="${l.cost_price}">${l.name}</option>`).join('')}
                            </select></div>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2"><label class="text-xs font-medium text-slate-400">수량</label>
                            <input id="ord-qty" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" type="number" placeholder="0"/></div>
                        <div class="space-y-2"><label class="text-xs font-medium text-slate-400">단가</label>
                            <input id="ord-price" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono" placeholder="0"/></div>
                    </div>
                    <div class="space-y-2"><label class="text-xs font-medium text-slate-400">공급업체</label>
                        <input id="ord-supplier" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" placeholder="예: 동성도매"/></div>
                </div>
            `, async () => {
                const liquorId = document.getElementById('ord-liquor').value;
                const qty = parseInt(document.getElementById('ord-qty').value) || 0;
                const price = Format.parseNumber(document.getElementById('ord-price').value);
                if (qty <= 0) { App.toast('수량을 입력해주세요.', 'error'); return; }

                const orderStaffId = await Auth.getStaffId();
                await DB.insert('liquor_orders', {
                    date: document.getElementById('ord-date').value,
                    liquor_id: liquorId,
                    quantity: qty, unit_price: price, total_cost: qty * price,
                    supplier: document.getElementById('ord-supplier').value.trim(),
                    entered_by: orderStaffId
                });

                const orderStaff = (await DB.getAll('staff')).find(s => s.id === orderStaffId);
                const branches = await DB.getAll('branches');
                const orderBranchId = orderStaff?.branch_name ? (branches.find(b => b.name === orderStaff.branch_name)?.id) : null;
                const allInv = await DB.getAll('liquor_inventory');
                const hasBranch = allInv.some(i => 'branch_id' in i);
                const inv = hasBranch && orderBranchId
                    ? allInv.find(i => i.liquor_id === liquorId && i.branch_id === orderBranchId)
                    : allInv.find(i => i.liquor_id === liquorId && !i.branch_id);
                const invLegacy = !inv && hasBranch ? allInv.find(i => i.liquor_id === liquorId && !i.branch_id) : null;
                const targetInv = inv || invLegacy;
                if (targetInv) {
                    await DB.update('liquor_inventory', targetInv.id, { quantity: targetInv.quantity + qty });
                } else {
                    await DB.insert('liquor_inventory', {
                        liquor_id: liquorId, quantity: qty, alert_threshold: 10,
                        ...(orderBranchId && hasBranch && { branch_id: orderBranchId })
                    });
                }

                App.toast('발주가 등록되고 재고에 반영되었습니다.', 'success');
                App.renderPage('inventory');
            });

            document.getElementById('ord-liquor').addEventListener('change', (e) => {
                const opt = e.target.selectedOptions[0];
                if (opt) document.getElementById('ord-price').value = Format.number(opt.dataset.cost);
            });
        });

        container.querySelectorAll('[data-edit-liquor]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const l = await DB.getById('liquor', btn.dataset.editLiquor);
                const inv = InventoryPage._getInvForLiquor(allInventory, l.id, effectiveBranchId) || (await DB.getAll('liquor_inventory')).find(i => i.liquor_id === l.id);
                if (!l) return;
                App.showModal('주종 수정', `
                    <div class="space-y-4">
                        <div class="space-y-2"><label class="text-xs font-medium text-slate-400">이름</label>
                            <input id="lq-name" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" value="${l.name}"/></div>
                        <div class="grid grid-cols-2 gap-4">
                            <div class="space-y-2"><label class="text-xs font-medium text-slate-400">원가</label>
                                <input id="lq-cost" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono" value="${Format.number(l.cost_price)}"/></div>
                            <div class="space-y-2"><label class="text-xs font-medium text-slate-400">판매가</label>
                                <input id="lq-sell" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono" value="${Format.number(l.sell_price)}"/></div>
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div class="space-y-2"><label class="text-xs font-medium text-slate-400">현재 재고</label>
                                <input id="lq-qty" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" type="number" value="${inv ? inv.quantity : 0}"/></div>
                            <div class="space-y-2"><label class="text-xs font-medium text-slate-400">경고 기준</label>
                                <input id="lq-alert" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" type="number" value="${inv ? inv.alert_threshold : 10}"/></div>
                        </div>
                    </div>
                `, async () => {
                    await DB.update('liquor', l.id, {
                        name: document.getElementById('lq-name').value.trim(),
                        cost_price: Format.parseNumber(document.getElementById('lq-cost').value),
                        sell_price: Format.parseNumber(document.getElementById('lq-sell').value)
                    });
                    if (inv) {
                        await DB.update('liquor_inventory', inv.id, {
                            quantity: parseInt(document.getElementById('lq-qty').value) || 0,
                            alert_threshold: parseInt(document.getElementById('lq-alert').value) || 10
                        });
                    }
                    App.toast('주종 정보가 수정되었습니다.', 'success');
                    App.renderPage('inventory');
                });
            });
        });

        container.querySelectorAll('[data-delete-liquor]').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (confirm('이 주종을 삭제하시겠습니까?')) {
                    await DB.delete('liquor', btn.dataset.deleteLiquor);
                    App.toast('삭제되었습니다.', 'info');
                    App.renderPage('inventory');
                }
            });
        });
    }
};

App.register('inventory', InventoryPage);
