import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple legacy hash for backward compatibility during migration
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const salt = str.length * 17 + 42;
  return Math.abs(hash + salt).toString(36);
}

// Generate a secure random session token
function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

// Input validation helpers
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

// Server-side rate limiting store (in-memory, resets on cold start)
const loginAttempts = new Map<string, { count: number; blockedUntil: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(key: string): { blocked: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (entry && entry.blockedUntil > now) {
    return { blocked: true, retryAfter: Math.ceil((entry.blockedUntil - now) / 1000) };
  }
  return { blocked: false };
}

function recordFailedAttempt(key: string): void {
  const now = Date.now();
  const entry = loginAttempts.get(key) || { count: 0, blockedUntil: 0 };
  entry.count++;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.blockedUntil = now + LOCKOUT_MS;
  }
  loginAttempts.set(key, entry);
}

function clearAttempts(key: string): void {
  loginAttempts.delete(key);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { email, password } = body as { email?: string; password?: string };

    // Input validation
    if (!email || typeof email !== 'string' || !isValidEmail(email.trim())) {
      return new Response(
        JSON.stringify({ error: 'Valid email is required (max 254 characters)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!password || typeof password !== 'string' || password.length < 1 || password.length > 128) {
      return new Response(
        JSON.stringify({ error: 'Password is required (max 128 characters)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Server-side rate limiting by email
    const rateLimitKey = `login:${normalizedEmail}`;
    const rateLimit = checkRateLimit(rateLimitKey);
    if (rateLimit.blocked) {
      return new Response(
        JSON.stringify({ error: `Too many failed attempts. Try again in ${Math.ceil((rateLimit.retryAfter || 900) / 60)} minutes.` }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': String(rateLimit.retryAfter) } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: user, error } = await supabase
      .from('app_users')
      .select('id, email, full_name, role, location, location_id, is_active, last_login, password_hash')
      .eq('email', normalizedEmail)
      .eq('is_active', true)
      .single();

    if (error || !user || !user.password_hash) {
      recordFailedAttempt(rateLimitKey);
      // Constant-time response to prevent user enumeration
      await new Promise(r => setTimeout(r, 300));
      return new Response(
        JSON.stringify({ error: 'Invalid credentials' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate password
    const isBcrypt = user.password_hash.startsWith('$2b$') || user.password_hash.startsWith('$2a$');
    let passwordValid = false;

    if (isBcrypt) {
      passwordValid = await bcrypt.compare(password, user.password_hash);
    } else {
      passwordValid = simpleHash(password) === user.password_hash;
    }

    if (!passwordValid) {
      recordFailedAttempt(rateLimitKey);
      return new Response(
        JSON.stringify({ error: 'Invalid credentials' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Successful login - clear rate limit
    clearAttempts(rateLimitKey);

    // Generate server-side session token
    const sessionToken = generateToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

    // Store session in database
    await supabase
      .from('app_sessions')
      .insert({
        user_id: user.id,
        token: sessionToken,
        role: user.role,
        expires_at: expiresAt,
        is_valid: true
      });

    // Upgrade to bcrypt if still using legacy hash
    if (!isBcrypt) {
      const newHash = await bcrypt.hash(password, 10);
      await supabase
        .from('app_users')
        .update({ password_hash: newHash, last_login: new Date().toISOString() })
        .eq('id', user.id);
    } else {
      await supabase
        .from('app_users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', user.id);
    }

    // Return user without password_hash, plus session token
    const { password_hash: _, ...safeUser } = user;
    return new Response(
      JSON.stringify({ user: safeUser, sessionToken }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Login error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
