import { getAdvertiserContext } from '@/lib/advertiser'
import { createAdminClient } from '@/lib/supabase/admin'
import Icon from '@/components/Icon'
import { statsByCampaign } from '@/lib/stats'

export const dynamic = 'force-dynamic'

export default async function Dashboard() {
  const ctx = await getAdvertiserContext()
  if (ctx.error) return null
  const adv = ctx.advertiser

  const admin = createAdminClient()
  const { data: rows } = await admin.from('ad_campaigns').select('id,status').eq('advertiser_id', adv.id)
  const n = (...st) => (rows || []).filter((r) => st.includes(r.status)).length
  const total = (rows || []).length
  const st = await statsByCampaign(admin, (rows || []).map((r) => r.id))
  let views = 0
  let clicks = 0
  st.forEach((s) => { views += s.impressions; clicks += s.clicks })

  return (
    <>
      <section className="hero">
        <h1>{total === 0 ? 'Ready to reach people on Flitters?' : 'Welcome back, ' + adv.business_name}</h1>
        <p>Pick feed or Reels, add your picture or video, choose your dates, and we do the rest. We review within 24 hours.</p>
        <a className="btn" href="/create"><Icon name="plus" />Create a campaign</a>
      </section>

      <section className="stats" aria-label="Your campaigns">
        <div className="stat"><strong>{n('live')}</strong><span>Live now</span></div>
        <div className="stat"><strong>{n('pending_review', 'approved')}</strong><span>In review or scheduled</span></div>
        <div className="stat"><strong>{n('draft', 'awaiting_payment', 'rejected')}</strong><span>Need your attention</span></div>
        <div className="stat"><strong>{views.toLocaleString('en')}</strong><span>Views</span></div>
        <div className="stat"><strong>{clicks.toLocaleString('en')}</strong><span>Clicks</span></div>
      </section>

      <section className="card">
        <div className="spread"><h2>Your campaigns</h2><a href="/campaigns">See all</a></div>
        {total === 0 ? <p className="hint">Nothing here yet. Your first campaign takes about three minutes.</p> : <p className="hint">You have {total} campaign{total === 1 ? '' : 's'}.</p>}
      </section>
    </>
  )
}
