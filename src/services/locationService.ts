import { supabase } from '../lib/supabase';

export interface Location {
    id: string;
    name: string;
    is_active?: boolean;
    device_ip?: string;
    device_port?: number;
    last_sync_time?: string;
}

export const locationService = {
    async getLocations(): Promise<Location[]> {
        const { data, error } = await supabase
            .from('locations')
            .select('id, display_name, is_active, device_ip, device_port, last_sync_time')
            .eq('is_active', true)
            .order('display_name');

        if (error) {
            console.error('Error fetching locations:', error);
            return [];
        }

        return (data || []).map(loc => ({
            id: loc.id,
            name: loc.display_name,
            is_active: loc.is_active ?? undefined,
            device_ip: loc.device_ip || undefined,
            device_port: loc.device_port || undefined,
            last_sync_time: loc.last_sync_time || undefined
        }));
    },

    async addLocation(name: string): Promise<{ location: Location | null; credentials?: { email: string; password: string } }> {
        const { data, error } = await supabase
            .from('locations')
            .insert([{ name: name.toLowerCase().replace(/\s+/g, '_'), display_name: name, is_active: true }])
            .select()
            .single();

        if (error) {
            console.error('Error adding location:', error);
            return { location: null };
        }

        const location: Location = {
            id: data.id,
            name: data.display_name,
            is_active: data.is_active ?? undefined,
            device_ip: data.device_ip || undefined,
            device_port: data.device_port || undefined,
            last_sync_time: data.last_sync_time || undefined
        };

        // Auto-create manager user for the new location
        try {
            const { userService } = await import('./userService');
            const { credentials } = await userService.createManagerForLocation(name);
            return { location, credentials };
        } catch (err) {
            console.error('Error creating manager user for location:', err);
            return { location };
        }
    },

    async updateLocation(id: string, name: string): Promise<Location | null> {
        // First get the old location name
        const { data: oldData, error: fetchError } = await supabase
            .from('locations')
            .select('display_name')
            .eq('id', id)
            .single();

        if (fetchError) {
            console.error('Error fetching old location:', fetchError);
            return null;
        }

        const oldName = oldData.display_name;

        // Update the location
        const { data, error } = await supabase
            .from('locations')
            .update({ display_name: name })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating location:', error);
            return null;
        }

        // If name changed, update all staff with the old location name
        if (oldName && oldName !== name) {
            const { error: staffError } = await supabase
                .from('staff')
                .update({ location: name })
                .eq('location', oldName);

            if (staffError) {
                console.error('Error updating staff locations:', staffError);
            }

            const { error: floorError } = await supabase
                .from('floors')
                .update({ location_name: name })
                .eq('location_name', oldName);

            if (floorError) {
                console.error('Error updating floor locations:', floorError);
            }
        }

        return {
            id: data.id,
            name: data.display_name
        };
    },

    async updateLocationDevice(id: string, ip: string, port: number): Promise<boolean> {
        const { error } = await supabase
            .from('locations')
            .update({ device_ip: ip, device_port: port })
            .eq('id', id);

        if (error) {
            console.error('Error updating location device:', error);
            return false;
        }
        return true;
    },

    async deleteLocation(id: string): Promise<boolean> {
        // First, get the location name to deactivate its manager
        const { data: locationData, error: fetchError } = await supabase
            .from('locations')
            .select('display_name')
            .eq('id', id)
            .single();

        if (fetchError) {
            console.error('Error fetching location:', fetchError);
            return false;
        }

        // Soft delete the location by setting is_active to false
        const { error } = await supabase
            .from('locations')
            .update({ is_active: false })
            .eq('id', id);

        if (error) {
            console.error('Error deleting location:', error);
            return false;
        }

        // Deactivate the associated manager user
        try {
            const { userService } = await import('./userService');
            await userService.deactivateManagerByLocationName(locationData.display_name);
        } catch (err) {
            console.error('Error deactivating manager for location:', err);
            // Don't fail the location delete if manager deactivation fails
        }

        return true;
    }
};
