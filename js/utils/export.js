// 엑셀 내보내기 유틸리티
const ExcelExport = {
    // 데이터를 엑셀 파일로 다운로드
    download(data, headers, filename, sheetName) {
        if (!window.XLSX) {
            App.toast('엑셀 라이브러리를 로딩 중입니다. 잠시 후 다시 시도해주세요.', 'error');
            return;
        }

        const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);

        // 열 너비 자동 조정
        const colWidths = headers.map((h, i) => {
            let maxLen = String(h).length;
            data.forEach(row => {
                const cellLen = String(row[i] || '').length;
                if (cellLen > maxLen) maxLen = cellLen;
            });
            return { wch: Math.min(Math.max(maxLen + 2, 8), 30) };
        });
        ws['!cols'] = colWidths;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Sheet1');
        XLSX.writeFile(wb, `${filename}.xlsx`);
        App.toast('엑셀 파일이 다운로드되었습니다.', 'success');
    },

    // 정산 내역 내보내기
    exportSettlements(settlements, staff) {
        const headers = ['날짜', '지점명', '대표자/직원', '총 주대', '방 수', '카드', '현금', '외상', '와리', '정산금'];
        const data = settlements.map(s => {
            const st = staff.find(x => x.id === s.entered_by);
            return [
                s.date,
                st ? (st.branch_name || '-') : '-',
                st ? st.name : '관리자',
                s.total_revenue || 0,
                s.rooms || 0,
                s.card_amount || 0,
                s.cash_amount || 0,
                s.credit_amount || 0,
                s.total_wari || 0,
                s.net_settlement || 0
            ];
        });
        this.download(data, headers, `정산내역_${Format.today()}`, '정산내역');
    },

    // 외상 내역 내보내기
    exportReceivables(receivables, staff) {
        const headers = ['날짜', '지점명', '담당자', '손님명', '금액', '입금액', '잔액', '약속일', '상태'];
        const data = receivables.map(r => {
            const s = staff.find(x => x.id === r.staff_id);
            const statusMap = { paid: '완납', partial: '부분입금', unpaid: '미입금' };
            return [
                r.date,
                s ? (s.branch_name || '-') : '-',
                s ? s.name : '-',
                r.customer,
                r.amount || 0,
                r.paid_amount || 0,
                (r.amount || 0) - (r.paid_amount || 0),
                r.due_date || '-',
                statusMap[r.status] || r.status
            ];
        });
        this.download(data, headers, `외상내역_${Format.today()}`, '외상내역');
    },

    // 지출 내역 내보내기
    exportExpenses(expenses, categories) {
        const headers = ['날짜', '카테고리', '금액', '메모'];
        const data = expenses.map(e => {
            const cat = categories.find(c => c.id === e.category_id);
            return [
                e.date,
                cat ? cat.name : '-',
                e.amount || 0,
                e.memo || ''
            ];
        });
        this.download(data, headers, `지출내역_${Format.today()}`, '지출내역');
    },

    // 주류 발주 내역 내보내기
    exportOrders(orders, liquors) {
        const headers = ['날짜', '주종', '수량', '단가', '총액', '공급업체'];
        const data = orders.map(o => {
            const lq = liquors.find(l => l.id === o.liquor_id);
            return [
                o.date,
                lq ? lq.name : '-',
                o.quantity || 0,
                o.unit_price || 0,
                o.total_cost || 0,
                o.supplier || '-'
            ];
        });
        this.download(data, headers, `발주내역_${Format.today()}`, '발주내역');
    },

    // 아가씨 지급 내역 내보내기
    exportGirls(girls, payments, staff) {
        const headers = ['이름', '담당', '상태', '지급일', '유형', '금액', '메모'];
        const data = [];
        girls.forEach(g => {
            const s = staff.find(st => st.id === g.staff_id);
            const gPayments = payments.filter(p => p.girl_id === g.id).sort((a, b) => b.date.localeCompare(a.date));
            if (gPayments.length > 0) {
                gPayments.forEach(p => {
                    const typeLabel = p.type === 'standby' ? '대기비' : p.type === 'full_attendance' ? '만근비' : '이벤트';
                    data.push([g.name, s ? s.name : '-', g.active ? '활성' : '비활성', p.date, typeLabel, p.amount || 0, p.memo || '']);
                });
            } else {
                data.push([g.name, s ? s.name : '-', g.active ? '활성' : '비활성', '-', '-', 0, '']);
            }
        });
        this.download(data, headers, `아가씨지급내역_${Format.today()}`, '아가씨지급내역');
    },

    // 대시보드 직원별 실적 내보내기
    exportStaffStats(staffStats) {
        const headers = ['지점명', '대표자/직원명', '직책', '정산 건수', '총 매출', '지출', '와리 수령', '순수익', '외상 잔액', '외상 건수'];
        const data = staffStats.map(s => {
            const roleMap = { president: '영업사장', manager: '실장', staff: '스탭' };
            return [
                s.branch_name || '-',
                s.name,
                roleMap[s.role] || s.role,
                s.salesCount || 0,
                s.revenue || 0,
                s.expense || 0,
                s.wari || 0,
                s.netProfit || 0,
                s.receivable || 0,
                s.receivableCount || 0
            ];
        });
        this.download(data, headers, `직원별실적_${Format.today()}`, '직원별실적');
    },

    // 직원 목록 내보내기 (직원관리 페이지)
    exportStaffList(staffList) {
        const headers = ['지점명', '대표자/직원명', '직책', '입사일', '급여', '인센티브율(%)', '총 와리', '외상 잔액'];
        const data = staffList.map(s => {
            const roleMap = { president: '영업사장', manager: '실장', staff: '스탭' };
            return [
                s.branch_name || '-',
                s.name,
                roleMap[s.role] || s.role,
                s.hire_date || '-',
                s.salary || 0,
                s.incentive_rate || 0,
                s.totalWari || 0,
                s.outstandingCredit || 0
            ];
        });
        this.download(data, headers, `직원목록_${Format.today()}`, '직원목록');
    },

    // 매입/매출 현황 내보내기
    exportPurchaseSales(summary, periodLabel) {
        const headers = ['구분', '항목', '금액'];
        const data = [
            ['매출', '총 매출', summary.totalRevenue],
            ['매출', '현금 매출', summary.cashRevenue],
            ['매출', '카드 매출', summary.cardRevenue],
            ['매출', '외상 매출', summary.creditRevenue],
            ['', '', ''],
            ['매입', '총 매입 (주류 발주)', summary.totalPurchase],
            ...summary.purchaseItems.map(i => ['매입', i.name, i.amount]),
            ['', '', ''],
            ['지출', '총 지출', summary.totalExpense],
            ...summary.expenseItems.map(i => ['지출', i.name, i.amount]),
            ['', '', ''],
            ['인센티브', '와리 총액', summary.totalWari],
            ['', '', ''],
            ['손익', '순수익 (매출-매입-지출-와리)', summary.netProfit]
        ];
        this.download(data, headers, `매입매출현황_${periodLabel}_${Format.today()}`, '매입매출현황');
    }
};

window.ExcelExport = ExcelExport;
