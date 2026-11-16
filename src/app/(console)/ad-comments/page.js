import { getStaffContext, can } from '@/lib/staff'
import { createAdminClient } from '@/lib/supabase/admin'
import AdCommentsClient from '@/components/AdCommentsClient'

export const dynamic = 'force-dynamic'

export default async function AdCommentsPage() {
  const ctx = await getStaffContext()
  if (ctx.error) return null
  if (!can(ctx, 'ads.review')) {
    return (
      <section className="card">
        <h2>No access</h2>
        <p>Your role can’t moderate ad comments.</p>
      </section>
    )
  }
  const admin = createAdminClient()
  const { data: rows, error } = await admin.from('ad_comments').select('id,ad_id,user_id,content,created_at').order('created_at', { ascending: false }).limit(100)
  if (error) {
    return (
      <section className="card">
        <h2>Couldn’t load ad comments</h2>
        <p className="err">{error.message}</p>
        <p className="hint">If this says a table does not exist, run 05_ad_engagement.sql in Supabase.</p>
      </section>
    )
  }
  const userIds = Array.from(new Set((rows || []).map((r) => r.user_id)))
  const adIds = Array.from(new Set((rows || []).map((r) => r.ad_id)))
  const [pr, ar] = await Promise.all([
    userIds.length ? admin.from('profiles').select('id,username,display_name').in('id', userIds) : { data: [] },
    adIds.length ? admin.from('ads').select('id,advertiser_name,content').in('id', adIds) : { data: [] },
  ])
  const people = new Map((pr.data || []).map((p) => [p.id, p]))
  const ads = new Map((ar.data || []).map((a) => [a.id, a]))
  const items = (rows || []).map((r) => ({
    id: r.id,
    content: r.content,
    created_at: r.created_at,
    username: (people.get(r.user_id) || {}).username || null,
    display_name: (people.get(r.user_id) || {}).display_name || null,
    user_id: r.user_id,
    ad: ads.get(r.ad_id) ? (ads.get(r.ad_id).advertiser_name || 'Ad') + ' — ' + String(ads.get(r.ad_id).content || '').slice(0, 60) : 'Ad',
  }))
  return <AdCommentsClient initial={items} canViewUsers={can(ctx, 'users.view')} />
}
