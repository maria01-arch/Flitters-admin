import { getStaffContext, can } from '@/lib/staff'
import { createAdminClient } from '@/lib/supabase/admin'
import TicketsClient from '@/components/TicketsClient'

export const dynamic = 'force-dynamic'
const FILTERS = ['open', 'pending_user', 'resolved', 'all']

export default async function TicketsPage({ searchParams }) {
  const ctx = await getStaffContext()
  if (ctx.error) return null
  if (!can(ctx, 'tickets.view')) {
    return (
      <section className="card">
        <h2>No access</h2>
        <p>Your role can’t see help requests.</p>
      </section>
    )
  }
  const filter = FILTERS.includes(searchParams && searchParams.filter) ? searchParams.filter : 'open'
  const admin = createAdminClient()

  let q = admin.from('support_tickets').select('*').limit(30)
  if (filter !== 'all') q = q.eq('status', filter)
  q = filter === 'resolved' || filter === 'all' ? q.order('updated_at', { ascending: false }) : q.order('updated_at', { ascending: true })
  const { data: rows, error } = await q
  if (error) {
    return (
      <section className="card">
        <h2>Couldn’t load help requests</h2>
        <p className="err">{error.message}</p>
        <p className="hint">If this says a table does not exist, run 03_account_health_help.sql in Supabase.</p>
      </section>
    )
  }

  const ids = (rows || []).map((t) => t.id)
  const userIds = Array.from(new Set((rows || []).map((t) => t.user_id)))
  const [mr, pr] = await Promise.all([
    ids.length ? admin.from('support_messages').select('id,ticket_id,sender_type,body,created_at').in('ticket_id', ids).order('created_at', { ascending: true }) : { data: [] },
    userIds.length ? admin.from('profiles').select('id,username,display_name').in('id', userIds) : { data: [] },
  ])
  const byTicket = new Map()
  for (const m of mr.data || []) {
    if (!byTicket.has(m.ticket_id)) byTicket.set(m.ticket_id, [])
    byTicket.get(m.ticket_id).push({ id: m.id, from: m.sender_type, body: m.body, created_at: m.created_at })
  }
  const people = new Map((pr.data || []).map((p) => [p.id, p]))

  const items = (rows || []).map((t) => {
    const p = people.get(t.user_id) || {}
    return {
      id: t.id, user_id: t.user_id, username: p.username || null, display_name: p.display_name || null,
      category: t.category, subject: t.subject, status: t.status, created_at: t.created_at, updated_at: t.updated_at,
      messages: byTicket.get(t.id) || [],
    }
  })

  return <TicketsClient key={filter} initial={items} filter={filter} canReply={can(ctx, 'tickets.reply')} canViewUsers={can(ctx, 'users.view')} />
}
