import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifySignature } from '@/lib/paystack'
import { settlePayment } from '@/lib/payments'

export const runtime = 'nodejs'
const json = (status, body) => NextResponse.json(body, { status })

// Paystack calls this when a payment succeeds. We only act on messages with a
// valid signature, record each one once, and confirm the payment with Paystack
// again before changing anything.
export async function POST(req) {
  const raw = await req.text()
  if (!verifySignature(raw, req.headers.get('x-paystack-signature'))) return json(401, { error: 'Bad signature' })

  let ev
  try { ev = JSON.parse(raw) } catch { return json(400, { error: 'Bad request' }) }
  if (ev.event !== 'charge.success') return json(200, { ok: true, ignored: true })
  const data = ev.data || {}
  const reference = String(data.reference || '')
  if (!reference) return json(200, { ok: true, ignored: true })

  const admin = createAdminClient()
  const eventKey = 'charge.success:' + (data.id || reference)
  const ins = await admin.from('ad_webhook_events').insert({
    provider: 'paystack', event_key: eventKey,
    payload: { event: ev.event, reference, id: data.id || null, amount: data.amount || null, currency: data.currency || null },
  })
  if (ins.error) {
    if (ins.error.code === '23505') {
      const { data: existing } = await admin.from('ad_webhook_events').select('processed_at').eq('provider', 'paystack').eq('event_key', eventKey).maybeSingle()
      if (existing && existing.processed_at) return json(200, { ok: true, duplicate: true })
    } else {
      console.error('Webhook log failed:', ins.error.message)
    }
  }

  let r
  try {
    r = await settlePayment(admin, reference)
  } catch (err) {
    console.error('Webhook settle failed:', err)
    return json(500, { error: 'Try again' }) // Paystack retries
  }
  if (r.outcome === 'pending') return json(500, { error: 'Not confirmed yet' })
  await admin.from('ad_webhook_events').update({ processed_at: new Date().toISOString() }).eq('provider', 'paystack').eq('event_key', eventKey)
  return json(200, { ok: true })
}
