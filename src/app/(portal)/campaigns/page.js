import { getAdvertiserContext } from '@/lib/advertiser'
import { createAdminClient } from '@/lib/supabase/admin'
import { day } from '@/lib/format'
import { statsByCampaign } from '@/lib/stats'
import StatusPill from '@/components/StatusPill'
import Icon from '@/components/Icon'

export const dynamic = 'force-dynamic'

export default async function CampaignsPage() {
  const ctx = await getAdvertiserContext()
  if (ctx.error) return null
  const admin = createAdminClient()
  const { data } = await admin.from('ad_campaigns').select('*').eq('advertiser_id', ctx.advertiser.id).neq('status', 'cancelled').order('created_at', { ascending: false }).limit(100)
  const rows = data || []
  const stats = await statsByCampaign(admin, rows.map((c) => c.id))

  return (
    <>
      <div className="spread"><h1>Campaigns</h1><a className="btn btn-primary btn-small" href="/create"><Icon name="plus" />New</a></div>
      {rows.length === 0 ? (
        <section className="card empty">
          <span className="logo-mark"><Icon name="megaphone" /></span>
          <h2>No campaigns yet</h2>
          <p className="hint">Create your first ad. It takes about three minutes.</p>
          <a className="btn btn-primary" href="/create">Create a campaign</a>
        </section>
      ) : (
        <div className="list">
          {rows.map((c) => (
            <a key={c.id} className="camp" href={'/campaigns/' + c.id}>
              <div className="camp-thumb">
                {c.image_url ? <img src={c.image_url} alt="" loading="lazy" /> : c.video_url ? <Icon name="video" /> : <Icon name="image" />}
              </div>
              <div className="camp-body">
                <strong>{c.name}</strong>
                <small>{c.placement === 'reel' ? 'Reels' : 'Feed'}{c.start_at ? ' · ' + day(c.start_at) : ''}{c.days ? ' · ' + c.days + ' days' : ''}</small>
                {stats.get(c.id) ? <small>{stats.get(c.id).impressions.toLocaleString('en')} views · {stats.get(c.id).clicks.toLocaleString('en')} clicks</small> : null}
                <span><StatusPill status={c.status} /></span>
              </div>
            </a>
          ))}
        </div>
      )}
    </>
  )
}
