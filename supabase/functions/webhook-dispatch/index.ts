// Signs and delivers webhook events to a tenant's configured endpoints.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { dispatchWebhook } from "../_shared/webhooks.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ALLOWED = new Set([
  "payroll.run.generated",
  "payroll.run.approved",
  "compliance.export.generated",
  "payslip.issued",
  "test.ping",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // caller must be an active admin/manager of the tenant
  const legacyToken = req.headers.get("x-session-token");
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let caller: any = null;

  if (bearer) {
    const { data: { user } } = await admin.auth.getUser(bearer);
    if (user) {
      let profile = await admin.from("app_users").select("id, role, tenant_id, is_active").eq("auth_id", user.id).maybeSingle();
      if (!profile.data && user.email) {
        profile = await admin.from("app_users").select("id, role, tenant_id, is_active").eq("email", user.email).maybeSingle();
      }
      caller = profile.data;
    }
  } else if (legacyToken) {
    const { data: session } = await admin.from("app_sessions")
      .select("user_id, expires_at, is_valid").eq("token", legacyToken).eq("is_valid", true).maybeSingle();
    if (session && new Date(session.expires_at).getTime() > Date.now()) {
      const { data } = await admin.from("app_users").select("id, role, tenant_id, is_active").eq("id", session.user_id).maybeSingle();
      caller = data;
    }
  }

  if (!caller?.is_active || !["admin", "manager"].includes(caller.role)) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const event = String(body?.event || "");
  if (!ALLOWED.has(event)) return json({ error: "Unsupported event" }, 400);
  const payload = (body?.payload && typeof body.payload === "object") ? body.payload : {};

  try {
    const results = await dispatchWebhook(admin, caller.tenant_id, event, payload);
    return json({ delivered: results.filter(r => r.ok).length, attempted: results.length, results });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Dispatch failed" }, 500);
  }
});
