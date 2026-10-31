// Timed phone alerts: runs on the server every 15 minutes (database timer), so alerts arrive
// at the chosen times even when nobody has the app open.
// deno-lint-ignore-file no-explicit-any
import {
  type AlertSchedule,
  type DueSlot,
  dueSlots,
  localMidnightUtc,
  localNow,
  STAFF_KINDS,
  to12h,
} from "../_shared/alertSlots.ts";
import type { MuteKind } from "../_shared/fcm.ts";

type Recipient = { staffId?: string | null; appUserId?: string | null };
type Push = (r: Recipient[], p: { title: string; body: string; actionUrl?: string }, kind?: MuteKind) => Promise<number>;
type Record = (
  tenantId: string, category: string, audience: string,
  rows: Array<{ staffId?: string | null; appUserId?: string | null; title: string; message: string; type: string; actionUrl?: string; tabId?: string }>,
  pushCount: number,
) => Promise<void>;

const DEFAULT_SHIFT = { start: "09:00", end: "18:00" };
const isIn = (k: string) => { const v = String(k || "").toLowerCase(); return v === "in" || v.endsWith("_in") || v === "check_in"; };
const isOut = (k: string) => { const v = String(k || "").toLowerCase(); return v === "out" || v.endsWith("_out") || v === "check_out"; };

async function todayState(admin: any, tenantId: string, tz: string, date: string) {
  const since = localMidnightUtc(tz).toISOString();
  const [{ data: staff }, { data: punches }, { data: att }] = await Promise.all([
    admin.from("staff").select("id, name, location").eq("tenant_id", tenantId).eq("is_active", true).limit(5000),
    admin.from("punch_events").select("staff_id, kind, event_time, created_at").eq("tenant_id", tenantId)
      .gte("created_at", since).order("created_at", { ascending: true }).limit(20000),
    admin.from("attendance").select("staff_id, attendance_value").eq("tenant_id", tenantId).eq("date", date).limit(5000),
  ]);
  const lastKind = new Map<string, "in" | "out">();
  const everIn = new Set<string>();
  for (const p of punches || []) {
    if (isIn(p.kind)) { lastKind.set(p.staff_id, "in"); everIn.add(p.staff_id); }
    else if (isOut(p.kind)) lastKind.set(p.staff_id, "out");
  }
  const marked = new Set<string>((att || []).filter((a: any) => (a.attendance_value ?? 0) > 0).map((a: any) => a.staff_id));
  return { staff: (staff || []) as Array<{ id: string; name: string; location: string | null }>, lastKind, everIn, marked };
}

async function managersFor(admin: any, tenantId: string, roles: string[]) {
  const { data } = await admin.from("app_users").select("id, role, location")
    .eq("tenant_id", tenantId).eq("is_active", true).in("role", roles.length ? roles : ["admin", "manager"]);
  return (data || []) as Array<{ id: string; role: string; location: string | null }>;
}

/** Groups managers by what they may see: admins (and people with no branch) see all, others their branch. */
function byScope(users: Array<{ id: string; role: string; location: string | null }>) {
  const groups = new Map<string, string[]>();
  for (const u of users) {
    const key = u.role === "admin" || !u.location ? "*" : u.location;
    groups.set(key, [...(groups.get(key) || []), u.id]);
  }
  return groups;
}

async function sendManagerAlert(ctx: Ctx, s: AlertSchedule & { audience_roles: string[] }, slot: DueSlot) {
  const { admin, tenantId, tz, now } = ctx;
  const users = await managersFor(admin, tenantId, s.audience_roles || []);
  if (!users.length) return { recipients: 0, pushed: 0 };
  const groups = byScope(users);
  let recipients = 0, pushed = 0;

  const state = (s.kind === "attendance_summary" || s.kind === "mark_attendance")
    ? await todayState(admin, tenantId, tz, now.date) : null;
  let pendingLeaves: Array<{ location: string | null }> = [];
  if (s.kind === "leave_pending") {
    const { data } = await admin.from("leave_requests").select("location").eq("tenant_id", tenantId).eq("status", "pending").limit(2000);
    pendingLeaves = data || [];
  }

  for (const [scope, ids] of groups) {
    let title = "", message = "", tab = "attendance";
    if (state) {
      const list = state.staff.filter((st) => scope === "*" || st.location === scope);
      const present = list.filter((st) => state.everIn.has(st.id) || state.marked.has(st.id)).length;
      const out = list.filter((st) => state.lastKind.get(st.id) === "out").length;
      const notIn = list.length - present;
      const where = scope === "*" ? "" : ` at ${scope}`;
      if (s.kind === "attendance_summary") {
        title = `Attendance at ${to12h(slot.target)} 📋`;
        message = `${present} of ${list.length} staff in${where}, ${notIn} not in yet, ${out} punched out.`;
      } else {
        if (notIn === 0) continue; // nothing to check
        title = "Please check attendance ✅";
        message = `${notIn} of ${list.length} staff${where} have no attendance yet today. Please check and mark it.`;
      }
    } else if (s.kind === "leave_pending") {
      const n = pendingLeaves.filter((l) => scope === "*" || l.location === scope).length;
      if (n === 0) continue;
      title = "Leave requests waiting ⏳";
      message = `${n} leave request${n > 1 ? "s are" : " is"} waiting for your decision.`;
      tab = "leave";
    } else if (s.kind === "salary_prep") {
      title = "Salary preparation 💼";
      message = "Time to prepare salary: check attendance, advances, loans and overrides, then run payroll.";
      tab = "salary";
    } else continue;

    const actionUrl = `/?tab=${tab}`;
    const p = await ctx.push(ids.map((id) => ({ appUserId: id })), { title, body: message, actionUrl }, "report");
    await ctx.record(tenantId, `scheduled_${s.kind}`, "managers",
      ids.map((id) => ({ appUserId: id, title, message, type: s.kind, tabId: tab })), p);
    recipients += ids.length; pushed += p;
  }
  return { recipients, pushed };
}

async function sendStaffReminder(ctx: Ctx, s: AlertSchedule, slot: DueSlot) {
  const { admin, tenantId, tz, now, shiftOf } = ctx;
  const state = await todayState(admin, tenantId, tz, now.date);
  const wantIn = s.kind === "punch_in_reminder";
  const targets = state.staff.filter((st) => {
    if (slot.shift) {
      const sh = shiftOf(st.location);
      if ((wantIn ? sh.start : sh.end) !== slot.shift) return false;
    }
    return wantIn
      ? !state.everIn.has(st.id) && !state.marked.has(st.id)
      : state.lastKind.get(st.id) === "in";
  });
  if (!targets.length) return { recipients: 0, pushed: 0 };
  const title = wantIn ? "Time to punch IN ⏰" : "Time to punch OUT 👋";
  const message = slot.shift
    ? `Your shift ${wantIn ? "starts" : "ends"} at ${to12h(slot.shift)}. Remember to punch ${wantIn ? "in" : "out"}.`
    : `Reminder: please punch ${wantIn ? "in" : "out"} for today.`;
  const pushed = await ctx.push(targets.map((t) => ({ staffId: t.id })), { title, body: message, actionUrl: "/?tab=attendance" }, "reminder");
  await ctx.record(tenantId, `scheduled_${s.kind}`, "staff",
    targets.map((t) => ({ staffId: t.id, title, message, type: s.kind, tabId: "attendance" })), pushed);
  return { recipients: targets.length, pushed };
}

type Ctx = {
  admin: any; tenantId: string; tz: string; now: ReturnType<typeof localNow>;
  push: Push; record: Record; shiftOf: (loc: string | null) => { start: string; end: string };
};

export async function runAlertSchedules(admin: any, push: Push, record: Record) {
  const { data: schedules, error } = await admin.from("alert_schedules").select("*").eq("enabled", true).limit(2000);
  if (error) { console.error("alert_schedules read failed:", error.message); return []; }
  const byTenant = new Map<string, any[]>();
  for (const s of schedules || []) byTenant.set(s.tenant_id, [...(byTenant.get(s.tenant_id) || []), s]);

  const results: any[] = [];
  for (const [tenantId, list] of byTenant) {
    try {
      const { data: pref } = await admin.from("notification_preferences").select("timezone").eq("tenant_id", tenantId).maybeSingle();
      const tz = pref?.timezone || "Asia/Kolkata";
      const now = localNow(tz);
      const { data: shifts } = await admin.from("location_shift_config").select("location_name, shift_start, shift_end").eq("tenant_id", tenantId);
      const shiftMap = new Map<string, { start: string; end: string }>();
      for (const sh of shifts || []) shiftMap.set(sh.location_name, { start: String(sh.shift_start || DEFAULT_SHIFT.start).slice(0, 5), end: String(sh.shift_end || DEFAULT_SHIFT.end).slice(0, 5) });
      const shiftOf = (loc: string | null) => (loc && shiftMap.get(loc)) || DEFAULT_SHIFT;
      const starts = [...new Set([...shiftMap.values()].map((v) => v.start).concat(DEFAULT_SHIFT.start))];
      const ends = [...new Set([...shiftMap.values()].map((v) => v.end).concat(DEFAULT_SHIFT.end))];
      const ctx: Ctx = { admin, tenantId, tz, now, push, record, shiftOf };

      for (const s of list as Array<AlertSchedule & { audience_roles: string[] }>) {
        const slots = dueSlots(s, now, s.kind === "punch_in_reminder" ? starts : s.kind === "punch_out_reminder" ? ends : []);
        for (const slot of slots) {
          // Claim the slot first: a second timer tick (or a retry) can never send it twice.
          const { error: claimErr } = await admin.from("alert_runs").insert({ tenant_id: tenantId, schedule_id: s.id, slot_key: slot.slotKey });
          if (claimErr) continue;
          const r = STAFF_KINDS.includes(s.kind) ? await sendStaffReminder(ctx, s, slot) : await sendManagerAlert(ctx, s, slot);
          await admin.from("alert_runs").update({ recipients: r.recipients, pushed: r.pushed })
            .eq("schedule_id", s.id).eq("slot_key", slot.slotKey);
          results.push({ tenant_id: tenantId, kind: s.kind, slot: slot.slotKey, ...r });
        }
      }
    } catch (e) {
      console.error("scheduled alerts failed for tenant", tenantId, (e as Error).message);
    }
  }
  // Keep the run log small: drop entries older than 14 days.
  await admin.from("alert_runs").delete().lt("created_at", new Date(Date.now() - 14 * 86400_000).toISOString());
  return results;
}
