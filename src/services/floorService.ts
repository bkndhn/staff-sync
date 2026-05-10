import { supabase } from '../lib/supabase';

export interface Floor {
    id: string;
    locationName: string;
    name: string;
    isActive: boolean;
    sortOrder: number;
}

export const floorService = {
    async getFloors(): Promise<Floor[]> {
        const { data, error } = await supabase
            .from('floors')
            .select('*')
            .eq('is_active', true)
            .order('sort_order')
            .order('name');

        if (error) {
            console.error('Error fetching floors:', error);
            return [];
        }

        return (data || []).map(f => ({
            id: f.id,
            locationName: f.location_name,
            name: f.name,
            isActive: f.is_active ?? true,
            sortOrder: f.sort_order ?? 0,
        }));
    },

    async getFloorsByLocation(locationName: string): Promise<Floor[]> {
        const { data, error } = await supabase
            .from('floors')
            .select('*')
            .eq('location_name', locationName)
            .eq('is_active', true)
            .order('sort_order')
            .order('name');

        if (error) {
            console.error('Error fetching floors for location:', error);
            return [];
        }

        return (data || []).map(f => ({
            id: f.id,
            locationName: f.location_name,
            name: f.name,
            isActive: f.is_active ?? true,
            sortOrder: f.sort_order ?? 0,
        }));
    },

    async addFloor(locationName: string, name: string): Promise<Floor | null> {
        const { data, error } = await supabase
            .from('floors')
            .insert([{ location_name: locationName, name, is_active: true }])
            .select()
            .single();

        if (error) {
            console.error('Error adding floor:', error);
            return null;
        }

        return {
            id: data.id,
            locationName: data.location_name,
            name: data.name,
            isActive: data.is_active ?? true,
            sortOrder: data.sort_order ?? 0,
        };
    },

    async updateFloor(id: string, name: string): Promise<Floor | null> {
        const { data, error } = await supabase
            .from('floors')
            .update({ name, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating floor:', error);
            return null;
        }

        return {
            id: data.id,
            locationName: data.location_name,
            name: data.name,
            isActive: data.is_active ?? true,
            sortOrder: data.sort_order ?? 0,
        };
    },

    async deleteFloor(id: string): Promise<boolean> {
        const { error } = await supabase
            .from('floors')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', id);

        if (error) {
            console.error('Error deleting floor:', error);
            return false;
        }
        return true;
    },
};
