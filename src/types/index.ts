export interface Staff {
  id: string;
  name: string;
  location: string;
  floor?: string;
  designation?: string;
  type: 'full-time' | 'part-time';
  shift?: 'Morning' | 'Evening' | 'Both';
  ratePerDay?: number;
  ratePerShift?: number;
  experience: string;
  basicSalary: number;
  incentive: number;
  hra: number;
  totalSalary: number;
  joinedDate: string;
  isActive: boolean;
  sundayPenalty?: boolean;
  salaryCalculationDays?: number;
  salarySupplements?: Record<string, number>;
  mealAllowance?: number;
  mealAllowanceThreshold?: number;
  staffAccommodation?: 'day_scholar' | 'accommodation' | '';
  allowanceCalcModes?: Record<string, 'fixed' | 'per_day'>;
  displayOrder?: number;
  contactNumber?: string;
  address?: string;
  photo?: string;
  initialSalary?: number;
  bankAccountNumber?: string;
  ifscCode?: string;
  bankName?: string;
  paymentMode?: 'cash' | 'bank';
  nextHikeDate?: string;
  hikeIntervalMonths?: number;
  statutoryDeductions?: Record<string, StatutoryDeduction>;
  /** Per-staff override for shift window (start/end/grace/min hours). */
  shiftWindow?: {
    start?: string;
    end?: string;
    graceLateMin?: number;
    graceEarlyMin?: number;
    minHoursFull?: number;
    minHoursHalf?: number;
  };
  /** Per-staff face-match confidence override (euclidean distance threshold). */
  faceMatchThreshold?: number;
  /** Statutory PF account number (optional). */
  pfNumber?: string;
  /** Statutory ESI insurance number (optional). */
  esiNumber?: string;
}

export type DeductionBase = 'basic' | 'basic_hra' | 'gross' | 'fixed';

export interface StatutoryDeduction {
  enabled: boolean;
  /** percentage value e.g. 0.75 = 0.75% (ignored when base = 'fixed') */
  percentage: number;
  base: DeductionBase;
  /** flat amount when base = 'fixed' */
  fixedAmount?: number;
  /** display name (required for custom rows; built-ins fall back to key label) */
  name?: string;
}

export interface Attendance {
  id: string;
  staffId: string;
  date: string;
  status: 'Present' | 'Half Day' | 'Absent' | 'Pending Full Day' | 'Manual Override';
  attendanceValue: number;
  isSunday?: boolean;
  shift?: 'Morning' | 'Evening' | 'Both';
  isPartTime?: boolean;
  staffName?: string;
  location?: string;
  salary?: number;
  salaryOverride?: boolean;
  arrivalTime?: string;
  leavingTime?: string;
  isUninformed?: boolean;
}

export interface SalaryDetail {
  staffId: string;
  month: number;
  year: number;
  presentDays: number;
  halfDays: number;
  leaveDays: number;
  sundayAbsents: number;
  oldAdv: number;
  curAdv: number;
  deduction: number;
  basicEarned: number;
  incentiveEarned: number;
  hraEarned: number;
  salarySupplements?: Record<string, number>;
  sundayPenalty: number;
  mealAllowance: number;
  grossSalary: number;
  newAdv: number;
  netSalary: number;
  isProcessed: boolean;
  statutoryTotal?: number;
  statutoryBreakdown?: Array<{ key: string; label: string; amount: number }>;
}

export interface PartTimeSalaryDetail {
  staffName: string;
  location: string;
  totalDays: number;
  totalShifts: number;
  ratePerDay: number;
  ratePerShift: number;
  totalEarnings: number;
  month: number;
  year: number;
  weeklyBreakdown: WeeklySalary[];
}

export interface WeeklySalary {
  week: number;
  days: DailySalary[];
  weekTotal: number;
}

export interface DailySalary {
  date: string;
  dayOfWeek: string;
  isPresent: boolean;
  isSunday: boolean;
  salary: number;
  isOverride: boolean;
}

export interface OldStaffRecord {
  id: string;
  originalStaffId: string;
  name: string;
  location: string;
  type: 'full-time' | 'part-time';
  experience: string;
  basicSalary: number;
  incentive: number;
  hra: number;
  totalSalary: number;
  joinedDate: string;
  leftDate: string;
  reason: string;
  salaryHistory: SalaryDetail[];
  totalAdvanceOutstanding: number;
  lastAdvanceData?: AdvanceDeduction;
  contactNumber?: string;
  address?: string;
  photo?: string;
}

export interface AdvanceDeduction {
  id: string;
  staffId: string;
  month: number;
  year: number;
  oldAdvance: number;
  currentAdvance: number;
  deduction: number;
  newAdvance: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SalaryHike {
  id: string;
  staffId: string;
  oldSalary: number;
  newSalary: number;
  hikeDate: string;
  reason?: string;
  breakdown?: Record<string, number>;
  createdAt: string;
}

export interface User {
  email: string;
  role: 'admin' | 'manager' | 'staff';
  location?: string;
  staffId?: string;
  staffName?: string;
}

export interface SalaryCategory {
  id: string;
  name: string;
  key: string;
}

export interface SalaryOverride {
  id?: string;
  staffId: string;
  month: number;
  year: number;
  basicOverride?: number;
  incentiveOverride?: number;
  hraOverride?: number;
  mealAllowanceOverride?: number;
  sundayPenaltyOverride?: number;
  salarySupplementsOverride?: Record<string, number>;
}

export type NavigationTab = 'Dashboard' | 'Staff Management' | 'Attendance' | 'Salary Management' | 'Part-Time Staff' | 'Old Staff Records' | 'Settings' | 'My Portal' | 'Leave Management' | 'Face Attendance' | 'Audit Log';

// Re-export AppUser from userService
export type { AppUser } from '../services/userService';

export interface AttendanceFilter {
  date?: string;
  shift?: 'Morning' | 'Evening' | 'Both' | 'All';
  staffType?: 'full-time' | 'part-time' | 'all';
  location?: string;
  search?: string;
}

export interface PartTimeAdvanceRecord {
  id: string;
  staffName: string;
  location: string;
  weekStartDate: string;
  year: number;
  month: number;
  weekNumber: number;
  openingBalance: number;
  advanceGiven: number;
  earnings: number;
  adjustment: number;
  pendingSalary: number;
  closingBalance: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PartTimeSettlement {
  id: string;
  staffName: string;
  location: string;
  settlementKey: string;
  isSettled: boolean;
  settledAt?: string;
  settledBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  action: 'attendance_override' | 'salary_edit' | 'staff_update' | 'bulk_update';
  staffId?: string;
  staffName?: string;
  details: string;
  performedBy: string;
  timestamp: string;
}
