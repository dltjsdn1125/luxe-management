// 주류 관리 페이지
const InventoryPage = {
    filterStaffId: null,
    periodType: 'today',
    customFrom: null,
    customTo: null,
    _charts: [],

    _destroyCharts() {
        this._charts.forEach(c => { try { c.destroy(); } catch(e){} });
        this._charts = [];
    },

    async render(container) {
        this._destroyCharts();
        const liquors = await DB.getAll('liquor');
        const inventory = await DB.getAll('liquor_inventory');
        let orders = (await DB.getAll('liquor_orders')).sort((a, b) => b.date.localeCompare(a.date));
        const isAdmin = Auth.isAdmin();
        const range = PeriodFilter.getRange(this.periodType, this.customFrom, this.customTo);
        const staff = await DB.getAll('staff');

        orders = PeriodFilter.filterByDate(orders, 'date', range.from, range.to);

        if (!isAdmin) {
            const staffId = await Auth.getStaffId();
            orders = orders.filter(o => o.entered_by === staffId);
        } else if (this.filterStaffId) {
            orders = orders.filter(o => o.entered_by === this.filterStaffId);
        }

        // 판매 데이터 (정산에서 추출)
        const allSales = await DB.getAll('daily_sales');
        const salesInRange = PeriodFilter.filterByDate(allSales, 'date', range.from, range.to);

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

            ${isAdmin ? `<div class="flex flex-wrap gap-2">
                <button class="inv-filter px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${!this.filterStaffId ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}" data-filter-staff="">전체</button>
                ${staff.map(s => `<button class="inv-filter px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${this.filterStaffId === s.id ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}" data-filter-staff="${s.id}">${s.branch_name ? s.branch_name + '(' + s.name + ')' : s.name}</button>`).join('')}
            </div>` : ''}

            <!-- 재고 현황 카드 -->
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                ${liquors.map(l => {
                    const inv = inventory.find(i => i.liquor_id === l.id);
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

            <!-- 발주 내역 -->
            <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <div class="p-4 border-b border-slate-800">
                    <h3 class="font-bold flex items-center gap-2">
                        <span class="material-symbols-outlined text-blue-500">history</span> 발주 내역
                    </h3>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-sm whitespace-nowrap" style="white-space:nowrap;min-width:500px">
                        <thead class="bg-slate-800/50 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            <tr>
                                <th class="px-4 md:px-6 py-4">날짜</th>
                                <th class="px-4 md:px-6 py-4">주종</th>
                                <th class="px-4 md:px-6 py-4 text-center">수량</th>
                                <th class="px-4 md:px-6 py-4 hidden sm:table-cell">공급업체</th>
                                <th class="px-4 md:px-6 py-4 text-right">금액</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-800">
                            ${orders.length > 0 ? orders.map(o => {
                                const lq = liquors.find(l => l.id === o.liquor_id);
                                return `
                                <tr class="hover:bg-slate-800/30">
                                    <td class="px-4 md:px-6 py-4 text-slate-400 font-mono">${o.date}</td>
                                    <td class="px-4 md:px-6 py-4 font-semibold text-white">${lq ? lq.name : o.liquor_name || '-'}</td>
                                    <td class="px-4 md:px-6 py-4 text-center font-mono text-emerald-500">+${o.quantity}</td>
                                    <td class="px-4 md:px-6 py-4 text-slate-500 hidden sm:table-cell">${o.supplier || '-'}</td>
                                    <td class="px-4 md:px-6 py-4 text-right font-mono text-white">${Format.won(o.total_cost)}</td>
                                </tr>`;
                            }).join('') : `<tr><td colspan="5" class="px-6 py-12 text-center text-slate-500">발주 내역이 없습니다.</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;

        this.bindEvents(container, liquors, inventory, orders);
        await this.renderCharts(liquors, orders, salesInRange);
    },

    async renderCharts(liquors, orders, salesInRange) {
        if (typeof Chart === 'undefined') return;
        if (typeof ChartDataLabels !== 'undefined') Chart.register(ChartDataLabels);
        const chartColors = ['#3b82f6', '#10b981', '#8b5cf6', '#FCD34D', '#fca5a5', '#06b6d4', '#ec4899'];
        const gridColor = 'rgba(148,163,184,0.1)';
        const tickColor = '#64748b';
        const dlCount = { color: '#fff', font: { size: 10, weight: 'bold' }, formatter: v => v > 0 ? v : '', anchor: 'end', align: 'end', offset: -2 };
        const dlWon = { color: '#fff', font: { size: 10, weight: 'bold' }, formatter: v => v > 0 ? (v/10000).toFixed(0) + '만' : '', anchor: 'end', align: 'end', offset: -2 };

        // 1. 월별 발주량 vs 판매량
        const allOrders = await DB.getAll('liquor_orders');
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
        const allSales = await DB.getAll('daily_sales');
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

    bindEvents(container, liquors, inventory, orders) {
        document.getElementById('btn-export-inventory').addEventListener('click', () => {
            ExcelExport.exportOrders(orders, liquors);
        });

        PeriodFilter.bindEvents(container, 'iv', (type, from, to) => {
            this.periodType = type; this.customFrom = from; this.customTo = to;
            App.renderPage('inventory');
        });

        container.querySelectorAll('.inv-filter').forEach(btn => {
            btn.addEventListener('click', () => {
                this.filterStaffId = btn.dataset.filterStaff || null;
                App.renderPage('inventory');
            });
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

                await DB.insert('liquor_orders', {
                    date: document.getElementById('ord-date').value,
                    liquor_id: liquorId,
                    quantity: qty, unit_price: price, total_cost: qty * price,
                    supplier: document.getElementById('ord-supplier').value.trim(),
                    entered_by: await Auth.getStaffId()
                });

                const inv = (await DB.getAll('liquor_inventory')).find(i => i.liquor_id === liquorId);
                if (inv) {
                    await DB.update('liquor_inventory', inv.id, { quantity: inv.quantity + qty });
                } else {
                    await DB.insert('liquor_inventory', { liquor_id: liquorId, quantity: qty, alert_threshold: 10 });
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
                const inv = (await DB.getAll('liquor_inventory')).find(i => i.liquor_id === l.id);
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
