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

window.Format = Format;
