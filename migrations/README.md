# LUXE MGMT DB 마이그레이션

Supabase 대시보드 **SQL Editor**에서 아래 순서대로 실행하세요.

## 실행 순서

1. **001_liquor_inventory_branch.sql** – 주류 재고 지점별 분리
2. **002_branch_sync_and_requirement_updates.sql** – 지점 격리·동기화·출근 저장 반영

## 002 마이그레이션 내용

| 항목 | 설명 |
|------|------|
| 주류 재고 지점별 | `liquor_inventory.branch_id` 추가, 인덱스 생성 |
| users-staff 동기화 | 지점 대표 staff 생성, `users.staff_id` 연결 |
| 성능 인덱스 | `staff.branch_name`, `daily_sales`, `receivables` 등 지점별 조회용 |

## 실행 방법

1. [Supabase Dashboard](https://supabase.com/dashboard) → 프로젝트 선택
2. **SQL Editor** 메뉴 이동
3. **New query** 선택
4. `migrations/002_branch_sync_and_requirement_updates.sql` 내용 전체 복사 후 붙여넣기
5. **Run** 실행
