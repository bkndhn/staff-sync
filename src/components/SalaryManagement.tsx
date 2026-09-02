import React, { useState, useEffect } from 'react';
import { EmptyState } from './ui/PageShell';
import { dataApi } from '../lib/dataApi';
import { Staff, Attendance, PayrollDetail, AdvanceDeduction, PartTimeSalaryDetail, PayrollOverride, PayrollRun, PayrollSnapshot } from '../types';
import { DollarSign, Download, Users, Calendar, TrendingUp, Edit2, Save, X, FileSpreadsheet, FileText, MessageCircle, Filter, Plus, Trash2, Check, RefreshCw, HandCoins } from 'lucide-react';
import { staffService } from '../services/staffService';
import { salaryDisbursementService } from '../services/salaryDisbursementService';
import { calculateAttendanceMetrics, calculateSalary, calculatePartTimeSalary, roundToNearest10, computeScheduledDeductions } from '../utils/salaryCalculations';
const calculatePayroll = calculateSalary;
const calculatePartTimePayroll = calculatePartTimeSalary;
type SalaryCategory = PayrollCategory;
import type { DeductionBreakdown } from '../utils/salaryCalculations';
import { exportSalaryToExcel, exportSalaryPDF, generateSalarySlipPDF, exportBulkSalarySlipsPDF, exportStatutoryToExcel } from '../utils/exportUtils';
import { salaryCategoryService, type PayrollCategory } from '../services/salaryCategoryService';
import { salaryOverrideService } from '../services/salaryOverrideService';
import { advanceEntryService, AdvanceEntry } from '../services/advanceEntryService';
import { computeStatutoryBreakdown } from '../utils/statutoryDeductions';
import { validateSalaryBatch, reconcileSalary, type SalaryIssue } from '../utils/salaryValidation';
import { appSettingsService } from '../services/appSettingsService';
import { payrollService } from '../services/payrollService';
import { leaveService, type LeaveRequest } from '../services/leaveService';
import { payrollRulesService } from '../services/payrollRulesService';
import BulkSalarySender from './BulkSalarySender';
import { customAlert, customConfirm } from './CustomDialog';
import { canSeeEmployeeCode, hideStatutoryExtras, type AppRole } from '../lib/roleVisibility';
import { useUserPreference } from '../hooks/useUserPreference';
import { shiftService, DEFAULT_SHIFT_WINDOWS } from '../services/shiftService';
import PayrollInsightsPanel from './PayrollInsightsPanel';
import CompliancePanel from './CompliancePanel';
import { currentActor } from '../lib/currentActor';
import type { AnomalyReport } from '../utils/payrollAnomalies';


interface PayrollManagementProps {
  staff: Staff[];
  attendance: Attendance[];
  advances: AdvanceDeduction[];
  onUpdateAdvances: (staffId: string, month: number, year: number, advances: Partial<AdvanceDeduction>) => void;
  userRole?: AppRole;
}
export type SalaryManagementProps = PayrollManagementProps;

interface TempSalaryData {
  grossPayroll?: number;
  netPayroll?: number;
  oldAdvance?: number;
  currentAdvance?: number;
  originalCurrentAdvance?: number | null;
  deduction?: number;
  newAdvance?: number;
  basicOverride?: number;
  incentiveOverride?: number;
  hraOverride?: number;
  mealAllowanceOverride?: number;
  sundayPenaltyOverride?: number;
  lateComingDeductionOverride?: number;
  earlyLeaveDeductionOverride?: number;
  grossSalary?: number;
  netSalary?: number;
}

const PayrollManagement: React.FC<SalaryManagementProps> = ({
  staff,
  attendance,
  advances,
  onUpdateAdvances,
  userRole
}) => {
  const showEmpCode = canSeeEmployeeCode(userRole);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [showCompliance, setShowCompliance] = useState(false);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  
  const [payrollRun, setPayrollRun] = useState<PayrollRun | null>(null);
  const [snapshots, setSnapshots] = useState<PayrollSnapshot[]>([]);
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [generatingPayroll, setGeneratingPayroll] = useState(false);
  const [approvedLeaves, setApprovedLeaves] = useState<LeaveRequest[]>([]);
  const [payrollRules, setPayrollRules] = useState<Record<string, string>>({});
  const [globalShiftWindows, setGlobalShiftWindows] = useState<any>(DEFAULT_SHIFT_WINDOWS);

  useEffect(() => {
    const loadData = async () => {
      try {
        const run = await payrollService.getPayrollRun(selectedMonth, selectedYear);
        setPayrollRun(run);
        if (run) {
          const snaps = await payrollService.getSnapshots(run.id);
          setSnapshots(snaps);
        } else {
          setSnapshots([]);
        }

        // Load approved leaves for this month to include in attendance
        const allLeaves = await leaveService.getAll();
        const approved = allLeaves.filter(l => l.status === 'approved');
        setApprovedLeaves(approved);

        const rules = await payrollRulesService.getPayrollRules();
        setPayrollRules(rules);

        const shifts = await shiftService.loadGlobal();
        setGlobalShiftWindows(shifts);
      } catch (error) {
        console.error('Failed to load data:', error);
      }
    };
    loadData();
  }, [selectedMonth, selectedYear]);

  // Fetch locations on mount
  React.useEffect(() => {
    const fetchLocations = async () => {
      // Dynamic import to avoid circular dependency
      const { locationService } = await import('../services/locationService');
      const locs = await locationService.getLocations();
      setLocations(locs);
    };
    fetchLocations();
  }, []);

  const [locationFilter, setLocationFilter] = useState<string>('All');
  const [paymentModeFilter, setPaymentModeFilter] = useState<string>('All');
  const [floorFilter, setFloorFilter] = useState<string>('All');
  const [designationFilter, setDesignationFilter] = useState<string>('All');
  const [accommodationFilter, setAccommodationFilter] = useState<string>('All');
  const [editMode, setEditMode] = useState(false);
  const [tempAdvances, setTempAdvances] = useState<{ [key: string]: TempSalaryData }>({});
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [showAdvanceEntryModal, setShowAdvanceEntryModal] = useState<string | null>(null);
  const [advanceEntries, setAdvanceEntries] = useState<{ [staffId: string]: AdvanceEntry[] }>({});
  const [advanceForm, setAdvanceForm] = useState({ entryDate: new Date().toISOString().split('T')[0], amount: 0, purpose: '', deductPeriods: 1, startDeductMonth: undefined as number | undefined, startDeductYear: undefined as number | undefined });
  const [scheduledDeductions, setScheduledDeductions] = useState<{ [staffId: string]: { total: number; breakdown: DeductionBreakdown[] } }>({});
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [modalAdvanceEntries, setModalAdvanceEntries] = useState<AdvanceEntry[]>([]);

  const getDefaultDate = (month: number, year: number) => {
    const now = new Date();
    if (month === now.getMonth() && year === now.getFullYear()) {
      return now.toISOString().split('T')[0];
    }
    return `${year}-${String(month + 1).padStart(2, '0')}-01`;
  };

  const loadAllAdvanceEntries = async () => {
    const { supabase } = await import('../lib/supabase');
    // 1. Load entries created in this month (for Cur Adv sum)
    const { data, error } = await dataApi
      .from('advance_entries')
      .select('*')
      .eq('month', selectedMonth)
      .eq('year', selectedYear);
    if (error) { console.error('Error loading advance entries:', error); return; }

    const grouped: { [k: string]: AdvanceEntry[] } = {};
    (data || []).forEach((row: any) => {
      const e = advanceEntryService.mapFromDatabase(row);
      if (!grouped[e.staffId]) grouped[e.staffId] = [];
      grouped[e.staffId].push(e);
    });

    // 2. Also load entries from OTHER months that have deductions active in this month
    const activeEntries = await advanceEntryService.getActiveForMonth(selectedMonth, selectedYear);
    activeEntries.forEach(e => {
      // Don't duplicate entries already loaded from this month
      if (e.month === selectedMonth && e.year === selectedYear) return;
      if (!grouped[e.staffId]) grouped[e.staffId] = [];
      // Avoid duplicates by id
      if (!grouped[e.staffId].some(ex => ex.id === e.id)) {
        grouped[e.staffId].push(e);
      }
    });

    setAdvanceEntries(grouped);
  };

  // Load all date-wise advance entries for the selected month (used to auto-sum into Cur Adv)
  // Also loads entries from previous months that have active deduction schedules spanning into this month
  useEffect(() => {
    loadAllAdvanceEntries();
  }, [selectedMonth, selectedYear]);

  // Compute scheduled deductions from multi-period advance entries
  useEffect(() => {
    const computed: typeof scheduledDeductions = {};
    Object.entries(advanceEntries).forEach(([staffId, entries]) => {
      computed[staffId] = computeScheduledDeductions(entries, selectedMonth, selectedYear);
    });
    setScheduledDeductions(computed);
  }, [advanceEntries, selectedMonth, selectedYear]);
  const [showSalaryColumnPicker, setShowSalaryColumnPicker] = useState(false);
  const [expandedSalaryCard, setExpandedSalaryCard] = useState<string | null>(null);
  const [salaryVisibleCols, setSalaryVisibleCols] = useUserPreference<Record<string, boolean>>(
    'salaryVisibleColumns',
    {
      location: true, type: true, payment: true, floor: true, designation: true,
      present: true, leave: true, sunAbs: true, oldAdv: true, curAdv: true,
      sunPenalty: true, lateComingDeduction: true, earlyLeaveDeduction: true, statutory: true, esi: true, pf: true, gross: true, net: true, newAdv: true
    }
  );
  const toggleSalaryCol = (col: string) => {
    setSalaryVisibleCols(prev => {
      const updated = { ...prev, [col]: !prev[col] };
      return updated;
    });
  };
  const salaryColLabels: Record<string, string> = {
    location: 'Branch', type: 'Type', payment: 'Payment', floor: 'Zone', designation: 'Designation',
    present: 'Present', leave: 'Leave', sunAbs: 'Sun Abs', oldAdv: 'Old Adv', curAdv: 'Cur Adv',
    deduction: 'Deduction', basic: 'Basic', incentive: 'Incentive', hra: 'HRA', meal: 'Meal',
    sunPenalty: 'Sun Penalty', lateComingDeduction: 'Late Coming Ded.', earlyLeaveDeduction: 'Early Leave Ded.', statutory: hideStatutoryExtras(userRole) ? 'Deductions' : 'ESI/PF/Statutory', esi: 'ESI', pf: 'PF', gross: 'Gross', net: 'Net Payroll', newAdv: 'New Adv'
  };
  const [salaryCategories, setSalaryCategories] = useState<SalaryCategory[]>(() => salaryCategoryService.getCategoriesSync());
  const [showBulkSender, setShowBulkSender] = useState(false);
  const [overrideConfig, setOverrideConfig] = useState<any>({
    oldAdvance: false,
    currentAdvance: false,
    deduction: false,
    basic: false,
    incentive: false,
    hra: false,
    mealAllowance: false,
    sundayPenalty: false
  });

  useEffect(() => {
    // Load override config
    const loadConfig = async () => {
      try {
        const saved = await appSettingsService.getSetting('salary_override_config');
        if (saved) {
          const parsed = JSON.parse(saved);
          setOverrideConfig({
            oldAdvance: parsed.oldAdvance === true,
            currentAdvance: parsed.currentAdvance === true,
            deduction: parsed.deduction === true,
            basic: parsed.basic === true,
            incentive: parsed.incentive === true,
            hra: parsed.hra === true,
            mealAllowance: parsed.mealAllowance === true,
            sundayPenalty: parsed.sundayPenalty === true
          });
        } else {
          setOverrideConfig({
            oldAdvance: false,
            currentAdvance: false,
            deduction: false,
            basic: false,
            incentive: false,
            hra: false,
            mealAllowance: false,
            sundayPenalty: false
          });
        }
      } catch (e) {
        console.error(e);
      }
    };
    loadConfig();
  }, []);

  // Load categories from DB on mount
  useEffect(() => {
    salaryCategoryService.getCategories().then(setSalaryCategories);
  }, []);

  const customCategories = salaryCategories.filter((c: PayrollCategory) => !['basic', 'incentive', 'hra', 'meal_allowance'].includes(c.id) && !c.isDeleted);

  // Load monthly overrides
  React.useEffect(() => {
    const loadOverrides = async () => {
      const overrides = await salaryOverrideService.getOverrides(selectedMonth + 1, selectedYear);
      const newTempAdvances: { [key: string]: TempSalaryData } = {};

      overrides.forEach(ov => {
        // Find existing advance data to preserve old/current advance if needed,
        // but here we primarily care about salary components.
        // We recalculate the totals based on overrides.

        // Note: We need the BASE values to calculate correctly? 
        // No, the override REPLACES the base value in the calculation.
        // But for "net", we need deduction etc.
        // Since we don't have all data here easily, strictly speaking, 
        // we should merge with existing tempAdvances or initialize carefully.

        const basicVal = ov.basicOverride;
        const incentiveVal = ov.incentiveOverride;
        const hraVal = ov.hraOverride;
        const mealVal = ov.mealAllowanceOverride;
        const sundayVal = ov.sundayPenaltyOverride;

        // If we have any override, we initialize the temp object
        if (basicVal !== undefined || incentiveVal !== undefined || hraVal !== undefined || mealVal !== undefined || sundayVal !== undefined) {
          newTempAdvances[ov.staffId] = {
            basicOverride: basicVal,
            incentiveOverride: incentiveVal,
            hraOverride: hraVal,
            mealAllowanceOverride: mealVal,
            sundayPenaltyOverride: sundayVal,
            // We can't easily calc gross/net here without knowing defaults (advances/deductions)
            // But the UI will use these overrides when switching to edit mode?
            // Actually, if we just set these, the `getEffectiveSalary` helper (if it exists) would work.
            // But existing code expects `grossSalary` in tempData?
          };
        }
      });

      setTempAdvances(_prev => {
        // Merge with previous to not lose other edits if any (though usually we load on mount/month change)
        // Actually, we should merge carefully.
        // For now, let's just use the loaded overrides as the base state for this month.
        return newTempAdvances;
      });

      // If we have overrides, we should probably turn on edit mode for those rows? 
      // Or just having the data there allows the "Edit" button to show them?
      // When user clicks "Edit All", it initializes tempAdvances. 
      // We need to ensure that initialization RESPECTS these loaded overrides.
    };
    loadOverrides();
  }, [selectedMonth, selectedYear]);

  // Filter staff to active ones OR inactive ones that have data for the selected month
  const activeStaff = staff.filter(s => {
    if (s.isActive) return true;
    const hasAttendance = (Array.isArray(attendance) ? attendance : []).some(a => 
      a.staffId === s.id && 
      new Date(a.date).getMonth() === selectedMonth && 
      new Date(a.date).getFullYear() === selectedYear
    );
    if (hasAttendance) return true;
    const hasAdvances = advances.some(a => 
      a.staffId === s.id && 
      a.month === selectedMonth && 
      a.year === selectedYear && 
      (a.currentAdvance > 0 || a.oldAdvance > 0 || a.deduction > 0 || (a.newAdvance && a.newAdvance > 0))
    );
    if (hasAdvances) return true;
    return false;
  }).filter(member => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    const haystack = [
      member.name, member.location, member.floor, member.designation,
      member.experience, member.type, member.staffAccommodation,
      member.contactNumber, member.bankName, member.bankAccountNumber,
      member.ifscCode, member.pfNumber, member.esiNumber, member.paymentMode,
      String(member.basicPayroll ?? ''), String(member.incentive ?? ''),
      String(member.hra ?? ''), String(member.mealAllowance ?? ''), String(member.totalPayroll ?? '')
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(query);
  });

  // Filter staff by location and payment mode
  const getStaffForDisplay = (staffId: string) => {
    if (payrollRun && snapshots.length > 0) {
      const snap = snapshots.find(s => s.staffId === staffId);
      if (snap) return snap.staffSnapshot;
    }
    return staff.find(s => s.id === staffId);
  };

  const getBaseStaffList = () => {
    if (payrollRun && snapshots.length > 0) {
      return snapshots.map(s => s.staffSnapshot);
    }
    return activeStaff;
  };

  const filteredStaff = getBaseStaffList().filter(member => {
    if (locationFilter !== 'All' && member.location !== locationFilter) return false;
    if (paymentModeFilter !== 'All' && (member.paymentMode || 'cash') !== paymentModeFilter) return false;
    if (floorFilter !== 'All' && (member.floor || '') !== floorFilter) return false;
    if (designationFilter !== 'All' && (member.designation || '') !== designationFilter) return false;
    if (accommodationFilter !== 'All' && (member.staffAccommodation || '') !== accommodationFilter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!member.name.toLowerCase().includes(query) && 
          !(member.employeeCode && member.employeeCode.toLowerCase().includes(query))) {
        return false;
      }
    }
    return true;
  });

  // State for monthly overrides
  const [overrides, setOverrides] = useState<{ [key: string]: PayrollOverride }>({});

  // Load monthly overrides
  React.useEffect(() => {
    const loadOverrides = async () => {
      const dbOverrides = await salaryOverrideService.getOverrides(selectedMonth + 1, selectedYear);
      const overridesMap: { [key: string]: PayrollOverride } = {};

      const newTempAdvances: { [key: string]: TempSalaryData } = {};

      dbOverrides.forEach(ov => {
        overridesMap[ov.staffId] = ov;

        const basicVal = ov.basicOverride;
        const incentiveVal = ov.incentiveOverride;
        const hraVal = ov.hraOverride;
        const mealVal = ov.mealAllowanceOverride;
        const sundayVal = ov.sundayPenaltyOverride;

        if (basicVal !== undefined || incentiveVal !== undefined || hraVal !== undefined || mealVal !== undefined || sundayVal !== undefined) {
          newTempAdvances[ov.staffId] = {
            basicOverride: basicVal,
            incentiveOverride: incentiveVal,
            hraOverride: hraVal,
            mealAllowanceOverride: mealVal,
            sundayPenaltyOverride: sundayVal,
          };
        }
      });

      setOverrides(overridesMap);
      setTempAdvances(newTempAdvances);
    };
    loadOverrides();
  }, [selectedMonth, selectedYear]);


  const calculateSalaryDetails = (): PayrollDetail[] => {
    if (payrollRun && snapshots.length > 0) {
      return snapshots
        .filter(s => filteredStaff.some(fs => fs.id === s.staffId))
        .map(s => s.salaryDetail);
    }

    return filteredStaff.map(member => {
      const attendanceMetrics = calculateAttendanceMetrics(member.id, attendance, selectedYear, selectedMonth, approvedLeaves);
      const memberAdvances = advances.find(adv =>
        adv.staffId === member.id &&
        adv.month === selectedMonth &&
        adv.year === selectedYear
      );

      const memberAdvanceEntries = advanceEntries[member.id] || [];
      const baseDetail = calculatePayroll(
        member,
        attendanceMetrics,
        memberAdvances ?? null,
        advances,
        attendance,
        selectedMonth,
        selectedYear,
        memberAdvanceEntries,
        overrideConfig,
        scheduledDeductions[member.id]?.total || 0,
        globalShiftWindows,
        payrollRules
      );
      const mergedDetail = baseDetail;

      // Merge with overrides if present
      const override = overrides[member.id];
      let resultDetail: PayrollDetail = mergedDetail;
      if (override) {
        const basic = Number(override.basicOverride ?? mergedDetail.basicEarned) || 0;
        const incentive = Number(override.incentiveOverride ?? mergedDetail.incentiveEarned) || 0;
        const hra = Number(override.hraOverride ?? mergedDetail.hraEarned) || 0;
        const meal = Number(override.mealAllowanceOverride ?? mergedDetail.mealAllowance) || 0;
        const sundayPenalty = Number(override.sundayPenaltyOverride ?? mergedDetail.sundayPenalty) || 0;
        const lateComingDeduction = Number(override.lateComingDeductionOverride ?? mergedDetail.lateComingDeduction) || 0;
        const earlyLeaveDeduction = Number(override.earlyLeaveDeductionOverride ?? mergedDetail.earlyLeaveDeduction) || 0;

        const gross = roundToNearest10(basic + incentive + hra + meal);
        const net = Math.max(0, roundToNearest10(gross - (mergedDetail.curAdv || 0) - (mergedDetail.deduction || 0) - sundayPenalty - lateComingDeduction - earlyLeaveDeduction));

        resultDetail = {
          ...mergedDetail,
          basicEarned: basic,
          incentiveEarned: incentive,
          hraEarned: hra,
          mealAllowance: meal,
          sundayPenalty: sundayPenalty,
          lateComingDeduction,
          earlyLeaveDeduction,
          grossPayroll: gross,
          netPayroll: net
        };
      }

      // Apply statutory deductions (ESI / PF / PT / TDS / Custom) — subtract from net
      const breakdown = computeStatutoryBreakdown(member, {
        basic: resultDetail.basicEarned,
        hra: resultDetail.hraEarned,
        incentive: resultDetail.incentiveEarned,
        gross: resultDetail.grossPayroll ?? resultDetail.grossSalary ?? 0,
      }, { month: selectedMonth, year: selectedYear });
      const statutoryTotal = breakdown.reduce((s, b) => s + b.amount, 0);
      const netBase = resultDetail.netPayroll ?? resultDetail.netSalary ?? 0;
      if (statutoryTotal > 0) {
        resultDetail = {
          ...resultDetail,
          statutoryTotal,
          statutoryBreakdown: breakdown.map(b => ({ key: b.key, label: b.label, amount: b.amount })),
          nonStatutoryNet: netBase,
          netPayroll: Math.max(0, roundToNearest10(netBase - statutoryTotal)),
          netSalary: Math.max(0, roundToNearest10(netBase - statutoryTotal)),
        };
      } else {
        resultDetail = { ...resultDetail, statutoryTotal: 0, statutoryBreakdown: [], nonStatutoryNet: netBase };
      }
      return resultDetail;
    });
  };

  // Calculate part-time salaries
  const calculatePartTimeSalaries = (): PartTimeSalaryDetail[] => {
    const monthlyAttendance = (Array.isArray(attendance) ? attendance : []).filter(record => {
      const recordDate = new Date(record.date);
      return record.isPartTime &&
        recordDate.getMonth() === selectedMonth &&
        recordDate.getFullYear() === selectedYear;
    });

    const uniqueStaff = new Map();
    monthlyAttendance.forEach(record => {
      if (record.staffName) {
        uniqueStaff.set(record.staffName, {
          name: record.staffName,
          location: record.location || 'Unknown',
          floor: record.floor || ''
        });
      }
    });

    return Array.from(uniqueStaff.values()).map(staff =>
      calculatePartTimePayroll(
        staff.name,
        staff.location,
        staff.floor,
        attendance,
        selectedYear,
        selectedMonth
      )
    );
  };

  const salaryDetails = calculateSalaryDetails();
  const partTimeSalaries = calculatePartTimeSalaries();
  const salaryValidation = validateSalaryBatch(
    salaryDetails,
    (id: string) => getStaffForDisplay(id)?.name
  );
  const [showValidationDetails, setShowValidationDetails] = useState(false);
  const [anomalyReport, setAnomalyReport] = useState<AnomalyReport | null>(null);

  const blockIfInvalid = (action: string): boolean => {
    if (salaryValidation.errorCount > 0) {
      customAlert(
        `${salaryValidation.errorCount} salary record(s) do not reconcile. Fix them before ${action}. Open "Salary checks" for details.`
      );
      setShowValidationDetails(true);
      return true;
    }
    if (anomalyReport && anomalyReport.criticalCount > 0) {
      customAlert(
        `${anomalyReport.criticalCount} critical payroll issue(s) detected. Resolve them in "Pre-run checks" before ${action}.`
      );
      return true;
    }
    return false;
  };

  const totalSalaryDisbursed = salaryDetails.reduce((sum, detail) => sum + (Number(detail.netPayroll ?? detail.netSalary) || 0), 0);
  const totalPartTimeEarnings = partTimeSalaries.reduce((sum, salary) => sum + (Number(salary.totalEarnings) || 0), 0);
  const averageAttendance = salaryDetails.length > 0
    ? salaryDetails.reduce((sum, detail) => sum + (Number(detail.presentDays) || 0) + ((Number(detail.halfDays) || 0) * 0.5), 0) / salaryDetails.length
    : 0;

  const handleEnableEditAll = async () => {
    // Always re-load the override config fresh from DB before enabling edit
    let freshConfig = overrideConfig;
    try {
      const saved = await appSettingsService.getSetting('salary_override_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        freshConfig = {
          oldAdvance: parsed.oldAdvance === true,
          currentAdvance: parsed.currentAdvance === true,
          deduction: parsed.deduction === true,
          basic: parsed.basic === true,
          incentive: parsed.incentive === true,
          hra: parsed.hra === true,
          mealAllowance: parsed.mealAllowance === true,
          sundayPenalty: parsed.sundayPenalty === true
        };
        setOverrideConfig(freshConfig);
      }
    } catch (e: any) {
      console.error('[SalaryManagement] Error loading override config:', e);
    }

    const initialTempAdvances: { [key: string]: TempSalaryData } = {};

    activeStaff.forEach(member => {
      const currentAdvances = advances.find(adv =>
        adv.staffId === member.id &&
        adv.month === selectedMonth &&
        adv.year === selectedYear
      );

      // Get previous month's advance for old advance
      let prevMonth = selectedMonth - 1;
      let prevYear = selectedYear;
      if (prevMonth < 0) {
        prevMonth = 11;
        prevYear = selectedYear - 1;
      }

      const previousAdvance = advances.find(adv =>
        adv.staffId === member.id &&
        adv.month === prevMonth &&
        adv.year === prevYear
      );

      // Get the salary detail for this member
      const detail = salaryDetails.find(d => d.staffId === member.id);

      const oldAdv = detail?.oldAdv ?? currentAdvances?.oldAdvance ?? previousAdvance?.newAdvance ?? 0;
      const curAdv = detail?.curAdv ?? currentAdvances?.currentAdvance ?? 0;
      const deduction = detail?.deduction ?? currentAdvances?.deduction ?? 0;
      const overrides = currentAdvances?.overrides || {};
      
      const basicVal = overrides.basic ?? detail?.basicEarned ?? 0;
      const incentiveVal = overrides.incentive ?? detail?.incentiveEarned ?? 0;
      const hraVal = overrides.hra ?? detail?.hraEarned ?? 0;
      const mealAllowanceVal = overrides.mealAllowance ?? detail?.mealAllowance ?? 0;
      const sundayPenaltyVal = overrides.sundayPenalty ?? detail?.sundayPenalty ?? 0;
      const staffOverride = overrides[member.id] as any;
      const lateComingDeductionVal = staffOverride?.lateComingDeductionOverride ?? detail?.lateComingDeduction ?? 0;
      const earlyLeaveDeductionVal = staffOverride?.earlyLeaveDeductionOverride ?? detail?.earlyLeaveDeduction ?? 0;

      const grossPayroll = roundToNearest10(basicVal + incentiveVal + hraVal + mealAllowanceVal);
      const netPayroll = roundToNearest10(grossPayroll - deduction - sundayPenaltyVal - lateComingDeductionVal - earlyLeaveDeductionVal);
      const newAdvance = roundToNearest10(oldAdv + curAdv - deduction);

      initialTempAdvances[member.id] = {
        oldAdvance: oldAdv,
        currentAdvance: curAdv,
        originalCurrentAdvance: currentAdvances?.currentAdvance,
        deduction: deduction,
        basicOverride: basicVal,
        incentiveOverride: incentiveVal,
        hraOverride: hraVal,
        mealAllowanceOverride: mealAllowanceVal,
        sundayPenaltyOverride: sundayPenaltyVal,
        lateComingDeductionOverride: lateComingDeductionVal,
        earlyLeaveDeductionOverride: earlyLeaveDeductionVal,
        grossPayroll: grossPayroll,
        netPayroll: netPayroll,
        newAdvance: newAdvance
      };
    });

    setTempAdvances(initialTempAdvances);
    setEditMode(true);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const savePromises = Object.keys(tempAdvances).map(staffId => {
        const temp = tempAdvances[staffId];
        const detail = salaryDetails.find(d => d.staffId === staffId);
        if (temp) {
          let finalCurAdv = temp.currentAdvance ?? 0;
          // If the user didn't change the value from the displayed total,
          // save the original manual value to avoid freezing the date-wise auto-sum
          if (temp.currentAdvance === detail?.curAdv && temp.originalCurrentAdvance !== undefined) {
            finalCurAdv = temp.originalCurrentAdvance ?? 0;
          }

          const newAdvance = roundToNearest10((temp.oldAdvance || 0) + (temp.currentAdvance || 0) - (temp.deduction || 0));

          const overridesObj: Record<string, number> = {};
          if (overrideConfig?.basic) overridesObj.basic = temp.basicOverride || 0;
          if (overrideConfig?.incentive) overridesObj.incentive = temp.incentiveOverride || 0;
          if (overrideConfig?.hra) overridesObj.hra = temp.hraOverride || 0;
          if (overrideConfig?.mealAllowance) overridesObj.mealAllowance = temp.mealAllowanceOverride || 0;
          if (overrideConfig?.sundayPenalty) overridesObj.sundayPenalty = temp.sundayPenaltyOverride || 0;
          
          overridesObj.lateComingDeduction = temp.lateComingDeductionOverride || 0;
          overridesObj.earlyLeaveDeduction = temp.earlyLeaveDeductionOverride || 0;

          return onUpdateAdvances(staffId, selectedMonth, selectedYear, {
            oldAdvance: temp.oldAdvance ?? 0,
            currentAdvance: finalCurAdv ?? 0,
            deduction: temp.deduction ?? 0,
            newAdvance: newAdvance ?? 0,
            overrides: Object.keys(overridesObj).length > 0 ? overridesObj : undefined,
            updatedAt: new Date().toISOString()
          });
        }
        return Promise.resolve();
      });

      await Promise.all(savePromises);

      // --- Distribute actual deductions across advance entries and update totalDeducted ---
      try {
        for (const staffId of Object.keys(tempAdvances)) {
          const temp = tempAdvances[staffId];
          if (!temp) continue;

          const actualDeduction = temp.deduction ?? 0;
          if (actualDeduction <= 0) continue;

          const staffEntries = advanceEntries[staffId] || [];
          const scheduled = computeScheduledDeductions(staffEntries, selectedMonth, selectedYear);
          if (scheduled.breakdown.length === 0) continue;

          // Distribute actual deduction pro-rata based on scheduled amounts
          const scheduledTotal = scheduled.total || 1; // avoid div by 0
          let distributed = 0;

          for (let i = 0; i < scheduled.breakdown.length; i++) {
            const bd = scheduled.breakdown[i];
            const entry = staffEntries.find(e => e.id === bd.entryId);
            if (!entry) continue;

            let share: number;
            if (i === scheduled.breakdown.length - 1) {
              // Last entry gets remainder to avoid rounding drift
              share = actualDeduction - distributed;
            } else {
              share = Math.round((bd.amount / scheduledTotal) * actualDeduction);
            }

            // Cap at remaining balance for this entry
            const currentDeducted = entry.totalDeducted || 0;
            const remaining = entry.amount - currentDeducted;
            share = Math.min(Math.max(0, share), remaining);
            distributed += share;

            if (share > 0) {
              await advanceEntryService.updateTotalDeducted(entry.id, currentDeducted + share);
            }
          }
        }

        // Reload advance entries to reflect updated balances
        const { supabase: sb } = await import('../lib/supabase');
        const { data: refreshData } = await sb
          .from('advance_entries')
          .select('*')
          .eq('month', selectedMonth)
          .eq('year', selectedYear);
        if (refreshData) {
          const grouped: { [k: string]: AdvanceEntry[] } = {};
          refreshData.forEach((row: any) => {
            const e = advanceEntryService.mapFromDatabase(row);
            if (!grouped[e.staffId]) grouped[e.staffId] = [];
            grouped[e.staffId].push(e);
          });
          setAdvanceEntries(grouped);
        }
      } catch (distErr) {
        console.error('Error distributing deductions:', distErr);
        // Non-fatal: salary was saved, deduction tracking may be slightly off
      }

      setEditMode(false);
      setTempAdvances({});
    } catch (error: any) {
      console.error('Error saving advances:', error);
      await customAlert('Error saving advances: ' + (error?.message || JSON.stringify(error)));
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditMode(false);
    setTempAdvances({});
  };

  const handleExportExcel = () => {
    if (!payrollRun) return customAlert('Please generate payroll first.');
    exportSalaryToExcel(salaryDetails, partTimeSalaries, getBaseStaffList(), selectedMonth, selectedYear);
  };

  const handleExportPDF = () => {
    if (!payrollRun) return customAlert('Please generate payroll first.');
    if (blockIfInvalid('exporting the PDF')) return;
    exportSalaryPDF(salaryDetails, partTimeSalaries, getBaseStaffList(), selectedMonth, selectedYear);
  };

  const handleDownloadAllSlips = () => {
    if (!payrollRun) return customAlert('Please generate payroll first.');
    if (blockIfInvalid('downloading salary slips')) return;
    exportBulkSalarySlipsPDF(salaryDetails, getBaseStaffList(), selectedMonth, selectedYear);
  };

  const handleGeneratePayroll = async () => {
    if (blockIfInvalid('generating payroll')) return;
    if (!await customConfirm('Generate Payroll', 'Are you sure you want to generate payroll for this month? This will snapshot the current salaries and lock them.')) return;
    setGeneratingPayroll(true);
    try {
      const fullDetails = activeStaff.map(member => {
        const attendanceMetrics = calculateAttendanceMetrics(member.id, attendance, selectedYear, selectedMonth, approvedLeaves);
        const memberAdvances = advances.find(adv => adv.staffId === member.id && adv.month === selectedMonth && adv.year === selectedYear);
        const memberAdvanceEntries = advanceEntries[member.id] || [];
        return calculatePayroll(member, attendanceMetrics, memberAdvances ?? null, advances, attendance, selectedMonth, selectedYear, memberAdvanceEntries, overrides[member.id], scheduledDeductions[member.id]?.total || 0, globalShiftWindows, payrollRules);
      });

      const run = await payrollService.generatePayroll(selectedMonth, selectedYear, activeStaff, fullDetails, 'System');
      setPayrollRun(run);
      const snaps = await payrollService.getSnapshots(run.id);
      setSnapshots(snaps);
      customAlert('Payroll generated successfully!', 'success');
    } catch (err: any) {
      customAlert('Failed to generate payroll: ' + err.message, 'error');
    } finally {
      setGeneratingPayroll(false);
    }
  };

  const handleRegeneratePayroll = async () => {
    if (!await customConfirm('Regenerate Payroll', 'DANGER: This will delete the current snapshot and recalculate using current master data. Are you sure?')) return;
    setGeneratingPayroll(true);
    try {
      const fullDetails = activeStaff.map(member => {
        const attendanceMetrics = calculateAttendanceMetrics(member.id, attendance, selectedYear, selectedMonth, approvedLeaves);
        const memberAdvances = advances.find(adv => adv.staffId === member.id && adv.month === selectedMonth && adv.year === selectedYear);
        const memberAdvanceEntries = advanceEntries[member.id] || [];
        return calculatePayroll(member, attendanceMetrics, memberAdvances ?? null, advances, attendance, selectedMonth, selectedYear, memberAdvanceEntries, overrides[member.id], scheduledDeductions[member.id]?.total || 0, globalShiftWindows, payrollRules);
      });

      const run = await payrollService.regeneratePayroll(selectedMonth, selectedYear, activeStaff, fullDetails, 'System');
      setPayrollRun(run);
      const snaps = await payrollService.getSnapshots(run.id);
      setSnapshots(snaps);
      customAlert('Payroll regenerated successfully!', 'success');
    } catch (err: any) {
      customAlert('Failed to regenerate payroll: ' + err.message, 'error');
    } finally {
      setGeneratingPayroll(false);
    }
  };

  // ── Maker–checker workflow actions ───────────────────────────────────────
  const runWorkflow = async (fn: () => Promise<PayrollRun>, successMsg: string) => {
    setWorkflowBusy(true);
    try {
      const updated = await fn();
      setPayrollRun(updated);
      customAlert(successMsg, 'success');
    } catch (err: any) {
      customAlert(err.message || 'Action failed', 'error');
    } finally {
      setWorkflowBusy(false);
    }
  };

  const handleSubmitForApproval = async () => {
    if (!payrollRun) return;
    if (blockIfInvalid('submitting payroll for approval')) return;
    if (!await customConfirm('Submit for Approval', 'Send this payroll run to an admin for review? You will not be able to edit it while it is pending.')) return;
    runWorkflow(() => payrollService.submitForApproval(payrollRun.id), 'Payroll submitted for approval.');
  };

  const handleApproveRun = async () => {
    if (!payrollRun) return;
    if (!await customConfirm('Approve Payroll', 'Approve this payroll run? It becomes read-only after approval.')) return;
    runWorkflow(() => payrollService.approveRun(payrollRun.id), 'Payroll approved.');
  };

  const handleRejectRun = async () => {
    if (!payrollRun) return;
    const reason = window.prompt('Reason for rejection (sent back to the maker):');
    if (!reason || !reason.trim()) return;
    runWorkflow(() => payrollService.rejectRun(payrollRun.id, reason.trim()), 'Payroll sent back for corrections.');
  };

  const handleLockRun = async () => {
    if (!payrollRun) return;
    if (!await customConfirm('Lock & Disburse', 'Lock this payroll run permanently for disbursement? This cannot be undone.')) return;
    runWorkflow(() => payrollService.lockRun(payrollRun.id), 'Payroll locked for disbursement.');
  };

  const runBadge = (() => {
    switch (payrollRun?.status) {
      case 'PendingApproval':
        return { label: 'Pending Approval', className: 'text-amber-700 bg-amber-50 border-amber-200' };
      case 'Approved':
        return { label: 'Approved', className: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
      case 'Rejected':
        return { label: 'Rejected — needs correction', className: 'text-red-700 bg-red-50 border-red-200' };
      case 'Locked':
        return { label: 'Locked & Disbursed', className: 'text-slate-700 bg-slate-100 border-slate-300' };
      default:
        return { label: 'Payroll Generated', className: 'text-green-700 bg-green-50 border-green-200' };
    }
  })();


  const handleDownloadSingleSlip = (detail: PayrollDetail) => {
    const staffMember = getStaffForDisplay(detail.staffId);
    if (staffMember) {
      generateSalarySlipPDF(detail, staffMember, selectedMonth, selectedYear);
    }
  };

  // WhatsApp share salary slip
  const handleWhatsAppShare = async (detail: PayrollDetail) => {
    const staffMember = getStaffForDisplay(detail.staffId);
    if (!staffMember) return;

    const phoneNumber = staffMember.contactNumber?.replace(/[^0-9]/g, '');
    if (!phoneNumber) {
      await customAlert(`No phone number found for ${staffMember.name}. Please add contact number in Staff Management.`);
      return;
    }

    // Format phone number for India (add 91 if not present)
    const formattedPhone = phoneNumber.startsWith('91') ? phoneNumber : `91${phoneNumber}`;

    const monthName = new Date(0, selectedMonth).toLocaleString('default', { month: 'long' });
    const presentDays = (detail.presentDays + detail.halfDays * 0.5).toFixed(1);
    const leaveDays = (detail.leaveDays - detail.halfDays * 0.5).toFixed(1);

    // Get salary category names
    const basicName = salaryCategories.find((c: PayrollCategory) => c.id === 'basic')?.name || 'Basic';
    const incentiveName = salaryCategories.find((c: PayrollCategory) => c.id === 'incentive')?.name || 'Incentive';
    const hraName = salaryCategories.find((c: PayrollCategory) => c.id === 'hra')?.name || 'HRA';
    const mealName = salaryCategories.find((c: PayrollCategory) => c.id === 'meal_allowance')?.name || 'Meal Allowance';

    // Custom supplements for this staff member
    const staffMemberData = staff.find(s => s.id === detail.staffId);
    const customSupplLines = customCategories
      .map((cat: PayrollCategory) => {
        const val = staffMemberData?.salarySupplements?.[cat.key] || staffMemberData?.salarySupplements?.[cat.id] || 0;
        return val > 0 ? `• ${cat.name}: ₹${val.toLocaleString()}\n` : '';
      })
      .filter(Boolean)
      .join('');

    // Format salary slip message
    const message = `📋 *SALARY SLIP*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `👤 *Name:* ${staffMember.name}\n` +
      `📅 *Month:* ${monthName} ${selectedYear}\n` +
      `📍 *Branch:* ${staffMember.location}\n` +
      (staffMember.floor ? `🏢 *Zone:* ${staffMember.floor}\n` : '') +
      (staffMember.designation ? `💼 *Designation:* ${staffMember.designation}\n` : '') +
      (staffMember.staffAccommodation ? `🏠 *Type:* ${staffMember.staffAccommodation === 'day_scholar' ? 'Day Scholar' : 'Accommodation Provided'}\n` : '') +
      `━━━━━━━━━━━━━━━━━━\n\n` +
      `📊 *ATTENDANCE*\n` +
      `• Present Days: ${presentDays}\n` +
      `• Leave Days: ${leaveDays}\n` +
      `• Sunday Absents: ${detail.sundayAbsents}\n\n` +
      `💰 *EARNINGS*\n` +
      `• ${basicName}: ₹${detail.basicEarned.toLocaleString()}\n` +
      `• ${incentiveName}: ₹${detail.incentiveEarned.toLocaleString()}\n` +
      `• ${hraName}: ₹${detail.hraEarned.toLocaleString()}\n` +
      `• ${mealName}: ₹${detail.mealAllowance.toLocaleString()}\n` +
      customSupplLines +
      `\n📉 *DEDUCTIONS*\n` +
      `• Old Advance: ₹${detail.oldAdv.toLocaleString()}\n` +
      `• Current Advance: ₹${detail.curAdv.toLocaleString()}\n` +
      `• Deduction: ₹${detail.deduction.toLocaleString()}\n` +
      `• Sunday Penalty: ₹${detail.sundayPenalty.toLocaleString()}\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `💵 *Gross Payroll:* ₹${(detail.grossPayroll ?? detail.grossSalary ?? 0).toLocaleString()}\n` +
      `✅ *Net Payroll:* ₹${(detail.netPayroll ?? detail.netSalary ?? 0).toLocaleString()}\n` +
      `📌 *New Advance:* ₹${detail.newAdv.toLocaleString()}\n` +
      `━━━━━━━━━━━━━━━━━━\n\n` +
      `_Generated on ${new Date().toLocaleDateString()}_`;

    // Open WhatsApp with pre-filled message
    const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const _getAdvanceForStaff = (staffId: string) => {
    return advances.find(adv =>
      adv.staffId === staffId &&
      adv.month === selectedMonth &&
      adv.year === selectedYear
    );
  };

  const updateTempAdvance = (staffId: string, field: string, value: number) => {
    const current = tempAdvances[staffId] || {};
    const updated = { ...current, [field]: value };

    // Recalculate derived values
    const basicVal = updated.basicOverride || 0;
    const incentiveVal = updated.incentiveOverride || 0;
    const hraVal = updated.hraOverride || 0;
    const mealAllowanceVal = updated.mealAllowanceOverride || 0;
    const sundayPenaltyVal = updated.sundayPenaltyOverride || 0;
    const lateComingDeductionVal = updated.lateComingDeductionOverride || 0;
    const earlyLeaveDeductionVal = updated.earlyLeaveDeductionOverride || 0;
    const oldAdv = updated.oldAdvance || 0;
    const curAdv = updated.currentAdvance || 0;
    const deduction = updated.deduction || 0;

    // Gross = Basic + Incentive + HRA + Meal Allowance
    updated.grossPayroll = roundToNearest10(basicVal + incentiveVal + hraVal + mealAllowanceVal);
    // Net = Gross - Deduction - Sunday Penalty - Late - Early
    updated.netPayroll = roundToNearest10(updated.grossPayroll - deduction - sundayPenaltyVal - lateComingDeductionVal - earlyLeaveDeductionVal);
    // New Adv = Old Adv + Cur Adv - Deduction
    updated.newAdvance = roundToNearest10(oldAdv + curAdv - deduction);

    setTempAdvances({
      ...tempAdvances,
      [staffId]: updated
    });

    // Auto-save overrides to DB and update local overrides state
    if (['basicOverride', 'incentiveOverride', 'hraOverride', 'mealAllowanceOverride', 'sundayPenaltyOverride', 'lateComingDeductionOverride', 'earlyLeaveDeductionOverride'].includes(field)) {
      const overrideUpdate = {
        staffId,
        month: selectedMonth + 1,
        year: selectedYear,
        basicOverride: updated.basicOverride,
        incentiveOverride: updated.incentiveOverride,
        hraOverride: updated.hraOverride,
        mealAllowanceOverride: updated.mealAllowanceOverride,
        sundayPenaltyOverride: updated.sundayPenaltyOverride,
        lateComingDeductionOverride: updated.lateComingDeductionOverride,
        earlyLeaveDeductionOverride: updated.earlyLeaveDeductionOverride
      };

      // Optimistically update local state so View Mode reflects changes instantly
      setOverrides(prev => ({
        ...prev,
        [staffId]: {
          ...prev[staffId],
          id: prev[staffId]?.id || '', // Keep existing ID or empty
          ...overrideUpdate
        }
      }));

      salaryOverrideService.upsertOverride(overrideUpdate)
        .catch(err => console.error("Failed to auto-save override:", err));
    }
  };

  // Calculate totals for the table
  const calculateTotals = () => {
    if (editMode) {
      // Calculate from temp values
      let totalGross = 0;
      let totalNet = 0;
      let totalNewAdv = 0;
      let totalDeduction = 0;
      let totalOldAdv = 0;
      let totalCurAdv = 0;
      let totalESI = 0;
      let totalPF = 0;

      Object.values(tempAdvances).forEach(temp => {
        totalGross += temp.grossPayroll || 0;
        totalNet += temp.netPayroll || 0;
        totalNewAdv += temp.newAdvance || 0;
        totalDeduction += temp.deduction || 0;
        totalOldAdv += temp.oldAdvance || 0;
        totalCurAdv += temp.currentAdvance || 0;
      });

      salaryDetails.forEach(d => {
        totalESI += d.statutoryBreakdown?.find(b => b.key === 'esi')?.amount || 0;
        totalPF += d.statutoryBreakdown?.find(b => b.key === 'pf')?.amount || 0;
      });

      return { totalGross, totalNet, totalNewAdv, totalDeduction, totalOldAdv, totalCurAdv, totalESI, totalPF };
    } else {
      // Calculate from salary details
      const totalGross = salaryDetails.reduce((sum, d) => sum + (d.grossPayroll ?? d.grossSalary ?? 0), 0);
      const totalNet = salaryDetails.reduce((sum, d) => sum + (d.netPayroll ?? d.netSalary ?? 0), 0);
      const totalNewAdv = salaryDetails.reduce((sum, d) => sum + d.newAdv, 0);
      const totalDeduction = salaryDetails.reduce((sum, d) => sum + d.deduction, 0);
      const totalOldAdv = salaryDetails.reduce((sum, d) => sum + d.oldAdv, 0);
      const totalCurAdv = salaryDetails.reduce((sum, d) => sum + d.curAdv, 0);
      const totalESI = salaryDetails.reduce((sum, d) => sum + (d.statutoryBreakdown?.find(b => b.key === 'esi')?.amount || 0), 0);
      const totalPF = salaryDetails.reduce((sum, d) => sum + (d.statutoryBreakdown?.find(b => b.key === 'pf')?.amount || 0), 0);

      return { totalGross, totalNet, totalNewAdv, totalDeduction, totalOldAdv, totalCurAdv, totalESI, totalPF };
    }
  };

  const totals = calculateTotals();

  return (
    <div className="p-1 md:p-6 space-y-6">
      {/* Combined Compact Header */}
      <div className="glass-card-static p-2 md:p-4 rounded-xl border border-[var(--glass-border)]">
        <div className="flex items-center gap-2 text-[var(--text-primary)]">
          <DollarSign className="w-5 h-5 md:w-6 md:h-6 text-green-500" />
          <h1 className="text-base md:text-xl font-bold tracking-tight">Payroll Management</h1>
        </div>
      </div>

      {/* Payroll Status Banner — maker–checker workflow */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          {payrollRun ? (
            <>
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-semibold ${runBadge.className}`}>
                <span className="w-2.5 h-2.5 rounded-full bg-current opacity-70"></span>
                <span>{runBadge.label}</span>
                <span className="text-xs opacity-75">({new Date(payrollRun.generatedAt).toLocaleDateString()})</span>
              </div>
              {payrollRun.status === 'PendingApproval' && payrollRun.submittedBy && (
                <span className="text-xs text-gray-500 pl-1">Submitted by {payrollRun.submittedBy}</span>
              )}
              {payrollRun.status === 'Rejected' && payrollRun.rejectionReason && (
                <span className="text-xs text-red-600 pl-1">Reason: {payrollRun.rejectionReason}</span>
              )}
              {payrollRun.status === 'Approved' && payrollRun.approvedBy && (
                <span className="text-xs text-gray-500 pl-1">Approved by {payrollRun.approvedBy}</span>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2 text-yellow-700 bg-yellow-50 px-3 py-1.5 rounded-lg border border-yellow-200">
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500"></span>
              <span className="font-semibold text-sm">Payroll Not Generated</span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {!payrollRun ? (
            <button
              onClick={handleGeneratePayroll}
              disabled={generatingPayroll}
              className="btn-premium btn-premium-primary text-sm py-1.5"
            >
              {generatingPayroll ? 'Generating...' : 'Generate Payroll'}
            </button>
          ) : (
            <>
              {(payrollRun.status === 'Generated' || payrollRun.status === 'Rejected') && (
                <>
                  <button
                    onClick={handleSubmitForApproval}
                    disabled={workflowBusy}
                    className="px-4 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {workflowBusy ? 'Working...' : 'Submit for Approval'}
                  </button>
                  <button
                    onClick={handleRegeneratePayroll}
                    disabled={generatingPayroll}
                    className="px-4 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded-lg text-sm font-medium transition-colors"
                  >
                    {generatingPayroll ? 'Generating...' : 'Regenerate'}
                  </button>
                </>
              )}
              {payrollRun.status === 'PendingApproval' && (
                <>
                  <button
                    onClick={handleApproveRun}
                    disabled={workflowBusy}
                    className="px-4 py-1.5 bg-green-600 text-white hover:bg-green-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    onClick={handleRejectRun}
                    disabled={workflowBusy}
                    className="px-4 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    Reject
                  </button>
                </>
              )}
              {payrollRun.status === 'Approved' && (
                <button
                  onClick={handleLockRun}
                  disabled={workflowBusy}
                  className="px-4 py-1.5 bg-slate-800 text-white hover:bg-slate-900 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Lock &amp; Disburse
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Pre-run checks, variance waterfall and bank bulk-payment file */}
      <PayrollInsightsPanel
        details={salaryDetails}
        staff={getBaseStaffList()}
        month={selectedMonth}
        year={selectedYear}
        onReport={setAnomalyReport}
      />

      {(userRole === 'admin' || userRole === 'super_admin' || userRole === 'statutory_admin') && (
        <div className="border border-gray-200 rounded-xl bg-white">
          <button
            type="button"
            onClick={() => setShowCompliance(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
          >
            <span className="text-sm font-semibold text-gray-800">
              Statutory compliance — TDS, EPFO, ESIC & payslip links
            </span>
            <span className="text-xs text-blue-600">{showCompliance ? 'Hide' : 'Show'}</span>
          </button>
          {showCompliance && (
            <div className="px-4 pb-4">
              <CompliancePanel
                details={salaryDetails}
                staff={getBaseStaffList()}
                month={selectedMonth}
                year={selectedYear}
                issuedBy={currentActor().name}
              />
            </div>
          )}
        </div>
      )}




      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col md:flex-row gap-4 flex-1">
          {/* Search Bar */}
          <div className="relative flex-1 md:max-w-md">
            <input
              type="text"
              placeholder="Search by name or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-bar-premium"
            />
          </div>

          {/* Export & Action Options */}
          <div className="w-full sm:w-auto">
            <button 
              type="button"
              onClick={() => setShowExportOptions(!showExportOptions)}
              className="w-full sm:hidden flex items-center justify-between p-3.5 bg-white/5 hover:bg-white/10 rounded-xl border border-slate-200 dark:border-white/10 transition-colors"
            >
              <div className="flex items-center gap-2 text-[var(--text-primary)]">
                <Download size={18} />
                <span className="font-semibold text-sm tracking-wide">Export & Action Options</span>
              </div>
              <div className="text-[var(--text-muted)] text-xs font-medium">
                {showExportOptions ? 'Hide Actions' : 'Show Actions'}
              </div>
            </button>

            <div className={`${showExportOptions ? 'grid grid-cols-2 gap-2 p-3 mt-2 bg-white/5 rounded-xl border border-slate-200 dark:border-white/10' : 'hidden'} sm:flex sm:flex-row gap-2`}>
              <button
                onClick={handleExportExcel}
                className="btn-premium btn-premium-success whitespace-nowrap flex items-center justify-center gap-2 px-3 md:px-4 py-2 text-sm"
              >
                <FileSpreadsheet size={16} />
                <span className="hidden sm:inline">Export Excel</span>
                <span className="sm:inline">Excel</span>
              </button>
              <button
                onClick={handleExportPDF}
                className="btn-premium whitespace-nowrap flex items-center justify-center gap-2 px-3 md:px-4 py-2 text-sm"
              >
                <Download size={16} />
                <span className="hidden sm:inline">Export PDF</span>
                <span className="sm:inline">PDF</span>
              </button>
              {!hideStatutoryExtras(userRole) && (
              <div className="relative group col-span-2 sm:col-span-1">
                <button
                  className="btn-premium w-full sm:w-auto whitespace-nowrap flex items-center justify-center gap-2 px-3 md:px-4 py-2 text-sm"
                  style={{ background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)' }}
                >
                  <FileSpreadsheet size={16} />
                  <span className="hidden sm:inline">Statutory Export</span>
                  <span className="sm:inline">Stat</span>
                </button>
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50 hidden group-hover:block border border-gray-100">
                  <button onClick={() => exportStatutoryToExcel(salaryDetails, activeStaff, selectedMonth, selectedYear, 'combined')} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left">Combined ESI & PF</button>
                  <button onClick={() => exportStatutoryToExcel(salaryDetails, activeStaff, selectedMonth, selectedYear, 'esi')} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left">ESI Only</button>
                  <button onClick={() => exportStatutoryToExcel(salaryDetails, activeStaff, selectedMonth, selectedYear, 'pf')} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left">PF Only</button>
                </div>
              </div>
              )}

              <button
                onClick={handleDownloadAllSlips}
                className="btn-premium whitespace-nowrap flex items-center justify-center gap-2 px-3 md:px-4 py-2 text-sm"
                style={{ background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)' }}
                title="Download individual salary slips for all staff"
              >
                <FileText size={16} />
                <span className="hidden sm:inline">All Slips</span>
                <span className="sm:inline">Slips</span>
              </button>
              <button
                onClick={() => setShowBulkSender(true)}
                className="btn-premium whitespace-nowrap flex items-center justify-center gap-2 px-3 md:px-4 py-2 text-sm bg-[#25D366] hover:bg-[#20bd5a] text-white border-none"
                title="Rapidly send WhatsApp slips to all staff"
              >
                <MessageCircle size={16} />
                <span className="hidden sm:inline">Bulk WhatsApp</span>
                <span className="sm:inline">WA</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Options Bar */}
      <div className="glass-card-static rounded-xl overflow-hidden mb-6">
        <button 
          type="button"
          onClick={() => setShowFilters(!showFilters)}
          className="w-full flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 transition-colors"
        >
          <div className="flex items-center gap-2 text-[var(--text-primary)]">
            <Filter size={18} />
            <span className="font-semibold tracking-wide">Filter Options</span>
          </div>
          <div className="text-[var(--text-muted)] text-sm font-medium">
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </div>
        </button>

        {showFilters && (
          <div className="p-3 md:p-4 border-t border-slate-200 dark:border-white/10">
            <div className="flex flex-row items-center justify-center gap-2 md:gap-4 flex-wrap">
              <div className="flex items-center gap-1">
                <label className="text-xs font-medium text-[var(--text-muted)] hidden sm:inline">Month:</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="filter-chip"
                >
                  {Array.from({ length: 12 }, (_, i) => i)
                    .filter(i => selectedYear < new Date().getFullYear() || i <= new Date().getMonth())
                    .map(i => (
                    <option key={i} value={i}>
                      {new Date(0, i).toLocaleString('default', { month: 'short' })}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <label className="text-xs font-medium text-[var(--text-muted)] hidden sm:inline">Year:</label>
                <select
                  value={selectedYear}
                  onChange={(e) => {
                    const newYear = Number(e.target.value);
                    if (newYear === new Date().getFullYear() && selectedMonth > new Date().getMonth()) {
                      setSelectedMonth(new Date().getMonth());
                    }
                    setSelectedYear(newYear);
                  }}
                  className="filter-chip"
                >
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 4 + i)
                    .filter(y => y <= new Date().getFullYear())
                    .map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <label className="text-xs font-medium text-[var(--text-muted)] hidden sm:inline">Branch:</label>
                <select
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  className="filter-chip"
                >
                  <option value="All">All Branchs</option>
                  {locations.map(loc => (<option key={loc.id} value={loc.name}>{loc.name}</option>))}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <label className="text-xs font-medium text-[var(--text-muted)] hidden sm:inline">Payment:</label>
                <select
                  value={paymentModeFilter}
                  onChange={(e) => setPaymentModeFilter(e.target.value)}
                  className="filter-chip"
                >
                  <option value="All">All Modes</option>
                  <option value="cash">Cash ({activeStaff.filter(s => (s.paymentMode || 'cash') === 'cash').length})</option>
                  <option value="bank">Bank ({activeStaff.filter(s => s.paymentMode === 'bank').length})</option>
                </select>
              </div>
              <div className="flex items-center gap-1">
                <select
                  value={floorFilter}
                  onChange={(e) => setFloorFilter(e.target.value)}
                  className="filter-chip"
                >
                  <option value="All">All Zones</option>
                  {Array.from(new Set(activeStaff.filter(s => s.floor).map(s => s.floor!))).map(flr => (
                    <option key={flr} value={flr}>{flr}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <select
                  value={designationFilter}
                  onChange={(e) => setDesignationFilter(e.target.value)}
                  className="filter-chip"
                >
                  <option value="All">All Designations</option>
                  {Array.from(new Set(activeStaff.filter(s => s.designation).map(s => s.designation!))).map(des => (
                    <option key={des} value={des}>{des}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <select
                  value={accommodationFilter}
                  onChange={(e) => setAccommodationFilter(e.target.value)}
                  className="filter-chip"
                >
                  <option value="All">All Types</option>
                  <option value="day_scholar">Day Scholar</option>
                  <option value="accommodation">Accommodation</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="hidden md:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 md:gap-6">
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/60 mb-1">Active Staff</p>
              <p className="text-3xl font-bold text-blue-400">{activeStaff.length}</p>
              <p className="text-xs text-white/50">Active employees</p>
            </div>
            <div className="stat-icon stat-icon-primary">
              <Users size={24} />
            </div>
          </div>
        </div>

        <div className="stat-card stat-card-success">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/60 mb-1">Full-Time Payroll</p>
              <p className="text-3xl font-bold text-emerald-400">₹{((editMode ? Object.values(tempAdvances).reduce((sum, t) => sum + (Number(t.netPayroll) || 0), 0) : totalSalaryDisbursed) || 0).toLocaleString()}</p>
              <p className="text-xs text-white/50">
                For {new Date(0, selectedMonth).toLocaleString('default', { month: 'long' })} {selectedYear}
              </p>
            </div>
            <div className="stat-icon stat-icon-success">
              <DollarSign size={24} />
            </div>
          </div>
        </div>

        <div className="stat-card stat-card-purple">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/60 mb-1">Flex Earnings</p>
              <p className="text-3xl font-bold text-purple-400">₹{(totalPartTimeEarnings || 0).toLocaleString()}</p>
              <p className="text-xs text-white/50">{partTimeSalaries.length} staff</p>
            </div>
            <div className="stat-icon stat-icon-purple">
              <DollarSign size={24} />
            </div>
          </div>
        </div>

        <div className="stat-card stat-card-warning">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/60 mb-1">Average Attendance</p>
              <p className="text-3xl font-bold text-amber-400">{(averageAttendance || 0).toFixed(1)}</p>
              <p className="text-xs text-white/50">Days per employee</p>
            </div>
            <div className="stat-icon stat-icon-warning">
              <Calendar size={24} />
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/60 mb-1">Total Disbursed</p>
              <p className="text-3xl font-bold text-indigo-400">₹{(((editMode ? Object.values(tempAdvances).reduce((sum, t) => sum + (Number(t.netPayroll) || 0), 0) : totalSalaryDisbursed) + totalPartTimeEarnings) || 0).toLocaleString()}</p>
              <p className="text-xs text-white/50">Full + Part-time</p>
            </div>
            <div className="stat-icon stat-icon-primary">
              <TrendingUp size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* ESI + PF Summary Cards */}
      {(totals.totalESI > 0 || totals.totalPF > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="glass-card-static p-4 rounded-xl border border-red-500/30 bg-red-500/5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white/50 font-semibold uppercase tracking-wider mb-1">ESI Total</p>
                <p className="text-2xl font-bold text-red-400">₹{totals.totalESI.toLocaleString()}</p>
                <p className="text-xs text-white/40 mt-1">{salaryDetails.filter(d => (d.statutoryBreakdown?.find(b => b.key === 'esi')?.amount || 0) > 0).length} staff enrolled</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
                <span className="text-red-400 font-black text-sm">ESI</span>
              </div>
            </div>
          </div>
          <div className="glass-card-static p-4 rounded-xl border border-orange-500/30 bg-orange-500/5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white/50 font-semibold uppercase tracking-wider mb-1">PF Total</p>
                <p className="text-2xl font-bold text-orange-400">₹{totals.totalPF.toLocaleString()}</p>
                <p className="text-xs text-white/40 mt-1">{salaryDetails.filter(d => (d.statutoryBreakdown?.find(b => b.key === 'pf')?.amount || 0) > 0).length} staff enrolled</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
                <span className="text-orange-400 font-black text-sm">PF</span>
              </div>
            </div>
          </div>
          <div className="glass-card-static p-4 rounded-xl border border-purple-500/30 bg-purple-500/5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white/50 font-semibold uppercase tracking-wider mb-1">ESI + PF Total</p>
                <p className="text-2xl font-bold text-purple-400">₹{(totals.totalESI + totals.totalPF).toLocaleString()}</p>
                <p className="text-xs text-white/40 mt-1">{hideStatutoryExtras(userRole) ? 'Monthly deductions total' : 'Monthly statutory liability'}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <span className="text-purple-400 font-black text-xs">{hideStatutoryExtras(userRole) ? 'DED' : 'STAT'}</span>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Full-Time Payroll Details Table */}
      <div className="table-container">
        <div className="p-4 md:p-6 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg md:text-xl font-bold text-white">
                Full-Time Payroll Details - {new Date(0, selectedMonth).toLocaleString('default', { month: 'long' })} {selectedYear}
              </h2>
              <p className="text-xs md:text-sm text-white/50 mt-1">
                All values rounded to nearest ₹10. Sunday absents incur ₹500 penalty.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 ml-4">
              {editMode ? (
                <>
                  <button
                    onClick={handleSaveAll}
                    disabled={saving}
                    className="btn-premium btn-premium-success flex items-center justify-center gap-2 px-3 md:px-4 py-2 text-sm disabled:opacity-50"
                  >
                    <Save size={16} />
                    <span className="hidden sm:inline">{saving ? 'Saving...' : 'Save All'}</span>
                    <span className="sm:hidden">{saving ? 'Save' : 'Save'}</span>
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    disabled={saving}
                    className="btn-ghost flex items-center justify-center gap-2 px-3 md:px-4 py-2 text-sm disabled:opacity-50"
                  >
                    <X size={16} />
                    <span className="hidden sm:inline">Cancel</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={handleEnableEditAll}
                  disabled={!!payrollRun}
                  className={`btn-premium flex items-center justify-center gap-2 px-3 md:px-4 py-2 text-sm ${payrollRun ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title={payrollRun ? "Cannot edit locked payroll" : ""}
                >
                  <Edit2 size={16} />
                  <span className="hidden sm:inline">Enable Edit for All</span>
                  <span className="sm:hidden">Edit All</span>
                </button>
              )}
              <div className="relative">
                <button
                  onClick={() => setShowSalaryColumnPicker(!showSalaryColumnPicker)}
                  className="btn-ghost px-3 py-1.5 text-xs flex items-center gap-1"
                >
                  <Filter size={14} /> Columns
                </button>
                {showSalaryColumnPicker && (
                  <div className="absolute right-0 top-full mt-1 z-50 glass-card-static p-3 rounded-xl shadow-xl min-w-[200px] max-h-[400px] overflow-y-auto">
                    <p className="text-xs font-semibold text-white/70 mb-2">Show/Hide Columns</p>
                    {Object.entries(salaryColLabels).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 py-1 cursor-pointer text-sm text-white/80 hover:text-white">
                        <input type="checkbox" checked={salaryVisibleCols[key] !== false} onChange={() => toggleSalaryCol(key)} className="rounded" />
                        {label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Salary consistency checks */}
        {salaryDetails.length > 0 && (
          <div className={`mx-3 my-3 rounded-xl border p-3 ${salaryValidation.errorCount > 0 ? 'border-red-200 bg-red-50' : salaryValidation.warningCount > 0 ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}`}>
            <button
              type="button"
              onClick={() => setShowValidationDetails(!showValidationDetails)}
              className="w-full flex items-center justify-between gap-2 text-left"
            >
              <span className={`text-sm font-semibold ${salaryValidation.errorCount > 0 ? 'text-red-700' : salaryValidation.warningCount > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                {salaryValidation.errorCount > 0
                  ? `${salaryValidation.errorCount} salary check(s) failed`
                  : salaryValidation.warningCount > 0
                    ? `${salaryValidation.warningCount} salary warning(s)`
                    : 'All salary components reconcile'}
              </span>
              <span className="text-xs text-gray-600 underline">{showValidationDetails ? 'Hide' : 'Details'}</span>
            </button>
            {showValidationDetails && salaryValidation.issues.length > 0 && (
              <ul className="mt-2 space-y-1 max-h-56 overflow-y-auto">
                {salaryValidation.issues.map((issue: SalaryIssue, i: number) => (
                  <li key={`${issue.staffId}-${issue.code}-${i}`} className="text-xs text-gray-700">
                    <span className={`font-semibold ${issue.severity === 'error' ? 'text-red-700' : 'text-amber-700'}`}>
                      {issue.severity === 'error' ? '✕' : '!'} {issue.staffName || issue.staffId}:
                    </span>{' '}
                    {issue.message}
                  </li>
                ))}
              </ul>
            )}
            {showValidationDetails && salaryValidation.issues.length === 0 && (
              <p className="mt-2 text-xs text-gray-600">Gross, deductions, statutory and advances match the computed Net for every employee.</p>
            )}
          </div>
        )}

        {/* Mobile card list (native app feel) */}
        <div className="md:hidden divide-y divide-gray-100">
          {salaryDetails.length === 0 && (
            <div className="p-4"><EmptyState title="No salary records for this period" description="Pick another month or generate payroll to see salary details here." /></div>
          )}
          {salaryDetails.map((detail, index) => {
            const staffMember = getStaffForDisplay(detail.staffId);
            const isOpen = expandedSalaryCard === detail.staffId;
            const uninformedDays = (Array.isArray(attendance) ? attendance : []).filter(a =>
              a.staffId === detail.staffId && a.isUninformed &&
              new Date(a.date).getMonth() === selectedMonth && new Date(a.date).getFullYear() === selectedYear
            ).length;
            return (
              <div key={detail.staffId} className={`p-3 active:bg-gray-50 ${uninformedDays > 0 ? 'border-l-4 border-orange-400 bg-orange-50/40' : ''}`}>
                <button
                  type="button"
                  onClick={() => setExpandedSalaryCard(isOpen ? null : detail.staffId)}
                  className="w-full text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 text-[15px] truncate">
                        {index + 1}. {staffMember?.name}
                        {uninformedDays > 0 && <span className="ml-1 text-[10px] text-orange-600 font-bold">⚠{uninformedDays}</span>}
                      </p>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {[staffMember?.location, staffMember?.floor, staffMember?.designation].filter(Boolean).join(' • ') || '-'}
                      </p>
                      {showEmpCode && (
                        <p className="text-[11px] text-gray-400 mt-0.5">{staffMember?.employeeCode || '-'}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] uppercase tracking-wide text-gray-400">Net</p>
                      <p className="text-base font-bold text-green-700">₹{Math.round(detail.netPayroll ?? detail.netSalary ?? 0).toLocaleString()}</p>
                      {(detail.statutoryTotal || 0) > 0 && (
                        <p className="text-[10px] text-gray-500 mt-1 font-medium">Non-Statutory: ₹{Math.round(detail.nonStatutoryNet || 0).toLocaleString()}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className="badge-premium badge-success">P {(detail.presentDays + detail.halfDays * 0.5).toFixed(1)}</span>
                    <span className={`badge-premium ${(detail.leaveDays - detail.halfDays * 0.5) > 0 ? 'badge-danger' : 'badge-neutral'}`}>L {(detail.leaveDays - detail.halfDays * 0.5).toFixed(1)}</span>
                    <span className="badge-premium badge-neutral">Gross ₹{Math.round(detail.grossPayroll ?? detail.grossSalary ?? 0).toLocaleString()}</span>
                    {detail.newAdv > 0 && <span className="badge-premium badge-warning">Adv ₹{Math.round(detail.newAdv).toLocaleString()}</span>}
                  </div>
                </button>

                {isOpen && (
                  <div className="mt-3 rounded-xl bg-gray-50 p-3 grid grid-cols-2 gap-y-2 gap-x-3 text-xs">
                    <div className="text-gray-500">Basic</div><div className="text-right font-medium text-gray-800">₹{Math.round(detail.basicEarned).toLocaleString()}</div>
                    <div className="text-gray-500">Incentive</div><div className="text-right font-medium text-gray-800">₹{Math.round(detail.incentiveEarned).toLocaleString()}</div>
                    <div className="text-gray-500">HRA</div><div className="text-right font-medium text-gray-800">₹{Math.round(detail.hraEarned).toLocaleString()}</div>
                    <div className="text-gray-500">Meal</div><div className="text-right font-medium text-gray-800">₹{Math.round(detail.mealAllowance || 0).toLocaleString()}</div>
                    {(((detail as any).supplementsTotal as number) || 0) > 0 && (<><div className="text-gray-500">Other Allowances</div><div className="text-right font-medium text-gray-800">₹{Math.round(((detail as any).supplementsTotal as number) || 0).toLocaleString()}</div></>)}
                    <div className="col-span-2 border-t border-gray-200 pt-1 flex justify-between font-semibold text-gray-700"><span>Gross</span><span>₹{Math.round(detail.grossPayroll ?? detail.grossSalary ?? 0).toLocaleString()}</span></div>
                    <div className="text-gray-500">Sun Penalty</div><div className="text-right font-medium text-red-600">₹{Math.round(detail.sundayPenalty || 0).toLocaleString()}</div>
                    <div className="text-gray-500">Late Coming Ded.</div><div className="text-right font-medium text-red-600">₹{Math.round(detail.lateComingDeduction || 0).toLocaleString()}</div>
                    <div className="text-gray-500">Early Leave Ded.</div><div className="text-right font-medium text-red-600">₹{Math.round(detail.earlyLeaveDeduction || 0).toLocaleString()}</div>
                    <div className="text-gray-500">Adv Deduction</div><div className="text-right font-medium text-red-600">₹{Math.round(detail.deduction || 0).toLocaleString()}</div>
                    {(detail.statutoryTotal || 0) > 0 && (<><div className="text-gray-500">Deductions (Stat.)</div><div className="text-right font-medium text-red-600">₹{Math.round(detail.statutoryTotal || 0).toLocaleString()}</div></>)}
                    <div className="col-span-2 border-t border-gray-200 pt-1 flex justify-between font-semibold text-green-700"><span>Net</span><span>₹{Math.round(detail.netPayroll ?? detail.netSalary ?? 0).toLocaleString()}</span></div>
                    <div className="text-gray-500">Old Adv</div><div className="text-right font-medium text-blue-600">₹{Math.round(detail.oldAdv || 0).toLocaleString()}</div>
                    <div className="text-gray-500">Cur Adv</div><div className="text-right font-medium text-blue-600">₹{Math.round(detail.curAdv || 0).toLocaleString()}</div>
                    <div className="text-gray-500">New Adv (pending)</div><div className="text-right font-medium text-blue-700">₹{Math.round(detail.newAdv || 0).toLocaleString()}</div>
                  </div>
                )}

                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleDownloadSingleSlip(detail)}
                    className="flex-1 min-h-[44px] rounded-xl border border-gray-200 text-purple-700 bg-white text-sm font-medium flex items-center justify-center gap-2 active:bg-purple-50"
                  >
                    <Download size={16} /> Slip
                  </button>
                  <button
                    onClick={() => handleWhatsAppShare(detail)}
                    className="flex-1 min-h-[44px] rounded-xl border border-gray-200 text-green-700 bg-white text-sm font-medium flex items-center justify-center gap-2 active:bg-green-50"
                  >
                    <MessageCircle size={16} /> Share
                  </button>
                </div>
              </div>
            );
          })}
          {salaryDetails.length > 0 && (
            <div className="p-3 bg-gray-50 flex items-center justify-between text-sm font-bold">
              <span className="text-gray-700">TOTAL NET</span>
              <span className="text-green-700">₹{totals.totalNet.toLocaleString()}</span>
            </div>
          )}
        </div>

        <div className="overflow-x-auto hidden md:block">

          <table className="table-premium">
            <thead>
              <tr>
                <th className="px-2 md:px-4 py-3 md:py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">S.No</th>
                {showEmpCode && <th className="px-2 md:px-4 py-3 md:py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Emp Code</th>}
                <th className="px-2 md:px-4 py-3 md:py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 z-10 bg-gray-50">Name</th>
                {salaryVisibleCols.location !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Branch</th>}
                {salaryVisibleCols.floor !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Zone</th>}
                {salaryVisibleCols.designation !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Designation</th>}
                {salaryVisibleCols.type !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>}
                {salaryVisibleCols.payment !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Payment</th>}
                {salaryVisibleCols.present !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Present</th>}
                {salaryVisibleCols.leave !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Leave</th>}
                {salaryVisibleCols.sunAbs !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Sun Abs</th>}
                {salaryVisibleCols.oldAdv !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Old Adv</th>}
                {salaryVisibleCols.curAdv !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Cur Adv</th>}
                {salaryVisibleCols.deduction !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Deduction</th>}
                {salaryVisibleCols.basic !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{salaryCategories.find((c: PayrollCategory) => c.id === 'basic')?.name || 'Basic'}</th>}
                {salaryVisibleCols.incentive !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{salaryCategories.find((c: PayrollCategory) => c.id === 'incentive')?.name || 'Incentive'}</th>}
                {salaryVisibleCols.hra !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{salaryCategories.find((c: PayrollCategory) => c.id === 'hra')?.name || 'HRA'}</th>}
                {salaryVisibleCols.meal !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{salaryCategories.find((c: PayrollCategory) => c.id === 'meal_allowance')?.name || 'Meal Allowance'}</th>}
                {customCategories.map((cat: PayrollCategory) => (<th key={cat.id} className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{cat.name}</th>))}
                {salaryVisibleCols.sunPenalty !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Sun Penalty</th>}
                {salaryVisibleCols.lateComingDeduction !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Late Coming Ded.</th>}
                {salaryVisibleCols.earlyLeaveDeduction !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Early Leave Ded.</th>}
                {salaryVisibleCols.statutory !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{hideStatutoryExtras(userRole) ? 'Deductions' : 'ESI/PF/Stat'}</th>}
                {salaryVisibleCols.esi !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider text-red-500">ESI</th>}
                {salaryVisibleCols.pf !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider text-red-500">PF</th>}
                {salaryVisibleCols.gross !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Gross</th>}
                {salaryVisibleCols.net !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Net Payroll</th>}
                {salaryVisibleCols.newAdv !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">New Adv</th>}
                <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {salaryDetails.map((detail, index) => {
                const staffMember = getStaffForDisplay(detail.staffId);
                const tempData = tempAdvances[detail.staffId];

                return (
                  <tr key={detail.staffId} className={`hover:bg-gray-50 text-base ${(() => {
                    const uninformedDays = (Array.isArray(attendance) ? attendance : []).filter(a =>
                      a.staffId === detail.staffId && a.isUninformed &&
                      new Date(a.date).getMonth() === selectedMonth && new Date(a.date).getFullYear() === selectedYear
                    ).length;
                    return uninformedDays > 0 ? 'bg-orange-50 border-l-4 border-orange-400' : '';
                  })()}`}>
                    <td className="px-2 md:px-4 py-3 whitespace-nowrap text-gray-900">{index + 1}</td>
                    {showEmpCode && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-gray-500 text-sm">{staffMember?.employeeCode || (staffMember?.deviceId?.startsWith('dev_') ? null : staffMember?.deviceId) || '-'}</td>}
                    <td className="px-2 md:px-4 py-3 whitespace-nowrap font-medium text-gray-900 sticky left-0 z-10 bg-white">
                      {staffMember?.name}
                      {(() => {
                        const uCount = (Array.isArray(attendance) ? attendance : []).filter(a =>
                          a.staffId === detail.staffId && a.isUninformed &&
                          new Date(a.date).getMonth() === selectedMonth && new Date(a.date).getFullYear() === selectedYear
                        ).length;
                        return uCount > 0 ? <span className="ml-1 text-[10px] text-orange-600 font-bold">⚠{uCount}</span> : null;
                      })()}
                    </td>
                    {salaryVisibleCols.location !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center">
                      <span className="text-xs font-medium">{staffMember?.location}</span>
                    </td>}
                    {salaryVisibleCols.floor !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center text-xs text-gray-600">{staffMember?.floor || '-'}</td>}
                    {salaryVisibleCols.designation !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center text-xs text-gray-600">{staffMember?.designation || '-'}</td>}
                    {salaryVisibleCols.type !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${staffMember?.staffAccommodation === 'day_scholar' ? 'badge-type-day' : staffMember?.staffAccommodation === 'accommodation' ? 'badge-type-acc' : 'text-gray-500'}`}>
                        {staffMember?.staffAccommodation === 'day_scholar' ? 'Day' : staffMember?.staffAccommodation === 'accommodation' ? 'Acc' : '-'}
                      </span>
                    </td>}
                    {salaryVisibleCols.payment !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center">
                      <span className={`badge-premium ${(staffMember?.paymentMode || 'cash') === 'bank' ? 'badge-success' : 'badge-warning'}`}>
                        {(staffMember?.paymentMode || 'cash') === 'bank' ? 'Bank' : 'Cash'}
                      </span>
                    </td>}
                    {salaryVisibleCols.present !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center">
                      <span className="badge-premium badge-success">
                        {(detail.presentDays + detail.halfDays * 0.5).toFixed(1)}
                      </span>
                    </td>}
                    {salaryVisibleCols.leave !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center">
                      <span className={`badge-premium ${(detail.leaveDays - detail.halfDays * 0.5) > 0 ? 'badge-danger' : 'badge-success'}`}>
                        {(detail.leaveDays - detail.halfDays * 0.5).toFixed(1)}
                      </span>
                    </td>}
                    {salaryVisibleCols.sunAbs !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center">
                      <span className={`badge-premium ${detail.sundayAbsents > 0 ? 'badge-danger' : 'badge-neutral'}`}>
                        {detail.sundayAbsents}
                      </span>
                    </td>}
                    {salaryVisibleCols.oldAdv !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center">
                      {editMode && overrideConfig?.oldAdvance ? (
                        <input type="number" value={tempData?.oldAdvance || 0} onChange={(e) => updateTempAdvance(detail.staffId, 'oldAdvance', Number(e.target.value))} className="w-16 md:w-20 px-1 md:px-2 py-1 text-xs border rounded text-center" />
                      ) : (
                        <span className="text-blue-600">₹{detail.oldAdv}</span>
                      )}
                    </td>}
                    {salaryVisibleCols.curAdv !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center">
                      {editMode && overrideConfig?.currentAdvance ? (
                        <input type="number" value={tempData?.currentAdvance || 0} onChange={(e) => updateTempAdvance(detail.staffId, 'currentAdvance', Number(e.target.value))} className="w-16 md:w-20 px-1 md:px-2 py-1 text-xs border rounded text-center" />
                      ) : (
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-blue-600">₹{detail.curAdv}</span>
                          {(() => {
                            const thisMonthCount = (advanceEntries[detail.staffId] || [])
                              .filter(e => e.month === selectedMonth && e.year === selectedYear)
                              .length;
                            return thisMonthCount > 0 ? (
                              <span className="text-[9px] font-bold px-1 rounded bg-blue-100 text-blue-700" title={`${thisMonthCount} date-wise entries for this month`}>
                                {thisMonthCount}
                              </span>
                            ) : null;
                          })()}
                          <button onClick={async () => {
                            const defDate = getDefaultDate(selectedMonth, selectedYear);
                            setAdvanceForm({
                              entryDate: defDate,
                              amount: 0,
                              purpose: '',
                              deductPeriods: 1,
                              startDeductMonth: selectedMonth,
                              startDeductYear: selectedYear
                            });
                            setEditingEntryId(null);
                            
                            try {
                              const entries = await advanceEntryService.getByStaff(detail.staffId);
                              
                              // Check if there are no date-wise advance entries for the selected month/year, but detail.curAdv > 0
                              const selectedMonthEntries = entries.filter(e => e.month === selectedMonth && e.year === selectedYear);
                              if (selectedMonthEntries.length === 0 && detail.curAdv > 0) {
                                const newEntry = await advanceEntryService.create({
                                  staffId: detail.staffId,
                                  entryDate: `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`,
                                  amount: detail.curAdv,
                                  purpose: 'Legacy Advance (Migrated)',
                                  month: selectedMonth,
                                  year: selectedYear,
                                  deductPeriods: 1,
                                  startDeductMonth: selectedMonth,
                                  startDeductYear: selectedYear,
                                  totalDeducted: 0
                                });
                                if (newEntry) {
                                  entries.push(newEntry);
                                  // Set legacy currentAdvance to 0 in advances table
                                  await onUpdateAdvances(detail.staffId, selectedMonth, selectedYear, {
                                    currentAdvance: 0
                                  });
                                  // Reload advances in parent component
                                  await loadAllAdvanceEntries();
                                }
                              }
                              
                              setModalAdvanceEntries(entries);
                              setShowAdvanceEntryModal(detail.staffId);
                            } catch (err) {
                              console.error('Error opening advance modal:', err);
                              await customAlert('Error loading advance entries');
                            }
                          }} className="p-0.5 rounded text-blue-400 hover:text-blue-600 hover:bg-blue-50" title="Add / view date-wise advance entries">
                            <Plus size={12} />
                          </button>
                        </div>
                      )}
                    </td>}
                    {salaryVisibleCols.deduction !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center">
                      {editMode && overrideConfig?.deduction ? (
                        <input type="number" value={tempData?.deduction || 0} onChange={(e) => updateTempAdvance(detail.staffId, 'deduction', Number(e.target.value))} className="w-16 md:w-20 px-1 md:px-2 py-1 text-xs border rounded text-center" />
                      ) : (
                        <>
                          <span className="text-red-600">₹{detail.deduction}</span>
                          {scheduledDeductions[detail.staffId]?.total > 0 && !editMode && (
                            <span className="block text-[9px] font-bold text-blue-500">Auto</span>
                          )}
                        </>
                      )}
                    </td>}
                    {salaryVisibleCols.basic !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center">
                      {editMode && overrideConfig?.basic ? (
                        <input type="number" value={tempData?.basicOverride || 0} onChange={(e) => updateTempAdvance(detail.staffId, 'basicOverride', Number(e.target.value))} className="w-16 md:w-20 px-1 md:px-2 py-1 text-xs border rounded text-center" />
                      ) : (
                        <span className="text-gray-900">₹{detail.basicEarned}</span>
                      )}
                    </td>}
                    {salaryVisibleCols.incentive !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center">
                      {editMode && overrideConfig?.incentive ? (
                        <input type="number" value={tempData?.incentiveOverride || 0} onChange={(e) => updateTempAdvance(detail.staffId, 'incentiveOverride', Number(e.target.value))} className="w-16 md:w-20 px-1 md:px-2 py-1 text-xs border rounded text-center" />
                      ) : (
                        <span className="text-gray-900">₹{detail.incentiveEarned}</span>
                      )}
                    </td>}
                    {salaryVisibleCols.hra !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center">
                      {editMode && overrideConfig?.hra ? (
                        <input type="number" value={tempData?.hraOverride || 0} onChange={(e) => updateTempAdvance(detail.staffId, 'hraOverride', Number(e.target.value))} className="w-16 md:w-20 px-1 md:px-2 py-1 text-xs border rounded text-center" />
                      ) : (
                        <span className="text-gray-900">₹{detail.hraEarned}</span>
                      )}
                    </td>}
                    {salaryVisibleCols.meal !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center">
                      {editMode && overrideConfig?.mealAllowance ? (
                        <input type="number" value={tempData?.mealAllowanceOverride || 0} onChange={(e) => updateTempAdvance(detail.staffId, 'mealAllowanceOverride', Number(e.target.value))} className="w-16 md:w-20 px-1 md:px-2 py-1 text-xs border rounded text-center" />
                      ) : (
                        <span className="text-gray-900">₹{detail.mealAllowance}</span>
                      )}
                    </td>}
                    {customCategories.map((cat: PayrollCategory) => {
                      const val = staffMember?.salarySupplements?.[cat.id] || staffMember?.salarySupplements?.[cat.key] || 0;
                      return (
                        <td key={cat.id} className="px-2 md:px-4 py-3 whitespace-nowrap text-center">
                          <span className="text-gray-900">₹{val.toLocaleString()}</span>
                        </td>
                      );
                    })}
                    {salaryVisibleCols.sunPenalty !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center">
                      {editMode && overrideConfig?.sundayPenalty ? (
                        <input type="number" value={tempData?.sundayPenaltyOverride || 0} onChange={(e) => updateTempAdvance(detail.staffId, 'sundayPenaltyOverride', Number(e.target.value))} className="w-16 md:w-20 px-1 md:px-2 py-1 text-xs border rounded text-center" />
                      ) : (
                        <span className={`${detail.sundayPenalty > 0 ? 'text-red-600' : 'text-gray-900'}`}>₹{detail.sundayPenalty}</span>
                      )}
                    </td>}
                    {salaryVisibleCols.lateComingDeduction !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center">
                      {editMode ? (
                        <input type="number" value={tempData?.lateComingDeductionOverride || 0} onChange={(e) => updateTempAdvance(detail.staffId, 'lateComingDeductionOverride', Number(e.target.value))} className="w-16 md:w-20 px-1 md:px-2 py-1 text-xs border rounded text-center" />
                      ) : (
                        <span className={`${(detail.lateComingDeduction || 0) > 0 ? 'text-red-600' : 'text-gray-900'}`}>₹{detail.lateComingDeduction || 0}</span>
                      )}
                    </td>}
                    {salaryVisibleCols.earlyLeaveDeduction !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center">
                      {editMode ? (
                        <input type="number" value={tempData?.earlyLeaveDeductionOverride || 0} onChange={(e) => updateTempAdvance(detail.staffId, 'earlyLeaveDeductionOverride', Number(e.target.value))} className="w-16 md:w-20 px-1 md:px-2 py-1 text-xs border rounded text-center" />
                      ) : (
                        <span className={`${(detail.earlyLeaveDeduction || 0) > 0 ? 'text-red-600' : 'text-gray-900'}`}>₹{detail.earlyLeaveDeduction || 0}</span>
                      )}
                    </td>}
                    {salaryVisibleCols.statutory !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center">
                      {(detail.statutoryTotal || 0) > 0 ? (
                        <span
                          className="text-red-600 font-medium cursor-help"
                          title={(detail.statutoryBreakdown || []).map(b => `${b.label}: ₹${b.amount}`).join('\n')}
                        >
                          ₹{detail.statutoryTotal}
                          <span className="block text-[9px] text-gray-500">
                            {(detail.statutoryBreakdown || []).map(b => b.label).join(' + ')}
                          </span>
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>}
                    {salaryVisibleCols.esi !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center text-red-500 font-medium">
                      {(detail.statutoryBreakdown?.find(b => b.key === 'esi')?.amount ?? 0) > 0 ? `₹${detail.statutoryBreakdown?.find(b => b.key === 'esi')?.amount}` : '-'}
                    </td>}
                    {salaryVisibleCols.pf !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center text-red-500 font-medium">
                      {(detail.statutoryBreakdown?.find(b => b.key === 'pf')?.amount ?? 0) > 0 ? `₹${detail.statutoryBreakdown?.find(b => b.key === 'pf')?.amount}` : '-'}
                    </td>}
                    {salaryVisibleCols.gross !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center font-semibold text-green-600">
                      ₹{editMode ? (tempData?.grossPayroll || 0) : detail.grossSalary}
                    </td>}
                    {salaryVisibleCols.net !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center font-bold text-green-700">
                      ₹{editMode ? (tempData?.netPayroll || 0) : detail.netSalary}
                      {(detail.statutoryTotal || 0) > 0 && !editMode && (
                        <div className="text-[10px] text-gray-400 font-medium">Off-Books: ₹{Math.round(detail.nonStatutoryNet || 0).toLocaleString()}</div>
                      )}
                    </td>}
                    {salaryVisibleCols.newAdv !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center text-blue-600">
                      ₹{editMode ? (tempData?.newAdvance || 0) : detail.newAdv}
                    </td>}
                    {/* Actions - Download Slip & WhatsApp */}
                    <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleDownloadSingleSlip(detail)}
                          className="inline-flex items-center justify-center p-1.5 text-purple-600 hover:bg-purple-100 rounded-lg transition-colors"
                          title="Download Payroll Slip"
                        >
                          <Download size={16} />
                        </button>
                        <button
                          onClick={() => handleWhatsAppShare(detail)}
                          className="inline-flex items-center justify-center p-1.5 text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                          title={staffMember?.contactNumber ? `Send via WhatsApp to ${staffMember.contactNumber}` : 'No phone number - Add in Staff Management'}
                        >
                          <MessageCircle size={16} />
                        </button>
                        <button
                          onClick={async () => {
                            if (!await customConfirm(`Mark ₹${detail.netPayroll ?? detail.netSalary ?? 0} as paid for ${staffMember?.name} and notify them?`)) return;
                            const ok = await salaryDisbursementService.markAsPaidAndNotify(
                              detail.staffId,
                              `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`,
                              detail.netPayroll ?? detail.netSalary ?? 0,
                              staffMember?.paymentMode || 'bank'
                            );
                            if (ok) customAlert('Payroll marked as paid and staff notified!');
                          }}
                          className="inline-flex items-center justify-center p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                          title="Mark as Paid & Notify"
                        >
                          <Check size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {/* Totals Row */}
              <tr className="bg-gray-100 font-bold text-sm">
                <td className="px-2 md:px-4 py-3 whitespace-nowrap" colSpan={
                  2 + // S.No + Name (always)
                  1 + // Emp Code (always)
                  (showEmpCode ? 0 : -1) +
                  (salaryVisibleCols.location !== false ? 1 : 0) +
                  (salaryVisibleCols.floor !== false ? 1 : 0) +
                  (salaryVisibleCols.designation !== false ? 1 : 0) +
                  (salaryVisibleCols.type !== false ? 1 : 0) +
                  (salaryVisibleCols.payment !== false ? 1 : 0) +
                  (salaryVisibleCols.present !== false ? 1 : 0) +
                  (salaryVisibleCols.leave !== false ? 1 : 0) +
                  (salaryVisibleCols.sunAbs !== false ? 1 : 0)
                }>
                  <span className="text-gray-800">TOTAL</span>
                </td>
                {salaryVisibleCols.oldAdv !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center text-blue-600">
                  ₹{totals.totalOldAdv.toLocaleString()}
                </td>}
                {salaryVisibleCols.curAdv !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center text-blue-600">
                  ₹{totals.totalCurAdv.toLocaleString()}
                </td>}
                {salaryVisibleCols.deduction !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center text-red-600">
                  ₹{totals.totalDeduction.toLocaleString()}
                </td>}
                {salaryVisibleCols.basic !== false && <td></td>}
                {salaryVisibleCols.incentive !== false && <td></td>}
                {salaryVisibleCols.hra !== false && <td></td>}
                {salaryVisibleCols.meal !== false && <td></td>}
                {customCategories.map(c => <td key={c.id}></td>)}
                {salaryVisibleCols.sunPenalty !== false && <td></td>}
                {salaryVisibleCols.statutory !== false && <td></td>}
                {salaryVisibleCols.esi !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center text-red-600">₹{totals.totalESI.toLocaleString()}</td>}
                {salaryVisibleCols.pf !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center text-red-600">₹{totals.totalPF.toLocaleString()}</td>}
                {salaryVisibleCols.gross !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center text-green-600">
                  ₹{totals.totalGross.toLocaleString()}
                </td>}
                {salaryVisibleCols.net !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center text-green-700">
                  ₹{totals.totalNet.toLocaleString()}
                </td>}
                {salaryVisibleCols.newAdv !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center text-blue-600">
                  ₹{totals.totalNewAdv.toLocaleString()}
                </td>}
              </tr>
            </tbody>
          </table>
        </div>
      </div >

      {/* Flex Payroll Details */}
      {
        partTimeSalaries.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 md:p-6 border-b border-gray-200">
              <h2 className="text-lg md:text-xl font-bold text-gray-800">
                flex staff Earnings - {new Date(0, selectedMonth).toLocaleString('default', { month: 'long' })} {selectedYear}
              </h2>
              <p className="text-xs md:text-sm text-gray-600 mt-1">
                Rate: ₹350/day (Mon-Sat), ₹400/day (Sunday)
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 md:px-6 py-3 md:py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">S.No</th>
                    <th className="px-3 md:px-6 py-3 md:py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 z-10 bg-gray-50">Name</th>
                    <th className="px-3 md:px-6 py-3 md:py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Branch</th>
                    <th className="px-3 md:px-6 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Total Days</th>
                    <th className="px-3 md:px-6 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Weekly Breakdown</th>
                    <th className="px-3 md:px-6 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Total Earnings</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {partTimeSalaries.map((salary, index) => (
                    <tr key={`${salary.staffName}-${index}`} className="hover:bg-gray-50 text-xs md:text-sm">
                      <td className="px-3 md:px-6 py-4 whitespace-nowrap text-gray-900">{index + 1}</td>
                      <td className="px-3 md:px-6 py-4 whitespace-nowrap font-medium text-gray-900 sticky left-0 z-10 bg-white">
                        {salary.staffName}
                      </td>
                      <td className="px-3 md:px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-3 py-1.5 text-sm font-semibold rounded-full ${salary.location === 'Big Shop' ? 'bg-blue-100 text-blue-700' :
                          salary.location === 'Small Shop' ? 'bg-green-100 text-green-700' :
                            salary.location === 'Godown' ? 'bg-purple-100 text-purple-700' :
                              'bg-gray-100 text-gray-700'
                          }`}>
                          {salary.location}
                        </span>
                      </td>
                      <td className="px-3 md:px-6 py-4 whitespace-nowrap text-center text-gray-900">
                        {salary.totalDays}
                      </td>
                      <td className="px-3 md:px-6 py-4 whitespace-nowrap text-center text-gray-900">
                        <div className="space-y-1">
                          {salary.weeklyBreakdown.map(week => (
                            <div key={week.week} className="text-xs">
                              Week {week.week}: {week.days.length} days - ₹{week.weekTotal}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 md:px-6 py-4 whitespace-nowrap text-center font-bold text-purple-600">
                        ₹{salary.totalEarnings.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {/* Flex Totals Row */}
                  <tr className="bg-gray-100 font-bold text-sm">
                    <td className="px-3 md:px-6 py-3 whitespace-nowrap" colSpan={5}>
                      <span className="text-gray-800">TOTAL</span>
                    </td>
                    <td className="px-3 md:px-6 py-3 whitespace-nowrap text-center text-purple-600">
                      ₹{totalPartTimeEarnings.toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )
      }
      {/* Bulk Sender Modal */}
      {showBulkSender && (
        <BulkSalarySender
          salaryDetails={salaryDetails}
          staff={staff}
          year={selectedYear}
          month={selectedMonth}
          onClose={() => setShowBulkSender(false)}
          onSend={handleWhatsAppShare}
        />
      )}

      {/* Advance Entry Modal */}
      {showAdvanceEntryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => { setShowAdvanceEntryModal(null); setEditingEntryId(null); }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Plus size={20} className="text-blue-500" />
              {editingEntryId ? 'Edit' : 'Add'} Advance Entry — {staff.find(s => s.id === showAdvanceEntryModal)?.name}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Date *</label>
                <input type="date" value={advanceForm.entryDate}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={e => setAdvanceForm(f => ({ ...f, entryDate: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Amount *</label>
                <input type="number" value={advanceForm.amount || ''}
                  onChange={e => setAdvanceForm(f => ({ ...f, amount: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter amount" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Deduct In Periods</label>
                <input type="number" min={1} max={36} value={advanceForm.deductPeriods || 1}
                  onChange={e => setAdvanceForm(f => ({ ...f, deductPeriods: Math.max(1, Number(e.target.value)) }))}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Start Deduction From</label>
                <div className="flex gap-2">
                  <select value={advanceForm.startDeductMonth ?? selectedMonth}
                    onChange={e => setAdvanceForm(f => ({ ...f, startDeductMonth: Number(e.target.value) }))}
                    className="flex-1 rounded-lg border border-gray-300 p-2.5 text-sm focus:ring-2 focus:ring-blue-500">
                    {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                      <option key={i} value={i}>{m}</option>
                    ))}
                  </select>
                  <select value={advanceForm.startDeductYear ?? selectedYear}
                    onChange={e => setAdvanceForm(f => ({ ...f, startDeductYear: Number(e.target.value) }))}
                    className="w-24 rounded-lg border border-gray-300 p-2.5 text-sm focus:ring-2 focus:ring-blue-500">
                    {[selectedYear - 1, selectedYear, selectedYear + 1].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
              {(advanceForm.deductPeriods || 1) > 1 && advanceForm.amount > 0 && (
                <div className="mt-2 p-2 bg-blue-50 rounded-lg text-xs text-blue-700">
                  <p className="font-semibold mb-1">Deduction Preview:</p>
                  {(() => {
                    const periods = advanceForm.deductPeriods || 1;
                    const perPeriod = Math.floor(advanceForm.amount / periods);
                    const lastPeriod = advanceForm.amount - perPeriod * (periods - 1);
                    const startM = advanceForm.startDeductMonth ?? selectedMonth;
                    const startY = advanceForm.startDeductYear ?? selectedYear;
                    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                    return Array.from({ length: periods }, (_, i) => {
                      const m = (startM + i) % 12;
                      const y = startY + Math.floor((startM + i) / 12);
                      const amt = i === periods - 1 ? lastPeriod : perPeriod;
                      return <p key={i}>{months[m]} {y}: ₹{amt.toLocaleString('en-IN')}</p>;
                    });
                  })()}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Purpose</label>
                <input type="text" value={advanceForm.purpose}
                  onChange={e => setAdvanceForm(f => ({ ...f, purpose: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Festival advance" />
              </div>
            </div>

            {/* Existing entries for this staff */}
            {modalAdvanceEntries.length > 0 && (
              <div className="mt-4 pt-3 border-t border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500">Advance Entries History:</p>
                  <p className="text-xs font-bold text-blue-600">
                    Total Active: ₹{modalAdvanceEntries.reduce((s, e) => s + e.amount, 0).toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {modalAdvanceEntries.map(entry => (
                    <div key={entry.id} className={`flex items-center justify-between p-2 rounded-lg text-sm ${editingEntryId === entry.id ? 'bg-blue-50 ring-1 ring-blue-300' : 'bg-gray-50'}`}>
                      <div>
                        <span className="font-medium">{new Date(entry.entryDate).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</span>
                        {entry.purpose && <span className="text-gray-500 ml-2">— {entry.purpose}</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-blue-600">₹{entry.amount.toLocaleString('en-IN')}</span>
                        {(entry.deductPeriods || 1) > 1 && (
                          <span className="text-[10px] text-gray-400 ml-1">({entry.deductPeriods}p • Bal: ₹{((entry.amount - (entry.totalDeducted || 0))).toLocaleString('en-IN')})</span>
                        )}
                        <button onClick={() => {
                          setEditingEntryId(entry.id);
                          setAdvanceForm({
                            entryDate: entry.entryDate,
                            amount: entry.amount,
                            purpose: entry.purpose || '',
                            deductPeriods: entry.deductPeriods || 1,
                            startDeductMonth: entry.startDeductMonth ?? entry.month,
                            startDeductYear: entry.startDeductYear ?? entry.year
                          });
                        }} className="p-1 text-amber-500 hover:text-amber-700" title="Edit"><Edit2 size={13} /></button>
                        <button onClick={async () => {
                          if (!await customConfirm('Delete this advance entry?')) return;
                          await advanceEntryService.delete(entry.id);
                          const updated = await advanceEntryService.getByStaff(showAdvanceEntryModal!);
                          setModalAdvanceEntries(updated);
                          await loadAllAdvanceEntries();
                          if (editingEntryId === entry.id) {
                            setEditingEntryId(null);
                            setAdvanceForm({
                              entryDate: getDefaultDate(selectedMonth, selectedYear),
                              amount: 0,
                              purpose: '',
                              deductPeriods: 1,
                              startDeductMonth: selectedMonth,
                              startDeductYear: selectedYear
                            });
                          }
                        }} className="p-1 text-red-400 hover:text-red-600" title="Delete"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
 
            <div className="flex gap-3 mt-5">
              <button onClick={() => {
                setShowAdvanceEntryModal(null);
                setEditingEntryId(null);
                setAdvanceForm({
                  entryDate: getDefaultDate(selectedMonth, selectedYear),
                  amount: 0,
                  purpose: '',
                  deductPeriods: 1,
                  startDeductMonth: selectedMonth,
                  startDeductYear: selectedYear
                });
              }}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-600 font-semibold text-sm hover:bg-gray-50">Close</button>
              {editingEntryId && (
                <button onClick={() => {
                  setEditingEntryId(null);
                  setAdvanceForm({
                    entryDate: getDefaultDate(selectedMonth, selectedYear),
                    amount: 0,
                    purpose: '',
                    deductPeriods: 1,
                    startDeductMonth: selectedMonth,
                    startDeductYear: selectedYear
                  });
                }} className="flex-1 py-2.5 rounded-xl border border-amber-300 text-amber-700 font-semibold text-sm hover:bg-amber-50">Cancel Edit</button>
              )}
              <button onClick={async () => {
                if (!advanceForm.amount || !advanceForm.entryDate) return;
                const staffId = showAdvanceEntryModal!;
                if (editingEntryId) {
                  await advanceEntryService.update(editingEntryId, {
                    entryDate: advanceForm.entryDate,
                    amount: advanceForm.amount,
                    purpose: advanceForm.purpose || undefined,
                    deductPeriods: advanceForm.deductPeriods || 1,
                    startDeductMonth: advanceForm.startDeductMonth,
                    startDeductYear: advanceForm.startDeductYear
                  });
                } else {
                  const entryDateObj = new Date(advanceForm.entryDate);
                  const entryMonth = entryDateObj.getMonth();
                  const entryYear = entryDateObj.getFullYear();
                  await advanceEntryService.create({
                    staffId,
                    entryDate: advanceForm.entryDate,
                    amount: advanceForm.amount,
                    purpose: advanceForm.purpose || undefined,
                    month: entryMonth,
                    year: entryYear,
                    deductPeriods: advanceForm.deductPeriods || 1,
                    startDeductMonth: advanceForm.startDeductMonth ?? entryMonth,
                    startDeductYear: advanceForm.startDeductYear ?? entryYear
                  });
                }
                const updated = await advanceEntryService.getByStaff(staffId);
                setModalAdvanceEntries(updated);
                await loadAllAdvanceEntries();
                setAdvanceForm({
                  entryDate: getDefaultDate(selectedMonth, selectedYear),
                  amount: 0,
                  purpose: '',
                  deductPeriods: 1,
                  startDeductMonth: selectedMonth,
                  startDeductYear: selectedYear
                });
                setEditingEntryId(null);
              }}
                disabled={!advanceForm.amount || !advanceForm.entryDate}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-sm disabled:opacity-50 hover:bg-blue-700">
                {editingEntryId ? 'Update' : 'Add Entry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PayrollManagement;