import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import crypto from 'crypto'
import { getAdvertiserContext } from '@/lib/advertiser'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimited } from '@/lib/rateLimit'
import { resolveQuote } from '@/lib/pricing'
import { initializeTransaction } from '@/lib/paystack'
import { completeness } from '@/lib/campaignRules'

export const runtime = 'nodejs'
const json = (status, body) => NextResponse.json(body, { status })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Starts a Paystack checkout. The price is worked out here, on the server,
// from the pricing rules, and saved on the campaign. The browser sends no amount.
export async function POST(req) {
  const ctx = await getAdvertiserContext()
  if (ctx.error === 'signed_out') return json(401, { error: 'Please sign in again' })
  if (ctx.error) return json(403, { error: 'Not allowed' })
  if (rateLimited('pay:' + ctx.user.id, 10, 60_000)) return json(429, { error: 'Slow down a little and try again' })
  if (!process.env.PAYSTACK_SECRET_KEY) return json(400, { error: 'Payments are not set up yet. Please try again later.' })

  let body
  try { body = await req.json() } catch { return json(400, { error: 'Bad request' }) }
  if (!UUID.test(String(body.campaignId || ''))) return json(400, { error: 'Bad request' })

  const adv = ctx.advertiser
  const admin = createAdminClient()
  const { data: c } = await admin.from('ad_campaigns').select('*').eq('id', body.campaignId).eq('advertiser_id', adv.id).maybeSingle()
  if (!c) return json(404, { error: 'Campaign not found' })
  if (c.status !== 'draft') return json(400, { error: 'This campaign can’t be paid for now' })
  const problem = completeness(c, { needFutureStart: true })
  if (problem) return json(400, { error: problem })

  const q = await resolveQuote(admin, { country: adv.country_code, placement: c.placement, days: c.days })
  if (q.error) return json(400, { error: q.error })

  const now = new Date().toISOString()
  const snap = await admin.from('ad_campaigns').update({
    country_code: adv.country_code, currency: q.currency, price_rule_id: q.rule_id, price_per_day_minor: q.price_per_day_minor,
    subtotal_minor: q.subtotal_minor, vat_percent: q.vat_percent, vat_minor: q.vat_minor, total_minor: q.total_minor, submitted_at: now,
  }).eq('id', c.id).eq('advertiser_id', adv.id).eq('status', 'draft')
  if (snap.error) {
    console.error('Price snapshot failed:', snap.error.message)
    return json(500, { error: 'Could not start the payment. Try again.' })
  }

  const reference = 'FA_' + Date.now().toString(36) + crypto.randomBytes(6).toString('hex')
  const ins = await admin.from('ad_payments').insert({
    campaign_id: c.id, advertiser_id: adv.id, provider: 'paystack', reference, amount_minor: q.total_minor, currency: q.currency, status: 'initiated',
  })
  if (ins.error) {
    console.error('Payment row failed:', ins.error.message)
    return json(500, { error: 'Could not start the payment. Try again.' })
  }

  const h = headers()
  const host = h.get('x-forwarded-host') || h.get('host')
  const origin = (h.get('x-forwarded-proto') || 'https') + '://' + host
  let init
  try {
    init = await initializeTransaction({
      email: adv.contact_email, amount: q.total_minor, currency: q.currency, reference,
      callback_url: origin + '/pay/return', metadata: { campaign_id: c.id, advertiser_id: adv.id },
    })
  } catch (err) {
    console.error('Paystack init failed:', err && err.message)
    await admin.from('ad_payments').update({ status: 'failed' }).eq('reference', reference)
    return json(500, { error: 'Could not reach the payment service. Try again.' })
  }
  if (!init.ok || !init.body.data || !init.body.data.authorization_url) {
    console.error('Paystack init rejected:', init.status, init.body && init.body.message)
    await admin.from('ad_payments').update({ status: 'failed' }).eq('reference', reference)
    return json(400, { error: 'The payment service said: ' + String((init.body && init.body.message) || 'could not start the payment').slice(0, 160) })
  }
  return json(200, { ok: true, url: init.body.data.authorization_url })
}
