import { supabase } from '../lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://nsmppwnpdxomjmgrtqka.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zbXBwd25wZHhvbWptZ3J0cWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE1NDM3NjksImV4cCI6MjA2NzExOTc2OX0.gVzJ4uPAmFT5yngvdcFsHXHH1cUL-nIq0e71Gx8ALOk";

export interface AppUser {
    id: string;
    email: string;
    full_name: string;
    role: 'admin' | 'manager' | 'floor_supervisor' | 'statutory_admin' | 'supervisor' | 'super_admin';
    location: string | null;
    location_id?: string | null;
    floor?: string | null;
    floor_id?: string | null;
    is_active: boolean;
    last_login?: string | null;
    created_at?: string;
    updated_at?: string;
    tenant_id?: string | null;
}

export interface CreateUserInput {
    email: string;
    password: string;
    full_name: string;
    role: 'admin' | 'manager' | 'floor_supervisor' | 'statutory_admin' | 'supervisor';
    location?: string | null;
    location_id?: string | null;
    floor?: string | null;
}

export interface UpdateUserInput {
    email?: string;
    password?: string;
    full_name?: string;
    role?: 'admin' | 'manager' | 'floor_supervisor' | 'statutory_admin' | 'supervisor';
    location?: string | null;
    floor?: string | null;
    location_id?: string | null;
    is_active?: boolean;
}

export const userService = {
    /**
     * Get all users (for admin settings page) - reads from app_users table
     */
    async getUsers(): Promise<AppUser[]> {
        // The anon-key Supabase client is blocked by RLS on app_users.
        // Use data-api edge function (service role) with the stored session token.
        const sessionToken = await this.getSessionToken();
        const isJwt = sessionToken && sessionToken.startsWith('eyJ');

        try {
            const response = await fetch(`${SUPABASE_URL}/functions/v1/data-api`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_ANON_KEY,
                    ...(sessionToken && isJwt
                        ? { 'Authorization': `Bearer ${sessionToken}`, 'x-session-token': sessionToken }
                        : sessionToken
                        ? { 'x-session-token': sessionToken }
                        : {}),
                },
                body: JSON.stringify({
                    table: 'app_users',
                    op: 'select',
                    columns: 'id, email, full_name, role, location, location_id, floor, floor_id, is_active, last_login, created_at, updated_at, tenant_id',
                    filters: [
                        { col: 'is_active', op: 'eq', val: true },
                        // Exclude super_admin — they are platform-level, not client sub-users
                        { col: 'role', op: 'neq', val: 'super_admin' },
                    ],
                    order: { col: 'full_name', ascending: true },
                }),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                console.error('getUsers data-api error:', err);
                return [];
            }

            const json = await response.json();
            const rows = Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : [];
            return rows.map((user: any) => ({
                ...user,
                role: user.role as AppUser['role'],
                is_active: user.is_active ?? true,
            }));
        } catch (err) {
            console.error('Error fetching users:', err);
            return [];
        }
    },


    /**
     * Validate user login credentials via secure Edge Function (bcrypt server-side)
     */    /**
     * Validate user login credentials via secure Edge Function (bcrypt server-side)
     */
    async validateLogin(email: string, password: string): Promise<{ user: AppUser; sessionToken: string } | null> {
        try {
            console.log('[Auth] Attempting Supabase Auth for:', email);
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (authError || !authData?.session) {
                console.warn('[Auth] Supabase Auth failed:', authError?.message);
                return null;
            }

            console.log('[Auth] Supabase Auth SUCCESS. Fetching profile via edge function...');
            const sessionToken = authData.session.access_token;

            // Use data-api edge function to fetch profile (bypasses RLS)
            try {
                const profileRes = await fetch(`${SUPABASE_URL}/functions/v1/data-api`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${sessionToken}`,
                        'apikey': SUPABASE_ANON_KEY,
                    },
                    body: JSON.stringify({
                        table: 'app_users',
                        op: 'select',
                        filters: [{ col: 'email', op: 'eq', val: email }],
                        columns: 'id, email, full_name, role, location, location_id, floor, floor_id, is_active, last_login, created_at, updated_at, tenant_id',
                        single: true
                    })
                });

                const profileJson = await profileRes.json();
                console.log('[Auth] Profile response status:', profileRes.status, profileJson);

                if (profileRes.ok && !profileJson.error) {
                    const userData = Array.isArray(profileJson.data) ? profileJson.data[0] : profileJson.data;
                    if (userData) {
                        return {
                            user: {
                                ...userData,
                                role: userData.role as AppUser['role'],
                                is_active: userData.is_active ?? true
                            },
                            sessionToken
                        };
                    }
                }

                console.warn('[Auth] data-api profile fetch failed, trying direct REST...');
                
                // Direct PostgREST query with the JWT (authenticated)
                const restRes = await fetch(
                    `${SUPABASE_URL}/rest/v1/app_users?email=eq.${encodeURIComponent(email)}&is_active=eq.true&select=id,email,full_name,role,location,location_id,floor,floor_id,is_active,last_login,created_at,updated_at,tenant_id&limit=1`,
                    {
                        headers: {
                            'apikey': SUPABASE_ANON_KEY,
                            'Authorization': `Bearer ${sessionToken}`,
                        }
                    }
                );
                const restData = await restRes.json();
                console.log('[Auth] Direct REST response:', restRes.status, restData);

                if (Array.isArray(restData) && restData.length > 0) {
                    const user = restData[0];
                    return {
                        user: {
                            ...user,
                            role: user.role as AppUser['role'],
                            is_active: user.is_active ?? true
                        },
                        sessionToken
                    };
                }
            } catch (err) {
                console.warn('[Auth] Fetch profile error:', err);
            }

            // Last resort: use user metadata from auth token itself
            console.warn('[Auth] REST also failed. Using auth metadata...');
            const authUser = authData.user;
            const meta = authUser.user_metadata || {};
            
            return {
                user: {
                    id: authUser.id,
                    email: authUser.email || email,
                    full_name: meta.full_name || meta.name || email,
                    role: (meta.role || 'admin') as AppUser['role'],
                    location: meta.location || null,
                    location_id: meta.location_id || null,
                    floor: meta.floor || null,
                    floor_id: meta.floor_id || null,
                    is_active: true,
                    last_login: meta.last_login,
                    created_at: meta.created_at,
                    updated_at: meta.updated_at,
                    tenant_id: meta.tenant_id,
                },
                sessionToken
            };
        } catch (err) {
            console.error('[Auth] Login error:', err);
            return null;
        }
    },

    /**
     * Get the stored session token from Supabase Auth
     */
    async getSessionToken(): Promise<string | null> {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            return session?.access_token || null;
        } catch {
            return null;
        }
    },

    /**
     * Create a new user via secure Edge Function (bcrypt server-side)
     */
    async createUser(input: CreateUserInput): Promise<AppUser | null> {
        const sessionToken = await this.getSessionToken();
        // Detect JWT vs legacy token for the right header
        const isJwt = sessionToken && sessionToken.startsWith('eyJ');
        try {
            const response = await fetch(`${SUPABASE_URL}/functions/v1/auth-create-user`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '',
                    ...(sessionToken && isJwt
                        ? { 'Authorization': `Bearer ${sessionToken}`, 'x-session-token': sessionToken }
                        : sessionToken
                        ? { 'x-session-token': sessionToken }
                        : {}),
                },
                body: JSON.stringify({
                    email: input.email,
                    password: input.password,
                    full_name: input.full_name,
                    role: input.role,
                    location: input.location || null,
                    location_id: input.location_id || null,
                    floor: input.floor || null,
                }),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                const msg = err?.error || `Server error (${response.status})`;
                console.error('Error creating user:', msg);
                throw new Error(msg);
            }

            const { user } = await response.json();
            return user ? { ...user, role: user.role as AppUser['role'], is_active: user.is_active ?? true } : null;
        } catch (err) {
            console.error('Error creating user:', err);
            throw err; // re-throw so Settings.tsx can show the real message
        }
    },

    /**
     * Update an existing user
     */
    async updateUser(id: string, input: UpdateUserInput): Promise<AppUser | null> {
        const sessionToken = await this.getSessionToken();
        const isJwt = sessionToken && sessionToken.startsWith('eyJ');
        const authHeaders = {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            ...(sessionToken && isJwt
                ? { 'Authorization': `Bearer ${sessionToken}`, 'x-session-token': sessionToken }
                : sessionToken ? { 'x-session-token': sessionToken } : {}),
        };

        // If password is being updated, use secure edge function
        if (input.password) {
            try {
                const response = await fetch(`${SUPABASE_URL}/functions/v1/auth-update-password`, {
                    method: 'POST',
                    headers: authHeaders,
                    body: JSON.stringify({ userId: id, newPassword: input.password }),
                });
                if (!response.ok) {
                    const err = await response.json().catch(() => ({}));
                    throw new Error(err?.error || 'Failed to update password');
                }
            } catch (err) {
                console.error('Error updating password:', err);
                throw err;
            }
        }

        // Build update payload
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (input.email) updates.email = input.email.toLowerCase();
        if (input.full_name) updates.full_name = input.full_name;
        if (input.role) updates.role = input.role;
        if (input.location !== undefined) updates.location = input.location;
        if (input.location_id !== undefined) updates.location_id = input.location_id;
        if (input.floor !== undefined) updates.floor = input.floor;
        if (input.is_active !== undefined) updates.is_active = input.is_active;

        // Route through data-api (service role, tenant-scoped) instead of anon client
        try {
            const response = await fetch(`${SUPABASE_URL}/functions/v1/data-api`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({
                    table: 'app_users',
                    op: 'update',
                    values: updates,
                    filters: [{ col: 'id', op: 'eq', val: id }],
                }),
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err?.error || 'Failed to update user');
            }
            const json = await response.json();
            const row = Array.isArray(json.data) ? json.data[0] : json.data;
            if (!row) return null;
            return {
                ...row,
                role: row.role as AppUser['role'],
                is_active: row.is_active ?? true,
            };
        } catch (err) {
            console.error('Error updating user:', err);
            throw err;
        }
    },

    /**
     * Regenerate password for a user via secure Edge Function
     */
    async regeneratePassword(id: string): Promise<string | null> {
        const newPassword = this.generateRandomPassword();
        const sessionToken = await this.getSessionToken();

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
        const sessionToken = await this.getSessionToken();
        const isJwt = sessionToken && sessionToken.startsWith('eyJ');
        try {
            const response = await fetch(`${SUPABASE_URL}/functions/v1/data-api`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_ANON_KEY,
                    ...(sessionToken && isJwt
                        ? { 'Authorization': `Bearer ${sessionToken}`, 'x-session-token': sessionToken }
                        : sessionToken ? { 'x-session-token': sessionToken } : {}),
                },
                body: JSON.stringify({
                    table: 'app_users',
                    op: 'update',
                    values: { is_active: false, updated_at: new Date().toISOString() },
                    filters: [{ col: 'id', op: 'eq', val: id }],
                }),
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                console.error('Error deleting user:', err);
                return false;
            }
            return true;
        } catch (err) {
            console.error('Error deleting user:', err);
            return false;
        }
    },

    /**
     * Deactivate manager for a location
     */
    async deactivateManagerByLocation(locationId: string): Promise<boolean> {
        const sessionToken = await this.getSessionToken();
        const isJwt = sessionToken && sessionToken.startsWith('eyJ');
        const headers = {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            ...(sessionToken && isJwt
                ? { 'Authorization': `Bearer ${sessionToken}`, 'x-session-token': sessionToken }
                : sessionToken ? { 'x-session-token': sessionToken } : {}),
        };
        try {
            const response = await fetch(`${SUPABASE_URL}/functions/v1/data-api`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    table: 'app_users',
                    op: 'update',
                    values: { is_active: false, updated_at: new Date().toISOString() },
                    filters: [
                        { col: 'location_id', op: 'eq', val: locationId },
                        { col: 'role', op: 'eq', val: 'manager' },
                    ],
                }),
            });
            return response.ok;
        } catch { return false; }
    },

    /**
     * Deactivate manager by location name
     */
    async deactivateManagerByLocationName(locationName: string): Promise<boolean> {
        const sessionToken = await this.getSessionToken();
        const isJwt = sessionToken && sessionToken.startsWith('eyJ');
        const headers = {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            ...(sessionToken && isJwt
                ? { 'Authorization': `Bearer ${sessionToken}`, 'x-session-token': sessionToken }
                : sessionToken ? { 'x-session-token': sessionToken } : {}),
        };
        try {
            const response = await fetch(`${SUPABASE_URL}/functions/v1/data-api`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    table: 'app_users',
                    op: 'update',
                    values: { is_active: false, updated_at: new Date().toISOString() },
                    filters: [
                        { col: 'location', op: 'eq', val: locationName },
                        { col: 'role', op: 'eq', val: 'manager' },
                    ],
                }),
            });
            return response.ok;
        } catch { return false; }
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
