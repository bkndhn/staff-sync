import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webPush from "npm:web-push@3.6.7";
import { fcmSendTo, fcmConfigured } from "../_shared/fcm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-session-token, x-cron-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Normalise keys (people often paste standard base64 with padding/newlines).
const b64url = (v?: string) => v ? v.trim().replace(/\s+/g, "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : undefined;
let VAPID_PUBLIC_KEY = b64url(Deno.env.get("VAPID_PUBLIC_KEY"));
let VAPID_PRIVATE_KEY = b64url(Deno.env.get("VAPID_PRIVATE_KEY"));
// Web Push (VAPID) needs a P-256 pair: public = 65 bytes (87 b64url chars, starts "B"), private = 32 bytes (43 chars).
// Firebase server keys / service-account JSON are NOT valid here. Never log key material.
let PUSH_STATUS = "missing";
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  const shapeOk = VAPID_PUBLIC_KEY.length === 87 && VAPID_PUBLIC_KEY.startsWith("B") && VAPID_PRIVATE_KEY.length === 43;
  try {
    if (!shapeOk) throw new Error("keys are not a P-256 VAPID pair");
    webPush.setVapidDetails("mailto:admin@staffsync.app", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    PUSH_STATUS = "ok";
  } catch (e) {
    console.error("Invalid VAPID keys — push disabled:", (e as Error).message);
    VAPID_PUBLIC_KEY = undefined; VAPID_PRIVATE_KEY = undefined; PUSH_STATUS = "invalid";
  }
}

type Recipient = { staffId?: string | null; appUserId?: string | null };

async function pushTo(recipients: Recipient[], payload: { title: string; body: string; actionUrl?: string }) {
  const fcmCount = await fcmSendTo(admin, null, recipients, payload).catch(() => 0);
  return fcmCount + await webPushTo(recipients, payload);
}

async function webPushTo(recipients: Recipient[], payload: { title: string; body: string; actionUrl?: string }) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || recipients.length === 0) return 0;

  const staffIds = recipients.map((r) => r.staffId).filter(Boolean) as string[];
  const userIds = recipients.map((r) => r.appUserId).filter(Boolean) as string[];

  const subs: any[] = [];
  if (staffIds.length) {
    const { data } = await admin.from("push_subscriptions").select("*").in("staff_id", staffIds);
    subs.push(...(data || []));
  }
  if (userIds.length) {
    const { data } = await admin.from("push_subscriptions").select("*").in("app_user_id", userIds);
    subs.push(...(data || []));
  }

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: "/image.png",
    actionUrl: payload.actionUrl || "/",
  });

  let count = 0;
  for (const sub of subs) {
    try {
      await webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
      );
      count++;
    } catch (err: any) {
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        await admin.from("push_subscriptions").delete().eq("id", sub.id);
      }
    }
  }
  return count;
}

async function record(
  tenantId: string,
  category: string,
  audience: string,
  rows: Array<{ staffId?: string | null; appUserId?: string | null; title: string; message: string; type: string; actionUrl?: string; tabId?: string }>,
  pushCount: number,
) {
  if (rows.length) {
    await admin.from("staff_notifications").insert(
      rows.map((r) => ({
        tenant_id: tenantId,
        staff_id: r.staffId ?? null,
        app_user_id: r.appUserId ?? null,
        type: r.type,
        title: r.title,
        message: r.message,
        action_url: r.actionUrl ?? null,
        tab_id: r.tabId ?? null,
      })),
    );
  }
  await admin.from("notification_log").insert({
    tenant_id: tenantId,
    category,
    audience,
    title: rows[0]?.title ?? category,
    body: rows[0]?.message ?? null,
    status: "sent",
    push_count: pushCount,
    metadata: { recipients: rows.length },
  });
}

async function getCaller(req: Request) {
  const legacyToken = req.headers.get("x-session-token");
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (bearer && bearer.startsWith("eyJ")) {
    const { data: { user } } = await admin.auth.getUser(bearer);
    if (user) {
      let profile = await admin.from("app_users").select("id, role, tenant_id, is_active").eq("auth_id", user.id).maybeSingle();
      if (!profile.data && user.email) {
        profile = await admin.from("app_users").select("id, role, tenant_id, is_active").eq("email", user.email).maybeSingle();
      }
      if (profile.data) return profile.data;
    }
  }
  if (legacyToken) {
    const { data: session } = await admin.from("app_sessions").select("user_id, expires_at, is_valid")
      .eq("token", legacyToken).eq("is_valid", true).maybeSingle();
    if (session && new Date(session.expires_at).getTime() > Date.now()) {
      const { data } = await admin.from("app_users").select("id, role, tenant_id, is_active").eq("id", session.user_id).maybeSingle();
      return data;
    }
  }
  return null;
}

async function adminsOf(tenantId: string) {
  const { data } = await admin.from("app_users").select("id")
    .eq("tenant_id", tenantId).eq("is_active", true).in("role", ["admin", "manager"]);
  return data || [];
}

async function salaryCredit(tenantId: string, payload: any) {
  const m = Number(payload.month), y = Number(payload.year);
  const validMonthYear = typeof payload.monthYear === "string" && /^[A-Za-z]{3,9} \d{4}$/.test(payload.monthYear);
  const monthLabel = validMonthYear ? payload.monthYear
    : (Number.isInteger(m) && m >= 1 && m <= 12 && Number.isInteger(y) && y >= 2000 && y <= 2100 ? `${m}/${y}` : "this month");
  const { data: staff } = await admin.from("staff").select("id, name")
    .eq("tenant_id", tenantId).eq("is_active", true);
  const list = staff || [];
  const title = "Salary Credited 💸";
  // Fixed server-side wording: callers cannot inject custom text into salary alerts.
  const message = `Your salary for ${monthLabel} has been processed and credited.`;
  const pushed = await pushTo(list.map((s) => ({ staffId: s.id })), { title, body: message, actionUrl: "/?tab=salary" });
  await record(tenantId, "salary_credit", "staff", list.map((s) => ({
    staffId: s.id, title, message, type: "salary_disbursed", tabId: "salary",
  })), pushed);
  return { recipients: list.length, pushed };
}

async function uninformedLeave(tenantId: string, payload: any) {
  const { data: prefs } = await admin.from("notification_preferences")
    .select("uninformed_leave_enabled").eq("tenant_id", tenantId).maybeSingle();
  if (prefs && prefs.uninformed_leave_enabled === false) return { skipped: true };

  const recipients = await adminsOf(tenantId);
  const title = "Uninformed Absence ⚠️";
  const message = `${payload.staffName || "A staff member"} was marked uninformed absent at ${payload.location || "unknown location"}${payload.floor ? ` (${payload.floor})` : ""} on ${payload.date}.`;
  const pushed = await pushTo(recipients.map((u) => ({ appUserId: u.id })), { title, body: message, actionUrl: "/?tab=attendance" });
  await record(tenantId, "uninformed_leave", "admins", recipients.map((u) => ({
    appUserId: u.id, title, message, type: "uninformed_leave", tabId: "attendance",
  })), pushed);
  return { recipients: recipients.length, pushed };
}

// Late arrival / early leave alert to the staff member themself. Wording is fixed server-side.
async function punctuality(tenantId: string, payload: any) {
  const kind = payload?.kind === "early_leave" ? "early_leave" : payload?.kind === "late_arrival" ? "late_arrival" : null;
  const staffId = typeof payload?.staffId === "string" ? payload.staffId : null;
  const time = typeof payload?.time === "string" && /^\d{2}:\d{2}/.test(payload.time) ? payload.time.slice(0, 5) : null;
  const minutes = Math.max(0, Math.min(1440, Math.round(Number(payload?.minutes) || 0)));
  const date = typeof payload?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.date) ? payload.date : null;
  if (!kind || !staffId || !time || !date) return { skipped: true, reason: "invalid" };
  const { data: s } = await admin.from("staff").select("id, name, tenant_id").eq("id", staffId).maybeSingle();
  if (!s || s.tenant_id !== tenantId) return { skipped: true, reason: "not_found" };
  // Server-side idempotency: one alert per staff/date/kind across all sources & offline replays.
  const dayStart = `${date}T00:00:00Z`;
  const { data: prior } = await admin.from("staff_notifications").select("id, message")
    .eq("tenant_id", tenantId).eq("staff_id", staffId).eq("type", kind).gte("created_at", dayStart).limit(20);
  if ((prior || []).some((r: any) => String(r.message || "").includes(` on ${date},`))) return { skipped: true, reason: "duplicate" };
  // Hours-based staff are exempt from punctuality alerts (pay is duration-based).
  const { data: att } = await admin.from("attendance").select("applied_rule_type")
    .eq("staff_id", staffId).eq("date", date).eq("is_part_time", false).maybeSingle();
  if (att?.applied_rule_type === "hours_based") return { skipped: true, reason: "hours_based" };
  const [h, m] = time.split(":").map(Number);
  const t12 = `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  const title = kind === "late_arrival" ? "Late arrival ⏰" : "Early leave 🚪";
  const message = kind === "late_arrival"
    ? `You punched IN at ${t12} on ${date}, ${minutes} min after shift start.`
    : `You punched OUT at ${t12} on ${date}, ${minutes} min before shift end.`;
  const pushed = await pushTo([{ staffId }], { title, body: message, actionUrl: "/?tab=attendance" });
  await record(tenantId, kind, "staff", [{ staffId, title, message, type: kind, tabId: "attendance" }], pushed);
  return { pushed };
}

async function dailyAttendanceForTenant(tenantId: string, dateStr: string) {
  const { data: rows } = await admin.from("attendance")
    .select("status, attendance_value, is_uninformed, location")
    .eq("tenant_id", tenantId).eq("date", dateStr);
  const list = rows || [];
  const present = list.filter((r) => (r.attendance_value ?? 0) > 0).length;
  const absent = list.filter((r) => (r.attendance_value ?? 0) === 0).length;
  const uninformed = list.filter((r) => r.is_uninformed).length;

  const recipients = await adminsOf(tenantId);
  const title = "Daily Attendance Summary 📋";
  const message = `${dateStr}: ${present} present, ${absent} absent${uninformed ? `, ${uninformed} uninformed` : ""} across ${new Set(list.map((r) => r.location)).size} location(s).`;
  const pushed = await pushTo(recipients.map((u) => ({ appUserId: u.id })), { title, body: message, actionUrl: "/?tab=attendance" });
  await record(tenantId, "daily_attendance", "admins", recipients.map((u) => ({
    appUserId: u.id, title, message, type: "attendance_summary", tabId: "attendance",
  })), pushed);
  return { recipients: recipients.length, pushed };
}

function localParts(timezone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

async function runScheduler() {
  const { data: prefs } = await admin.from("notification_preferences")
    .select("*").eq("daily_attendance_enabled", true);
  const results: any[] = [];
  for (const p of prefs || []) {
    let local;
    try {
      local = localParts(p.timezone || "Asia/Kolkata");
    } catch {
      local = localParts("Asia/Kolkata");
    }
    if (p.last_daily_sent_date === local.date) continue;
    const [h, m] = String(p.daily_attendance_time || "19:00").split(":");
    const target = Number(h) * 60 + Number(m);
    if (local.minutes < target || local.minutes > target + 30) continue;

    const res = await dailyAttendanceForTenant(p.tenant_id, local.date);
    await admin.from("notification_preferences")
      .update({ last_daily_sent_date: local.date }).eq("tenant_id", p.tenant_id);
    results.push({ tenant_id: p.tenant_id, ...res });
  }
  return results;
}

// Resolves either a staff portal session (app_sessions.role = 'staff' -> staff row) or an app user.
async function getStaffOrUser(req: Request): Promise<{ tenantId: string; staffId?: string; appUserId?: string } | null> {
  const legacyToken = req.headers.get("x-session-token");
  if (legacyToken && !legacyToken.startsWith("eyJ")) {
    const { data: session } = await admin.from("app_sessions").select("user_id, role, expires_at, is_valid")
      .eq("token", legacyToken).eq("is_valid", true).maybeSingle();
    if (session && new Date(session.expires_at).getTime() > Date.now() && session.role === "staff") {
      const { data: s } = await admin.from("staff").select("id, tenant_id, is_active").eq("id", session.user_id).maybeSingle();
      if (s?.is_active && s.tenant_id) return { tenantId: s.tenant_id, staffId: s.id };
      return null;
    }
  }
  const caller = await getCaller(req);
  if (caller?.is_active && caller.tenant_id) return { tenantId: caller.tenant_id, appUserId: caller.id };
  return null;
}

async function registerFcm(who: { tenantId: string; staffId?: string; appUserId?: string }, body: any) {
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!/^[A-Za-z0-9_:\-]{100,4096}$/.test(token)) return { error: "Invalid token", status: 400 };
  const platform = ["web", "android", "ios"].includes(body?.platform) ? body.platform : "web";
  const deviceName = typeof body?.deviceName === "string" ? body.deviceName.slice(0, 200) : null;
  const { error } = await admin.from("fcm_tokens").upsert({
    token, tenant_id: who.tenantId, staff_id: who.staffId ?? null, app_user_id: who.appUserId ?? null,
    platform, device_name: deviceName, updated_at: new Date().toISOString(),
  }, { onConflict: "token" });
  if (error) return { error: error.message, status: 500 };
  return { registered: true };
}

// Punch confirmation: built only from a real punch row saved in the last 15 minutes.
async function punchConfirm(tenantId: string, body: any) {
  const staffId = typeof body?.staffId === "string" ? body.staffId : null;
  if (!staffId) return { skipped: true, reason: "invalid" };
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: ev } = await admin.from("punch_events").select("id, staff_id, tenant_id, kind, event_time, created_at")
    .eq("staff_id", staffId).eq("tenant_id", tenantId).gte("created_at", since)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!ev) return { skipped: true, reason: "no_recent_punch" };
  const marker = `[#${String(ev.id).slice(0, 8)}]`;
  const { data: prior } = await admin.from("staff_notifications").select("id")
    .eq("tenant_id", tenantId).eq("staff_id", staffId).eq("type", "punch_confirm").like("message", `%${marker}%`).limit(1);
  if (prior && prior.length) return { skipped: true, reason: "duplicate" };
  const isIn = String(ev.kind || "").toUpperCase().includes("IN");
  const when = new Date(ev.event_time || ev.created_at);
  const t = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true, day: "2-digit", month: "short" }).format(when);
  const title = isIn ? "Punched IN ✅" : "Punched OUT 👋";
  const message = `Your punch ${isIn ? "in" : "out"} was recorded at ${t}. ${marker}`;
  const pushed = await pushTo([{ staffId }], { title, body: message, actionUrl: "/?tab=attendance" });
  await record(tenantId, "punch_confirm", "staff", [{ staffId, title, message, type: "punch_confirm", tabId: "attendance" }], pushed);
  return { pushed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method === "GET" && new URL(req.url).searchParams.get("fcm") === "status") {
      return json({ fcm: fcmConfigured() ? "configured" : "missing" });
    }
    if (req.method === "GET") {
      return VAPID_PUBLIC_KEY ? json({ publicKey: VAPID_PUBLIC_KEY, protocol: "web-push-vapid" }) : json({ error: "Push is not configured", status: PUSH_STATUS }, 503);
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === "run_scheduler") {
      const secret = req.headers.get("x-cron-secret");
      const allowed = [Deno.env.get("NOTIFY_SCHEDULER_KEY"), Deno.env.get("NOTIFY_CRON_SECRET")].filter(Boolean);
      if (!secret || !allowed.includes(secret)) {
        return json({ error: "Unauthorized" }, 401);
      }
      return json({ success: true, results: await runScheduler() });
    }


    // Internal dispatch from device-push / device-pull / iclock (service role, server-to-server only).
    const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (action === "punctuality" && bearer && bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      if (typeof body.tenantId !== "string") return json({ error: "tenantId required" }, 400);
      return json({ success: true, ...(await punctuality(body.tenantId, body)) });
    }

    if (action === "register_fcm" || action === "punch_confirm") {
      const who = await getStaffOrUser(req);
      if (!who) return json({ error: "Unauthorized" }, 401);
      if (action === "register_fcm") {
        const r: any = await registerFcm(who, body);
        return r.error ? json({ error: r.error }, r.status) : json({ success: true, ...r });
      }
      // Staff may only confirm their own punch; kiosk/manager sessions may confirm any staff in their tenant.
      if (who.staffId && body?.staffId !== who.staffId) return json({ error: "Forbidden" }, 403);
      return json({ success: true, ...(await punchConfirm(who.tenantId, body)) });
    }
    if (action === "punch_confirm" && bearer && bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      if (typeof body.tenantId !== "string") return json({ error: "tenantId required" }, 400);
      return json({ success: true, ...(await punchConfirm(body.tenantId, body)) });
    }

    const caller = await getCaller(req);
    // Punctuality: any active signed-in user of the tenant (incl. staff portal / kiosk); wording and
    // recipient validation are fixed server-side, so it cannot be abused to message other tenants.
    if (action === "punctuality" && caller?.is_active && caller.tenant_id) {
      return json({ success: true, ...(await punctuality(caller.tenant_id, body)) });
    }
    if (!caller?.is_active || !["admin", "manager", "supervisor", "floor_supervisor"].includes(caller.role)) {
      return json({ error: "Unauthorized" }, 401);
    }
    const tenantId = caller.tenant_id;

    switch (action) {
      case "salary_credit": {
        if (caller.role !== "admin") return json({ error: "Forbidden" }, 403);
        return json({ success: true, ...(await salaryCredit(tenantId, body)) });
      }
      case "uninformed_leave":
        return json({ success: true, ...(await uninformedLeave(tenantId, body)) });
      case "punctuality":
        return json({ success: true, ...(await punctuality(tenantId, body)) });
      case "daily_attendance_test": {
        if (!["admin", "manager"].includes(caller.role)) return json({ error: "Forbidden" }, 403);
        const local = localParts(body.timezone || "Asia/Kolkata");
        return json({ success: true, ...(await dailyAttendanceForTenant(tenantId, body.date || local.date)) });
      }
      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (err) {
    console.error("notifications error:", err);
    return json({ error: (err as Error).message ?? "internal_error" }, 500);
  }
});
