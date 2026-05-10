import React, { useState } from 'react';
import { Staff, Attendance, AttendanceFilter } from '../types';
import { Calendar, Download, Check, X, Filter, MapPin, Clock, Upload, Share2, AlertTriangle } from 'lucide-react';
import { isSunday } from '../utils/salaryCalculations';
import { exportAttendancePDF } from '../utils/exportUtils';
import BulkAttendanceUpload from './BulkAttendanceUpload';
import { attendanceService } from '../services/attendanceService';
import YearlyAttendanceSummary from './YearlyAttendanceSummary';

interface AttendanceTrackerProps {
  staff: Staff[];
  attendance: Attendance[];
  selectedDate: string;
  onDateChange: (date: string) => void;
  onUpdateAttendance: (staffId: string, date: string, status: 'Present' | 'Half Day' | 'Absent', isPartTime?: boolean, staffName?: string, shift?: 'Morning' | 'Evening' | 'Both', location?: string, salary?: number, salaryOverride?: boolean) => void;
  onBulkUpdateAttendance: (date: string, status: 'Present' | 'Absent') => void;
  userRole: 'admin' | 'manager';
}

const AttendanceTracker: React.FC<AttendanceTrackerProps> = ({
  staff,
  attendance,
  selectedDate,
  onDateChange,
  onUpdateAttendance,
  onBulkUpdateAttendance,
  userRole
}) => {
  const [view, setView] = useState<'daily' | 'monthly' | 'yearly'>('daily');
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
  const [showHalfDayModal, setShowHalfDayModal] = useState<{ staffId: string, staffName: string } | null>(null);
  const [showLocationModal, setShowLocationModal] = useState<{ staffId: string, staffName: string, currentLocation: string } | null>(null);
  const [selectedShift, setSelectedShift] = useState<'Morning' | 'Evening'>('Morning');
  const [selectedLocation, setSelectedLocation] = useState<string>('Big Shop');
  const [availableLocations, setAvailableLocations] = useState<string[]>(['Big Shop', 'Small Shop', 'Godown']);
  const [showBulkUpload, setShowBulkUpload] = useState(false);

  // Load available locations from Supabase via locationService
  React.useEffect(() => {
    const fetchLocations = async () => {
      const { locationService } = await import('../services/locationService');
      const locs = await locationService.getLocations();
      if (locs.length > 0) {
        setAvailableLocations(locs.map(loc => loc.name));
      }
    };
    fetchLocations();
  }, []);

  const activeStaff = staff.filter(member => member.isActive);
  const today = new Date().toISOString().split('T')[0];
  const canEditDate = userRole === 'admin' || selectedDate === today;

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
      onUpdateAttendance(
        showHalfDayModal.staffId,
        selectedDate,
        'Half Day',
        false,
        undefined,
        selectedShift
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
        attendanceRecord?.status || 'Present',
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

  const handleExportPDF = () => {
    if (userRole === 'admin') {
      exportAttendancePDF(staff, attendance, selectedDate);
    }
  };

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

        if (status === 'Present') {
          present++;
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
                <option value="All">All Locations</option>
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

        <div className="table-container">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-2 md:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">S.No</th>
                  <th className="px-2 md:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 z-10 bg-gray-50">Name</th>
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
                      <td className="px-2 md:px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 z-10 bg-white">{member.name}</td>
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
                                  status === 'Half Day' ? 'bg-yellow-500 text-white' :
                                    status === 'Absent' ? (isDateSunday ? 'bg-red-700 text-white' : 'bg-red-500 text-white') : 'bg-gray-200 text-gray-500'
                              }`}>
                              {isUninformed ? '⚠' : status === 'Present' ? 'P' : status === 'Half Day' ? halfCode : 'A'}
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
                <option value="All">All Locations</option>
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
          <div className="text-center py-12 text-gray-400">Please select a staff member to view yearly attendance.</div>
        ) : (
          <div className="space-y-5">
            <YearlyAttendanceSummary
              attendance={attendance}
              staffId={selectedStaff.id}
              year={year}
              title={`Year ${year} — ${selectedStaff.name}`}
            />
            {Array.from({ length: 12 }, (_, mi) => {
              const summary = computeMonthSummary(selectedStaff.id, mi);
              const monthName = new Date(year, mi).toLocaleString('default', { month: 'long' });
              const days = Array.from({ length: summary.daysInMonth }, (_, d) => d + 1);
              return (
                <div key={mi} className="border border-gray-100 rounded-lg p-3">
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

  // Only show full-time staff in the attendance table (part-time details shown in Salary page)
  const combinedAttendanceData: any[] = [];

  // Add full-time staff only
  filteredStaff.forEach((member, index) => {
    const attendanceRecord = getAttendanceForDate(member.id, selectedDate);
    const displayLocation = attendanceRecord?.location || member.location;
    const displayName = attendanceRecord?.shift ? `${member.name} (${attendanceRecord.shift})` : member.name;

    combinedAttendanceData.push({
      id: member.id,
      serialNo: index + 1,
      name: displayName,
      location: displayLocation,
      floor: member.floor || '',
      designation: member.designation || '',
      type: member.type,
      staffAccommodation: member.staffAccommodation,
      shift: attendanceRecord?.shift || '-',
      status: attendanceRecord?.status || 'Absent',
      isPartTime: false,
      isUninformed: attendanceRecord?.isUninformed || false,
      originalName: member.name,
      originalLocation: member.location
    });
  });

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
    navigator.clipboard.writeText(text).then(() => alert('Attendance copied to clipboard!'));
  };

  return (
    <div className="p-1 md:p-6 space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-3 md:p-6 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Calendar size={20} className="md:w-8 md:h-8" />
            <h1 className="text-lg md:text-3xl font-bold">Attendance Tracker</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setView('monthly')}
              className="flex-1 sm:flex-none px-2 md:px-4 py-1.5 md:py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors text-xs md:text-sm whitespace-nowrap"
            >
              Monthly View
            </button>
            <button
              onClick={() => setView('yearly')}
              className="flex-1 sm:flex-none px-2 md:px-4 py-1.5 md:py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors text-xs md:text-sm whitespace-nowrap"
            >
              Yearly View
            </button>
            <button
              onClick={handleExportPDF}
              className="flex items-center justify-center gap-1 px-2 md:px-4 py-1.5 md:py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors text-xs md:text-sm"
            >
              <Download size={14} />
            </button>
            <button
              onClick={handleShareAttendance}
              className="flex items-center justify-center gap-1 px-2 md:px-4 py-1.5 md:py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors text-xs md:text-sm"
              title="Share via WhatsApp"
            >
              <Share2 size={14} />
            </button>
            <button
              onClick={handleCopyAttendance}
              className="flex items-center justify-center gap-1 px-2 md:px-4 py-1.5 md:py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors text-xs md:text-sm"
              title="Copy as text"
            >
              📋
            </button>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 md:p-6">
        {/* Date and Bulk Actions Row */}
        <div className="flex flex-row items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-700 hidden sm:inline">Date:</label>
             <input
              type="date"
              value={selectedDate}
              max={new Date().toISOString().split('T')[0]}
              onChange={(e) => onDateChange(e.target.value)}
              className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onBulkUpdateAttendance(selectedDate, 'Present')}
              className="flex items-center gap-1 px-2 md:px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-xs md:text-sm"
            >
              <Check size={14} />
              <span className="hidden xs:inline">All Present</span>
            </button>
            <button
              onClick={() => onBulkUpdateAttendance(selectedDate, 'Absent')}
              className="flex items-center gap-1 px-2 md:px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-xs md:text-sm"
            >
              <X size={14} />
              <span className="hidden xs:inline">All Absent</span>
            </button>
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
                Managers: today only
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
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>
        )}

        {/* Filters Row - All in single row */}
        <div className="flex flex-row items-center gap-2 md:gap-4 flex-wrap">
          <div className="flex items-center gap-1">
            <Filter size={14} className="text-gray-500" />
            <select
              value={filters.staffType}
              onChange={(e) => setFilters({ ...filters, staffType: e.target.value as any })}
              className="px-2 py-1 text-xs md:text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
              className="px-2 py-1 text-xs md:text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                className="px-2 py-1 text-xs md:text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="All">All Locations</option>
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
              className="px-2 py-1 text-xs md:text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
              className="px-2 py-1 text-xs md:text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
              className="px-2 py-1 text-xs md:text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="All">All Types</option>
              <option value="day_scholar">Day Scholar</option>
              <option value="accommodation">Accommodation</option>
            </select>
          </div>
        </div>
      </div>

      {/* Attendance Table */}
      <div className="table-container">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 md:px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">S.No</th>
                <th className="px-3 md:px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider sticky left-0 z-30 bg-gray-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Name</th>
                <th className="px-2 md:px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-2 md:px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                <th className="px-2 md:px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-2 md:px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Loc</th>
                <th className="px-2 md:px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Floor</th>
                <th className="px-2 md:px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Desg</th>
                <th className="px-2 md:px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Shift</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {combinedAttendanceData.map((data: any) => (
                <tr key={data.id} className={`group hover:bg-gray-50 transition-colors ${data.isUninformed ? 'bg-orange-50 border-l-4 border-orange-500' : ''}`}>
                  <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-gray-900">{data.serialNo}</td>
                  <td className="px-3 md:px-6 py-4 whitespace-nowrap sticky left-0 z-10 bg-white group-hover:bg-gray-50 transition-colors shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{data.name}</div>
                      <div className="text-sm text-gray-500">{data.type}</div>
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
                      <div className="attendance-actions flex gap-1 md:gap-2">
                        <button
                          onClick={() => onUpdateAttendance(data.id, selectedDate, 'Present')}
                          className={`w-7 h-7 md:w-auto md:px-3 md:py-1 text-xs font-bold rounded shadow-sm flex items-center justify-center ${data.status === 'Present'
                            ? 'bg-green-600 text-white ring-2 ring-green-600 ring-offset-1'
                            : 'bg-green-200 text-green-900 hover:bg-green-300 border border-green-300'
                            } transition-all duration-200`}
                          disabled={!canEditDate}
                        >
                          P
                        </button>
                        <button
                          onClick={() => setShowHalfDayModal({ staffId: data.id, staffName: data.originalName || data.name })}
                          className={`w-7 h-7 md:w-auto md:px-3 md:py-1 text-xs font-bold rounded shadow-sm flex items-center justify-center ${data.status === 'Half Day'
                            ? 'bg-yellow-500 text-white ring-2 ring-yellow-500 ring-offset-1'
                            : 'bg-yellow-200 text-yellow-900 hover:bg-yellow-300 border border-yellow-300'
                            } transition-all duration-200`}
                          disabled={!canEditDate}
                        >
                          H
                        </button>
                        <button
                          onClick={() => onUpdateAttendance(data.id, selectedDate, 'Absent')}
                          className={`w-7 h-7 md:w-auto md:px-3 md:py-1 text-xs font-bold rounded shadow-sm flex items-center justify-center ${data.status === 'Absent'
                            ? 'bg-red-600 text-white ring-2 ring-red-600 ring-offset-1'
                            : 'bg-red-200 text-red-900 hover:bg-red-300 border border-red-300'
                            } transition-all duration-200`}
                          disabled={!canEditDate}
                        >
                          A
                        </button>
                        {data.status === 'Absent' && (
                          <button
                            onClick={async () => {
                              const record = getAttendanceForDate(data.id, selectedDate);
                              if (record) {
                                const newVal = !record.isUninformed;
                                await attendanceService.upsert({
                                  staffId: data.id,
                                  date: selectedDate,
                                  status: 'Absent',
                                  attendanceValue: 0,
                                  isUninformed: newVal
                                });
                                window.location.reload();
                              }
                            }}
                            className={`w-7 h-7 md:w-auto md:px-2 md:py-1 text-xs font-bold rounded shadow-sm flex items-center justify-center ${
                              data.isUninformed
                                ? 'bg-orange-600 text-white ring-2 ring-orange-600 ring-offset-1'
                                : 'bg-orange-200 text-orange-900 hover:bg-orange-300 border border-orange-300'
                            } transition-all duration-200`}
                            title={data.isUninformed ? 'Marked as uninformed leave' : 'Mark as uninformed leave'}
                            disabled={!canEditDate}
                          >
                            <AlertTriangle size={12} />
                          </button>
                        )}
                        <button
                          onClick={() => setShowLocationModal({
                            staffId: data.id,
                            staffName: data.originalName || data.name,
                            currentLocation: data.originalLocation || data.location
                          })}
                          className="w-7 h-7 md:w-auto md:px-2 md:py-1 text-xs font-bold rounded bg-blue-100 text-blue-900 hover:bg-blue-200 border border-blue-200 transition-colors flex items-center justify-center shadow-sm"
                          title="Change location"
                          disabled={!canEditDate}
                        >
                          <MapPin size={14} />
                        </button>
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
                  {/* Location Column */}
                  <td className="px-3 md:px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getLocationColor(data.location)}`}>
                        {data.location}
                      </span>
                      {!data.isPartTime && data.location !== data.originalLocation && (
                        <span className="text-xs text-orange-600">(temp)</span>
                      )}
                    </div>
                  </td>
                  {/* Floor Column */}
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Half Day Modal */}
      {showHalfDayModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 md:p-4">
          <div className="bg-white rounded-xl p-4 md:p-6 w-full max-w-xs md:max-w-md mx-2">
            <h3 className="text-base md:text-lg font-bold text-gray-800 mb-3 md:mb-4 flex items-center gap-2">
              <Clock className="text-yellow-600" size={18} />
              <span className="truncate">Half Day - {showHalfDayModal.staffName}</span>
            </h3>
            <p className="text-sm md:text-base text-gray-600 mb-3 md:mb-4">Select which half of the day:</p>
            <div className="space-y-2 md:space-y-3 mb-4 md:mb-6">
              <label className="flex items-center p-2 md:p-3 border rounded-lg cursor-pointer hover:bg-yellow-50 transition-colors">
                <input
                  type="radio"
                  value="Morning"
                  checked={selectedShift === 'Morning'}
                  onChange={(e) => setSelectedShift(e.target.value as 'Morning')}
                  className="mr-3 w-4 h-4"
                />
                <span className="text-sm md:text-base font-medium">Morning</span>
              </label>
              <label className="flex items-center p-2 md:p-3 border rounded-lg cursor-pointer hover:bg-yellow-50 transition-colors">
                <input
                  type="radio"
                  value="Evening"
                  checked={selectedShift === 'Evening'}
                  onChange={(e) => setSelectedShift(e.target.value as 'Evening')}
                  className="mr-3 w-4 h-4"
                />
                <span className="text-sm md:text-base font-medium">Evening</span>
              </label>
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

      {/* Location Change Modal */}
      {showLocationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 md:p-4">
          <div className="bg-white rounded-xl p-4 md:p-6 w-full max-w-xs md:max-w-md mx-2">
            <h3 className="text-base md:text-lg font-bold text-gray-800 mb-3 md:mb-4 flex items-center gap-2">
              <MapPin className="text-blue-600" size={18} />
              <span className="truncate">Change Location - {showLocationModal.staffName}</span>
            </h3>
            <p className="text-sm md:text-base text-gray-600 mb-3 md:mb-4">
              Current: <span className="font-medium">{showLocationModal.currentLocation}</span><br />
              <span className="text-xs md:text-sm">Select for {new Date(selectedDate).toLocaleDateString()}:</span>
            </p>
            <div className="space-y-2 md:space-y-3 mb-4 md:mb-6">
              {availableLocations.map(loc => (
                <label key={loc} className="flex items-center p-2 md:p-3 border rounded-lg cursor-pointer hover:bg-blue-50 transition-colors">
                  <input
                    type="radio"
                    value={loc}
                    checked={selectedLocation === loc}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                    className="mr-3 w-4 h-4"
                  />
                  <span className="text-sm md:text-base font-medium">{loc}</span>
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
    </div>
  );
};

export default AttendanceTracker;