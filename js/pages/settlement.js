// 일일 영업 정산 페이지 (룸 단위 정산)
const SettlementPage = {
    mode: 'list',
    editId: null,
    periodType: 'today',
    customFrom: null,
    customTo: null,
    roomCounter: 0,

    async _getTcUnit(branchId) {
        if (!branchId) {
            const staffId = await Auth.getStaffId();
            if (staffId) {
                const staff = await DB.getById('staff', staffId);
                if (staff && staff.branch_name) {
                    const branch = (await DB.getAll('branches')).find(b => b.name === staff.branch_name);
                    if (branch) branchId = branch.id;
                }
            }
        }
        const val = await DB.getBranchSetting('tc_unit_price', branchId);
        return val ? Number(val) : 100000;
    },

    _calcTimes(entry, exit) {
        if (!entry || !exit) return 0;
        const [eh, em] = entry.split(':').map(Number);
        const [xh, xm] = exit.split(':').map(Number);
        let entryMin = eh * 60 + em;
        let exitMin = xh * 60 + xm;
        if (exitMin <= entryMin) exitMin += 24 * 60;
        return Math.max(0, Math.round((exitMin - entryMin) / 60));
    },

    async getSettlements() {
        let settlements = (await DB.getAll('daily_sales')).sort((a, b) => b.date.localeCompare(a.date));
        if (!Auth.isAdmin()) {
            const staffId = await Auth.getStaffId();
            settlements = settlements.filter(s => s.entered_by === staffId);
        }
        const range = PeriodFilter.getRange(this.periodType, this.customFrom, this.customTo);
        settlements = PeriodFilter.filterByDate(settlements, 'date', range.from, range.to);
        return settlements;
    },

    async render(container) {
        if (this.mode === 'form') await this.renderForm(container);
        else if (this.mode === 'view') await this.renderView(container);
        else await this.renderList(container);
    },

    async renderList(container) {
        const settlements = await this.getSettlements();
        const staff = await DB.getAll('staff');
        const isAdmin = Auth.isAdmin();

        const sumRevenue = settlements.reduce((s, r) => s + (Number(r.total_revenue) || 0), 0);
        const sumWari = settlements.reduce((s, r) => s + (Number(r.total_wari) || 0), 0);
        const sumGirlPay = settlements.reduce((s, r) => s + (Number(r.total_girl_pay) || 0), 0);
        const sumExpenses = settlements.reduce((s, r) => s + (Number(r.total_expenses) || 0), 0);
        const sumDeductions = sumWari + sumGirlPay + sumExpenses;
        const sumNetProfit = sumRevenue - sumDeductions;
        const sumSettlement = settlements.reduce((s, r) => s + (Number(r.net_settlement) || 0), 0);

        const branchStats = {};
        if (isAdmin) {
            settlements.forEach(s => {
                const sid = s.entered_by || 'unknown';
                if (!branchStats[sid]) branchStats[sid] = { revenue: 0, wari: 0, girlPay: 0, expenses: 0, count: 0 };
                branchStats[sid].revenue += Number(s.total_revenue) || 0;
                branchStats[sid].wari += Number(s.total_wari) || 0;
                branchStats[sid].girlPay += Number(s.total_girl_pay) || 0;
                branchStats[sid].expenses += Number(s.total_expenses) || 0;
                branchStats[sid].count += 1;
            });
        }

        container.innerHTML = `
        <div class="max-w-[1600px] mx-auto p-4 md:p-6 space-y-6">
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 class="text-2xl font-bold text-white">일일 영업 정산</h1>
                    <p class="text-slate-400 text-sm">${isAdmin ? '전체 직원의 정산을 조회·관리합니다.' : '내 영업 정산을 관리합니다.'}</p>
                </div>
                <div class="flex gap-2">
                    <button id="btn-export-settlement" class="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs hover:bg-slate-700 transition-colors text-slate-300">
                        <span class="material-symbols-outlined text-sm">download</span> 엑셀
                    </button>
                    <button id="btn-new-settlement" class="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-bold transition-colors">
                        <span class="material-symbols-outlined text-sm">add</span> 새 정산 입력
                    </button>
                </div>
            </div>
            ${PeriodFilter.renderUI(this.periodType, this.customFrom, this.customTo, 'st')}

            <!-- 전체 취합 요약 카드 -->
            <div class="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
                <div class="bg-slate-900 p-4 rounded-xl border border-slate-800">
                    <p class="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">총 매출</p>
                    <p class="text-lg md:text-xl font-black text-white">${Format.won(sumRevenue)}</p>
                    <p class="text-[10px] text-slate-500 mt-1">${settlements.length}건 정산</p>
                </div>
                <div class="bg-slate-900 p-4 rounded-xl border border-slate-800">
                    <p class="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">총 차감</p>
                    <p class="text-lg md:text-xl font-black text-red-300">${Format.won(sumDeductions)}</p>
                    <div class="text-[10px] text-slate-500 mt-1 space-y-0.5">
                        <p>와리 ${Format.number(sumWari)}</p>
                        <p>아가씨 ${Format.number(sumGirlPay)}</p>
                        <p>지출 ${Format.number(sumExpenses)}</p>
                    </div>
                </div>
                <div class="bg-slate-900 p-4 rounded-xl border ${sumNetProfit >= 0 ? 'border-blue-500/30' : 'border-red-500/30'}">
                    <p class="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">순이익</p>
                    <p class="text-lg md:text-xl font-black ${sumNetProfit >= 0 ? 'text-blue-400' : 'text-red-300'}">${Format.won(sumNetProfit)}</p>
                    <p class="text-[10px] text-slate-500 mt-1">매출 − 차감 합계</p>
                </div>
                <div class="bg-slate-900 p-4 rounded-xl border border-slate-800">
                    <p class="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">최종 정산금 합계</p>
                    <p class="text-lg md:text-xl font-black text-white">${Format.won(sumSettlement)}</p>
                    <p class="text-[10px] text-slate-500 mt-1">이월 포함</p>
                </div>
                <div class="bg-slate-900 p-4 rounded-xl border border-slate-800">
                    <p class="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">이익률</p>
                    <p class="text-lg md:text-xl font-black ${sumNetProfit >= 0 ? 'text-emerald-400' : 'text-red-300'}">${sumRevenue > 0 ? Math.round(sumNetProfit / sumRevenue * 100) : 0}%</p>
                    <p class="text-[10px] text-slate-500 mt-1">순이익 / 총 매출</p>
                </div>
            </div>

            ${isAdmin && Object.keys(branchStats).length > 0 ? `
            <!-- 지점별 순이익 분석 -->
            <div class="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                <div class="p-4 border-b border-slate-800 flex items-center gap-2">
                    <span class="material-symbols-outlined text-blue-500 text-base">store</span>
                    <h4 class="font-bold text-sm">지점별 순이익 분석</h4>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-sm whitespace-nowrap" style="white-space:nowrap;min-width:700px">
                        <thead><tr class="bg-slate-800/50 text-[10px] text-slate-500 uppercase tracking-wider">
                            <th class="px-4 md:px-6 py-3 font-semibold">지점</th>
                            <th class="px-4 md:px-6 py-3 font-semibold">정산 수</th>
                            <th class="px-4 md:px-6 py-3 font-semibold">총 매출</th>
                            <th class="px-4 md:px-6 py-3 font-semibold">와리</th>
                            <th class="px-4 md:px-6 py-3 font-semibold">아가씨</th>
                            <th class="px-4 md:px-6 py-3 font-semibold">기타지출</th>
                            <th class="px-4 md:px-6 py-3 font-semibold">순이익</th>
                            <th class="px-4 md:px-6 py-3 font-semibold">이익률</th>
                            <th class="px-4 md:px-6 py-3 font-semibold">비중</th>
                        </tr></thead>
                        <tbody class="divide-y divide-slate-800">
                            ${Object.entries(branchStats).map(([sid, st]) => {
                                const s = staff.find(x => x.id === sid);
                                const netP = st.revenue - st.wari - st.girlPay - st.expenses;
                                const pctMargin = st.revenue > 0 ? Math.round(netP / st.revenue * 100) : 0;
                                const pctShare = sumNetProfit > 0 ? Math.round(netP / sumNetProfit * 100) : 0;
                                return `<tr class="hover:bg-slate-800/30">
                                    <td class="px-4 md:px-6 py-3">
                                        <div class="flex items-center gap-2">
                                            <div class="h-7 w-7 rounded-full bg-blue-500/20 text-blue-400 text-[10px] flex items-center justify-center font-bold">${s ? s.name.substring(0, 1) : '?'}</div>
                                            <div>
                                                <span class="text-white font-bold text-xs">${s ? (s.branch_name || s.name) : '관리자'}</span>
                                                ${s && s.branch_name ? `<span class="text-[10px] text-slate-500 block">${s.name}</span>` : ''}
                                            </div>
                                        </div>
                                    </td>
                                    <td class="px-4 md:px-6 py-3 font-mono text-slate-400">${st.count}건</td>
                                    <td class="px-4 md:px-6 py-3 font-mono text-white font-bold">${Format.won(st.revenue)}</td>
                                    <td class="px-4 md:px-6 py-3 font-mono text-yellow-300 text-xs">${Format.won(st.wari)}</td>
                                    <td class="px-4 md:px-6 py-3 font-mono text-pink-400 text-xs">${Format.won(st.girlPay)}</td>
                                    <td class="px-4 md:px-6 py-3 font-mono text-slate-400 text-xs">${Format.won(st.expenses)}</td>
                                    <td class="px-4 md:px-6 py-3 font-mono font-bold ${netP >= 0 ? 'text-blue-400' : 'text-red-300'}">${Format.won(netP)}</td>
                                    <td class="px-4 md:px-6 py-3 font-mono ${pctMargin >= 0 ? 'text-emerald-400' : 'text-red-300'}">${pctMargin}%</td>
                                    <td class="px-4 md:px-6 py-3">
                                        <div class="flex items-center gap-2">
                                            <div class="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden"><div class="h-full bg-blue-500 rounded-full" style="width:${Math.max(0, Math.min(100, pctShare))}%"></div></div>
                                            <span class="text-[10px] font-mono text-slate-400">${pctShare}%</span>
                                        </div>
                                    </td>
                                </tr>`;
                            }).join('')}
                            <tr class="bg-slate-800/40 font-bold">
                                <td class="px-4 md:px-6 py-3 text-white">전체 합계</td>
                                <td class="px-4 md:px-6 py-3 font-mono text-white">${settlements.length}건</td>
                                <td class="px-4 md:px-6 py-3 font-mono text-white">${Format.won(sumRevenue)}</td>
                                <td class="px-4 md:px-6 py-3 font-mono text-yellow-300 text-xs">${Format.won(sumWari)}</td>
                                <td class="px-4 md:px-6 py-3 font-mono text-pink-400 text-xs">${Format.won(sumGirlPay)}</td>
                                <td class="px-4 md:px-6 py-3 font-mono text-slate-400 text-xs">${Format.won(sumExpenses)}</td>
                                <td class="px-4 md:px-6 py-3 font-mono ${sumNetProfit >= 0 ? 'text-blue-400' : 'text-red-300'}">${Format.won(sumNetProfit)}</td>
                                <td class="px-4 md:px-6 py-3 font-mono ${sumNetProfit >= 0 ? 'text-emerald-400' : 'text-red-300'}">${sumRevenue > 0 ? Math.round(sumNetProfit / sumRevenue * 100) : 0}%</td>
                                <td class="px-4 md:px-6 py-3 text-[10px] text-slate-500">100%</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>` : ''}

            ${isAdmin ? `<div class="flex flex-wrap gap-2 items-center">
                <span class="text-xs text-slate-500 font-bold">직원 필터:</span>
                <button class="staff-filter-btn px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-500 text-white" data-filter="all">전체</button>
                ${staff.map(s => `<button class="staff-filter-btn px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 text-slate-400 hover:bg-slate-700" data-filter="${s.id}">${s.branch_name ? s.branch_name + '(' + s.name + ')' : s.name}</button>`).join('')}
            </div>` : ''}
            <div class="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-sm whitespace-nowrap" style="white-space:nowrap;min-width:600px">
                        <thead>
                            <tr class="bg-slate-800/50 border-b border-slate-700">
                                <th class="px-4 md:px-6 py-4 font-semibold text-slate-300">날짜 / 상태</th>
                                ${isAdmin ? '<th class="px-4 md:px-6 py-4 font-semibold text-slate-300">입력 직원</th>' : ''}
                                <th class="px-4 md:px-6 py-4 font-semibold text-slate-300">총 매출</th>
                                <th class="px-4 md:px-6 py-4 font-semibold text-slate-300 hidden sm:table-cell">룸수</th>
                                <th class="px-4 md:px-6 py-4 font-semibold text-slate-300 hidden md:table-cell">카드</th>
                                <th class="px-4 md:px-6 py-4 font-semibold text-slate-300 hidden md:table-cell">외상</th>
                                <th class="px-4 md:px-6 py-4 font-semibold text-slate-300">순이익</th>
                                <th class="px-4 md:px-6 py-4 font-semibold text-slate-300">정산금</th>
                                <th class="px-4 md:px-6 py-4 font-semibold text-slate-300 text-right">작업</th>
                            </tr>
                        </thead>
                        <tbody id="settlement-tbody" class="divide-y divide-slate-800">
                            ${await this.renderRows(settlements, staff, isAdmin)}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;

        document.getElementById('btn-new-settlement').addEventListener('click', () => {
            this.mode = 'form'; this.editId = null; this.roomCounter = 0; App.renderPage('settlement');
        });
        document.getElementById('btn-export-settlement').addEventListener('click', () => {
            ExcelExport.exportSettlements(settlements, staff);
        });
        PeriodFilter.bindEvents(container, 'st', (type, from, to) => {
            this.periodType = type; this.customFrom = from; this.customTo = to;
            this.mode = 'list'; App.renderPage('settlement');
        });
        this.rebindRowEvents(container);

        if (isAdmin) {
            container.querySelectorAll('.staff-filter-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    container.querySelectorAll('.staff-filter-btn').forEach(b => b.className = 'staff-filter-btn px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 text-slate-400 hover:bg-slate-700');
                    btn.className = 'staff-filter-btn px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-500 text-white';
                    const filter = btn.dataset.filter;
                    const range = PeriodFilter.getRange(this.periodType, this.customFrom, this.customTo);
                    let filtered = (await DB.getAll('daily_sales')).sort((a, b) => b.date.localeCompare(a.date));
                    filtered = PeriodFilter.filterByDate(filtered, 'date', range.from, range.to);
                    if (filter !== 'all') filtered = filtered.filter(s => s.entered_by === filter);
                    document.getElementById('settlement-tbody').innerHTML = await this.renderRows(filtered, staff, true);
                    this.rebindRowEvents(container);
                });
            });
        }
    },

    rebindRowEvents(container) {
        container.querySelectorAll('[data-view]').forEach(b => {
            b.addEventListener('click', () => { this.mode = 'view'; this.editId = b.dataset.view; App.renderPage('settlement'); });
        });
        container.querySelectorAll('[data-close]').forEach(b => {
            b.addEventListener('click', async () => {
                if (confirm('마감 처리하시겠습니까?\n마감 후에는 관리자 대시보드에 마감완료로 표시됩니다.')) {
                    const result = await DB.update('daily_sales', b.dataset.close, { closed: true, closed_at: new Date().toISOString() });
                    if (result) {
                        DB.notifyChange();
                        App.toast('마감 처리되었습니다.', 'success');
                    } else {
                        App.toast('마감 처리에 실패했습니다. 데이터를 찾을 수 없습니다.', 'error');
                    }
                    App.renderPage('settlement');
                }
            });
        });
        container.querySelectorAll('[data-delete]').forEach(b => {
            b.addEventListener('click', async () => {
                if (confirm('삭제하시겠습니까?')) { await DB.delete('daily_sales', b.dataset.delete); DB.notifyChange(); App.toast('삭제됨', 'info'); App.renderPage('settlement'); }
            });
        });
    },

    async renderRows(settlements, staff, isAdmin) {
        if (settlements.length === 0) {
            return `<tr><td colspan="${isAdmin ? 10 : 9}" class="px-6 py-16 text-center text-slate-500">
                <span class="material-symbols-outlined text-5xl block mb-3">receipt_long</span>정산 데이터가 없습니다.</td></tr>`;
        }
        const todayStr = Format.today();
        const rowPromises = settlements.map(async (s) => {
            const enteredBy = staff.find(st => st.id === s.entered_by);
            const roomCount = (await DB.getSaleRoomCount(s.id)) || s.rooms || 0;
            const netProfit = (Number(s.total_revenue) || 0) - (Number(s.total_wari) || 0) - (Number(s.total_girl_pay) || 0) - (Number(s.total_expenses) || 0);
            const isClosed = !!s.closed;
            const isToday = s.date === todayStr;
            const statusBadge = isClosed
                ? `<span class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400"><span class="material-symbols-outlined text-[10px]">check_circle</span>마감</span>`
                : isToday
                    ? `<span class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-300/15 text-amber-300"><span class="material-symbols-outlined text-[10px]">edit</span>입력중</span>`
                    : `<span class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-600/20 text-slate-500"><span class="material-symbols-outlined text-[10px]">schedule</span>미마감</span>`;
            return `
            <tr class="hover:bg-slate-800/30 transition-colors">
                <td class="px-4 md:px-6 py-4"><div class="flex items-center gap-2"><span class="text-slate-300 font-mono">${s.date}</span>${statusBadge}</div></td>
                ${isAdmin ? `<td class="px-4 md:px-6 py-4">
                    <div class="flex items-center gap-2">
                        <div class="h-6 w-6 rounded-full bg-blue-400/20 text-blue-400 text-[10px] flex items-center justify-center font-bold">${enteredBy ? enteredBy.name.substring(0, 1) : '?'}</div>
                        <div><span class="text-slate-300 text-xs font-bold">${enteredBy ? (enteredBy.branch_name || enteredBy.name) : '관리자'}</span>
                        ${enteredBy && enteredBy.branch_name ? `<span class="text-[10px] text-slate-500 block">${enteredBy.name}</span>` : ''}</div>
                    </div>
                </td>` : ''}
                <td class="px-4 md:px-6 py-4 font-bold text-white">${Format.won(s.total_revenue)}</td>
                <td class="px-4 md:px-6 py-4 text-slate-400 hidden sm:table-cell">${roomCount}개</td>
                <td class="px-4 md:px-6 py-4 text-slate-400 hidden md:table-cell">${Format.won(s.card_amount || 0)}</td>
                <td class="px-4 md:px-6 py-4 text-red-300 hidden md:table-cell">${Format.won(s.credit_amount || 0)}</td>
                <td class="px-4 md:px-6 py-4 font-bold ${netProfit >= 0 ? 'text-emerald-400' : 'text-red-300'}">${Format.won(netProfit)}</td>
                <td class="px-4 md:px-6 py-4 font-bold text-blue-500">${Format.won(s.net_settlement)}</td>
                <td class="px-4 md:px-6 py-4 text-right whitespace-nowrap">
                    <button class="text-blue-500 hover:underline text-xs font-bold mr-2" data-view="${s.id}">보기</button>
                    ${!isClosed && !isAdmin ? `<button class="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors mr-2" data-close="${s.id}">마감완료</button>` : ''}
                    ${isAdmin ? `<button class="text-slate-400 hover:text-red-300 text-xs" data-delete="${s.id}">삭제</button>` : ''}
                </td>
            </tr>`;
        });
        const rows = await Promise.all(rowPromises);
        return rows.join('');
    },

    _filterByBranch(list, myStaff, isAdmin) {
        if (isAdmin || !myStaff || !myStaff.branch_name) return list;
        return list.filter(item => item.branch_name === myStaff.branch_name);
    },

    _filterGirlsByBranch(girlsList, staff, myStaff, isAdmin) {
        if (isAdmin || !myStaff || !myStaff.branch_name) return girlsList;
        const branchStaffIds = staff.filter(s => s.branch_name === myStaff.branch_name).map(s => s.id);
        return girlsList.filter(g => !g.staff_id || branchStaffIds.includes(g.staff_id));
    },

    // ═══ 룸 기반 정산 입력 폼 ═══
    async renderForm(container) {
        const isAdmin = Auth.isAdmin();
        const allStaff = await DB.getAll('staff');
        const liquors = await DB.getAll('liquor');
        const allGirls = (await DB.getAll('girls')).filter(g => g.active);
        const today = Format.today();
        const myStaffId = await Auth.getStaffId();
        const myStaff = allStaff.find(s => s.id === myStaffId);
        const staff = this._filterByBranch(allStaff, myStaff, isAdmin);
        const girlsList = this._filterGirlsByBranch(allGirls, allStaff, myStaff, isAdmin);
        const tcUnit = await this._getTcUnit();
        this.roomCounter = 0;

        container.innerHTML = `
        <div class="max-w-[1600px] mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
            <section class="lg:col-span-7 flex flex-col gap-4">
                <div class="flex items-center gap-3">
                    <button id="btn-back-list" class="p-2 hover:bg-slate-800 rounded-lg"><span class="material-symbols-outlined text-slate-400">arrow_back</span></button>
                    <div>
                        <h1 class="text-xl font-bold">새 정산 입력</h1>
                        ${!isAdmin && myStaff ? `<p class="text-xs text-blue-400">입력자: ${myStaff.name}</p>` : ''}
                    </div>
                </div>

                <div class="bg-slate-900 p-4 rounded-xl border border-slate-800">
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div class="space-y-1">
                            <label class="text-[10px] font-bold text-slate-500">날짜</label>
                            <input id="s-date" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" type="date" value="${today}"/>
                        </div>
                        <div class="space-y-1">
                            <label class="text-[10px] font-bold text-slate-500">T/C 단가</label>
                            <input id="s-tc-unit" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono amount-input" value="${Format.number(tcUnit)}"/>
                        </div>
                        <div class="space-y-1">
                            <label class="text-[10px] font-bold text-slate-500">시제 (시재금)</label>
                            <input id="s-petty-cash" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono amount-input" placeholder="0"/>
                        </div>
                        ${isAdmin ? `<div class="space-y-1">
                            <label class="text-[10px] font-bold text-slate-500">입력 직원</label>
                            <select id="s-entered-by" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm">
                                <option value="">관리자</option>
                                ${staff.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                            </select>
                        </div>` : ''}
                    </div>
                </div>

                <div id="rooms-container" class="space-y-4"></div>

                <button id="btn-add-room" class="w-full py-3 border-2 border-dashed border-slate-700 rounded-xl text-sm font-bold text-slate-400 hover:border-blue-500 hover:text-blue-500 transition-colors flex items-center justify-center gap-2">
                    <span class="material-symbols-outlined text-base">add</span> 룸 추가
                </button>

                <div class="bg-slate-900 p-4 rounded-xl border border-slate-800">
                    <h3 class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">와리 (인센티브)</h3>
                    <p class="text-[10px] text-slate-600 mb-2">직원</p>
                    <div id="wari-items" class="space-y-2">
                        ${staff.filter(s => s.role !== 'staff').map(s => `
                        <div class="flex items-center justify-between wari-row" data-wari-type="staff">
                            <span class="text-sm">${s.name} <span class="text-[10px] text-slate-500">${s.incentive_rate}%</span></span>
                            <input class="w-20 sm:w-28 shrink-0 bg-slate-800 border-slate-700 rounded-lg text-sm font-mono text-right wari-amount amount-input" data-staff="${s.id}" placeholder="0"/>
                        </div>`).join('')}
                    </div>
                    <p class="text-[10px] text-slate-600 mt-3 mb-2 pt-3 border-t border-slate-800">아가씨</p>
                    <div id="wari-girl-items" class="space-y-2">
                        ${girlsList.map(g => `
                        <div class="flex items-center justify-between wari-row" data-wari-type="girl">
                            <span class="text-sm text-pink-400">${g.name} <span class="text-[10px] text-slate-500">${g.incentive_rate || 0}%</span></span>
                            <input class="w-20 sm:w-28 shrink-0 bg-slate-800 border-slate-700 rounded-lg text-sm font-mono text-right wari-girl-amount amount-input" data-girl="${g.id}" placeholder="0"/>
                        </div>`).join('')}
                    </div>
                </div>

                <div class="bg-slate-900 p-4 rounded-xl border border-slate-800">
                    <div class="flex justify-between items-center mb-3">
                        <h3 class="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                            <span class="material-symbols-outlined text-pink-400 text-xs">person</span> 아가씨 지급 (대기비/이벤트)
                        </h3>
                        <button id="btn-add-girl-pay" class="text-[10px] text-blue-500 font-bold">+ 추가</button>
                    </div>
                    <div id="girl-pay-items" class="space-y-2">
                        <div class="girl-pay-row flex gap-2 items-center">
                            <select class="gp-girl flex-1 bg-slate-800 border-slate-700 rounded text-xs">
                                <option value="">선택</option>
                                ${girlsList.map(g => `<option value="${g.id}" data-standby="${g.standby_fee || 0}" data-event="${g.event_fee || 0}">${g.name}</option>`).join('')}
                            </select>
                            <select class="gp-type w-20 bg-slate-800 border-slate-700 rounded text-xs">
                                <option value="standby">대기비</option>
                                <option value="event">이벤트</option>
                                <option value="full_attendance">만근비</option>
                            </select>
                            <input class="gp-amount w-24 bg-slate-800 border-slate-700 rounded text-xs font-mono amount-input" placeholder="금액"/>
                            <button class="btn-remove-girl-pay text-slate-600 hover:text-red-300"><span class="material-symbols-outlined text-xs">close</span></button>
                        </div>
                    </div>
                </div>

                <div class="bg-slate-900 p-4 rounded-xl border border-slate-800">
                    <div class="flex justify-between items-center mb-3">
                        <h3 class="text-xs font-bold text-slate-500 uppercase tracking-wider">기타 지출</h3>
                        <button id="btn-add-expense" class="text-[10px] text-blue-500 font-bold">+ 추가</button>
                    </div>
                    <div id="expense-items" class="space-y-2">
                        <div class="flex gap-2 expense-row min-w-0">
                            <input class="flex-1 min-w-0 bg-slate-800 border-slate-700 rounded-lg text-sm expense-name" placeholder="항목명"/>
                            <input class="w-20 sm:w-28 shrink-0 bg-slate-800 border-slate-700 rounded-lg text-sm font-mono expense-amount amount-input" placeholder="금액"/>
                        </div>
                    </div>
                </div>

                <div class="bg-slate-900 p-4 rounded-xl border border-slate-800">
                    <label class="text-[10px] font-bold text-slate-500">전일 이월</label>
                    <input id="s-carryover" class="w-full bg-slate-800 border-slate-700 rounded-lg font-mono text-sm amount-input mt-1" placeholder="0"/>
                </div>

                <button id="btn-save" class="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold shadow-lg transition-all">정산 저장</button>
            </section>

            <section class="lg:col-span-5">
                <div class="sticky top-20">
                    <h2 class="text-sm font-bold text-slate-400 mb-3">정산서 미리보기</h2>
                    <div class="bg-[#1e293b] rounded-2xl p-4 md:p-6 shadow-2xl border border-slate-700/50 relative overflow-hidden">
                        <div class="absolute inset-0 paper-grid opacity-20 pointer-events-none"></div>
                        <div class="relative z-10" id="preview-content">
                            <p class="text-slate-500 text-center py-8 text-sm">룸을 추가하면 미리보기가 표시됩니다.</p>
                        </div>
                    </div>
                </div>
            </section>
        </div>`;

        await this._addRoom();
        this._bindFormEvents(container, staff, liquors, girlsList);
    },

    async _roomHTML(idx, staff, liquors, girlsList) {
        const myStaffId = await Auth.getStaffId();
        return `
        <div class="room-card bg-slate-900 p-4 rounded-xl border border-slate-800" data-room-idx="${idx}">
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                    <span class="bg-blue-500/20 text-blue-400 font-bold text-xs px-2 py-1 rounded">Room</span>
                    <input class="room-number w-14 bg-slate-800 border-slate-700 rounded text-sm text-center" placeholder="번호"/>
                </div>
                <button class="btn-remove-room text-slate-500 hover:text-red-300"><span class="material-symbols-outlined text-sm">close</span></button>
            </div>
            <div class="grid grid-cols-2 gap-2 mb-3">
                <div><label class="text-[10px] text-slate-500">VIP (고객명)</label>
                    <input class="room-vip w-full bg-slate-800 border-slate-700 rounded text-sm" placeholder="고객명"/></div>
                <div><label class="text-[10px] text-slate-500">담당</label>
                    <select class="room-staff w-full bg-slate-800 border-slate-700 rounded text-sm">
                        <option value="">선택</option>
                        ${staff.map(s => `<option value="${s.id}" ${s.id === myStaffId ? 'selected' : ''}>${s.name}</option>`).join('')}
                    </select></div>
            </div>

            <div class="mb-3">
                <div class="flex items-center justify-between mb-1">
                    <span class="text-[10px] font-bold text-pink-400 uppercase">아가씨</span>
                    <button class="btn-add-girl text-[10px] text-blue-500 font-bold">+ 추가</button>
                </div>
                <div class="room-girls space-y-1">
                    <div class="girl-row flex flex-wrap gap-1 items-center">
                        <select class="girl-select w-full sm:flex-1 sm:w-auto bg-slate-800 border-slate-700 rounded text-xs">
                            <option value="">선택</option>
                            ${girlsList.map(g => `<option value="${g.id}">${g.name}</option>`).join('')}
                        </select>
                        <div class="flex items-center gap-1 flex-1 min-w-0">
                            <input type="time" class="girl-entry-time flex-1 min-w-[110px] bg-slate-800 border-slate-700 rounded text-xs px-1.5 py-1"/>
                            <span class="text-slate-500 text-xs shrink-0">~</span>
                            <input type="time" class="girl-exit-time flex-1 min-w-[110px] bg-slate-800 border-slate-700 rounded text-xs px-1.5 py-1"/>
                            <span class="girl-times text-xs font-bold text-blue-400 w-6 text-center shrink-0">0</span>
                            <button class="btn-remove-girl text-slate-600 hover:text-red-300 shrink-0"><span class="material-symbols-outlined text-xs">close</span></button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="mb-3">
                <div class="flex items-center justify-between mb-1">
                    <span class="text-[10px] font-bold text-emerald-400 uppercase">주류</span>
                    <button class="btn-add-room-liquor text-[10px] text-blue-500 font-bold">+ 추가</button>
                </div>
                <div class="room-liquors space-y-1">
                    <div class="room-liquor-row flex gap-1 items-center">
                        <select class="room-lq-select flex-1 bg-slate-800 border-slate-700 rounded text-xs">
                            ${liquors.map(l => `<option value="${l.id}" data-price="${l.sell_price}">${l.name} (${Format.number(l.sell_price)})</option>`).join('')}
                        </select>
                        <input class="room-lq-qty w-12 bg-slate-800 border-slate-700 rounded text-xs text-center" type="number" placeholder="수량" min="0"/>
                        <input class="room-lq-service w-10 bg-slate-800 border-slate-700 rounded text-xs text-center" type="number" placeholder="서비스" min="0" value="0"/>
                        <button class="btn-remove-room-liquor text-slate-600 hover:text-red-300"><span class="material-symbols-outlined text-xs">close</span></button>
                    </div>
                </div>
            </div>

            <div class="mb-3">
                <span class="text-[10px] font-bold text-slate-500 uppercase block mb-1">결제</span>
                <div class="grid grid-cols-3 gap-2">
                    <div><label class="text-[10px] text-slate-500">현금</label><input class="room-pay-cash w-full bg-slate-800 border-slate-700 rounded text-xs font-mono amount-input" placeholder="0"/></div>
                    <div><label class="text-[10px] text-slate-500">카드</label><input class="room-pay-card w-full bg-slate-800 border-slate-700 rounded text-xs font-mono amount-input" placeholder="0"/></div>
                    <div><label class="text-[10px] text-slate-500">차용</label><input class="room-pay-borrow w-full bg-slate-800 border-slate-700 rounded text-xs font-mono amount-input" placeholder="0"/></div>
                    <div><label class="text-[10px] text-slate-500">기타</label><input class="room-pay-other w-full bg-slate-800 border-slate-700 rounded text-xs font-mono amount-input" placeholder="0"/></div>
                    <div><label class="text-[10px] text-slate-500">외상</label><input class="room-pay-credit w-full bg-slate-800 border-slate-700 rounded text-xs font-mono amount-input" placeholder="0"/></div>
                    <div><label class="text-[10px] text-slate-500">외상 고객</label><input class="room-credit-customer w-full bg-slate-800 border-slate-700 rounded text-xs" placeholder="고객명"/></div>
                </div>
            </div>

            <div class="bg-slate-800/50 p-2 rounded-lg grid grid-cols-3 gap-2 text-center">
                <div><span class="text-[10px] text-slate-500">주대</span><p class="room-joodae text-xs font-bold text-white">₩0</p></div>
                <div><span class="text-[10px] text-slate-500">T/C</span><p class="room-tc text-xs font-bold text-white">₩0</p></div>
                <div><span class="text-[10px] text-slate-500">매출</span><p class="room-total text-xs font-bold text-blue-400">₩0</p></div>
            </div>
        </div>`;
    },

    async _addRoom() {
        const isAdmin = Auth.isAdmin();
        const allStaff = await DB.getAll('staff');
        const liquors = await DB.getAll('liquor');
        const allGirls = (await DB.getAll('girls')).filter(g => g.active);
        const myStaffId = await Auth.getStaffId();
        const myStaff = allStaff.find(s => s.id === myStaffId);
        const staff = this._filterByBranch(allStaff, myStaff, isAdmin);
        const girlsList = this._filterGirlsByBranch(allGirls, allStaff, myStaff, isAdmin);
        const idx = this.roomCounter++;
        const roomsEl = document.getElementById('rooms-container');
        if (!roomsEl) return;
        const div = document.createElement('div');
        div.innerHTML = await this._roomHTML(idx, staff, liquors, girlsList);
        roomsEl.appendChild(div.firstElementChild);
    },

    async _updateRoomSummary(roomCard) {
        const tcUnit = Format.parseNumber(document.getElementById('s-tc-unit')?.value) || (await this._getTcUnit());
        let totalTimes = 0;
        roomCard.querySelectorAll('.girl-row').forEach(row => {
            const entry = row.querySelector('.girl-entry-time')?.value;
            const exit = row.querySelector('.girl-exit-time')?.value;
            const times = this._calcTimes(entry, exit);
            const el = row.querySelector('.girl-times');
            if (el) el.textContent = times;
            totalTimes += times;
        });

        let joodae = 0;
        roomCard.querySelectorAll('.room-liquor-row').forEach(row => {
            const sel = row.querySelector('.room-lq-select');
            const qty = parseInt(row.querySelector('.room-lq-qty')?.value) || 0;
            const price = parseInt(sel?.selectedOptions[0]?.dataset?.price) || 0;
            joodae += qty * price;
        });

        const tc = totalTimes * tcUnit;
        const total = joodae + tc;
        const jEl = roomCard.querySelector('.room-joodae');
        const tEl = roomCard.querySelector('.room-tc');
        const totEl = roomCard.querySelector('.room-total');
        if (jEl) jEl.textContent = Format.won(joodae);
        if (tEl) tEl.textContent = Format.won(tc) + ` (${totalTimes}T)`;
        if (totEl) totEl.textContent = Format.won(total);
    },

    _bindFormEvents(container, staff, liquors, girlsList) {
        document.getElementById('btn-back-list').addEventListener('click', () => { this.mode = 'list'; App.renderPage('settlement'); });
        document.getElementById('btn-add-room').addEventListener('click', async () => { await this._addRoom(); await this.updatePreview(); });
        document.getElementById('btn-save').addEventListener('click', () => this.saveSettlement());

        document.getElementById('btn-add-expense').addEventListener('click', () => {
            const row = document.createElement('div');
            row.className = 'flex gap-2 expense-row min-w-0';
            row.innerHTML = `<input class="flex-1 min-w-0 bg-slate-800 border-slate-700 rounded-lg text-sm expense-name" placeholder="항목명"/>
                <input class="w-20 sm:w-28 shrink-0 bg-slate-800 border-slate-700 rounded-lg text-sm font-mono expense-amount amount-input" placeholder="금액"/>`;
            document.getElementById('expense-items').appendChild(row);
        });

        container.addEventListener('input', async (e) => {
            if (e.target.classList.contains('amount-input')) {
                const val = Format.parseNumber(e.target.value);
                if (val) e.target.value = Format.number(val);
            }
            const roomCard = e.target.closest('.room-card');
            if (roomCard) await this._updateRoomSummary(roomCard);
            await this.updatePreview();
        });

        container.addEventListener('change', async (e) => {
            const roomCard = e.target.closest('.room-card');
            if (roomCard) await this._updateRoomSummary(roomCard);
            if (e.target.classList.contains('gp-girl') || e.target.classList.contains('gp-type')) {
                const row = e.target.closest('.girl-pay-row');
                if (row) {
                    const girlSel = row.querySelector('.gp-girl');
                    const typeSel = row.querySelector('.gp-type');
                    const amountEl = row.querySelector('.gp-amount');
                    if (girlSel && typeSel && amountEl) {
                        const opt = girlSel.selectedOptions[0];
                        const type = typeSel.value;
                        let fee = 0;
                        if (type === 'standby') fee = parseInt(opt?.dataset?.standby) || 0;
                        else if (type === 'event') fee = parseInt(opt?.dataset?.event) || 0;
                        if (fee > 0) amountEl.value = Format.number(fee);
                    }
                }
            }
            await this.updatePreview();
        });

        container.addEventListener('click', async (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;

            if (btn.classList.contains('btn-remove-room')) {
                btn.closest('.room-card').remove();
                await this.updatePreview();
            }
            if (btn.classList.contains('btn-add-girl')) {
                const girlsEl = btn.closest('.room-card').querySelector('.room-girls');
                const row = document.createElement('div');
                row.className = 'girl-row flex flex-wrap gap-1 items-center';
                row.innerHTML = `<select class="girl-select w-full sm:flex-1 sm:w-auto bg-slate-800 border-slate-700 rounded text-xs">
                    <option value="">선택</option>${girlsList.map(g => `<option value="${g.id}">${g.name}</option>`).join('')}
                    </select>
                    <div class="flex items-center gap-1 flex-1 min-w-0">
                        <input type="time" class="girl-entry-time flex-1 min-w-[110px] bg-slate-800 border-slate-700 rounded text-xs px-1.5 py-1"/>
                        <span class="text-slate-500 text-xs shrink-0">~</span>
                        <input type="time" class="girl-exit-time flex-1 min-w-[110px] bg-slate-800 border-slate-700 rounded text-xs px-1.5 py-1"/>
                        <span class="girl-times text-xs font-bold text-blue-400 w-6 text-center shrink-0">0</span>
                        <button class="btn-remove-girl text-slate-600 hover:text-red-300 shrink-0"><span class="material-symbols-outlined text-xs">close</span></button>
                    </div>`;
                girlsEl.appendChild(row);
            }
            if (btn.classList.contains('btn-remove-girl')) {
                const roomCard = btn.closest('.room-card');
                btn.closest('.girl-row').remove();
                if (roomCard) await this._updateRoomSummary(roomCard);
                await this.updatePreview();
            }
            if (btn.classList.contains('btn-add-room-liquor')) {
                const lqEl = btn.closest('.room-card').querySelector('.room-liquors');
                const row = document.createElement('div');
                row.className = 'room-liquor-row flex gap-1 items-center';
                row.innerHTML = `<select class="room-lq-select flex-1 bg-slate-800 border-slate-700 rounded text-xs">
                    ${liquors.map(l => `<option value="${l.id}" data-price="${l.sell_price}">${l.name} (${Format.number(l.sell_price)})</option>`).join('')}
                    </select>
                    <input class="room-lq-qty w-12 bg-slate-800 border-slate-700 rounded text-xs text-center" type="number" placeholder="수량" min="0"/>
                    <input class="room-lq-service w-10 bg-slate-800 border-slate-700 rounded text-xs text-center" type="number" placeholder="서비스" min="0" value="0"/>
                    <button class="btn-remove-room-liquor text-slate-600 hover:text-red-300"><span class="material-symbols-outlined text-xs">close</span></button>`;
                lqEl.appendChild(row);
            }
            if (btn.classList.contains('btn-remove-room-liquor')) {
                const roomCard = btn.closest('.room-card');
                btn.closest('.room-liquor-row').remove();
                if (roomCard) await this._updateRoomSummary(roomCard);
                await this.updatePreview();
            }
            if (btn.classList.contains('btn-remove-girl-pay')) {
                btn.closest('.girl-pay-row').remove();
                await this.updatePreview();
            }
        });

        document.getElementById('btn-add-girl-pay').addEventListener('click', () => {
            const row = document.createElement('div');
            row.className = 'girl-pay-row flex gap-2 items-center';
            row.innerHTML = `<select class="gp-girl flex-1 bg-slate-800 border-slate-700 rounded text-xs">
                    <option value="">선택</option>
                    ${girlsList.map(g => `<option value="${g.id}" data-standby="${g.standby_fee || 0}" data-event="${g.event_fee || 0}">${g.name}</option>`).join('')}
                </select>
                <select class="gp-type w-20 bg-slate-800 border-slate-700 rounded text-xs">
                    <option value="standby">대기비</option>
                    <option value="event">이벤트</option>
                    <option value="full_attendance">만근비</option>
                </select>
                <input class="gp-amount w-24 bg-slate-800 border-slate-700 rounded text-xs font-mono amount-input" placeholder="금액"/>
                <button class="btn-remove-girl-pay text-slate-600 hover:text-red-300"><span class="material-symbols-outlined text-xs">close</span></button>`;
            document.getElementById('girl-pay-items').appendChild(row);
        });

    },

    async getFormData() {
        const staff = await DB.getAll('staff');
        const liquors = await DB.getAll('liquor');
        const date = document.getElementById('s-date').value;
        const tcUnit = Format.parseNumber(document.getElementById('s-tc-unit')?.value) || (await this._getTcUnit());
        const pettyCash = Format.parseNumber(document.getElementById('s-petty-cash')?.value);
        const carryover = Format.parseNumber(document.getElementById('s-carryover')?.value);
        let enteredBy = await Auth.getStaffId();
        // staff_id가 없으면 이름으로 매칭 시도
        if (!enteredBy && !Auth.isAdmin()) {
            const session = Auth.getSession();
            if (session) {
                const staffMatch = staff.find(s => s.name === session.name);
                if (staffMatch) enteredBy = staffMatch.id;
            }
        }
        const enteredBySelect = document.getElementById('s-entered-by');
        if (enteredBySelect && enteredBySelect.value) enteredBy = enteredBySelect.value;

        const roomData = [];
        document.querySelectorAll('.room-card').forEach(card => {
            const roomNum = card.querySelector('.room-number')?.value || '';
            const vipName = card.querySelector('.room-vip')?.value || '';
            const staffId = card.querySelector('.room-staff')?.value || '';
            const staffObj = staff.find(s => s.id === staffId);

            const girls = [];
            let totalTimes = 0;
            card.querySelectorAll('.girl-row').forEach(row => {
                const girlId = row.querySelector('.girl-select')?.value;
                const girlName = row.querySelector('.girl-select')?.selectedOptions[0]?.text || '';
                const entryTime = row.querySelector('.girl-entry-time')?.value || '';
                const exitTime = row.querySelector('.girl-exit-time')?.value || '';
                const times = this._calcTimes(entryTime, exitTime);
                if (girlId || entryTime) {
                    girls.push({ girl_id: girlId, name: girlName, entry_time: entryTime, exit_time: exitTime, times });
                    totalTimes += times;
                }
            });

            const lqItems = [];
            let joodae = 0;
            card.querySelectorAll('.room-liquor-row').forEach(row => {
                const sel = row.querySelector('.room-lq-select');
                const qty = parseInt(row.querySelector('.room-lq-qty')?.value) || 0;
                const service = parseInt(row.querySelector('.room-lq-service')?.value) || 0;
                const lq = liquors.find(l => l.id === sel?.value);
                const price = lq ? lq.sell_price : (parseInt(sel?.selectedOptions[0]?.dataset?.price) || 0);
                if (qty > 0 || service > 0) {
                    const subtotal = qty * price;
                    lqItems.push({ liquor_id: sel?.value, name: lq ? lq.name : '', qty, service, price, subtotal });
                    joodae += subtotal;
                }
            });

            const tc = totalTimes * tcUnit;
            const payCash = Format.parseNumber(card.querySelector('.room-pay-cash')?.value);
            const payCard = Format.parseNumber(card.querySelector('.room-pay-card')?.value);
            const payBorrow = Format.parseNumber(card.querySelector('.room-pay-borrow')?.value);
            const payOther = Format.parseNumber(card.querySelector('.room-pay-other')?.value);
            const payCredit = Format.parseNumber(card.querySelector('.room-pay-credit')?.value);
            const creditCustomer = card.querySelector('.room-credit-customer')?.value || '';

            roomData.push({
                room_number: roomNum, vip_name: vipName,
                staff_id: staffId, staff_name: staffObj ? staffObj.name : '',
                girls, liquor_items: lqItems,
                joodae, tc_times: totalTimes, tc_amount: tc,
                room_revenue: joodae + tc,
                pay_cash: payCash, pay_card: payCard, pay_borrowing: payBorrow,
                pay_other: payOther, pay_credit: payCredit, credit_customer: creditCustomer
            });
        });

        const totalJoodae = roomData.reduce((s, r) => s + r.joodae, 0);
        const totalTc = roomData.reduce((s, r) => s + r.tc_amount, 0);
        const totalRevenue = totalJoodae + totalTc;
        const totalCash = roomData.reduce((s, r) => s + r.pay_cash, 0);
        const totalCard = roomData.reduce((s, r) => s + r.pay_card, 0);
        const totalBorrow = roomData.reduce((s, r) => s + r.pay_borrowing, 0);
        const totalCredit = roomData.reduce((s, r) => s + r.pay_credit, 0);
        const totalOther = roomData.reduce((s, r) => s + r.pay_other, 0);

        const allLiquorItems = [];
        roomData.forEach(r => r.liquor_items.forEach(l => allLiquorItems.push(l)));

        const wariItems = [];
        document.querySelectorAll('[data-wari-type="staff"]').forEach(row => {
            const input = row.querySelector('.wari-amount');
            const staffId = input?.dataset.staff;
            const amount = Format.parseNumber(input?.value);
            if (amount > 0) {
                const s = staff.find(st => st.id === staffId);
                wariItems.push({ staff_id: staffId, staff_name: s ? s.name : '', amount, type: 'staff' });
            }
        });

        const girlsList = await DB.getAll('girls');
        const wariGirlItems = [];
        document.querySelectorAll('[data-wari-type="girl"]').forEach(row => {
            const input = row.querySelector('.wari-girl-amount');
            const girlId = input?.dataset.girl;
            const amount = Format.parseNumber(input?.value);
            if (amount > 0) {
                const g = girlsList.find(gl => gl.id === girlId);
                wariGirlItems.push({ girl_id: girlId, girl_name: g ? g.name : '', amount, type: 'girl' });
            }
        });

        const girlPayItems = [];
        document.querySelectorAll('.girl-pay-row').forEach(row => {
            const girlSel = row.querySelector('.gp-girl');
            const typeSel = row.querySelector('.gp-type');
            const amount = Format.parseNumber(row.querySelector('.gp-amount')?.value);
            if (girlSel?.value && amount > 0) {
                const g = girlsList.find(gl => gl.id === girlSel.value);
                const typeLabel = typeSel.value === 'standby' ? '대기비' : typeSel.value === 'full_attendance' ? '만근비' : '이벤트';
                girlPayItems.push({ girl_id: girlSel.value, girl_name: g ? g.name : '', type: typeSel.value, type_label: typeLabel, amount });
            }
        });
        const totalGirlPay = girlPayItems.reduce((s, i) => s + i.amount, 0);

        const expenseItems = [];
        document.querySelectorAll('.expense-row').forEach(row => {
            const name = row.querySelector('.expense-name')?.value?.trim();
            const amount = Format.parseNumber(row.querySelector('.expense-amount')?.value);
            if (name && amount > 0) expenseItems.push({ name, amount });
        });

        const totalStaffWari = wariItems.reduce((s, i) => s + i.amount, 0);
        const totalGirlWari = wariGirlItems.reduce((s, i) => s + i.amount, 0);
        const totalWari = totalStaffWari + totalGirlWari;
        const totalExpenses = expenseItems.reduce((s, i) => s + i.amount, 0);
        const netRevenue = totalRevenue - totalWari - totalGirlPay - totalExpenses;
        const netSettlement = netRevenue + carryover;

        return {
            date, tc_unit_price: tcUnit, pettyCash, carryover, enteredBy,
            roomData, totalJoodae, totalTc,
            allLiquorItems, wariItems, wariGirlItems, girlPayItems, expenseItems,
            total_revenue: totalRevenue, cash_amount: totalCash, card_amount: totalCard,
            borrowing_amount: totalBorrow, other_amount: totalOther, credit_amount: totalCredit,
            total_staff_wari: totalStaffWari, total_girl_wari: totalGirlWari,
            total_wari: totalWari, total_girl_pay: totalGirlPay, total_expenses: totalExpenses,
            net_revenue: netRevenue, net_settlement: netSettlement
        };
    },

    async updatePreview() {
        const data = await this.getFormData();
        const el = document.getElementById('preview-content');
        if (!el) return;
        el.innerHTML = this._buildSettlementHTML(data);
    },

    _buildSettlementHTML(data) {
        const roomCount = data.roomData ? data.roomData.length : 0;
        const roomsHTML = (data.roomData || []).map(r => `
            <div class="p-3 bg-slate-800/30 rounded-lg border border-slate-700/50 mb-2">
                <div class="flex justify-between items-center mb-2">
                    <span class="font-bold text-white text-sm">Room ${r.room_number || '?'} ${r.vip_name ? `· <span class="text-blue-400">${r.vip_name}</span>` : ''}</span>
                    <span class="text-[10px] text-slate-500">${r.staff_name || ''}</span>
                </div>
                ${r.girls.length > 0 ? `<div class="mb-1">${r.girls.map(g => `<span class="text-[10px] text-pink-400 mr-2">${g.name || '?'} ${g.times}T</span>`).join('')}</div>` : ''}
                ${r.liquor_items.length > 0 ? `<div class="mb-1">${r.liquor_items.map(l => `<span class="text-[10px] text-emerald-400 mr-2">${l.name} ×${l.qty}</span>`).join('')}</div>` : ''}
                <div class="flex justify-between text-xs mt-1">
                    <span class="text-slate-400">주대 ${Format.number(r.joodae)} + T/C ${Format.number(r.tc_amount)}</span>
                    <span class="font-bold text-white">${Format.number(r.room_revenue)}</span>
                </div>
            </div>`).join('');

        return `
        <div class="border-b-2 border-slate-600 pb-4 mb-4">
            <h3 class="text-lg font-black text-white">${data.date ? Format.dateKR(data.date) : '-'}</h3>
            <p class="text-slate-400 text-xs mb-2">${roomCount}개 룸</p>
            <div>
                <span class="text-slate-500 text-[10px]">총 매출</span>
                <span class="text-2xl font-black text-blue-500 ml-2">${Format.number(data.total_revenue)}</span>
            </div>
        </div>
        ${roomsHTML}
        <div class="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden mt-3">
            <table class="w-full text-xs" style="white-space:nowrap">
                <tbody class="divide-y divide-slate-800">
                    <tr><td class="px-3 py-2 text-slate-400">총 주대</td><td class="px-3 py-2 text-right font-mono text-white">${Format.number(data.totalJoodae)}</td></tr>
                    <tr><td class="px-3 py-2 text-slate-400">총 T/C</td><td class="px-3 py-2 text-right font-mono text-white">${Format.number(data.totalTc)}</td></tr>
                    <tr><td class="px-3 py-2 text-slate-400">현금</td><td class="px-3 py-2 text-right font-mono">${Format.number(data.cash_amount)}</td></tr>
                    <tr><td class="px-3 py-2 text-slate-400">카드</td><td class="px-3 py-2 text-right font-mono">${Format.number(data.card_amount)}</td></tr>
                    ${data.borrowing_amount ? `<tr><td class="px-3 py-2 text-slate-400">차용</td><td class="px-3 py-2 text-right font-mono">${Format.number(data.borrowing_amount)}</td></tr>` : ''}
                    ${data.credit_amount ? `<tr><td class="px-3 py-2 text-red-300">외상</td><td class="px-3 py-2 text-right font-mono text-red-300">${Format.number(data.credit_amount)}</td></tr>` : ''}
                    ${data.total_staff_wari ? `<tr><td class="px-3 py-2 text-slate-400">와리 (직원)</td><td class="px-3 py-2 text-right font-mono">-${Format.number(data.total_staff_wari)}</td></tr>` : ''}
                    ${(data.wariItems || []).map(w => `<tr><td class="px-3 py-1 text-slate-500 pl-5 text-[10px]">└ ${w.staff_name}</td><td class="px-3 py-1 text-right font-mono text-slate-500 text-[10px]">${Format.number(w.amount)}</td></tr>`).join('')}
                    ${data.total_girl_wari ? `<tr><td class="px-3 py-2 text-pink-400">와리 (아가씨)</td><td class="px-3 py-2 text-right font-mono text-pink-400">-${Format.number(data.total_girl_wari)}</td></tr>` : ''}
                    ${(data.wariGirlItems || []).map(w => `<tr><td class="px-3 py-1 text-slate-500 pl-5 text-[10px]">└ ${w.girl_name}</td><td class="px-3 py-1 text-right font-mono text-slate-500 text-[10px]">${Format.number(w.amount)}</td></tr>`).join('')}
                    ${data.total_girl_pay ? `<tr><td class="px-3 py-2 text-pink-400">아가씨 지급</td><td class="px-3 py-2 text-right font-mono text-pink-400">-${Format.number(data.total_girl_pay)}</td></tr>` : ''}
                    ${(data.girlPayItems || []).map(gp => `<tr><td class="px-3 py-1 text-slate-500 pl-5 text-[10px]">└ ${gp.girl_name} (${gp.type_label})</td><td class="px-3 py-1 text-right font-mono text-slate-500 text-[10px]">${Format.number(gp.amount)}</td></tr>`).join('')}
                    ${data.total_expenses ? `<tr><td class="px-3 py-2 text-slate-400">기타 지출</td><td class="px-3 py-2 text-right font-mono">-${Format.number(data.total_expenses)}</td></tr>` : ''}
                </tbody>
                <tfoot>
                    <tr class="bg-slate-800/40"><td class="px-3 py-3 font-black text-blue-500">최종 정산금</td><td class="px-3 py-3 text-right font-mono text-lg font-black text-white">${Format.number(data.net_settlement)}</td></tr>
                    ${data.pettyCash ? `<tr><td class="px-3 py-2 text-slate-500 text-[10px]">시제</td><td class="px-3 py-2 text-right font-mono text-slate-400 text-[10px]">${Format.number(data.pettyCash)}</td></tr>` : ''}
                </tfoot>
            </table>
        </div>`;
    },

    async saveSettlement() {
        const data = await this.getFormData();
        if (!data.date) { App.toast('날짜를 입력해주세요.', 'error'); return; }
        if (data.roomData.length === 0) { App.toast('최소 1개의 룸을 추가해주세요.', 'error'); return; }

        // entered_by 보장: staff_id가 없으면 세션에서 재확인
        let enteredBy = data.enteredBy;
        if (!enteredBy) {
            const session = Auth.getSession();
            if (session && session.staff_id) {
                enteredBy = session.staff_id;
            } else if (session && !Auth.isAdmin()) {
                // staff인데 staff_id가 없으면 이름으로 매칭
                const staffMatch = (await DB.getAll('staff')).find(s => s.name === session.name);
                if (staffMatch) enteredBy = staffMatch.id;
            }
        }

        if (!enteredBy && !Auth.isAdmin()) {
            App.toast('입력자 정보를 확인할 수 없습니다. 다시 로그인해주세요.', 'error');
            return;
        }

        const credits = [];
        data.roomData.forEach(r => {
            if (r.pay_credit > 0 && r.credit_customer) {
                credits.push({ customer: r.credit_customer, staff_id: r.staff_id || enteredBy, staff_name: r.staff_name, amount: r.pay_credit });
            }
        });

        const sale = await DB.insert('daily_sales', {
            date: data.date,
            rooms: data.roomData.length,
            tc_unit_price: data.tc_unit_price,
            total_joodae: data.totalJoodae,
            total_tc: data.totalTc,
            total_revenue: data.total_revenue,
            cash_amount: data.cash_amount,
            card_amount: data.card_amount,
            borrowing_amount: data.borrowing_amount,
            other_amount: data.other_amount,
            credit_amount: data.credit_amount,
            credit_items: credits,
            total_staff_wari: data.total_staff_wari,
            total_girl_wari: data.total_girl_wari,
            total_wari: data.total_wari,
            total_girl_pay: data.total_girl_pay,
            girl_pay_items: data.girlPayItems,
            total_expenses: data.total_expenses,
            wari_items: data.wariItems,
            wari_girl_items: data.wariGirlItems,
            expense_items: data.expenseItems,
            liquor_items: data.allLiquorItems,
            carryover: data.carryover,
            petty_cash: data.pettyCash,
            net_revenue: data.net_revenue,
            net_settlement: data.net_settlement,
            entered_by: enteredBy,
            closed: false
        });

        await DB.insertSaleRooms(sale.id, data.roomData);

        for (const w of data.wariItems) {
            await DB.insert('wari', { staff_id: w.staff_id, date: data.date, amount: w.amount, daily_sales_id: sale.id, type: 'staff' });
        }
        for (const w of data.wariGirlItems) {
            await DB.insert('wari', { girl_id: w.girl_id, date: data.date, amount: w.amount, daily_sales_id: sale.id, type: 'girl' });
        }

        for (const gp of data.girlPayItems) {
            await DB.insert('girl_payments', {
                girl_id: gp.girl_id, date: data.date, type: gp.type,
                amount: gp.amount, memo: '정산 입력', staff_id: enteredBy, entered_by: enteredBy
            });
        }

        for (const c of credits) {
            await DB.insert('receivables', {
                date: data.date, staff_id: c.staff_id || enteredBy, customer: c.customer,
                amount: c.amount, due_date: '', status: 'unpaid', paid_amount: 0,
                entered_by: enteredBy, daily_sales_id: sale.id
            });
        }

        for (const item of data.allLiquorItems) {
            const inv = (await DB.getAll('liquor_inventory')).find(i => i.liquor_id === item.liquor_id);
            if (inv) {
                const newQty = Math.max(0, inv.quantity - item.qty - (item.service || 0));
                await DB.update('liquor_inventory', inv.id, { quantity: newQty });
            }
        }

        // 다른 탭에 데이터 변경 알림
        DB.notifyChange();

        App.toast('정산이 저장되었습니다.', 'success');
        this.mode = 'list';
        App.renderPage('settlement');
    },

    async renderView(container) {
        const sale = await DB.getById('daily_sales', this.editId);
        if (!sale) { this.mode = 'list'; App.renderPage('settlement'); return; }
        const staff = await DB.getAll('staff');
        const enteredBy = staff.find(s => s.id === sale.entered_by);
        const saleRooms = await DB.getSaleRooms(sale.id);
        const hasRoomData = saleRooms.length > 0;

        const girlPayments = (await DB.getAll('girl_payments')).filter(p => p.date === sale.date && (p.entered_by === sale.entered_by || p.staff_id === sale.entered_by));
        const girls = await DB.getAll('girls');
        const girlExpenseTotal = girlPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

        const roomsViewHTML = hasRoomData ? saleRooms.map(r => `
            <div class="p-4 bg-slate-800/30 rounded-xl border border-slate-700/50 mb-3">
                <div class="flex justify-between items-center mb-2">
                    <div class="flex items-center gap-2">
                        <span class="bg-blue-500/20 text-blue-400 font-bold text-xs px-2 py-1 rounded">Room ${r.room_number || '?'}</span>
                        ${r.vip_name ? `<span class="text-sm font-bold text-white">${r.vip_name}</span>` : ''}
                    </div>
                    <span class="text-xs text-slate-500">${r.staff_name || ''}</span>
                </div>
                ${r.girls && r.girls.length > 0 ? `
                <div class="mb-2">
                    <span class="text-[10px] text-pink-400 font-bold uppercase">아가씨</span>
                    <div class="mt-1 space-y-1">${r.girls.map(g => `
                        <div class="flex items-center justify-between text-xs bg-slate-800/50 px-2 py-1 rounded">
                            <span class="text-white font-medium">${g.name || '?'}</span>
                            <span class="text-slate-400 font-mono">${g.entry_time || '?'} ~ ${g.exit_time || '?'} = <span class="text-blue-400 font-bold">${g.times}T</span></span>
                        </div>`).join('')}
                    </div>
                </div>` : ''}
                ${r.liquor_items && r.liquor_items.length > 0 ? `
                <div class="mb-2">
                    <span class="text-[10px] text-emerald-400 font-bold uppercase">주류</span>
                    <div class="mt-1">${r.liquor_items.map(l => `
                        <div class="flex justify-between text-xs"><span class="text-slate-300">${l.name} ×${l.qty}${l.service > 0 ? ` (서비스 ${l.service})` : ''}</span><span class="font-mono text-white">${Format.number(l.subtotal)}</span></div>`).join('')}
                    </div>
                </div>` : ''}
                <div class="grid grid-cols-3 gap-2 text-center bg-slate-800/50 rounded-lg p-2 mt-2">
                    <div><span class="text-[10px] text-slate-500">주대</span><p class="text-xs font-bold text-white">${Format.number(r.joodae)}</p></div>
                    <div><span class="text-[10px] text-slate-500">T/C (${r.tc_times || 0}T)</span><p class="text-xs font-bold text-white">${Format.number(r.tc_amount)}</p></div>
                    <div><span class="text-[10px] text-slate-500">매출</span><p class="text-xs font-bold text-blue-400">${Format.number(r.room_revenue)}</p></div>
                </div>
                <div class="grid grid-cols-5 gap-1 text-center mt-2 text-[10px]">
                    ${r.pay_cash ? `<div class="bg-slate-800/30 rounded p-1"><span class="text-slate-500">현금</span><p class="text-white font-mono">${Format.number(r.pay_cash)}</p></div>` : ''}
                    ${r.pay_card ? `<div class="bg-slate-800/30 rounded p-1"><span class="text-slate-500">카드</span><p class="text-white font-mono">${Format.number(r.pay_card)}</p></div>` : ''}
                    ${r.pay_borrowing ? `<div class="bg-slate-800/30 rounded p-1"><span class="text-slate-500">차용</span><p class="text-white font-mono">${Format.number(r.pay_borrowing)}</p></div>` : ''}
                    ${r.pay_other ? `<div class="bg-slate-800/30 rounded p-1"><span class="text-slate-500">기타</span><p class="text-white font-mono">${Format.number(r.pay_other)}</p></div>` : ''}
                    ${r.pay_credit ? `<div class="bg-slate-800/30 rounded p-1"><span class="text-red-300">외상</span><p class="text-red-300 font-mono">${Format.number(r.pay_credit)}</p><p class="text-slate-500">${r.credit_customer || ''}</p></div>` : ''}
                </div>
            </div>`).join('') : '';

        const oldFormatHTML = !hasRoomData ? `
            ${sale.liquor_items && sale.liquor_items.length > 0 ? `<div class="mb-4"><h4 class="text-[10px] font-bold text-slate-500 uppercase mb-2">판매 주류</h4>${sale.liquor_items.map(item => `<div class="flex justify-between text-sm mb-1"><span class="text-slate-300">${item.name} ×${item.qty}</span><span class="font-mono text-white">${Format.number(item.subtotal)}</span></div>`).join('')}</div>` : ''}
            <table class="w-full text-sm" style="white-space:nowrap"><tbody class="divide-y divide-slate-800">
                <tr><td class="px-3 py-2 text-slate-300">현금</td><td class="px-3 py-2 text-right font-mono">${Format.number(sale.cash_amount)}</td></tr>
                <tr><td class="px-3 py-2 text-slate-300">카드</td><td class="px-3 py-2 text-right font-mono">${Format.number(sale.card_amount)}</td></tr>
            </tbody></table>` : '';

        container.innerHTML = `
        <div class="max-w-3xl mx-auto p-4 md:p-6">
            <div class="flex items-center justify-between mb-6">
                <div class="flex items-center gap-3">
                    <button id="btn-back-view" class="p-2 hover:bg-slate-800 rounded-lg"><span class="material-symbols-outlined text-slate-400">arrow_back</span></button>
                    <div>
                        <div class="flex items-center gap-2">
                            <h1 class="text-xl font-bold">정산서 상세</h1>
                            ${sale.closed
                                ? `<span class="inline-flex items-center gap-0.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400"><span class="material-symbols-outlined text-xs">check_circle</span>마감완료</span>`
                                : `<span class="inline-flex items-center gap-0.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-300/15 text-amber-300"><span class="material-symbols-outlined text-xs">edit</span>입력중</span>`}
                        </div>
                        ${enteredBy ? `<p class="text-xs text-slate-500">${enteredBy.branch_name ? enteredBy.branch_name + ' ' : ''}${enteredBy.name}</p>` : ''}
                    </div>
                </div>
                ${!sale.closed && !Auth.isAdmin() ? `<button id="btn-close-settlement" class="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-bold transition-colors"><span class="material-symbols-outlined text-sm">task_alt</span> 마감완료</button>` : ''}
            </div>

            <div id="printable-area" class="bg-[#1e293b] rounded-2xl p-4 md:p-8 shadow-2xl border border-slate-700/50 relative overflow-hidden">
                <div class="absolute inset-0 paper-grid opacity-20 pointer-events-none"></div>
                <div class="relative z-10">
                    <div class="border-b-2 border-slate-600 pb-4 mb-4">
                        <h3 class="text-xl font-black text-white">${Format.dateKR(sale.date)}</h3>
                        <p class="text-slate-400 text-sm mb-2">${hasRoomData ? saleRooms.length : (sale.rooms || 0)}개 룸 ${enteredBy ? '· ' + enteredBy.name : ''}</p>
                        <div>
                            <span class="text-slate-500 text-[10px]">총 매출</span>
                            <span class="text-2xl font-black text-blue-500 ml-2">${Format.number(sale.total_revenue)}</span>
                        </div>
                    </div>

                    ${roomsViewHTML}
                    ${oldFormatHTML}

                    <div class="bg-slate-900 rounded-xl border border-slate-700 overflow-hidden mt-4">
                        <table class="w-full text-sm" style="white-space:nowrap">
                            <tbody class="divide-y divide-slate-800">
                                ${hasRoomData ? `
                                <tr><td class="px-4 py-3 text-slate-300">총 주대</td><td class="px-4 py-3 text-right font-mono text-white">${Format.number(sale.total_joodae || 0)}</td></tr>
                                <tr><td class="px-4 py-3 text-slate-300">총 T/C</td><td class="px-4 py-3 text-right font-mono text-white">${Format.number(sale.total_tc || 0)}</td></tr>` : ''}
                                <tr><td class="px-4 py-3 text-slate-300">현금 합계</td><td class="px-4 py-3 text-right font-mono text-white">${Format.number(sale.cash_amount)}</td></tr>
                                <tr><td class="px-4 py-3 text-slate-300">카드 합계</td><td class="px-4 py-3 text-right font-mono text-white">${Format.number(sale.card_amount)}</td></tr>
                                ${sale.borrowing_amount ? `<tr><td class="px-4 py-3 text-slate-300">차용 합계</td><td class="px-4 py-3 text-right font-mono">${Format.number(sale.borrowing_amount)}</td></tr>` : ''}
                                ${sale.credit_amount ? `<tr><td class="px-4 py-3 text-red-300">외상 합계</td><td class="px-4 py-3 text-right font-mono text-red-300">${Format.number(sale.credit_amount)}</td></tr>` : ''}
                                ${(sale.credit_items || []).map(c => `<tr><td class="px-4 py-2 text-red-300 pl-8 text-xs">└ ${c.customer} (${c.staff_name || ''})</td><td class="px-4 py-2 text-right font-mono text-red-300 text-xs">${Format.number(c.amount)}</td></tr>`).join('')}
                                ${sale.total_staff_wari || (sale.wari_items && sale.wari_items.length > 0) ? `<tr class="bg-slate-800/20"><td class="px-4 py-3 font-bold">와리 (직원)</td><td class="px-4 py-3 text-right font-mono">-${Format.number(sale.total_staff_wari || sale.total_wari)}</td></tr>` : ''}
                                ${(sale.wari_items || []).map(w => `<tr><td class="px-4 py-2 text-slate-500 pl-8 text-xs">└ ${w.staff_name}</td><td class="px-4 py-2 text-right font-mono text-slate-400 text-xs">${Format.number(w.amount)}</td></tr>`).join('')}
                                ${sale.total_girl_wari ? `<tr class="bg-pink-500/5"><td class="px-4 py-3 font-bold text-pink-400">와리 (아가씨)</td><td class="px-4 py-3 text-right font-mono text-pink-400">-${Format.number(sale.total_girl_wari)}</td></tr>` : ''}
                                ${(sale.wari_girl_items || []).map(w => `<tr><td class="px-4 py-2 text-pink-300 pl-8 text-xs">└ ${w.girl_name}</td><td class="px-4 py-2 text-right font-mono text-pink-300 text-xs">${Format.number(w.amount)}</td></tr>`).join('')}
                                ${(sale.total_girl_pay || girlExpenseTotal) > 0 ? `<tr class="bg-pink-500/5"><td class="px-4 py-3 font-bold text-pink-400">아가씨 지급</td><td class="px-4 py-3 text-right font-mono text-pink-400">-${Format.number(sale.total_girl_pay || girlExpenseTotal)}</td></tr>
                                ${(sale.girl_pay_items || []).length > 0
                                    ? sale.girl_pay_items.map(gp => { const tl = gp.type === 'standby' ? '대기비' : gp.type === 'full_attendance' ? '만근비' : '이벤트'; return `<tr><td class="px-4 py-2 text-slate-500 pl-8 text-xs">└ ${gp.girl_name || '-'} (${tl})</td><td class="px-4 py-2 text-right font-mono text-slate-400 text-xs">${Format.number(gp.amount)}</td></tr>`; }).join('')
                                    : girlPayments.map(gp => { const g = girls.find(x => x.id === gp.girl_id); const tl = gp.type === 'standby' ? '대기비' : gp.type === 'full_attendance' ? '만근비' : '이벤트'; return `<tr><td class="px-4 py-2 text-slate-500 pl-8 text-xs">└ ${g ? g.name : '-'} (${tl})</td><td class="px-4 py-2 text-right font-mono text-slate-400 text-xs">${Format.number(gp.amount)}</td></tr>`; }).join('')
                                }` : ''}
                                ${sale.total_expenses > 0 ? `<tr class="bg-slate-800/20"><td class="px-4 py-3 font-bold">기타 지출</td><td class="px-4 py-3 text-right font-mono">-${Format.number(sale.total_expenses)}</td></tr>` : ''}
                                ${(sale.expense_items || []).map(e => `<tr><td class="px-4 py-2 text-slate-500 pl-8 text-xs">└ ${e.name}</td><td class="px-4 py-2 text-right font-mono text-slate-400 text-xs">${Format.number(e.amount)}</td></tr>`).join('')}
                            </tbody>
                            <tfoot>
                                <tr class="border-t border-slate-700"><td class="px-4 py-3 font-bold">실주대</td><td class="px-4 py-3 text-right font-mono text-lg font-bold text-white">${Format.number(sale.net_revenue)}</td></tr>
                                ${sale.carryover ? `<tr><td class="px-4 py-3 text-slate-400">전일 이월</td><td class="px-4 py-3 text-right font-mono">${Format.number(sale.carryover)}</td></tr>` : ''}
                                <tr class="bg-slate-800/40"><td class="px-4 py-5 font-black text-lg text-blue-500">최종 정산금</td><td class="px-4 py-5 text-right font-mono text-2xl font-black text-white">${Format.number(sale.net_settlement)}</td></tr>
                                ${sale.petty_cash ? `<tr><td class="px-4 py-3 text-slate-400">시제</td><td class="px-4 py-3 text-right font-mono text-slate-300">${Format.number(sale.petty_cash)}</td></tr>` : ''}
                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>

            <div class="mt-4 flex gap-3 justify-end">
                <button id="btn-download-pdf" class="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-bold transition-colors">
                    <span class="material-symbols-outlined text-sm">picture_as_pdf</span> PDF
                </button>
                <button onclick="window.print()" class="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm hover:bg-slate-700 transition-colors">
                    <span class="material-symbols-outlined text-sm">print</span> 인쇄
                </button>
            </div>
        </div>`;

        document.getElementById('btn-back-view').addEventListener('click', () => { this.mode = 'list'; App.renderPage('settlement'); });
        const closeBtn = document.getElementById('btn-close-settlement');
        if (closeBtn) {
            closeBtn.addEventListener('click', async () => {
                if (confirm('마감 처리하시겠습니까?\n마감 후에는 관리자 대시보드에 마감완료로 표시됩니다.')) {
                    await DB.update('daily_sales', sale.id, { closed: true, closed_at: new Date().toISOString() });
                    App.toast('마감 처리되었습니다.', 'success');
                    App.renderPage('settlement');
                }
            });
        }
        document.getElementById('btn-download-pdf').addEventListener('click', () => {
            const el = document.getElementById('printable-area');
            if (!el) return;
            App.toast('PDF 생성 중...', 'info');

            const tables = el.querySelectorAll('table');
            const savedStyles = [];
            tables.forEach(t => {
                savedStyles.push(t.getAttribute('style') || '');
                t.style.whiteSpace = 'normal';
                t.style.minWidth = '0';
            });
            const cells = el.querySelectorAll('td, th');
            cells.forEach(c => { c.style.whiteSpace = 'normal'; });

            html2pdf().set({
                margin: [10, 8, 10, 8],
                filename: `정산서_${sale.date}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, backgroundColor: '#1e293b', useCORS: true, scrollY: 0, windowWidth: 800 },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
            }).from(el).save().then(() => {
                tables.forEach((t, i) => { t.setAttribute('style', savedStyles[i]); });
                cells.forEach(c => { c.style.whiteSpace = ''; });
                App.toast('PDF 다운로드 완료', 'success');
            });
        });
    }
};

App.register('settlement', SettlementPage);
