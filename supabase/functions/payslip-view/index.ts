import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

// Public, read-only payslip resolver for employee "magic links".
// The client holds a random token; only its SHA-256 hash is stored, so the
// database never contains a usable credential.
const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const url = new URL(req.url)
    let token = url.searchParams.get('token') ?? ''
    if (!token && req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      token = typeof body?.token === 'string' ? body.token : ''
    }
    token = token.trim()
    if (!/^[A-Za-z0-9_-]{20,128}$/.test(token)) return json({ error: 'Invalid link' }, 400)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const tokenHash = await sha256(token)
    const { data, error } = await admin
      .from('payslip_links')
      .select('id, month, year, snapshot, expires_at, revoked_at, view_count')
      .eq('token_hash', tokenHash)
      .maybeSingle()

    if (error) return json({ error: 'Lookup failed' }, 500)
    if (!data) return json({ error: 'This payslip link is not valid.' }, 404)
    if (data.revoked_at) return json({ error: 'This payslip link has been revoked.' }, 410)
    if (new Date(data.expires_at).getTime() < Date.now()) {
      return json({ error: 'This payslip link has expired. Ask HR for a fresh link.' }, 410)
    }

    await admin
      .from('payslip_links')
      .update({ view_count: (data.view_count ?? 0) + 1, last_viewed_at: new Date().toISOString() })
      .eq('id', data.id)

    return json({ month: data.month, year: data.year, snapshot: data.snapshot })
  } catch {
    return json({ error: 'Unexpected error' }, 500)
  }
})
