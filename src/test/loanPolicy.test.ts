import { describe, it, expect } from "vitest";
import {
  DEFAULT_LOAN_THRESHOLDS,
  evaluateLoanDelete,
  evaluateLoanUpdate,
  parseThresholds,
  requiredLevels,
  sanitizeLoanInsert,
} from "../../supabase/functions/data-api/loanPolicy";

const T = DEFAULT_LOAN_THRESHOLDS;

describe("loan insert policy", () => {
  it("forces a staff request onto its own staff_id", () => {
    const res = sanitizeLoanInsert(
      [{ staff_id: "someone-else", amount: 5000, emi_months: 5, status: "approved" }],
      { role: "staff", userId: "staff-1", thresholds: T },
    );
    expect(res.ok).toBe(true);
    expect(res.rows[0].staff_id).toBe("staff-1");
  });

  it("never lets a submitted request start approved", () => {
    const res = sanitizeLoanInsert(
      [{ amount: 5000, emi_months: 2, status: "approved", current_approval_level: 9, approved_at: "now" }],
      { role: "staff", userId: "staff-1", thresholds: T },
    );
    expect(res.rows[0].status).toBe("pending");
    expect(res.rows[0].current_approval_level).toBe(1);
    expect(res.rows[0].approved_at).toBeNull();
  });

  it("stamps the required approval levels from the amount", () => {
    const small = sanitizeLoanInsert([{ amount: T.managerMaxAmount, emi_months: 1 }], { role: "staff", userId: "s", thresholds: T });
    const big = sanitizeLoanInsert([{ amount: T.managerMaxAmount + 1, emi_months: 1 }], { role: "staff", userId: "s", thresholds: T });
    expect(small.rows[0].required_approval_levels).toBe(1);
    expect(big.rows[0].required_approval_levels).toBe(2);
    expect(requiredLevels(T.managerMaxAmount + 1, T)).toBe(2);
  });

  it("rejects amounts above the ceiling and bad EMI plans", () => {
    expect(sanitizeLoanInsert([{ amount: T.adminMaxAmount + 1, emi_months: 1 }], { role: "staff", userId: "s", thresholds: T }).ok).toBe(false);
    expect(sanitizeLoanInsert([{ amount: 0, emi_months: 1 }], { role: "staff", userId: "s", thresholds: T }).ok).toBe(false);
    expect(sanitizeLoanInsert([{ amount: 1000, emi_months: 99 }], { role: "staff", userId: "s", thresholds: T }).ok).toBe(false);
  });
});

describe("loan update policy — manager", () => {
  const pending = (amount: number, level = 1) => ({
    id: "l1", amount, status: "pending", current_approval_level: level,
    required_approval_levels: requiredLevels(amount, T),
  });

  it("lets a manager approve within their threshold", () => {
    const res = evaluateLoanUpdate({ role: "manager", loan: pending(5000), values: { status: "approved" }, thresholds: T });
    expect(res.ok).toBe(true);
  });

  it("blocks a manager approving above their threshold", () => {
    const res = evaluateLoanUpdate({ role: "manager", loan: pending(50000), values: { status: "approved" }, thresholds: T });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/admin/i);
  });

  it("blocks a manager acting on a second-level loan", () => {
    const res = evaluateLoanUpdate({ role: "manager", loan: pending(50000, 2), values: { status: "approved" }, thresholds: T });
    expect(res.ok).toBe(false);
  });

  it("blocks a manager rewriting sanctioned terms", () => {
    const res = evaluateLoanUpdate({ role: "manager", loan: pending(5000), values: { amount: 90000 }, thresholds: T });
    expect(res.ok).toBe(false);
  });

  it("blocks a manager reopening a decided loan", () => {
    const res = evaluateLoanUpdate({
      role: "manager",
      loan: { ...pending(5000), status: "rejected" },
      values: { status: "approved" },
      thresholds: T,
    });
    expect(res.ok).toBe(false);
  });
});

describe("loan update policy — admin & staff", () => {
  const loan = { id: "l1", amount: 50000, status: "pending", current_approval_level: 2, required_approval_levels: 2 };

  it("lets an admin approve a second-level loan", () => {
    expect(evaluateLoanUpdate({ role: "admin", loan, values: { status: "approved" }, thresholds: T }).ok).toBe(true);
  });

  it("still enforces the hard ceiling on admins", () => {
    const res = evaluateLoanUpdate({
      role: "admin",
      loan: { ...loan, amount: T.adminMaxAmount + 1 },
      values: { status: "approved" },
      thresholds: T,
    });
    expect(res.ok).toBe(false);
  });

  it("requires a reason on rejection", () => {
    expect(evaluateLoanUpdate({ role: "admin", loan, values: { status: "rejected" }, thresholds: T }).ok).toBe(false);
    expect(evaluateLoanUpdate({ role: "admin", loan, values: { status: "rejected", rejection_reason: "no" }, thresholds: T }).ok).toBe(true);
  });

  it("never lets staff update or delete", () => {
    expect(evaluateLoanUpdate({ role: "staff", loan, values: { status: "approved" }, thresholds: T }).ok).toBe(false);
    expect(evaluateLoanDelete("staff").ok).toBe(false);
    expect(evaluateLoanDelete("manager").ok).toBe(false);
    expect(evaluateLoanDelete("admin").ok).toBe(true);
  });
});

describe("threshold parsing", () => {
  it("falls back to defaults on bad input", () => {
    expect(parseThresholds("{oops")).toEqual(T);
    expect(parseThresholds(null)).toEqual(T);
    expect(parseThresholds('{"managerMaxAmount":2500}').managerMaxAmount).toBe(2500);
  });
});
