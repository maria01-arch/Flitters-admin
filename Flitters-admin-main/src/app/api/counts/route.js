import { prelude, json } from '@/lib/apiKit'
import { getCounts } from '@/lib/counts'

export const runtime = 'nodejs'

export async function GET(req) {
  const p = await prelude(req, { name: 'counts', limit: 120, body: {} })
  if (p.res) return p.res
  try {
    return json(200, { ok: true, counts: await getCounts(p.admin, p.ctx) })
  } catch (err) {
    console.error('Counts failed:', err)
    return json(500, { error: 'Could not load counts' })
  }
}
