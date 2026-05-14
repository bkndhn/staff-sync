/**
 * Smart Attendance Rules Engine
 * ─────────────────────────────
 * Implements the following configurable logic:
 *
 *   1. No arrival punch → Absent
 *   2. Arrival BEFORE morningCutoff (morning entry):
 *      a. No OUT punch yet → Full Day (staff still present or went home without punching)
 *      b. OUT recorded BEFORE earlyExitTime → Half Day (left too early)
 *      c. OUT recorded AFTER earlyExitTime → Full Day (completed the day)
 *   3. Arrival AFTER morningCutoff (evening-only entry) → Half Day
 *   4. Worked-hours safety net (secondary check, applied after rule 2/3):
 *      - Worked < minHoursHalf → Absent
 *      - Worked < minHoursFull → cap at Half Day
 *
 * All configurable thresholds are passed as `rules` from either:
 *   - Per-staff shiftWindow override (highest priority)
 *   - Per-location LocationShiftConfig
 *   - Global app_settings defaults
 */

import { parseHHMM, minutesBetween } from '../services/shiftService';

export interface AttendanceRules {
  /** Shift official start time HH:MM */
  shiftStart: string;
  /** Shift official end time HH:MM */
  shiftEnd: string;
  /** Minutes late before Half Day penalty applies */
  graceLateMin: number;
  /** Minutes early-leave before Half Day penalty applies */
  graceEarlyMin: number;
  /** Hours worked needed for Full Day */
  minHoursFull: number;
  /** Hours worked needed for at least Half Day (below = Absent) */
  minHoursHalf: number;
  /**
   * HH:MM — arrivals BEFORE this time are "morning arrivals"
   * and get Full Day treatment by default.
   */
  morningCutoff: string;
  /**
   * HH:MM — if a morning-arrival staff punches OUT before this
   * time, status is downgraded to Half Day.
   */
  earlyExitTime: string;
  /**
   * If true, staff must arrive before morningCutoff to be
   * eligible for Full Day. Arrival after cutoff → Half Day.
   */
  fullDayRequiresMorning: boolean;
  /** Evening threshold to finalize Pending Full Day to Full Day */
  eveningVerificationTime: string;
}

export type AttendanceStatus = 'Present' | 'Half Day' | 'Absent' | 'Pending Full Day' | 'Manual Override';

export interface AttendanceDecision {
  status: AttendanceStatus;
  attendanceValue: number; // 1 | 0.5 | 0
  reasons: string[];
}

/**
 * Main attendance calculation function.
 * Pure function — no side effects, fully testable.
 */
export const calculateAttendanceStatus = (
  arrivalTime: string | undefined | null,
  leavingTime: string | undefined | null,
  rules: AttendanceRules,
): AttendanceDecision => {
  const reasons: string[] = [];

  // ── Rule 1: No arrival → Absent ──────────────────────────────────────────
  if (!arrivalTime) {
    return { status: 'Absent', attendanceValue: 0, reasons: ['No arrival punch recorded'] };
  }

  const arrMins = parseHHMM(arrivalTime);
  if (arrMins === null) {
    return { status: 'Absent', attendanceValue: 0, reasons: ['Invalid arrival time'] };
  }

  const cutoffMins = parseHHMM(rules.morningCutoff)!;
  const earlyExitMins = rules.earlyExitTime ? parseHHMM(rules.earlyExitTime) : null;
  const leavMins = leavingTime ? parseHHMM(leavingTime) : null;

  const eveningVerificationMins = rules.eveningVerificationTime ? parseHHMM(rules.eveningVerificationTime) : null;

  let status: AttendanceStatus;

  // ── Rule 2: Morning arrival (before cutoff) ───────────────────────────────
  if (arrMins < cutoffMins) {
    if (leavMins !== null) {
      if (earlyExitMins !== null && leavMins < earlyExitMins) {
        // LEFT before earlyExitTime → downgrade to Half Day
        const earlyBy = earlyExitMins - leavMins;
        status = 'Half Day';
        reasons.push(`Left ${earlyBy} min before early-exit threshold (${rules.earlyExitTime})`);
      } else {
        // Stayed past earlyExitTime
        status = 'Present';
      }
    } else {
      // No OUT punch yet
      const now = new Date();
      const currentMins = now.getHours() * 60 + now.getMinutes();
      
      if (eveningVerificationMins !== null && currentMins >= eveningVerificationMins) {
        // Evening threshold reached and no OUT punch found
        status = 'Present';
        reasons.push(`Evening verification threshold (${rules.eveningVerificationTime}) reached without OUT punch`);
      } else {
        // Still before evening threshold, hold as pending
        status = 'Pending Full Day';
        reasons.push(`Awaiting evening verification threshold (${rules.eveningVerificationTime})`);
      }
    }

  } else {
    // ── Rule 3: Evening-only arrival (after cutoff) → Half Day ───────────────
    if (rules.fullDayRequiresMorning) {
      status = 'Half Day';
      reasons.push(`Arrived after morning cutoff (${rules.morningCutoff}) — counted as Half Day`);
    } else {
      // Location doesn't require morning entry for Full Day; fall through to hours check
      // For now, if they don't have an OUT punch, treat as Pending Full Day if before evening
      if (leavMins === null) {
        const now = new Date();
        const currentMins = now.getHours() * 60 + now.getMinutes();
        if (eveningVerificationMins !== null && currentMins >= eveningVerificationMins) {
          status = 'Present';
        } else {
          status = 'Pending Full Day';
        }
      } else {
        status = 'Present';
      }
    }
  }

  // ── Rule 4: Worked-hours safety net (only when OUT is recorded) ───────────
  if (leavMins !== null && arrMins !== null) {
    const workedMins = minutesBetween(arrivalTime, leavingTime!);
    const workedHours = workedMins / 60;

    if (workedHours < rules.minHoursHalf) {
      status = 'Absent';
      reasons.push(`Worked only ${workedHours.toFixed(1)}h (< ${rules.minHoursHalf}h minimum)`);
    } else if (workedHours < rules.minHoursFull && status === 'Present') {
      status = 'Half Day';
      reasons.push(`Worked ${workedHours.toFixed(1)}h (< ${rules.minHoursFull}h for Full Day)`);
    }
  }

  const attendanceValue = status === 'Present' ? 1 : status === 'Half Day' ? 0.5 : status === 'Pending Full Day' ? 1 : 0;
  return { status, attendanceValue, reasons };
};

/**
 * Convert a LocationShiftConfig (or per-staff shiftWindow override) to AttendanceRules.
 * Priority: staffWindow override > locationConfig > hardcoded fallback.
 */
export const resolveAttendanceRules = (
  locationConfig: {
    shiftStart: string;
    shiftEnd: string;
    graceLateMin: number;
    graceEarlyMin: number;
    minHoursFull: number;
    minHoursHalf: number;
    morningCutoff: string;
    earlyExitTime: string;
    eveningVerificationTime: string;
    fullDayRequiresMorning: boolean;
  },
  staffOverride?: {
    start?: string;
    end?: string;
    graceLateMin?: number;
    graceEarlyMin?: number;
    minHoursFull?: number;
    minHoursHalf?: number;
  } | null,
): AttendanceRules => ({
  shiftStart: staffOverride?.start ?? locationConfig.shiftStart,
  shiftEnd: staffOverride?.end ?? locationConfig.shiftEnd,
  graceLateMin: staffOverride?.graceLateMin ?? locationConfig.graceLateMin,
  graceEarlyMin: staffOverride?.graceEarlyMin ?? locationConfig.graceEarlyMin,
  minHoursFull: staffOverride?.minHoursFull ?? locationConfig.minHoursFull,
  minHoursHalf: staffOverride?.minHoursHalf ?? locationConfig.minHoursHalf,
  // Morning/evening cutoffs are location-level only (not per-staff)
  morningCutoff: locationConfig.morningCutoff,
  earlyExitTime: locationConfig.earlyExitTime,
  eveningVerificationTime: locationConfig.eveningVerificationTime,
  fullDayRequiresMorning: locationConfig.fullDayRequiresMorning,
});
