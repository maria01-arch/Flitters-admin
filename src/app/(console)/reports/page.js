import { getStaffContext, can } from '@/lib/staff'
import { createAdminClient } from '@/lib/supabase/admin'
import ReportsClient from '@/components/ReportsClient'

export const dynamic = 'force-dynamic'

const none = Promise.resolve({ data: [] })

export default async function ReportsPage({ searchParams }) {
  const ctx = await getStaffContext()
  if (ctx.error) return null
  if (!can(ctx, 'reports.view')) {
    return (
      <section className="card">
        <h2>No access</h2>
        <p>Your role can’t view reports.</p>
      </section>
    )
  }

  const filter = searchParams && searchParams.filter === 'all' ? 'all' : 'pending'
  const admin = createAdminClient()

  let q = admin
    .from('reports')
    .select('id,reporter_id,reported_user_id,reported_post_id,reported_comment_id,reported_message_id,reported_reel_id,reason,details,status,created_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (filter === 'pending') q = q.eq('status', 'pending')
  const { data: rows, error } = await q
  if (error) {
    return (
      <section className="card">
        <h2>Couldn’t load reports</h2>
        <p className="err">{error.message}</p>
      </section>
    )
  }

  const ids = (key) => Array.from(new Set(rows.map((r) => r[key]).filter(Boolean)))
  const postIds = ids('reported_post_id')
  const commentIds = ids('reported_comment_id')
  const reelIds = ids('reported_reel_id')

  const [posts, comments, reels] = await Promise.all([
    postIds.length ? admin.from('posts').select('id,user_id,content,image_url,video_url,created_at').in('id', postIds) : none,
    commentIds.length ? admin.from('comments').select('id,user_id,content,created_at').in('id', commentIds) : none,
    reelIds.length ? admin.from('reels').select('id,user_id,video_url,caption,created_at').in('id', reelIds) : none,
  ])
  const byId = (res) => new Map((res.data || []).map((x) => [x.id, x]))
  const postMap = byId(posts)
  const commentMap = byId(comments)
  const reelMap = byId(reels)

  const personIds = new Set()
  rows.forEach((r) => {
    if (r.reporter_id) personIds.add(r.reporter_id)
    if (r.reported_user_id) personIds.add(r.reported_user_id)
  })
  ;[postMap, commentMap, reelMap].forEach((m) => m.forEach((t) => t.user_id && personIds.add(t.user_id)))
  const { data: people } = personIds.size
    ? await admin.from('profiles').select('id,username,display_name').in('id', Array.from(personIds))
    : { data: [] }
  const personMap = new Map((people || []).map((p) => [p.id, { username: p.username, display_name: p.display_name }]))
  const who = (id) => (id ? personMap.get(id) || null : null)

  const items = rows.map((r) => {
    let kind = 'unknown'
    let targetId = null
    let target = null
    if (r.reported_post_id) {
      kind = 'post'
      targetId = r.reported_post_id
      const t = postMap.get(targetId)
      target = t ? { content: t.content, image_url: t.image_url, video_url: t.video_url, created_at: t.created_at, user_id: t.user_id } : { missing: true }
    } else if (r.reported_comment_id) {
      kind = 'comment'
      targetId = r.reported_comment_id
      const t = commentMap.get(targetId)
      target = t ? { content: t.content, created_at: t.created_at, user_id: t.user_id } : { missing: true }
    } else if (r.reported_reel_id) {
      kind = 'reel'
      targetId = r.reported_reel_id
      const t = reelMap.get(targetId)
      target = t ? { content: t.caption, video_url: t.video_url, created_at: t.created_at, user_id: t.user_id } : { missing: true }
    } else if (r.reported_message_id) {
      kind = 'message'
      targetId = r.reported_message_id
      target = { private: true }
    } else if (r.reported_user_id) {
      kind = 'user'
      targetId = r.reported_user_id
    }
    const offenderId = r.reported_user_id || (target && target.user_id) || null
    if (target && target.user_id) target.author = who(target.user_id)
    return {
      id: r.id,
      kind,
      targetId,
      reason: r.reason,
      details: r.details,
      status: r.status,
      created_at: r.created_at,
      reporter: who(r.reporter_id),
      offenderId,
      offender: who(offenderId),
      target,
    }
  })

  items.sort((a, b) => {
    const au = a.reason === 'child_safety' && a.status === 'pending'
    const bu = b.reason === 'child_safety' && b.status === 'pending'
    if (au !== bu) return au ? -1 : 1
    return new Date(b.created_at) - new Date(a.created_at)
  })

  const perms = {
    canDelete: can(ctx, 'content.delete'),
    canBan: can(ctx, 'users.ban'),
    canBanPermanent: can(ctx, 'users.ban.permanent'),
    canUnban: can(ctx, 'users.unban'),
    canResolve: can(ctx, 'reports.resolve'),
  }

  return <ReportsClient key={filter} initial={items} filter={filter} perms={perms} />
}
