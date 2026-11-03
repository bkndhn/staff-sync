// Verified staff password recovery.
//
// Three steps, so nobody can change a password just by knowing someone's
// phone number, joining date or a code:
//   1. request  (public)  — the staff member enters phone + joining date on
//      THEIR phone. The server returns a long secret request token (kept only
//      on that phone) and a short 6-digit match code to show the manager.
//   2. approve  (manager) — a signed-in admin/manager of the same client checks
//      the person in front of them and types the match code. A wrong code
//      cancels the request.
//   3. complete (public)  — the same phone sends the secret request token with
//      the new password. It only works after approval and within 15 minutes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import bcrypt from "npm:bcryptjs@2.4.3";
import { resolveCaller } from "../_shared/caller.ts";

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

const REQUEST_TTL_MS = 15 * 60 * 1000;

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
};
const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const randomCode = () => String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));

const clearRequest = {
  reset_request_hash: null,
  reset_request_code_hash: null,
  reset_request_expires_at: null,
  reset_approved_at: null,
  reset_approved_by: null,
  reset_pin: null,
  reset_pin_expires_at: null,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    // ── 1. Staff starts a request on their own phone ──────────────────────────
    if (action === "request") {
      const { contactNumber, doj, tenantSlug } = body;
      if (typeof contactNumber !== "string" || !/^[0-9+\- ]{6,20}$/.test(contactNumber) ||
          typeof doj !== "string" || !/^\d{8}$/.test(doj) ||
          typeof tenantSlug !== "string" || !tenantSlug || tenantSlug.length > 100) {
        return json({ error: "Invalid details." }, 400);
      }

      const { data: tenant } = await admin.from("tenants")
        .select("id, staff_device_lock_enabled").eq("slug", tenantSlug).maybeSingle();
      if (!tenant) return json({ error: "Invalid organization" }, 404);
      if (tenant.staff_device_lock_enabled !== false) {
        return json({ error: "Self-service password reset is disabled for this organization because strict device binding is enabled. Please ask your manager to reset your password." }, 403);
      }

      const formattedDoj = `${doj.slice(4, 8)}-${doj.slice(2, 4)}-${doj.slice(0, 2)}`;
      const { data: staff } = await admin.from("staff")
        .select("id, is_active")
        .eq("tenant_id", tenant.id)
        .eq("contact_number", contactNumber)
        .eq("joined_date", formattedDoj)
        .maybeSingle();

      const requestToken = randomToken();
      const code = randomCode();
      // Same response whether or not the details matched, so the form cannot be
      // used to discover who works where.
      if (staff?.is_active) {
        await admin.from("staff").update({
          ...clearRequest,
          reset_request_hash: await sha256(requestToken),
          reset_request_code_hash: await sha256(`${staff.id}:${code}`),
          reset_request_expires_at: new Date(Date.now() + REQUEST_TTL_MS).toISOString(),
        }).eq("id", staff.id);
      }
      return json({ requestToken, code, expiresInMinutes: REQUEST_TTL_MS / 60000 });
    }

    // ── 2. Manager approves after checking the person in front of them ────────
    if (action === "approve") {
      const auth = await resolveCaller(admin, req);
      if (!auth.ok || !auth.caller) return json({ error: auth.error ?? "Unauthorized" }, auth.status ?? 401);
      const caller = auth.caller;
      if (!["admin", "manager"].includes(caller.role) || !caller.tenant_id) {
        return json({ error: "Only an admin or manager can approve a password reset" }, 403);
      }
      const { staffId, code } = body;
      if (typeof staffId !== "string" || !staffId || typeof code !== "string" || !/^\d{6}$/.test(code)) {
        return json({ error: "Enter the 6-digit code shown on the staff member's phone" }, 400);
      }

      const { data: staff } = await admin.from("staff")
        .select("id, name, tenant_id, location, reset_request_code_hash, reset_request_expires_at, reset_approved_at")
        .eq("id", staffId).eq("tenant_id", caller.tenant_id).maybeSingle();
      if (!staff) return json({ error: "Staff member not found" }, 404);

      if (caller.role === "manager") {
        const { data: mgr } = await admin.from("app_users").select("location").eq("id", caller.id).maybeSingle();
        if (mgr?.location && staff.location && mgr.location !== staff.location) {
          return json({ error: "This staff member belongs to another branch" }, 403);
        }
      }

      if (!staff.reset_request_code_hash || !staff.reset_request_expires_at ||
          new Date(staff.reset_request_expires_at).getTime() < Date.now()) {
        return json({ error: "No active reset request. Ask the staff member to start again from their phone." }, 409);
      }
      if (staff.reset_approved_at) return json({ error: "This request is already approved" }, 409);

      if ((await sha256(`${staff.id}:${code}`)) !== staff.reset_request_code_hash) {
        await admin.from("staff").update(clearRequest).eq("id", staff.id);
        return json({ error: "Code did not match. The request was cancelled — ask the staff member to start again." }, 403);
      }

      await admin.from("staff").update({
        reset_approved_at: new Date().toISOString(),
        reset_approved_by: caller.id,
      }).eq("id", staff.id);

      await admin.from("audit_logs").insert([{
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        tenant_id: staff.tenant_id,
        action: "staff_password_reset_approved",
        details: `Password reset approved in person for staff ${staff.id}`,
        performed_by: `user:${caller.id}`,
        timestamp: new Date().toISOString(),
      }]).then(() => undefined, () => undefined);

      return json({ ok: true, name: staff.name });
    }

    // ── 3. Same phone sets the new password once approved ─────────────────────
    if (action === "complete") {
      const { requestToken, newPassword } = body;
      if (typeof requestToken !== "string" || !/^[A-Za-z0-9_-]{40,60}$/.test(requestToken) ||
          typeof newPassword !== "string" || newPassword.length < 8 || newPassword.length > 128) {
        return json({ error: "Invalid details. Password must be 8-128 characters." }, 400);
      }

      const { data: staff } = await admin.from("staff")
        .select("id, tenant_id, is_active, reset_request_expires_at, reset_approved_at")
        .eq("reset_request_hash", await sha256(requestToken))
        .maybeSingle();

      if (!staff || !staff.is_active || !staff.reset_request_expires_at ||
          new Date(staff.reset_request_expires_at).getTime() < Date.now()) {
        return json({ error: "This reset request has expired. Please start again." }, 410);
      }
      if (!staff.reset_approved_at) {
        return json({ pending: true, error: "Waiting for your manager to approve. Show them your code." }, 409);
      }

      const password_hash = await bcrypt.hash(newPassword, 10);
      await admin.from("staff").update({
        ...clearRequest,
        password_hash,
        must_change_password: false,
        password_updated_at: new Date().toISOString(),
      }).eq("id", staff.id);

      const when = new Date().toISOString();
      await admin.from("staff_notifications").insert({
        staff_id: staff.id,
        tenant_id: staff.tenant_id,
        title: "Your password was changed",
        message: "Your app password was just reset with your manager's approval. If this wasn't you, tell your manager immediately.",
        type: "security",
      }).then(() => undefined, () => undefined);
      await admin.from("audit_logs").insert([{
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        tenant_id: staff.tenant_id,
        action: "staff_password_reset_completed",
        details: `Password reset completed for staff ${staff.id}`,
        performed_by: `staff:${staff.id}`,
        timestamp: when,
      }]).then(() => undefined, () => undefined);

      return json({ success: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch {
    return json({ error: "Internal error" }, 500);
  }
});
