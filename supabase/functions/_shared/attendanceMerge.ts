// Shared attendance merge engine for every biometric channel (device-push,
// iclock ADMS, device-pull). Guarantees ONE attendance row per staff/day and
// merges device punches with manual / kiosk / auto-OUT times without duplication.
// deno-lint-ignore-file no-explicit-any

export interface HoursRule { enabled: boolean; fullDayHours: number; autoOut: boolean }

const DEFAULT_RULE: HoursRule = { enabled: false, fullDayHours: 8, autoOut: true };

export async function loadHoursRule(admin: any, tenantId?: string | null): Promise<HoursRule> {
  try {
    let q = admin.from("app_settings").select("value").eq("key", "hours_based_attendance");
    if (tenantId) q = q.eq("tenant_id", tenantId);
    const { data } = await q.limit(1).maybeSingle();
    if (!data?.value) return DEFAULT_RULE;
    const v = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
    return { ...DEFAULT_RULE, ...v };
  } catch { return DEFAULT_RULE; }
}

const toMin = (t?: string | null) => {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return isNaN(h) ? null : h * 60 + (m || 0);
};
const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function hoursToStatus(workedMin: number, fullDayHours: number) {
  const full = fullDayHours * 60;
  if (workedMin >= full) return { status: "Present", value: 1 };
  if (workedMin >= full * 0.75) return { status: "3/4 Day", value: 0.75 };
  if (workedMin >= full * 0.5) return { status: "Half Day", value: 0.5 };
  return { status: "Absent", value: 0 };
}

export async function mergeAttendance(admin: any, p: {
  staffId: string; date: string; staffName: string; location?: string | null;
  floor?: string | null; tenantId?: string | null;
}): Promise<boolean> {
  const { data: punches } = await admin.from("punch_events").select("event_time, kind")
    .eq("staff_id", p.staffId).eq("date", p.date).order("event_time", { ascending: true });
  const { data: existing } = await admin.from("attendance").select("*")
    .eq("staff_id", p.staffId).eq("date", p.date).eq("is_part_time", false).maybeSingle();

  const punchMins = (punches ?? []).map((r: any) => toMin(r.event_time)).filter((v: any) => v !== null) as number[];
  if (punchMins.length === 0 && !existing) return false;

  const details = (existing?.applied_rule_details ?? {}) as any;
  const existingAutoOut = !!details.auto_out;

  // Manual admin lock: never overwrite a salary-overridden row.
  if (existing?.salary_override) return false;

  // IN = earliest of any source (manual, kiosk, device). OUT = latest REAL punch
  // after IN; an auto-generated OUT is always superseded by a real one.
  const candidatesIn = [...punchMins];
  const exIn = toMin(existing?.arrival_time);
  if (exIn !== null) candidatesIn.push(exIn);
  const inMin = Math.min(...candidatesIn);

  const candidatesOut = punchMins.filter((m) => m - inMin >= 5); // ignore double taps
  const exOut = toMin(existing?.leaving_time);
  if (exOut !== null && !existingAutoOut && exOut - inMin >= 5) candidatesOut.push(exOut);
  let outMin: number | null = candidatesOut.length ? Math.max(...candidatesOut) : null;
  let autoOut = false;

  const cfg: any = await loadHoursRule(admin, p.tenantId);
  const o = cfg.overrides?.[p.staffId];
  const rule = o?.mode === "standard" ? { ...cfg, enabled: false }
    : o?.mode === "hours" ? { ...cfg, enabled: true, fullDayHours: Number(o.fullDayHours) || cfg.fullDayHours }
    : cfg;
  if (outMin === null && existingAutoOut && exOut !== null) { outMin = exOut; autoOut = true; }

  let status = outMin === null ? "Pending Full Day" : (existing?.status && existing.status !== "Absent" ? existing.status : "Present");
  let value = outMin === null ? 1 : (existing?.attendance_value ?? 1);
  if (rule.enabled && outMin !== null) {
    const worked = outMin - inMin - (existing?.break_minutes || 0);
    const r = hoursToStatus(worked, rule.fullDayHours);
    status = r.status; value = r.value;
  }

  const { error } = await admin.from("attendance").upsert({
    staff_id: p.staffId,
    staff_name: existing?.staff_name || p.staffName,
    date: p.date,
    status,
    attendance_value: value,
    location: existing?.location || p.location || null,
    floor: existing?.floor || p.floor || null,
    arrival_time: fromMin(inMin),
    leaving_time: outMin === null ? null : fromMin(outMin),
    is_part_time: false,
    applied_rule_type: rule.enabled ? "hours_based" : (existing?.applied_rule_type ?? null),
    applied_rule_details: { ...details, auto_out: autoOut, merged_sources: true },
    ...(p.tenantId ? { tenant_id: p.tenantId } : {}),
  }, { onConflict: "staff_id,date,is_part_time" });
  if (error) console.error("mergeAttendance upsert", error);
  if (!error && !rule.enabled && p.tenantId) {
    await dispatchPunctuality(p.tenantId, p.staffId, p.date, details, inMin, autoOut ? null : outMin);
  }
  return !error;
}

// Server-side late/early alerts for device punches. The notifications function dedups per staff/date/kind.
async function dispatchPunctuality(tenantId: string, staffId: string, date: string, d: any, inMin: number, outMin: number | null) {
  const start = toMin(d?.shiftStart || d?.start), end = toMin(d?.shiftEnd || d?.end);
  const graceL = Number(d?.graceLateMin ?? 15), graceE = Number(d?.graceEarlyMin ?? 15);
  const jobs: any[] = [];
  if (start !== null && inMin - start > graceL) jobs.push({ kind: "late_arrival", minutes: inMin - start, time: fromMin(inMin) });
  if (end !== null && outMin !== null && end - outMin > graceE) jobs.push({ kind: "early_leave", minutes: end - outMin, time: fromMin(outMin) });
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;
  for (const j of jobs) {
    try {
      await fetch(`${url}/functions/v1/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, apikey: key },
        body: JSON.stringify({ action: "punctuality", tenantId, staffId, date, ...j }),
      });
    } catch (e) { console.error("punctuality dispatch", e); }
  }
}
