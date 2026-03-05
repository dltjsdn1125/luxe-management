// 대시보드 페이지 - 관리자: 전체 취합 / 직원: 본인 데이터
const DashboardPage = {
    periodType: 'today',
    customFrom: null,
    customTo: null,
    viewMode: 'total',
    filterBranch: null,
    _charts: [],

    _destroyCharts() {
        this._charts.forEach(c => { try { c.destroy(); } catch(e){} });
        this._charts = [];
    },

    async render(container) {
        this._destroyCharts();
        if (Auth.isAdmin()) {
            await this.renderAdmin(container);
        } else {
            await this.renderStaff(container);
        }

        const refreshBtn = document.getElementById('btn-refresh-dashboard');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                App.refreshCurrentPage();
            });
        }

        const exportBtn = document.getElementById('btn-export-dashboard');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                ExcelExport.exportStaffStats(this._lastStaffStats || []);
            });
        }

        const exportPSBtn = document.getElementById('btn-export-purchase-sales');
        if (exportPSBtn) {
            exportPSBtn.addEventListener('click', () => {
                if (this._lastPurchaseSalesSummary) {
                    const range = PeriodFilter.getRange(this.periodType, this.customFrom, this.customTo);
                    ExcelExport.exportPurchaseSales(this._lastPurchaseSalesSummary, range.label);
                }
            });
        }

        container.querySelectorAll('.db-view-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                this.viewMode = btn.dataset.view;
                App.renderPage('dashboard');
            });
        });

        // 지점 필터 탭
        container.querySelectorAll('.db-branch-filter').forEach(btn => {
            btn.addEventListener('click', () => {
                this.filterBranch = btn.dataset.branch || null;
                App.renderPage('dashboard');
            });
        });

        PeriodFilter.bindEvents(container, 'db', (type, from, to) => {
            this.periodType = type; this.customFrom = from; this.customTo = to;
            App.renderPage('dashboard');
        });
    },

    async renderAdmin(container) {
        const staff = await DB.getAll('staff');
        const range = PeriodFilter.getRange(this.periodType, this.customFrom, this.customTo);

        // 지점 목록
        const branchNames = [...new Set(staff.map(s => s.branch_name).filter(Boolean))].sort();

        // 지점 필터 적용 (선택된 지점의 직원 ID만 추출)
        let filteredStaff = staff;
        if (this.filterBranch) {
            filteredStaff = staff.filter(s => s.branch_name === this.filterBranch);
        }
        const filteredStaffIds = filteredStaff.map(s => s.id);
        const branchStaffIds = this.filterBranch ? filteredStaffIds : null;

        // DB 레벨에서 날짜+지점 필터로 직접 쿼리
        const [allSales, allExpenses, allReceivablesByStaff, allReceivablesByEntered, liquors, inventory] = await Promise.all([
            DB.getFiltered('daily_sales', { from: range.from, to: range.to, staffIds: branchStaffIds, staffField: 'entered_by', orderField: 'date', orderAsc: false }),
            DB.getFiltered('expenses',    { from: range.from, to: range.to, staffIds: branchStaffIds, staffField: 'entered_by', orderField: 'date', orderAsc: false }),
            DB.getFiltered('receivables', { from: range.from, to: range.to, staffIds: branchStaffIds, staffField: 'staff_id',   orderField: 'date', orderAsc: false }),
            branchStaffIds ? DB.getFiltered('receivables', { from: range.from, to: range.to, staffIds: branchStaffIds, staffField: 'entered_by', orderField: 'date', orderAsc: false }) : Promise.resolve([]),
            DB.getAll('liquor'),
            DB.getAll('liquor_inventory'),
        ]);
        // receivables: staff_id + entered_by 합집합
        const allReceivables = allReceivablesByStaff.slice();
        if (allReceivablesByEntered.length) {
            const existIds = new Set(allReceivables.map(r => r.id));
            allReceivablesByEntered.forEach(r => { if (!existIds.has(r.id)) allReceivables.push(r); });
        }

        const totalRevenue = allSales.reduce((s, r) => s + (Number(r.total_revenue) || 0), 0);
        const totalExpense = allExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
        const totalWari = allSales.reduce((s, r) => s + (Number(r.total_wari) || 0), 0);
        const totalGirlPay = allSales.reduce((s, r) => s + (Number(r.total_girl_pay) || 0), 0);
        const totalDailyExpense = allSales.reduce((s, r) => s + (Number(r.total_expenses) || 0), 0);
        const totalReceivable = allReceivables.filter(r => r.status !== 'paid').reduce((s, r) => s + (r.amount - (r.paid_amount || 0)), 0);
        const totalDeductions = totalWari + totalGirlPay + totalDailyExpense + totalExpense;

        // ── 지점별 집계 (staffStats = 지점 단위, 필터 적용) ──
        const branchStatsMap = {};
        filteredStaff.forEach(s => {
            const bn = s.branch_name || s.name;
            if (!branchStatsMap[bn]) {
                branchStatsMap[bn] = {
                    id: bn, name: bn, branch_name: bn,
                    salesCount: 0, revenue: 0, wari: 0, girlPay: 0,
                    dailyExpense: 0, receivable: 0, receivableCount: 0,
                    expense: 0, totalDeductions: 0, netProfit: 0,
                    staffIds: []
                };
            }
            branchStatsMap[bn].staffIds.push(s.id);
        });
        Object.values(branchStatsMap).forEach(bs => {
            const bSales = allSales.filter(d => bs.staffIds.includes(d.entered_by));
            const bReceivables = allReceivables.filter(r =>
                (bs.staffIds.includes(r.staff_id) || bs.staffIds.includes(r.entered_by)) && r.status !== 'paid'
            );
            bs.salesCount   = bSales.length;
            bs.revenue      = bSales.reduce((sum, d) => sum + (Number(d.total_revenue)  || 0), 0);
            bs.wari         = bSales.reduce((sum, d) => sum + (Number(d.total_wari)     || 0), 0);
            bs.girlPay      = bSales.reduce((sum, d) => sum + (Number(d.total_girl_pay) || 0), 0);
            bs.dailyExpense = bSales.reduce((sum, d) => sum + (Number(d.total_expenses) || 0), 0);
            bs.receivable   = bReceivables.reduce((sum, r) => sum + (r.amount - (r.paid_amount || 0)), 0);
            bs.receivableCount = bReceivables.length;
        });
        const staffStats = Object.values(branchStatsMap).sort((a, b) => b.revenue - a.revenue);

        this._lastStaffStats = staffStats;

        const recentSales = allSales.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
        const urgentReceivables = allReceivables.filter(r => r.status !== 'paid').sort((a, b) => {
            const aOd = a.due_date && new Date(a.due_date) < new Date() ? 0 : 1;
            const bOd = b.due_date && new Date(b.due_date) < new Date() ? 0 : 1;
            return aOd - bOd;
        }).slice(0, 8);

        const users = await DB.getAll('users');
        // 지점별 지출 집계
        staffStats.forEach(bs => {
            const bExpenses = allExpenses.filter(e => bs.staffIds.includes(e.entered_by));
            bs.expense = bExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
            bs.totalDeductions = bs.wari + bs.girlPay + bs.dailyExpense + bs.expense;
            bs.netProfit = bs.revenue - bs.totalDeductions;
        });

        // 매입/매출 데이터 (지점 필터 적용: 발주는 entered_by 기준)
        const allOrders = await DB.getFiltered('liquor_orders', {
            from: range.from, to: range.to,
            staffIds: branchStaffIds, staffField: 'entered_by',
            orderField: 'date', orderAsc: false,
        });
        const cashRevenue = allSales.reduce((s, r) => s + (Number(r.cash_amount) || 0), 0);
        const cardRevenue = allSales.reduce((s, r) => s + (Number(r.card_amount) || 0), 0);
        const creditRevenue = allSales.reduce((s, r) => s + (Number(r.credit_amount) || 0), 0);
        const totalPurchase = allOrders.reduce((s, o) => s + (Number(o.total_cost) || 0), 0);

        const purchaseByLiquor = {};
        allOrders.forEach(o => {
            const lq = liquors.find(l => l.id === o.liquor_id);
            const name = lq ? lq.name : '기타';
            purchaseByLiquor[name] = (purchaseByLiquor[name] || 0) + (Number(o.total_cost) || 0);
        });
        const purchaseItems = Object.entries(purchaseByLiquor).map(([name, amount]) => ({ name, amount }));

        const expenseCategories = await DB.getAll('expense_categories');
        const expenseByCategory = {};
        allExpenses.forEach(e => {
            const cat = expenseCategories.find(c => c.id === e.category_id);
            const name = cat ? cat.name : '기타';
            expenseByCategory[name] = (expenseByCategory[name] || 0) + (Number(e.amount) || 0);
        });
        const expenseItems = Object.entries(expenseByCategory).map(([name, amount]) => ({ name, amount }));
        const netProfit = totalRevenue - totalPurchase - totalExpense - totalWari - totalGirlPay - totalDailyExpense;

        this._lastPurchaseSalesSummary = {
            totalRevenue, cashRevenue, cardRevenue, creditRevenue,
            totalPurchase, purchaseItems, totalExpense, expenseItems, totalWari, totalGirlPay, totalDailyExpense, netProfit
        };

        const todayStr = Format.today();
        // 마감현황은 오늘 날짜 기준 (기간 필터와 무관하게 항상 오늘 데이터)
        const todaySalesAll = await DB.getFiltered('daily_sales', { from: todayStr, to: todayStr, orderField: 'date', orderAsc: false });
        const todaySalesRaw = todaySalesAll.filter(s => s.entered_by);
        // 지점 필터 적용 (마감현황도)
        const todaySales = this.filterBranch
            ? todaySalesRaw.filter(s => filteredStaffIds.includes(s.entered_by))
            : todaySalesRaw;

        // ── 지점별로 마감현황 집계 ──
        const branchClosureMap = {};
        // 지점 필터 적용: 선택된 지점만 또는 전체
        const closureTargetBranches = this.filterBranch ? [this.filterBranch] : branchNames;
        closureTargetBranches.forEach(bn => {
            const branchStaff = staff.filter(s => (s.branch_name || s.name) === bn);
            const branchSales = todaySales.filter(sale => branchStaff.some(s => s.id === sale.entered_by));
            const revenue = branchSales.reduce((sum, sale) => sum + (Number(sale.total_revenue) || 0), 0);
            const closedSales = branchSales.filter(sale => !!sale.closed);
            const hasData = branchSales.length > 0;
            // 지점 마감: 오늘 정산이 1건 이상 있고 모두 closed
            const isClosed = hasData && branchSales.every(sale => !!sale.closed);
            branchClosureMap[bn] = { revenue, closedSales: closedSales.length, totalSales: branchSales.length, hasData, isClosed };
        });
        const closedBranchCount = Object.values(branchClosureMap).filter(b => b.isClosed).length;
        const unclosedTotal = allSales.filter(s => !s.closed).length;

        container.innerHTML = `
        <div class="max-w-[1600px] mx-auto p-4 md:p-6 lg:p-10">
            <header class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                    <h2 class="text-2xl md:text-3xl font-bold text-white">관리자 대시보드</h2>
                    <p class="text-slate-500 text-sm mt-1">${Format.dateKR(new Date())} · ${this.filterBranch ? `<span class="text-blue-400 font-bold">${this.filterBranch}</span>` : '전체 지점'} 현황</p>
                </div>
                <div class="flex items-center gap-2">
                    <button id="btn-refresh-dashboard" class="flex items-center gap-1.5 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs hover:bg-slate-700 transition-colors text-slate-300" title="데이터 새로고침">
                        <span class="material-symbols-outlined text-sm">sync</span> 새로고침
                    </button>
                    <button id="btn-export-dashboard" class="flex items-center gap-1.5 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs hover:bg-slate-700 transition-colors text-slate-300">
                        <span class="material-symbols-outlined text-sm">download</span> 엑셀
                    </button>
                    <button onclick="App.navigate('settlement')" class="bg-yellow-300 text-slate-900 px-4 py-2 rounded-lg text-sm font-bold shadow-lg hover:bg-yellow-400 hover:scale-105 transition-all">
                        + 새 정산 입력
                    </button>
                </div>
            </header>

            <!-- 지점 필터 탭 -->
            <div class="flex flex-wrap gap-2 mb-6 items-center">
                <button class="db-branch-filter px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${!this.filterBranch ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}" data-branch="">전체</button>
                ${branchNames.map(bn => `<button class="db-branch-filter px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${this.filterBranch === bn ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}" data-branch="${bn}">${bn}</button>`).join('')}
            </div>

            <!-- 당일 마감 현황 (지점별) -->
            <div class="bg-slate-900 rounded-xl border border-slate-800 p-4 mb-6">
                <div class="flex items-center justify-between mb-3 flex-nowrap gap-1">
                    <div class="flex items-center gap-1 shrink-0">
                        <span class="material-symbols-outlined ${closedBranchCount === branchNames.length ? 'text-emerald-400' : 'text-amber-300'} text-base">task_alt</span>
                        <span class="text-xs font-bold text-white">마감현황</span>
                        <span class="text-[10px] text-slate-500 font-mono hidden sm:inline">${todayStr}</span>
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                        <span class="text-[10px] text-slate-600 items-center gap-0.5 hidden sm:flex"><span class="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>자동갱신</span>
                        ${unclosedTotal > 0 ? `<span class="text-[10px] font-bold text-red-300 bg-red-500/10 px-1.5 py-0.5 rounded-full">${unclosedTotal}건</span>` : ''}
                        <span class="text-[10px] font-bold ${closedBranchCount === branchNames.length ? 'text-emerald-400 bg-emerald-500/10' : 'text-amber-300 bg-amber-300/10'} px-1.5 py-0.5 rounded-full">${closedBranchCount}/${branchNames.length}</span>
                    </div>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                    ${closureTargetBranches.map(bn => {
                        const bc = branchClosureMap[bn];
                        let bgClass, avatarClass, labelClass, statusHtml;
                        if (bc.isClosed) {
                            bgClass = 'bg-emerald-500/5 border border-emerald-500/20';
                            avatarClass = 'bg-emerald-500/20 text-emerald-400';
                            labelClass = 'text-white';
                            statusHtml = `<p class="text-[10px] text-emerald-400 font-bold flex items-center gap-0.5 min-w-0"><span class="material-symbols-outlined text-[10px] shrink-0">check_circle</span><span class="closure-revenue">마감 ${bc.revenue ? Format.number(bc.revenue) : ''}</span></p>`;
                        } else if (bc.hasData) {
                            bgClass = 'bg-blue-500/5 border border-blue-500/20';
                            avatarClass = 'bg-blue-500/20 text-blue-400';
                            labelClass = 'text-white';
                            statusHtml = `<p class="text-[10px] text-blue-400 font-bold flex items-center gap-0.5 min-w-0"><span class="material-symbols-outlined text-[10px] animate-pulse shrink-0">edit</span><span class="closure-revenue">입력중 ${bc.revenue ? Format.number(bc.revenue) : ''}</span></p>`;
                        } else {
                            bgClass = 'bg-slate-800/50 border border-slate-700/50';
                            avatarClass = 'bg-slate-700 text-slate-500';
                            labelClass = 'text-slate-400';
                            statusHtml = `<p class="text-[10px] text-amber-300 font-bold flex items-center gap-0.5"><span class="material-symbols-outlined text-[10px] shrink-0">schedule</span> 미마감</p>`;
                        }
                        return `<div class="flex items-center gap-2 p-2.5 rounded-lg min-w-0 ${bgClass}">
                            <div class="h-7 w-7 rounded-lg ${avatarClass} text-[10px] flex items-center justify-center font-bold shrink-0">
                                <span class="material-symbols-outlined text-sm">store</span>
                            </div>
                            <div class="min-w-0 overflow-hidden">
                                <p class="text-xs font-bold ${labelClass} truncate">${bn}</p>
                                ${statusHtml}
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>

            <div class="mb-6">${PeriodFilter.renderUI(this.periodType, this.customFrom, this.customTo, 'db')}</div>

            <div class="flex gap-2 mb-6">
                <button class="db-view-tab px-4 py-2 rounded-lg text-sm font-bold transition-colors ${this.viewMode === 'total' ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}" data-view="total">
                    <span class="material-symbols-outlined text-sm align-middle mr-1">dashboard</span>통합 현황
                </button>
                <button class="db-view-tab px-4 py-2 rounded-lg text-sm font-bold transition-colors ${this.viewMode === 'byStaff' ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}" data-view="byStaff">
                    <span class="material-symbols-outlined text-sm align-middle mr-1">store</span>지점별 현황
                </button>
            </div>

            <!-- 요약 카드 -->
            <div class="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4 mb-8">
                <div class="bg-slate-900 p-3 md:p-5 rounded-xl border border-slate-800 min-w-0">
                    <div class="flex justify-between items-start mb-2"><div class="p-1.5 md:p-2 bg-emerald-500/10 rounded-lg text-emerald-500"><span class="material-symbols-outlined text-base md:text-lg">payments</span></div></div>
                    <p class="text-slate-500 text-[10px] uppercase tracking-wider font-semibold truncate">총 매출</p>
                    <h3 class="stat-value mt-1">${Format.won(totalRevenue)}</h3>
                    <p class="text-[10px] text-slate-500 mt-1">${allSales.length}건 정산</p>
                </div>
                <div class="bg-slate-900 p-3 md:p-5 rounded-xl border border-slate-800 min-w-0">
                    <div class="flex justify-between items-start mb-2"><div class="p-1.5 md:p-2 bg-red-300/10 rounded-lg text-red-300"><span class="material-symbols-outlined text-base md:text-lg">remove_circle</span></div></div>
                    <p class="text-slate-500 text-[10px] uppercase tracking-wider font-semibold truncate">총 차감</p>
                    <h3 class="stat-value mt-1 text-red-300">${Format.won(totalDeductions)}</h3>
                    <div class="text-[10px] text-slate-500 mt-1 space-y-0.5">
                        <p class="truncate">와리 ${Format.number(totalWari)}</p>
                        <p class="truncate">아가씨 ${Format.number(totalGirlPay)}</p>
                    </div>
                </div>
                <div class="bg-slate-900 p-3 md:p-5 rounded-xl border min-w-0 ${(totalRevenue - totalDeductions) >= 0 ? 'border-blue-500/30' : 'border-red-500/30'}">
                    <div class="flex justify-between items-start mb-2"><div class="p-1.5 md:p-2 bg-blue-500/10 rounded-lg text-blue-500"><span class="material-symbols-outlined text-base md:text-lg">trending_up</span></div></div>
                    <p class="text-slate-500 text-[10px] uppercase tracking-wider font-semibold truncate">순이익</p>
                    <h3 class="stat-value mt-1 ${(totalRevenue - totalDeductions) >= 0 ? 'text-blue-400' : 'text-red-300'}">${Format.won(totalRevenue - totalDeductions)}</h3>
                    <p class="text-[10px] mt-1 truncate ${(totalRevenue - totalDeductions) >= 0 ? 'text-emerald-400' : 'text-red-300'}">이익률 ${totalRevenue > 0 ? Math.round((totalRevenue - totalDeductions) / totalRevenue * 100) : 0}%</p>
                </div>
                <div class="bg-slate-900 p-3 md:p-5 rounded-xl border border-slate-800 min-w-0">
                    <div class="flex justify-between items-start mb-2"><div class="p-1.5 md:p-2 bg-amber-300/10 rounded-lg text-amber-300"><span class="material-symbols-outlined text-base md:text-lg">credit_card</span></div></div>
                    <p class="text-slate-500 text-[10px] uppercase tracking-wider font-semibold truncate">외상 잔액</p>
                    <h3 class="stat-value mt-1 text-amber-300">${Format.won(totalReceivable)}</h3>
                </div>
                <div class="bg-slate-900 p-3 md:p-5 rounded-xl border border-slate-800 min-w-0">
                    <div class="flex justify-between items-start mb-2"><div class="p-1.5 md:p-2 bg-yellow-300/10 rounded-lg text-yellow-300"><span class="material-symbols-outlined text-base md:text-lg">rewarded_ads</span></div></div>
                    <p class="text-slate-500 text-[10px] uppercase tracking-wider font-semibold truncate">와리 총액</p>
                    <h3 class="stat-value mt-1">${Format.won(totalWari)}</h3>
                    <p class="text-[10px] text-slate-500 mt-1 truncate">직원+아가씨 인센티브</p>
                </div>
            </div>

            <!-- 매입/매출 현황 -->
            <div class="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden mb-8">
                <div class="p-4 md:p-6 border-b border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <h4 class="font-bold text-lg flex items-center gap-2">
                        <span class="material-symbols-outlined text-emerald-500">swap_vert</span> 매입 / 매출 현황
                    </h4>
                    <button id="btn-export-purchase-sales" class="flex items-center gap-2 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs hover:bg-slate-700 transition-colors text-slate-300">
                        <span class="material-symbols-outlined text-sm">download</span> 엑셀
                    </button>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-0">
                    <div class="p-4 md:p-6 md:border-r border-slate-800">
                        <div class="flex items-center gap-2 mb-4"><span class="w-3 h-3 rounded-full bg-emerald-500"></span><span class="text-sm font-bold text-emerald-400 uppercase tracking-wider">매출</span></div>
                        <div class="space-y-3">
                            <div class="flex justify-between items-center p-3 bg-emerald-500/5 rounded-lg border border-emerald-500/10">
                                <span class="text-sm font-bold text-white">총 매출</span><span class="text-lg font-black text-emerald-400 font-mono">${Format.won(totalRevenue)}</span>
                            </div>
                            <div class="flex justify-between items-center p-2 pl-6"><span class="text-xs text-slate-400">현금</span><span class="text-sm font-mono text-white">${Format.won(cashRevenue)}</span></div>
                            <div class="flex justify-between items-center p-2 pl-6"><span class="text-xs text-slate-400">카드</span><span class="text-sm font-mono text-white">${Format.won(cardRevenue)}</span></div>
                            <div class="flex justify-between items-center p-2 pl-6"><span class="text-xs text-slate-400">외상</span><span class="text-sm font-mono text-amber-300">${Format.won(creditRevenue)}</span></div>
                        </div>
                    </div>
                    <div class="p-4 md:p-6 border-t md:border-t-0 border-slate-800">
                        <div class="flex items-center gap-2 mb-4"><span class="w-3 h-3 rounded-full bg-rose-500"></span><span class="text-sm font-bold text-rose-400 uppercase tracking-wider">매입 / 지출</span></div>
                        <div class="space-y-3">
                            <div class="flex justify-between items-center p-3 bg-rose-500/5 rounded-lg border border-rose-500/10">
                                <span class="text-sm font-bold text-white">주류 매입</span><span class="text-lg font-black text-rose-400 font-mono">${Format.won(totalPurchase)}</span>
                            </div>
                            ${purchaseItems.slice(0, 4).map(i => `<div class="flex justify-between items-center p-2 pl-6"><span class="text-xs text-slate-400">${i.name}</span><span class="text-sm font-mono text-white">${Format.won(i.amount)}</span></div>`).join('')}
                            <div class="flex justify-between items-center p-3 bg-amber-300/5 rounded-lg border border-amber-300/10 mt-2">
                                <span class="text-sm font-bold text-white">기타 지출</span><span class="text-lg font-black text-amber-300 font-mono">${Format.won(totalExpense)}</span>
                            </div>
                            <div class="flex justify-between items-center p-3 bg-yellow-300/5 rounded-lg border border-yellow-300/10">
                                <span class="text-sm font-bold text-white">와리</span><span class="text-lg font-black gold-gradient-text font-mono">${Format.won(totalWari)}</span>
                            </div>
                            <div class="flex justify-between items-center p-3 bg-pink-500/5 rounded-lg border border-pink-500/10">
                                <span class="text-sm font-bold text-white">아가씨 지급</span><span class="text-lg font-black text-pink-400 font-mono">${Format.won(totalGirlPay)}</span>
                            </div>
                            ${totalDailyExpense > 0 ? `<div class="flex justify-between items-center p-2 pl-6"><span class="text-xs text-slate-400">정산 내 지출</span><span class="text-sm font-mono text-white">${Format.won(totalDailyExpense)}</span></div>` : ''}
                        </div>
                    </div>
                </div>
                <div class="p-4 md:p-6 border-t border-slate-800 bg-slate-800/30">
                    <div class="flex flex-col sm:flex-row justify-between items-center gap-4">
                        <div class="flex items-center gap-4 flex-wrap">
                            <div class="text-center"><p class="text-[10px] text-slate-500 uppercase tracking-wider font-bold">매출</p><p class="text-sm font-bold text-emerald-400">${Format.won(totalRevenue)}</p></div>
                            <span class="text-slate-600 text-lg">−</span>
                            <div class="text-center"><p class="text-[10px] text-slate-500 uppercase tracking-wider font-bold">매입</p><p class="text-sm font-bold text-rose-400">${Format.won(totalPurchase)}</p></div>
                            <span class="text-slate-600 text-lg">−</span>
                            <div class="text-center"><p class="text-[10px] text-slate-500 uppercase tracking-wider font-bold">지출</p><p class="text-sm font-bold text-amber-300">${Format.won(totalExpense + totalDailyExpense)}</p></div>
                            <span class="text-slate-600 text-lg">−</span>
                            <div class="text-center"><p class="text-[10px] text-slate-500 uppercase tracking-wider font-bold">와리</p><p class="text-sm font-bold gold-gradient-text">${Format.won(totalWari)}</p></div>
                            <span class="text-slate-600 text-lg">−</span>
                            <div class="text-center"><p class="text-[10px] text-slate-500 uppercase tracking-wider font-bold">아가씨</p><p class="text-sm font-bold text-pink-400">${Format.won(totalGirlPay)}</p></div>
                        </div>
                        <div class="text-center sm:text-right">
                            <p class="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">순이익</p>
                            <p class="text-2xl font-black ${netProfit >= 0 ? 'text-blue-400' : 'text-red-300'}">${Format.won(netProfit)}</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ═══ 지점별 순이익 분석 ═══ -->
            <div class="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden mb-8">
                <div class="p-4 md:p-6 border-b border-slate-800 flex items-center gap-2">
                    <span class="material-symbols-outlined text-blue-500">store</span>
                    <h4 class="font-bold text-lg">지점별 순이익 분석</h4>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-sm" style="white-space:nowrap;min-width:600px">
                        <thead><tr class="bg-slate-800/50 text-[10px] text-slate-500 uppercase tracking-wider">
                            <th class="px-3 md:px-6 py-3 font-semibold">지점</th>
                            <th class="px-4 md:px-6 py-3 font-semibold">매출</th>
                            <th class="px-4 md:px-6 py-3 font-semibold">와리</th>
                            <th class="px-4 md:px-6 py-3 font-semibold hidden md:table-cell">아가씨</th>
                            <th class="px-4 md:px-6 py-3 font-semibold hidden md:table-cell">지출</th>
                            <th class="px-4 md:px-6 py-3 font-semibold">순이익</th>
                            <th class="px-4 md:px-6 py-3 font-semibold">이익률</th>
                            <th class="px-4 md:px-6 py-3 font-semibold">비중</th>
                        </tr></thead>
                        <tbody class="divide-y divide-slate-800">
                            ${staffStats.map(s => {
                                const overallNetProfit = totalRevenue - totalDeductions;
                                const pctMargin = s.revenue > 0 ? Math.round(s.netProfit / s.revenue * 100) : 0;
                                const pctShare = overallNetProfit > 0 ? Math.round(s.netProfit / overallNetProfit * 100) : 0;
                                return `<tr class="hover:bg-slate-800/30">
                                    <td class="px-4 md:px-6 py-3">
                                        <div class="flex items-center gap-2">
                                            <div class="h-7 w-7 rounded-full bg-blue-500/20 text-blue-400 text-[10px] flex items-center justify-center font-bold">${s.name.substring(0, 1)}</div>
                                            <div><span class="text-white font-bold text-xs">${s.branch_name || s.name}</span>
                                            ${s.branch_name ? `<span class="text-[10px] text-slate-500 block">${s.name}</span>` : ''}</div>
                                        </div>
                                    </td>
                                    <td class="px-4 md:px-6 py-3 font-mono text-white font-bold">${Format.won(s.revenue)}</td>
                                    <td class="px-4 md:px-6 py-3 font-mono text-yellow-300 text-xs">${Format.won(s.wari)}</td>
                                    <td class="px-4 md:px-6 py-3 font-mono text-pink-400 text-xs hidden md:table-cell">${Format.won(s.girlPay)}</td>
                                    <td class="px-4 md:px-6 py-3 font-mono text-slate-400 text-xs hidden md:table-cell">${Format.won(s.expense + s.dailyExpense)}</td>
                                    <td class="px-4 md:px-6 py-3 font-mono font-bold ${s.netProfit >= 0 ? 'text-blue-400' : 'text-red-300'}">${Format.won(s.netProfit)}</td>
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
                                <td class="px-4 md:px-6 py-3 font-mono text-white">${Format.won(totalRevenue)}</td>
                                <td class="px-4 md:px-6 py-3 font-mono text-yellow-300 text-xs">${Format.won(totalWari)}</td>
                                <td class="px-4 md:px-6 py-3 font-mono text-pink-400 text-xs hidden md:table-cell">${Format.won(totalGirlPay)}</td>
                                <td class="px-4 md:px-6 py-3 font-mono text-slate-400 text-xs hidden md:table-cell">${Format.won(totalExpense + totalDailyExpense)}</td>
                                <td class="px-4 md:px-6 py-3 font-mono ${(totalRevenue - totalDeductions) >= 0 ? 'text-blue-400' : 'text-red-300'}">${Format.won(totalRevenue - totalDeductions)}</td>
                                <td class="px-4 md:px-6 py-3 font-mono ${(totalRevenue - totalDeductions) >= 0 ? 'text-emerald-400' : 'text-red-300'}">${totalRevenue > 0 ? Math.round((totalRevenue - totalDeductions) / totalRevenue * 100) : 0}%</td>
                                <td class="px-4 md:px-6 py-3 text-[10px] text-slate-500">100%</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- ═══ 차트 영역 ═══ -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <div class="bg-slate-900 rounded-xl border border-slate-800 p-4 md:p-6">
                    <h4 class="text-sm font-bold mb-4 flex items-center gap-2"><span class="material-symbols-outlined text-blue-500 text-base">bar_chart</span> 월별 매출·지출 추이</h4>
                    <div class="relative h-64"><canvas id="chart-revenue-expense"></canvas></div>
                </div>
                <div class="bg-slate-900 rounded-xl border border-slate-800 p-4 md:p-6">
                    <h4 class="text-sm font-bold mb-4 flex items-center gap-2"><span class="material-symbols-outlined text-purple-500 text-base">pie_chart</span> 지출 카테고리 비율</h4>
                    <div class="relative h-64"><canvas id="chart-expense-category"></canvas></div>
                </div>
                <div class="bg-slate-900 rounded-xl border border-slate-800 p-4 md:p-6">
                    <h4 class="text-sm font-bold mb-4 flex items-center gap-2"><span class="material-symbols-outlined text-emerald-500 text-base">groups</span> 직원별 실적 비교</h4>
                    <div class="relative h-64"><canvas id="chart-staff-compare"></canvas></div>
                </div>
                <div class="bg-slate-900 rounded-xl border border-slate-800 p-4 md:p-6">
                    <h4 class="text-sm font-bold mb-4 flex items-center gap-2"><span class="material-symbols-outlined text-amber-300 text-base">trending_up</span> 외상 잔액 추이</h4>
                    <div class="relative h-64"><canvas id="chart-receivable-trend"></canvas></div>
                </div>
                <div class="bg-slate-900 rounded-xl border border-slate-800 p-4 md:p-6 lg:col-span-2">
                    <h4 class="text-sm font-bold mb-4 flex items-center gap-2"><span class="material-symbols-outlined text-cyan-500 text-base">local_bar</span> 주류 판매 현황</h4>
                    <div class="relative h-64"><canvas id="chart-liquor-sales"></canvas></div>
                </div>
            </div>

            ${this.viewMode === 'total' ? `
            <!-- 지점별 실적 테이블 -->
            <div class="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden mb-8">
                <div class="p-4 md:p-6 border-b border-slate-800 flex justify-between items-center">
                    <h4 class="font-bold text-lg flex items-center gap-2"><span class="material-symbols-outlined text-blue-500">store</span> 지점별 실적 취합</h4>
                    <button onclick="App.navigate('staff')" class="text-xs text-blue-500 font-bold hover:underline">직원 관리</button>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-sm" style="white-space:nowrap;min-width:600px">
                        <thead><tr class="bg-slate-800/50 text-slate-500 text-[10px] uppercase tracking-wider">
                            <th class="px-3 md:px-6 py-3 font-semibold">지점</th>
                            <th class="px-4 md:px-6 py-3 font-semibold">직원수</th>
                            <th class="px-4 md:px-6 py-3 font-semibold">정산건수</th>
                            <th class="px-4 md:px-6 py-3 font-semibold">매출</th>
                            <th class="px-4 md:px-6 py-3 font-semibold">와리</th>
                            <th class="px-4 md:px-6 py-3 font-semibold">순이익</th>
                            <th class="px-4 md:px-6 py-3 font-semibold">외상</th>
                        </tr></thead>
                        <tbody class="divide-y divide-slate-800">
                            ${staffStats.map(s => {
                                const branchStaffCount = staff.filter(st => (st.branch_name || st.name) === s.name).length;
                                return `<tr class="hover:bg-slate-800/30">
                                    <td class="px-4 md:px-6 py-4"><div class="flex items-center gap-2"><div class="h-8 w-8 rounded-lg bg-blue-500/20 text-blue-400 text-xs flex items-center justify-center font-bold"><span class="material-symbols-outlined text-sm">store</span></div><span class="font-bold text-white">${s.name}</span></div></td>
                                    <td class="px-4 md:px-6 py-4 text-slate-400">${branchStaffCount}명</td>
                                    <td class="px-4 md:px-6 py-4 text-white font-mono">${s.salesCount}건</td>
                                    <td class="px-4 md:px-6 py-4 text-white font-mono font-bold">${Format.won(s.revenue)}</td>
                                    <td class="px-4 md:px-6 py-4 font-mono gold-gradient-text font-bold">${Format.won(s.wari)}</td>
                                    <td class="px-4 md:px-6 py-4 font-mono font-bold ${s.netProfit >= 0 ? 'text-blue-400' : 'text-red-300'}">${Format.won(s.netProfit)}</td>
                                    <td class="px-4 md:px-6 py-4 ${s.receivable > 0 ? 'text-red-300' : 'text-slate-500'} font-mono">${Format.won(s.receivable)} ${s.receivableCount > 0 ? `(${s.receivableCount}건)` : ''}</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                <div class="lg:col-span-2 bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
                    <div class="p-4 md:p-6 border-b border-slate-800 flex justify-between items-center">
                        <h4 class="font-bold text-lg">최근 정산</h4>
                        <button onclick="App.navigate('settlement')" class="text-xs text-blue-500 font-bold hover:underline">전체 보기</button>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left text-sm" style="white-space:nowrap;min-width:480px"><thead><tr class="bg-slate-800/50 text-slate-500 text-[10px] uppercase tracking-wider">
                            <th class="px-3 md:px-6 py-3">날짜</th><th class="px-3 md:px-6 py-3">직원</th><th class="px-3 md:px-6 py-3">주대</th><th class="px-3 md:px-6 py-3">정산금</th>
                        </tr></thead><tbody class="divide-y divide-slate-800">
                            ${recentSales.length > 0 ? recentSales.map(s => {
                                const eb = staff.find(st => st.id === s.entered_by);
                                return `<tr class="hover:bg-slate-800/30 cursor-pointer" onclick="App.navigate('settlement')">
                                    <td class="px-3 md:px-6 py-3 font-mono text-slate-400" style="white-space:nowrap">${s.date}</td>
                                    <td class="px-3 md:px-6 py-3" style="white-space:nowrap"><span class="text-xs px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded font-bold">${eb ? (eb.branch_name ? eb.branch_name + ' ' + eb.name : eb.name) : '관리자'}</span></td>
                                    <td class="px-3 md:px-6 py-3 font-bold text-white" style="white-space:nowrap">${Format.won(s.total_revenue)}</td>
                                    <td class="px-3 md:px-6 py-3 font-bold text-blue-500" style="white-space:nowrap">${Format.won(s.net_settlement)}</td>
                                </tr>`;
                            }).join('') : `<tr><td colspan="4" class="px-6 py-12 text-center text-slate-500">정산 데이터가 없습니다.</td></tr>`}
                        </tbody></table>
                    </div>
                </div>
                <div class="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
                    <div class="p-4 md:p-6 border-b border-slate-800 flex justify-between items-center">
                        <h4 class="font-bold">미수 외상</h4>
                        <button onclick="App.navigate('credit')" class="text-xs text-blue-500 font-bold hover:underline">전체 보기</button>
                    </div>
                    <div class="p-4 space-y-3 max-h-80 overflow-y-auto custom-scrollbar">
                        ${urgentReceivables.length > 0 ? urgentReceivables.map(r => {
                            const isOverdue = r.due_date && new Date(r.due_date) < new Date();
                            const s = staff.find(st => st.id === r.staff_id);
                            return `<div class="p-3 rounded-lg border ${isOverdue ? 'border-red-300/30 bg-red-300/5' : 'border-slate-700 bg-slate-800/30'}">
                                <div class="flex justify-between items-start mb-1"><span class="font-bold text-sm text-white">${r.customer}</span>
                                <span class="text-[10px] font-bold ${isOverdue ? 'text-red-300' : r.status === 'partial' ? 'text-amber-300' : 'text-slate-400'}">${isOverdue ? '연체' : r.status === 'partial' ? '부분입금' : '미입금'}</span></div>
                                <div class="flex justify-between text-xs text-slate-400"><span>${s ? s.name : '-'} · ${Format.won(r.amount)}</span><span class="${isOverdue ? 'text-red-300' : ''}">${r.due_date || '-'}</span></div>
                            </div>`;
                        }).join('') : `<p class="text-center text-slate-500 py-8">미수 외상이 없습니다.</p>`}
                    </div>
                </div>
            </div>
            ` : `
            <!-- 지점별 뷰 -->
            <div class="space-y-6 mb-8">
                ${staffStats.map((s, idx) => {
                    const colors = ['blue', 'emerald', 'purple', 'yellow', 'rose', 'cyan'];
                    const color = colors[idx % colors.length];
                    const mySales = allSales.filter(d => s.staffIds.includes(d.entered_by)).sort((a, b) => b.date.localeCompare(a.date));
                    const myReceivables = allReceivables.filter(r => (s.staffIds.includes(r.staff_id) || s.staffIds.includes(r.entered_by)) && r.status !== 'paid');
                    const revPct = totalRevenue > 0 ? Math.round((s.revenue / totalRevenue) * 100) : 0;
                    const branchStaffCount = staff.filter(st => (st.branch_name || st.name) === s.name).length;

                    return `<div class="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                        <div class="p-4 md:p-6 border-b border-slate-800 bg-gradient-to-r from-${color}-500/5 to-transparent">
                            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div class="flex items-center gap-3">
                                    <div class="h-12 w-12 rounded-xl bg-${color}-500/20 text-${color}-400 flex items-center justify-center font-bold text-lg">
                                        <span class="material-symbols-outlined text-xl">store</span>
                                    </div>
                                    <div><h4 class="font-bold text-lg text-white">${s.name}</h4>
                                    <p class="text-xs text-slate-500">직원 ${branchStaffCount}명 · 매출 비중 ${revPct}%</p></div>
                                </div>
                                <div class="text-right"><p class="text-[10px] text-slate-500 uppercase tracking-wider">순수익</p><p class="text-lg font-bold ${s.netProfit >= 0 ? 'text-blue-400' : 'text-red-300'}">${Format.won(s.netProfit)}</p></div>
                            </div>
                        </div>
                        <div class="grid grid-cols-2 md:grid-cols-6 gap-3 p-4 md:p-6">
                            <div class="bg-slate-800/50 p-3 rounded-lg"><p class="text-[10px] text-slate-500 font-bold mb-1">매출</p><p class="text-base md:text-lg font-bold text-white">${Format.won(s.revenue)}</p><p class="text-[10px] text-slate-500">${s.salesCount}건</p></div>
                            <div class="bg-slate-800/50 p-3 rounded-lg"><p class="text-[10px] text-slate-500 font-bold mb-1">와리</p><p class="text-base md:text-lg font-bold gold-gradient-text">${Format.won(s.wari)}</p></div>
                            <div class="bg-slate-800/50 p-3 rounded-lg"><p class="text-[10px] text-slate-500 font-bold mb-1">아가씨</p><p class="text-base md:text-lg font-bold text-pink-400">${Format.won(s.girlPay)}</p></div>
                            <div class="bg-slate-800/50 p-3 rounded-lg"><p class="text-[10px] text-slate-500 font-bold mb-1">지출</p><p class="text-base md:text-lg font-bold text-red-300">${Format.won(s.expense + s.dailyExpense)}</p></div>
                            <div class="bg-slate-800/50 p-3 rounded-lg ${s.netProfit >= 0 ? 'border border-blue-500/20' : 'border border-red-500/20'}"><p class="text-[10px] text-slate-500 font-bold mb-1">순이익</p><p class="text-base md:text-lg font-bold ${s.netProfit >= 0 ? 'text-blue-400' : 'text-red-300'}">${Format.won(s.netProfit)}</p><p class="text-[10px] ${s.netProfit >= 0 ? 'text-emerald-400' : 'text-red-300'}">${s.revenue > 0 ? Math.round(s.netProfit / s.revenue * 100) : 0}%</p></div>
                            <div class="bg-slate-800/50 p-3 rounded-lg"><p class="text-[10px] text-slate-500 font-bold mb-1">외상</p><p class="text-base md:text-lg font-bold ${s.receivable > 0 ? 'text-amber-300' : 'text-slate-400'}">${Format.won(s.receivable)}</p></div>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-0 border-t border-slate-800">
                            <div class="p-4 md:border-r border-slate-800"><h5 class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">최근 정산</h5>
                                ${mySales.length > 0 ? mySales.slice(0, 5).map(sale => `<div class="flex justify-between items-center py-1.5 border-b border-slate-800/50 last:border-0"><span class="text-xs font-mono text-slate-400">${sale.date}</span><div class="flex gap-4"><span class="text-xs font-bold text-white">${Format.won(sale.total_revenue)}</span><span class="text-xs font-bold text-blue-400">${Format.won(sale.net_settlement)}</span></div></div>`).join('') : '<p class="text-xs text-slate-600 text-center py-4">정산 없음</p>'}
                            </div>
                            <div class="p-4 border-t md:border-t-0 border-slate-800"><h5 class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">미수 외상</h5>
                                ${myReceivables.length > 0 ? myReceivables.slice(0, 5).map(r => {
                                    const isOd = r.due_date && new Date(r.due_date) < new Date();
                                    return `<div class="flex justify-between items-center py-1.5 border-b border-slate-800/50 last:border-0"><span class="text-xs font-medium text-white">${r.customer} ${isOd ? '<span class="text-red-300 text-[10px]">(연체)</span>' : ''}</span><span class="text-xs font-mono ${isOd ? 'text-red-300' : 'text-amber-300'}">${Format.won(r.amount - (r.paid_amount || 0))}</span></div>`;
                                }).join('') : '<p class="text-xs text-slate-600 text-center py-4">미수 외상 없음</p>'}
                            </div>
                        </div>
                    </div>`;
                }).join('')}
            </div>
            `}

            <!-- 주류 재고 -->
            <div class="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
                <div class="p-4 md:p-6 border-b border-slate-800 flex justify-between items-center">
                    <h4 class="font-bold text-lg">주류 재고 현황</h4>
                    <button onclick="App.navigate('inventory')" class="text-xs text-blue-500 font-bold hover:underline">재고 관리</button>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 p-4 md:p-6">
                    ${liquors.map(l => {
                        const recs = inventory.filter(i => i.liquor_id === l.id);
                        const branchRecs = recs.filter(i => i.branch_id != null);
                        const qty = branchRecs.length ? branchRecs.reduce((s, i) => s + (i.quantity || 0), 0) : recs.reduce((s, i) => s + (i.quantity || 0), 0);
                        const threshold = (recs[0] || {}).alert_threshold || 10;
                        const pct = Math.min(100, (qty / (threshold * 5)) * 100);
                        const colorCls = qty <= threshold ? 'red-300' : qty <= threshold * 2 ? 'amber-300' : 'emerald-500';
                        return `<div class="bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                            <p class="text-[10px] text-slate-500 font-bold uppercase mb-1">${l.name}</p>
                            <p class="text-xl font-black text-white">${qty}<span class="text-xs text-slate-500 ml-1">병</span></p>
                            <div class="mt-2 h-1 w-full bg-slate-700 rounded-full overflow-hidden"><div class="h-full bg-${colorCls} rounded-full" style="width:${pct}%"></div></div>
                            ${qty <= threshold ? `<p class="text-[10px] text-red-300 mt-1">재고 부족</p>` : ''}
                        </div>`;
                    }).join('')}
                </div>
            </div>
        </div>`;

        // 차트 렌더링 (지점 필터 적용된 데이터 전달)
        this._renderAdminCharts(allSales, allExpenses, allReceivables, staffStats, expenseByCategory);
    },

    _renderAdminCharts(allSalesRaw, allExpensesRaw, allReceivablesRaw, staffStats, expenseByCategory) {
        if (typeof Chart === 'undefined') return;
        if (typeof ChartDataLabels !== 'undefined') Chart.register(ChartDataLabels);
        const gridColor = 'rgba(148,163,184,0.1)';
        const tickColor = '#64748b';
        const chartColors = ['#3b82f6', '#10b981', '#8b5cf6', '#FCD34D', '#fca5a5', '#06b6d4', '#ec4899', '#84cc16'];
        const dlWon = { color: '#fff', font: { size: 10, weight: 'bold' }, formatter: v => v > 0 ? (v/10000).toFixed(0) + '만' : '', anchor: 'end', align: 'end', offset: -2 };
        const dlPct = (ctx) => ({ color: '#fff', font: { size: 11, weight: 'bold' }, formatter: (v, c) => { const total = c.dataset.data.reduce((a, b) => a + b, 0); const pct = total > 0 ? Math.round(v / total * 100) : 0; return pct >= 5 ? pct + '%' : ''; } });
        const dlCount = { color: '#fff', font: { size: 10, weight: 'bold' }, formatter: v => v > 0 ? v : '', anchor: 'end', align: 'end', offset: -2 };

        const last6 = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(); d.setMonth(d.getMonth() - i);
            last6.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
        }

        // 1. 월별 매출·지출 추이
        const revByMonth = {}, expByMonth = {};
        last6.forEach(k => { revByMonth[k] = 0; expByMonth[k] = 0; });
        allSalesRaw.forEach(s => { const m = s.date ? s.date.substring(0, 7) : ''; if (revByMonth[m] !== undefined) revByMonth[m] += (Number(s.total_revenue) || 0); });
        allExpensesRaw.forEach(e => { const m = e.date ? e.date.substring(0, 7) : ''; if (expByMonth[m] !== undefined) expByMonth[m] += (Number(e.amount) || 0); });

        const ctx1 = document.getElementById('chart-revenue-expense');
        if (ctx1) {
            this._charts.push(new Chart(ctx1, {
                type: 'bar',
                data: {
                    labels: last6.map(k => k.substring(2)),
                    datasets: [
                        { label: '매출', data: last6.map(k => revByMonth[k]), backgroundColor: 'rgba(16,185,129,0.7)', borderRadius: 4 },
                        { label: '지출', data: last6.map(k => expByMonth[k]), backgroundColor: 'rgba(252,165,165,0.7)', borderRadius: 4 }
                    ]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, datalabels: dlWon },
                    scales: { x: { grid: { color: gridColor }, ticks: { color: tickColor } }, y: { grid: { color: gridColor }, ticks: { color: tickColor, callback: v => '₩' + (v/10000).toFixed(0) + '만' } } }
                }
            }));
        }

        // 2. 지출 카테고리 비율 (파이 차트)
        const catEntries = Object.entries(expenseByCategory).filter(e => e[1] > 0).sort((a, b) => b[1] - a[1]);
        const ctx2 = document.getElementById('chart-expense-category');
        if (ctx2) {
            this._charts.push(new Chart(ctx2, {
                type: 'doughnut',
                data: {
                    labels: catEntries.length > 0 ? catEntries.map(e => e[0]) : ['데이터 없음'],
                    datasets: [{ data: catEntries.length > 0 ? catEntries.map(e => e[1]) : [1], backgroundColor: catEntries.length > 0 ? chartColors.slice(0, catEntries.length) : ['#334155'], borderWidth: 0 }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, datalabels: { color: '#fff', font: { size: 11, weight: 'bold' }, formatter: (v, c) => { const total = c.dataset.data.reduce((a, b) => a + b, 0); const pct = total > 0 ? Math.round(v / total * 100) : 0; return pct >= 5 ? c.chart.data.labels[c.dataIndex] + '\n' + pct + '%' : ''; }, textAlign: 'center' } } }
            }));
        }

        // 3. 직원별 실적 비교 (바 차트)
        const ctx3 = document.getElementById('chart-staff-compare');
        if (ctx3) {
            this._charts.push(new Chart(ctx3, {
                type: 'bar',
                data: {
                    labels: staffStats.map(s => s.name),
                    datasets: [
                        { label: '매출', data: staffStats.map(s => s.revenue), backgroundColor: 'rgba(59,130,246,0.7)', borderRadius: 4 },
                        { label: '와리', data: staffStats.map(s => s.wari), backgroundColor: 'rgba(252,211,77,0.7)', borderRadius: 4 }
                    ]
                },
                options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                    plugins: { legend: { display: false }, datalabels: dlWon },
                    scales: { x: { grid: { color: gridColor }, ticks: { color: tickColor, callback: v => '₩' + (v/10000).toFixed(0) + '만' } }, y: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 11 } } } }
                }
            }));
        }

        // 4. 외상 잔액 추이
        const recByMonth = {};
        last6.forEach(k => { recByMonth[k] = 0; });
        allReceivablesRaw.filter(r => r.status !== 'paid').forEach(r => {
            const m = r.date ? r.date.substring(0, 7) : '';
            if (recByMonth[m] !== undefined) recByMonth[m] += ((r.amount || 0) - (r.paid_amount || 0));
        });

        const ctx4 = document.getElementById('chart-receivable-trend');
        if (ctx4) {
            this._charts.push(new Chart(ctx4, {
                type: 'line',
                data: {
                    labels: last6.map(k => k.substring(2)),
                    datasets: [{
                        label: '외상 잔액',
                        data: last6.map(k => recByMonth[k]),
                        borderColor: '#FCD34D', backgroundColor: 'rgba(252,211,77,0.1)',
                        fill: true, tension: 0.3, pointRadius: 5, pointBackgroundColor: '#FCD34D'
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false }, datalabels: { ...dlWon, anchor: 'end', align: 'top', offset: 4 } },
                    scales: { x: { grid: { color: gridColor }, ticks: { color: tickColor } }, y: { grid: { color: gridColor }, ticks: { color: tickColor, callback: v => '₩' + (v/10000).toFixed(0) + '만' } } }
                }
            }));
        }

        // 5. 주류 판매 현황
        const liquorSales = {};
        allSalesRaw.forEach(s => {
            if (s.liquor_items) {
                s.liquor_items.forEach(item => {
                    liquorSales[item.name] = (liquorSales[item.name] || 0) + (item.qty || 0);
                });
            }
        });
        const lqEntries = Object.entries(liquorSales).sort((a, b) => b[1] - a[1]);

        const ctx5 = document.getElementById('chart-liquor-sales');
        if (ctx5) {
            this._charts.push(new Chart(ctx5, {
                type: 'bar',
                data: {
                    labels: lqEntries.length > 0 ? lqEntries.map(e => e[0]) : ['데이터 없음'],
                    datasets: [{
                        label: '판매 수량',
                        data: lqEntries.length > 0 ? lqEntries.map(e => e[1]) : [0],
                        backgroundColor: chartColors.slice(0, Math.max(lqEntries.length, 1)),
                        borderRadius: 6
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false }, datalabels: dlCount },
                    scales: { x: { grid: { color: gridColor }, ticks: { color: tickColor } }, y: { grid: { color: gridColor }, ticks: { color: tickColor, stepSize: 1 } } }
                }
            }));
        }
    },

    async renderStaff(container) {
        const session = Auth.getSession();
        if (!session) {
            container.innerHTML = `<div class="p-8 text-center text-slate-400">로그인이 필요합니다.</div>`;
            return;
        }
        const staffId = await Auth.getStaffId(); // getStaffId()는 null이면 자동 복구 시도
        const myStaff = staffId ? await DB.getById('staff', staffId) : null;
        const range = PeriodFilter.getRange(this.periodType, this.customFrom, this.customTo);

        if (!staffId) {
            const newStaff = await DB.insert('staff', {
                name: session.name || session.username || '미지정',
                branch_name: '',
                role: 'manager',
                hire_date: new Date().toISOString().slice(0, 10),
                pay_date: 25,
                salary: 0,
                incentive_rate: 15
            });
            await DB.update('users', session.id, { staff_id: newStaff.id });
            session.staff_id = newStaff.id;
            Auth._setSession(session);
            App.renderPage('dashboard');
            return;
        }

        const allStaff = await DB.getAll('staff');
        const branchStaffIds = myStaff?.branch_name
            ? allStaff.filter(s => s.branch_name === myStaff.branch_name).map(s => s.id)
            : [staffId];
        const isBranch = branchStaffIds.length > 1 || (branchStaffIds.length === 1 && myStaff?.branch_name);
        const labelMy = isBranch ? (myStaff?.branch_name || '지점') : '내';

        const [mySales, myReceivablesByStaff, myReceivablesByEntered, myWari] = await Promise.all([
            DB.getFiltered('daily_sales', { from: range.from, to: range.to, staffIds: branchStaffIds, staffField: 'entered_by', orderField: 'date', orderAsc: false }),
            DB.getFiltered('receivables', { from: range.from, to: range.to, staffIds: branchStaffIds, staffField: 'staff_id',   orderField: 'date', orderAsc: false }),
            DB.getFiltered('receivables', { from: range.from, to: range.to, staffIds: branchStaffIds, staffField: 'entered_by', orderField: 'date', orderAsc: false }),
            DB.getFiltered('wari',        { from: range.from, to: range.to, staffIds: branchStaffIds, staffField: 'staff_id',   orderField: 'date', orderAsc: false }),
        ]);
        // receivables: staff_id + entered_by 합집합
        const myReceivables = myReceivablesByStaff.slice();
        const existRecIds = new Set(myReceivables.map(r => r.id));
        myReceivablesByEntered.forEach(r => { if (!existRecIds.has(r.id)) myReceivables.push(r); });

        const totalRevenue = mySales.reduce((s, r) => s + (Number(r.total_revenue) || 0), 0);
        // 와리: wari 테이블 + daily_sales에 기록된 와리 모두 합산 (더 큰 값 사용)
        const wariFromTable = myWari.reduce((s, w) => s + (Number(w.amount) || 0), 0);
        const wariFromSales = mySales.reduce((s, r) => s + (Number(r.total_staff_wari) || 0), 0);
        const totalWari = Math.max(wariFromTable, wariFromSales);
        const totalReceivable = myReceivables.filter(r => r.status !== 'paid').reduce((s, r) => s + (r.amount - (r.paid_amount || 0)), 0);

        container.innerHTML = `
        <div class="max-w-[1600px] mx-auto p-4 md:p-6 lg:p-10">
            <header class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                <div>
                    <h2 class="text-2xl md:text-3xl font-bold text-white">${isBranch ? (myStaff?.branch_name || '지점') + ' 지점 대시보드' : (session.name || session.username || '직원') + '님의 대시보드'}</h2>
                    <p class="text-slate-500 text-sm mt-1">${Format.dateKR(new Date())} · ${myStaff ? (myStaff.role === 'president' ? '영업사장' : myStaff.role === 'manager' ? '실장' : '스탭') : '직원'}</p>
                </div>
                <button onclick="App.navigate('settlement')" class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors">+ 새 정산 입력</button>
            </header>

            <div class="mb-6">${PeriodFilter.renderUI(this.periodType, this.customFrom, this.customTo, 'db')}</div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6 mb-8">
                <div class="bg-slate-900 p-4 md:p-6 rounded-xl border border-slate-800">
                    <p class="text-slate-500 text-xs uppercase tracking-wider font-semibold mb-2">${labelMy} 총 매출</p>
                    <h3 class="text-2xl font-bold text-white">${Format.won(totalRevenue)}</h3>
                    <p class="text-xs text-slate-500 mt-1">${mySales.length}건 정산</p>
                </div>
                <div class="bg-slate-900 p-4 md:p-6 rounded-xl border border-slate-800">
                    <p class="text-slate-500 text-xs uppercase tracking-wider font-semibold mb-2">와리 수령액</p>
                    <h3 class="text-2xl font-bold gold-gradient-text">${Format.won(totalWari)}</h3>
                </div>
                <div class="bg-slate-900 p-4 md:p-6 rounded-xl border border-slate-800">
                    <p class="text-slate-500 text-xs uppercase tracking-wider font-semibold mb-2">${labelMy} 외상 잔액</p>
                    <h3 class="text-2xl font-bold ${totalReceivable > 0 ? 'text-amber-300' : 'text-white'}">${Format.won(totalReceivable)}</h3>
                </div>
            </div>

            <div class="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden mb-8">
                <div class="p-4 md:p-6 border-b border-slate-800"><h4 class="font-bold text-lg">${labelMy} 정산 내역</h4></div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-sm" style="white-space:nowrap;min-width:400px"><thead><tr class="bg-slate-800/50 text-slate-500 text-[10px] uppercase tracking-wider">
                        <th class="px-3 md:px-6 py-3">날짜</th><th class="px-3 md:px-6 py-3">주대</th><th class="px-3 md:px-6 py-3 hidden sm:table-cell">방 수</th><th class="px-3 md:px-6 py-3">정산금</th>
                    </tr></thead><tbody class="divide-y divide-slate-800">
                        ${mySales.length > 0 ? mySales.map(s => `<tr class="hover:bg-slate-800/30"><td class="px-4 md:px-6 py-4 font-mono text-slate-400">${s.date}</td><td class="px-4 md:px-6 py-4 font-bold text-white">${Format.won(s.total_revenue)}</td><td class="px-4 md:px-6 py-4 text-slate-400 hidden sm:table-cell">${s.rooms || '-'}</td><td class="px-4 md:px-6 py-4 font-bold text-blue-500">${Format.won(s.net_settlement)}</td></tr>`).join('') :
                        `<tr><td colspan="4" class="px-6 py-12 text-center text-slate-500">아직 정산 데이터가 없습니다.<br><button onclick="App.navigate('settlement')" class="mt-3 text-blue-500 font-bold text-sm hover:underline">첫 정산 입력하기</button></td></tr>`}
                    </tbody></table>
                </div>
            </div>

            <div class="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
                <div class="p-4 md:p-6 border-b border-slate-800"><h4 class="font-bold text-lg">${labelMy} 외상 현황</h4></div>
                <div class="p-4 space-y-3">
                    ${myReceivables.filter(r => r.status !== 'paid').length > 0 ? myReceivables.filter(r => r.status !== 'paid').map(r => {
                        const isOverdue = r.due_date && new Date(r.due_date) < new Date();
                        return `<div class="p-3 rounded-lg border ${isOverdue ? 'border-red-300/30 bg-red-300/5' : 'border-slate-700 bg-slate-800/30'}">
                            <div class="flex justify-between items-start mb-1"><span class="font-bold text-sm text-white">${r.customer}</span>
                            <span class="text-xs font-bold ${isOverdue ? 'text-red-300' : r.status === 'partial' ? 'text-amber-300' : 'text-slate-400'}">${isOverdue ? '연체' : r.status === 'partial' ? '부분입금' : '미입금'}</span></div>
                            <div class="flex justify-between text-xs text-slate-400"><span>${Format.won(r.amount)}</span><span class="${isOverdue ? 'text-red-300' : ''}">${r.due_date || '-'}</span></div>
                        </div>`;
                    }).join('') : `<p class="text-center text-slate-500 py-8">미수 외상이 없습니다.</p>`}
                </div>
            </div>
        </div>`;
    }
};

App.register('dashboard', DashboardPage);
