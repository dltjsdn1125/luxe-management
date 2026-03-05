// 지점별 매출 순위 페이지
const SalesRankingPage = {
    selectedBranch: null,
    periodType: 'month',
    customFrom: null,
    customTo: null,
    _charts: [],

    _destroyCharts() {
        this._charts.forEach(c => { try { c.destroy(); } catch(e){} });
        this._charts = [];
    },

    async render(container) {
        this._destroyCharts();
        const isAdmin = Auth.isAdmin();

        const branches = await DB.getAll('branches');
        const staff = await DB.getAll('staff');
        const allSales = await DB.getAll('daily_sales');
        const allRooms = await DB.getAll('daily_sale_rooms');

        // 지점 목록 구성
        const branchMap = new Map();
        branches.forEach(b => branchMap.set(b.name, b));
        staff.forEach(s => {
            if (s.branch_name && !branchMap.has(s.branch_name)) {
                branchMap.set(s.branch_name, { id: 'v_' + s.branch_name, name: s.branch_name });
            }
        });
        const branchList = [...branchMap.values()];

        if (!this.selectedBranch && branchList.length > 0) {
            this.selectedBranch = branchList[0].name;
        }

        // 기간 필터
        const range = PeriodFilter.getRange(this.periodType, this.customFrom, this.customTo);
        const periodSales = PeriodFilter.filterByDate(allSales, 'date', range.from, range.to);

        // 지점 필터
        let branchStaff = staff;
        if (this.selectedBranch) {
            branchStaff = staff.filter(s => s.branch_name === this.selectedBranch);
        }
        const bsIds = branchStaff.map(s => s.id);
        const filteredSales = periodSales.filter(s => bsIds.includes(s.entered_by));

        // 직원별 매출 집계
        const staffStats = {};
        branchStaff.forEach(s => {
            staffStats[s.id] = {
                staff: s,
                revenue: 0,
                wari: 0,
                days: 0,
                roomCount: 0,
                maxSingleDay: 0,
                topRoomRevenue: 0,
            };
        });

        filteredSales.forEach(sale => {
            const sid = sale.entered_by;
            if (!staffStats[sid]) return;
            const rev = Number(sale.total_revenue) || 0;
            staffStats[sid].revenue += rev;
            staffStats[sid].wari += Number(sale.total_wari) || 0;
            staffStats[sid].days += 1;
            if (rev > staffStats[sid].maxSingleDay) staffStats[sid].maxSingleDay = rev;
        });

        // 룸별 최고 매출 집계
        const filteredSaleIds = new Set(filteredSales.map(s => s.id));
        allRooms.filter(r => filteredSaleIds.has(r.daily_sales_id)).forEach(room => {
            const sale = filteredSales.find(s => s.id === room.daily_sales_id);
            if (!sale) return;
            const sid = sale.entered_by;
            if (!staffStats[sid]) return;
            const roomRev = Number(room.room_revenue) || 0;
            if (roomRev > staffStats[sid].topRoomRevenue) staffStats[sid].topRoomRevenue = roomRev;
            staffStats[sid].roomCount += 1;
        });

        const statsArr = Object.values(staffStats).sort((a, b) => b.revenue - a.revenue);
        const totalRevenue = statsArr.reduce((s, x) => s + x.revenue, 0);

        // 지점별 매출 집계 (전체 뷰용)
        const branchStats = {};
        branchList.forEach(b => {
            const bStaff = staff.filter(s => s.branch_name === b.name);
            const bIds = bStaff.map(s => s.id);
            const bSales = filteredSales.filter(s => bIds.includes(s.entered_by));
            branchStats[b.name] = {
                name: b.name,
                revenue: bSales.reduce((s, r) => s + (Number(r.total_revenue) || 0), 0),
                days: bSales.length,
                staffCount: bStaff.length,
            };
        });
        const branchStatsArr = Object.values(branchStats).sort((a, b) => b.revenue - a.revenue);

        container.innerHTML = `
        <div class="max-w-[1600px] mx-auto p-4 md:p-6 space-y-6">
            <!-- 헤더 -->
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 class="text-2xl font-bold text-white flex items-center gap-2">
                        <span class="material-symbols-outlined text-yellow-300">emoji_events</span> 매출 순위
                    </h1>
                    <p class="text-slate-400 text-sm">지점 내 영업사장·실장별 매출 순위와 고가 룸 현황을 확인합니다.</p>
                </div>
            </div>

            <!-- 기간 필터 -->
            <div class="bg-slate-900/50 border border-slate-800 rounded-xl p-3">
                ${PeriodFilter.renderUI(this.periodType, this.customFrom, this.customTo, 'sr')}
            </div>

            <!-- 지점 필터 -->
            <div class="flex flex-wrap gap-2 items-center">
                <span class="text-xs text-slate-500 flex items-center gap-1"><span class="material-symbols-outlined text-sm">store</span>지점</span>
                <button class="sr-branch-btn px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${!this.selectedBranch ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}" data-branch="">전체</button>
                ${branchList.map(b => `<button class="sr-branch-btn px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${this.selectedBranch === b.name ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}" data-branch="${b.name}">${b.name}</button>`).join('')}
            </div>

            <!-- 지점별 매출 순위 (전체 선택 시) -->
            ${!this.selectedBranch ? `
            <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div class="p-4 border-b border-slate-800">
                    <h3 class="font-bold text-white flex items-center gap-2">
                        <span class="material-symbols-outlined text-blue-400 text-base">store</span>
                        지점별 매출 순위
                    </h3>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm" style="min-width:500px">
                        <thead>
                            <tr class="bg-slate-800/60 text-[10px] text-slate-500 uppercase tracking-wider">
                                <th class="px-4 py-3 text-left">순위</th>
                                <th class="px-4 py-3 text-left">지점명</th>
                                <th class="px-4 py-3 text-right">영업일수</th>
                                <th class="px-4 py-3 text-right">총 매출</th>
                                <th class="px-4 py-3 text-right">비율</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-800">
                            ${branchStatsArr.map((b, i) => {
                                const pct = totalRevenue > 0 ? (b.revenue / totalRevenue * 100).toFixed(1) : '0.0';
                                const rankColor = i === 0 ? 'text-yellow-300' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-600' : 'text-slate-500';
                                const rankIcon = i === 0 ? 'emoji_events' : i === 1 ? 'military_tech' : i === 2 ? 'workspace_premium' : 'tag';
                                return `
                                <tr class="hover:bg-slate-800/30 transition-colors">
                                    <td class="px-4 py-3 ${rankColor} font-bold">
                                        <span class="flex items-center gap-1">
                                            <span class="material-symbols-outlined text-sm">${rankIcon}</span>${i + 1}
                                        </span>
                                    </td>
                                    <td class="px-4 py-3 font-semibold text-white">${b.name}</td>
                                    <td class="px-4 py-3 text-right text-slate-400">${b.days}일</td>
                                    <td class="px-4 py-3 text-right font-bold text-white">${Format.won(b.revenue)}</td>
                                    <td class="px-4 py-3 text-right">
                                        <div class="flex items-center justify-end gap-2">
                                            <div class="w-20 bg-slate-800 rounded-full h-1.5">
                                                <div class="bg-blue-500 h-1.5 rounded-full" style="width:${pct}%"></div>
                                            </div>
                                            <span class="text-slate-300 font-mono text-xs">${pct}%</span>
                                        </div>
                                    </td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>` : ''}

            <!-- 영업사장/실장 매출 순위 -->
            <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div class="p-4 border-b border-slate-800 flex items-center justify-between">
                    <h3 class="font-bold text-white flex items-center gap-2">
                        <span class="material-symbols-outlined text-yellow-300 text-base">leaderboard</span>
                        ${this.selectedBranch ? this.selectedBranch + ' · ' : ''}직원별 매출 순위
                    </h3>
                    <span class="text-xs text-slate-500">총 ${statsArr.length}명</span>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm" style="min-width:700px">
                        <thead>
                            <tr class="bg-slate-800/60 text-[10px] text-slate-500 uppercase tracking-wider">
                                <th class="px-4 py-3 text-left">순위</th>
                                <th class="px-4 py-3 text-left">직책</th>
                                <th class="px-4 py-3 text-left">이름</th>
                                <th class="px-4 py-3 text-left">지점</th>
                                <th class="px-4 py-3 text-right">영업일수</th>
                                <th class="px-4 py-3 text-right">총 매출</th>
                                <th class="px-4 py-3 text-right">일 최고 매출</th>
                                <th class="px-4 py-3 text-right">최고가 룸</th>
                                <th class="px-4 py-3 text-right">와리</th>
                                <th class="px-4 py-3 text-right">비율</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-800">
                            ${statsArr.length > 0 ? statsArr.map((x, i) => {
                                const s = x.staff;
                                const roleLabel = s.role === 'president' ? '영업사장' : s.role === 'manager' ? '영업실장' : s.role === 'staff' ? '스탭' : '기타';
                                const roleColor = s.role === 'president' ? 'text-yellow-300 bg-yellow-400/10' : s.role === 'manager' ? 'text-blue-300 bg-blue-400/10' : 'text-slate-300 bg-slate-700';
                                const pct = totalRevenue > 0 ? (x.revenue / totalRevenue * 100).toFixed(1) : '0.0';
                                const rankColor = i === 0 ? 'text-yellow-300' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-600' : 'text-slate-500';
                                const rankIcon = i === 0 ? 'emoji_events' : i === 1 ? 'military_tech' : i === 2 ? 'workspace_premium' : 'tag';
                                const avgRevenue = x.days > 0 ? Math.round(x.revenue / x.days) : 0;
                                return `
                                <tr class="hover:bg-slate-800/30 transition-colors ${i === 0 ? 'bg-yellow-400/5' : ''}">
                                    <td class="px-4 py-3">
                                        <span class="flex items-center gap-1 ${rankColor} font-bold text-sm">
                                            <span class="material-symbols-outlined text-base">${rankIcon}</span>${i + 1}
                                        </span>
                                    </td>
                                    <td class="px-4 py-3">
                                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${roleColor}">${roleLabel}</span>
                                    </td>
                                    <td class="px-4 py-3 font-bold text-white">${s.name}</td>
                                    <td class="px-4 py-3 text-slate-400 text-xs">${s.branch_name || '-'}</td>
                                    <td class="px-4 py-3 text-right text-slate-300">${x.days}일</td>
                                    <td class="px-4 py-3 text-right font-bold text-white">${Format.won(x.revenue)}</td>
                                    <td class="px-4 py-3 text-right text-blue-400">${Format.won(x.maxSingleDay)}</td>
                                    <td class="px-4 py-3 text-right text-purple-400">${Format.won(x.topRoomRevenue)}</td>
                                    <td class="px-4 py-3 text-right text-yellow-300">${Format.won(x.wari)}</td>
                                    <td class="px-4 py-3 text-right">
                                        <div class="flex items-center justify-end gap-2">
                                            <div class="w-16 bg-slate-800 rounded-full h-1.5">
                                                <div class="bg-blue-500 h-1.5 rounded-full" style="width:${pct}%"></div>
                                            </div>
                                            <span class="text-slate-300 font-mono text-xs">${pct}%</span>
                                        </div>
                                    </td>
                                </tr>`;
                            }).join('') : `<tr><td colspan="10" class="px-4 py-12 text-center text-slate-500">해당 기간 데이터가 없습니다.</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- TOP 3 하이라이트 -->
            ${statsArr.length >= 1 ? `
            <div class="space-y-2">
                <h3 class="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <span class="material-symbols-outlined text-yellow-300 text-base">stars</span> TOP 3 하이라이트
                </h3>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    ${statsArr.slice(0, 3).map((x, i) => {
                        const medals = ['🥇', '🥈', '🥉'];
                        const borderColors = ['border-yellow-400/50 bg-yellow-400/5', 'border-slate-400/50 bg-slate-400/5', 'border-amber-700/50 bg-amber-700/5'];
                        const s = x.staff;
                        const roleLabel = s.role === 'president' ? '영업사장' : s.role === 'manager' ? '영업실장' : s.role === 'staff' ? '스탭' : '기타';
                        return `
                        <div class="bg-slate-900 border ${borderColors[i]} rounded-2xl p-5 text-center">
                            <div class="text-4xl mb-2">${medals[i]}</div>
                            <div class="text-xs text-slate-500 mb-1">${roleLabel}</div>
                            <div class="text-xl font-black text-white mb-1">${s.name}</div>
                            <div class="text-xs text-slate-500 mb-3">${s.branch_name || '-'}</div>
                            <div class="text-2xl font-black text-blue-400">${Format.won(x.revenue)}</div>
                            <div class="text-xs text-slate-500 mt-1">${x.days}일 영업</div>
                            ${x.topRoomRevenue > 0 ? `<div class="mt-2 text-xs text-purple-400">최고가 룸: ${Format.won(x.topRoomRevenue)}</div>` : ''}
                        </div>`;
                    }).join('')}
                </div>
            </div>` : ''}

            <!-- 차트 -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="bg-slate-900 border border-slate-800 rounded-xl p-4">
                    <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">직원별 매출 비교</h4>
                    <div class="h-64"><canvas id="chart-sr-staff"></canvas></div>
                </div>
                <div class="bg-slate-900 border border-slate-800 rounded-xl p-4">
                    <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">지점별 매출 현황</h4>
                    <div class="h-64"><canvas id="chart-sr-branch"></canvas></div>
                </div>
            </div>
        </div>`;

        this._bindEvents(container, branchList);
        this._renderCharts(statsArr, branchStatsArr);
    },

    _renderCharts(statsArr, branchStatsArr) {
        if (typeof Chart === 'undefined') return;
        if (typeof ChartDataLabels !== 'undefined') Chart.register(ChartDataLabels);
        const gridColor = 'rgba(148,163,184,0.1)';
        const tickColor = '#64748b';
        const chartColors = ['#FCD34D', '#94a3b8', '#b45309', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899'];

        // 직원별 매출 가로 바
        const ctx1 = document.getElementById('chart-sr-staff');
        if (ctx1 && statsArr.length > 0) {
            this._charts.push(new Chart(ctx1, {
                type: 'bar',
                data: {
                    labels: statsArr.map(x => x.staff.name),
                    datasets: [{
                        label: '총 매출',
                        data: statsArr.map(x => x.revenue),
                        backgroundColor: statsArr.map((_, i) => chartColors[i % chartColors.length]),
                        borderRadius: 6,
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        datalabels: { color: '#fff', font: { size: 9, weight: 'bold' }, formatter: v => v > 0 ? (v / 10000).toFixed(0) + '만' : '', anchor: 'end', align: 'end', offset: -2 }
                    },
                    scales: {
                        x: { grid: { color: gridColor }, ticks: { color: tickColor, callback: v => (v / 10000).toFixed(0) + '만' } },
                        y: { grid: { display: false }, ticks: { color: tickColor, font: { size: 10 } } }
                    }
                }
            }));
        }

        // 지점별 매출 바
        const ctx2 = document.getElementById('chart-sr-branch');
        if (ctx2 && branchStatsArr.length > 0) {
            this._charts.push(new Chart(ctx2, {
                type: 'bar',
                data: {
                    labels: branchStatsArr.map(b => b.name),
                    datasets: [{
                        label: '매출',
                        data: branchStatsArr.map(b => b.revenue),
                        backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'],
                        borderRadius: 6,
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        datalabels: { color: '#fff', font: { size: 9, weight: 'bold' }, formatter: v => v > 0 ? (v / 10000).toFixed(0) + '만' : '', anchor: 'end', align: 'end', offset: -2 }
                    },
                    scales: {
                        x: { grid: { display: false }, ticks: { color: tickColor, font: { size: 10 } } },
                        y: { grid: { color: gridColor }, ticks: { color: tickColor, callback: v => (v / 10000).toFixed(0) + '만' } }
                    }
                }
            }));
        }
    },

    _bindEvents(container, branchList) {
        container.querySelectorAll('.sr-branch-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.selectedBranch = btn.dataset.branch || null;
                App.renderPage('sales_ranking');
            });
        });

        PeriodFilter.bindEvents(container, 'sr', (type, from, to) => {
            this.periodType = type;
            this.customFrom = from;
            this.customTo = to;
            App.renderPage('sales_ranking');
        });
    }
};

App.register('sales_ranking', SalesRankingPage);
