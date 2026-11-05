import { getStaffContext, can } from '@/lib/staff'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCounts } from '@/lib/counts'
import { ACTION_LABELS as LABELS, ago } from '@/lib/format'
import { PERMISSIONS } from '@/lib/permissions'
import SearchButton from '@/components/SearchButton'
import Icon from '@/components/Icon'

export const dynamic = 'force-dynamic'

export default async function Dashboard() {
  const ctx = await getStaffContext()
  if (ctx.error) return null
  const admin = createAdminClient()
  const everything = ctx.permissions.includes('*')
  const counts = await getCounts(admin, ctx)

  let recent = []
  if (can(ctx, 'audit.view')) {
    const { data } = await admin.from('audit_log').select('id, at, actor_email, action, target_type, target_id').order('at', { ascending: false }).limit(8)
    recent = data || []
  }

  const tiles = []
  if (counts.urgent > 0) tiles.push({ n: counts.urgent, label: 'Urgent child-safety reports', href: '/reports', urgent: true })
  if (counts.reports !== null) tiles.push({ n: counts.reports, label: 'Reports waiting', href: '/reports' })
  if (counts.ads !== null) tiles.push({ n: counts.ads, label: 'Ads to review', href: '/ads?tab=review' })
  if (counts.appeals !== null) tiles.push({ n: counts.appeals, label: 'Ban appeals waiting', href: '/appeals' })
  const waiting = (counts.reports || 0) + (counts.ads || 0) + (counts.appeals || 0)

  const actions = [
    can(ctx, 'reports.view') && ['/reports', 'Review reports', 'flag'],
    can(ctx, 'ads.review') && ['/ads?tab=review', 'Review ads', 'megaphone'],
    can(ctx, 'appeals.review') && ['/appeals', 'Review appeals', 'message'],
    can(ctx, 'pricing.manage') && ['/pricing', 'Change prices', 'tag'],
    can(ctx, 'staff.manage') && ['/team', 'Invite someone', 'users'],
  ].filter(Boolean)

  const labelFor = (k) => (PERMISSIONS.find((p) => p[0] === k) || [k, k])[1]

  return (
    <>
      <div className="phead">
        <div>
          <h1>Welcome back</h1>
          <p className="lead">{ctx.user.email} · {ctx.role?.name || ctx.member.role_key}</p>
        </div>
      </div>
      {can(ctx, 'users.view') ? <SearchButton /> : null}

      {tiles.length > 0 ? (
        <section className="tiles" aria-label="Needs your attention">
          {tiles.map((t) => (
            <a key={t.label} href={t.href} className={'tile' + (t.urgent ? ' tile-urgent' : '') + (t.n === 0 ? ' tile-zero' : '')}>
              <strong>{t.n}</strong>
              <span>{t.label}</span>
              <em>{t.n > 0 ? 'Open' : 'All clear'} <Icon name="arrow" /></em>
            </a>
          ))}
        </section>
      ) : null}
      {tiles.length > 0 && waiting === 0 && !counts.urgent ? <p className="hint">You are all caught up. Nothing is waiting for you right now.</p> : null}

      {actions.length > 0 ? (
        <section className="card">
          <h2>Quick actions</h2>
          <div className="actions">
            {actions.map(([href, label, icon]) => <a key={href} href={href} className="btn"><Icon name={icon} />{label}</a>)}
          </div>
        </section>
      ) : null}

      {can(ctx, 'audit.view') ? (
        <section className="card">
          <div className="spread"><h2>Recent activity</h2><a href="/audit">See all</a></div>
          {recent.length === 0 ? (
            <p className="hint">Nothing recorded yet.</p>
          ) : (
            <ul className="feed">
              {recent.map((r) => (
                <li key={r.id}>
                  <span className="feed-dot" />
                  <div>
                    <strong>{LABELS[r.action] || r.action}</strong>
                    <small>{r.actor_email || 'unknown'}{r.target_id ? ' · ' + r.target_type + ' ' + String(r.target_id).slice(0, 8) : ''}</small>
                  </div>
                  <time>{ago(r.at)}</time>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <details className="card access">
        <summary>What your role can do</summary>
        {everything ? <p>Everything. This role has every permission.</p> : ctx.permissions.length === 0 ? <p>No permissions yet. Ask the Owner to give you a role.</p> : (
          <ul className="chips">{ctx.permissions.map((p) => <li key={p} className="chip">{labelFor(p)}</li>)}</ul>
        )}
      </details>
    </>
  )
}
