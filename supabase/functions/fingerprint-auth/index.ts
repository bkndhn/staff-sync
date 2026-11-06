// Server-verified fingerprint attendance (WebAuthn).
// Shared-station rule: only an external biometric security key/reader (cross-platform
// authenticator with user verification) may be enrolled per staff member. A phone's own
// screen-unlock passkey proves only "someone who can unlock this phone" — never which staff.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  generateAuthenticationOptions, generateRegistrationOptions,
  verifyAuthenticationResponse, verifyRegistrationResponse,
} from "npm:@simplewebauthn/server@13";
import { resolveCaller } from "../_shared/caller.ts";
import { decideFingerPunch, distanceMeters, localStamp, FP_MAX_FAILS, FP_LOCK_MS } from "../_shared/fingerprintPunch.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const ENROLLERS = ["admin", "manager", "super_admin"];
const STATIONS = ["admin", "manager", "supervisor", "floor_supervisor", "super_admin"];
const UUID = /^[0-9a-f-]{36}$/i;
const CHALLENGE_MS = 2 * 60 * 1000;
const DEFAULT_ORIGINS = [
  "https://zenhrapp.lovable.app",
  "https://staff-shine-sync.lovable.app",
  "https://id-preview--9244e6fb-8168-4790-a4fe-a440a7ad817c.lovable.app",
  "http://localhost:8080",
];
function originOf(req: Request): string | null {
  const o = (req.headers.get("origin") || "").replace(/\/+$/, "");
  const extra = (Deno.env.get("APP_ORIGINS") || "").split(",").map((x) => x.trim().replace(/\/+$/, "")).filter(Boolean);
  return [...DEFAULT_ORIGINS, ...extra].includes(o) ? o : null;
}
const b64u = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

async function saveChallenge(tenant: string, staffId: string, purpose: string, challenge: string) {
  await admin.from("fingerprint_challenges").delete().lt("expires_at", new Date(Date.now() - 3600_000).toISOString());
  const { data } = await admin.from("fingerprint_challenges").insert({
    tenant_id: tenant, staff_id: staffId, purpose, challenge, expires_at: new Date(Date.now() + CHALLENGE_MS).toISOString(),
  }).select("id").single();
  return data?.id as string;
}
/** Single-use: marks the challenge used atomically; returns it only if still valid. */
async function takeChallenge(id: string, tenant: string, purpose: string) {
  if (!UUID.test(id || "")) return null;
  const { data } = await admin.from("fingerprint_challenges").update({ used_at: new Date().toISOString() })
    .eq("id", id).eq("tenant_id", tenant).eq("purpose", purpose).is("used_at", null)
    .gt("expires_at", new Date().toISOString()).select("staff_id, challenge").maybeSingle();
  return data;
}

/** Record a refused/suspicious touch so managers see it and the lock is enforced server-side. */
async function logMisuse(tenant: string, stationId: string, reason: string, staffId?: string | null, staffName?: string | null) {
  await admin.from("audit_logs").insert({
    tenant_id: tenant, action: "fingerprint_misuse", actor_id: stationId, performed_by: stationId,
    staff_id: staffId ?? null, staff_name: staffName ?? null, details: reason.slice(0, 300), metadata: { reason },
  });
}
/** Seconds the station is still locked (server count of failed touches in the lock window). */
async function stationLockLeft(tenant: string, stationId: string): Promise<number> {
  const since = new Date(Date.now() - FP_LOCK_MS).toISOString();
  const { data } = await admin.from("audit_logs").select("timestamp").eq("tenant_id", tenant)
    .eq("action", "fingerprint_misuse").eq("actor_id", stationId).gte("timestamp", since)
    .order("timestamp", { ascending: false }).limit(FP_MAX_FAILS);
  if (!data || data.length < FP_MAX_FAILS) return 0;
  return Math.max(1, Math.ceil((Date.parse(data[0].timestamp) + FP_LOCK_MS - Date.now()) / 1000));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const r = await resolveCaller(admin, req);
  if (!r.ok || !r.caller) return json({ error: r.error }, r.status || 401);
  const caller = r.caller;
  const tenant = caller.tenant_id;
  if (!tenant) return json({ error: "No company on this account" }, 403);
  const origin = originOf(req);
  if (!origin) return json({ error: "This web address is not allowed for fingerprints" }, 403);
  const rpID = new URL(origin).hostname;

  try {
    switch (body?.action) {
      case "register_options": {
        if (!ENROLLERS.includes(caller.role)) return json({ error: "Only admins/managers can enrol" }, 403);
        const staffId = String(body.staffId || "");
        if (!UUID.test(staffId)) return json({ error: "Invalid staff" }, 400);
        const { data: s } = await admin.from("staff").select("id, name, employee_code, is_active").eq("id", staffId).eq("tenant_id", tenant).maybeSingle();
        if (!s || s.is_active === false) return json({ error: "Staff not found or inactive" }, 404);
        const { data: existing } = await admin.from("staff_fingerprints").select("credential_id, transports").eq("tenant_id", tenant).eq("staff_id", staffId);
        const options = await generateRegistrationOptions({
          rpName: "ZenHR Attendance", rpID,
          userName: `${s.employee_code || s.name} · ZenHR`, userDisplayName: s.name,
          userID: new TextEncoder().encode(staffId),
          attestationType: "none",
          authenticatorSelection: { authenticatorAttachment: "cross-platform", userVerification: "required", residentKey: "preferred" },
          excludeCredentials: (existing || []).map((e: any) => ({ id: e.credential_id, transports: e.transports || undefined })),
          timeout: 60000,
        });
        const challengeId = await saveChallenge(tenant, staffId, "register", options.challenge);
        return json({ options, challengeId });
      }

      case "register_verify": {
        if (!ENROLLERS.includes(caller.role)) return json({ error: "Only admins/managers can enrol" }, 403);
        const ch = await takeChallenge(body.challengeId, tenant, "register");
        if (!ch) return json({ error: "Enrolment timed out. Try again." }, 400);
        const resp = body.response;
        // Shared stations must not accept the phone's own screen lock.
        if (resp?.authenticatorAttachment === "platform") {
          return json({ error: "This is the phone's own screen lock. Use a fingerprint security key / reader for shared attendance." }, 422);
        }
        const v = await verifyRegistrationResponse({
          response: resp, expectedChallenge: ch.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
        });
        if (!v.verified || !v.registrationInfo) return json({ error: "Fingerprint could not be verified" }, 400);
        const transports: string[] = resp?.response?.transports || [];
        if (transports.length && transports.every((t) => t === "internal" || t === "hybrid")) {
          return json({ error: "Only a phone passkey was offered. Plug in / tap a fingerprint security key or reader." }, 422);
        }
        const cred = v.registrationInfo.credential;
        const { data: s } = await admin.from("staff").select("name").eq("id", ch.staff_id).eq("tenant_id", tenant).maybeSingle();
        const { error } = await admin.from("staff_fingerprints").insert({
          tenant_id: tenant, staff_id: ch.staff_id, staff_name: s?.name ?? null,
          credential_id: cred.id, public_key: b64u(cred.publicKey), sign_count: cred.counter,
          transports, device_label: String(body.deviceLabel || "Security key").slice(0, 60),
          enrolled_by: caller.id, verified_at: new Date().toISOString(),
        });
        if (error) return json({ error: error.code === "23505" ? "Already enrolled" : "Could not save" }, 400);
        return json({ ok: true, staffId: ch.staff_id });
      }

      case "auth_options": {
        if (!STATIONS.includes(caller.role)) return json({ error: "Not allowed" }, 403);
        const lockA = await stationLockLeft(tenant, caller.id);
        if (lockA) return json({ error: `Too many wrong touches. Station locked for ${lockA}s.`, lockedFor: lockA }, 429);
        const { data: creds } = await admin.from("staff_fingerprints").select("credential_id, transports")
          .eq("tenant_id", tenant).not("public_key", "is", null).limit(500);
        if (!creds?.length) return json({ error: "No verified fingerprints enrolled yet" }, 404);
        const options = await generateAuthenticationOptions({
          rpID, userVerification: "required", timeout: 30000,
          allowCredentials: creds.map((c: any) => ({ id: c.credential_id, transports: c.transports || undefined })),
        });
        const challengeId = await saveChallenge(tenant, caller.id, "auth", options.challenge);
        return json({ options, challengeId });
      }

      case "auth_verify": {
        if (!STATIONS.includes(caller.role)) return json({ error: "Not allowed" }, 403);
        const lockV = await stationLockLeft(tenant, caller.id);
        if (lockV) return json({ error: `Too many wrong touches. Station locked for ${lockV}s.`, lockedFor: lockV }, 429);
        const ch = await takeChallenge(body.challengeId, tenant, "auth");
        if (!ch) return json({ error: "Touch timed out. Try again." }, 400);
        // A challenge is only good for the station account that asked for it.
        if (ch.staff_id !== caller.id) return json({ error: "Touch timed out. Try again." }, 400);
        const resp = body.response;
        const { data: fp } = await admin.from("staff_fingerprints").select("id, staff_id, staff_name, credential_id, public_key, sign_count, transports")
          .eq("tenant_id", tenant).eq("credential_id", String(resp?.id || "")).not("public_key", "is", null).maybeSingle();
        if (!fp) { await logMisuse(tenant, caller.id, "Unregistered key touched"); return json({ error: "Fingerprint not registered for any staff" }, 404); }
        const v = await verifyAuthenticationResponse({
          response: resp, expectedChallenge: ch.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
          credential: { id: fp.credential_id, publicKey: fromB64u(fp.public_key), counter: Number(fp.sign_count || 0), transports: fp.transports || undefined },
        });
        if (!v.verified) { await logMisuse(tenant, caller.id, "Signature not verified", fp.staff_id, fp.staff_name); return json({ error: "Fingerprint not recognised" }, 401); }
        const newCount = v.authenticationInfo.newCounter;
        if (fp.sign_count > 0 && newCount <= fp.sign_count) { await logMisuse(tenant, caller.id, "Counter did not advance (cloned or replayed key)", fp.staff_id, fp.staff_name); return json({ error: "Possible cloned key — blocked. Ask a manager." }, 409); }
        const { data: s } = await admin.from("staff").select("id, is_active").eq("id", fp.staff_id).eq("tenant_id", tenant).maybeSingle();
        if (!s || s.is_active === false) return json({ error: "Not an active staff member" }, 403);
        // Counter advance is conditional on the old value, so two racing replays cannot both pass.
        const { data: bumped } = await admin.from("staff_fingerprints")
          .update({ sign_count: newCount, last_used_at: new Date().toISOString() })
          .eq("id", fp.id).eq("sign_count", fp.sign_count).select("id").maybeSingle();
        if (!bumped) { await logMisuse(tenant, caller.id, "Replayed touch", fp.staff_id, fp.staff_name); return json({ error: "This touch was already used. Touch again." }, 409); }

        // ---- Record the punch on the server, bound to the verified staff member ----
        const { data: st } = await admin.from("staff").select("id, name, location").eq("id", fp.staff_id).eq("tenant_id", tenant).maybeSingle();
        const { data: pref } = await admin.from("notification_preferences").select("timezone").eq("tenant_id", tenant).maybeSingle();
        const nowMs = Date.now();
        const { date, time } = localStamp(nowMs, pref?.timezone || "Asia/Kolkata");

        // Server-side geofence (station location is required when the branch has a fence).
        const { data: loc } = await admin.from("locations").select("latitude, longitude, radius_meters")
          .eq("tenant_id", tenant).eq("name", st?.location || "").maybeSingle();
        let dist: number | null = null;
        if (loc?.latitude != null && loc?.longitude != null) {
          const lat = Number(body.lat), lng = Number(body.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json({ error: "Turn on location on the station phone." }, 422);
          dist = distanceMeters({ lat, lng }, { lat: loc.latitude, lng: loc.longitude });
          const acc = Math.min(Math.max(Number(body.accuracy) || 0, 0), 100);
          if (dist - acc > (loc.radius_meters || 100)) { await logMisuse(tenant, caller.id, `Outside branch fence (${Math.round(dist)} m)`, fp.staff_id, st?.name); return json({ error: `${st?.name}: station is ${Math.round(dist)} m from ${st?.location}.` }, 403); }
        }

        const { data: rec } = await admin.from("attendance").select("id, arrival_time, leaving_time, status")
          .eq("tenant_id", tenant).eq("staff_id", fp.staff_id).eq("date", date).eq("is_part_time", false).maybeSingle();
        const { data: lastEv } = await admin.from("punch_events").select("created_at")
          .eq("tenant_id", tenant).eq("staff_id", fp.staff_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
        const d = decideFingerPunch({
          rec: rec ? { arrivalTime: rec.arrival_time, leavingTime: rec.leaving_time, status: rec.status } : null,
          nowMs, lastPunchMs: lastEv ? Date.parse(lastEv.created_at) : undefined, nowTime: time,
        });
        if (!d.ok) return json({ ok: false, staffName: st?.name, error: `${st?.name}: ${d.reason}` }, 409);

        const isSun = new Date(`${date}T00:00:00Z`).getUTCDay() === 0;
        const w = d.kind === "in"
          ? await admin.from("attendance").upsert({
              tenant_id: tenant, staff_id: fp.staff_id, staff_name: st?.name, location: st?.location, date,
              status: "Present", attendance_value: 1, is_sunday: isSun, is_part_time: false, arrival_time: time.slice(0, 5),
            }, { onConflict: "staff_id,date,is_part_time" })
          : await admin.from("attendance").update({ leaving_time: time.slice(0, 5) }).eq("id", rec!.id).is("leaving_time", null);
        if (w.error) return json({ error: "Could not save the punch. Try again." }, 500);
        await admin.from("punch_events").insert({
          tenant_id: tenant, staff_id: fp.staff_id, staff_name: st?.name, location: st?.location, date,
          event_time: time.slice(0, 5), kind: d.kind, source: "master_fingerprint",
          device_label: `Fingerprint key · verified${dist != null ? ` · ${Math.round(dist)}m` : ""} · by ${caller.id}`.slice(0, 120),
        });
        return json({ ok: true, staffId: fp.staff_id, staffName: st?.name, kind: d.kind, time: time.slice(0, 5), date });
      }
      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e: any) {
    return json({ error: e?.message || "Fingerprint check failed" }, 400);
  }
});
