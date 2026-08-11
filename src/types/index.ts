export interface Staff {
  id: string;
  employeeCode?: string;
  name: string;
  location: string;
  floor?: string;
  designation?: string;
  type: 'full-time' | 'part-time';
  shift?: 'Morning' | 'Evening' | 'Both';
  phone?: string;
  tier?: 'Novice' | 'Experienced' | 'Expert';
  ratePerDay?: number;
  ratePerShift?: number;
  experience: string;
  basicPayroll?: number;
  basicSalary?: number;
  incentive: number;
  hra: number;
  totalPayroll?: number;
  totalSalary?: number;
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
  /** Bound physical device ID for anti-buddy punching */
  deviceId?: string | null;
  exemptFromLateDeduction?: boolean;
  /** Dynamic JSONB custom field values */
  customFields?: Record<string, any>;
  /** Work/Personal Email Address */
  email?: string;
  /** Emergency contact name */
  emergencyContactName?: string;
  /** Emergency contact phone number */
  emergencyContactPhone?: string;
  /** Date of birth (YYYY-MM-DD) */
  dob?: string;
  /** Gender */
  gender?: 'male' | 'female' | 'other' | '';
  /** UPI ID / VPA for digital payouts */
  upiId?: string;
  /** Government Identity: Aadhaar Number */
  aadhaarNumber?: string;
  /** Government Identity: PAN Number */
  panNumber?: string;
}

export interface CustomFieldDefinition {
  id: string;
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select';
  options?: string[];
  required?: boolean;
  showInTable?: boolean;
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
  floor?: string;
  salary?: number;
  salaryOverride?: boolean;
  arrivalTime?: string;
  breakTimeOut?: string;
  breakTimeIn?: string;
  leavingTime?: string;
  isUninformed?: boolean;
  appliedRuleType?: string;
  appliedRuleDetails?: any;
  totalHours?: number;
  overtimeHours?: number;
  phone?: string;
  isSettled?: boolean;
}

export interface PayrollDetail {
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
  lateComingDeduction?: number;
  earlyLeaveDeduction?: number;
  grossPayroll?: number;
  grossSalary?: number;
  newAdv: number;
  netPayroll?: number;
  netSalary?: number;
  isProcessed: boolean;
  statutoryTotal?: number;
  statutoryBreakdown?: Array<{ key: string; label: string; amount: number }>;
  /** Net payable excluding statutory deductions (used by statutory-mode views). */
  nonStatutoryNet?: number;
}

export interface PayrollRun {
  id: string;
  month: number;
  year: number;
  status: 'Generated' | 'Locked';
  generatedAt: string;
  generatedBy?: string;
}

export interface PayrollSnapshot {
  id: string;
  runId: string;
  staffId: string;
  staffSnapshot: Staff;
  salaryDetail: PayrollDetail;
}

export interface PartTimeSalaryDetail {
  staffName: string;
  location: string;
  floor?: string;
  totalDays: number;
  totalShifts: number;
  ratePerDay: number;
  ratePerShift: number;
  totalEarnings: number;
  month: number;
  year: number;
  weeklyBreakdown: WeeklySalary[];
}

export interface WeeklyPayroll {
  week: number;
  days: DailySalary[];
  weekTotal: number;
}

export interface DailyPayroll {
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
  basicPayroll?: number;
  basicSalary?: number;
  incentive: number;
  hra: number;
  totalPayroll?: number;
  totalSalary?: number;
  joinedDate: string;
  leftDate: string;
  reason: string;
  salaryHistory: PayrollDetail[];
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
  overrides?: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollHike {
  id: string;
  staffId: string;
  oldPayroll?: number;
  oldSalary?: number;
  newPayroll?: number;
  newSalary?: number;
  hikeDate: string;
  reason?: string;
  breakdown?: Record<string, number>;
  createdAt: string;
}

export interface User {
  id?: string;
  email: string;
  role: 'admin' | 'manager' | 'staff' | 'statutory_admin' | 'floor_supervisor' | 'supervisor' | 'super_admin';
  location?: string;
  /** For supervisor role: the single floor they can manage. */
  floor?: string;
  floorId?: string;
  staffId?: string;
  staffName?: string;
  tenant?: {
    id: string;
    name: string;
    status: string;
  };
}


export interface PayrollCategory {
  id: string;
  name: string;
  key: string;
}

export interface PayrollOverride {
  id?: string;
  staffId: string;
  month: number;
  year: number;
  basicOverride?: number;
  incentiveOverride?: number;
  hraOverride?: number;
  mealAllowanceOverride?: number;
  sundayPenaltyOverride?: number;
  lateComingDeductionOverride?: number;
  earlyLeaveDeductionOverride?: number;
  salarySupplementsOverride?: Record<string, number>;
}

export type NavigationTab = 'Dashboard' | 'Staff Management' | 'Attendance' | 'Payroll Management' | 'Flex Staff' | 'Old Staff Records' | 'Settings' | 'My Portal' | 'Leave Management' | 'Face Attendance' | 'Audit Log' | 'Workforce Insights' | 'Break Management' | 'Security' | 'AI Insights' | 'Profile' | 'Permissions Matrix' | 'Shift Roster' | 'Action Center' | 'Loan Requests';

export interface BreakType {
  id: string;
  name: string;
  code: string; // 'lunch' | 'tea' | 'custom' | any
  defaultMinutes: number;
  maxMinutes: number;
  isPaid: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface BreakEvent {
  id: string;
  staffId: string;
  staffName?: string;
  location?: string;
  date: string;            // YYYY-MM-DD
  breakTypeId?: string;
  breakTypeCode?: string;  // lunch/tea/custom
  startTime: string;       // HH:MM:SS
  endTime?: string | null;
  durationMinutes?: number | null;
  source: 'web' | 'mobile' | 'biometric' | 'manual';
  deviceLabel?: string;
  isViolation?: boolean;
  violationReason?: string;
  notes?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface BreakPolicy {
  id: string;
  location?: string;
  designationId?: string;
  breakTypeId?: string;
  maxPerDay: number;
  maxMinutesPerBreak: number;
  maxTotalMinutesPerDay: number;
  deductFromHours: boolean;
  graceMinutes: number;
}

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
  pendingPayroll?: number;
  pendingSalary?: number;
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

export interface AuditLogChange {
  field: string;
  label?: string;
  oldValue: any;
  newValue: any;
}

export interface AuditLog {
  id: string;
  action: 'attendance_override' | 'salary_edit' | 'staff_update' | 'bulk_update' | 'settings_update' | 'staff_create' | 'staff_delete' | 'loan_request' | 'loan_request_update' | 'loan_request_delete' | 'loan_approval' | 'loan_rejection' | 'loan_emi_update' | 'emi_deduction';
  staffId?: string;
  staffName?: string;
  details: string;
  performedBy: string;
  timestamp: string;
  /** Structured before/after diff for role-based audit view */
  changes?: AuditLogChange[];
  before?: Record<string, any>;
  after?: Record<string, any>;
}


export interface Designation {
  id: string;
  name: string;
  displayName: string;
  isActive: boolean;
  sortOrder: number;
  shiftStart?: string;
  shiftEnd?: string;
  graceLateMin?: number;
  graceEarlyMin?: number;
  minHoursFull?: number;
  minHoursHalf?: number;
  morningCutoff?: string;
  earlyExitTime?: string;
  eveningVerificationTime?: string;
  fullDayRequiresMorning?: boolean;
  lateDeductionRate?: number;
  earlyDeductionRate?: number;
}

export interface BranchDesignationShiftConfig {
  id?: string;
  locationName: string;
  designationId: string;
  shiftStart?: string;
  shiftEnd?: string;
  graceLateMin?: number;
  graceEarlyMin?: number;
  minHoursFull?: number;
  minHoursHalf?: number;
  morningCutoff?: string;
  earlyExitTime?: string;
  eveningVerificationTime?: string;
  fullDayRequiresMorning?: boolean;
  lateDeductionRate?: number;
  earlyDeductionRate?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Branch {
  id: string;
  name: string;
  isDefault?: boolean;
  address?: string;
  phone?: string;
  displayOrder?: number;
}
export interface Floor {
  id?: string;
  name?: string;
  location?: string;
  displayOrder?: number;
}
export type Location = Branch;

// Backward-compatibility type aliases
export type SalaryCategory = PayrollCategory;
export type SalaryOverride = PayrollOverride;
export type SalaryHike = PayrollHike;
export type SalaryDisbursement = any;
export type LocationShiftConfig = any;
export type LocationDesignationShiftConfig = BranchDesignationShiftConfig;
export type WeeklySalary = WeeklyPayroll;
export type DailySalary = DailyPayroll;

