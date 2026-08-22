import React, { useState, useEffect } from 'react';
import { Staff, Attendance, AttendanceFilter, Designation, BranchDesignationShiftConfig, type LocationDesignationShiftConfig } from '../types';
import { Calendar, Calendar as CalendarIcon, Download, Check, X, Filter, MapPin, Clock, Upload, Share2, AlertTriangle, Users } from 'lucide-react';
import { EmptyState } from './ui/PageShell';
import { isSunday } from '../utils/salaryCalculations';
import { DEFAULT_SHIFT_WINDOWS, parseHHMM, shiftService } from '../services/shiftService';
import { exportAttendancePDF } from '../utils/exportUtils';
import {
  exportPeriodAttendancePDF,
  exportPeriodAttendanceExcel,
  sharePeriodAttendanceWhatsApp,
  workingMinutes,
  formatWorkingMinutes,
  PeriodAttendanceRow,
} from '../utils/attendancePeriodExport';
import BulkAttendanceUpload from './BulkAttendanceUpload';
import { attendanceService } from '../services/attendanceService';
import YearlyAttendanceSummary from './YearlyAttendanceSummary';
import { appSettingsService } from '../services/appSettingsService';
import { db } from '../lib/db';
import { resolveActiveRule } from '../utils/attendanceRules';
import { customConfirm, customAlert } from './CustomDialog';
import LateArrivalIntelligence from './attendance/LateArrivalIntelligence';
import AttendanceProfileDrawer from './attendance/AttendanceProfileDrawer';

interface AttendanceTrackerProps {
  staff: Staff[];
  attendance: Attendance[];
  selectedDate: string;
  onDateChange: (date: string) => void;
  onUpdateAttendance: (staffId: string, date: string, status: 'Present' | 'Half Day' | 'Absent', isPartTime?: boolean, staffName?: string, shift?: 'Morning' | 'Evening' | 'Both', location?: string, salary?: number, salaryOverride?: boolean, arrivalTime?: string, leavingTime?: string, floor?: string, appliedRuleType?: string, appliedRuleDetails?: any, isUninformed?: boolean) => void;
  onBulkUpdateAttendance: (date: string, status: 'Present' | 'Absent' | 'Half Day', shift?: 'Morning' | 'Evening', arrivalTime?: string, leavingTime?: string) => void;
  userRole: 'admin' | 'manager';
  actualRole?: string;
}

const AttendanceTracker: React.FC<AttendanceTrackerProps> = ({
  staff,
  attendance,
  selectedDate,
  onDateChange,
  onUpdateAttendance,
  onBulkUpdateAttendance,
  userRole,
  actualRole
}) => {
  const [view, setView] = useState<'daily' | 'monthly' | 'yearly'>('daily');
  const [expandedPeriodCard, setExpandedPeriodCard] = useState<string | null>(null);
  const [monthlyDate, setMonthlyDate] = useState({
    month: new Date().getMonth(),
    year: new Date().getFullYear()
  });
  const [yearlyView, setYearlyView] = useState<{ year: number; staffId: string }>({
    year: new Date().getFullYear(),
    staffId: ''
  });
  const [filters, setFilters] = useState<AttendanceFilter>({
    shift: 'All',
    staffType: 'all',
    location: 'All'
  });
  const [floorFilter, setFloorFilter] = useState<string>('All');
  const [designationFilter, setDesignationFilter] = useState<string>('All');
  const [accommodationFilter, setAccommodationFilter] = useState<string>('All');
  const [showFilters, setShowFilters] = useState(false);
  const [showHalfDayModal, setShowHalfDayModal] = useState<{ staffId: string, staffName: string } | null>(null);
  const [showLocationModal, setShowLocationModal] = useState<{ staffId: string, staffName: string, currentBranch?: string, currentLocation?: string } | null>(null);
  const [selectedShift, setSelectedShift] = useState<'Morning' | 'Evening'>('Morning');
  const [viewImageModal, setViewImageModal] = useState<{ name: string; photo: string } | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<string>('Big Shop');
  const selectedBranch = selectedLocation;
  const [availableLocations, setAvailableLocations] = useState<string[]>(['Big Shop', 'Small Shop', 'Godown']);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [showBulkHalfDayModal, setShowBulkHalfDayModal] = useState(false);
  const [bulkHalfDayShift, setBulkHalfDayShift] = useState<'Morning' | 'Evening'>('Morning');
  const [bulkInTime, setBulkInTime] = useState<string>('10:00');
  const [bulkOutTime, setBulkOutTime] = useState<string>('21:30');
  const [individualTimes, setIndividualTimes] = useState<Record<string, { inTime: string, outTime: string }>>({});
  const [expandedTimeInputs, setExpandedTimeInputs] = useState<Set<string>>(new Set());
  const [showAllTimeInputs, setShowAllTimeInputs] = useState(false);
  const [managerCanOverride, setManagerCanOverride] = useState(true);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [locationDesignationConfigs, setLocationDesignationConfigs] = useState<LocationDesignationShiftConfig[]>([]);
  const [locationConfigs, setLocationConfigs] = useState<any[]>([]);
  const [globalKioskSettings, setGlobalKioskSettings] = useState<any | null>(null);
  const [showProfileDrawer, setShowProfileDrawer] = useState<{ staff: Staff; attendanceData: Attendance[] } | null>(null);

  const normalizeOutTime = (time?: string) => {
    if (!time) return time;
    const match = time.match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
      let h = parseInt(match[1]);
      if (h > 0 && h < 12) {
        h += 12;
        return `${h.toString().padStart(2, '0')}:${match[2]}`;
      }
    }
    return time;
  };

  const handleIndividualTimeChange = (staffId: string, field: 'inTime' | 'outTime', value: string) => {
    setIndividualTimes(prev => ({
      ...prev,
      [staffId]: {
        ...(prev[staffId] || { inTime: '', outTime: '' }),
        [field]: value
      }
    }));
  };

  const confirmIndividualUpdate = async (staffId: string, newStatus: 'Present' | 'Absent' | 'Half Day', currentData: any, shift?: 'Morning' | 'Evening') => {
    if (currentData.hasRecord && currentData.status !== newStatus) {
      if (!await customConfirm(`This staff already has an attendance record (${currentData.status}). Are you sure you want to override it with ${newStatus}?`)) {
        return;
      }
    }
    const inTime = individualTimes[staffId]?.inTime || currentData.arrivalTime;
    const rawOutTime = individualTimes[staffId]?.outTime || currentData.leavingTime;
    const outTime = normalizeOutTime(rawOutTime);
    // Sanitize shift — UI uses '-' as a placeholder when there's no shift,
    // but DB CHECK constraint only allows Morning/Evening/Both. Drop invalid values.
    const rawShift = shift || currentData.shift;
    const validShift = (rawShift === 'Morning' || rawShift === 'Evening' || rawShift === 'Both')
      ? rawShift
      : undefined;
    onUpdateAttendance(staffId, selectedDate, newStatus, false, undefined, validShift, undefined, undefined, undefined, inTime, outTime);
  };

  // Load available locations and settings
  const [globalShiftWindows, setGlobalShiftWindows] = useState<any>(DEFAULT_SHIFT_WINDOWS);

  useEffect(() => {
    const fetchLocations = async () => {
      const { locationService } = await import('../services/locationService');
      const locs = await locationService.getLocations();
      if (locs.length > 0) {
        setAvailableLocations(locs.map(loc => loc.name));
      }
    };
    fetchLocations();
    
    appSettingsService.getManagerCanOverride().then(setManagerCanOverride);
    shiftService.loadGlobal().then(setGlobalShiftWindows);
    db.designations.toArray().then(setDesignations);
    db.locationDesignationShiftConfig.toArray().then(setLocationDesignationConfigs);
    db.locationShiftConfig.toArray().then(setLocationConfigs);
    appSettingsService.getKioskGlobalSettings().then(setGlobalKioskSettings);
  }, []);

  const activeStaff = staff.filter(member => member.isActive);
  const today = new Date().toISOString().split('T')[0];
  
  // Logic: Admins can always edit any date. Managers/supervisors can ALWAYS edit today.
  // managerCanOverride controls whether they can edit OTHER (past) dates.
  const isToday = selectedDate === today;
  const canEditDate = userRole === 'admin' || isToday || managerCanOverride;

  const getAttendanceForDate = (staffId: string, date: string) => {
    const record = attendance.find(a => a.staffId === staffId && a.date === date && !a.isPartTime);
    return record;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Present':
        return 'badge-premium badge-success';
      case 'Half Day':
        return 'badge-premium badge-warning';
      case 'Absent':
        return 'badge-premium badge-danger';
      default:
        return 'badge-premium badge-neutral';
    }
  };

  const getLocationColor = (location: string) => {
    switch (location) {
      case 'Big Shop':
        return 'badge-premium badge-info';
      case 'Small Shop':
        return 'badge-premium badge-success';
      case 'Godown':
        return 'badge-premium badge-purple';
      default:
        return 'badge-premium badge-neutral';
    }
  };

  const getShiftColor = (shift: string) => {
    switch (shift) {
      case 'Morning':
        return 'badge-premium badge-warning';
      case 'Evening':
        return 'badge-premium badge-purple';
      case 'Both':
        return 'badge-premium badge-info';
      default:
        return 'badge-premium badge-neutral';
    }
  };

  const handleHalfDayConfirm = () => {
    if (showHalfDayModal && canEditDate) {
      const staffId = showHalfDayModal.staffId;
      const inTime = individualTimes[staffId]?.inTime || undefined;
      const outTime = individualTimes[staffId]?.outTime || undefined;
      onUpdateAttendance(
        staffId,
        selectedDate,
        'Half Day',
        false,
        undefined,
        selectedShift,
        undefined,
        undefined,
        undefined,
        inTime,
        outTime
      );
      setShowHalfDayModal(null);
    }
  };

  const handleLocationChange = () => {
    if (showLocationModal && canEditDate) {
      const attendanceRecord = getAttendanceForDate(showLocationModal.staffId, selectedDate);
      onUpdateAttendance(
        showLocationModal.staffId,
        selectedDate,
        (attendanceRecord?.status as 'Present' | 'Half Day' | 'Absent') || 'Present',
        false,
        undefined,
        attendanceRecord?.shift,
        selectedLocation
      );
      setShowLocationModal(null);
    }
  };

  // Filter attendance based on filters
  const getFilteredStaff = () => {
    let filteredStaff = activeStaff;

    if (filters.staffType === 'full-time') {
      filteredStaff = activeStaff;
    } else if (filters.staffType === 'part-time') {
      return [];
    }

    // Apply location filter
    if (filters.location && filters.location !== 'All') {
      filteredStaff = filteredStaff.filter(member => member.location === filters.location);
    }

    // Apply floor filter
    if (floorFilter !== 'All') {
      filteredStaff = filteredStaff.filter(member => (member.floor || '') === floorFilter);
    }

    // Apply designation filter
    if (designationFilter !== 'All') {
      filteredStaff = filteredStaff.filter(member => (member.designation || '') === designationFilter);
    }

    // Apply accommodation filter
    if (accommodationFilter !== 'All') {
      filteredStaff = filteredStaff.filter(member => (member.staffAccommodation || '') === accommodationFilter);
    }

    // Apply search filter (admin only)
    if (filters.search && filters.search.trim() !== '') {
      const searchLower = filters.search.toLowerCase();
      filteredStaff = filteredStaff.filter(member =>
        member.name.toLowerCase().includes(searchLower)
      );
    }

    return filteredStaff;
  };

  const getFilteredPartTimeAttendance = () => {
    let filteredAttendance = attendance.filter(record =>
      record.isPartTime && record.date === selectedDate
    );

    if (filters.shift && filters.shift !== 'All') {
      filteredAttendance = filteredAttendance.filter(record =>
        record.shift === filters.shift
      );
    }

    // Apply location filter for part-time
    if (filters.location && filters.location !== 'All') {
      filteredAttendance = filteredAttendance.filter(record =>
        record.location === filters.location
      );
    }

    return filteredAttendance;
  };


  /** Sum working minutes for a staff member over the dates matching a predicate */
  const getPeriodWorkMinutes = (staffId: string, matches: (date: string) => boolean): number =>
    attendance
      .filter(a => a.staffId === staffId && !a.isPartTime && matches(a.date))
      .reduce((sum, a) => sum + workingMinutes(a.arrivalTime, a.leavingTime), 0);

  const buildPeriodRow = (member: any, summary: any, work: string): PeriodAttendanceRow => ({
    employeeCode: member.employeeCode || '',
    name: member.name,
    location: member.location,
    present: summary.present,
    halfDay: summary.halfDay,
    absent: summary.absent,
    uninformed: summary.uninformed,
    total: summary.total,
    workingTime: work,
  });

  const generateMonthlyView = () => {
    const year = monthlyDate.year;
    const month = monthlyDate.month;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentDay = now.getDate();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Limit days shown: if viewing current month/year, only show up to today
    const maxDay = (year === currentYear && month === currentMonth) ? currentDay : daysInMonth;
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const monthTitle = `Attendance ${new Date(year, month).toLocaleString('default', { month: 'long' })} ${year}`;

    // Filter staff for monthly view
    const monthlyFilteredStaff = activeStaff
      .filter(member => !filters.location || filters.location === 'All' || member.location === filters.location)
      .filter(member => !filters.search || filters.search.trim() === '' || member.name.toLowerCase().includes(filters.search.toLowerCase()));

    // Calculate attendance summary for each staff member
    const getStaffSummary = (memberId: string) => {
      let present = 0, halfDay = 0, absent = 0, sundayAbsent = 0, uninformed = 0;

      days.forEach(day => {
        if (day > maxDay) return;
        const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isDateSunday = isSunday(date);
        const record = getAttendanceForDate(memberId, date);
        const status = record?.status || 'Absent';

        if (status === 'Present' || status === 'Pending Full Day') {
          present++;
        } else if (status === 'Manual Override') {
          if (record?.attendanceValue === 1) present++;
          else if (record?.attendanceValue === 0.5) halfDay++;
          else absent++;
        } else if (status === 'Half Day') {
          halfDay++;
        } else if (status === 'Absent') {
          if (isDateSunday) {
            sundayAbsent++;
          }
          absent++;
          if (record?.isUninformed) uninformed++;
        }
      });

      const total = present + (halfDay * 0.5);
      return { present, halfDay, absent, sundayAbsent, uninformed, total };
    };

    // Restrict months: only show up to current month
    const availableMonths = Array.from({ length: 12 }, (_, i) => i).filter(m => {
      if (year < currentYear) return true;
      if (year === currentYear) return m <= currentMonth;
      return false;
    });

    // Restrict years: only up to current year
    const availableYears = Array.from({ length: 5 }, (_, i) => currentYear - 4 + i).filter(y => y <= currentYear);

    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 md:p-6">
        {/* Header and Filters */}
        <div className="flex flex-col gap-3 mb-4">
          <h2 className="text-lg md:text-xl font-bold text-gray-800 flex items-center gap-2">
            <Calendar className="text-blue-600" size={20} />
            Monthly Attendance View
          </h2>
          <div className="flex flex-row items-center gap-2 flex-wrap">
            <select
              value={monthlyDate.month}
              onChange={(e) => setMonthlyDate({ ...monthlyDate, month: Number(e.target.value) })}
              className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {availableMonths.map(i => (
                <option key={i} value={i}>
                  {new Date(0, i).toLocaleString('default', { month: 'short' })}
                </option>
              ))}
            </select>
            <select
              value={monthlyDate.year}
              onChange={(e) => {
                const newYear = Number(e.target.value);
                // If switching to current year, clamp month
                const newMonth = (newYear === currentYear && monthlyDate.month > currentMonth) ? currentMonth : monthlyDate.month;
                setMonthlyDate({ month: newMonth, year: newYear });
              }}
              className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {availableYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            {userRole === 'admin' && (
              <select
                value={filters.location || 'All'}
                onChange={(e) => setFilters({ ...filters, location: e.target.value })}
                className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="All">All Branchs</option>
                {availableLocations.map(loc => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            )}
          </div>
          <input
            type="text"
            placeholder="Search by staff name..."
            value={filters.search || ''}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Mobile: native-style card list */}
        <div className="md:hidden space-y-2 pb-2">
          {monthlyFilteredStaff.length === 0 ? (
            <EmptyState icon={<Users size={26} />} title="No staff match these filters" description="Adjust the branch, zone or search filters above to see staff for this month." />
          ) : (
            monthlyFilteredStaff.map(member => {
              const summary = getStaffSummary(member.id);
              const work = formatWorkingMinutes(getPeriodWorkMinutes(member.id, d => {
                const dt = new Date(d);
                return dt.getFullYear() === year && dt.getMonth() === month;
              }));
              const expanded = expandedPeriodCard === member.id;
              return (
                <div key={member.id} className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                  <button
                    onClick={() => setExpandedPeriodCard(expanded ? null : member.id)}
                    className="w-full flex items-center gap-3 px-3 py-3 min-h-[56px] text-left active:bg-gray-50 transition-colors"
                  >
                    {member.photo ? (
                      <button type="button" onClick={(e) => { e.stopPropagation(); setViewImageModal({ name: member.name, photo: member.photo! }); }} className="shrink-0 cursor-pointer">
                        <img src={member.photo} alt={member.name} className="w-9 h-9 rounded-full object-cover border border-gray-200 shadow-sm" />
                      </button>
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-600 font-bold text-xs flex items-center justify-center shrink-0 border border-indigo-100">
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-900 text-sm truncate">{member.name}</p>
                      <p className="text-[11px] text-gray-500 truncate">{member.location}{member.floor ? ` • ${member.floor}` : ''} • {work}</p>
                    </div>
                    <span className="text-xs font-bold text-blue-600 bg-blue-50 rounded-lg px-2 py-1">{summary.total}</span>
                  </button>
                  <div className={`grid transition-all duration-200 ease-out ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                    <div className="overflow-hidden">
                      <div className="px-3 pb-3 space-y-3">
                        <div className="grid grid-cols-4 gap-2 text-center">
                          <div className="rounded-xl bg-green-50 py-2"><p className="text-base font-bold text-green-600">{summary.present}</p><p className="text-[10px] text-green-700">Present</p></div>
                          <div className="rounded-xl bg-yellow-50 py-2"><p className="text-base font-bold text-yellow-600">{summary.halfDay}</p><p className="text-[10px] text-yellow-700">Half</p></div>
                          <div className="rounded-xl bg-red-50 py-2"><p className="text-base font-bold text-red-600">{summary.absent}</p><p className="text-[10px] text-red-700">Absent</p></div>
                          <div className="rounded-xl bg-orange-50 py-2"><p className="text-base font-bold text-orange-600">{summary.uninformed}</p><p className="text-[10px] text-orange-700">Uninf.</p></div>
                        </div>
                        <div className="flex items-center justify-between text-xs text-gray-600">
                          <span>Working time</span>
                          <span className="font-semibold text-gray-900">{work}</span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => exportPeriodAttendancePDF(`${monthTitle} - ${member.name}`, [buildPeriodRow(member, summary, work)])}
                            className="flex-1 min-h-[44px] rounded-xl bg-blue-600 text-white text-xs font-semibold active:bg-blue-700"
                          >
                            PDF
                          </button>
                          <button
                            onClick={() => exportPeriodAttendanceExcel(`${monthTitle} - ${member.name}`, [buildPeriodRow(member, summary, work)])}
                            className="flex-1 min-h-[44px] rounded-xl bg-emerald-600 text-white text-xs font-semibold active:bg-emerald-700"
                          >
                            Excel
                          </button>
                          <button
                            onClick={() => sharePeriodAttendanceWhatsApp(`${monthTitle} - ${member.name}`, [buildPeriodRow(member, summary, work)])}
                            className="flex-1 min-h-[44px] rounded-xl bg-green-600 text-white text-xs font-semibold active:bg-green-700"
                          >
                            WhatsApp
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          {monthlyFilteredStaff.length > 0 && (
            <div className="sticky bottom-20 flex gap-2 pt-1">
              <button
                onClick={() => exportPeriodAttendancePDF(monthTitle, monthlyFilteredStaff.map(m => {
                  const s = getStaffSummary(m.id);
                  const w = formatWorkingMinutes(getPeriodWorkMinutes(m.id, d => {
                    const dt = new Date(d);
                    return dt.getFullYear() === year && dt.getMonth() === month;
                  }));
                  return buildPeriodRow(m, s, w);
                }))}
                className="flex-1 min-h-[44px] rounded-xl bg-blue-600 text-white text-sm font-semibold shadow-lg active:bg-blue-700"
              >
                Month PDF
              </button>
              <button
                onClick={() => exportPeriodAttendanceExcel(monthTitle, monthlyFilteredStaff.map(m => {
                  const s = getStaffSummary(m.id);
                  const w = formatWorkingMinutes(getPeriodWorkMinutes(m.id, d => {
                    const dt = new Date(d);
                    return dt.getFullYear() === year && dt.getMonth() === month;
                  }));
                  return buildPeriodRow(m, s, w);
                }))}
                className="flex-1 min-h-[44px] rounded-xl bg-emerald-600 text-white text-sm font-semibold shadow-lg active:bg-emerald-700"
              >
                Month Excel
              </button>
              <button
                onClick={() => sharePeriodAttendanceWhatsApp(monthTitle, monthlyFilteredStaff.map(m => {
                  const s = getStaffSummary(m.id);
                  const w = formatWorkingMinutes(getPeriodWorkMinutes(m.id, d => {
                    const dt = new Date(d);
                    return dt.getFullYear() === year && dt.getMonth() === month;
                  }));
                  return buildPeriodRow(m, s, w);
                }))}
                className="flex-1 min-h-[44px] rounded-xl bg-green-600 text-white text-sm font-semibold shadow-lg active:bg-green-700"
              >
                Share
              </button>
            </div>
          )}
        </div>

        <div className="table-container hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-2 md:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">S.No</th>
                  <th className="px-2 md:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Emp Code</th>
                  <th className="px-2 md:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 z-30 bg-gray-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.15)]">Name</th>
                  <th className="px-1 md:px-2 py-3 text-center text-xs font-medium text-green-600 uppercase tracking-wider bg-green-50">P</th>
                  <th className="px-1 md:px-2 py-3 text-center text-xs font-medium text-yellow-600 uppercase tracking-wider bg-yellow-50">H</th>
                  <th className="px-1 md:px-2 py-3 text-center text-xs font-medium text-red-600 uppercase tracking-wider bg-red-50">A</th>
                  <th className="px-1 md:px-2 py-3 text-center text-xs font-medium text-red-700 uppercase tracking-wider bg-red-100">Sun</th>
                  <th className="px-1 md:px-2 py-3 text-center text-xs font-medium text-orange-600 uppercase tracking-wider bg-orange-50">UI</th>
                  <th className="px-1 md:px-2 py-3 text-center text-xs font-medium text-blue-600 uppercase tracking-wider bg-blue-50">Total</th>
                  {days.map(day => {
                    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const isDateSunday = isSunday(date);
                    const isFuture = day > maxDay;
                    const dayName = new Date(date).toLocaleDateString('en-US', { weekday: 'short' });
                    return (
                      <th key={day} className={`px-1 md:px-2 py-3 text-center text-xs font-medium uppercase tracking-wider ${isFuture ? 'text-gray-300' : isDateSunday ? 'bg-red-50 text-red-600' : 'text-gray-500'}`}>
                        <div className="text-[9px] opacity-70 font-normal normal-case">{dayName}</div>
                        <div>{day}</div>
                        {isDateSunday && <div className="text-[9px]">Sun</div>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {monthlyFilteredStaff.map((member, index) => {
                  const summary = getStaffSummary(member.id);
                  return (
                    <tr key={member.id} className="hover:bg-gray-50">
                      <td className="px-2 md:px-4 py-4 whitespace-nowrap text-sm text-gray-900">{index + 1}</td>
                      <td className="px-2 md:px-4 py-4 whitespace-nowrap text-sm text-gray-500">{member.employeeCode || (member.deviceId?.startsWith('dev_') ? null : member.deviceId) || '-'}</td>
                      <td className="px-2 md:px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 z-10 bg-white shadow-[2px_0_5px_-2px_rgba(0,0,0,0.15)]">{member.name}</td>
                      <td className="px-1 md:px-2 py-4 text-center text-sm font-bold text-green-600 bg-green-50">{summary.present}</td>
                      <td className="px-1 md:px-2 py-4 text-center text-sm font-bold text-yellow-600 bg-yellow-50">{summary.halfDay}</td>
                      <td className="px-1 md:px-2 py-4 text-center text-sm font-bold text-red-600 bg-red-50">{summary.absent}</td>
                      <td className="px-1 md:px-2 py-4 text-center text-sm font-bold text-red-700 bg-red-100">{summary.sundayAbsent}</td>
                      <td className="px-1 md:px-2 py-4 text-center text-sm font-bold text-orange-600 bg-orange-50">{summary.uninformed}</td>
                      <td className="px-1 md:px-2 py-4 text-center text-sm font-bold text-blue-600 bg-blue-50">{summary.total}</td>
                      {days.map(day => {
                        const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        const isFuture = day > maxDay;
                        if (isFuture) {
                          return <td key={day} className="px-1 md:px-2 py-4 text-center"><span className="inline-block w-5 h-5 md:w-6 md:h-6 rounded bg-gray-100 text-gray-300 text-xs leading-5 md:leading-6">-</span></td>;
                        }
                        const attendanceRecord = getAttendanceForDate(member.id, date);
                        const status = attendanceRecord?.status || 'Absent';
                        const isDateSunday = isSunday(date);
                        const isUninformed = attendanceRecord?.isUninformed;
                        const halfCode = attendanceRecord?.shift === 'Morning' ? 'HM' : attendanceRecord?.shift === 'Evening' ? 'HE' : 'H';
                        return (
                          <td key={day} className={`px-1 md:px-2 py-4 text-center ${isDateSunday ? 'bg-red-50' : ''} ${isUninformed ? 'bg-orange-50' : ''}`}
                            title={`${status}${isUninformed ? ' - Uninformed' : ''}`}>
                            <span className={`inline-block min-w-[20px] h-5 md:min-w-[24px] md:h-6 rounded text-xs font-semibold leading-5 md:leading-6 px-0.5 ${
                              isUninformed
                                ? 'bg-orange-500 text-white ring-2 ring-orange-300'
                                : status === 'Present' ? 'bg-green-500 text-white' :
                                  status === 'Pending Full Day' ? 'bg-indigo-500 text-white' :
                                  status === 'Manual Override' ? 'bg-purple-500 text-white' :
                                  status === 'Half Day' ? 'bg-yellow-500 text-white' :
                                    status === 'Absent' ? (isDateSunday ? 'bg-red-700 text-white' : 'bg-red-500 text-white') : 'bg-gray-200 text-gray-500'
                              }`}>
                              {isUninformed ? '⚠' : status === 'Present' ? 'P' : status === 'Pending Full Day' ? 'P?' : status === 'Manual Override' ? 'MO' : status === 'Half Day' ? halfCode : 'A'}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 bg-green-500 rounded"></span>
            <span>Present (P)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 bg-indigo-500 rounded"></span>
            <span>Pending Full Day (P?)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 bg-purple-500 rounded"></span>
            <span>Override (MO)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 bg-yellow-500 rounded"></span>
            <span>Half Day (H/HM/HE)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 bg-red-500 rounded"></span>
            <span>Absent (A)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 bg-orange-500 rounded ring-2 ring-orange-300"></span>
            <span>Uninformed (⚠)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 bg-red-700 rounded"></span>
            <span>Sunday Absent</span>
          </div>
        </div>
      </div>
    );
  };

  const generateYearlyView = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentDay = now.getDate();
    const year = yearlyView.year;

    const yearStaff = activeStaff.filter(m =>
      (!filters.location || filters.location === 'All' || m.location === filters.location) &&
      (!filters.search || filters.search.trim() === '' || m.name.toLowerCase().includes(filters.search.toLowerCase()))
    );

    const selectedStaff = yearStaff.find(s => s.id === yearlyView.staffId) || yearStaff[0];
    const availableYears = Array.from({ length: 5 }, (_, i) => currentYear - 4 + i).filter(y => y <= currentYear);

    const computeMonthSummary = (memberId: string, mi: number) => {
      const daysInMonth = new Date(year, mi + 1, 0).getDate();
      const maxDay = (year === currentYear && mi === currentMonth) ? currentDay : (year < currentYear || mi < currentMonth ? daysInMonth : 0);
      let p = 0, h = 0, a = 0, sun = 0, ui = 0;
      for (let d = 1; d <= maxDay; d++) {
        const dateStr = `${year}-${String(mi + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const rec = getAttendanceForDate(memberId, dateStr);
        const status = rec?.status || 'Absent';
        const isSun = isSunday(dateStr);
        if (status === 'Present') p++;
        else if (status === 'Half Day') h++;
        else { a++; if (isSun) sun++; if (rec?.isUninformed) ui++; }
      }
      return { p, h, a, sun, ui, total: p + h * 0.5, daysInMonth, maxDay };
    };

    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 md:p-6">
        <div className="flex flex-col gap-3 mb-4">
          <h2 className="text-lg md:text-xl font-bold text-gray-800 flex items-center gap-2">
            <Calendar className="text-blue-600" size={20} />
            Yearly Attendance — {selectedStaff?.name || 'Select Staff'}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={yearlyView.year}
              onChange={(e) => setYearlyView({ ...yearlyView, year: Number(e.target.value) })}
              className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select
              value={selectedStaff?.id || ''}
              onChange={(e) => setYearlyView({ ...yearlyView, staffId: e.target.value })}
              className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-w-[200px]"
            >
              <option value="">— Select Staff —</option>
              {yearStaff.map(s => <option key={s.id} value={s.id}>{s.name} ({s.location})</option>)}
            </select>
            {userRole === 'admin' && (
              <select
                value={filters.location || 'All'}
                onChange={(e) => setFilters({ ...filters, location: e.target.value })}
                className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="All">All Branchs</option>
                {availableLocations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
              </select>
            )}
            <input
              type="text"
              placeholder="Search staff..."
              value={filters.search || ''}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {!selectedStaff ? (
          <EmptyState icon={<CalendarIcon size={26} />} title="Select a staff member" description="Pick someone from the list above to see their full year of attendance at a glance." />
        ) : (
          <div className="space-y-5">
            <YearlyAttendanceSummary
              attendance={attendance}
              staffId={selectedStaff.id}
              year={year}
              title={`Year ${year} — ${selectedStaff.name}`}
            />

            {/* Mobile: native-style month card list */}
            <div className="md:hidden space-y-2">
              {Array.from({ length: 12 }, (_, mi) => {
                const s = computeMonthSummary(selectedStaff.id, mi);
                const monthName = new Date(year, mi).toLocaleString('default', { month: 'long' });
                const work = formatWorkingMinutes(getPeriodWorkMinutes(selectedStaff.id, d => {
                  const dt = new Date(d);
                  return dt.getFullYear() === year && dt.getMonth() === mi;
                }));
                const key = `y-${mi}`;
                const expanded = expandedPeriodCard === key;
                const row: PeriodAttendanceRow = {
                  name: `${selectedStaff.name} — ${monthName} ${year}`,
                  location: selectedStaff.location,
                  present: s.p, halfDay: s.h, absent: s.a, uninformed: s.ui,
                  total: Number(s.total.toFixed(1)), workingTime: work,
                };
                const title = `${selectedStaff.name} ${monthName} ${year}`;
                return (
                  <div key={mi} className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                    <button
                      onClick={() => setExpandedPeriodCard(expanded ? null : key)}
                      className="w-full flex items-center gap-3 px-3 py-3 min-h-[56px] text-left active:bg-gray-50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-900 text-sm">{monthName} {year}</p>
                        <p className="text-[11px] text-gray-500">P {s.p} • H {s.h} • A {s.a} • {work}</p>
                      </div>
                      <span className="text-xs font-bold text-blue-600 bg-blue-50 rounded-lg px-2 py-1">{s.total.toFixed(1).replace('.0', '')}</span>
                    </button>
                    <div className={`grid transition-all duration-200 ease-out ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                      <div className="overflow-hidden">
                        <div className="px-3 pb-3 space-y-3">
                          <div className="grid grid-cols-4 gap-2 text-center">
                            <div className="rounded-xl bg-green-50 py-2"><p className="text-base font-bold text-green-600">{s.p}</p><p className="text-[10px] text-green-700">Present</p></div>
                            <div className="rounded-xl bg-yellow-50 py-2"><p className="text-base font-bold text-yellow-600">{s.h}</p><p className="text-[10px] text-yellow-700">Half</p></div>
                            <div className="rounded-xl bg-red-50 py-2"><p className="text-base font-bold text-red-600">{s.a}</p><p className="text-[10px] text-red-700">Absent</p></div>
                            <div className="rounded-xl bg-orange-50 py-2"><p className="text-base font-bold text-orange-600">{s.ui}</p><p className="text-[10px] text-orange-700">Uninf.</p></div>
                          </div>
                          <div className="flex items-center justify-between text-xs text-gray-600">
                            <span>Working time</span>
                            <span className="font-semibold text-gray-900">{work}</span>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => exportPeriodAttendancePDF(title, [row])} className="flex-1 min-h-[44px] rounded-xl bg-blue-600 text-white text-xs font-semibold active:bg-blue-700">PDF</button>
                            <button onClick={() => exportPeriodAttendanceExcel(title, [row])} className="flex-1 min-h-[44px] rounded-xl bg-emerald-600 text-white text-xs font-semibold active:bg-emerald-700">Excel</button>
                            <button onClick={() => sharePeriodAttendanceWhatsApp(title, [row])} className="flex-1 min-h-[44px] rounded-xl bg-green-600 text-white text-xs font-semibold active:bg-green-700">WhatsApp</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="sticky bottom-20 flex gap-2 pt-1">
                <button
                  onClick={() => exportPeriodAttendancePDF(`${selectedStaff.name} ${year} attendance`, Array.from({ length: 12 }, (_, mi) => {
                    const s = computeMonthSummary(selectedStaff.id, mi);
                    return {
                      employeeCode: selectedStaff.employeeCode || '',
                      name: new Date(year, mi).toLocaleString('default', { month: 'long' }),
                      location: selectedStaff.location,
                      present: s.p, halfDay: s.h, absent: s.a, uninformed: s.ui,
                      total: Number(s.total.toFixed(1)),
                      workingTime: formatWorkingMinutes(getPeriodWorkMinutes(selectedStaff.id, d => {
                        const dt = new Date(d);
                        return dt.getFullYear() === year && dt.getMonth() === mi;
                      })),
                    };
                  }))}
                  className="flex-1 min-h-[44px] rounded-xl bg-blue-600 text-white text-sm font-semibold shadow-lg active:bg-blue-700"
                >
                  Year PDF
                </button>
                <button
                  onClick={() => exportPeriodAttendanceExcel(`${selectedStaff.name} ${year} attendance`, Array.from({ length: 12 }, (_, mi) => {
                    const s = computeMonthSummary(selectedStaff.id, mi);
                    return {
                      employeeCode: selectedStaff.employeeCode || '',
                      name: new Date(year, mi).toLocaleString('default', { month: 'long' }),
                      location: selectedStaff.location,
                      present: s.p, halfDay: s.h, absent: s.a, uninformed: s.ui,
                      total: Number(s.total.toFixed(1)),
                      workingTime: formatWorkingMinutes(getPeriodWorkMinutes(selectedStaff.id, d => {
                        const dt = new Date(d);
                        return dt.getFullYear() === year && dt.getMonth() === mi;
                      })),
                    };
                  }))}
                  className="flex-1 min-h-[44px] rounded-xl bg-emerald-600 text-white text-sm font-semibold shadow-lg active:bg-emerald-700"
                >
                  Year Excel
                </button>
                <button
                  onClick={() => sharePeriodAttendanceWhatsApp(`${selectedStaff.name} ${year} attendance`, Array.from({ length: 12 }, (_, mi) => {
                    const s = computeMonthSummary(selectedStaff.id, mi);
                    return {
                      name: new Date(year, mi).toLocaleString('default', { month: 'long' }),
                      location: selectedStaff.location,
                      present: s.p, halfDay: s.h, absent: s.a, uninformed: s.ui,
                      total: Number(s.total.toFixed(1)),
                      workingTime: formatWorkingMinutes(getPeriodWorkMinutes(selectedStaff.id, d => {
                        const dt = new Date(d);
                        return dt.getFullYear() === year && dt.getMonth() === mi;
                      })),
                    };
                  }))}
                  className="flex-1 min-h-[44px] rounded-xl bg-green-600 text-white text-sm font-semibold shadow-lg active:bg-green-700"
                >
                  Share year
                </button>
              </div>
            </div>

            {Array.from({ length: 12 }, (_, mi) => {
              const summary = computeMonthSummary(selectedStaff.id, mi);
              const monthName = new Date(year, mi).toLocaleString('default', { month: 'long' });
              const days = Array.from({ length: summary.daysInMonth }, (_, d) => d + 1);
              return (
                <div key={mi} className="hidden md:block border border-gray-100 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <h4 className="font-bold text-gray-800">{monthName} {year}</h4>
                    <div className="flex gap-3 text-xs flex-wrap">
                      <span className="text-green-600 font-bold">P:{summary.p}</span>
                      <span className="text-yellow-600 font-bold">H:{summary.h}</span>
                      <span className="text-red-600 font-bold">A:{summary.a}</span>
                      <span className="text-red-700 font-bold">SUN:{summary.sun}</span>
                      <span className="text-orange-600 font-bold">UI:{summary.ui}</span>
                      <span className="text-blue-600 font-bold">T:{summary.total.toFixed(1).replace('.0', '')}</span>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {days.map(day => {
                      const dateStr = `${year}-${String(mi + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                      const isFuture = day > summary.maxDay;
                      if (isFuture) {
                        return (
                          <div key={day} className="flex flex-col items-center">
                            <div className="w-7 h-7 rounded text-[10px] flex items-center justify-center bg-gray-100 text-gray-300">-</div>
                            <span className="text-[9px] text-gray-300 mt-0.5">{day}</span>
                          </div>
                        );
                      }
                      const rec = getAttendanceForDate(selectedStaff.id, dateStr);
                      const status = rec?.status || 'Absent';
                      const isSun = isSunday(dateStr);
                      const isUI = rec?.isUninformed;
                      const halfCode = rec?.shift === 'Morning' ? 'M' : rec?.shift === 'Evening' ? 'E' : 'H';
                      return (
                        <div key={day} className="flex flex-col items-center">
                          <span className={`text-[8px] font-medium ${isSun ? 'text-red-600' : 'text-gray-400'}`}>{new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short' }).slice(0,3)}</span>
                          <div className={`w-7 h-7 rounded text-[10px] font-bold flex items-center justify-center ${
                            isUI ? 'bg-orange-500 text-white ring-1 ring-orange-300' :
                            status === 'Present' ? 'bg-green-500 text-white' :
                            status === 'Half Day' ? 'bg-yellow-500 text-white' :
                            isSun ? 'bg-red-700 text-white' : 'bg-red-500 text-white'
                          }`} title={`${day} ${monthName}: ${status}${isUI ? ' (Uninformed)' : ''}`}>
                            {isUI ? '!' : status === 'Present' ? 'P' : status === 'Half Day' ? halfCode : 'A'}
                          </div>
                          <span className={`text-[9px] mt-0.5 font-semibold ${isSun ? 'text-red-600' : 'text-gray-500'}`}>{day}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  if (view === 'monthly') {
    return (
      <div className="p-1 md:p-6 space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setView('daily')}
            className="px-4 py-2 text-gray-600 hover:text-blue-600 transition-colors"
          >
            ← Back to Daily View
          </button>
        </div>
        {generateMonthlyView()}
      </div>
    );
  }

  if (view === 'yearly') {
    return (
      <div className="p-1 md:p-6 space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setView('daily')}
            className="px-4 py-2 text-gray-600 hover:text-blue-600 transition-colors"
          >
            ← Back to Daily View
          </button>
        </div>
        {generateYearlyView()}
      </div>
    );
  }

  const isSelectedDateSunday = isSunday(selectedDate);
  const filteredStaff = getFilteredStaff();
  const _filteredPartTimeAttendance = getFilteredPartTimeAttendance();

  // Only show full-time staff in the attendance table (part-time details shown in Payroll page)
  const combinedAttendanceData: any[] = [];

  // Add full-time staff only
  filteredStaff.forEach((member) => {
    const attendanceRecord = getAttendanceForDate(member.id, selectedDate);
    const displayBranch = attendanceRecord?.location || member.location;
    const displayName = attendanceRecord?.shift ? `${member.name} (${attendanceRecord.shift})` : member.name;

    combinedAttendanceData.push({
      id: member.id,
      serialNo: 0,
      displayOrder: (member as any).displayOrder ?? null,
      employeeCode: member.employeeCode || '',
      photo: member.photo || '',
      name: displayName,
      location: displayBranch,
      floor: member.floor || '',
      designation: member.designation || '',
      type: member.type,
      staffAccommodation: member.staffAccommodation,
      shift: attendanceRecord?.shift || '-',
      status: attendanceRecord?.status || 'Absent',
      isPartTime: false,
      isUninformed: attendanceRecord?.isUninformed || false,
      originalName: member.name,
      originalBranch: member.location,
      arrivalTime: attendanceRecord?.arrivalTime || '',
      leavingTime: attendanceRecord?.leavingTime || '',
      hasRecord: !!attendanceRecord,
      appliedRuleDetails: attendanceRecord?.appliedRuleDetails || null,
      appliedRuleType: attendanceRecord?.appliedRuleType || null,
      totalHours: attendanceRecord?.totalHours || 0,
      overtimeHours: attendanceRecord?.overtimeHours || 0,
    });
  });

  // Match the Staff page ordering exactly (display_order, then name),
  // then number the rows so S.No is always sequential.
  combinedAttendanceData.sort((a, b) => {
    const oA = a.displayOrder ?? Number.MAX_SAFE_INTEGER;
    const oB = b.displayOrder ?? Number.MAX_SAFE_INTEGER;
    if (oA !== oB) return oA - oB;
    return (a.originalName || '').localeCompare(b.originalName || '');
  });
  combinedAttendanceData.forEach((row, i) => { row.serialNo = i + 1; });


  // Helper to generate share text for attendance
  const generateShareText = () => {
    const dateStr = new Date(selectedDate).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });
    const present = combinedAttendanceData.filter((d: any) => d.status === 'Present');
    const halfDay = combinedAttendanceData.filter((d: any) => d.status === 'Half Day');
    const absent = combinedAttendanceData.filter((d: any) => d.status === 'Absent');
    const uninformedList = combinedAttendanceData.filter((d: any) => d.status === 'Absent' && d.isUninformed);

    let text = `📋 *ATTENDANCE REPORT*\n`;
    text += `📅 ${dateStr}\n`;
    text += `━━━━━━━━━━━━━━━━\n`;
    text += `✅ Present: ${present.length}\n`;
    text += `🕒 Half Day: ${halfDay.length}\n`;
    text += `❌ Absent: ${absent.length}\n`;
    if (uninformedList.length > 0) {
      text += `⚠️ Uninformed: ${uninformedList.length} (${uninformedList.map((d: any) => d.originalName || d.name).join(', ')})\n`;
    }
    text += `━━━━━━━━━━━━━━━━\n`;
    text += `\n✅ *Present:*\n${present.map((d: any) => d.originalName || d.name).join(', ') || 'None'}\n`;
    text += `\n🕒 *Half Day:*\n${halfDay.map((d: any) => d.originalName || d.name).join(', ') || 'None'}\n`;
    text += `\n❌ *Absent:*\n${absent.map((d: any) => d.originalName || d.name).join(', ') || 'None'}\n`;
    return text;
  };

  const handleShareAttendance = () => {
    const text = generateShareText();
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, '_blank');
  };

  const handleCopyAttendance = () => {
    const text = generateShareText().replace(/\*/g, '');
    navigator.clipboard.writeText(text).then(() => customAlert('Attendance copied to clipboard!'));
  };

  return (
    <div className="p-1 md:p-6 space-y-2 md:space-y-4">
      {/* Combined Compact Header & Controls */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2 md:p-4">
        
        {/* Top Header Row */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
          <div className="flex items-center justify-between w-full md:w-auto">
            <div className="flex items-center gap-2 text-blue-700">
              <Calendar className="w-5 h-5 md:w-6 md:h-6" />
              <h1 className="text-base md:text-xl font-bold tracking-tight">Attendance Tracker</h1>
            </div>
            {/* Mobile Export Actions */}
            <div className="flex md:hidden gap-1">
              <button onClick={handleExportPDF} className="p-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded"><Download size={14} /></button>
              <button onClick={handleShareAttendance} className="p-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded"><Share2 size={14} /></button>
              <button onClick={handleCopyAttendance} className="p-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded text-xs leading-none">📋</button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setView('monthly')}
              className="flex-1 md:flex-none px-3 py-1.5 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
            >
              Monthly View
            </button>
            <button
              onClick={() => setView('yearly')}
              className="flex-1 md:flex-none px-3 py-1.5 bg-purple-100 text-purple-700 hover:bg-purple-200 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
            >
              Yearly View
            </button>
            {/* Desktop Export Actions */}
            <div className="hidden md:flex gap-1 border-l border-gray-200 pl-2">
              <button onClick={handleExportPDF} className="p-1.5 px-3 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"><Download size={14} /></button>
              <button onClick={handleShareAttendance} className="p-1.5 px-3 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg transition-colors" title="Share via WhatsApp"><Share2 size={14} /></button>
              <button onClick={handleCopyAttendance} className="p-1.5 px-3 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg transition-colors text-xs leading-none" title="Copy as text">📋</button>
            </div>
          </div>
        </div>

        <div className="h-px bg-gray-100 w-full mb-3" />

        {/* Date and Bulk Actions Row */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs font-medium text-gray-700">Date:</label>
             <input
              type="date"
              value={selectedDate}
              max={new Date().toISOString().split('T')[0]}
              onChange={(e) => onDateChange(e.target.value)}
              className="filter-chip flex-1 min-w-0 md:flex-none"
            />
            <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-2 py-1 md:hidden">
              <label className="text-[10px] uppercase text-gray-500 font-bold">IN</label>
              <input
                type="time"
                value={bulkInTime}
                onChange={e => setBulkInTime(e.target.value)}
                className="text-xs border-none outline-none focus:ring-0 p-0 w-[70px] bg-transparent"
              />
            </div>
            <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-2 py-1 md:hidden">
              <label className="text-[10px] uppercase text-gray-500 font-bold">OUT</label>
              <input
                type="time"
                value={bulkOutTime}
                onChange={e => setBulkOutTime(e.target.value)}
                className="text-xs border-none outline-none focus:ring-0 p-0 w-[70px] bg-transparent"
              />
            </div>
          </div>
          <div className="flex flex-row items-center gap-1 md:gap-2 w-full md:w-auto">
            <div className="hidden md:flex items-center gap-1 border border-gray-200 rounded-lg px-1 md:px-2 py-1">

              <label className="text-[10px] uppercase text-gray-500 font-bold">IN</label>
              <input 
                type="time" 
                value={bulkInTime} 
                onChange={e => setBulkInTime(e.target.value)} 
                className="text-xs border-none outline-none focus:ring-0 p-0 w-[55px] md:w-[70px] bg-transparent"
              />
            </div>
            <div className="hidden md:flex items-center gap-1 border border-gray-200 rounded-lg px-1 md:px-2 py-1">
              <label className="text-[10px] uppercase text-gray-500 font-bold">OUT</label>
              <input 
                type="time" 
                value={bulkOutTime} 
                onChange={e => setBulkOutTime(e.target.value)} 
                className="text-xs border-none outline-none focus:ring-0 p-0 w-[55px] md:w-[70px] bg-transparent"
              />
            </div>
            <div className="flex gap-1">
              <button
                onClick={async () => {
                  if (await customConfirm('Are you sure you want to mark ALL filtered staff as Present?')) {
                    onBulkUpdateAttendance(selectedDate, 'Present', undefined, bulkInTime, bulkOutTime);
                  }
                }}
                className="btn-premium btn-premium-success flex-1 !px-2 md:!px-3 !py-1 !min-h-0 text-xs flex justify-center"
                title="Mark All Present"
              >
                <Check size={14} />
                <span className="hidden md:inline ml-1">All Present</span>
              </button>
              <button
                onClick={() => setShowBulkHalfDayModal(true)}
                className="btn-premium btn-premium-warning flex-1 !px-2 md:!px-3 !py-1 !min-h-0 text-xs flex justify-center"
                title="Mark All Half Day"
              >
                <Clock size={14} />
                <span className="hidden md:inline ml-1">All Half Day</span>
              </button>
              <button
                onClick={async () => {
                  if (await customConfirm('Are you sure you want to mark ALL filtered staff as Absent?')) {
                    onBulkUpdateAttendance(selectedDate, 'Absent');
                  }
                }}
                className="btn-premium btn-premium-danger flex-1 !px-2 md:!px-3 !py-1 !min-h-0 text-xs flex justify-center"
                title="Mark All Absent"
              >
                <X size={14} />
                <span className="hidden md:inline ml-1">All Absent</span>
              </button>
            </div>
          </div>
        </div>

        {/* Sunday/Edit warnings */}
        {(isSelectedDateSunday || !canEditDate) && (
          <div className="flex flex-wrap gap-2 mb-3">
            {isSelectedDateSunday && (
              <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full">
                Sunday - ₹500 penalty
              </span>
            )}
            {!canEditDate && (
              <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs font-medium rounded-full">
                {actualRole === 'floor_supervisor' ? 'Zone Supervisors' : (actualRole === 'supervisor' ? 'Supervisors' : 'Managers')}: today only
              </span>
            )}
          </div>
        )}

        {/* Admin-only Search */}
        {userRole === 'admin' && (
          <div className="mb-3">
            <input
              type="text"
              placeholder="Search by staff name..."
              value={filters.search || ''}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="search-bar-premium"
            />
          </div>
        )}

        {view === 'daily' && (
          <div className="mb-4">
            <LateArrivalIntelligence attendance={attendance} staff={staff} />
          </div>
        )}

        {/* Filters Row - Collapsible */}
        <div className="mt-3 border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden">
          <button 
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="w-full flex items-center justify-between p-3.5 bg-gray-50 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          >
            <div className="flex items-center gap-2 text-[var(--text-primary)]">
              <Filter size={18} />
              <span className="font-semibold text-sm tracking-wide">Filter Options</span>
            </div>
            <div className="text-[var(--text-muted)] text-xs font-medium">
              {showFilters ? 'Hide Filters' : 'Show Filters'}
            </div>
          </button>

          {showFilters && (
            <div className="p-3 border-t border-gray-200 dark:border-white/10">
              <div className="flex flex-row items-center gap-2 md:gap-4 flex-wrap">
                <div className="flex items-center gap-1">
                  <select
                    value={filters.staffType}
                    onChange={(e) => setFilters({ ...filters, staffType: e.target.value as any })}
                    className="filter-chip"
                  >
                    <option value="all">All Staff</option>
                    <option value="full-time">Full-time</option>
                    <option value="part-time">Part-time</option>
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <select
                    value={filters.shift}
                    onChange={(e) => setFilters({ ...filters, shift: e.target.value as any })}
                    className="filter-chip"
                  >
                    <option value="All">All Shifts</option>
                    <option value="Morning">Morning</option>
                    <option value="Evening">Evening</option>
                    <option value="Both">Both</option>
                  </select>
                </div>
                {userRole === 'admin' && (
                  <div className="flex items-center gap-1">
                    <select
                      value={filters.location || 'All'}
                      onChange={(e) => setFilters({ ...filters, location: e.target.value })}
                      className="filter-chip"
                    >
                      <option value="All">All Branchs</option>
                      {availableLocations.map(loc => (
                        <option key={loc} value={loc}>{loc}</option>
                      ))}
                    </select>
                  </div>
                )}
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
      </div>

      {/* Mobile Card View (native-app feel) */}
      <div className="md:hidden space-y-2 pb-24">
        {combinedAttendanceData.length === 0 && (
          <EmptyState icon={<Users size={26} />} title="No staff to show" description="No one matches the current branch, zone or shift filter for this date." />
        )}
        {combinedAttendanceData.map((data: any) => {
          const inVal = individualTimes[data.id]?.inTime !== undefined ? individualTimes[data.id].inTime : (data.arrivalTime || '');
          const outVal = individualTimes[data.id]?.outTime !== undefined ? individualTimes[data.id].outTime : (data.leavingTime || '');
          return (
            <div
              key={data.id}
              className={`bg-white rounded-2xl border ${data.isUninformed ? 'border-orange-300 bg-orange-50' : 'border-gray-100'} shadow-sm p-3 active:scale-[0.995] transition-transform`}
            >
              {/* Header row */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0 flex-1">
                  <div 
                    className="flex items-center gap-2 cursor-pointer"
                    onClick={() => {
                      const s = staff.find(st => st.id === data.id);
                      if (s) setShowProfileDrawer({ staff: s, attendanceData: attendance.filter(a => a.staffId === s.id) });
                    }}
                  >
                    <span className="text-[10px] font-bold text-gray-400 w-5 shrink-0">{data.serialNo}</span>
                    {data.photo ? (
                      <button type="button" onClick={(e) => { e.stopPropagation(); setViewImageModal({ name: data.originalName || data.name, photo: data.photo }) }} className="shrink-0 cursor-pointer">
                        <img src={data.photo} alt={data.name} className="w-8 h-8 rounded-full object-cover border border-gray-200 shadow-sm" />
                      </button>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 font-bold text-xs flex items-center justify-center shrink-0 border border-indigo-100">
                        {(data.originalName || data.name).charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="font-semibold text-gray-900 text-[15px] truncate">{data.name}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1 pl-7">
                    {data.employeeCode && (
                      <span className="text-[10px] font-mono text-gray-500">{data.employeeCode}</span>
                    )}
                    <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded-full ${getLocationColor(data.location)}`}>
                      <MapPin size={9} className="mr-0.5 self-center" />{data.location}
                    </span>
                    {data.floor && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">F: {data.floor}</span>
                    )}
                    {data.shift !== '-' && (
                      <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded-full ${getShiftColor(data.shift)}`}>
                        {data.shift}
                      </span>
                    )}
                  </div>
                </div>
                <span className={`shrink-0 inline-flex px-2 py-1 text-[10px] font-bold rounded-full ${getStatusColor(data.status)}`}>
                  {data.status}
                </span>
              </div>

              {!data.isPartTime && (
                <>
                  {/* Time inputs */}
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <label className="flex items-center gap-1.5 bg-gray-50 rounded-lg px-2 py-1.5 border border-gray-100">
                      <Clock size={12} className="text-gray-400" />
                      <span className="text-[10px] font-bold text-gray-500">IN</span>
                      <input
                        type="time"
                        value={inVal}
                        onChange={(e) => handleIndividualTimeChange(data.id, 'inTime', e.target.value)}
                        onBlur={() => { if (data.hasRecord) confirmIndividualUpdate(data.id, data.status, data); }}
                        className="flex-1 bg-transparent text-xs outline-none focus:ring-0 border-none p-0 min-w-0"
                      />
                    </label>
                    <label className="flex items-center gap-1.5 bg-gray-50 rounded-lg px-2 py-1.5 border border-gray-100">
                      <Clock size={12} className="text-gray-400" />
                      <span className="text-[10px] font-bold text-gray-500">OUT</span>
                      <input
                        type="time"
                        value={outVal}
                        onChange={(e) => handleIndividualTimeChange(data.id, 'outTime', e.target.value)}
                        onBlur={() => { if (data.hasRecord) confirmIndividualUpdate(data.id, data.status, data); }}
                        className="flex-1 bg-transparent text-xs outline-none focus:ring-0 border-none p-0 min-w-0"
                      />
                    </label>
                  </div>

                  {/* Action buttons - native-app tap targets */}
                  <div className="grid grid-cols-5 gap-1.5">
                    <button
                      onClick={() => confirmIndividualUpdate(data.id, 'Present', data)}
                      disabled={!canEditDate}
                      className={`h-10 rounded-lg text-sm font-bold shadow-sm transition-all ${data.status === 'Present' ? 'bg-green-600 text-white' : 'bg-green-100 text-green-800 active:bg-green-200'}`}
                    >P</button>
                    <button
                      onClick={() => setShowHalfDayModal({ staffId: data.id, staffName: data.originalName || data.name })}
                      disabled={!canEditDate}
                      className={`h-10 rounded-lg text-sm font-bold shadow-sm transition-all ${data.status === 'Half Day' ? 'bg-yellow-500 text-white' : 'bg-yellow-100 text-yellow-800 active:bg-yellow-200'}`}
                    >H</button>
                    <button
                      onClick={() => confirmIndividualUpdate(data.id, 'Absent', data)}
                      disabled={!canEditDate}
                      className={`h-10 rounded-lg text-sm font-bold shadow-sm transition-all ${data.status === 'Absent' ? 'bg-red-600 text-white' : 'bg-red-100 text-red-800 active:bg-red-200'}`}
                    >A</button>
                    <button
                      onClick={async () => {
                        const record = getAttendanceForDate(data.id, selectedDate);
                        // If they aren't already absent, mark absent + uninformed
                        const newStatus = data.status !== 'Absent' ? 'Absent' : 'Absent';
                        const newVal = !record?.isUninformed;
                        
                        // Pass isUninformed flag via the new signature in updateAttendance
                        onUpdateAttendance(
                          data.id,
                          selectedDate,
                          newStatus,
                          false,
                          undefined,
                          undefined,
                          undefined,
                          undefined,
                          undefined,
                          undefined,
                          undefined,
                          undefined,
                          undefined,
                          undefined,
                          newVal
                        );
                      }}
                      className={`h-10 rounded-lg text-sm font-bold shadow-sm transition-all flex items-center justify-center gap-1 ${(data.status === 'Absent' && data.isUninformed) ? 'bg-orange-600 text-white' : 'bg-orange-100 text-orange-800 active:bg-orange-200'}`}
                      title="Uninformed Leave"
                    >UL</button>
                    <button
                      onClick={() => setShowLocationModal({
                        staffId: data.id,
                        staffName: data.originalName || data.name,
                        currentBranch: data.originalBranch || data.location
                      })}
                      disabled={!canEditDate}
                      className="h-10 rounded-lg bg-blue-100 text-blue-800 active:bg-blue-200 flex items-center justify-center shadow-sm"
                      title="Change location"
                    >
                      <MapPin size={16} />
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Attendance Table (desktop / tablet) */}
      <div className="table-container hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 md:px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">S.No</th>
                <th className="px-2 md:px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Emp Code</th>
                <th className="px-3 md:px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider sticky left-0 z-30 bg-gray-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Name</th>
                <th className="px-2 md:px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-2 md:px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">
                  <div className="flex items-center justify-center gap-2">
                    Actions
                    <button
                      onClick={() => setShowAllTimeInputs(!showAllTimeInputs)}
                      className={`hidden md:flex p-1 rounded-md transition-colors ${showAllTimeInputs ? 'bg-gray-300 text-gray-800' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                      title={showAllTimeInputs ? "Hide All Time Inputs" : "Show All Time Inputs"}
                    >
                      <Clock size={12} />
                    </button>
                  </div>
                </th>
                <th className="px-2 md:px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-2 md:px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Loc</th>
                <th className="px-2 md:px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Zone</th>
                <th className="px-2 md:px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Desg</th>
                <th className="px-2 md:px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Shift</th>
                <th className="px-2 md:px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Late By</th>
                <th className="px-2 md:px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Early Leave By</th>
                <th className="px-2 md:px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Hours Worked</th>
                <th className="px-2 md:px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Overtime</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {combinedAttendanceData.map((data: any) => (
                <tr key={data.id} className={`group hover:bg-gray-50 transition-colors ${data.isUninformed ? 'bg-orange-50 border-l-4 border-orange-500' : ''}`}>
                  <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-gray-900">{data.serialNo}</td>
                  <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-gray-500">{data.employeeCode || '-'}</td>
                  <td className="px-3 md:px-6 py-4 whitespace-nowrap sticky left-0 z-10 bg-white group-hover:bg-gray-50 transition-colors shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                    <div 
                      className="flex items-center gap-2.5 cursor-pointer"
                      onClick={() => {
                        const s = staff.find(st => st.id === data.id);
                        if (s) setShowProfileDrawer({ staff: s, attendanceData: attendance.filter(a => a.staffId === s.id) });
                      }}
                    >
                      {data.photo ? (
                        <button type="button" onClick={(e) => { e.stopPropagation(); setViewImageModal({ name: data.originalName || data.name, photo: data.photo }) }} className="shrink-0 cursor-pointer">
                          <img src={data.photo} alt={data.name} className="w-8 h-8 rounded-full object-cover border border-gray-200 shadow-sm hover:scale-105 transition-transform" />
                        </button>
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 font-bold text-xs flex items-center justify-center shrink-0 border border-indigo-100">
                          {(data.originalName || data.name).charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-medium text-gray-900">{data.name}</div>
                        <div className="text-xs text-gray-500">{data.type}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 md:px-6 py-4 whitespace-nowrap text-xs">
                    <span className={`px-2 py-1 rounded-full font-medium ${data.staffAccommodation === 'day_scholar' ? 'bg-blue-100 text-blue-700' : data.staffAccommodation === 'accommodation' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                      {data.staffAccommodation === 'day_scholar' ? 'Day Scholar' : data.staffAccommodation === 'accommodation' ? 'Accommodation' : '-'}
                    </span>
                  </td>
                  {/* Actions Column */}
                  <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {!data.isPartTime && (
                      <div className="attendance-actions flex flex-col 2xl:flex-row gap-2">
                        {/* Time Inputs (Toggleable) */}
                        {(showAllTimeInputs || expandedTimeInputs.has(data.id)) && (
                          <div className="flex flex-row items-center gap-1">
                            <div className="flex items-center gap-1 border border-gray-200 rounded px-1 bg-white shrink-0 animate-in fade-in slide-in-from-left-2 duration-200">
                              <span className="text-[9px] text-gray-500 font-bold">IN</span>
                              <input 
                                type="time" 
                                value={individualTimes[data.id]?.inTime !== undefined ? individualTimes[data.id].inTime : (data.arrivalTime || '')}
                                onChange={(e) => handleIndividualTimeChange(data.id, 'inTime', e.target.value)}
                                onBlur={() => {
                                  if (data.hasRecord) confirmIndividualUpdate(data.id, data.status, data);
                                }}
                                className="text-[10px] md:text-xs border-none p-0 outline-none focus:ring-0 w-[55px]"
                              />
                            </div>
                            <div className="flex items-center gap-1 border border-gray-200 rounded px-1 bg-white shrink-0 animate-in fade-in slide-in-from-left-2 duration-200">
                              <span className="text-[9px] text-gray-500 font-bold">OUT</span>
                              <input 
                                type="time" 
                                value={individualTimes[data.id]?.outTime !== undefined ? individualTimes[data.id].outTime : (data.leavingTime || '')}
                                onChange={(e) => handleIndividualTimeChange(data.id, 'outTime', e.target.value)}
                                onBlur={() => {
                                  if (data.hasRecord) confirmIndividualUpdate(data.id, data.status, data);
                                }}
                                className="text-[10px] md:text-xs border-none p-0 outline-none focus:ring-0 w-[55px]"
                              />
                            </div>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex flex-row items-center gap-1">
                          <button
                            onClick={() => confirmIndividualUpdate(data.id, 'Present', data)}
                            className={`w-7 h-7 md:w-8 md:h-8 text-xs font-bold rounded shadow-sm flex items-center justify-center shrink-0 ${data.status === 'Present'
                              ? 'bg-green-600 text-white ring-2 ring-green-600 ring-offset-1'
                              : 'bg-green-100 text-green-700 hover:bg-green-200 border border-green-200'
                              } transition-all duration-200`}
                            disabled={!canEditDate}
                          >
                            P
                          </button>
                          <button
                            onClick={() => setShowHalfDayModal({ staffId: data.id, staffName: data.originalName || data.name })}
                            className={`w-7 h-7 md:w-8 md:h-8 text-xs font-bold rounded shadow-sm flex items-center justify-center shrink-0 ${data.status === 'Half Day'
                              ? 'bg-yellow-500 text-white ring-2 ring-yellow-500 ring-offset-1'
                              : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200 border border-yellow-200'
                              } transition-all duration-200`}
                            disabled={!canEditDate}
                          >
                            H
                          </button>
                          <button
                            onClick={() => confirmIndividualUpdate(data.id, 'Absent', data)}
                            className={`w-7 h-7 md:w-8 md:h-8 text-xs font-bold rounded shadow-sm flex items-center justify-center shrink-0 ${data.status === 'Absent'
                              ? 'bg-red-600 text-white ring-2 ring-red-600 ring-offset-1'
                              : 'bg-red-100 text-red-700 hover:bg-red-200 border border-red-200'
                              } transition-all duration-200`}
                            disabled={!canEditDate}
                          >
                            A
                          </button>
                          <button
                            onClick={async () => {
                              const record = getAttendanceForDate(data.id, selectedDate);
                              const newVal = !record?.isUninformed;
                              onUpdateAttendance(
                                data.id, selectedDate, 'Absent', false, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, newVal
                              );
                            }}
                            className={`w-7 h-7 md:w-8 md:h-8 text-[10px] md:text-xs font-bold rounded shadow-sm flex items-center justify-center shrink-0 ${
                              (data.status === 'Absent' && data.isUninformed)
                                ? 'bg-orange-600 text-white ring-2 ring-orange-600 ring-offset-1'
                                : 'bg-orange-100 text-orange-700 hover:bg-orange-200 border border-orange-200'
                            } transition-all duration-200`}
                            title={data.isUninformed ? 'Unmarked as uninformed leave' : 'Mark as uninformed leave'}
                            disabled={!canEditDate}
                          >
                            UL
                          </button>
                          
                          <div className="flex gap-1 ml-1">
                            <button
                              onClick={() => setShowLocationModal({
                                staffId: data.id,
                                staffName: data.originalName || data.name,
                                currentBranch: data.originalBranch || data.location
                              })}
                              className="w-7 h-7 md:w-8 md:h-8 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors flex items-center justify-center shadow-sm shrink-0"
                              title="Change location"
                              disabled={!canEditDate}
                            >
                              <MapPin size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </td>
                  {/* Status Column */}
                  <td className="px-3 md:px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(data.status)}`}>
                        {data.status}
                      </span>
                      {data.isUninformed && (
                        <span className="inline-flex px-1.5 py-0.5 text-[10px] font-bold rounded bg-orange-500 text-white" title="Uninformed/Unapproved Leave">
                          ⚠ UI
                        </span>
                      )}
                      {data.status === 'Absent' && isSelectedDateSunday && !data.isPartTime && (
                        <span className="text-red-600 text-xs">⚠️</span>
                      )}
                    </div>
                  </td>
                  {/* Branch Column */}
                  <td className="px-3 md:px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getLocationColor(data.location)}`}>
                        {data.location}
                      </span>
                      {!data.isPartTime && data.location !== data.originalBranch && (
                        <span className="text-xs text-orange-600">(temp)</span>
                      )}
                    </div>
                  </td>
                  {/* Zone Column */}
                  <td className="px-3 md:px-6 py-4 whitespace-nowrap text-xs text-gray-600">
                    {data.floor || '-'}
                  </td>
                  {/* Designation Column */}
                  <td className="px-3 md:px-6 py-4 whitespace-nowrap text-xs text-gray-600">
                    {data.designation || '-'}
                  </td>
                  {/* Shift Column */}
                  <td className="px-3 md:px-6 py-4 whitespace-nowrap">
                    {data.shift !== '-' ? (
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getShiftColor(data.shift)}`}>
                        {data.shift}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                   {/* Late By & Early Leave By Columns */}
                  {(() => {
                    const staffMember = staff.find(s => s.id === data.id);
                    let ruleDetails = data.appliedRuleDetails;
                    if (!ruleDetails && staffMember) {
                      const currentLocConfig = locationConfigs.find(lc => lc.locationName === (data.location || staffMember.location));
                      const resolved = resolveActiveRule(staffMember, currentLocConfig, designations, locationDesignationConfigs, globalKioskSettings);
                      ruleDetails = resolved.rules;
                    }

                    const shiftKey = (data.shift !== '-' ? data.shift : (staffMember?.shift || 'Both')) as keyof typeof DEFAULT_SHIFT_WINDOWS;
                    const baseWin = (globalShiftWindows as any)[shiftKey] || DEFAULT_SHIFT_WINDOWS[shiftKey];
                    const startVal = ruleDetails?.shiftStart || baseWin.start;
                    const endVal = ruleDetails?.shiftEnd || baseWin.end;
                    const graceLate = ruleDetails?.graceLateMin !== undefined ? ruleDetails.graceLateMin : baseWin.graceLateMin;
                    const graceEarly = ruleDetails?.graceEarlyMin !== undefined ? ruleDetails.graceEarlyMin : baseWin.graceEarlyMin;

                    let lateMins = 0;
                    if (data.arrivalTime) {
                      const arr = parseHHMM(data.arrivalTime);
                      const start = parseHHMM(startVal);
                      if (arr !== null && start !== null) {
                        lateMins = Math.max(0, arr - start);
                      }
                    }

                    let earlyMins = 0;
                    if (data.leavingTime) {
                      const lev = parseHHMM(data.leavingTime);
                      const end = parseHHMM(endVal);
                      if (lev !== null && end !== null) {
                        earlyMins = Math.max(0, end - lev);
                      }
                    }

                    return (
                      <>
                        <td className="px-3 md:px-6 py-4 whitespace-nowrap text-xs">
                          {lateMins > 0 ? (
                            <span className={lateMins > graceLate ? 'text-red-500 font-bold' : 'text-gray-600 font-medium'}>
                              {lateMins} min
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-3 md:px-6 py-4 whitespace-nowrap text-xs">
                          {earlyMins > 0 ? (
                            <span className={earlyMins > graceEarly ? 'text-red-500 font-bold' : 'text-gray-600 font-medium'}>
                              {earlyMins} min
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-3 md:px-6 py-4 whitespace-nowrap text-xs font-semibold text-gray-800">
                          {data.totalHours > 0 ? `${data.totalHours}h` : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-3 md:px-6 py-4 whitespace-nowrap text-xs">
                          {data.overtimeHours > 0 ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold border border-amber-200 text-[10px]">
                              +{data.overtimeHours}h OT
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      </>
                    );
                  })()}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Half Day Modal */}
      {showHalfDayModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 md:p-4" onClick={() => setShowHalfDayModal(null)}>
          <div className="bg-white rounded-2xl p-4 md:p-6 w-full max-w-xs md:max-w-md mx-2 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base md:text-lg font-bold text-gray-800 mb-3 md:mb-4 flex items-center gap-2">
              <Clock className="text-yellow-600" size={18} />
              <span className="truncate">Half Day - {showHalfDayModal.staffName}</span>
            </h3>
            <p className="text-sm md:text-base text-gray-600 mb-3 md:mb-4">Select which half of the day:</p>
            <div className="space-y-2 md:space-y-3 mb-4 md:mb-6">
              <label className={`flex items-center p-3 border-2 rounded-xl cursor-pointer transition-all ${
                selectedShift === 'Morning' ? 'border-orange-500 bg-orange-50/60 shadow-sm' : 'border-gray-200 hover:border-gray-300'
              }`}>
                <input
                  type="radio"
                  name="halfDayShift"
                  value="Morning"
                  checked={selectedShift === 'Morning'}
                  onChange={(e) => setSelectedShift(e.target.value as 'Morning')}
                  className="sr-only"
                />
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mr-3 shrink-0 transition-colors ${
                  selectedShift === 'Morning' ? 'border-orange-500 bg-white' : 'border-gray-300 bg-white'
                }`}>
                  {selectedShift === 'Morning' && (
                    <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                  )}
                </div>
                <span className={`text-sm md:text-base font-bold ${selectedShift === 'Morning' ? 'text-orange-700' : 'text-gray-700'}`}>
                  Morning
                </span>
              </label>

              <label className={`flex items-center p-3 border-2 rounded-xl cursor-pointer transition-all ${
                selectedShift === 'Evening' ? 'border-orange-500 bg-orange-50/60 shadow-sm' : 'border-gray-200 hover:border-gray-300'
              }`}>
                <input
                  type="radio"
                  name="halfDayShift"
                  value="Evening"
                  checked={selectedShift === 'Evening'}
                  onChange={(e) => setSelectedShift(e.target.value as 'Evening')}
                  className="sr-only"
                />
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mr-3 shrink-0 transition-colors ${
                  selectedShift === 'Evening' ? 'border-orange-500 bg-white' : 'border-gray-300 bg-white'
                }`}>
                  {selectedShift === 'Evening' && (
                    <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                  )}
                </div>
                <span className={`text-sm md:text-base font-bold ${selectedShift === 'Evening' ? 'text-orange-700' : 'text-gray-700'}`}>
                  Evening
                </span>
              </label>
            </div>
            {/* IN/OUT time for half day */}
            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">IN Time</label>
                <input
                  type="time"
                  value={individualTimes[showHalfDayModal.staffId]?.inTime || ''}
                  onChange={(e) => handleIndividualTimeChange(showHalfDayModal.staffId, 'inTime', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-yellow-400"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">OUT Time</label>
                <input
                  type="time"
                  value={individualTimes[showHalfDayModal.staffId]?.outTime || ''}
                  onChange={(e) => handleIndividualTimeChange(showHalfDayModal.staffId, 'outTime', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-yellow-400"
                />
              </div>
            </div>
            <div className="flex flex-col md:flex-row gap-2 md:gap-3">
              <button
                onClick={handleHalfDayConfirm}
                className="w-full px-4 py-2.5 md:py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors text-sm md:text-base font-medium"
              >
                Confirm
              </button>
              <button
                onClick={() => setShowHalfDayModal(null)}
                className="w-full px-4 py-2.5 md:py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm md:text-base font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Branch Change Modal */}
      {showLocationModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 md:p-4" onClick={() => setShowLocationModal(null)}>
          <div className="bg-white rounded-2xl p-4 md:p-6 w-full max-w-xs md:max-w-md mx-2 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base md:text-lg font-bold text-gray-800 mb-3 md:mb-4 flex items-center gap-2">
              <MapPin className="text-blue-600" size={18} />
              <span className="truncate">Change Branch - {showLocationModal.staffName}</span>
            </h3>
            <p className="text-sm md:text-base text-gray-600 mb-3 md:mb-4">
              Current: <span className="font-medium">{showLocationModal.currentLocation || showLocationModal.currentBranch || '-'}</span><br />
              <span className="text-xs md:text-sm">Select for {new Date(selectedDate).toLocaleDateString()}:</span>
            </p>
            <div className="space-y-2 md:space-y-3 mb-4 md:mb-6">
              {availableLocations.map(loc => (
                <label key={loc} className={`flex items-center p-3 border-2 rounded-xl cursor-pointer transition-all ${
                  selectedBranch === loc ? 'border-blue-500 bg-blue-50/60 shadow-sm' : 'border-gray-200 hover:border-gray-300'
                }`}>
                  <input
                    type="radio"
                    name="locationOption"
                    value={loc}
                    checked={selectedBranch === loc}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                    className="sr-only"
                  />
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mr-3 shrink-0 transition-colors ${
                    selectedBranch === loc ? 'border-blue-500 bg-white' : 'border-gray-300 bg-white'
                  }`}>
                    {selectedBranch === loc && (
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    )}
                  </div>
                  <span className={`text-sm md:text-base font-semibold ${selectedBranch === loc ? 'text-blue-800' : 'text-gray-700'}`}>{loc}</span>
                </label>
              ))}
            </div>
            <div className="flex flex-col md:flex-row gap-2 md:gap-3">
              <button
                onClick={handleLocationChange}
                className="w-full px-4 py-2.5 md:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm md:text-base font-medium"
              >
                Change
              </button>
              <button
                onClick={() => setShowLocationModal(null)}
                className="w-full px-4 py-2.5 md:py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm md:text-base font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Upload Modal */}
      {showBulkUpload && (
        <BulkAttendanceUpload
          staff={staff}
          onImport={async (records) => {
            await attendanceService.bulkUpsert(records);
            // Trigger a page reload to refresh attendance data
            window.location.reload();
          }}
          onClose={() => setShowBulkUpload(false)}
        />
      )}

      {/* Bulk Half Day Modal */}
      {showBulkHalfDayModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 md:p-4" onClick={() => setShowBulkHalfDayModal(false)}>
          <div className="bg-white rounded-2xl p-4 md:p-6 w-full max-w-xs md:max-w-md mx-2 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base md:text-lg font-bold text-gray-800 mb-3 md:mb-4 flex items-center gap-2">
              <Clock className="text-yellow-600" size={18} />
              <span>Bulk Half Day — All Staff</span>
            </h3>
            <p className="text-sm md:text-base text-gray-600 mb-3 md:mb-4">
              Mark <strong>all {getFilteredStaff().length} staff</strong> as Half Day for{' '}
              <strong>{new Date(selectedDate).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })}</strong>.
              Select which half:
            </p>
            <div className="space-y-2 md:space-y-3 mb-4 md:mb-6">
              <label className={`flex items-center p-3 md:p-4 border-2 rounded-xl cursor-pointer transition-all ${
                bulkHalfDayShift === 'Morning'
                  ? 'border-yellow-500 bg-yellow-50 shadow-sm'
                  : 'border-gray-200 hover:border-yellow-300 hover:bg-yellow-50/50'
              }`}>
                <input
                  type="radio"
                  value="Morning"
                  checked={bulkHalfDayShift === 'Morning'}
                  onChange={(e) => setBulkHalfDayShift(e.target.value as 'Morning')}
                  className="mr-3 w-4 h-4 accent-yellow-600"
                />
                <div>
                  <span className="text-sm md:text-base font-semibold text-gray-800">☀️ Morning Half</span>
                  <p className="text-xs text-gray-500 mt-0.5">Staff worked morning shift only</p>
                </div>
              </label>
              <label className={`flex items-center p-3 md:p-4 border-2 rounded-xl cursor-pointer transition-all ${
                bulkHalfDayShift === 'Evening'
                  ? 'border-yellow-500 bg-yellow-50 shadow-sm'
                  : 'border-gray-200 hover:border-yellow-300 hover:bg-yellow-50/50'
              }`}>
                <input
                  type="radio"
                  value="Evening"
                  checked={bulkHalfDayShift === 'Evening'}
                  onChange={(e) => setBulkHalfDayShift(e.target.value as 'Evening')}
                  className="mr-3 w-4 h-4 accent-yellow-600"
                />
                <div>
                  <span className="text-sm md:text-base font-semibold text-gray-800">🌙 Evening Half</span>
                  <p className="text-xs text-gray-500 mt-0.5">Staff worked evening shift only</p>
                </div>
              </label>
            </div>
            <div className="flex flex-col md:flex-row gap-2 md:gap-3">
              <button
                onClick={async () => {
                  if (await customConfirm(`Are you sure you want to mark ALL filtered staff as Half Day (${bulkHalfDayShift})?`)) {
                    onBulkUpdateAttendance(selectedDate, 'Half Day', bulkHalfDayShift, bulkInTime, bulkOutTime);
                    setShowBulkHalfDayModal(false);
                  }
                }}
                className="w-full px-4 py-2.5 md:py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors text-sm md:text-base font-semibold flex items-center justify-center gap-2"
              >
                <Check size={16} />
                Mark All Half Day ({bulkHalfDayShift})
              </button>
              <button
                onClick={() => setShowBulkHalfDayModal(false)}
                className="w-full px-4 py-2.5 md:py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm md:text-base font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {/* View Full Image Modal */}
      {viewImageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setViewImageModal(null)}>
          <div className="relative max-w-lg w-full bg-white dark:bg-slate-900 rounded-2xl overflow-hidden shadow-2xl p-4 flex flex-col items-center" onClick={e => e.stopPropagation()}>
            <div className="w-full flex items-center justify-between pb-3 border-b border-gray-200 dark:border-slate-800">
              <h3 className="font-bold text-base text-gray-900 dark:text-white">{viewImageModal.name}</h3>
              <button onClick={() => setViewImageModal(null)} className="p-1 rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="py-4">
              <img src={viewImageModal.photo} alt={viewImageModal.name} className="max-w-full max-h-[70vh] rounded-xl object-contain shadow-md" />
            </div>
          </div>
        </div>
      )}
      {/* Profile Drawer */}
      {showProfileDrawer && (
        <AttendanceProfileDrawer 
          staff={showProfileDrawer.staff} 
          attendanceData={showProfileDrawer.attendanceData} 
          onClose={() => setShowProfileDrawer(null)} 
        />
      )}
    </div>
  );
};

export default AttendanceTracker;