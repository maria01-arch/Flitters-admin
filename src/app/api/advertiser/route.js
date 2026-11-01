import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimited } from '@/lib/rateLimit'
import { COUNTRY_CODES } from '@/lib/countries'

export const runtime = 'nodejs'

const json = (status, body) => NextResponse.json(body, { status })
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TERMS_VERSION = 'draft-1'

// Creates the business profile for the signed-in person. The owner is always
// the signed-in user taken from the session, never from the request body.
export async function POST(req) {
  let body
  try { body = await req.json() } catch { return json(400, { error: 'Bad request' }) }

  const supabase = createClient()
  const { data } = await supabase.auth.getUser()
  const user = data && data.user
  if (!user) return json(401, { error: 'Please sign in again' })

  const h = headers()
  const ip = (h.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
  if (rateLimited('adv:' + user.id + ':' + ip, 20, 60_000)) return json(429, { error: 'Slow down a little and try again' })

  if (body.action !== 'create_profile') return json(400, { error: 'Unknown action' })

  const business = String(body.business_name || '').trim()
  const email = String(body.contact_email || '').trim().toLowerCase()
  const country = String(body.country_code || '').toUpperCase()
  if (business.length < 2 || business.length > 80) return json(400, { error: 'Enter your business name (2 to 80 characters)' })
  if (!EMAIL.test(email) || email.length > 200) return json(400, { error: 'Enter a valid contact email' })
  if (!COUNTRY_CODES.includes(country)) return json(400, { error: 'Choose your country' })
  if (body.accepted_terms !== true) return json(400, { error: 'Please accept the terms to continue' })

  const admin = createAdminClient()
  const { data: existing } = await admin.from('advertisers').select('id').eq('user_id', user.id).maybeSingle()
  if (existing) return json(400, { error: 'You already have a business profile' })

  const row = { user_id: user.id, business_name: business, contact_email: email, country_code: country }
  let res = await admin.from('advertisers').insert({ ...row, accepted_terms_at: new Date().toISOString(), terms_version: TERMS_VERSION }).select('id').maybeSingle()
  if (res.error && /accepted_terms_at|terms_version/.test(res.error.message || '')) {
    // The extra columns are not in the database yet: still create the profile.
    res = await admin.from('advertisers').insert(row).select('id').maybeSingle()
  }
  if (res.error) {
    console.error('Create advertiser failed:', res.error.message)
    return json(500, { error: 'Could not create your profile. Try again.' })
  }
  return json(200, { ok: true })
}
