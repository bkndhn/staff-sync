import { supabase } from '../lib/supabase';

export interface Designation {
    id: string;
    name: string;
    displayName: string;
    isActive: boolean;
    sortOrder: number;
}

export const designationService = {
    async getDesignations(): Promise<Designation[]> {
        const { data, error } = await supabase
            .from('designations')
            .select('*')
            .eq('is_active', true)
            .order('sort_order')
            .order('display_name');

        if (error) {
            console.error('Error fetching designations:', error);
            return [];
        }

        return (data || []).map(d => ({
            id: d.id,
            name: d.name,
            displayName: d.display_name,
            isActive: d.is_active ?? true,
            sortOrder: d.sort_order ?? 0,
        }));
    },

    async getAllDesignations(): Promise<Designation[]> {
        const { data, error } = await supabase
            .from('designations')
            .select('*')
            .order('sort_order')
            .order('display_name');

        if (error) {
            console.error('Error fetching all designations:', error);
            return [];
        }

        return (data || []).map(d => ({
            id: d.id,
            name: d.name,
            displayName: d.display_name,
            isActive: d.is_active ?? true,
            sortOrder: d.sort_order ?? 0,
        }));
    },

    async addDesignation(displayName: string): Promise<Designation | null> {
        const name = displayName.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const { data, error } = await supabase
            .from('designations')
            .insert([{ name, display_name: displayName, is_active: true }])
            .select()
            .single();

        if (error) {
            console.error('Error adding designation:', error);
            return null;
        }

        return {
            id: data.id,
            name: data.name,
            displayName: data.display_name,
            isActive: data.is_active ?? true,
            sortOrder: data.sort_order ?? 0,
        };
    },

    async updateDesignation(id: string, displayName: string): Promise<Designation | null> {
        const name = displayName.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const { data, error } = await supabase
            .from('designations')
            .update({ name, display_name: displayName, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating designation:', error);
            return null;
        }

        return {
            id: data.id,
            name: data.name,
            displayName: data.display_name,
            isActive: data.is_active ?? true,
            sortOrder: data.sort_order ?? 0,
        };
    },

    async deleteDesignation(id: string): Promise<boolean> {
        const { error } = await supabase
            .from('designations')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', id);

        if (error) {
            console.error('Error deleting designation:', error);
            return false;
        }
        return true;
    },

    async restoreDesignation(id: string): Promise<boolean> {
        const { error } = await supabase
            .from('designations')
            .update({ is_active: true, updated_at: new Date().toISOString() })
            .eq('id', id);

        if (error) {
            console.error('Error restoring designation:', error);
            return false;
        }
        return true;
    },
};
