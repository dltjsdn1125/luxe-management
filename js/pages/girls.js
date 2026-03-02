// 아가씨 관리 페이지
const GirlsPage = {
    filterStaffId: null,
    _charts: [],
    _destroyCharts() { this._charts.forEach(c => { try { c.destroy(); } catch(e){} }); this._charts = []; },

    async getFullAttendanceDays(branchId) {
        if (!branchId) {
            const staffId = await Auth.getStaffId();
            if (staffId) {
                const staff = await DB.getById('staff', staffId);
                if (staff && staff.branch_name) {
                    const allBranches = await DB.getAll('branches');
                    const branch = allBranches.find(b => b.name === staff.branch_name);
                    if (branch) branchId = branch.id;
                }
            }
        }
        const val = await DB.getBranchSetting('full_attendance_days', branchId);
        return val ? Number(val) : 25;
    },

    async render(container) {
        this._destroyCharts();
        let girls = await DB.getAll('girls');
        const staff = await DB.getAll('staff');
        let payments = await DB.getAll('girl_payments');
        const isAdmin = Auth.isAdmin();
        const fullAttDays = await this.getFullAttendanceDays();
        const thisMonth = Format.today().substring(0, 7);

        if (!isAdmin) {
            const staffId = await Auth.getStaffId();
            girls = girls.filter(g => g.staff_id === staffId || g.entered_by === staffId);
            const girlIds = girls.map(g => g.id);
            payments = payments.filter(p => girlIds.includes(p.girl_id) || p.entered_by === staffId);
        } else if (this.filterStaffId) {
            girls = girls.filter(g => g.staff_id === this.filterStaffId || g.entered_by === this.filterStaffId);
            const girlIds = girls.map(g => g.id);
            payments = payments.filter(p => girlIds.includes(p.girl_id) || p.entered_by === this.filterStaffId);
        }

        container.innerHTML = `
        <div class="max-w-[1600px] mx-auto p-4 md:p-6 space-y-6">
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 class="text-2xl font-bold text-white">아가씨 관리</h1>
                    <p class="text-slate-400 text-sm">대기비, 만근비, 이벤트 지급을 관리합니다.</p>
                </div>
                <div class="flex gap-2 flex-wrap">
                    <button id="btn-export-girls" class="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs hover:bg-slate-700 transition-colors text-slate-300">
                        <span class="material-symbols-outlined text-sm">download</span> 엑셀
                    </button>
                    ${isAdmin ? `<button id="btn-set-full-att" class="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs hover:bg-slate-700 transition-colors text-slate-300">
                        <span class="material-symbols-outlined text-sm">settings</span> 만근 기준: ${fullAttDays}일
                    </button>` : ''}
                    <button id="btn-add-girl" class="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm hover:bg-slate-700 transition-colors">
                        <span class="material-symbols-outlined text-sm">person_add</span> 등록
                    </button>
                    <button id="btn-add-payment" class="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-bold transition-colors">
                        <span class="material-symbols-outlined text-sm">add</span> 지급 입력
                    </button>
                </div>
            </div>

            ${isAdmin ? `<div class="flex flex-wrap gap-2">
                <button class="girl-filter px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${!this.filterStaffId ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}" data-filter-staff="">전체</button>
                ${staff.map(s => `<button class="girl-filter px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${this.filterStaffId === s.id ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}" data-filter-staff="${s.id}">${s.branch_name ? s.branch_name + '(' + s.name + ')' : s.name}</button>`).join('')}
            </div>` : ''}

            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                ${girls.map(g => {
                    const s = staff.find(st => st.id === g.staff_id);
                    const gPayments = payments.filter(p => p.girl_id === g.id);
                    const totalPaid = gPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
                    const monthlyPayments = gPayments.filter(p => p.date && p.date.startsWith(thisMonth));
                    const workDays = monthlyPayments.filter(p => p.type === 'standby').length;
                    const monthlyPaid = monthlyPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
                    const isFullAtt = workDays >= fullAttDays;

                    return `
                    <div class="bg-slate-900 p-4 md:p-5 rounded-xl border ${isFullAtt ? 'border-emerald-500/30 bg-gradient-to-br from-slate-900 to-emerald-950/10' : 'border-slate-800'} ${!g.active ? 'opacity-50' : ''}">
                        <div class="flex justify-between items-start mb-3">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-full bg-pink-500/10 border border-pink-500/20 flex items-center justify-center">
                                    <span class="material-symbols-outlined text-pink-400">person</span>
                                </div>
                                <div>
                                    <h3 class="font-bold text-white">${g.name}</h3>
                                    <p class="text-[10px] text-slate-500">담당: ${s ? (s.branch_name ? s.branch_name + ' ' + s.name : s.name) : '-'} · 와리 ${g.incentive_rate || 0}%</p>
                                </div>
                            </div>
                            <div class="flex items-center gap-1">
                                ${isFullAtt ? '<span class="text-[10px] font-bold px-2 py-0.5 rounded text-emerald-400 bg-emerald-500/10">만근</span>' : ''}
                                <span class="text-[10px] font-bold px-2 py-0.5 rounded ${g.active ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-500 bg-slate-800'}">${g.active ? '활성' : '비활성'}</span>
                            </div>
                        </div>
                        <div class="grid grid-cols-3 gap-2 text-center mb-2">
                            <div class="bg-slate-800/50 rounded-lg p-2">
                                <p class="text-[10px] text-slate-500">출근일</p>
                                <p class="font-bold ${isFullAtt ? 'text-emerald-400' : 'text-white'}">${workDays}/${fullAttDays}</p>
                            </div>
                            <div class="bg-slate-800/50 rounded-lg p-2">
                                <p class="text-[10px] text-slate-500">이번달</p>
                                <p class="font-bold text-white text-xs">${Format.number(monthlyPaid)}</p>
                            </div>
                            <div class="bg-slate-800/50 rounded-lg p-2">
                                <p class="text-[10px] text-slate-500">총 지급</p>
                                <p class="font-bold text-white text-xs">${Format.number(totalPaid)}</p>
                            </div>
                        </div>
                        <div class="flex gap-3 text-[10px] text-slate-500 mb-3 px-1">
                            <span>대기비: <b class="text-blue-400">${Format.number(g.standby_fee || 0)}</b></span>
                            <span>이벤트: <b class="text-purple-400">${Format.number(g.event_fee || 0)}</b></span>
                        </div>
                        <div class="flex gap-2">
                            <button class="flex-1 text-xs text-blue-500 font-bold py-1.5 bg-blue-500/10 rounded-lg hover:bg-blue-500/20 transition-colors" data-girl-detail="${g.id}">상세</button>
                            <button class="text-xs text-slate-400 py-1.5 px-3 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors" data-edit-girl="${g.id}">수정</button>
                        </div>
                    </div>`;
                }).join('')}
                ${girls.length === 0 ? `<p class="text-slate-500 col-span-3 text-center py-16">등록된 아가씨가 없습니다.</p>` : ''}
            </div>

            <!-- 통계 차트 -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                <div class="bg-slate-900 p-4 md:p-5 rounded-xl border border-slate-800">
                    <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">유형별 지급 비율</h4>
                    <div class="h-48"><canvas id="chart-girl-type"></canvas></div>
                </div>
                <div class="bg-slate-900 p-4 md:p-5 rounded-xl border border-slate-800">
                    <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">인원별 지급 현황</h4>
                    <div class="h-48"><canvas id="chart-girl-person"></canvas></div>
                </div>
                <div class="bg-slate-900 p-4 md:p-5 rounded-xl border border-slate-800">
                    <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">월별 지급 추이</h4>
                    <div class="h-48"><canvas id="chart-girl-monthly"></canvas></div>
                </div>
            </div>

            <!-- 최근 지급 내역 -->
            <div class="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                <div class="p-4 border-b border-slate-800">
                    <h3 class="font-bold">최근 지급 내역</h3>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm text-left whitespace-nowrap">
                        <thead class="bg-slate-800/50 text-[10px] text-slate-500 uppercase tracking-wider">
                            <tr>
                                <th class="px-4 md:px-6 py-3">날짜</th>
                                <th class="px-4 md:px-6 py-3">이름</th>
                                <th class="px-4 md:px-6 py-3">유형</th>
                                <th class="px-4 md:px-6 py-3 text-right">금액</th>
                                <th class="px-4 md:px-6 py-3 hidden sm:table-cell">메모</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-800">
                            ${payments.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20).map(p => {
                                const g = girls.find(girl => girl.id === p.girl_id);
                                const typeLabel = p.type === 'standby' ? '대기비' : p.type === 'full_attendance' ? '만근비' : '이벤트';
                                const typeColor = p.type === 'standby' ? 'blue' : p.type === 'full_attendance' ? 'emerald' : 'purple';
                                return `
                                <tr class="hover:bg-slate-800/30">
                                    <td class="px-4 md:px-6 py-3 text-slate-400 font-mono">${p.date}</td>
                                    <td class="px-4 md:px-6 py-3 text-white font-medium">${g ? g.name : '-'}</td>
                                    <td class="px-4 md:px-6 py-3"><span class="px-2 py-0.5 bg-${typeColor}-500/10 text-${typeColor}-400 text-[10px] font-bold rounded">${typeLabel}</span></td>
                                    <td class="px-4 md:px-6 py-3 text-right font-mono text-white">${Format.won(p.amount)}</td>
                                    <td class="px-4 md:px-6 py-3 text-slate-500 text-xs hidden sm:table-cell">${p.memo || '-'}</td>
                                </tr>`;
                            }).join('')}
                            ${payments.length === 0 ? `<tr><td colspan="5" class="px-6 py-12 text-center text-slate-500">지급 내역이 없습니다.</td></tr>` : ''}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;

        this.bindEvents(container, girls, staff, payments);
        this._renderCharts(girls, payments);
    },

    _renderCharts(girls, payments) {
        if (typeof Chart === 'undefined' || payments.length === 0) return;
        if (typeof ChartDataLabels !== 'undefined') Chart.register(ChartDataLabels);
        const gridColor = 'rgba(148,163,184,0.1)';
        const tickColor = '#64748b';
        const chartColors = ['#3b82f6', '#10b981', '#8b5cf6', '#FCD34D', '#fca5a5', '#06b6d4', '#ec4899'];
        const dlWon = { color: '#fff', font: { size: 10, weight: 'bold' }, formatter: v => v > 0 ? (v/10000).toFixed(0) + '만' : '', anchor: 'end', align: 'end', offset: -2 };

        // 1) 유형별 지급 비율 (Doughnut)
        const typeData = { standby: 0, full_attendance: 0, event: 0 };
        payments.forEach(p => { if (typeData[p.type] !== undefined) typeData[p.type] += Number(p.amount) || 0; });
        const ctx1 = document.getElementById('chart-girl-type');
        if (ctx1) {
            this._charts.push(new Chart(ctx1, {
                type: 'doughnut',
                data: {
                    labels: ['대기비', '만근비', '이벤트'],
                    datasets: [{ data: [typeData.standby, typeData.full_attendance, typeData.event], backgroundColor: ['#3b82f6', '#10b981', '#8b5cf6'], borderWidth: 0 }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, datalabels: { color: '#fff', font: { size: 11, weight: 'bold' }, formatter: (v, c) => { const total = c.dataset.data.reduce((a, b) => a + b, 0); const pct = total > 0 ? Math.round(v / total * 100) : 0; return pct >= 5 ? c.chart.data.labels[c.dataIndex] + '\n' + pct + '%' : ''; }, textAlign: 'center' } }, cutout: '60%' }
            }));
        }

        // 2) 인원별 지급 현황 (Horizontal Bar)
        const girlTotals = {};
        payments.forEach(p => { girlTotals[p.girl_id] = (girlTotals[p.girl_id] || 0) + (Number(p.amount) || 0); });
        const girlEntries = Object.entries(girlTotals).map(([gid, total]) => {
            const g = girls.find(girl => girl.id === gid);
            return { name: g ? g.name : '?', total };
        }).sort((a, b) => b.total - a.total);
        const ctx2 = document.getElementById('chart-girl-person');
        if (ctx2) {
            this._charts.push(new Chart(ctx2, {
                type: 'bar',
                data: {
                    labels: girlEntries.map(e => e.name),
                    datasets: [{ data: girlEntries.map(e => e.total), backgroundColor: chartColors.slice(0, girlEntries.length), borderRadius: 4 }]
                },
                options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, datalabels: dlWon },
                    scales: { x: { grid: { color: gridColor }, ticks: { color: tickColor, callback: v => (v/10000).toFixed(0) + '만' } }, y: { grid: { display: false }, ticks: { color: tickColor, font: { size: 10 } } } } }
            }));
        }

        // 3) 월별 지급 추이 (Line)
        const monthlyData = {};
        payments.forEach(p => {
            if (!p.date) return;
            const m = p.date.substring(0, 7);
            monthlyData[m] = (monthlyData[m] || 0) + (Number(p.amount) || 0);
        });
        const months = Object.keys(monthlyData).sort().slice(-6);
        const ctx3 = document.getElementById('chart-girl-monthly');
        if (ctx3) {
            this._charts.push(new Chart(ctx3, {
                type: 'line',
                data: {
                    labels: months,
                    datasets: [{ data: months.map(m => monthlyData[m]), borderColor: '#ec4899', backgroundColor: 'rgba(236,72,153,0.1)', fill: true, tension: 0.3, pointRadius: 5, pointBackgroundColor: '#ec4899' }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, datalabels: { ...dlWon, anchor: 'end', align: 'top', offset: 4 } },
                    scales: { x: { grid: { color: gridColor }, ticks: { color: tickColor } }, y: { grid: { color: gridColor }, ticks: { color: tickColor, callback: v => (v/10000).toFixed(0) + '만' } } } }
            }));
        }
    },

    bindEvents(container, girls, staff, payments) {
        document.getElementById('btn-export-girls').addEventListener('click', () => {
            ExcelExport.exportGirls(girls, payments, staff);
        });

        container.querySelectorAll('.girl-filter').forEach(btn => {
            btn.addEventListener('click', () => {
                this.filterStaffId = btn.dataset.filterStaff || null;
                App.renderPage('girls');
            });
        });

        // 만근 기준 설정 (관리자)
        const setFullAttBtn = document.getElementById('btn-set-full-att');
        if (setFullAttBtn) {
            setFullAttBtn.addEventListener('click', async () => {
                const current = await this.getFullAttendanceDays();
                App.showModal('만근 기준 설정', `
                    <div class="space-y-4">
                        <div class="space-y-2">
                            <label class="text-xs font-medium text-slate-400">만근 기준 출근일 수 (월 기준)</label>
                            <input id="full-att-days" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" type="number" min="1" max="31" value="${current}"/>
                            <p class="text-[10px] text-slate-500">이 일수 이상 출근(대기비 기록 기준) 시 만근으로 자동 판정됩니다.</p>
                        </div>
                    </div>
                `, async () => {
                    const val = parseInt(document.getElementById('full-att-days').value) || 25;
                    await DB.saveBranchSetting('full_attendance_days', val, null);
                    App.toast(`만근 기준이 ${val}일로 설정되었습니다.`, 'success');
                    App.renderPage('girls');
                });
            });
        }

        document.getElementById('btn-add-girl').addEventListener('click', () => {
            App.showModal('아가씨 등록', `
                <div class="space-y-4">
                    <div class="space-y-2"><label class="text-xs font-medium text-slate-400">이름</label>
                        <input id="g-name" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" placeholder="이름"/></div>
                    <div class="space-y-2"><label class="text-xs font-medium text-slate-400">담당 직원</label>
                        <select id="g-staff" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm">
                            <option value="">없음</option>
                            ${staff.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                        </select></div>
                    <div class="grid grid-cols-3 gap-3">
                        <div class="space-y-2"><label class="text-xs font-medium text-slate-400">와리율 (%)</label>
                            <input id="g-rate" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" type="number" min="0" max="100" value="10"/></div>
                        <div class="space-y-2"><label class="text-xs font-medium text-slate-400">대기비 (원)</label>
                            <input id="g-standby" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono" value="150,000"/></div>
                        <div class="space-y-2"><label class="text-xs font-medium text-slate-400">이벤트비 (원)</label>
                            <input id="g-event" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono" value="200,000"/></div>
                    </div>
                </div>
            `, async () => {
                const name = document.getElementById('g-name').value.trim();
                if (!name) { App.toast('이름을 입력해주세요.', 'error'); return; }
                const staffId = Auth.isAdmin() ? document.getElementById('g-staff').value : await Auth.getStaffId();
                const enteredBy = await Auth.getStaffId();
                await DB.insert('girls', {
                    name, staff_id: staffId, active: true,
                    incentive_rate: parseInt(document.getElementById('g-rate').value) || 10,
                    standby_fee: Format.parseNumber(document.getElementById('g-standby').value) || 150000,
                    event_fee: Format.parseNumber(document.getElementById('g-event').value) || 200000,
                    entered_by: enteredBy
                });
                App.toast('등록되었습니다.', 'success');
                App.renderPage('girls');
            });
        });

        document.getElementById('btn-add-payment').addEventListener('click', () => {
            const activeGirls = girls.filter(g => g.active);
            const girlFees = {};
            activeGirls.forEach(g => { girlFees[g.id] = { standby: g.standby_fee || 0, event: g.event_fee || 0 }; });

            App.showModal('지급 입력', `
                <div class="space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2"><label class="text-xs font-medium text-slate-400">이름</label>
                            <select id="gp-girl" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm">
                                ${activeGirls.map(g => `<option value="${g.id}" data-standby="${g.standby_fee || 0}" data-event="${g.event_fee || 0}">${g.name}</option>`).join('')}
                            </select></div>
                        <div class="space-y-2"><label class="text-xs font-medium text-slate-400">날짜</label>
                            <input id="gp-date" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" type="date" value="${Format.today()}"/></div>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2"><label class="text-xs font-medium text-slate-400">유형</label>
                            <select id="gp-type" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm">
                                <option value="standby">대기비</option>
                                <option value="full_attendance">만근비</option>
                                <option value="event">이벤트</option>
                            </select></div>
                        <div class="space-y-2"><label class="text-xs font-medium text-slate-400">금액 <span id="gp-fee-hint" class="text-blue-400"></span></label>
                            <input id="gp-amount" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono" placeholder="0"/></div>
                    </div>
                    <div class="space-y-2"><label class="text-xs font-medium text-slate-400">메모</label>
                        <input id="gp-memo" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" placeholder="선택사항"/></div>
                </div>
            `, async () => {
                const amount = Format.parseNumber(document.getElementById('gp-amount').value);
                if (!amount) { App.toast('금액을 입력해주세요.', 'error'); return; }
                const gpStaffId = await Auth.getStaffId();
                await DB.insert('girl_payments', {
                    girl_id: document.getElementById('gp-girl').value,
                    date: document.getElementById('gp-date').value,
                    type: document.getElementById('gp-type').value,
                    amount,
                    memo: document.getElementById('gp-memo').value.trim(),
                    staff_id: gpStaffId,
                    entered_by: gpStaffId
                });
                DB.notifyChange();
                App.toast('지급이 기록되었습니다.', 'success');
                App.renderPage('girls');
            });

            const autoFill = () => {
                const girlSel = document.getElementById('gp-girl');
                const typeSel = document.getElementById('gp-type');
                const amountEl = document.getElementById('gp-amount');
                const hintEl = document.getElementById('gp-fee-hint');
                if (!girlSel || !typeSel || !amountEl) return;
                const opt = girlSel.selectedOptions[0];
                const type = typeSel.value;
                let fee = 0;
                if (type === 'standby') fee = parseInt(opt?.dataset.standby) || 0;
                else if (type === 'event') fee = parseInt(opt?.dataset.event) || 0;
                if (fee > 0) {
                    amountEl.value = Format.number(fee);
                    if (hintEl) hintEl.textContent = `(설정: ${Format.number(fee)})`;
                } else {
                    if (hintEl) hintEl.textContent = '';
                }
            };
            setTimeout(() => {
                const girlSel = document.getElementById('gp-girl');
                const typeSel = document.getElementById('gp-type');
                if (girlSel) girlSel.addEventListener('change', autoFill);
                if (typeSel) typeSel.addEventListener('change', autoFill);
                autoFill();
            }, 100);
        });

        container.querySelectorAll('[data-edit-girl]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const g = await DB.getById('girls', btn.dataset.editGirl);
                if (!g) return;
                App.showModal('아가씨 수정', `
                    <div class="space-y-4">
                        <div class="space-y-2"><label class="text-xs font-medium text-slate-400">이름</label>
                            <input id="g-name" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" value="${g.name}"/></div>
                        <div class="space-y-2"><label class="text-xs font-medium text-slate-400">담당</label>
                            <select id="g-staff" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm">
                                <option value="">없음</option>
                                ${staff.map(s => `<option value="${s.id}" ${s.id === g.staff_id ? 'selected' : ''}>${s.name}</option>`).join('')}
                            </select></div>
                        <div class="grid grid-cols-3 gap-3">
                            <div class="space-y-2"><label class="text-xs font-medium text-slate-400">와리율 (%)</label>
                                <input id="g-rate" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" type="number" min="0" max="100" value="${g.incentive_rate || 10}"/></div>
                            <div class="space-y-2"><label class="text-xs font-medium text-slate-400">대기비 (원)</label>
                                <input id="g-standby" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono" value="${Format.number(g.standby_fee || 150000)}"/></div>
                            <div class="space-y-2"><label class="text-xs font-medium text-slate-400">이벤트비 (원)</label>
                                <input id="g-event" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono" value="${Format.number(g.event_fee || 200000)}"/></div>
                        </div>
                        <div class="space-y-2"><label class="text-xs font-medium text-slate-400">상태</label>
                            <select id="g-active" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm">
                                <option value="true" ${g.active ? 'selected' : ''}>활성</option>
                                <option value="false" ${!g.active ? 'selected' : ''}>비활성</option>
                            </select></div>
                    </div>
                `, async () => {
                    await DB.update('girls', g.id, {
                        name: document.getElementById('g-name').value.trim(),
                        staff_id: document.getElementById('g-staff').value,
                        incentive_rate: parseInt(document.getElementById('g-rate').value) || 10,
                        standby_fee: Format.parseNumber(document.getElementById('g-standby').value) || 0,
                        event_fee: Format.parseNumber(document.getElementById('g-event').value) || 0,
                        active: document.getElementById('g-active').value === 'true'
                    });
                    App.toast('수정되었습니다.', 'success');
                    App.renderPage('girls');
                });
            });
        });

        container.querySelectorAll('[data-girl-detail]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const g = await DB.getById('girls', btn.dataset.girlDetail);
                if (!g) return;
                const allGirlPayments = await DB.getAll('girl_payments');
                const gPayments = allGirlPayments.filter(p => p.girl_id === g.id).sort((a, b) => b.date.localeCompare(a.date));
                const html = gPayments.length > 0
                    ? `<div class="max-h-80 overflow-y-auto custom-scrollbar space-y-2">${gPayments.map(p => {
                        const typeLabel = p.type === 'standby' ? '대기비' : p.type === 'full_attendance' ? '만근비' : '이벤트';
                        return `<div class="flex justify-between items-center p-2 bg-slate-800/50 rounded-lg">
                            <div><span class="text-xs text-slate-400 font-mono">${p.date}</span> <span class="text-xs text-slate-500 ml-2">${typeLabel}</span></div>
                            <span class="font-mono text-white text-sm">${Format.won(p.amount)}</span>
                        </div>`;
                    }).join('')}</div>`
                    : '<p class="text-slate-500 text-center py-8">지급 내역이 없습니다.</p>';
                App.showModal(`${g.name} 지급 내역`, html);
            });
        });
    }
};

App.register('girls', GirlsPage);
