import { supabase } from '../lib/supabase';
import type { PartTimeSettlement as _PartTimeSettlement } from '../types';

export const partTimeSettlementService = {
    // Get all settlement records (or filter by list of keys for efficiency if needed, but for now simple)
    async getSettlements(): Promise<Set<string>> {
        const { data, error } = await supabase
            .from('part_time_settlements')
            .select('settlement_key')
            .eq('is_settled', true);

        if (error) {
            console.error('Error fetching settlements:', error);
            return new Set();
        }

        return new Set(data.map(d => d.settlement_key));
    },

    // Toggle settlement status
    async toggleSettlement(
        staffName: string,
        location: string,
        settlementKey: string,
        isSettled: boolean
    ): Promise<boolean> {
        const { error } = await supabase
            .from('part_time_settlements')
            .upsert([{
                staff_name: staffName,
                location: location,
                settlement_key: settlementKey,
                is_settled: isSettled,
                settled_at: isSettled ? new Date().toISOString() : null
            }], {
                onConflict: 'settlement_key'
            });

        if (error) {
            console.error('Error toggling settlement:', error);
            return false;
        }
        return true;
    },

    // Bulk update (for monthly/date range toggles)
    async updateSettlementsBulk(
        updates: { staffName: string; location: string; settlementKey: string; isSettled: boolean }[]
    ): Promise<boolean> {
        if (updates.length === 0) return true;

        // Transform to DB format
        const dbUpdates = updates.map(u => ({
            staff_name: u.staffName,
            location: u.location,
            settlement_key: u.settlementKey,
            is_settled: u.isSettled,
            settled_at: u.isSettled ? new Date().toISOString() : null
        }));

        const { error } = await supabase
            .from('part_time_settlements')
            .upsert(dbUpdates, {
                onConflict: 'settlement_key'
            });

        if (error) {
            console.error('Error bulk updating settlements:', error);
            return false;
        }
        return true;
    }
};
