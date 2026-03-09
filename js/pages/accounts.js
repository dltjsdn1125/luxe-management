// 계정 관리 페이지 (관리자 또는 지점 담당자)
const AccountsPage = {
    async _getBranchManagerBranches() {
        const staffId = await Auth.getStaffId();
        if (!staffId) return [];
        const branches = await DB.getAll('branches');
        return branches.filter(b => b.manager_id === staffId).map(b => b.name);
    },

    async render(container) {
        const isAdmin = Auth.isAdmin();
        const managerBranches = await this._getBranchManagerBranches();
        const isBranchManager = !isAdmin && managerBranches.length > 0;

        if (!isAdmin && !isBranchManager) {
            container.innerHTML = `<div class="flex items-center justify-center h-96"><p class="text-slate-500">관리자 또는 지점 담당자만 접근할 수 있습니다.</p></div>`;
            return;
        }

        const users = await DB.getAll('users');
        const staff = await DB.getAll('staff');

        // 계정 분류
        const adminAccounts = isAdmin ? users.filter(u => u.role === 'admin' || u.role === 'owner') : [];
        let staffAccounts = users.filter(u => u.role === 'staff');
        if (isBranchManager) {
            const branchStaffIds = new Set(staff.filter(s => managerBranches.includes(s.branch_name)).map(s => s.id));
            staffAccounts = staffAccounts.filter(u => u.staff_id && branchStaffIds.has(u.staff_id));
        }

        container.innerHTML = `
        <div class="max-w-[1200px] mx-auto p-4 md:p-6 space-y-6 md:space-y-8">
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 class="text-2xl font-bold text-white flex items-center gap-2">
                        <span class="material-symbols-outlined text-blue-500">manage_accounts</span> 계정 관리
                    </h1>
                    <p class="text-slate-400 text-sm">로그인 계정을 관리하고 비밀번호를 설정합니다.${isBranchManager ? ` <span class="text-blue-400">[${managerBranches.join(', ')}] 지점 담당</span>` : ''}</p>
                </div>
                ${isAdmin ? `<button id="btn-add-account" class="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors">
                    <span class="material-symbols-outlined text-sm">person_add</span> 계정 추가
                </button>` : ''}
            </div>

            <!-- 관리자 계정 (관리자만 표시) -->
            ${isAdmin ? `<div class="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                <div class="p-4 md:p-5 border-b border-slate-800 flex items-center gap-2">
                    <span class="material-symbols-outlined text-yellow-300 text-lg">shield</span>
                    <h3 class="font-bold text-white">관리자 계정</h3>
                    <span class="text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full ml-2">${adminAccounts.length}개</span>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm text-left whitespace-nowrap" style="white-space:nowrap;min-width:500px">
                        <thead class="bg-slate-800/50">
                            <tr>
                                <th class="px-4 md:px-6 py-3 font-semibold text-slate-400">이름</th>
                                <th class="px-4 md:px-6 py-3 font-semibold text-slate-400">아이디</th>
                                <th class="px-4 md:px-6 py-3 font-semibold text-slate-400">비밀번호</th>
                                <th class="px-4 md:px-6 py-3 font-semibold text-slate-400">역할</th>
                                <th class="px-4 md:px-6 py-3 font-semibold text-slate-400 text-right">작업</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-800">
                            ${adminAccounts.map(u => {
                                const roleLabel = u.role === 'owner' ? '오너' : '관리자';
                                const roleColor = u.role === 'owner' ? 'text-yellow-300 bg-yellow-300/10 border-yellow-300/20' : 'text-blue-500 bg-blue-500/10 border-blue-500/20';
                                return `
                                <tr class="hover:bg-slate-800/30 transition-colors">
                                    <td class="px-4 md:px-6 py-4">
                                        <div class="flex items-center gap-3">
                                            <div class="w-8 h-8 rounded-full bg-yellow-300/10 border border-yellow-300/20 flex items-center justify-center">
                                                <span class="material-symbols-outlined text-yellow-300 text-sm">admin_panel_settings</span>
                                            </div>
                                            <span class="font-medium text-white">${u.name}</span>
                                        </div>
                                    </td>
                                    <td class="px-4 md:px-6 py-4 font-mono text-slate-300">${u.username}</td>
                                    <td class="px-4 md:px-6 py-4">
                                        <span class="font-mono text-slate-500 password-mask" data-uid="${u.id}">••••••</span>
                                        <button class="ml-2 text-[10px] text-blue-500 hover:underline toggle-pw" data-uid="${u.id}" data-pw="${u.password}">보기</button>
                                    </td>
                                    <td class="px-4 md:px-6 py-4">
                                        <span class="px-2 py-1 text-[10px] font-bold rounded border ${roleColor}">${roleLabel}</span>
                                    </td>
                                    <td class="px-4 md:px-6 py-4 text-right">
                                        <button class="text-blue-500 hover:underline text-xs font-bold" data-edit-account="${u.id}">수정</button>
                                    </td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>` : ''}

            <!-- 직원 계정 -->
            <div class="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                <div class="p-4 md:p-5 border-b border-slate-800 flex items-center gap-2">
                    <span class="material-symbols-outlined text-blue-500 text-lg">badge</span>
                    <h3 class="font-bold text-white">직원 계정</h3>
                    <span class="text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full ml-2">${staffAccounts.length}개</span>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm text-left whitespace-nowrap" style="white-space:nowrap;min-width:600px">
                        <thead class="bg-slate-800/50">
                            <tr>
                                <th class="px-4 md:px-6 py-3 font-semibold text-slate-400">이름</th>
                                <th class="px-4 md:px-6 py-3 font-semibold text-slate-400">아이디</th>
                                <th class="px-4 md:px-6 py-3 font-semibold text-slate-400">비밀번호</th>
                                <th class="px-4 md:px-6 py-3 font-semibold text-slate-400 hidden sm:table-cell">연결 직원</th>
                                <th class="px-4 md:px-6 py-3 font-semibold text-slate-400 hidden sm:table-cell">직책</th>
                                <th class="px-4 md:px-6 py-3 font-semibold text-slate-400 text-right">작업</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-800">
                            ${staffAccounts.length > 0 ? staffAccounts.map(u => {
                                const linkedStaff = staff.find(s => s.id === u.staff_id);
                                const roleLabel = linkedStaff ? (linkedStaff.role === 'president' ? '영업사장' : linkedStaff.role === 'manager' ? '실장' : '스탭') : '-';
                                return `
                                <tr class="hover:bg-slate-800/30 transition-colors">
                                    <td class="px-4 md:px-6 py-4">
                                        <div class="flex items-center gap-3">
                                            <div class="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                                                <span class="text-blue-400 text-xs font-bold">${u.name.substring(0, 1)}</span>
                                            </div>
                                            <span class="font-medium text-white">${u.name}</span>
                                        </div>
                                    </td>
                                    <td class="px-4 md:px-6 py-4 font-mono text-slate-300">${u.username}</td>
                                    <td class="px-4 md:px-6 py-4">
                                        <span class="font-mono text-slate-500 password-mask" data-uid="${u.id}">••••••</span>
                                        <button class="ml-2 text-[10px] text-blue-500 hover:underline toggle-pw" data-uid="${u.id}" data-pw="${u.password}">보기</button>
                                    </td>
                                    <td class="px-4 md:px-6 py-4 text-slate-400 hidden sm:table-cell">${linkedStaff ? linkedStaff.name : '<span class="text-red-300">미연결</span>'}</td>
                                    <td class="px-4 md:px-6 py-4 hidden sm:table-cell">
                                        <span class="text-xs text-slate-500">${roleLabel}</span>
                                    </td>
                                    <td class="px-4 md:px-6 py-4 text-right space-x-2">
                                        <button class="text-blue-500 hover:underline text-xs font-bold" data-edit-account="${u.id}">수정</button>
                                        <button class="text-emerald-500 hover:underline text-xs font-bold" data-reset-pw="${u.id}">초기화</button>
                                        <button class="text-slate-400 hover:text-red-300 text-xs" data-delete-account="${u.id}">삭제</button>
                                    </td>
                                </tr>`;
                            }).join('') : `<tr><td colspan="6" class="px-6 py-12 text-center text-slate-500">등록된 직원 계정이 없습니다.</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- 안내사항 -->
            <div class="bg-slate-800/30 rounded-xl p-4 md:p-5 border border-slate-800">
                <div class="flex items-start gap-3">
                    <span class="material-symbols-outlined text-blue-500 mt-0.5">info</span>
                    <div class="text-sm text-slate-400 space-y-1">
                        <p><strong class="text-slate-300">직원 계정 자동 생성:</strong> 직원관리에서 새 직원을 등록하면 로그인 계정이 자동으로 생성됩니다.</p>
                        <p><strong class="text-slate-300">기본 비밀번호:</strong> 자동 생성 계정의 기본 비밀번호는 <code class="bg-slate-800 px-1.5 py-0.5 rounded text-blue-400">1234</code> 입니다.</p>
                        <p><strong class="text-slate-300">비밀번호 초기화:</strong> 직원 계정의 비밀번호를 1234로 되돌립니다.</p>
                    </div>
                </div>
            </div>
        </div>`;

        this.bindEvents(container, staff, staffAccounts, isAdmin, isBranchManager, managerBranches);
    },

    bindEvents(container, staff, staffAccounts, isAdmin, isBranchManager, managerBranches) {
        // 비밀번호 보기/숨기기
        container.querySelectorAll('.toggle-pw').forEach(btn => {
            btn.addEventListener('click', () => {
                const uid = btn.dataset.uid;
                const mask = container.querySelector(`.password-mask[data-uid="${uid}"]`);
                if (mask.textContent === '••••••') {
                    mask.textContent = btn.dataset.pw;
                    mask.className = 'font-mono text-white password-mask';
                    btn.textContent = '숨기기';
                } else {
                    mask.textContent = '••••••';
                    mask.className = 'font-mono text-slate-500 password-mask';
                    btn.textContent = '보기';
                }
            });
        });

        // 계정 수정
        const staffForModal = isBranchManager
            ? staff.filter(s => managerBranches.includes(s.branch_name))
            : staff;
        container.querySelectorAll('[data-edit-account]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const user = await DB.getById('users', btn.dataset.editAccount);
                if (!user) return;
                if (isBranchManager && user.role !== 'staff') return;
                if (isBranchManager && user.staff_id) {
                    const linkedStaff = staff.find(s => s.id === user.staff_id);
                    if (!linkedStaff || !managerBranches.includes(linkedStaff.branch_name)) return;
                }
                const isStaffAccount = user.role === 'staff';

                App.showModal('계정 수정', `
                    <div class="space-y-4">
                        <div class="space-y-2">
                            <label class="text-xs font-medium text-slate-400">이름</label>
                            <input id="acc-name" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" value="${user.name}"/>
                        </div>
                        <div class="space-y-2">
                            <label class="text-xs font-medium text-slate-400">아이디</label>
                            <input id="acc-username" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono" value="${user.username}"/>
                        </div>
                        <div class="space-y-2">
                            <label class="text-xs font-medium text-slate-400">새 비밀번호 <span class="text-slate-600">(변경 시에만 입력)</span></label>
                            <input id="acc-password" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono" placeholder="변경하지 않으려면 비워두세요" type="text"/>
                        </div>
                        ${!isStaffAccount ? `<div class="space-y-2">
                            <label class="text-xs font-medium text-slate-400">역할</label>
                            <select id="acc-role" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm">
                                <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>관리자</option>
                                <option value="owner" ${user.role === 'owner' ? 'selected' : ''}>오너</option>
                            </select>
                        </div>` : `<input id="acc-role" type="hidden" value="staff"/>`}
                        ${isStaffAccount ? `<div class="space-y-2">
                            <label class="text-xs font-medium text-slate-400">연결 직원</label>
                            <select id="acc-staff" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm">
                                <option value="">없음</option>
                                ${staffForModal.map(s => `<option value="${s.id}" ${s.id === user.staff_id ? 'selected' : ''}>${s.name}</option>`).join('')}
                            </select>
                        </div>` : ''}
                    </div>
                `, async () => {
                    const updates = {
                        name: document.getElementById('acc-name').value.trim(),
                        username: document.getElementById('acc-username').value.trim(),
                        role: document.getElementById('acc-role').value
                    };
                    const newPw = document.getElementById('acc-password').value;
                    if (newPw) updates.password = newPw;

                    const staffSelect = document.getElementById('acc-staff');
                    if (staffSelect) updates.staff_id = staffSelect.value || null;

                    if (!updates.name || !updates.username) {
                        App.toast('이름과 아이디를 입력해주세요.', 'error');
                        return;
                    }

                    // 아이디 중복 체크
                    const allUsers = await DB.getAll('users');
                    const duplicate = allUsers.find(u => u.username === updates.username && u.id !== user.id);
                    if (duplicate) {
                        App.toast('이미 사용 중인 아이디입니다.', 'error');
                        return;
                    }

                    const result = await DB.update('users', user.id, updates);
                    if (!result) {
                        App.toast('계정 수정에 실패했습니다.', 'error');
                        return;
                    }

                    // Supabase Auth 비밀번호도 동기화 시도
                    if (newPw && user.email) {
                        try {
                            await window._supabase.auth.signInWithPassword({
                                email: user.email,
                                password: user.password
                            });
                            await window._supabase.auth.updateUser({ password: newPw });
                        } catch (e) {
                            console.warn('Supabase Auth pw sync:', e.message);
                        }
                    }

                    App.toast('계정이 수정되었습니다.', 'success');
                    App.renderPage('accounts');
                });
            });
        });

        // 비밀번호 초기화 (지점 담당자도 가능)
        container.querySelectorAll('[data-reset-pw]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const user = await DB.getById('users', btn.dataset.resetPw);
                if (!user) return;
                if (confirm(`${user.name}(${user.username})의 비밀번호를 1234로 초기화하시겠습니까?`)) {
                    const result = await DB.update('users', user.id, { password: '1234' });
                    if (!result) {
                        App.toast('비밀번호 초기화에 실패했습니다.', 'error');
                        return;
                    }
                    if (user.email) {
                        try {
                            await window._supabase.auth.signInWithPassword({ email: user.email, password: user.password });
                            await window._supabase.auth.updateUser({ password: '1234' });
                        } catch (e) { console.warn('Auth pw reset sync:', e.message); }
                    }
                    App.toast(`${user.name}의 비밀번호가 1234로 초기화되었습니다.`, 'success');
                    App.renderPage('accounts');
                }
            });
        });

        // 계정 삭제 (지점 담당자: 본인 지점 직원만)
        container.querySelectorAll('[data-delete-account]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const user = await DB.getById('users', btn.dataset.deleteAccount);
                if (!user) return;
                if (isBranchManager) {
                    const linkedStaff = staff.find(s => s.id === user.staff_id);
                    if (!linkedStaff || !managerBranches.includes(linkedStaff.branch_name)) return;
                }
                if (confirm(`${user.name}(${user.username}) 계정을 삭제하시겠습니까?\n연결된 직원 데이터는 유지됩니다.`)) {
                    await DB.delete('users', user.id);
                    App.toast('계정이 삭제되었습니다.', 'info');
                    App.renderPage('accounts');
                }
            });
        });

        // 계정 추가 (관리자만)
        document.getElementById('btn-add-account')?.addEventListener('click', () => {
            App.showModal('새 계정 추가', `
                <div class="space-y-4">
                    <div class="space-y-2">
                        <label class="text-xs font-medium text-slate-400">이름</label>
                        <input id="acc-name" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" placeholder="표시 이름"/>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <label class="text-xs font-medium text-slate-400">아이디</label>
                            <input id="acc-username" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono" placeholder="로그인 ID"/>
                        </div>
                        <div class="space-y-2">
                            <label class="text-xs font-medium text-slate-400">비밀번호</label>
                            <input id="acc-password" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono" value="1234"/>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <label class="text-xs font-medium text-slate-400">역할</label>
                            <select id="acc-role" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm">
                                <option value="staff">직원</option>
                                <option value="admin">관리자</option>
                                <option value="owner">오너</option>
                            </select>
                        </div>
                        <div class="space-y-2">
                            <label class="text-xs font-medium text-slate-400">연결 직원</label>
                            <select id="acc-staff" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm">
                                <option value="">없음 (관리자용)</option>
                                ${staffForModal.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                </div>
            `, async () => {
                const name = document.getElementById('acc-name').value.trim();
                const username = document.getElementById('acc-username').value.trim();
                const password = document.getElementById('acc-password').value;
                const role = document.getElementById('acc-role').value;
                let staffId = document.getElementById('acc-staff').value || null;

                if (!name || !username || !password) {
                    App.toast('이름, 아이디, 비밀번호를 모두 입력해주세요.', 'error');
                    return;
                }

                // 아이디 중복 체크
                const allUsers = await DB.getAll('users');
                if (allUsers.find(u => u.username === username)) {
                    App.toast('이미 사용 중인 아이디입니다.', 'error');
                    return;
                }

                if (role === 'staff' && !staffId) {
                    const newStaff = await DB.insert('staff', {
                        name: name,
                        branch_name: '',
                        role: 'manager',
                        hire_date: new Date().toISOString().slice(0, 10),
                        pay_date: 25,
                        salary: 0,
                        incentive_rate: 15
                    });
                    staffId = newStaff.id;
                }

                const email = `${username.replace(/\s/g, '')}@luxemgmt.app`;

                // Supabase Auth에 등록 시도
                try {
                    await window._supabase.auth.signUp({
                        email,
                        password,
                        options: { data: { name, role, username } }
                    });
                } catch (e) { console.warn('Auth signUp:', e.message); }

                const newUser = await DB.insert('users', { name, username, password, email, role, staff_id: staffId });
                if (!newUser) {
                    App.toast('계정 생성에 실패했습니다.', 'error');
                    return;
                }
                App.toast('계정이 생성되었습니다.', 'success');
                App.renderPage('accounts');
            });
        });
    }
};

App.register('accounts', AccountsPage);
