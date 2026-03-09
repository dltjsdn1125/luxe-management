/**
 * 통합 문서1.xlsx 셀 구조(병합 포함)를 JSON으로 출력합니다.
 * 사용: node scripts/excel-to-json.mjs
 * 출력: 장부form/통합문서1-structure.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const excelPath = path.join(rootDir, '장부form', '통합 문서1.xlsx');
const outPath = path.join(rootDir, '장부form', '통합문서1-structure.json');

async function main() {
    let XLSX;
    try {
        XLSX = (await import('xlsx')).default;
    } catch (e) {
        console.error('xlsx 패키지가 필요합니다. 실행: npm install xlsx --save-dev');
        process.exit(1);
    }

    if (!fs.existsSync(excelPath)) {
        console.error('파일을 찾을 수 없습니다:', excelPath);
        process.exit(1);
    }

    const wb = XLSX.readFile(excelPath);
    const sheets = wb.SheetNames.map((name, idx) => {
        const sheet = wb.Sheets[name];
        const ref = sheet['!ref'] || 'A1';
        const merges = (sheet['!merges'] || []).map(m => ({
            s: { r: m.s.r, c: m.s.c },
            e: { r: m.e.r, c: m.e.c }
        }));
        const range = XLSX.utils.decode_range(ref);
        const rows = [];
        for (let r = range.s.r; r <= range.e.r; r++) {
            const row = [];
            for (let c = range.s.c; c <= range.e.c; c++) {
                const addr = XLSX.utils.encode_cell({ r, c });
                const cell = sheet[addr];
                let value = cell && cell.v !== undefined ? cell.v : '';
                if (typeof value === 'object' && value !== null && value instanceof Date) {
                    value = value.toISOString();
                }
                row.push(value);
            }
            rows.push(row);
        }
        return {
            index: idx,
            name,
            ref,
            numRows: range.e.r - range.s.r + 1,
            numCols: range.e.c - range.s.c + 1,
            merges,
            rows
        };
    });

    const result = {
        source: '통합 문서1.xlsx',
        generatedAt: new Date().toISOString(),
        sheets,
        branchDailySettlement: inferBranchDailySettlement(sheets),
        settlementInputForm: inferSettlementInputForm(sheets)
    };

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
    console.log('저장됨:', outPath);
}

function inferSettlementInputForm(sheets) {
    const keywords = ['Room', 'VIP', '담당', '주대', '이름', 'Time', '차용', '현금', '외상', 'T/C', '기타', '카드', '매출'];
    for (const sh of sheets) {
        for (let r = 0; r < sh.rows.length; r++) {
            for (let c = 0; c < (sh.rows[r]?.length || 0); c++) {
                const val = String(sh.rows[r][c] || '');
                if (keywords.some(k => val.includes(k))) {
                    const startR = Math.max(0, r - 2);
                    const endR = Math.min(sh.rows.length, r + 25);
                    const startC = Math.max(0, c - 1);
                    let endC = c + 1;
                    for (let rr = startR; rr < endR; rr++) {
                        endC = Math.max(endC, (sh.rows[rr]?.length || 0));
                    }
                    const blockRows = [];
                    const blockMerges = [];
                    for (let rr = startR; rr < endR; rr++) {
                        const row = [];
                        for (let cc = startC; cc < endC; cc++) {
                            row.push(sh.rows[rr][cc] ?? '');
                        }
                        blockRows.push(row);
                    }
                    (sh.merges || []).forEach(m => {
                        if (m.s.r >= startR && m.e.r < endR && m.s.c >= startC && m.e.c < endC) {
                            blockMerges.push({
                                s: { r: m.s.r - startR, c: m.s.c - startC },
                                e: { r: m.e.r - startR, c: m.e.c - startC }
                            });
                        }
                    });
                    return { sheetIndex: sheets.indexOf(sh), startRow: startR, startCol: startC, rows: blockRows, merges: blockMerges };
                }
            }
        }
    }
    return null;
}

function inferBranchDailySettlement(sheets) {
    const headerLabels = ['지점 / 직원', '총 매출', '와리', '아가씨', '지출', '순이익', '이익률', '정산금', '비중'];
    const columnKeys = ['branch', 'revenue', 'wari', 'girlPay', 'expenses', 'netProfit', 'margin', 'settlement', 'share'];
    const align = ['left', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right'];

    let sheetIndex = 0;
    let headerRowCount = 1;
    let dataStartRow = 1;

    for (let si = 0; si < sheets.length; si++) {
        const sh = sheets[si];
        for (let r = 0; r < Math.min(sh.rows.length, 5); r++) {
            const row = sh.rows[r];
            const rowText = row.join(' ').trim();
            if (rowText.includes('지점') && (rowText.includes('매출') || rowText.includes('정산'))) {
                sheetIndex = si;
                headerRowCount = 1;
                dataStartRow = r + 1;
                break;
            }
        }
    }

    const headerCells = [];
    const sh = sheets[sheetIndex] || sheets[0];
    const mergeMap = buildMergeMap(sh.merges);

    if (sh.rows.length > 0) {
        const headerRow = sh.rows[0];
        let c = 0;
        while (c < headerRow.length) {
            const m = mergeMap.get(`${0},${c}`);
            const label = headerRow[c];
            const colSpan = m ? m.e.c - m.s.c + 1 : 1;
            const rowSpan = m ? m.e.r - m.s.r + 1 : 1;
            headerCells.push({
                label: label !== undefined && label !== '' ? String(label) : headerLabels[headerCells.length] || `열${headerCells.length + 1}`,
                colSpan,
                rowSpan
            });
            c += colSpan;
        }
    }

    if (headerCells.length === 0) {
        headerCells.push(...headerLabels.map((label, i) => ({
            label,
            colSpan: 1,
            rowSpan: 1
        })));
    }

    const columns = columnKeys.map((key, i) => ({
        key,
        label: headerLabels[i],
        align: align[i] || 'right'
    }));

    return {
        sheetIndex,
        headerRowCount,
        dataStartRow,
        headerCells,
        columns
    };
}

function buildMergeMap(merges) {
    const map = new Map();
    (merges || []).forEach(m => {
        for (let r = m.s.r; r <= m.e.r; r++) {
            for (let c = m.s.c; c <= m.e.c; c++) {
                map.set(`${r},${c}`, { s: m.s, e: m.e });
            }
        }
    });
    return map;
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
