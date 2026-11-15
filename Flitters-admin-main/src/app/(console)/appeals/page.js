import { getStaffContext, can } from '@/lib/staff'
import { createAdminClient } from '@/lib/supabase/admin'
import AppealsClient from '@/components/AppealsClient'

export const dynamic = 'force-dynamic'

export default async function AppealsPage({ searchParams }) {
  const ctx = await getStaffContext()
  if (ctx.error) return null
  if (!can(ctx, 'appeals.review')) {
    return (
      <section className="card">
        <h2>No access</h2>
        <p>Your role can’t review ban appeals.</p>
      </section>
    )
  }
  const filter = searchParams && searchParams.filter === 'all' ? 'all' : 'pending'
  const admin = createAdminClient()

  let q = admin.from('ban_appeals').select('*').limit(50)
  q = filter === 'pending' ? q.eq('status', 'pending').order('created_at', { ascending: true }) : q.order('created_at', { ascending: false })
  const { data: rows, error } = await q
  if (error) {
    return (
      <section className="card">
        <h2>Couldn’t load appeals</h2>
        <p className="err">{error.message}</p>
      </section>
    )
  }

  const ids = Array.from(new Set((rows || []).map((a) => a.user_id)))
  const { data: people } = ids.length ? await admin.from('profiles').select('id,username,display_name,ban_reason,banned_at').in('id', ids) : { data: [] }
  const personMap = new Map((people || []).map((p) => [p.id, p]))

  // Is the person still banned? Only worth checking for appeals waiting on us.
  const bans = new Map()
  await Promise.all(
    (rows || []).filter((a) => a.status === 'pending').map(async (a) => {
      try {
        const { data } = await admin.auth.admin.getUserById(a.user_id)
        bans.set(a.user_id, (data && data.user && data.user.banned_until) || null)
      } catch {}
    })
  )

  const items = (rows || []).map((a) => {
    const p = personMap.get(a.user_id)
    return {
      id: a.id,
      user_id: a.user_id,
      username: p ? p.username : null,
      display_name: p ? p.display_name : null,
      ban_reason: p ? p.ban_reason : null,
      banned_at: p ? p.banned_at : null,
      banned_until: bans.get(a.user_id) || null,
      message: a.message,
      status: a.status,
      admin_note: a.admin_note,
      created_at: a.created_at,
      reviewed_at: a.reviewed_at,
    }
  })

  return <AppealsClient key={filter} initial={items} filter={filter} canViewUsers={can(ctx, 'users.view')} />
}
