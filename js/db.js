// Supabase 기반 DB 추상화 레이어
const DB = {
    _sb() {
        return window._supabase;
    },

    // ═══ 기본 CRUD (모두 async) ═══

    async getAll(table) {
        const { data, error } = await this._sb()
            .from(table)
            .select('*')
            .eq('_deleted', false)
            .order('created_at', { ascending: true })
            .limit(2000);
        if (error) { console.error(`DB.getAll(${table}):`, error); return []; }
        return data || [];
    },

    // 날짜 범위 + 지점(entered_by/staff_id) 조건을 DB 레벨에서 처리
    // opts: { dateField, from, to, staffIds, staffField, orderField, orderAsc, limit }
    async getFiltered(table, opts = {}) {
        const {
            dateField = 'date',
            from,
            to,
            staffIds,           // string[] - entered_by 또는 staff_id 필터
            staffField = 'entered_by',
            orderField = 'date',
            orderAsc = false,
            limit = 2000,
        } = opts;

        let q = this._sb()
            .from(table)
            .select('*')
            .eq('_deleted', false);

        if (from) q = q.gte(dateField, from);
        if (to)   q = q.lte(dateField, to);
        if (staffIds && staffIds.length > 0) q = q.in(staffField, staffIds);

        q = q.order(orderField, { ascending: orderAsc }).limit(limit);

        const { data, error } = await q;
        if (error) { console.error(`DB.getFiltered(${table}):`, error); return []; }
        return data || [];
    },

    // 페이지네이션: { data, total, page, pageSize, totalPages }
    // opts: statusFilter { column, value }
    async getFilteredPaginated(table, opts = {}) {
        const {
            dateField = 'date',
            from,
            to,
            staffIds,
            staffField = 'entered_by',
            orderField = 'date',
            orderAsc = false,
            page = 1,
            pageSize = 50,
            statusFilter,
        } = opts;

        let q = this._sb()
            .from(table)
            .select('*', { count: 'exact', head: false })
            .eq('_deleted', false);

        if (from) q = q.gte(dateField, from);
        if (to)   q = q.lte(dateField, to);
        if (opts.orFilter) q = q.or(opts.orFilter);
        else if (staffIds && staffIds.length > 0) q = q.in(staffField, staffIds);
        if (statusFilter && statusFilter.column && statusFilter.value) q = q.eq(statusFilter.column, statusFilter.value);

        q = q.order(orderField, { ascending: orderAsc });

        const fromRow = (page - 1) * pageSize;
        q = q.range(fromRow, fromRow + pageSize - 1);

        const { data, error, count } = await q;
        if (error) { console.error(`DB.getFilteredPaginated(${table}):`, error); return { data: [], total: 0, page: 1, pageSize, totalPages: 0 }; }
        const total = count ?? 0;
        return {
            data: data || [],
            total,
            page,
            pageSize,
            totalPages: Math.max(1, Math.ceil(total / pageSize)),
        };
    },

    async getWhereIn(table, column, values) {
        if (!values || values.length === 0) return [];
        const arr = Array.isArray(values) ? values : [values];
        const CHUNK = 150;
        const out = [];
        for (let i = 0; i < arr.length; i += CHUNK) {
            const chunk = arr.slice(i, i + CHUNK);
            const { data, error } = await this._sb()
                .from(table)
                .select('*')
                .eq('_deleted', false)
                .in(column, chunk);
            if (error) { console.error(`DB.getWhereIn(${table}, ${column}):`, error); return out; }
            if (data) out.push(...data);
        }
        return out;
    },

    async getById(table, id) {
        const { data, error } = await this._sb()
            .from(table)
            .select('*')
            .eq('id', id)
            .eq('_deleted', false)
            .single();
        if (error) { console.error(`DB.getById(${table}, ${id}):`, error); return null; }
        return data;
    },

    async query(table, filterFn) {
        const all = await this.getAll(table);
        return all.filter(filterFn);
    },

    async insert(table, record) {
        // id는 Supabase 기본 gen_random_uuid()가 생성
        const clean = { ...record };
        delete clean.id;
        delete clean.created_at;
        delete clean.updated_at;

        const { data, error } = await this._sb()
            .from(table)
            .insert(clean)
            .select()
            .single();
        if (error) { console.error(`DB.insert(${table}):`, error); return null; }
        return data;
    },

    async update(table, id, updates) {
        const clean = { ...updates };
        delete clean.id;
        delete clean.created_at;
        clean.updated_at = new Date().toISOString();

        const { data, error } = await this._sb()
            .from(table)
            .update(clean)
            .eq('id', id)
            .select()
            .single();
        if (error) { console.error(`DB.update(${table}, ${id}):`, error); return null; }
        return data;
    },

    // 소프트 삭제
    async delete(table, id) {
        return this.update(table, id, { _deleted: true });
    },

    // 소프트 삭제된 항목 복구
    async restore(table, id) {
        return this.update(table, id, { _deleted: false });
    },

    // 삭제된 레코드 조회
    async getDeleted(table) {
        const { data, error } = await this._sb()
            .from(table)
            .select('*')
            .eq('_deleted', true)
            .order('created_at', { ascending: true });
        if (error) { console.error(`DB.getDeleted(${table}):`, error); return []; }
        return data || [];
    },

    async sum(table, field, filterFn) {
        let rows = await this.getAll(table);
        if (filterFn) rows = rows.filter(filterFn);
        return rows.reduce((acc, r) => acc + (Number(r[field]) || 0), 0);
    },

    async seedIfEmpty(table, seedData) {
        const { count, error } = await this._sb()
            .from(table)
            .select('id', { count: 'exact', head: true });
        if (error) { console.error(`DB.seedIfEmpty(${table}):`, error); return; }
        if (count === 0 || count === null) {
            const cleaned = seedData.map(r => {
                const c = { ...r };
                delete c.id; delete c.created_at; delete c.updated_at;
                return c;
            });
            for (let i = 0; i < cleaned.length; i += 50) {
                const batch = cleaned.slice(i, i + 50);
                const { error: e } = await this._sb().from(table).insert(batch);
                if (e) console.error(`DB.seedIfEmpty batch(${table}):`, e);
            }
        }
    },

    async clear(table) {
        const { error } = await this._sb()
            .from(table)
            .delete()
            .gte('created_at', '1900-01-01');
        if (error) {
            console.error(`DB.clear(${table}):`, error);
            return { error };
        }
        return { error: null };
    },

    async batchInsert(table, records) {
        if (!records || records.length === 0) return [];
        const cleaned = records.map(r => {
            const c = { ...r };
            delete c.id; delete c.created_at; delete c.updated_at;
            return c;
        });
        const allResults = [];
        for (let i = 0; i < cleaned.length; i += 50) {
            const batch = cleaned.slice(i, i + 50);
            const { data, error } = await this._sb().from(table).insert(batch).select();
            if (error) { console.error(`DB.batchInsert(${table}):`, error); continue; }
            if (data) allResults.push(...data);
        }
        return allResults;
    },

    async hardDeleteAll(table) {
        const { data, error } = await this._sb()
            .from(table)
            .delete()
            .gte('created_at', '1900-01-01')
            .select('id');
        if (error) {
            console.error(`DB.hardDeleteAll(${table}):`, error);
            return { deleted: 0, error };
        }
        return { deleted: data?.length || 0, error: null };
    },

    // ═══ 정규화된 룸 데이터 헬퍼 ═══

    async insertSaleRooms(saleId, roomDataArray) {
        if (!Array.isArray(roomDataArray)) return;
        for (const r of roomDataArray) {
            const room = await this.insert('daily_sale_rooms', {
                daily_sales_id: saleId,
                room_number: r.room_number, vip_name: r.vip_name,
                staff_id: r.staff_id, staff_name: r.staff_name,
                joodae: r.joodae, tc_times: r.tc_times, tc_amount: r.tc_amount,
                room_revenue: r.room_revenue,
                pay_cash: r.pay_cash, pay_card: r.pay_card,
                pay_borrowing: r.pay_borrowing, pay_other: r.pay_other,
                pay_credit: r.pay_credit, credit_customer: r.credit_customer
            });
            if (!room) continue;

            if (Array.isArray(r.girls)) {
                for (const g of r.girls) {
                    await this.insert('daily_sale_room_girls', {
                        room_id: room.id, girl_id: g.girl_id,
                        name: g.name, entry_time: g.entry_time,
                        exit_time: g.exit_time, times: g.times
                    });
                }
            }
            if (Array.isArray(r.liquor_items)) {
                for (const l of r.liquor_items) {
                    await this.insert('daily_sale_room_liquors', {
                        room_id: room.id, liquor_id: l.liquor_id,
                        name: l.name, qty: l.qty, price: l.price,
                        service: l.service, subtotal: l.subtotal
                    });
                }
            }
        }
    },

    async getSaleRooms(saleId) {
        const { data: rooms } = await this._sb()
            .from('daily_sale_rooms')
            .select('*')
            .eq('_deleted', false)
            .eq('daily_sales_id', saleId);
        const result = [];
        for (const r of rooms || []) {
            const [girlsRes, liquorRes] = await Promise.all([
                this._sb().from('daily_sale_room_girls').select('*').eq('_deleted', false).eq('room_id', r.id),
                this._sb().from('daily_sale_room_liquors').select('*').eq('_deleted', false).eq('room_id', r.id)
            ]);
            result.push({
                ...r,
                girls: girlsRes.data || [],
                liquor_items: liquorRes.data || []
            });
        }
        return result;
    },

    async getSaleRoomCount(saleId) {
        const { count } = await this._sb()
            .from('daily_sale_rooms')
            .select('*', { count: 'exact', head: true })
            .eq('_deleted', false)
            .eq('daily_sales_id', saleId);
        return count ?? 0;
    },

    // ═══ 지점별 설정 헬퍼 ═══

    async getBranchSetting(key, branchId) {
        if (branchId) {
            const bsList = await this.getAll('branch_settings');
            const bs = bsList.find(x => x.branch_id === branchId && x.key === key);
            if (bs) return bs.value;
        }
        const gsList = await this.getAll('settings');
        const gs = gsList.find(x => x.key === key);
        return gs ? gs.value : null;
    },

    async saveBranchSetting(key, value, branchId) {
        if (branchId) {
            const bsList = await this.getAll('branch_settings');
            const bs = bsList.find(x => x.branch_id === branchId && x.key === key);
            if (bs) await this.update('branch_settings', bs.id, { value });
            else await this.insert('branch_settings', { branch_id: branchId, key, value });
        } else {
            const gsList = await this.getAll('settings');
            const gs = gsList.find(x => x.key === key);
            if (gs) await this.update('settings', gs.id, { value });
            else await this.insert('settings', { key, value });
        }
    },

    // ═══ 실시간 동기화 (Supabase Realtime) ═══

    _subscriptions: [],

    subscribe(callback) {
        // Supabase Realtime으로 모든 테이블 변경 감지
        const channel = this._sb()
            .channel('db-changes')
            .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
                callback(payload);
            })
            .subscribe();
        this._subscriptions.push(channel);
        return channel;
    },

    unsubscribeAll() {
        this._subscriptions.forEach(ch => {
            this._sb().removeChannel(ch);
        });
        this._subscriptions = [];
    },

    startAutoRefresh(callback, intervalMs = 30000) {
        return setInterval(callback, intervalMs);
    },

    stopAutoRefresh(intervalId) {
        if (intervalId) clearInterval(intervalId);
    },

    // ═══ 백업 / 복원 ═══

    _tables: ['staff', 'daily_sales', 'daily_sale_rooms', 'daily_sale_room_girls', 'daily_sale_room_liquors',
              'wari', 'receivables', 'receivable_payments',
              'liquor', 'liquor_inventory', 'liquor_orders', 'liquor_categories',
              'girls', 'girl_payments', 'expenses', 'expense_categories', 'base_expense_items',
              'branches', 'branch_settings', 'room_types', 'users', 'settings'],

    async backup() {
        const data = {};
        for (const t of this._tables) {
            const { data: rows } = await this._sb().from(t).select('*');
            data[t] = rows || [];
        }
        data._backup_at = new Date().toISOString();
        return data;
    },

    async restoreBackup(backupData) {
        if (!backupData || typeof backupData !== 'object') return false;
        for (const t of this._tables) {
            if (Array.isArray(backupData[t]) && backupData[t].length > 0) {
                // 기존 데이터 삭제 후 복원
                await this._sb().from(t).delete().gte('created_at', '1900-01-01');
                // 배치 삽입 (100건씩)
                const rows = backupData[t];
                for (let i = 0; i < rows.length; i += 100) {
                    const batch = rows.slice(i, i + 100);
                    await this._sb().from(t).insert(batch);
                }
            }
        }
        return true;
    },

    async downloadBackup() {
        const data = await this.backup();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `luxe_backup_${Format.today()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    // 자동 백업은 Supabase에서 자동으로 관리되므로 noop
    autoBackup() { /* Supabase 자동 백업 사용 */ },
    getBackupDates() { return []; },
    restoreFromDate() { return false; },
    notifyChange() { /* Supabase Realtime 사용 */ }
};

window.DB = DB;
