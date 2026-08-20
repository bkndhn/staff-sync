// Staff pre-auth lookup + device-bind + password verification.
//
// The staff table is service_role only, so client cannot query it directly.
// This function validates one of two credential pairs, performs device-binding,
// and returns a limited staff record + password-status flag.
//
// Auth modes:
//   1. Password mode (preferred once staff sets one):
//      body: { contactNumber, password, deviceFingerprint }
//   2. Legacy / first-login mode (joined_date DDMMYYYY as temp password):
//      body: { contactNumber, joinedDate, deviceFingerprint }
//
// Response: { staff, mustChangePassword }.
// When mustChangePassword=true the client MUST redirect to the "set password"
// screen before granting a session.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const joinedDateMatches = (staffJoinedDate: string | null, ddmmyyyy: string): boolean => {
  if (!staffJoinedDate) return false;
  const d = new Date(staffJoinedDate);
  if (isNaN(d.getTime())) return false;
  const day = ddmmyyyy.substring(0, 2);
  const month = ddmmyyyy.substring(2, 4);
  const year = ddmmyyyy.substring(4, 8);
  return (
    String(d.getDate()).padStart(2, "0") === day &&
    String(d.getMonth() + 1).padStart(2, "0") === month &&
    String(d.getFullYear()) === year
  );
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { contactNumber, joinedDate, password, deviceFingerprint } = await req.json();

    if (!contactNumber || !deviceFingerprint || (!joinedDate && !password)) {
      return json({ error: "Missing required fields" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: rows, error } = await admin
      .from("staff")
      .select("id, name, location, floor, designation, type, joined_date, device_id, is_active, contact_number, password_hash, must_change_password, tenant_id")
      .eq("contact_number", String(contactNumber).trim());

    if (error || !rows || rows.length === 0) {
      return json({ error: "invalid_credentials" }, 401);
    }

    // Locate the staff row that matches the supplied credential.
    let match: any = null;
    let usedTempPassword = false;

    if (password && typeof password === "string" && password.length > 0) {
      // Password mode: hash may or may not be set. If unset, treat the joined_date
      // (DDMMYYYY) as a fallback temporary password so first-login still works
      // even if the UI calls the password endpoint.
      for (const s of rows as any[]) {
        if (s.password_hash) {
          try {
            const ok = await bcrypt.compare(password, s.password_hash);
            if (ok) { match = s; break; }
          } catch { /* ignore */ }
        } else if (/^\d{8}$/.test(password) && joinedDateMatches(s.joined_date, password)) {
          match = s;
          usedTempPassword = true;
          break;
        }
      }
    } else if (joinedDate && /^\d{8}$/.test(String(joinedDate))) {
      // Legacy path: joined_date only. Only allowed if the staff has NOT yet set
      // a custom password — once a password exists, joined_date stops working.
      for (const s of rows as any[]) {
        if (!s.password_hash && joinedDateMatches(s.joined_date, String(joinedDate))) {
          match = s;
          usedTempPassword = true;
          break;
        }
      }
    }

    if (!match || !match.is_active) {
      return json({ error: "invalid_credentials" }, 401);
    }

    // Platform-level switch: the client's staff self-service portal can be
    // disabled (or the whole client suspended) from the super admin console.
    let deviceLockEnabled = true;
    if (match.tenant_id) {
      const { data: tenant } = await admin
        .from("tenants")
        .select("status, staff_portal_enabled, staff_device_lock_enabled")
        .eq("id", match.tenant_id)
        .maybeSingle();
      if (tenant && (tenant.status !== "ACTIVE" || tenant.staff_portal_enabled === false)) {
        return json({ error: "staff_portal_disabled" }, 403);
      }
      if (tenant && tenant.staff_device_lock_enabled === false) {
        deviceLockEnabled = false;
      }
    }

    if (deviceLockEnabled) {
      // Check if device is blacklisted
      const { data: blacklisted } = await admin
        .from("blacklisted_devices")
        .select("id")
        .eq("staff_id", match.id)
        .eq("device_fingerprint", deviceFingerprint)
        .maybeSingle();

      if (blacklisted) {
        return json({ error: "device_locked", message: "This device has been permanently blocked due to a previous reset." }, 403);
      }

      if (!match.device_id) {
        await admin.from("staff").update({ device_id: deviceFingerprint }).eq("id", match.id);
      } else if (match.device_id !== deviceFingerprint) {
        return json({ error: "device_locked" }, 403);
      }
    }

    // Anyone still on the temp password (joined_date) must set a real one.
    const mustChangePassword = Boolean(match.must_change_password) || usedTempPassword || !match.password_hash;

    // Generate session token for data-api access
    const sessionToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await admin.from("app_sessions").insert({
      user_id: match.id,
      role: "staff",
      token: sessionToken,
      expires_at: expiresAt,
      is_valid: true,
    });

    // Remove sensitive fields before returning the staff record to the frontend
    const safeStaff = { ...match };
    delete safeStaff.password_hash;
    delete safeStaff.must_change_password;

    return json({
      staff: safeStaff,
      sessionToken,
      mustChangePassword,
    });
  } catch (err) {
    console.error("staff-login error:", err);
    return json({ error: (err as Error).message ?? "internal_error" }, 500);
  }
});
