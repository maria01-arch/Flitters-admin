import { getStaffContext, can } from '@/lib/staff'
import { createAdminClient } from '@/lib/supabase/admin'
import { countryName } from '@/lib/countries'
import AdsClient from '@/components/AdsClient'

export const dynamic = 'force-dynamic'

const STATUSES = ['pending_review', 'approved', 'live', 'paused', 'completed', 'rejected', 'awaiting_payment', 'draft', 'cancelled', 'refunded']
const https = (u) => typeof u === 'string' && /^https:\/\/[^\s]+$/i.test(u)

function hostOf(u) {
  try { return new URL(u).hostname } catch { return '' }
}

function checklist(c, adv) {
  const out = []
  const add = (ok, label) => out.push({ ok: !!ok, label })
  add(c.paid_at, 'Paid')
  add(https(c.link_url), 'Link starts with https://' + (https(c.link_url) ? ' (goes to ' + hostOf(c.link_url) + ')' : ''))
  add(c.placement === 'feed' ? c.image_url && !c.video_url : c.video_url, c.placement === 'feed' ? 'Feed ad has an image and no video' : 'Reel ad has a video')
  add(!c.content || c.content.length <= 300, 'Text is 300 characters or less')
  add(!c.cta_text || c.cta_text.length <= 24, 'Button text is 24 characters or less')
  add(c.start_at && c.end_at && new Date(c.start_at) < new Date(c.end_at) && new Date(c.end_at) > new Date(), 'Dates are valid and not over')
  add(adv && adv.status === 'active', 'Advertiser account is active')
  return out
}

export default async function AdsPage({ searchParams }) {
  const ctx = await getStaffContext()
  if (ctx.error) return null
  const perms = { canReview: can(ctx, 'ads.review'), canEdit: can(ctx, 'ads.edit'), canBilling: can(ctx, 'ads.billing.view') }
  if (!perms.canReview && !perms.canEdit && !perms.canBilling) {
    return (
      <section className="card">
        <h2>No access</h2>
        <p>Your role can’t open ads.</p>
      </section>
    )
  }
  const sp = searchParams || {}
  const tab = ['review', 'campaigns', 'house'].includes(sp.tab) ? sp.tab : perms.canReview ? 'review' : 'campaigns'
  const status = STATUSES.includes(sp.status) ? sp.status : null
  const admin = createAdminClient()

  let campaigns = []
  let houseAds = []
  let error = null

  if (tab === 'house') {
    const r = await admin.from('ads').select('*').is('campaign_id', null).order('created_at', { ascending: false }).limit(100)
    houseAds = r.data || []
    error = r.error ? r.error.message : null
  } else {
    let q = admin.from('ad_campaigns').select('*').limit(50)
    if (tab === 'review') q = q.eq('status', 'pending_review').order('created_at', { ascending: true })
    else {
      q = q.order('created_at', { ascending: false })
      if (status) q = q.eq('status', status)
    }
    const r = await q
    error = r.error ? r.error.message : null
    const rows = r.data || []
    const advIds = Array.from(new Set(rows.map((c) => c.advertiser_id)))
    const campIds = rows.map((c) => c.id)
    const [advRes, adRes] = await Promise.all([
      advIds.length ? admin.from('advertisers').select('id,business_name,contact_email,country_code,status').in('id', advIds) : { data: [] },
      campIds.length ? admin.from('ads').select('id,campaign_id').in('campaign_id', campIds) : { data: [] },
    ])
    const advMap = new Map((advRes.data || []).map((a) => [a.id, a]))
    const adByCamp = new Map((adRes.data || []).map((a) => [a.campaign_id, a.id]))
    const adIds = Array.from(adByCamp.values())
    const { data: stats } = adIds.length ? await admin.from('ad_stats_daily').select('ad_id,impressions,clicks').in('ad_id', adIds) : { data: [] }
    const totals = new Map()
    ;(stats || []).forEach((s) => {
      const t = totals.get(s.ad_id) || { impressions: 0, clicks: 0 }
      t.impressions += Number(s.impressions)
      t.clicks += Number(s.clicks)
      totals.set(s.ad_id, t)
    })
    campaigns = rows.map((c) => {
      const adv = advMap.get(c.advertiser_id)
      const t = adByCamp.has(c.id) ? totals.get(adByCamp.get(c.id)) || { impressions: 0, clicks: 0 } : null
      return {
        id: c.id, name: c.name, status: c.status, placement: c.placement,
        content: c.content, image_url: c.image_url, video_url: c.video_url, link_url: c.link_url, cta_text: c.cta_text,
        start_at: c.start_at, end_at: c.end_at, days: c.days, paid_at: c.paid_at, created_at: c.created_at,
        rejection_reason: c.rejection_reason,
        money: perms.canBilling ? { currency: c.currency, total_minor: c.total_minor, vat_minor: c.vat_minor, price_per_day_minor: c.price_per_day_minor } : null,
        advertiser: adv ? { name: adv.business_name, email: perms.canBilling || perms.canReview ? adv.contact_email : null, country: countryName(adv.country_code) } : null,
        checks: checklist(c, adv),
        stats: t,
      }
    })
  }

  return <AdsClient key={tab + (status || '')} tab={tab} status={status} campaigns={campaigns} houseAds={houseAds} perms={perms} error={error} />
}
