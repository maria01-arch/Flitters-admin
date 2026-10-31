import { getStaffContext, can } from '@/lib/staff'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const LABELS = { 'auth.sign_in': 'Signed in' }

function when(iso) {
  return new Date(iso).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
}

export default async function Dashboard() {
  const ctx = await getStaffContext()
  if (ctx.error) return null

  const everything = ctx.permissions.includes('*')
  let recent = []
  if (can(ctx, 'audit.view')) {
    const admin = createAdminClient()
    const { data } = await admin
      .from('audit_log')
      .select('id, at, actor_email, action, target_type, target_id')
      .order('at', { ascending: false })
      .limit(8)
    recent = data || []
  }

  return (
    <>
      <h1>Hello, {ctx.user.email}</h1>
      <p className="lead">
        You are signed in as <strong>{ctx.role?.name || ctx.member.role_key}</strong>. Reports, users, ads and team
        tools arrive in the next steps.
      </p>

      <section className="card">
        <h2>What you can do</h2>
        {everything ? (
          <p>Everything. This role has every permission.</p>
        ) : ctx.permissions.length === 0 ? (
          <p>No permissions yet. Ask the Owner to give you a role.</p>
        ) : (
          <ul className="chips">
            {ctx.permissions.map((p) => (
              <li key={p} className="chip">
                {p}
              </li>
            ))}
          </ul>
        )}
      </section>

      {can(ctx, 'audit.view') ? (
        <section className="card">
          <h2>Recent activity</h2>
          {recent.length === 0 ? (
            <p>Nothing recorded yet.</p>
          ) : (
            <ul className="rows">
              {recent.map((r) => (
                <li key={r.id}>
                  <span>
                    {LABELS[r.action] || r.action}
                    {r.target_id ? ' · ' + r.target_type + ' ' + r.target_id : ''}
                  </span>
                  <small>
                    {r.actor_email || 'unknown'} · {when(r.at)}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </>
  )
}
