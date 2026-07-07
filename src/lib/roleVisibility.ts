/**
 * Shared role-based UI visibility helpers.
 *
 * These are the single source of truth for "can this role see column X"
 * decisions across tables, dashboards, CSV/PDF exports, and column pickers.
 *
 * Adding a new role-gated column? Add a helper here and consume it in every
 * table/report that renders that column — never inline `role === '...'`
 * checks at the call site.
 */

export type AppRole = 'admin' | 'manager' | 'staff' | 'statutory_admin' | string | undefined;

/**
 * Employee Code is an internal biometric/device identifier. Statutory portal
 * users audit payroll compliance and must not see it in any table, dashboard,
 * CSV, or PDF.
 */
export const canSeeEmployeeCode = (role: AppRole): boolean => {
  return role !== 'statutory_admin';
};

/** Convenience inverse used in JSX. */
export const hideEmployeeCode = (role: AppRole): boolean => !canSeeEmployeeCode(role);
