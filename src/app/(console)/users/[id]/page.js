import { notFound } from 'next/navigation'
import { getStaffContext, can } from '@/lib/staff'
import { createAdminClient } from '@/lib/supabase/admin'
import { utc } from '@/lib/format'
import UserClient from '@/components/UserClient'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const REASONS = {
  child_safety: 'Child safety',
  nudity_sexual: 'Nudity or sexual content',
  violence: 'Violence',
  harassment: 'Harassment',
  hate_speech: 'Hate speech',
  spam: 'Spam or scam',
  other: 'Other',
}

export default async function UserPage({ params }) {
  const ctx = await getStaffContext()
  if (ctx.error) return null
  if (!can(ctx, 'users.view')) {
    return (
      <section className="card">
        <h2>No access</h2>
        <p>Your role can’t look up users.</p>
      </section>
    )
  }
  const id = params.id
  if (!UUID.test(id)) notFound()

  const admin = createAdminClient()
  const { data: p } = await admin.from('profiles').select('*').eq('id', id).maybeSingle()
  if (!p) notFound()

  let bannedUntil = null
  let lastSignIn = null
  try {
    const { data } = await admin.auth.admin.getUserById(id)
    bannedUntil = (data && data.user && data.user.banned_until) || null
    lastSignIn = (data && data.user && data.user.last_sign_in_at) || null
  } catch {}

  const [staffRes, postsCount, reelsCount, recentPosts, ownReports] = await Promise.all([
    admin.from('staff_members').select('role_key').eq('user_id', id).maybeSingle(),
    admin.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', id),
    admin.from('reels').select('id', { count: 'exact', head: true }).eq('user_id', id),
    admin.from('posts').select('id,content,image_url,video_url,created_at').eq('user_id', id).order('created_at', { ascending: false }).limit(10),
    admin.from('reports').select('id,reason,status,created_at,reported_post_id').eq('reported_user_id', id).order('created_at', { ascending: false }).limit(20),
  ])

  // Reports on their posts too (last 100 posts).
  const { data: idRows } = await admin.from('posts').select('id').eq('user_id', id).order('created_at', { ascending: false }).limit(100)
  const postIds = (idRows || []).map((r) => r.id)
  let postReports = []
  if (postIds.length) {
    const r = await admin.from('reports').select('id,reason,status,created_at,reported_post_id').in('reported_post_id', postIds).order('created_at', { ascending: false }).limit(20)
    postReports = r.data || []
  }
  const seen = new Set()
  const reports = [...(ownReports.data || []), ...postReports]
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  let subs = []
  if (can(ctx, 'subscriptions.view')) {
    const r = await admin.from('subscriptions').select('product_id,plan,state,expires_at,updated_at').eq('user_id', id).order('updated_at', { ascending: false }).limit(5)
    subs = r.data || []
  }

  const perms = {
    canBan: can(ctx, 'users.ban'),
    canBanPermanent: can(ctx, 'users.ban.permanent'),
    canUnban: can(ctx, 'users.unban'),
    canBadge: can(ctx, 'badges.grant'),
  }
  const isStaff = !!staffRes.data

  return (
    <>
      <p>
        <a href="/users">← All users</a>
      </p>
      <h1>
        {p.display_name} <small className="meta inline">@{p.username}</small>
      </h1>

      <section className="card">
        <h2>Profile</h2>
        <dl className="kv">
          <dt>User ID</dt>
          <dd className="mono">{p.id}</dd>
          <dt>Joined</dt>
          <dd>{utc(p.created_at)}</dd>
          <dt>Last seen</dt>
          <dd>{p.last_seen_at ? utc(p.last_seen_at) : '—'}</dd>
          <dt>Last sign-in</dt>
          <dd>{lastSignIn ? utc(lastSignIn) : '—'}</dd>
          <dt>Location</dt>
          <dd>{p.location || '—'}</dd>
          <dt>Followers</dt>
          <dd>{p.followers_count ?? 0}</dd>
          <dt>Following</dt>
          <dd>{p.following_count ?? 0}</dd>
          <dt>Account</dt>
          <dd>{p.is_private ? 'Private' : 'Public'}</dd>
          <dt>Posts / Reels</dt>
          <dd>
            {postsCount.count ?? 0} / {reelsCount.count ?? 0}
          </dd>
          {isStaff ? (
            <>
              <dt>Staff</dt>
              <dd>{staffRes.data.role_key}</dd>
            </>
          ) : null}
        </dl>
        {p.bio ? <p className="details">{p.bio}</p> : null}
      </section>

      <UserClient
        user={{ id: p.id, username: p.username, verified: !!p.verified, is_authentic: !!p.is_authentic, verified_plan: p.verified_plan || null, verified_until: p.verified_until || null }}
        bannedUntil={bannedUntil}
        isStaff={isStaff}
        perms={perms}
      />

      {subs.length > 0 ? (
        <section className="card">
          <h2>Subscriptions</h2>
          <ul className="rows">
            {subs.map((s, i) => (
              <li key={i}>
                <span>
                  {s.plan || s.product_id} · {s.state}
                </span>
                <small>expires {utc(s.expires_at)}</small>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card">
        <h2>Reports against them ({reports.length})</h2>
        {reports.length === 0 ? (
          <p>None.</p>
        ) : (
          <ul className="rows">
            {reports.slice(0, 10).map((r) => (
              <li key={r.id}>
                <span>
                  {REASONS[r.reason] || r.reason || 'No reason'} · {r.reported_post_id ? 'on a post' : 'on the profile'}
                </span>
                <small>
                  {r.status} · {utc(r.created_at)}
                </small>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Recent posts</h2>
        {(recentPosts.data || []).length === 0 ? (
          <p>No posts.</p>
        ) : (
          <ul className="rows">
            {recentPosts.data.map((post) => (
              <li key={post.id}>
                <span className="content">
                  {post.content ? String(post.content).slice(0, 200) : post.video_url ? '[video]' : post.image_url ? '[image]' : '[empty]'}
                </span>
                <small>{utc(post.created_at)}</small>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
