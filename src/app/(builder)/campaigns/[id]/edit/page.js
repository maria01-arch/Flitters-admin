import { redirect, notFound } from 'next/navigation'
import { getAdvertiserContext } from '@/lib/advertiser'
import { createAdminClient } from '@/lib/supabase/admin'
import { countryName } from '@/lib/countries'
import { r2Configured } from '@/lib/r2'
import CampaignBuilder from '@/components/CampaignBuilder'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function EditPage({ params }) {
  const ctx = await getAdvertiserContext()
  if (ctx.error) return null
  if (!UUID.test(params.id)) notFound()
  const adv = ctx.advertiser
  const admin = createAdminClient()
  const { data: c } = await admin.from('ad_campaigns').select('*').eq('id', params.id).eq('advertiser_id', adv.id).maybeSingle()
  if (!c) notFound()
  if (!['draft', 'rejected'].includes(c.status)) redirect('/campaigns/' + c.id)

  const initial = {
    id: c.id, name: c.name, placement: c.placement, content: c.content, cta_text: c.cta_text, link_url: c.link_url,
    image_url: c.image_url, video_url: c.video_url,
    start_date: c.start_at ? new Date(c.start_at).toISOString().slice(0, 10) : null,
    days: c.days, status: c.status, locked: !!c.paid_at, rejection_reason: c.status === 'rejected' ? c.rejection_reason : null,
    money: c.paid_at ? { currency: c.currency, total_minor: c.total_minor, subtotal_minor: c.subtotal_minor, vat_minor: c.vat_minor, vat_percent: c.vat_percent, price_per_day_minor: c.price_per_day_minor, days: c.days } : null,
  }
  return <CampaignBuilder initial={initial} business={adv.business_name} countryLabel={countryName(adv.country_code)} storageReady={r2Configured()} />
}
