/**
 * Supabase Mock
 * Mock implementation of Supabase client for testing
 */

export class MockSupabaseClient {
    private mockData: { [table: string]: any[] } = {
        runners: [],
        race_logs: [],
        race_events: [],
        refund_logs: [],
    };

    from(table: string) {
        return new MockQueryBuilder(table, this.mockData);
    }

    // Helper methods for tests
    setMockData(table: string, data: any[]) {
        this.mockData[table] = data;
    }

    getMockData(table: string) {
        return this.mockData[table];
    }

    reset() {
        this.mockData = {
            runners: [],
            race_logs: [],
            race_events: [],
            refund_logs: [],
        };
    }
}

class MockQueryBuilder {
    private table: string;
    private data: { [table: string]: any[] };
    private filters: Array<(row: any) => boolean> = [];
    private selectedFields: string[] | null = null;
    private orderField: string | null = null;
    private orderAsc: boolean = true;
    private limitCount: number | null = null;
    private countMode: boolean = false;
    private headMode: boolean = false;

    constructor(table: string, data: { [table: string]: any[] }) {
        this.table = table;
        this.data = data;
    }

    select(fields?: string): MockQueryBuilder {
        if (fields && fields !== '*') {
            this.selectedFields = fields.split(',').map((f) => f.trim());
            // Check for count: 'exact'
            if (fields.includes('count: \'exact\'') || fields.includes('count: "exact"')) {
                this.countMode = true;
            }
            // Check for head: true
            if (fields.includes('head: true') || fields.includes('head: true')) {
                this.headMode = true;
            }
        }
        return this;
    }

    eq(field: string, value: any): MockQueryBuilder {
        this.filters.push((row) => row[field] === value);
        return this;
    }

    gte(field: string, value: any): MockQueryBuilder {
        this.filters.push((row) => row[field] >= value);
        return this;
    }

    lte(field: string, value: any): MockQueryBuilder {
        this.filters.push((row) => row[field] <= value);
        return this;
    }

    order(field: string, options?: { ascending: boolean }): MockQueryBuilder {
        this.orderField = field;
        this.orderAsc = options?.ascending !== false;
        return this;
    }

    limit(count: number): MockQueryBuilder {
        this.limitCount = count;
        return this;
    }

    maybeSingle() {
        return this.execute().then((data) => ({
            data: data.length > 0 ? data[0] : null,
            error: null,
        }));
    }

    single() {
        return this.execute().then((data) => ({
            data: data.length > 0 ? data[0] : null,
            error: data.length === 0 ? new Error('No rows found') : null,
        }));
    }

    async execute() {
        let results = [...(this.data[this.table] || [])];

        // Apply filters
        results = results.filter((row) => this.filters.every((filter) => filter(row)));

        // Apply order
        if (this.orderField) {
            results.sort((a, b) => {
                const aVal = a[this.orderField!];
                const bVal = b[this.orderField!];
                const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
                return this.orderAsc ? cmp : -cmp;
            });
        }

        // Apply limit
        if (this.limitCount !== null) {
            results = results.slice(0, this.limitCount);
        }

        // Apply field selection
        if (this.selectedFields) {
            results = results.map((row) => {
                const selected: any = {};
                this.selectedFields!.forEach((field) => {
                    selected[field] = row[field];
                });
                return selected;
            });
        }

        return results;
    }

    async then(onFulfilled?: any, onRejected?: any) {
        try {
            const result = await this.execute();

            if (this.countMode && this.headMode) {
                return onFulfilled?.({ count: result.length, data: null, error: null });
            }

            return onFulfilled?.({
                data: result,
                count: result.length,
                error: null,
            });
        } catch (error) {
            return onRejected?.(error);
        }
    }

    async insert(data: any | any[]) {
        const items = Array.isArray(data) ? data : [data];
        items.forEach((item) => {
            if (!item.id) {
                item.id = generateId();
            }
            this.data[this.table].push(item);
        });

        return { data: items, error: null };
    }

    async update(updates: any) {
        let updatedCount = 0;
        this.data[this.table].forEach((row) => {
            if (this.filters.every((filter) => filter(row))) {
                Object.assign(row, updates);
                updatedCount++;
            }
        });

        return { data: updatedCount > 0 ? [{}] : [], error: null };
    }

    async delete() {
        const beforeCount = this.data[this.table].length;
        this.data[this.table] = this.data[this.table].filter(
            (row) => !this.filters.every((filter) => filter(row))
        );
        const deletedCount = beforeCount - this.data[this.table].length;

        return { data: deletedCount > 0 ? [{}] : [], error: null };
    }
}

function generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export const mockSupabase = new MockSupabaseClient();
