// 지출 관리 페이지
const ExpensesPage = {
    filterBranch: null,
    filterStaffId: null,  // 하위 호환
    periodType: 'today',
    customFrom: null,
    customTo: null,

    async render(container) {
        const categories = await DB.getAll('expense_categories');
        let expenses = (await DB.getAll('expenses')).sort((a, b) => b.date.localeCompare(a.date));
        const isAdmin = Auth.isAdmin();
        const staff = await DB.getAll('staff');
        const range = PeriodFilter.getRange(this.periodType, this.customFrom, this.customTo);

        // 기간 필터 적용
        expenses = PeriodFilter.filterByDate(expenses, 'date', range.from, range.to);

        // 직원 로그인이면 본인 입력 지출만
        if (!isAdmin) {
            const staffId = await Auth.getStaffId();
            expenses = expenses.filter(e => e.entered_by === staffId);
        } else if (this.filterBranch) {
            const branchStaffIds = staff.filter(s => s.branch_name === this.filterBranch).map(s => s.id);
            expenses = expenses.filter(e => branchStaffIds.includes(e.entered_by));
        }

        // 지점 목록
        const branchNames = [...new Set(staff.map(s => s.branch_name).filter(Boolean))].sort();

        const periodTotal = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

        // 카테고리별 합계
        const catTotals = {};
        expenses.forEach(e => {
            const catId = e.category_id || 'uncategorized';
            catTotals[catId] = (catTotals[catId] || 0) + (Number(e.amount) || 0);
        });

        container.innerHTML = `
        <div class="max-w-[1600px] mx-auto p-4 md:p-6 space-y-6">
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 class="text-2xl font-bold text-white">지출 관리</h1>
                    <p class="text-slate-400 text-sm">항목별 지출을 입력하고 관리합니다.</p>
                </div>
                <div class="flex gap-2">
                    <button id="btn-export-expense" class="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs hover:bg-slate-700 transition-colors text-slate-300">
                        <span class="material-symbols-outlined text-sm">download</span> 엑셀
                    </button>
                    ${isAdmin ? `<button id="btn-manage-cat" class="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs hover:bg-slate-700 transition-colors">
                        <span class="material-symbols-outlined text-sm">settings</span> 카테고리 관리
                    </button>` : ''}
                    <button id="btn-add-expense" class="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-bold transition-colors">
                        <span class="material-symbols-outlined text-sm">add</span> 지출 입력
                    </button>
                </div>
            </div>

            <!-- 기간 필터 -->
            ${PeriodFilter.renderUI(this.periodType, this.customFrom, this.customTo, 'ep')}

            <!-- 관리자 지점 필터 -->
            ${isAdmin ? `<div class="flex flex-wrap gap-2 items-center">
                <button class="ep-branch-filter px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${!this.filterBranch ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}" data-branch="">전체</button>
                ${branchNames.map(bn => `<button class="ep-branch-filter px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${this.filterBranch === bn ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}" data-branch="${bn}">${bn}</button>`).join('')}
            </div>` : ''}

            <!-- 기간 요약 -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div class="bg-slate-900 p-4 md:p-5 rounded-xl border border-slate-800 col-span-2 md:col-span-1">
                    <p class="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">기간 총 지출</p>
                    <p class="text-xl md:text-2xl font-black text-white">${Format.won(periodTotal)}</p>
                </div>
                ${categories.slice(0, 3).map(cat => {
                    const total = catTotals[cat.id] || 0;
                    return `
                    <div class="bg-slate-900 p-4 md:p-5 rounded-xl border border-slate-800">
                        <p class="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">${cat.name}</p>
                        <p class="text-lg md:text-xl font-bold text-white">${Format.won(total)}</p>
                    </div>`;
                }).join('')}
            </div>

            <!-- 카테고리별 비율 -->
            <div class="bg-slate-900 p-4 md:p-6 rounded-xl border border-slate-800">
                <h3 class="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">카테고리별 지출 비율</h3>
                <div class="space-y-3">
                    ${categories.map(cat => {
                        const total = catTotals[cat.id] || 0;
                        const pct = periodTotal > 0 ? Math.round((total / periodTotal) * 100) : 0;
                        const colorClasses = ['blue-500', 'emerald-500', 'amber-300', 'purple-500', 'rose-500', 'cyan-500', 'orange-500', 'pink-500'];
                        const colorCls = colorClasses[categories.indexOf(cat) % colorClasses.length];
                        return `
                        <div class="flex items-center gap-3">
                            <span class="text-xs text-slate-400 w-32 md:w-40 truncate">${cat.name}</span>
                            <div class="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                                <div class="h-full bg-${colorCls} rounded-full" style="width:${pct}%"></div>
                            </div>
                            <span class="text-xs text-slate-500 w-16 text-right font-mono">${Format.number(total)}</span>
                            <span class="text-[10px] text-slate-600 w-10 text-right">${pct}%</span>
                        </div>`;
                    }).join('')}
                </div>
            </div>

            <!-- 지출 목록 -->
            <div class="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                <div class="p-4 border-b border-slate-800">
                    <h3 class="font-bold">지출 내역</h3>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm text-left whitespace-nowrap" style="white-space:nowrap;min-width:500px">
                        <thead class="bg-slate-800/50 text-[10px] text-slate-500 uppercase tracking-wider">
                            <tr>
                                <th class="px-4 md:px-6 py-3">날짜</th>
                                <th class="px-4 md:px-6 py-3">카테고리</th>
                                <th class="px-4 md:px-6 py-3 text-right">금액</th>
                                <th class="px-4 md:px-6 py-3 hidden sm:table-cell">메모</th>
                                <th class="px-4 md:px-6 py-3 text-right">작업</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-800">
                            ${expenses.slice(0, 30).map(e => {
                                const cat = categories.find(c => c.id === e.category_id);
                                return `
                                <tr class="hover:bg-slate-800/30">
                                    <td class="px-4 md:px-6 py-3 text-slate-400 font-mono">${e.date}</td>
                                    <td class="px-4 md:px-6 py-3 text-white">${cat ? cat.name : e.category_name || '-'}</td>
                                    <td class="px-4 md:px-6 py-3 text-right font-mono text-white">${Format.won(e.amount)}</td>
                                    <td class="px-4 md:px-6 py-3 text-slate-500 text-xs hidden sm:table-cell">${e.memo || '-'}</td>
                                    <td class="px-4 md:px-6 py-3 text-right">
                                        <button class="text-slate-400 hover:text-red-300 text-xs" data-delete-expense="${e.id}">삭제</button>
                                    </td>
                                </tr>`;
                            }).join('')}
                            ${expenses.length === 0 ? `<tr><td colspan="5" class="px-6 py-12 text-center text-slate-500">지출 내역이 없습니다.</td></tr>` : ''}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;

        this.bindEvents(container, categories, expenses);
    },

    bindEvents(container, categories, expenses) {
        // 엑셀 내보내기
        document.getElementById('btn-export-expense').addEventListener('click', () => {
            ExcelExport.exportExpenses(expenses, categories);
        });

        // 기간 필터
        PeriodFilter.bindEvents(container, 'ep', (type, from, to) => {
            this.periodType = type;
            this.customFrom = from;
            this.customTo = to;
            App.renderPage('expenses');
        });

        // 관리자 지점 필터
        container.querySelectorAll('.ep-branch-filter').forEach(btn => {
            btn.addEventListener('click', () => {
                this.filterBranch = btn.dataset.branch || null;
                App.renderPage('expenses');
            });
        });

        // 지출 입력
        document.getElementById('btn-add-expense').addEventListener('click', () => {
            App.showModal('지출 입력', `
                <div class="space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2"><label class="text-xs font-medium text-slate-400">날짜</label>
                            <input id="exp-date" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" type="date" value="${Format.today()}"/></div>
                        <div class="space-y-2"><label class="text-xs font-medium text-slate-400">카테고리</label>
                            <select id="exp-cat" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm">
                                ${categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                            </select></div>
                    </div>
                    <div class="space-y-2"><label class="text-xs font-medium text-slate-400">금액</label>
                        <input id="exp-amount" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono" placeholder="0"/></div>
                    <div class="space-y-2"><label class="text-xs font-medium text-slate-400">메모</label>
                        <input id="exp-memo" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" placeholder="선택사항"/></div>
                </div>
            `, async () => {
                const amount = Format.parseNumber(document.getElementById('exp-amount').value);
                if (!amount) { App.toast('금액을 입력해주세요.', 'error'); return; }
                const expStaffId = await Auth.getStaffId();
                if (!expStaffId && !Auth.isAdmin()) {
                    App.toast('직원 정보를 확인할 수 없습니다. 다시 로그인해주세요.', 'error');
                    return;
                }
                await DB.insert('expenses', {
                    date: document.getElementById('exp-date').value,
                    category_id: document.getElementById('exp-cat').value,
                    amount,
                    memo: document.getElementById('exp-memo').value.trim(),
                    entered_by: expStaffId
                });
                DB.notifyChange();
                App.toast('지출이 기록되었습니다.', 'success');
                App.renderPage('expenses');
            });
        });

        // 카테고리 관리 (관리자만)
        const manageCatBtn = document.getElementById('btn-manage-cat');
        if (manageCatBtn) manageCatBtn.addEventListener('click', async () => {
            const cats = await DB.getAll('expense_categories');
            App.showModal('지출 카테고리 관리', `
                <div class="space-y-3 max-h-60 overflow-y-auto custom-scrollbar mb-4">
                    ${cats.map(c => `
                    <div class="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg">
                        <span class="text-sm">${c.name} ${c.is_system ? '<span class="text-[10px] text-slate-600">(기본)</span>' : ''}</span>
                        ${!c.is_system ? `<button class="text-xs text-red-300 hover:underline" data-remove-cat="${c.id}">삭제</button>` : ''}
                    </div>`).join('')}
                </div>
                <div class="flex gap-2">
                    <input id="new-cat-name" class="flex-1 bg-slate-800 border-slate-700 rounded-lg text-sm" placeholder="새 카테고리명"/>
                    <button id="btn-save-cat" class="px-4 py-2 bg-blue-500 rounded-lg text-sm font-bold text-white">추가</button>
                </div>
            `);

            // 카테고리 추가
            setTimeout(() => {
                const saveBtn = document.getElementById('btn-save-cat');
                if (saveBtn) {
                    saveBtn.addEventListener('click', async () => {
                        const name = document.getElementById('new-cat-name').value.trim();
                        if (!name) return;
                        await DB.insert('expense_categories', { name, is_system: false });
                        App.toast('카테고리가 추가되었습니다.', 'success');
                        document.getElementById('app-modal').classList.add('hidden');
                        App.renderPage('expenses');
                    });
                }

                document.querySelectorAll('[data-remove-cat]').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        await DB.delete('expense_categories', btn.dataset.removeCat);
                        App.toast('삭제되었습니다.', 'info');
                        document.getElementById('app-modal').classList.add('hidden');
                        App.renderPage('expenses');
                    });
                });
            }, 100);
        });

        // 지출 삭제
        container.querySelectorAll('[data-delete-expense]').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (confirm('이 지출을 삭제하시겠습니까?')) {
                    await DB.delete('expenses', btn.dataset.deleteExpense);
                    DB.notifyChange();
                    App.toast('삭제되었습니다.', 'info');
                    App.renderPage('expenses');
                }
            });
        });
    }
};

App.register('expenses', ExpensesPage);
