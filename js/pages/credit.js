// 외상 관리 페이지
const CreditPage = {
    filterStaffId: null,
    filterStatus: null,
    periodType: 'today',
    customFrom: null,
    customTo: null,

    async render(container) {
        let receivables = (await DB.getAll('receivables')).sort((a, b) => b.date.localeCompare(a.date));
        const staff = await DB.getAll('staff');
        const isAdmin = Auth.isAdmin();
        const range = PeriodFilter.getRange(this.periodType, this.customFrom, this.customTo);

        // 기간 필터 적용
        receivables = PeriodFilter.filterByDate(receivables, 'date', range.from, range.to);

        // 직원 로그인이면 본인 담당 외상만
        if (!isAdmin) {
            const staffId = await Auth.getStaffId();
            receivables = receivables.filter(r => r.staff_id === staffId || r.entered_by === staffId);
        } else if (this.filterStaffId) {
            receivables = receivables.filter(r => r.staff_id === this.filterStaffId || r.entered_by === this.filterStaffId);
        }

        if (this.filterStatus) {
            if (this.filterStatus === 'unpaid') receivables = receivables.filter(r => r.status === 'unpaid');
            else if (this.filterStatus === 'partial') receivables = receivables.filter(r => r.status === 'partial');
            else if (this.filterStatus === 'paid') receivables = receivables.filter(r => r.status === 'paid');
            else if (this.filterStatus === 'overdue') receivables = receivables.filter(r => r.status !== 'paid' && r.due_date && new Date(r.due_date) < new Date());
        }

        const payments = await DB.getAll('receivable_payments');

        const totalOutstanding = receivables.filter(r => r.status !== 'paid').reduce((s, r) => s + (r.amount - (r.paid_amount || 0)), 0);
        const totalCollected = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
        const delinquentCount = receivables.filter(r => r.status !== 'paid' && r.due_date && new Date(r.due_date) < new Date()).length;

        // Pre-fetch staffId for template usage
        const currentStaffId = await Auth.getStaffId();

        container.innerHTML = `
        <div class="max-w-[1600px] mx-auto p-4 md:p-6 space-y-6 md:space-y-8">
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 class="text-2xl font-bold text-white">외상 관리 (외상 채권)</h1>
                    <p class="text-slate-400 text-sm">외상 발생 및 입금 현황을 관리합니다.</p>
                </div>
                <div class="flex gap-3">
                    <button id="btn-export-credit" class="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs hover:bg-slate-700 transition-colors text-slate-300">
                        <span class="material-symbols-outlined text-sm">download</span> 엑셀
                    </button>
                    <button id="btn-new-credit" class="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors">
                        <span class="material-symbols-outlined text-sm">add</span> 새 외상 등록
                    </button>
                </div>
            </div>

            <!-- 요약 카드 -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                <div class="bg-slate-900 p-4 md:p-6 rounded-2xl border border-slate-800">
                    <div class="flex items-center justify-between mb-4">
                        <span class="p-2 bg-blue-500/10 rounded-lg text-blue-500"><span class="material-symbols-outlined">payments</span></span>
                    </div>
                    <h3 class="text-slate-400 text-sm font-medium">총 외상 잔액</h3>
                    <div class="text-2xl md:text-3xl font-bold text-white mt-1">${Format.won(totalOutstanding)}</div>
                </div>
                <div class="bg-slate-900 p-4 md:p-6 rounded-2xl border border-slate-800">
                    <div class="flex items-center justify-between mb-4">
                        <span class="p-2 bg-emerald-500/10 rounded-lg text-emerald-400"><span class="material-symbols-outlined">account_balance</span></span>
                    </div>
                    <h3 class="text-slate-400 text-sm font-medium">이번달 회수액</h3>
                    <div class="text-2xl md:text-3xl font-bold text-white mt-1">${Format.won(totalCollected)}</div>
                </div>
                <div class="bg-slate-900 p-4 md:p-6 rounded-2xl border border-slate-800">
                    <div class="flex items-center justify-between mb-4">
                        <span class="p-2 bg-red-300/10 rounded-lg text-red-300"><span class="material-symbols-outlined">warning</span></span>
                        <span class="text-xs font-medium text-red-300">긴급</span>
                    </div>
                    <h3 class="text-slate-400 text-sm font-medium">연체 건수</h3>
                    <div class="text-2xl md:text-3xl font-bold text-white mt-1">${delinquentCount} <span class="text-sm font-normal text-slate-500 ml-1">건</span></div>
                </div>
            </div>

            <!-- 기간 필터 -->
            ${PeriodFilter.renderUI(this.periodType, this.customFrom, this.customTo, 'cr')}

            <!-- 관리자 직원 필터 -->
            ${isAdmin ? `<div class="flex flex-wrap gap-2">
                <button class="credit-filter px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${!this.filterStaffId ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}" data-filter-staff="">전체</button>
                ${staff.map(s => `<button class="credit-filter px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${this.filterStaffId === s.id ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}" data-filter-staff="${s.id}">${s.branch_name ? s.branch_name + '(' + s.name + ')' : s.name}</button>`).join('')}
            </div>` : ''}

            <!-- 상태 필터 -->
            <div class="flex flex-wrap gap-2">
                <button class="status-filter px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${!this.filterStatus ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}" data-filter-status="">전체</button>
                <button class="status-filter px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${this.filterStatus === 'unpaid' ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}" data-filter-status="unpaid">미입금</button>
                <button class="status-filter px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${this.filterStatus === 'partial' ? 'bg-amber-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}" data-filter-status="partial">부분입금</button>
                <button class="status-filter px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${this.filterStatus === 'overdue' ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}" data-filter-status="overdue">연체</button>
                <button class="status-filter px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${this.filterStatus === 'paid' ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}" data-filter-status="paid">완납</button>
            </div>

            <!-- 외상 테이블 -->
            <div class="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-sm whitespace-nowrap">
                        <thead>
                            <tr class="bg-slate-800/50 border-b border-slate-700">
                                <th class="px-4 md:px-6 py-4 font-semibold text-slate-300">날짜</th>
                                <th class="px-4 md:px-6 py-4 font-semibold text-slate-300">담당</th>
                                <th class="px-4 md:px-6 py-4 font-semibold text-slate-300">손님명</th>
                                <th class="px-4 md:px-6 py-4 font-semibold text-slate-300">금액</th>
                                <th class="px-4 md:px-6 py-4 font-semibold text-slate-300 hidden sm:table-cell">약속일</th>
                                <th class="px-4 md:px-6 py-4 font-semibold text-slate-300">상태</th>
                                <th class="px-4 md:px-6 py-4 font-semibold text-slate-300 text-right">작업</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-800">
                            ${receivables.map(r => {
                                const s = staff.find(st => st.id === r.staff_id);
                                const isOverdue = r.status !== 'paid' && r.due_date && new Date(r.due_date) < new Date();
                                const statusBadge = r.status === 'paid'
                                    ? '<span class="px-2 py-1 bg-emerald-500/10 text-emerald-400 text-xs font-bold rounded border border-emerald-500/20">완납</span>'
                                    : r.status === 'partial'
                                    ? `<span class="px-2 py-1 bg-amber-300/10 text-amber-300 text-xs font-bold rounded border border-amber-300/20">부분(${Format.won(r.paid_amount || 0)})</span>`
                                    : '<span class="px-2 py-1 bg-red-300/10 text-red-300 text-xs font-bold rounded border border-red-300/20">미입금</span>';

                                return `
                                <tr class="hover:bg-slate-800/30 transition-colors ${isOverdue ? 'delinquent-glow' : ''}">
                                    <td class="px-4 md:px-6 py-4 text-slate-400 font-mono">${r.date}</td>
                                    <td class="px-4 md:px-6 py-4">
                                        <div class="flex items-center gap-2">
                                            <div class="h-6 w-6 rounded-full bg-blue-400/20 text-blue-400 text-[10px] flex items-center justify-center font-bold">${s ? s.name.substring(0, 1) : '?'}</div>
                                            <div>
                                                <span class="text-slate-200 text-xs">${s ? (s.branch_name ? s.branch_name : s.name) : '-'}</span>
                                                ${s && s.branch_name ? `<span class="text-[10px] text-slate-500 block">${s.name}</span>` : ''}
                                            </div>
                                        </div>
                                    </td>
                                    <td class="px-4 md:px-6 py-4 font-medium text-white">${r.customer}</td>
                                    <td class="px-4 md:px-6 py-4 font-mono text-white">${Format.number(r.amount)}</td>
                                    <td class="px-4 md:px-6 py-4 font-mono hidden sm:table-cell ${isOverdue ? 'text-red-300' : 'text-slate-400'}">${r.due_date || '-'} ${isOverdue ? '(연체)' : ''}</td>
                                    <td class="px-4 md:px-6 py-4">${statusBadge}</td>
                                    <td class="px-4 md:px-6 py-4 text-right">
                                        <button class="text-emerald-400 hover:underline text-xs font-bold mr-2" data-history="${r.id}">이력</button>
                                        ${r.status !== 'paid' ? `<button class="text-blue-500 hover:underline text-xs font-bold mr-2" data-pay="${r.id}">입금</button>` : ''}
                                        <button class="text-slate-400 hover:text-red-300 text-xs" data-delete="${r.id}">삭제</button>
                                    </td>
                                </tr>`;
                            }).join('')}
                            ${receivables.length === 0 ? `<tr><td colspan="7" class="px-6 py-16 text-center text-slate-500">외상 데이터가 없습니다.</td></tr>` : ''}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;

        this.bindEvents(container, staff, receivables, currentStaffId);
    },

    bindEvents(container, staff, receivables, currentStaffId) {
        // 엑셀 내보내기
        document.getElementById('btn-export-credit').addEventListener('click', () => {
            ExcelExport.exportReceivables(receivables, staff);
        });

        // 기간 필터
        PeriodFilter.bindEvents(container, 'cr', (type, from, to) => {
            this.periodType = type;
            this.customFrom = from;
            this.customTo = to;
            App.renderPage('credit');
        });

        // 관리자 직원 필터
        container.querySelectorAll('.credit-filter').forEach(btn => {
            btn.addEventListener('click', () => {
                this.filterStaffId = btn.dataset.filterStaff || null;
                App.renderPage('credit');
            });
        });

        // 상태 필터
        container.querySelectorAll('.status-filter').forEach(btn => {
            btn.addEventListener('click', () => {
                this.filterStatus = btn.dataset.filterStatus || null;
                App.renderPage('credit');
            });
        });

        // 새 외상 등록
        document.getElementById('btn-new-credit').addEventListener('click', () => {
            App.showModal('새 외상 등록', `
                <div class="space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <label class="text-xs font-medium text-slate-400">날짜</label>
                            <input id="cr-date" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" type="date" value="${Format.today()}"/>
                        </div>
                        <div class="space-y-2">
                            <label class="text-xs font-medium text-slate-400">담당 직원</label>
                            ${Auth.isAdmin() ? `<select id="cr-staff" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm">
                                ${staff.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                            </select>` : `<input id="cr-staff" type="hidden" value="${currentStaffId}"/><p class="text-sm text-white mt-1">${staff.find(s => s.id === currentStaffId)?.name || '나'}</p>`}
                        </div>
                    </div>
                    <div class="space-y-2">
                        <label class="text-xs font-medium text-slate-400">손님명</label>
                        <input id="cr-customer" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" placeholder="손님 이름"/>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <label class="text-xs font-medium text-slate-400">외상 금액</label>
                            <input id="cr-amount" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono" placeholder="0" type="text"/>
                        </div>
                        <div class="space-y-2">
                            <label class="text-xs font-medium text-slate-400">약속 입금일</label>
                            <input id="cr-due" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" type="date"/>
                        </div>
                    </div>
                </div>
            `, async () => {
                const staffId = currentStaffId || await (async () => {
                    const session = Auth.getSession();
                    if (session) { const allStaff = await DB.getAll('staff'); const match = allStaff.find(s => s.name === session.name); return match ? match.id : null; }
                    return null;
                })();
                const data = {
                    date: document.getElementById('cr-date').value,
                    staff_id: Auth.isAdmin() ? document.getElementById('cr-staff').value : staffId,
                    customer: document.getElementById('cr-customer').value.trim(),
                    amount: Format.parseNumber(document.getElementById('cr-amount').value),
                    due_date: document.getElementById('cr-due').value,
                    status: 'unpaid',
                    paid_amount: 0,
                    entered_by: staffId
                };
                if (!data.customer || !data.amount) {
                    App.toast('손님명과 금액을 입력해주세요.', 'error');
                    return;
                }
                await DB.insert('receivables', data);
                DB.notifyChange();
                App.toast('외상이 등록되었습니다.', 'success');
                App.renderPage('credit');
            });
        });

        // 입금 처리
        container.querySelectorAll('[data-pay]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const rec = await DB.getById('receivables', btn.dataset.pay);
                if (!rec) return;
                const remaining = rec.amount - (rec.paid_amount || 0);

                App.showModal('입금 처리', `
                    <div class="space-y-4">
                        <p class="text-sm text-slate-400">${rec.customer} · 잔액: <span class="text-white font-bold">${Format.won(remaining)}</span></p>
                        <div class="space-y-2">
                            <label class="text-xs font-medium text-slate-400">입금 금액</label>
                            <input id="pay-amount" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono" placeholder="0" value="${Format.number(remaining)}"/>
                        </div>
                        <div class="space-y-2">
                            <label class="text-xs font-medium text-slate-400">입금 방식</label>
                            <select id="pay-method" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm">
                                <option value="transfer">이체</option>
                                <option value="card">카드</option>
                                <option value="cash">현금</option>
                            </select>
                        </div>
                    </div>
                `, async () => {
                    const payAmount = Format.parseNumber(document.getElementById('pay-amount').value);
                    const method = document.getElementById('pay-method').value;
                    if (payAmount <= 0) return;

                    await DB.insert('receivable_payments', {
                        receivable_id: rec.id,
                        amount: payAmount,
                        method: method,
                        paid_date: Format.today()
                    });

                    const newPaid = (rec.paid_amount || 0) + payAmount;
                    const newStatus = newPaid >= rec.amount ? 'paid' : 'partial';
                    await DB.update('receivables', rec.id, { paid_amount: newPaid, status: newStatus });
                    DB.notifyChange();

                    App.toast(`${Format.won(payAmount)} 입금 처리되었습니다.`, 'success');
                    App.renderPage('credit');
                });
            });
        });

        // 입금 이력 + 매출 전표 조회
        container.querySelectorAll('[data-history]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const rec = await DB.getById('receivables', btn.dataset.history);
                if (!rec) return;
                const recPayments = (await DB.getAll('receivable_payments')).filter(p => p.receivable_id === rec.id).sort((a, b) => (b.paid_date || '').localeCompare(a.paid_date || ''));
                const methodLabel = m => m === 'transfer' ? '이체' : m === 'card' ? '카드' : m === 'cash' ? '현금' : m || '-';
                const remaining = rec.amount - (rec.paid_amount || 0);
                const allStaff = await DB.getAll('staff');
                const staffObj = allStaff.find(s => s.id === rec.staff_id);

                let sale = rec.daily_sales_id ? await DB.getById('daily_sales', rec.daily_sales_id) : null;
                if (!sale) {
                    const allSales = await DB.getAll('daily_sales');
                    sale = allSales.find(s =>
                        s.date === rec.date && s.credit_items &&
                        s.credit_items.some(c => c.customer === rec.customer && Math.abs(c.amount - rec.amount) < 100)
                    );
                }

                let receiptHTML = '';
                const saleRooms = sale ? await DB.getSaleRooms(sale.id) : [];
                if (sale && saleRooms.length > 0) {
                    const creditRoom = saleRooms.find(r =>
                        r.pay_credit > 0 && r.credit_customer === rec.customer
                    );
                    const rooms = creditRoom ? [creditRoom] : saleRooms;

                    receiptHTML = `
                    <div class="border border-slate-700 rounded-xl overflow-hidden">
                        <div class="bg-slate-800/80 px-4 py-3 flex items-center justify-between">
                            <span class="text-sm font-bold text-white flex items-center gap-2">
                                <span class="material-symbols-outlined text-blue-400 text-base">receipt_long</span>
                                매출 전표 (${sale.date})
                            </span>
                            <span class="text-xs text-slate-400">${staffObj?.branch_name || ''} ${staffObj?.name || ''}</span>
                        </div>

                        ${rooms.map(r => `
                        <div class="px-4 py-3 border-t border-slate-800">
                            <div class="flex items-center justify-between mb-3">
                                <div class="flex items-center gap-2">
                                    <span class="bg-blue-500/20 text-blue-400 font-bold text-xs px-2 py-0.5 rounded">Room ${r.room_number || '?'}</span>
                                    <span class="text-sm text-white font-medium">${r.vip_name || '-'}</span>
                                </div>
                                <span class="text-xs text-slate-400">담당: ${r.staff_name || '-'}</span>
                            </div>

                            ${r.girls && r.girls.length > 0 ? `
                            <div class="mb-3">
                                <p class="text-xs text-pink-400 font-bold mb-1.5">아가씨</p>
                                <div class="space-y-1.5 pl-2">
                                    ${r.girls.map(g => `
                                    <div class="flex items-center justify-between text-sm">
                                        <span class="text-slate-200">${g.name || '?'}</span>
                                        <span class="text-slate-300 font-mono">${g.entry_time || '??:??'} ~ ${g.exit_time || '??:??'} <span class="text-blue-400 font-bold">${g.times || 0}T</span></span>
                                    </div>`).join('')}
                                </div>
                            </div>` : ''}

                            ${r.liquor_items && r.liquor_items.length > 0 ? `
                            <div class="mb-3">
                                <p class="text-xs text-emerald-400 font-bold mb-1.5">주류 (주대)</p>
                                <div class="space-y-1.5 pl-2">
                                    ${r.liquor_items.map(l => `
                                    <div class="flex items-center justify-between text-sm">
                                        <span class="text-slate-200">${l.name} ×${l.qty}${l.service ? ` (+서비스 ${l.service})` : ''}</span>
                                        <span class="text-white font-mono font-medium">${Format.number(l.subtotal || l.qty * l.price)}</span>
                                    </div>`).join('')}
                                </div>
                            </div>` : ''}

                            <div class="border-t border-slate-800/50 pt-2 mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                                <div><span class="text-slate-400">주대</span><p class="text-white font-mono font-bold text-sm">${Format.number(r.joodae || 0)}</p></div>
                                <div><span class="text-slate-400">T/C</span><p class="text-white font-mono font-bold text-sm">${Format.number(r.tc_amount || 0)}</p></div>
                                <div><span class="text-slate-400">룸 매출</span><p class="text-blue-400 font-mono font-bold text-sm">${Format.number(r.room_revenue || 0)}</p></div>
                            </div>

                            <div class="border-t border-slate-800/50 pt-2 mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-xs">
                                ${r.pay_cash ? `<div class="flex justify-between"><span class="text-slate-400">현금</span><span class="text-white font-mono">${Format.number(r.pay_cash)}</span></div>` : ''}
                                ${r.pay_card ? `<div class="flex justify-between"><span class="text-slate-400">카드</span><span class="text-white font-mono">${Format.number(r.pay_card)}</span></div>` : ''}
                                ${r.pay_borrowing ? `<div class="flex justify-between"><span class="text-slate-400">차용</span><span class="text-white font-mono">${Format.number(r.pay_borrowing)}</span></div>` : ''}
                                ${r.pay_credit ? `<div class="flex justify-between"><span class="text-red-300">외상</span><span class="text-red-300 font-mono font-bold">${Format.number(r.pay_credit)}</span></div>` : ''}
                                ${r.pay_other ? `<div class="flex justify-between"><span class="text-slate-400">기타</span><span class="text-white font-mono">${Format.number(r.pay_other)}</span></div>` : ''}
                            </div>
                        </div>`).join('')}

                        <div class="bg-slate-800/50 px-4 py-3 border-t border-slate-700 flex items-center justify-between">
                            <span class="text-xs text-slate-400">당일 총 매출</span>
                            <span class="text-base font-bold text-white">${Format.won(sale.total_revenue)}</span>
                        </div>
                    </div>`;
                }

                const html = `
                    <div class="space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar pr-1">
                        <div class="grid grid-cols-2 gap-3">
                            <div class="bg-slate-800/50 p-3 rounded-lg"><p class="text-xs text-slate-400">외상 금액</p><p class="text-lg font-bold text-white">${Format.won(rec.amount)}</p></div>
                            <div class="bg-slate-800/50 p-3 rounded-lg"><p class="text-xs text-slate-400">입금 합계</p><p class="text-lg font-bold text-emerald-400">${Format.won(rec.paid_amount || 0)}</p></div>
                            <div class="bg-slate-800/50 p-3 rounded-lg"><p class="text-xs text-slate-400">잔액</p><p class="text-lg font-bold ${remaining > 0 ? 'text-red-300' : 'text-white'}">${Format.won(remaining)}</p></div>
                            <div class="bg-slate-800/50 p-3 rounded-lg"><p class="text-xs text-slate-400">발생일 / 담당</p><p class="font-bold text-white text-sm">${rec.date} · ${staffObj?.name || '-'}</p></div>
                        </div>

                        ${receiptHTML || `
                        <div class="border border-slate-700 rounded-xl p-4 text-center">
                            <span class="material-symbols-outlined text-slate-600 text-3xl mb-1 block">receipt_long</span>
                            <p class="text-sm text-slate-500">연결된 정산 전표가 없습니다.</p>
                            <p class="text-xs text-slate-600">수동 등록된 외상이거나 정산 데이터가 삭제되었습니다.</p>
                        </div>`}

                        <h4 class="text-sm font-bold text-slate-400 uppercase tracking-wider pt-2">입금 이력</h4>
                        ${recPayments.length > 0 ? `<div class="space-y-2">${recPayments.map(p => `
                            <div class="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                                <div class="flex items-center gap-3">
                                    <span class="material-symbols-outlined text-emerald-400 text-lg">check_circle</span>
                                    <div>
                                        <p class="text-base font-bold text-white">${Format.won(p.amount)}</p>
                                        <p class="text-xs text-slate-400">${p.paid_date || '-'}</p>
                                    </div>
                                </div>
                                <span class="px-2.5 py-1 text-xs font-bold rounded ${p.method === 'transfer' ? 'bg-blue-500/10 text-blue-400' : p.method === 'card' ? 'bg-purple-500/10 text-purple-400' : 'bg-emerald-500/10 text-emerald-400'}">${methodLabel(p.method)}</span>
                            </div>
                        `).join('')}</div>` : '<p class="text-slate-400 text-center py-4 text-base">입금 이력이 없습니다.</p>'}
                    </div>`;
                App.showModal(`${rec.customer} 외상 상세`, html);
            });
        });

        // 삭제
        container.querySelectorAll('[data-delete]').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (confirm('이 외상 기록을 삭제하시겠습니까?')) {
                    await DB.delete('receivables', btn.dataset.delete);
                    DB.notifyChange();
                    App.toast('삭제되었습니다.', 'info');
                    App.renderPage('credit');
                }
            });
        });
    }
};

App.register('credit', CreditPage);
