import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Validate session token - returns session info if valid
async function validateSession(
  supabase: ReturnType<typeof createClient>,
  sessionToken: string | null
): Promise<{ valid: boolean; userId?: string; role?: string; error?: string }> {
  if (!sessionToken || typeof sessionToken !== 'string' || sessionToken.length !== 64) {
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
    const sessionToken = req.headers.get('x-session-token');
    const sessionCheck = await validateSession(supabase, sessionToken);
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

    // Authorization: admin can update any user, non-admin can only update themselves
    if (sessionCheck.role !== 'admin' && sessionCheck.userId !== userId) {
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
        JSON.stringify({ error: 'Password must be 8-128 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!hasPasswordComplexity(newPassword)) {
      return new Response(
        JSON.stringify({ error: 'Password must contain at least one letter and one number' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the target user exists before updating
    const { data: targetUser, error: fetchError } = await supabase
      .from('app_users')
      .select('id')
      .eq('id', userId)
      .eq('is_active', true)
      .single();

    if (fetchError || !targetUser) {
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const newHash = await bcrypt.hash(newPassword, 10);

    const { error } = await supabase
      .from('app_users')
      .update({ password_hash: newHash, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) {
      return new Response(
        JSON.stringify({ error: 'Failed to update password' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Invalidate all other sessions for this user for security
    await supabase
      .from('app_sessions')
      .update({ is_valid: false })
      .eq('user_id', userId)
      .neq('token', sessionToken!);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Password update error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
