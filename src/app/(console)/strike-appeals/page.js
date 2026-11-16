import { getStaffContext, can } from '@/lib/staff'
import { createAdminClient } from '@/lib/supabase/admin'
import StrikeAppealsClient from '@/components/StrikeAppealsClient'

export const dynamic = 'force-dynamic'

export default async function StrikeAppealsPage({ searchParams }) {
  const ctx = await getStaffContext()
  if (ctx.error) return null
  if (!can(ctx, 'strikes.review')) {
    return (
      <section className="card">
        <h2>No access</h2>
        <p>Your role can’t review strike appeals.</p>
      </section>
    )
  }
  const filter = searchParams && searchParams.filter === 'all' ? 'all' : 'pending'
  const admin = createAdminClient()

  let q = admin.from('strike_appeals').select('*').limit(50)
  q = filter === 'pending' ? q.eq('status', 'pending').order('created_at', { ascending: true }) : q.order('created_at', { ascending: false })
  const { data: rows, error } = await q
  if (error) {
    return (
      <section className="card">
        <h2>Couldn’t load strike appeals</h2>
        <p className="err">{error.message}</p>
        <p className="hint">If this says a table does not exist, run 03_account_health_help.sql in Supabase.</p>
      </section>
    )
  }

  const strikeIds = Array.from(new Set((rows || []).map((a) => a.strike_id)))
  const userIds = Array.from(new Set((rows || []).map((a) => a.user_id)))
  const [sr, pr] = await Promise.all([
    strikeIds.length ? admin.from('account_strikes').select('*').in('id', strikeIds) : { data: [] },
    userIds.length ? admin.from('profiles').select('id,username,display_name').in('id', userIds) : { data: [] },
  ])
  const strikes = new Map((sr.data || []).map((s) => [s.id, s]))
  const people = new Map((pr.data || []).map((p) => [p.id, p]))

  const items = (rows || []).map((a) => {
    const s = strikes.get(a.strike_id) || {}
    const p = people.get(a.user_id) || {}
    return {
      id: a.id,
      user_id: a.user_id,
      username: p.username || null,
      display_name: p.display_name || null,
      status: a.status,
      message: a.message,
      admin_note: a.admin_note,
      created_at: a.created_at,
      reviewed_at: a.reviewed_at,
      strike: { reason_code: s.reason_code, reason: s.reason, severity: s.severity, content_type: s.content_type, content_snapshot: s.content_snapshot, issued_at: s.issued_at },
    }
  })

  return <StrikeAppealsClient key={filter} initial={items} filter={filter} canViewUsers={can(ctx, 'users.view')} />
}
