import { Staff, Attendance, AdvanceDeduction, PartTimeSalaryDetail, WeeklySalary, DailySalary } from '../types';
import { settingsService } from '../services/settingsService';

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
export const getPartTimeDailySalary = (date: string, isOverride: boolean = false, overrideAmount?: number): number => {
  if (isOverride && overrideAmount !== undefined) {
    return overrideAmount;
  }

  const rates = settingsService.getPartTimeRates();
  const isSundayDate = isSunday(date);
  return isSundayDate ? rates.sundayRate : rates.weekdayRate;
};

// Calculate attendance values
export const calculateAttendanceMetrics = (
  staffId: string,
  attendance: Attendance[],
  year: number,
  month: number
) => {
  const monthlyAttendance = attendance.filter(record => {
    const recordDate = new Date(record.date);
    return record.staffId === staffId &&
      recordDate.getMonth() === month &&
      recordDate.getFullYear() === year &&
      !record.isPartTime; // Only full-time staff
  });

  const presentDays = monthlyAttendance
    .filter(record => record.status === 'Present')
    .reduce((sum, record) => sum + (record.attendanceValue || 1), 0);

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
export const calculatePartTimeSalary = (
  staffName: string,
  location: string,
  attendance: Attendance[],
  year: number,
  month: number
): PartTimeSalaryDetail => {
  const monthlyAttendance = attendance.filter(record => {
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
      const salary = record.salary || getPartTimeDailySalary(record.date, record.salaryOverride, record.salary);
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

// Calculate salary based on attendance
// Scenario 1: salaryCalculationDays = 26
// Scenario 2: salaryCalculationDays = 30
// Scenario 3: salaryCalculationDays = 0 (fixed salary)
export const calculateSalary = (
  staff: Staff,
  attendanceMetrics: ReturnType<typeof calculateAttendanceMetrics>,
  advances: AdvanceDeduction | null,
  allAdvances: AdvanceDeduction[],
  attendance: Attendance[],
  currentMonth: number,
  currentYear: number
) => {
  const { totalPresentDays, sundayAbsents, presentDays, halfDays, leaveDays } = attendanceMetrics;

  // Get salary calculation days from staff settings (default 26)
  const calculationDays = staff.salaryCalculationDays || 26;

  let basicEarned: number;
  let incentiveEarned: number;
  let hraEarned: number;
  let hraDeduction: number = 0; // Track HRA deduction internally

  // SCENARIO 3: Fixed salary (calculationDays = 0)
  if (calculationDays === 0) {
    // No calculation based on present days - fixed salary
    basicEarned = staff.basicSalary;
    incentiveEarned = staff.incentive;
    hraEarned = staff.hra;
  }
  // SCENARIO 1: 26 calculation days
  else if (calculationDays === 26) {
    // Basic calculation: (basicSalary / 26) * presentDays, rounded to nearest 10
    if (totalPresentDays >= 26) {
      basicEarned = staff.basicSalary;
    } else {
      basicEarned = roundToNearest10((staff.basicSalary / 26) * totalPresentDays);
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
    // Basic calculation: (basicSalary / 30) * presentDays, rounded to nearest 10
    if (totalPresentDays >= 30) {
      basicEarned = staff.basicSalary;
    } else {
      basicEarned = roundToNearest10((staff.basicSalary / 30) * totalPresentDays);
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
      basicEarned = staff.basicSalary;
    } else {
      basicEarned = roundToNearest10((staff.basicSalary / calculationDays) * totalPresentDays);
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
    // Get Sunday half-day count from attendance
    const monthlyAttendance = attendance.filter(record => {
      const recordDate = new Date(record.date);
      return record.staffId === staff.id &&
        recordDate.getMonth() === currentMonth &&
        recordDate.getFullYear() === currentYear &&
        !record.isPartTime;
    });

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

  // Gross salary calculation
  const grossSalary = roundToNearest10(basicEarned + incentiveEarned + hraEarned + supplementsTotal + mealAllowance);

  // Advance and deduction handling with carry-forward
  const oldAdv = advances?.oldAdvance || getPreviousMonthAdvance(staff.id, allAdvances, currentMonth, currentYear);
  const curAdv = advances?.currentAdvance || 0;
  const deduction = advances?.deduction || 0;

  // Calculate new advance
  const newAdv = roundToNearest10(oldAdv + curAdv - deduction);

  // Calculate net salary (deduct Sunday penalty from net salary)
  const netSalary = Math.max(0, roundToNearest10(grossSalary - curAdv - deduction - sundayPenalty));

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
    grossSalary,
    newAdv,
    netSalary,
    calculationDays, // Include for reference
    isProcessed: false
  };
};

// Calculate dashboard attendance with half-day support and part-time staff
export const calculateLocationAttendance = (
  staff: Staff[],
  attendance: Attendance[],
  date: string,
  location: string
) => {
  const locationStaff = staff.filter(member => member.location === location && member.isActive);
  const locationAttendance = attendance.filter(record => {
    if (record.isPartTime) {
      // For part-time staff, check by location in attendance record
      return record.date === date && record.location === location;
    } else {
      // For full-time staff, check by staff member location
      const staffMember = staff.find(s => s.id === record.staffId);
      return staffMember?.location === location && record.date === date && !record.isPartTime;
    }
  });

  // Get part-time attendance for this location and date
  const partTimeAttendance = attendance.filter(record =>
    record.isPartTime && record.date === date && record.status === 'Present'
  );

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