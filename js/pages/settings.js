// 기초설정 관리 페이지 - 모든 세부사항 통합 관리
const SettingsPage = {
    activeTab: 'branch',
    filterBranch: null,      // branch name (for display/filtering records)
    filterBranchId: null,    // branch id (for branch_settings FK)

    tabs: [
        { id: 'branch', label: '지점 관리', icon: 'store' },
        { id: 'room', label: '룸/주대 설정', icon: 'meeting_room' },
        { id: 'liquor', label: '주류 등록', icon: 'liquor' },
        { id: 'staff_base', label: '직원 기초정보', icon: 'badge' },
        { id: 'girl_base', label: '아가씨 기초정보', icon: 'woman' },
        { id: 'wari', label: '와리 설정', icon: 'payments' },
        { id: 'expense_setup', label: '지출 항목 설정', icon: 'receipt' },
        { id: 'general', label: '일반/데이터', icon: 'tune' },
    ],

    async _getBranches() {
        const branches = await DB.getAll('branches');
        if (branches.length > 0) return branches;
        const map = new Map();
        const staffList = await DB.getAll('staff');
        staffList.forEach(s => {
            if (s.branch_name && !map.has(s.branch_name)) {
                map.set(s.branch_name, { id: 'virtual_' + s.branch_name, name: s.branch_name });
            }
        });
        return [...map.values()];
    },

    async _branchNames() {
        const branches = await this._getBranches();
        return branches.map(b => b.name);
    },

    async _renderBranchFilter() {
        const branches = await this._getBranches();
        if (branches.length === 0) return '';
        return `
        <div class="flex items-center gap-2 mb-4 pb-3 border-b border-slate-800/50 overflow-x-auto scroll-hide">
            <span class="text-xs text-slate-500 flex items-center gap-1 shrink-0"><span class="material-symbols-outlined text-sm">filter_alt</span>지점</span>
            <button class="branch-filter shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${!this.filterBranch ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}" data-branch="" data-branch-id="">전체</button>
            ${branches.map(b => `<button class="branch-filter shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${this.filterBranch === b.name ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}" data-branch="${b.name}" data-branch-id="${b.id}">${b.name}</button>`).join('')}
        </div>`;
    },

    _bindBranchFilter(el) {
        el.querySelectorAll('.branch-filter').forEach(btn => {
            btn.addEventListener('click', () => {
                this.filterBranch = btn.dataset.branch || null;
                this.filterBranchId = btn.dataset.branchId || null;
                const settingsContent = document.getElementById('settings-content');
                if (settingsContent) this._renderTab(settingsContent.parentElement);
            });
        });
    },

    async render(container) {
        container.innerHTML = `
        <div class="max-w-[1600px] mx-auto p-4 md:p-6 space-y-6">
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 class="text-2xl font-bold text-white flex items-center gap-2">
                        <span class="material-symbols-outlined text-blue-500">settings</span>
                        기초설정 관리
                    </h1>
                </div>
            </div>

            <div class="flex overflow-x-auto scroll-hide border-b border-slate-800 -mx-4 px-4 md:mx-0 md:px-0">
                ${this.tabs.map(t => `
                    <button class="settings-tab flex items-center gap-1.5 px-3 py-3 text-xs sm:text-sm font-medium whitespace-nowrap ${this.activeTab === t.id ? 'active text-blue-500' : 'text-slate-400 hover:text-slate-200'}" data-tab="${t.id}">
                        <span class="material-symbols-outlined text-base sm:text-lg">${t.icon}</span>
                        <span class="hidden sm:inline">${t.label}</span>
                    </button>
                `).join('')}
            </div>

            <div id="settings-content" class="settings-section"></div>
        </div>`;

        await this._renderTab(container);
        this._bindTabEvents(container);
    },

    _bindTabEvents(container) {
        container.querySelectorAll('.settings-tab').forEach(btn => {
            btn.addEventListener('click', async () => {
                this.activeTab = btn.dataset.tab;
                container.querySelectorAll('.settings-tab').forEach(b => {
                    b.classList.remove('active', 'text-blue-500');
                    b.classList.add('text-slate-400');
                });
                btn.classList.add('active', 'text-blue-500');
                btn.classList.remove('text-slate-400');
                await this._renderTab(container);
            });
        });
    },

    async _renderTab(container) {
        const el = document.getElementById('settings-content');
        if (!el) return;
        switch (this.activeTab) {
            case 'branch': await this._renderBranch(el); break;
            case 'room': await this._renderRoom(el); break;
            case 'liquor': await this._renderLiquor(el); break;
            case 'staff_base': await this._renderStaffBase(el); break;
            case 'girl_base': await this._renderGirlBase(el); break;
            case 'wari': await this._renderWari(el); break;
            case 'expense_setup': await this._renderExpenseSetup(el); break;
            case 'general': await this._renderGeneral(el); break;
        }
    },

    // ═══════════════════════════════════════════════
    //  1. 지점 관리
    // ═══════════════════════════════════════════════
    async _renderBranch(el) {
        const branches = await DB.getAll('branches');
        const staff = await DB.getAll('staff');

        el.innerHTML = `
        <div class="space-y-4">
            <div class="flex items-center justify-between gap-3">
                <div class="min-w-0">
                    <h2 class="text-lg font-bold text-white">지점 관리</h2>
                    <p class="text-xs text-slate-500 mt-1">운영 중인 지점 정보를 등록합니다.</p>
                </div>
                <button id="btn-add-branch" class="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-bold whitespace-nowrap shrink-0 transition-colors">
                    <span class="material-symbols-outlined text-sm">add</span> 추가
                </button>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                ${branches.map(b => {
                    const manager = staff.find(s => s.id === b.manager_id);
                    const branchStaff = staff.filter(s => s.branch_name === b.name);
                    return `
                    <div class="bg-slate-900 p-5 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors">
                        <div class="flex items-start justify-between mb-3">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                    <span class="material-symbols-outlined text-blue-400">store</span>
                                </div>
                                <div>
                                    <h3 class="font-bold text-white">${b.name}</h3>
                                    <p class="text-[10px] text-slate-500">${b.address || '주소 미등록'}</p>
                                </div>
                            </div>
                            <div class="flex gap-1">
                                <button class="text-slate-400 hover:text-blue-400 p-1" data-edit-branch="${b.id}" title="수정">
                                    <span class="material-symbols-outlined text-sm">edit</span></button>
                                <button class="text-slate-400 hover:text-red-300 p-1" data-del-branch="${b.id}" title="삭제">
                                    <span class="material-symbols-outlined text-sm">delete</span></button>
                            </div>
                        </div>
                        <div class="grid grid-cols-2 gap-2 text-xs">
                            <div class="bg-slate-800/50 rounded-lg p-2">
                                <p class="text-[10px] text-slate-500">담당자</p>
                                <p class="font-medium text-white">${manager?.name || b.manager_name || '-'}</p>
                            </div>
                            <div class="bg-slate-800/50 rounded-lg p-2">
                                <p class="text-[10px] text-slate-500">전화번호</p>
                                <p class="font-medium text-white">${b.phone || '-'}</p>
                            </div>
                            <div class="bg-slate-800/50 rounded-lg p-2">
                                <p class="text-[10px] text-slate-500">룸 수</p>
                                <p class="font-medium text-white">${b.room_count || 0}개</p>
                            </div>
                            <div class="bg-slate-800/50 rounded-lg p-2">
                                <p class="text-[10px] text-slate-500">직원 수</p>
                                <p class="font-medium text-white">${branchStaff.length}명</p>
                            </div>
                        </div>
                        ${b.memo ? `<p class="text-[10px] text-slate-600 mt-2">${b.memo}</p>` : ''}
                    </div>`;
                }).join('')}
                ${branches.length === 0 ? `
                <div class="col-span-full text-center py-16 text-slate-500">
                    <span class="material-symbols-outlined text-4xl mb-2 block">store</span>
                    <p class="text-sm">등록된 지점이 없습니다.</p>
                    <p class="text-xs text-slate-600 mt-1">위 "지점 추가" 버튼으로 지점을 등록하세요.</p>
                </div>` : ''}
            </div>
        </div>`;

        document.getElementById('btn-add-branch')?.addEventListener('click', () => this._showBranchModal(staff));
        el.querySelectorAll('[data-edit-branch]').forEach(btn => {
            btn.addEventListener('click', () => this._showBranchModal(staff, btn.dataset.editBranch));
        });
        el.querySelectorAll('[data-del-branch]').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (confirm('이 지점을 삭제하시겠습니까?')) {
                    await DB.delete('branches', btn.dataset.delBranch);
                    DB.notifyChange();
                    App.toast('삭제되었습니다.', 'info');
                    App.renderPage('settings');
                }
            });
        });
    },

    async _showBranchModal(staff, editId) {
        const ex = editId ? await DB.getById('branches', editId) : null;
        App.showModal(ex ? '지점 수정' : '지점 추가', `
            <div class="space-y-4">
                <div class="space-y-2"><label class="text-xs font-medium text-slate-400">지점명 *</label>
                    <input id="br-name" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" value="${ex?.name || ''}" placeholder="예: 강남 본점"/></div>
                <div class="space-y-2"><label class="text-xs font-medium text-slate-400">주소</label>
                    <input id="br-addr" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" value="${ex?.address || ''}" placeholder="예: 서울시 강남구..."/></div>
                <div class="grid grid-cols-2 gap-4">
                    <div class="space-y-2"><label class="text-xs font-medium text-slate-400">전화번호</label>
                        <input id="br-phone" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" value="${ex?.phone || ''}" placeholder="02-1234-5678"/></div>
                    <div class="space-y-2"><label class="text-xs font-medium text-slate-400">룸 수</label>
                        <input id="br-rooms" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" type="number" min="0" value="${ex?.room_count || ''}" placeholder="0"/></div>
                </div>
                <div class="space-y-2"><label class="text-xs font-medium text-slate-400">담당 매니저</label>
                    <select id="br-manager" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm">
                        <option value="">선택</option>
                        ${staff.map(s => `<option value="${s.id}" ${ex?.manager_id === s.id ? 'selected' : ''}>${s.name} (${s.branch_name || '미배정'})</option>`).join('')}
                    </select></div>
                <div class="space-y-2"><label class="text-xs font-medium text-slate-400">메모</label>
                    <input id="br-memo" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" value="${ex?.memo || ''}" placeholder="선택사항"/></div>
            </div>
        `, async () => {
            const name = document.getElementById('br-name').value.trim();
            if (!name) { App.toast('지점명을 입력해주세요.', 'error'); return; }
            const data = {
                name, address: document.getElementById('br-addr').value.trim(),
                phone: document.getElementById('br-phone').value.trim(),
                room_count: parseInt(document.getElementById('br-rooms').value) || 0,
                manager_id: document.getElementById('br-manager').value || null,
                manager_name: document.getElementById('br-manager').selectedOptions[0]?.text?.split(' (')[0] || '',
                memo: document.getElementById('br-memo').value.trim()
            };
            if (ex) { await DB.update('branches', editId, data); App.toast('수정되었습니다.', 'success'); }
            else { await DB.insert('branches', data); App.toast('지점이 추가되었습니다.', 'success'); }
            DB.notifyChange();
            App.renderPage('settings');
        });
    },

    // ═══════════════════════════════════════════════
    //  2. 룸/주대 설정
    // ═══════════════════════════════════════════════
    async _renderRoom(el) {
        const fb = this.filterBranch;
        const tcUnit = await this._getBranchSetting('tc_unit_price') || 100000;
        let roomTypes = await DB.getAll('room_types');
        if (fb) roomTypes = roomTypes.filter(rt => !rt.branch_name || rt.branch_name === fb);

        const roomBaseFee = await this._getBranchSetting('room_base_fee') || 0;
        const serviceChargeRate = await this._getBranchSetting('service_charge_rate') || 0;
        const vatRate = await this._getBranchSetting('vat_rate') || 0;
        const branchFilterHtml = await this._renderBranchFilter();

        el.innerHTML = `
        <div class="space-y-6">
            <div>
                <h2 class="text-lg font-bold text-white">룸 / 주대 설정</h2>
                <p class="text-xs text-slate-500 mt-1">T/C 단가, 룸 타입별 기본 요금 등을 설정합니다. ${fb ? `<span class="text-blue-400 font-bold">[${fb}]</span>` : '<span class="text-slate-600">(전체 공통)</span>'}</p>
            </div>

            ${branchFilterHtml}

            <div class="bg-slate-900 rounded-2xl border border-slate-800 p-4 md:p-6">
                <h3 class="font-bold text-sm text-white mb-4 flex items-center gap-2">
                    <span class="material-symbols-outlined text-amber-400 text-lg">attach_money</span>
                    핵심 요금 설정 ${fb ? `<span class="text-xs text-blue-400 font-normal ml-2">${fb} 전용</span>` : ''}
                </h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div class="space-y-2">
                        <label class="text-xs font-medium text-slate-400">T/C 단가 (1타임)</label>
                        <input id="room-tc-unit" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono" value="${tcUnit}" placeholder="100000"/>
                        <p class="text-[10px] text-slate-600">아가씨 1타임 당 요금</p>
                    </div>
                    <div class="space-y-2">
                        <label class="text-xs font-medium text-slate-400">기본 룸비</label>
                        <input id="room-base-fee" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono" value="${roomBaseFee}" placeholder="0"/>
                        <p class="text-[10px] text-slate-600">룸 기본 이용료 (없으면 0)</p>
                    </div>
                    <div class="space-y-2">
                        <label class="text-xs font-medium text-slate-400">봉사료율 (%)</label>
                        <input id="room-service-rate" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono" type="number" min="0" max="100" value="${serviceChargeRate}" placeholder="0"/>
                        <p class="text-[10px] text-slate-600">주대에 대한 봉사료</p>
                    </div>
                    <div class="space-y-2">
                        <label class="text-xs font-medium text-slate-400">부가세율 (%)</label>
                        <input id="room-vat-rate" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono" type="number" min="0" max="100" value="${vatRate}" placeholder="0"/>
                        <p class="text-[10px] text-slate-600">세금 포함 여부</p>
                    </div>
                </div>
                <button id="btn-save-room-fees" class="mt-4 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-bold transition-colors">요금 설정 저장</button>
            </div>

            <div class="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                <div class="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                    <h3 class="font-bold text-sm text-white flex items-center gap-2">
                        <span class="material-symbols-outlined text-blue-400 text-lg">meeting_room</span>
                        룸 타입 관리
                    </h3>
                    <button id="btn-add-room-type" class="flex items-center gap-1 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-bold whitespace-nowrap shrink-0">
                        <span class="material-symbols-outlined text-xs">add</span> 추가
                    </button>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[550px]">
                        <thead class="bg-slate-800/50 text-[10px] text-slate-500 uppercase tracking-wider">
                            <tr>
                                <th class="px-4 py-2 text-left">타입명</th>
                                ${!fb ? '<th class="px-4 py-2 text-left">지점</th>' : ''}
                                <th class="px-4 py-2 text-right">기본 주대</th>
                                <th class="px-4 py-2 text-right">최소 주문</th>
                                <th class="px-4 py-2 text-right">수용 인원</th>
                                <th class="px-4 py-2 text-center">설명</th>
                                <th class="px-4 py-2 text-right">작업</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-800">
                            ${roomTypes.map(rt => `
                            <tr class="hover:bg-slate-800/30">
                                <td class="px-4 py-3 text-white font-medium">${rt.name}</td>
                                ${!fb ? `<td class="px-4 py-3 text-xs text-slate-400">${rt.branch_name || '<span class="text-slate-600">공통</span>'}</td>` : ''}
                                <td class="px-4 py-3 text-right font-mono">${Format.won(rt.base_charge)}</td>
                                <td class="px-4 py-3 text-right font-mono text-slate-400">${rt.min_order ? Format.won(rt.min_order) : '-'}</td>
                                <td class="px-4 py-3 text-right text-slate-400">${rt.capacity || '-'}명</td>
                                <td class="px-4 py-3 text-center text-slate-500 text-xs">${rt.description || '-'}</td>
                                <td class="px-4 py-3 text-right">
                                    <div class="flex justify-end gap-2">
                                        <button class="text-slate-400 hover:text-blue-400 text-xs" data-edit-rt="${rt.id}">수정</button>
                                        <button class="text-slate-400 hover:text-red-300 text-xs" data-del-rt="${rt.id}">삭제</button>
                                    </div>
                                </td>
                            </tr>`).join('')}
                            ${roomTypes.length === 0 ? `<tr><td colspan="${fb ? 6 : 7}" class="px-4 py-8 text-center text-slate-600 text-xs">등록된 룸 타입이 없습니다.</td></tr>` : ''}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;

        this._bindBranchFilter(el);
        document.getElementById('btn-save-room-fees')?.addEventListener('click', async () => {
            await this._saveBranchSetting('tc_unit_price', Format.parseNumber(document.getElementById('room-tc-unit').value) || 100000);
            await this._saveBranchSetting('room_base_fee', Format.parseNumber(document.getElementById('room-base-fee').value) || 0);
            await this._saveBranchSetting('service_charge_rate', parseFloat(document.getElementById('room-service-rate').value) || 0);
            await this._saveBranchSetting('vat_rate', parseFloat(document.getElementById('room-vat-rate').value) || 0);
            DB.notifyChange();
            App.toast(`요금 설정이 저장되었습니다.${fb ? ' (' + fb + ')' : ''}`, 'success');
        });

        document.getElementById('btn-add-room-type')?.addEventListener('click', () => this._showRoomTypeModal());
        el.querySelectorAll('[data-edit-rt]').forEach(btn => btn.addEventListener('click', () => this._showRoomTypeModal(btn.dataset.editRt)));
        el.querySelectorAll('[data-del-rt]').forEach(btn => btn.addEventListener('click', async () => {
            if (confirm('삭제하시겠습니까?')) { await DB.delete('room_types', btn.dataset.delRt); DB.notifyChange(); App.renderPage('settings'); }
        }));
    },

    async _showRoomTypeModal(editId) {
        const ex = editId ? await DB.getById('room_types', editId) : null;
        const branchNames = await this._branchNames();
        const defaultBranch = this.filterBranch || ex?.branch_name || '';
        App.showModal(ex ? '룸 타입 수정' : '룸 타입 추가', `
            <div class="space-y-4">
                <div class="space-y-2"><label class="text-xs font-medium text-slate-400">타입명 *</label>
                    <input id="rt-name" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" value="${ex?.name || ''}" placeholder="예: VIP룸, 일반룸, 스탠딩"/></div>
                <div class="space-y-2"><label class="text-xs font-medium text-slate-400">소속 지점 <span class="text-slate-600">(비우면 공통)</span></label>
                    <select id="rt-branch" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm">
                        <option value="">공통 (전 지점)</option>
                        ${branchNames.map(n => `<option value="${n}" ${defaultBranch === n ? 'selected' : ''}>${n}</option>`).join('')}
                    </select></div>
                <div class="grid grid-cols-2 gap-4">
                    <div class="space-y-2"><label class="text-xs font-medium text-slate-400">기본 주대</label>
                        <input id="rt-charge" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono" value="${ex?.base_charge || ''}" placeholder="0"/></div>
                    <div class="space-y-2"><label class="text-xs font-medium text-slate-400">최소 주문 금액</label>
                        <input id="rt-min" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono" value="${ex?.min_order || ''}" placeholder="0"/></div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div class="space-y-2"><label class="text-xs font-medium text-slate-400">수용 인원</label>
                        <input id="rt-cap" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" type="number" min="0" value="${ex?.capacity || ''}" placeholder="0"/></div>
                    <div class="space-y-2"><label class="text-xs font-medium text-slate-400">설명</label>
                        <input id="rt-desc" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" value="${ex?.description || ''}" placeholder="선택사항"/></div>
                </div>
            </div>
        `, async () => {
            const name = document.getElementById('rt-name').value.trim();
            if (!name) { App.toast('타입명을 입력해주세요.', 'error'); return; }
            const data = { name, branch_name: document.getElementById('rt-branch').value || null,
                base_charge: Format.parseNumber(document.getElementById('rt-charge').value) || 0,
                min_order: Format.parseNumber(document.getElementById('rt-min').value) || 0,
                capacity: parseInt(document.getElementById('rt-cap').value) || 0,
                description: document.getElementById('rt-desc').value.trim() };
            if (ex) { await DB.update('room_types', editId, data); } else { await DB.insert('room_types', data); }
            DB.notifyChange(); App.toast('저장되었습니다.', 'success'); App.renderPage('settings');
        });
    },

    // ═══════════════════════════════════════════════
    //  3. 주류 등록 관리
    // ═══════════════════════════════════════════════
    async _renderLiquor(el) {
        const fb = this.filterBranch;
        let liquors = await DB.getAll('liquor');
        if (fb) liquors = liquors.filter(l => !l.branch_name || l.branch_name === fb);
        const liquorCats = await DB.getAll('liquor_categories');
        const branchFilterHtml = await this._renderBranchFilter();

        el.innerHTML = `
        <div class="space-y-4">
            <div class="flex items-center justify-between gap-3">
                <div class="min-w-0">
                    <h2 class="text-lg font-bold text-white">주류 등록 관리</h2>
                    <p class="text-xs text-slate-500 mt-1">등록된 주류는 일일정산 룸별 주류 선택, 재고 관리, 발주에 사용됩니다.</p>
                </div>
                <div class="flex gap-2 shrink-0">
                    <button id="btn-manage-lq-cat" class="flex items-center gap-1.5 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 hover:bg-slate-700 transition-colors">
                        <span class="material-symbols-outlined text-sm">category</span> 관리
                    </button>
                    <button id="btn-add-liquor-s" class="flex items-center gap-1.5 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition-colors">
                        <span class="material-symbols-outlined text-sm">add</span> 추가
                    </button>
                </div>
            </div>

            ${branchFilterHtml}

            <div class="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                <div class="overflow-x-auto">
                <table class="w-full text-sm text-left min-w-[600px]">
                    <thead class="bg-slate-800/50 text-[10px] text-slate-500 uppercase tracking-wider">
                        <tr>
                            <th class="px-4 py-3">주종명</th>
                            <th class="px-4 py-3">분류</th>
                            ${!fb ? '<th class="px-4 py-3">지점</th>' : ''}
                            <th class="px-4 py-3 text-right">원가</th>
                            <th class="px-4 py-3 text-right">판매가</th>
                            <th class="px-4 py-3 text-right">마진</th>
                            <th class="px-4 py-3 text-right">작업</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-800">
                        ${liquors.length === 0 ? `<tr><td colspan="${fb ? 6 : 7}" class="px-4 py-12 text-center text-slate-500">등록된 주류가 없습니다.</td></tr>` : ''}
                        ${liquors.map(l => {
                            const margin = (l.sell_price || 0) - (l.cost_price || 0);
                            const marginPct = l.sell_price > 0 ? Math.round((margin / l.sell_price) * 100) : 0;
                            const cat = liquorCats.find(c => c.id === l.category_id);
                            return `
                            <tr class="hover:bg-slate-800/30">
                                <td class="px-4 py-3 text-white font-medium">${l.name}</td>
                                <td class="px-4 py-3 text-slate-400 text-xs">${cat?.name || l.category || '-'}</td>
                                ${!fb ? `<td class="px-4 py-3 text-xs text-slate-400">${l.branch_name || '<span class="text-slate-600">공통</span>'}</td>` : ''}
                                <td class="px-4 py-3 text-right font-mono text-slate-400">${Format.won(l.cost_price)}</td>
                                <td class="px-4 py-3 text-right font-mono text-white">${Format.won(l.sell_price)}</td>
                                <td class="px-4 py-3 text-right">
                                    <span class="font-mono text-emerald-400">${Format.won(margin)}</span>
                                    <span class="text-[10px] text-slate-600 ml-1">(${marginPct}%)</span>
                                </td>
                                <td class="px-4 py-3 text-right">
                                    <div class="flex justify-end gap-2">
                                        <button class="text-slate-400 hover:text-blue-400 text-xs" data-edit-liquor="${l.id}">수정</button>
                                        <button class="text-slate-400 hover:text-red-300 text-xs" data-del-liquor="${l.id}">삭제</button>
                                    </div>
                                </td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
                </div>
            </div>
        </div>`;

        this._bindBranchFilter(el);
        document.getElementById('btn-add-liquor-s')?.addEventListener('click', () => this._showLiquorModal(liquorCats));
        document.getElementById('btn-manage-lq-cat')?.addEventListener('click', () => this._showLiquorCatModal());
        el.querySelectorAll('[data-edit-liquor]').forEach(btn => btn.addEventListener('click', () => this._showLiquorModal(liquorCats, btn.dataset.editLiquor)));
        el.querySelectorAll('[data-del-liquor]').forEach(btn => btn.addEventListener('click', async () => {
            if (confirm('삭제하시겠습니까?')) { await DB.delete('liquor', btn.dataset.delLiquor); DB.notifyChange(); App.toast('삭제되었습니다.', 'info'); App.renderPage('settings'); }
        }));
    },

    async _showLiquorModal(cats, editId) {
        const ex = editId ? await DB.getById('liquor', editId) : null;
        const branchNames = await this._branchNames();
        const defaultBranch = this.filterBranch || ex?.branch_name || '';
        App.showModal(ex ? '주종 수정' : '주종 추가', `
            <div class="space-y-4">
                <div class="space-y-2"><label class="text-xs font-medium text-slate-400">주종명 *</label>
                    <input id="lq-name" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" value="${ex?.name || ''}" placeholder="예: 다이아 17"/></div>
                <div class="grid grid-cols-2 gap-4">
                    <div class="space-y-2"><label class="text-xs font-medium text-slate-400">분류</label>
                        <select id="lq-cat" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm">
                            <option value="">미분류</option>
                            ${cats.map(c => `<option value="${c.id}" ${ex?.category_id === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
                        </select></div>
                    <div class="space-y-2"><label class="text-xs font-medium text-slate-400">소속 지점</label>
                        <select id="lq-branch" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm">
                            <option value="">공통 (전 지점)</option>
                            ${branchNames.map(n => `<option value="${n}" ${defaultBranch === n ? 'selected' : ''}>${n}</option>`).join('')}
                        </select></div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div class="space-y-2"><label class="text-xs font-medium text-slate-400">원가 (매입가)</label>
                        <input id="lq-cost" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono" value="${ex?.cost_price || ''}" placeholder="0"/></div>
                    <div class="space-y-2"><label class="text-xs font-medium text-slate-400">판매가</label>
                        <input id="lq-sell" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono" value="${ex?.sell_price || ''}" placeholder="0"/></div>
                </div>
            </div>
        `, async () => {
            const name = document.getElementById('lq-name').value.trim();
            if (!name) { App.toast('주종명을 입력해주세요.', 'error'); return; }
            const data = { name, category_id: document.getElementById('lq-cat').value || null,
                branch_name: document.getElementById('lq-branch').value || null,
                cost_price: Format.parseNumber(document.getElementById('lq-cost').value), sell_price: Format.parseNumber(document.getElementById('lq-sell').value) };
            if (ex) { await DB.update('liquor', editId, data); } else { await DB.insert('liquor', data); }
            DB.notifyChange(); App.toast('저장되었습니다.', 'success'); App.renderPage('settings');
        });
    },

    async _showLiquorCatModal() {
        const cats = await DB.getAll('liquor_categories');
        App.showModal('주류 분류 관리', `
            <div class="space-y-3 max-h-60 overflow-y-auto custom-scrollbar mb-4">
                ${cats.map(c => `
                <div class="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg">
                    <span class="text-sm">${c.name}</span>
                    <button class="text-xs text-red-300 hover:underline" data-rm-lq-cat="${c.id}">삭제</button>
                </div>`).join('')}
                ${cats.length === 0 ? '<p class="text-xs text-slate-600 text-center py-4">분류가 없습니다.</p>' : ''}
            </div>
            <div class="flex gap-2">
                <input id="new-lq-cat" class="flex-1 bg-slate-800 border-slate-700 rounded-lg text-sm" placeholder="새 분류명 (예: 위스키, 와인, 맥주)"/>
                <button id="btn-save-lq-cat" class="px-4 py-2 bg-blue-500 rounded-lg text-sm font-bold text-white">추가</button>
            </div>
        `);
        setTimeout(() => {
            document.getElementById('btn-save-lq-cat')?.addEventListener('click', async () => {
                const name = document.getElementById('new-lq-cat').value.trim();
                if (!name) return;
                await DB.insert('liquor_categories', { name }); DB.notifyChange();
                App.toast('분류가 추가되었습니다.', 'success');
                document.getElementById('app-modal').classList.add('hidden'); App.renderPage('settings');
            });
            document.querySelectorAll('[data-rm-lq-cat]').forEach(btn => btn.addEventListener('click', async () => {
                await DB.delete('liquor_categories', btn.dataset.rmLqCat); DB.notifyChange();
                document.getElementById('app-modal').classList.add('hidden'); App.renderPage('settings');
            }));
        }, 100);
    },

    // ═══════════════════════════════════════════════
    //  4. 직원 기초정보
    // ═══════════════════════════════════════════════
    async _getStaffRoles() {
        const raw = await this._getSetting('staff_roles');
        if (!raw) return [
            { key: 'president', label: '대표', order: 0 },
            { key: 'manager', label: '매니저', order: 1 },
            { key: 'staff', label: '스탭', order: 2 }
        ];
        try { return JSON.parse(raw); } catch { return [{ key: 'president', label: '대표', order: 0 }, { key: 'manager', label: '매니저', order: 1 }, { key: 'staff', label: '스탭', order: 2 }]; }
    },

    async _renderStaffBase(el) {
        const isAdmin = Auth.isAdmin();
        let staff = await DB.getAll('staff');
        let fb = '';
        if (!isAdmin) {
            const staffId = await Auth.getStaffId();
            const myStaff = staff.find(s => s.id === staffId);
            fb = myStaff?.branch_name || '';
            if (fb) staff = staff.filter(s => s.branch_name === fb);
            else staff = [];
        } else if (this.filterBranch) {
            fb = this.filterBranch;
            staff = staff.filter(s => s.branch_name === fb);
        }
        const roles = await this._getStaffRoles();
        const rolesSorted = [...roles].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
        const branchFilterHtml = await this._renderBranchFilter();
        const branches = await this._getBranches();
        const branchOptions = branches.map(b => `<option value="${b.name}" ${b.name === fb ? 'selected' : ''}>${b.name}</option>`).join('');
        const branchFieldHtml = fb
            ? (isAdmin ? `<select id="ns-branch" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm"><option value="">선택</option>${branchOptions}</select>` : `<input id="ns-branch" type="hidden" value="${fb}"/><span class="text-sm text-slate-300">${fb}</span>`)
            : `<select id="ns-branch" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm"><option value="">선택</option>${branchOptions}</select>`;
        const branchFieldLabel = fb && !isAdmin ? `<span class="text-xs text-slate-500">소속 지점 (고정)</span>` : `<label class="text-xs font-medium text-slate-400">소속 지점</label>`;

        el.innerHTML = `
        <div class="space-y-4">
            <div class="flex items-center justify-between gap-3">
                <div class="min-w-0">
                    <h2 class="text-lg font-bold text-white">직원 기초정보</h2>
                    <p class="text-xs text-slate-500 mt-1">직원별 소속 지점, 급여, 급여일, 인센티브율 등 기초 정보를 일괄 관리합니다.${!isAdmin ? ' (본인 지점만 표시)' : ''}</p>
                </div>
                <button id="btn-manage-roles" class="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 hover:bg-slate-700 transition-colors">
                    <span class="material-symbols-outlined text-sm">badge</span> 직급 관리
                </button>
            </div>

            ${branchFilterHtml}

            <div class="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[700px]">
                        <thead class="bg-slate-800/50 text-[10px] text-slate-500 uppercase tracking-wider">
                            <tr>
                                <th class="px-3 py-2 text-left">이름</th>
                                <th class="px-3 py-2 text-left">소속 지점</th>
                                <th class="px-3 py-2 text-center">직급</th>
                                <th class="px-3 py-2 text-right">월급여</th>
                                <th class="px-3 py-2 text-center">급여일</th>
                                <th class="px-3 py-2 text-center">인센티브율</th>
                                <th class="px-3 py-2 text-left">입사일</th>
                                <th class="px-3 py-2 text-right">작업</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-800">
                            ${staff.map(s => {
                                return `
                                <tr class="hover:bg-slate-800/30" data-sid="${s.id}">
                                    <td class="px-3 py-2 text-white font-medium">${s.name}</td>
                                    <td class="px-3 py-2">${isAdmin ? `<input class="stf-branch w-28 bg-slate-800 border-slate-700 rounded text-xs" value="${s.branch_name || ''}"/>` : `<span class="text-xs text-slate-400">${s.branch_name || '-'}</span>`}</td>
                                    <td class="px-3 py-2 text-center">
                                        <select class="stf-role bg-slate-800 border-slate-700 rounded text-xs">
                                            ${rolesSorted.map(r => `<option value="${r.key}" ${s.role === r.key ? 'selected' : ''}>${r.label}</option>`).join('')}
                                        </select>
                                    </td>
                                    <td class="px-3 py-2 text-right"><input class="stf-salary w-24 bg-slate-800 border-slate-700 rounded text-xs text-right font-mono" type="number" value="${s.salary || 0}"/></td>
                                    <td class="px-3 py-2 text-center"><input class="stf-payday w-14 bg-slate-800 border-slate-700 rounded text-xs text-center" type="number" min="1" max="31" value="${s.pay_date || 25}"/></td>
                                    <td class="px-3 py-2 text-center"><div class="flex items-center justify-center gap-1"><input class="stf-rate w-14 bg-slate-800 border-slate-700 rounded text-xs text-center" type="number" min="0" max="100" value="${s.incentive_rate || 0}"/><span class="text-[10px] text-slate-500">%</span></div></td>
                                    <td class="px-3 py-2 text-xs text-slate-400 font-mono">${s.hire_date || '-'}</td>
                                    <td class="px-3 py-2 text-right">
                                        <button class="text-slate-400 hover:text-blue-400 text-xs whitespace-nowrap mr-2" data-edit-staff="${s.id}" title="수정">수정</button>
                                        ${isAdmin ? `<button class="text-slate-400 hover:text-red-300 text-xs whitespace-nowrap" data-del-staff="${s.id}">삭제</button>` : ''}
                                    </td>
                                </tr>`;
                            }).join('')}
                            ${staff.length === 0 ? '<tr><td colspan="8" class="px-4 py-8 text-center text-slate-600 text-xs">등록된 직원이 없습니다.</td></tr>' : ''}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="flex justify-between">
                ${(!isAdmin && !fb) ? '<div></div>' : `<button id="btn-add-staff-base" class="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm whitespace-nowrap shrink-0 hover:bg-slate-700 transition-colors">
                    <span class="material-symbols-outlined text-sm">person_add</span> 직원 추가
                </button>`}
                <button id="btn-save-staff-base" class="flex items-center gap-2 px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-bold transition-colors">
                    <span class="material-symbols-outlined text-sm">save</span> 일괄 저장
                </button>
            </div>
        </div>`;

        document.getElementById('btn-save-staff-base')?.addEventListener('click', async () => {
            const rows = el.querySelectorAll('tr[data-sid]');
            for (const row of rows) {
                const id = row.dataset.sid;
                const data = {
                    role: row.querySelector('.stf-role').value,
                    salary: parseInt(row.querySelector('.stf-salary').value) || 0,
                    pay_date: parseInt(row.querySelector('.stf-payday').value) || 25,
                    incentive_rate: parseFloat(row.querySelector('.stf-rate').value) || 0,
                };
                if (isAdmin) {
                    const branchEl = row.querySelector('.stf-branch');
                    if (branchEl) data.branch_name = branchEl.value.trim();
                }
                await DB.update('staff', id, data);
            }
            DB.notifyChange(); App.toast('직원 정보가 저장되었습니다.', 'success');
        });

        document.getElementById('btn-manage-roles')?.addEventListener('click', () => this._showStaffRolesModal());

        document.getElementById('btn-add-staff-base')?.addEventListener('click', () => {
            App.showModal('직원 추가', `
                <div class="space-y-4">
                    <div class="space-y-2"><label class="text-xs font-medium text-slate-400">이름 *</label>
                        <input id="ns-name" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" placeholder="홍길동"/></div>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">${branchFieldLabel}
                            ${branchFieldHtml}</div>
                        <div class="space-y-2"><label class="text-xs font-medium text-slate-400">직급</label>
                            <select id="ns-role" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm">
                                ${rolesSorted.map(r => `<option value="${r.key}">${r.label}</option>`).join('')}
                            </select></div>
                    </div>
                    <div class="grid grid-cols-3 gap-4">
                        <div class="space-y-2"><label class="text-xs font-medium text-slate-400">월급여</label>
                            <input id="ns-salary" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono" type="number" placeholder="0"/></div>
                        <div class="space-y-2"><label class="text-xs font-medium text-slate-400">급여일</label>
                            <input id="ns-payday" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" type="number" min="1" max="31" value="25"/></div>
                        <div class="space-y-2"><label class="text-xs font-medium text-slate-400">인센티브(%)</label>
                            <input id="ns-rate" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" type="number" min="0" max="100" value="15"/></div>
                    </div>
                    <div class="space-y-2"><label class="text-xs font-medium text-slate-400">입사일</label>
                        <input id="ns-hire" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" type="date" value="${Format.today()}"/></div>
                </div>
            `, async () => {
                const name = document.getElementById('ns-name').value.trim();
                if (!name) { App.toast('이름을 입력해주세요.', 'error'); return; }
                const brEl = document.getElementById('ns-branch');
                const branchName = brEl?.value?.trim() || '';
                if (!branchName && isAdmin) { App.toast('소속 지점을 선택해주세요.', 'error'); return; }
                if (!branchName && !isAdmin) { App.toast('소속 지점을 확인할 수 없습니다.', 'error'); return; }
                const newStaff = await DB.insert('staff', { name, branch_name: branchName.trim(),
                    role: document.getElementById('ns-role').value, salary: parseInt(document.getElementById('ns-salary').value) || 0,
                    pay_date: parseInt(document.getElementById('ns-payday').value) || 25,
                    incentive_rate: parseFloat(document.getElementById('ns-rate').value) || 15,
                    hire_date: document.getElementById('ns-hire').value });
                await Auth.createStaffAccount(newStaff.id, name);
                DB.notifyChange(); App.toast('직원이 추가되었습니다.', 'success'); App.renderPage('settings');
            });
        });

        el.querySelectorAll('[data-edit-staff]').forEach(btn => btn.addEventListener('click', () => {
            const sid = btn.dataset.editStaff;
            const s = staff.find(x => x.id === sid);
            if (s) this._showStaffEditModal(s, rolesSorted, isAdmin, branches);
        }));
        el.querySelectorAll('[data-del-staff]').forEach(btn => btn.addEventListener('click', async () => {
            if (confirm('이 직원을 삭제하시겠습니까?')) { await DB.delete('staff', btn.dataset.delStaff); DB.notifyChange(); App.renderPage('settings'); }
        }));
        this._bindBranchFilter(el);
    },

    async _showStaffEditModal(staff, rolesSorted, isAdmin, branches) {
        const branchOpts = branches.map(b => `<option value="${b.name}" ${b.name === (staff.branch_name || '') ? 'selected' : ''}>${b.name}</option>`).join('');
        App.showModal('직원 수정', `
            <div class="space-y-4">
                <div class="space-y-2"><label class="text-xs font-medium text-slate-400">이름 *</label>
                    <input id="es-name" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" value="${staff.name || ''}" placeholder="홍길동"/></div>
                <div class="grid grid-cols-2 gap-4">
                    <div class="space-y-2"><label class="text-xs font-medium text-slate-400">소속 지점</label>
                        ${isAdmin ? `<select id="es-branch" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm"><option value="">선택</option>${branchOpts}</select>` : `<input type="hidden" id="es-branch" value="${staff.branch_name || ''}"/><span class="text-sm text-slate-300">${staff.branch_name || '-'}</span>`}</div>
                    <div class="space-y-2"><label class="text-xs font-medium text-slate-400">직급</label>
                        <select id="es-role" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm">
                            ${rolesSorted.map(r => `<option value="${r.key}" ${staff.role === r.key ? 'selected' : ''}>${r.label}</option>`).join('')}
                        </select></div>
                </div>
                <div class="grid grid-cols-3 gap-4">
                    <div class="space-y-2"><label class="text-xs font-medium text-slate-400">월급여</label>
                        <input id="es-salary" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono" type="number" value="${staff.salary || 0}"/></div>
                    <div class="space-y-2"><label class="text-xs font-medium text-slate-400">급여일</label>
                        <input id="es-payday" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" type="number" min="1" max="31" value="${staff.pay_date || 25}"/></div>
                    <div class="space-y-2"><label class="text-xs font-medium text-slate-400">인센티브(%)</label>
                        <input id="es-rate" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" type="number" min="0" max="100" value="${staff.incentive_rate || 0}"/></div>
                </div>
                <div class="space-y-2"><label class="text-xs font-medium text-slate-400">입사일</label>
                    <input id="es-hire" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" type="date" value="${staff.hire_date || ''}"/></div>
            </div>
        `, async () => {
            const name = document.getElementById('es-name').value.trim();
            if (!name) { App.toast('이름을 입력해주세요.', 'error'); return; }
            const brEl = document.getElementById('es-branch');
            const branchName = brEl?.value?.trim() || staff.branch_name || '';
            await DB.update('staff', staff.id, {
                name, branch_name: branchName,
                role: document.getElementById('es-role').value,
                salary: parseInt(document.getElementById('es-salary').value) || 0,
                pay_date: parseInt(document.getElementById('es-payday').value) || 25,
                incentive_rate: parseFloat(document.getElementById('es-rate').value) || 0,
                hire_date: document.getElementById('es-hire').value || null
            });
            DB.notifyChange();
            App.toast('직원 정보가 수정되었습니다.', 'success');
            App.renderPage('settings');
        });
    },

    async _showStaffRolesModal() {
        const roles = await this._getStaffRoles();
        const rolesSorted = [...roles].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
        App.showModal('직급 관리', `
            <p class="text-xs text-slate-500 mb-4">직급을 추가·수정·삭제할 수 있습니다. 직원 기초정보에서 선택 가능한 직급 목록입니다.</p>
            <div class="space-y-2 max-h-64 overflow-y-auto custom-scrollbar mb-4" id="roles-list">
                ${rolesSorted.map((r, i) => `
                <div class="flex items-center gap-3 p-2 bg-slate-800/50 rounded-lg" data-role-key="${r.key}">
                    <input class="role-key flex-1 min-w-0 bg-slate-800 border-slate-700 rounded text-xs py-1.5 px-2" value="${r.key}" placeholder="키 (영문)"/>
                    <input class="role-label flex-1 min-w-0 bg-slate-800 border-slate-700 rounded text-xs py-1.5 px-2" value="${r.label}" placeholder="표시명"/>
                    <input class="role-order w-14 bg-slate-800 border-slate-700 rounded text-xs py-1.5 px-2 text-center" type="number" min="0" value="${r.order ?? i}"/>
                    <button class="text-slate-500 hover:text-red-300 role-remove" data-key="${r.key}"><span class="material-symbols-outlined text-sm">delete</span></button>
                </div>`).join('')}
            </div>
            <div class="flex gap-2">
                <button id="btn-add-role" class="flex items-center gap-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs hover:bg-slate-700">
                    <span class="material-symbols-outlined text-sm">add</span> 직급 추가
                </button>
                <button id="btn-save-roles" class="flex items-center gap-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-bold">저장</button>
            </div>
        `, () => document.getElementById('app-modal')?.classList.add('hidden'));
        const listEl = document.getElementById('roles-list');
        const addRole = () => {
            const key = 'role_' + Date.now();
            const div = document.createElement('div');
            div.className = 'flex items-center gap-3 p-2 bg-slate-800/50 rounded-lg';
            div.dataset.roleKey = key;
            div.innerHTML = `
                <input class="role-key flex-1 min-w-0 bg-slate-800 border-slate-700 rounded text-xs py-1.5 px-2" value="${key}" placeholder="키 (영문)"/>
                <input class="role-label flex-1 min-w-0 bg-slate-800 border-slate-700 rounded text-xs py-1.5 px-2" value="" placeholder="표시명"/>
                <input class="role-order w-14 bg-slate-800 border-slate-700 rounded text-xs py-1.5 px-2 text-center" type="number" min="0" value="99"/>
                <button class="text-slate-500 hover:text-red-300 role-remove" data-key="${key}"><span class="material-symbols-outlined text-sm">delete</span></button>
            `;
            listEl.appendChild(div);
            div.querySelector('.role-remove').addEventListener('click', () => div.remove());
        };
        document.getElementById('btn-add-role')?.addEventListener('click', addRole);
        listEl.querySelectorAll('.role-remove').forEach(btn => btn.addEventListener('click', () => btn.closest('[data-role-key]')?.remove()));
        document.getElementById('btn-save-roles')?.addEventListener('click', async () => {
            const items = [];
            listEl.querySelectorAll('[data-role-key]').forEach((row, i) => {
                const key = row.querySelector('.role-key')?.value?.trim();
                const label = row.querySelector('.role-label')?.value?.trim();
                if (key && label) items.push({ key, label, order: parseInt(row.querySelector('.role-order')?.value) ?? i });
            });
            if (items.length === 0) { App.toast('최소 1개의 직급이 필요합니다.', 'error'); return; }
            await this._saveSetting('staff_roles', JSON.stringify(items));
            DB.notifyChange();
            document.getElementById('app-modal')?.classList.add('hidden');
            App.toast('직급이 저장되었습니다.', 'success');
            App.renderPage('settings');
        });
    },

    // ═══════════════════════════════════════════════
    //  5. 아가씨 기초정보
    // ═══════════════════════════════════════════════
    async _renderGirlBase(el) {
        const fb = this.filterBranch;
        const allStaff = await DB.getAll('staff');
        const branchStaffIds = fb ? new Set(allStaff.filter(s => s.branch_name === fb).map(s => s.id)) : null;
        let girls = await DB.getAll('girls');
        if (branchStaffIds) girls = girls.filter(g => branchStaffIds.has(g.staff_id));
        const staff = fb ? allStaff.filter(s => s.branch_name === fb) : allStaff;
        const defStandby = await this._getBranchSetting('default_standby_fee') || 150000;
        const defEvent = await this._getBranchSetting('default_event_fee') || 200000;
        const fullAttDays = await this._getBranchSetting('full_attendance_days') || 25;
        const branchFilterHtml = await this._renderBranchFilter();

        el.innerHTML = `
        <div class="space-y-6">
            <div class="flex items-center justify-between gap-3">
                <div class="min-w-0">
                    <h2 class="text-lg font-bold text-white">아가씨 기초정보</h2>
                    <p class="text-xs text-slate-500 mt-1">대기비, 이벤트비, 만근비, 와리율 기본값 및 개별 설정을 관리합니다. ${fb ? `<span class="text-blue-400 font-bold">[${fb}]</span>` : ''}</p>
                </div>
                <button id="btn-add-girl-base" class="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-bold whitespace-nowrap shrink-0 transition-colors">
                    <span class="material-symbols-outlined text-sm">person_add</span> 등록
                </button>
            </div>

            ${branchFilterHtml}

            <div class="bg-slate-900 rounded-2xl border border-slate-800 p-4 md:p-6">
                <h3 class="font-bold text-sm text-white mb-4 flex items-center gap-2">
                    <span class="material-symbols-outlined text-amber-400 text-lg">settings</span> 기본값 설정 ${fb ? `<span class="text-xs text-blue-400 font-normal ml-2">${fb}</span>` : ''}
                </h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div class="space-y-1"><label class="text-xs font-medium text-slate-400 whitespace-nowrap">기본 대기비</label>
                        <input id="def-standby" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono" value="${defStandby}"/></div>
                    <div class="space-y-1"><label class="text-xs font-medium text-slate-400 whitespace-nowrap">기본 이벤트비</label>
                        <input id="def-event" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono" value="${defEvent}"/></div>
                    <div class="space-y-1"><label class="text-xs font-medium text-slate-400 whitespace-nowrap">만근 기준일</label>
                        <input id="def-full-att" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" type="number" min="1" max="31" value="${fullAttDays}"/></div>
                    <div class="flex items-end">
                        <button id="btn-save-girl-def" class="w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-bold whitespace-nowrap transition-colors">기본값 저장</button>
                    </div>
                </div>
            </div>

            <!-- 개별 아가씨 테이블 -->
            <div class="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                <div class="px-4 py-3 border-b border-slate-800">
                    <h3 class="font-bold text-sm text-white">개별 아가씨 설정</h3>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[600px]">
                        <thead class="bg-slate-800/50 text-[10px] text-slate-500 uppercase tracking-wider">
                            <tr>
                                <th class="px-3 py-2 text-left">이름</th>
                                <th class="px-3 py-2 text-left">담당 직원</th>
                                <th class="px-3 py-2 text-right">대기비</th>
                                <th class="px-3 py-2 text-right">이벤트비</th>
                                <th class="px-3 py-2 text-center">와리율</th>
                                <th class="px-3 py-2 text-center">상태</th>
                                <th class="px-3 py-2 text-right">작업</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-800">
                            ${girls.map(g => {
                                return `
                                <tr class="hover:bg-slate-800/30" data-gid="${g.id}">
                                    <td class="px-3 py-2 text-white font-medium">${g.name}</td>
                                    <td class="px-3 py-2">
                                        <select class="g-staff bg-slate-800 border-slate-700 rounded text-xs">
                                            <option value="">미배정</option>
                                            ${staff.map(s => `<option value="${s.id}" ${g.staff_id === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
                                        </select>
                                    </td>
                                    <td class="px-3 py-2 text-right"><input class="g-standby w-24 bg-slate-800 border-slate-700 rounded text-xs text-right font-mono" type="number" value="${g.standby_fee || defStandby}"/></td>
                                    <td class="px-3 py-2 text-right"><input class="g-event w-24 bg-slate-800 border-slate-700 rounded text-xs text-right font-mono" type="number" value="${g.event_fee || defEvent}"/></td>
                                    <td class="px-3 py-2 text-center"><div class="flex items-center justify-center gap-1"><input class="g-rate w-14 bg-slate-800 border-slate-700 rounded text-xs text-center" type="number" min="0" max="100" value="${g.incentive_rate || 0}"/><span class="text-[10px] text-slate-500">%</span></div></td>
                                    <td class="px-3 py-2 text-center">
                                        <button class="g-toggle text-[10px] px-2 py-0.5 rounded-full ${g.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-500'}" data-gid="${g.id}" data-active="${g.active ? '1' : '0'}">${g.active ? '활동' : '비활동'}</button>
                                    </td>
                                    <td class="px-3 py-2 text-right">
                                        <button class="text-slate-400 hover:text-red-300 text-xs" data-del-girl="${g.id}">삭제</button>
                                    </td>
                                </tr>`;
                            }).join('')}
                            ${girls.length === 0 ? '<tr><td colspan="7" class="px-4 py-8 text-center text-slate-600 text-xs">등록된 아가씨가 없습니다.</td></tr>' : ''}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="flex justify-end">
                <button id="btn-save-girl-all" class="flex items-center gap-2 px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-bold transition-colors">
                    <span class="material-symbols-outlined text-sm">save</span> 일괄 저장
                </button>
            </div>
        </div>`;

        this._bindBranchFilter(el);
        document.getElementById('btn-save-girl-def')?.addEventListener('click', async () => {
            await this._saveBranchSetting('default_standby_fee', Format.parseNumber(document.getElementById('def-standby').value) || 150000);
            await this._saveBranchSetting('default_event_fee', Format.parseNumber(document.getElementById('def-event').value) || 200000);
            await this._saveBranchSetting('full_attendance_days', parseInt(document.getElementById('def-full-att').value) || 25);
            DB.notifyChange(); App.toast(`기본값이 저장되었습니다.${fb ? ' (' + fb + ')' : ''}`, 'success');
        });

        document.getElementById('btn-save-girl-all')?.addEventListener('click', async () => {
            const rows = el.querySelectorAll('tr[data-gid]');
            for (const row of rows) {
                await DB.update('girls', row.dataset.gid, {
                    staff_id: row.querySelector('.g-staff').value || null,
                    standby_fee: parseInt(row.querySelector('.g-standby').value) || 0,
                    event_fee: parseInt(row.querySelector('.g-event').value) || 0,
                    incentive_rate: parseFloat(row.querySelector('.g-rate').value) || 0,
                });
            }
            DB.notifyChange(); App.toast('아가씨 정보가 저장되었습니다.', 'success');
        });

        el.querySelectorAll('.g-toggle').forEach(btn => btn.addEventListener('click', async () => {
            const isActive = btn.dataset.active === '1';
            await DB.update('girls', btn.dataset.gid, { active: !isActive });
            DB.notifyChange(); App.renderPage('settings');
        }));

        document.getElementById('btn-add-girl-base')?.addEventListener('click', () => {
            App.showModal('아가씨 등록', `
                <div class="space-y-4">
                    <div class="space-y-2"><label class="text-xs font-medium text-slate-400">이름 *</label>
                        <input id="ng-name" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" placeholder="이름"/></div>
                    <div class="space-y-2"><label class="text-xs font-medium text-slate-400">담당 직원</label>
                        <select id="ng-staff" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm">
                            <option value="">선택</option>
                            ${staff.map(s => `<option value="${s.id}">${s.name} (${s.branch_name || ''})</option>`).join('')}
                        </select></div>
                    <div class="grid grid-cols-3 gap-3">
                        <div class="space-y-2"><label class="text-xs font-medium text-slate-400">대기비</label>
                            <input id="ng-standby" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono" value="${defStandby}"/></div>
                        <div class="space-y-2"><label class="text-xs font-medium text-slate-400">이벤트비</label>
                            <input id="ng-event" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono" value="${defEvent}"/></div>
                        <div class="space-y-2"><label class="text-xs font-medium text-slate-400">와리율(%)</label>
                            <input id="ng-rate" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" type="number" min="0" max="100" value="10"/></div>
                    </div>
                </div>
            `, async () => {
                const name = document.getElementById('ng-name').value.trim();
                if (!name) { App.toast('이름을 입력해주세요.', 'error'); return; }
                await DB.insert('girls', { name, staff_id: document.getElementById('ng-staff').value || null, active: true,
                    standby_fee: Format.parseNumber(document.getElementById('ng-standby').value) || defStandby,
                    event_fee: Format.parseNumber(document.getElementById('ng-event').value) || defEvent,
                    incentive_rate: parseFloat(document.getElementById('ng-rate').value) || 10 });
                DB.notifyChange(); App.toast('등록되었습니다.', 'success'); App.renderPage('settings');
            });
        });

        el.querySelectorAll('[data-del-girl]').forEach(btn => btn.addEventListener('click', async () => {
            if (confirm('삭제하시겠습니까?')) { await DB.delete('girls', btn.dataset.delGirl); DB.notifyChange(); App.renderPage('settings'); }
        }));
    },

    // ═══════════════════════════════════════════════
    //  6. 와리 설정 (직원+아가씨 인센티브 비율)
    // ═══════════════════════════════════════════════
    async _renderWari(el) {
        const fb = this.filterBranch;
        const allStaff = await DB.getAll('staff');
        const staff = fb ? allStaff.filter(s => s.branch_name === fb) : allStaff;
        const branchStaffIds = fb ? new Set(staff.map(s => s.id)) : null;
        const allGirls = await DB.getAll('girls');
        const girls = branchStaffIds ? allGirls.filter(g => branchStaffIds.has(g.staff_id)) : allGirls;
        const branchFilterHtml = await this._renderBranchFilter();

        el.innerHTML = `
        <div class="space-y-6">
            <div>
                <h2 class="text-lg font-bold text-white">와리 (인센티브) 설정</h2>
                <p class="text-xs text-slate-500 mt-1">직원 및 아가씨의 매출 대비 인센티브 비율을 설정합니다. ${fb ? `<span class="text-blue-400 font-bold">[${fb}]</span>` : ''}</p>
            </div>

            ${branchFilterHtml}

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <!-- 직원 와리 -->
                <div class="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                    <div class="px-4 py-3 border-b border-slate-800">
                        <h3 class="font-bold text-sm text-white flex items-center gap-2">
                            <span class="material-symbols-outlined text-blue-500 text-lg">badge</span> 직원 와리
                        </h3>
                    </div>
                    <div class="divide-y divide-slate-800">
                        ${staff.map(s => `
                        <div class="px-4 py-3 flex items-center justify-between hover:bg-slate-800/30">
                            <div>
                                <p class="text-sm font-medium text-white">${s.name}</p>
                                <p class="text-[10px] text-slate-500">${s.branch_name || '미배정'}</p>
                            </div>
                            <div class="flex items-center gap-2">
                                <input class="w-20 bg-slate-800 border-slate-700 rounded text-sm text-center font-mono sw-input" type="number" min="0" max="100" value="${s.incentive_rate || 0}" data-id="${s.id}"/>
                                <span class="text-xs text-slate-500">%</span>
                            </div>
                        </div>`).join('')}
                        ${staff.length === 0 ? '<div class="px-4 py-6 text-center text-slate-600 text-xs">직원 없음</div>' : ''}
                    </div>
                </div>

                <!-- 아가씨 와리 -->
                <div class="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                    <div class="px-4 py-3 border-b border-slate-800">
                        <h3 class="font-bold text-sm text-white flex items-center gap-2">
                            <span class="material-symbols-outlined text-pink-400 text-lg">woman</span> 아가씨 와리
                        </h3>
                    </div>
                    <div class="divide-y divide-slate-800">
                        ${girls.map(g => `
                        <div class="px-4 py-3 flex items-center justify-between hover:bg-slate-800/30">
                            <div>
                                <p class="text-sm font-medium text-white">${g.name}</p>
                                <p class="text-[10px] text-slate-500">${staff.find(s => s.id === g.staff_id)?.name || '-'} · ${g.active ? '활동' : '비활동'}</p>
                            </div>
                            <div class="flex items-center gap-2">
                                <input class="w-20 bg-slate-800 border-slate-700 rounded text-sm text-center font-mono gw-input" type="number" min="0" max="100" value="${g.incentive_rate || 0}" data-id="${g.id}"/>
                                <span class="text-xs text-slate-500">%</span>
                            </div>
                        </div>`).join('')}
                        ${girls.length === 0 ? '<div class="px-4 py-6 text-center text-slate-600 text-xs">아가씨 없음</div>' : ''}
                    </div>
                </div>
            </div>

            <div class="flex justify-end">
                <button id="btn-save-wari" class="flex items-center gap-2 px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-bold transition-colors">
                    <span class="material-symbols-outlined text-sm">save</span> 저장
                </button>
            </div>
        </div>`;

        this._bindBranchFilter(el);
        document.getElementById('btn-save-wari')?.addEventListener('click', async () => {
            const swInputs = el.querySelectorAll('.sw-input');
            for (const i of swInputs) {
                await DB.update('staff', i.dataset.id, { incentive_rate: parseFloat(i.value) || 0 });
            }
            const gwInputs = el.querySelectorAll('.gw-input');
            for (const i of gwInputs) {
                await DB.update('girls', i.dataset.id, { incentive_rate: parseFloat(i.value) || 0 });
            }
            DB.notifyChange(); App.toast('와리 설정이 저장되었습니다.', 'success');
        });
    },

    // ═══════════════════════════════════════════════
    //  7. 지출 항목 설정 (카테고리 + 고정 지출 항목)
    // ═══════════════════════════════════════════════
    async _renderExpenseSetup(el) {
        const fb = this.filterBranch;
        const categories = await DB.getAll('expense_categories');
        let items = await DB.getAll('base_expense_items');
        if (fb) items = items.filter(it => !it.branch_name || it.branch_name === fb);
        const allStaff = await DB.getAll('staff');
        const staff = fb ? allStaff.filter(s => s.branch_name === fb) : allStaff;

        const grouped = {};
        items.forEach(it => { const cid = it.category_id || '_none'; if (!grouped[cid]) grouped[cid] = []; grouped[cid].push(it); });

        const branchFilterHtml = await this._renderBranchFilter();

        el.innerHTML = `
        <div class="space-y-6">
            <div>
                <h2 class="text-lg font-bold text-white">지출 항목 설정</h2>
                <p class="text-xs text-slate-500 mt-1">지출 카테고리와 반복 고정 항목을 설정합니다. ${fb ? `<span class="text-blue-400 font-bold">[${fb}]</span>` : ''}</p>
            </div>

            ${branchFilterHtml}
            <div class="bg-slate-900 rounded-2xl border border-slate-800 p-4 md:p-6">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="font-bold text-sm text-white flex items-center gap-2">
                        <span class="material-symbols-outlined text-purple-400 text-lg">category</span> 지출 카테고리
                    </h3>
                    <button id="btn-add-cat" class="flex items-center gap-1 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-bold whitespace-nowrap shrink-0">
                        <span class="material-symbols-outlined text-xs">add</span> 추가
                    </button>
                </div>
                <div class="flex flex-wrap gap-2">
                    ${categories.map((c, i) => {
                        const colors = ['blue-500', 'emerald-500', 'amber-400', 'purple-500', 'rose-500', 'cyan-500', 'orange-500', 'pink-500'];
                        return `
                        <div class="flex items-center gap-2 bg-slate-800/50 px-3 py-2 rounded-lg shrink-0">
                            <div class="w-2.5 h-2.5 rounded-full bg-${colors[i % colors.length]} shrink-0"></div>
                            <span class="text-xs text-white whitespace-nowrap">${c.name}</span>
                            ${c.is_system ? '<span class="text-[8px] text-slate-600">(기본)</span>' : ''}
                            <button class="text-slate-500 hover:text-blue-400" data-edit-cat="${c.id}"><span class="material-symbols-outlined text-xs">edit</span></button>
                            ${!c.is_system ? `<button class="text-slate-500 hover:text-red-300" data-del-cat="${c.id}"><span class="material-symbols-outlined text-xs">close</span></button>` : ''}
                        </div>`;
                    }).join('')}
                </div>
            </div>

            <!-- 고정 지출 항목 -->
            <div class="flex items-center justify-between">
                <h3 class="font-bold text-sm text-white flex items-center gap-2">
                    <span class="material-symbols-outlined text-emerald-400 text-lg">receipt</span> 고정 지출 항목 (카테고리별)
                </h3>
                <button id="btn-add-base-item" class="flex items-center gap-1 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-bold whitespace-nowrap shrink-0">
                    <span class="material-symbols-outlined text-xs">add</span> 추가
                </button>
            </div>

            ${categories.map(cat => {
                const catItems = grouped[cat.id] || [];
                return `
                <div class="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
                    <div class="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between bg-slate-800/30">
                        <span class="text-xs font-bold text-white">${cat.name}</span>
                        <span class="text-[10px] text-slate-600">${catItems.length}건</span>
                    </div>
                    ${catItems.length === 0 ? '<div class="px-4 py-4 text-center text-slate-700 text-[10px]">등록된 항목 없음</div>' : `
                    <div class="divide-y divide-slate-800/50">
                        ${catItems.map(it => {
                            const sn = it.staff_id ? (staff.find(s => s.id === it.staff_id)?.name || '') : '';
                            return `
                            <div class="px-4 py-2.5 flex items-center justify-between hover:bg-slate-800/20">
                                <div class="flex-1 min-w-0">
                                    <span class="text-sm text-white">${it.name}</span>
                                    <div class="flex gap-3 text-[10px] text-slate-500">
                                        ${it.amount ? `<span>${Format.won(it.amount)}</span>` : ''}
                                        ${it.due_day ? `<span>매월 ${it.due_day}일</span>` : ''}
                                        ${sn ? `<span>${sn}</span>` : ''}
                                        ${it.memo ? `<span>${it.memo}</span>` : ''}
                                    </div>
                                </div>
                                <div class="flex gap-2 shrink-0 ml-2">
                                    <button class="text-slate-400 hover:text-blue-400 text-xs" data-edit-item="${it.id}">수정</button>
                                    <button class="text-slate-400 hover:text-red-300 text-xs" data-del-item="${it.id}">삭제</button>
                                </div>
                            </div>`;
                        }).join('')}
                    </div>`}
                </div>`;
            }).join('')}
        </div>`;

        this._bindBranchFilter(el);
        document.getElementById('btn-add-cat')?.addEventListener('click', () => this._showCatModal());
        el.querySelectorAll('[data-edit-cat]').forEach(b => b.addEventListener('click', () => this._showCatModal(b.dataset.editCat)));
        el.querySelectorAll('[data-del-cat]').forEach(b => b.addEventListener('click', async () => {
            if (confirm('삭제하시겠습니까?')) { await DB.delete('expense_categories', b.dataset.delCat); DB.notifyChange(); App.renderPage('settings'); }
        }));
        document.getElementById('btn-add-base-item')?.addEventListener('click', () => this._showItemModal(categories, staff));
        el.querySelectorAll('[data-edit-item]').forEach(b => b.addEventListener('click', () => this._showItemModal(categories, staff, b.dataset.editItem)));
        el.querySelectorAll('[data-del-item]').forEach(b => b.addEventListener('click', async () => {
            if (confirm('삭제하시겠습니까?')) { await DB.delete('base_expense_items', b.dataset.delItem); DB.notifyChange(); App.renderPage('settings'); }
        }));
    },

    async _showCatModal(editId) {
        const ex = editId ? await DB.getById('expense_categories', editId) : null;
        App.showModal(ex ? '카테고리 수정' : '카테고리 추가', `
            <div class="space-y-4"><div class="space-y-2"><label class="text-xs font-medium text-slate-400">카테고리명</label>
                <input id="cat-name" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" value="${ex?.name || ''}" placeholder="예: 과일·식자재·비품"/></div></div>
        `, async () => {
            const name = document.getElementById('cat-name').value.trim();
            if (!name) { App.toast('입력해주세요.', 'error'); return; }
            if (ex) await DB.update('expense_categories', editId, { name }); else await DB.insert('expense_categories', { name, is_system: false });
            DB.notifyChange(); App.toast('저장되었습니다.', 'success'); App.renderPage('settings');
        });
    },

    async _showItemModal(categories, staff, editId) {
        const ex = editId ? await DB.getById('base_expense_items', editId) : null;
        const branchNames = await this._branchNames();
        const defaultBranch = this.filterBranch || ex?.branch_name || '';
        App.showModal(ex ? '항목 수정' : '고정 지출 항목 추가', `
            <div class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div class="space-y-2"><label class="text-xs font-medium text-slate-400">카테고리</label>
                        <select id="it-cat" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm">
                            <option value="">선택</option>
                            ${categories.map(c => `<option value="${c.id}" ${ex?.category_id === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
                        </select></div>
                    <div class="space-y-2"><label class="text-xs font-medium text-slate-400">소속 지점</label>
                        <select id="it-branch" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm">
                            <option value="">공통 (전 지점)</option>
                            ${branchNames.map(n => `<option value="${n}" ${defaultBranch === n ? 'selected' : ''}>${n}</option>`).join('')}
                        </select></div>
                </div>
                <div class="space-y-2"><label class="text-xs font-medium text-slate-400">항목명 *</label>
                    <input id="it-name" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" value="${ex?.name || ''}" placeholder="예: KT 인터넷, 월세, 쿠팡 비품"/></div>
                <div class="grid grid-cols-2 gap-4">
                    <div class="space-y-2"><label class="text-xs font-medium text-slate-400">기본 금액</label>
                        <input id="it-amt" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono" value="${ex?.amount || ''}" placeholder="0"/></div>
                    <div class="space-y-2"><label class="text-xs font-medium text-slate-400">납부일 (매월)</label>
                        <input id="it-due" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" type="number" min="1" max="31" value="${ex?.due_day || ''}" placeholder="25"/></div>
                </div>
                <div class="space-y-2"><label class="text-xs font-medium text-slate-400">담당 직원</label>
                    <select id="it-staff" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm">
                        <option value="">없음</option>
                        ${staff.map(s => `<option value="${s.id}" ${ex?.staff_id === s.id ? 'selected' : ''}>${s.name} ${s.branch_name ? '(' + s.branch_name + ')' : ''}</option>`).join('')}
                    </select></div>
                <div class="space-y-2"><label class="text-xs font-medium text-slate-400">메모</label>
                    <input id="it-memo" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" value="${ex?.memo || ''}" placeholder="선택사항"/></div>
            </div>
        `, async () => {
            const name = document.getElementById('it-name').value.trim();
            if (!name) { App.toast('항목명을 입력해주세요.', 'error'); return; }
            const data = { category_id: document.getElementById('it-cat').value || null, name,
                branch_name: document.getElementById('it-branch').value || null,
                amount: Format.parseNumber(document.getElementById('it-amt').value) || 0,
                due_day: parseInt(document.getElementById('it-due').value) || null,
                staff_id: document.getElementById('it-staff').value || null,
                memo: document.getElementById('it-memo').value.trim() };
            if (ex) await DB.update('base_expense_items', editId, data); else await DB.insert('base_expense_items', data);
            DB.notifyChange(); App.toast('저장되었습니다.', 'success'); App.renderPage('settings');
        });
    },

    // ═══════════════════════════════════════════════
    //  8. 일반 설정 + 데이터 관리
    // ═══════════════════════════════════════════════
    async _renderGeneral(el) {
        const tcUnit = await this._getSetting('tc_unit_price') || 100000;
        const fullAtt = await this._getSetting('full_attendance_days') || 25;

        el.innerHTML = `
        <div class="space-y-6">
            <div>
                <h2 class="text-lg font-bold text-white">일반 설정 / 데이터 관리</h2>
                <p class="text-xs text-slate-500 mt-1">시스템 전반 설정 및 백업/복원을 관리합니다.</p>
            </div>

            <div class="bg-slate-900 rounded-2xl border border-slate-800 p-4 md:p-6">
                <h3 class="font-bold text-sm text-white mb-4">기본 설정</h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div class="space-y-2">
                        <label class="text-xs font-medium text-slate-400">T/C 단가 (1타임)</label>
                        <input id="gen-tc" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm font-mono" value="${tcUnit}"/>
                        <p class="text-[10px] text-slate-600">아가씨 1타임(T) 당 단가</p>
                    </div>
                    <div class="space-y-2">
                        <label class="text-xs font-medium text-slate-400">만근 기준일</label>
                        <input id="gen-att" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm" type="number" min="1" max="31" value="${fullAtt}"/>
                        <p class="text-[10px] text-slate-600">아가씨 만근비 지급 기준 출근 일수</p>
                    </div>
                </div>
                <button id="btn-save-gen" class="mt-4 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-bold transition-colors">설정 저장</button>
            </div>

            <div class="bg-slate-900 rounded-2xl border border-slate-800 p-4 md:p-6 space-y-4">
                <h3 class="font-bold text-sm text-white flex items-center gap-2">
                    <span class="material-symbols-outlined text-amber-400 text-lg">database</span> 데이터 관리
                </h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button id="btn-backup" class="flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm hover:bg-slate-700 transition-colors">
                        <span class="material-symbols-outlined text-lg text-blue-400">cloud_download</span> 백업 다운로드
                    </button>
                    <button id="btn-restore" class="flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm hover:bg-slate-700 transition-colors">
                        <span class="material-symbols-outlined text-lg text-emerald-400">cloud_upload</span> 백업 복원
                    </button>
                    <button id="btn-seed" class="flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm hover:bg-slate-700 transition-colors">
                        <span class="material-symbols-outlined text-lg text-amber-400">restart_alt</span> 데모 데이터 생성
                    </button>
                    <button id="btn-clear-all" class="flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm hover:bg-slate-700 transition-colors">
                        <span class="material-symbols-outlined text-lg text-slate-400">delete_forever</span> 모든 목업데이터 제거
                    </button>
                </div>
                <p class="text-[10px] text-slate-600">* "모든 목업데이터 제거" 실행 시 관리자(admin/owner) 계정을 제외한 모든 데이터(직원, 정산, 주류, 아가씨, 지출, 외상 등)가 영구 삭제됩니다.</p>
            </div>
        </div>`;

        document.getElementById('btn-save-gen')?.addEventListener('click', async () => {
            await this._saveSetting('tc_unit_price', Format.parseNumber(document.getElementById('gen-tc').value) || 100000);
            await this._saveSetting('full_attendance_days', parseInt(document.getElementById('gen-att').value) || 25);
            DB.notifyChange(); App.toast('설정이 저장되었습니다.', 'success');
        });
        document.getElementById('btn-backup')?.addEventListener('click', async () => { await DB.downloadBackup(); App.toast('다운로드됩니다.', 'info'); });
        document.getElementById('btn-restore')?.addEventListener('click', () => {
            const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
            inp.addEventListener('change', e => {
                const file = e.target.files[0]; if (!file) return;
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    try {
                        const data = JSON.parse(ev.target.result);
                        if (confirm('현재 데이터가 덮어씌워집니다. 복원하시겠습니까?')) {
                            await DB.restoreBackup(data); App.toast('복원되었습니다.', 'success'); setTimeout(() => location.reload(), 500);
                        }
                    } catch (err) { App.toast('유효하지 않은 파일입니다.', 'error'); }
                };
                reader.readAsText(file);
            });
            inp.click();
        });
        document.getElementById('btn-seed')?.addEventListener('click', async () => {
            App.showModal('데모 데이터 생성', `
                <div class="space-y-4">
                    <div class="bg-amber-950/40 border border-amber-700/30 rounded-xl p-4">
                        <div class="flex items-start gap-3">
                            <span class="material-symbols-outlined text-amber-400 text-xl shrink-0 mt-0.5">warning</span>
                            <div>
                                <p class="text-sm font-bold text-amber-300 mb-1">기존 데이터 초기화 후 재생성</p>
                                <p class="text-xs text-slate-400">중복 방지를 위해 기존 목업 데이터를 모두 삭제하고 새로 생성합니다.<br>관리자(admin/owner) 계정은 유지됩니다.</p>
                            </div>
                        </div>
                    </div>
                    <p class="text-xs text-slate-500">5개 지점 × 영업사장 5명 + 영업실장 5명 = 총 50명<br>각 직원별 매출 성향(S/A/B/C/D 티어) 시뮬레이션 데이터가 생성됩니다.</p>
                </div>
            `, async () => {
                App.toast('기존 데이터 초기화 중...', 'info');

                // admin/owner 계정 미리 저장
                const { data: rawUsers } = await window._supabase.from('users').select('*');
                const adminUsers = (rawUsers || []).filter(u => u.role === 'admin' || u.role === 'owner');

                // 전체 초기화 (FK 순서 준수)
                const tablesToClear = [
                    'daily_sale_room_girls', 'daily_sale_room_liquors',
                    'daily_sale_rooms', 'wari', 'receivable_payments',
                    'receivables', 'girl_payments', 'daily_sales',
                    'liquor_orders', 'liquor_inventory', 'expenses',
                    'branch_settings', 'users', 'girls',
                    'liquor', 'branches', 'staff',
                    'expense_categories', 'liquor_categories',
                    'base_expense_items', 'room_types', 'settings'
                ];
                for (const t of tablesToClear) {
                    await DB.hardDeleteAll(t);
                }

                // admin/owner 계정 복구
                for (const u of adminUsers) {
                    const clean = { ...u };
                    delete clean.id; delete clean.created_at; delete clean.updated_at;
                    await DB.insert('users', clean);
                }

                App.toast('데모 데이터 생성 중... (잠시 기다려주세요)', 'info');
                await App.seedDemoData();
                await Auth.syncStaffAccounts();
                App.toast('데모 데이터가 생성되었습니다!', 'success');
                App.renderPage('settings');
            });
        });

        document.getElementById('btn-clear-all')?.addEventListener('click', async () => {
            if (!Auth.isAdmin()) { App.toast('관리자만 실행할 수 있습니다.', 'error'); return; }

            App.showModal('모든 목업데이터 제거', `
                <div class="space-y-4">
                    <div class="bg-red-950/50 border border-red-800/30 rounded-xl p-4">
                        <div class="flex items-start gap-3">
                            <span class="material-symbols-outlined text-red-400 text-xl shrink-0 mt-0.5">warning</span>
                            <div>
                                <p class="text-sm font-bold text-red-300 mb-2">이 작업은 되돌릴 수 없습니다!</p>
                                <p class="text-xs text-slate-400">다음 데이터가 <b class="text-red-300">영구 삭제</b>됩니다:</p>
                                <ul class="text-xs text-slate-400 mt-2 space-y-1 list-disc pl-4">
                                    <li>모든 직원 정보 및 직원 계정</li>
                                    <li>모든 일일정산 데이터</li>
                                    <li>모든 주류, 재고, 발주 데이터</li>
                                    <li>모든 아가씨 정보 및 지급 내역</li>
                                    <li>모든 지출 내역 및 카테고리</li>
                                    <li>모든 외상 내역</li>
                                    <li>모든 와리 내역</li>
                                    <li>모든 지점, 룸타입, 설정값</li>
                                </ul>
                                <p class="text-xs text-emerald-400 mt-3">관리자(admin) / 오너(owner) 계정만 유지됩니다.</p>
                            </div>
                        </div>
                    </div>
                    <div class="space-y-2">
                        <label class="text-xs font-medium text-slate-400">확인을 위해 <b class="text-red-300">DELETE</b> 를 입력하세요</label>
                        <input id="confirm-delete-input" class="w-full bg-slate-800 border-slate-700 rounded-lg text-sm text-center font-mono tracking-widest" placeholder="DELETE"/>
                    </div>
                </div>
            `, async () => {
                const confirmText = document.getElementById('confirm-delete-input')?.value?.trim();
                if (confirmText !== 'DELETE') {
                    App.toast('"DELETE"를 정확히 입력해주세요.', 'error');
                    return;
                }

                App.toast('목업데이터 삭제 진행 중...', 'info');

                // admin/owner 계정 정보 미리 저장 (소프트 삭제 필터 없이 전체 조회)
                const { data: rawUsers } = await window._supabase.from('users').select('*');
                const adminUsers = (rawUsers || []).filter(u => u.role === 'admin' || u.role === 'owner');

                // FK 의존성 순서: 자식 테이블 먼저 삭제 → 부모 테이블 나중에 삭제
                const tablesToClear = [
                    'daily_sale_room_girls', 'daily_sale_room_liquors',
                    'daily_sale_rooms',
                    'wari', 'receivable_payments',
                    'receivables', 'girl_payments',
                    'daily_sales',
                    'liquor_orders', 'liquor_inventory',
                    'expenses',
                    'branch_settings',
                    'users',
                    'girls',
                    'liquor', 'branches',
                    'staff',
                    'expense_categories', 'liquor_categories', 'base_expense_items',
                    'room_types', 'settings'
                ];

                let cleared = 0;
                let errors = [];
                for (const t of tablesToClear) {
                    const { deleted, error } = await DB.hardDeleteAll(t);
                    if (error) {
                        errors.push(`${t}: ${error.message}`);
                        console.error(`Clear ${t} failed:`, error);
                    } else {
                        cleared++;
                        if (deleted > 0) console.log(`Cleared ${t}: ${deleted} rows`);
                    }
                }

                if (errors.length > 0) {
                    console.error('Clear errors:', errors);
                    App.toast(`일부 테이블 삭제 실패: ${errors.join(', ')}`, 'error');
                }

                // admin/owner 계정 복구
                for (const u of adminUsers) {
                    const clean = { ...u };
                    delete clean.id;
                    delete clean.created_at;
                    delete clean.updated_at;
                    await DB.insert('users', clean);
                }

                // 기본 설정값 복구
                await DB.insert('settings', { key: 'tc_unit_price', value: '100000' });
                await DB.insert('settings', { key: 'full_attendance_days', value: '25' });
                await DB.insert('settings', { key: 'default_standby_fee', value: '150000' });
                await DB.insert('settings', { key: 'default_event_fee', value: '200000' });

                // 기본 지출 카테고리 복구
                const defaultCategories = [
                    { name: '와리 (인센티브)', is_system: true },
                    { name: '아가씨 지급비', is_system: true },
                    { name: '주류 대금', is_system: true },
                    { name: '과일·식자재·비품·쿠팡', is_system: false },
                    { name: '인터넷·공과금·기타', is_system: false },
                    { name: '월세·관리비·세금', is_system: false },
                    { name: '월급', is_system: true },
                    { name: '꽃·화환·기프트', is_system: false },
                    { name: '세탁·청소·위생', is_system: false },
                    { name: '기타', is_system: false }
                ];
                for (const cat of defaultCategories) {
                    await DB.insert('expense_categories', cat);
                }

                // 자동 시드 방지 플래그 설정 (DB에 저장 → 모든 브라우저 공유)
                await DB.insert('settings', { key: 'seed_disabled', value: 'true' });

                DB.notifyChange();
                App.toast(`목업데이터가 모두 제거되었습니다. (${cleared}개 테이블 정리)`, 'success');
                setTimeout(() => App.renderPage('settings'), 500);
            });
        });
    },

    // ═══ 유틸리티 ═══
    async _getSetting(key) {
        const settings = await DB.getAll('settings');
        const s = settings.find(x => x.key === key);
        return s ? s.value : null;
    },

    async _saveSetting(key, value) {
        const settings = await DB.getAll('settings');
        const s = settings.find(x => x.key === key);
        if (s) await DB.update('settings', s.id, { value });
        else await DB.insert('settings', { key, value });
    },

    async _getBranchSetting(key) {
        return await DB.getBranchSetting(key, this.filterBranchId);
    },

    async _saveBranchSetting(key, value) {
        await DB.saveBranchSetting(key, value, this.filterBranchId);
    }
};

App.register('settings', SettingsPage);
