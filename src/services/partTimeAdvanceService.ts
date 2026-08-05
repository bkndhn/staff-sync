import { dataApi } from '../lib/dataApi';
import { PartTimeAdvanceRecord } from '../types';

// Routed through the session-validated `data-api` edge function; direct anon
// access to `part_time_advance_tracking` has been revoked at the database level.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api: any = dataApi;

export const partTimeAdvanceService = {
    async getRecord(
        staffName: string,
        location: string,
        year: number,
        month: number,
        weekNumber: number
    ): Promise<PartTimeAdvanceRecord | null> {
        const { data, error } = await api
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

    async getOpeningBalance(
        staffName: string,
        location: string,
        year: number,
        month: number,
        weekNumber: number
    ): Promise<number> {
        const prevWeek = weekNumber - 1;

        if (prevWeek >= 0) {
            const prevRecord = await this.getRecord(staffName, location, year, month, prevWeek);
            return prevRecord?.closingBalance || 0;
        }

        // Need the most recent record strictly before (year, month, weekNumber).
        // dataApi doesn't support `.or()`, so we pull recent rows for this staff
        // + location and filter client-side. Volume is tiny (weekly ledger rows).
        const { data, error } = await api
            .from('part_time_advance_tracking')
            .select('year, month, week_number, closing_balance')
            .eq('staff_name', staffName)
            .eq('location', location)
            .order('year', { ascending: false })
            .limit(50);

        if (error || !data) return 0;

        const rank = (y: number, m: number, w: number) => y * 10000 + m * 100 + w;
        const currentRank = rank(year, month, weekNumber);
        const previous = (data as Array<{ year: number; month: number; week_number: number; closing_balance: number }>)
            .filter(r => rank(r.year, r.month, r.week_number) < currentRank)
            .sort((a, b) =>
                rank(b.year, b.month, b.week_number) - rank(a.year, a.month, a.week_number)
            )[0];

        return previous?.closing_balance || 0;
    },

    async upsert(record: Omit<PartTimeAdvanceRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<PartTimeAdvanceRecord | null> {
        const openingBalance = record.openingBalance;
        const advanceGiven = record.advanceGiven;
        const earnings = record.earnings;

        const totalDebt = openingBalance + advanceGiven;
        const balanceAfterWork = totalDebt - earnings;

        let closingBalance = 0;
        let pendingPayroll = 0;
        let adjustment = 0;

        if (balanceAfterWork > 0) {
            closingBalance = balanceAfterWork;
            pendingPayroll = 0;
            adjustment = earnings;
        } else {
            closingBalance = 0;
            pendingPayroll = Math.abs(balanceAfterWork);
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
            earnings,
            adjustment,
            pending_salary: pendingPayroll,
            closing_balance: closingBalance,
            notes: record.notes
        };

        const { data, error } = await api
            .from('part_time_advance_tracking')
            .upsert([dbRecord], { onConflict: 'staff_name,location,year,month,week_number' })
            .select()
            .single();

        if (error || !data) {
            console.error('Error upserting part-time advance:', error);
            return null;
        }

        return this.mapFromDatabase(data);
    },

    async getReport(
        staffName: string | undefined,
        startDate: string,
        endDate: string
    ): Promise<PartTimeAdvanceRecord[]> {
        let query = api
            .from('part_time_advance_tracking')
            .select('*')
            .gte('week_start_date', startDate)
            .lte('week_start_date', endDate)
            .order('week_start_date', { ascending: true });

        if (staffName && staffName !== 'All') {
            query = query.eq('staff_name', staffName);
        }

        const { data, error } = await query;

        if (error || !data) {
            console.error('Error fetching advance report:', error);
            return [];
        }

        return (data as any[]).map(this.mapFromDatabase);
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
            pendingPayroll: dbRecord.pending_salary,
            closingBalance: dbRecord.closing_balance,
            notes: dbRecord.notes,
            createdAt: dbRecord.created_at,
            updatedAt: dbRecord.updated_at
        };
    }
};
