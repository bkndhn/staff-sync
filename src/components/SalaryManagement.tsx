import React, { useState, useEffect } from 'react';
import { Staff, Attendance, SalaryDetail, AdvanceDeduction, PartTimeSalaryDetail, SalaryOverride } from '../types';
import { DollarSign, Download, Users, Calendar, TrendingUp, Edit2, Save, X, FileSpreadsheet, FileText, MessageCircle, Filter, Plus, Trash2 } from 'lucide-react';
import { calculateAttendanceMetrics, calculateSalary, calculatePartTimeSalary, roundToNearest10 } from '../utils/salaryCalculations';
import { exportSalaryToExcel, exportSalaryPDF, generateSalarySlipPDF, exportBulkSalarySlipsPDF } from '../utils/exportUtils';
import { salaryCategoryService, type SalaryCategory } from '../services/salaryCategoryService';
import { salaryOverrideService } from '../services/salaryOverrideService';
import { advanceEntryService, AdvanceEntry } from '../services/advanceEntryService';
import { computeStatutoryBreakdown } from '../utils/statutoryDeductions';
import BulkSalarySender from './BulkSalarySender';

interface SalaryManagementProps {
  staff: Staff[];
  attendance: Attendance[];
  advances: AdvanceDeduction[];
  onUpdateAdvances: (staffId: string, month: number, year: number, advances: Partial<AdvanceDeduction>) => void;
}

interface TempSalaryData {
  oldAdvance?: number;
  currentAdvance?: number;
  deduction?: number;
  newAdvance?: number;
  basicOverride?: number;
  incentiveOverride?: number;
  hraOverride?: number;
  mealAllowanceOverride?: number;
  sundayPenaltyOverride?: number;
  grossSalary?: number;
  netSalary?: number;
}

const SalaryManagement: React.FC<SalaryManagementProps> = ({
  staff,
  attendance,
  advances,
  onUpdateAdvances
}) => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);

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
  const [showAdvanceEntryModal, setShowAdvanceEntryModal] = useState<string | null>(null);
  const [advanceEntries, setAdvanceEntries] = useState<{ [staffId: string]: AdvanceEntry[] }>({});
  const [advanceForm, setAdvanceForm] = useState({ entryDate: new Date().toISOString().split('T')[0], amount: 0, purpose: '' });
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  // Load all date-wise advance entries for the selected month (used to auto-sum into Cur Adv)
  useEffect(() => {
    const loadAllEntries = async () => {
      const { supabase } = await import('../lib/supabase');
      const { data, error } = await supabase
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
      setAdvanceEntries(grouped);
    };
    loadAllEntries();
  }, [selectedMonth, selectedYear]);
  const [showSalaryColumnPicker, setShowSalaryColumnPicker] = useState(false);
  const [salaryVisibleCols, setSalaryVisibleCols] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('salaryVisibleColumns');
    if (saved) return JSON.parse(saved);
    return {
      location: true, type: true, payment: true, floor: true, designation: true,
      present: true, leave: true, sunAbs: true, oldAdv: true, curAdv: true,
      deduction: true, basic: true, incentive: true, hra: true, meal: true,
      sunPenalty: true, statutory: true, gross: true, net: true, newAdv: true
    };
  });
  const toggleSalaryCol = (col: string) => {
    setSalaryVisibleCols(prev => {
      const updated = { ...prev, [col]: !prev[col] };
      localStorage.setItem('salaryVisibleColumns', JSON.stringify(updated));
      return updated;
    });
  };
  const salaryColLabels: Record<string, string> = {
    location: 'Location', type: 'Type', payment: 'Payment', floor: 'Floor', designation: 'Designation',
    present: 'Present', leave: 'Leave', sunAbs: 'Sun Abs', oldAdv: 'Old Adv', curAdv: 'Cur Adv',
    deduction: 'Deduction', basic: 'Basic', incentive: 'Incentive', hra: 'HRA', meal: 'Meal',
    sunPenalty: 'Sun Penalty', statutory: 'ESI/PF/Statutory', gross: 'Gross', net: 'Net Salary', newAdv: 'New Adv'
  };
  const [salaryCategories, setSalaryCategories] = useState<SalaryCategory[]>(() => salaryCategoryService.getCategoriesSync());
  const [showBulkSender, setShowBulkSender] = useState(false);

  // Load categories from DB on mount
  useEffect(() => {
    salaryCategoryService.getCategories().then(setSalaryCategories);
  }, []);

  const customCategories = salaryCategories.filter((c: SalaryCategory) => !['basic', 'incentive', 'hra', 'meal_allowance'].includes(c.id) && !c.isDeleted);

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

  const activeStaff = staff.filter(member => {
    if (!member.isActive) return false;
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    const haystack = [
      member.name, member.location, member.floor, member.designation,
      member.experience, member.type, member.staffAccommodation,
      member.contactNumber, member.bankName, member.bankAccountNumber,
      member.ifscCode, member.pfNumber, member.esiNumber, member.paymentMode,
      String(member.basicSalary ?? ''), String(member.incentive ?? ''),
      String(member.hra ?? ''), String(member.mealAllowance ?? ''), String(member.totalSalary ?? '')
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(query);
  });

  // Filter staff by location and payment mode
  const filteredStaff = activeStaff.filter(member => {
    if (locationFilter !== 'All' && member.location !== locationFilter) return false;
    if (paymentModeFilter !== 'All' && (member.paymentMode || 'cash') !== paymentModeFilter) return false;
    if (floorFilter !== 'All' && (member.floor || '') !== floorFilter) return false;
    if (designationFilter !== 'All' && (member.designation || '') !== designationFilter) return false;
    if (accommodationFilter !== 'All' && (member.staffAccommodation || '') !== accommodationFilter) return false;
    return true;
  });

  // State for monthly overrides
  const [overrides, setOverrides] = useState<{ [key: string]: SalaryOverride }>({});

  // Load monthly overrides
  React.useEffect(() => {
    const loadOverrides = async () => {
      const dbOverrides = await salaryOverrideService.getOverrides(selectedMonth + 1, selectedYear);
      const overridesMap: { [key: string]: SalaryOverride } = {};

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


  const calculateSalaryDetails = (): SalaryDetail[] => {
    return filteredStaff.map(member => {
      const attendanceMetrics = calculateAttendanceMetrics(member.id, attendance, selectedYear, selectedMonth);
      const memberAdvances = advances.find(adv =>
        adv.staffId === member.id &&
        adv.month === selectedMonth &&
        adv.year === selectedYear
      );

      const baseDetail = calculateSalary(member, attendanceMetrics, memberAdvances ?? null, advances, attendance, selectedMonth, selectedYear);

      // Auto-sum date-wise advance entries into Current Advance
      // Rule: If staff has date-wise entries AND no manual override exists in 'advances' table for currentAdvance,
      // use the entries sum. If user manually edits via Edit mode and saves, that explicit value takes precedence.
      const entriesSum = (advanceEntries[member.id] || []).reduce((s, e) => s + e.amount, 0);
      const hasManualAdvanceRow = !!memberAdvances && (memberAdvances.currentAdvance || 0) > 0;
      const effectiveCurAdv = hasManualAdvanceRow
        ? baseDetail.curAdv
        : (entriesSum > 0 ? roundToNearest10(entriesSum) : baseDetail.curAdv);

      // Recompute new advance & net if curAdv changed
      let mergedDetail = baseDetail;
      if (effectiveCurAdv !== baseDetail.curAdv) {
        const newAdv = roundToNearest10(baseDetail.oldAdv + effectiveCurAdv - baseDetail.deduction);
        const netSalary = Math.max(0, roundToNearest10(baseDetail.grossSalary - effectiveCurAdv - baseDetail.deduction - baseDetail.sundayPenalty));
        mergedDetail = { ...baseDetail, curAdv: effectiveCurAdv, newAdv, netSalary };
      }

      // Merge with overrides if present
      const override = overrides[member.id];
      let resultDetail: SalaryDetail = mergedDetail;
      if (override) {
        const basic = override.basicOverride ?? mergedDetail.basicEarned;
        const incentive = override.incentiveOverride ?? mergedDetail.incentiveEarned;
        const hra = override.hraOverride ?? mergedDetail.hraEarned;
        const meal = override.mealAllowanceOverride ?? mergedDetail.mealAllowance;
        const sundayPenalty = override.sundayPenaltyOverride ?? mergedDetail.sundayPenalty;

        const gross = roundToNearest10(basic + incentive + hra + meal);
        const net = roundToNearest10(gross - mergedDetail.curAdv - mergedDetail.deduction - sundayPenalty);

        resultDetail = {
          ...mergedDetail,
          basicEarned: basic,
          incentiveEarned: incentive,
          hraEarned: hra,
          mealAllowance: meal,
          sundayPenalty: sundayPenalty,
          grossSalary: gross,
          netSalary: net
        };
      }

      // Apply statutory deductions (ESI / PF / PT / TDS / Custom) — subtract from net
      const breakdown = computeStatutoryBreakdown(member, {
        basic: resultDetail.basicEarned,
        hra: resultDetail.hraEarned,
        incentive: resultDetail.incentiveEarned,
        gross: resultDetail.grossSalary,
      });
      const statutoryTotal = breakdown.reduce((s, b) => s + b.amount, 0);
      if (statutoryTotal > 0) {
        resultDetail = {
          ...resultDetail,
          statutoryTotal,
          statutoryBreakdown: breakdown.map(b => ({ key: b.key, label: b.label, amount: b.amount })),
          netSalary: Math.max(0, roundToNearest10(resultDetail.netSalary - statutoryTotal)),
        };
      } else {
        resultDetail = { ...resultDetail, statutoryTotal: 0, statutoryBreakdown: [] };
      }
      return resultDetail;
    });
  };

  // Calculate part-time salaries
  const calculatePartTimeSalaries = (): PartTimeSalaryDetail[] => {
    const monthlyAttendance = attendance.filter(record => {
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
          location: record.location || 'Unknown'
        });
      }
    });

    return Array.from(uniqueStaff.values()).map(staff =>
      calculatePartTimeSalary(
        staff.name,
        staff.location,
        attendance,
        selectedYear,
        selectedMonth
      )
    );
  };

  const salaryDetails = calculateSalaryDetails();
  const partTimeSalaries = calculatePartTimeSalaries();
  const totalSalaryDisbursed = salaryDetails.reduce((sum, detail) => sum + detail.netSalary, 0);
  const totalPartTimeEarnings = partTimeSalaries.reduce((sum, salary) => sum + salary.totalEarnings, 0);
  const averageAttendance = salaryDetails.length > 0
    ? salaryDetails.reduce((sum, detail) => sum + detail.presentDays + (detail.halfDays * 0.5), 0) / salaryDetails.length
    : 0;

  const handleEnableEditAll = () => {
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

      const oldAdv = currentAdvances?.oldAdvance ?? previousAdvance?.newAdvance ?? 0;
      const curAdv = currentAdvances?.currentAdvance ?? 0;
      const deduction = currentAdvances?.deduction ?? 0;
      const basicVal = detail?.basicEarned ?? 0;
      const incentiveVal = detail?.incentiveEarned ?? 0;
      const hraVal = detail?.hraEarned ?? 0;
      const mealAllowanceVal = detail?.mealAllowance ?? 0;
      const sundayPenaltyVal = detail?.sundayPenalty ?? 0;

      const grossSalary = roundToNearest10(basicVal + incentiveVal + hraVal + mealAllowanceVal);
      const netSalary = roundToNearest10(grossSalary - deduction - sundayPenaltyVal);
      const newAdvance = roundToNearest10(oldAdv + curAdv - deduction);

      initialTempAdvances[member.id] = {
        oldAdvance: oldAdv,
        currentAdvance: curAdv,
        deduction: deduction,
        basicOverride: basicVal,
        incentiveOverride: incentiveVal,
        hraOverride: hraVal,
        mealAllowanceOverride: mealAllowanceVal,
        sundayPenaltyOverride: sundayPenaltyVal,
        grossSalary: grossSalary,
        netSalary: netSalary,
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
        if (temp) {
          const newAdvance = roundToNearest10((temp.oldAdvance || 0) + (temp.currentAdvance || 0) - (temp.deduction || 0));

          return onUpdateAdvances(staffId, selectedMonth, selectedYear, {
            oldAdvance: temp.oldAdvance,
            currentAdvance: temp.currentAdvance,
            deduction: temp.deduction,
            newAdvance,
            updatedAt: new Date().toISOString()
          });
        }
        return Promise.resolve();
      });

      await Promise.all(savePromises);

      setEditMode(false);
      setTempAdvances({});
    } catch (error) {
      console.error('Error saving advances:', error);
      alert('Error saving advances. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditMode(false);
    setTempAdvances({});
  };

  const handleExportExcel = () => {
    exportSalaryToExcel(salaryDetails, partTimeSalaries, staff, selectedMonth, selectedYear);
  };

  const handleExportPDF = () => {
    exportSalaryPDF(salaryDetails, partTimeSalaries, staff, selectedMonth, selectedYear);
  };

  const handleDownloadAllSlips = () => {
    exportBulkSalarySlipsPDF(salaryDetails, staff, selectedMonth, selectedYear);
  };

  const handleDownloadSingleSlip = (detail: SalaryDetail) => {
    const staffMember = staff.find(s => s.id === detail.staffId);
    if (staffMember) {
      generateSalarySlipPDF(detail, staffMember, selectedMonth, selectedYear);
    }
  };

  // WhatsApp share salary slip
  const handleWhatsAppShare = (detail: SalaryDetail) => {
    const staffMember = staff.find(s => s.id === detail.staffId);
    if (!staffMember) return;

    const phoneNumber = staffMember.contactNumber?.replace(/[^0-9]/g, '');
    if (!phoneNumber) {
      alert(`No phone number found for ${staffMember.name}. Please add contact number in Staff Management.`);
      return;
    }

    // Format phone number for India (add 91 if not present)
    const formattedPhone = phoneNumber.startsWith('91') ? phoneNumber : `91${phoneNumber}`;

    const monthName = new Date(0, selectedMonth).toLocaleString('default', { month: 'long' });
    const presentDays = (detail.presentDays + detail.halfDays * 0.5).toFixed(1);
    const leaveDays = (detail.leaveDays - detail.halfDays * 0.5).toFixed(1);

    // Get salary category names
    const basicName = salaryCategories.find((c: SalaryCategory) => c.id === 'basic')?.name || 'Basic';
    const incentiveName = salaryCategories.find((c: SalaryCategory) => c.id === 'incentive')?.name || 'Incentive';
    const hraName = salaryCategories.find((c: SalaryCategory) => c.id === 'hra')?.name || 'HRA';
    const mealName = salaryCategories.find((c: SalaryCategory) => c.id === 'meal_allowance')?.name || 'Meal Allowance';

    // Custom supplements for this staff member
    const staffMemberData = staff.find(s => s.id === detail.staffId);
    const customSupplLines = customCategories
      .map((cat: SalaryCategory) => {
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
      `📍 *Location:* ${staffMember.location}\n` +
      (staffMember.floor ? `🏢 *Floor:* ${staffMember.floor}\n` : '') +
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
      `💵 *Gross Salary:* ₹${detail.grossSalary.toLocaleString()}\n` +
      `✅ *Net Salary:* ₹${detail.netSalary.toLocaleString()}\n` +
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
    const oldAdv = updated.oldAdvance || 0;
    const curAdv = updated.currentAdvance || 0;
    const deduction = updated.deduction || 0;

    // Gross = Basic + Incentive + HRA + Meal Allowance
    updated.grossSalary = roundToNearest10(basicVal + incentiveVal + hraVal + mealAllowanceVal);
    // Net = Gross - Deduction - Sunday Penalty
    updated.netSalary = roundToNearest10(updated.grossSalary - deduction - sundayPenaltyVal);
    // New Adv = Old Adv + Cur Adv - Deduction
    updated.newAdvance = roundToNearest10(oldAdv + curAdv - deduction);

    setTempAdvances({
      ...tempAdvances,
      [staffId]: updated
    });

    // Auto-save overrides to DB and update local overrides state
    if (['basicOverride', 'incentiveOverride', 'hraOverride', 'mealAllowanceOverride', 'sundayPenaltyOverride'].includes(field)) {
      const overrideUpdate = {
        staffId,
        month: selectedMonth + 1,
        year: selectedYear,
        basicOverride: updated.basicOverride,
        incentiveOverride: updated.incentiveOverride,
        hraOverride: updated.hraOverride,
        mealAllowanceOverride: updated.mealAllowanceOverride,
        sundayPenaltyOverride: updated.sundayPenaltyOverride
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

      Object.values(tempAdvances).forEach(temp => {
        totalGross += temp.grossSalary || 0;
        totalNet += temp.netSalary || 0;
        totalNewAdv += temp.newAdvance || 0;
        totalDeduction += temp.deduction || 0;
        totalOldAdv += temp.oldAdvance || 0;
        totalCurAdv += temp.currentAdvance || 0;
      });

      return { totalGross, totalNet, totalNewAdv, totalDeduction, totalOldAdv, totalCurAdv };
    } else {
      // Calculate from salary details
      const totalGross = salaryDetails.reduce((sum, d) => sum + d.grossSalary, 0);
      const totalNet = salaryDetails.reduce((sum, d) => sum + d.netSalary, 0);
      const totalNewAdv = salaryDetails.reduce((sum, d) => sum + d.newAdv, 0);
      const totalDeduction = salaryDetails.reduce((sum, d) => sum + d.deduction, 0);
      const totalOldAdv = salaryDetails.reduce((sum, d) => sum + d.oldAdv, 0);
      const totalCurAdv = salaryDetails.reduce((sum, d) => sum + d.curAdv, 0);

      return { totalGross, totalNet, totalNewAdv, totalDeduction, totalOldAdv, totalCurAdv };
    }
  };

  const totals = calculateTotals();

  return (
    <div className="p-1 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="stat-icon stat-icon-success">
            <DollarSign size={24} />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">Salary Management</h1>
            <p className="text-white/50 text-sm">Track and manage salaries</p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 flex-1 md:justify-end">
          {/* Search Bar */}
          <div className="relative flex-1 md:max-w-md">
            <input
              type="text"
              placeholder="Search by name or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-premium"
            />
          </div>

          <div className="grid grid-cols-2 sm:flex gap-2">
            <button
              onClick={handleExportExcel}
              className="btn-premium btn-premium-success whitespace-nowrap flex items-center justify-center gap-2 px-3 md:px-4 py-2 text-sm"
            >
              <FileSpreadsheet size={16} />
              <span className="hidden sm:inline">Export Excel</span>
              <span className="sm:hidden">Excel</span>
            </button>
            <button
              onClick={handleExportPDF}
              className="btn-premium whitespace-nowrap flex items-center justify-center gap-2 px-3 md:px-4 py-2 text-sm"
            >
              <Download size={16} />
              <span className="hidden sm:inline">Export PDF</span>
              <span className="sm:hidden">PDF</span>
            </button>
            <button
              onClick={handleDownloadAllSlips}
              className="btn-premium whitespace-nowrap flex items-center justify-center gap-2 px-3 md:px-4 py-2 text-sm"
              style={{ background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)' }}
              title="Download individual salary slips for all staff"
            >
              <FileText size={16} />
              <span className="hidden sm:inline">All Slips</span>
              <span className="sm:hidden">Slips</span>
            </button>
            <button
              onClick={() => setShowBulkSender(true)}
              className="btn-premium whitespace-nowrap flex items-center justify-center gap-2 px-3 md:px-4 py-2 text-sm bg-[#25D366] hover:bg-[#20bd5a] text-white border-none"
              title="Rapidly send WhatsApp slips to all staff"
            >
              <MessageCircle size={16} />
              <span className="hidden sm:inline">Bulk WhatsApp</span>
              <span className="sm:hidden">WA</span>
            </button>
          </div>
        </div>
      </div>

      {/* Month/Year/Location Selection - Compact Single Row */}
      <div className="glass-card-static p-3 md:p-4">
        <div className="flex flex-row items-center justify-center gap-2 md:gap-4 flex-wrap">
          <div className="flex items-center gap-1">
            <label className="text-xs font-medium text-white/60 hidden sm:inline">Month:</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="input-premium px-2 py-1.5 text-sm"
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
            <label className="text-xs font-medium text-white/60 hidden sm:inline">Year:</label>
            <select
              value={selectedYear}
              onChange={(e) => {
                const newYear = Number(e.target.value);
                if (newYear === new Date().getFullYear() && selectedMonth > new Date().getMonth()) {
                  setSelectedMonth(new Date().getMonth());
                }
                setSelectedYear(newYear);
              }}
              className="input-premium px-2 py-1.5 text-sm"
            >
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 4 + i)
                .filter(y => y <= new Date().getFullYear())
                .map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <label className="text-xs font-medium text-white/60 hidden sm:inline">Location:</label>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="input-premium px-2 py-1.5 text-sm"
            >
              <option value="All">All Locations</option>
              {locations.map(loc => (<option key={loc.id} value={loc.name}>{loc.name}</option>))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <label className="text-xs font-medium text-white/60 hidden sm:inline">Payment:</label>
            <select
              value={paymentModeFilter}
              onChange={(e) => setPaymentModeFilter(e.target.value)}
              className="input-premium px-2 py-1.5 text-sm"
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
              className="input-premium px-2 py-1.5 text-sm"
            >
              <option value="All">All Floors</option>
              {Array.from(new Set(activeStaff.filter(s => s.floor).map(s => s.floor!))).map(flr => (
                <option key={flr} value={flr}>{flr}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <select
              value={designationFilter}
              onChange={(e) => setDesignationFilter(e.target.value)}
              className="input-premium px-2 py-1.5 text-sm"
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
              className="input-premium px-2 py-1.5 text-sm"
            >
              <option value="All">All Types</option>
              <option value="day_scholar">Day Scholar</option>
              <option value="accommodation">Accommodation</option>
            </select>
          </div>
        </div>
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
              <p className="text-sm text-white/60 mb-1">Full-Time Salary</p>
              <p className="text-3xl font-bold text-emerald-400">₹{(editMode ? Object.values(tempAdvances).reduce((sum, t) => sum + (t.netSalary || 0), 0) : totalSalaryDisbursed).toLocaleString()}</p>
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
              <p className="text-sm text-white/60 mb-1">Part-Time Earnings</p>
              <p className="text-3xl font-bold text-purple-400">₹{totalPartTimeEarnings.toLocaleString()}</p>
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
              <p className="text-3xl font-bold text-amber-400">{averageAttendance.toFixed(1)}</p>
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
              <p className="text-3xl font-bold text-indigo-400">₹{((editMode ? Object.values(tempAdvances).reduce((sum, t) => sum + (t.netSalary || 0), 0) : totalSalaryDisbursed) + totalPartTimeEarnings).toLocaleString()}</p>
              <p className="text-xs text-white/50">Full + Part-time</p>
            </div>
            <div className="stat-icon stat-icon-primary">
              <TrendingUp size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* Full-Time Salary Details Table */}
      <div className="table-container">
        <div className="p-4 md:p-6 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg md:text-xl font-bold text-white">
                Full-Time Salary Details - {new Date(0, selectedMonth).toLocaleString('default', { month: 'long' })} {selectedYear}
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
                  className="btn-premium flex items-center justify-center gap-2 px-3 md:px-4 py-2 text-sm"
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

        <div className="overflow-x-auto">
          <table className="table-premium">
            <thead>
              <tr>
                <th className="px-2 md:px-4 py-3 md:py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">S.No</th>
                <th className="px-2 md:px-4 py-3 md:py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 z-10 bg-gray-50">Name</th>
                {salaryVisibleCols.location !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>}
                {salaryVisibleCols.type !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>}
                {salaryVisibleCols.payment !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Payment</th>}
                {salaryVisibleCols.floor !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Floor</th>}
                {salaryVisibleCols.designation !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Designation</th>}
                {salaryVisibleCols.present !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Present</th>}
                {salaryVisibleCols.leave !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Leave</th>}
                {salaryVisibleCols.sunAbs !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Sun Abs</th>}
                {salaryVisibleCols.oldAdv !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Old Adv</th>}
                {salaryVisibleCols.curAdv !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Cur Adv</th>}
                {salaryVisibleCols.deduction !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Deduction</th>}
                {salaryVisibleCols.basic !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{salaryCategories.find((c: SalaryCategory) => c.id === 'basic')?.name || 'Basic'}</th>}
                {salaryVisibleCols.incentive !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{salaryCategories.find((c: SalaryCategory) => c.id === 'incentive')?.name || 'Incentive'}</th>}
                {salaryVisibleCols.hra !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{salaryCategories.find((c: SalaryCategory) => c.id === 'hra')?.name || 'HRA'}</th>}
                {salaryVisibleCols.meal !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{salaryCategories.find((c: SalaryCategory) => c.id === 'meal_allowance')?.name || 'Meal Allowance'}</th>}
                {customCategories.map((cat: SalaryCategory) => (<th key={cat.id} className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{cat.name}</th>))}
                {salaryVisibleCols.sunPenalty !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Sun Penalty</th>}
                {salaryVisibleCols.statutory !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">ESI/PF/Stat</th>}
                {salaryVisibleCols.gross !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Gross</th>}
                {salaryVisibleCols.net !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Net Salary</th>}
                {salaryVisibleCols.newAdv !== false && <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">New Adv</th>}
                <th className="px-2 md:px-4 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {salaryDetails.map((detail, index) => {
                const staffMember = activeStaff.find(s => s.id === detail.staffId);
                const tempData = tempAdvances[detail.staffId];

                return (
                  <tr key={detail.staffId} className={`hover:bg-gray-50 text-base ${(() => {
                    const uninformedDays = attendance.filter(a =>
                      a.staffId === detail.staffId && a.isUninformed &&
                      new Date(a.date).getMonth() === selectedMonth && new Date(a.date).getFullYear() === selectedYear
                    ).length;
                    return uninformedDays > 0 ? 'bg-orange-50 border-l-4 border-orange-400' : '';
                  })()}`}>
                    <td className="px-2 md:px-4 py-3 whitespace-nowrap text-gray-900">{index + 1}</td>
                    <td className="px-2 md:px-4 py-3 whitespace-nowrap font-medium text-gray-900 sticky left-0 z-10 bg-white">
                      {staffMember?.name}
                      {(() => {
                        const uCount = attendance.filter(a =>
                          a.staffId === detail.staffId && a.isUninformed &&
                          new Date(a.date).getMonth() === selectedMonth && new Date(a.date).getFullYear() === selectedYear
                        ).length;
                        return uCount > 0 ? <span className="ml-1 text-[10px] text-orange-600 font-bold">⚠{uCount}</span> : null;
                      })()}
                    </td>
                    {salaryVisibleCols.location !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center">
                      <span className="text-xs font-medium">{staffMember?.location}</span>
                    </td>}
                    {salaryVisibleCols.type !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${staffMember?.staffAccommodation === 'day_scholar' ? 'bg-blue-100 text-blue-700' : staffMember?.staffAccommodation === 'accommodation' ? 'bg-purple-100 text-purple-700' : 'text-gray-500'}`}>
                        {staffMember?.staffAccommodation === 'day_scholar' ? 'Day' : staffMember?.staffAccommodation === 'accommodation' ? 'Acc' : '-'}
                      </span>
                    </td>}
                    {salaryVisibleCols.payment !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${(staffMember?.paymentMode || 'cash') === 'bank' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {(staffMember?.paymentMode || 'cash') === 'bank' ? 'Bank' : 'Cash'}
                      </span>
                    </td>}
                    {salaryVisibleCols.floor !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center text-xs text-gray-600">{staffMember?.floor || '-'}</td>}
                    {salaryVisibleCols.designation !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center text-xs text-gray-600">{staffMember?.designation || '-'}</td>}
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
                      {editMode ? (
                        <input type="number" value={tempData?.oldAdvance || 0} onChange={(e) => updateTempAdvance(detail.staffId, 'oldAdvance', Number(e.target.value))} className="w-16 md:w-20 px-1 md:px-2 py-1 text-xs border rounded text-center" />
                      ) : (
                        <span className="text-blue-600">₹{detail.oldAdv}</span>
                      )}
                    </td>}
                    {salaryVisibleCols.curAdv !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center">
                      {editMode ? (
                        <input type="number" value={tempData?.currentAdvance || 0} onChange={(e) => updateTempAdvance(detail.staffId, 'currentAdvance', Number(e.target.value))} className="w-16 md:w-20 px-1 md:px-2 py-1 text-xs border rounded text-center" />
                      ) : (
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-blue-600">₹{detail.curAdv}</span>
                          {(advanceEntries[detail.staffId]?.length || 0) > 0 && (
                            <span className="text-[9px] font-bold px-1 rounded bg-blue-100 text-blue-700" title={`${advanceEntries[detail.staffId].length} date-wise entries`}>
                              {advanceEntries[detail.staffId].length}
                            </span>
                          )}
                          <button onClick={async () => {
                            const entries = await advanceEntryService.getByStaffAndMonth(detail.staffId, selectedMonth, selectedYear);
                            setAdvanceEntries(prev => ({ ...prev, [detail.staffId]: entries }));
                            setShowAdvanceEntryModal(detail.staffId);
                          }} className="p-0.5 rounded text-blue-400 hover:text-blue-600 hover:bg-blue-50" title="Add / view date-wise advance entries">
                            <Plus size={12} />
                          </button>
                        </div>
                      )}
                    </td>}
                    {salaryVisibleCols.deduction !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center">
                      {editMode ? (
                        <input type="number" value={tempData?.deduction || 0} onChange={(e) => updateTempAdvance(detail.staffId, 'deduction', Number(e.target.value))} className="w-16 md:w-20 px-1 md:px-2 py-1 text-xs border rounded text-center" />
                      ) : (
                        <span className="text-red-600">₹{detail.deduction}</span>
                      )}
                    </td>}
                    {salaryVisibleCols.basic !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center">
                      {editMode ? (
                        <input type="number" value={tempData?.basicOverride || 0} onChange={(e) => updateTempAdvance(detail.staffId, 'basicOverride', Number(e.target.value))} className="w-16 md:w-20 px-1 md:px-2 py-1 text-xs border rounded text-center" />
                      ) : (
                        <span className="text-gray-900">₹{detail.basicEarned}</span>
                      )}
                    </td>}
                    {salaryVisibleCols.incentive !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center">
                      {editMode ? (
                        <input type="number" value={tempData?.incentiveOverride || 0} onChange={(e) => updateTempAdvance(detail.staffId, 'incentiveOverride', Number(e.target.value))} className="w-16 md:w-20 px-1 md:px-2 py-1 text-xs border rounded text-center" />
                      ) : (
                        <span className="text-gray-900">₹{detail.incentiveEarned}</span>
                      )}
                    </td>}
                    {salaryVisibleCols.hra !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center">
                      {editMode ? (
                        <input type="number" value={tempData?.hraOverride || 0} onChange={(e) => updateTempAdvance(detail.staffId, 'hraOverride', Number(e.target.value))} className="w-16 md:w-20 px-1 md:px-2 py-1 text-xs border rounded text-center" />
                      ) : (
                        <span className="text-gray-900">₹{detail.hraEarned}</span>
                      )}
                    </td>}
                    {salaryVisibleCols.meal !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center">
                      {editMode ? (
                        <input type="number" value={tempData?.mealAllowanceOverride || 0} onChange={(e) => updateTempAdvance(detail.staffId, 'mealAllowanceOverride', Number(e.target.value))} className="w-16 md:w-20 px-1 md:px-2 py-1 text-xs border rounded text-center" />
                      ) : (
                        <span className="text-gray-900">₹{detail.mealAllowance}</span>
                      )}
                    </td>}
                    {customCategories.map((cat: SalaryCategory) => {
                      const val = staffMember?.salarySupplements?.[cat.id] || staffMember?.salarySupplements?.[cat.key] || 0;
                      return (
                        <td key={cat.id} className="px-2 md:px-4 py-3 whitespace-nowrap text-center">
                          <span className="text-gray-900">₹{val.toLocaleString()}</span>
                        </td>
                      );
                    })}
                    {salaryVisibleCols.sunPenalty !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center">
                      {editMode ? (
                        <input type="number" value={tempData?.sundayPenaltyOverride || 0} onChange={(e) => updateTempAdvance(detail.staffId, 'sundayPenaltyOverride', Number(e.target.value))} className="w-16 md:w-20 px-1 md:px-2 py-1 text-xs border rounded text-center" />
                      ) : (
                        <span className={`${detail.sundayPenalty > 0 ? 'text-red-600' : 'text-gray-900'}`}>₹{detail.sundayPenalty}</span>
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
                    {salaryVisibleCols.gross !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center font-semibold text-green-600">
                      ₹{editMode ? (tempData?.grossSalary || 0) : detail.grossSalary}
                    </td>}
                    {salaryVisibleCols.net !== false && <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center font-bold text-green-700">
                      ₹{editMode ? (tempData?.netSalary || 0) : detail.netSalary}
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
                          title="Download Salary Slip"
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
                      </div>
                    </td>
                  </tr>
                );
              })}
              {/* Totals Row */}
              <tr className="bg-gray-100 font-bold text-sm">
                <td className="px-2 md:px-4 py-3 whitespace-nowrap" colSpan={8}>
                  <span className="text-gray-800">TOTAL</span>
                </td>
                <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center text-blue-600">
                  ₹{totals.totalOldAdv.toLocaleString()}
                </td>
                <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center text-blue-600">
                  ₹{totals.totalCurAdv.toLocaleString()}
                </td>
                <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center text-red-600">
                  ₹{totals.totalDeduction.toLocaleString()}
                </td>
                <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center" colSpan={4 + customCategories.length}></td>
                <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center text-green-600">
                  ₹{totals.totalGross.toLocaleString()}
                </td>
                <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center text-green-700">
                  ₹{totals.totalNet.toLocaleString()}
                </td>
                <td className="px-2 md:px-4 py-3 whitespace-nowrap text-center text-blue-600">
                  ₹{totals.totalNewAdv.toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div >

      {/* Part-Time Salary Details */}
      {
        partTimeSalaries.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 md:p-6 border-b border-gray-200">
              <h2 className="text-lg md:text-xl font-bold text-gray-800">
                Part-Time Staff Earnings - {new Date(0, selectedMonth).toLocaleString('default', { month: 'long' })} {selectedYear}
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
                    <th className="px-3 md:px-6 py-3 md:py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
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
                  {/* Part-Time Totals Row */}
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
                <label className="block text-xs font-semibold text-gray-500 mb-1">Purpose</label>
                <input type="text" value={advanceForm.purpose}
                  onChange={e => setAdvanceForm(f => ({ ...f, purpose: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Festival advance" />
              </div>
            </div>

            {/* Existing entries for this staff this month */}
            {(advanceEntries[showAdvanceEntryModal] || []).length > 0 && (
              <div className="mt-4 pt-3 border-t border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500">Entries this month:</p>
                  <p className="text-xs font-bold text-blue-600">
                    Total: ₹{(advanceEntries[showAdvanceEntryModal] || []).reduce((s, e) => s + e.amount, 0).toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {(advanceEntries[showAdvanceEntryModal] || []).map(entry => (
                    <div key={entry.id} className={`flex items-center justify-between p-2 rounded-lg text-sm ${editingEntryId === entry.id ? 'bg-blue-50 ring-1 ring-blue-300' : 'bg-gray-50'}`}>
                      <div>
                        <span className="font-medium">{new Date(entry.entryDate).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}</span>
                        {entry.purpose && <span className="text-gray-500 ml-2">— {entry.purpose}</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-blue-600">₹{entry.amount.toLocaleString('en-IN')}</span>
                        <button onClick={() => {
                          setEditingEntryId(entry.id);
                          setAdvanceForm({ entryDate: entry.entryDate, amount: entry.amount, purpose: entry.purpose || '' });
                        }} className="p-1 text-amber-500 hover:text-amber-700" title="Edit"><Edit2 size={13} /></button>
                        <button onClick={async () => {
                          if (!confirm('Delete this advance entry?')) return;
                          await advanceEntryService.delete(entry.id);
                          const updated = await advanceEntryService.getByStaffAndMonth(showAdvanceEntryModal!, selectedMonth, selectedYear);
                          setAdvanceEntries(prev => ({ ...prev, [showAdvanceEntryModal!]: updated }));
                          if (editingEntryId === entry.id) {
                            setEditingEntryId(null);
                            setAdvanceForm({ entryDate: new Date().toISOString().split('T')[0], amount: 0, purpose: '' });
                          }
                        }} className="p-1 text-red-400 hover:text-red-600" title="Delete"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <button onClick={() => { setShowAdvanceEntryModal(null); setEditingEntryId(null); setAdvanceForm({ entryDate: new Date().toISOString().split('T')[0], amount: 0, purpose: '' }); }}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-600 font-semibold text-sm hover:bg-gray-50">Close</button>
              {editingEntryId && (
                <button onClick={() => {
                  setEditingEntryId(null);
                  setAdvanceForm({ entryDate: new Date().toISOString().split('T')[0], amount: 0, purpose: '' });
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
                  });
                } else {
                  await advanceEntryService.create({
                    staffId,
                    entryDate: advanceForm.entryDate,
                    amount: advanceForm.amount,
                    purpose: advanceForm.purpose || undefined,
                    month: selectedMonth,
                    year: selectedYear
                  });
                }
                const updated = await advanceEntryService.getByStaffAndMonth(staffId, selectedMonth, selectedYear);
                setAdvanceEntries(prev => ({ ...prev, [staffId]: updated }));
                setAdvanceForm({ entryDate: new Date().toISOString().split('T')[0], amount: 0, purpose: '' });
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

export default SalaryManagement;