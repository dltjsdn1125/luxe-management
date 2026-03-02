// 기간 필터 유틸리티
const PeriodFilter = {
    // 기간 타입별 날짜 범위 계산
    getRange(type, customFrom, customTo) {
        const today = new Date();
        let from, to;

        switch (type) {
            case 'today': {
                from = new Date(today);
                to = new Date(today);
                break;
            }
            case 'week': {
                const day = today.getDay();
                from = new Date(today);
                from.setDate(today.getDate() - (day === 0 ? 6 : day - 1)); // 월요일
                to = new Date(from);
                to.setDate(from.getDate() + 6); // 일요일
                break;
            }
            case 'month': {
                from = new Date(today.getFullYear(), today.getMonth(), 1);
                to = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                break;
            }
            case 'quarter': {
                const q = Math.floor(today.getMonth() / 3);
                from = new Date(today.getFullYear(), q * 3, 1);
                to = new Date(today.getFullYear(), q * 3 + 3, 0);
                break;
            }
            case 'half': {
                const h = today.getMonth() < 6 ? 0 : 1;
                from = new Date(today.getFullYear(), h * 6, 1);
                to = new Date(today.getFullYear(), h * 6 + 6, 0);
                break;
            }
            case 'year': {
                from = new Date(today.getFullYear(), 0, 1);
                to = new Date(today.getFullYear(), 11, 31);
                break;
            }
            case 'custom': {
                from = customFrom ? new Date(customFrom) : new Date(today.getFullYear(), today.getMonth(), 1);
                to = customTo ? new Date(customTo) : today;
                break;
            }
            default: // all
                return { from: null, to: null, label: '전체' };
        }

        return {
            from: Format.date(from),
            to: Format.date(to),
            label: this.getLabel(type, from, to)
        };
    },

    // 기간 라벨
    getLabel(type, from, to) {
        const f = new Date(from);
        const t = new Date(to);
        switch (type) {
            case 'today':
                return `${f.getFullYear()}년 ${f.getMonth() + 1}월 ${f.getDate()}일 (오늘)`;
            case 'week':
                return `${f.getMonth() + 1}/${f.getDate()} ~ ${t.getMonth() + 1}/${t.getDate()} (이번 주)`;
            case 'month':
                return `${f.getFullYear()}년 ${f.getMonth() + 1}월`;
            case 'quarter': {
                const q = Math.floor(f.getMonth() / 3) + 1;
                return `${f.getFullYear()}년 ${q}분기`;
            }
            case 'half': {
                const h = f.getMonth() < 6 ? '상반기' : '하반기';
                return `${f.getFullYear()}년 ${h}`;
            }
            case 'year':
                return `${f.getFullYear()}년`;
            case 'custom':
                return `${Format.date(from)} ~ ${Format.date(to)}`;
            default:
                return '전체';
        }
    },

    // 날짜 문자열이 범위 내인지 체크
    inRange(dateStr, from, to) {
        if (!from && !to) return true;
        if (!dateStr) return false;
        if (from && dateStr < from) return false;
        if (to && dateStr > to) return false;
        return true;
    },

    // 배열에서 날짜 필드 기준 필터
    filterByDate(arr, dateField, from, to) {
        if (!from && !to) return arr;
        return arr.filter(item => this.inRange(item[dateField], from, to));
    },

    // 기간 필터 UI 렌더링
    renderUI(currentType, customFrom, customTo, cssPrefix) {
        const prefix = cssPrefix || 'pf';
        const types = [
            { key: 'today', label: '오늘' },
            { key: 'week', label: '이번 주' },
            { key: 'month', label: '이번 달' },
            { key: 'quarter', label: '분기' },
            { key: 'half', label: '반기' },
            { key: 'year', label: '연간' },
            { key: 'custom', label: '기간설정' }
        ];

        const range = this.getRange(currentType, customFrom, customTo);

        return `
        <div class="bg-slate-900 rounded-xl border border-slate-800 p-3 md:p-4">
            <div class="flex flex-col sm:flex-row sm:items-center gap-3">
                <div class="flex items-center gap-2 shrink-0">
                    <span class="material-symbols-outlined text-blue-500 text-lg">date_range</span>
                    <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">기간</span>
                </div>
                <div class="flex flex-wrap gap-1.5">
                    ${types.map(t => `
                        <button class="${prefix}-type px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentType === t.key ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}" data-period="${t.key}">${t.label}</button>
                    `).join('')}
                </div>
                ${currentType === 'custom' ? `
                <div class="flex items-center gap-2 ml-auto">
                    <input type="date" class="${prefix}-from bg-slate-800 border-slate-700 rounded-lg text-xs px-2 py-1.5" value="${customFrom || range.from}"/>
                    <span class="text-slate-600 text-xs">~</span>
                    <input type="date" class="${prefix}-to bg-slate-800 border-slate-700 rounded-lg text-xs px-2 py-1.5" value="${customTo || range.to}"/>
                    <button class="${prefix}-apply px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-bold hover:bg-blue-600 transition-colors">적용</button>
                </div>` : `
                <div class="ml-auto text-xs text-slate-500 font-mono">${range.label}</div>`}
            </div>
        </div>`;
    },

    // 이벤트 바인딩 헬퍼
    bindEvents(container, cssPrefix, callback) {
        const prefix = cssPrefix || 'pf';
        container.querySelectorAll(`.${prefix}-type`).forEach(btn => {
            btn.addEventListener('click', () => {
                callback(btn.dataset.period, null, null);
            });
        });

        const applyBtn = container.querySelector(`.${prefix}-apply`);
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                const from = container.querySelector(`.${prefix}-from`).value;
                const to = container.querySelector(`.${prefix}-to`).value;
                callback('custom', from, to);
            });
        }
    }
};

window.PeriodFilter = PeriodFilter;
