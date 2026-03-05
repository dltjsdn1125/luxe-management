-- 지점별 주류 재고 초기화
-- 1) 공용(branch_id NULL) 재고를 지점별로 분할
-- 2) 신규 지점 추가 시 해당 지점의 모든 주종 재고 레코드 생성
-- Supabase SQL Editor에서 실행하세요.

-- 공용 재고를 지점별로 분할 (기존 branch_id NULL 레코드 처리)
DO $$
DECLARE
  rec RECORD;
  branch_rec RECORD;
  per_branch INT;
  remainder INT;
  idx INT;
BEGIN
  FOR rec IN SELECT li.id, li.liquor_id, li.quantity, li.alert_threshold
             FROM liquor_inventory li
             WHERE li.branch_id IS NULL
  LOOP
    SELECT COUNT(*) INTO idx FROM branches;
    IF idx > 0 THEN
      per_branch := rec.quantity / idx;
      remainder := rec.quantity % idx;
      idx := 0;
      FOR branch_rec IN SELECT id FROM branches ORDER BY name
      LOOP
        INSERT INTO liquor_inventory (liquor_id, branch_id, quantity, alert_threshold, _deleted)
        VALUES (rec.liquor_id, branch_rec.id,
                per_branch + CASE WHEN idx < remainder THEN 1 ELSE 0 END,
                rec.alert_threshold, false);
        idx := idx + 1;
      END LOOP;
      DELETE FROM liquor_inventory WHERE id = rec.id;
    END IF;
  END LOOP;
END $$;

-- 신규 지점 추가 후 실행: 해당 지점(branch_id)에 재고 레코드가 없는 모든 주종에 대해 0으로 생성
-- 사용법: 아래 INSERT에서 'NEW_BRANCH_UUID'를 실제 branch id로 교체 후 실행
/*
INSERT INTO liquor_inventory (liquor_id, branch_id, quantity, alert_threshold, _deleted)
SELECT l.id, 'NEW_BRANCH_UUID'::uuid, 0, 10, false
FROM liquor l
WHERE NOT EXISTS (
  SELECT 1 FROM liquor_inventory li
  WHERE li.liquor_id = l.id AND li.branch_id = 'NEW_BRANCH_UUID'::uuid
);
*/
