// 인증 관리 모듈 (Supabase Auth 기반, 인메모리 세션)
const Auth = {
    _session: null,

    _sb() {
        return window._supabase;
    },

    _setSession(session) {
        this._session = session;
        try { sessionStorage.setItem('_auth_session', JSON.stringify(session)); } catch(e) {}
    },

    _clearSession() {
        this._session = null;
        try { sessionStorage.removeItem('_auth_session'); } catch(e) {}
    },

    _readSession() {
        if (this._session) return this._session;
        try {
            const saved = sessionStorage.getItem('_auth_session');
            if (saved) { this._session = JSON.parse(saved); return this._session; }
        } catch(e) {}
        return null;
    },

    // 데모 계정 초기화
    async initDemoAccounts() {
        await DB.seedIfEmpty('users', [
            { username: 'admin', password: 'admin123', email: 'admin@luxemgmt.app', name: '관리자', role: 'admin', staff_id: null },
            { username: 'owner', password: 'owner123', email: 'owner@luxemgmt.app', name: '이사님', role: 'owner', staff_id: null }
        ]);

        await this.syncStaffAccounts();

        // Supabase Auth 세션에서 앱 세션 복구 (페이지 새로고침 시)
        await this._restoreAuthSession();
    },

    async _restoreAuthSession() {
        if (this._readSession()) return;

        const { data: { session } } = await this._sb().auth.getSession();
        if (session && session.user) {
            const users = await DB.getAll('users');
            const user = users.find(u => u.email === session.user.email || u.auth_id === session.user.id);
            if (user) {
                this._setSession({
                    id: user.id,
                    auth_id: session.user.id,
                    username: user.username,
                    name: user.name,
                    role: user.role,
                    staff_id: user.staff_id || null,
                    email: user.email
                });
            }
        }
    },

    // 직원 등록/수정 시 자동으로 로그인 계정 동기화
    async syncStaffAccounts() {
        const staffList = await DB.getAll('staff');
        let users = await DB.getAll('users');

        for (const s of staffList) {
            const byStaffId = users.find(u => u.staff_id === s.id);
            if (byStaffId) continue;

            const byName = users.find(u => u.name === s.name && u.role === 'staff');
            if (byName) {
                await DB.update('users', byName.id, { staff_id: s.id });
            } else {
                const username = this.generateUsername(s.name, users);
                await DB.insert('users', {
                    username: username,
                    password: '1234qwer',
                    email: `${username.replace(/\s/g, '')}@luxemgmt.app`,
                    name: s.name,
                    role: 'staff',
                    staff_id: s.id
                });
            }
        }

        await this._ensureSessionStaffId(staffList);
    },

    // 세션의 staff_id 보장 (관리자/지점 데이터 동기화)
    async _ensureSessionStaffId(staffList) {
        const session = this.getSession();
        if (!session) return;
        if (!staffList) staffList = await DB.getAll('staff');
        if (session.role !== 'staff') return;

        // 1) DB users에서 staff_id 재조회 (동기화 후 갱신 반영)
        const users = await DB.getAll('users');
        const user = users.find(u => u.id === session.id);
        if (user?.staff_id) {
            if (session.staff_id !== user.staff_id) {
                session.staff_id = user.staff_id;
                this._setSession(session);
            }
            return;
        }

        // 2) 이름으로 staff 매칭
        const matchedStaff = staffList.find(s => s.name === session.name) || staffList.find(s => s.name === user?.name);
        if (matchedStaff) {
            if (user) await DB.update('users', user.id, { staff_id: matchedStaff.id });
            session.staff_id = matchedStaff.id;
            this._setSession(session);
        }
    },

    // 이름 기반 고유 username 생성
    generateUsername(name, existingUsers) {
        let base = name.replace(/\s/g, '').toLowerCase();
        let username = base;
        let counter = 1;
        while (existingUsers.some(u => u.username === username)) {
            username = base + counter;
            counter++;
        }
        return username;
    },

    // 직원 등록 시 호출 - 계정도 함께 생성
    async createStaffAccount(staffId, staffName) {
        const users = await DB.getAll('users');
        const username = this.generateUsername(staffName, users);
        const email = `${username}@luxemgmt.app`;
        const password = '1234qwer';

        // Supabase Auth에 등록 시도 (실패해도 앱 계정은 생성)
        try {
            const { data, error } = await this._sb().auth.signUp({
                email,
                password,
                options: {
                    data: { name: staffName, role: 'staff', username }
                }
            });
            if (error) console.warn('Auth signUp:', error.message);
        } catch (e) {
            console.warn('Auth signUp error:', e.message);
        }

        const newUser = await DB.insert('users', {
            username,
            password,
            email,
            name: staffName,
            role: 'staff',
            staff_id: staffId
        });
        return newUser;
    },

    // 로그인 (users 테이블 우선, Supabase Auth 보조)
    async login(username, password) {
        const users = await DB.getAll('users');
        const user = users.find(u => u.username === username);
        if (!user) return null;

        // users 테이블 비밀번호 확인 (항상 우선)
        if (user.password !== password) return null;

        // Supabase Auth 세션도 동기화 시도 (실패해도 로그인은 허용)
        if (user.email) {
            try {
                const { data, error } = await this._sb().auth.signInWithPassword({
                    email: user.email,
                    password
                });
                if (!error && data.user && !user.auth_id) {
                    await DB.update('users', user.id, { auth_id: data.user.id });
                    return this._buildSession(user, data.user.id);
                }
            } catch (e) {
                console.warn('Supabase Auth sync:', e.message);
            }
        }

        const session = this._buildSession(user);
        if (session && session.role === 'staff') {
            await this.syncStaffAccounts();
            await this._ensureSessionStaffId();
        }
        return session;
    },

    _buildSession(user, authId) {
        const session = {
            id: user.id,
            auth_id: authId || user.auth_id || null,
            username: user.username,
            name: user.name,
            role: user.role,
            staff_id: user.staff_id || null,
            email: user.email || null
        };
        this._setSession(session);
        return session;
    },

    // 로그아웃
    async logout() {
        try {
            await this._sb().auth.signOut();
        } catch (e) {
            console.warn('Auth signOut error:', e.message);
        }
        this._clearSession();
        App.navigate('login');
    },

    // 현재 세션 (동기 - 인메모리에서 읽기)
    getSession() {
        return this._readSession();
    },

    // 로그인 여부
    isLoggedIn() {
        return !!this.getSession();
    },

    // 관리자/오너 여부
    isAdmin() {
        const session = this.getSession();
        return session && (session.role === 'admin' || session.role === 'owner');
    },

    // 현재 로그인한 유저의 staff_id
    async getStaffId() {
        const session = this.getSession();
        if (!session) return null;
        if (session.staff_id) return session.staff_id;

        if (session.role === 'staff') {
            const staffList = await DB.getAll('staff');
            const staffMatch = staffList.find(s => s.name === session.name);
            if (staffMatch) {
                session.staff_id = staffMatch.id;
                this._setSession(session);
                return staffMatch.id;
            }
        }
        return null;
    },

    // 동기식 getStaffId (캐시된 세션에서만 조회)
    getStaffIdSync() {
        const session = this.getSession();
        return session ? (session.staff_id || null) : null;
    },

    // 권한 확인
    hasRole(roles) {
        const session = this.getSession();
        if (!session) return false;
        if (typeof roles === 'string') roles = [roles];
        return roles.includes(session.role);
    }
};

window.Auth = Auth;
