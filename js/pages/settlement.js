// 일일 영업 정산 페이지 (룸 단위 정산)
// 장부form/통합문서1-structure.json 또는 아래 기본 구조로 지점별 테이블 렌더링
const SETTLEMENT_TABLE_DEFAULT = {
    branchDailySettlement: {
        headerRowCount: 1,
        headerCells: [
            { label: '지점 / 직원', colSpan: 1, rowSpan: 1 },
            { label: '총 매출', colSpan: 1, rowSpan: 1 },
            { label: '와리', colSpan: 1, rowSpan: 1 },
            { label: '아가씨', colSpan: 1, rowSpan: 1 },
            { label: '지출', colSpan: 1, rowSpan: 1 },
            { label: '순이익', colSpan: 1, rowSpan: 1 },
            { label: '이익률', colSpan: 1, rowSpan: 1 },
            { label: '정산금', colSpan: 1, rowSpan: 1 },
            { label: '비중', colSpan: 1, rowSpan: 1 }
        ],
        columns: [
            { key: 'branch', label: '지점 / 직원', align: 'left' },
            { key: 'revenue', label: '총 매출', align: 'right' },
            { key: 'wari', label: '와리', align: 'right' },
            { key: 'girlPay', label: '아가씨', align: 'right' },
            { key: 'expenses', label: '지출', align: 'right' },
            { key: 'netProfit', label: '순이익', align: 'right' },
            { key: 'margin', label: '이익률', align: 'right' },
            { key: 'settlement', label: '정산금', align: 'right' },
            { key: 'share', label: '비중', align: 'right' }
        ]
    }
};

const SettlementPage = {
    mode: 'list',
    editId: null,
    filterBranch: null,
    periodType: 'today',
    customFrom: null,
    customTo: null,
    roomCounter: 0,
    page: 1,
    pageSize: 50,
    _tableStructure: null,

    async _getTableStructure() {
        if (this._tableStructure) return this._tableStructure;
        try {
            const url = new URL('data/settlement-structure.json', window.location.href).href;
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 3000);
            const r = await fetch(url, { signal: ctrl.signal });
            clearTimeout(t);
            if (r.ok) {
                const j = await r.json();
                if (j && j.branchDailySettlement) {
                    this._tableStructure = j;
                    return this._tableStructure;
                }
            }
        } catch (e) { /* 404, CORS, timeout 등 → 기본 구조 사용 */ }
        this._tableStructure = SETTLEMENT_TABLE_DEFAULT;
        return this._tableStructure;
    },

    _renderBranchTableHeader(cfg) {
        const cells = (cfg && cfg.headerCells) || SETTLEMENT_TABLE_DEFAULT.branchDailySettlement.headerCells;
        return cells.map(h =>
            `<th class="px-4 py-3 ${h.label === '지점 / 직원' || h.label.indexOf('지점') >= 0 ? 'text-left' : 'text-right'} text-[10px] text-slate-500 uppercase tracking-wider" ${h.colSpan > 1 ? `colspan="${h.colSpan}"` : ''} ${h.rowSpan > 1 ? `rowspan="${h.rowSpan}"` : ''}>${h.label}</th>`
        ).join('');
    },

    _renderBranchDataRow(cellsByKey, columns, rowClass, cellClass = 'px-4 py-3.5') {
        const cols = (columns && columns.length) ? columns : SETTLEMENT_TABLE_DEFAULT.branchDailySettlement.columns;
        return cols.map(col => {
            const val = cellsByKey[col.key];
            const align = col.align === 'left' ? 'text-left' : 'text-right';
            return `<td class="${cellClass} ${align} ${typeof val === 'string' && val.indexOf('text-') >= 0 ? '' : ''}">${val != null ? val : ''}</td>`;
        }).join('');
    },

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

    /** 빈 time input의 data-empty 동기화 (--:-- placeholder 숨김용) */
    _syncTimeInputEmptyState(input) {
        if (input && input.type === 'time') {
            input.dataset.empty = input.value ? 'false' : 'true';
        }
    },
    _syncAllTimeInputs(root) {
        (root || document).querySelectorAll('#settlement-form-root input[type="time"]').forEach(inp => this._syncTimeInputEmptyState(inp));
    },

    /** time 0~6 슬롯의 HH:MM 입력 → T 합산 (1시간=1, 30분=0.5) */
    _calcTimesFromSlots(times) {
        const vals = times.filter(Boolean).map(t => {
            const [h, m] = t.split(':').map(Number);
            return (h || 0) * 60 + (m || 0); // 분 단위
        });
        if (vals.length === 0) return 0;
        if (vals.length === 1) return 1; // 1개 입력 = 1시간
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        const diffMin = max - min;
        const hours = Math.floor(diffMin / 60) + (diffMin % 60) / 60; // 1h=1, 30m=0.5
        return Math.round(hours * 10) / 10; // 0.5 단위
    },

    async getSettlements() {
        const range = PeriodFilter.getRange(this.periodType, this.customFrom, this.customTo);
        const allStaff = await DB.getAll('staff');
        let staffIds = null;

        if (!Auth.isAdmin()) {
            const staffId = await Auth.getStaffId();
            const myStaff = allStaff.find(s => s.id === staffId);
            staffIds = myStaff?.branch_name
                ? allStaff.filter(s => s.branch_name === myStaff.branch_name).map(s => s.id)
                : [staffId];
        } else if (this.filterBranch) {
            staffIds = allStaff.filter(s => s.branch_name === this.filterBranch).map(s => s.id);
        }

        const settlements = await DB.getFiltered('daily_sales', {
            dateField: 'date', from: range.from, to: range.to,
            staffIds, staffField: 'entered_by',
            orderField: 'date', orderAsc: false,
        });
        return settlements;
    },

    async render(container) {
        if (this.mode === 'form') await this.renderForm(container);
        else if (this.mode === 'view') await this.renderView(container);
        else await this.renderList(container);
    },

    async renderList(container) {
        const allSettlements = await this.getSettlements();
        const staff = await DB.getAll('staff');
        const isAdmin = Auth.isAdmin();
        const branchNames = [...new Set(staff.map(s => s.branch_name).filter(Boolean))].sort();

        const totalSet = allSettlements.length;
        const totalPages = Math.max(1, Math.ceil(totalSet / this.pageSize));
        const settlements = allSettlements.slice((this.page - 1) * this.pageSize, this.page * this.pageSize);

        // ── 전체 합계 (현재 페이지) ──
        const sumRevenue   = settlements.reduce((s, r) => s + (Number(r.total_revenue)    || 0), 0);
        const sumWari      = settlements.reduce((s, r) => s + (Number(r.total_wari)       || 0), 0);
        const sumGirlPay   = settlements.reduce((s, r) => s + (Number(r.total_girl_pay)   || 0), 0);
        const sumExpenses  = settlements.reduce((s, r) => s + (Number(r.total_expenses)   || 0), 0);
        const sumDeductions = sumWari + sumGirlPay + sumExpenses;
        const sumNetProfit = sumRevenue - sumDeductions;
        const sumSettlement = settlements.reduce((s, r) => s + (Number(r.net_settlement)  || 0), 0);

        // ── 지점별 집계 ──
        // branch_name 기준으로 그룹핑 (직원의 branch_name → 지점명)
        const branchGroupMap = {};   // branchName → { revenue, wari, girlPay, expenses, settlement, count, staffMap }
        settlements.forEach(sale => {
            const s = staff.find(x => x.id === sale.entered_by);
            const bn = (s && s.branch_name) ? s.branch_name : (s ? s.name : '기타');
            if (!branchGroupMap[bn]) {
                branchGroupMap[bn] = { revenue: 0, wari: 0, girlPay: 0, expenses: 0, settlement: 0, count: 0, staffMap: {} };
            }
            const bg = branchGroupMap[bn];
            bg.revenue    += Number(sale.total_revenue)   || 0;
            bg.wari       += Number(sale.total_wari)      || 0;
            bg.girlPay    += Number(sale.total_girl_pay)  || 0;
            bg.expenses   += Number(sale.total_expenses)  || 0;
            bg.settlement += Number(sale.net_settlement)  || 0;
            bg.count      += 1;
            // 직원별 소계
            const sid = sale.entered_by || 'unknown';
            if (!bg.staffMap[sid]) bg.staffMap[sid] = { revenue: 0, wari: 0, girlPay: 0, expenses: 0, settlement: 0, count: 0, sales: [] };
            const sm = bg.staffMap[sid];
            sm.revenue    += Number(sale.total_revenue)   || 0;
            sm.wari       += Number(sale.total_wari)      || 0;
            sm.girlPay    += Number(sale.total_girl_pay)  || 0;
            sm.expenses   += Number(sale.total_expenses)  || 0;
            sm.settlement += Number(sale.net_settlement)  || 0;
            sm.count      += 1;
            sm.sales.push(sale);
        });

        const branchEntries = Object.entries(branchGroupMap).sort((a, b) => b[1].revenue - a[1].revenue);

        const structure = await this._getTableStructure();
        const tableCfg = structure.branchDailySettlement || SETTLEMENT_TABLE_DEFAULT.branchDailySettlement;
        const columns = tableCfg.columns || SETTLEMENT_TABLE_DEFAULT.branchDailySettlement.columns;

        // ── 지점별 아코디언 HTML 생성 (통합문서1-structure.json 컬럼/헤더 구조 적용) ──
        const buildBranchRows = (branchName, bg) => {
            const netP = bg.revenue - bg.wari - bg.girlPay - bg.expenses;
            const margin = bg.revenue > 0 ? Math.round(netP / bg.revenue * 100) : 0;
            const share = sumRevenue > 0 ? (bg.revenue / sumRevenue * 100).toFixed(1) : '0.0';
            const branchId = 'branch_' + branchName.replace(/\s/g, '_');

            const branchCells = {
                branch: `<div class="flex items-center gap-3">
                    <span class="material-symbols-outlined text-slate-500 text-base branch-chevron transition-transform" data-chevron="${branchId}">chevron_right</span>
                    <div class="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
                        <span class="material-symbols-outlined text-blue-400 text-sm">store</span>
                    </div>
                    <div>
                        <span class="font-bold text-white text-sm">${branchName}</span>
                        <span class="text-[10px] text-slate-500 ml-2">${bg.count}건 · ${Object.keys(bg.staffMap).length}명</span>
                    </div>
                </div>`,
                revenue: `<span class="font-bold text-white">${Format.won(bg.revenue)}</span>`,
                wari: `<span class="font-mono text-yellow-300 text-xs">${Format.won(bg.wari)}</span>`,
                girlPay: `<span class="font-mono text-pink-400 text-xs">${Format.won(bg.girlPay)}</span>`,
                expenses: `<span class="font-mono text-slate-400 text-xs">${Format.won(bg.expenses)}</span>`,
                netProfit: `<span class="font-bold ${netP >= 0 ? 'text-emerald-400' : 'text-red-300'}">${Format.won(netP)}</span>`,
                margin: `<span class="font-mono text-xs ${margin >= 0 ? 'text-emerald-400' : 'text-red-300'}">${margin}%</span>`,
                settlement: `<span class="font-mono text-blue-400">${Format.won(bg.settlement)}</span>`,
                share: `<div class="flex items-center justify-end gap-2">
                    <div class="w-14 bg-slate-800 rounded-full h-1.5">
                        <div class="bg-blue-500 h-1.5 rounded-full" style="width:${share}%"></div>
                    </div>
                    <span class="text-[10px] text-slate-400 font-mono">${share}%</span>
                </div>`
            };

            const staffRows = Object.entries(bg.staffMap).map(([sid, sm]) => {
                const sv = staff.find(x => x.id === sid);
                const roleLabel = sv ? (sv.role === 'president' ? '영업사장' : sv.role === 'manager' ? '영업실장' : '스탭') : '';
                const roleColor = sv ? (sv.role === 'president' ? 'text-yellow-300' : sv.role === 'manager' ? 'text-blue-300' : 'text-slate-400') : 'text-slate-400';
                const smNet = sm.revenue - sm.wari - sm.girlPay - sm.expenses;
                const smMargin = sm.revenue > 0 ? Math.round(smNet / sm.revenue * 100) : 0;
                const staffCells = {
                    branch: `<div class="flex items-center gap-2">
                        <span class="material-symbols-outlined text-slate-600 text-sm">subdirectory_arrow_right</span>
                        <span class="${roleColor} text-[10px] font-bold">${roleLabel}</span>
                        <span class="text-slate-300 text-xs font-semibold">${sv ? sv.name : '알 수 없음'}</span>
                        <span class="text-slate-600 text-[10px]">${sm.count}건</span>
                    </div>`,
                    revenue: `<span class="font-mono text-slate-200 text-xs">${Format.won(sm.revenue)}</span>`,
                    wari: `<span class="font-mono text-yellow-300/70 text-xs">${Format.won(sm.wari)}</span>`,
                    girlPay: `<span class="font-mono text-pink-400/70 text-xs">${Format.won(sm.girlPay)}</span>`,
                    expenses: `<span class="font-mono text-slate-500 text-xs">${Format.won(sm.expenses)}</span>`,
                    netProfit: `<span class="font-mono text-xs ${smNet >= 0 ? 'text-emerald-400/70' : 'text-red-400/70'}">${Format.won(smNet)}</span>`,
                    margin: `<span class="font-mono text-xs ${smMargin >= 0 ? 'text-emerald-400/70' : 'text-red-400/70'}">${smMargin}%</span>`,
                    settlement: `<span class="font-mono text-blue-400/70 text-xs">${Format.won(sm.settlement)}</span>`,
                    share: `<button class="text-[10px] text-blue-400 hover:underline btn-view-staff-sales" data-staff-id="${sid}" data-branch="${branchName}">내역보기</button>`
                };
                const tds = columns.map(col => {
                    const val = staffCells[col.key];
                    const align = col.align === 'left' ? 'text-left' : 'text-right';
                    const baseClass = col.key === 'branch' ? 'pl-10 pr-4 py-2.5' : 'px-4 py-2.5 text-right';
                    return `<td class="${baseClass} ${align}">${val != null ? val : ''}</td>`;
                }).join('');
                return `<tr class="branch-detail-row hidden bg-slate-950/60 border-l-2 border-blue-500/30" data-branch-group="${branchId}">${tds}</tr>`;
            }).join('');

            const branchTds = columns.map(col => {
                const val = branchCells[col.key];
                const align = col.align === 'left' ? 'text-left' : 'text-right';
                const baseClass = col.key === 'branch' ? 'px-4 py-3.5' : 'px-4 py-3.5 text-right';
                return `<td class="${baseClass} ${align}">${val != null ? val : ''}</td>`;
            }).join('');

            return `
            <tr class="branch-header-row hover:bg-slate-800/50 cursor-pointer transition-colors border-b border-slate-700/50" data-branch-toggle="${branchId}">${branchTds}</tr>
            ${staffRows}`;
        };

        container.innerHTML = `
        <div class="max-w-[1600px] mx-auto p-4 md:p-6 space-y-6">
            <!-- 페이지 헤더 -->
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 class="text-2xl font-bold text-white">일일 영업 정산</h1>
                    <p class="text-slate-400 text-sm">${isAdmin ? '지점별 매출을 확인하고 세부 내역을 펼쳐볼 수 있습니다.' : '내 영업 정산을 관리합니다.'}</p>
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

            ${isAdmin ? `<div class="flex flex-wrap gap-2 items-center">
                <button class="st-branch-filter px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${!this.filterBranch ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}" data-branch="">전체</button>
                ${branchNames.map(bn => `<button class="st-branch-filter px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${this.filterBranch === bn ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}" data-branch="${bn}">${bn}</button>`).join('')}
            </div>` : ''}

            <!-- 전체 요약 카드 -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                <div class="bg-slate-900 p-4 rounded-xl border border-slate-800">
                    <p class="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">총 매출</p>
                    <p class="text-lg md:text-xl font-black text-white">${Format.won(sumRevenue)}</p>
                    <p class="text-[10px] text-slate-500 mt-1">${settlements.length}건 · ${branchEntries.length}개 지점</p>
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
                    <p class="text-[10px] text-slate-500 mt-1">매출 − 차감</p>
                </div>
                <div class="bg-slate-900 p-4 rounded-xl border border-slate-800">
                    <p class="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">최종 정산금</p>
                    <p class="text-lg md:text-xl font-black text-white">${Format.won(sumSettlement)}</p>
                    <p class="text-[10px] text-slate-500 mt-1">이월 포함</p>
                </div>
                <div class="bg-slate-900 p-4 rounded-xl border border-slate-800">
                    <p class="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">이익률</p>
                    <p class="text-lg md:text-xl font-black ${sumNetProfit >= 0 ? 'text-emerald-400' : 'text-red-300'}">${sumRevenue > 0 ? Math.round(sumNetProfit / sumRevenue * 100) : 0}%</p>
                    <p class="text-[10px] text-slate-500 mt-1">순이익 / 총 매출</p>
                </div>
            </div>

            <!-- 지점별 매출 테이블 (아코디언) -->
            <div class="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                <div class="p-4 border-b border-slate-800 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined text-blue-400 text-base">store</span>
                        <h3 class="font-bold text-sm text-white">지점별 매출 현황</h3>
                        <span class="text-[10px] text-slate-500">· 지점명 클릭 시 직원별 세부 내역 펼치기</span>
                    </div>
                    <button id="btn-expand-all" class="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                        <span class="material-symbols-outlined text-sm">unfold_more</span> 전체 펼치기
                    </button>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm" style="min-width:900px">
                        <thead>
                            <tr class="bg-slate-800/60 text-[10px] text-slate-500 uppercase tracking-wider">
                                ${this._renderBranchTableHeader(tableCfg)}
                            </tr>
                        </thead>
                        <tbody id="branch-accordion-tbody">
                            ${isAdmin
                                ? branchEntries.map(([bn, bg]) => buildBranchRows(bn, bg)).join('')
                                : `<tr><td colspan="${columns.length}" class="px-4 py-8 text-center text-slate-500">관리자만 지점별 현황을 볼 수 있습니다.</td></tr>`
                            }
                            <tr class="bg-slate-800/50 border-t-2 border-slate-700 font-bold">
                                ${columns.map((col, i) => {
                                    const align = col.align === 'left' ? 'text-left' : 'text-right';
                                    let val;
                                    if (col.key === 'branch') val = '전체 합계';
                                    else if (col.key === 'revenue') val = Format.won(sumRevenue);
                                    else if (col.key === 'wari') val = Format.won(sumWari);
                                    else if (col.key === 'girlPay') val = Format.won(sumGirlPay);
                                    else if (col.key === 'expenses') val = Format.won(sumExpenses);
                                    else if (col.key === 'netProfit') val = Format.won(sumNetProfit);
                                    else if (col.key === 'margin') val = sumRevenue > 0 ? Math.round(sumNetProfit / sumRevenue * 100) + '%' : '0%';
                                    else if (col.key === 'settlement') val = Format.won(sumSettlement);
                                    else if (col.key === 'share') val = '100%';
                                    else val = '';
                                    const cls = col.key === 'branch' ? 'text-white' : col.key === 'revenue' ? 'text-white' : col.key === 'wari' ? 'text-yellow-300 text-xs' : col.key === 'girlPay' ? 'text-pink-400 text-xs' : col.key === 'expenses' ? 'text-slate-400 text-xs' : col.key === 'margin' || col.key === 'netProfit' ? (sumNetProfit >= 0 ? 'text-emerald-400' : 'text-red-300') : col.key === 'settlement' ? 'text-blue-400' : col.key === 'share' ? 'text-slate-500 text-xs' : 'text-xs';
                                    return `<td class="px-4 py-3 ${align} ${cls}">${val}</td>`;
                                }).join('')}
                            </tr>
                        </tbody>
                    </table>
                </div>
                ${isAdmin && totalPages > 1 ? Pagination.render(this.page, totalPages, totalSet, this.pageSize, 'st') : ''}
            </div>

            <!-- 직원별 정산 상세 내역 (아코디언 클릭 시 표시) -->
            <div id="staff-sales-detail" class="hidden space-y-3">
                <div class="flex items-center justify-between">
                    <h3 id="staff-sales-title" class="font-bold text-white flex items-center gap-2">
                        <span class="material-symbols-outlined text-blue-400 text-base">person</span>
                        직원별 정산 내역
                    </h3>
                    <button id="btn-close-detail" class="text-xs text-slate-400 hover:text-white flex items-center gap-1">
                        <span class="material-symbols-outlined text-sm">close</span> 닫기
                    </button>
                </div>
                <div class="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm" style="min-width:700px">
                            <thead>
                                <tr class="bg-slate-800/60 text-[10px] text-slate-500 uppercase tracking-wider">
                                    <th class="px-4 py-3 text-left">날짜 / 상태</th>
                                    <th class="px-4 py-3 text-left">입력자</th>
                                    <th class="px-4 py-3 text-right">총 매출</th>
                                    <th class="px-4 py-3 text-right hidden sm:table-cell">룸수</th>
                                    <th class="px-4 py-3 text-right hidden md:table-cell">카드</th>
                                    <th class="px-4 py-3 text-right hidden md:table-cell">외상</th>
                                    <th class="px-4 py-3 text-right">순이익</th>
                                    <th class="px-4 py-3 text-right">정산금</th>
                                    <th class="px-4 py-3 text-right">작업</th>
                                </tr>
                            </thead>
                            <tbody id="staff-sales-tbody" class="divide-y divide-slate-800">
                                <tr><td colspan="9" class="px-4 py-8 text-center text-slate-500">직원을 선택하세요.</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- 비관리자용: 내 정산 목록 -->
            ${!isAdmin ? `
            <div class="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                <div class="p-4 border-b border-slate-800">
                    <h3 class="font-bold text-sm">내 정산 내역</h3>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm" style="min-width:600px">
                        <thead>
                            <tr class="bg-slate-800/50 text-[10px] text-slate-500 uppercase tracking-wider">
                                <th class="px-4 py-3 text-left">날짜 / 상태</th>
                                <th class="px-4 py-3 text-right">총 매출</th>
                                <th class="px-4 py-3 text-right hidden sm:table-cell">룸수</th>
                                <th class="px-4 py-3 text-right hidden md:table-cell">카드</th>
                                <th class="px-4 py-3 text-right hidden md:table-cell">외상</th>
                                <th class="px-4 py-3 text-right">순이익</th>
                                <th class="px-4 py-3 text-right">정산금</th>
                                <th class="px-4 py-3 text-right">작업</th>
                            </tr>
                        </thead>
                        <tbody id="settlement-tbody" class="divide-y divide-slate-800">
                            ${await this.renderRows(settlements, staff, false)}
                        </tbody>
                    </table>
                </div>
                ${!isAdmin && totalPages > 1 ? Pagination.render(this.page, totalPages, totalSet, this.pageSize, 'st') : ''}
            </div>` : ''}
        </div>`;

        // ── 이벤트 바인딩 ──
        document.getElementById('btn-new-settlement').addEventListener('click', () => {
            this.mode = 'form'; this.editId = null; this.roomCounter = 0; App.renderPage('settlement');
        });
        document.getElementById('btn-export-settlement').addEventListener('click', () => {
            ExcelExport.exportSettlements(settlements, staff);
        });
        PeriodFilter.bindEvents(container, 'st', (type, from, to) => {
            this.periodType = type;
            this.customFrom = from;
            this.customTo = to || from;
            this.page = 1;
            this.mode = 'list';
            App.renderPage('settlement');
        });

        container.querySelectorAll('.st-branch-filter').forEach(btn => {
            btn.addEventListener('click', () => {
                this.filterBranch = btn.dataset.branch || null;
                this.page = 1;
                this.mode = 'list'; App.renderPage('settlement');
            });
        });

        container.querySelectorAll('.pagin-btn[data-prefix="st"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const num = btn.dataset.pageNum;
                if (num && !btn.classList.contains('cursor-not-allowed')) {
                    this.page = parseInt(num, 10);
                    App.renderPage('settlement');
                }
            });
        });

        // 아코디언 토글
        const expandedBranches = new Set();
        container.querySelectorAll('[data-branch-toggle]').forEach(row => {
            row.addEventListener('click', () => {
                const bid = row.dataset.branchToggle;
                const detailRows = container.querySelectorAll(`.branch-detail-row[data-branch-group="${bid}"]`);
                const chevron = container.querySelector(`[data-chevron="${bid}"]`);
                const isOpen = expandedBranches.has(bid);
                if (isOpen) {
                    expandedBranches.delete(bid);
                    detailRows.forEach(r => r.classList.add('hidden'));
                    if (chevron) { chevron.style.transform = ''; }
                } else {
                    expandedBranches.add(bid);
                    detailRows.forEach(r => r.classList.remove('hidden'));
                    if (chevron) { chevron.style.transform = 'rotate(90deg)'; }
                }
            });
        });

        // 전체 펼치기/접기
        let allExpanded = false;
        document.getElementById('btn-expand-all')?.addEventListener('click', () => {
            allExpanded = !allExpanded;
            container.querySelectorAll('.branch-detail-row').forEach(r => r.classList.toggle('hidden', !allExpanded));
            container.querySelectorAll('[data-chevron]').forEach(c => { c.style.transform = allExpanded ? 'rotate(90deg)' : ''; });
            if (allExpanded) branchEntries.forEach(([bn]) => expandedBranches.add('branch_' + bn.replace(/\s/g,'_')));
            else expandedBranches.clear();
            const btn = document.getElementById('btn-expand-all');
            if (btn) btn.innerHTML = allExpanded
                ? '<span class="material-symbols-outlined text-sm">unfold_less</span> 전체 접기'
                : '<span class="material-symbols-outlined text-sm">unfold_more</span> 전체 펼치기';
        });

        // 직원별 내역보기
        container.querySelectorAll('.btn-view-staff-sales').forEach(btn => {
            btn.addEventListener('click', async () => {
                const sid = btn.dataset.staffId;
                const branchName = btn.dataset.branch;
                const sv = staff.find(x => x.id === sid);
                const staffSales = settlements.filter(s => s.entered_by === sid).sort((a, b) => b.date.localeCompare(a.date));
                const todayStr = Format.today();

                const detailEl = document.getElementById('staff-sales-detail');
                const titleEl = document.getElementById('staff-sales-title');
                const tbodyEl = document.getElementById('staff-sales-tbody');

                titleEl.innerHTML = `<span class="material-symbols-outlined text-blue-400 text-base">person</span>
                    <span class="text-blue-400">${branchName}</span>
                    <span class="text-slate-400 mx-1">·</span>
                    <span>${sv ? sv.name : '?'}</span>
                    <span class="text-xs text-slate-500 font-normal ml-2">${staffSales.length}건</span>`;

                const rowsHtml = await this.renderRows(staffSales, staff, true);
                tbodyEl.innerHTML = rowsHtml;
                detailEl.classList.remove('hidden');
                detailEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                this.rebindRowEvents(container);
            });
        });

        document.getElementById('btn-close-detail')?.addEventListener('click', () => {
            document.getElementById('staff-sales-detail')?.classList.add('hidden');
        });

        this.rebindRowEvents(container);
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
            return `<tr><td colspan="9" class="px-6 py-16 text-center text-slate-500">
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
                <td class="px-4 py-3"><div class="flex items-center gap-2"><span class="text-slate-300 font-mono text-xs">${s.date}</span>${statusBadge}</div></td>
                <td class="px-4 py-3">
                    <div class="flex items-center gap-2">
                        <div class="h-6 w-6 rounded-full bg-blue-400/20 text-blue-400 text-[10px] flex items-center justify-center font-bold shrink-0">${enteredBy ? enteredBy.name.substring(0, 1) : '?'}</div>
                        <div>
                            <span class="text-slate-300 text-xs font-bold">${enteredBy ? (enteredBy.branch_name || enteredBy.name) : '관리자'}</span>
                            ${enteredBy && enteredBy.branch_name ? `<span class="text-[10px] text-slate-500 block">${enteredBy.name}</span>` : ''}
                        </div>
                    </div>
                </td>
                <td class="px-4 py-3 font-bold text-white text-right">${Format.won(s.total_revenue)}</td>
                <td class="px-4 py-3 text-slate-400 text-right hidden sm:table-cell">${roomCount}개</td>
                <td class="px-4 py-3 text-slate-400 text-right hidden md:table-cell">${Format.won(s.card_amount || 0)}</td>
                <td class="px-4 py-3 text-red-300 text-right hidden md:table-cell">${Format.won(s.credit_amount || 0)}</td>
                <td class="px-4 py-3 font-bold text-right ${netProfit >= 0 ? 'text-emerald-400' : 'text-red-300'}">${Format.won(netProfit)}</td>
                <td class="px-4 py-3 font-bold text-blue-400 text-right">${Format.won(s.net_settlement)}</td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
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

    _filterGirlsByBranch(girlsList, staff, branchStaff, skipFilter) {
        if (skipFilter || !branchStaff || !branchStaff.branch_name) return girlsList;
        const branchStaffIds = staff.filter(s => s.branch_name === branchStaff.branch_name).map(s => s.id);
        return girlsList.filter(g => !g.staff_id || branchStaffIds.includes(g.staff_id));
    },

    _getEffectiveBranchStaff(allStaff, myStaff, isAdmin) {
        if (!isAdmin) return myStaff;
        const sel = document.getElementById('s-entered-by');
        const enteredById = sel?.value;
        if (!enteredById) return null;
        return allStaff.find(s => s.id === enteredById) || null;
    },

    // ═══ 룸 기반 정산 입력 폼 (엑셀 레이아웃: 4열×3행 그리드) ═══
    async renderForm(container) {
        const isAdmin = Auth.isAdmin();
        const allStaff = await DB.getAll('staff');
        const liquors = await DB.getAll('liquor');
        const allGirls = (await DB.getAll('girls')).filter(g => g.active);
        const today = Format.today();
        const myStaffId = await Auth.getStaffId();
        const myStaff = allStaff.find(s => s.id === myStaffId);
        const staff = this._filterByBranch(allStaff, myStaff, isAdmin);
        const effStaff = this._getEffectiveBranchStaff(allStaff, myStaff, isAdmin);
        const girlsList = this._filterGirlsByBranch(allGirls, allStaff, effStaff, !effStaff || !effStaff.branch_name);
        const tcUnit = await this._getTcUnit();
        this.roomCounter = 0;

        const dateObj = today ? new Date(today + 'T00:00:00') : new Date();
        const dayNames = ['일요일','월요일','화요일','수요일','목요일','금요일','토요일'];
        const dateDisplay = `${dateObj.getFullYear()}년 ${dateObj.getMonth()+1}월 ${dateObj.getDate()}일 ${dayNames[dateObj.getDay()]}`;

        container.innerHTML = `
        <div id="settlement-form-root" class="p-3 space-y-2 bg-gray-100 min-h-screen">
            <!-- 상단 헤더 (날짜 + 설정 + 저장) -->
            <div class="flex items-center gap-2 flex-wrap bg-white px-3 py-2 rounded-xl border border-gray-300 text-xs shadow-sm">
                <button id="btn-back-list" class="p-1 hover:bg-gray-100 rounded-lg shrink-0">
                    <span class="material-symbols-outlined text-gray-600" style="font-size:16px">arrow_back</span>
                </button>
                <span class="text-gray-900 font-bold text-[24px]" id="form-date-display">${dateDisplay}</span>
                <div class="flex items-center gap-2 flex-wrap ml-auto">
                    <input id="s-date" class="bg-white border border-gray-300 rounded px-2 py-1 text-gray-900" type="date" value="${today}"/>
                    <span class="text-gray-600">T/C</span>
                    <input id="s-tc-unit" class="w-24 bg-white border border-gray-300 rounded px-2 py-1 font-mono text-gray-900 amount-input placeholder:text-gray-400" value="${Format.number(tcUnit)}"/>
                    <span class="text-gray-600">시제</span>
                    <input id="s-petty-cash" class="w-24 bg-white border border-gray-300 rounded px-2 py-1 font-mono text-gray-900 amount-input placeholder:text-gray-400" placeholder="0"/>
                    ${isAdmin ? `<select id="s-entered-by" class="bg-white border border-gray-300 rounded px-2 py-1">
                        <option value="">관리자</option>
                        ${staff.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                    </select>` : ''}
                    <button id="btn-save" class="px-4 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors">저장</button>
                </div>
            </div>

            <!-- 4열 그리드: 룸 카드 + 통합 카드 (빈자리) -->
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2" id="main-grid">
                <div id="rooms-container" style="display:contents"></div>
                <div id="daily-summary-card" class="bg-white rounded-lg border border-gray-300 shadow-sm overflow-hidden min-w-0 h-full w-full">
                    <table class="w-full h-full text-[10px] font-normal daily-summary-table" style="border-collapse:collapse;table-layout:fixed">
                    <tbody>
                        <tr>
                            <td class="border border-gray-300 bg-gray-100 text-center text-gray-700 py-1 px-1.5 w-[15%]">주대</td>
                            <td class="border border-gray-300 text-gray-900 text-center py-1 px-1.5 w-[20%]" id="daily-joodae">0</td>
                            <td class="border border-gray-300 bg-gray-100 text-center text-gray-700 py-1 px-1.5 w-[15%]">T/C</td>
                            <td class="border border-gray-300 text-gray-900 text-center py-1 px-1.5 w-[20%]" id="daily-tc">0</td>
                        </tr>
                        <tr>
                            <td class="border border-gray-300 bg-gray-100 text-center text-gray-700 py-1 px-1.5">차용</td>
                            <td class="border border-gray-300 text-gray-900 text-center py-1 px-1.5" id="daily-borrow">0</td>
                            <td class="border border-gray-300 bg-gray-100 text-center text-gray-700 py-1 px-1.5">기타</td>
                            <td class="border border-gray-300 text-gray-900 text-center py-1 px-1.5" id="daily-other">0</td>
                        </tr>
                        <tr>
                            <td class="border border-gray-300 bg-gray-100 text-center text-gray-700 py-1 px-1.5">현금</td>
                            <td class="border border-gray-300 text-gray-900 text-center py-1 px-1.5" id="daily-cash">0</td>
                            <td class="border border-gray-300 bg-gray-100 text-center text-gray-700 py-1 px-1.5">카드</td>
                            <td class="border border-gray-300 text-gray-900 text-center py-1 px-1.5" id="daily-card">0</td>
                        </tr>
                        <tr>
                            <td class="border border-gray-300 bg-gray-100 text-center text-gray-700 py-1 px-1.5">외상</td>
                            <td class="border border-gray-300 text-gray-900 text-center py-1 px-1.5" id="daily-credit">0</td>
                            <td class="border border-gray-300 bg-gray-100 text-center text-gray-700 py-1 px-1.5">시제</td>
                            <td class="border border-gray-300 text-gray-900 text-center py-1 px-1.5" id="daily-petty">0</td>
                        </tr>
                        <tr>
                            <td class="border border-gray-300 bg-gray-100 text-center text-gray-700 py-1 px-1.5">매출</td>
                            <td class="border border-gray-300 text-blue-600 text-center py-1 px-1.5" id="daily-revenue" colspan="3">0</td>
                        </tr>
                    </tbody>
                    </table>
                </div>
            </div>
        </div>`;

        // 11개 룸 + 통합 카드 (빈자리 1열)
        const preloaded = { allStaff, liquors, allGirls, staff, girlsList };
        for (let i = 0; i < 11; i++) {
            await this._addRoom(preloaded);
        }
        this._syncAllTimeInputs(container);
        this._bindFormEvents(container, staff, liquors, girlsList, allGirls, allStaff, myStaff, isAdmin);
    },

    async _roomHTML(idx, staff, liquors, girlsList) {
        const myStaffId = await Auth.getStaffId();
        const girlOptions = girlsList.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
        const staffOptions = staff.map(s => `<option value="${s.id}" ${s.id === myStaffId ? 'selected' : ''}>${s.name}</option>`).join('');

        const timePlaceholders = ['12:30','1:30','2:30','3:30','4:30','5:30','6:30'];
        const timeSlots = [0,1,2,3,4,5,6];
        const timeCells = timeSlots.map(s => `<td class="border border-gray-300 p-0 time-cell" style="width:56px;min-width:56px"><div class="time-cell-wrap relative"><input type="time" class="girl-time-${s} w-full bg-transparent border-0 text-[10px] text-gray-900 text-center p-0.5" placeholder="${timePlaceholders[s]}" style="min-width:0;width:100%"/><button type="button" class="time-clear-btn" title="지우기">×</button></div></td>`).join('');
        const girlRows = Array.from({length: 7}, (_, i) => `
                    <tr class="girl-row">
                        <td class="border border-gray-300 text-center text-[10px] text-gray-600 py-0" style="width:22px">${i+1}</td>
                        <td class="border border-gray-300 p-0" style="min-width:60px">
                            <select class="girl-select w-full bg-transparent border-0 text-[10px] text-gray-900 py-0.5 px-0.5 h-full placeholder:text-gray-400" style="max-width:100%">
                                <option value=""></option>
                                ${girlOptions}
                            </select>
                        </td>
                        <td class="border border-gray-300 bg-gray-50 p-0 text-center text-[10px] text-gray-600" style="width:32px"><span class="girl-row-times"></span></td>
                        ${timeCells}
                    </tr>`).join('');

        return `
        <div class="room-card bg-white rounded-lg border border-gray-300 overflow-hidden shadow-sm" data-room-idx="${idx}">
            <!-- 헤더: [Room: ___ VIP: ___ 담당: ___ ] -->
            <div class="flex items-center gap-1 px-1.5 py-1 border-b border-gray-300 flex-wrap text-[10px] bg-gray-100">
                <span class="text-gray-600 shrink-0">Room:</span>
                <input class="room-number w-9 bg-white border border-gray-300 rounded text-[10px] text-gray-900 text-center py-0.5 placeholder:text-gray-400" placeholder=""/>
                <span class="text-gray-400">|</span>
                <span class="text-gray-600 shrink-0">VIP:</span>
                <input class="room-vip flex-1 min-w-[45px] bg-white border border-gray-300 rounded text-[10px] text-gray-900 py-0.5 placeholder:text-gray-400" placeholder=""/>
                <span class="text-gray-400">|</span>
                <span class="text-gray-600 shrink-0">담당:</span>
                <select class="room-staff bg-white border border-gray-300 rounded text-[10px] text-gray-900 py-0.5 min-w-[55px]">
                    <option value="">-</option>
                    ${staffOptions}
                </select>
                <span class="text-gray-400">|</span>
                <button class="btn-remove-room ml-auto text-gray-500 hover:text-red-500 leading-none">&times;</button>
            </div>

            <!-- 아가씨 테이블: no | 이름 | time(열) | 0~6 (7열, 스크롤) -->
            <div class="overflow-x-auto scroll-hide room-table-scroll" style="-webkit-overflow-scrolling:touch" title="가로 드래그로 스크롤">
                <table style="border-collapse:collapse;width:100%;min-width:520px">
                    <tbody class="room-girls">
                        <tr>
                            <td class="border border-gray-300 bg-gray-100 text-center text-[10px] text-gray-700" style="width:22px">no</td>
                            <td class="border border-gray-300 bg-gray-100 text-center text-[10px] text-gray-700" style="min-width:60px">이름</td>
                            <td class="border border-gray-300 bg-gray-100 text-center text-[10px] text-gray-700 py-0.5 px-0.5" style="width:32px">타임</td>
                            ${[0,1,2,3,4,5,6].map(n => `<td class="border border-gray-300 bg-gray-100 text-center text-[10px] text-gray-600 py-0.5 align-middle" style="width:56px;min-width:56px">${n}</td>`).join('')}
                        </tr>
                        ${girlRows}
                    </tbody>
                </table>
            </div>

            <!-- 주류: 주종 + 수량 선택 (기본 접힘) -->
            <details class="room-liquor-details border-t border-gray-200 group">
                <summary class="text-[10px] text-gray-900 py-1 pl-3 pr-0 cursor-pointer list-none flex items-center hover:text-gray-900 [&::-webkit-details-marker]:hidden">
                    주류
                </summary>
                <div class="room-liquors space-y-0.5 mt-1 pb-1">
                    ${Array.from({length: 5}, () => `
                    <div class="room-liquor-row flex gap-1 items-center">
                        <select class="room-lq-select flex-1 min-w-0 bg-white border border-gray-300 rounded text-[10px] text-gray-900 py-0.5 px-1">
                            <option value="">주종 선택</option>
                            ${liquors.map(l => `<option value="${l.id}" data-price="${l.sell_price}">${l.name}</option>`).join('')}
                        </select>
                        <input class="room-lq-qty w-12 bg-white border border-gray-300 rounded text-[10px] text-gray-900 text-center py-0.5 placeholder:text-gray-400" type="number" placeholder="수량" min="0"/>
                        <input type="hidden" class="room-lq-service" value="0"/>
                    </div>`).join('')}
                </div>
            </details>

            <!-- 요약 테이블: 주대/차용/현금/외상 | T/C/기타/카드/매출 (룸 카드 내부) -->
            <table class="text-[10px] font-normal room-summary-table" style="border-collapse:collapse;width:100%;table-layout:fixed">
                <tbody>
                    <tr>
                        <td class="border border-gray-300 bg-gray-100 text-center text-gray-700 py-1 text-[10px]" style="width:25%;min-width:32px">주대</td>
                        <td class="border border-gray-300 px-1 py-1 text-center text-gray-900 text-[10px]"><p class="room-joodae">0</p></td>
                        <td class="border border-gray-300 bg-gray-100 text-center text-gray-700 py-1 text-[10px]" style="width:25%">T/C</td>
                        <td class="border border-gray-300 px-1 py-1 text-center text-gray-900 text-[10px]" style="width:25%"><p class="room-tc">0</p></td>
                    </tr>
                    <tr>
                        <td class="border border-gray-300 bg-gray-100 text-center text-gray-700 py-1 text-[10px]">차용</td>
                        <td class="border border-gray-300 p-0.5 text-center"><input class="room-pay-borrow w-full bg-transparent border-0 text-[10px] text-gray-900 text-center amount-input placeholder:text-gray-400" placeholder="0"/></td>
                        <td class="border border-gray-300 bg-gray-100 text-center text-gray-700 py-1 text-[10px]">기타</td>
                        <td class="border border-gray-300 p-0.5 text-center"><input class="room-pay-other w-full bg-transparent border-0 text-[10px] text-gray-900 text-center amount-input placeholder:text-gray-400" placeholder="0"/></td>
                    </tr>
                    <tr>
                        <td class="border border-gray-300 bg-gray-100 text-center text-gray-700 py-1 text-[10px]">현금</td>
                        <td class="border border-gray-300 p-0.5 text-center"><input class="room-pay-cash w-full bg-transparent border-0 text-[10px] text-gray-900 text-center amount-input placeholder:text-gray-400" placeholder="0"/></td>
                        <td class="border border-gray-300 bg-gray-100 text-center text-gray-700 py-1 text-[10px]">카드</td>
                        <td class="border border-gray-300 p-0.5 text-center"><input class="room-pay-card w-full bg-transparent border-0 text-[10px] text-gray-900 text-center amount-input placeholder:text-gray-400" placeholder="0"/></td>
                    </tr>
                    <tr>
                        <td class="border border-gray-300 bg-gray-100 text-center text-gray-700 py-1 text-[10px]">외상</td>
                        <td class="border border-gray-300 p-0.5 text-center"><input class="room-pay-credit w-full bg-transparent border-0 text-[10px] text-gray-900 text-center amount-input placeholder:text-gray-400" placeholder="0"/></td>
                        <td class="border border-gray-300 bg-gray-100 text-center text-gray-700 py-1 text-[10px]">매출</td>
                        <td class="border border-gray-300 px-1 py-1 text-center text-blue-600 text-[10px]"><p class="room-total">0</p></td>
                    </tr>
                </tbody>
            </table>
        </div>`;
    },

    async _addRoom(preloaded) {
        const isAdmin = Auth.isAdmin();
        const allStaff = preloaded ? preloaded.allStaff : await DB.getAll('staff');
        const liquors = preloaded ? preloaded.liquors : await DB.getAll('liquor');
        const allGirls = preloaded ? preloaded.allGirls : (await DB.getAll('girls')).filter(g => g.active);
        const myStaffId = await Auth.getStaffId();
        const myStaff = allStaff.find(s => s.id === myStaffId);
        const staff = preloaded ? preloaded.staff : this._filterByBranch(allStaff, myStaff, isAdmin);
        const effStaff = this._getEffectiveBranchStaff(allStaff, myStaff, isAdmin);
        const girlsList = preloaded ? preloaded.girlsList : this._filterGirlsByBranch(allGirls, allStaff, effStaff, !effStaff || !effStaff.branch_name);
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
            const times = [0,1,2,3,4,5,6].map(slot => {
                const input = row.querySelector(`.girl-time-${slot}`);
                return input?.value || '';
            });
            const rowTimes = this._calcTimesFromSlots(times);
            totalTimes += rowTimes;
            const timesEl = row.querySelector('.girl-row-times');
            if (timesEl) timesEl.textContent = rowTimes > 0 ? `${rowTimes}T` : '';
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
        if (jEl) { jEl.textContent = Format.won(joodae); jEl.dataset.value = joodae; }
        if (tEl) { tEl.textContent = `${Format.won(tc)} (${totalTimes}T)`; tEl.dataset.value = tc; }
        if (totEl) { totEl.textContent = Format.won(total); totEl.dataset.value = total; }
    },

    _bindFormEvents(container, staff, liquors, girlsList, allGirls, allStaff, myStaff, isAdmin) {
        const getFilteredGirls = () => {
            const effStaff = this._getEffectiveBranchStaff(allStaff, myStaff, isAdmin);
            return this._filterGirlsByBranch(allGirls, allStaff, effStaff, !effStaff || !effStaff.branch_name);
        };
        const refreshAllGirlDropdowns = (list) => {
            const opts = list.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
            const gpOpts = list.map(g => `<option value="${g.id}" data-standby="${g.standby_fee || 0}" data-event="${g.event_fee || 0}">${g.name}</option>`).join('');
            container.querySelectorAll('.girl-select').forEach(sel => {
                const cur = sel.value;
                sel.innerHTML = '<option value="">선택</option>' + opts;
                if (cur && list.some(g => g.id === cur)) sel.value = cur;
            });
            container.querySelectorAll('.gp-girl').forEach(sel => {
                const cur = sel.value;
                sel.innerHTML = '<option value="">선택</option>' + gpOpts;
                if (cur && list.some(g => g.id === cur)) sel.value = cur;
            });
        };
        document.getElementById('btn-back-list').addEventListener('click', () => { this.mode = 'list'; App.renderPage('settlement'); });

        // 드래그 스크롤: room-table-scroll 영역에서 마우스 클릭 후 드래그
        let dragScroll = { el: null, startX: 0, startLeft: 0 };
        container.addEventListener('mousedown', (e) => {
            if (e.target.closest('input, select, button')) return;
            const el = e.target.closest('.room-table-scroll');
            if (!el || e.button !== 0) return;
            dragScroll = { el, startX: e.clientX, startLeft: el.scrollLeft };
            el.style.cursor = 'grabbing';
            el.style.userSelect = 'none';
        });
        document.addEventListener('mousemove', (e) => {
            if (!dragScroll.el) return;
            const dx = e.clientX - dragScroll.startX;
            dragScroll.el.scrollLeft = dragScroll.startLeft - dx;
        });
        document.addEventListener('mouseup', () => {
            if (dragScroll.el) {
                dragScroll.el.style.cursor = '';
                dragScroll.el.style.userSelect = '';
                dragScroll.el = null;
            }
        });
        document.getElementById('btn-save').addEventListener('click', () => this.saveSettlement());

        // 날짜 변경 시 상단 날짜 텍스트 동기화
        document.getElementById('s-date')?.addEventListener('change', (e) => {
            const dayNames = ['일요일','월요일','화요일','수요일','목요일','금요일','토요일'];
            const d = new Date(e.target.value + 'T00:00:00');
            const txt = `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 ${dayNames[d.getDay()]}`;
            const el = document.getElementById('form-date-display');
            if (el) el.textContent = txt;
        });

        container.addEventListener('input', async (e) => {
            this._syncTimeInputEmptyState(e.target);
            if (e.target.classList.contains('amount-input')) {
                const val = Format.parseNumber(e.target.value);
                if (val) e.target.value = Format.number(val);
            }
            const roomCard = e.target.closest('.room-card');
            if (roomCard) await this._updateRoomSummary(roomCard);
            await this.updatePreview();
        });

        const enteredByEl = document.getElementById('s-entered-by');
        if (enteredByEl && isAdmin) {
            enteredByEl.addEventListener('change', () => {
                refreshAllGirlDropdowns(getFilteredGirls());
            });
        }
        container.addEventListener('change', async (e) => {
            this._syncTimeInputEmptyState(e.target);
            const roomCard = e.target.closest('.room-card');
            if (roomCard) await this._updateRoomSummary(roomCard);
            await this.updatePreview();
        });

        container.addEventListener('keydown', async (e) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && e.target.matches('input[type="time"]') && e.target.closest('#settlement-form-root')) {
                e.target.value = '';
                this._syncTimeInputEmptyState(e.target);
                const roomCard = e.target.closest('.room-card');
                if (roomCard) await this._updateRoomSummary(roomCard);
                await this.updatePreview();
                e.preventDefault();
            }
        });

        container.addEventListener('click', async (e) => {
            const clearBtn = e.target.closest('.time-clear-btn');
            if (clearBtn) {
                const input = clearBtn.parentElement?.querySelector('input[type="time"]');
                if (input) {
                    input.value = '';
                    this._syncTimeInputEmptyState(input);
                    const roomCard = input.closest('.room-card');
                    if (roomCard) await this._updateRoomSummary(roomCard);
                    await this.updatePreview();
                }
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            const btn = e.target.closest('button');
            if (!btn) return;

            if (btn.classList.contains('btn-remove-room')) {
                btn.closest('.room-card').remove();
                await this.updatePreview();
            }
            if (btn.classList.contains('btn-remove-girl')) {
                const roomCard = btn.closest('.room-card');
                btn.closest('.girl-row').remove();
                if (roomCard) await this._updateRoomSummary(roomCard);
                await this.updatePreview();
            }
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
                const times = this._calcTimesFromSlots([0,1,2,3,4,5,6].map(slot => row.querySelector(`.girl-time-${slot}`)?.value || ''));
                totalTimes += times;
                const timeStrs = [0,1,2,3,4,5,6].map(slot => row.querySelector(`.girl-time-${slot}`)?.value).filter(Boolean);
                const entry_time = timeStrs[0] || '';
                const exit_time = timeStrs[timeStrs.length - 1] || '';
                if (girlId || times > 0 || timeStrs.length > 0) {
                    girls.push({ girl_id: girlId, name: girlName, entry_time, exit_time, times });
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

    _autoCalcWari() {
        let totalRevenue = 0;
        document.querySelectorAll('.room-card').forEach(card => {
            const joodae = parseInt(card.querySelector('.room-joodae')?.dataset?.value) || 0;
            const tc = parseInt(card.querySelector('.room-tc')?.dataset?.value) || 0;
            totalRevenue += joodae + tc;
        });

        const assignedGirlIds = new Set();
        document.querySelectorAll('.room-card .girl-select').forEach(sel => {
            if (sel.value) assignedGirlIds.add(sel.value);
        });

        document.querySelectorAll('[data-wari-type="staff"] .wari-amount').forEach(input => {
            const rate = parseFloat(input.dataset.rate) || 0;
            const amount = Math.round(totalRevenue * rate / 100);
            input.value = amount > 0 ? Format.number(amount) : '';
        });

        document.querySelectorAll('[data-wari-type="girl"] .wari-girl-amount').forEach(input => {
            const girlId = input.dataset.girl;
            const rate = parseFloat(input.dataset.rate) || 0;
            if (assignedGirlIds.has(girlId)) {
                const amount = Math.round(totalRevenue * rate / 100);
                input.value = amount > 0 ? Format.number(amount) : '';
            } else {
                input.value = '';
            }
        });
    },

    async updatePreview() {
        this._autoCalcWari();
        const data = await this.getFormData();
        // 일일 합계 테이블 업데이트
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = Format.number(val); };
        set('daily-joodae', data.totalJoodae || 0);
        set('daily-tc', data.totalTc || 0);
        set('daily-borrow', (data.roomData||[]).reduce((s,r)=>s+(r.pay_borrowing||0),0));
        set('daily-other', (data.roomData||[]).reduce((s,r)=>s+(r.pay_other||0),0));
        set('daily-cash', (data.roomData||[]).reduce((s,r)=>s+(r.pay_cash||0),0));
        set('daily-card', (data.roomData||[]).reduce((s,r)=>s+(r.pay_card||0),0));
        set('daily-credit', (data.roomData||[]).reduce((s,r)=>s+(r.pay_credit||0),0));
        const petty = Format.parseNumber(document.getElementById('s-petty-cash')?.value);
        set('daily-petty', petty);
        set('daily-revenue', data.totalRevenue || 0);
    },

    _buildSettlementHTML(data) {
        const roomCount = data.roomData ? data.roomData.length : 0;
        const roomsHTML = (data.roomData || []).map(r => {
            const payCash = r.pay_cash || 0;
            const payCard = r.pay_card || 0;
            const payBorrow = r.pay_borrowing || 0;
            const payCredit = r.pay_credit || 0;
            const payOther = r.pay_other || 0;
            return `
            <div class="mb-3 border border-slate-700 rounded-lg overflow-hidden">
                <div class="bg-slate-800/80 px-2 py-1.5 text-xs border-b border-slate-700">
                    <span class="text-slate-400">Room:</span> <span class="text-white font-bold">${r.room_number || '?'}</span>
                    <span class="text-slate-600 mx-1">|</span>
                    <span class="text-slate-400">VIP:</span> <span class="text-blue-400">${r.vip_name || '-'}</span>
                    <span class="text-slate-600 mx-1">|</span>
                    <span class="text-slate-400">담당:</span> <span class="text-white">${r.staff_name || '-'}</span>
                </div>
                ${r.girls.length > 0 ? `
                <table class="w-full text-[10px] border-collapse">
                    <thead><tr class="bg-slate-800/60"><th class="border border-slate-700 px-1 py-0.5 text-left text-slate-500">이름</th><th class="border border-slate-700 px-1 py-0.5 text-center text-slate-500" colspan="5">Time</th></tr></thead>
                    <tbody>${r.girls.map(g => `<tr><td class="border border-slate-700 px-1 py-0.5 text-pink-400">${g.name || '?'}</td><td class="border border-slate-700 px-1 py-0.5 text-slate-400">-</td><td class="border border-slate-700 px-1 py-0.5 text-slate-400">-</td><td class="border border-slate-700 px-1 py-0.5 text-blue-400 font-bold">${g.times}T</td><td class="border border-slate-700 px-1 py-0.5"></td><td class="border border-slate-700 px-1 py-0.5"></td></tr>`).join('')}</tbody>
                </table>` : ''}
                <table class="w-full text-[10px] border-collapse">
                    <tbody>
                        <tr><td class="border border-slate-700 bg-slate-800/50 px-2 py-1 text-slate-500 w-14">주대</td><td class="border border-slate-700 px-2 py-1 font-mono text-white">${Format.number(r.joodae)}</td><td class="border border-slate-700 bg-slate-800/50 px-2 py-1 text-slate-500 w-14">T/C</td><td class="border border-slate-700 px-2 py-1 font-mono text-white">${Format.number(r.tc_amount)}</td></tr>
                        <tr><td class="border border-slate-700 bg-slate-800/50 px-2 py-1 text-slate-500">차용</td><td class="border border-slate-700 px-2 py-1 font-mono">${Format.number(payBorrow)}</td><td class="border border-slate-700 bg-slate-800/50 px-2 py-1 text-slate-500">기타</td><td class="border border-slate-700 px-2 py-1 font-mono">${Format.number(payOther)}</td></tr>
                        <tr><td class="border border-slate-700 bg-slate-800/50 px-2 py-1 text-slate-500">현금</td><td class="border border-slate-700 px-2 py-1 font-mono">${Format.number(payCash)}</td><td class="border border-slate-700 bg-slate-800/50 px-2 py-1 text-slate-500">카드</td><td class="border border-slate-700 px-2 py-1 font-mono">${Format.number(payCard)}</td></tr>
                        <tr><td class="border border-slate-700 bg-slate-800/50 px-2 py-1 text-slate-500">외상</td><td class="border border-slate-700 px-2 py-1 font-mono">${Format.number(payCredit)}</td><td class="border border-slate-700 bg-slate-800/50 px-2 py-1 text-slate-500">매출</td><td class="border border-slate-700 px-2 py-1 font-mono font-bold text-blue-400">${Format.number(r.room_revenue)}</td></tr>
                    </tbody>
                </table>
            </div>`;
        }).join('');

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

        for (const r of data.roomData) {
            const revenue = r.room_revenue;
            const payTotal = r.pay_cash + r.pay_card + r.pay_borrowing + r.pay_other + r.pay_credit;
            if (revenue > 0 && payTotal !== revenue) {
                const diff = revenue - payTotal;
                App.toast(`Room ${r.room_number || '?'}: 매출 ${Format.won(revenue)}과 결제 합계 ${Format.won(payTotal)}이 일치하지 않습니다. (차액: ${Format.won(diff)})`, 'error');
                return;
            }
        }

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

        for (const e of data.expenseItems) {
            await DB.insert('expenses', {
                date: data.date, category_name: e.name, amount: e.amount,
                memo: `정산 연동 (${sale.id.substring(0, 8)})`, entered_by: enteredBy
            });
        }

        const inventory = await DB.getAll('liquor_inventory');
        const staff = await DB.getAll('staff');
        const branches = await DB.getAll('branches');
        const enteredStaff = staff.find(s => s.id === enteredBy);
        const saleBranchId = enteredStaff?.branch_name ? (branches.find(b => b.name === enteredStaff.branch_name)?.id) : null;
        const hasBranchColumn = inventory.some(i => 'branch_id' in i);
        for (const item of data.allLiquorItems) {
            const inv = (hasBranchColumn && saleBranchId)
                ? inventory.find(i => i.liquor_id === item.liquor_id && i.branch_id === saleBranchId)
                : inventory.find(i => i.liquor_id === item.liquor_id && !i.branch_id);
            const invFallback = !inv && hasBranchColumn ? inventory.find(i => i.liquor_id === item.liquor_id && !i.branch_id) : inv;
            const targetInv = inv || invFallback;
            if (targetInv) {
                const used = item.qty + (item.service || 0);
                const newQty = Math.max(0, targetInv.quantity - used);
                await DB.update('liquor_inventory', targetInv.id, { quantity: newQty });
            }
        }

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

        const { data: girlPaymentsData } = sale.entered_by
            ? await window._supabase.from('girl_payments').select('*').eq('_deleted', false).eq('date', sale.date).or(`entered_by.eq.${sale.entered_by},staff_id.eq.${sale.entered_by}`)
            : { data: [] };
        const girlPayments = girlPaymentsData || [];
        const girls = await DB.getAll('girls');
        const girlExpenseTotal = girlPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

        // 총 T/C 아가씨별 상세 (전체 룸 아가씨 취합)
        const allTcGirls = hasRoomData ? saleRooms.flatMap(r => (r.girls || []).map(g => ({
            ...g, roomNumber: r.room_number || '?', roomVip: r.vip_name
        }))) : [];

        const roomsViewHTML = hasRoomData ? saleRooms.map(r => `
            <div class="p-4 bg-slate-800/30 rounded-xl border border-slate-700/50 mb-3">
                <div class="flex justify-between items-center mb-2">
                    <div class="flex items-center gap-2">
                        <span class="bg-blue-500/20 text-blue-400 font-bold text-sm px-2 py-1 rounded">Room ${r.room_number || '?'}</span>
                        ${r.vip_name ? `<span class="text-sm font-bold text-white">${r.vip_name}</span>` : ''}
                    </div>
                    <span class="text-sm text-slate-500">${r.staff_name || ''}</span>
                </div>
                ${r.girls && r.girls.length > 0 ? `
                <div class="mb-2">
                    <span class="text-xs text-pink-400 font-bold uppercase">아가씨 (T/C 상세)</span>
                    <div class="mt-1 space-y-1">${r.girls.map(g => `
                        <div class="flex items-center justify-between text-sm bg-slate-800/50 px-3 py-2 rounded-lg">
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
                <div class="bg-slate-800/50 rounded-lg mt-2 divide-y divide-slate-700/40 overflow-hidden">
                    <div class="flex items-center justify-between px-4 py-2">
                        <span class="text-xs text-slate-400 w-20">주대</span>
                        <span class="text-sm font-bold text-white font-mono text-right">${Format.number(r.joodae)}</span>
                    </div>
                    <div class="flex items-center justify-between px-4 py-2">
                        <span class="text-xs text-slate-400 w-20">T/C (${r.tc_times || 0}T)</span>
                        <span class="text-sm font-bold text-white font-mono text-right">${Format.number(r.tc_amount)}</span>
                    </div>
                    <div class="flex items-center justify-between px-4 py-2 bg-blue-500/5">
                        <span class="text-xs text-blue-400 w-20 font-semibold">룸 매출</span>
                        <span class="text-sm font-bold text-blue-400 font-mono text-right">${Format.number(r.room_revenue)}</span>
                    </div>
                    ${r.pay_cash ? `<div class="flex items-center justify-between px-4 py-2">
                        <span class="text-xs text-slate-400 w-20">현금</span>
                        <span class="text-sm font-bold text-white font-mono text-right">${Format.number(r.pay_cash)}</span>
                    </div>` : ''}
                    ${r.pay_card ? `<div class="flex items-center justify-between px-4 py-2">
                        <span class="text-xs text-slate-400 w-20">카드</span>
                        <span class="text-sm font-bold text-white font-mono text-right">${Format.number(r.pay_card)}</span>
                    </div>` : ''}
                    ${r.pay_borrowing ? `<div class="flex items-center justify-between px-4 py-2">
                        <span class="text-xs text-slate-400 w-20">차용</span>
                        <span class="text-sm font-bold text-white font-mono text-right">${Format.number(r.pay_borrowing)}</span>
                    </div>` : ''}
                    ${r.pay_other ? `<div class="flex items-center justify-between px-4 py-2">
                        <span class="text-xs text-slate-400 w-20">기타</span>
                        <span class="text-sm font-bold text-white font-mono text-right">${Format.number(r.pay_other)}</span>
                    </div>` : ''}
                    ${r.pay_credit ? `<div class="flex items-center justify-between px-4 py-2 bg-red-500/5">
                        <span class="text-xs text-red-300 w-20 font-semibold">외상</span>
                        <span class="text-sm font-bold text-red-300 font-mono text-right">${Format.number(r.pay_credit)}${r.credit_customer ? ` <span class="text-xs text-slate-500 font-normal ml-1">(${r.credit_customer})</span>` : ''}</span>
                    </div>` : ''}
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
                                <tr><td class="px-4 py-3 text-slate-300">총 T/C</td><td class="px-4 py-3 text-right font-mono text-white">${Format.number(sale.total_tc || 0)}</td></tr>
                                ${allTcGirls.length > 0 ? `
                                <tr><td colspan="2" class="px-4 py-2 bg-slate-800/30">
                                    <div class="text-xs font-bold text-pink-400 mb-1">T/C 아가씨별 상세 (입실~퇴실)</div>
                                    <div class="space-y-1">${allTcGirls.map(g => `
                                        <div class="flex justify-between items-center text-xs py-1">
                                            <span class="text-white">${g.name || '?'} <span class="text-slate-500">(R${g.roomNumber})</span></span>
                                            <span class="text-slate-400 font-mono">${g.entry_time || '?'} ~ ${g.exit_time || '?'} = <span class="text-blue-400 font-bold">${g.times}T</span></span>
                                        </div>`).join('')}
                                    </div>
                                </td></tr>` : ''}` : ''}
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
