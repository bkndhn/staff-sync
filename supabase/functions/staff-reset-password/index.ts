// Admin-only: reset a staff member's password back to joined_date.
//
// Clears password_hash and flips must_change_password=true, so on the staff
// member's next login the joined-date fallback works again and they will be
// forced to pick a new password.
//
// POST /functions/v1/staff-reset-password
// Headers: x-session-token: <admin session token>
// Body: { staffId }
//
// Reuses the same session-token verification pattern as auth-update-password.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sessionToken = req.headers.get("x-session-token");
    if (!sessionToken) return json({ error: "unauthorized" }, 401);

    const { staffId, resetDevice } = await req.json();
    if (!staffId || typeof staffId !== "string") {
      return json({ error: "Missing staffId" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify the caller has an active admin session.
    const { data: session } = await admin
      .from("app_sessions")
      .select("user_id, expires_at, is_valid")
      .eq("token", sessionToken)
      .order("created_at", { ascending: false })
      .limit(1);

    const sess: any = Array.isArray(session) ? session[0] : session;

    if (!sess || sess.is_valid === false || (sess.expires_at && new Date(sess.expires_at) < new Date())) {
      return json({ error: "unauthorized" }, 401);
    }

    const { data: caller } = await admin
      .from("app_users")
      .select("role, is_active, tenant_id")
      .eq("id", sess.user_id)
      .maybeSingle();

    if (!caller || !(caller as any).is_active || !["admin", "manager"].includes((caller as any).role)) {
      return json({ error: "forbidden" }, 403);
    }

    // Tenant isolation: an admin may only reset staff inside their own tenant.
    const { data: target } = await admin
      .from("staff")
      .select("id, tenant_id")
      .eq("id", staffId)
      .maybeSingle();

    if (!target) return json({ error: "not_found" }, 404);
    if ((caller as any).tenant_id && (target as any).tenant_id !== (caller as any).tenant_id) {
      return json({ error: "forbidden" }, 403);
    }

    // Reset: clear hash, force password change on next login. When resetDevice
    // is true we also unbind the device so the staff member can enroll from a
    // new phone and go through the first-time password setup again.
    const { error: updateErr } = await admin
      .from("staff")
      .update({
        password_hash: null,
        must_change_password: true,
        password_updated_at: new Date().toISOString(),
        ...(resetDevice ? { device_id: null } : {}),
      })
      .eq("id", staffId);



    if (updateErr) {
      console.error("staff-reset-password update error:", updateErr);
      return json({ error: "internal_error" }, 500);
    }

    return json({ ok: true });
  } catch (err) {
    console.error("staff-reset-password error:", err);
    return json({ error: (err as Error).message ?? "internal_error" }, 500);
  }
});
