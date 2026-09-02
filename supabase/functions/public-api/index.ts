// Public REST API for payroll and compliance data.
// Authenticated with tenant-scoped API keys (Authorization: Bearer sk_live_...).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
};

const num = (v: string | null) => (v === null || v === "" ? null : Number(v));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "Only GET is supported" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── authenticate the API key ───────────────────────────────────────────
  const presented =
    (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim() ||
    (req.headers.get("x-api-key") || "").trim();
  if (!presented) return json({ error: "Missing API key" }, 401);

  const { data: key } = await admin
    .from("api_keys")
    .select("id, tenant_id, scopes, revoked_at")
    .eq("key_hash", await sha256(presented))
    .maybeSingle();

  if (!key || key.revoked_at) return json({ error: "Invalid or revoked API key" }, 401);
  const tenantId = key.tenant_id as string;
  const scopes: string[] = key.scopes || [];
  const need = (scope: string) => scopes.includes(scope);

  admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id).then(
    () => undefined,
    () => undefined,
  );

  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*\/public-api/, "").replace(/\/+$/, "") || "/";
  const q = url.searchParams;
  const limit = Math.min(Math.max(Number(q.get("limit")) || 100, 1), 500);

  try {
    // GET /v1/payroll/runs
    if (path === "/v1/payroll/runs") {
      if (!need("payroll:read")) return json({ error: "Key lacks payroll:read scope" }, 403);
      let query = admin.from("payroll_runs").select("*").eq("tenant_id", tenantId)
        .order("year", { ascending: false }).order("month", { ascending: false }).limit(limit);
      const month = num(q.get("month"));
      const year = num(q.get("year"));
      if (month !== null) query = query.eq("month", month);
      if (year !== null) query = query.eq("year", year);
      const { data, error } = await query;
      if (error) throw error;
      return json({ data });
    }

    // GET /v1/payroll/runs/{id}
    const runMatch = path.match(/^\/v1\/payroll\/runs\/([0-9a-f-]{36})$/i);
    if (runMatch) {
      if (!need("payroll:read")) return json({ error: "Key lacks payroll:read scope" }, 403);
      const { data: run } = await admin.from("payroll_runs").select("*")
        .eq("id", runMatch[1]).eq("tenant_id", tenantId).maybeSingle();
      if (!run) return json({ error: "Payroll run not found" }, 404);
      const { data: snapshots } = await admin.from("payroll_snapshots")
        .select("staff_id, staff_snapshot, salary_detail").eq("run_id", run.id).eq("tenant_id", tenantId);
      return json({ data: { ...run, snapshots: snapshots || [] } });
    }

    // GET /v1/staff
    if (path === "/v1/staff") {
      if (!need("staff:read")) return json({ error: "Key lacks staff:read scope" }, 403);
      const { data, error } = await admin.from("staff")
        .select("id, name, employee_code, location, floor, designation, type, is_active, joined_date, total_salary, pf_number, esi_number, email")
        .eq("tenant_id", tenantId).order("name", { ascending: true }).limit(limit);
      if (error) throw error;
      return json({ data });
    }

    // GET /v1/compliance/summary?month=&year=
    if (path === "/v1/compliance/summary") {
      if (!need("compliance:read")) return json({ error: "Key lacks compliance:read scope" }, 403);
      const month = num(q.get("month"));
      const year = num(q.get("year"));
      if (month === null || year === null) return json({ error: "month (0-11) and year are required" }, 400);
      const { data: run } = await admin.from("payroll_runs").select("id, status, total_net, headcount")
        .eq("tenant_id", tenantId).eq("month", month).eq("year", year).maybeSingle();
      if (!run) return json({ error: "No payroll run for that period" }, 404);
      const { data: snapshots } = await admin.from("payroll_snapshots")
        .select("salary_detail").eq("run_id", run.id).eq("tenant_id", tenantId);

      let pf = 0, esi = 0, tds = 0, gross = 0, net = 0;
      (snapshots || []).forEach((s: any) => {
        const d = s.salary_detail || {};
        gross += Number(d.grossPayroll ?? d.grossSalary ?? 0) || 0;
        net += Number(d.netPayroll ?? d.netSalary ?? 0) || 0;
        (d.statutoryBreakdown || []).forEach((b: any) => {
          const amt = Number(b.amount) || 0;
          if (b.key === "pf") pf += amt;
          else if (b.key === "esi") esi += amt;
          else if (b.key === "tds") tds += amt;
        });
      });

      return json({
        data: {
          month, year, run_id: run.id, status: run.status,
          headcount: run.headcount ?? (snapshots || []).length,
          gross: Math.round(gross), net: Math.round(net),
          pf_total: Math.round(pf), esi_total: Math.round(esi), tds_total: Math.round(tds),
        },
      });
    }

    // GET /v1/payslips?month=&year=
    if (path === "/v1/payslips") {
      if (!need("payslips:read")) return json({ error: "Key lacks payslips:read scope" }, 403);
      let query = admin.from("payslip_links")
        .select("id, staff_id, month, year, snapshot, expires_at, revoked_at, view_count, created_at")
        .eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(limit);
      const month = num(q.get("month"));
      const year = num(q.get("year"));
      if (month !== null) query = query.eq("month", month);
      if (year !== null) query = query.eq("year", year);
      const { data, error } = await query;
      if (error) throw error;
      return json({ data });
    }

    if (path === "/" || path === "/v1") {
      return json({
        name: "Payroll & Compliance API",
        version: "v1",
        endpoints: [
          "GET /v1/payroll/runs?month=&year=&limit=",
          "GET /v1/payroll/runs/{id}",
          "GET /v1/staff",
          "GET /v1/compliance/summary?month=&year=",
          "GET /v1/payslips?month=&year=",
        ],
        scopes,
      });
    }

    return json({ error: `Unknown endpoint ${path}` }, 404);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Request failed" }, 500);
  }
});
