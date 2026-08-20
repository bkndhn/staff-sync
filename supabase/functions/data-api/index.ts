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
import {
  evaluateLoanDelete,
  evaluateLoanUpdate,
  parseThresholds,
  sanitizeLoanInsert,
} from "./loanPolicy.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-session-token, x-tenant-id",
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
type Role = "admin" | "manager" | "staff" | "statutory_admin" | "supervisor" | "floor_supervisor" | "super_admin";
type Op = "select" | "insert" | "update" | "upsert" | "delete";

interface TableAcl {
  read: Role[];
  write: Role[];
  locationCol?: string; // column to use for manager location-scoping
  floorCol?: string;    // column to use for supervisor floor-scoping
  staffIdCol?: string;  // column to use for staff user scoping
  tenantIdCol?: string; // override column for tenant scoping (default: 'tenant_id')
}

const ACL: Record<string, TableAcl> = {
  // ── Staff & Attendance ─────────────────────────────────────────────────────
  staff:                             { read: ["admin","manager","staff","statutory_admin","supervisor","floor_supervisor","super_admin"], write: ["admin","manager"],           locationCol: "location", floorCol: "floor", staffIdCol: "id" },
  attendance:                        { read: ["admin","manager","staff","statutory_admin","supervisor","floor_supervisor","super_admin"], write: ["admin","manager","statutory_admin","supervisor","floor_supervisor"], locationCol: "location", floorCol: "floor", staffIdCol: "staff_id" },
  punch_events:                      { read: ["admin","manager","staff","statutory_admin","supervisor","floor_supervisor","super_admin"], write: ["admin","manager","supervisor","floor_supervisor"], locationCol: "location", staffIdCol: "staff_id" },
  push_subscriptions:                { read: ["admin","manager","staff","supervisor","floor_supervisor"],                                 write: ["admin","manager","staff","supervisor","floor_supervisor"], staffIdCol: "staff_id" },
  // ── Breaks ──────────────────────────────────────────────────────────────────
  break_events:                      { read: ["admin","manager","staff","statutory_admin","supervisor","floor_supervisor","super_admin"], write: ["admin","manager","staff","supervisor","floor_supervisor"], locationCol: "location", staffIdCol: "staff_id" },
  break_types:                       { read: ["admin","manager","staff","statutory_admin","supervisor","floor_supervisor","super_admin"], write: ["admin"] },
  break_policies:                    { read: ["admin","manager","staff","statutory_admin","supervisor","floor_supervisor","super_admin"], write: ["admin"] },
  // ── Leave ───────────────────────────────────────────────────────────────────
  leave_requests:                    { read: ["admin","manager","staff","statutory_admin","supervisor","floor_supervisor","super_admin"], write: ["admin","manager","staff","statutory_admin","supervisor","floor_supervisor"], locationCol: "location", staffIdCol: "staff_id" },
  // ── Loans ───────────────────────────────────────────────────────────────────
  loan_requests:                     { read: ["admin","manager","staff","statutory_admin","supervisor","floor_supervisor","super_admin"], write: ["admin","manager","staff","statutory_admin"], locationCol: "location", staffIdCol: "staff_id" },
  // ── Advances / Payroll ──────────────────────────────────────────────────────
  advances:                          { read: ["admin","manager","staff","statutory_admin","supervisor","floor_supervisor","super_admin"],                               write: ["admin","manager"],           staffIdCol: "staff_id" },
  advance_entries:                   { read: ["admin","manager","staff","statutory_admin","supervisor","floor_supervisor","super_admin"],                               write: ["admin","manager"],           staffIdCol: "staff_id" },
  payroll_runs:                      { read: ["admin","super_admin"],                                                 write: ["admin"] },
  payroll_snapshots:                 { read: ["admin","super_admin"],                                                 write: ["admin"] },
  salary_hikes:                      { read: ["admin","manager","staff","statutory_admin","supervisor","floor_supervisor","super_admin"],                               write: ["admin"],                     staffIdCol: "staff_id" },
  salary_manual_overrides:           { read: ["admin","super_admin"],                                                 write: ["admin"] },
  salary_disbursements:              { read: ["admin","super_admin"],                                                 write: ["admin"] },
  // ── Face / Biometric ────────────────────────────────────────────────────────
  face_embeddings:                   { read: ["admin","manager","staff","statutory_admin","supervisor","floor_supervisor","super_admin"],                               write: ["admin","manager","staff"],   staffIdCol: "staff_id" },
  face_registration_logs:            { read: ["admin","manager","staff","statutory_admin","supervisor","floor_supervisor","super_admin"],                               write: ["admin","manager","staff"],   staffIdCol: "staff_id" },
  // ── Archive ─────────────────────────────────────────────────────────────────
  old_staff_records:                 { read: ["admin","staff","statutory_admin","supervisor","floor_supervisor","super_admin"],                                         write: ["admin"],                     staffIdCol: "original_staff_id" },
  // ── Part-Time ───────────────────────────────────────────────────────────────
  part_time_advance_tracking:        { read: ["admin","manager","supervisor","floor_supervisor","super_admin"],                          write: ["admin","manager","supervisor","floor_supervisor"] },
  part_time_settlements:             { read: ["admin","manager","supervisor","floor_supervisor","super_admin"],                          write: ["admin","manager","supervisor","floor_supervisor"] },
  // ── Config / Settings ───────────────────────────────────────────────────────
  app_settings:                      { read: ["admin","manager","staff","statutory_admin","supervisor","floor_supervisor","super_admin"], write: ["admin"] },
  locations:                         { read: ["admin","manager","staff","statutory_admin","supervisor","floor_supervisor","super_admin"], write: ["admin"] },
  designations:                      { read: ["admin","manager","staff","statutory_admin","supervisor","floor_supervisor","super_admin"], write: ["admin"] },
  floors:                            { read: ["admin","manager","staff","statutory_admin","supervisor","floor_supervisor","super_admin"], write: ["admin"] },
  salary_categories:                 { read: ["admin","manager","staff","statutory_admin","supervisor","floor_supervisor","super_admin"], write: ["admin"] },
  location_shift_config:             { read: ["admin","manager","staff","statutory_admin","supervisor","floor_supervisor","super_admin"], write: ["admin"] },
  location_designation_shift_config: { read: ["admin","manager","staff","statutory_admin","supervisor","floor_supervisor","super_admin"], write: ["admin"] },
  statutory_portal_config:           { read: ["admin","manager","staff","statutory_admin","super_admin"],              write: ["admin"] },
  shift_rosters:                     { read: ["admin","manager","supervisor","floor_supervisor","super_admin"],                           write: ["admin","manager"] },
  workflow_configs:                  { read: ["admin","manager","staff","supervisor","floor_supervisor","super_admin"], write: ["admin"] },
  staff_grievances:                  { read: ["admin","manager","super_admin"],                                        write: ["admin","manager","staff"] },
  device_status:                     { read: ["admin","manager","supervisor","floor_supervisor","super_admin"], write: ["admin","super_admin"] },
  loan_repayments:                   { read: ["admin","manager","staff","supervisor","floor_supervisor","super_admin"],                   write: ["admin","manager"] },
  feature_toggles:                   { read: ["admin","manager","staff","supervisor","floor_supervisor","super_admin","statutory_admin"], write: ["admin","super_admin"], tenantIdCol: "tenant_id" },
  ai_insights:                       { read: ["admin","manager","super_admin","statutory_admin"], write: ["admin","manager"] },
  announcements:                     { read: ["admin","manager","staff","supervisor","floor_supervisor","super_admin","statutory_admin"], write: ["admin","manager"] },
  // ── Platform-level ──────────────────────────────────────────────────────────
  app_users:                         { read: ["admin","manager","staff","statutory_admin","supervisor","floor_supervisor","super_admin"], write: ["super_admin","admin"] },
  blacklisted_devices:               { read: ["admin","super_admin"], write: ["admin","super_admin"] },
  payroll_rules:                     { read: ["admin","manager","super_admin","statutory_admin"], write: ["admin","super_admin"] },
  // ── Tenants (self-scoped: the tenant's own PK is 'id', not 'tenant_id') ─
  tenants:                           { read: ["admin","statutory_admin","super_admin"], write: ["admin","super_admin"], tenantIdCol: "id" },
  // ── ESS Portal ────────────────────────────────────────────────────────
  profile_change_requests:      { read: ["admin","manager","staff","super_admin"], write: ["admin","manager","staff"], staffIdCol: "staff_id" },
  attendance_regularizations:   { read: ["admin","manager","staff","super_admin"], write: ["admin","manager","staff"], locationCol: "location", staffIdCol: "staff_id" },
  letter_requests:              { read: ["admin","manager","staff","super_admin"], write: ["admin","manager","staff"], staffIdCol: "staff_id" },
  holidays:                     { read: ["admin","manager","staff","statutory_admin","supervisor","floor_supervisor","super_admin"], write: ["admin"] },
  staff_notifications:          { read: ["admin","manager","staff","super_admin"], write: ["admin","manager","staff"], staffIdCol: "staff_id" },
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
    const legacyToken = req.headers.get("x-session-token");
    const authHeader = req.headers.get("authorization");
    let jwt = "";
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      jwt = authHeader.substring(7);
    }
    
    if (!legacyToken && !jwt) {
      return new Response(JSON.stringify({ error: "Missing session token or authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = (await req.json()) as Body;

    // Server-authoritative clock. Clients use this to correct a tampered
    // device clock before recording a punch. No table access involved.
    if (body?.op === "server_time") {
      return new Response(JSON.stringify({ data: { now: new Date().toISOString() } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

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

    let user: any = null;

    if (jwt) {
      // Validate Supabase Auth JWT
      const { data: { user: authUser }, error: authErr } = await admin.auth.getUser(jwt);
      if (authErr || !authUser) {
        console.error("[data-api] JWT validation failed:", authErr?.message);
        return new Response(JSON.stringify({ error: "Invalid or expired authorization token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      console.log("[data-api] JWT auth user:", authUser.email, authUser.id);

      // Find user in app_users by auth_id first, then email fallback
      let { data: uRow, error: uErr } = await admin
        .from("app_users")
        .select("id, role, location, location_id, floor, floor_id, is_active, tenant_id, auth_id, email")
        .eq("auth_id", authUser.id)
        .maybeSingle();

      // Fallback: match by email if auth_id lookup failed
      if (!uRow && authUser.email) {
        console.log("[data-api] auth_id lookup found nothing, trying email:", authUser.email);
        const { data: uRowByEmail, error: eErr } = await admin
          .from("app_users")
          .select("id, role, location, location_id, floor, floor_id, is_active, tenant_id, auth_id, email")
          .eq("email", authUser.email)
          .maybeSingle();
        uRow = uRowByEmail;
        if (eErr) console.error("[data-api] email fallback error:", eErr.message);
        // Patch auth_id so future lookups work
        if (uRow && !uRow.auth_id) {
          await admin.from("app_users").update({ auth_id: authUser.id }).eq("id", uRow.id);
          console.log("[data-api] Patched auth_id for user:", uRow.id);
        }
      }

      if (uErr) console.error("[data-api] app_users auth_id lookup error:", uErr.message);
      console.log("[data-api] app_users row found:", JSON.stringify(uRow));
      
      user = uRow;

    } else if (legacyToken) {
      // Validate legacy session
      const { data: session, error: sErr } = await admin
        .from("app_sessions")
        .select("user_id, role, expires_at, is_valid")
        .eq("token", legacyToken)
        .eq("is_valid", true)
        .maybeSingle();

      if (sErr || !session || new Date(session.expires_at).getTime() < Date.now()) {
        return new Response(JSON.stringify({ error: "Invalid or expired legacy session" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (session.role === "staff") {
        const { data: sRow } = await admin
          .from("staff")
          .select("id, location, floor, is_active, tenant_id")
          .eq("id", session.user_id)
          .maybeSingle();
        if (sRow) {
          user = { ...sRow, role: "staff", is_active: sRow.is_active ?? true };
        }
      } else {
        const { data: uRow } = await admin
          .from("app_users")
          .select("id, role, location, location_id, floor, floor_id, is_active, tenant_id")
          .eq("id", session.user_id)
          .maybeSingle();
        user = uRow;
      }
    }

    if (!user) {
      console.error("[data-api] No app_users row found — user not in app_users table");
      return new Response(JSON.stringify({ error: "User profile not found. Please contact your administrator." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!user.is_active) {
      console.error("[data-api] User is_active=false for user:", user.id);
      return new Response(JSON.stringify({ error: "User account is deactivated." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const role = (user.role as Role) ?? "staff";
    const isSuper = role === "super_admin";
    const isRead = body.op === "select";
    const allowed = isRead ? acl.read : acl.write;
    if (!isSuper && !allowed.includes(role)) {
      console.error(`[data-api] Role '${role}' not permitted for ${body.op} on ${body.table}`);
      return new Response(JSON.stringify({ error: `Role '${role}' not permitted to ${body.op} ${body.table}` }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- Tenant isolation -------------------------------------------------
    // Every tenant-scoped table is filtered by the caller's tenant_id.
    // A super_admin may target a specific client with the x-tenant-id header;
    // without it they operate across all clients (read-only dashboards).
    const headerTenant = req.headers.get("x-tenant-id");
    const tenantId = isSuper ? (headerTenant || null) : (user.tenant_id as string | null);

    console.log(`[data-api] role=${role}, tenantId=${tenantId}, table=${body.table}, op=${body.op}`);

    if (!isSuper && !tenantId) {
      console.error("[data-api] Non-super user has no tenant_id. User:", user.id, "role:", role);
      return new Response(JSON.stringify({ error: "User is not assigned to a client. Please run the setup SQL to assign tenant_id." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (isSuper && !tenantId && body.op !== "select") {
      return new Response(JSON.stringify({ error: "Select a client (x-tenant-id) before writing data" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Location + floor scoping
    const scopeFilters: Filter[] = [];
    const tenantCol = acl.tenantIdCol || "tenant_id";
    if (tenantId) scopeFilters.push({ col: tenantCol, op: "eq", val: tenantId });
    if (role === "manager" && acl.locationCol && user.location) {
      scopeFilters.push({ col: acl.locationCol, op: "eq", val: user.location });
    }
    if (role === "supervisor" || role === "floor_supervisor") {
      if (!user.location) {
        return new Response(JSON.stringify({ error: "Supervisor is not assigned to a location" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      // Only enforce floor requirement for floor_supervisor on tables that have a floor column
      if (role === "floor_supervisor" && acl.floorCol && !user.floor) {
        console.warn(`[data-api] floor_supervisor ${user.email} has no floor assigned, skipping floor scope for ${body.table}`);
      }
      if (acl.locationCol && user.location) {
        scopeFilters.push({ col: acl.locationCol, op: "eq", val: user.location });
      }
      if (acl.floorCol && user.floor) {
        scopeFilters.push({ col: acl.floorCol, op: "eq", val: user.floor });
      }
    }
    if (role === "staff" && acl.staffIdCol && user.id) {
      scopeFilters.push({ col: acl.staffIdCol, op: "eq", val: user.id });
    }

    const forceScope = (rows: Array<Record<string, unknown>>) => {
      if (tenantId) for (const r of rows) r[tenantCol] = tenantId;
      if (role === "manager" && acl.locationCol && user.location) {
        for (const r of rows) r[acl.locationCol!] = user.location;
      }
      if (role === "supervisor" || role === "floor_supervisor") {
        if (acl.locationCol && user.location) for (const r of rows) r[acl.locationCol!] = user.location;
        if (acl.floorCol && user.floor) for (const r of rows) r[acl.floorCol!] = user.floor;
      }
      if (role === "staff" && acl.staffIdCol && user.id) {
        for (const r of rows) r[acl.staffIdCol!] = user.id;
      }
    };

    let query: any = admin.from(body.table);
    let beforeData: any = null;

    if (body.op === "update" || body.op === "delete") {
      try {
        let fetchBefore = admin.from(body.table).select("*");
        fetchBefore = applyFilters(fetchBefore, [...scopeFilters, ...(body.filters ?? [])]);
        if (body.single) fetchBefore = fetchBefore.order("id", { ascending: true }).limit(1);
        const res = await fetchBefore;
        beforeData = res.data;
      } catch (e) {
        console.error("Failed to fetch before data for audit log", e);
      }
    }

    // ── Loan requests: threshold-aware approval rules ─────────────────────────
    if (body.table === "loan_requests") {
      const { data: thrRow } = await admin.from("app_settings")
        .select("value").eq("key", "loan_approval_thresholds")
        .eq("tenant_id", tenantId).maybeSingle();
      const thresholds = parseThresholds(thrRow?.value);

      if (body.op === "insert" || body.op === "upsert") {
        const rows = (Array.isArray(body.values) ? body.values : [body.values ?? {}]) as Array<Record<string, unknown>>;
        const res = sanitizeLoanInsert(rows, { role, userId: String(user.id), thresholds });
        if (!res.ok) {
          return new Response(JSON.stringify({ error: res.error }),
            { status: res.status ?? 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        body.values = Array.isArray(body.values) ? res.rows : res.rows[0];
      }

      if (body.op === "delete") {
        const targetId = body.filters?.find((f) => f.col === "id" && f.op === "eq")?.val;
        let loanRow = null;
        if (typeof targetId === "string") {
          let q = admin.from("loan_requests")
            .select("id, staff_id, amount, status, current_approval_level, required_approval_levels")
            .eq("id", targetId);
          if (tenantId) q = q.eq("tenant_id", tenantId);
          loanRow = (await q.maybeSingle()).data;
        }
        const res = evaluateLoanDelete(role, { loan: loanRow, userId: String(user.id) });
        if (!res.ok) {
          return new Response(JSON.stringify({ error: res.error }),
            { status: res.status ?? 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      if (body.op === "update") {
        const targetId = body.filters?.find((f) => f.col === "id" && f.op === "eq")?.val;
        if (typeof targetId !== "string") {
          return new Response(JSON.stringify({ error: "A single loan request must be selected" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        let loanQuery = admin.from("loan_requests")
          .select("id, staff_id, amount, status, current_approval_level, required_approval_levels")
          .eq("id", targetId);
        if (tenantId) loanQuery = loanQuery.eq("tenant_id", tenantId);
        const { data: loanRow } = await loanQuery.maybeSingle();
        const values = (body.values && !Array.isArray(body.values) ? body.values : {}) as Record<string, unknown>;
        const res = evaluateLoanUpdate({ role, loan: loanRow, values, thresholds, userId: String(user.id) });
        if (!res.ok) {
          return new Response(JSON.stringify({ error: res.error }),
            { status: res.status ?? 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        body.values = values;
      }
    }



    if (body.table === "app_users" && body.op === "update" && role === "admin") {
      const targetId = body.filters?.find((f) => f.col === "id" && f.op === "eq")?.val;
      if (typeof targetId !== "string") {
        return new Response(JSON.stringify({ error: "A single user must be selected" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: target } = await admin.from("app_users")
        .select("id, role, tenant_id, is_active").eq("id", targetId).eq("tenant_id", tenantId).maybeSingle();
      if (!target || target.role === "super_admin") {
        return new Response(JSON.stringify({ error: "User not found in your client" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const deactivating = body.values && !Array.isArray(body.values) && body.values.is_active === false;
      if (deactivating && target.id === user.id) {
        return new Response(JSON.stringify({ error: "You cannot deactivate your own account" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (deactivating && target.role === "admin") {
        const { count } = await admin.from("app_users").select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId).eq("role", "admin").eq("is_active", true).neq("id", target.id);
        if ((count ?? 0) < 1) {
          return new Response(JSON.stringify({ error: "At least one active client admin must remain" }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
    }

    switch (body.op) {
      case "select": {
        query = query.select(body.columns ?? "*");
        query = applyFilters(query, [...scopeFilters, ...(body.filters ?? [])]);
        if (body.order) query = query.order(body.order.col, { ascending: body.order.ascending ?? true });
        if (body.limit) {
          // Keep limited queries deterministic and compatible with PostgREST's
          // max-affected safeguards, which reject a limit without an order.
          if (!body.order) query = query.order("id", { ascending: true });
          query = query.limit(body.limit);
        }
        break;
      }
      case "insert": {
        const rows = Array.isArray(body.values) ? body.values : [body.values ?? {}];
        forceScope(rows as any);

        // ── Limit enforcement ─────────────────────────────────────────────────
        // Only enforce for non-super-admin, tenant-scoped inserts
        if (!isSuper && tenantId && rows.length > 0) {

          // Fetch tenant limits once
          const { data: tenantRow } = await admin
            .from("tenants")
            .select("staff_limit, location_limit, sub_user_limit")
            .eq("id", tenantId)
            .maybeSingle();

          if (tenantRow) {
            // Location limit
            if (body.table === "locations") {
              const { count: locCount } = await admin
                .from("locations").select("id", { count: "exact", head: true })
                .eq("tenant_id", tenantId);
              const limit = tenantRow.location_limit ?? 10;
              if ((locCount ?? 0) + rows.length > limit) {
                return new Response(JSON.stringify({ error: `Location limit reached (${limit} max). Contact your administrator to increase the limit.` }),
                  { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
              }
            }

            // Staff limit
            if (body.table === "staff") {
              const { count: staffCount } = await admin
                .from("staff").select("id", { count: "exact", head: true })
                .eq("tenant_id", tenantId);
              const limit = tenantRow.staff_limit ?? 50;
              if ((staffCount ?? 0) + rows.length > limit) {
                return new Response(JSON.stringify({ error: `Staff limit reached (${limit} max). Contact your administrator to increase the limit.` }),
                  { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
              }
            }

            // Sub-user limit (managers, supervisors, statutory_admin — not admin role)
            if (body.table === "app_users") {
              const newRoles = rows.map((r: any) => r.role).filter((r: string) => r && r !== "admin" && r !== "super_admin");
              if (newRoles.length > 0) {
                const { count: subCount } = await admin
                  .from("app_users").select("id", { count: "exact", head: true })
                  .eq("tenant_id", tenantId)
                  .not("role", "in", '("admin","super_admin")');
                const limit = tenantRow.sub_user_limit ?? 5;
                if ((subCount ?? 0) + newRoles.length > limit) {
                  return new Response(JSON.stringify({ error: `Sub-user limit reached (${limit} max for managers/supervisors). Contact your administrator to increase the limit.` }),
                    { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
                }
              }
            }
          }
        }
        // ─────────────────────────────────────────────────────────────────────

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
        // Protect admin users from deactivation
        if (body.table === "app_users" && (body.values as any)?.is_active === false && !isSuper) {
          const targets = Array.isArray(beforeData) ? beforeData : [beforeData].filter(Boolean);
          if (targets.some((t: any) => t?.role === "admin")) {
            return new Response(JSON.stringify({ error: "Administrator accounts cannot be deactivated." }),
              { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        }
        query = query.update(body.values ?? {});
        query = applyFilters(query, [...scopeFilters, ...(body.filters ?? [])]);
        query = query.select();
        break;
      }
      case "delete": {
        // Protect admin users from deletion
        if (body.table === "app_users" && !isSuper) {
          const targets = Array.isArray(beforeData) ? beforeData : [beforeData].filter(Boolean);
          if (targets.some((t: any) => t?.role === "admin")) {
            return new Response(JSON.stringify({ error: "Administrator accounts cannot be deleted." }),
              { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        }
        query = query.delete();
        query = applyFilters(query, [...scopeFilters, ...(body.filters ?? [])]);
        query = query.select();
        break;
      }
    }

    // Tolerant "single": never throw when 0 or >1 rows match — return the
    // first row (or null). PostgREST's single/maybeSingle 400s on duplicates,
    // which blanked screens for tables with legacy duplicate rows.
    const wantSingle = !!body.single;
    // PostgREST rejects `limit` on update/delete unless an explicit order is set,
    // so only narrow selects here; mutations are narrowed client-side below.
    if (wantSingle && body.op === "select") {
      if (!body.order) query = query.order("id", { ascending: true });
      query = query.limit(1);
    }

    const { data, error } = await query;
    if (error) {
      return new Response(JSON.stringify({ error: error.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const payloadData = wantSingle
      ? (Array.isArray(data) ? (data[0] ?? null) : (data ?? null))
      : data;

    if (body.op !== "select" && body.table !== "audit_logs") {
      try {
        const afterData = (body.op === "delete") ? null : data;
        const details = `${body.op.toUpperCase()} on ${body.table}`;
        await admin.from("audit_logs").insert([{
          id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          tenant_id: tenantId,
          action: `${body.table}_${body.op}`,
          details,
          performed_by: user.email ?? "Unknown",
          before: beforeData,
          after: afterData,
          timestamp: new Date().toISOString()
        }]);
      } catch (err) {
        console.error("Failed to write audit log in data-api:", err);
      }
    }

    return new Response(JSON.stringify({ data: payloadData }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("data-api error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message ?? "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
