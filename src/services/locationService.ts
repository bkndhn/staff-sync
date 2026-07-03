import { dataApi } from '../lib/dataApi';

export interface Location {
    id: string;
    name: string;
    is_active?: boolean;
    device_ip?: string;
    device_port?: number;
    last_sync_time?: string;
}

// All reads/writes to `locations` go through the session-validated `data-api`
// edge function. Direct anon/authenticated access to this table has been
// revoked to prevent public exposure of device IPs and connection strings.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api: any = dataApi;

export const locationService = {
    async getLocations(): Promise<Location[]> {
        const { data, error } = await api
            .from('locations')
            .select('id, display_name, is_active, device_ip, device_port, last_sync_time')
            .eq('is_active', true)
            .order('display_name');

        if (error) {
            console.error('Error fetching locations:', error);
            return [];
        }

        return (data || []).map((loc: any) => ({
            id: loc.id,
            name: loc.display_name,
            is_active: loc.is_active ?? undefined,
            device_ip: loc.device_ip || undefined,
            device_port: loc.device_port || undefined,
            last_sync_time: loc.last_sync_time || undefined
        }));
    },

    async addLocation(name: string): Promise<{ location: Location | null; credentials?: { email: string; password: string } }> {
        const { data, error } = await api
            .from('locations')
            .insert([{ name: name.toLowerCase().replace(/\s+/g, '_'), display_name: name, is_active: true }])
            .select()
            .single();

        if (error || !data) {
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
        const { data: oldData, error: fetchError } = await api
            .from('locations')
            .select('display_name')
            .eq('id', id)
            .single();

        if (fetchError || !oldData) {
            console.error('Error fetching old location:', fetchError);
            return null;
        }

        const oldName = oldData.display_name;

        const { data, error } = await api
            .from('locations')
            .update({ display_name: name })
            .eq('id', id)
            .select()
            .single();

        if (error || !data) {
            console.error('Error updating location:', error);
            return null;
        }

        if (oldName && oldName !== name) {
            const staffRes = await api.from('staff').update({ location: name }).eq('location', oldName);
            if (staffRes.error) console.error('Error updating staff locations:', staffRes.error);

            const floorRes = await api.from('floors').update({ location_name: name }).eq('location_name', oldName);
            if (floorRes.error) console.error('Error updating floor locations:', floorRes.error);
        }

        return { id: data.id, name: data.display_name };
    },

    async updateLocationDevice(id: string, ip: string, port: number): Promise<boolean> {
        const { error } = await api
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
        const { data: locationData, error: fetchError } = await api
            .from('locations')
            .select('display_name')
            .eq('id', id)
            .single();

        if (fetchError || !locationData) {
            console.error('Error fetching location:', fetchError);
            return false;
        }

        const { error } = await api
            .from('locations')
            .update({ is_active: false })
            .eq('id', id);

        if (error) {
            console.error('Error deleting location:', error);
            return false;
        }

        try {
            const { userService } = await import('./userService');
            await userService.deactivateManagerByLocationName(locationData.display_name);
        } catch (err) {
            console.error('Error deactivating manager for location:', err);
        }

        return true;
    }
};
