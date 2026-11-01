import { NextResponse } from 'next/server'
import { getAdvertiserContext } from '@/lib/advertiser'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimited } from '@/lib/rateLimit'
import { resolveQuote } from '@/lib/pricing'

export const runtime = 'nodejs'
const json = (status, body) => NextResponse.json(body, { status })

// The price always uses the advertiser's own country from their profile.
export async function POST(req) {
  const ctx = await getAdvertiserContext()
  if (ctx.error === 'signed_out') return json(401, { error: 'Please sign in again' })
  if (ctx.error) return json(403, { error: 'Not allowed' })
  if (rateLimited('quote:' + ctx.user.id, 60, 60_000)) return json(429, { error: 'Slow down a little' })
  let body
  try { body = await req.json() } catch { return json(400, { error: 'Bad request' }) }
  const q = await resolveQuote(createAdminClient(), { country: ctx.advertiser.country_code, placement: body.placement, days: body.days })
  if (q.error) return json(400, { error: q.error })
  return json(200, { ok: true, quote: q })
}
