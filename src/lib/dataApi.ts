// Thin client for the `data-api` edge function. Provides a chainable,
// supabase-from()-like surface so existing services can migrate one method
// at a time:
//
//   await dataApi.from('staff').select('*').eq('id', x).single();
//   await dataApi.from('attendance').upsert(rows, { onConflict: 'staff_id,date,is_part_time' });
//
// The session token is read from localStorage('sessionToken') — same place
// the legacy custom auth stores it today.

type Filter = { col: string; op: string; val: unknown };

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/data-api`;

interface BuilderState {
  table: string;
  op: "select" | "insert" | "update" | "upsert" | "delete";
  columns?: string;
  filters: Filter[];
  values?: unknown;
  order?: { col: string; ascending?: boolean };
  limit?: number;
  onConflict?: string;
  single?: boolean;
}

class QueryBuilder<T = any> implements PromiseLike<{ data: T | null; error: Error | null }> {
  constructor(private state: BuilderState) {}

  private filter(col: string, op: string, val: unknown) {
    this.state.filters.push({ col, op, val });
    return this;
  }

  eq(col: string, val: unknown) { return this.filter(col, "eq", val); }
  neq(col: string, val: unknown) { return this.filter(col, "neq", val); }
  gt(col: string, val: unknown) { return this.filter(col, "gt", val); }
  gte(col: string, val: unknown) { return this.filter(col, "gte", val); }
  lt(col: string, val: unknown) { return this.filter(col, "lt", val); }
  lte(col: string, val: unknown) { return this.filter(col, "lte", val); }
  in(col: string, val: unknown[]) { return this.filter(col, "in", val); }
  like(col: string, val: string) { return this.filter(col, "like", val); }
  ilike(col: string, val: string) { return this.filter(col, "ilike", val); }
  is(col: string, val: unknown) { return this.filter(col, "is", val); }

  order(col: string, opts?: { ascending?: boolean }) {
    this.state.order = { col, ascending: opts?.ascending ?? true };
    return this;
  }

  limit(n: number) { this.state.limit = n; return this; }

  select(columns = "*") {
    // Allow chaining `.select()` after insert/update/delete/upsert (PostgREST style)
    if (this.state.op === "select") this.state.columns = columns;
    return this;
  }

  single() { this.state.single = true; return this; }
  maybeSingle() { this.state.single = true; return this; }

  async then<TR1 = { data: T | null; error: Error | null }, TR2 = never>(
    onFulfilled?: ((v: { data: T | null; error: Error | null }) => TR1 | PromiseLike<TR1>) | null,
    onRejected?: ((reason: unknown) => TR2 | PromiseLike<TR2>) | null,
  ): Promise<TR1 | TR2> {
    try {
      const token = localStorage.getItem("sessionToken");
      if (!token) {
        // Not logged in yet — short-circuit so screens render empty
        // instead of throwing on a 401 from the edge function.
        const empty = { data: (this.state.single ? null : []) as unknown as T, error: null };
        return onFulfilled ? onFulfilled(empty) : (empty as unknown as TR1);
      }
      const res = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          "x-session-token": token,
        },
        body: JSON.stringify(this.state),
      });
      const json = await res.json();
      const result = res.ok
        ? { data: json.data as T, error: null }
        : { data: null, error: new Error(json.error || `HTTP ${res.status}`) };
      return onFulfilled ? onFulfilled(result) : (result as unknown as TR1);
    } catch (err) {
      const result = { data: null, error: err as Error };
      if (onRejected) return onRejected(err);
      return onFulfilled ? onFulfilled(result) : (result as unknown as TR1);
    }
  }
}

class TableRef {
  constructor(private table: string) {}

  select(columns = "*") {
    return new QueryBuilder({ table: this.table, op: "select", columns, filters: [] });
  }

  insert(values: unknown) {
    return new QueryBuilder({ table: this.table, op: "insert", values, filters: [] });
  }

  update(values: unknown) {
    return new QueryBuilder({ table: this.table, op: "update", values, filters: [] });
  }

  upsert(values: unknown, opts?: { onConflict?: string }) {
    return new QueryBuilder({
      table: this.table, op: "upsert", values, filters: [],
      onConflict: opts?.onConflict,
    });
  }

  delete() {
    return new QueryBuilder({ table: this.table, op: "delete", filters: [] });
  }
}

export const dataApi = {
  from(table: string) { return new TableRef(table); },
};
