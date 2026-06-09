import { useEffect } from 'react';
import { payrollService } from '../services/payrollService';
import { staffService } from '../services/staffService';
import { advanceEntryService, AdvanceEntry } from '../services/advanceEntryService';
import { attendanceService } from '../services/attendanceService';
import { salaryOverrideService } from '../services/salaryOverrideService';
import { calculateAttendanceMetrics, calculateSalary, computeScheduledDeductions } from '../utils/salaryCalculations';
import { supabase } from '../lib/supabase';

export const usePayrollAutoGenerate = (user: any) => {
  useEffect(() => {
    if (!user) return;

    const checkAndGenerate = async () => {
      try {
        const today = new Date();
        // Check if we are on or after the 25th
        if (today.getDate() < 25) return;

        // Target previous month
        let targetMonth = today.getMonth() - 1;
        let targetYear = today.getFullYear();
        if (targetMonth < 0) {
          targetMonth = 11;
          targetYear -= 1;
        }

        // Check if already generated
        const existingRun = await payrollService.getPayrollRun(targetMonth, targetYear);
        if (existingRun) return;

        console.log(`Auto-generating payroll for ${targetMonth + 1}/${targetYear}...`);
        
        // Fetch all required data
        const staffList = await staffService.getStaff();
        const fullTimeStaff = staffList.filter(s => s.type === 'full-time');
        
        const attendance = await attendanceService.getAttendance(targetMonth + 1, targetYear);
        const overrides = await salaryOverrideService.getOverrides(targetMonth + 1, targetYear);

        // Fetch advances
        const { data: advancesData } = await supabase
          .from('advances')
          .select('*')
          .eq('month', targetMonth)
          .eq('year', targetYear);
        const advances = (advancesData || []).map((row: any) => ({
          id: row.id,
          staffId: row.staff_id,
          oldAdvance: row.old_advance,
          currentAdvance: row.current_advance,
          deduction: row.deduction,
          newAdvance: row.new_advance,
          month: row.month,
          year: row.year
        }));

        // Fetch advance entries
        const { data: thisMonthEntries } = await supabase
          .from('advance_entries')
          .select('*')
          .eq('month', targetMonth)
          .eq('year', targetYear);
        
        const activeEntries = await advanceEntryService.getActiveForMonth(targetMonth, targetYear);
        
        const advanceEntries: { [key: string]: AdvanceEntry[] } = {};
        
        const allEntriesData = [...(thisMonthEntries || []).map((r: any) => advanceEntryService.mapFromDatabase(r))];
        activeEntries.forEach(e => {
          if (e.month === targetMonth && e.year === targetYear) return;
          if (!allEntriesData.some(ex => ex.id === e.id)) {
            allEntriesData.push(e);
          }
        });

        allEntriesData.forEach(e => {
          if (!advanceEntries[e.staffId]) advanceEntries[e.staffId] = [];
          advanceEntries[e.staffId].push(e);
        });

        const scheduledDeductions: { [key: string]: { total: number } } = {};
        Object.entries(advanceEntries).forEach(([staffId, entries]) => {
          scheduledDeductions[staffId] = computeScheduledDeductions(entries, targetMonth, targetYear);
        });

        const fullDetails = fullTimeStaff.map(member => {
          const metrics = calculateAttendanceMetrics(member.id, attendance, targetYear, targetMonth);
          const memberAdvances = advances.find(adv => adv.staffId === member.id && adv.month === targetMonth && adv.year === targetYear);
          const memberEntries = advanceEntries[member.id] || [];
          return calculateSalary(
            member, 
            metrics, 
            memberAdvances ?? null, 
            advances, 
            attendance, 
            targetMonth, 
            targetYear, 
            memberEntries, 
            overrides, 
            scheduledDeductions[member.id]?.total || 0
          );
        });

        await payrollService.generatePayroll(targetMonth, targetYear, fullTimeStaff, fullDetails, 'System Auto-Generate');
        console.log(`Successfully auto-generated payroll for ${targetMonth + 1}/${targetYear}.`);
      } catch (error) {
        console.error('Failed to auto-generate payroll:', error);
      }
    };

    checkAndGenerate();
  }, [user]);
};
