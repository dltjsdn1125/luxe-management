-- LUXE MGMT - Supabase 데이터베이스 스키마 (정규화 v2)
-- Supabase 대시보드의 SQL Editor에서 실행하세요
-- 테이블 생성 순서: 참조 의존성을 고려하여 정렬

-- ═══ 조직 ═══

CREATE TABLE branches (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    address TEXT,
    phone TEXT,
    room_count INTEGER DEFAULT 0,
    manager_id UUID,
    manager_name TEXT,
    _deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ═══ 인사 ═══

CREATE TABLE staff (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    branch_name TEXT,
    role TEXT NOT NULL CHECK (role IN ('president', 'manager', 'staff')),
    hire_date DATE,
    pay_date INTEGER DEFAULT 25,
    salary INTEGER DEFAULT 0,
    incentive_rate INTEGER DEFAULT 15,
    active BOOLEAN DEFAULT true,
    _deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    email TEXT,
    auth_id UUID,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'owner', 'staff')),
    staff_id UUID REFERENCES staff(id),
    _deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ═══ 아가씨 (girls, liquor 참조 대상 → 먼저 생성) ═══

CREATE TABLE girls (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    staff_id UUID REFERENCES staff(id),
    active BOOLEAN DEFAULT true,
    incentive_rate INTEGER DEFAULT 10,
    standby_fee INTEGER DEFAULT 150000,
    event_fee INTEGER DEFAULT 200000,
    _deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE girl_payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    girl_id UUID REFERENCES girls(id),
    date DATE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('standby', 'full_attendance', 'event')),
    amount BIGINT DEFAULT 0,
    memo TEXT,
    staff_id UUID REFERENCES staff(id),
    entered_by UUID REFERENCES staff(id),
    _deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ═══ 주류 (liquor 참조 대상 → 먼저 생성) ═══

CREATE TABLE liquor_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    _deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE liquor (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    category_id UUID REFERENCES liquor_categories(id),
    cost_price INTEGER DEFAULT 0,
    sell_price INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT true,
    _deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE liquor_inventory (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    liquor_id UUID REFERENCES liquor(id),
    quantity INTEGER DEFAULT 0,
    alert_threshold INTEGER DEFAULT 10,
    _deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE liquor_orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date DATE NOT NULL,
    liquor_id UUID REFERENCES liquor(id),
    liquor_name TEXT,
    quantity INTEGER DEFAULT 0,
    unit_price INTEGER DEFAULT 0,
    total_cost BIGINT DEFAULT 0,
    supplier TEXT,
    entered_by UUID REFERENCES staff(id),
    _deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ═══ 설정 ═══

CREATE TABLE settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    value TEXT,
    _deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE branch_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT,
    _deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(branch_id, key)
);

-- ═══ 일일 정산 (정규화) ═══

CREATE TABLE daily_sales (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date DATE NOT NULL,
    rooms INTEGER DEFAULT 0,
    tc_unit_price BIGINT DEFAULT 100000,
    total_joodae BIGINT DEFAULT 0,
    total_tc BIGINT DEFAULT 0,
    total_revenue BIGINT DEFAULT 0,
    cash_amount BIGINT DEFAULT 0,
    card_amount BIGINT DEFAULT 0,
    borrowing_amount BIGINT DEFAULT 0,
    other_amount BIGINT DEFAULT 0,
    credit_amount BIGINT DEFAULT 0,
    credit_items JSONB DEFAULT '[]',
    total_staff_wari BIGINT DEFAULT 0,
    total_girl_wari BIGINT DEFAULT 0,
    total_wari BIGINT DEFAULT 0,
    total_girl_pay BIGINT DEFAULT 0,
    total_expenses BIGINT DEFAULT 0,
    carryover BIGINT DEFAULT 0,
    petty_cash BIGINT DEFAULT 0,
    net_revenue BIGINT DEFAULT 0,
    net_settlement BIGINT DEFAULT 0,
    liquor_items JSONB DEFAULT '[]',
    wari_items JSONB DEFAULT '[]',
    wari_girl_items JSONB DEFAULT '[]',
    girl_pay_items JSONB DEFAULT '[]',
    expense_items JSONB DEFAULT '[]',
    entered_by UUID REFERENCES staff(id),
    closed BOOLEAN DEFAULT false,
    closed_at TIMESTAMPTZ,
    _deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE daily_sale_rooms (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    daily_sales_id UUID NOT NULL REFERENCES daily_sales(id) ON DELETE CASCADE,
    room_number TEXT,
    vip_name TEXT,
    staff_id UUID REFERENCES staff(id),
    staff_name TEXT,
    joodae BIGINT DEFAULT 0,
    tc_times INTEGER DEFAULT 0,
    tc_amount BIGINT DEFAULT 0,
    room_revenue BIGINT DEFAULT 0,
    pay_cash BIGINT DEFAULT 0,
    pay_card BIGINT DEFAULT 0,
    pay_borrowing BIGINT DEFAULT 0,
    pay_other BIGINT DEFAULT 0,
    pay_credit BIGINT DEFAULT 0,
    credit_customer TEXT,
    _deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE daily_sale_room_girls (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id UUID NOT NULL REFERENCES daily_sale_rooms(id) ON DELETE CASCADE,
    girl_id UUID REFERENCES girls(id),
    name TEXT,
    entry_time TEXT,
    exit_time TEXT,
    times INTEGER DEFAULT 0,
    _deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE daily_sale_room_liquors (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id UUID NOT NULL REFERENCES daily_sale_rooms(id) ON DELETE CASCADE,
    liquor_id UUID REFERENCES liquor(id),
    name TEXT,
    qty INTEGER DEFAULT 0,
    price BIGINT DEFAULT 0,
    service INTEGER DEFAULT 0,
    subtotal BIGINT DEFAULT 0,
    _deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ═══ 와리 (인센티브) ═══

CREATE TABLE wari (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    staff_id UUID REFERENCES staff(id),
    girl_id UUID REFERENCES girls(id),
    daily_sales_id UUID REFERENCES daily_sales(id),
    date DATE NOT NULL,
    amount BIGINT DEFAULT 0,
    type TEXT CHECK (type IN ('staff', 'girl')),
    entered_by UUID REFERENCES staff(id),
    _deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ═══ 외상 (채권) ═══

CREATE TABLE receivables (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date DATE NOT NULL,
    staff_id UUID REFERENCES staff(id),
    customer TEXT NOT NULL,
    amount BIGINT DEFAULT 0,
    paid_amount BIGINT DEFAULT 0,
    due_date DATE,
    status TEXT DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partial', 'paid')),
    entered_by UUID REFERENCES staff(id),
    daily_sales_id UUID REFERENCES daily_sales(id),
    _deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE receivable_payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    receivable_id UUID REFERENCES receivables(id),
    amount BIGINT DEFAULT 0,
    method TEXT CHECK (method IN ('transfer', 'card', 'cash')),
    paid_date DATE,
    _deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ═══ 지출 ═══

CREATE TABLE expense_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    is_system BOOLEAN DEFAULT false,
    _deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE expenses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date DATE NOT NULL,
    category_id UUID REFERENCES expense_categories(id),
    category_name TEXT,
    amount BIGINT DEFAULT 0,
    memo TEXT,
    entered_by UUID REFERENCES staff(id),
    _deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE base_expense_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    amount BIGINT DEFAULT 0,
    due_day INTEGER DEFAULT 0,
    category TEXT,
    memo TEXT,
    _deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ═══ 설비 ═══

CREATE TABLE room_types (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    base_charge BIGINT DEFAULT 0,
    min_order BIGINT DEFAULT 0,
    capacity INTEGER DEFAULT 0,
    description TEXT,
    _deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ═══ 인덱스 ═══

CREATE INDEX idx_daily_sales_date ON daily_sales(date);
CREATE INDEX idx_daily_sales_entered_by ON daily_sales(entered_by);
CREATE INDEX idx_daily_sale_rooms_sale ON daily_sale_rooms(daily_sales_id);
CREATE INDEX idx_daily_sale_room_girls_room ON daily_sale_room_girls(room_id);
CREATE INDEX idx_daily_sale_room_liquors_room ON daily_sale_room_liquors(room_id);
CREATE INDEX idx_branch_settings_branch ON branch_settings(branch_id);
CREATE INDEX idx_receivables_daily_sales ON receivables(daily_sales_id);
CREATE INDEX idx_wari_daily_sales ON wari(daily_sales_id);
CREATE INDEX idx_expenses_date ON expenses(date);
CREATE INDEX idx_girl_payments_date ON girl_payments(date);
CREATE INDEX idx_girls_staff ON girls(staff_id);
CREATE INDEX idx_liquor_orders_date ON liquor_orders(date);
CREATE INDEX idx_receivable_payments_rec ON receivable_payments(receivable_id);

-- ═══ branches.manager_id FK (staff 생성 후 추가) ═══

ALTER TABLE branches ADD CONSTRAINT fk_branches_manager FOREIGN KEY (manager_id) REFERENCES staff(id);

-- ═══ 기본 시드 데이터 ═══

INSERT INTO expense_categories (name, is_system) VALUES
    ('와리 (인센티브)', true),
    ('아가씨 지급비', true),
    ('주류 대금', true),
    ('과일·식자재·비품·쿠팡', false),
    ('인터넷·공과금·기타', false),
    ('월세·관리비·세금', false),
    ('월급', true),
    ('꽃·화환·기프트', false),
    ('세탁·청소·위생', false),
    ('기타', false);

INSERT INTO settings (key, value) VALUES
    ('full_attendance_days', '25'),
    ('tc_unit_price', '100000'),
    ('default_standby_fee', '150000'),
    ('default_event_fee', '200000');

-- ═══ RLS (Row Level Security) ═══
-- 모든 테이블에 RLS 활성화 + anon/authenticated 전체 접근 정책
-- (앱 자체 인증 사용 - users 테이블 기반)

DO $$
DECLARE
    t TEXT;
    tables TEXT[] := ARRAY[
        'staff', 'users', 'branches', 'girls', 'girl_payments',
        'liquor', 'liquor_categories', 'liquor_inventory', 'liquor_orders',
        'settings', 'branch_settings',
        'daily_sales', 'daily_sale_rooms', 'daily_sale_room_girls', 'daily_sale_room_liquors',
        'wari', 'receivables', 'receivable_payments',
        'expense_categories', 'expenses', 'base_expense_items', 'room_types'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS allow_anon_all ON %I', t);
        EXECUTE format('CREATE POLICY allow_anon_all ON %I FOR ALL TO anon USING (true) WITH CHECK (true)', t);
        EXECUTE format('DROP POLICY IF EXISTS allow_authenticated_all ON %I', t);
        EXECUTE format('CREATE POLICY allow_authenticated_all ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
    END LOOP;
END $$;
