-- ═══════════════════════════════════════════════════════════════════════════════
-- LUXE MGMT - 지점별 데이터 격리·동기화·출근 저장 요구사항 반영
-- Supabase SQL Editor에서 실행하세요.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. 주류 재고 지점별 분리 (001 마이그레이션) ───
ALTER TABLE liquor_inventory ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_liquor_inv_branch_null ON liquor_inventory(liquor_id) WHERE branch_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_liquor_inv_branch_liquor ON liquor_inventory(branch_id, liquor_id) WHERE branch_id IS NOT NULL;

-- ─── 2. users-staff 동기화 (관리자↔지점 데이터 일치) ───
-- 2-1. 지점 대표 staff: 지점명과 동일한 staff 없으면 생성 (압구정점, 강남 본점 등)
INSERT INTO staff (name, branch_name, role, hire_date, pay_date, salary, incentive_rate, active, _deleted)
SELECT b.name, b.name, 'manager', CURRENT_DATE, 25, 0, 15, true, false
FROM branches b
WHERE b._deleted = false
  AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.branch_name = b.name AND s.name = b.name AND s._deleted = false);

-- 2-2. 이름 일치하는 staff에 users.staff_id 연결 (기존 직원 + 지점 대표)
UPDATE users u
SET staff_id = s.id, updated_at = now()
FROM staff s
WHERE u.role = 'staff'
  AND u._deleted = false
  AND s._deleted = false
  AND (u.staff_id IS NULL OR u.staff_id != s.id)
  AND u.name = s.name;

-- ─── 3. 지점별 조회 성능 최적화 인덱스 ───
CREATE INDEX IF NOT EXISTS idx_staff_branch_name ON staff(branch_name) WHERE branch_name IS NOT NULL AND _deleted = false;
CREATE INDEX IF NOT EXISTS idx_daily_sales_entered_by_date ON daily_sales(entered_by, date);
CREATE INDEX IF NOT EXISTS idx_receivables_staff_date ON receivables(staff_id, date);
CREATE INDEX IF NOT EXISTS idx_receivables_entered_by ON receivables(entered_by);
CREATE INDEX IF NOT EXISTS idx_expenses_entered_by ON expenses(entered_by);
CREATE INDEX IF NOT EXISTS idx_girl_payments_girl_date ON girl_payments(girl_id, date);
CREATE INDEX IF NOT EXISTS idx_girls_staff_id ON girls(staff_id) WHERE _deleted = false;
CREATE INDEX IF NOT EXISTS idx_liquor_orders_entered_by ON liquor_orders(entered_by);

-- ─── 4. girl_payments 타입 확인 (출근 저장용 standby 지원) ───
-- type CHECK 제약: standby, full_attendance, event 이미 스키마에 정의됨
-- 필요 시 열 추가/변경 없음 (현재 스키마 그대로 사용)

-- ─── 5. getAll 1000건 제한 대응: order 변경으로 최신 데이터 우선 (선택) ───
-- DB 레이어에서 .order('created_at', { ascending: false }) 적용 권장
-- 앱 레이어(js/db.js)에서 수정 필요
