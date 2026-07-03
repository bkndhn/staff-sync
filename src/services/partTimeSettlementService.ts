import { dataApi } from '../lib/dataApi';
import type { PartTimeSettlement as _PartTimeSettlement } from '../types';

// Routed through the session-validated `data-api` edge function; direct anon
// access to `part_time_settlements` has been revoked at the database level.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api: any = dataApi;

export const partTimeSettlementService = {
    async getSettlements(): Promise<Set<string>> {
        const { data, error } = await api
            .from('part_time_settlements')
            .select('settlement_key')
            .eq('is_settled', true);

        if (error) {
            console.error('Error fetching settlements:', error);
            return new Set();
        }

        return new Set((data || []).map((d: any) => d.settlement_key));
    },

    async toggleSettlement(
        staffName: string,
        location: string,
        settlementKey: string,
        isSettled: boolean
    ): Promise<boolean> {
        const { error } = await api
            .from('part_time_settlements')
            .upsert([{
                staff_name: staffName,
                location,
                settlement_key: settlementKey,
                is_settled: isSettled,
                settled_at: isSettled ? new Date().toISOString() : null
            }], { onConflict: 'settlement_key' });

        if (error) {
            console.error('Error toggling settlement:', error);
            return false;
        }
        return true;
    },

    async updateSettlementsBulk(
        updates: { staffName: string; location: string; settlementKey: string; isSettled: boolean }[]
    ): Promise<boolean> {
        if (updates.length === 0) return true;

        const dbUpdates = updates.map(u => ({
            staff_name: u.staffName,
            location: u.location,
            settlement_key: u.settlementKey,
            is_settled: u.isSettled,
            settled_at: u.isSettled ? new Date().toISOString() : null
        }));

        const { error } = await api
            .from('part_time_settlements')
            .upsert(dbUpdates, { onConflict: 'settlement_key' });

        if (error) {
            console.error('Error bulk updating settlements:', error);
            return false;
        }
        return true;
    }
};
