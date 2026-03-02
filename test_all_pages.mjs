import puppeteer from 'puppeteer';

const BASE = 'http://127.0.0.1:8080/index.html';
const consoleErrors = [];
const consoleWarnings = [];

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push({ url: page.url(), text: msg.text() });
    if (msg.type() === 'warning') consoleWarnings.push({ url: page.url(), text: msg.text() });
  });
  page.on('pageerror', err => {
    consoleErrors.push({ url: page.url(), text: `PAGE_ERROR: ${err.message}` });
  });
  page.on('requestfailed', req => {
    consoleErrors.push({ url: page.url(), text: `REQUEST_FAILED: ${req.url()} - ${req.failure()?.errorText}` });
  });

  // ===== 1. 초기 로딩 =====
  console.log('=== 1. 초기 페이지 로딩 ===');
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(2000);
  const hash1 = await page.evaluate(() => window.location.hash);
  console.log(`해시: ${hash1}`);

  // ===== 2. 로그인 =====
  console.log('\n=== 2. 로그인 테스트 ===');
  // 페이지가 이미 로그인 화면 - 기본 값으로 로그인
  const loginResult = await page.evaluate(() => {
    const form = document.getElementById('login-form');
    const u = document.getElementById('login-username');
    const p = document.getElementById('login-password');
    if (!form || !u || !p) return { ok: false, reason: 'form elements missing' };
    // 기본 값 사용 (admin/admin123이 이미 채워져 있음)
    form.dispatchEvent(new Event('submit'));
    return { ok: true };
  });
  await sleep(2000);
  const afterLogin = await page.evaluate(() => ({
    hash: window.location.hash,
    loggedIn: !!localStorage.getItem('luxe_session'),
    headerVisible: !document.getElementById('app-header')?.classList.contains('hidden')
  }));
  console.log(`로그인 결과: ${JSON.stringify(afterLogin)}`);

  // ===== 3. 대시보드 =====
  console.log('\n=== 3. 대시보드 테스트 ===');
  let ec = consoleErrors.length;
  await page.evaluate(() => App.navigate('dashboard'));
  await sleep(3000);
  const dash = await page.evaluate(() => {
    const c = document.getElementById('app-content');
    return {
      content: c?.innerHTML.length > 100,
      charts: document.querySelectorAll('canvas').length,
      tables: c?.querySelectorAll('table').length || 0
    };
  });
  console.log(`대시보드: content=${dash.content}, charts=${dash.charts}, tables=${dash.tables}, errors=${consoleErrors.length - ec}`);
  if (consoleErrors.length > ec) consoleErrors.slice(ec).forEach(e => console.log(`  ERR: ${e.text}`));

  // 기간 필터 테스트
  ec = consoleErrors.length;
  const periodBtns = await page.evaluate(() => {
    const btns = document.querySelectorAll('[data-period]');
    return Array.from(btns).map(b => b.dataset.period);
  });
  console.log(`기간필터 버튼: ${periodBtns.join(', ') || '없음'}`);
  for (const p of periodBtns.slice(0, 3)) {
    const before = consoleErrors.length;
    await page.evaluate((period) => {
      const btn = document.querySelector(`[data-period="${period}"]`);
      if (btn) btn.click();
    }, p);
    await sleep(2000);
    if (consoleErrors.length > before) {
      console.log(`  기간 '${p}' 클릭 에러: ${consoleErrors.slice(before).map(e => e.text).join('; ')}`);
    }
  }

  // ===== 4. 일일정산 =====
  console.log('\n=== 4. 일일정산 테스트 ===');
  ec = consoleErrors.length;
  await page.evaluate(() => App.navigate('settlement'));
  await sleep(2000);
  const sett = await page.evaluate(() => {
    const c = document.getElementById('app-content');
    return {
      rows: c?.querySelectorAll('tbody tr').length || 0,
      newBtn: !!document.getElementById('btn-new-settlement'),
      viewBtns: c?.querySelectorAll('[data-view]').length || 0
    };
  });
  console.log(`일일정산: rows=${sett.rows}, newBtn=${sett.newBtn}, viewBtns=${sett.viewBtns}, errors=${consoleErrors.length - ec}`);
  if (consoleErrors.length > ec) consoleErrors.slice(ec).forEach(e => console.log(`  ERR: ${e.text}`));

  // 새 정산 폼 열기
  ec = consoleErrors.length;
  await page.evaluate(() => { const b = document.getElementById('btn-new-settlement'); if (b) b.click(); });
  await sleep(2000);
  const formCheck = await page.evaluate(() => {
    const c = document.getElementById('app-content');
    return {
      hasDate: !!c?.querySelector('input[type="date"]'),
      hasAddRoom: !!document.getElementById('btn-add-room'),
      contentLen: c?.innerHTML.length || 0
    };
  });
  console.log(`정산폼: date=${formCheck.hasDate}, addRoom=${formCheck.hasAddRoom}, errors=${consoleErrors.length - ec}`);
  if (consoleErrors.length > ec) consoleErrors.slice(ec).forEach(e => console.log(`  ERR: ${e.text}`));

  // 상세보기 테스트
  await page.evaluate(() => App.navigate('settlement'));
  await sleep(2000);
  ec = consoleErrors.length;
  const hasView = await page.evaluate(() => {
    const b = document.querySelector('[data-view]');
    if (b) { b.click(); return true; }
    return false;
  });
  if (hasView) {
    await sleep(2000);
    console.log(`정산 상세보기: errors=${consoleErrors.length - ec}`);
    if (consoleErrors.length > ec) consoleErrors.slice(ec).forEach(e => console.log(`  ERR: ${e.text}`));
  }

  // ===== 5. 직원관리 =====
  console.log('\n=== 5. 직원관리 테스트 ===');
  ec = consoleErrors.length;
  await page.evaluate(() => App.navigate('staff'));
  await sleep(2000);
  const stf = await page.evaluate(() => {
    const c = document.getElementById('app-content');
    return {
      staffCards: c?.querySelectorAll('.staff-card').length || 0,
      addBtn: !!document.getElementById('btn-add-staff')
    };
  });
  console.log(`직원관리: cards=${stf.staffCards}, addBtn=${stf.addBtn}, errors=${consoleErrors.length - ec}`);
  if (consoleErrors.length > ec) consoleErrors.slice(ec).forEach(e => console.log(`  ERR: ${e.text}`));

  // 직원 카드 클릭
  ec = consoleErrors.length;
  await page.evaluate(() => { const c = document.querySelector('.staff-card'); if (c) c.click(); });
  await sleep(2000);
  console.log(`직원 상세 클릭: errors=${consoleErrors.length - ec}`);
  if (consoleErrors.length > ec) consoleErrors.slice(ec).forEach(e => console.log(`  ERR: ${e.text}`));

  // 직원 추가 모달
  ec = consoleErrors.length;
  await page.evaluate(() => { const b = document.getElementById('btn-add-staff'); if (b) b.click(); });
  await sleep(1000);
  const staffModalOk = await page.evaluate(() => !document.getElementById('app-modal')?.classList.contains('hidden'));
  console.log(`직원추가 모달: visible=${staffModalOk}, errors=${consoleErrors.length - ec}`);
  await page.evaluate(() => document.getElementById('modal-cancel')?.click());
  await sleep(500);

  // ===== 6. 아가씨관리 =====
  console.log('\n=== 6. 아가씨관리 테스트 ===');
  ec = consoleErrors.length;
  await page.evaluate(() => App.navigate('girls'));
  await sleep(3000);
  const girls = await page.evaluate(() => {
    const c = document.getElementById('app-content');
    return {
      cards: c?.querySelectorAll('[data-girl-detail]').length || 0,
      charts: document.querySelectorAll('canvas').length,
      addBtn: !!document.getElementById('btn-add-girl'),
      payBtn: !!document.getElementById('btn-add-payment')
    };
  });
  console.log(`아가씨관리: cards=${girls.cards}, charts=${girls.charts}, addBtn=${girls.addBtn}, payBtn=${girls.payBtn}, errors=${consoleErrors.length - ec}`);
  if (consoleErrors.length > ec) consoleErrors.slice(ec).forEach(e => console.log(`  ERR: ${e.text}`));

  // 아가씨 상세 모달
  ec = consoleErrors.length;
  await page.evaluate(() => { const b = document.querySelector('[data-girl-detail]'); if (b) b.click(); });
  await sleep(1000);
  const girlModal = await page.evaluate(() => !document.getElementById('app-modal')?.classList.contains('hidden'));
  console.log(`아가씨 상세 모달: ${girlModal}, errors=${consoleErrors.length - ec}`);
  await page.evaluate(() => document.getElementById('modal-cancel')?.click());
  await sleep(500);

  // ===== 7. 주류관리 =====
  console.log('\n=== 7. 주류관리 테스트 ===');
  ec = consoleErrors.length;
  await page.evaluate(() => App.navigate('inventory'));
  await sleep(3000);
  const inv = await page.evaluate(() => {
    const c = document.getElementById('app-content');
    return {
      liquorCards: c?.querySelectorAll('[data-edit-liquor]').length || 0,
      charts: document.querySelectorAll('canvas').length,
      orderTable: !!c?.querySelector('table'),
      addLiquorBtn: !!document.getElementById('btn-add-liquor'),
      addOrderBtn: !!document.getElementById('btn-add-order')
    };
  });
  console.log(`주류관리: liquors=${inv.liquorCards}, charts=${inv.charts}, orderTable=${inv.orderTable}, errors=${consoleErrors.length - ec}`);
  if (consoleErrors.length > ec) consoleErrors.slice(ec).forEach(e => console.log(`  ERR: ${e.text}`));

  // 주류 추가 모달
  ec = consoleErrors.length;
  await page.evaluate(() => { const b = document.getElementById('btn-add-liquor'); if (b) b.click(); });
  await sleep(1000);
  const liqModal = await page.evaluate(() => !document.getElementById('app-modal')?.classList.contains('hidden'));
  console.log(`주류추가 모달: ${liqModal}, errors=${consoleErrors.length - ec}`);
  await page.evaluate(() => document.getElementById('modal-cancel')?.click());
  await sleep(500);

  // 발주 모달
  ec = consoleErrors.length;
  await page.evaluate(() => { const b = document.getElementById('btn-add-order'); if (b) b.click(); });
  await sleep(1000);
  const ordModal = await page.evaluate(() => !document.getElementById('app-modal')?.classList.contains('hidden'));
  console.log(`발주 모달: ${ordModal}, errors=${consoleErrors.length - ec}`);
  await page.evaluate(() => document.getElementById('modal-cancel')?.click());
  await sleep(500);

  // ===== 8. 외상관리 =====
  console.log('\n=== 8. 외상관리 테스트 ===');
  ec = consoleErrors.length;
  await page.evaluate(() => App.navigate('credit'));
  await sleep(2000);
  const cred = await page.evaluate(() => {
    const c = document.getElementById('app-content');
    return {
      rows: c?.querySelectorAll('tbody tr').length || 0,
      newBtn: !!document.getElementById('btn-new-credit'),
      payBtns: c?.querySelectorAll('[data-pay]').length || 0,
      histBtns: c?.querySelectorAll('[data-history]').length || 0
    };
  });
  console.log(`외상관리: rows=${cred.rows}, newBtn=${cred.newBtn}, payBtns=${cred.payBtns}, histBtns=${cred.histBtns}, errors=${consoleErrors.length - ec}`);
  if (consoleErrors.length > ec) consoleErrors.slice(ec).forEach(e => console.log(`  ERR: ${e.text}`));

  // 수금 모달
  ec = consoleErrors.length;
  await page.evaluate(() => { const b = document.querySelector('[data-pay]'); if (b) b.click(); });
  await sleep(1000);
  console.log(`수금 모달: errors=${consoleErrors.length - ec}`);
  await page.evaluate(() => document.getElementById('modal-cancel')?.click());
  await sleep(500);

  // 외상 신규 등록 모달
  ec = consoleErrors.length;
  await page.evaluate(() => { const b = document.getElementById('btn-new-credit'); if (b) b.click(); });
  await sleep(1000);
  const credModal = await page.evaluate(() => !document.getElementById('app-modal')?.classList.contains('hidden'));
  console.log(`외상등록 모달: ${credModal}, errors=${consoleErrors.length - ec}`);
  await page.evaluate(() => document.getElementById('modal-cancel')?.click());
  await sleep(500);

  // ===== 9. 지출관리 =====
  console.log('\n=== 9. 지출관리 테스트 ===');
  ec = consoleErrors.length;
  await page.evaluate(() => App.navigate('expenses'));
  await sleep(2000);
  const exp = await page.evaluate(() => {
    const c = document.getElementById('app-content');
    return {
      rows: c?.querySelectorAll('tbody tr').length || 0,
      addBtn: !!document.getElementById('btn-add-expense'),
      catBtn: !!document.getElementById('btn-manage-cat')
    };
  });
  console.log(`지출관리: rows=${exp.rows}, addBtn=${exp.addBtn}, catBtn=${exp.catBtn}, errors=${consoleErrors.length - ec}`);
  if (consoleErrors.length > ec) consoleErrors.slice(ec).forEach(e => console.log(`  ERR: ${e.text}`));

  // 지출 추가 모달
  ec = consoleErrors.length;
  await page.evaluate(() => { const b = document.getElementById('btn-add-expense'); if (b) b.click(); });
  await sleep(1000);
  console.log(`지출추가 모달: errors=${consoleErrors.length - ec}`);
  await page.evaluate(() => document.getElementById('modal-cancel')?.click());
  await sleep(500);

  // 카테고리 관리 모달
  ec = consoleErrors.length;
  await page.evaluate(() => { const b = document.getElementById('btn-manage-cat'); if (b) b.click(); });
  await sleep(1000);
  console.log(`카테고리관리 모달: errors=${consoleErrors.length - ec}`);
  await page.evaluate(() => document.getElementById('modal-cancel')?.click());
  await sleep(500);

  // ===== 10. 계정관리 =====
  console.log('\n=== 10. 계정관리 테스트 ===');
  ec = consoleErrors.length;
  await page.evaluate(() => App.navigate('accounts'));
  await sleep(2000);
  const acc = await page.evaluate(() => {
    const c = document.getElementById('app-content');
    return {
      rows: c?.querySelectorAll('tbody tr').length || 0,
      addBtn: !!document.getElementById('btn-add-account'),
      pwToggles: c?.querySelectorAll('.toggle-pw').length || 0,
      editBtns: c?.querySelectorAll('[data-edit-account]').length || 0
    };
  });
  console.log(`계정관리: rows=${acc.rows}, addBtn=${acc.addBtn}, pwToggles=${acc.pwToggles}, errors=${consoleErrors.length - ec}`);
  if (consoleErrors.length > ec) consoleErrors.slice(ec).forEach(e => console.log(`  ERR: ${e.text}`));

  // 비밀번호 토글
  ec = consoleErrors.length;
  await page.evaluate(() => { const b = document.querySelector('.toggle-pw'); if (b) b.click(); });
  await sleep(500);
  console.log(`비번토글: errors=${consoleErrors.length - ec}`);

  // 계정 편집 모달
  ec = consoleErrors.length;
  await page.evaluate(() => { const b = document.querySelector('[data-edit-account]'); if (b) b.click(); });
  await sleep(1000);
  console.log(`계정편집 모달: errors=${consoleErrors.length - ec}`);
  await page.evaluate(() => document.getElementById('modal-cancel')?.click());
  await sleep(500);

  // ===== 11. 전체 네비게이션 빠른 순회 =====
  console.log('\n=== 11. 네비게이션 순회 테스트 ===');
  const pages = ['dashboard','settlement','staff','girls','inventory','credit','expenses','accounts'];
  for (const pg of pages) {
    ec = consoleErrors.length;
    await page.evaluate((p) => App.navigate(p), pg);
    await sleep(2000);
    const ok = await page.evaluate(() => document.getElementById('app-content')?.innerHTML.length > 50);
    const newErr = consoleErrors.length - ec;
    if (newErr > 0) {
      console.log(`  ${pg}: errors=${newErr}`);
      consoleErrors.slice(ec).forEach(e => console.log(`    -> ${e.text}`));
    } else {
      console.log(`  ${pg}: OK`);
    }
  }

  // ===== 12. 엑셀 기능 확인 =====
  console.log('\n=== 12. 엑셀 내보내기 확인 ===');
  const xlCheck = await page.evaluate(() => ({
    xlsx: typeof window.XLSX !== 'undefined',
    excelExport: typeof window.ExcelExport !== 'undefined',
    chartJs: typeof window.Chart !== 'undefined',
    html2pdf: typeof window.html2pdf !== 'undefined'
  }));
  console.log(`XLSX: ${xlCheck.xlsx}, ExcelExport: ${xlCheck.excelExport}, Chart.js: ${xlCheck.chartJs}, html2pdf: ${xlCheck.html2pdf}`);

  // ===== 13. 로그아웃 =====
  console.log('\n=== 13. 로그아웃 테스트 ===');
  await page.evaluate(() => { window.confirm = () => true; });
  await page.evaluate(() => document.getElementById('btn-logout')?.click());
  await sleep(1500);
  const logoutOk = await page.evaluate(() => ({
    hash: window.location.hash,
    loggedIn: !!localStorage.getItem('luxe_session')
  }));
  console.log(`로그아웃: hash=${logoutOk.hash}, loggedIn=${logoutOk.loggedIn}`);

  // ===== SUMMARY =====
  console.log('\n\n========================================');
  console.log('       테스트 결과 종합 보고서');
  console.log('========================================');
  console.log(`총 콘솔 에러: ${consoleErrors.length}건`);
  console.log(`총 콘솔 경고: ${consoleWarnings.length}건`);

  if (consoleErrors.length > 0) {
    console.log('\n--- 에러 목록 (중복 제거) ---');
    const unique = [...new Set(consoleErrors.map(e => e.text))];
    unique.forEach((e, i) => {
      const cnt = consoleErrors.filter(x => x.text === e).length;
      console.log(`${i + 1}. [${cnt}회] ${e}`);
    });
  }

  if (consoleWarnings.length > 0) {
    console.log('\n--- 경고 목록 (중복 제거) ---');
    const unique = [...new Set(consoleWarnings.map(w => w.text))];
    unique.forEach((w, i) => {
      const cnt = consoleWarnings.filter(x => x.text === w).length;
      console.log(`${i + 1}. [${cnt}회] ${w}`);
    });
  }

  await browser.close();
  console.log('\n테스트 완료');
})();
