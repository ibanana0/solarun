/**
 * Mock Supabase Client for Testing
 */

export const mockSupabase = {
    _data: {} as Record<string, any[]>,

    reset() {
        this._data = {};
    },

    setMockData(table: string, data: any[]) {
        this._data[table] = [...data];
    },

    getMockData(table: string) {
        return this._data[table] || [];
    },

    from(table: string) {
        const self = mockSupabase;
        const queryState: any = {
            table,
            filters: [] as any[],
            limitValue: null as number | null,
            orderOpts: null as any,
            selectArgs: null as any,
            updateData: null as any,
        };

        const chain: any = {
            select: jest.fn().mockImplementation((...args: any[]) => {
                queryState.selectArgs = args;
                return chain;
            }),

            eq: jest.fn().mockImplementation((col: string, val: any) => {
                queryState.filters.push({ type: 'eq', col, val });
                return chain;
            }),

            lte: jest.fn().mockImplementation((col: string, val: any) => {
                queryState.filters.push({ type: 'lte', col, val });
                return chain;
            }),

            gte: jest.fn().mockImplementation((col: string, val: any) => {
                queryState.filters.push({ type: 'gte', col, val });
                return chain;
            }),

            order: jest.fn().mockImplementation((col: string, opts: any) => {
                queryState.orderOpts = { col, ...opts };
                return chain;
            }),

            limit: jest.fn().mockImplementation((val: number) => {
                queryState.limitValue = val;
                return chain;
            }),

            update: jest.fn().mockImplementation((data: any) => {
                queryState.updateData = data;
                return chain;
            }),

            insert: jest.fn().mockImplementation((data: any) => {
                if (!self._data[queryState.table]) {
                    self._data[queryState.table] = [];
                }
                const toInsert = Array.isArray(data) ? data : [data];
                self._data[queryState.table].push(...toInsert);
                return Promise.resolve({ data: toInsert, error: null });
            }),

            single: jest.fn().mockImplementation(async () => {
                const results = self._applyFilters(queryState);
                return { data: results.length > 0 ? results[0] : null, error: null };
            }),

            maybeSingle: jest.fn().mockImplementation(async () => {
                const results = self._applyFilters(queryState);
                return { data: results.length > 0 ? results[0] : null, error: null };
            }),

            then(resolve: any, reject?: any) {
                try {
                    if (queryState.updateData) {
                        // Persist update into _data in-place
                        const tbl = queryState.table;
                        if (self._data[tbl]) {
                            self._data[tbl] = self._data[tbl].map((record: any) => {
                                const matches = queryState.filters.every((f: any) => {
                                    if (f.type === 'eq') return record[f.col] === f.val;
                                    if (f.type === 'lte') return record[f.col] <= f.val;
                                    if (f.type === 'gte') return record[f.col] >= f.val;
                                    return true;
                                });
                                return matches ? { ...record, ...queryState.updateData } : record;
                            });
                        }
                        resolve({ data: null, error: null });
                        return;
                    }

                    const results = self._applyFilters(queryState);

                    if (queryState.selectArgs && queryState.selectArgs.length > 1) {
                        const opts = queryState.selectArgs[1];
                        if (opts && opts.count === 'exact') {
                            resolve({ count: results.length, error: null });
                            return;
                        }
                    }
                    resolve({ data: results, error: null });
                } catch (err) {
                    if (reject) reject(err);
                }
            },
        };

        return chain;
    },

    _applyFilters(queryState: any) {
        let results = [...(this._data[queryState.table] || [])];

        for (const f of queryState.filters) {
            if (f.type === 'eq') {
                results = results.filter((r: any) => r[f.col] === f.val);
            } else if (f.type === 'lte') {
                results = results.filter((r: any) => r[f.col] <= f.val);
            } else if (f.type === 'gte') {
                results = results.filter((r: any) => r[f.col] >= f.val);
            }
        }

        if (queryState.orderOpts) {
            const { col, ascending } = queryState.orderOpts;
            results.sort((a: any, b: any) => {
                if (a[col] < b[col]) return ascending === false ? 1 : -1;
                if (a[col] > b[col]) return ascending === false ? -1 : 1;
                return 0;
            });
        }

        if (queryState.limitValue !== null) {
            results = results.slice(0, queryState.limitValue);
        }

        return results;
    },
};
