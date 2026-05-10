import { supabase } from '../lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://nsmppwnpdxomjmgrtqka.supabase.co";

export interface AppUser {
    id: string;
    email: string;
    full_name: string;
    role: 'admin' | 'manager';
    location: string | null;
    location_id?: string | null;
    is_active: boolean;
    last_login?: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface CreateUserInput {
    email: string;
    password: string;
    full_name: string;
    role: 'admin' | 'manager';
    location?: string | null;
    location_id?: string | null;
}

export interface UpdateUserInput {
    email?: string;
    password?: string;
    full_name?: string;
    role?: 'admin' | 'manager';
    location?: string | null;
    location_id?: string | null;
    is_active?: boolean;
}

export const userService = {
    /**
     * Get all users (for admin settings page) - reads from safe public view
     */
    async getUsers(): Promise<AppUser[]> {
        const { data, error } = await supabase
            .from('app_users_public' as any)
            .select('id, email, full_name, role, location, location_id, is_active, last_login, created_at, updated_at')
            .eq('is_active', true)
            .order('full_name');

        if (error) {
            console.error('Error fetching users:', error);
            return [];
        }

        return (data || []).map((user: any) => ({
            ...user,
            role: user.role as 'admin' | 'manager',
            is_active: user.is_active ?? true
        }));
    },

    /**
     * Validate user login credentials via secure Edge Function (bcrypt server-side)
     */
    async validateLogin(email: string, password: string): Promise<{ user: AppUser; sessionToken: string } | null> {
        try {
            const response = await fetch(`${SUPABASE_URL}/functions/v1/auth-login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '',
                },
                body: JSON.stringify({ email, password }),
            });

            if (!response.ok) {
                return null;
            }

            const { user, sessionToken } = await response.json();
            if (!user || !sessionToken) return null;

            return {
                user: {
                    ...user,
                    role: user.role as 'admin' | 'manager',
                    is_active: user.is_active ?? true
                },
                sessionToken
            };
        } catch (err) {
            console.error('Login error:', err);
            return null;
        }
    },

    /**
     * Get the stored session token from localStorage
     */
    getSessionToken(): string | null {
        try {
            const saved = localStorage.getItem('staffManagementLogin');
            if (!saved) return null;
            const data = JSON.parse(saved);
            return data?.sessionToken || null;
        } catch {
            return null;
        }
    },

    /**
     * Create a new user via secure Edge Function (bcrypt server-side)
     */
    async createUser(input: CreateUserInput): Promise<AppUser | null> {
        const sessionToken = this.getSessionToken();
        try {
            const response = await fetch(`${SUPABASE_URL}/functions/v1/auth-create-user`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '',
                    ...(sessionToken ? { 'x-session-token': sessionToken } : {}),
                },
                body: JSON.stringify({
                    email: input.email,
                    password: input.password,
                    full_name: input.full_name,
                    role: input.role,
                    location: input.location || null,
                    location_id: input.location_id || null,
                }),
            });

            if (!response.ok) {
                const err = await response.json();
                console.error('Error creating user:', err);
                return null;
            }

            const { user } = await response.json();
            return user ? { ...user, role: user.role as 'admin' | 'manager', is_active: user.is_active ?? true } : null;
        } catch (err) {
            console.error('Error creating user:', err);
            return null;
        }
    },

    /**
     * Update an existing user
     */
    async updateUser(id: string, input: UpdateUserInput): Promise<AppUser | null> {
        // If password is being updated, use secure edge function
        if (input.password) {
            const sessionToken = this.getSessionToken();
            try {
                const response = await fetch(`${SUPABASE_URL}/functions/v1/auth-update-password`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '',
                        ...(sessionToken ? { 'x-session-token': sessionToken } : {}),
                    },
                    body: JSON.stringify({ userId: id, newPassword: input.password }),
                });

                if (!response.ok) {
                    console.error('Error updating password');
                    return null;
                }
            } catch (err) {
                console.error('Error updating password:', err);
                return null;
            }
        }

        // Update non-password fields via Supabase client
        const updates: Record<string, unknown> = {
            updated_at: new Date().toISOString()
        };

        if (input.email) updates.email = input.email.toLowerCase();
        if (input.full_name) updates.full_name = input.full_name;
        if (input.role) updates.role = input.role;
        if (input.location !== undefined) updates.location = input.location;
        if (input.location_id !== undefined) updates.location_id = input.location_id;
        if (input.is_active !== undefined) updates.is_active = input.is_active;

        const { data, error } = await supabase
            .from('app_users')
            .update(updates as any)
            .eq('id', id)
            .select('id, email, full_name, role, location, location_id, is_active, last_login, created_at, updated_at')
            .single();

        if (error) {
            console.error('Error updating user:', error);
            return null;
        }

        return data ? {
            ...data,
            role: data.role as 'admin' | 'manager',
            is_active: data.is_active ?? true,
            created_at: data.created_at ?? undefined,
            updated_at: data.updated_at ?? undefined,
            last_login: data.last_login ?? undefined,
            location: data.location ?? undefined,
            location_id: data.location_id ?? undefined,
        } as any : null;
    },

    /**
     * Regenerate password for a user via secure Edge Function
     */
    async regeneratePassword(id: string): Promise<string | null> {
        const newPassword = this.generateRandomPassword();
        const sessionToken = this.getSessionToken();

        try {
            const response = await fetch(`${SUPABASE_URL}/functions/v1/auth-update-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '',
                    ...(sessionToken ? { 'x-session-token': sessionToken } : {}),
                },
                body: JSON.stringify({ userId: id, newPassword }),
            });

            if (!response.ok) {
                console.error('Error regenerating password');
                return null;
            }

            return newPassword;
        } catch (err) {
            console.error('Error regenerating password:', err);
            return null;
        }
    },

    /**
     * Generate a random password
     */
    generateRandomPassword(): string {
        const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        let password = '';
        for (let i = 0; i < 10; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
    },

    /**
     * Soft delete a user
     */
    async deleteUser(id: string): Promise<boolean> {
        const { error } = await supabase
            .from('app_users')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', id);

        if (error) {
            console.error('Error deleting user:', error);
            return false;
        }

        return true;
    },

    /**
     * Deactivate manager for a location
     */
    async deactivateManagerByLocation(locationId: string): Promise<boolean> {
        const { error } = await supabase
            .from('app_users')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('location_id', locationId)
            .eq('role', 'manager');

        if (error) {
            console.error('Error deactivating manager:', error);
            return false;
        }

        return true;
    },

    /**
     * Deactivate manager by location name
     */
    async deactivateManagerByLocationName(locationName: string): Promise<boolean> {
        const { error } = await supabase
            .from('app_users')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('location', locationName)
            .eq('role', 'manager');

        if (error) {
            console.error('Error deactivating manager:', error);
            return false;
        }

        return true;
    },

    /**
     * Generate default credentials for a new location
     */
    generateCredentialsForLocation(locationName: string): { email: string; password: string } {
        const cleanName = locationName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const shortName = cleanName.substring(0, 3);
        const capShortName = shortName.charAt(0).toUpperCase() + shortName.slice(1);
        const randomSuffix = Math.floor(100 + Math.random() * 900);

        return {
            email: `manager@${cleanName}.com`,
            password: `Mngr${capShortName}${randomSuffix}`
        };
    },

    /**
     * Create manager user for a new location
     */
    async createManagerForLocation(locationName: string, locationId?: string): Promise<{ user: AppUser | null; credentials: { email: string; password: string } }> {
        const credentials = this.generateCredentialsForLocation(locationName);

        const user = await this.createUser({
            email: credentials.email,
            password: credentials.password,
            full_name: `${locationName} Manager`,
            role: 'manager',
            location: locationName,
            location_id: locationId
        });

        return { user, credentials };
    }
};
