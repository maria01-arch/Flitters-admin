import 'server-only'
import { can } from '@/lib/staff'

// How many things are waiting for this person. Only counts what their role may see.
export async function getCounts(admin, ctx) {
  const out = { reports: null, urgent: null, ads: null, appeals: null, strikeAppeals: null, tickets: null }
  const jobs = []
  if (can(ctx, 'reports.view')) {
    jobs.push(
      (async () => {
        const a = await admin.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending')
        const u = await admin.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('reason', 'child_safety')
        out.reports = a.error ? null : a.count || 0
        out.urgent = u.error ? null : u.count || 0
      })()
    )
  }
  if (can(ctx, 'ads.review')) {
    jobs.push(
      (async () => {
        const r = await admin.from('ad_campaigns').select('id', { count: 'exact', head: true }).eq('status', 'pending_review')
        out.ads = r.error ? null : r.count || 0
      })()
    )
  }
  if (can(ctx, 'appeals.review')) {
    jobs.push(
      (async () => {
        const r = await admin.from('ban_appeals').select('id', { count: 'exact', head: true }).eq('status', 'pending')
        out.appeals = r.error ? null : r.count || 0
      })()
    )
  }
  if (can(ctx, 'strikes.review')) {
    jobs.push(
      (async () => {
        const r = await admin.from('strike_appeals').select('id', { count: 'exact', head: true }).eq('status', 'pending')
        out.strikeAppeals = r.error ? null : r.count || 0
      })()
    )
  }
  if (can(ctx, 'tickets.view')) {
    jobs.push(
      (async () => {
        const r = await admin.from('support_tickets').select('id', { count: 'exact', head: true }).eq('status', 'open')
        out.tickets = r.error ? null : r.count || 0
      })()
    )
  }
  await Promise.all(jobs)
  return out
}
