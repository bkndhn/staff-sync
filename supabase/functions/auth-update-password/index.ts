import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Validate session token - returns session info if valid
async function validateSession(
  req: Request,
  supabase: ReturnType<typeof createClient>
): Promise<{ valid: boolean; userId?: string; role?: string; error?: string }> {
  const legacyToken = req.headers.get("x-session-token");
  const authHeader = req.headers.get("authorization");
  let jwt = "";
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    jwt = authHeader.substring(7);
  } else if (legacyToken && legacyToken.length > 100) {
    // Sometimes frontend passes JWT in x-session-token
    jwt = legacyToken;
  }

  if (jwt) {
    const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser(jwt);
    if (authErr || !authUser) return { valid: false, error: 'Invalid JWT' };

    // Find the app_user role and id
    const { data: uRow } = await supabase.from('app_users')
      .select('id, role')
      .or(`auth_id.eq.${authUser.id},email.eq.${authUser.email}`)
      .maybeSingle();

    if (uRow) return { valid: true, userId: uRow.id, role: uRow.role };
    return { valid: false, error: 'User not found in app_users' };
  }

  if (!legacyToken || legacyToken.length !== 64) {
    return { valid: false, error: 'Missing or invalid session token' };
  }

  const { data: session, error } = await supabase
    .from('app_sessions')
    .select('user_id, role, expires_at, is_valid')
    .eq('token', legacyToken)
    .eq('is_valid', true)
    .single();

  if (error || !session) return { valid: false, error: 'Invalid or expired session' };
  if (new Date(session.expires_at) < new Date()) return { valid: false, error: 'Session expired' };

  return { valid: true, userId: session.user_id, role: session.role };
}

function hasPasswordComplexity(password: string): boolean {
  // At least one letter and one number
  return /[a-zA-Z]/.test(password) && /[0-9]/.test(password);
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

    // Require valid session token
    const sessionCheck = await validateSession(req, supabase);
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

    const { userId, newPassword } = body as { userId?: string; newPassword?: string };

    // Validate userId format
    if (!userId || typeof userId !== 'string' || !UUID_REGEX.test(userId)) {
      return new Response(
        JSON.stringify({ error: 'Valid userId (UUID format) is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Authorization: admin/super_admin can update any user, others can only update themselves
    if (sessionCheck.role !== 'admin' && sessionCheck.role !== 'super_admin' && sessionCheck.userId !== userId) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: you can only update your own password' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Password validation
    if (!newPassword || typeof newPassword !== 'string') {
      return new Response(
        JSON.stringify({ error: 'New password is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (newPassword.length < 8 || newPassword.length > 128) {
      return new Response(
        JSON.stringify({ error: 'Password must be between 8 and 128 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!hasPasswordComplexity(newPassword)) {
      return new Response(
        JSON.stringify({ error: 'Password must contain at least one letter and one number' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Hash password for app_users
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Get the user's auth_id if they have one
    const { data: userToUpdate } = await supabase
      .from('app_users')
      .select('auth_id')
      .eq('id', userId)
      .single();

    // 1. Update app_users
    const { error: dbError } = await supabase
      .from('app_users')
      .update({
        password_hash: hashedPassword,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (dbError) {
      return new Response(
        JSON.stringify({ error: 'Failed to update user password in database' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Update Supabase Auth if auth_id exists, otherwise create
    if (userToUpdate?.auth_id) {
      const { error: authError } = await supabase.auth.admin.updateUserById(
        userToUpdate.auth_id,
        { password: newPassword }
      );
      if (authError) console.error('Failed to update Supabase Auth password:', authError);
    } else {
      // Get full user details to create them in Supabase Auth
      const { data: fullUser } = await supabase.from('app_users').select('*').eq('id', userId).single();
      if (fullUser) {
        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
          email: fullUser.email,
          password: newPassword,
          email_confirm: true,
          user_metadata: {
            full_name: fullUser.full_name,
            role: fullUser.role,
            tenant_id: fullUser.tenant_id
          }
        });
        if (!authError && authUser?.user) {
          await supabase.from('app_users').update({ auth_id: authUser.user.id }).eq('id', userId);
        }
      }
    }

    // 3. Invalidate all existing legacy sessions for this user (force re-login)
    // We don't invalidate the current session so they stay logged in
    await supabase
      .from('app_sessions')
      .update({ is_valid: false })
      .eq('user_id', userId)
      .neq('token', req.headers.get('x-session-token') || '');

    return new Response(
      JSON.stringify({ success: true, message: 'Password updated successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('Internal server error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: err.message || err.toString() }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
