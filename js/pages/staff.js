// 직원 성과 관리 페이지 (v2 - 지점별 탭, 조직도, 출근표)
const StaffPage = {
    activeTab: 'org',          // 'org' | 'branch_detail' | 'attendance'
    selectedBranchName: null,
    selectedStaffId: null,
    detailPeriodType: 'month',
    detailCustomFrom: null,
    detailCustomTo: null,
    attendanceMonth: null,     // 'YYYY-MM'
    attendanceViewType: 'month', // 'month' | 'week' | 'day'
    dragState: null,

    async render(container) {
        const isAdmin = Auth.isAdmin();
        const allStaff = await DB.getAll('staff');
        const branches = await DB.getAll('branches');
        let staff = allStaff;

        if (!isAdmin) {
            const staffId = await Auth.getStaffId();
            const myStaff = allStaff.find(s => s.id === staffId);
            if (!myStaff || !myStaff.branch_name) {
                staff = staffId ? [allStaff.find(s => s.id === staffId)].filter(Boolean) : [];
            } else {
                staff = allStaff.filter(s => s.branch_name === myStaff.branch_name);
            }
        }

        if (!this.attendanceMonth) {
            this.attendanceMonth = Format.today().substring(0, 7);
        }

        // 지점 목록: 관리자는 전체, 지점계정은 본인 지점만
        const branchMap = new Map();
        if (isAdmin) {
            branches.forEach(b => branchMap.set(b.name, b));
            staff.forEach(s => {
                if (s.branch_name && !branchMap.has(s.branch_name)) {
                    branchMap.set(s.branch_name, { id: 'v_' + s.branch_name, name: s.branch_name });
                }
            });
        } else {
            const myBranch = staff[0]?.branch_name;
            if (myBranch) {
                const b = branches.find(x => x.name === myBranch) || { id: 'v_' + myBranch, name: myBranch };
                branchMap.set(myBranch, b);
            }
        }
        const branchList = [...branchMap.values()];

        if (!this.selectedBranchName && branchList.length > 0) {
            this.selectedBranchName = branchList[0].name;
        } else if (!isAdmin && staff[0]?.branch_name && this.selectedBranchName !== staff[0].branch_name) {
            this.selectedBranchName = staff[0].branch_name;
        }

        const tabs = [
            { id: 'org', label: '조직도', icon: 'account_tree' },
            { id: 'branch_detail', label: '직원 관리', icon: 'manage_accounts' },
            { id: 'attendance', label: '출근표', icon: 'calendar_month' },
        ];

        container.innerHTML = `
        <div class="max-w-[1600px] mx-auto p-4 md:p-6 space-y-4">
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                    <h1 class="text-2xl font-bold text-white flex items-center gap-2">
                        <span class="material-symbols-outlined text-blue-500">groups</span> 직원 관리
                    </h1>
                    <p class="text-slate-400 text-sm">지점별 직원 등록·관리 및 출근표를 확인합니다.</p>
                </div>
                <div class="flex gap-2">
                    <button id="btn-export-staff" class="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs hover:bg-slate-700 transition-colors text-slate-300">
                        <span class="material-symbols-outlined text-sm">download</span> 엑셀
                    </button>
                    ${isAdmin ? `<button id="btn-add-staff" class="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-bold transition-colors">
                        <span class="material-symbols-outlined text-sm">person_add</span> 직원 추가
                    </button>` : ''}
                </div>
            </div>

            <!-- 탭 -->
            <div class="flex overflow-x-auto scroll-hide border-b border-slate-800 -mx-4 px-4 md:mx-0 md:px-0">
                ${tabs.map(t => `
                    <button class="staff-main-tab flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${this.activeTab === t.id ? 'text-blue-500 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-200'}" data-tab="${t.id}">
                        <span class="material-symbols-outlined text-base">${t.icon}</span> ${t.label}
                    </button>
                `).join('')}
            </div>

            <!-- 지점 필터 (branch_detail, attendance 탭) -->
            ${this.activeTab !== 'org' ? `
            <div class="flex flex-wrap gap-2 items-center">
                <span class="text-xs text-slate-500 flex items-center gap-1"><span class="material-symbols-outlined text-sm">store</span>지점</span>
                ${branchList.map(b => `
                    <button class="branch-tab-btn px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${this.selectedBranchName === b.name ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}" data-branch="${b.name}">
                        ${b.name}
                    </button>
                `).join('')}
            </div>` : ''}

            <!-- 탭 콘텐츠 -->
            <div id="staff-tab-content"></div>
        </div>`;

        // 탭 콘텐츠 렌더
        const tabContent = container.querySelector('#staff-tab-content');
        if (this.activeTab === 'org') {
            await this._renderOrgChart(tabContent, staff, branchList, isAdmin);
        } else if (this.activeTab === 'branch_detail') {
            await this._renderBranchDetail(tabContent, staff, isAdmin);
        } else if (this.activeTab === 'attendance') {
            await this._renderAttendance(tabContent, staff, isAdmin);
        }

        this._bindMainEvents(container, staff, branchList, isAdmin);
    },

    // ─── 탭1: 조직도 ──────────────────────────────────────────────────────────
    async _renderOrgChart(container, staff, branchList, isAdmin) {
        // 지점별로 그룹핑
        const grouped = {};
        staff.forEach(s => {
            const bn = s.branch_name || '미배정';
            if (!grouped[bn]) grouped[bn] = [];
            grouped[bn].push(s);
        });

        const roleOrder = { president: 0, manager: 1, staff: 2, other: 3 };
        const roleLabel = r => r === 'president' ? '영업사장' : r === 'manager' ? '영업실장' : r === 'staff' ? '스탭' : '기타';
        const roleColor = r => r === 'president' ? 'border-blue-500 bg-blue-500/10 text-blue-300' : r === 'manager' ? 'border-blue-400 bg-blue-400/10 text-blue-300' : r === 'staff' ? 'border-slate-500 bg-slate-800 text-slate-300' : 'border-purple-400 bg-purple-400/10 text-purple-300';
        const roleIcon = r => r === 'president' ? 'star' : r === 'manager' ? 'badge' : r === 'staff' ? 'person' : 'person_pin';

        container.innerHTML = `
        <div class="space-y-6">
            <div class="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                <div class="flex items-center gap-2 mb-1">
                    <span class="material-symbols-outlined text-blue-500 text-sm">info</span>
                    <p class="text-xs text-slate-400">직원 카드를 드래그하여 지점 간 이동이 가능합니다. 우클릭으로 빠른 메뉴를 사용하세요.</p>
                </div>
                <div class="flex flex-wrap gap-3 mt-2">
                    <span class="flex items-center gap-1.5 text-xs text-blue-300"><span class="w-3 h-3 rounded-full bg-blue-500/30 border border-blue-500 inline-block"></span>영업사장</span>
                    <span class="flex items-center gap-1.5 text-xs text-blue-300"><span class="w-3 h-3 rounded-full bg-blue-400/30 border border-blue-400 inline-block"></span>영업실장</span>
                    <span class="flex items-center gap-1.5 text-xs text-slate-300"><span class="w-3 h-3 rounded-full bg-slate-700 border border-slate-500 inline-block"></span>스탭</span>
                    <span class="flex items-center gap-1.5 text-xs text-purple-300"><span class="w-3 h-3 rounded-full bg-purple-400/30 border border-purple-400 inline-block"></span>기타</span>
                </div>
            </div>

            <!-- 전체 조직도 -->
            <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6" id="org-branches-grid">
                ${Object.entries(grouped).map(([branchName, members]) => {
                    const sorted = [...members].sort((a, b) => (roleOrder[a.role] ?? 3) - (roleOrder[b.role] ?? 3));
                    const president = sorted.find(s => s.role === 'president');
                    const others = sorted.filter(s => s.role !== 'president');
                    return `
                    <div class="org-branch-card bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden" data-branch="${branchName}">
                        <div class="bg-slate-800/80 px-4 py-3 flex items-center justify-between border-b border-slate-700">
                            <div class="flex items-center gap-2">
                                <span class="material-symbols-outlined text-blue-400 text-lg">store</span>
                                <span class="font-bold text-white">${branchName}</span>
                                <span class="text-xs text-slate-500">(${members.length}명)</span>
                            </div>
                            ${isAdmin ? `<button class="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 btn-add-to-branch" data-branch="${branchName}">
                                <span class="material-symbols-outlined text-sm">person_add</span>추가
                            </button>` : ''}
                        </div>
                        <div class="p-4 space-y-3">
                            ${president ? `
                            <!-- 사장 -->
                            <div class="flex justify-center mb-2">
                                <div class="org-staff-card draggable-card border-2 ${roleColor('president')} rounded-xl p-3 w-full max-w-xs cursor-grab active:cursor-grabbing"
                                     draggable="${isAdmin ? 'true' : 'false'}"
                                     data-staff-id="${president.id}" data-branch="${branchName}">
                                    <div class="flex items-center gap-3">
                                        <div class="w-10 h-10 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center shrink-0">
                                            <span class="material-symbols-outlined text-blue-300 text-lg">star</span>
                                        </div>
                                        <div class="flex-1 min-w-0">
                                            <div class="flex items-center gap-1.5 mb-0.5">
                                                <span class="text-[10px] font-black text-blue-300 uppercase tracking-tight">영업사장</span>
                                            </div>
                                            <div class="font-bold text-white truncate">${president.name}</div>
                                            <div class="text-[10px] text-slate-500">인센티브 ${president.incentive_rate}%</div>
                                        </div>
                                        ${isAdmin ? `<div class="flex flex-col gap-1">
                                            <button class="p-1 hover:bg-slate-700 rounded btn-edit-staff-quick" data-id="${president.id}" title="수정"><span class="material-symbols-outlined text-slate-400 text-sm">edit</span></button>
                                            <button class="p-1 hover:bg-red-900/30 rounded btn-delete-staff" data-id="${president.id}" data-name="${president.name}" title="삭제"><span class="material-symbols-outlined text-red-400 text-sm">delete</span></button>
                                        </div>` : ''}
                                    </div>
                                </div>
                            </div>
                            <!-- 연결선 -->
                            ${others.length > 0 ? `<div class="flex justify-center"><div class="w-0.5 h-4 bg-slate-700"></div></div>` : ''}
                            ` : ''}

                            <!-- 나머지 직원들 -->
                            <div class="grid grid-cols-1 gap-2" id="org-members-${branchName.replace(/\s/g,'_')}">
                                ${others.map(s => `
                                <div class="org-staff-card draggable-card border ${roleColor(s.role)} rounded-xl p-2.5 cursor-grab active:cursor-grabbing"
                                     draggable="${isAdmin ? 'true' : 'false'}"
                                     data-staff-id="${s.id}" data-branch="${branchName}">
                                    <div class="flex items-center gap-2.5">
                                        <div class="w-8 h-8 rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center shrink-0">
                                            <span class="material-symbols-outlined text-slate-400 text-sm">${roleIcon(s.role)}</span>
                                        </div>
                                        <div class="flex-1 min-w-0">
                                            <div class="flex items-center gap-1.5">
                                                <span class="text-[10px] font-bold ${s.role === 'manager' ? 'text-blue-300' : s.role === 'other' ? 'text-purple-300' : 'text-slate-400'}">${roleLabel(s.role)}</span>
                                            </div>
                                            <div class="font-semibold text-white text-sm truncate">${s.name}</div>
                                        </div>
                                        ${isAdmin ? `<div class="flex gap-1">
                                            <button class="p-1 hover:bg-slate-700 rounded btn-edit-staff-quick" data-id="${s.id}" title="수정"><span class="material-symbols-outlined text-slate-400 text-sm">edit</span></button>
                                            <button class="p-1 hover:bg-red-900/30 rounded btn-delete-staff" data-id="${s.id}" data-name="${s.name}" title="삭제"><span class="material-symbols-outlined text-red-400 text-sm">delete</span></button>
                                        </div>` : ''}
                                    </div>
                                </div>`).join('')}
                                ${members.length === 0 ? `<p class="text-center text-slate-600 text-xs py-4">직원 없음</p>` : ''}
                            </div>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;

        if (isAdmin) this._bindDragDrop(container, staff);
        this._bindOrgEvents(container, staff, isAdmin);
    },

    _bindDragDrop(container, staff) {
        let draggedId = null;
        container.querySelectorAll('.draggable-card').forEach(card => {
            card.addEventListener('dragstart', e => {
                draggedId = card.dataset.staffId;
                card.classList.add('opacity-50', 'scale-95');
                e.dataTransfer.effectAllowed = 'move';
            });
            card.addEventListener('dragend', () => {
                card.classList.remove('opacity-50', 'scale-95');
                container.querySelectorAll('.org-branch-card').forEach(bc => bc.classList.remove('ring-2', 'ring-blue-500', 'bg-blue-500/5'));
            });
        });

        container.querySelectorAll('.org-branch-card').forEach(branchCard => {
            branchCard.addEventListener('dragover', e => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                branchCard.classList.add('ring-2', 'ring-blue-500', 'bg-blue-500/5');
            });
            branchCard.addEventListener('dragleave', () => {
                branchCard.classList.remove('ring-2', 'ring-blue-500', 'bg-blue-500/5');
            });
            branchCard.addEventListener('drop', async e => {
                e.preventDefault();
                branchCard.classList.remove('ring-2', 'ring-blue-500', 'bg-blue-500/5');
                const targetBranch = branchCard.dataset.branch;
                const s = staff.find(x => x.id === draggedId);
                if (!s || !draggedId || s.branch_name === targetBranch) return;
                if (!confirm(`${s.name}을(를) "${targetBranch}"(으)로 이동하시겠습니까?`)) return;
                await DB.update('staff', draggedId, { branch_name: targetBranch });
                App.toast(`${s.name}이(가) ${targetBranch}으로 이동되었습니다.`, 'success');
                App.renderPage('staff');
            });
        });
    },

    _bindOrgEvents(container, staff, isAdmin) {
        if (!isAdmin) return;
        container.querySelectorAll('.btn-edit-staff-quick').forEach(btn => {
            btn.addEventListener('click', () => this._showEditModal(btn.dataset.id, staff));
        });
        container.querySelectorAll('.btn-delete-staff').forEach(btn => {
            btn.addEventListener('click', () => this._confirmDelete(btn.dataset.id, btn.dataset.name));
        });
        container.querySelectorAll('.btn-add-to-branch').forEach(btn => {
            btn.addEventListener('click', () => {
                this.selectedBranchName = btn.dataset.branch;
                this._showAddModal(btn.dataset.branch);
            });
        });
    },

    // ─── 탭2: 지점별 직원 관리 ────────────────────────────────────────────────
    async _renderBranchDetail(container, staff, isAdmin) {
        const branchStaff = staff.filter(s => s.branch_name === this.selectedBranchName);
        const roleOrder = { president: 0, manager: 1, staff: 2, other: 3 };
        const roleLabel = r => r === 'president' ? '영업사장' : r === 'manager' ? '영업실장' : r === 'staff' ? '스탭' : '기타';
        const roleColorClass = r => r === 'president' ? 'text-blue-300 bg-blue-500/10' : r === 'manager' ? 'text-blue-300 bg-blue-400/10' : r === 'staff' ? 'text-slate-300 bg-slate-700' : 'text-purple-300 bg-purple-400/10';

        const sorted = [...branchStaff].sort((a, b) => (roleOrder[a.role] ?? 3) - (roleOrder[b.role] ?? 3));

        container.innerHTML = `
        <div class="space-y-4">
            <!-- 지점 요약 헤더 -->
            <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                    <h2 class="text-lg font-bold text-white flex items-center gap-2">
                        <span class="material-symbols-outlined text-blue-400">store</span>
                        ${this.selectedBranchName || '지점 선택'}
                    </h2>
                    <p class="text-sm text-slate-400 mt-0.5">총 ${branchStaff.length}명 등록</p>
                </div>
                ${isAdmin ? `<button class="btn-add-branch-staff flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-bold transition-colors" data-branch="${this.selectedBranchName}">
                    <span class="material-symbols-outlined text-sm">person_add</span> 직원 추가
                </button>` : ''}
            </div>

            ${!this.selectedBranchName ? `<p class="text-slate-500 text-center py-16">위에서 지점을 선택하세요.</p>` : `
            <!-- 직원 테이블 -->
            <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full text-sm" style="min-width:600px">
                        <thead>
                            <tr class="bg-slate-800/60 text-[10px] text-slate-500 uppercase tracking-wider">
                                <th class="px-4 py-3 text-left">직책</th>
                                <th class="px-4 py-3 text-left">이름</th>
                                <th class="px-4 py-3 text-left">입사일</th>
                                <th class="px-4 py-3 text-right">기본급</th>
                                <th class="px-4 py-3 text-right">인센티브율</th>
                                <th class="px-4 py-3 text-center">급여일</th>
                                ${isAdmin ? '<th class="px-4 py-3 text-center">관리</th>' : ''}
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-800">
                            ${sorted.length > 0 ? sorted.map(s => `
                            <tr class="hover:bg-slate-800/30 transition-colors">
                                <td class="px-4 py-3">
                                    <span class="px-2 py-0.5 rounded text-[10px] font-bold ${roleColorClass(s.role)}">${roleLabel(s.role)}</span>
                                </td>
                                <td class="px-4 py-3">
                                    <div class="font-semibold text-white">${s.name}</div>
                                </td>
                                <td class="px-4 py-3 text-slate-400 font-mono text-xs">${s.hire_date || '-'}</td>
                                <td class="px-4 py-3 text-right font-mono text-white">${Format.won(s.salary)}</td>
                                <td class="px-4 py-3 text-right">
                                    <span class="text-blue-300 font-bold">${s.incentive_rate}%</span>
                                </td>
                                <td class="px-4 py-3 text-center text-slate-400 text-xs">매월 ${s.pay_date || 25}일</td>
                                ${isAdmin ? `<td class="px-4 py-3 text-center">
                                    <div class="flex items-center justify-center gap-1">
                                        <button class="p-1.5 hover:bg-slate-700 rounded-lg btn-edit-staff-quick transition-colors" data-id="${s.id}" title="수정">
                                            <span class="material-symbols-outlined text-slate-400 text-sm">edit</span>
                                        </button>
                                        <button class="p-1.5 hover:bg-red-900/30 rounded-lg btn-delete-staff transition-colors" data-id="${s.id}" data-name="${s.name}" title="삭제">
                                            <span class="material-symbols-outlined text-red-400 text-sm">delete</span>
                                        </button>
                                    </div>
                                </td>` : ''}
                            </tr>`).join('') : `
                            <tr><td colspan="${isAdmin ? 7 : 6}" class="px-4 py-12 text-center text-slate-500">이 지점에 등록된 직원이 없습니다.</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- 직책별 요약 카드 -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                ${[
                    { role: 'president', label: '영업사장', color: 'blue', icon: 'star' },
                    { role: 'manager', label: '영업실장', color: 'blue', icon: 'badge' },
                    { role: 'staff', label: '스탭', color: 'slate', icon: 'person' },
                    { role: 'other', label: '기타', color: 'purple', icon: 'person_pin' },
                ].map(r => {
                    const cnt = branchStaff.filter(s => s.role === r.role).length;
                    return `<div class="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
                        <span class="material-symbols-outlined text-${r.color}-400 text-2xl">${r.icon}</span>
                        <div class="text-xl font-black text-white mt-1">${cnt}</div>
                        <div class="text-xs text-slate-500">${r.label}</div>
                    </div>`;
                }).join('')}
            </div>`}
        </div>`;

        if (isAdmin) {
            container.querySelectorAll('.btn-edit-staff-quick').forEach(btn => {
                btn.addEventListener('click', () => this._showEditModal(btn.dataset.id, staff));
            });
            container.querySelectorAll('.btn-delete-staff').forEach(btn => {
                btn.addEventListener('click', () => this._confirmDelete(btn.dataset.id, btn.dataset.name));
            });
            container.querySelectorAll('.btn-add-branch-staff').forEach(btn => {
                btn.addEventListener('click', () => this._showAddModal(btn.dataset.branch));
            });
        }
    },

    // ─── 탭3: 아가씨 출근표 ───────────────────────────────────────────────────
    async _renderAttendance(container, staff, isAdmin) {
        let girls = await DB.getAll('girls');

        // 지점 필터
        if (this.selectedBranchName) {
            const branchStaff = staff.filter(s => s.branch_name === this.selectedBranchName);
            const bsIds = branchStaff.map(s => s.id);
            girls = girls.filter(g => bsIds.includes(g.staff_id));
        }
        const girlIds = girls.map(g => g.id);

        // 해당 월 + 해당 아가씨만 직접 쿼리 (1000건 제한 우회)
        const month = this.attendanceMonth;
        const monthStart = month + '-01';
        const [yr, mo] = month.split('-').map(Number);
        const daysInMonth = new Date(yr, mo, 0).getDate();
        const monthEnd = month + '-' + String(daysInMonth).padStart(2, '0');

        let payments = [];
        if (girlIds.length > 0) {
            const { data, error } = await window._supabase
                .from('girl_payments')
                .select('*')
                .eq('_deleted', false)
                .in('girl_id', girlIds)
                .gte('date', monthStart)
                .lte('date', monthEnd);
            if (!error && data) payments = data;
        }

        const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

        // 날짜별 출근 맵: girlId -> Set of day numbers
        const attendanceMap = {};
        girls.forEach(g => { attendanceMap[g.id] = new Set(); });
        payments.forEach(p => {
            if (!p.date || !p.date.startsWith(month)) return;
            const day = parseInt(p.date.split('-')[2]);
            if (attendanceMap[p.girl_id]) attendanceMap[p.girl_id].add(day);
        });

        // 일별 합계 (몇 명 출근)
        const dailyTotal = {};
        days.forEach(d => {
            dailyTotal[d] = girls.filter(g => attendanceMap[g.id]?.has(d)).length;
        });

        const prevMonth = new Date(yr, mo - 2, 1);
        const nextMonth = new Date(yr, mo, 1);
        const prevStr = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
        const nextStr = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;

        // 요일 헤더 (1일의 요일 기준)
        const firstDow = new Date(yr, mo - 1, 1).getDay(); // 0=일
        const dowLabels = ['일', '월', '화', '수', '목', '금', '토'];

        container.innerHTML = `
        <div class="space-y-4">
            <!-- 헤더 -->
            <div class="flex items-center justify-between">
                <button id="att-prev-month" class="p-2 hover:bg-slate-800 rounded-lg transition-colors">
                    <span class="material-symbols-outlined text-slate-400">chevron_left</span>
                </button>
                <div class="text-center">
                    <h2 class="text-lg font-bold text-white">${yr}년 ${mo}월 아가씨 출근표</h2>
                    <p class="text-xs text-slate-500">${this.selectedBranchName || '전체'} · ${girls.length}명</p>
                </div>
                <button id="att-next-month" class="p-2 hover:bg-slate-800 rounded-lg transition-colors">
                    <span class="material-symbols-outlined text-slate-400">chevron_right</span>
                </button>
            </div>

            ${girls.length === 0 ? `<p class="text-center text-slate-500 py-16">이 지점에 등록된 아가씨가 없습니다.</p>` : `
            <!-- 출근표 그리드 -->
            <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="text-xs" style="min-width:${Math.max(700, daysInMonth * 32 + 160)}px">
                        <thead>
                            <tr class="bg-slate-800/80 text-slate-500">
                                <th class="sticky left-0 bg-slate-800 px-3 py-2.5 text-left font-bold z-10 border-r border-slate-700" style="min-width:100px">이름</th>
                                ${days.map(d => {
                                    const dow = new Date(yr, mo - 1, d).getDay();
                                    const isSun = dow === 0;
                                    const isSat = dow === 6;
                                    return `<th class="px-1 py-2 text-center font-medium ${isSun ? 'text-red-400' : isSat ? 'text-blue-400' : ''}" style="min-width:28px">
                                        <div>${d}</div>
                                        <div class="text-[9px] opacity-60">${dowLabels[dow]}</div>
                                    </th>`;
                                }).join('')}
                                <th class="px-3 py-2.5 text-right font-bold text-slate-400 border-l border-slate-700" style="min-width:60px">소계</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-800">
                            ${girls.map((g, gi) => {
                                const workDays = attendanceMap[g.id]?.size || 0;
                                return `
                                <tr class="hover:bg-slate-800/20 ${gi % 2 === 0 ? '' : 'bg-slate-900/50'}">
                                    <td class="sticky left-0 bg-slate-900 px-3 py-2 font-semibold text-white border-r border-slate-800 z-10" style="min-width:100px">
                                        <div class="truncate max-w-[90px]">${g.name}</div>
                                    </td>
                                    ${days.map(d => {
                                        const worked = attendanceMap[g.id]?.has(d);
                                        const dow = new Date(yr, mo - 1, d).getDay();
                                        const isSun = dow === 0;
                                        const dateStr = yr + '-' + String(mo).padStart(2,'0') + '-' + String(d).padStart(2,'0');
                                        return '<td class="px-0.5 py-1.5 text-center att-cell ' + (isSun ? 'bg-red-950/20 ' : '') + 'cursor-pointer hover:bg-slate-700/50" data-girl-id="' + g.id + '" data-girl-name="' + (g.name || '').replace(/"/g,'&quot;') + '" data-date="' + dateStr + '" data-worked="' + worked + '">' +
                                            (worked ? '<span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white font-bold text-[9px]">✓</span>' : '<span class="inline-block w-5 h-5 rounded-full bg-slate-800/50"></span>') +
                                        '</td>';
                                    }).join('')}
                                    <td class="px-3 py-2 text-right font-bold border-l border-slate-800">
                                        <span class="${workDays >= 25 ? 'text-emerald-400' : workDays >= 20 ? 'text-yellow-300' : 'text-slate-300'}">${workDays}일</span>
                                    </td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                        <tfoot>
                            <tr class="bg-slate-800/60 border-t-2 border-slate-700">
                                <td class="sticky left-0 bg-slate-800 px-3 py-2.5 font-bold text-slate-300 border-r border-slate-700 z-10">일별 합계</td>
                                ${days.map(d => {
                                    const cnt = dailyTotal[d] || 0;
                                    return `<td class="px-0.5 py-2 text-center">
                                        <span class="text-[10px] font-bold ${cnt > 0 ? 'text-blue-400' : 'text-slate-700'}">${cnt > 0 ? cnt : '-'}</span>
                                    </td>`;
                                }).join('')}
                                <td class="px-3 py-2.5 text-right font-black text-white border-l border-slate-700">
                                    ${girls.reduce((sum, g) => sum + (attendanceMap[g.id]?.size || 0), 0)}일
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            <!-- 출근 통계 요약 -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div class="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
                    <div class="text-2xl font-black text-white">${girls.length}</div>
                    <div class="text-xs text-slate-500 mt-0.5">총 인원</div>
                </div>
                <div class="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
                    <div class="text-2xl font-black text-emerald-400">${girls.filter(g => (attendanceMap[g.id]?.size || 0) >= 25).length}</div>
                    <div class="text-xs text-slate-500 mt-0.5">만근 (25일↑)</div>
                </div>
                <div class="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
                    <div class="text-2xl font-black text-yellow-300">${girls.length > 0 ? Math.round(girls.reduce((s, g) => s + (attendanceMap[g.id]?.size || 0), 0) / girls.length) : 0}</div>
                    <div class="text-xs text-slate-500 mt-0.5">평균 출근일</div>
                </div>
                <div class="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
                    <div class="text-2xl font-black text-blue-400">${girls.reduce((s, g) => s + (attendanceMap[g.id]?.size || 0), 0)}</div>
                    <div class="text-xs text-slate-500 mt-0.5">총 출근 누적</div>
                </div>
            </div>`}
        </div>`;

        document.getElementById('att-prev-month')?.addEventListener('click', () => {
            this.attendanceMonth = prevStr;
            App.renderPage('staff');
        });
        document.getElementById('att-next-month')?.addEventListener('click', () => {
            this.attendanceMonth = nextStr;
            App.renderPage('staff');
        });

        // 출근 저장: 셀 클릭 시 대기비 추가/삭제
        const enteredBy = await Auth.getStaffId();
        container.querySelectorAll('.att-cell').forEach(cell => {
            cell.addEventListener('click', async () => {
                if (!enteredBy && !Auth.isAdmin()) return;
                const girlId = cell.dataset.girlId;
                const girlName = cell.dataset.girlName;
                const date = cell.dataset.date;
                const worked = cell.dataset.worked === 'true';
                const girls = await DB.getAll('girls');
                const girl = girls.find(x => x.id === girlId);
                if (!girl) return;
                const standbyFee = girl.standby_fee || 150000;

                if (worked) {
                    const allPay = await DB.getAll('girl_payments');
                    const existing = allPay.find(p => p.girl_id === girlId && p.date === date && p.type === 'standby');
                    if (existing) {
                        await DB.delete('girl_payments', existing.id);
                        App.toast(girlName + ' ' + date + ' 출근 취소', 'success');
                    }
                } else {
                    await DB.insert('girl_payments', {
                        girl_id: girlId,
                        date,
                        type: 'standby',
                        amount: standbyFee,
                        memo: '출근표',
                        entered_by: enteredBy || undefined
                    });
                    App.toast(girlName + ' ' + date + ' 출근 저장', 'success');
                }
                App.renderPage('staff');
            });
        });
    },

    // ─── 공통 이벤트 바인딩 ───────────────────────────────────────────────────
    _bindMainEvents(container, staff, branchList, isAdmin) {
        // 탭 전환
        container.querySelectorAll('.staff-main-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                this.activeTab = btn.dataset.tab;
                App.renderPage('staff');
            });
        });

        // 지점 탭 전환
        container.querySelectorAll('.branch-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.selectedBranchName = btn.dataset.branch;
                App.renderPage('staff');
            });
        });

        // 직원 추가 버튼 (헤더)
        const addBtn = document.getElementById('btn-add-staff');
        if (addBtn) addBtn.addEventListener('click', () => this._showAddModal(this.selectedBranchName));

        // 엑셀 내보내기
        const exportBtn = document.getElementById('btn-export-staff');
        if (exportBtn) exportBtn.addEventListener('click', async () => {
            const staffExport = [];
            for (const s of staff) {
                const wariData = (await DB.getAll('wari')).filter(w => w.staff_id === s.id);
                staffExport.push({
                    ...s,
                    totalWari: wariData.reduce((sum, w) => sum + (Number(w.amount) || 0), 0),
                });
            }
            ExcelExport.exportStaffList(staffExport);
        });
    },

    // ─── 직원 추가 모달 ───────────────────────────────────────────────────────
    _showAddModal(branchName) {
        App.showModal('새 직원 등록', `
            <div class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">이름 *</label>
                        <input id="st-name" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500" placeholder="이름"/>
                    </div>
                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">지점명</label>
                        <input id="st-branch" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500" value="${branchName || ''}" placeholder="예: 강남 본점"/>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">직책 *</label>
                        <select id="st-role" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500">
                            <option value="president">영업사장</option>
                            <option value="manager" selected>영업실장</option>
                            <option value="staff">스탭</option>
                            <option value="other">기타</option>
                        </select>
                    </div>
                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">입사일</label>
                        <input id="st-hire" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" type="date" value="${Format.today()}"/>
                    </div>
                </div>
                <div class="grid grid-cols-3 gap-3">
                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">기본 급여</label>
                        <input id="st-salary" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono" placeholder="0"/>
                    </div>
                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">급여일 (매월)</label>
                        <input id="st-paydate" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" type="number" min="1" max="31" value="25"/>
                    </div>
                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">인센티브율 (%)</label>
                        <input id="st-rate" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" type="number" value="15"/>
                    </div>
                </div>
                <div class="bg-slate-800/50 rounded-lg p-3 text-xs text-slate-400">
                    <span class="material-symbols-outlined text-sm align-middle text-blue-400">info</span>
                    등록 시 자동으로 로그인 계정이 생성됩니다.
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
    },

    // ─── 직원 수정 모달 ───────────────────────────────────────────────────────
    async _showEditModal(staffId, staffList) {
        const s = staffList.find(x => x.id === staffId) || await DB.getById('staff', staffId);
        if (!s) return;
        App.showModal('직원 정보 수정', `
            <div class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">이름</label>
                        <input id="st-name" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" value="${s.name}"/>
                    </div>
                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">지점명</label>
                        <input id="st-branch" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" value="${s.branch_name || ''}"/>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">직책</label>
                        <select id="st-role" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm">
                            <option value="president" ${s.role === 'president' ? 'selected' : ''}>영업사장</option>
                            <option value="manager" ${s.role === 'manager' ? 'selected' : ''}>영업실장</option>
                            <option value="staff" ${s.role === 'staff' ? 'selected' : ''}>스탭</option>
                            <option value="other" ${s.role === 'other' ? 'selected' : ''}>기타</option>
                        </select>
                    </div>
                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">입사일</label>
                        <input id="st-hire" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" type="date" value="${s.hire_date || ''}"/>
                    </div>
                </div>
                <div class="grid grid-cols-3 gap-3">
                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">기본 급여</label>
                        <input id="st-salary" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono" value="${Format.number(s.salary)}"/>
                    </div>
                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">급여일</label>
                        <input id="st-paydate" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" type="number" min="1" max="31" value="${s.pay_date || 25}"/>
                    </div>
                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-slate-400">인센티브율 (%)</label>
                        <input id="st-rate" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" type="number" value="${s.incentive_rate}"/>
                    </div>
                </div>
            </div>
        `, async () => {
            await DB.update('staff', s.id, {
                name: document.getElementById('st-name').value.trim(),
                branch_name: document.getElementById('st-branch').value.trim(),
                role: document.getElementById('st-role').value,
                hire_date: document.getElementById('st-hire').value,
                salary: Format.parseNumber(document.getElementById('st-salary').value),
                pay_date: parseInt(document.getElementById('st-paydate').value) || 25,
                incentive_rate: parseInt(document.getElementById('st-rate').value) || 15
            });
            App.toast('직원 정보가 수정되었습니다.', 'success');
            App.renderPage('staff');
        });
    },

    // ─── 직원 삭제 확인 ───────────────────────────────────────────────────────
    async _confirmDelete(staffId, staffName) {
        App.showModal('직원 삭제', `
            <div class="text-center space-y-3">
                <span class="material-symbols-outlined text-red-400 text-5xl">warning</span>
                <p class="text-white font-bold">${staffName}</p>
                <p class="text-slate-400 text-sm">이 직원을 삭제하시겠습니까?<br>관련 데이터는 유지됩니다.</p>
            </div>
        `, async () => {
            await DB.update('staff', staffId, { active: false, _deleted: true });
            App.toast(`${staffName}이(가) 삭제되었습니다.`, 'success');
            App.renderPage('staff');
        });
    }
};

App.register('staff', StaffPage);
