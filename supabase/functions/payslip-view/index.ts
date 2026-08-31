import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

// Public, read-only payslip resolver for employee "magic links".
// The client holds a random token; only its SHA-256 hash is stored, so the
// database never contains a usable credential.
//
// Abuse protection: every caller (client IP + user-agent) gets a rolling
// window budget. Too many requests — or a handful of bad tokens, which is
// what guessing looks like — locks the caller out for a cool-off period.
const WINDOW_MS = 10 * 60_000
const MAX_REQUESTS = 30
const MAX_FAILURES = 6
const BLOCK_MS = 30 * 60_000

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
    })

  try {
    const url = new URL(req.url)
    let token = url.searchParams.get('token') ?? ''
    if (!token && req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      token = typeof body?.token === 'string' ? body.token : ''
    }
    token = token.trim()

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ---- throttle -----------------------------------------------------------
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
    const clientKey = await sha256(`${ip}|${(req.headers.get('user-agent') || '').slice(0, 120)}`)
    const now = Date.now()

    const { data: bucket } = await admin
      .from('payslip_access_attempts')
      .select('id, attempts, failures, window_start, blocked_until')
      .eq('client_key', clientKey)
      .maybeSingle()

    if (bucket?.blocked_until && new Date(bucket.blocked_until).getTime() > now) {
      const retryAfter = Math.ceil((new Date(bucket.blocked_until).getTime() - now) / 1000)
      return json({ error: 'Too many attempts. Please try again later.' }, 429, { 'Retry-After': String(retryAfter) })
    }

    const freshWindow = !bucket || new Date(bucket.window_start).getTime() + WINDOW_MS < now
    const attempts = (freshWindow ? 0 : bucket!.attempts ?? 0) + 1
    const failuresSoFar = freshWindow ? 0 : bucket!.failures ?? 0

    const persist = async (failed: boolean) => {
      const failures = failuresSoFar + (failed ? 1 : 0)
      const overLimit = attempts > MAX_REQUESTS || failures >= MAX_FAILURES
      await admin.from('payslip_access_attempts').upsert({
        client_key: clientKey,
        attempts,
        failures,
        window_start: new Date(freshWindow ? now : new Date(bucket!.window_start).getTime()).toISOString(),
        blocked_until: overLimit ? new Date(now + BLOCK_MS).toISOString() : null,
        last_seen_at: new Date(now).toISOString(),
      }, { onConflict: 'client_key' })
      return overLimit
    }

    if (attempts > MAX_REQUESTS) {
      await persist(false)
      return json({ error: 'Too many attempts. Please try again later.' }, 429, { 'Retry-After': String(BLOCK_MS / 1000) })
    }

    if (!/^[A-Za-z0-9_-]{20,128}$/.test(token)) {
      await persist(true)
      return json({ error: 'Invalid link' }, 400)
    }

    const tokenHash = await sha256(token)
    const { data, error } = await admin
      .from('payslip_links')
      .select('id, month, year, snapshot, expires_at, revoked_at, view_count')
      .eq('token_hash', tokenHash)
      .maybeSingle()

    if (error) {
      await persist(false)
      return json({ error: 'Lookup failed' }, 500)
    }
    if (!data) {
      await persist(true)
      return json({ error: 'This payslip link is not valid.' }, 404)
    }
    if (data.revoked_at) {
      await persist(false)
      return json({ error: 'This payslip link has been revoked.' }, 410)
    }
    if (new Date(data.expires_at).getTime() < Date.now()) {
      await persist(false)
      return json({ error: 'This payslip link has expired. Ask HR for a fresh link.' }, 410)
    }

    await persist(false)

    await admin
      .from('payslip_links')
      .update({ view_count: (data.view_count ?? 0) + 1, last_viewed_at: new Date().toISOString() })
      .eq('id', data.id)

    return json({ month: data.month, year: data.year, snapshot: data.snapshot, expiresAt: data.expires_at })
  } catch {
    return json({ error: 'Unexpected error' }, 500)
  }
})
