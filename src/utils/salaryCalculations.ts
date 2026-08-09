import { Staff, Attendance, AdvanceDeduction, PartTimeSalaryDetail, WeeklySalary, DailySalary } from '../types';
import { AdvanceEntry } from '../services/advanceEntryService';
import { PartTimeRates, DEFAULT_PART_TIME_RATES } from '../services/settingsService';
import { DEFAULT_SHIFT_WINDOWS, parseHHMM, minutesBetween } from '../services/shiftService';

// Round to nearest 10
export const roundToNearest10 = (value: number): number => {
  return Math.round(value / 10) * 10;
};

// Check if date is Sunday
export const isSunday = (dateString: string): boolean => {
  const date = new Date(dateString);
  return date.getDay() === 0;
};

// Get days in month
export const getDaysInMonth = (year: number, month: number): number => {
  return new Date(year, month + 1, 0).getDate();
};

// Calculate experience from joined date
export const calculateExperience = (joinedDate: string): string => {
  const joined = new Date(joinedDate);
  const now = new Date();

  let years = now.getFullYear() - joined.getFullYear();
  let months = now.getMonth() - joined.getMonth();

  if (months < 0) {
    years--;
    months += 12;
  }

  return `${years}y ${months}m`;
};

// Get part-time salary based on day and override

export interface PartTimeSalaryOptions {
  isOverride?: boolean;
  overrideAmount?: number;
  tier?: 'Novice' | 'Experienced' | 'Expert';
  surgeMultiplier?: number;
}

export const getPartTimeDailyPayroll = (date: string, rates: PartTimeRates = DEFAULT_PART_TIME_RATES, options: PartTimeSalaryOptions = {}): number => {
  if (options.isOverride && options.overrideAmount !== undefined) {
    return options.overrideAmount;
  }
  const isSundayDate = isSunday(date);
  let baseRate = isSundayDate ? rates.sundayRate : rates.weekdayRate;
  
  if (options.tier === 'Experienced') baseRate *= 1.1;
  else if (options.tier === 'Expert') baseRate *= 1.25;
  if (options.surgeMultiplier) baseRate *= options.surgeMultiplier;

  return Math.round(baseRate);
};
export const getPartTimeDailySalary = getPartTimeDailyPayroll;

// Calculate attendance values
export const calculateAttendanceMetrics = (
  staffId: string,
  attendance: Attendance[],
  year: number,
  month: number,
  approvedLeaves: any[] = []
) => {
  const monthlyAttendance = (Array.isArray(attendance) ? attendance : []).filter(record => {
    const recordDate = new Date(record.date);
    return record.staffId === staffId &&
      recordDate.getMonth() === month &&
      recordDate.getFullYear() === year &&
      !record.isPartTime; // Only full-time staff
  });

  const presentDaysFromAttendance = monthlyAttendance
    .filter(record => record.status === 'Present')
    .reduce((sum, record) => sum + (record.attendanceValue || 1), 0);

  // Add approved leave days as present days
  // Only count days in this month/year
  let presentDaysFromLeaves = 0;
  approvedLeaves.forEach(leave => {
    if (leave.staffId !== staffId || leave.status !== 'approved') return;
    
    const startDate = new Date(leave.leaveDate);
    const endDate = leave.leaveEndDate ? new Date(leave.leaveEndDate) : startDate;
    
    // Iterate through the date range
    const current = new Date(startDate);
    while (current <= endDate) {
      if (current.getMonth() === month && current.getFullYear() === year) {
        // Only count if they weren't already marked present
        const dateStr = current.toISOString().split('T')[0];
        const hasPresentRecord = monthlyAttendance.some(a => a.date === dateStr && a.status === 'Present');
        if (!hasPresentRecord && !isSunday(dateStr)) {
          presentDaysFromLeaves += 1;
        }
      }
      current.setDate(current.getDate() + 1);
    }
  });

  const presentDays = presentDaysFromAttendance + presentDaysFromLeaves;

  const halfDays = monthlyAttendance
    .filter(record => record.status === 'Half Day')
    .reduce((sum, record) => sum + (record.attendanceValue || 0.5), 0);

  const totalPresentDays = presentDays + halfDays;

  const sundayAbsents = monthlyAttendance
    .filter(record => record.status === 'Absent' && isSunday(record.date))
    .length;

  const daysInMonth = getDaysInMonth(year, month);
  const leaveDays = daysInMonth - Math.floor(totalPresentDays);

  return {
    presentDays: Math.floor(presentDays),
    halfDays: Math.floor(halfDays * 2), // Convert 0.5 to count
    totalPresentDays,
    leaveDays,
    sundayAbsents,
    daysInMonth
  };
};

// Calculate part-time salary with weekly breakdown
export const calculatePartTimePayroll = (
  staffName: string,
  location: string,
  floor: string,
  attendance: Attendance[],
  year: number,
  month: number
): PartTimeSalaryDetail => {
  const monthlyAttendance = (Array.isArray(attendance) ? attendance : []).filter(record => {
    return record.staffName === staffName &&
      record.isPartTime &&
      record.status === 'Present';
  });

  // Group by weeks
  const weeks: { [key: number]: Attendance[] } = {};
  monthlyAttendance.forEach(record => {
    const date = new Date(record.date);
    const weekNumber = Math.ceil(date.getDate() / 7);
    if (!weeks[weekNumber]) weeks[weekNumber] = [];
    weeks[weekNumber].push(record);
  });

  const weeklyBreakdown: WeeklySalary[] = [];
  let totalEarnings = 0;
  let totalDays = 0;

  Object.keys(weeks).forEach(weekKey => {
    const weekNum = parseInt(weekKey);
    const weekAttendance = weeks[weekNum];

    const dailySalaries: DailySalary[] = weekAttendance.map(record => {
      const salary = record.salary || getPartTimeDailyPayroll(record.date, { isOverride: record.salaryOverride, overrideAmount: record.salary });
      totalEarnings += salary;
      totalDays++;

      return {
        date: record.date,
        dayOfWeek: new Date(record.date).toLocaleDateString('en-US', { weekday: 'long' }),
        isPresent: true,
        isSunday: isSunday(record.date),
        salary,
        isOverride: record.salaryOverride || false
      };
    });

    const weekTotal = dailySalaries.reduce((sum, day) => sum + day.salary, 0);

    weeklyBreakdown.push({
      week: weekNum,
      days: dailySalaries,
      weekTotal
    });
  });

  return {
    staffName,
    location,
    floor,
    totalDays,
    totalShifts: 0, // Not used in new calculation
    ratePerDay: 350, // Base rate
    ratePerShift: 0, // Not used
    totalEarnings,
    month,
    year,
    weeklyBreakdown
  };
};

// Get previous month's advance data for carry-forward
export const getPreviousMonthAdvance = (
  staffId: string,
  advances: AdvanceDeduction[],
  currentMonth: number,
  currentYear: number
): number => {
  let prevMonth = currentMonth - 1;
  let prevYear = currentYear;

  if (prevMonth < 0) {
    prevMonth = 11;
    prevYear = currentYear - 1;
  }

  const previousAdvance = advances.find(adv =>
    adv.staffId === staffId &&
    adv.month === prevMonth &&
    adv.year === prevYear
  );

  return previousAdvance?.newAdvance || 0;
};

export interface DeductionBreakdown {
  entryId: string;
  amount: number;
  entryTotal: number;
  remaining: number;
  periodLabel: string; // e.g. '2/3'
}

export const computeScheduledDeductions = (
  entries: AdvanceEntry[],
  currentMonth: number,
  currentYear: number
): { total: number; breakdown: DeductionBreakdown[] } => {
  const breakdown: DeductionBreakdown[] = [];
  let total = 0;

  for (const entry of entries) {
    const deductPeriods = entry.deductPeriods || 1;
    const startMonth = entry.startDeductMonth ?? entry.month;
    const startYear = entry.startDeductYear ?? entry.year;
    const totalDeducted = entry.totalDeducted || 0;
    const remaining = entry.amount - totalDeducted;

    if (remaining <= 0) continue; // fully paid

    const periodsElapsed = (currentYear - startYear) * 12 + (currentMonth - startMonth);
    if (periodsElapsed < 0) continue; // hasn't started yet

    const remainingPeriods = Math.max(1, deductPeriods - periodsElapsed);
    const currentPeriod = periodsElapsed + 1;

    let thisMonthDeduction: number;
    if (remainingPeriods === 1) {
      thisMonthDeduction = remaining; // last period gets everything
    } else {
      thisMonthDeduction = roundToNearest10(Math.floor(remaining / remainingPeriods));
    }

    // Cap at remaining
    thisMonthDeduction = Math.min(thisMonthDeduction, remaining);

    breakdown.push({
      entryId: entry.id,
      amount: thisMonthDeduction,
      entryTotal: entry.amount,
      remaining: remaining,
      periodLabel: `${Math.min(currentPeriod, deductPeriods)}/${deductPeriods}`
    });
    total += thisMonthDeduction;
  }

  return { total: roundToNearest10(total), breakdown };
};

// Calculate salary based on attendance
// Scenario 1: salaryCalculationDays = 26
// Scenario 2: salaryCalculationDays = 30
// Scenario 3: salaryCalculationDays = 0 (fixed salary)
export const calculatePayroll = (
  staff: Staff,
  attendanceMetrics: ReturnType<typeof calculateAttendanceMetrics>,
  advances: AdvanceDeduction | null,
  allAdvances: AdvanceDeduction[],
  attendance: Attendance[],
  currentMonth: number,
  currentYear: number,
  advanceEntries: AdvanceEntry[] = [],
  overrideConfig?: any,
  scheduledDeductionTotal?: number,
  globalShiftWindows?: any
) => {
  let { totalPresentDays, presentDays, halfDays, leaveDays } = attendanceMetrics;
  const { sundayAbsents } = attendanceMetrics;

  // Get salary calculation days from staff settings (default 26)
  const calculationDays = staff.salaryCalculationDays || 26;

  const windows = globalShiftWindows || DEFAULT_SHIFT_WINDOWS;

  // Filter full-time attendance for the staff in the current month
  const monthlyAttendance = (Array.isArray(attendance) ? attendance : []).filter(record => {
    const recordDate = new Date(record.date);
    return record.staffId === staff.id &&
      recordDate.getMonth() === currentMonth &&
      recordDate.getFullYear() === currentYear &&
      !record.isPartTime;
  });

  // 1. Recalculate presentDays/halfDays to treat late/early half days as full days for salary pro-rating (avoid double-docking)
  let adjustedPresentDays = 0;
  let adjustedHalfDays = 0;

  monthlyAttendance.forEach(record => {
    if (record.status === 'Present' || record.status === 'Pending Full Day' || record.status === 'Manual Override') {
      adjustedPresentDays += record.attendanceValue || 1;
    } else if (record.status === 'Half Day') {
      const shiftKey = record.shift || staff.shift || 'Both';
      const baseWin = windows[shiftKey] || DEFAULT_SHIFT_WINDOWS[shiftKey];
      const win = staff.shiftWindow ? { ...baseWin, ...staff.shiftWindow } : baseWin;

      const arr = record.arrivalTime ? parseHHMM(record.arrivalTime) : null;
      const lev = record.leavingTime ? parseHHMM(record.leavingTime) : null;

      let isGenuineHalfDay = true;
      if (arr !== null && lev !== null) {
        const workedMins = minutesBetween(record.arrivalTime, record.leavingTime);
        const workedHours = workedMins / 60;
        if (workedHours >= win.minHoursFull) {
          isGenuineHalfDay = false; // It was a half-day solely because of late arrival/early leave
        }
      }

      if (isGenuineHalfDay) {
        adjustedHalfDays += 0.5;
      } else {
        adjustedPresentDays += 1.0;
      }
    }
  });

  if (adjustedPresentDays + adjustedHalfDays !== totalPresentDays && totalPresentDays > 0) {
    presentDays = Math.floor(adjustedPresentDays);
    halfDays = Math.floor(adjustedHalfDays * 2);
    totalPresentDays = adjustedPresentDays + adjustedHalfDays;
    leaveDays = getDaysInMonth(currentYear, currentMonth) - Math.floor(totalPresentDays);
  }

  // 2. Count late arrivals and early leaves beyond grace periods and compute daily deductions
  let recordLateDeduction = 0;
  let recordEarlyDeduction = 0;
  const dailyRate = (staff.basicPayroll ?? staff.basicSalary ?? 0) / calculationDays;

  monthlyAttendance.forEach(record => {
    if (record.status === 'Absent') return;

    // Retrieve active rules applied to this day's record
    let rulesToUse: any = null;
    if (record.appliedRuleDetails) {
      try {
        rulesToUse = typeof record.appliedRuleDetails === 'string'
          ? JSON.parse(record.appliedRuleDetails)
          : record.appliedRuleDetails;
      } catch {
        rulesToUse = null;
      }
    }

    // Fallback if no specific rule details were saved on the record
    if (!rulesToUse) {
      let shiftKey: any = record.shift || staff.shift || 'Both';
      if (shiftKey === '-') shiftKey = staff.shift || 'Both';
      const baseWin = windows[shiftKey] || (DEFAULT_SHIFT_WINDOWS as any)[shiftKey] || DEFAULT_SHIFT_WINDOWS['Both'];
      const win = baseWin ? (staff.shiftWindow ? { ...baseWin, ...staff.shiftWindow } : baseWin) : DEFAULT_SHIFT_WINDOWS['Both'];
      rulesToUse = {
        shiftStart: win.start,
        shiftEnd: win.end,
        graceLateMin: win.graceLateMin,
        graceEarlyMin: win.graceEarlyMin,
        lateDeductionRate: 0.5,
        earlyDeductionRate: 0.5,
      };
    }

    if (record.arrivalTime) {
      const arr = parseHHMM(record.arrivalTime);
      const start = parseHHMM(rulesToUse.shiftStart || rulesToUse.start);
      if (arr !== null && start !== null) {
        const lateBy = arr - start;
        if (lateBy > (rulesToUse.graceLateMin ?? 15)) {
          lateCount++;
          if (!staff.exemptFromLateDeduction) {
            const rate = rulesToUse.lateDeductionRate !== undefined ? rulesToUse.lateDeductionRate : 0.5;
            recordLateDeduction += rate * dailyRate;
          }
        }
      }
    }

    if (record.leavingTime) {
      const lev = parseHHMM(record.leavingTime);
      const end = parseHHMM(rulesToUse.shiftEnd || rulesToUse.end);
      if (lev !== null && end !== null) {
        const earlyBy = end - lev;
        if (earlyBy > (rulesToUse.graceEarlyMin ?? 15)) {
          earlyCount++;
          const rate = rulesToUse.earlyDeductionRate !== undefined ? rulesToUse.earlyDeductionRate : 0.5;
          recordEarlyDeduction += rate * dailyRate;
        }
      }
    }
  });

  let lateComingDeduction = roundToNearest10(recordLateDeduction);
  let earlyLeaveDeduction = roundToNearest10(recordEarlyDeduction);

  // Apply overrides from advances JSON if they are present there
  const manualOverrides = advances?.overrides || {};
  if (manualOverrides.lateComingDeduction !== undefined) {
    lateComingDeduction = manualOverrides.lateComingDeduction;
  }
  if (manualOverrides.earlyLeaveDeduction !== undefined) {
    earlyLeaveDeduction = manualOverrides.earlyLeaveDeduction;
  }

  let basicEarned: number;
  let incentiveEarned: number;
  let hraEarned: number;
  let hraDeduction: number = 0; // Track HRA deduction internally
  const basicAmount = staff.basicPayroll ?? staff.basicSalary ?? 0;

  // SCENARIO 3: Fixed salary (calculationDays = 0)
  if (calculationDays === 0) {
    // No calculation based on present days - fixed salary
    basicEarned = basicAmount;
    incentiveEarned = staff.incentive;
    hraEarned = staff.hra;
  }
  // SCENARIO 1: 26 calculation days
  else if (calculationDays === 26) {
    // Basic calculation: (basicPayroll / 26) * presentDays, rounded to nearest 10
    if (totalPresentDays >= 26) {
      basicEarned = basicAmount;
    } else {
      basicEarned = roundToNearest10((basicAmount / 26) * totalPresentDays);
    }

    // Incentive and HRA logic
    if (totalPresentDays >= 25) {
      // 25 or more days: Full incentive and full HRA
      incentiveEarned = staff.incentive;
      hraEarned = staff.hra;
    } else {
      // Less than 25 days: Pro-rated calculation with HRA deduction from incentive

      // Calculate pro-rated incentive
      const proRatedIncentive = roundToNearest10((staff.incentive / 26) * totalPresentDays);

      // Calculate HRA reduction (what HRA would be vs full HRA)
      const proRatedHRA = roundToNearest10((staff.hra / 26) * totalPresentDays);
      hraDeduction = staff.hra - proRatedHRA; // This is the HRA shortfall

      // HRA stays full (don't reduce HRA visually)
      hraEarned = staff.hra;

      // Deduct HRA shortfall from incentive
      incentiveEarned = Math.max(0, proRatedIncentive - hraDeduction);
    }
  }
  // SCENARIO 2: 30 calculation days
  else if (calculationDays === 30) {
    // Basic calculation: (basicPayroll / 30) * presentDays, rounded to nearest 10
    if (totalPresentDays >= 30) {
      basicEarned = basicAmount;
    } else {
      basicEarned = roundToNearest10((basicAmount / 30) * totalPresentDays);
    }

    // Incentive and HRA logic for 30-day calculation
    if (totalPresentDays >= 25) {
      // 25 or more days: Full incentive and full HRA
      incentiveEarned = staff.incentive;
      hraEarned = staff.hra;
    } else {
      // Less than 25 days: Pro-rated incentive (no HRA deduction for 30-day scenario)
      incentiveEarned = roundToNearest10((staff.incentive / 30) * totalPresentDays);
      hraEarned = staff.hra; // Full HRA
    }
  }
  // Default fallback (custom calculation days)
  else {
    // Use the custom calculationDays value
    if (totalPresentDays >= calculationDays) {
      basicEarned = basicAmount;
    } else {
      basicEarned = roundToNearest10((basicAmount / calculationDays) * totalPresentDays);
    }

    if (totalPresentDays >= 25) {
      incentiveEarned = staff.incentive;
      hraEarned = staff.hra;
    } else {
      incentiveEarned = roundToNearest10((staff.incentive / calculationDays) * totalPresentDays);
      hraEarned = staff.hra;
    }
  }

  // Calculate Sunday penalty - including half-day Sunday penalty
  let sundayPenalty = 0;

  // Only apply penalty if enabled for this staff member (default to true if undefined)
  if (staff.sundayPenalty !== false) {
    const sundayHalfDays = monthlyAttendance
      .filter(record => record.status === 'Half Day' && isSunday(record.date))
      .length;

    // Calculate total Sunday penalty
    if (sundayAbsents > 0) {
      sundayPenalty += sundayAbsents * 500;
    }

    // Add Sunday half-day penalty (₹250 per half-day)
    if (sundayHalfDays > 0) {
      sundayPenalty += sundayHalfDays * 250;
    }
  }

  // Calculate supplements with per-day mode support
  const calcModes = staff.allowanceCalcModes || {};
  const calcDaysForAllowance = calculationDays || 30; // fallback for per-day calc
  
  let supplementsTotal = 0;
  if (staff.salarySupplements) {
    Object.entries(staff.salarySupplements).forEach(([key, value]) => {
      if (calcModes[key] === 'per_day') {
        supplementsTotal += roundToNearest10((value / calcDaysForAllowance) * totalPresentDays);
      } else {
        supplementsTotal += value;
      }
    });
  }
  
  // Meal allowance with threshold-based logic
  // If threshold > 0: present >= threshold → fixed amount, else per-day calc
  // If threshold = 0: check calcMode (fixed or per_day)
  // per_day mode: presentDays * rate, rounded to nearest 10
  const rawMeal = staff.mealAllowance || 0;
  const mealThreshold = staff.mealAllowanceThreshold || 0;
  let mealAllowance: number;
  
  if (mealThreshold > 0) {
    // Threshold mode: fixed if present >= threshold, else per-day
    if (totalPresentDays >= mealThreshold) {
      mealAllowance = rawMeal;
    } else {
      mealAllowance = roundToNearest10(totalPresentDays * rawMeal);
    }
  } else if (calcModes['meal_allowance'] === 'per_day') {
    // Per-day mode: presentDays * rate per day
    mealAllowance = roundToNearest10(totalPresentDays * rawMeal);
  } else {
    mealAllowance = rawMeal;
  }

  const overrides = advances?.overrides || {};
  if (overrideConfig?.basic && overrides.basic !== undefined) basicEarned = overrides.basic;
  if (overrideConfig?.incentive && overrides.incentive !== undefined) incentiveEarned = overrides.incentive;
  if (overrideConfig?.hra && overrides.hra !== undefined) hraEarned = overrides.hra;
  if (overrideConfig?.mealAllowance && overrides.mealAllowance !== undefined) mealAllowance = overrides.mealAllowance;
  if (overrideConfig?.sundayPenalty && overrides.sundayPenalty !== undefined) sundayPenalty = overrides.sundayPenalty;

  // Gross salary calculation
  const grossPayroll = roundToNearest10(basicEarned + incentiveEarned + hraEarned + supplementsTotal + mealAllowance);

  // Advance and deduction handling with carry-forward
  const oldAdv = advances?.oldAdvance || getPreviousMonthAdvance(staff.id, allAdvances, currentMonth, currentYear);
  
  let curAdv = advances?.currentAdvance || 0;
  
  const entriesSum = advanceEntries
    .filter(e => e.month === currentMonth && e.year === currentYear)
    .reduce((s, e) => s + e.amount, 0);
  const hasManualAdvanceRow = !!advances && (advances.currentAdvance || 0) > 0;
  if (!hasManualAdvanceRow && entriesSum > 0) {
    curAdv = roundToNearest10(entriesSum);
  }

  // Use manual deduction if set, otherwise use auto-scheduled deduction
  const manualDeduction = advances?.deduction || 0;
  const deduction = manualDeduction > 0 ? manualDeduction : (scheduledDeductionTotal || 0);

  // Calculate new advance
  const newAdv = roundToNearest10(oldAdv + curAdv - deduction);

  // Calculate net salary (deduct Sunday penalty and late/early deductions from net salary)
  const netPayroll = Math.max(0, roundToNearest10(grossPayroll - curAdv - deduction - sundayPenalty - lateComingDeduction - earlyLeaveDeduction));

  return {
    staffId: staff.id,
    month: currentMonth,
    year: currentYear,
    presentDays,
    halfDays,
    leaveDays,
    sundayAbsents,
    oldAdv: roundToNearest10(oldAdv),
    curAdv: roundToNearest10(curAdv),
    deduction: roundToNearest10(deduction),
    basicEarned: roundToNearest10(basicEarned),
    incentiveEarned: roundToNearest10(incentiveEarned),
    hraEarned: roundToNearest10(hraEarned),
    hraDeduction: roundToNearest10(hraDeduction), // Internal tracking
    sundayPenalty: roundToNearest10(sundayPenalty),
    mealAllowance: roundToNearest10(mealAllowance),
    lateComingDeduction: roundToNearest10(lateComingDeduction),
    earlyLeaveDeduction: roundToNearest10(earlyLeaveDeduction),
    grossPayroll: roundToNearest10(grossPayroll),
    grossSalary: roundToNearest10(grossPayroll),
    newAdv,
    netPayroll,
    netSalary: netPayroll,
    calculationDays, // Include for reference
    isProcessed: false
  };
};

export const calculateSalary = calculatePayroll;

// Calculate dashboard attendance with half-day support and flex staff
export const calculateLocationAttendance = (
  staff: Staff[],
  attendance: Attendance[],
  date: string,
  location: string
) => {
  const locationStaff = staff.filter(member => member.location === location && member.isActive);
  const locationAttendance = (Array.isArray(attendance) ? attendance : []).filter(record => {
    if (record.isPartTime) {
      // For flex staff, check by location in attendance record
      return record.date === date && record.location === location;
    } else {
      // For full-time staff, check by staff member location
      const staffMember = staff.find(s => s.id === record.staffId);
      return staffMember?.location === location && record.date === date && !record.isPartTime;
    }
  });

  // partTimeAttendance calculation was removed as it was unused

  const present = locationAttendance.filter(record => record.status === 'Present');
  const halfDay = locationAttendance.filter(record => record.status === 'Half Day');
  const absent = locationAttendance.filter(record => record.status === 'Absent');

  // Calculate total present days including half days
  const totalPresentValue = present.length + (halfDay.length * 0.5);

  // Get names for display
  const presentNames = present.map(p => {
    if (p.isPartTime) {
      return `${p.staffName} (${p.shift})`;
    } else {
      return staff.find(s => s.id === p.staffId)?.name;
    }
  }).filter(Boolean);

  const halfDayNames = halfDay.map(h => {
    if (h.isPartTime) {
      return `${h.staffName} (${h.shift})`;
    } else {
      return staff.find(s => s.id === h.staffId)?.name;
    }
  }).filter(Boolean);

  const absentNames = absent.map(a => {
    if (a.isPartTime) {
      return `${a.staffName} (${a.shift})`;
    } else {
      return staff.find(s => s.id === a.staffId)?.name;
    }
  }).filter(Boolean);

  return {
    total: locationStaff.length,
    present: present.length,
    halfDay: halfDay.length,
    absent: absent.length,
    totalPresentValue: Math.round(totalPresentValue * 10) / 10,
    presentNames,
    halfDayNames,
    absentNames
  };
};

// Calculate currency breakdown for an amount
export const getCurrencyBreakdown = (amount: number): Record<number, number> => {
  const denominations = [500, 200, 100, 50, 20, 10, 5, 2, 1];
  const breakdown: Record<number, number> = {};
  let remaining = amount;

  denominations.forEach(denom => {
    const count = Math.floor(remaining / denom);
    if (count > 0) {
      breakdown[denom] = count;
      remaining -= count * denom;
    }
  });

  return breakdown;
};

export const calculatePartTimeSalary = calculatePartTimePayroll;