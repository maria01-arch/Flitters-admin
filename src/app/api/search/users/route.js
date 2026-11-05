import { can } from '@/lib/staff'
import { prelude, json, UUID } from '@/lib/apiKit'

export const runtime = 'nodejs'
const COLS = 'id,username,display_name,verified,is_authentic'

export async function GET(req) {
  const p = await prelude(req, { name: 'usersearch', limit: 90, body: {} })
  if (p.res) return p.res
  const { ctx, admin } = p
  if (!can(ctx, 'users.view')) return json(403, { error: 'Not allowed' })

  const raw = String(new URL(req.url).searchParams.get('q') || '').trim()
  if (UUID.test(raw)) {
    const { data } = await admin.from('profiles').select(COLS).eq('id', raw).maybeSingle()
    return json(200, { results: data ? [data] : [] })
  }
  // Keep only letters, numbers and a few safe characters before searching.
  const q = raw.replace(/[^\p{L}\p{N}_.\- ]/gu, '').trim().slice(0, 30)
  if (q.length < 2) return json(200, { results: [] })
  const { data, error } = await admin
    .from('profiles')
    .select(COLS)
    .or('username.ilike.%' + q + '%,display_name.ilike.%' + q + '%')
    .order('created_at', { ascending: false })
    .limit(8)
  if (error) return json(500, { error: 'Search failed' })
  return json(200, { results: data || [] })
}
