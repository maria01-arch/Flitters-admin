import 'server-only'

// Views and clicks per campaign, from the counters the apps fill in.
// Returns Map(campaignId -> { impressions, clicks }) only for campaigns that have an ad row.
export async function statsByCampaign(admin, campaignIds) {
  const out = new Map()
  if (!campaignIds.length) return out
  const { data: ads } = await admin.from('ads').select('id,campaign_id').in('campaign_id', campaignIds)
  const byAd = new Map((ads || []).map((a) => [a.id, a.campaign_id]))
  ;(ads || []).forEach((a) => out.set(a.campaign_id, { impressions: 0, clicks: 0 }))
  if (!byAd.size) return out
  const { data: rows } = await admin.from('ad_stats_daily').select('ad_id,impressions,clicks').in('ad_id', Array.from(byAd.keys()))
  ;(rows || []).forEach((r) => {
    const t = out.get(byAd.get(r.ad_id))
    if (t) {
      t.impressions += Number(r.impressions)
      t.clicks += Number(r.clicks)
    }
  })
  return out
}

export const ctr = (s) => (s && s.impressions > 0 ? ((s.clicks / s.impressions) * 100).toFixed(1) + '%' : '—')
