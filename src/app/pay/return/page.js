import { redirect } from 'next/navigation'
import { getAdvertiserContext } from '@/lib/advertiser'
import { createAdminClient } from '@/lib/supabase/admin'
import { settlePayment } from '@/lib/payments'

export const dynamic = 'force-dynamic'

// Paystack sends people back here after the checkout page.
export default async function PayReturn({ searchParams }) {
  const ctx = await getAdvertiserContext()
  if (ctx.error === 'signed_out') redirect('/login')
  if (ctx.error) redirect('/')
  const ref = String((searchParams && (searchParams.reference || searchParams.trxref)) || '')
  if (!/^FA_[A-Za-z0-9]{8,60}$/.test(ref)) redirect('/campaigns')

  let r = { outcome: 'pending' }
  try {
    r = await settlePayment(createAdminClient(), ref, { advertiserId: ctx.advertiser.id })
  } catch (err) {
    console.error('Return settle failed:', err)
  }
  if (!r.campaign_id) redirect('/campaigns')
  redirect('/campaigns/' + r.campaign_id + '?pay=' + r.outcome)
}
