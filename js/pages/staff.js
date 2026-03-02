// 직원 성과 관리 페이지
const StaffPage = {
    selectedStaffId: null,
    detailPeriodType: 'month',
    detailCustomFrom: null,
    detailCustomTo: null,

    async render(container) {
        let staff = await DB.getAll('staff');
        const isAdmin = Auth.isAdmin();

        if (!isAdmin) {
            const staffId = await Auth.getStaffId();
            staff = staff.filter(s => s.id === staffId);
            this.selectedStaffId = staffId;
        }

        if (!this.selectedStaffId && staff.length > 0) this.selectedStaffId = staff[0].id;
        const selected = staff.find(s => s.id === this.selectedStaffId);

        container.innerHTML = `
        <div class="max-w-[1600px] mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
            <aside class="lg:col-span-3 flex flex-col gap-4">
                <div class="flex items-center justify-between mb-2">
                    <h2 class="text-lg font-bold flex items-center gap-2">
                        <span class="material-symbols-outlined text-blue-500">groups</span> 직원 목록
                    </h2>
                    <div class="flex items-center gap-2">
                        <button id="btn-export-staff" class="text-xs text-slate-400 hover:text-white flex items-center gap-1" title="엑셀 내보내기">
                            <span class="material-symbols-outlined text-sm">download</span>
                        </button>
                        ${isAdmin ? '<button id="btn-add-staff" class="text-xs text-blue-500 hover:underline font-bold">+ 추가</button>' : ''}
                    </div>
                </div>

                <div class="space-y-2 overflow-y-auto max-h-[calc(100vh-200px)] custom-scrollbar">
                    ${staff.map(s => {
                        const isSelected = s.id === this.selectedStaffId;
                        const roleLabel = s.role === 'president' ? '영업사장' : s.role === 'manager' ? '실장' : '스탭';
                        const roleColor = s.role === 'president' ? 'text-yellow-300' : 'text-blue-500';
                        return `
                        <div class="p-4 ${isSelected ? 'bg-slate-800 border-blue-500/50 blue-glow ring-1 ring-blue-500/30' : 'bg-slate-900 border-slate-800 hover:bg-slate-800'} border rounded-xl cursor-pointer transition-all staff-card" data-id="${s.id}">
                            <div class="flex justify-between items-start mb-1">
                                <span class="text-xs font-bold ${roleColor} uppercase tracking-tighter">${roleLabel}</span>
                                ${isSelected ? '<span class="material-symbols-outlined text-xs text-blue-500">check_circle</span>' : ''}
                            </div>
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-full bg-slate-800 border ${isSelected ? 'border-blue-500/30' : 'border-slate-700'} flex items-center justify-center">
                                    <span class="material-symbols-outlined ${isSelected ? 'text-blue-500' : 'text-slate-500'}">person</span>
                                </div>
                                <div>
                                    <div class="font-bold ${isSelected ? 'text-white' : 'text-slate-300'}">${s.branch_name ? s.branch_name : s.name}</div>
                                    ${s.branch_name ? `<div class="text-[10px] text-blue-400 font-bold">${s.name}${s.role !== 'staff' ? ' 대표' : ''}</div>` : ''}
                                    <div class="text-[10px] text-slate-500">인센티브: ${s.incentive_rate}%</div>
                                </div>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </aside>

            <section class="lg:col-span-9 flex flex-col gap-6">
                ${selected ? await this.renderDetail(selected) : '<p class="text-slate-500 text-center py-20">직원을 선택해주세요.</p>'}
            </section>
        </div>`;

        this.bindEvents(container, staff);
    },

    async renderDetail(s) {
        const range = PeriodFilter.getRange(this.detailPeriodType, this.detailCustomFrom, this.detailCustomTo);
        const allWari = (await DB.getAll('wari')).filter(w => w.staff_id === s.id);
        const wariData = PeriodFilter.filterByDate(allWari, 'date', range.from, range.to);
        const allReceivables = (await DB.getAll('receivables')).filter(r => r.staff_id === s.id || r.entered_by === s.id);
        const receivables = PeriodFilter.filterByDate(allReceivables, 'date', range.from, range.to);

        const totalWari = wariData.reduce((sum, w) => sum + (Number(w.amount) || 0), 0);
        const totalRevenue = totalWari / (s.incentive_rate / 100 || 1);
        const outstandingCredit = receivables.filter(r => r.status !== 'paid').reduce((sum, r) => sum + (r.amount - (r.paid_amount || 0)), 0);
        const overdueCount = receivables.filter(r => r.status !== 'paid' && r.due_date && new Date(r.due_date) < new Date()).length;
        const roleLabel = s.role === 'president' ? '영업사장' : s.role === 'manager' ? '실장' : '스탭';

        const branchGirls = (await DB.getAll('girls')).filter(g => g.active && g.staff_id === s.id);

        return `
        <!-- 프로필 헤더 -->
        <div class="bg-slate-800 p-4 md:p-5 rounded-xl border border-slate-700 relative overflow-hidden">
            <div class="absolute right-0 top-0 opacity-10 pointer-events-none">
                <span class="material-symbols-outlined text-[120px] -mr-10 -mt-6">monitoring</span>
            </div>
            <div class="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <span class="px-2 py-0.5 bg-blue-500/20 text-blue-500 text-[10px] font-black uppercase rounded">${roleLabel}</span>
                    </div>
                    <h1 class="text-lg md:text-xl font-bold text-white tracking-tight flex items-center gap-2">
                        ${s.branch_name || s.name}
                    </h1>
                    <p class="text-slate-400 text-xs mt-0.5">${s.branch_name ? `<span class="text-blue-400 font-bold">${s.name}</span>${s.role !== 'staff' ? ' 대표' : ''} · ` : ''}입사일: ${s.hire_date || '-'} · 급여일: 매월 ${s.pay_date || '-'}일 · 급여: ${Format.won(s.salary)}</p>
                </div>
                <button class="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 rounded-lg text-xs transition-colors font-bold" data-edit-staff="${s.id}">
                    <span class="material-symbols-outlined text-xs">edit</span> 수정
                </button>
            </div>
        </div>

        <!-- 기간 필터 -->
        <div class="bg-slate-900/50 p-3 rounded-xl border border-slate-800">
            ${PeriodFilter.renderUI(this.detailPeriodType, this.detailCustomFrom, this.detailCustomTo, 'sd')}
        </div>

        <!-- 성과 카드 -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
            <div class="bg-slate-900 p-3 md:p-4 rounded-xl border border-slate-800">
                <div class="flex items-center gap-2 mb-2">
                    <div class="p-1.5 bg-blue-500/10 rounded-lg"><span class="material-symbols-outlined text-blue-500 text-base">payments</span></div>
                    <span class="text-slate-400 text-xs font-semibold">매출 기여</span>
                </div>
                <div class="text-base md:text-lg font-bold text-white">${Format.won(totalRevenue)}</div>
            </div>
            <div class="bg-slate-900 p-3 md:p-4 rounded-xl border border-slate-800">
                <div class="flex items-center gap-2 mb-2">
                    <div class="p-1.5 bg-yellow-300/10 rounded-lg"><span class="material-symbols-outlined text-yellow-300 text-base">rewarded_ads</span></div>
                    <span class="text-slate-400 text-xs font-semibold">와리 수령액</span>
                </div>
                <div class="text-base md:text-lg font-bold gold-gradient-text">${Format.won(totalWari)}</div>
            </div>
            <div class="bg-slate-900 p-3 md:p-4 rounded-xl border border-slate-800">
                <div class="flex items-center gap-2 mb-2">
                    <div class="p-1.5 bg-red-300/10 rounded-lg"><span class="material-symbols-outlined text-red-300 text-base">credit_card_off</span></div>
                    <span class="text-slate-400 text-xs font-semibold">외상 잔액</span>
                </div>
                <div class="text-base md:text-lg font-bold text-red-300">${Format.won(outstandingCredit)}</div>
                ${overdueCount > 0 ? `<div class="mt-1 text-[10px] text-red-300">연체: ${overdueCount}건</div>` : ''}
            </div>
        </div>

        <!-- 인센티브 설정 (와리율) -->
        <div class="bg-slate-900/50 p-3 md:p-4 rounded-xl border border-slate-800">
            <div class="flex items-center gap-2 mb-3">
                <span class="material-symbols-outlined text-yellow-300 text-base">settings</span>
                <h3 class="text-xs font-bold uppercase tracking-widest text-slate-400">와리율 설정</h3>
            </div>

            <p class="text-[10px] text-slate-600 mb-2">직원 와리율</p>
            <div class="flex items-center gap-3 p-2.5 bg-slate-800/50 rounded-lg border border-slate-700 mb-3">
                <div class="flex-1">
                    <div class="text-xs font-bold">${s.name} 와리율</div>
                    <div class="text-[10px] text-slate-500">매출 대비 인센티브</div>
                </div>
                <div class="flex items-center gap-1.5">
                    <input class="w-10 bg-slate-900 border-slate-700 rounded text-center text-xs focus:ring-blue-500 rate-input" data-field="incentive_rate" data-staff="${s.id}" type="text" value="${s.incentive_rate}"/>
                    <span class="text-xs font-bold text-slate-500">%</span>
                </div>
                <button class="px-3 py-1.5 bg-gradient-to-r from-yellow-300 to-yellow-400 text-slate-900 font-bold text-xs rounded-lg hover:shadow-lg transition-all btn-save-rate" data-staff="${s.id}">적용</button>
            </div>

            <p class="text-[10px] text-slate-600 mb-2 pt-2 border-t border-slate-800">아가씨 와리율</p>
            <div id="girl-rate-items" class="space-y-2">
                ${(() => {
                    if (branchGirls.length === 0) return '<p class="text-[10px] text-slate-600">소속 아가씨 없음</p>';
                    return branchGirls.map(g => `
                    <div class="flex items-center gap-3 p-2.5 bg-slate-800/50 rounded-lg border border-slate-700">
                        <span class="text-xs font-bold text-pink-400 flex-1">${g.name}</span>
                        <div class="flex items-center gap-1.5">
                            <input class="w-10 bg-slate-900 border-slate-700 rounded text-center text-xs focus:ring-blue-500 girl-rate-input" data-girl="${g.id}" type="text" value="${g.incentive_rate || 0}"/>
                            <span class="text-xs font-bold text-slate-500">%</span>
                        </div>
                        <button class="px-3 py-1.5 bg-gradient-to-r from-pink-400 to-pink-500 text-white font-bold text-xs rounded-lg hover:shadow-lg transition-all btn-save-girl-rate" data-girl="${g.id}">적용</button>
                    </div>`).join('');
                })()}
            </div>
        </div>

        <!-- 와리 내역 -->
        <div class="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <div class="p-3 border-b border-slate-800">
                <h3 class="text-sm font-bold">와리 지급 내역</h3>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-xs" style="white-space:nowrap">
                    <thead>
                        <tr class="bg-slate-800/50 text-slate-500 text-[10px] uppercase tracking-wider">
                            <th class="px-3 md:px-4 py-2.5 text-left">날짜</th>
                            <th class="px-3 md:px-4 py-2.5 text-right">금액</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-800">
                        ${wariData.length > 0 ? wariData.sort((a, b) => b.date.localeCompare(a.date)).map(w => `
                        <tr class="hover:bg-slate-800/30">
                            <td class="px-3 md:px-4 py-2.5 text-slate-400 font-mono">${w.date}</td>
                            <td class="px-3 md:px-4 py-2.5 text-right font-mono text-white">${Format.won(w.amount)}</td>
                        </tr>`).join('') : `<tr><td colspan="2" class="px-4 py-6 text-center text-slate-500">와리 내역이 없습니다.</td></tr>`}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- 외상 현황 -->
        <div class="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <div class="p-3 border-b border-slate-800">
                <h3 class="text-sm font-bold">외상 채권 현황</h3>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-xs" style="white-space:nowrap;min-width:400px">
                    <thead>
                        <tr class="bg-slate-800/50 text-slate-500 text-[10px] uppercase tracking-wider">
                            <th class="px-3 md:px-4 py-2.5 text-left">날짜</th>
                            <th class="px-3 md:px-4 py-2.5 text-left">손님</th>
                            <th class="px-3 md:px-4 py-2.5 text-right">금액</th>
                            <th class="px-3 md:px-4 py-2.5 text-right">잔액</th>
                            <th class="px-3 md:px-4 py-2.5 text-center">상태</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-800">
                        ${receivables.length > 0 ? receivables.sort((a, b) => b.date.localeCompare(a.date)).map(r => {
                            const isOverdue = r.status !== 'paid' && r.due_date && new Date(r.due_date) < new Date();
                            const statusLabel = r.status === 'paid' ? '완납' : r.status === 'partial' ? '부분입금' : '미입금';
                            const statusColor = r.status === 'paid' ? 'text-emerald-400' : isOverdue ? 'text-red-300' : 'text-amber-300';
                            return `
                            <tr class="hover:bg-slate-800/30 ${isOverdue ? 'bg-red-300/5' : ''}">
                                <td class="px-3 md:px-4 py-2.5 text-slate-400 font-mono">${r.date}</td>
                                <td class="px-3 md:px-4 py-2.5 text-white">${r.customer}</td>
                                <td class="px-3 md:px-4 py-2.5 text-right font-mono text-white">${Format.won(r.amount)}</td>
                                <td class="px-3 md:px-4 py-2.5 text-right font-mono ${statusColor}">${Format.won(r.amount - (r.paid_amount || 0))}</td>
                                <td class="px-3 md:px-4 py-2.5 text-center"><span class="text-[10px] font-bold ${statusColor}">${isOverdue ? '연체' : statusLabel}</span></td>
                            </tr>`;
                        }).join('') : `<tr><td colspan="5" class="px-4 py-6 text-center text-slate-500">외상 내역이 없습니다.</td></tr>`}
                    </tbody>
                </table>
            </div>
        </div>`;
    },

    bindEvents(container, staff) {
        const exportBtn = document.getElementById('btn-export-staff');
        if (exportBtn) {
            exportBtn.addEventListener('click', async () => {
                const staffExport = [];
                for (const s of staff) {
                    const wariData = (await DB.getAll('wari')).filter(w => w.staff_id === s.id);
                    const receivables = (await DB.getAll('receivables')).filter(r => (r.staff_id === s.id || r.entered_by === s.id) && r.status !== 'paid');
                    staffExport.push({
                        ...s,
                        totalWari: wariData.reduce((sum, w) => sum + (Number(w.amount) || 0), 0),
                        outstandingCredit: receivables.reduce((sum, r) => sum + (r.amount - (r.paid_amount || 0)), 0)
                    });
                }
                ExcelExport.exportStaffList(staffExport);
            });
        }

        container.querySelectorAll('.staff-card').forEach(card => {
            card.addEventListener('click', () => {
                this.selectedStaffId = card.dataset.id;
                this.detailPeriodType = 'month';
                this.detailCustomFrom = null;
                this.detailCustomTo = null;
                App.renderPage('staff');
            });
        });

        // 직원 상세 기간 필터
        PeriodFilter.bindEvents(container, 'sd', (type, from, to) => {
            this.detailPeriodType = type;
            this.detailCustomFrom = from;
            this.detailCustomTo = to;
            App.renderPage('staff');
        });

        const addStaffBtn = document.getElementById('btn-add-staff');
        if (addStaffBtn) addStaffBtn.addEventListener('click', () => {
            App.showModal('새 직원 등록', `
                <div class="space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <label class="text-xs font-medium text-slate-400">이름</label>
                            <input id="st-name" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" placeholder="이름"/>
                        </div>
                        <div class="space-y-2">
                            <label class="text-xs font-medium text-slate-400">지점명</label>
                            <input id="st-branch" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" placeholder="예: 강남점"/>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <label class="text-xs font-medium text-slate-400">직책</label>
                            <select id="st-role" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm">
                                <option value="president">영업사장</option>
                                <option value="manager" selected>실장</option>
                                <option value="staff">스탭</option>
                            </select>
                        </div>
                        <div class="space-y-2">
                            <label class="text-xs font-medium text-slate-400">입사일</label>
                            <input id="st-hire" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" type="date" value="${Format.today()}"/>
                        </div>
                    </div>
                    <div class="grid grid-cols-3 gap-4">
                        <div class="space-y-2">
                            <label class="text-xs font-medium text-slate-400">기본 급여</label>
                            <input id="st-salary" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono" placeholder="0"/>
                        </div>
                        <div class="space-y-2">
                            <label class="text-xs font-medium text-slate-400">급여일 (매월)</label>
                            <input id="st-paydate" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" type="number" min="1" max="31" value="25" placeholder="25"/>
                        </div>
                        <div class="space-y-2">
                            <label class="text-xs font-medium text-slate-400">인센티브율 (%)</label>
                            <input id="st-rate" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" type="number" value="15"/>
                        </div>
                    </div>
                </div>
            `, async () => {
                const name = document.getElementById('st-name').value.trim();
                if (!name) { App.toast('이름을 입력해주세요.', 'error'); return; }
                const newStaff = await DB.insert('staff', {
                    name,
                    branch_name: document.getElementById('st-branch').value.trim(),
                    role: document.getElementById('st-role').value,
                    hire_date: document.getElementById('st-hire').value,
                    pay_date: parseInt(document.getElementById('st-paydate').value) || 25,
                    salary: Format.parseNumber(document.getElementById('st-salary').value),
                    incentive_rate: parseInt(document.getElementById('st-rate').value) || 15
                });
                const account = await Auth.createStaffAccount(newStaff.id, name);
                App.toast(`직원 등록 완료! 로그인: ${account.username} / ${account.password}`, 'success');
                App.renderPage('staff');
            });
        });

        container.querySelectorAll('[data-edit-staff]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const s = await DB.getById('staff', btn.dataset.editStaff);
                if (!s) return;
                App.showModal('직원 정보 수정', `
                    <div class="space-y-4">
                        <div class="grid grid-cols-2 gap-4">
                            <div class="space-y-2">
                                <label class="text-xs font-medium text-slate-400">이름</label>
                                <input id="st-name" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" value="${s.name}"/>
                            </div>
                            <div class="space-y-2">
                                <label class="text-xs font-medium text-slate-400">지점명</label>
                                <input id="st-branch" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" value="${s.branch_name || ''}" placeholder="예: 강남점"/>
                            </div>
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div class="space-y-2">
                                <label class="text-xs font-medium text-slate-400">직책</label>
                                <select id="st-role" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm">
                                    <option value="president" ${s.role === 'president' ? 'selected' : ''}>영업사장</option>
                                    <option value="manager" ${s.role === 'manager' ? 'selected' : ''}>실장</option>
                                    <option value="staff" ${s.role === 'staff' ? 'selected' : ''}>스탭</option>
                                </select>
                            </div>
                            <div class="space-y-2">
                                <label class="text-xs font-medium text-slate-400">기본 급여</label>
                                <input id="st-salary" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono" value="${Format.number(s.salary)}"/>
                            </div>
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div class="space-y-2">
                                <label class="text-xs font-medium text-slate-400">급여일 (매월)</label>
                                <input id="st-paydate" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" type="number" min="1" max="31" value="${s.pay_date || 25}"/>
                            </div>
                            <div class="space-y-2">
                                <label class="text-xs font-medium text-slate-400">인센티브율 (%)</label>
                                <input id="st-rate" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" type="number" value="${s.incentive_rate}"/>
                            </div>
                        </div>
                    </div>
                `, async () => {
                    await DB.update('staff', s.id, {
                        name: document.getElementById('st-name').value.trim(),
                        branch_name: document.getElementById('st-branch').value.trim(),
                        role: document.getElementById('st-role').value,
                        salary: Format.parseNumber(document.getElementById('st-salary').value),
                        pay_date: parseInt(document.getElementById('st-paydate').value) || 25,
                        incentive_rate: parseInt(document.getElementById('st-rate').value) || 15
                    });
                    App.toast('직원 정보가 수정되었습니다.', 'success');
                    App.renderPage('staff');
                });
            });
        });

        container.querySelectorAll('.btn-save-rate').forEach(btn => {
            btn.addEventListener('click', async () => {
                const input = container.querySelector(`.rate-input[data-staff="${btn.dataset.staff}"]`);
                if (input) {
                    await DB.update('staff', btn.dataset.staff, { incentive_rate: parseInt(input.value) || 0 });
                    App.toast('직원 와리율이 적용되었습니다.', 'success');
                }
            });
        });

        container.querySelectorAll('.btn-save-girl-rate').forEach(btn => {
            btn.addEventListener('click', async () => {
                const input = container.querySelector(`.girl-rate-input[data-girl="${btn.dataset.girl}"]`);
                if (input) {
                    await DB.update('girls', btn.dataset.girl, { incentive_rate: parseInt(input.value) || 0 });
                    App.toast('아가씨 와리율이 적용되었습니다.', 'success');
                }
            });
        });
    }
};

App.register('staff', StaffPage);
