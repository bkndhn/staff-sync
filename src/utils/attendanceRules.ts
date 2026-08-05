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
 *   - Per-location BranchShiftConfig
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
  /** Fraction of daily rate deducted per late arrival */
  lateDeductionRate: number;
  /** Fraction of daily rate deducted per early leave */
  earlyDeductionRate: number;
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
      // Branch doesn't require morning entry for Full Day; fall through to hours check
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

import { type Staff, type Designation, type BranchDesignationShiftConfig } from '../types';

export interface RuleResolutionResult {
  rules: AttendanceRules;
  appliedRuleType: 'staff_override' | 'location_designation' | 'designation_general' | 'location_general' | 'global_fallback';
}

export const resolveActiveRule = (
  staff: Staff,
  locationConfig?: any | null,
  designations: Designation[] = [],
  locationDesignationConfigs: BranchDesignationShiftConfig[] = [],
  globalKioskSettings?: {
    morningCutoff?: string;
    earlyExitTime?: string;
    eveningVerificationTime?: string;
    fullDayRequiresMorning?: boolean;
  } | null
): RuleResolutionResult => {
  // Import DEFAULT_SHIFT_WINDOWS dynamically or handle fallback.
  // Actually, we should just use the passed global fallback if possible, but the original code had hardcoded defaults.
  // Let's rely on DEFAULT_SHIFT_WINDOWS if possible.
  
  // To avoid circular dependency or import issues, let's just construct the fallback manually based on staff.shift
  const shiftKey = staff.shift || 'Both';
  let fallbackStart = '09:00';
  let fallbackEnd = '18:00';
  let fallbackMinFull = 8;
  let fallbackMinHalf = 4;
  let fallbackGraceLate = 15;
  let fallbackGraceEarly = 15;
  
  if (shiftKey === 'Morning') {
    fallbackStart = '10:00'; fallbackEnd = '14:00'; fallbackMinFull = 4; fallbackMinHalf = 2; fallbackGraceLate = 15; fallbackGraceEarly = 15;
  } else if (shiftKey === 'Evening') {
    fallbackStart = '14:00'; fallbackEnd = '21:00'; fallbackMinFull = 6; fallbackMinHalf = 3; fallbackGraceLate = 15; fallbackGraceEarly = 15;
  } else {
    fallbackStart = '10:00'; fallbackEnd = '21:00'; fallbackMinFull = 8; fallbackMinHalf = 4; fallbackGraceLate = 20; fallbackGraceEarly = 20;
  }

  // Default values
  const defaultRules: AttendanceRules = {
    shiftStart: fallbackStart,
    shiftEnd: fallbackEnd,
    graceLateMin: fallbackGraceLate,
    graceEarlyMin: fallbackGraceEarly,
    minHoursFull: fallbackMinFull,
    minHoursHalf: fallbackMinHalf,
    morningCutoff: globalKioskSettings?.morningCutoff || '12:00',
    earlyExitTime: globalKioskSettings?.earlyExitTime || '16:00',
    eveningVerificationTime: globalKioskSettings?.eveningVerificationTime || '18:00',
    fullDayRequiresMorning: globalKioskSettings?.fullDayRequiresMorning !== false,
    lateDeductionRate: 0.5,
    earlyDeductionRate: 0.5,
  };

  // 1) Staff shiftWindow override (highest priority)
  if (staff.shiftWindow && (staff.shiftWindow.start || staff.shiftWindow.end)) {
    return {
      rules: {
        ...defaultRules,
        shiftStart: staff.shiftWindow.start || locationConfig?.shiftStart || defaultRules.shiftStart,
        shiftEnd: staff.shiftWindow.end || locationConfig?.shiftEnd || defaultRules.shiftEnd,
        graceLateMin: staff.shiftWindow.graceLateMin !== undefined ? staff.shiftWindow.graceLateMin : (locationConfig?.graceLateMin ?? defaultRules.graceLateMin),
        graceEarlyMin: staff.shiftWindow.graceEarlyMin !== undefined ? staff.shiftWindow.graceEarlyMin : (locationConfig?.graceEarlyMin ?? defaultRules.graceEarlyMin),
        minHoursFull: staff.shiftWindow.minHoursFull !== undefined ? staff.shiftWindow.minHoursFull : (locationConfig?.minHoursFull ?? defaultRules.minHoursFull),
        minHoursHalf: staff.shiftWindow.minHoursHalf !== undefined ? staff.shiftWindow.minHoursHalf : (locationConfig?.minHoursHalf ?? defaultRules.minHoursHalf),
      },
      appliedRuleType: 'staff_override',
    };
  }

  // Find designation matching staff
  const staffDesignation = designations.find(d => d.displayName === staff.designation || d.name === staff.designation);

  // 2) Branch-Designation Override
  if (staff.location && staffDesignation) {
    const locDesig = locationDesignationConfigs.find(
      c => c.locationName === staff.location && c.designationId === staffDesignation.id
    );
    if (locDesig) {
      const rules: AttendanceRules = {
        shiftStart: locDesig.shiftStart || locationConfig?.shiftStart || staffDesignation.shiftStart || defaultRules.shiftStart,
        shiftEnd: locDesig.shiftEnd || locationConfig?.shiftEnd || staffDesignation.shiftEnd || defaultRules.shiftEnd,
        graceLateMin: locDesig.graceLateMin !== undefined ? locDesig.graceLateMin : (locationConfig?.graceLateMin !== undefined ? locationConfig.graceLateMin : (staffDesignation.graceLateMin ?? defaultRules.graceLateMin)),
        graceEarlyMin: locDesig.graceEarlyMin !== undefined ? locDesig.graceEarlyMin : (locationConfig?.graceEarlyMin !== undefined ? locationConfig.graceEarlyMin : (staffDesignation.graceEarlyMin ?? defaultRules.graceEarlyMin)),
        minHoursFull: locDesig.minHoursFull !== undefined ? locDesig.minHoursFull : (locationConfig?.minHoursFull !== undefined ? locationConfig.minHoursFull : (staffDesignation.minHoursFull ?? defaultRules.minHoursFull)),
        minHoursHalf: locDesig.minHoursHalf !== undefined ? locDesig.minHoursHalf : (locationConfig?.minHoursHalf !== undefined ? locationConfig.minHoursHalf : (staffDesignation.minHoursHalf ?? defaultRules.minHoursHalf)),
        morningCutoff: locDesig.morningCutoff || locationConfig?.morningCutoff || staffDesignation.morningCutoff || defaultRules.morningCutoff,
        earlyExitTime: locDesig.earlyExitTime || locationConfig?.earlyExitTime || staffDesignation.earlyExitTime || defaultRules.earlyExitTime,
        eveningVerificationTime: locDesig.eveningVerificationTime || locationConfig?.eveningVerificationTime || staffDesignation.eveningVerificationTime || defaultRules.eveningVerificationTime,
        fullDayRequiresMorning: locDesig.fullDayRequiresMorning !== undefined ? locDesig.fullDayRequiresMorning : (locationConfig?.fullDayRequiresMorning !== undefined ? locationConfig.fullDayRequiresMorning : (staffDesignation.fullDayRequiresMorning ?? defaultRules.fullDayRequiresMorning)),
        lateDeductionRate: locDesig.lateDeductionRate !== undefined ? locDesig.lateDeductionRate : (staffDesignation.lateDeductionRate !== undefined ? staffDesignation.lateDeductionRate : defaultRules.lateDeductionRate),
        earlyDeductionRate: locDesig.earlyDeductionRate !== undefined ? locDesig.earlyDeductionRate : (staffDesignation.earlyDeductionRate !== undefined ? staffDesignation.earlyDeductionRate : defaultRules.earlyDeductionRate),
      };
      return { rules, appliedRuleType: 'location_designation' };
    }
  }

  // 3) Branch General Rule
  if (locationConfig && (locationConfig.shiftStart || locationConfig.shiftEnd)) {
    const rules: AttendanceRules = {
      shiftStart: locationConfig.shiftStart || defaultRules.shiftStart,
      shiftEnd: locationConfig.shiftEnd || defaultRules.shiftEnd,
      graceLateMin: locationConfig.graceLateMin !== undefined ? locationConfig.graceLateMin : defaultRules.graceLateMin,
      graceEarlyMin: locationConfig.graceEarlyMin !== undefined ? locationConfig.graceEarlyMin : defaultRules.graceEarlyMin,
      minHoursFull: locationConfig.minHoursFull !== undefined ? locationConfig.minHoursFull : defaultRules.minHoursFull,
      minHoursHalf: locationConfig.minHoursHalf !== undefined ? locationConfig.minHoursHalf : defaultRules.minHoursHalf,
      morningCutoff: locationConfig.morningCutoff || defaultRules.morningCutoff,
      earlyExitTime: locationConfig.earlyExitTime || defaultRules.earlyExitTime,
      eveningVerificationTime: locationConfig.eveningVerificationTime || defaultRules.eveningVerificationTime,
      fullDayRequiresMorning: locationConfig.fullDayRequiresMorning !== undefined ? locationConfig.fullDayRequiresMorning : defaultRules.fullDayRequiresMorning,
      lateDeductionRate: defaultRules.lateDeductionRate,
      earlyDeductionRate: defaultRules.earlyDeductionRate,
    };
    return { rules, appliedRuleType: 'location_general' };
  }

  // 4) Designation Rule
  if (staffDesignation) {
    if (staffDesignation.shiftStart || staffDesignation.shiftEnd) {
      const rules: AttendanceRules = {
        shiftStart: staffDesignation.shiftStart || defaultRules.shiftStart,
        shiftEnd: staffDesignation.shiftEnd || defaultRules.shiftEnd,
        graceLateMin: staffDesignation.graceLateMin !== undefined ? staffDesignation.graceLateMin : defaultRules.graceLateMin,
        graceEarlyMin: staffDesignation.graceEarlyMin !== undefined ? staffDesignation.graceEarlyMin : defaultRules.graceEarlyMin,
        minHoursFull: staffDesignation.minHoursFull !== undefined ? staffDesignation.minHoursFull : defaultRules.minHoursFull,
        minHoursHalf: staffDesignation.minHoursHalf !== undefined ? staffDesignation.minHoursHalf : defaultRules.minHoursHalf,
        morningCutoff: staffDesignation.morningCutoff || defaultRules.morningCutoff,
        earlyExitTime: staffDesignation.earlyExitTime || defaultRules.earlyExitTime,
        eveningVerificationTime: staffDesignation.eveningVerificationTime || defaultRules.eveningVerificationTime,
        fullDayRequiresMorning: staffDesignation.fullDayRequiresMorning !== undefined ? staffDesignation.fullDayRequiresMorning : defaultRules.fullDayRequiresMorning,
        lateDeductionRate: staffDesignation.lateDeductionRate !== undefined ? staffDesignation.lateDeductionRate : defaultRules.lateDeductionRate,
        earlyDeductionRate: staffDesignation.earlyDeductionRate !== undefined ? staffDesignation.earlyDeductionRate : defaultRules.earlyDeductionRate,
      };
      return { rules, appliedRuleType: 'designation_general' };
    }
  }

  // 5) Global Fallback
  return {
    rules: defaultRules,
    appliedRuleType: 'global_fallback',
  };
};

/**
 * Convert a BranchShiftConfig (or per-staff shiftWindow override) to AttendanceRules.
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
  morningCutoff: locationConfig.morningCutoff,
  earlyExitTime: locationConfig.earlyExitTime,
  eveningVerificationTime: locationConfig.eveningVerificationTime,
  fullDayRequiresMorning: locationConfig.fullDayRequiresMorning,
  lateDeductionRate: 0.5,
  earlyDeductionRate: 0.5,
});
