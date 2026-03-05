// 숫자 포맷 유틸리티
const Format = {
    // 숫자를 한국식 콤마 포맷으로 변환
    number(num) {
        if (num === null || num === undefined || isNaN(num)) return '0';
        return Number(num).toLocaleString('ko-KR');
    },

    // 원화 포맷
    won(num) {
        return '₩' + this.number(num);
    },

    // 만원 단위 표시
    manwon(num) {
        if (!num) return '0';
        const man = Math.floor(num / 10000);
        const remainder = num % 10000;
        if (remainder === 0) return `${this.number(man)}만원`;
        return `${this.number(num)}원`;
    },

    // 콤마 문자열 → 숫자
    parseNumber(str) {
        if (!str) return 0;
        return parseInt(String(str).replace(/[^0-9-]/g, ''), 10) || 0;
    },

    // 날짜 포맷 (YYYY-MM-DD)
    date(date) {
        if (!date) return '';
        const d = new Date(date);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    },

    // 한국어 날짜
    dateKR(date) {
        if (!date) return '';
        const d = new Date(date);
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${days[d.getDay()]}요일`;
    },

    // 타임스탬프
    datetime(date) {
        if (!date) return '';
        const d = new Date(date);
        return `${this.date(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    },

    // 오늘 날짜
    today() {
        return this.date(new Date());
    },

    // 이번 달 첫 날
    monthStart() {
        const d = new Date();
        d.setDate(1);
        return this.date(d);
    },

    // UUID 생성
    uuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }
};

// 페이지네이션 UI
const Pagination = {
    render(page, totalPages, total, pageSize = 50, prefix = 'pg') {
        if (!totalPages || totalPages <= 1) return '';
        const prev = page > 1 ? page - 1 : null;
        const next = page < totalPages ? page + 1 : null;
        const showPages = 5;
        let start = Math.max(1, page - Math.floor(showPages / 2));
        let end = Math.min(totalPages, start + showPages - 1);
        if (end - start + 1 < showPages) start = Math.max(1, end - showPages + 1);
        const pages = [];
        for (let i = start; i <= end; i++) pages.push(i);
        const from = total ? (page - 1) * pageSize + 1 : 0;
        const to = total ? Math.min(page * pageSize, total) : 0;
        const info = total != null ? `${Format.number(from)}-${Format.number(to)} / ${Format.number(total)}건` : '';
        return `
        <div class="flex items-center justify-between gap-4 py-3 px-4 border-t border-slate-800" data-pagination="${prefix}">
            <span class="text-xs text-slate-500">${info}</span>
            <div class="flex items-center gap-1">
                <button class="pagin-btn px-2 py-1 rounded text-xs font-medium ${!prev ? 'opacity-40 cursor-not-allowed bg-slate-800' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}" data-page-num="${prev || ''}" data-prefix="${prefix}">이전</button>
                ${pages.map(p => `<button class="pagin-btn px-2 py-1 rounded text-xs font-medium ${p === page ? 'bg-blue-500 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}" data-page-num="${p}" data-prefix="${prefix}">${p}</button>`).join('')}
                <button class="pagin-btn px-2 py-1 rounded text-xs font-medium ${!next ? 'opacity-40 cursor-not-allowed bg-slate-800' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}" data-page-num="${next || ''}" data-prefix="${prefix}">다음</button>
            </div>
        </div>`;
    }
};

window.Format = Format;
window.Pagination = Pagination;
