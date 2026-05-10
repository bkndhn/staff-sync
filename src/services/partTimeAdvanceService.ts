import { supabase } from '../lib/supabase';
import { PartTimeAdvanceRecord } from '../types';

export const partTimeAdvanceService = {
    // Get advance record for a specific week
    async getRecord(
        staffName: string,
        location: string,
        year: number,
        month: number,
        weekNumber: number
    ): Promise<PartTimeAdvanceRecord | null> {
        const { data, error } = await supabase
            .from('part_time_advance_tracking')
            .select('*')
            .eq('staff_name', staffName)
            .eq('location', location)
            .eq('year', year)
            .eq('month', month)
            .eq('week_number', weekNumber)
            .maybeSingle();

        if (error) {
            console.error('Error fetching part-time advance record:', error);
            return null;
        }

        return data ? this.mapFromDatabase(data) : null;
    },

    // Get previous week's closing balance (opening balance for current week)
    async getOpeningBalance(
        staffName: string,
        location: string,
        year: number,
        month: number,
        weekNumber: number
    ): Promise<number> {
        // Logic to find previous week
        let prevWeek = weekNumber - 1;
        let prevMonth = month;
        let prevYear = year;

        if (prevWeek < 0) {
            // Go to last week of previous month
            prevMonth = month - 1;
            if (prevMonth < 0) {
                prevMonth = 11;
                prevYear = year - 1;
            }
            // We generally assume 4 or 5 weeks. safer to check the latest record for that month?
            // Or simply query for the *latest* record before this date.
            // A better approach for simplified week logic:
            // Just query order by year desc, month desc, week_number desc limit 1
            // where date < current_week_date

            const { data, error } = await supabase
                .from('part_time_advance_tracking')
                .select('closing_balance')
                .eq('staff_name', staffName)
                .eq('location', location)
                .or(`year.lt.${year},and(year.eq.${year},month.lt.${month}),and(year.eq.${year},month.eq.${month},week_number.lt.${weekNumber})`)
                .order('year', { ascending: false })
                .order('month', { ascending: false })
                .order('week_number', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error || !data) return 0;
            return data.closing_balance || 0;
        }

        const prevRecord = await this.getRecord(staffName, location, prevYear, prevMonth, prevWeek);
        return prevRecord?.closingBalance || 0;
    },

    // Save or update a record
    async upsert(record: Omit<PartTimeAdvanceRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<PartTimeAdvanceRecord | null> {
        // Recalculate balances to ensure integrity
        const openingBalance = record.openingBalance;
        const advanceGiven = record.advanceGiven;
        const earnings = record.earnings;

        // Logic from requirements:
        // adjustment = min(advanceGiven, earnings) ?? Wait, no.
        // Scenario 1: Earned 1000, Advance 1200. Taken 200 extra. 
        // Adjustment needs to cover the earnings if advance is sufficient? 
        // Or rather: Adjustment is how much of the salary is used to pay back advance?
        // Let's stick to standard ledger logic:
        // Net Due = (Opening Balance + Advance Given) - Earnings
        // If Net Due > 0, then Closing Balance (Staff Owes) = Net Due, Pending Salary = 0
        // If Net Due < 0, then Closing Balance = 0, Pending Salary (We Owe) = Math.abs(Net Due)

        // User logic:
        // S1: Earned 1000, Adv 1200. Extra 200. Carry 200.
        // Opening=0. Adv=1200. Earn=1000. Total Due from Staff = 1200. Paid by work = 1000. Remaining Due = 200.
        // Closing = 200. Pending = 0.

        // S2: Earned 1000, Adv 800. Eligible 200.
        // Opening=0. Adv=800. Earn=1000. Total Due from Staff = 800. Paid by work = 1000. 
        // Remaining Due = -200 (We owe).
        // Closing = 0. Pending = 200.

        // General Formulae:
        // Total Debt = Opening Balance + Advance Given
        // Balance After Work = Total Debt - Earnings

        // If Balance After Work > 0:
        //   Closing Balance = Balance After Work
        //   Pending Salary = 0
        //   Adjustment (Amount deduced from salary) = Earnings

        // If Balance After Work < 0:
        //   Closing Balance = 0
        //   Pending Salary = Math.abs(Balance After Work)
        //   Adjustment (Amount deduced from salary) = Total Debt (we recovered everything they owed)


        const totalDebt = openingBalance + advanceGiven;
        const balanceAfterWork = totalDebt - earnings;

        let closingBalance = 0;
        let pendingSalary = 0;
        let adjustment = 0;

        if (balanceAfterWork > 0) {
            closingBalance = balanceAfterWork;
            pendingSalary = 0;
            adjustment = earnings;
        } else {
            closingBalance = 0;
            pendingSalary = Math.abs(balanceAfterWork);
            adjustment = totalDebt;
        }

        const dbRecord = {
            staff_name: record.staffName,
            location: record.location,
            week_start_date: record.weekStartDate,
            year: record.year,
            month: record.month,
            week_number: record.weekNumber,
            opening_balance: openingBalance,
            advance_given: advanceGiven,
            earnings: earnings,
            adjustment: adjustment,
            pending_salary: pendingSalary,
            closing_balance: closingBalance,
            notes: record.notes
        };

        const { data, error } = await supabase
            .from('part_time_advance_tracking')
            .upsert([dbRecord], {
                onConflict: 'staff_name,location,year,month,week_number'
            })
            .select()
            .single();

        if (error) {
            console.error('Error upserting part-time advance:', error);
            return null;
        }

        return this.mapFromDatabase(data);
    },

    // Get report data
    async getReport(
        staffName: string | undefined,
        startDate: string,
        endDate: string
    ): Promise<PartTimeAdvanceRecord[]> {
        let query = supabase
            .from('part_time_advance_tracking')
            .select('*')
            .gte('week_start_date', startDate)
            .lte('week_start_date', endDate)
            .order('week_start_date', { ascending: true });

        if (staffName && staffName !== 'All') {
            query = query.eq('staff_name', staffName);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching advance report:', error);
            return [];
        }

        return data.map(this.mapFromDatabase);
    },

    mapFromDatabase(dbRecord: any): PartTimeAdvanceRecord {
        return {
            id: dbRecord.id,
            staffName: dbRecord.staff_name,
            location: dbRecord.location,
            weekStartDate: dbRecord.week_start_date,
            year: dbRecord.year,
            month: dbRecord.month,
            weekNumber: dbRecord.week_number,
            openingBalance: dbRecord.opening_balance,
            advanceGiven: dbRecord.advance_given,
            earnings: dbRecord.earnings,
            adjustment: dbRecord.adjustment,
            pendingSalary: dbRecord.pending_salary,
            closingBalance: dbRecord.closing_balance,
            notes: dbRecord.notes,
            createdAt: dbRecord.created_at,
            updatedAt: dbRecord.updated_at
        };
    }
};
