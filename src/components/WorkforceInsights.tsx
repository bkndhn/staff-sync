import React, { useState, useMemo, useEffect } from 'react';
import { Staff, Attendance, AdvanceDeduction, PayrollOverride } from '../types';
import {
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  IndianRupee,
  Calendar,
  Users,
  MapPin,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Info,
  DollarSign,
  TrendingDown,
  Building,
  Filter
} from 'lucide-react';
import {
  calculateAttendanceMetrics,
  calculateSalary,
  calculatePayroll,
  isSunday,
  roundToNearest10
} from '../utils/salaryCalculations';
import { salaryOverrideService } from '../services/salaryOverrideService';
import { salaryCategoryService } from '../services/salaryCategoryService';
import { DEFAULT_SHIFT_WINDOWS, parseHHMM, shiftService } from '../services/shiftService';
import { computeStatutoryBreakdown } from '../utils/statutoryDeductions';
import { AIPredictor } from './AIPredictor';
import AIWorkforceInsightsWidget from './dashboard/AIWorkforceInsightsWidget';
import { AIInsightsWidget } from './AIInsightsWidget';
import DailyPayrollOverviewWidget from './dashboard/DailyPayrollOverviewWidget';
interface WorkforceInsightsProps {
  staff: Staff[];
  attendance: Attendance[];
  advances: AdvanceDeduction[];
  userLocation?: string;
  userRole?: 'admin' | 'manager' | 'staff';
  currentUser?: any;
}

const getDatesInRange = (fromStr: string, toStr: string): string[] => {
  const dates: string[] = [];
  const curr = new Date(fromStr);
  const end = new Date(toStr);
  let safety = 0;
  while (curr <= end && safety < 1000) {
    dates.push(curr.toISOString().split('T')[0]);
    curr.setDate(curr.getDate() + 1);
    safety++;
  }
  return dates;
};

const getDateRangeFromType = (type: string) => {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  switch (type) {
    case 'today':
      return { from: todayStr, to: todayStr };
    case 'yesterday': {
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const yestStr = yesterday.toISOString().split('T')[0];
      return { from: yestStr, to: yestStr };
    }
    case 'week': {
      const startOfWeek = new Date(today);
      const day = today.getDay();
      const diff = today.getDate() - day + (day === 0 ? -6 : 1);
      startOfWeek.setDate(diff);
      return {
        from: startOfWeek.toISOString().split('T')[0],
        to: todayStr,
      };
    }
    case 'month': {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      return {
        from: startOfMonth.toISOString().split('T')[0],
        to: todayStr,
      };
    }
    case 'year': {
      const startOfYear = new Date(today.getFullYear(), 0, 1);
      return {
        from: startOfYear.toISOString().split('T')[0],
        to: todayStr,
      };
    }
    default:
      return { from: todayStr, to: todayStr };
  }
};

const WorkforceInsights: React.FC<WorkforceInsightsProps> = ({
  staff,
  attendance,
  advances,
  userLocation,
  userRole = 'manager',
  currentUser
}) => {
  const [filterType, setFilterType] = useState<'today' | 'yesterday' | 'week' | 'month' | 'year' | 'custom'>('today');
  const [fromDate, setFromDate] = useState<string>(() => getDateRangeFromType('today').from);
  const [toDate, setToDate] = useState<string>(() => getDateRangeFromType('today').to);
  const [activeBreakdownTab, setActiveBreakdownTab] = useState<'late' | 'early' | 'absent' | 'ontime'>('late');
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [showFilters, setShowFilters] = useState(false);

  const [globalShiftWindows, setGlobalShiftWindows] = useState<any>(DEFAULT_SHIFT_WINDOWS);
  const [salaryCategories, setSalaryCategories] = useState<any[]>([]);
  const [monthlyOverrides, setMonthlyOverrides] = useState<Record<string, PayrollOverride[]>>({});

  useEffect(() => {
    shiftService.loadGlobal().then(setGlobalShiftWindows);
    salaryCategoryService.getCategories().then(setSalaryCategories);
  }, []);

  // Fetch overrides for months spanned by selected date range
  useEffect(() => {
    const fetchAllOverrides = async () => {
      if (!fromDate || !toDate || toDate < fromDate) return;
      const yearMonths: { month: number; year: number }[] = [];
      const start = new Date(fromDate);
      const end = new Date(toDate);
      
      const curr = new Date(start.getFullYear(), start.getMonth(), 1);
      while (curr <= end) {
        yearMonths.push({ month: curr.getMonth() + 1, year: curr.getFullYear() });
        curr.setMonth(curr.getMonth() + 1);
      }
      
      const overridesMap: Record<string, PayrollOverride[]> = {};
      await Promise.all(
        yearMonths.map(async ({ month, year }) => {
          try {
            const list = await salaryOverrideService.getOverrides(month, year);
            overridesMap[`${year}-${month}`] = list;
          } catch (e) {
            console.error('Error fetching overrides:', e);
          }
        })
      );
      setMonthlyOverrides(overridesMap);
    };
    
    fetchAllOverrides();
  }, [fromDate, toDate]);

  const handleFilterTypeChange = (type: 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'custom') => {
    setFilterType(type);
    if (type !== 'custom') {
      const range = getDateRangeFromType(type);
      setFromDate(range.from);
      setToDate(range.to);
    }
  };

  const isDateInvalid = fromDate && toDate && toDate < fromDate;

  // Filter staff based on role & location
  const visibleStaff = useMemo(() => {
    if (userRole === 'admin') return staff.filter(s => s.isActive);
    return staff.filter(s => s.isActive && s.location === userLocation);
  }, [staff, userRole, userLocation]);

  const rangeDates = useMemo(() => {
    if (isDateInvalid) return [];
    return getDatesInRange(fromDate, toDate);
  }, [fromDate, toDate, isDateInvalid]);

  const getPunchMetrics = (record: Attendance, staffMember: Staff, shiftWindows: any) => {
    if (record.status === 'Absent') return { isLate: false, isEarly: false, lateMins: 0, earlyMins: 0, isOnTime: false };
    
    let shiftKey: any = record.shift || staffMember.shift || 'Both';
    if (shiftKey === '-') shiftKey = staffMember.shift || 'Both';
    const baseWin = (shiftWindows && shiftWindows[shiftKey]) || (DEFAULT_SHIFT_WINDOWS as any)[shiftKey] || DEFAULT_SHIFT_WINDOWS['Both'];
    const win = baseWin ? (staffMember.shiftWindow ? { ...baseWin, ...staffMember.shiftWindow } : baseWin) : DEFAULT_SHIFT_WINDOWS['Both'];
    
    let lateMins = 0;
    let isLate = false;
    if (record.arrivalTime && win) {
      const arr = parseHHMM(record.arrivalTime);
      const start = parseHHMM(win.start);
      if (arr !== null && start !== null) {
        lateMins = Math.max(0, arr - start);
        if (lateMins > win.graceLateMin) {
          isLate = true;
        }
      }
    }
    
    let earlyMins = 0;
    let isEarly = false;
    if (record.leavingTime && win) {
      const lev = parseHHMM(record.leavingTime);
      const end = parseHHMM(win.end);
      if (lev !== null && end !== null) {
        earlyMins = Math.max(0, end - lev);
        if (earlyMins > win.graceEarlyMin) {
          isEarly = true;
        }
      }
    }
    
    const isOnTime = record.status === 'Present' && !isLate;
    
    return { isLate, isEarly, lateMins, earlyMins, isOnTime };
  };

  // Aggregated attendance metrics
  const attendanceStats = useMemo(() => {
    if (isDateInvalid || rangeDates.length === 0) {
      return {
        presentCount: 0,
        absentCount: 0,
        halfDayCount: 0,
        onTimeCount: 0,
        lateCount: 0,
        earlyCount: 0,
        uninformedCount: 0,
        trendData: [],
        lateComersMap: [],
        earlyLeaversMap: [],
        absentsMap: [],
        onTimeMap: []
      };
    }

    let presentSum = 0;
    let absentSum = 0;
    let halfDaySum = 0;
    let onTimeSum = 0;
    let lateSum = 0;
    let earlySum = 0;
    let uninformedSum = 0;

    const lateMap: Record<string, { staffId: string; count: number; details: string[] }> = {};
    const earlyMap: Record<string, { staffId: string; count: number; details: string[] }> = {};
    const abMap: Record<string, { staffId: string; count: number; details: string[] }> = {};
    const otMap: Record<string, { staffId: string; count: number }> = {};

    const trendData: { date: string; present: number; absent: number }[] = [];

    rangeDates.forEach(dateStr => {
      let dailyPresent = 0;
      let dailyAbsent = 0;

      visibleStaff.forEach(s => {
        const record = attendance.find(a => a.staffId === s.id && a.date === dateStr && !a.isPartTime);
        const status = record?.status || 'Absent';

        if (status === 'Present' || status === 'Pending Full Day' || status === 'Manual Override') {
          const val = record?.attendanceValue ?? 1;
          dailyPresent += val;
          presentSum += val;

          const pm = getPunchMetrics(record as Attendance, s, globalShiftWindows);
          if (pm.isLate) {
            lateSum++;
            if (!lateMap[s.id]) lateMap[s.id] = { staffId: s.id, count: 0, details: [] };
            lateMap[s.id].count++;
            lateMap[s.id].details.push(`${dateStr} (Late: ${pm.lateMins}m)`);
          } else if (pm.isOnTime) {
            onTimeSum++;
            if (!otMap[s.id]) otMap[s.id] = { staffId: s.id, count: 0 };
            otMap[s.id].count++;
          }

          if (pm.isEarly) {
            earlySum++;
            if (!earlyMap[s.id]) earlyMap[s.id] = { staffId: s.id, count: 0, details: [] };
            earlyMap[s.id].count++;
            earlyMap[s.id].details.push(`${dateStr} (Early: ${pm.earlyMins}m)`);
          }
        } else if (status === 'Half Day') {
          const val = record?.attendanceValue ?? 0.5;
          dailyPresent += val;
          halfDaySum++;
          presentSum += val;

          const pm = getPunchMetrics(record as Attendance, s, globalShiftWindows);
          if (pm.isLate) {
            lateSum++;
            if (!lateMap[s.id]) lateMap[s.id] = { staffId: s.id, count: 0, details: [] };
            lateMap[s.id].count++;
            lateMap[s.id].details.push(`${dateStr} (Late: ${pm.lateMins}m)`);
          }
          if (pm.isEarly) {
            earlySum++;
            if (!earlyMap[s.id]) earlyMap[s.id] = { staffId: s.id, count: 0, details: [] };
            earlyMap[s.id].count++;
            earlyMap[s.id].details.push(`${dateStr} (Early: ${pm.earlyMins}m)`);
          }
        } else {
          dailyAbsent++;
          absentSum++;
          if (!abMap[s.id]) abMap[s.id] = { staffId: s.id, count: 0, details: [] };
          abMap[s.id].count++;
          abMap[s.id].details.push(dateStr);
          if (record?.isUninformed) {
            uninformedSum++;
          }
        }
      });

      trendData.push({
        date: dateStr,
        present: dailyPresent,
        absent: dailyAbsent
      });
    });

    const getStaffInfo = (id: string) => {
      const s = visibleStaff.find(member => member.id === id);
      return {
        name: s?.name || 'Unknown',
        designation: s?.designation || 'Staff',
        location: s?.location || 'Unknown'
      };
    };

    const lateComersMap = Object.entries(lateMap).map(([id, info]) => ({
      ...info,
      staffId: id,
      ...getStaffInfo(id)
    })).sort((a, b) => b.count - a.count);

    const earlyLeaversMap = Object.entries(earlyMap).map(([id, info]) => ({
      ...info,
      staffId: id,
      ...getStaffInfo(id)
    })).sort((a, b) => b.count - a.count);

    const absentsMap = Object.entries(abMap).map(([id, info]) => ({
      ...info,
      staffId: id,
      ...getStaffInfo(id)
    })).sort((a, b) => b.count - a.count);

    const onTimeMap = Object.entries(otMap).map(([id, info]) => ({
      ...info,
      staffId: id,
      ...getStaffInfo(id)
    })).sort((a, b) => b.count - a.count);

    return {
      presentCount: presentSum,
      absentCount: absentSum,
      halfDayCount: halfDaySum,
      onTimeCount: onTimeSum,
      lateCount: lateSum,
      earlyCount: earlySum,
      uninformedCount: uninformedSum,
      trendData,
      lateComersMap,
      earlyLeaversMap,
      absentsMap,
      onTimeMap
    };
  }, [rangeDates, visibleStaff, attendance, globalShiftWindows, isDateInvalid]);

  // Find month-years spanned by range
  const representedMonths = useMemo(() => {
    if (isDateInvalid || rangeDates.length === 0) return [];
    
    const unique = new Set<string>();
    rangeDates.forEach(d => {
      const date = new Date(d);
      unique.add(`${date.getFullYear()}-${date.getMonth()}`);
    });
    
    return Array.from(unique).map(str => {
      const [year, month] = str.split('-').map(Number);
      return { month, year };
    });
  }, [rangeDates, isDateInvalid]);

  // Aggregated payroll metrics
  const payrollSummary = useMemo(() => {
    let grossTotal = 0;
    let netTotal = 0;
    let sundayPenaltyTotal = 0;
    
    let oldAdvanceTotal = 0;
    let currentAdvanceTotal = 0;
    let deductionTotal = 0;
    let newAdvanceTotal = 0;
    
    let lateDeductionTotal = 0;
    let earlyDeductionTotal = 0;

    representedMonths.forEach(({ month, year }) => {
      visibleStaff.forEach(s => {
        const metrics = calculateAttendanceMetrics(s.id, attendance, year, month);
        const adv = advances.find(a => a.staffId === s.id && a.month === month && a.year === year) || null;
        const baseDetail = calculatePayroll(s, metrics, adv, advances, attendance, month, year);
        
        const monthKey = `${year}-${month + 1}`;
        const overridesList = monthlyOverrides[monthKey] || [];
        const o = overridesList.find(override => override.staffId === s.id) || null;
        
        let finalDetail = baseDetail;
        if (o) {
          const basic = o.basicOverride ?? baseDetail.basicEarned;
          const incentive = o.incentiveOverride ?? baseDetail.incentiveEarned;
          const hra = o.hraOverride ?? baseDetail.hraEarned;
          const meal = o.mealAllowanceOverride ?? baseDetail.mealAllowance;
          const sundayPenalty = o.sundayPenaltyOverride ?? baseDetail.sundayPenalty;
          const lateComingDeduction = o.lateComingDeductionOverride ?? (baseDetail.lateComingDeduction ?? 0);
          const earlyLeaveDeduction = o.earlyLeaveDeductionOverride ?? (baseDetail.earlyLeaveDeduction ?? 0);
          const supplementsTotal = baseDetail.grossPayroll - (baseDetail.basicEarned + baseDetail.incentiveEarned + baseDetail.hraEarned + baseDetail.mealAllowance);
          
          const gross = roundToNearest10(basic + incentive + hra + meal + supplementsTotal);
          const net = roundToNearest10(gross - baseDetail.curAdv - baseDetail.deduction - sundayPenalty - lateComingDeduction - earlyLeaveDeduction);
          
          finalDetail = {
            ...baseDetail,
            basicEarned: basic,
            incentiveEarned: incentive,
            hraEarned: hra,
            mealAllowance: meal,
            sundayPenalty,
            lateComingDeduction,
            earlyLeaveDeduction,
            grossPayroll: gross,
            netPayroll: Math.max(0, net)
          };
        }
        
        const breakdown = computeStatutoryBreakdown(s, {
          basic: finalDetail.basicEarned,
          hra: finalDetail.hraEarned,
          incentive: finalDetail.incentiveEarned,
          gross: finalDetail.grossSalary
        });
        const statutoryTotal = breakdown.reduce((sum, b) => sum + b.amount, 0);
        const finalNetPayroll = Math.max(0, roundToNearest10(finalDetail.netPayroll - statutoryTotal));
        
        grossTotal += finalDetail.grossPayroll;
        netTotal += finalNetPayroll;
        sundayPenaltyTotal += finalDetail.sundayPenalty;
        
        oldAdvanceTotal += finalDetail.oldAdv;
        currentAdvanceTotal += finalDetail.curAdv;
        deductionTotal += finalDetail.deduction;
        newAdvanceTotal += finalDetail.newAdv;
        
        lateDeductionTotal += finalDetail.lateComingDeduction || 0;
        earlyDeductionTotal += finalDetail.earlyLeaveDeduction || 0;
      });
    });

    return {
      grossTotal,
      netTotal,
      sundayPenaltyTotal,
      oldAdvanceTotal,
      currentAdvanceTotal,
      deductionTotal,
      newAdvanceTotal,
      lateDeductionTotal,
      earlyDeductionTotal
    };
  }, [representedMonths, visibleStaff, attendance, advances, monthlyOverrides]);

  // Top 5 highest salary employees for active month
  const highestSalaryEmployees = useMemo(() => {
    const activeMonth = representedMonths[0] || { month: new Date().getMonth(), year: new Date().getFullYear() };
    const { month, year } = activeMonth;
    
    const list = visibleStaff.map(s => {
      const metrics = calculateAttendanceMetrics(s.id, attendance, year, month);
      const adv = advances.find(a => a.staffId === s.id && a.month === month && a.year === year) || null;
      const baseDetail = calculatePayroll(s, metrics, adv, advances, attendance, month, year);
      
      const monthKey = `${year}-${month + 1}`;
      const overridesList = monthlyOverrides[monthKey] || [];
      const o = overridesList.find(override => override.staffId === s.id) || null;
      
      let finalDetail = baseDetail;
      if (o) {
        const basic = o.basicOverride ?? baseDetail.basicEarned;
        const incentive = o.incentiveOverride ?? baseDetail.incentiveEarned;
        const hra = o.hraOverride ?? baseDetail.hraEarned;
        const meal = o.mealAllowanceOverride ?? baseDetail.mealAllowance;
        const sundayPenalty = o.sundayPenaltyOverride ?? baseDetail.sundayPenalty;
        const lateComingDeduction = o.lateComingDeductionOverride ?? (baseDetail.lateComingDeduction ?? 0);
        const earlyLeaveDeduction = o.earlyLeaveDeductionOverride ?? (baseDetail.earlyLeaveDeduction ?? 0);
        const supplementsTotal = baseDetail.grossPayroll - (baseDetail.basicEarned + baseDetail.incentiveEarned + baseDetail.hraEarned + baseDetail.mealAllowance);
        
        const gross = roundToNearest10(basic + incentive + hra + meal + supplementsTotal);
        const net = roundToNearest10(gross - baseDetail.curAdv - baseDetail.deduction - sundayPenalty - lateComingDeduction - earlyLeaveDeduction);
        
        finalDetail = {
          ...baseDetail,
          basicEarned: basic,
          incentiveEarned: incentive,
          hraEarned: hra,
          mealAllowance: meal,
          sundayPenalty,
          lateComingDeduction,
          earlyLeaveDeduction,
          grossPayroll: gross,
          netPayroll: Math.max(0, net)
        };
      }
      
      const breakdown = computeStatutoryBreakdown(s, {
        basic: finalDetail.basicEarned,
        hra: finalDetail.hraEarned,
        incentive: finalDetail.incentiveEarned,
        gross: finalDetail.grossSalary
      });
      const statutoryTotal = breakdown.reduce((sum, b) => sum + b.amount, 0);
      const finalNet = Math.max(0, roundToNearest10(finalDetail.netPayroll - statutoryTotal));
      
      return {
        staffId: s.id,
        name: s.name,
        designation: s.designation || 'Staff',
        location: s.location,
        basicPayroll: s.basicSalary,
        grossPayroll: finalDetail.grossSalary,
        netPayroll: finalNet
      };
    });
    
    return list.sort((a, b) => b.netPayroll - a.netPayroll).slice(0, 5);
  }, [visibleStaff, attendance, advances, monthlyOverrides, representedMonths]);

  // Toggle expanded details
  const toggleRow = (id: string) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // SVG Line Chart coordinates calculation
  const chartPath = useMemo(() => {
    if (attendanceStats.trendData.length < 2) return '';
    const width = 600;
    const height = 150;
    const padding = 20;
    const data = attendanceStats.trendData;
    const maxVal = Math.max(1, ...data.map(d => d.present + d.absent));

    const points = data.map((d, i) => {
      const x = padding + (i / (data.length - 1)) * (width - padding * 2);
      const y = height - padding - (d.present / maxVal) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    return `M ${points.join(' L ')}`;
  }, [attendanceStats.trendData]);

  const absentChartPath = useMemo(() => {
    if (attendanceStats.trendData.length < 2) return '';
    const width = 600;
    const height = 150;
    const padding = 20;
    const data = attendanceStats.trendData;
    const maxVal = Math.max(1, ...data.map(d => d.present + d.absent));

    const points = data.map((d, i) => {
      const x = padding + (i / (data.length - 1)) * (width - padding * 2);
      const y = height - padding - (d.absent / maxVal) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    return `M ${points.join(' L ')}`;
  }, [attendanceStats.trendData]);

  return (
    <div className="p-3 md:p-6 pb-24 space-y-6 max-w-7xl mx-auto">
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 id="insights-heading" className="text-xl md:text-3xl font-extrabold text-gradient">Workforce Insights</h1>
          <p className="text-xs md:text-sm text-[var(--text-muted)] mt-1">
            {userRole === 'admin' ? 'Global system-wide operational analytics' : `Operational overview for location: ${userLocation}`}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold px-4 py-2 bg-[var(--bg-card)] border border-[var(--glass-border)] text-[var(--text-secondary)] rounded-2xl">
          <Calendar size={14} className="text-indigo-400" />
          <span>Range Span: {representedMonths.map(({ month, year }) => new Date(year, month).toLocaleString('default', { month: 'short', year: '2-digit' })).join(', ')}</span>
        </div>
      </div>

      {/* AI Workforce Insights (moved here from Dashboard) */}
      <AIWorkforceInsightsWidget
        staff={staff}
        todayAttendance={attendance.filter(a => a.date === new Date().toISOString().split('T')[0])}
        locations={Array.from(new Set(staff.map(s => s.location).filter(Boolean))).map(name => ({ name: name as string, color: '', stats: {} }))}
      />

      <AIInsightsWidget tenantId={currentUser?.tenant_id} />

      <DailyPayrollOverviewWidget
        todayAttendance={attendance.filter(a => a.date === new Date().toISOString().split('T')[0])}
        staff={staff}
      />

      {/* Date Filters Panel */}
      <div className="bg-[var(--bg-card)] border border-[var(--glass-border)] p-4 md:p-6 rounded-3xl shadow-[var(--shadow-soft)] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <Filter size={16} className="text-indigo-400" />
            <span>Filter Options</span>
          </div>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="sm:hidden flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-xs font-semibold text-[var(--text-primary)]"
          >
            <span>{showFilters ? 'Hide Filters' : 'Show Filters'}</span>
          </button>
        </div>

        <div className={`${showFilters ? 'block' : 'hidden sm:block'} space-y-4 pt-2 sm:pt-0`}>
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--glass-border)] pb-4">
            {(['today', 'yesterday', 'week', 'month', 'year', 'custom'] as const).map(type => (
              <button
                key={type}
                onClick={() => handleFilterTypeChange(type)}
                className={`px-4 py-2 rounded-xl text-xs md:text-sm font-bold capitalize transition-all ${
                  filterType === type
                    ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/20'
                    : 'bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-indigo-500/30'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

        {filterType === 'custom' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label htmlFor="from-date-input" className="block text-xs font-bold text-[var(--text-muted)] mb-1.5 uppercase tracking-wide">From Date</label>
              <input
                id="from-date-input"
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-primary)] p-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-semibold"
              />
            </div>
            <div>
              <label htmlFor="to-date-input" className="block text-xs font-bold text-[var(--text-muted)] mb-1.5 uppercase tracking-wide">To Date</label>
              <input
                id="to-date-input"
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-primary)] p-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-semibold"
              />
            </div>
          </div>
        )}

        {isDateInvalid && (
          <div className="p-3 bg-red-500/15 border border-red-500/30 text-red-400 rounded-2xl flex items-center gap-3 text-xs md:text-sm font-semibold">
            <AlertTriangle size={18} />
            <span>Date Rule Error: "To Date" cannot be earlier than "From Date". Metrics computation paused.</span>
          </div>
        )}
        </div>
      </div>

      {!isDateInvalid && (
        <>
          {/* AI Predictor for Flex Staff */}
          <AIPredictor 
            attendance={attendance} 
            userLocation={userLocation} 
          />

          {/* Top KPIs Grid */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
            <KpiCard
              label="Present Employees"
              value={attendanceStats.presentCount.toFixed(1).replace('.0', '')}
              subLabel="Days Present"
              icon={CheckCircle}
              color="emerald"
            />
            <KpiCard
              label="On-Time Arrivals"
              value={attendanceStats.onTimeCount}
              subLabel="On-Time count"
              icon={Clock}
              color="indigo"
            />
            <KpiCard
              label="Late Comers"
              value={attendanceStats.lateCount}
              subLabel="Exceeded Grace"
              icon={AlertTriangle}
              color="red"
            />
            <KpiCard
              label="Early Leavers"
              value={attendanceStats.earlyCount}
              subLabel="Left Before Shift End"
              icon={TrendingDown}
              color="orange"
            />
            <KpiCard
              label="Absent Employees"
              value={attendanceStats.absentCount}
              subLabel={`Incl. ${attendanceStats.uninformedCount} Uninformed`}
              icon={XCircle}
              color="rose"
            />
          </div>

          {/* Payroll Summaries Panel */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Payroll Summary Card */}
            <div className="bg-[var(--bg-card)] border border-[var(--glass-border)] p-6 rounded-3xl shadow-[var(--shadow-soft)] flex flex-col justify-between">
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                  <IndianRupee size={18} className="text-indigo-400" /> Payroll Summary
                </h3>
                <div className="space-y-3">
                  <SummaryRow label="Gross Payroll Total" value={`₹${payrollSummary.grossTotal.toLocaleString('en-IN')}`} />
                  <SummaryRow label="Sunday Penalties" value={`- ₹${payrollSummary.sundayPenaltyTotal.toLocaleString('en-IN')}`} isDeduction />
                  <SummaryRow label="Late/Early Deductions" value={`- ₹${(payrollSummary.lateDeductionTotal + payrollSummary.earlyDeductionTotal).toLocaleString('en-IN')}`} isDeduction />
                  <div className="border-t border-[var(--glass-border)] my-2" />
                  <SummaryRow label="Net Payroll Distributed" value={`₹${payrollSummary.netTotal.toLocaleString('en-IN')}`} isBold />
                </div>
              </div>
              <div className="mt-4 p-3 bg-indigo-500/5 rounded-xl border border-indigo-500/10 text-[10px] text-[var(--text-muted)] flex items-start gap-2">
                <Info size={14} className="flex-shrink-0 text-indigo-400 mt-0.5" />
                <span>Computed payroll is the aggregate total of monthly salary runs covered by the date range for visible staff.</span>
              </div>
            </div>

            {/* Advance Balance Card */}
            <div className="bg-[var(--bg-card)] border border-[var(--glass-border)] p-6 rounded-3xl shadow-[var(--shadow-soft)] flex flex-col justify-between">
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                  <DollarSign size={18} className="text-purple-400" /> Advance Summary
                </h3>
                <div className="space-y-3">
                  <SummaryRow label="Carried Forward (Old)" value={`₹${payrollSummary.oldAdvanceTotal.toLocaleString('en-IN')}`} />
                  <SummaryRow label="Given this period" value={`₹${payrollSummary.currentAdvanceTotal.toLocaleString('en-IN')}`} isPositive />
                  <SummaryRow label="Deducted this period" value={`- ₹${payrollSummary.deductionTotal.toLocaleString('en-IN')}`} isDeduction />
                  <div className="border-t border-[var(--glass-border)] my-2" />
                  <SummaryRow label="Current Outstanding Balance" value={`₹${payrollSummary.newAdvanceTotal.toLocaleString('en-IN')}`} isBold />
                </div>
              </div>
              <div className="mt-4 p-3 bg-purple-500/5 rounded-xl border border-purple-500/10 text-[10px] text-[var(--text-muted)] flex items-start gap-2">
                <Info size={14} className="flex-shrink-0 text-purple-400 mt-0.5" />
                <span>Balances are pulled from monthly advance sheets. Outstandings carried forward automatically to subsequent months.</span>
              </div>
            </div>

            {/* Late/Early Deduction Details */}
            <div className="bg-[var(--bg-card)] border border-[var(--glass-border)] p-6 rounded-3xl shadow-[var(--shadow-soft)] flex flex-col justify-between">
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                  <Clock size={18} className="text-amber-400" /> Late/Early Deductions
                </h3>
                <div className="space-y-3">
                  <SummaryRow label="Late Coming Deductions" value={`₹${payrollSummary.lateDeductionTotal.toLocaleString('en-IN')}`} />
                  <SummaryRow label="Early Leave Deductions" value={`₹${payrollSummary.earlyDeductionTotal.toLocaleString('en-IN')}`} />
                  <div className="border-t border-[var(--glass-border)] my-2" />
                  <SummaryRow label="Total Deductions (Combined)" value={`₹${(payrollSummary.lateDeductionTotal + payrollSummary.earlyDeductionTotal).toLocaleString('en-IN')}`} isBold />
                </div>
              </div>
              <div className="mt-4 p-3 bg-amber-500/5 rounded-xl border border-amber-500/10 text-[10px] text-[var(--text-muted)] flex items-start gap-2">
                <Info size={14} className="flex-shrink-0 text-amber-400 mt-0.5" />
                <span>Calculated on employee's base daily wage pro-rated by shift grace rules. Manual overrides are fully supported.</span>
              </div>
            </div>
          </div>

          {/* Attendance Trends SVG Chart */}
          <div className="bg-[var(--bg-card)] border border-[var(--glass-border)] p-6 rounded-3xl shadow-[var(--shadow-soft)]">
            <h3 className="text-base font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <TrendingUp size={18} className="text-emerald-400" /> Attendance Trends (Daily counts)
            </h3>
            {attendanceStats.trendData.length < 2 ? (
              <div className="py-12 text-center text-[var(--text-muted)] text-sm">
                Select a multi-day range (e.g. This Week, This Month) to view attendance trends.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative w-full overflow-x-auto pb-2">
                  <svg viewBox="0 0 600 150" className="w-full min-w-[500px] h-[150px] overflow-visible">
                    {/* Grid lines */}
                    <line x1="20" y1="20" x2="580" y2="20" stroke="var(--glass-border)" strokeWidth="0.5" strokeDasharray="3,3" />
                    <line x1="20" y1="65" x2="580" y2="65" stroke="var(--glass-border)" strokeWidth="0.5" strokeDasharray="3,3" />
                    <line x1="20" y1="110" x2="580" y2="110" stroke="var(--glass-border)" strokeWidth="0.5" strokeDasharray="3,3" />
                    
                    {/* Paths */}
                    <path d={chartPath} fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d={absentChartPath} fill="none" stroke="#F43F5E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4,4" />

                    {/* Nodes */}
                    {attendanceStats.trendData.map((d, i) => {
                      const width = 600;
                      const height = 150;
                      const padding = 20;
                      const maxVal = Math.max(1, ...attendanceStats.trendData.map(t => t.present + t.absent));
                      const x = padding + (i / (attendanceStats.trendData.length - 1)) * (width - padding * 2);
                      const y = height - padding - (d.present / maxVal) * (height - padding * 2);
                      const yAb = height - padding - (d.absent / maxVal) * (height - padding * 2);

                      return (
                        <g key={i}>
                          <circle cx={x} cy={y} r="3.5" fill="#10B981" className="hover:r-5 transition-all cursor-pointer" />
                          <circle cx={x} cy={yAb} r="3" fill="#F43F5E" className="hover:r-5 transition-all cursor-pointer" />
                        </g>
                      );
                    })}
                  </svg>
                </div>
                <div className="flex items-center justify-center gap-6 text-xs font-semibold">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3.5 h-1 bg-emerald-500 rounded inline-block" />
                    <span className="text-[var(--text-secondary)]">Present / Half Days</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3.5 h-1 bg-rose-500 rounded inline-block border-dashed border-t border-rose-500" />
                    <span className="text-[var(--text-secondary)]">Absent / Uninformed</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Highest Payroll Employees & Detailed Breakdowns */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Top 5 Salaries Table */}
            <div className="lg:col-span-1 bg-[var(--bg-card)] border border-[var(--glass-border)] p-5 rounded-3xl shadow-[var(--shadow-soft)] space-y-4">
              <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Users size={18} className="text-emerald-400" /> Highest Payroll Employees (Top 5)
              </h3>
              <div className="divide-y divide-[var(--glass-border)]">
                {highestSalaryEmployees.map((emp, i) => (
                  <div key={emp.staffId} className="py-3 flex items-center justify-between gap-3 text-xs first:pt-0 last:pb-0">
                    <div>
                      <p className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-[10px] font-extrabold">{i + 1}</span>
                        {emp.name}
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)] ml-6 mt-0.5">{emp.designation} • {emp.location}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-emerald-500">₹{emp.netPayroll.toLocaleString('en-IN')}</p>
                      <p className="text-[9px] text-[var(--text-muted)]">Net Payroll</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Detailed Operational Breakdowns */}
            <div className="lg:col-span-2 bg-[var(--bg-card)] border border-[var(--glass-border)] p-5 rounded-3xl shadow-[var(--shadow-soft)] flex flex-col justify-between space-y-4">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--glass-border)] pb-3">
                  <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Building size={18} className="text-indigo-400" /> Operational Breakdown lists
                  </h3>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setActiveBreakdownTab('late')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                        activeBreakdownTab === 'late' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      Late ({attendanceStats.lateComersMap.length})
                    </button>
                    <button
                      onClick={() => setActiveBreakdownTab('early')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                        activeBreakdownTab === 'early' ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20' : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      Early ({attendanceStats.earlyLeaversMap.length})
                    </button>
                    <button
                      onClick={() => setActiveBreakdownTab('absent')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                        activeBreakdownTab === 'absent' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      Absent ({attendanceStats.absentsMap.length})
                    </button>
                    <button
                      onClick={() => setActiveBreakdownTab('ontime')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                        activeBreakdownTab === 'ontime' ? 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/20' : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      On-Time ({attendanceStats.onTimeMap.length})
                    </button>
                  </div>
                </div>

                <div className="mt-3 overflow-x-auto">
                  {activeBreakdownTab === 'late' && (
                    <BreakdownTable
                      items={attendanceStats.lateComersMap}
                      actionLabel="Late Frequency"
                      expandedRows={expandedRows}
                      onToggle={toggleRow}
                    />
                  )}
                  {activeBreakdownTab === 'early' && (
                    <BreakdownTable
                      items={attendanceStats.earlyLeaversMap}
                      actionLabel="Early Leave Frequency"
                      expandedRows={expandedRows}
                      onToggle={toggleRow}
                    />
                  )}
                  {activeBreakdownTab === 'absent' && (
                    <BreakdownTable
                      items={attendanceStats.absentsMap}
                      actionLabel="Absent Frequency"
                      expandedRows={expandedRows}
                      onToggle={toggleRow}
                    />
                  )}
                  {activeBreakdownTab === 'ontime' && (
                    <BreakdownTable
                      items={attendanceStats.onTimeMap.map(x => ({ ...x, details: [] }))}
                      actionLabel="On-Time Days count"
                      expandedRows={expandedRows}
                      onToggle={toggleRow}
                      hideDetails
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// Sub-components
const KpiCard: React.FC<{ label: string; value: string | number; subLabel: string; icon: React.ElementType; color: string }> = ({
  label,
  value,
  subLabel,
  icon: Icon,
  color
}) => {
  const styles: Record<string, string> = {
    emerald: 'text-emerald-500 bg-emerald-500/5 border-emerald-500/15',
    indigo: 'text-indigo-400 bg-indigo-500/5 border-indigo-500/15',
    red: 'text-red-500 bg-red-500/5 border-red-500/15',
    orange: 'text-orange-500 bg-orange-500/5 border-orange-500/15',
    rose: 'text-rose-500 bg-rose-500/5 border-rose-500/15'
  };

  return (
    <div className={`p-4 rounded-3xl border ${styles[color] || styles.indigo} flex flex-col justify-between shadow-[var(--shadow-soft)] relative overflow-hidden bg-[var(--bg-card)]`}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">{label}</span>
        <Icon size={18} className="opacity-70" />
      </div>
      <div>
        <p className="text-xl md:text-3xl font-extrabold text-[var(--text-primary)]">{value}</p>
        <p className="text-[9px] md:text-xs text-[var(--text-muted)] mt-1.5">{subLabel}</p>
      </div>
    </div>
  );
};

const SummaryRow: React.FC<{ label: string; value: string; isBold?: boolean; isDeduction?: boolean; isPositive?: boolean }> = ({
  label,
  value,
  isBold,
  isDeduction,
  isPositive
}) => (
  <div className="flex items-center justify-between py-1 text-xs">
    <span className={`${isBold ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>{label}</span>
    <span className={`font-semibold font-mono ${
      isDeduction ? 'text-rose-400' :
      isPositive ? 'text-emerald-400' :
      isBold ? 'text-base font-extrabold text-[var(--text-primary)]' :
      'text-[var(--text-primary)]'
    }`}>{value}</span>
  </div>
);

interface BreakdownTableProps {
  items: Array<{ staffId: string; name: string; designation: string; location: string; count: number; details: string[] }>;
  actionLabel: string;
  expandedRows: Record<string, boolean>;
  onToggle: (id: string) => void;
  hideDetails?: boolean;
}

const BreakdownTable: React.FC<BreakdownTableProps> = ({
  items,
  actionLabel,
  expandedRows,
  onToggle,
  hideDetails = false
}) => {
  if (items.length === 0) {
    return (
      <div className="py-8 text-center text-[var(--text-muted)] text-xs font-semibold">
        No records found in this category for the selected range.
      </div>
    );
  }

  return (
    <table className="w-full text-left text-xs text-[var(--text-secondary)]">
      <thead>
        <tr className="border-b border-[var(--glass-border)] text-[var(--text-muted)] font-bold">
          <th className="py-2.5">Name</th>
          <th className="py-2.5">Designation</th>
          <th className="py-2.5 text-center">{actionLabel}</th>
          {!hideDetails && <th className="py-2.5 text-right">Details</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--glass-border)]">
        {items.map(item => {
          const isExpanded = expandedRows[item.staffId];
          return (
            <React.Fragment key={item.staffId}>
              <tr className="hover:bg-[var(--glass-bg)] transition-colors">
                <td className="py-3 font-bold text-[var(--text-primary)]">{item.name}</td>
                <td className="py-3">{item.designation} <span className="text-[9px] text-[var(--text-muted)]">• {item.location}</span></td>
                <td className="py-3 text-center font-bold text-[var(--text-primary)]">{item.count} day{item.count > 1 ? 's' : ''}</td>
                {!hideDetails && (
                  <td className="py-3 text-right">
                    <button
                      onClick={() => onToggle(item.staffId)}
                      className="px-2.5 py-1 bg-[var(--glass-bg)] border border-[var(--glass-border)] hover:border-indigo-400 rounded-lg inline-flex items-center gap-1 transition-all"
                    >
                      {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      <span>{isExpanded ? 'Hide' : 'Expand'}</span>
                    </button>
                  </td>
                )}
              </tr>
              {isExpanded && !hideDetails && (
                <tr>
                  <td colSpan={4} className="bg-[var(--glass-bg)]/30 px-3 py-2.5 rounded-xl border border-[var(--glass-border)]">
                    <p className="font-bold text-[10px] text-[var(--text-muted)] uppercase mb-2">Punch Timeline / Dates</p>
                    <div className="flex flex-wrap gap-2">
                      {item.details.map((dt, index) => (
                        <span key={index} className="px-2 py-1 rounded bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[10px] font-semibold text-[var(--text-primary)]">
                          {dt}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
};

export default WorkforceInsights;
