import React, { useState, useMemo, useEffect } from 'react';
import {
  User, Calendar, DollarSign, TrendingUp, Download, ChevronLeft, ChevronRight,
  CheckCircle, XCircle, Clock, Briefcase, MapPin, Phone, Home, IndianRupee,
  ArrowUpRight, ArrowDownRight, FileText, CreditCard, Send, MessageSquare, AlertTriangle,
  CalendarDays, Trash2, Plus, Camera
} from 'lucide-react';
import { Staff, Attendance, SalaryHike, AdvanceDeduction, SalaryOverride } from '../types';
import { calculateAttendanceMetrics, calculateSalary, getDaysInMonth, isSunday, roundToNearest10 } from '../utils/salaryCalculations';
import { salaryOverrideService } from '../services/salaryOverrideService';
import { salaryCategoryService, type SalaryCategory } from '../services/salaryCategoryService';
import { leaveService, LeaveRequest } from '../services/leaveService';
import { advanceEntryService, AdvanceEntry } from '../services/advanceEntryService';
import { computeStatutoryBreakdown } from '../utils/statutoryDeductions';
import FaceRegistration from './FaceRegistration';
import YearlyAttendanceSummary from './YearlyAttendanceSummary';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface StaffPortalProps {
  staff: Staff;
  attendance: Attendance[];
  salaryHikes: SalaryHike[];
  advances: AdvanceDeduction[];
  allStaff: Staff[];
}

const StaffPortal: React.FC<StaffPortalProps> = ({ staff, attendance, salaryHikes, advances, allStaff }) => {
  const [activeSection, setActiveSection] = useState<'overview' | 'attendance' | 'yearly' | 'salary' | 'hikes' | 'leave' | 'face'>('overview');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [yearlyViewYear, setYearlyViewYear] = useState(new Date().getFullYear());
  const [overrides, setOverrides] = useState<SalaryOverride | null>(null);
  const [salaryCategories, setSalaryCategories] = useState<SalaryCategory[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ leaveDate: '', leaveEndDate: '', leaveType: 'casual' as const, reason: '' });
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const [advanceEntries, setAdvanceEntries] = useState<AdvanceEntry[]>([]);

  const monthName = new Date(selectedYear, selectedMonth).toLocaleString('default', { month: 'long' });

  // Determine if staff has left (inactive) and their last working month
  const isLeftStaff = !staff.isActive;

  // Check if the selected month is in the future relative to current date (or left date for inactive staff)
  const isMonthBlocked = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // For active staff, block future months
    if (!isLeftStaff) {
      return selectedYear > currentYear || (selectedYear === currentYear && selectedMonth > currentMonth);
    }

    // For left staff, block months after current (they can't see future data)
    return selectedYear > currentYear || (selectedYear === currentYear && selectedMonth > currentMonth);
  }, [selectedMonth, selectedYear, isLeftStaff]);

  // Check if next month would be in the future
  const isNextMonthFuture = useMemo(() => {
    const now = new Date();
    const nm = selectedMonth + 1 > 11 ? 0 : selectedMonth + 1;
    const ny = selectedMonth + 1 > 11 ? selectedYear + 1 : selectedYear;
    return ny > now.getFullYear() || (ny === now.getFullYear() && nm > now.getMonth());
  }, [selectedMonth, selectedYear]);

  // Load salary overrides for the selected month
  useEffect(() => {
    const loadOverrides = async () => {
      try {
        const allOverrides = await salaryOverrideService.getOverrides(selectedMonth + 1, selectedYear);
        const staffOverride = allOverrides.find(o => o.staffId === staff.id) || null;
        setOverrides(staffOverride);
      } catch (err) {
        console.error('Error loading overrides:', err);
      }
    };
    loadOverrides();
  }, [selectedMonth, selectedYear, staff.id]);

  useEffect(() => {
    salaryCategoryService.getCategories()
      .then(setSalaryCategories)
      .catch((err) => console.error('Error loading salary categories in staff portal:', err));
  }, []);

  // Load leave requests
  useEffect(() => {
    leaveService.getByStaffId(staff.id)
      .then(setLeaveRequests)
      .catch((err) => console.error('Error loading leave requests:', err));
  }, [staff.id]);

  // Load advance entries for selected month
  useEffect(() => {
    advanceEntryService.getByStaffAndMonth(staff.id, selectedMonth, selectedYear)
      .then(setAdvanceEntries)
      .catch((err) => console.error('Error loading advance entries:', err));
  }, [staff.id, selectedMonth, selectedYear]);

  const handleLeaveSubmit = async () => {
    if (!leaveForm.leaveDate || !leaveForm.reason.trim()) return;
    setLeaveSubmitting(true);
    const result = await leaveService.create({
      staffId: staff.id,
      staffName: staff.name,
      location: staff.location,
      leaveDate: leaveForm.leaveDate,
      leaveEndDate: leaveForm.leaveEndDate || undefined,
      leaveType: leaveForm.leaveType,
      reason: leaveForm.reason.trim(),
    });
    if (result) {
      setLeaveRequests(prev => [result, ...prev]);
      setShowLeaveForm(false);
      setLeaveForm({ leaveDate: '', leaveEndDate: '', leaveType: 'casual', reason: '' });
    }
    setLeaveSubmitting(false);
  };

  // Attendance metrics for selected month
  const metrics = useMemo(() =>
    calculateAttendanceMetrics(staff.id, attendance, selectedYear, selectedMonth),
    [staff.id, attendance, selectedYear, selectedMonth]
  );

  // Monthly attendance records
  const monthlyAttendance = useMemo(() =>
    attendance.filter(a => {
      const d = new Date(a.date);
      return a.staffId === staff.id && d.getMonth() === selectedMonth && d.getFullYear() === selectedYear && !a.isPartTime;
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [staff.id, attendance, selectedMonth, selectedYear]
  );

  const activeCustomCategories = useMemo(
    () => salaryCategories.filter(c => !c.isBuiltIn && !c.isDeleted),
    [salaryCategories]
  );

  const categoryLabels = useMemo(() => ({
    basic: salaryCategories.find(c => c.id === 'basic')?.name || 'Basic',
    incentive: salaryCategories.find(c => c.id === 'incentive')?.name || 'Incentive',
    hra: salaryCategories.find(c => c.id === 'hra')?.name || 'HRA',
    mealAllowance: salaryCategories.find(c => c.id === 'meal_allowance')?.name || 'Meal Allowance'
  }), [salaryCategories]);

  const effectiveSupplements = useMemo(() => {
    const base = staff.salarySupplements || {};
    const overrideSupplements = overrides?.salarySupplementsOverride || {};

    return activeCustomCategories
      .map(cat => {
        const amount = Number(
          (overrideSupplements as any)[cat.key] ??
          (overrideSupplements as any)[cat.id] ??
          (base as any)[cat.key] ??
          (base as any)[cat.id] ??
          0
        );

        return { key: cat.id, name: cat.name, amount };
      })
      .filter(item => item.amount > 0); // Only show allowances that exist for this staff
  }, [activeCustomCategories, overrides?.salarySupplementsOverride, staff.salarySupplements]);

  // Salary for selected month - with overrides applied
  const salaryDetail = useMemo(() => {
    const adv = advances.find(a => a.staffId === staff.id && a.month === selectedMonth && a.year === selectedYear) || null;
    const baseDetail = calculateSalary(staff, metrics, adv, advances, attendance, selectedMonth, selectedYear);

    // Apply overrides if they exist
    let result = baseDetail as typeof baseDetail & { statutoryTotal?: number; statutoryBreakdown?: Array<{ key: string; label: string; amount: number }> };
    if (overrides) {
      const basic = overrides.basicOverride ?? baseDetail.basicEarned;
      const incentive = overrides.incentiveOverride ?? baseDetail.incentiveEarned;
      const hra = overrides.hraOverride ?? baseDetail.hraEarned;
      const meal = overrides.mealAllowanceOverride ?? baseDetail.mealAllowance;
      const sundayPenalty = overrides.sundayPenaltyOverride ?? baseDetail.sundayPenalty;
      const supplementsTotal = effectiveSupplements.reduce((sum, item) => sum + item.amount, 0);

      const gross = roundToNearest10(basic + incentive + hra + meal + supplementsTotal);
      const net = roundToNearest10(gross - baseDetail.curAdv - baseDetail.deduction - sundayPenalty);

      result = {
        ...baseDetail,
        basicEarned: basic,
        incentiveEarned: incentive,
        hraEarned: hra,
        mealAllowance: meal,
        sundayPenalty,
        grossSalary: gross,
        netSalary: Math.max(0, net)
      };
    }

    // Apply per-staff statutory deductions (ESI/PF/PT/TDS/Custom)
    const breakdown = computeStatutoryBreakdown(staff, {
      basic: result.basicEarned,
      hra: result.hraEarned,
      incentive: result.incentiveEarned,
      gross: result.grossSalary,
    });
    const statutoryTotal = breakdown.reduce((s: number, b) => s + b.amount, 0);
    if (statutoryTotal > 0) {
      result = {
        ...result,
        statutoryTotal,
        statutoryBreakdown: breakdown.map((b) => ({ key: b.key, label: b.label, amount: b.amount })),
        netSalary: Math.max(0, roundToNearest10(result.netSalary - statutoryTotal)),
      };
    }
    return result;
  }, [staff, metrics, advances, attendance, selectedMonth, selectedYear, overrides, effectiveSupplements]);

  // Staff hikes
  const staffHikes = useMemo(() =>
    salaryHikes.filter(h => h.staffId === staff.id).sort((a, b) => new Date(b.hikeDate).getTime() - new Date(a.hikeDate).getTime()),
    [salaryHikes, staff.id]
  );

  const navigateMonth = (dir: number) => {
    let m = selectedMonth + dir;
    let y = selectedYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }

    // Block navigating to future months
    const now = new Date();
    if (y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth())) {
      return; // Don't navigate to future
    }

    setSelectedMonth(m);
    setSelectedYear(y);
  };

  const downloadSalarySlip = () => {
    const doc = new jsPDF();
    const rs = 'Rs.';

    // Header
    doc.setFillColor(99, 102, 241);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text('SALARY SLIP', 105, 18, { align: 'center' });
    doc.setFontSize(12);
    doc.text(`${monthName} ${selectedYear}`, 105, 30, { align: 'center' });

    // Employee Details
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.text(`Employee: ${staff.name}`, 20, 52);
    doc.text(`Location: ${staff.location}`, 20, 59);
    doc.text(`Type: ${staff.type === 'full-time' ? 'Full-Time' : 'Part-Time'}`, 120, 52);
    doc.text(`Joined: ${staff.joinedDate}`, 120, 59);

    doc.setDrawColor(200, 200, 200);
    doc.line(20, 65, 190, 65);

    // Attendance Summary
    const attendanceRows = [
      ['Present Days', `${metrics.presentDays}`],
      ['Half Days', `${metrics.halfDays}`],
      ['Leave Days', `${metrics.leaveDays}`],
      ['Sunday Absents', `${metrics.sundayAbsents}`],
    ];

    autoTable(doc, {
      head: [['Attendance', 'Days']],
      body: attendanceRows,
      startY: 70,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [99, 102, 241], textColor: [255, 255, 255] },
      theme: 'grid',
      tableWidth: 80,
      margin: { left: 20 },
    });

    // Earnings & Deductions
    const earningsRows = [
      ['Basic Earned', `${rs} ${salaryDetail.basicEarned.toLocaleString('en-IN')}`],
      ['Incentive Earned', `${rs} ${salaryDetail.incentiveEarned.toLocaleString('en-IN')}`],
      ['HRA Earned', `${rs} ${salaryDetail.hraEarned.toLocaleString('en-IN')}`],
    ];
    if (salaryDetail.mealAllowance > 0) {
      earningsRows.push(['Meal Allowance', `${rs} ${salaryDetail.mealAllowance.toLocaleString('en-IN')}`]);
    }
    effectiveSupplements.forEach(item => {
      earningsRows.push([item.name, `${rs} ${item.amount.toLocaleString('en-IN')}`]);
    });
    earningsRows.push(
      ['Gross Salary', `${rs} ${salaryDetail.grossSalary.toLocaleString('en-IN')}`],
    );

    const deductionRows = [
      ['Sunday Penalty', `${rs} ${salaryDetail.sundayPenalty.toLocaleString('en-IN')}`],
      ['Old Advance', `${rs} ${salaryDetail.oldAdv.toLocaleString('en-IN')}`],
      ['Current Advance', `${rs} ${salaryDetail.curAdv.toLocaleString('en-IN')}`],
      ['Deduction', `${rs} ${salaryDetail.deduction.toLocaleString('en-IN')}`],
      ...((salaryDetail.statutoryBreakdown || []).map(b => [
        `${b.label} (Govt.)`,
        `${rs} ${b.amount.toLocaleString('en-IN')}`,
      ])),
      ['New Advance Balance', `${rs} ${salaryDetail.newAdv.toLocaleString('en-IN')}`],
    ];

    const allRows = [...earningsRows, ['', ''], ...deductionRows, ['', ''], ['NET SALARY', `${rs} ${salaryDetail.netSalary.toLocaleString('en-IN')}`]];

    autoTable(doc, {
      head: [['Component', 'Amount']],
      body: allRows,
      startY: 70,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [99, 102, 241], textColor: [255, 255, 255] },
      theme: 'grid',
      tableWidth: 90,
      margin: { left: 110 },
      didParseCell: (data) => {
        if (data.row.index === allRows.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [240, 240, 255];
        }
      }
    });

    // Footer
    const pageHeight = doc.internal.pageSize.height;
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('This is a system-generated salary slip.', 105, pageHeight - 15, { align: 'center' });
    doc.text(`Generated on: ${new Date().toLocaleDateString('en-IN')}`, 105, pageHeight - 10, { align: 'center' });

    doc.save(`salary-slip-${staff.name}-${monthName}-${selectedYear}.pdf`);
  };

  const sections = [
    { id: 'overview' as const, label: 'Overview', icon: User },
    { id: 'attendance' as const, label: 'Monthly', icon: Calendar },
    { id: 'yearly' as const, label: 'Yearly', icon: CalendarDays },
    { id: 'salary' as const, label: 'Salary', icon: IndianRupee },
    { id: 'hikes' as const, label: 'Hikes', icon: TrendingUp },
    { id: 'leave' as const, label: 'Leave', icon: FileText },
    { id: 'face' as const, label: 'Face ID', icon: Camera },
  ];

  const isWideTab = activeSection === 'attendance' || activeSection === 'yearly';

  return (
    <div className={`p-2 md:p-6 pb-24 md:pb-6 space-y-4 ${isWideTab ? 'w-full' : 'max-w-4xl mx-auto'}`}>
      {/* Section Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-semibold whitespace-nowrap transition-all ${
              activeSection === s.id
                ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/25'
                : 'bg-[var(--bg-card)] border border-[var(--glass-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-indigo-400/30'
            }`}
          >
            <s.icon size={16} />
            {s.label}
          </button>
        ))}
      </div>

      {/* Month Navigator (for attendance & salary) */}
      {(activeSection === 'attendance' || activeSection === 'salary') && (
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-4 py-2">
            <button onClick={() => navigateMonth(-1)} className="p-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--glass-border)] hover:border-indigo-400/30 transition-all active:scale-95">
              <ChevronLeft size={20} className="text-[var(--text-primary)]" />
            </button>
            <span className="text-lg font-bold text-[var(--text-primary)] min-w-[180px] text-center">
              {monthName} {selectedYear}
            </span>
            <button
              onClick={() => navigateMonth(1)}
              disabled={isNextMonthFuture}
              className="p-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--glass-border)] hover:border-indigo-400/30 transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight size={20} className="text-[var(--text-primary)]" />
            </button>
          </div>
          {isLeftStaff && (
            <p className="text-center text-xs text-amber-600 font-medium bg-amber-500/10 rounded-lg py-2 px-3 border border-amber-500/20">
              ⚠ You are no longer active. Only past records are shown.
            </p>
          )}
        </div>
      )}

      {/* OVERVIEW */}
      {activeSection === 'overview' && (
        <div className="space-y-4">
          {/* Profile Card */}
          <div className="bg-[var(--bg-card)] border border-[var(--glass-border)] p-6 rounded-2xl shadow-[var(--shadow-soft)]">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-indigo-500/25">
                {staff.name.charAt(0)}
              </div>
              <div>
                <h2 className="text-xl font-bold text-[var(--text-primary)]">{staff.name}</h2>
                <p className="text-sm text-[var(--text-muted)]">{staff.type === 'full-time' ? 'Full-Time' : 'Part-Time'} Staff</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InfoRow icon={MapPin} label="Location" value={staff.location} />
              {staff.floor && <InfoRow icon={MapPin} label="Floor" value={staff.floor} />}
              {staff.designation && <InfoRow icon={Briefcase} label="Designation" value={staff.designation} />}
              <InfoRow icon={Briefcase} label="Experience" value={staff.experience} />
              <InfoRow icon={Calendar} label="Joined Date" value={staff.joinedDate} />
              {staff.contactNumber && <InfoRow icon={Phone} label="Contact" value={staff.contactNumber} />}
              {staff.address && <InfoRow icon={Home} label="Address" value={staff.address} />}
              {staff.pfNumber && <InfoRow icon={CreditCard} label="PF Number" value={staff.pfNumber} />}
              {staff.esiNumber && <InfoRow icon={CreditCard} label="ESI Number" value={staff.esiNumber} />}
            </div>
          </div>

          {/* Current Salary Structure */}
          <div className="bg-[var(--bg-card)] border border-[var(--glass-border)] p-6 rounded-2xl shadow-[var(--shadow-soft)]">
            <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <IndianRupee size={20} className="text-indigo-500" /> Current Salary Structure
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <SalaryCard label={categoryLabels.basic} amount={staff.basicSalary} />
              <SalaryCard label={categoryLabels.incentive} amount={staff.incentive} />
              <SalaryCard label={categoryLabels.hra} amount={staff.hra} />
              {(staff.mealAllowance || 0) > 0 && <SalaryCard label={categoryLabels.mealAllowance} amount={staff.mealAllowance!} />}
              {effectiveSupplements.map((item) => (
                <SalaryCard key={item.key} label={item.name} amount={item.amount} />
              ))}
            </div>
            <div className="mt-3">
              <SalaryCard label="Total Salary" amount={staff.totalSalary} highlight />
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <QuickStat label="This Month Present" value={`${metrics.totalPresentDays}`} icon={CheckCircle} color="emerald" />
            <QuickStat label="Leaves" value={`${metrics.leaveDays}`} icon={XCircle} color="red" />
            <QuickStat label="Sunday Absents" value={`${metrics.sundayAbsents}`} icon={Calendar} color="amber" />
            <QuickStat label="Uninformed" value={`${monthlyAttendance.filter(a => a.isUninformed).length}`} icon={AlertTriangle} color="orange" />
            <QuickStat label="Total Hikes" value={`${staffHikes.length}`} icon={TrendingUp} color="blue" />
          </div>
        </div>
      )}

      {/* ATTENDANCE */}
      {activeSection === 'attendance' && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <QuickStat label="Present" value={`${metrics.presentDays}`} icon={CheckCircle} color="emerald" />
            <QuickStat label="Half Days" value={`${metrics.halfDays}`} icon={Clock} color="amber" />
            <QuickStat label="Leaves" value={`${metrics.leaveDays}`} icon={XCircle} color="red" />
            <QuickStat label="Sun. Absent" value={`${metrics.sundayAbsents}`} icon={Calendar} color="orange" />
            <QuickStat label="Uninformed" value={`${monthlyAttendance.filter(a => a.isUninformed).length}`} icon={AlertTriangle} color="orange" />
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-3 text-[10px] px-1">
            <span className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-emerald-500 inline-block"></span> Present</span>
            <span className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-amber-500 inline-block"></span> Half Day</span>
            <span className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-red-500 inline-block"></span> Absent</span>
            <span className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-orange-500 ring-2 ring-orange-300 inline-block"></span> Uninformed</span>
          </div>

          {/* Day-by-day */}
          <div className="bg-[var(--bg-card)] border border-[var(--glass-border)] rounded-2xl overflow-hidden shadow-[var(--shadow-soft)]">
            <div className="p-4 border-b border-[var(--glass-border)]">
              <h3 className="font-bold text-[var(--text-primary)]">Monthly Attendance View</h3>
            </div>
            <div className="overflow-x-auto p-3">
              {(() => {
                const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);
                const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
                const total = (metrics.presentDays + (metrics.halfDays * 0.5)).toFixed(1).replace('.0', '');

                return (
                  <table className="w-full min-w-[760px]">
                    <thead>
                      <tr className="bg-[var(--glass-bg)]">
                        <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--text-muted)] uppercase">Name</th>
                        <th className="px-2 py-2 text-center text-xs font-semibold text-emerald-600 bg-emerald-500/10">P</th>
                        <th className="px-2 py-2 text-center text-xs font-semibold text-amber-600 bg-amber-500/10">H</th>
                        <th className="px-2 py-2 text-center text-xs font-semibold text-red-600 bg-red-500/10">A</th>
                        <th className="px-2 py-2 text-center text-xs font-semibold text-orange-600 bg-orange-500/10">SUN</th>
                        <th className="px-2 py-2 text-center text-xs font-semibold text-orange-700 bg-orange-500/10" title="Uninformed Leaves">UI</th>
                        <th className="px-2 py-2 text-center text-xs font-semibold text-blue-600 bg-blue-500/10">TOTAL</th>
                        {days.map(day => {
                          const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                          const sun = isSunday(dateStr);
                          const dayName = new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short' });
                          return (
                            <th key={day} className={`px-2 py-2 text-center text-xs font-semibold ${sun ? 'text-red-600 bg-red-500/10' : 'text-[var(--text-muted)]'}`}>
                              <div className="text-[9px] opacity-70 font-medium">{dayName}</div>
                              <div>{day}</div>
                              {sun && <div className="text-[9px]">Sun</div>}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-[var(--glass-border)]">
                        <td className="px-3 py-3 text-sm font-semibold text-[var(--text-primary)]">{staff.name}</td>
                        <td className="px-2 py-3 text-center text-sm font-bold text-emerald-600 bg-emerald-500/5">{metrics.presentDays}</td>
                        <td className="px-2 py-3 text-center text-sm font-bold text-amber-600 bg-amber-500/5">{metrics.halfDays}</td>
                        <td className="px-2 py-3 text-center text-sm font-bold text-red-600 bg-red-500/5">{metrics.leaveDays}</td>
                        <td className="px-2 py-3 text-center text-sm font-bold text-orange-600 bg-orange-500/5">{metrics.sundayAbsents}</td>
                        <td className="px-2 py-3 text-center text-sm font-bold text-orange-700 bg-orange-500/5">{monthlyAttendance.filter(a => a.isUninformed).length}</td>
                        <td className="px-2 py-3 text-center text-sm font-bold text-blue-600 bg-blue-500/5">{total}</td>
                        {days.map(day => {
                          const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                          const record = monthlyAttendance.find(a => a.date === dateStr);
                          const status = record?.status || 'Absent';
                          const isSun = isSunday(dateStr);
                          const halfCode = record?.shift === 'Morning' ? 'HM' : record?.shift === 'Evening' ? 'HE' : 'H';

                          return (
                            <td key={day} className={`px-2 py-3 text-center ${isSun ? 'bg-red-500/5' : ''} ${record?.isUninformed ? 'bg-orange-500/10' : ''}`} title={`${status === 'Half Day' ? `Half Day (${record?.shift || 'N/A'})` : status}${record?.isUninformed ? ' - Uninformed' : ''}`}>
                              <div className="flex flex-col items-center justify-center min-h-[48px]">
                                <span className={`inline-flex items-center justify-center min-w-[26px] h-6 rounded text-[10px] font-bold ${
                                  record?.isUninformed
                                    ? 'bg-orange-500 text-white ring-2 ring-orange-300'
                                    : status === 'Present'
                                      ? 'bg-emerald-500 text-white'
                                      : status === 'Half Day'
                                        ? 'bg-amber-500 text-white'
                                        : 'bg-red-500 text-white'
                                  }`}>
                                  {record?.isUninformed ? '⚠' : status === 'Present' ? 'P' : status === 'Half Day' ? halfCode : 'A'}
                                </span>
                                {(record?.arrivalTime || record?.leavingTime) && (
                                  <div className="mt-1 text-[8px] font-medium leading-tight text-center">
                                    {record.arrivalTime && <div className="text-emerald-500">IN {record.arrivalTime}</div>}
                                    {record.leavingTime && <div className="text-orange-500">OUT {record.leavingTime}</div>}
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* YEARLY ATTENDANCE VIEW */}
      {activeSection === 'yearly' && (
        <div className="space-y-4">
          {/* Year-to-date attendance breakdown card */}
          <YearlyAttendanceSummary attendance={attendance} staffId={staff.id} year={yearlyViewYear} />

          <div className="flex items-center justify-center gap-4 py-2">
            <button onClick={() => setYearlyViewYear(y => y - 1)} className="p-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--glass-border)] hover:border-indigo-400/30 transition-all active:scale-95">
              <ChevronLeft size={20} className="text-[var(--text-primary)]" />
            </button>
            <span className="text-lg font-bold text-[var(--text-primary)] min-w-[80px] text-center">{yearlyViewYear}</span>
            <button
              onClick={() => setYearlyViewYear(y => y + 1)}
              disabled={yearlyViewYear >= new Date().getFullYear()}
              className="p-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--glass-border)] hover:border-indigo-400/30 transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight size={20} className="text-[var(--text-primary)]" />
            </button>
          </div>

          <div className="bg-[var(--bg-card)] border border-[var(--glass-border)] rounded-2xl shadow-[var(--shadow-soft)] overflow-hidden">
            <div className="p-4 border-b border-[var(--glass-border)]">
              <h3 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                <CalendarDays size={18} className="text-indigo-500" />
                {staff.name} — {yearlyViewYear} Attendance
              </h3>
            </div>
            <div className="p-3 space-y-6">
              {(() => {
                const now = new Date();
                const maxMonth = yearlyViewYear === now.getFullYear() ? now.getMonth() : 11;

                return Array.from({ length: maxMonth + 1 }, (_, mi) => {
                  const monthMetrics = calculateAttendanceMetrics(staff.id, attendance, yearlyViewYear, mi);
                  const daysInMonth = getDaysInMonth(yearlyViewYear, mi);
                  const days = Array.from({ length: daysInMonth }, (_, d) => d + 1);
                  const monthName = new Date(yearlyViewYear, mi).toLocaleString('default', { month: 'long' });
                  const total = (monthMetrics.presentDays + monthMetrics.halfDays * 0.5).toFixed(1).replace('.0', '');
                  const maxDay = (yearlyViewYear === now.getFullYear() && mi === now.getMonth()) ? now.getDate() : daysInMonth;

                  const monthAttendance = attendance.filter(a => {
                    const d = new Date(a.date);
                    return a.staffId === staff.id && d.getMonth() === mi && d.getFullYear() === yearlyViewYear && !a.isPartTime;
                  });
                  const uninformedCount = monthAttendance.filter(a => a.isUninformed).length;

                  return (
                    <div key={mi}>
                      <div className="flex items-center justify-between mb-2 px-1">
                        <h4 className="text-sm font-bold text-[var(--text-primary)]">{monthName}</h4>
                        <div className="flex gap-3 text-[11px]">
                          <span className="text-emerald-600 font-bold">P:{monthMetrics.presentDays}</span>
                          <span className="text-amber-600 font-bold">H:{monthMetrics.halfDays}</span>
                          <span className="text-red-600 font-bold">A:{monthMetrics.leaveDays}</span>
                          <span className="text-red-700 font-bold">SUN:{monthMetrics.sundayAbsents}</span>
                          {uninformedCount > 0 && <span className="text-orange-600 font-bold">UI:{uninformedCount}</span>}
                          <span className="text-blue-600 font-bold">T:{total}</span>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <div className="flex gap-[3px] flex-wrap">
                          {days.map(day => {
                            const dateStr = `${yearlyViewYear}-${String(mi + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            const isFuture = day > maxDay;
                            if (isFuture) {
                              return (
                                <div key={day} className="flex flex-col items-center">
                                  <div className="w-7 h-7 rounded text-[9px] flex items-center justify-center bg-gray-100 text-gray-300">-</div>
                                  <span className="text-[8px] text-gray-300 mt-0.5">{day}</span>
                                </div>
                              );
                            }
                            const record = monthAttendance.find(a => a.date === dateStr);
                            const status = record?.status || 'Absent';
                            const isSun = isSunday(dateStr);
                            const isUI = record?.isUninformed;
                            const halfCode = record?.shift === 'Morning' ? 'M' : record?.shift === 'Evening' ? 'E' : 'H';
                            return (
                              <div key={day} className="flex flex-col items-center">
                                <span className={`text-[8px] font-medium ${isSun ? 'text-red-600' : 'text-[var(--text-muted)] opacity-70'}`}>{new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short' }).slice(0,3)}</span>
                                <div className={`w-7 h-7 rounded text-[10px] font-bold flex items-center justify-center ${
                                  isUI ? 'bg-orange-500 text-white ring-1 ring-orange-300' :
                                  status === 'Present' ? 'bg-emerald-500 text-white' :
                                  status === 'Half Day' ? 'bg-amber-500 text-white' :
                                  isSun ? 'bg-red-700 text-white' : 'bg-red-500 text-white'
                                }`} title={`${day} ${monthName}: ${status}${isUI ? ' (Uninformed)' : ''}`}>
                                  {isUI ? '!' : status === 'Present' ? 'P' : status === 'Half Day' ? halfCode : 'A'}
                                </div>
                                {(record?.arrivalTime || record?.leavingTime) && (
                                  <div className="mt-0.5 text-[7px] font-medium leading-tight text-center">
                                    {record.arrivalTime && <div className="text-emerald-500">{record.arrivalTime}</div>}
                                    {record.leavingTime && <div className="text-orange-500">{record.leavingTime}</div>}
                                  </div>
                                )}
                                <span className={`text-[8px] mt-0.5 font-semibold ${isSun ? 'text-red-600' : 'text-[var(--text-muted)]'}`}>{day}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

      {/* SALARY */}
      {activeSection === 'salary' && (
        <div className="space-y-4">
          {/* Download button */}
          <button onClick={downloadSalarySlip} className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 transition-all active:scale-[0.98]">
            <Download size={18} /> Download Salary Slip
          </button>

          {/* Earnings */}
          <div className="bg-[var(--bg-card)] border border-[var(--glass-border)] rounded-2xl shadow-[var(--shadow-soft)] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[var(--glass-border)] bg-emerald-500/5">
              <h3 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                <ArrowUpRight size={18} className="text-emerald-500" /> Earnings
              </h3>
            </div>
            <div className="p-5 space-y-3">
              <SalaryRow label="Present Days" value={`${metrics.presentDays} days`} />
              <SalaryRow label="Half Days" value={`${metrics.halfDays}`} />
              <SalaryRow label="Leave Days" value={`${metrics.leaveDays} days`} />
              <SalaryRow label="Sunday Absents" value={`${metrics.sundayAbsents}`} />
              {(() => {
                const uCount = monthlyAttendance.filter(a => a.isUninformed).length;
                return uCount > 0 ? (
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-orange-500/10 border border-orange-500/20">
                    <span className="text-sm text-orange-700 font-semibold flex items-center gap-1.5"><AlertTriangle size={14} /> Uninformed Leaves</span>
                    <span className="text-sm font-bold text-orange-700">{uCount} day{uCount > 1 ? 's' : ''}</span>
                  </div>
                ) : null;
              })()}
              <div className="border-t border-[var(--glass-border)] my-1" />
              <SalaryRow label="Basic Earned" value={`Rs. ${salaryDetail.basicEarned.toLocaleString('en-IN')}`} />
              <SalaryRow label="Incentive Earned" value={`Rs. ${salaryDetail.incentiveEarned.toLocaleString('en-IN')}`} />
              <SalaryRow label="HRA Earned" value={`Rs. ${salaryDetail.hraEarned.toLocaleString('en-IN')}`} />
              {salaryDetail.mealAllowance > 0 && <SalaryRow label="Meal Allowance" value={`Rs. ${salaryDetail.mealAllowance.toLocaleString('en-IN')}`} />}
              <div className="border-t border-[var(--glass-border)] my-1" />
              <SalaryRow label="Gross Salary" value={`Rs. ${salaryDetail.grossSalary.toLocaleString('en-IN')}`} bold />
            </div>
          </div>

          {/* Deductions */}
          <div className="bg-[var(--bg-card)] border border-[var(--glass-border)] rounded-2xl shadow-[var(--shadow-soft)] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[var(--glass-border)] bg-red-500/5">
              <h3 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                <ArrowDownRight size={18} className="text-red-500" /> Deductions
              </h3>
            </div>
            <div className="p-5 space-y-3">
              {salaryDetail.sundayPenalty > 0 && <SalaryRow label="Sunday Penalty" value={`- Rs. ${salaryDetail.sundayPenalty.toLocaleString('en-IN')}`} danger />}
              <SalaryRow label="Deduction" value={`Rs. ${salaryDetail.deduction.toLocaleString('en-IN')}`} />
              {(salaryDetail.statutoryBreakdown || []).map((b) => (
                <SalaryRow
                  key={b.key}
                  label={`${b.label} (Govt. Deduction)`}
                  value={`- Rs. ${b.amount.toLocaleString('en-IN')}`}
                  danger
                />
              ))}
              {(salaryDetail.statutoryTotal || 0) > 0 && (
                <>
                  <div className="border-t border-[var(--glass-border)] my-1" />
                  <SalaryRow
                    label="Total Statutory Deductions"
                    value={`- Rs. ${(salaryDetail.statutoryTotal || 0).toLocaleString('en-IN')}`}
                    bold
                    danger
                  />
                </>
              )}
            </div>
          </div>

          {/* Advance Details */}
          <div className="bg-[var(--bg-card)] border border-[var(--glass-border)] rounded-2xl shadow-[var(--shadow-soft)] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[var(--glass-border)] bg-blue-500/5">
              <h3 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                <CreditCard size={18} className="text-blue-500" /> Advance Details - {monthName} {selectedYear}
              </h3>
            </div>
            <div className="p-5 space-y-3">
              <SalaryRow label="Previous Advance (Carried Over)" value={`Rs. ${salaryDetail.oldAdv.toLocaleString('en-IN')}`} />
              <SalaryRow label="Current Month Advance" value={`Rs. ${salaryDetail.curAdv.toLocaleString('en-IN')}`} />
              <SalaryRow label="Advance Deducted" value={`Rs. ${salaryDetail.deduction.toLocaleString('en-IN')}`} />
              <div className="border-t border-[var(--glass-border)] my-1" />
              <SalaryRow label="Advance Balance" value={`Rs. ${salaryDetail.newAdv.toLocaleString('en-IN')}`} bold />
              {(() => {
                const staffAdvance = advances.find(a => a.staffId === staff.id && a.month === selectedMonth && a.year === selectedYear);
                return staffAdvance?.notes ? (
                  <div className="mt-2 p-3 rounded-xl bg-blue-500/5 border border-blue-500/10">
                    <p className="text-xs text-blue-500 font-semibold mb-1">📝 Notes</p>
                    <p className="text-sm text-[var(--text-secondary)]">{staffAdvance.notes}</p>
                  </div>
                ) : null;
              })()}

              {/* Date-wise advance entries */}
              {advanceEntries.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[var(--glass-border)]">
                  <p className="text-xs font-semibold text-[var(--text-muted)] mb-2 uppercase tracking-wide">Date-wise Advances</p>
                  <div className="space-y-1.5">
                    {advanceEntries.map(entry => (
                      <div key={entry.id} className="flex items-center justify-between p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/10">
                        <div>
                          <span className="text-xs font-medium text-[var(--text-primary)]">
                            {new Date(entry.entryDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                          </span>
                          {entry.purpose && <span className="text-xs text-[var(--text-muted)] ml-2">— {entry.purpose}</span>}
                        </div>
                        <span className="text-sm font-bold text-blue-600">Rs. {entry.amount.toLocaleString('en-IN')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Advance History (Last 6 months) */}
          <div className="bg-[var(--bg-card)] border border-[var(--glass-border)] rounded-2xl shadow-[var(--shadow-soft)] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[var(--glass-border)] bg-indigo-500/5">
              <h3 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                <TrendingUp size={18} className="text-indigo-500" /> Advance History
              </h3>
            </div>
            <div className="p-4">
              {(() => {
                const staffAdvances = advances
                  .filter(a => a.staffId === staff.id)
                  .sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month))
                  .slice(0, 6);
                if (staffAdvances.length === 0) return <p className="text-sm text-[var(--text-muted)] text-center py-4">No advance records found.</p>;
                return (
                  <div className="space-y-2">
                    {staffAdvances.map(adv => {
                      const mName = new Date(adv.year, adv.month).toLocaleString('default', { month: 'short' });
                      return (
                        <div key={adv.id} className="flex items-center justify-between p-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                          <div>
                            <span className="text-sm font-semibold text-[var(--text-primary)]">{mName} {adv.year}</span>
                            <div className="flex gap-3 text-[11px] text-[var(--text-muted)] mt-0.5">
                              <span>Old: ₹{adv.oldAdvance}</span>
                              <span>Given: ₹{adv.currentAdvance}</span>
                              <span>Ded: ₹{adv.deduction}</span>
                            </div>
                          </div>
                          <span className={`text-sm font-bold ${adv.newAdvance > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                            ₹{adv.newAdvance.toLocaleString('en-IN')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Net Salary */}
          <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-5 shadow-lg shadow-indigo-500/25">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/70 text-sm font-medium">Net Salary</p>
                <p className="text-3xl font-bold text-white">Rs. {salaryDetail.netSalary.toLocaleString('en-IN')}</p>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
                <IndianRupee size={28} className="text-white" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HIKES */}
      {activeSection === 'hikes' && (
        <div className="space-y-4">
          <div className="bg-[var(--bg-card)] border border-[var(--glass-border)] p-6 rounded-2xl shadow-[var(--shadow-soft)]">
            <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <TrendingUp size={20} className="text-emerald-500" /> Salary Hike History
            </h3>
            {staffHikes.length === 0 ? (
              <div className="text-center py-12">
                <TrendingUp size={48} className="mx-auto text-[var(--text-muted)] mb-3 opacity-30" />
                <p className="text-[var(--text-muted)] font-medium">No salary hikes recorded yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {staffHikes.map((hike, idx) => (
                  <div key={hike.id} className="bg-[var(--glass-bg)] border border-[var(--glass-border)] p-4 rounded-xl relative">
                    {idx === 0 && (
                      <span className="absolute -top-2 -right-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white">Latest</span>
                    )}
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-[var(--text-muted)] font-medium">{new Date(hike.hikeDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                      <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                        +Rs. {(hike.newSalary - hike.oldSalary).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[var(--text-primary)]">
                      <span className="text-sm text-[var(--text-muted)]">Rs. {hike.oldSalary.toLocaleString('en-IN')}</span>
                      <span className="text-[var(--text-muted)]">→</span>
                      <span className="text-sm font-bold text-[var(--text-primary)]">Rs. {hike.newSalary.toLocaleString('en-IN')}</span>
                    </div>
                    {hike.reason && <p className="text-xs text-[var(--text-muted)] mt-1.5 italic">"{hike.reason}"</p>}
                    {hike.breakdown && (
                      <div className="mt-3 pt-3 border-t border-[var(--glass-border)] grid grid-cols-2 gap-2 text-xs">
                        {Object.entries(hike.breakdown)
                          .filter(([k]) => !k.startsWith('old_'))
                          .map(([k, v]) => {
                            const oldKey = `old_${k}`;
                            const oldVal = hike.breakdown?.[oldKey] ?? 0;
                            const diff = v - oldVal;
                            return (
                              <div key={k} className="flex justify-between text-[var(--text-secondary)]">
                                <span className="capitalize">{k.replace(/_/g, ' ')}</span>
                                <span className={diff > 0 ? 'text-emerald-600 font-semibold' : diff < 0 ? 'text-red-500 font-semibold' : 'text-[var(--text-muted)]'}>
                                  {diff > 0 ? '+' : ''}{diff !== 0 ? `Rs. ${diff.toLocaleString('en-IN')}` : `Rs. ${v.toLocaleString('en-IN')}`}
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* LEAVE */}
      {activeSection === 'leave' && (
        <div className="space-y-4">
          {/* Apply Leave Button */}
          {!isLeftStaff && (
            <button
              onClick={() => setShowLeaveForm(true)}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25 hover:shadow-xl transition-all active:scale-[0.98]"
            >
              <Send size={18} /> Apply for Leave
            </button>
          )}

          {/* Leave Form Modal */}
          {showLeaveForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setShowLeaveForm(false)}>
              <div className="bg-[var(--bg-card)] border border-[var(--glass-border)] rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                  <FileText size={20} className="text-indigo-500" /> Apply for Leave
                </h3>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Leave Date *</label>
                    <input
                      type="date"
                      value={leaveForm.leaveDate}
                      onChange={e => setLeaveForm(prev => ({ ...prev, leaveDate: e.target.value }))}
                      className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-primary)] p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">End Date (optional, for multiple days)</label>
                    <input
                      type="date"
                      value={leaveForm.leaveEndDate}
                      onChange={e => setLeaveForm(prev => ({ ...prev, leaveEndDate: e.target.value }))}
                      min={leaveForm.leaveDate}
                      className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-primary)] p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Leave Type</label>
                    <select
                      value={leaveForm.leaveType}
                      onChange={e => setLeaveForm(prev => ({ ...prev, leaveType: e.target.value as any }))}
                      className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-primary)] p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    >
                      <option value="casual">Casual Leave</option>
                      <option value="sick">Sick Leave</option>
                      <option value="personal">Personal Leave</option>
                      <option value="emergency">Emergency</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Reason *</label>
                    <textarea
                      value={leaveForm.reason}
                      onChange={e => setLeaveForm(prev => ({ ...prev, reason: e.target.value }))}
                      placeholder="Please describe the reason for your leave..."
                      rows={3}
                      className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-primary)] p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-5">
                  <button
                    onClick={() => setShowLeaveForm(false)}
                    className="flex-1 py-2.5 rounded-xl border border-[var(--glass-border)] text-[var(--text-secondary)] font-semibold text-sm hover:bg-[var(--glass-bg)] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleLeaveSubmit}
                    disabled={leaveSubmitting || !leaveForm.leaveDate || !leaveForm.reason.trim()}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold text-sm disabled:opacity-50 transition-all"
                  >
                    {leaveSubmitting ? 'Submitting...' : 'Submit'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Leave History */}
          <div className="bg-[var(--bg-card)] border border-[var(--glass-border)] p-6 rounded-2xl shadow-[var(--shadow-soft)]">
            <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <FileText size={20} className="text-indigo-500" /> Leave History
            </h3>
            {leaveRequests.length === 0 ? (
              <div className="text-center py-12">
                <Calendar size={48} className="mx-auto text-[var(--text-muted)] mb-3 opacity-30" />
                <p className="text-[var(--text-muted)] font-medium">No leave requests yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {leaveRequests.map(leave => {
                  const statusStyle: Record<string, string> = {
                    pending: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
                    approved: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
                    rejected: 'bg-red-500/10 text-red-600 border-red-500/20',
                    postponed: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
                  };
                  const typeLabels: Record<string, string> = {
                    casual: 'Casual', sick: 'Sick', personal: 'Personal', emergency: 'Emergency', other: 'Other'
                  };
                  return (
                    <div key={leave.id} className="bg-[var(--glass-bg)] border border-[var(--glass-border)] p-4 rounded-xl">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <span className="text-sm font-semibold text-[var(--text-primary)]">
                            {new Date(leave.leaveDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                          {leave.leaveEndDate && (
                            <span className="text-sm text-[var(--text-muted)]">
                              {' → '}{new Date(leave.leaveEndDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                          )}
                          <span className="ml-2 text-xs text-[var(--text-muted)] bg-[var(--glass-bg)] px-2 py-0.5 rounded border border-[var(--glass-border)]">
                            {typeLabels[leave.leaveType]}
                          </span>
                        </div>
                        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${statusStyle[leave.status]}`}>
                          {leave.status.charAt(0).toUpperCase() + leave.status.slice(1)}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--text-secondary)] mb-1">{leave.reason}</p>
                      {leave.managerComment && (
                        <div className="mt-2 bg-indigo-500/5 border border-indigo-500/20 rounded-lg p-2.5">
                          <p className="text-xs text-indigo-500 flex items-center gap-1 mb-0.5">
                            <MessageSquare size={12} /> {leave.reviewedBy}'s Response
                          </p>
                          <p className="text-sm text-[var(--text-primary)]">{leave.managerComment}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* FACE ID */}
      {activeSection === 'face' && (
        <FaceRegistration staff={staff} capturedBy={staff.name} />
      )}
    </div>
  );
};

// Sub-components
const InfoRow: React.FC<{ icon: React.ElementType; label: string; value: string }> = ({ icon: Icon, label, value }) => (
  <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)]">
    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
      <Icon size={16} className="text-indigo-500" />
    </div>
    <div>
      <p className="text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-wide">{label}</p>
      <p className="text-sm font-semibold text-[var(--text-primary)]">{value}</p>
    </div>
  </div>
);

const SalaryCard: React.FC<{ label: string; amount: number; highlight?: boolean }> = ({ label, amount, highlight }) => (
  <div className={`p-4 rounded-xl text-center border ${
    highlight 
      ? 'salary-highlight-card bg-gradient-to-r from-indigo-500 to-purple-600 border-indigo-500/30 shadow-lg shadow-indigo-500/20' 
      : 'bg-[var(--glass-bg)] border-[var(--glass-border)]'
  }`}>
    <p className={`text-[11px] font-medium uppercase tracking-wide mb-1 ${highlight ? 'text-white/70' : 'text-[var(--text-muted)]'}`}>{label}</p>
    <p className={`text-lg font-bold ${highlight ? 'text-white' : 'text-[var(--text-primary)]'}`}>
      Rs. {amount.toLocaleString('en-IN')}
    </p>
  </div>
);

const colorMap: Record<string, string> = {
  emerald: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20',
  red: 'text-red-600 bg-red-500/10 border-red-500/20',
  amber: 'text-amber-600 bg-amber-500/10 border-amber-500/20',
  blue: 'text-blue-600 bg-blue-500/10 border-blue-500/20',
  orange: 'text-orange-600 bg-orange-500/10 border-orange-500/20',
};

const QuickStat: React.FC<{ label: string; value: string; icon: React.ElementType; color: string }> = ({ label, value, icon: Icon, color }) => (
  <div className={`p-4 rounded-2xl text-center border ${colorMap[color] || colorMap.blue}`}>
    <Icon size={20} className="mx-auto mb-1.5" />
    <p className="text-2xl font-bold">{value}</p>
    <p className="text-[11px] font-medium opacity-70 mt-0.5">{label}</p>
  </div>
);

const SalaryRow: React.FC<{ label: string; value: string; bold?: boolean; highlight?: boolean; danger?: boolean }> = ({ label, value, bold, highlight, danger }) => (
  <div className="flex items-center justify-between py-1">
    <span className={`text-sm ${bold ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>{label}</span>
    <span className={`text-sm font-mono ${
      highlight ? 'text-lg font-bold text-emerald-600' :
      danger ? 'text-red-500 font-semibold' :
      bold ? 'font-bold text-[var(--text-primary)]' :
      'text-[var(--text-primary)]'
    }`}>{value}</span>
  </div>
);

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const styles: Record<string, string> = {
    'Present': 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    'Half Day': 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    'Absent': 'bg-red-500/10 text-red-600 border-red-500/20',
    'future': 'bg-gray-500/5 text-[var(--text-muted)] border-[var(--glass-border)]',
  };
  return (
    <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${styles[status] || styles.future}`}>
      {status === 'future' ? '—' : status}
    </span>
  );
};

export default StaffPortal;
