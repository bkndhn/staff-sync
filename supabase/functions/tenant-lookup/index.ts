import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

// Public, read-only tenant resolver used by the staff portal login page before a
// session exists. Returns only non-sensitive branding/enablement fields.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const url = new URL(req.url)
    let slug = url.searchParams.get('slug') ?? ''
    if (!slug && req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      slug = typeof body?.slug === 'string' ? body.slug : ''
    }
    slug = slug.trim().toLowerCase()
    if (!slug || slug.length > 120 || !/^[a-z0-9-]+$/.test(slug)) {
      return json({ error: 'Invalid slug' }, 400)
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data, error } = await admin
      .from('tenants')
      .select('id, name, slug, status, staff_portal_enabled, staff_device_lock_enabled')
      .eq('slug', slug)
      .maybeSingle()

    if (error) return json({ error: 'Lookup failed' }, 500)
    if (!data || data.status !== 'active') return json({ error: 'Not found' }, 404)

    return json(data)
  } catch {
    return json({ error: 'Unexpected error' }, 500)
  }
})
