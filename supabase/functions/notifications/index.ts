import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webPush from "npm:web-push@3.6.7";

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

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails("mailto:admin@staffsync.app", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

type Recipient = { staffId?: string | null; appUserId?: string | null };

async function pushTo(recipients: Recipient[], payload: { title: string; body: string; actionUrl?: string }) {
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
  const monthLabel = payload.monthYear || `${payload.month}/${payload.year}`;
  const { data: staff } = await admin.from("staff").select("id, name")
    .eq("tenant_id", tenantId).eq("is_active", true);
  const list = staff || [];
  const title = "Salary Credited 💸";
  const message = payload.message || `Your salary for ${monthLabel} has been processed and credited.`;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method === "GET") {
      return VAPID_PUBLIC_KEY ? json({ publicKey: VAPID_PUBLIC_KEY }) : json({ error: "Push is not configured" }, 503);
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === "run_scheduler") {
      const secret = req.headers.get("x-cron-secret");
      if (!secret || secret !== Deno.env.get("NOTIFY_CRON_SECRET")) {
        return json({ error: "Unauthorized" }, 401);
      }
      return json({ success: true, results: await runScheduler() });
    }

    const caller = await getCaller(req);
    if (!caller?.is_active || !["admin", "manager", "supervisor", "floor_supervisor"].includes(caller.role)) {
      return json({ error: "Unauthorized" }, 401);
    }
    const tenantId = caller.tenant_id;

    switch (action) {
      case "salary_credit": {
        if (!["admin", "manager"].includes(caller.role)) return json({ error: "Forbidden" }, 403);
        return json({ success: true, ...(await salaryCredit(tenantId, body)) });
      }
      case "uninformed_leave":
        return json({ success: true, ...(await uninformedLeave(tenantId, body)) });
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
