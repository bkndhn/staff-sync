import React, { useState, useRef, useEffect } from 'react';
import { Attendance, PartTimeSalaryDetail, Staff } from '../types';
import { Clock, Plus, Download, Calendar, DollarSign, Edit2, Save, X, FileSpreadsheet, Trash2, Settings, CheckCircle } from 'lucide-react';
import { calculatePartTimeSalary, getPartTimeDailySalary, isSunday, getCurrencyBreakdown } from '../utils/salaryCalculations';
import { exportSalaryToExcel, exportPartTimeSalaryPDF } from '../utils/exportUtils';
import { settingsService } from '../services/settingsService';
import { partTimeAdvanceService } from '../services/partTimeAdvanceService';
import { partTimeSettlementService } from '../services/partTimeSettlementService';
import { PartTimeAdvanceRecord } from '../types';

interface PartTimeStaffProps {
    attendance: Attendance[];
    staff: Staff[];
    onUpdateAttendance: (staffId: string, date: string, status: 'Present' | 'Half Day' | 'Absent', isPartTime?: boolean, staffName?: string, shift?: 'Morning' | 'Evening' | 'Both', location?: string, salary?: number, salaryOverride?: boolean, arrivalTime?: string, leavingTime?: string) => void;
    onDeletePartTimeAttendance: (attendanceId: string) => void;
    userLocation?: string;
    userRole?: string;
}

const format12h = (time24: string | undefined) => {
    if (!time24) return "";
    const [h, m] = time24.split(":");
    let hour = parseInt(h || "0");
    const ampm = hour >= 12 ? "pm" : "am";
    hour = hour % 12 || 12;
    return `${hour}:${m} ${ampm}`;
};

const TimeInput: React.FC<{
    value: string;
    onChange: (value: string) => void;
    className?: string;
}> = ({ value, onChange, className }) => {
    // Helper to convert 24h to 12h
    const get12h = (time24: string) => {
        if (!time24) return { h: "09", m: "00", p: "am" };
        const [hStr, mStr] = time24.split(":");
        let hInt = parseInt(hStr || "0");
        const p = hInt >= 12 ? "pm" : "am";
        const h = hInt % 12 || 12;
        return { h: h.toString().padStart(2, "0"), m: mStr || "00", p };
    };

    const { h, m, p } = get12h(value);

    const handleChange = (newH: string, newM: string, newP: string) => {
        let hInt = parseInt(newH);
        if (newP === "pm" && hInt < 12) hInt += 12;
        if (newP === "am" && hInt === 12) hInt = 0;
        const time24 = `${hInt.toString().padStart(2, "0")}:${newM}`;
        onChange(time24);
    };

    return (
        <div className={`flex items-center gap-1 ${className}`}>
            <select
                value={h}
                onChange={(e) => handleChange(e.target.value, m, p)}
                className="w-full bg-white border border-gray-300 rounded-lg px-1 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent appearance-none text-center"
            >
                {Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, "0")).map(hr => (
                    <option key={hr} value={hr}>{hr}</option>
                ))}
            </select>
            <span className="text-gray-400 font-bold">:</span>
            <select
                value={m}
                onChange={(e) => handleChange(h, e.target.value, p)}
                className="w-full bg-white border border-gray-300 rounded-lg px-1 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent appearance-none text-center"
            >
                {["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"].map(min => (
                    <option key={min} value={min}>{min}</option>
                ))}
            </select>
            <select
                value={p}
                onChange={(e) => handleChange(h, m, e.target.value)}
                className="w-full bg-purple-50 border border-purple-200 text-purple-700 rounded-lg px-1 py-2 text-sm font-bold focus:ring-2 focus:ring-purple-500 focus:border-transparent appearance-none text-center"
            >
                <option value="am">am</option>
                <option value="pm">pm</option>
            </select>
        </div>
    );
};

const AdvanceInput: React.FC<{
    initialValue: number;
    staffName: string;
    location: string;
    year: number;
    month: number;
    week: number;
    onSave: (amount: number) => Promise<void>;
}> = ({ initialValue, onSave }) => {
    const [value, setValue] = useState(initialValue.toString());
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!isSaving) {
            setValue(initialValue.toString());
        }
    }, [initialValue, isSaving]);

    const handleBlur = async () => {
        const numValue = parseFloat(value) || 0;
        if (numValue !== initialValue) {
            setIsSaving(true);
            await onSave(numValue);
            setIsSaving(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            (e.currentTarget as HTMLInputElement).blur();
        }
    };

    return (
        <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                <span className="text-gray-500 sm:text-sm">₹</span>
            </div>
            <input
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                className={`block w-24 pl-6 pr-2 py-1 text-right text-sm border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 ${isSaving ? 'bg-gray-100' : ''}`}
                placeholder="0"
                disabled={isSaving}
            />
            {isSaving && (
                <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none">
                    <div className="animate-spin h-3 w-3 border-2 border-purple-500 rounded-full border-t-transparent"></div>
                </div>
            )}
        </div>
    );
};

const PartTimeStaff: React.FC<PartTimeStaffProps> = ({
    attendance,
    staff,
    onUpdateAttendance,
    onDeletePartTimeAttendance,
    userLocation,
    userRole
}) => {
    const [selectedDate, setSelectedDate] = useState<string>(
        new Date().toISOString().split('T')[0]
    );
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingAttendance, setEditingAttendance] = useState<string | null>(null);
    const [editData, setEditData] = useState<{
        name: string;
        location: string;
        shift: string;
        status: string;
        salary: number;
        arrivalTime: string;
        leavingTime: string;
    }>({
        name: '',
        location: '',
        shift: '',
        status: '',
        salary: 0,
        arrivalTime: '',
        leavingTime: ''
    });
    const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
    const [locationFilter, setLocationFilter] = useState<string>(
        userLocation ? userLocation as any : 'All'
    );
    // Salary Report Filter: Defaults to ['All'] for admins, otherwise defaults to user's location in array
    const [reportLocationFilter, setReportLocationFilter] = useState<string[]>(
        userRole === 'admin' ? ['All'] : (userLocation ? [userLocation] : ['All'])
    );
    const [showLocationDropdown, setShowLocationDropdown] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowLocationDropdown(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const [reportType, setReportType] = useState<'monthly' | 'weekly' | 'dateRange'>('weekly');
    const [selectedWeek, setSelectedWeek] = useState(0);
    const [dateRange, setDateRange] = useState({
        start: new Date().toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    });
    const [reportViewType, setReportViewType] = useState<'Detailed' | 'Summary'>('Detailed');

    // Past Report State
    const [reportStaffFilter, setReportStaffFilter] = useState('All');
    const [reportStartDate, setReportStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
    const [reportEndDate, setReportEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [isReportLoading, setIsReportLoading] = useState(false);
    const [pastReportData, setPastReportData] = useState<PartTimeAdvanceRecord[]>([]);

    // Settlement and Advance tracking state
    const [settledSalaries, setSettledSalaries] = useState<Set<string>>(new Set());
    const [advanceRecords, setAdvanceRecords] = useState<Record<string, PartTimeAdvanceRecord>>({});
    const [aggregatedAdvances, setAggregatedAdvances] = useState<Record<string, number>>({});
    const [, setIsLoadingAdvances] = useState(false);
    const [selectedStaff, setSelectedStaff] = useState<Set<string>>(new Set());
    const [settlementFilter, setSettlementFilter] = useState<'all' | 'settled' | 'unsettled'>('all');
    const [showSettings, setShowSettings] = useState(false);
    const [partTimeRates, setPartTimeRates] = useState(settingsService.getPartTimeRates());

    // Locations state - fetched from Supabase
    const [availableLocations, setAvailableLocations] = useState<string[]>(['Big Shop', 'Small Shop', 'Godown']);

    // Load settlements from database on mount
    useEffect(() => {
        const loadSettlements = async () => {
            try {
                const settledSet = await partTimeSettlementService.getSettlements();
                setSettledSalaries(settledSet);
            } catch (error) {
                console.error('Error loading settlements:', error);
            }
        };
        loadSettlements();
    }, []);

    // Load locations from Supabase via locationService
    useEffect(() => {
        const fetchLocations = async () => {
            const { locationService } = await import('../services/locationService');
            const locs = await locationService.getLocations();
            if (locs.length > 0) {
                setAvailableLocations(locs.map(loc => loc.name));
            }
        };
        fetchLocations();
    }, []);

    const loadPastReport = async () => {
        setIsReportLoading(true);
        try {
            const data = await partTimeAdvanceService.getReport(
                reportStaffFilter === 'All' ? undefined : reportStaffFilter,
                reportStartDate,
                reportEndDate
            );
            setPastReportData(data);
        } catch (error) {
            console.error('Error loading report:', error);
        } finally {
            setIsReportLoading(false);
        }
    };

    // Load advance data when view changes
    useEffect(() => {
        loadAdvanceData();
    }, [reportType, selectedYear, selectedMonth, selectedWeek, selectedDate, dateRange.start, dateRange.end]);

    const loadAdvanceData = async () => {
        setIsLoadingAdvances(true);
        try {
            let startDate: string;
            let endDate: string;

            if (reportType === 'weekly') {
                const weeks = getWeeksInMonth(selectedYear, selectedMonth);
                const currentWeekData = weeks[selectedWeek];
                if (!currentWeekData) {
                    setIsLoadingAdvances(false);
                    return;
                }
                startDate = currentWeekData.startDate.toISOString().split('T')[0];
                endDate = currentWeekData.endDate.toISOString().split('T')[0];
            } else if (reportType === 'monthly') {
                startDate = new Date(selectedYear, selectedMonth, 1).toISOString().split('T')[0];
                endDate = new Date(selectedYear, selectedMonth + 1, 0).toISOString().split('T')[0];
            } else {
                startDate = dateRange.start;
                endDate = dateRange.end;
            }

            const records = await partTimeAdvanceService.getReport(
                undefined,
                startDate,
                endDate
            );

            // Populate detailed map (mainly for weekly view editing)
            const newMap: Record<string, PartTimeAdvanceRecord> = {};
            records.forEach(r => {
                const key = `${r.staffName}-${r.location}-${r.year}-${r.month}-${r.weekNumber}`;
                newMap[key] = r;
            });
            setAdvanceRecords(newMap);

            // Populate aggregated map (for monthly/date range view and totals)
            const aggMap: Record<string, number> = {};
            records.forEach(r => {
                const key = `${r.staffName}-${r.location}`;
                aggMap[key] = (aggMap[key] || 0) + r.advanceGiven;
            });
            setAggregatedAdvances(aggMap);

        } catch (error) {
            console.error("Failed to load advances", error);
        } finally {
            setIsLoadingAdvances(false);
        }
    };


    // Generate unique key for settlement tracking (always uses weekly key for consistency)
    const getWeeklySettlementKey = (staffName: string, location: string, year: number, month: number, week: number) => {
        return `${staffName}-${location}-weekly-${year}-${month}-${week}`;
    };

    // Get settlement status for current view (returns detailed info for monthly/dateRange)
    const getSettlementStatus = (staffName: string, location: string) => {
        if (reportType === 'weekly') {
            // For weekly view, just check if this specific week is settled
            const key = getWeeklySettlementKey(staffName, location, selectedYear, selectedMonth, selectedWeek);
            const isSettled = settledSalaries.has(key);
            return {
                isFullySettled: isSettled,
                isPartiallySettled: false,
                settledWeeks: isSettled ? [selectedWeek] : [],
                totalWeeks: 1,
                settledCount: isSettled ? 1 : 0
            };
        } else if (reportType === 'monthly') {
            // For monthly view, check all weeks in the month
            const weeks = getWeeksInMonthForSettlement(selectedYear, selectedMonth);
            const settledWeeks: number[] = [];
            weeks.forEach((_, weekIndex) => {
                const key = getWeeklySettlementKey(staffName, location, selectedYear, selectedMonth, weekIndex);
                if (settledSalaries.has(key)) {
                    settledWeeks.push(weekIndex);
                }
            });
            return {
                isFullySettled: settledWeeks.length === weeks.length && weeks.length > 0,
                isPartiallySettled: settledWeeks.length > 0 && settledWeeks.length < weeks.length,
                settledWeeks,
                totalWeeks: weeks.length,
                settledCount: settledWeeks.length
            };
        } else {
            // For date range, find overlapping weeks and check their settlement
            const startDate = new Date(dateRange.start);
            const endDate = new Date(dateRange.end);
            const settledWeeks: number[] = [];
            let totalWeeks = 0;

            // Check each month in the range
            let currentDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
            while (currentDate <= endDate) {
                const year = currentDate.getFullYear();
                const month = currentDate.getMonth();
                const weeks = getWeeksInMonthForSettlement(year, month);

                weeks.forEach((week, weekIndex) => {
                    // Check if week overlaps with date range
                    if (week.endDate >= startDate && week.startDate <= endDate) {
                        totalWeeks++;
                        const key = getWeeklySettlementKey(staffName, location, year, month, weekIndex);
                        if (settledSalaries.has(key)) {
                            settledWeeks.push(weekIndex);
                        }
                    }
                });

                // Move to next month
                currentDate.setMonth(currentDate.getMonth() + 1);
            }

            return {
                isFullySettled: totalWeeks > 0 && settledWeeks.length === totalWeeks,
                isPartiallySettled: settledWeeks.length > 0 && settledWeeks.length < totalWeeks,
                settledWeeks,
                totalWeeks,
                settledCount: settledWeeks.length
            };
        }
    };

    // Simple check for backward compatibility
    const _isSettled = (staffName: string, location: string) => {
        const status = getSettlementStatus(staffName, location);
        return status.isFullySettled;
    };

    // Check if partially settled (for different highlighting)
    const _isPartiallySettled = (staffName: string, location: string) => {
        const status = getSettlementStatus(staffName, location);
        return status.isPartiallySettled;
    };

    // Toggle settlement status (always toggles weekly key)
    const toggleSettlement = async (staffName: string, location: string) => {
        if (reportType === 'weekly') {
            // Toggle single week
            const key = getWeeklySettlementKey(staffName, location, selectedYear, selectedMonth, selectedWeek);
            const newSettled = new Set(settledSalaries);
            const isSettled = !newSettled.has(key);

            if (isSettled) {
                newSettled.add(key);
            } else {
                newSettled.delete(key);
            }

            setSettledSalaries(newSettled);
            // Async update
            await partTimeSettlementService.toggleSettlement(staffName, location, key, isSettled);

        } else if (reportType === 'monthly') {
            // Toggle all weeks in month
            const weeks = getWeeksInMonthForSettlement(selectedYear, selectedMonth);
            const newSettled = new Set(settledSalaries);
            const status = getSettlementStatus(staffName, location);
            const shouldSettle = !status.isFullySettled;
            const updates: { staffName: string; location: string; settlementKey: string; isSettled: boolean }[] = [];

            if (!shouldSettle) {
                // Unsettle all weeks
                weeks.forEach((_, weekIndex) => {
                    const key = getWeeklySettlementKey(staffName, location, selectedYear, selectedMonth, weekIndex);
                    if (newSettled.has(key)) {
                        newSettled.delete(key);
                        updates.push({ staffName, location, settlementKey: key, isSettled: false });
                    }
                });
            } else {
                // Settle all weeks
                weeks.forEach((_, weekIndex) => {
                    const key = getWeeklySettlementKey(staffName, location, selectedYear, selectedMonth, weekIndex);
                    if (!newSettled.has(key)) {
                        newSettled.add(key);
                        updates.push({ staffName, location, settlementKey: key, isSettled: true });
                    }
                });
            }
            setSettledSalaries(newSettled);
            await partTimeSettlementService.updateSettlementsBulk(updates);

        } else {
            // Date range: toggle all overlapping weeks
            const startDate = new Date(dateRange.start);
            const endDate = new Date(dateRange.end);
            const newSettled = new Set(settledSalaries);
            const status = getSettlementStatus(staffName, location);
            const shouldSettle = !status.isFullySettled;
            const updates: { staffName: string; location: string; settlementKey: string; isSettled: boolean }[] = [];

            let currentDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
            while (currentDate <= endDate) {
                const year = currentDate.getFullYear();
                const month = currentDate.getMonth();
                const weeks = getWeeksInMonthForSettlement(year, month);

                weeks.forEach((week, weekIndex) => {
                    if (week.endDate >= startDate && week.startDate <= endDate) {
                        const key = getWeeklySettlementKey(staffName, location, year, month, weekIndex);
                        if (!shouldSettle) {
                            if (newSettled.has(key)) {
                                newSettled.delete(key);
                                updates.push({ staffName, location, settlementKey: key, isSettled: false });
                            }
                        } else {
                            if (!newSettled.has(key)) {
                                newSettled.add(key);
                                updates.push({ staffName, location, settlementKey: key, isSettled: true });
                            }
                        }
                    }
                });

                currentDate.setMonth(currentDate.getMonth() + 1);
            }
            setSettledSalaries(newSettled);
            await partTimeSettlementService.updateSettlementsBulk(updates);
        }
    };

    // Helper version of getWeeksInMonth for settlement (doesn't require HTML render context)
    const getWeeksInMonthForSettlement = (year: number, month: number) => {
        const weeks: { startDate: Date; endDate: Date }[] = [];
        const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
        let currentDay = 1;

        while (currentDay <= lastDayOfMonth) {
            const weekEndDay = currentDay + 6;
            const startDate = new Date(year, month, currentDay);
            let endDate: Date;

            if (weekEndDay <= lastDayOfMonth) {
                endDate = new Date(year, month, weekEndDay, 23, 59, 59, 999);
            } else {
                const daysIntoNextMonth = weekEndDay - lastDayOfMonth;
                let endMonth = month + 1;
                let endYear = year;
                if (endMonth > 11) {
                    endMonth = 0;
                    endYear = year + 1;
                }
                endDate = new Date(endYear, endMonth, daysIntoNextMonth, 23, 59, 59, 999);
            }

            weeks.push({ startDate, endDate });
            currentDay += 7;
        }
        return weeks;
    };

    // Helper to get default shift and leaving time based on current time
    const getDefaultShiftConfig = () => {
        const now = new Date();
        const hour = now.getHours();
        const isSun = now.getDay() === 0;

        // Sunday defaults to Both
        if (isSun) {
            return { shift: 'Both' as const, arrivalTime: '10:00', leavingTime: '21:30' };
        }

        // Morning (before 2 PM) defaults to Both
        if (hour < 14) {
            return { shift: 'Both' as const, arrivalTime: '10:00', leavingTime: '21:30' };
        }

        // Evening (after 2 PM) defaults to Evening
        return { shift: 'Evening' as const, arrivalTime: '14:00', leavingTime: '21:30' };
    };

    // Bulk add state
    const [bulkStaffList, setBulkStaffList] = useState<{
        name: string;
        shift: 'Morning' | 'Evening' | 'Both';
        salary: number;
        arrivalTime: string;
        leavingTime: string;
    }[]>(() => {
        const config = getDefaultShiftConfig();
        const initialLeavingTime = (userLocation === 'Godown') ? '21:00' : config.leavingTime;

        return [{
            name: '',
            shift: config.shift,
            salary: 0,
            arrivalTime: config.arrivalTime,
            leavingTime: initialLeavingTime
        }];
    });
    const [bulkLocation, setBulkLocation] = useState(userLocation || 'Big Shop');
    const [newStaffData, setNewStaffData] = useState<{
        name: string;
        location: string;
        shift: 'Morning' | 'Evening' | 'Both';
        salary: number;
        arrivalTime: string;
        leavingTime: string;
    }>(() => {
        const config = getDefaultShiftConfig();
        const location = (userLocation || 'Big Shop') as string;
        const initialLeavingTime = (location === 'Godown') ? '21:00' : config.leavingTime;

        return {
            name: '',
            location: location,
            shift: config.shift,
            salary: 0,
            arrivalTime: config.arrivalTime,
            leavingTime: initialLeavingTime
        };
    });

    // Update bulkLocation when availableLocations loads
    useEffect(() => {
        if (!userLocation && availableLocations.length > 0) {
            setBulkLocation(availableLocations[0]);
        }
    }, [availableLocations, userLocation]);

    // Get recent names for smart suggestions
    const getRecentNames = () => {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        let recentAttendance = attendance.filter(record => {
            const recordDate = new Date(record.date);
            return record.isPartTime &&
                recordDate >= thirtyDaysAgo &&
                record.staffName;
        });

        // Filter by location unless it's Sunday or "All" locations
        const today = new Date();
        const isSunday = today.getDay() === 0;

        if (!isSunday && userLocation) {
            recentAttendance = recentAttendance.filter(record => record.location === userLocation);
        }

        // Get unique names
        const uniqueNames = [...new Set(recentAttendance.map(record => record.staffName))];
        return uniqueNames.slice(0, 10); // Limit to 10 suggestions
    };

    const recentNames = getRecentNames();

    // Get weeks in month (simplified date-based: always 7-day weeks, can span into next month)
    const getWeeksInMonth = (year: number, month: number) => {
        const weeks = [];
        const lastDayOfMonth = new Date(year, month + 1, 0).getDate();

        let currentDay = 1;

        while (currentDay <= lastDayOfMonth) {
            const weekStartDay = currentDay;
            const weekEndDay = currentDay + 6; // Always 7 days

            const startDate = new Date(year, month, weekStartDay);
            let endDate: Date;
            let endDay: number;
            let endMonth: number;
            let endYear: number;

            if (weekEndDay <= lastDayOfMonth) {
                // Week ends in current month
                endDate = new Date(year, month, weekEndDay, 23, 59, 59, 999);
                endDay = weekEndDay;
                endMonth = month;
                endYear = year;
            } else {
                // Week extends into next month
                const daysIntoNextMonth = weekEndDay - lastDayOfMonth;
                endMonth = month + 1;
                endYear = year;

                // Handle year boundary
                if (endMonth > 11) {
                    endMonth = 0;
                    endYear = year + 1;
                }

                endDate = new Date(endYear, endMonth, daysIntoNextMonth, 23, 59, 59, 999);
                endDay = daysIntoNextMonth;
            }

            weeks.push({
                start: startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                end: endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                startDate: startDate,
                endDate: endDate,
                startDay: weekStartDay,
                endDay: weekEndDay, // Always +6 from start for column count
                startMonth: month,
                startYear: year,
                endMonth: endMonth,
                endYear: endYear,
                actualEndDay: endDay
            });

            currentDay += 7;
        }

        return weeks;
    };

    // Set default week to current week on component mount
    React.useEffect(() => {
        if (reportType === 'weekly') {
            const today = new Date();
            const currentMonth = today.getMonth();
            const currentYear = today.getFullYear();

            if (selectedMonth === currentMonth && selectedYear === currentYear) {
                const weeks = getWeeksInMonth(currentYear, currentMonth);
                const todayTime = today.getTime();

                const currentWeekIndex = weeks.findIndex(week => {
                    const weekStartTime = week.startDate.getTime();
                    const weekEndTime = week.endDate.getTime();
                    return todayTime >= weekStartTime && todayTime <= weekEndTime;
                });

                if (currentWeekIndex !== -1) {
                    setSelectedWeek(currentWeekIndex);
                }
            }
        }
    }, [reportType, selectedMonth, selectedYear]);

    // Calculate part-time salaries for the selected month
    const calculatePartTimeSalaries = (): PartTimeSalaryDetail[] => {
        let monthlyAttendance = attendance.filter(record => {
            if (!record.isPartTime) return false;

            const recordDate = new Date(record.date);

            if (reportType === 'monthly') {
                return recordDate.getMonth() === selectedMonth &&
                    recordDate.getFullYear() === selectedYear;
            } else if (reportType === 'weekly') {
                const weeks = getWeeksInMonth(selectedYear, selectedMonth);
                const selectedWeekData = weeks[selectedWeek];
                if (!selectedWeekData) return false;
                return recordDate >= selectedWeekData.startDate && recordDate <= selectedWeekData.endDate;
            } else if (reportType === 'dateRange') {
                const startDate = new Date(dateRange.start);
                const endDate = new Date(dateRange.end);
                return recordDate >= startDate && recordDate <= endDate;
            }

            return false;
        });



        const uniqueStaff = new Map<string, { name: string; locations: Set<string> }>();
        monthlyAttendance.forEach(record => {
            if (record.staffName) {
                const key = record.staffName.toLowerCase();
                if (!uniqueStaff.has(key)) {
                    uniqueStaff.set(key, {
                        name: record.staffName,
                        locations: new Set([record.location || 'Unknown'])
                    });
                } else {
                    uniqueStaff.get(key)!.locations.add(record.location || 'Unknown');
                }
            }
        });

        return Array.from(uniqueStaff.values()).map(staff =>
            calculatePartTimeSalary(
                staff.name,
                Array.from(staff.locations).join(', '),
                monthlyAttendance,
                selectedYear,
                selectedMonth
            )
        );
    };

    // Check for duplicates
    const checkDuplicate = (name: string, location: string, shift: string, excludeId?: string) => {
        // Check for duplicate in part-time attendance
        const partTimeDuplicate = filteredTodayAttendance.some(record =>
            record.id !== excludeId &&
            record.staffName?.toLowerCase() === name.toLowerCase() &&
            record.location === location &&
            record.shift === shift
        );

        // Check for duplicate in full-time staff
        const fullTimeDuplicate = staff.some(member =>
            member.name.toLowerCase() === name.toLowerCase() &&
            member.isActive
        );

        // Check for duplicate name across all part-time staff for today (any location/shift)
        const partTimeNameDuplicate = filteredTodayAttendance.some(record =>
            record.id !== excludeId &&
            record.staffName?.toLowerCase() === name.toLowerCase()
        );

        return partTimeNameDuplicate || fullTimeDuplicate;
    };

    // Bulk add helper functions
    const handleAddBulkRow = () => {
        const isSun = new Date().getDay() === 0;
        const defaultShift = isSun ? 'Both' : 'Morning';
        // 10:00 for Morning/Both
        const defaultArrival = '10:00';
        // 21:00 for Godown, 21:30 for others
        const defaultLeaving = bulkLocation === 'Godown' ? '21:00' : '21:30';

        setBulkStaffList([...bulkStaffList, {
            name: '',
            shift: defaultShift as 'Morning' | 'Evening' | 'Both',
            salary: 0,
            arrivalTime: defaultArrival,
            leavingTime: defaultLeaving
        }]);
    };

    const handleRemoveBulkRow = (index: number) => {
        if (bulkStaffList.length > 1) {
            setBulkStaffList(bulkStaffList.filter((_, i) => i !== index));
        }
    };

    const handleBulkLocationChange = (location: string) => {
        setBulkLocation(location);

        const updatedList = bulkStaffList.map(item => {
            // If shift is NOT Morning, apply location rule.
            // If Morning, keep 15:00.
            if (item.shift !== 'Morning') {
                return {
                    ...item,
                    leavingTime: location === 'Godown' ? '21:00' : '21:30'
                };
            }
            return item;
        });
        setBulkStaffList(updatedList);
    };

    const handleBulkRowChange = (index: number, field: string, value: any) => {
        const newList = [...bulkStaffList];
        (newList[index] as any)[field] = value;

        // Auto-update times when shift changes
        if (field === 'shift') {
            const newShift = value as 'Morning' | 'Evening' | 'Both';
            // Morning = 10:00 AM to 3:00 PM
            // Evening = 2:00 PM to 9:30 PM (Godown 9:00 PM)
            // Both = 10:00 AM to 9:30 PM (Godown 9:00 PM)

            newList[index].arrivalTime = newShift === 'Evening' ? '14:00' : '10:00';

            // Determine leaving time based on shift and location
            if (newShift === 'Morning') {
                newList[index].leavingTime = '15:00';
            } else {
                // Evening or Both
                newList[index].leavingTime = bulkLocation === 'Godown' ? '21:00' : '21:30';
            }
        }

        setBulkStaffList(newList);
    };

    const handleBulkSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const errors: string[] = [];
        const validEntries: typeof bulkStaffList = [];

        bulkStaffList.forEach((staffData, index) => {
            if (!staffData.name.trim()) {
                errors.push(`Row ${index + 1}: Name is required`);
                return;
            }

            // Check for duplicate in current bulk list
            const duplicateInList = bulkStaffList.filter((s, i) =>
                i !== index &&
                s.name.toLowerCase().trim() === staffData.name.toLowerCase().trim() &&
                s.shift === staffData.shift
            ).length > 0;

            if (duplicateInList) {
                errors.push(`Row ${index + 1}: ${staffData.name} is duplicated in this list`);
                return;
            }

            if (checkDuplicate(staffData.name, bulkLocation, staffData.shift)) {
                errors.push(`Row ${index + 1}: ${staffData.name} already exists for today`);
                return;
            }

            validEntries.push(staffData);
        });

        if (errors.length > 0) {
            alert(errors.join('\n'));
            return;
        }

        // Submit all valid entries
        validEntries.forEach((staffData, index) => {
            const staffId = `pt_${Date.now()}_${index}`;
            let defaultSalary = getPartTimeDailySalary(selectedDate);
            if (staffData.shift === 'Morning' || staffData.shift === 'Evening') {
                defaultSalary = Math.round(defaultSalary / 2);
            }

            const finalSalary = staffData.salary > 0 ? staffData.salary : defaultSalary;
            const isSalaryEdited = staffData.salary > 0 && staffData.salary !== defaultSalary;
            const arrivalTime = staffData.arrivalTime || new Date().toTimeString().slice(0, 5);
            let leavingTime = staffData.leavingTime;
            if (!leavingTime) {
                leavingTime = staffData.shift === 'Morning' ? '15:00' : (bulkLocation === 'Godown' ? '21:00' : '21:30');
            }

            onUpdateAttendance(
                staffId, selectedDate, 'Present', true,
                staffData.name.trim(), staffData.shift, bulkLocation,
                finalSalary, isSalaryEdited, arrivalTime, leavingTime
            );
        });

        // Reset form
        const config = getDefaultShiftConfig();
        const initialLeavingTime = (bulkLocation === 'Godown') ? '21:00' : config.leavingTime;

        setBulkStaffList([{
            name: '',
            shift: config.shift,
            salary: 0,
            arrivalTime: config.arrivalTime,
            leavingTime: initialLeavingTime
        }]);
        setShowAddForm(false);
    };

    // Helper functions for multi-location selection
    const handleLocationToggle = (location: string) => {
        if (location === 'All') {
            setReportLocationFilter(['All']);
        } else {
            const newFilter = reportLocationFilter.includes('All')
                ? [location]
                : reportLocationFilter.includes(location)
                    ? reportLocationFilter.filter(loc => loc !== location)
                    : [...reportLocationFilter, location];

            // If no locations selected, default to All
            setReportLocationFilter(newFilter.length === 0 ? ['All'] : newFilter);
        }
    };

    const getLocationButtonText = () => {
        if (reportLocationFilter.includes('All')) return 'All Locations';
        const count = reportLocationFilter.length;
        return count === 1 ? reportLocationFilter[0] : `${count} Locations`;
    };

    const partTimeSalaries = calculatePartTimeSalaries().filter(salary => {
        // Filter by location
        const locationMatch = reportLocationFilter.includes('All') || reportLocationFilter.some(loc => salary.location.includes(loc));
        // Filter by search query (case-insensitive)
        const searchMatch = !searchQuery.trim() || salary.staffName.toLowerCase().includes(searchQuery.toLowerCase().trim());
        // Filter by settlement status (using getSettlementStatus for cross-view awareness)
        const status = getSettlementStatus(salary.staffName, salary.location);
        const settlementMatch = settlementFilter === 'all' ||
            (settlementFilter === 'settled' && status.isFullySettled) ||
            (settlementFilter === 'unsettled' && !status.isFullySettled);
        return locationMatch && searchMatch && settlementMatch;
    });

    // Filter salaries based on selection if any are selected
    const selectedSalaries = selectedStaff.size > 0
        ? partTimeSalaries.filter(s => selectedStaff.has(`${s.staffName}-${s.location}`))
        : partTimeSalaries;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const totalPartTimeEarnings = selectedSalaries.reduce((sum, salary) => sum + salary.totalEarnings, 0);

    // Calculate currency breakdown - use NET payable (after advance deduction) for each staff
    const currencyBreakdown = (selectedStaff.size > 0 ? selectedSalaries : partTimeSalaries).reduce((acc, salary) => {
        // Calculate advance deduction for this staff member
        const advance = reportType === 'weekly'
            ? (advanceRecords[`${salary.staffName}-${salary.location}-${selectedYear}-${selectedMonth}-${selectedWeek}`]?.advanceGiven || 0)
            : (aggregatedAdvances[`${salary.staffName}-${salary.location}`] || 0);

        // Use NET payable (after advance) instead of raw totalEarnings
        const netPayable = Math.max(0, salary.totalEarnings - advance);

        const breakdown = getCurrencyBreakdown(netPayable);
        Object.entries(breakdown).forEach(([denom, count]) => {
            const d = Number(denom);
            acc[d] = (acc[d] || 0) + count;
        });
        return acc;
    }, {} as Record<number, number>);

    const sortedDenominations = Object.keys(currencyBreakdown)
        .map(Number)
        .sort((a, b) => b - a);

    // Get today's part-time attendance
    let todayPartTimeAttendance = attendance.filter(record =>
        record.isPartTime && record.date === selectedDate
    );

    // Filter by user location if manager
    if (userLocation) {
        todayPartTimeAttendance = todayPartTimeAttendance.filter(record => record.location === userLocation);
    }

    // Filter by location
    const filteredTodayAttendance = locationFilter === 'All'
        ? todayPartTimeAttendance
        : todayPartTimeAttendance.filter(record => record.location === locationFilter);

    const handleAddPartTimeAttendance = (e: React.FormEvent) => {
        e.preventDefault();

        // Check for duplicates
        const isDuplicate = checkDuplicate(newStaffData.name, newStaffData.location, newStaffData.shift);

        if (isDuplicate) {
            const isFullTimeStaff = staff.some(member =>
                member.name.toLowerCase() === newStaffData.name.toLowerCase() &&
                member.isActive
            );

            if (isFullTimeStaff) {
                alert(`${newStaffData.name} is already a full-time staff member. Cannot add as part-time.`);
            } else {
                alert(`${newStaffData.name} is already added as part-time staff today.`);
            }
            return;
        }

        const staffId = `pt_${Date.now()}`;

        // Calculate salary based on shift and day
        let defaultSalary = getPartTimeDailySalary(selectedDate);
        if (newStaffData.shift === 'Morning' || newStaffData.shift === 'Evening') {
            defaultSalary = Math.round(defaultSalary / 2); // Half day rate
        }

        // Use manual salary if provided, otherwise use calculated default
        const finalSalary = newStaffData.salary > 0 ? newStaffData.salary : defaultSalary;
        const isSalaryEdited = newStaffData.salary > 0 && newStaffData.salary !== defaultSalary;

        // Set default arrival time to current time if not provided to current time if not provided
        const defaultArrivalTime = newStaffData.arrivalTime || new Date().toTimeString().slice(0, 5);

        // Set default leaving time based on shift
        let defaultLeavingTime = newStaffData.leavingTime;
        if (!defaultLeavingTime) {
            if (newStaffData.shift === 'Morning') {
                defaultLeavingTime = '15:00'; // 3:00 PM
            } else if (newStaffData.shift === 'Evening' || newStaffData.shift === 'Both') {
                defaultLeavingTime = '21:30'; // 9:30 PM
            }
        }

        onUpdateAttendance(
            staffId,
            selectedDate,
            'Present',
            true,
            newStaffData.name,
            newStaffData.shift,
            newStaffData.location,
            finalSalary,
            isSalaryEdited,
            defaultArrivalTime,
            defaultLeavingTime
        );
        setNewStaffData({
            name: '',
            location: (userLocation || 'Big Shop') as any,
            shift: (new Date().getDay() === 0 ? 'Both' : 'Morning') as 'Morning' | 'Evening' | 'Both',
            salary: 0,
            arrivalTime: '',
            leavingTime: ''
        });
        setShowAddForm(false);
    };

    const handleEdit = (record: Attendance) => {
        setEditingAttendance(record.id);
        setEditData({
            name: record.staffName || '',
            location: record.location || 'Big Shop',
            shift: record.shift || 'Morning',
            status: record.status,
            salary: record.salary || getPartTimeDailySalary(record.date),
            arrivalTime: record.arrivalTime || '',
            leavingTime: record.leavingTime || ''
        });
    };

    const handleSave = (attendanceRecord: Attendance) => {
        // Check for duplicates on edit
        const isDuplicate = checkDuplicate(editData.name, editData.location, editData.shift, attendanceRecord.id);

        if (isDuplicate) {
            const isFullTimeStaff = staff.some(member =>
                member.name.toLowerCase() === editData.name.toLowerCase() &&
                member.isActive
            );

            if (isFullTimeStaff) {
                alert(`${editData.name} is already a full-time staff member. Cannot use as part-time.`);
            } else {
                alert(`${editData.name} is already added as part-time staff today.`);
            }
            return;
        }

        // Smart edited label logic: calculate default salary to check if it was actually edited
        const defaultSalary = getPartTimeDailySalary(attendanceRecord.date);
        const calculatedSalary = (editData.shift === 'Morning' || editData.shift === 'Evening')
            ? Math.round(defaultSalary / 2)
            : defaultSalary;

        // Only mark as edited if salary actually changed from calculated default
        const isSalaryEdited = editData.salary !== calculatedSalary;

        onUpdateAttendance(
            attendanceRecord.staffId,
            attendanceRecord.date,
            editData.status as 'Present' | 'Half Day' | 'Absent',
            true,
            editData.name,
            editData.shift as 'Morning' | 'Evening' | 'Both',
            editData.location,
            editData.salary,
            isSalaryEdited,
            editData.arrivalTime,
            editData.leavingTime
        );
        setEditingAttendance(null);
    };

    const handleCancelEdit = () => {
        setEditingAttendance(null);
    };

    const handleDelete = (attendanceId: string) => {
        setShowDeleteModal(attendanceId);
    };

    const confirmDelete = () => {
        if (showDeleteModal) {
            const record = filteredTodayAttendance.find(r => r.id === showDeleteModal);
            if (record) {
                // Call the delete function from parent
                onDeletePartTimeAttendance(record.id);
            }
            setShowDeleteModal(null);
        }
    };

    const handleExportExcel = () => {
        exportSalaryToExcel([], partTimeSalaries, [], selectedMonth, selectedYear);
    };

    const handleExportPDF = () => {
        let weekData, dateRangeData;

        if (reportType === 'weekly') {
            const weeks = getWeeksInMonth(selectedYear, selectedMonth);
            const selectedWeekData = weeks[selectedWeek];
            if (selectedWeekData) {
                weekData = {
                    start: selectedWeekData.start,
                    end: selectedWeekData.end
                };
            }
        } else if (reportType === 'dateRange') {
            dateRangeData = dateRange;
        }

        // Export only selected salaries if any are selected
        const salariesToExport = selectedStaff.size > 0
            ? partTimeSalaries.filter(s => selectedStaff.has(`${s.staffName}-${s.location}`))
            : partTimeSalaries;

        exportPartTimeSalaryPDF(
            salariesToExport,
            selectedMonth,
            selectedYear,
            reportType,
            weekData,
            dateRangeData
        );
    };

    // Group salaries by location for display
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const salariesByLocation = partTimeSalaries.reduce((acc, salary) => {
        if (!acc[salary.location]) {
            acc[salary.location] = [];
        }
        acc[salary.location].push(salary);
        return acc;
    }, {} as Record<string, PartTimeSalaryDetail[]>);

    // Filter locations based on user role
    const getAvailableLocations = () => {
        if (userLocation) {
            return [userLocation];
        }
        return ['All', ...availableLocations];
    };
    return (
        <div className="p-1 md:p-6 space-y-4 md:space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl p-6 text-white">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <Clock size={32} />
                        <h1 className="text-xl md:text-3xl font-bold">Part-Time Staff Management</h1>
                        {userLocation && (
                            <span className="px-3 py-1 bg-white/20 rounded-full text-sm">
                                {userLocation}
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2 md:gap-3">
                        <button
                            onClick={handleExportExcel}
                            className="flex items-center gap-2 px-3 md:px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors text-sm"
                        >
                            <FileSpreadsheet size={16} />
                            <span className="hidden sm:inline">Export Excel</span>
                            <span className="sm:hidden">Excel</span>
                        </button>
                        <button
                            onClick={handleExportPDF}
                            className="flex items-center gap-2 px-3 md:px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors text-sm"
                        >
                            <Download size={16} />
                            <span className="hidden sm:inline">Export PDF</span>
                            <span className="sm:hidden">PDF</span>
                        </button>
                        <button
                            onClick={() => setShowSettings(true)}
                            className="flex items-center gap-2 px-3 md:px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors text-sm"
                        >
                            <Settings size={16} />
                            <span className="hidden sm:inline">Settings</span>
                        </button>
                        <button
                            onClick={() => setShowAddForm(true)}
                            className="flex items-center gap-2 px-3 md:px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors text-sm"
                        >
                            <Plus size={16} />
                            <span className="hidden sm:inline">Add Part-Time Staff</span>
                            <span className="sm:hidden">Add Staff</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Add Part-Time Staff Form (Bulk) */}
            {showAddForm && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-6">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg md:text-xl font-bold text-gray-800">Add Part-Time Staff for Today</h2>
                        <button onClick={() => setShowAddForm(false)} className="bg-gray-100 text-gray-500 hover:text-white hover:bg-red-600 p-1.5 rounded-full transition-all shadow-sm">
                            <X size={20} />
                        </button>
                    </div>

                    <form onSubmit={handleBulkSubmit}>
                        {/* Common Location */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Location (Applies to all)</label>
                            <select
                                value={bulkLocation}
                                onChange={(e) => handleBulkLocationChange(e.target.value)}
                                className="w-full md:w-1/3 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                disabled={!!userLocation}
                            >
                                {availableLocations.map(loc => (<option key={loc} value={loc}>{loc}</option>))}
                            </select>
                        </div>

                        {/* Staff Rows */}
                        <div className="space-y-4">
                            {bulkStaffList.map((staffEntry, index) => (
                                <div key={index} className="p-4 bg-gray-50 rounded-lg border border-gray-200 relative">
                                    <div className="absolute -top-2 -right-2">
                                        {bulkStaffList.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveBulkRow(index)}
                                                className="bg-red-600 !text-white hover:bg-red-700 p-2 rounded-full transition-all shadow-lg border-2 border-white z-10 hover:scale-110 active:scale-95"
                                                title="Remove row"
                                            >
                                                <Trash2 size={18} strokeWidth={2.5} />
                                            </button>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
                                            <input
                                                list={`recent-names-${index}`}
                                                type="text"
                                                value={staffEntry.name}
                                                onChange={(e) => handleBulkRowChange(index, 'name', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                                placeholder="Enter name"
                                                required
                                            />
                                            <datalist id={`recent-names-${index}`}>
                                                {recentNames.map((name, i) => (
                                                    <option key={i} value={name} />
                                                ))}
                                            </datalist>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Shift</label>
                                            <select
                                                value={staffEntry.shift}
                                                onChange={(e) => handleBulkRowChange(index, 'shift', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                            >
                                                <option value="Morning">Morning (Half)</option>
                                                <option value="Evening">Evening (Half)</option>
                                                <option value="Both">Both (Full)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Salary (Opt)</label>
                                            <div className="relative">
                                                <span className="absolute inset-y-0 left-0 pl-2 flex items-center text-gray-500 text-xs">₹</span>
                                                <input
                                                    type="number"
                                                    value={staffEntry.salary || ''}
                                                    onChange={(e) => handleBulkRowChange(index, 'salary', Number(e.target.value))}
                                                    className="w-full pl-6 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                                    placeholder={(() => {
                                                        let defaultSalary = getPartTimeDailySalary(selectedDate);
                                                        if (staffEntry.shift === 'Morning' || staffEntry.shift === 'Evening') {
                                                            defaultSalary = Math.round(defaultSalary / 2);
                                                        }
                                                        return `${defaultSalary}`;
                                                    })()}
                                                />
                                            </div>
                                        </div>
                                        <div className="lg:col-span-2 grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wider text-center">Arrival</label>
                                                <TimeInput
                                                    value={staffEntry.arrivalTime}
                                                    onChange={(val) => handleBulkRowChange(index, 'arrivalTime', val)}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wider text-center">Leaving</label>
                                                <TimeInput
                                                    value={staffEntry.leavingTime}
                                                    onChange={(val) => handleBulkRowChange(index, 'leavingTime', val)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-4 flex flex-col sm:flex-row gap-3">
                            <button
                                type="button"
                                onClick={handleAddBulkRow}
                                className="flex items-center justify-center gap-2 px-4 py-2 border border-dashed border-purple-300 text-purple-600 rounded-lg hover:bg-purple-50 transition-colors w-full sm:w-auto"
                            >
                                <Plus size={18} />
                                Add Another Staff
                            </button>
                            <div className="flex-1"></div>
                            <button
                                type="button"
                                onClick={() => setShowAddForm(false)}
                                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors w-full sm:w-auto"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-6 py-2 bg-purple-600 !text-white rounded-lg hover:bg-purple-700 transition-colors font-bold w-full sm:w-auto shadow-md active:scale-95"
                            >
                                Submit All Staff
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Date Selection */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-6">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                        <label className="text-sm font-medium text-gray-700">Select Date</label>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                        {isSunday(selectedDate) && (
                            <span className="px-3 py-1 bg-orange-100 text-orange-800 text-sm font-medium rounded-full">
                                Sunday - ₹400 rate
                            </span>
                        )}
                    </div>
                    {!userLocation && (
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                            <label className="text-sm font-medium text-gray-700">Filter by Location</label>
                            <select
                                value={locationFilter}
                                onChange={(e) => setLocationFilter(e.target.value as any)}
                                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            >
                                {getAvailableLocations().map(location => (
                                    <option key={location} value={location}>{location}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
            </div>

            {/* Today's Part-Time Attendance */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                        <Calendar className="text-purple-600" size={20} />
                        Part-Time Staff Attendance - {new Date(selectedDate).toLocaleDateString()}
                        {(locationFilter !== 'All' || userLocation) && (
                            <span className="text-sm text-gray-500">
                                ({userLocation || locationFilter})
                            </span>
                        )}
                    </h2>
                </div>

                {filteredTodayAttendance.length === 0 ? (
                    <div className="p-8 text-center">
                        <Clock className="mx-auto text-gray-400 mb-4" size={48} />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No part-time staff for today</h3>
                        <p className="text-gray-500">Add part-time staff using the button above.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">S.No</th>
                                    <th className="sticky left-0 z-10 bg-gray-50 px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Name</th>
                                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Shift</th>
                                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Salary</th>
                                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredTodayAttendance.map((record, index) => (
                                    <tr key={record.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{index + 1}</td>
                                        <td className="sticky left-0 z-10 bg-white px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                            {record.staffName}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="badge-premium badge-purple">
                                                {record.location}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="badge-premium badge-info">
                                                {record.shift}
                                            </span>
                                            {(record.arrivalTime || record.leavingTime) && (
                                                <div className="text-[10px] mt-1 text-gray-500 font-medium">
                                                    {record.arrivalTime && `In: ${format12h(record.arrivalTime)}`}
                                                    {record.arrivalTime && record.leavingTime && ' | '}
                                                    {record.leavingTime && `Out: ${format12h(record.leavingTime)}`}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`badge-premium ${record.status === 'Present' ? 'badge-success' :
                                                record.status === 'Half Day' ? 'badge-warning' :
                                                    'badge-danger'
                                                }`}>
                                                {record.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {editingAttendance === record.id ? (
                                                <div className="space-y-2">
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <input
                                                            type="text"
                                                            value={editData.name}
                                                            onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                                                            className="px-2 py-1 text-xs border rounded"
                                                            placeholder="Name"
                                                        />
                                                        <select
                                                            value={editData.location}
                                                            onChange={(e) => setEditData({ ...editData, location: e.target.value })}
                                                            className="px-2 py-1 text-xs border rounded"
                                                        >
                                                            {availableLocations.map(loc => (<option key={loc} value={loc}>{loc}</option>))}
                                                        </select>
                                                        <select
                                                            value={editData.shift}
                                                            onChange={(e) => setEditData({ ...editData, shift: e.target.value })}
                                                            className="px-2 py-1 text-xs border rounded"
                                                        >
                                                            <option value="Morning">Morning</option>
                                                            <option value="Evening">Evening</option>
                                                            <option value="Both">Both</option>
                                                        </select>
                                                        <select
                                                            value={editData.status}
                                                            onChange={(e) => setEditData({ ...editData, status: e.target.value })}
                                                            className="px-2 py-1 text-xs border rounded"
                                                        >
                                                            <option value="Present">Present</option>
                                                            <option value="Half Day">Half Day</option>
                                                            <option value="Absent">Absent</option>
                                                        </select>
                                                        <div className="flex flex-col gap-1">
                                                            <div className="flex items-center gap-1">
                                                                <span className="text-[10px] text-gray-400 w-8">Arr:</span>
                                                                <TimeInput
                                                                    value={editData.arrivalTime}
                                                                    onChange={(val) => setEditData({ ...editData, arrivalTime: val })}
                                                                />
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <span className="text-[10px] text-gray-400 w-8">Leav:</span>
                                                                <TimeInput
                                                                    value={editData.leavingTime}
                                                                    onChange={(val) => setEditData({ ...editData, leavingTime: val })}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="number"
                                                            value={editData.salary}
                                                            onChange={(e) => setEditData({ ...editData, salary: Number(e.target.value) })}
                                                            className="w-20 px-2 py-1 text-xs border rounded"
                                                            min="0"
                                                        />
                                                        <button
                                                            onClick={() => handleSave(record)}
                                                            className="text-green-600 hover:text-green-800 p-1.5 rounded-lg hover:bg-green-50 transition-colors"
                                                        >
                                                            <Save size={16} />
                                                        </button>
                                                        <button
                                                            onClick={handleCancelEdit}
                                                            className="text-red-600 hover:text-red-800 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <span className={`font-semibold ${record.salaryOverride ? 'text-orange-600' : 'text-green-600'}`}>
                                                        ₹{record.salary || getPartTimeDailySalary(record.date)}
                                                    </span>
                                                    {record.salaryOverride && (
                                                        <span className="text-xs text-orange-600">(edited)</span>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {editingAttendance !== record.id && (
                                                <div className="flex gap-1">
                                                    <button
                                                        onClick={() => handleEdit(record)}
                                                        className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50 transition-colors"
                                                        title="Edit record"
                                                    >
                                                        <Edit2 size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(record.id)}
                                                        className="bg-red-50 !text-red-700 hover:bg-red-600 hover:!text-white p-2 rounded-lg transition-all border border-red-100 hover:border-red-600 shadow-sm"
                                                        title="Delete record"
                                                    >
                                                        <Trash2 size={16} strokeWidth={2.5} />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Monthly Salary Report */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-6">
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between mb-6 gap-4">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <DollarSign className="text-green-600" size={20} />
                        Part-Time Staff Salary Report
                        {userLocation && (
                            <span className="text-sm text-gray-500">- {userLocation}</span>
                        )}
                    </h2>
                    <div className="flex flex-wrap gap-2 md:gap-4">
                        {/* Multi-Location Filter Dropdown */}
                        <div className="relative" ref={dropdownRef}>
                            <button
                                onClick={() => setShowLocationDropdown(!showLocationDropdown)}
                                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm bg-white hover:bg-gray-50 flex items-center gap-2"
                            >
                                {getLocationButtonText()}
                                <span className="text-xs">▼</span>
                            </button>
                            {showLocationDropdown && (
                                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50 min-w-[200px]">
                                    <div className="p-2 space-y-1">
                                        <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={reportLocationFilter.includes('All')}
                                                onChange={() => handleLocationToggle('All')}
                                                className="w-4 h-4 text-purple-600 rounded"
                                            />
                                            <span className="text-sm">All Locations</span>
                                        </label>
                                        <hr className="my-1" />
                                        {['Big Shop', 'Small Shop', 'Godown'].map(location => (
                                            <label key={location} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={reportLocationFilter.includes(location)}
                                                    onChange={() => handleLocationToggle(location)}
                                                    className="w-4 h-4 text-purple-600 rounded"
                                                />
                                                <span className="text-sm">{location}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <select
                            value={reportType}
                            onChange={(e) => setReportType(e.target.value as 'monthly' | 'weekly' | 'dateRange')}
                            className="px-2 md:px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                        >
                            <option value="monthly">Monthly</option>
                            <option value="weekly">Weekly</option>
                            <option value="dateRange">Date Range</option>
                        </select>

                        {/* Settlement Filter */}
                        <select
                            value={settlementFilter}
                            onChange={(e) => setSettlementFilter(e.target.value as 'all' | 'settled' | 'unsettled')}
                            className="px-2 md:px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                        >
                            <option value="all">All Status</option>
                            <option value="settled">✓ Settled</option>
                            <option value="unsettled">○ Not Settled</option>
                        </select>

                        {reportType === 'monthly' && (
                            <div className="flex flex-wrap items-center gap-2">
                                <select
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                                    className="px-2 md:px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                                >
                                    {Array.from({ length: 12 }, (_, i) => (
                                        <option key={i} value={i}>
                                            {new Date(0, i).toLocaleString('default', { month: 'long' })}
                                        </option>
                                    ))}
                                </select>
                                <select
                                    value={selectedYear}
                                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                                    className="px-2 md:px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                                >
                                    {Array.from({ length: 5 }, (_, i) => (
                                        <option key={i} value={new Date().getFullYear() - 2 + i}>
                                            {new Date().getFullYear() - 2 + i}
                                        </option>
                                    ))}
                                </select>
                                <span className="badge-premium badge-success">
                                    {new Date(0, selectedMonth).toLocaleString('default', { month: 'long' })} {selectedYear}
                                </span>
                            </div>
                        )}

                        {reportType === 'weekly' && (() => {
                            const weeks = getWeeksInMonth(selectedYear, selectedMonth);
                            const selectedWeekData = weeks[selectedWeek];
                            return (
                                <div className="flex flex-wrap items-center gap-2">
                                    <select
                                        value={selectedMonth}
                                        onChange={(e) => setSelectedMonth(Number(e.target.value))}
                                        className="px-2 md:px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                                    >
                                        {Array.from({ length: 12 }, (_, i) => (
                                            <option key={i} value={i}>
                                                {new Date(0, i).toLocaleString('default', { month: 'long' })}
                                            </option>
                                        ))}
                                    </select>
                                    <select
                                        value={selectedYear}
                                        onChange={(e) => setSelectedYear(Number(e.target.value))}
                                        className="px-2 md:px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                                    >
                                        {Array.from({ length: 5 }, (_, i) => (
                                            <option key={i} value={new Date().getFullYear() - 2 + i}>
                                                {new Date().getFullYear() - 2 + i}
                                            </option>
                                        ))}
                                    </select>
                                    <select
                                        value={selectedWeek}
                                        onChange={(e) => setSelectedWeek(Number(e.target.value))}
                                        className="px-2 md:px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                                    >
                                        {weeks.map((week, index) => (
                                            <option key={index} value={index}>
                                                Week {index + 1}: {week.start} - {week.end}
                                            </option>
                                        ))}
                                    </select>
                                    {selectedWeekData && (
                                        <span className="badge-premium badge-purple">
                                            Current Week: {selectedWeekData.start} - {selectedWeekData.end}
                                        </span>
                                    )}
                                </div>
                            );
                        })()}

                        {reportType === 'dateRange' && (
                            <>
                                <input
                                    type="date"
                                    value={dateRange.start}
                                    onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                                    className="px-2 md:px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                                />
                                <span className="text-gray-500">to</span>
                                <input
                                    type="date"
                                    value={dateRange.end}
                                    min={dateRange.start}
                                    onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                                    className="px-2 md:px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                                />
                            </>
                        )}
                    </div>
                </div>

                {/* Search Bar */}
                <div className="mb-4">
                    <div className="relative w-full md:w-96">
                        <input
                            type="text"
                            placeholder="Search staff by name..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                    {searchQuery && (
                        <p className="mt-2 text-sm text-gray-500">
                            Showing {partTimeSalaries.length} result(s) for "{searchQuery}"
                        </p>
                    )}
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-3 md:px-6 py-3 md:py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                            checked={selectedStaff.size > 0 && partTimeSalaries.every(s => selectedStaff.has(`${s.staffName}-${s.location}`))}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    const newSelection = new Set<string>();
                                                    partTimeSalaries.forEach(s => newSelection.add(`${s.staffName}-${s.location}`));
                                                    setSelectedStaff(newSelection);
                                                } else {
                                                    setSelectedStaff(new Set());
                                                }
                                            }}
                                        />
                                        <span>Select</span>
                                    </div>
                                </th>
                                <th className="px-3 md:px-6 py-3 md:py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">S.No</th>
                                <th className="sticky left-0 z-10 bg-gray-50 px-3 md:px-6 py-3 md:py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Name</th>
                                <th className="px-3 md:px-6 py-3 md:py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                                {reportType === 'weekly' && getWeeksInMonth(selectedYear, selectedMonth)[selectedWeek] && (() => {
                                    const weekData = getWeeksInMonth(selectedYear, selectedMonth)[selectedWeek];
                                    const headers = [];

                                    for (let i = 0; i < 7; i++) {
                                        const currentDate = new Date(weekData.startDate);
                                        currentDate.setDate(currentDate.getDate() + i);
                                        const dayNum = currentDate.getDate();
                                        const monthName = currentDate.toLocaleDateString('en-US', { month: 'short' });

                                        headers.push(
                                            <th key={i} className="w-16 min-w-[64px] px-1 py-3 md:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                <div>{dayNum}</div>
                                                <div className="text-[10px] text-gray-400">{monthName}</div>
                                            </th>
                                        );
                                    }
                                    return headers;
                                })()}
                                {reportType !== 'weekly' && (
                                    <>
                                        <th className="px-3 md:px-6 py-3 md:py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">Daily Attendance</th>
                                        <th className="px-3 md:px-6 py-3 md:py-4 text-center text-sm font-bold text-gray-700 uppercase tracking-wider">Weekly Breakdown</th>
                                    </>
                                )}
                                <th className="px-3 md:px-6 py-3 md:py-4 text-center text-sm font-bold text-gray-700 uppercase tracking-wider">Advance</th>
                                <th className="px-3 md:px-6 py-3 md:py-4 text-right text-sm font-bold text-gray-700 uppercase tracking-wider">Earned</th>
                                <th className="px-3 md:px-6 py-3 md:py-4 text-center text-sm font-bold text-gray-700 uppercase tracking-wider">Status</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {partTimeSalaries.length === 0 ? (
                                <tr>
                                    <td colSpan={reportType === 'weekly' ? 14 : 9} className="px-6 py-4 text-center text-gray-500 text-base">
                                        No records found for the selected period
                                    </td>
                                </tr>
                            ) : (
                                partTimeSalaries.map((salary, index) => {
                                    const settlementStatus = getSettlementStatus(salary.staffName, salary.location);
                                    const staffSettled = settlementStatus.isFullySettled;
                                    const staffPartial = settlementStatus.isPartiallySettled;

                                    // Get advance record for this week (only applicable in weekly view for input)
                                    // For monthly/date range, we might show total advanced? 
                                    // Requirement mainly detailed weekly logic. Let's focus on that for input.

                                    const advanceKey = `${salary.staffName}-${salary.location}-${selectedYear}-${selectedMonth}-${selectedWeek}`;
                                    const advanceRecord = advanceRecords[advanceKey];
                                    const advanceAmount = advanceRecord?.advanceGiven || 0;
                                    const pendingAmount = advanceRecord?.pendingSalary || 0;
                                    const closingBalance = advanceRecord?.closingBalance || 0;
                                    // Make sure we carry forward opening balance for display if needed? 
                                    // For now, closing balance is what matters - "Carry this +200 forward"

                                    // Determine row background color
                                    let rowBgClass = 'hover:bg-gray-50';
                                    if (staffSettled) {
                                        rowBgClass = 'bg-green-200 hover:bg-green-300';
                                    } else if (staffPartial) {
                                        rowBgClass = 'bg-yellow-100 hover:bg-yellow-200';
                                    }

                                    return (
                                        <tr key={`${salary.staffName}-${index}`} className={`text-sm md:text-base ${rowBgClass}`}>
                                            <td className="px-3 md:px-6 py-4 whitespace-nowrap">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedStaff.has(`${salary.staffName}-${salary.location}`)}
                                                    onChange={(e) => {
                                                        const newSelection = new Set(selectedStaff);
                                                        const key = `${salary.staffName}-${salary.location}`;
                                                        if (e.target.checked) {
                                                            newSelection.add(key);
                                                        } else {
                                                            newSelection.delete(key);
                                                        }
                                                        setSelectedStaff(newSelection);
                                                    }}
                                                    className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 w-5 h-5"
                                                />
                                            </td>
                                            <td className="px-3 md:px-6 py-4 whitespace-nowrap text-gray-900">{index + 1}</td>
                                            <td className={`sticky left-0 z-10 px-3 md:px-6 py-4 whitespace-nowrap font-medium text-gray-900 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${staffSettled ? 'bg-green-200' : staffPartial ? 'bg-yellow-100' : 'bg-white'}`}>
                                                {salary.staffName}
                                            </td>
                                            <td className="px-3 md:px-6 py-4 whitespace-nowrap">
                                                <span className="badge-premium badge-purple">
                                                    {salary.location}
                                                </span>
                                            </td>
                                            {reportType === 'weekly' && (() => {
                                                const weekData = getWeeksInMonth(selectedYear, selectedMonth)[selectedWeek];
                                                if (!weekData) return null;

                                                const dailySalaries: Record<string, number> = {};

                                                // Map all attendance to date strings (YYYY-MM-DD)
                                                salary.weeklyBreakdown.flatMap(week => week.days).forEach(day => {
                                                    const dateKey = day.date; // Already in YYYY-MM-DD format
                                                    dailySalaries[dateKey] = day.salary;
                                                });

                                                // Generate 7 columns for the week
                                                return Array.from({ length: 7 }, (_, i) => {
                                                    const currentDate = new Date(weekData.startDate);
                                                    currentDate.setDate(currentDate.getDate() + i);

                                                    // Create local date string manually to avoid timezone shifts
                                                    const year = currentDate.getFullYear();
                                                    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
                                                    const day = String(currentDate.getDate()).padStart(2, '0');
                                                    const dateKey = `${year}-${month}-${day}`;

                                                    const salary = dailySalaries[dateKey];

                                                    return (
                                                        <td key={i} className="w-16 min-w-[64px] px-1 py-4 text-center text-gray-900 font-semibold">
                                                            {salary ? `₹${salary}` : '-'}
                                                        </td>
                                                    );
                                                });
                                            })()}
                                            {reportType !== 'weekly' && (
                                                <>
                                                    <td className="px-3 md:px-6 py-4 text-left text-gray-900">
                                                        <div className="flex flex-col gap-1">
                                                            {salary.weeklyBreakdown.flatMap(week => week.days).map((day, dayIndex) => (
                                                                <div key={dayIndex} className="text-xs">
                                                                    {new Date(day.date).toLocaleDateString('en-GB', {
                                                                        day: '2-digit',
                                                                        month: '2-digit',
                                                                        year: '2-digit'
                                                                    })} - ₹{day.salary}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 md:px-6 py-4 whitespace-nowrap text-center">
                                                        <div className="flex flex-col gap-1">
                                                            {salary.weeklyBreakdown.map((week, wIndex) => (
                                                                <div key={wIndex} className="text-xs text-gray-500">
                                                                    Week {week.week}: ₹{week.weekTotal}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </td>
                                                </>
                                            )}

                                            {reportType === 'weekly' && (
                                                <td className="px-3 md:px-6 py-4 whitespace-nowrap text-center">
                                                    <AdvanceInput
                                                        initialValue={advanceAmount}
                                                        staffName={salary.staffName}
                                                        location={salary.location}
                                                        year={selectedYear}
                                                        month={selectedMonth}
                                                        week={selectedWeek}
                                                        onSave={async (amount) => {
                                                            try {
                                                                const currentWeekInfo = getWeeksInMonth(selectedYear, selectedMonth)[selectedWeek];

                                                                // Get opening balance for this week
                                                                const openingBalance = advanceRecord?.openingBalance ||
                                                                    await partTimeAdvanceService.getOpeningBalance(
                                                                        salary.staffName,
                                                                        salary.location,
                                                                        selectedYear,
                                                                        selectedMonth,
                                                                        selectedWeek
                                                                    );

                                                                await partTimeAdvanceService.upsert({
                                                                    staffName: salary.staffName,
                                                                    location: salary.location,
                                                                    year: selectedYear,
                                                                    month: selectedMonth,
                                                                    weekNumber: selectedWeek,
                                                                    weekStartDate: currentWeekInfo.startDate.toISOString().split('T')[0],
                                                                    openingBalance: openingBalance,
                                                                    earnings: salary.totalEarnings,
                                                                    adjustment: 0,
                                                                    advanceGiven: amount,
                                                                    closingBalance: 0,
                                                                    pendingSalary: 0
                                                                });

                                                                loadAdvanceData();
                                                            } catch (error) {
                                                                console.error('Failed to save advance', error);
                                                            }
                                                        }}
                                                    />
                                                </td>
                                            )}
                                            {reportType !== 'weekly' && (
                                                <td className="px-3 md:px-6 py-4 whitespace-nowrap text-center text-gray-700 font-medium">
                                                    {aggregatedAdvances[`${salary.staffName}-${salary.location}`] > 0
                                                        ? `₹${aggregatedAdvances[`${salary.staffName}-${salary.location}`]}`
                                                        : '-'}
                                                </td>
                                            )}
                                            <td className="px-3 md:px-6 py-4 whitespace-nowrap text-right font-bold text-green-600 text-lg">
                                                {(() => {
                                                    const advance = reportType === 'weekly'
                                                        ? (advanceRecords[`${salary.staffName}-${salary.location}-${selectedYear}-${selectedMonth}-${selectedWeek}`]?.advanceGiven || 0)
                                                        : (aggregatedAdvances[`${salary.staffName}-${salary.location}`] || 0);
                                                    return `₹${Math.max(0, salary.totalEarnings - advance)}`;
                                                })()}
                                            </td>
                                            <td className="px-3 md:px-6 py-4 whitespace-nowrap text-center">
                                                <div className="flex flex-col items-center gap-2">
                                                    {staffSettled ? (
                                                        <button
                                                            onClick={() => toggleSettlement(salary.staffName, salary.location)}
                                                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-sm font-medium"
                                                            title="Click to revert"
                                                        >
                                                            <CheckCircle size={16} />
                                                            <span>Settled</span>
                                                        </button>
                                                    ) : (
                                                        <div className="flex flex-col gap-1">
                                                            <button
                                                                onClick={() => toggleSettlement(salary.staffName, salary.location)}
                                                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-purple-100 hover:text-purple-700 transition-colors text-sm font-medium"
                                                            >
                                                                <span>Settle</span>
                                                            </button>

                                                            {/* Status Info based on Advance */}
                                                            {reportType === 'weekly' && (
                                                                <div className="text-xs font-medium">
                                                                    {pendingAmount > 0 && (
                                                                        <span className="text-green-600 block">
                                                                            Pay Pending: ₹{pendingAmount}
                                                                        </span>
                                                                    )}
                                                                    {closingBalance > 0 && (
                                                                        <span className="text-red-500 block">
                                                                            Carry Fwd: ₹{closingBalance}
                                                                            <span className="text-gray-400 font-normal ml-1">
                                                                                (Owes)
                                                                            </span>
                                                                        </span>
                                                                    )}
                                                                    {advanceAmount > 0 && pendingAmount === 0 && closingBalance === 0 && (
                                                                        <span className="text-gray-500 block">
                                                                            Fully Adjusted
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                        <tfoot className="bg-gray-50 font-bold">
                            <tr>
                                <td colSpan={reportType === 'weekly' ? (getWeeksInMonth(selectedYear, selectedMonth)[selectedWeek] ? 4 + (getWeeksInMonth(selectedYear, selectedMonth)[selectedWeek].endDay - getWeeksInMonth(selectedYear, selectedMonth)[selectedWeek].startDay + 1) : 11) : 6} className="px-3 md:px-6 py-4 text-right text-base text-gray-900">Total Net Payable:</td>
                                <td className="px-3 md:px-6 py-4 text-right text-green-600 text-lg">
                                    ₹{partTimeSalaries.reduce((sum, salary) => {
                                        const advance = reportType === 'weekly'
                                            ? (advanceRecords[`${salary.staffName}-${salary.location}-${selectedYear}-${selectedMonth}-${selectedWeek}`]?.advanceGiven || 0)
                                            : (aggregatedAdvances[`${salary.staffName}-${salary.location}`] || 0);
                                        return sum + Math.max(0, salary.totalEarnings - advance);
                                    }, 0)}
                                </td>
                                <td></td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            {/* Past Salary & Advance Report */}
            <div className="bg-white rounded-lg shadow p-6 mt-8 mb-8">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Calendar size={20} className="text-purple-600" />
                    Past Salary & Advance Report
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Staff Name</label>
                        <select
                            value={reportStaffFilter}
                            onChange={(e) => setReportStaffFilter(e.target.value)}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500"
                        >
                            <option value="All">All Staff</option>
                            {Array.from(new Set([
                                ...attendance.filter(r => r.isPartTime).map(r => r.staffName || '')
                            ].filter(Boolean))).sort().map(name => (
                                <option key={name} value={name}>{name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
                        <input
                            type="date"
                            value={reportStartDate}
                            onChange={(e) => setReportStartDate(e.target.value)}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
                        <input
                            type="date"
                            value={reportEndDate}
                            onChange={(e) => setReportEndDate(e.target.value)}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500"
                        />
                    </div>
                    <div className="flex items-end gap-2">
                        <button
                            onClick={loadPastReport}
                            className="flex-1 bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                        >
                            Generate
                        </button>
                        <div className="flex rounded-md shadow-sm" role="group">
                            <button
                                type="button"
                                onClick={() => setReportViewType('Detailed')}
                                className={`px-4 py-2 text-sm font-medium rounded-l-lg border ${reportViewType === 'Detailed' ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
                            >
                                Detailed
                            </button>
                            <button
                                type="button"
                                onClick={() => setReportViewType('Summary')}
                                className={`px-4 py-2 text-sm font-medium rounded-r-lg border ${reportViewType === 'Summary' ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
                            >
                                Summary
                            </button>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Staff / Location</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    {reportViewType === 'Detailed' ? 'Period' : 'Summary Period'}
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Opening Bal</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Earned</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Advance</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Adjusted</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Closing Bal</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Pending Pay</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {isReportLoading ? (
                                <tr><td colSpan={8} className="px-6 py-4 text-center text-gray-500">Loading...</td></tr>
                            ) : pastReportData.length === 0 ? (
                                <tr><td colSpan={8} className="px-6 py-4 text-center text-gray-500">No records found</td></tr>
                            ) : reportViewType === 'Detailed' ? (
                                pastReportData.map((record) => (
                                    <tr key={record.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="font-medium text-gray-900">{record.staffName}</div>
                                            <div className="text-xs text-gray-500">{record.location}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            W{record.weekNumber + 1}, {new Date(0, record.month).toLocaleString('default', { month: 'short' })} {record.year}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">₹{record.openingBalance}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-green-600 font-medium">₹{record.earnings}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">₹{record.advanceGiven}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">₹{record.adjustment}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-red-600">
                                            {record.closingBalance > 0 ? `₹${record.closingBalance}` : '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-green-600">
                                            {record.pendingSalary > 0 ? `₹${record.pendingSalary}` : '-'}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                // Summary View Interaction
                                Object.values(pastReportData.reduce((acc: Record<string, PartTimeAdvanceRecord & { count: number }>, curr: PartTimeAdvanceRecord) => {
                                    const key = `${curr.staffName}-${curr.location}`;
                                    if (!acc[key]) {
                                        acc[key] = {
                                            ...curr,
                                            openingBalance: curr.openingBalance, // First record opening
                                            earnings: 0,
                                            advanceGiven: 0,
                                            adjustment: 0,
                                            closingBalance: 0,
                                            pendingSalary: 0,
                                            count: 0
                                        };
                                    }
                                    const group = acc[key];
                                    // Aggregate
                                    group.earnings += curr.earnings;
                                    group.advanceGiven += curr.advanceGiven;
                                    group.adjustment += curr.adjustment;
                                    // For closing/pending, we want the LAST record state
                                    // But since reduce order isn't guaranteed if not sorted, we should rely on dates.
                                    // Luckily API returns sorted by date.
                                    group.closingBalance = curr.closingBalance;
                                    group.pendingSalary = curr.pendingSalary;
                                    group.count += 1;
                                    return acc;
                                }, {} as Record<string, any>)).map((group: any, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50 font-medium">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="font-bold text-gray-900">{group.staffName}</div>
                                            <div className="text-xs text-gray-500">{group.location}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 italic">
                                            Summary of {group.count} weeks
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">₹{group.openingBalance}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-green-600">₹{group.earnings}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">₹{group.advanceGiven}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">₹{group.adjustment}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-red-600 font-bold">
                                            {group.closingBalance > 0 ? `₹${group.closingBalance}` : '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-green-600 font-bold">
                                            {group.pendingSalary > 0 ? `₹${group.pendingSalary}` : '-'}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        {pastReportData.length > 0 && (
                            <tfoot className="bg-gray-50 font-bold">
                                <tr>
                                    <td colSpan={2} className="px-6 py-4 text-right">Total:</td>
                                    {/* For totals, opening balance total is tricky (sum of openings? or just openings of unique staff?). 
                                        Usually Sum of Openings of filtered period. */}
                                    <td className="px-6 py-4 text-right">
                                        {reportViewType === 'Detailed'
                                            ? `₹${pastReportData.reduce((s, r) => s + r.openingBalance, 0)}`
                                            : '-' /* Summary total opening is ambiguous */}
                                    </td>
                                    <td className="px-6 py-4 text-right">₹{pastReportData.reduce((s, r) => s + r.earnings, 0)}</td>
                                    <td className="px-6 py-4 text-right">₹{pastReportData.reduce((s, r) => s + r.advanceGiven, 0)}</td>
                                    <td className="px-6 py-4 text-right">₹{pastReportData.reduce((s, r) => s + r.adjustment, 0)}</td>
                                    <td className="px-6 py-4 text-right">₹{pastReportData.reduce((s, r) => s + (reportViewType === 'Detailed' ? r.closingBalance : 0), 0)}</td>
                                    <td className="px-6 py-4 text-right">₹{pastReportData.reduce((s, r) => s + (reportViewType === 'Detailed' ? r.pendingSalary : 0), 0)}</td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>

            {/* Currency Note Breakdown */}
            {partTimeSalaries.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <DollarSign className="text-blue-600" size={20} />
                            Currency Note Breakdown
                        </div>
                        <span className="text-green-600">Total Net Payable: ₹{partTimeSalaries.reduce((sum, salary) => {
                            const advance = reportType === 'weekly'
                                ? (advanceRecords[`${salary.staffName}-${salary.location}-${selectedYear}-${selectedMonth}-${selectedWeek}`]?.advanceGiven || 0)
                                : (aggregatedAdvances[`${salary.staffName}-${salary.location}`] || 0);
                            return sum + Math.max(0, salary.totalEarnings - advance);
                        }, 0)}</span>
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {sortedDenominations.map(denom => (
                            <div key={denom} className="bg-gray-50 p-3 rounded-lg flex justify-between items-center">
                                <span className="font-medium text-gray-700">₹{denom}</span>
                                <span className="font-bold text-blue-600">x {currencyBreakdown[denom]}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg p-6 max-w-sm w-full">
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Confirm Delete</h3>
                        <p className="text-gray-600 mb-6">Are you sure you want to delete this attendance record?</p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowDeleteModal(null)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Settings Modal */}
            {showSettings && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg p-6 max-w-md w-full">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-gray-900">Part-Time Salary Rates</h3>
                            <button
                                onClick={() => {
                                    setShowSettings(false);
                                    setPartTimeRates(settingsService.getPartTimeRates()); // Reset
                                }}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Weekday Rate (₹)
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <span className="text-gray-500 sm:text-sm">₹</span>
                                    </div>
                                    <input
                                        type="number"
                                        value={partTimeRates.weekdayRate}
                                        onChange={(e) => setPartTimeRates({
                                            ...partTimeRates,
                                            weekdayRate: Number(e.target.value)
                                        })}
                                        className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                    />
                                </div>
                                <p className="mt-1 text-xs text-gray-500">Base rate for Monday to Saturday</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Sunday Rate (₹)
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <span className="text-gray-500 sm:text-sm">₹</span>
                                    </div>
                                    <input
                                        type="number"
                                        value={partTimeRates.sundayRate}
                                        onChange={(e) => setPartTimeRates({
                                            ...partTimeRates,
                                            sundayRate: Number(e.target.value)
                                        })}
                                        className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                    />
                                </div>
                                <p className="mt-1 text-xs text-gray-500">Special rate for Sundays</p>
                            </div>

                            <div className="bg-blue-50 p-3 rounded-lg flex items-start gap-2">
                                <Clock className="text-blue-600 mt-0.5 flex-shrink-0" size={16} />
                                <div className="text-xs text-blue-700">
                                    <p className="font-medium">Note:</p>
                                    <ul className="list-disc list-inside mt-1 space-y-0.5">
                                        <li>Morning/Evening shifts earn 50% of these rates</li>
                                        <li>Changes apply to all future auto-calculations</li>
                                        <li>Existing manual overrides are preserved</li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => {
                                    setShowSettings(false);
                                    setPartTimeRates(settingsService.getPartTimeRates()); // Reset
                                }}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    settingsService.updatePartTimeRates(partTimeRates);
                                    setShowSettings(false);
                                    // Force re-render to update calculated salaries
                                    window.location.reload();
                                }}
                                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
                            >
                                <Save size={16} />
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );


};

export default PartTimeStaff;

