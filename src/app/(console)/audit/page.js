import { getStaffContext, can } from '@/lib/staff'
import { createAdminClient } from '@/lib/supabase/admin'
import { utc, ACTION_LABELS } from '@/lib/format'

export const dynamic = 'force-dynamic'

const PAGE = 50

export default async function AuditPage({ searchParams }) {
  const ctx = await getStaffContext()
  if (ctx.error) return null
  if (!can(ctx, 'audit.view')) {
    return (
      <section className="card">
        <h2>No access</h2>
        <p>Your role can’t read the audit log.</p>
      </section>
    )
  }
  const sp = searchParams || {}
  const action = Object.prototype.hasOwnProperty.call(ACTION_LABELS, sp.action) ? sp.action : ''
  const who = String(sp.who || '').replace(/[^a-zA-Z0-9@._+-]/g, '').slice(0, 60)
  const before = /^\d+$/.test(String(sp.before || '')) ? Number(sp.before) : null

  const admin = createAdminClient()
  let q = admin.from('audit_log').select('*').order('id', { ascending: false }).limit(PAGE + 1)
  if (action) q = q.eq('action', action)
  if (who) q = q.ilike('actor_email', '%' + who + '%')
  if (before) q = q.lt('id', before)
  const { data, error } = await q
  const rows = (data || []).slice(0, PAGE)
  const more = (data || []).length > PAGE
  const keep = '&action=' + encodeURIComponent(action) + '&who=' + encodeURIComponent(who)

  return (
    <>
      <h1>Audit log</h1>
      <form method="get" action="/audit" className="stack">
        <label className="field"><span>What happened</span>
          <select name="action" defaultValue={action}>
            <option value="">Everything</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="field"><span>Who (part of an email)</span><input name="who" defaultValue={who} /></label>
        <button type="submit" className="btn">Filter</button>
      </form>

      {error ? <p className="err">{error.message}</p> : null}
      {rows.length === 0 ? <section className="card"><p>Nothing found.</p></section> : null}
      {rows.map((r) => (
        <section key={r.id} className="card audit">
          <div className="report-head">
            <div>
              <strong>{ACTION_LABELS[r.action] || r.action}</strong>
              <small className="meta">{r.actor_email || 'unknown'} · {utc(r.at)}{r.ip ? ' · ' + r.ip : ''}</small>
              {r.target_id ? <small className="meta">{r.target_type} {r.target_id}</small> : null}
            </div>
            <span className="badge">#{r.id}</span>
          </div>
          {r.before || r.after || r.meta ? (
            <details>
              <summary>Details</summary>
              <pre className="json">{JSON.stringify({ before: r.before, after: r.after, meta: r.meta }, null, 2)}</pre>
            </details>
          ) : null}
        </section>
      ))}
      {more && rows.length ? (
        <div className="actions"><a className="btn" href={'/audit?before=' + rows[rows.length - 1].id + keep}>Older entries</a></div>
      ) : null}
    </>
  )
}
