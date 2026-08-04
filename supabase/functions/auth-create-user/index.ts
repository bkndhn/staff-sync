import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
};

const VALID_ROLES = ['admin', 'manager', 'supervisor', 'floor_supervisor', 'statutory_admin'];
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function isValidRole(role: string): boolean {
  return VALID_ROLES.includes(role);
}

// Unified session validator — accepts BOTH:
//   1. Legacy 64-char tokens stored in app_sessions
//   2. Supabase JWT access tokens (long, starts with "eyJ")
async function validateAdminSession(
  supabase: ReturnType<typeof createClient>,
  sessionToken: string | null
): Promise<{ valid: boolean; tenantId?: string; userId?: string; error?: string }> {
  if (!sessionToken || typeof sessionToken !== 'string' || sessionToken.length < 10) {
    return { valid: false, error: 'Missing or invalid session token' };
  }

  // ── Path A: Supabase JWT (starts with "eyJ") ─────────────────────────────
  if (sessionToken.startsWith('eyJ')) {
    try {
      // Create a user-scoped client using the JWT to identify the caller
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: `Bearer ${sessionToken}` } } }
      );
      const { data: { user }, error: authErr } = await userClient.auth.getUser();
      if (authErr || !user) {
        return { valid: false, error: 'JWT verification failed' };
      }

      // Fetch the app_user profile using the service role (no RLS)
      const { data: profile, error: profileErr } = await supabase
        .from('app_users')
        .select('id, role, is_active, tenant_id')
        .eq('auth_id', user.id)
        .maybeSingle();

      // Fallback: match by email if auth_id not set yet
      const appUser = profile || (await supabase
        .from('app_users')
        .select('id, role, is_active, tenant_id')
        .eq('email', user.email!)
        .maybeSingle()
      ).data;

      if (!appUser) return { valid: false, error: 'User profile not found' };
      if (!appUser.is_active) return { valid: false, error: 'User account is inactive' };
      if (appUser.role !== 'admin') return { valid: false, error: 'Admin role required' };

      return { valid: true, tenantId: appUser.tenant_id, userId: appUser.id };
    } catch (e) {
      console.error('JWT validation error:', e);
      return { valid: false, error: 'JWT validation failed' };
    }
  }

  // ── Path B: Legacy 64-char token from app_sessions ────────────────────────
  if (sessionToken.length !== 64) {
    return { valid: false, error: 'Missing or invalid session token' };
  }

  const { data: session, error } = await supabase
    .from('app_sessions')
    .select('user_id, role, expires_at, is_valid')
    .eq('token', sessionToken)
    .eq('is_valid', true)
    .single();

  if (error || !session) {
    return { valid: false, error: 'Invalid or expired session' };
  }
  if (new Date(session.expires_at) < new Date()) {
    return { valid: false, error: 'Session expired' };
  }
  if (session.role !== 'admin') {
    return { valid: false, error: 'Admin role required' };
  }

  // Get tenant_id for the legacy user
  const { data: appUser } = await supabase
    .from('app_users')
    .select('tenant_id')
    .eq('id', session.user_id)
    .maybeSingle();

  return { valid: true, tenantId: appUser?.tenant_id, userId: session.user_id };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Accept token from x-session-token header OR Authorization Bearer header
    const sessionToken =
      req.headers.get('x-session-token') ||
      (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '') ||
      null;

    const sessionCheck = await validateAdminSession(supabase, sessionToken);
    if (!sessionCheck.valid) {
      return new Response(
        JSON.stringify({ error: sessionCheck.error || 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { email, password, full_name, role, location, location_id, floor } = body as {
      email?: string;
      password?: string;
      full_name?: string;
      role?: string;
      location?: string;
      location_id?: string;
      floor?: string;
    };

    // Input validation
    if (!email || typeof email !== 'string' || !isValidEmail(email.trim())) {
      return new Response(
        JSON.stringify({ error: 'Valid email address is required (max 254 characters)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!password || typeof password !== 'string' || password.length < 8 || password.length > 128) {
      return new Response(
        JSON.stringify({ error: 'Password must be 8-128 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!full_name || typeof full_name !== 'string' || full_name.trim().length < 1 || full_name.trim().length > 100) {
      return new Response(
        JSON.stringify({ error: 'Full name is required (max 100 characters)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!role || typeof role !== 'string' || !isValidRole(role)) {
      return new Response(
        JSON.stringify({ error: `Invalid role "${role}". Must be one of: ${VALID_ROLES.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (location && (typeof location !== 'string' || location.length > 200)) {
      return new Response(
        JSON.stringify({ error: 'Location must be a string of max 200 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (location_id && (typeof location_id !== 'string' || !UUID_REGEX.test(location_id))) {
      return new Response(
        JSON.stringify({ error: 'location_id must be a valid UUID' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Check if email already exists to give a clear error
    const { data: existing } = await supabase
      .from('app_users')
      .select('id')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ error: 'A user with this email already exists. Please use a different email.' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data, error } = await supabase
      .from('app_users')
      .insert([{
        email: email.trim().toLowerCase(),
        password_hash: passwordHash,
        full_name: full_name.trim(),
        role,
        location: location?.trim() || null,
        location_id: location_id || null,
        floor: floor?.trim() || null,
        is_active: true,
        // Always scope new users to the same tenant as the creator
        tenant_id: sessionCheck.tenantId || null,
      }])
      .select('id, email, full_name, role, location, location_id, floor, is_active, tenant_id')
      .single();

    if (error) {
      console.error('DB insert error:', error);
      if (error.code === '23505') {
        return new Response(
          JSON.stringify({ error: 'A user with this email already exists. Please use a different email.' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ error: `Failed to create user: ${error.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ user: data }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Create user error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
