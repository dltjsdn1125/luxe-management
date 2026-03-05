-- 주류 재고 지점별 분리 마이그레이션
-- Supabase SQL Editor에서 실행하세요.
-- 기존 재고는 branch_id NULL로 유지 (전체 공용). 새 발주/정산은 지점별 재고 사용.

ALTER TABLE liquor_inventory ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_liquor_inv_branch_null ON liquor_inventory(liquor_id) WHERE branch_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_liquor_inv_branch_liquor ON liquor_inventory(branch_id, liquor_id) WHERE branch_id IS NOT NULL;
