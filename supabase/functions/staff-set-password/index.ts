// Staff self-service password change.
//
// Called after a successful staff-login where mustChangePassword=true, or when
// staff choose "Change password" from their profile. Verifies the current
// credential (password OR joined_date) and stores a bcrypt hash of the new
// password. Also re-checks device binding so a stolen session can't set a new
// password from a different device.
//
// POST /functions/v1/staff-set-password
// Body: {
//   contactNumber, deviceFingerprint,
//   currentPassword?  // OR
//   joinedDate?,      // (DDMMYYYY, only valid when no password_hash is set yet)
//   newPassword       // min 6 chars
// }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

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
  return (
    String(d.getDate()).padStart(2, "0") === ddmmyyyy.substring(0, 2) &&
    String(d.getMonth() + 1).padStart(2, "0") === ddmmyyyy.substring(2, 4) &&
    String(d.getFullYear()) === ddmmyyyy.substring(4, 8)
  );
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { contactNumber, deviceFingerprint, currentPassword, joinedDate, newPassword, photo } = await req.json();

    if (!contactNumber || !deviceFingerprint || !newPassword) {
      return json({ error: "Missing required fields" }, 400);
    }

    if (typeof newPassword !== "string" || newPassword.length < 6 || newPassword.length > 128) {
      return json({ error: "Password must be 6-128 characters" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: rows, error } = await admin
      .from("staff")
      .select("id, joined_date, device_id, is_active, password_hash")
      .eq("contact_number", String(contactNumber).trim());

    if (error || !rows || rows.length === 0) {
      return json({ error: "invalid_credentials" }, 401);
    }

    let match: any = null;
    for (const s of rows as any[]) {
      if (!s.is_active) continue;
      if (currentPassword && s.password_hash) {
        try {
          if (await bcrypt.compare(currentPassword, s.password_hash)) { match = s; break; }
        } catch { /* ignore */ }
      }
      // First-login path: no hash yet -> accept joined_date, or accept
      // currentPassword when it happens to equal joined_date.
      if (!s.password_hash) {
        const candidate = joinedDate || currentPassword;
        if (candidate && /^\d{8}$/.test(String(candidate)) && joinedDateMatches(s.joined_date, String(candidate))) {
          match = s;
          break;
        }
      }
    }

    if (!match) {
      return json({ error: "invalid_credentials" }, 401);
    }

    if (match.device_id && match.device_id !== deviceFingerprint) {
      return json({ error: "device_locked" }, 403);
    }

    const hash = await bcrypt.hash(newPassword);

    const { error: updateErr } = await admin
      .from("staff")
      .update({
        password_hash: hash,
        must_change_password: false,
        password_updated_at: new Date().toISOString(),
        // bind device on first-time set if not already bound
        device_id: match.device_id ?? deviceFingerprint,
        ...(photo ? { photo_url: photo } : {}),
      })
      .eq("id", match.id);

    if (updateErr) {
      console.error("staff-set-password update error:", updateErr);
      return json({ error: "internal_error" }, 500);
    }

    return json({ ok: true });
  } catch (err) {
    console.error("staff-set-password error:", err);
    return json({ error: (err as Error).message ?? "internal_error" }, 500);
  }
});
