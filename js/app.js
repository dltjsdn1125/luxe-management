// SPA 라우터 및 앱 코어
const App = {
    routes: {},
    currentPage: null,

    // 페이지 등록
    register(name, pageModule) {
        this.routes[name] = pageModule;
    },

    // 네비게이션
    navigate(page) {
        window.location.hash = '#/' + page;
    },

    // 라우터 초기화 (async)
    async init() {
        await Auth.initDemoAccounts();
        // settings 테이블의 seed_disabled 플래그 확인 (모든 브라우저 공유)
        const { data: seedFlag } = await window._supabase
            .from('settings').select('value').eq('key', 'seed_disabled').maybeSingle();
        if (!seedFlag || seedFlag.value !== 'true') {
            await this.seedDemoData();
        }

        window.addEventListener('hashchange', () => { this.handleRoute(); });

        DB.subscribe(async () => {
            if (this.currentPage && this.currentPage !== 'login') {
                await this.renderPage(this.currentPage, { silent: true });
            }
        });

        this._autoRefreshInterval = null;
        this._startAutoRefresh();

        // 초기 라우팅
        if (!window.location.hash || window.location.hash === '#/') {
            this.navigate(Auth.isLoggedIn() ? 'dashboard' : 'login');
        } else {
            await this.handleRoute();
        }
    },

    async handleRoute() {
        const hash = window.location.hash.replace('#/', '') || 'login';
        const page = hash.split('?')[0];

        if (page !== 'login' && !Auth.isLoggedIn()) {
            this.navigate('login');
            return;
        }

        if (page === 'login' && Auth.isLoggedIn()) {
            this.navigate('dashboard');
            return;
        }

        await this.renderPage(page);
    },

    async renderPage(page, { silent = false } = {}) {
        const container = document.getElementById('app-content');
        const pageModule = this.routes[page];

        if (!pageModule) {
            container.innerHTML = `<div class="flex items-center justify-center h-96"><p class="text-slate-500">페이지를 찾을 수 없습니다.</p></div>`;
            return;
        }

        this.currentPage = page;

        if (page === 'login') {
            document.getElementById('app-header').classList.add('hidden');
            document.getElementById('app-sidebar').classList.add('hidden');
            document.getElementById('app-footer').classList.add('hidden');
            document.getElementById('main-wrapper').className = '';
        } else {
            document.getElementById('app-header').classList.remove('hidden');
            document.getElementById('app-sidebar').classList.remove('hidden');
            document.getElementById('app-footer').classList.remove('hidden');
            document.getElementById('main-wrapper').className = 'md:ml-64';
            this.updateNav(page);
            this.updateUserInfo();
        }

        if (silent) {
            const scrollY = window.scrollY;
            container.classList.remove('page-enter');
            container.innerHTML = '';
            await pageModule.render(container);
            window.scrollTo(0, scrollY);
        } else {
            container.innerHTML = '';
            container.className = 'page-enter';
            await pageModule.render(container);
            window.scrollTo(0, 0);
        }
    },

    updateNav(activePage) {
        const isAdmin = Auth.isAdmin();
        document.querySelectorAll('#app-sidebar nav a').forEach(a => {
            const href = a.getAttribute('data-page');
            const isAdminOnly = a.classList.contains('admin-only-nav');
            // 관리자 전용 메뉴 숨김
            if (isAdminOnly && !isAdmin) {
                a.style.display = 'none';
                return;
            } else if (isAdminOnly) {
                a.style.display = '';
            }
            if (href === activePage) {
                a.className = 'flex items-center px-4 py-3 text-sm font-medium rounded-lg bg-blue-500/10 text-blue-500 border-r-4 border-blue-500' + (isAdminOnly ? ' admin-only-nav' : '');
            } else {
                a.className = 'flex items-center px-4 py-3 text-sm font-medium text-slate-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer' + (isAdminOnly ? ' admin-only-nav' : '');
            }
        });

        // 관리자 전용 구분선도 숨김
        document.querySelectorAll('#app-sidebar nav .admin-only-nav').forEach(el => {
            const divider = el.previousElementSibling;
            if (divider && divider.tagName === 'DIV' && divider.classList.contains('border-t')) {
                divider.style.display = isAdmin ? '' : 'none';
            }
        });

        // 모바일 헤더 nav
        document.querySelectorAll('#app-header nav a').forEach(a => {
            const href = a.getAttribute('data-page');
            if (href === activePage) {
                a.className = 'text-sm font-medium text-blue-500 border-b-2 border-blue-500 pb-5 mt-5';
            } else {
                a.className = 'text-sm font-medium text-slate-400 hover:text-blue-500 transition-colors';
            }
        });
    },

    updateUserInfo() {
        const session = Auth.getSession();
        if (!session) return;
        const nameEl = document.getElementById('user-name');
        const roleEl = document.getElementById('user-role');
        const avatarEl = document.getElementById('user-avatar');
        if (nameEl) nameEl.textContent = session.name;
        if (roleEl) roleEl.textContent = session.role === 'owner' ? '오너' : session.role === 'admin' ? '관리자' : '직원';
        if (avatarEl) {
            const roleLabel = session.role === 'owner' ? '오너' : session.role === 'admin' ? '관리자' : '직원';
            avatarEl.title = `${session.name} (${roleLabel})`;
            avatarEl.innerHTML = '<span class="material-symbols-outlined text-lg">person</span>';
        }
    },

    _startAutoRefresh() {
        DB.stopAutoRefresh(this._autoRefreshInterval);
        this._autoRefreshInterval = DB.startAutoRefresh(async () => {
            if (this.currentPage && this.currentPage !== 'login' && Auth.isLoggedIn()) {
                await this.renderPage(this.currentPage, { silent: true });
            }
        }, 30000);
    },

    async refreshCurrentPage() {
        if (this.currentPage && this.currentPage !== 'login') {
            await this.renderPage(this.currentPage);
            this.toast('데이터를 새로고침했습니다.', 'info');
        }
    },

    // 토스트 알림
    toast(message, type = 'success') {
        const colors = {
            success: 'bg-emerald-500',
            error: 'bg-red-300',
            warning: 'bg-amber-300',
            info: 'bg-blue-500'
        };
        const icons = {
            success: 'check_circle',
            error: 'error',
            warning: 'warning',
            info: 'info'
        };
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast flex items-center gap-3 px-4 py-3 rounded-xl ${colors[type]} text-white shadow-lg mb-2`;
        toast.innerHTML = `<span class="material-symbols-outlined text-lg">${icons[type]}</span><span class="text-sm font-medium">${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    // 모달 표시
    showModal(title, content, onConfirm) {
        const modal = document.getElementById('app-modal');
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').innerHTML = content;
        modal.classList.remove('hidden');

        const confirmBtn = document.getElementById('modal-confirm');
        const cancelBtn = document.getElementById('modal-cancel');
        const closeBtn = document.getElementById('modal-close');

        const close = () => {
            modal.classList.add('hidden');
            confirmBtn.replaceWith(confirmBtn.cloneNode(true));
            cancelBtn.replaceWith(cancelBtn.cloneNode(true));
            closeBtn.replaceWith(closeBtn.cloneNode(true));
        };

        document.getElementById('modal-cancel').onclick = close;
        document.getElementById('modal-close').onclick = close;
        document.getElementById('modal-confirm').onclick = () => {
            if (onConfirm) onConfirm();
            close();
        };
    },

    // 데모 시드 데이터 - 대규모 시뮬레이션 (async)
    async seedDemoData() {
        const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const base = `${y}-${m}`;
        const prevM = String(now.getMonth() || 12).padStart(2, '0');
        const prevY = now.getMonth() === 0 ? y - 1 : y;
        const prevBase = `${prevY}-${prevM}`;
        const pp = now.getMonth() <= 1 ? 12 + now.getMonth() - 1 : now.getMonth() - 1;
        const ppY = pp > now.getMonth() ? y - 1 : (now.getMonth() <= 1 ? y - 1 : y);
        const ppBase = `${ppY}-${String(pp || 12).padStart(2,'0')}`;

        await DB.seedIfEmpty('staff', [
            { name: '김동현', branch_name: '강남 본점', role: 'president', hire_date: '2022-03-01', pay_date: 25, salary: 5000000, incentive_rate: 20 },
            { name: '박지성', branch_name: '역삼점', role: 'manager', hire_date: '2022-09-15', pay_date: 25, salary: 3500000, incentive_rate: 15 },
            { name: '이민호', branch_name: '서초점', role: 'manager', hire_date: '2023-01-10', pay_date: 10, salary: 3000000, incentive_rate: 15 },
            { name: '최수진', branch_name: '선릉점', role: 'manager', hire_date: '2023-06-01', pay_date: 10, salary: 3000000, incentive_rate: 12 },
            { name: '강하나', branch_name: '강남 본점', role: 'staff', hire_date: '2024-02-01', pay_date: 25, salary: 2500000, incentive_rate: 10 },
            { name: '정우성', branch_name: '압구정점', role: 'manager', hire_date: '2024-06-01', pay_date: 10, salary: 3200000, incentive_rate: 14 }
        ]);
        const staff = await DB.getAll('staff');

        await DB.seedIfEmpty('settings', [
            { key: 'full_attendance_days', value: '25' },
            { key: 'tc_unit_price', value: '100000' },
            { key: 'default_standby_fee', value: '150000' },
            { key: 'default_event_fee', value: '200000' }
        ]);

        await DB.seedIfEmpty('branches', [
            { name: '강남 본점', address: '서울시 강남구 역삼동 123-4', phone: '02-555-1234', room_count: 8, manager_id: staff[0]?.id, manager_name: '김동현' },
            { name: '역삼점', address: '서울시 강남구 역삼동 456-7', phone: '02-555-5678', room_count: 6, manager_id: staff[1]?.id, manager_name: '박지성' },
            { name: '서초점', address: '서울시 서초구 서초동 789-0', phone: '02-555-9012', room_count: 5, manager_id: staff[2]?.id, manager_name: '이민호' },
            { name: '선릉점', address: '서울시 강남구 선릉로 234', phone: '02-555-3456', room_count: 5, manager_id: staff[3]?.id, manager_name: '최수진' },
            { name: '압구정점', address: '서울시 강남구 압구정로 567', phone: '02-555-7890', room_count: 7, manager_id: staff[5]?.id, manager_name: '정우성' }
        ]);
        const branches = await DB.getAll('branches');

        const branchSettingsData = [];
        branches.forEach(b => {
            branchSettingsData.push({ branch_id: b.id, key: 'tc_unit_price', value: b.name === '압구정점' ? '120000' : '100000' });
            branchSettingsData.push({ branch_id: b.id, key: 'default_standby_fee', value: b.name === '압구정점' ? '180000' : '150000' });
            branchSettingsData.push({ branch_id: b.id, key: 'default_event_fee', value: b.name === '압구정점' ? '250000' : '200000' });
            branchSettingsData.push({ branch_id: b.id, key: 'full_attendance_days', value: '25' });
        });
        await DB.seedIfEmpty('branch_settings', branchSettingsData);

        await DB.seedIfEmpty('liquor', [
            { name: '다이아 17', category: '위스키', cost_price: 180000, sell_price: 700000 },
            { name: '시그 17', category: '위스키', cost_price: 150000, sell_price: 500000 },
            { name: '빈티지 리저브', category: '위스키', cost_price: 200000, sell_price: 800000 },
            { name: '로얄살루트 21', category: '위스키', cost_price: 250000, sell_price: 1000000 },
            { name: '하우스 위스키', category: '위스키', cost_price: 50000, sell_price: 200000 },
            { name: '하우스 진', category: '진', cost_price: 30000, sell_price: 150000 },
            { name: '모엣 샹동', category: '샴페인', cost_price: 120000, sell_price: 450000 },
            { name: '돔 페리뇽', category: '샴페인', cost_price: 350000, sell_price: 1200000 },
            { name: '마카란 12년', category: '위스키', cost_price: 80000, sell_price: 350000 },
            { name: '헤네시 XO', category: '꼬냑', cost_price: 300000, sell_price: 1100000 },
            { name: '앱솔루트 보드카', category: '보드카', cost_price: 25000, sell_price: 120000 },
            { name: '잭다니엘', category: '위스키', cost_price: 40000, sell_price: 180000 }
        ]);
        const liquors = await DB.getAll('liquor');

        await DB.seedIfEmpty('liquor_inventory', liquors.map(l => ({ liquor_id: l.id, quantity: rand(10, 60), alert_threshold: 10 })));

        await DB.seedIfEmpty('expense_categories', [
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
        ]);

        const girlsSeedData = [
            { name: '수아', staff_id: staff[0]?.id, active: true, incentive_rate: 10, standby_fee: 150000, event_fee: 200000 },
            { name: '지연', staff_id: staff[1]?.id, active: true, incentive_rate: 10, standby_fee: 150000, event_fee: 200000 },
            { name: '하윤', staff_id: staff[2]?.id, active: true, incentive_rate: 12, standby_fee: 130000, event_fee: 180000 },
            { name: '서연', staff_id: staff[3]?.id, active: true, incentive_rate: 8, standby_fee: 120000, event_fee: 150000 },
            { name: '민지', staff_id: staff[2]?.id, active: true, incentive_rate: 10, standby_fee: 130000, event_fee: 180000 },
            { name: '유림', staff_id: staff[0]?.id, active: true, incentive_rate: 11, standby_fee: 140000, event_fee: 190000 },
            { name: '유빈', staff_id: staff[1]?.id, active: true, incentive_rate: 9, standby_fee: 130000, event_fee: 170000 },
            { name: '미르', staff_id: staff[5]?.id, active: true, incentive_rate: 10, standby_fee: 150000, event_fee: 200000 },
            { name: '소희', staff_id: staff[3]?.id, active: true, incentive_rate: 12, standby_fee: 160000, event_fee: 220000 },
            { name: '다은', staff_id: staff[5]?.id, active: true, incentive_rate: 10, standby_fee: 140000, event_fee: 190000 },
            { name: '채원', staff_id: staff[4]?.id, active: true, incentive_rate: 11, standby_fee: 150000, event_fee: 200000 },
            { name: '예나', staff_id: staff[0]?.id, active: false, incentive_rate: 8, standby_fee: 120000, event_fee: 150000 }
        ];
        await DB.seedIfEmpty('girls', girlsSeedData);
        const girlsList = await DB.getAll('girls');

        // girl_payments
        const girlPayments = [];
        const months = [[y, m], [prevY, prevM]];
        girlsList.filter(g => g.active).forEach(g => {
            months.forEach(([yr, mo]) => {
                const maxD = yr === y && parseInt(mo) === now.getMonth() + 1 ? Math.min(now.getDate(), 28) : 28;
                for (let d = 1; d <= maxD; d++) {
                    if (rand(1, 10) <= 7) girlPayments.push({ girl_id: g.id, date: `${yr}-${mo}-${String(d).padStart(2,'0')}`, type: 'standby', amount: rand(80000, 160000), memo: '', staff_id: g.staff_id, entered_by: g.staff_id });
                }
                girlPayments.push({ girl_id: g.id, date: `${yr}-${mo}-${String(rand(20, 28)).padStart(2,'0')}`, type: 'full_attendance', amount: rand(300000, 500000), memo: '만근비', staff_id: g.staff_id, entered_by: g.staff_id });
                if (rand(1, 3) <= 2) girlPayments.push({ girl_id: g.id, date: `${yr}-${mo}-${String(rand(5, 20)).padStart(2,'0')}`, type: 'event', amount: rand(100000, 350000), memo: '이벤트', staff_id: g.staff_id, entered_by: g.staff_id });
            });
        });
        await DB.seedIfEmpty('girl_payments', girlPayments);

        // ═══ 대규모 일일정산 (batch insert 최적화) ═══
        const existingSales = await DB.getAll('daily_sales');
        if (existingSales.length === 0) {
            const girlNames = girlsList.map(g => g.name);
            const vipNames = ['창순','재민','석호','태용','민수','정훈','대호','상혁','건우','시우','영민','동수','진호','현우','기태','성준','준혁','승호','우진','태현'];
            const tcUnitPrice = 100000;
            const todayStr = `${y}-${m}-${String(now.getDate()).padStart(2,'0')}`;

            const configs = [
                { idx: 0, rooms: [4, 8] },
                { idx: 1, rooms: [3, 7] },
                { idx: 2, rooms: [3, 6] },
                { idx: 3, rooms: [2, 5] },
                { idx: 4, rooms: [2, 5] },
                { idx: 5, rooms: [3, 7] }
            ];

            const makeRoom = (roomNum, s, forceCredit) => {
                const gCount = rand(1, 4);
                const girls = [];
                let totalTimes = 0;
                for (let g = 0; g < gCount; g++) {
                    const gn = girlNames[rand(0, girlNames.length - 1)];
                    const gl = girlsList.find(x => x.name === gn);
                    const entryH = rand(19, 23); const entryM = rand(0, 59);
                    const dur = rand(1, 4);
                    let exitH = entryH + dur; if (exitH >= 24) exitH -= 24;
                    girls.push({ girl_id: gl?.id || '', name: gn,
                        entry_time: `${String(entryH).padStart(2,'0')}:${String(entryM).padStart(2,'0')}`,
                        exit_time: `${String(exitH).padStart(2,'0')}:${String(entryM).padStart(2,'0')}`, times: dur });
                    totalTimes += dur;
                }
                const lqCount = rand(1, 3);
                const lqItems = []; let joodae = 0;
                for (let i = 0; i < lqCount; i++) {
                    const lq = liquors[rand(0, liquors.length - 1)]; if (!lq) continue;
                    const qty = rand(1, 4); const sub = qty * lq.sell_price;
                    lqItems.push({ liquor_id: lq.id, name: lq.name, qty, service: rand(0, 1), price: lq.sell_price, subtotal: sub });
                    joodae += sub;
                }
                const tc = totalTimes * tcUnitPrice; const revenue = joodae + tc;
                const payCredit = (forceCredit || rand(0, 3) === 0) ? rand(300000, 1500000) : 0;
                const payBorrow = rand(0, 5) === 0 ? rand(100000, 500000) : 0;
                const remaining = Math.max(0, revenue - payCredit - payBorrow);
                const payCash = rand(0, 1) ? remaining : rand(0, remaining);
                const payCard = remaining - payCash;
                return { room_number: String(roomNum), vip_name: vipNames[rand(0, vipNames.length - 1)],
                    staff_id: s.id, staff_name: s.name, girls, liquor_items: lqItems,
                    joodae, tc_times: totalTimes, tc_amount: tc, room_revenue: revenue,
                    pay_cash: Math.max(0, payCash), pay_card: Math.max(0, payCard),
                    pay_borrowing: payBorrow, pay_other: 0,
                    pay_credit: payCredit, credit_customer: payCredit > 0 ? vipNames[rand(0, vipNames.length - 1)] : '' };
            };

            const allSalesData = [];
            const allRoomDataMap = [];

            for (const cfg of configs) {
                const buildEntry = (date, isClosed) => {
                    const s = staff[cfg.idx]; if (!s) return;
                    const roomCount = rand(cfg.rooms[0], cfg.rooms[1]);
                    const roomData = [];
                    const forceCreditOnFirst = rand(0, 2) === 0;
                    for (let r = 0; r < roomCount; r++) roomData.push(makeRoom(r + 1, s, r === 0 && forceCreditOnFirst));
                    const totalJoodae = roomData.reduce((a, r) => a + r.joodae, 0);
                    const totalTc = roomData.reduce((a, r) => a + r.tc_amount, 0);
                    const totalRev = totalJoodae + totalTc;
                    const cashAmt = roomData.reduce((a, r) => a + r.pay_cash, 0);
                    const cardAmt = roomData.reduce((a, r) => a + r.pay_card, 0);
                    const borrowAmt = roomData.reduce((a, r) => a + r.pay_borrowing, 0);
                    const creditAmt = roomData.reduce((a, r) => a + r.pay_credit, 0);
                    const credits = roomData.filter(r => r.pay_credit > 0).map(r => ({ customer: r.credit_customer, staff_id: r.staff_id, staff_name: r.staff_name, amount: r.pay_credit }));
                    const staffWari = Math.round(totalRev * ((s.incentive_rate || 15) / 100));
                    const girlWariItems = []; const usedGirls = new Set();
                    roomData.forEach(r => r.girls.forEach(g => { if (g.girl_id && !usedGirls.has(g.girl_id)) usedGirls.add(g.girl_id); }));
                    usedGirls.forEach(gid => { const gl = girlsList.find(x => x.id === gid);
                        if (gl) girlWariItems.push({ girl_id: gid, girl_name: gl.name, amount: Math.round(totalRev * ((gl.incentive_rate || 10) / 100) * 0.3), type: 'girl' }); });
                    const girlWariTotal = girlWariItems.reduce((a, w) => a + w.amount, 0);
                    const totalWari = staffWari + girlWariTotal;
                    const girlPayAmount = rand(2, 6) * 150000;
                    const dailyExpense = rand(0, 3) * rand(50000, 250000);
                    const netRev = totalRev - totalWari - girlPayAmount - dailyExpense;
                    const allLiquor = []; roomData.forEach(r => r.liquor_items.forEach(l => allLiquor.push(l)));

                    const saleIdx = allSalesData.length;
                    allSalesData.push({ date, rooms: roomCount,
                        tc_unit_price: tcUnitPrice, total_joodae: totalJoodae, total_tc: totalTc,
                        total_revenue: totalRev, cash_amount: cashAmt, card_amount: cardAmt,
                        borrowing_amount: borrowAmt, other_amount: 0, credit_amount: creditAmt,
                        credit_items: credits, total_staff_wari: staffWari, total_girl_wari: girlWariTotal, total_wari: totalWari,
                        total_girl_pay: girlPayAmount, total_expenses: dailyExpense,
                        carryover: rand(0, 3) === 0 ? rand(100000, 500000) : 0, net_revenue: netRev, net_settlement: netRev,
                        liquor_items: allLiquor, wari_items: [{ staff_id: s.id, staff_name: s.name, amount: staffWari, type: 'staff' }],
                        wari_girl_items: girlWariItems, expense_items: dailyExpense > 0 ? [{ name: ['운영비','소모품','교통비','식대','잡비'][rand(0,4)], amount: dailyExpense }] : [],
                        entered_by: s.id, closed: isClosed, closed_at: isClosed ? date + 'T23:59:00' : null });
                    allRoomDataMap.push({ saleIdx, roomData });
                };

                for (let d = 1; d <= 28; d++) {
                    if (rand(1, 10) <= 2) continue;
                    const dd = String(d).padStart(2, '0');
                    const date = `${base}-${dd}`;
                    if (new Date(date) > now) continue;
                    buildEntry(date, date !== todayStr);
                }
                for (let d = 1; d <= 28; d++) {
                    if (rand(1, 10) <= 2) continue;
                    buildEntry(`${prevBase}-${String(d).padStart(2,'0')}`, true);
                }
                for (let d = 1; d <= 28; d += rand(2, 4)) {
                    buildEntry(`${ppBase}-${String(Math.min(d, 28)).padStart(2,'0')}`, true);
                }
            }

            const insertedSales = await DB.batchInsert('daily_sales', allSalesData);

            const allRooms = [];
            for (const { saleIdx, roomData } of allRoomDataMap) {
                const sale = insertedSales[saleIdx];
                if (!sale) continue;
                for (const r of roomData) {
                    allRooms.push({
                        _girls: r.girls, _liquors: r.liquor_items,
                        daily_sales_id: sale.id,
                        room_number: r.room_number, vip_name: r.vip_name,
                        staff_id: r.staff_id, staff_name: r.staff_name,
                        joodae: r.joodae, tc_times: r.tc_times, tc_amount: r.tc_amount,
                        room_revenue: r.room_revenue,
                        pay_cash: r.pay_cash, pay_card: r.pay_card,
                        pay_borrowing: r.pay_borrowing, pay_other: r.pay_other,
                        pay_credit: r.pay_credit, credit_customer: r.credit_customer
                    });
                }
            }

            const roomGirls = allRooms.map(r => r._girls);
            const roomLiquors = allRooms.map(r => r._liquors);
            const cleanRooms = allRooms.map(r => { const c = { ...r }; delete c._girls; delete c._liquors; return c; });
            const insertedRooms = await DB.batchInsert('daily_sale_rooms', cleanRooms);

            const allGirlRows = [];
            const allLiquorRows = [];
            for (let i = 0; i < insertedRooms.length; i++) {
                const room = insertedRooms[i];
                if (!room) continue;
                (roomGirls[i] || []).forEach(g => {
                    allGirlRows.push({ room_id: room.id, girl_id: g.girl_id, name: g.name, entry_time: g.entry_time, exit_time: g.exit_time, times: g.times });
                });
                (roomLiquors[i] || []).forEach(l => {
                    allLiquorRows.push({ room_id: room.id, liquor_id: l.liquor_id, name: l.name, qty: l.qty, price: l.price, service: l.service, subtotal: l.subtotal });
                });
            }
            await DB.batchInsert('daily_sale_room_girls', allGirlRows);
            await DB.batchInsert('daily_sale_room_liquors', allLiquorRows);
        }

        // wari
        const wariData = [];
        const allSalesForWari = await DB.getAll('daily_sales');
        allSalesForWari.forEach(sale => {
            (sale.wari_items || []).forEach(w => wariData.push({ staff_id: w.staff_id, date: sale.date, amount: w.amount, daily_sales_id: sale.id, entered_by: sale.entered_by }));
            (sale.wari_girl_items || []).forEach(w => wariData.push({ girl_id: w.girl_id, date: sale.date, amount: w.amount, daily_sales_id: sale.id, type: 'girl' }));
        });
        await DB.seedIfEmpty('wari', wariData);

        // expenses
        const categories = await DB.getAll('expense_categories');
        const expenses = []; const catMap = {};
        categories.forEach(c => { catMap[c.name] = c.id; });
        const expConfigs = [
            { idx: 0, label: '강남 본점', monthly: [
                { cat: '과일·식자재·비품·쿠팡', min: 300000, max: 800000, freq: 4 },
                { cat: '인터넷·공과금·기타', min: 300000, max: 500000, freq: 1 },
                { cat: '월세·관리비·세금', min: 5000000, max: 5000000, freq: 1 },
                { cat: '월급', min: 7500000, max: 7500000, freq: 1 },
                { cat: '꽃·화환·기프트', min: 100000, max: 400000, freq: 3 },
                { cat: '세탁·청소·위생', min: 200000, max: 500000, freq: 2 },
                { cat: '기타', min: 50000, max: 300000, freq: 3 }
            ]},
            { idx: 1, label: '역삼점', monthly: [
                { cat: '과일·식자재·비품·쿠팡', min: 250000, max: 600000, freq: 4 },
                { cat: '인터넷·공과금·기타', min: 250000, max: 400000, freq: 1 },
                { cat: '월세·관리비·세금', min: 4000000, max: 4000000, freq: 1 },
                { cat: '세탁·청소·위생', min: 150000, max: 400000, freq: 2 },
                { cat: '기타', min: 50000, max: 250000, freq: 2 }
            ]},
            { idx: 2, label: '서초점', monthly: [
                { cat: '과일·식자재·비품·쿠팡', min: 200000, max: 500000, freq: 3 },
                { cat: '인터넷·공과금·기타', min: 200000, max: 350000, freq: 1 },
                { cat: '월세·관리비·세금', min: 3500000, max: 3500000, freq: 1 },
                { cat: '기타', min: 50000, max: 200000, freq: 2 }
            ]},
            { idx: 3, label: '선릉점', monthly: [
                { cat: '과일·식자재·비품·쿠팡', min: 200000, max: 500000, freq: 3 },
                { cat: '인터넷·공과금·기타', min: 200000, max: 300000, freq: 1 },
                { cat: '월세·관리비·세금', min: 3000000, max: 3000000, freq: 1 },
                { cat: '기타', min: 50000, max: 200000, freq: 2 }
            ]},
            { idx: 5, label: '압구정점', monthly: [
                { cat: '과일·식자재·비품·쿠팡', min: 400000, max: 900000, freq: 5 },
                { cat: '인터넷·공과금·기타', min: 300000, max: 500000, freq: 1 },
                { cat: '월세·관리비·세금', min: 6000000, max: 6000000, freq: 1 },
                { cat: '월급', min: 8000000, max: 8000000, freq: 1 },
                { cat: '꽃·화환·기프트', min: 150000, max: 500000, freq: 4 },
                { cat: '세탁·청소·위생', min: 250000, max: 600000, freq: 2 },
                { cat: '기타', min: 100000, max: 400000, freq: 3 }
            ]}
        ];
        [base, prevBase, ppBase].forEach(month => {
            expConfigs.forEach(cfg => {
                const s = staff[cfg.idx]; if (!s) return;
                cfg.monthly.forEach(item => {
                    const catId = catMap[item.cat]; if (!catId) return;
                    for (let f = 0; f < (item.freq || 1); f++) {
                        const dd = String(Math.min(rand(1, 28), 28)).padStart(2, '0');
                        expenses.push({ date: `${month}-${dd}`, category_id: catId, category_name: item.cat, amount: rand(item.min, item.max), memo: `${cfg.label} ${item.cat}`, entered_by: s.id });
                    }
                });
            });
        });
        await DB.seedIfEmpty('expenses', expenses);

        // receivables
        const allSales = await DB.getAll('daily_sales');
        const receivablesList = []; let recIdx = 0;
        allSales.forEach(sale => {
            if (!sale.credit_items || sale.credit_items.length === 0) return;
            sale.credit_items.forEach(c => {
                const dueOffset = rand(7, 21);
                const saleDate = new Date(sale.date);
                const dueDate = new Date(saleDate.getTime() + dueOffset * 86400000);
                let status = 'unpaid', paidAmount = 0;
                if (recIdx % 5 === 0) { status = 'paid'; paidAmount = c.amount; }
                else if (recIdx % 3 === 0) { status = 'partial'; paidAmount = Math.round(c.amount * (rand(25, 65) / 100)); }
                recIdx++;
                receivablesList.push({ date: sale.date, staff_id: c.staff_id || sale.entered_by, customer: c.customer,
                    amount: c.amount, due_date: dueDate.toISOString().slice(0, 10), status, paid_amount: paidAmount,
                    entered_by: sale.entered_by, daily_sales_id: sale.id });
            });
        });
        await DB.seedIfEmpty('receivables', receivablesList);

        // receivable_payments
        const recs = await DB.getAll('receivables');
        const recPayments = [];
        recs.forEach(rec => {
            if (rec.status === 'paid') {
                recPayments.push({ receivable_id: rec.id, amount: rec.amount, method: ['transfer','card','cash'][rand(0,2)], paid_date: rec.due_date || rec.date });
            } else if (rec.status === 'partial' && rec.paid_amount > 0) {
                let rem = rec.paid_amount; const cnt = rand(1, 3);
                for (let i = 0; i < cnt && rem > 0; i++) {
                    const amt = i === cnt - 1 ? rem : Math.round(rem * (rand(30, 60) / 100));
                    const pd = new Date(new Date(rec.date).getTime() + rand(2, 15) * 86400000);
                    recPayments.push({ receivable_id: rec.id, amount: amt, method: ['transfer','card','cash'][rand(0,2)], paid_date: pd.toISOString().slice(0, 10) });
                    rem -= amt;
                }
            }
        });
        await DB.seedIfEmpty('receivable_payments', recPayments);

        // liquor_orders
        const lqOrders = [];
        staff.forEach(s => {
            [base, prevBase, ppBase].forEach(month => {
                const lqSample = liquors.slice(0, rand(3, liquors.length));
                lqSample.forEach(lq => {
                    const qty = rand(3, 20);
                    lqOrders.push({ date: `${month}-${String(rand(1,28)).padStart(2,'0')}`, liquor_id: lq.id, liquor_name: lq.name, quantity: qty, unit_price: lq.cost_price, total_cost: qty * lq.cost_price, entered_by: s.id });
                });
            });
        });
        await DB.seedIfEmpty('liquor_orders', lqOrders);

        await DB.seedIfEmpty('room_types', [
            { name: 'VIP룸', base_charge: 500000, min_order: 1000000, capacity: 8, description: 'VIP 전용 대형 룸' },
            { name: '프리미엄룸', base_charge: 300000, min_order: 700000, capacity: 6, description: '프리미엄 중형 룸' },
            { name: '스탠다드룸', base_charge: 200000, min_order: 500000, capacity: 4, description: '일반 룸' },
            { name: '파티룸', base_charge: 800000, min_order: 2000000, capacity: 15, description: '파티 전용 대형 룸' }
        ]);

        await DB.seedIfEmpty('liquor_categories', [
            { name: '위스키' }, { name: '샴페인' }, { name: '꼬냑' }, { name: '보드카' }, { name: '진' }, { name: '와인' }, { name: '맥주' }
        ]);

        await DB.seedIfEmpty('base_expense_items', [
            { name: '월세', amount: 5000000, due_day: 1, category: '월세·관리비·세금', memo: '매월 1일 납부' },
            { name: '관리비', amount: 500000, due_day: 5, category: '월세·관리비·세금', memo: '' },
            { name: '인터넷', amount: 88000, due_day: 15, category: '인터넷·공과금·기타', memo: 'KT 인터넷' },
            { name: '전기료', amount: 0, due_day: 20, category: '인터넷·공과금·기타', memo: '변동' },
            { name: '세탁비', amount: 0, due_day: 0, category: '세탁·청소·위생', memo: '주 2회' }
        ]);
    }
};

window.App = App;
