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

    const { staffId } = await req.json();
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
      .select("user_id, expires_at")
      .eq("session_token", sessionToken)
      .maybeSingle();

    if (!session || (session.expires_at && new Date(session.expires_at as any) < new Date())) {
      return json({ error: "unauthorized" }, 401);
    }

    const { data: caller } = await admin
      .from("app_users")
      .select("role, is_active")
      .eq("id", (session as any).user_id)
      .maybeSingle();

    if (!caller || !(caller as any).is_active || !["admin", "manager"].includes((caller as any).role)) {
      return json({ error: "forbidden" }, 403);
    }

    // Reset: clear hash, force password change on next login, unbind device
    // so the staff member can re-enroll from a new phone if that's why they
    // asked for a reset.
    const { error: updateErr } = await admin
      .from("staff")
      .update({
        password_hash: null,
        must_change_password: true,
        password_updated_at: new Date().toISOString(),
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
