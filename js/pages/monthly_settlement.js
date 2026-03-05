// 월말 정산 페이지
const MonthlySettlementPage = {
    selectedBranch: null,   // branch name
    selectedMonth: null,    // 'YYYY-MM'
    _charts: [],

    _destroyCharts() {
        this._charts.forEach(c => { try { c.destroy(); } catch(e){} });
        this._charts = [];
    },

    async render(container) {
        this._destroyCharts();
        const isAdmin = Auth.isAdmin();

        if (!this.selectedMonth) {
            this.selectedMonth = Format.today().substring(0, 7);
        }

        const branches = await DB.getAll('branches');
        const staff = await DB.getAll('staff');

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

        // 정산 설정 로드
        const settleStartDay = parseInt(await DB.getBranchSetting('monthly_settle_start_day', null) || '11');
        const settleEndDay = parseInt(await DB.getBranchSetting('monthly_settle_end_day', null) || '10');

        // 정산 기간 계산 (예: 전월 11일 ~ 당월 10일)
        const [yr, mo] = this.selectedMonth.split('-').map(Number);
        const prevMo = mo === 1 ? 12 : mo - 1;
        const prevYr = mo === 1 ? yr - 1 : yr;
        const periodFrom = `${prevYr}-${String(prevMo).padStart(2, '0')}-${String(settleStartDay).padStart(2, '0')}`;
        const periodTo = `${yr}-${String(mo).padStart(2, '0')}-${String(settleEndDay).padStart(2, '0')}`;

        // 지점 필터 적용
        let branchStaff = staff;
        if (this.selectedBranch) {
            branchStaff = staff.filter(s => s.branch_name === this.selectedBranch);
        }
        const bsIds = branchStaff.map(s => s.id);
        const staffIds = bsIds.length > 0 ? bsIds : null;

        // DB 레벨에서 날짜+지점 필터 (2000건 제한 우회)
        const [periodSales, periodReceivablesRaw] = await Promise.all([
            DB.getFiltered('daily_sales', { from: periodFrom, to: periodTo, staffIds, staffField: 'entered_by', orderField: 'date', orderAsc: true }),
            DB.getFiltered('receivables', { from: periodFrom, to: periodTo, staffIds, staffField: 'staff_id', orderField: 'date', orderAsc: true }),
        ]);
        const recByEntered = staffIds ? await DB.getFiltered('receivables', { from: periodFrom, to: periodTo, staffIds, staffField: 'entered_by', orderField: 'date', orderAsc: true }) : [];
        const allReceivables = periodReceivablesRaw.slice();
        const existRecIds = new Set(allReceivables.map(r => r.id));
        recByEntered.forEach(r => { if (!existRecIds.has(r.id)) allReceivables.push(r); });

        // 영업사장/실장 필터
        const presidents = branchStaff.filter(s => s.role === 'president');
        const managers = branchStaff.filter(s => s.role === 'manager');
        const keyStaff = [...presidents, ...managers];

        // 직원별 매출 집계
        const staffStats = {};
        keyStaff.forEach(s => {
            staffStats[s.id] = {
                staff: s,
                revenue: 0,
                wari: 0,
                cash: 0,
                card: 0,
                credit: 0,
                other: 0,
                days: 0,
                creditUnpaid: 0,
                creditPaid: 0,
            };
        });

        periodSales.forEach(sale => {
            const sid = sale.entered_by;
            if (!staffStats[sid]) return;
            staffStats[sid].revenue += Number(sale.total_revenue) || 0;
            staffStats[sid].wari += Number(sale.total_wari) || 0;
            staffStats[sid].cash += Number(sale.cash_amount) || 0;
            staffStats[sid].card += Number(sale.card_amount) || 0;
            staffStats[sid].credit += Number(sale.credit_amount) || 0;
            staffStats[sid].other += Number(sale.other_amount) || 0;
            staffStats[sid].days += 1;
        });

        // 외상 집계 (getFiltered로 이미 기간+지점 필터됨)
        allReceivables.forEach(r => {
            const sid = r.staff_id || r.entered_by;
            if (!staffStats[sid]) return;
            const unpaid = r.amount - (r.paid_amount || 0);
            if (r.status === 'paid') {
                staffStats[sid].creditPaid += r.amount;
            } else {
                staffStats[sid].creditUnpaid += unpaid;
            }
        });

        const statsArr = Object.values(staffStats).sort((a, b) => b.revenue - a.revenue);
        const totalRevenue = statsArr.reduce((s, x) => s + x.revenue, 0);

        // 월 네비게이션
        const prevMonthDate = new Date(yr, mo - 2, 1);
        const nextMonthDate = new Date(yr, mo, 1);
        const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
        const nextMonthStr = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}`;

        container.innerHTML = `
        <div class="max-w-[1600px] mx-auto p-4 md:p-6 space-y-6">
            <!-- 페이지 헤더 -->
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 class="text-2xl font-bold text-white flex items-center gap-2">
                        <span class="material-symbols-outlined text-yellow-300">calculate</span> 월말 정산
                    </h1>
                    <p class="text-slate-400 text-sm">매월 정산 기준으로 지점별 매출을 정리합니다.</p>
                </div>
                <div class="flex gap-2">
                    ${isAdmin ? `<button id="btn-settle-config" class="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs hover:bg-slate-700 transition-colors text-slate-300">
                        <span class="material-symbols-outlined text-sm">settings</span> 정산 기간 설정
                    </button>` : ''}
                    <button id="btn-export-monthly" class="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs hover:bg-slate-700 transition-colors text-slate-300">
                        <span class="material-symbols-outlined text-sm">download</span> 엑셀
                    </button>
                </div>
            </div>

            <!-- 월 선택 + 지점 필터 -->
            <div class="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <div class="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2">
                    <button id="ms-prev-month" class="p-1 hover:bg-slate-800 rounded-lg transition-colors">
                        <span class="material-symbols-outlined text-slate-400 text-lg">chevron_left</span>
                    </button>
                    <span class="text-white font-bold px-2">${yr}년 ${mo}월 정산</span>
                    <button id="ms-next-month" class="p-1 hover:bg-slate-800 rounded-lg transition-colors">
                        <span class="material-symbols-outlined text-slate-400 text-lg">chevron_right</span>
                    </button>
                </div>
                <div class="flex flex-wrap gap-2 items-center">
                    <span class="text-xs text-slate-500 flex items-center gap-1"><span class="material-symbols-outlined text-sm">store</span>지점</span>
                    <button class="ms-branch-btn px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${!this.selectedBranch ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}" data-branch="">전체</button>
                    ${branchList.map(b => `<button class="ms-branch-btn px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${this.selectedBranch === b.name ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}" data-branch="${b.name}">${b.name}</button>`).join('')}
                </div>
            </div>

            <!-- 정산 기간 표시 -->
            <div class="bg-slate-900/50 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center gap-4 text-sm">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-blue-400 text-base">date_range</span>
                    <span class="text-slate-400">정산 기간:</span>
                    <span class="text-white font-bold">${periodFrom} ~ ${periodTo}</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-yellow-300 text-base">event</span>
                    <span class="text-slate-400">근무일 기준:</span>
                    <span class="text-white font-bold">매월 ${settleStartDay}일 ~ 익월 ${settleEndDay}일</span>
                </div>
            </div>

            <!-- 전체 요약 카드 -->
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div class="bg-slate-900 border border-slate-800 rounded-xl p-4">
                    <div class="flex items-center gap-2 mb-2">
                        <div class="p-1.5 bg-blue-500/10 rounded-lg"><span class="material-symbols-outlined text-blue-400 text-base">payments</span></div>
                        <span class="text-slate-400 text-xs font-semibold">총 매출</span>
                    </div>
                    <div class="text-xl font-black text-white">${Format.won(totalRevenue)}</div>
                    <div class="text-[10px] text-slate-500 mt-1">${periodSales.length}건 정산</div>
                </div>
                <div class="bg-slate-900 border border-slate-800 rounded-xl p-4">
                    <div class="flex items-center gap-2 mb-2">
                        <div class="p-1.5 bg-emerald-500/10 rounded-lg"><span class="material-symbols-outlined text-emerald-400 text-base">account_balance</span></div>
                        <span class="text-slate-400 text-xs font-semibold">현금 수입</span>
                    </div>
                    <div class="text-xl font-black text-emerald-400">${Format.won(statsArr.reduce((s, x) => s + x.cash, 0))}</div>
                </div>
                <div class="bg-slate-900 border border-slate-800 rounded-xl p-4">
                    <div class="flex items-center gap-2 mb-2">
                        <div class="p-1.5 bg-purple-500/10 rounded-lg"><span class="material-symbols-outlined text-purple-400 text-base">credit_card</span></div>
                        <span class="text-slate-400 text-xs font-semibold">카드 수입</span>
                    </div>
                    <div class="text-xl font-black text-purple-400">${Format.won(statsArr.reduce((s, x) => s + x.card, 0))}</div>
                </div>
                <div class="bg-slate-900 border border-slate-800 rounded-xl p-4">
                    <div class="flex items-center gap-2 mb-2">
                        <div class="p-1.5 bg-red-500/10 rounded-lg"><span class="material-symbols-outlined text-red-400 text-base">credit_card_off</span></div>
                        <span class="text-slate-400 text-xs font-semibold">외상 미입금</span>
                    </div>
                    <div class="text-xl font-black text-red-400">${Format.won(statsArr.reduce((s, x) => s + x.creditUnpaid, 0))}</div>
                </div>
            </div>

            <!-- 직원별 매출 비교표 -->
            <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div class="p-4 border-b border-slate-800 flex items-center justify-between">
                    <h3 class="font-bold text-white flex items-center gap-2">
                        <span class="material-symbols-outlined text-yellow-300 text-base">leaderboard</span>
                        영업사장·실장별 매출 비교
                    </h3>
                    <span class="text-xs text-slate-500">${this.selectedBranch || '전체 지점'}</span>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm" style="min-width:800px">
                        <thead>
                            <tr class="bg-slate-800/60 text-[10px] text-slate-500 uppercase tracking-wider">
                                <th class="px-4 py-3 text-left">순위</th>
                                <th class="px-4 py-3 text-left">직책</th>
                                <th class="px-4 py-3 text-left">이름 / 지점</th>
                                <th class="px-4 py-3 text-right">영업일수</th>
                                <th class="px-4 py-3 text-right">총 매출</th>
                                <th class="px-4 py-3 text-right">현금</th>
                                <th class="px-4 py-3 text-right">카드</th>
                                <th class="px-4 py-3 text-right">외상</th>
                                <th class="px-4 py-3 text-right">와리</th>
                                <th class="px-4 py-3 text-right">미입금</th>
                                <th class="px-4 py-3 text-right">비율</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-800">
                            ${statsArr.length > 0 ? statsArr.map((x, i) => {
                                const s = x.staff;
                                const roleLabel = s.role === 'president' ? '영업사장' : '영업실장';
                                const roleColor = s.role === 'president' ? 'text-yellow-300 bg-yellow-400/10' : 'text-blue-300 bg-blue-400/10';
                                const pct = totalRevenue > 0 ? (x.revenue / totalRevenue * 100).toFixed(1) : '0.0';
                                const rankColor = i === 0 ? 'text-yellow-300' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-600' : 'text-slate-500';
                                const rankIcon = i === 0 ? 'emoji_events' : i === 1 ? 'military_tech' : i === 2 ? 'workspace_premium' : 'tag';
                                return `
                                <tr class="hover:bg-slate-800/30 transition-colors">
                                    <td class="px-4 py-3">
                                        <span class="flex items-center gap-1 ${rankColor} font-bold">
                                            <span class="material-symbols-outlined text-sm">${rankIcon}</span>${i + 1}
                                        </span>
                                    </td>
                                    <td class="px-4 py-3">
                                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${roleColor}">${roleLabel}</span>
                                    </td>
                                    <td class="px-4 py-3">
                                        <div class="font-semibold text-white">${s.name}</div>
                                        <div class="text-[10px] text-slate-500">${s.branch_name || '-'}</div>
                                    </td>
                                    <td class="px-4 py-3 text-right text-slate-300">${x.days}일</td>
                                    <td class="px-4 py-3 text-right font-bold text-white">${Format.won(x.revenue)}</td>
                                    <td class="px-4 py-3 text-right text-emerald-400">${Format.won(x.cash)}</td>
                                    <td class="px-4 py-3 text-right text-purple-400">${Format.won(x.card)}</td>
                                    <td class="px-4 py-3 text-right text-amber-300">${Format.won(x.credit)}</td>
                                    <td class="px-4 py-3 text-right text-yellow-300">${Format.won(x.wari)}</td>
                                    <td class="px-4 py-3 text-right">
                                        ${x.creditUnpaid > 0
                                            ? `<span class="font-bold text-red-400 flex items-center justify-end gap-1">
                                                <span class="material-symbols-outlined text-sm">warning</span>${Format.won(x.creditUnpaid)}
                                               </span>`
                                            : `<span class="text-emerald-400 flex items-center justify-end gap-1">
                                                <span class="material-symbols-outlined text-sm">check_circle</span>없음
                                               </span>`
                                        }
                                    </td>
                                    <td class="px-4 py-3 text-right">
                                        <div class="flex items-center justify-end gap-2">
                                            <div class="w-16 bg-slate-800 rounded-full h-1.5">
                                                <div class="bg-blue-500 h-1.5 rounded-full" style="width:${pct}%"></div>
                                            </div>
                                            <span class="text-slate-300 font-mono text-xs">${pct}%</span>
                                        </div>
                                    </td>
                                </tr>`;
                            }).join('') : `<tr><td colspan="11" class="px-4 py-12 text-center text-slate-500">해당 기간 정산 데이터가 없습니다.</td></tr>`}
                        </tbody>
                        ${statsArr.length > 0 ? `
                        <tfoot>
                            <tr class="bg-slate-800/60 border-t-2 border-slate-700 font-bold">
                                <td colspan="4" class="px-4 py-3 text-slate-400">합계</td>
                                <td class="px-4 py-3 text-right text-white">${Format.won(totalRevenue)}</td>
                                <td class="px-4 py-3 text-right text-emerald-400">${Format.won(statsArr.reduce((s,x)=>s+x.cash,0))}</td>
                                <td class="px-4 py-3 text-right text-purple-400">${Format.won(statsArr.reduce((s,x)=>s+x.card,0))}</td>
                                <td class="px-4 py-3 text-right text-amber-300">${Format.won(statsArr.reduce((s,x)=>s+x.credit,0))}</td>
                                <td class="px-4 py-3 text-right text-yellow-300">${Format.won(statsArr.reduce((s,x)=>s+x.wari,0))}</td>
                                <td class="px-4 py-3 text-right text-red-400 font-black">${Format.won(statsArr.reduce((s,x)=>s+x.creditUnpaid,0))}</td>
                                <td class="px-4 py-3 text-right text-white">100%</td>
                            </tr>
                        </tfoot>` : ''}
                    </table>
                </div>
            </div>

            <!-- 외상 현황 상세 -->
            <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div class="p-4 border-b border-slate-800">
                    <h3 class="font-bold text-white flex items-center gap-2">
                        <span class="material-symbols-outlined text-red-400 text-base">credit_card_off</span>
                        외상 입금 현황
                        <span class="text-xs text-slate-500 font-normal">· 빨간색: 미입금, 초록색: 입금완료</span>
                    </h3>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm" style="min-width:600px">
                        <thead>
                            <tr class="bg-slate-800/60 text-[10px] text-slate-500 uppercase tracking-wider">
                                <th class="px-4 py-3 text-left">날짜</th>
                                <th class="px-4 py-3 text-left">손님</th>
                                <th class="px-4 py-3 text-left">담당</th>
                                <th class="px-4 py-3 text-right">외상금액</th>
                                <th class="px-4 py-3 text-right">입금액</th>
                                <th class="px-4 py-3 text-right">잔액</th>
                                <th class="px-4 py-3 text-center">상태</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-800">
                            ${allReceivables.length > 0 ? allReceivables.sort((a, b) => b.date.localeCompare(a.date)).map(r => {
                                const isPaid = r.status === 'paid';
                                const isPartial = r.status === 'partial';
                                const unpaid = r.amount - (r.paid_amount || 0);
                                const responsible = branchStaff.find(s => s.id === (r.staff_id || r.entered_by));
                                const statusLabel = isPaid ? '입금완료' : isPartial ? '부분입금' : '미입금';
                                const statusClass = isPaid ? 'text-emerald-400 bg-emerald-500/10' : isPartial ? 'text-amber-300 bg-amber-300/10' : 'text-red-400 bg-red-400/10';
                                const rowClass = isPaid ? '' : 'bg-red-950/10';
                                return `
                                <tr class="hover:bg-slate-800/30 transition-colors ${rowClass}">
                                    <td class="px-4 py-3 text-slate-400 font-mono text-xs">${r.date}</td>
                                    <td class="px-4 py-3 text-white font-medium">${r.customer || '-'}</td>
                                    <td class="px-4 py-3 text-slate-400 text-xs">${responsible ? responsible.name : '-'}</td>
                                    <td class="px-4 py-3 text-right font-mono text-white">${Format.won(r.amount)}</td>
                                    <td class="px-4 py-3 text-right font-mono text-emerald-400">${Format.won(r.paid_amount || 0)}</td>
                                    <td class="px-4 py-3 text-right font-mono font-bold ${isPaid ? 'text-emerald-400' : 'text-red-400'}">${Format.won(unpaid)}</td>
                                    <td class="px-4 py-3 text-center">
                                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${statusClass}">${statusLabel}</span>
                                    </td>
                                </tr>`;
                            }).join('') : `<tr><td colspan="7" class="px-4 py-10 text-center text-slate-500">해당 기간 외상 내역이 없습니다.</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- 차트 섹션 -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="bg-slate-900 border border-slate-800 rounded-xl p-4">
                    <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">직원별 매출 비교</h4>
                    <div class="h-56"><canvas id="chart-ms-staff"></canvas></div>
                </div>
                <div class="bg-slate-900 border border-slate-800 rounded-xl p-4">
                    <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">결제 수단별 비율</h4>
                    <div class="h-56"><canvas id="chart-ms-payment"></canvas></div>
                </div>
            </div>
        </div>`;

        this._bindEvents(container, branchList, prevMonthStr, nextMonthStr, isAdmin, settleStartDay, settleEndDay);
        this._renderCharts(statsArr, totalRevenue);
    },

    _renderCharts(statsArr, totalRevenue) {
        if (typeof Chart === 'undefined') return;
        if (typeof ChartDataLabels !== 'undefined') Chart.register(ChartDataLabels);
        const gridColor = 'rgba(148,163,184,0.1)';
        const tickColor = '#64748b';

        // 직원별 매출 바 차트
        const ctx1 = document.getElementById('chart-ms-staff');
        if (ctx1 && statsArr.length > 0) {
            this._charts.push(new Chart(ctx1, {
                type: 'bar',
                data: {
                    labels: statsArr.map(x => x.staff.name),
                    datasets: [{
                        label: '매출',
                        data: statsArr.map(x => x.revenue),
                        backgroundColor: statsArr.map((_, i) => ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ec4899','#06b6d4'][i % 6]),
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

        // 결제 수단별 도넛 차트
        const ctx2 = document.getElementById('chart-ms-payment');
        if (ctx2 && statsArr.length > 0) {
            const cashTotal = statsArr.reduce((s, x) => s + x.cash, 0);
            const cardTotal = statsArr.reduce((s, x) => s + x.card, 0);
            const creditTotal = statsArr.reduce((s, x) => s + x.credit, 0);
            const otherTotal = statsArr.reduce((s, x) => s + x.other, 0);
            this._charts.push(new Chart(ctx2, {
                type: 'doughnut',
                data: {
                    labels: ['현금', '카드', '외상', '기타'],
                    datasets: [{
                        data: [cashTotal, cardTotal, creditTotal, otherTotal],
                        backgroundColor: ['#10b981', '#8b5cf6', '#ef4444', '#64748b'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 12 } },
                        datalabels: {
                            color: '#fff', font: { size: 10, weight: 'bold' },
                            formatter: (v, c) => {
                                const total = c.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = total > 0 ? Math.round(v / total * 100) : 0;
                                return pct >= 5 ? pct + '%' : '';
                            }
                        }
                    },
                    cutout: '55%'
                }
            }));
        }
    },

    _bindEvents(container, branchList, prevMonthStr, nextMonthStr, isAdmin, settleStartDay, settleEndDay) {
        document.getElementById('ms-prev-month')?.addEventListener('click', () => {
            this.selectedMonth = prevMonthStr;
            App.renderPage('monthly_settlement');
        });
        document.getElementById('ms-next-month')?.addEventListener('click', () => {
            this.selectedMonth = nextMonthStr;
            App.renderPage('monthly_settlement');
        });

        container.querySelectorAll('.ms-branch-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.selectedBranch = btn.dataset.branch || null;
                App.renderPage('monthly_settlement');
            });
        });

        // 정산 기간 설정 (관리자)
        const configBtn = document.getElementById('btn-settle-config');
        if (configBtn) {
            configBtn.addEventListener('click', () => {
                App.showModal('정산 기간 설정', `
                    <div class="space-y-4">
                        <div class="bg-slate-800/50 rounded-lg p-3 text-xs text-slate-400">
                            <span class="material-symbols-outlined text-sm align-middle text-blue-400">info</span>
                            매월 정산 기준일을 설정합니다. 예: 전월 11일 ~ 당월 10일
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div class="space-y-1.5">
                                <label class="text-xs font-medium text-slate-400">정산 시작일 (매월)</label>
                                <div class="flex items-center gap-2">
                                    <input id="settle-start" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" type="number" min="1" max="31" value="${settleStartDay}"/>
                                    <span class="text-slate-400 text-sm">일</span>
                                </div>
                            </div>
                            <div class="space-y-1.5">
                                <label class="text-xs font-medium text-slate-400">정산 종료일 (익월)</label>
                                <div class="flex items-center gap-2">
                                    <input id="settle-end" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" type="number" min="1" max="31" value="${settleEndDay}"/>
                                    <span class="text-slate-400 text-sm">일</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `, async () => {
                    const start = parseInt(document.getElementById('settle-start').value) || 11;
                    const end = parseInt(document.getElementById('settle-end').value) || 10;
                    await DB.saveBranchSetting('monthly_settle_start_day', String(start), null);
                    await DB.saveBranchSetting('monthly_settle_end_day', String(end), null);
                    App.toast('정산 기간이 설정되었습니다.', 'success');
                    App.renderPage('monthly_settlement');
                });
            });
        }

        // 엑셀 내보내기
        document.getElementById('btn-export-monthly')?.addEventListener('click', () => {
            App.toast('엑셀 내보내기 기능은 준비 중입니다.', 'info');
        });
    }
};

App.register('monthly_settlement', MonthlySettlementPage);
