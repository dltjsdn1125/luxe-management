// 로그인 페이지 - Wope 스타일 랜딩
const LoginPage = {
    async render(container) {
        container.innerHTML = `
        <div class="relative min-h-screen w-full flex flex-col overflow-x-hidden wope-landing">
            <!-- Header -->
            <header class="flex items-center justify-between px-6 lg:px-20 py-6 border-b border-white/5 bg-[#06050a]/90 backdrop-blur-xl sticky top-0 z-50">
                <div class="flex items-center gap-3">
                    <div class="wope-logo-icon w-10 h-10 rounded-lg flex items-center justify-center">
                        <span class="material-symbols-outlined text-white text-xl font-light">diamond</span>
                    </div>
                    <h2 class="text-xl font-bold tracking-tight text-white">LUXE<span class="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-blue-500">MGMT</span></h2>
                </div>
                <nav class="flex items-center gap-8">
                    <a href="#" data-scroll-to="features" class="text-sm font-medium text-slate-400 hover:text-white transition-colors hidden sm:inline">기능</a>
                    <a href="#" data-scroll-to="faq" class="text-sm font-medium text-slate-400 hover:text-white transition-colors hidden sm:inline">FAQ</a>
                    <a href="#" data-scroll-to="login-section" class="text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors">로그인</a>
                </nav>
            </header>

            <!-- Hero Section -->
            <section class="relative px-6 lg:px-20 pt-16 lg:pt-24 pb-0 overflow-hidden">
                <div class="absolute inset-0 wope-hero-glow"></div>
                <!-- Centered Hero Text -->
                <div class="relative max-w-4xl mx-auto text-center space-y-8 mb-16">
                    <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold tracking-wider">
                        <span class="relative flex h-2 w-2">
                            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                            <span class="relative inline-flex rounded-full h-2 w-2 bg-blue-400"></span>
                        </span>
                        통합 영업관리 시스템
                    </div>
                    <h1 class="text-4xl lg:text-6xl xl:text-7xl font-bold leading-[1.1] tracking-tight text-white">
                        새로운 <span class="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600">영업관리</span>의 시작
                    </h1>
                    <p class="text-slate-400 text-lg lg:text-xl leading-relaxed max-w-2xl mx-auto">
                        일일정산, 직원성과, 외상관리, 주류재고를 하나의 플랫폼에서 통합 관리하세요.
                    </p>
                    <div class="flex flex-wrap gap-4 justify-center pt-2">
                        <div class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10">
                            <span class="material-symbols-outlined text-blue-400 text-lg">verified</span>
                            <span class="text-sm font-medium text-slate-300">실시간 정산</span>
                        </div>
                        <div class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10">
                            <span class="material-symbols-outlined text-violet-400 text-lg">bolt</span>
                            <span class="text-sm font-medium text-slate-300">모바일 최적화</span>
                        </div>
                        <div class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10">
                            <span class="material-symbols-outlined text-blue-400 text-lg">shield</span>
                            <span class="text-sm font-medium text-slate-300">권한별 접근</span>
                        </div>
                    </div>
                </div>

                <!-- Product Screenshot Preview -->
                <div class="relative max-w-6xl mx-auto">
                    <!-- Glow behind screenshot -->
                    <div class="absolute -inset-10 bg-gradient-to-b from-blue-500/10 via-blue-500/8 to-transparent rounded-3xl blur-3xl pointer-events-none"></div>
                    <!-- Screenshot container with perspective -->
                    <div class="product-screenshot-wrap relative">
                        <div class="product-screenshot-inner rounded-xl lg:rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-black/50">
                            <img src="assets/dashboard-preview.png" alt="LUXE MGMT Dashboard" class="w-full h-auto block" loading="eager"/>
                        </div>
                        <!-- Gradient fade at bottom -->
                        <div class="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#06050a] via-[#06050a]/80 to-transparent pointer-events-none"></div>
                        <!-- Gradient fade at sides -->
                        <div class="absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-[#06050a] to-transparent pointer-events-none"></div>
                        <div class="absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-[#06050a] to-transparent pointer-events-none"></div>
                    </div>
                </div>
            </section>

            <!-- Login Section - overlapping screenshot -->
            <section id="login-section" class="relative px-6 lg:px-20 -mt-32 lg:-mt-40 pb-20 z-10">
                <div class="max-w-md mx-auto">
                    <div class="absolute -inset-1 bg-gradient-to-r from-blue-500/40 via-blue-500/40 to-blue-600/40 rounded-2xl blur-xl opacity-60 max-w-md mx-auto left-6 right-6 lg:left-auto lg:right-auto"></div>
                    <div class="relative wope-glass p-8 lg:p-10 rounded-2xl border border-white/10 shadow-2xl">
                        <div class="mb-8 text-center">
                            <h3 class="text-2xl font-bold text-white mb-2">관리자 로그인</h3>
                            <p class="text-slate-400 text-sm">아이디와 비밀번호를 입력하세요</p>
                        </div>
                        <form id="login-form" class="space-y-6">
                            <div class="space-y-2">
                                <label class="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-1">아이디</label>
                                <div class="relative group">
                                    <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <span class="material-symbols-outlined text-slate-500 group-focus-within:text-blue-400 transition-colors">person</span>
                                    </div>
                                    <input id="login-username" class="w-full bg-black/40 border border-white/10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 rounded-xl py-4 pl-12 pr-4 text-white placeholder:text-slate-600 outline-none transition-all" placeholder="admin" type="text" value="admin"/>
                                </div>
                            </div>
                            <div class="space-y-2">
                                <label class="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-1">비밀번호</label>
                                <div class="relative group">
                                    <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <span class="material-symbols-outlined text-slate-500 group-focus-within:text-blue-400 transition-colors">lock</span>
                                    </div>
                                    <input id="login-password" class="w-full bg-black/40 border border-white/10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 rounded-xl py-4 pl-12 pr-12 text-white placeholder:text-slate-600 outline-none transition-all" placeholder="••••••••" type="password" value="admin123"/>
                                    <button type="button" id="toggle-password" class="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 hover:text-slate-300">
                                        <span class="material-symbols-outlined text-[20px]">visibility</span>
                                    </button>
                                </div>
                            </div>
                            <div id="login-error" class="hidden text-red-300 text-sm text-center bg-red-500/10 py-2 rounded-lg border border-red-500/20"></div>
                            <button type="submit" class="w-full py-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 group shadow-lg shadow-blue-500/25">
                                로그인
                                <span class="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">arrow_forward</span>
                            </button>
                        </form>
                        <div class="mt-6 pt-6 border-t border-white/10">
                            <p class="text-xs text-slate-500 text-center">데모 계정: admin / admin123</p>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Feature Section -->
            <section id="features" class="px-6 lg:px-20 py-20 border-t border-white/5">
                <div class="max-w-6xl mx-auto">
                    <h2 class="text-3xl lg:text-4xl font-bold text-white text-center mb-4">차세대 영업관리 경험</h2>
                    <p class="text-slate-400 text-center mb-16 max-w-xl mx-auto">직관적인 인터페이스로 복잡한 정산과 관리를 간편하게</p>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div class="wope-feature-card p-8 rounded-2xl border border-white/10">
                            <div class="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center mb-6">
                                <span class="material-symbols-outlined text-blue-400 text-2xl">insights</span>
                            </div>
                            <h3 class="text-lg font-bold text-white mb-3">일일정산 분석</h3>
                            <p class="text-slate-400 text-sm leading-relaxed">실시간 매출·정산 데이터를 한눈에 확인하고, 직원별·일별 성과를 추적하세요.</p>
                        </div>
                        <div class="wope-feature-card p-8 rounded-2xl border border-white/10">
                            <div class="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center mb-6">
                                <span class="material-symbols-outlined text-blue-400 text-2xl">groups</span>
                            </div>
                            <h3 class="text-lg font-bold text-white mb-3">통합 직원관리</h3>
                            <p class="text-slate-400 text-sm leading-relaxed">직원·아가씨 관리, 외상·주류재고를 통합하여 효율적으로 운영하세요.</p>
                        </div>
                        <div class="wope-feature-card p-8 rounded-2xl border border-white/10">
                            <div class="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center mb-6">
                                <span class="material-symbols-outlined text-blue-400 text-2xl">liquor</span>
                            </div>
                            <h3 class="text-lg font-bold text-white mb-3">주류재고 추적</h3>
                            <p class="text-slate-400 text-sm leading-relaxed">실시간 재고 현황 파악, 발주·입출고 자동 기록으로 손실을 최소화하세요.</p>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Second Screenshot Section -->
            <section class="px-6 lg:px-20 py-16 overflow-hidden">
                <div class="max-w-5xl mx-auto relative">
                    <div class="absolute -inset-10 bg-gradient-to-b from-blue-500/8 via-blue-500/5 to-transparent rounded-3xl blur-3xl pointer-events-none"></div>
                    <div class="product-screenshot-wrap-flat relative rounded-xl lg:rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-black/50">
                        <img src="assets/inventory-preview.png" alt="LUXE MGMT 주류관리" class="w-full h-auto block" loading="lazy"/>
                        <!-- Gradient fade at edges -->
                        <div class="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#06050a] to-transparent pointer-events-none"></div>
                        <div class="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-[#06050a] to-transparent pointer-events-none"></div>
                        <div class="absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#06050a] to-transparent pointer-events-none"></div>
                    </div>
                </div>
            </section>

            <!-- FAQ Section -->
            <section id="faq" class="px-6 lg:px-20 py-20 border-t border-white/5">
                <div class="max-w-3xl mx-auto">
                    <h2 class="text-3xl lg:text-4xl font-bold text-white text-center mb-12">자주 묻는 질문</h2>
                    <div class="space-y-4">
                        <details class="wope-faq-item group rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
                            <summary class="flex items-center justify-between px-6 py-5 cursor-pointer text-white font-medium hover:bg-white/5 transition-colors list-none">
                                <span>LUXE MGMT란 무엇인가요?</span>
                                <span class="material-symbols-outlined text-slate-400 group-open:rotate-45 transition-transform">add</span>
                            </summary>
                            <div class="px-6 pb-5 text-slate-400 text-sm leading-relaxed">통합 영업관리 시스템으로, 일일정산·직원관리·외상·주류재고를 하나의 플랫폼에서 관리할 수 있습니다.</div>
                        </details>
                        <details class="wope-faq-item group rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
                            <summary class="flex items-center justify-between px-6 py-5 cursor-pointer text-white font-medium hover:bg-white/5 transition-colors list-none">
                                <span>누가 사용할 수 있나요?</span>
                                <span class="material-symbols-outlined text-slate-400 group-open:rotate-45 transition-transform">add</span>
                            </summary>
                            <div class="px-6 pb-5 text-slate-400 text-sm leading-relaxed">매장·업장 운영자, 관리자, 직원 등 권한에 따라 다양한 역할로 사용할 수 있습니다.</div>
                        </details>
                    </div>
                </div>
            </section>

            <!-- CTA Section -->
            <section class="relative px-6 lg:px-20 py-24 overflow-hidden">
                <div class="absolute inset-0 wope-cta-glow"></div>
                <div class="relative max-w-3xl mx-auto text-center">
                    <div class="wope-logo-icon w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-8">
                        <span class="material-symbols-outlined text-white text-3xl">diamond</span>
                    </div>
                    <h2 class="text-3xl lg:text-4xl font-bold text-white mb-4">지금 바로 시작하세요</h2>
                    <p class="text-slate-400 mb-8">LUXE MGMT로 매장 운영의 새로운 기준을 경험해 보세요.</p>
                    <a href="#" data-scroll-to="login-section" class="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-500/25">
                        로그인하기
                        <span class="material-symbols-outlined text-xl">arrow_forward</span>
                    </a>
                </div>
            </section>

            <!-- Footer -->
            <footer class="px-6 lg:px-20 py-12 border-t border-white/5">
                <div class="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
                    <div class="flex items-center gap-2">
                        <div class="wope-logo-icon w-8 h-8 rounded-lg flex items-center justify-center">
                            <span class="material-symbols-outlined text-white text-sm">diamond</span>
                        </div>
                        <span class="font-bold text-white">LUXE MGMT</span>
                    </div>
                    <p class="text-slate-500 text-sm">© 2026 LUXE MGMT. All rights reserved.</p>
                </div>
            </footer>
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

        // 스크롤 앵커 (해시 라우팅 방해 방지)
        document.querySelectorAll('[data-scroll-to]').forEach((a) => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                const id = a.getAttribute('data-scroll-to');
                document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
            });
        });

        const toggleBtn = document.getElementById('toggle-password');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
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
    }
};

App.register('login', LoginPage);
