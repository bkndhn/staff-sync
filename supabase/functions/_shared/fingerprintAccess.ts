// Pure access rules for fingerprint keys (no Deno APIs, so the app's tests can import it).
export const FP_ENROLLERS = ["admin", "manager", "super_admin"];
export const FP_STATIONS = ["admin", "manager", "supervisor", "floor_supervisor", "super_admin"];
const COMPANY_WIDE = ["admin", "super_admin"];

export type FpCaller = { role: string; tenantId: string | null; location: string | null };
export type FpStaff = { tenantId: string | null; location: string | null; isActive?: boolean | null };

/** May this person enrol, test or revoke keys for this staff member? Company, then role, then branch. */
export function canManageKeyFor(c: FpCaller, s: FpStaff | null): { ok: boolean; reason?: string } {
  if (!s || !c.tenantId || s.tenantId !== c.tenantId) return { ok: false, reason: "Staff not found" };
  if (!FP_ENROLLERS.includes(c.role)) return { ok: false, reason: "Only admins/managers can manage fingerprint keys" };
  if (COMPANY_WIDE.includes(c.role)) return { ok: true };
  if (!c.location) return { ok: false, reason: "You are not assigned to a location" };
  if (s.location !== c.location) return { ok: false, reason: "Staff member is outside your location" };
  return { ok: true };
}

/** A test touch only proves identity; it must never lead to attendance or punch writes. */
export const testTouchWrites = (test: unknown): boolean => test !== true;
