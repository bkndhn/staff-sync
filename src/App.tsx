import React, { useState, useEffect, useMemo, useCallback, Suspense, useRef } from 'react';
import Navigation from './components/Navigation';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import AttendanceTracker from './components/AttendanceTracker';
import SalaryHikeModal from './components/SalaryHikeModal';
import { Staff, Attendance, OldStaffRecord, SalaryHike, NavigationTab, AdvanceDeduction, User } from './types';
import { staffService } from './services/staffService';
import { attendanceService } from './services/attendanceService';
import { advanceService } from './services/advanceService';
import { oldStaffService } from './services/oldStaffService';
import { salaryHikeService } from './services/salaryHikeService';
import { isSunday } from './utils/salaryCalculations';
import { isSupabaseConfigured } from './lib/supabase';
import { cacheService, CACHE_KEYS, CACHE_TTL } from './lib/cacheService';
import { AuditLogViewer } from './components/AuditLogViewer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { auditLogService } from './services/auditLogService';
import { offlineSyncService } from './services/offlineSyncService';
const StaffManagement = React.lazy(() => import('./components/StaffManagement'));
const SalaryManagement = React.lazy(() => import('./components/SalaryManagement'));
const PartTimeStaff = React.lazy(() => import('./components/PartTimeStaff'));
const OldStaffRecords = React.lazy(() => import('./components/OldStaffRecords'));
const Settings = React.lazy(() => import('./components/Settings'));
const StaffPortal = React.lazy(() => import('./components/StaffPortal'));
const LeaveManagement = React.lazy(() => import('./components/LeaveManagement'));
const FaceAttendance = React.lazy(() => import('./components/FaceAttendance'));


// ─── Prefetch all lazy chunks in the background after login ───────────────────
// Makes every tab switch instant — JS chunks are cached before the user clicks.
const prefetchAllComponents = () => {
  import('./components/StaffManagement');
  import('./components/SalaryManagement');
  import('./components/PartTimeStaff');
  import('./components/OldStaffRecords');
  import('./components/Settings');
  import('./components/StaffPortal');
  import('./components/LeaveManagement');
  import('./components/FaceAttendance');
};

// ─── Skeleton shimmer ─────────────────────────────────────────────────────────
const SkeletonLoader = () => (
  <div className="p-4 md:p-6 space-y-4 animate-pulse">
    {[1, 2, 3].map(i => (
      <div key={i} className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-3">
        <div className="h-4 bg-white/10 rounded w-1/3" />
        <div className="h-3 bg-white/8 rounded w-2/3" />
        <div className="h-3 bg-white/8 rounded w-1/2" />
      </div>
    ))}
  </div>
);

// Minimal inline loader for lazy-loaded component JS chunks
const ComponentLoader = () => <SkeletonLoader />;


function App() {
  const [user, setUser] = useState<User | null>(() => {
    // ── Synchronous session restore — no async useEffect needed ──────────────
    try {
      const saved = localStorage.getItem('staffManagementLogin');
      if (!saved) return null;
      const d = JSON.parse(saved);
      if (d?.user?.email && d?.user?.role) {
        if (d.expiresAt && Date.now() > d.expiresAt) { localStorage.removeItem('staffManagementLogin'); return null; }
        return d.user as User;
      }
    } catch {}
    return null;
  });
  const [activeTab, setActiveTabState] = useState<NavigationTab>(() => {
    const saved = localStorage.getItem('activeTab');
    return (saved as NavigationTab) || 'Dashboard';
  });
  const setActiveTab = (tab: NavigationTab) => {
    setActiveTabState(tab);
    try { localStorage.setItem('activeTab', tab); } catch {}
  };

  // ── Pre-hydrate from localStorage cache — instant first render ───────────
  // Data is already in state when first paint happens; Supabase refreshes in bg.
  const [staff, setStaff] = useState<Staff[]>(() => cacheService.get<Staff[]>(CACHE_KEYS.STAFF) ?? []);
  const [attendance, setAttendance] = useState<Attendance[]>(() => cacheService.get<Attendance[]>(CACHE_KEYS.ATTENDANCE) ?? []);
  const [advances, setAdvances] = useState<AdvanceDeduction[]>(() => cacheService.get<AdvanceDeduction[]>(CACHE_KEYS.ADVANCES) ?? []);
  const [oldStaffRecords, setOldStaffRecords] = useState<OldStaffRecord[]>(() => cacheService.get<OldStaffRecord[]>(CACHE_KEYS.OLD_STAFF) ?? []);
  const [salaryHikes, setSalaryHikes] = useState<SalaryHike[]>(() => cacheService.get<SalaryHike[]>(CACHE_KEYS.SALARY_HIKES) ?? []);
  // isFirstLoad: true only when there is literally NO cached data at all
  const firstLoadDone = useRef(false);
  const [isFirstLoad, setIsFirstLoad] = useState(() => !cacheService.get(CACHE_KEYS.STAFF));
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [salaryHikeModal, setSalaryHikeModal] = useState<{
    isOpen: boolean;
    staffId: string;
    staffName: string;
    currentSalary: number;
    newSalary: number;
    onConfirm: (isHike: boolean, reason?: string, hikeDate?: string) => void;
  } | null>(null);

  useEffect(() => {
    const handleSyncComplete = (e: any) => {
      if (e.detail?.synced) {
        // Refresh view data to stay aligned
        loadAllData();
      }
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'FLUSH_OFFLINE_QUEUE') {
        if (navigator.onLine) {
          offlineSyncService.flushQueue((punch) => {
            const { id, queuedAt, ...payload } = punch;
            return attendanceService.upsertRemoteOnly(payload);
          });
        }
      }
    };

    window.addEventListener('offline-sync-complete', handleSyncComplete);
    navigator.serviceWorker?.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('offline-sync-complete', handleSyncComplete);
      navigator.serviceWorker?.removeEventListener('message', handleMessage);
    };
  }, []);

  // Theme state - Lifted from Dashboard
  const [isDarkTheme, setIsDarkTheme] = useState(() => {
    // Only respect saved theme if the user explicitly toggled it.
    // Otherwise default to dark mode across all pages, including login.
    const userSet = localStorage.getItem('themeUserSet') === '1';
    const savedTheme = localStorage.getItem('theme');
    if (userSet && savedTheme === 'light') return false;
    return true;
  });

  // Apply theme on change
  useEffect(() => {
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');

    if (isDarkTheme) {
      document.body.classList.remove('light-theme');
      localStorage.setItem('theme', 'dark');
      // Update status bar color for dark theme
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', '#0f0f1a');
      }
    } else {
      document.body.classList.add('light-theme');
      localStorage.setItem('theme', 'light');
      // Update status bar color for light theme
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', '#f5f7fa');
      }
    }
  }, [isDarkTheme]);

  const toggleTheme = () => {
    localStorage.setItem('themeUserSet', '1');
    setIsDarkTheme(!isDarkTheme);
  };

  // ── Session is now restored synchronously in useState — no useEffect needed ─

  useEffect(() => {
    if (user) {
      // Fire background refresh — never blocks UI
      silentRefresh();
      // Prefetch all component chunks so every tab switch is instant
      prefetchAllComponents();
    }
  }, [user]);

  // Set default tab based on user role (only if no saved tab or role mismatch)
  useEffect(() => {
    if (!user) return;
    const saved = localStorage.getItem('activeTab') as NavigationTab | null;
    const validForRole = (tab: NavigationTab | null): boolean => {
      if (!tab) return false;
      if (user.role === 'staff') return tab === 'My Portal';
      if (user.role === 'manager') return tab !== 'Settings' && tab !== 'My Portal';
      return tab !== 'My Portal';
    };
    if (validForRole(saved)) {
      setActiveTab(saved!);
    } else if (user.role === 'staff') {
      setActiveTab('My Portal');
    } else if (user.role === 'manager') {
      setActiveTab('Face Attendance');
    } else {
      setActiveTab('Dashboard');
    }
  }, [user]);

  // ─── Stale-while-revalidate: always-fresh, never-blocking ─────────────────
  // Fetches fresh data from Supabase in the background without setting any
  // loading gate. State is updated when the response arrives, causing a
  // silent re-render with fresh data. UI stays visible throughout.
  const silentRefresh = useCallback(async () => {
    try {
      const [staffData, attendanceData, advanceData, oldStaffData, salaryHikeData] = await Promise.all([
        staffService.getAll(),
        attendanceService.getAll(),
        advanceService.getAll(),
        oldStaffService.getAll(),
        salaryHikeService.getAll(),
      ]);
      // Update cache
      cacheService.set(CACHE_KEYS.STAFF, staffData, CACHE_TTL.MEDIUM);
      cacheService.set(CACHE_KEYS.ATTENDANCE, attendanceData, CACHE_TTL.SHORT);
      cacheService.set(CACHE_KEYS.ADVANCES, advanceData, CACHE_TTL.MEDIUM);
      cacheService.set(CACHE_KEYS.OLD_STAFF, oldStaffData, CACHE_TTL.LONG);
      cacheService.set(CACHE_KEYS.SALARY_HIKES, salaryHikeData, CACHE_TTL.LONG);
      // Update UI state silently
      setStaff(staffData);
      setAttendance(attendanceData);
      setAdvances(advanceData);
      setOldStaffRecords(oldStaffData);
      setSalaryHikes(salaryHikeData);
    } catch (err) {
      console.error('Background refresh error:', err);
    } finally {
      firstLoadDone.current = true;
      setIsFirstLoad(false);
    }
  }, []);

  // loadAllData alias kept for compatibility (forceRefresh, offline sync, etc.)
  const loadAllData = silentRefresh;

  // Force refresh data (clears cache, then re-fetches)
  const forceRefreshData = async () => {
    cacheService.clearAll();
    await silentRefresh();
  };

  /**
   * Zero-latency surgical attendance patch.
   * Merges one record into the attendance[] array immediately (no network wait),
   * and invalidates the attendance cache so the next full load gets fresh data.
   * This is the primary mutation path used by FaceAttendance and AttendanceTracker.
   */
  const patchAttendance = useCallback((updated: Attendance) => {
    setAttendance(prev => {
      const idx = prev.findIndex(a =>
        a.staffId === updated.staffId &&
        a.date === updated.date &&
        !!a.isPartTime === !!updated.isPartTime
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updated;
        return next;
      }
      return [...prev, updated];
    });
    // Invalidate cache so next cold load fetches fresh data from Supabase
    cacheService.invalidate(CACHE_KEYS.ATTENDANCE);
  }, []);

  const handleLogin = (userData: { email: string; role: string; location?: string; staffId?: string; staffName?: string }) => {
    setUser(userData as User);
  };

  const handleLogout = () => {
    localStorage.removeItem('staffManagementLogin');
    localStorage.removeItem('activeTab');
    setUser(null);
    setActiveTab('Dashboard');
  };

  // Filter staff based on user role and location - memoized for performance
  const filteredStaff = useMemo(() => {
    if (user?.role === 'admin') {
      return staff;
    } else if (user?.role === 'manager' && user.location) {
      return staff.filter(member => member.location === user.location);
    }
    return [];
  }, [staff, user?.role, user?.location]);

  // Filter attendance based on user role and location - memoized for performance
  const filteredAttendance = useMemo(() => {
    if (user?.role === 'admin') {
      return attendance;
    } else if (user?.role === 'manager' && user.location) {
      const locationStaffIds = staff
        .filter(member => member.location === user.location)
        .map(member => member.id);

      return attendance.filter(record =>
        record.isPartTime
          ? true // Allow all part-time staff for managers
          : locationStaffIds.includes(record.staffId)
      );
    }
    return [];
  }, [attendance, staff, user?.role, user?.location]);

  // Auto-carry forward advances from previous month
  useEffect(() => {
    if (staff.length === 0 || advances.length === 0 || user?.role !== 'admin') return;

    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    staff.filter(s => s.isActive).forEach(async (_member) => {
      // Auto-carry forward logic placeholder
    });
  }, [staff, advances, user]);

  const updateAttendance = async (
    staffId: string,
    date: string,
    status: 'Present' | 'Half Day' | 'Absent',
    isPartTime?: boolean,
    staffName?: string,
    shift?: string,
    location?: string,
    salary?: number,
    salaryOverride?: boolean,
    arrivalTime?: string,
    leavingTime?: string
  ) => {
    // Check if manager is trying to edit non-today attendance
    if (user?.role === 'manager') {
      const today = new Date().toISOString().split('T')[0];
      if (date !== today) {
        alert('Managers can only edit today\'s attendance');
        return;
      }
    }

    // Handle part-time staff deletion
    if (isPartTime && status === 'Absent' && salary === 0) {
      try {
        // Find and delete the attendance record
        const recordToDelete = attendance.find(a =>
          a.staffId === staffId &&
          a.date === date &&
          a.isPartTime === true &&
          a.staffName === staffName
        );

        if (recordToDelete) {
          // Remove from local state
          setAttendance(prev => prev.filter(a => a.id !== recordToDelete.id));

          // Delete from database using Supabase
          const { error } = await attendanceService.delete(recordToDelete.id);
          if (error) {
            console.error('Error deleting attendance record:', error);
            // Restore the record if deletion failed
            setAttendance(prev => [...prev, recordToDelete]);
          }
        }
        return;
      } catch (error) {
        console.error('Error deleting part-time attendance:', error);
        return;
      }
    }

    const attendanceValue = status === 'Present' ? 1 : status === 'Half Day' ? 0.5 : 0;

    // Calculate default times if not provided
    let finalArrivalTime = arrivalTime;
    let finalLeavingTime = leavingTime;

    if (!finalArrivalTime && (status === 'Present' || status === 'Half Day')) {
      if (shift === 'Evening') {
        finalArrivalTime = '14:00';
      } else {
        // Morning or Both (or undefined)
        finalArrivalTime = '10:00';
      }
    }

    if (!finalLeavingTime && (status === 'Present' || status === 'Half Day')) {
      // Check location (either passed directly or from staff record if we had it, but loop doesn't give staff record here easily)
      // However, we can use the location passed in arg.
      // If location arg is missing, we might miss this default, but standard flow usually passes it or it exists on record.
      // For full-time staff, location is usually constant.

      // Ensure consistent check for Godown
      const locToCheck = location || '';
      if (locToCheck.toLowerCase().includes('godown')) {
        finalLeavingTime = '21:00';
      }
    }

    const attendanceRecord = {
      staffId,
      date,
      status,
      attendanceValue,
      isSunday: isSunday(date),
      isPartTime: !!isPartTime,
      staffName,
      shift: shift as any,
      location,
      salary,
      salaryOverride,
      arrivalTime: finalArrivalTime,
      leavingTime: finalLeavingTime
    };

    try {
      const savedAttendance = await attendanceService.upsert(attendanceRecord);

      // Record secure audit log
      auditLogService.log({
        action: 'attendance_override',
        staffId,
        staffName: staffName || 'Staff',
        details: `Marked attendance as ${status} for ${date} (${shift || 'Morning'})`,
        performedBy: user?.email || 'manager'
      });

      // Zero-latency optimistic update — no network wait
      patchAttendance(savedAttendance);
    } catch (error) {
      console.error('Error updating attendance:', error);
    }
  };

  // Delete part-time attendance record
  const deletePartTimeAttendance = async (attendanceId: string) => {
    try {
      // Find the record first
      const recordToDelete = attendance.find(a => a.id === attendanceId);
      if (!recordToDelete) return;

      // Remove from local state first
      setAttendance(prev => prev.filter(a => a.id !== attendanceId));

      // Delete from database
      await attendanceService.delete(attendanceId);
    } catch (error) {
      console.error('Error deleting part-time attendance:', error);
      // Reload data on error
      loadAllData();
    }
  };

  // Bulk update attendance (admin only)
  const bulkUpdateAttendance = async (date: string, status: 'Present' | 'Absent' | 'Half Day', shift?: 'Morning' | 'Evening', arrivalTime?: string, leavingTime?: string) => {
    // Allow both admin and managers to perform bulk updates
    if (!user || (user.role !== 'admin' && user.role !== 'manager')) {
      alert('Only administrators and managers can perform bulk updates');
      return;
    }

    // Filter staff based on user role and location
    let targetStaff = staff.filter(member => member.isActive);

    if (user.role === 'manager' && user.location) {
      // Managers can only bulk update staff from their location
      targetStaff = targetStaff.filter(member => member.location === user.location);
    }

    const attendanceRecords = targetStaff.map(member => ({
      staffId: member.id,
      date,
      status,
      attendanceValue: status === 'Present' ? 1 : status === 'Half Day' ? 0.5 : 0,
      isSunday: isSunday(date),
      isPartTime: false,
      ...(status === 'Half Day' && shift ? { shift } : {}),
      ...(arrivalTime ? { arrivalTime } : {}),
      ...(leavingTime ? { leavingTime } : {}),
    }));

    try {
      const savedRecords = await attendanceService.bulkUpsert(attendanceRecords);

      auditLogService.log({
        action: 'bulk_update',
        details: `Bulk marked active staff as ${status} for ${date}`,
        performedBy: user?.email || 'manager'
      });

      setAttendance(prev => {
        const filtered = prev.filter(a => !(a.date === date && !a.isPartTime));
        return [...filtered, ...savedRecords];
      });
    } catch (error) {
      console.error('Error bulk updating attendance:', error);
    }
  };

  // Add new staff member (admin only)
  const addStaff = async (newStaff: Omit<Staff, 'id'>) => {
    if (user?.role !== 'admin') {
      alert('Only administrators can add staff');
      return;
    }

    try {
      // Set initial salary for hike tracking
      const staffWithInitialSalary = {
        ...newStaff,
        initialSalary: newStaff.totalSalary
      };

      const savedStaff = await staffService.create(staffWithInitialSalary);
      setStaff(prev => [...prev, savedStaff]);
    } catch (error) {
      console.error('Error adding staff:', error);
    }
  };

  // Update staff member with salary hike tracking
  const updateStaff = async (id: string, updatedStaff: Partial<Staff>) => {
    if (user?.role !== 'admin') {
      alert('Only administrators can update staff');
      return;
    }

    const currentStaff = staff.find(s => s.id === id);
    if (!currentStaff) return;

    // Check if salary is being changed
    const isSalaryChange = updatedStaff.totalSalary && updatedStaff.totalSalary !== currentStaff.totalSalary;

    if (isSalaryChange) {
      // Show salary hike modal
      setSalaryHikeModal({
        isOpen: true,
        staffId: id,
        staffName: currentStaff.name,
        currentSalary: currentStaff.totalSalary,
        newSalary: updatedStaff.totalSalary!,
        onConfirm: async (isHike: boolean, reason?: string, hikeDate?: string) => {
          try {
            // Update staff record
            const savedStaff = await staffService.update(id, updatedStaff);
            setStaff(prev => prev.map(member =>
              member.id === id ? savedStaff : member
            ));

            // If it's a hike, record it with component breakdown
            if (isHike) {
              // Build breakdown from the NEW values being set
              const breakdown: Record<string, number> = {
                basic: updatedStaff.basicSalary ?? currentStaff.basicSalary,
                incentive: updatedStaff.incentive ?? currentStaff.incentive,
                hra: updatedStaff.hra ?? currentStaff.hra,
                meal_allowance: updatedStaff.mealAllowance ?? currentStaff.mealAllowance ?? 0,
                ...(updatedStaff.salarySupplements ?? currentStaff.salarySupplements ?? {})
              };

              // Also store the OLD values with a prefix for accurate diff display
              const oldBreakdown: Record<string, number> = {
                old_basic: currentStaff.basicSalary,
                old_incentive: currentStaff.incentive,
                old_hra: currentStaff.hra,
                old_meal_allowance: currentStaff.mealAllowance ?? 0,
                ...Object.fromEntries(
                  Object.entries(currentStaff.salarySupplements ?? {}).map(([k, v]) => [`old_${k}`, v])
                )
              };

              const salaryHike = {
                staffId: id,
                oldSalary: currentStaff.totalSalary,
                newSalary: updatedStaff.totalSalary!,
                hikeDate: hikeDate || new Date().toISOString().split('T')[0],
                reason,
                breakdown: { ...breakdown, ...oldBreakdown }
              };

              const savedHike = await salaryHikeService.create(salaryHike);

              auditLogService.log({
                action: 'salary_edit',
                staffId: id,
                staffName: currentStaff.name,
                details: `Updated total salary from ₹${currentStaff.totalSalary} to ₹${updatedStaff.totalSalary}`,
                performedBy: user?.email || 'admin'
              });

              setSalaryHikes(prev => [savedHike, ...prev]);
            }
          } catch (error) {
            console.error('Error updating staff:', error);
          }
        }
      });
    } else {
      // Regular update without salary change
      try {
        const savedStaff = await staffService.update(id, updatedStaff);

        auditLogService.log({
          action: 'staff_update',
          staffId: id,
          staffName: currentStaff.name,
          details: `Updated record properties`,
          performedBy: user?.email || 'admin'
        });

        setStaff(prev => prev.map(member =>
          member.id === id ? savedStaff : member
        ));
      } catch (error) {
        console.error('Error updating staff:', error);
      }
    }
  };

  // Delete staff member (admin only)
  const deleteStaff = async (id: string, reason: string) => {
    if (user?.role !== 'admin') {
      alert('Only administrators can delete staff');
      return;
    }

    const staffMember = staff.find(s => s.id === id);
    if (!staffMember) return;

    try {
      // Calculate outstanding advances
      const staffAdvances = advances.filter(adv => adv.staffId === id);
      const latestAdvance = staffAdvances
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
      const totalAdvanceOutstanding = latestAdvance?.newAdvance || 0;

      // Create old staff record
      const oldRecord = {
        originalStaffId: id,
        name: staffMember.name,
        location: staffMember.location,
        type: staffMember.type,
        experience: staffMember.experience,
        basicSalary: staffMember.basicSalary,
        incentive: staffMember.incentive,
        hra: staffMember.hra,
        totalSalary: staffMember.totalSalary,
        joinedDate: staffMember.joinedDate,
        leftDate: new Date().toLocaleDateString('en-US'),
        reason,
        salaryHistory: [],
        totalAdvanceOutstanding,
        lastAdvanceData: latestAdvance,
        contactNumber: staffMember.contactNumber,
        address: staffMember.address,
        photo: staffMember.photo
      };

      // Save to database
      const savedOldRecord = await oldStaffService.create(oldRecord);

      // Soft delete - mark as inactive instead of hard delete
      await staffService.update(id, { isActive: false });

      // Update local state
      setOldStaffRecords(prev => [...prev, savedOldRecord]);
      setStaff(prev => prev.map(member =>
        member.id === id ? { ...member, isActive: false } : member
      ));
    } catch (error) {
      console.error('Error deleting staff:', error);
    }
  };

  // Rejoin staff from old records (admin only)
  const rejoinStaff = async (record: OldStaffRecord) => {
    if (user?.role !== 'admin') {
      alert('Only administrators can rejoin staff');
      return;
    }

    try {
      // Restore staff member
      const restoredStaff = {
        name: record.name,
        location: record.location,
        type: record.type,
        experience: record.experience,
        basicSalary: record.basicSalary,
        incentive: record.incentive,
        hra: record.hra,
        totalSalary: record.totalSalary,
        joinedDate: new Date().toLocaleDateString('en-US'), // New join date
        isActive: true,
        initialSalary: record.totalSalary
      };

      const savedStaff = await staffService.create(restoredStaff);

      // Restore advance data if exists
      if (record.lastAdvanceData && record.totalAdvanceOutstanding > 0) {
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();

        const restoredAdvance = {
          staffId: savedStaff.id,
          month: currentMonth,
          year: currentYear,
          oldAdvance: record.totalAdvanceOutstanding,
          currentAdvance: 0,
          deduction: 0,
          newAdvance: record.totalAdvanceOutstanding,
          notes: `Restored from old record - ${record.name}`
        };

        const savedAdvance = await advanceService.upsert(restoredAdvance);
        setAdvances(prev => [...prev, savedAdvance]);
      }

      // Remove from old records
      await oldStaffService.delete(record.id);

      // Update local state
      setStaff(prev => [...prev, savedStaff]);
      setOldStaffRecords(prev => prev.filter(r => r.id !== record.id));
    } catch (error) {
      console.error('Error rejoining staff:', error);
    }
  };

  // Permanently delete staff from old records (admin only)
  const permanentDeleteOldStaff = async (record: OldStaffRecord) => {
    if (user?.role !== 'admin') {
      alert('Only administrators can permanently delete staff');
      return;
    }

    try {
      // Delete from old_staff_records
      await oldStaffService.delete(record.id);

      // Also try to delete from staff table if exists (hard delete)
      try {
        await staffService.permanentDelete(record.originalStaffId || record.id);
      } catch (e) {
        // Staff may not exist in main table, that's fine
      }

      // Remove from local state
      setOldStaffRecords(prev => prev.filter(r => r.id !== record.id));

      // Also remove related attendance if any
      setAttendance(prev => prev.filter(a => a.staffId !== record.originalStaffId && a.staffId !== record.id));

      alert(`${record.name} has been permanently deleted.`);
    } catch (error) {
      console.error('Error permanently deleting staff:', error);
      alert('Failed to delete staff. Please try again.');
    }
  };

  // Update advances and deductions (admin only)
  const updateAdvances = async (staffId: string, month: number, year: number, advanceData: Partial<AdvanceDeduction>) => {
    if (user?.role !== 'admin') {
      alert('Only administrators can update advances');
      return;
    }

    try {
      const existingAdvance = advances.find(adv =>
        adv.staffId === staffId && adv.month === month && adv.year === year
      );

      const advanceRecord = {
        staffId,
        month,
        year,
        oldAdvance: existingAdvance?.oldAdvance || 0,
        currentAdvance: existingAdvance?.currentAdvance || 0,
        deduction: existingAdvance?.deduction || 0,
        newAdvance: existingAdvance?.newAdvance || 0,
        notes: existingAdvance?.notes,
        ...advanceData
      };

      const savedAdvance = await advanceService.upsert(advanceRecord);

      setAdvances(prev => {
        const existingIndex = prev.findIndex(adv =>
          adv.staffId === staffId && adv.month === month && adv.year === year
        );

        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = savedAdvance;
          return updated;
        } else {
          return [...prev, savedAdvance];
        }
      });
    } catch (error) {
      console.error('Error updating advances:', error);
    }
  };

  // Update staff order (drag and drop reordering)
  const handleUpdateStaffOrder = async (newOrder: Staff[]) => {
    // Optimistic update
    setStaff(newOrder);

    try {
      await staffService.updateStaffOrder(newOrder.map(s => s.id));
    } catch (error) {
      console.error('Error updating staff order:', error);
      // Revert on error by reloading data
      loadAllData();
      alert('Failed to save staff order. Please try again.');
    }
  };

  const renderContent = () => {
    // Only block with skeleton when there is NO cached data at all AND first
    // Supabase response hasn't arrived yet. On revisits, cached data is already
    // in state so this branch never triggers.
    if (isFirstLoad && user) {
      return <SkeletonLoader />;
    }

    const filteredStaffData = filteredStaff;
    const filteredAttendanceData = filteredAttendance;

    switch (activeTab) {
      case 'My Portal':
        if (user?.role === 'staff' && user.staffId) {
          const portalStaff = staff.find(s => s.id === user.staffId);
          if (!portalStaff) return <div className="p-8 text-center text-[var(--text-muted)]">Staff record not found.</div>;
          return (
            <Suspense fallback={<ComponentLoader />}>
              <StaffPortal
                staff={portalStaff}
                attendance={attendance}
                salaryHikes={salaryHikes}
                advances={advances}
                allStaff={staff}
              />
            </Suspense>
          );
        }
        return null;
      case 'Dashboard':
        return (
          <Dashboard
            staff={staff}
            attendance={attendance}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            userRole={user?.role === 'staff' ? 'manager' : (user?.role || 'manager')}
            userLocation={user?.location || ''}
            isDarkTheme={isDarkTheme}
            toggleTheme={toggleTheme}
          />
        );
      case 'Staff Management':
        if (user?.role !== 'admin') return null;
        return (
          <Suspense fallback={<ComponentLoader />}>
            <StaffManagement
              staff={filteredStaffData}
              salaryHikes={salaryHikes}
              onAddStaff={addStaff}
              onUpdateStaff={updateStaff}
              onDeleteStaff={deleteStaff}
              onUpdateStaffOrder={handleUpdateStaffOrder}
              onRefreshStaff={forceRefreshData}
            />
          </Suspense>
        );
      case 'Attendance':
        return (
          <AttendanceTracker
            staff={filteredStaffData}
            attendance={filteredAttendanceData}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            onUpdateAttendance={updateAttendance}
            onBulkUpdateAttendance={bulkUpdateAttendance}
            userRole={user?.role === 'staff' ? 'manager' : (user?.role || 'manager')}
          />
        );
      case 'Salary Management':
        if (user?.role !== 'admin') return null;
        return (
          <Suspense fallback={<ComponentLoader />}>
            <SalaryManagement
              staff={filteredStaffData}
              attendance={filteredAttendanceData}
              advances={advances}
              onUpdateAdvances={updateAdvances}
            />
          </Suspense>
        );
      case 'Part-Time Staff':
        return (
          <Suspense fallback={<ComponentLoader />}>
            <PartTimeStaff
              attendance={filteredAttendanceData}
              staff={staff}
              onUpdateAttendance={updateAttendance}
              onDeletePartTimeAttendance={deletePartTimeAttendance}
              userLocation={user?.location}
            />
          </Suspense>
        );
      case 'Old Staff Records':
        if (user?.role !== 'admin') return null;
        return (
          <Suspense fallback={<ComponentLoader />}>
            <OldStaffRecords
              oldStaffRecords={oldStaffRecords}
              onRejoinStaff={rejoinStaff}
              onPermanentDelete={permanentDeleteOldStaff}
            />
          </Suspense>
        );
      case 'Settings':
        if (user?.role !== 'admin') return null;
        return (
          <Suspense fallback={<ComponentLoader />}>
            <Settings userRole={user?.role || 'manager'} />
          </Suspense>
        );
      case 'Leave Management':
        if (user?.role !== 'admin' && user?.role !== 'manager') return null;
        return (
          <Suspense fallback={<ComponentLoader />}>
            <LeaveManagement
              userRole={user?.role as 'admin' | 'manager'}
              userLocation={user?.location}
              userName={user?.role === 'admin' ? 'Admin' : `${user?.location} Manager`}
            />
          </Suspense>
        );
      case 'Face Attendance':
        if (user?.role !== 'admin' && user?.role !== 'manager') return null;
        return (
          <Suspense fallback={<ComponentLoader />}>
            <FaceAttendance
              staff={filteredStaffData}
              attendance={filteredAttendanceData}
              onAttendancePatch={patchAttendance}
              onAttendanceUpdated={() => {
                // Only invalidate cache — UI is already updated via onAttendancePatch
                cacheService.invalidate(CACHE_KEYS.ATTENDANCE);
              }}
              userRole={user?.role as 'admin' | 'manager'}
            />
          </Suspense>
        );
      case 'Audit Log':
        if (user?.role !== 'admin') return null;
        return (
          <ErrorBoundary moduleName="Audit Log">
            <AuditLogViewer currentUserEmail={user?.email || ''} />
          </ErrorBoundary>
        );
      default:
        return null;
    }
  };

  // Show configuration error if Supabase is not properly set up
  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-2xl w-full glass-card-static p-8">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-500/20 mb-4">
              <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Configuration Error</h1>
            <p className="text-white/60 mb-6">
              The application is missing required environment variables.
            </p>

            <div className="glass-card-static rounded-lg p-4 text-left mb-6">
              <h2 className="font-semibold text-white mb-2">Required Environment Variables:</h2>
              <ul className="list-disc list-inside space-y-1 text-sm text-white/70">
                <li><code className="bg-white/10 px-2 py-1 rounded">VITE_SUPABASE_URL</code></li>
                <li><code className="bg-white/10 px-2 py-1 rounded">VITE_SUPABASE_ANON_KEY</code></li>
              </ul>
            </div>

            <div className="glass-card-static rounded-lg p-4 text-left border-l-4 border-blue-400">
              <h3 className="font-semibold text-blue-400 mb-2">Setup Instructions:</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-white/70">
                <li>Copy <code className="bg-white/10 px-2 py-1 rounded">.env.example</code> to <code className="bg-white/10 px-2 py-1 rounded">.env</code></li>
                <li>Add your Supabase credentials to the <code className="bg-white/10 px-2 py-1 rounded">.env</code> file</li>
                <li>For deployments (Vercel/Netlify), add these variables in your platform's environment settings</li>
                <li>Restart the development server or redeploy</li>
              </ol>
            </div>

            <p className="text-xs text-white/40 mt-6">
              Check the browser console for more details.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onLogout={handleLogout}
      />
      <main className="w-full px-4 sm:px-6 lg:px-8 flex-1">
        <ErrorBoundary moduleName={activeTab}>
          {renderContent()}
        </ErrorBoundary>
      </main>

      {salaryHikeModal && (
        <SalaryHikeModal
          isOpen={salaryHikeModal.isOpen}
          onClose={() => setSalaryHikeModal(null)}
          staffName={salaryHikeModal.staffName}
          currentSalary={salaryHikeModal.currentSalary}
          newSalary={salaryHikeModal.newSalary}
          onConfirm={salaryHikeModal.onConfirm}
        />
      )}
    </div>
  );
}

export default App;