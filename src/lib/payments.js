import 'server-only'
import { verifyTransaction } from '@/lib/paystack'
import { sendEmail, esc } from '@/lib/email'
import { money } from '@/lib/format'

// Turns a Paystack payment into "paid" exactly once. It never trusts the
// browser or the webhook body: it asks Paystack for the real result, checks
// the amount and currency against our own record, and only then updates.
// Safe to call many times for the same reference (webhook + return page).
// Outcome: success | pending | failed | problem | unknown
export async function settlePayment(admin, reference, { advertiserId = null } = {}) {
  const { data: pay } = await admin.from('ad_payments').select('*').eq('reference', reference).maybeSingle()
  if (!pay) return { outcome: 'unknown' }
  if (advertiserId && pay.advertiser_id !== advertiserId) return { outcome: 'unknown' }
  const campaign_id = pay.campaign_id
  if (pay.status === 'succeeded') return { outcome: pay.raw && pay.raw.problem ? 'problem' : 'success', campaign_id }

  let v
  try {
    v = await verifyTransaction(reference)
  } catch (err) {
    console.error('Paystack verify failed:', err && err.message)
    return { outcome: 'pending', campaign_id }
  }
  if (!v.ok || !v.body.data) return { outcome: 'pending', campaign_id }
  const d = v.body.data
  if (d.status === 'failed') {
    await admin.from('ad_payments').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', pay.id).eq('status', 'initiated')
    return { outcome: 'failed', campaign_id }
  }
  if (d.status !== 'success') return { outcome: 'pending', campaign_id }

  if (Number(d.amount) !== Number(pay.amount_minor) || String(d.currency || '').toUpperCase() !== pay.currency) {
    console.error('Payment amount mismatch', reference, d.amount, d.currency, pay.amount_minor, pay.currency)
    await admin.from('ad_payments').update({ status: 'failed', raw: { problem: 'amount_mismatch', paid: d.amount, currency: d.currency }, updated_at: new Date().toISOString() }).eq('id', pay.id)
    return { outcome: 'problem', campaign_id }
  }

  const now = new Date().toISOString()
  const slim = { status: d.status, amount: d.amount, currency: d.currency, channel: d.channel || null, paid_at: d.paid_at || null, gateway_response: d.gateway_response || null, id: d.id }
  // Only one caller can flip the payment to "succeeded".
  const claim = await admin
    .from('ad_payments')
    .update({ status: 'succeeded', provider_txn_id: String(d.id), paid_at: now, raw: slim, updated_at: now })
    .eq('id', pay.id)
    .neq('status', 'succeeded')
    .select('id')
  if (claim.error || !claim.data || claim.data.length === 0) return { outcome: 'success', campaign_id }

  // Invoice number (needs the next_invoice_number SQL function; the invoice page retries if it is missing).
  let invoice = null
  try {
    const r = await admin.rpc('next_invoice_number')
    if (!r.error && r.data) {
      invoice = r.data
      await admin.from('ad_payments').update({ invoice_number: invoice }).eq('id', pay.id).is('invoice_number', null)
    }
  } catch {}

  const { data: c } = await admin.from('ad_campaigns').select('*').eq('id', campaign_id).maybeSingle()
  let problem = null
  if (!c || c.paid_at) problem = 'duplicate_payment'
  else if (!['draft', 'awaiting_payment'].includes(c.status)) problem = 'campaign_changed'
  else if (Number(c.total_minor) !== Number(pay.amount_minor) || c.currency !== pay.currency) problem = 'campaign_changed'
  if (!problem) {
    if (c.status === 'draft') {
      const r1 = await admin.from('ad_campaigns').update({ status: 'awaiting_payment' }).eq('id', c.id).eq('status', 'draft')
      if (r1.error) problem = 'update_failed'
    }
    if (!problem) {
      const r2 = await admin.from('ad_campaigns').update({ status: 'pending_review', paid_at: now }).eq('id', c.id).eq('status', 'awaiting_payment')
      if (r2.error) problem = 'update_failed'
    }
  }
  if (problem) {
    console.error('Payment received but campaign not advanced:', reference, problem)
    await admin.from('ad_payments').update({ raw: { ...slim, problem } }).eq('id', pay.id)
  }

  await admin.from('ad_ledger').insert({
    campaign_id, payment_id: pay.id, entry_type: 'charge', amount_minor: pay.amount_minor, currency: pay.currency,
    note: 'Paystack ' + reference + (problem ? ' (needs attention: ' + problem + ')' : ''),
  })

  if (!problem) {
    try {
      const { data: adv } = await admin.from('advertisers').select('business_name,contact_email').eq('id', pay.advertiser_id).maybeSingle()
      if (adv) {
        await sendEmail({
          to: adv.contact_email,
          subject: 'Payment received for your Flitters ad',
          html: '<p>Thank you, ' + esc(adv.business_name) + '. We received ' + esc(money(pay.amount_minor, pay.currency)) + ' for “' + esc(c.name) + '”.' + (invoice ? ' Invoice ' + esc(invoice) + '.' : '') + '</p><p>We review every ad within 24 hours and will email you the decision.</p>',
        })
      }
    } catch {}
  }
  return { outcome: problem ? 'problem' : 'success', campaign_id }
}
