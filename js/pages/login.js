// 로그인 페이지
const LoginPage = {
    async render(container) {
        container.innerHTML = `
        <div class="relative min-h-screen w-full flex flex-col overflow-x-hidden hero-gradient">
            <header class="flex items-center justify-between px-6 lg:px-20 py-6 border-b border-slate-800/50 bg-[#0a0c10]/80 backdrop-blur-md">
                <div class="flex items-center gap-3">
                    <div class="bg-gradient-to-br from-blue-500 to-purple-500 p-2 rounded-lg">
                        <span class="material-symbols-outlined text-white text-2xl">diamond</span>
                    </div>
                    <h2 class="text-xl font-extrabold tracking-tight text-white uppercase italic">LUXE<span class="text-blue-500">MGMT</span></h2>
                </div>
            </header>
            <main class="flex-grow flex flex-col items-center justify-center px-6 lg:px-20 py-12 lg:py-24">
                <div class="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                    <div class="space-y-8 hidden lg:block">
                        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-500 text-xs font-bold tracking-widest uppercase">
                            <span class="relative flex h-2 w-2">
                                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75"></span>
                                <span class="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                            </span>
                            통합 영업관리 시스템
                        </div>
                        <h1 class="text-5xl lg:text-7xl font-black leading-[1.1] tracking-tight text-white">
                            스마트 <span class="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-purple-500">영업관리</span>
                        </h1>
                        <p class="text-slate-400 text-lg lg:text-xl leading-relaxed max-w-xl">
                            일일정산, 직원성과, 외상관리, 주류재고를 하나의 플랫폼에서 통합 관리하세요.
                        </p>
                        <div class="flex flex-wrap gap-4 pt-4">
                            <div class="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/40 border border-slate-700/50">
                                <span class="material-symbols-outlined text-yellow-300">verified</span>
                                <span class="text-sm font-medium text-slate-300">실시간 정산</span>
                            </div>
                            <div class="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/40 border border-slate-700/50">
                                <span class="material-symbols-outlined text-purple-500">bolt</span>
                                <span class="text-sm font-medium text-slate-300">모바일 최적화</span>
                            </div>
                        </div>
                    </div>

                    <div class="relative">
                        <div class="absolute -inset-1 bg-gradient-to-r from-blue-500/30 to-purple-500/30 rounded-2xl blur-2xl opacity-50"></div>
                        <div class="relative glass-card p-8 lg:p-10 rounded-2xl shadow-2xl">
                            <div class="mb-8 text-center lg:text-left">
                                <div class="lg:hidden flex items-center justify-center gap-3 mb-6">
                                    <div class="bg-gradient-to-br from-blue-500 to-purple-500 p-2 rounded-lg">
                                        <span class="material-symbols-outlined text-white text-2xl">diamond</span>
                                    </div>
                                    <h2 class="text-xl font-extrabold tracking-tight text-white uppercase italic">LUXE<span class="text-blue-500">MGMT</span></h2>
                                </div>
                                <h3 class="text-2xl font-bold text-white mb-2">관리자 로그인</h3>
                                <p class="text-slate-400 text-sm">아이디와 비밀번호를 입력하세요</p>
                            </div>
                            <form id="login-form" class="space-y-6">
                                <div class="space-y-2">
                                    <label class="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">아이디</label>
                                    <div class="relative group">
                                        <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                            <span class="material-symbols-outlined text-slate-500 group-focus-within:text-blue-500 transition-colors">person</span>
                                        </div>
                                        <input id="login-username" class="w-full bg-slate-900/50 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 rounded-xl py-4 pl-12 pr-4 text-white placeholder:text-slate-600 outline-none transition-all" placeholder="admin" type="text" value="admin"/>
                                    </div>
                                </div>
                                <div class="space-y-2">
                                    <label class="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">비밀번호</label>
                                    <div class="relative group">
                                        <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                            <span class="material-symbols-outlined text-slate-500 group-focus-within:text-blue-500 transition-colors">lock</span>
                                        </div>
                                        <input id="login-password" class="w-full bg-slate-900/50 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 rounded-xl py-4 pl-12 pr-12 text-white placeholder:text-slate-600 outline-none transition-all" placeholder="••••••••" type="password" value="admin123"/>
                                        <button type="button" id="toggle-password" class="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 hover:text-slate-300">
                                            <span class="material-symbols-outlined text-[20px]">visibility</span>
                                        </button>
                                    </div>
                                </div>
                                <div id="login-error" class="hidden text-red-300 text-sm text-center bg-red-300/10 py-2 rounded-lg"></div>
                                <button type="submit" class="w-full py-4 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 group">
                                    로그인
                                    <span class="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">arrow_forward</span>
                                </button>
                            </form>
                            <div class="mt-6 pt-6 border-t border-slate-700/50">
                                <p class="text-xs text-slate-500 text-center">데모 계정: admin / admin123</p>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>`;

        this.bindEvents();
    },

    bindEvents() {
        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('login-username').value.trim();
            const password = document.getElementById('login-password').value;

            const session = await Auth.login(username, password);
            if (session) {
                App.navigate('dashboard');
            } else {
                const errorEl = document.getElementById('login-error');
                errorEl.textContent = '아이디 또는 비밀번호가 올바르지 않습니다.';
                errorEl.classList.remove('hidden');
            }
        });

        document.getElementById('toggle-password').addEventListener('click', () => {
            const input = document.getElementById('login-password');
            const icon = document.querySelector('#toggle-password .material-symbols-outlined');
            if (input.type === 'password') {
                input.type = 'text';
                icon.textContent = 'visibility_off';
            } else {
                input.type = 'password';
                icon.textContent = 'visibility';
            }
        });
    }
};

App.register('login', LoginPage);
