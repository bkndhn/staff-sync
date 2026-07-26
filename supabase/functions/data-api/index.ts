// Phase 3: Session-validated data API.
// Acts as a secure proxy in front of PostgREST so the frontend can call
// data operations using the app_sessions token instead of the anon key.
// Enforces role + location scoping server-side.
//
// Request shape:
//   POST /functions/v1/data-api
//   Headers: { 'x-session-token': '<token from app_sessions>' }
//   Body: { table, op, filters?, values?, columns?, order?, limit?, onConflict? }
//
// op ∈ 'select' | 'insert' | 'update' | 'upsert' | 'delete'

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-session-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------------------------------------------------------------------------
// Access Control List
//   read:  roles allowed to SELECT
//   write: roles allowed to INSERT/UPDATE/UPSERT/DELETE
//   locationScoped: when true, managers are auto-restricted to their location
//                    (using the column name supplied — usually 'location' or
//                    'location_id')
// ---------------------------------------------------------------------------
type Role = "admin" | "manager" | "staff" | "statutory_admin" | "supervisor";
type Op = "select" | "insert" | "update" | "upsert" | "delete";

interface TableAcl {
  read: Role[];
  write: Role[];
  locationCol?: string; // column to use for manager location-scoping
  floorCol?: string;    // column to use for supervisor floor-scoping
}

const ACL: Record<string, TableAcl> = {
  staff:                          { read: ["admin", "manager", "staff", "statutory_admin", "supervisor"], write: ["admin", "manager"], locationCol: "location", floorCol: "floor" },
  attendance:                     { read: ["admin", "manager", "staff", "supervisor"], write: ["admin", "manager", "supervisor"], locationCol: "location", floorCol: "floor" },
  punch_events:                   { read: ["admin", "manager", "staff", "supervisor"], write: ["admin", "manager", "supervisor"], locationCol: "location" },
  break_events:                   { read: ["admin", "manager", "staff", "supervisor"], write: ["admin", "manager", "staff", "supervisor"], locationCol: "location" },
  break_types:                    { read: ["admin", "manager", "staff", "supervisor"], write: ["admin"] },
  break_policies:                 { read: ["admin", "manager", "supervisor"],          write: ["admin"] },
  leave_requests:                 { read: ["admin", "manager", "staff", "supervisor"], write: ["admin", "manager", "staff", "supervisor"], locationCol: "location" },
  advances:                       { read: ["admin", "manager"],          write: ["admin", "manager"], locationCol: "location" },
  advance_entries:                { read: ["admin", "manager"],          write: ["admin", "manager"] },
  payroll_runs:                   { read: ["admin"],                     write: ["admin"] },
  payroll_snapshots:              { read: ["admin"],                     write: ["admin"] },
  salary_hikes:                   { read: ["admin", "manager"],          write: ["admin"] },
  salary_manual_overrides:        { read: ["admin"],                     write: ["admin"] },
  face_embeddings:                { read: ["admin", "manager"],          write: ["admin", "manager"] },
  face_registration_logs:         { read: ["admin", "manager"],          write: ["admin", "manager"] },
  old_staff_records:              { read: ["admin"],                     write: ["admin"] },
  part_time_advance_tracking:     { read: ["admin", "manager", "supervisor"], write: ["admin", "manager", "supervisor"] },
  part_time_settlements:          { read: ["admin", "manager", "supervisor"], write: ["admin", "manager", "supervisor"] },
  app_settings:                   { read: ["admin", "manager", "staff", "statutory_admin", "supervisor"], write: ["admin"] },
  locations:                      { read: ["admin", "manager", "staff", "statutory_admin", "supervisor"], write: ["admin"] },
  designations:                   { read: ["admin", "manager", "staff", "statutory_admin", "supervisor"], write: ["admin"] },
  floors:                         { read: ["admin", "manager", "staff", "statutory_admin", "supervisor"], write: ["admin"] },
  salary_categories:              { read: ["admin", "manager", "staff", "statutory_admin", "supervisor"], write: ["admin"] },

  location_shift_config:          { read: ["admin", "manager", "staff", "statutory_admin", "supervisor"], write: ["admin"] },
  location_designation_shift_config: { read: ["admin", "manager", "staff", "statutory_admin", "supervisor"], write: ["admin"] },

  statutory_portal_config:        { read: ["admin", "manager", "staff", "statutory_admin" as Role], write: ["admin"] },
};

interface Filter { col: string; op: string; val: unknown }

interface Body {
  table: string;
  op: Op;
  columns?: string;
  filters?: Filter[];
  values?: Record<string, unknown> | Record<string, unknown>[];
  order?: { col: string; ascending?: boolean };
  limit?: number;
  onConflict?: string;
  single?: boolean;
}

function applyFilters(query: any, filters: Filter[] | undefined) {
  if (!filters) return query;
  for (const f of filters) {
    const method = (query as any)[f.op];
    if (typeof method !== "function") {
      throw new Error(`Unsupported filter op: ${f.op}`);
    }
    query = method.call(query, f.col, f.val);
  }
  return query;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token = req.headers.get("x-session-token");
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing session token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = (await req.json()) as Body;
    if (!body?.table || !body?.op) {
      return new Response(JSON.stringify({ error: "table and op are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const acl = ACL[body.table];
    if (!acl) {
      return new Response(JSON.stringify({ error: `Table not exposed: ${body.table}` }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Validate session
    const { data: session, error: sErr } = await admin
      .from("app_sessions")
      .select("user_id, role, expires_at, is_valid")
      .eq("token", token)
      .eq("is_valid", true)
      .maybeSingle();

    if (sErr || !session || new Date(session.expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ error: "Invalid or expired session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: user } = await admin
      .from("app_users")
      .select("id, role, location, location_id, floor, floor_id, is_active")
      .eq("id", session.user_id)
      .maybeSingle();

    if (!user || !user.is_active) {
      return new Response(JSON.stringify({ error: "User inactive" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const role = (user.role as Role) ?? "staff";
    const isRead = body.op === "select";
    const allowed = isRead ? acl.read : acl.write;
    if (!allowed.includes(role)) {
      return new Response(JSON.stringify({ error: `Role '${role}' not permitted to ${body.op} ${body.table}` }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Location + floor scoping
    const scopeFilters: Filter[] = [];
    if (role === "manager" && acl.locationCol && user.location) {
      scopeFilters.push({ col: acl.locationCol, op: "eq", val: user.location });
    }
    if (role === "supervisor") {
      if (acl.locationCol && user.location) {
        scopeFilters.push({ col: acl.locationCol, op: "eq", val: user.location });
      }
      if (acl.floorCol && user.floor) {
        scopeFilters.push({ col: acl.floorCol, op: "eq", val: user.floor });
      }
    }

    const forceScope = (rows: Array<Record<string, unknown>>) => {
      if (role === "manager" && acl.locationCol && user.location) {
        for (const r of rows) r[acl.locationCol!] = user.location;
      }
      if (role === "supervisor") {
        if (acl.locationCol && user.location) for (const r of rows) r[acl.locationCol!] = user.location;
        if (acl.floorCol && user.floor) for (const r of rows) r[acl.floorCol!] = user.floor;
      }
    };

    let query: any = admin.from(body.table);

    switch (body.op) {
      case "select": {
        query = query.select(body.columns ?? "*");
        query = applyFilters(query, [...scopeFilters, ...(body.filters ?? [])]);
        if (body.order) query = query.order(body.order.col, { ascending: body.order.ascending ?? true });
        if (body.limit) query = query.limit(body.limit);
        break;
      }
      case "insert": {
        const rows = Array.isArray(body.values) ? body.values : [body.values ?? {}];
        forceScope(rows as any);
        query = query.insert(rows).select();
        break;
      }
      case "upsert": {
        const rows = Array.isArray(body.values) ? body.values : [body.values ?? {}];
        forceScope(rows as any);
        query = query.upsert(rows, body.onConflict ? { onConflict: body.onConflict } : undefined).select();
        break;
      }
      case "update": {
        query = query.update(body.values ?? {});
        query = applyFilters(query, [...scopeFilters, ...(body.filters ?? [])]);
        query = query.select();
        break;
      }
      case "delete": {
        query = query.delete();
        query = applyFilters(query, [...scopeFilters, ...(body.filters ?? [])]);
        query = query.select();
        break;
      }
    }

    if (body.single) query = query.maybeSingle();

    const { data, error } = await query;
    if (error) {
      return new Response(JSON.stringify({ error: error.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ data }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("data-api error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message ?? "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
