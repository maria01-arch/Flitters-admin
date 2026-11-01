import { notFound, redirect } from 'next/navigation'
import { getAdvertiserContext } from '@/lib/advertiser'
import { createAdminClient } from '@/lib/supabase/admin'
import { countryName } from '@/lib/countries'
import { day, money } from '@/lib/format'
import PrintButton from '@/components/PrintButton'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// A printable receipt for a paid campaign (the campaign id is the page address).
export default async function InvoicePage({ params }) {
  const ctx = await getAdvertiserContext()
  if (ctx.error === 'signed_out') redirect('/login')
  if (ctx.error) redirect('/')
  if (!UUID.test(params.id)) notFound()
  const adv = ctx.advertiser
  const admin = createAdminClient()
  const { data: c } = await admin.from('ad_campaigns').select('*').eq('id', params.id).eq('advertiser_id', adv.id).maybeSingle()
  if (!c || !c.paid_at) notFound()
  const { data: pay } = await admin.from('ad_payments').select('*').eq('campaign_id', c.id).eq('status', 'succeeded').order('paid_at', { ascending: true }).limit(1).maybeSingle()
  if (!pay) notFound()

  let invoiceNo = pay.invoice_number
  if (!invoiceNo) {
    try {
      const r = await admin.rpc('next_invoice_number')
      if (!r.error && r.data) {
        const u = await admin.from('ad_payments').update({ invoice_number: r.data }).eq('id', pay.id).is('invoice_number', null).select('invoice_number')
        invoiceNo = u.data && u.data[0] ? u.data[0].invoice_number : r.data
      }
    } catch {}
  }

  const seller = process.env.INVOICE_SELLER_NAME || 'Xchord Labs'
  const address = process.env.INVOICE_SELLER_ADDRESS || ''
  const taxId = process.env.INVOICE_TAX_ID || ''
  const endDay = c.end_at ? new Date(new Date(c.end_at).getTime() - 1).toISOString() : null

  return (
    <div className="invoice">
      <div className="spread no-print"><a href={'/campaigns/' + c.id}>← Back</a><PrintButton /></div>
      <div className="spread">
        <div><h1>Invoice</h1><p className="hint">{invoiceNo || 'Number pending'}</p></div>
        <div className="right"><strong>{seller}</strong>{address ? <p className="hint">{address}</p> : null}{taxId ? <p className="hint">Tax ID: {taxId}</p> : null}</div>
      </div>
      <dl className="kv">
        <dt>Date paid</dt><dd>{day(pay.paid_at)}</dd>
        <dt>Billed to</dt><dd>{adv.business_name} · {adv.contact_email} · {countryName(adv.country_code)}</dd>
        <dt>Payment reference</dt><dd>{pay.reference}</dd>
        <dt>Paid with</dt><dd>Paystack</dd>
      </dl>
      <table className="inv-table">
        <thead><tr><th>Description</th><th className="right">Amount</th></tr></thead>
        <tbody>
          <tr><td>Flitters Ads · {c.placement === 'reel' ? 'Reels' : 'Feed'} · “{c.name}”<br /><small>{c.days} days × {money(c.price_per_day_minor, c.currency)} ({day(c.start_at)} to {day(endDay)})</small></td><td className="right">{money(c.subtotal_minor, c.currency)}</td></tr>
          {Number(c.vat_percent) > 0 ? <tr><td>VAT {Number(c.vat_percent)}%</td><td className="right">{money(c.vat_minor, c.currency)}</td></tr> : null}
          <tr className="inv-total"><td>Total paid</td><td className="right">{money(pay.amount_minor, pay.currency)}</td></tr>
        </tbody>
      </table>
      <p className="hint">Thank you for advertising on Flitters.</p>
    </div>
  )
}
