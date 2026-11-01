'use client'
import { useEffect, useState } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'
import PermPicker from '@/components/PermPicker'
import { utc } from '@/lib/format'

async function api(body) {
  const res = await fetch('/api/team', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = await res.json().catch(() => ({}))
  if (res.status === 401) {
    window.location.href = '/login'
    throw new Error('Please sign in again')
  }
  if (!res.ok) throw new Error(j.error || 'Something went wrong (' + res.status + ')')
  return j
}

export default function TeamClient({ members, invites, roles, actorPerms, canRoles }) {
  const assignable = roles.filter((r) => r.assignable)
  const [email, setEmail] = useState('')
  const [roleKey, setRoleKey] = useState(assignable[0] ? assignable[0].key : '')
  const [result, setResult] = useState(null) // { link, emailed, emailNote }
  const [copied, setCopied] = useState(false)
  const [dlg, setDlg] = useState(null) // { kind: 'role'|'extra'|'suspend'|'reactivate'|'remove'|'revoke', m? , inv? }
  const [pickRole, setPickRole] = useState('')
  const [pickExtra, setPickExtra] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    if (!msg) return undefined
    const t = setTimeout(() => setMsg(null), 8000)
    return () => clearTimeout(t)
  }, [msg])

  async function sendInvite(e) {
    e.preventDefault()
    setBusy(true)
    setResult(null)
    setCopied(false)
    try {
      const j = await api({ action: 'invite', email, role_key: roleKey })
      setResult(j)
      setEmail('')
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {}
  }

  async function confirm() {
    const { kind, m, inv } = dlg
    setBusy(true)
    try {
      if (kind === 'role') await api({ action: 'set_role', userId: m.user_id, role_key: pickRole })
      else if (kind === 'extra') await api({ action: 'set_extra', userId: m.user_id, permissions: pickExtra })
      else if (kind === 'suspend' || kind === 'reactivate') await api({ action: 'set_status', userId: m.user_id, status: kind === 'suspend' ? 'suspended' : 'active' })
      else if (kind === 'remove') await api({ action: 'remove', userId: m.user_id })
      else if (kind === 'revoke') await api({ action: 'revoke_invite', inviteId: inv.id })
      window.location.reload()
    } catch (err) {
      setMsg({ ok: false, text: err.message })
      setDlg(null)
      setBusy(false)
    }
  }

  const titles = {
    role: 'Change role',
    extra: 'Extra access',
    suspend: 'Suspend this person?',
    reactivate: 'Reactivate this person?',
    remove: 'Remove from the team?',
    revoke: 'Cancel this invite?',
  }
  const messages = {
    role: 'The new role works straight away.',
    extra: 'Tick anything this person should be able to do on top of their role. You can only give access you have yourself.',
    suspend: 'They can’t use the console until you reactivate them. Takes effect on their next click.',
    reactivate: 'They can use the console again.',
    remove: 'They lose all console access straight away. Their Flitters account is not touched.',
    revoke: 'The link stops working.',
  }

  return (
    <>
      <h1>Team</h1>
      <div className="seg">
        <a href="/team" className="segitem segitem-on">People</a>
        {canRoles ? <a href="/team/roles" className="segitem">Roles</a> : <a href="/team/roles" className="segitem">Roles</a>}
      </div>

      <section className="card">
        <h2>Invite someone</h2>
        <form onSubmit={sendInvite} className="stack">
          <label className="field"><span>Their email (the one on their Flitters account)</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label className="field"><span>Role</span><select value={roleKey} onChange={(e) => setRoleKey(e.target.value)}>{assignable.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</select></label>
          <button type="submit" className="btn btn-primary" disabled={busy || !roleKey}>{busy ? 'Working…' : 'Create invite'}</button>
        </form>
        {result ? (
          <div className="preview">
            <p>{result.emailed ? 'Invite emailed. You can also send this link yourself:' : 'Not emailed (' + (result.emailNote || 'email not set up') + '). Send this link to them yourself:'}</p>
            <code className="linkbox">{result.link}</code>
            <div className="actions"><button type="button" className="btn btn-small" onClick={() => copy(result.link)}>{copied ? 'Copied' : 'Copy link'}</button></div>
            <small className="meta">Works once, expires {utc(result.expires)}. They need a Flitters account with this email first.</small>
          </div>
        ) : null}
      </section>

      {invites.length > 0 ? (
        <section className="card">
          <h2>Waiting invites</h2>
          <ul className="rows">
            {invites.map((i) => (
              <li key={i.id}>
                <span>{i.email} · {(roles.find((r) => r.key === i.role_key) || { name: i.role_key }).name}</span>
                <small>expires {utc(i.expires_at)}</small>
                <div className="actions"><button type="button" className="btn btn-small" onClick={() => setDlg({ kind: 'revoke', inv: i })}>Cancel invite</button></div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {members.map((m) => (
        <section key={m.user_id} className="card">
          <div className="report-head">
            <div>
              <strong>{m.email || m.user_id}</strong>
              <small className="meta">{m.roleName}{m.isSelf ? ' · you' : ''}</small>
            </div>
            <span className={'badge' + (m.status === 'suspended' ? ' badge-urgent' : '')}>{m.status}</span>
          </div>
          {m.extra.length > 0 ? <ul className="chips">{m.extra.map((p) => <li key={p} className="chip">+ {p}</li>)}</ul> : null}
          {m.isOwner ? <p className="hint">The Owner can’t be changed or removed.</p> : null}
          {m.manageable ? (
            <div className="actions">
              <button type="button" className="btn btn-small" onClick={() => { setPickRole(m.role_key); setDlg({ kind: 'role', m }) }}>Change role</button>
              <button type="button" className="btn btn-small" onClick={() => { setPickExtra(m.extra); setDlg({ kind: 'extra', m }) }}>Extra access</button>
              <button type="button" className="btn btn-small" onClick={() => setDlg({ kind: m.status === 'active' ? 'suspend' : 'reactivate', m })}>{m.status === 'active' ? 'Suspend' : 'Reactivate'}</button>
              <button type="button" className="btn btn-small btn-danger" onClick={() => setDlg({ kind: 'remove', m })}>Remove</button>
            </div>
          ) : !m.isOwner && !m.isSelf ? <p className="hint">This person has more access than you, so you can’t change them.</p> : null}
        </section>
      ))}

      <ConfirmDialog
        open={!!dlg}
        title={dlg ? titles[dlg.kind] : ''}
        message={dlg ? messages[dlg.kind] : ''}
        confirmLabel={dlg && dlg.kind === 'remove' ? 'Remove' : dlg && dlg.kind === 'suspend' ? 'Suspend' : dlg && dlg.kind === 'revoke' ? 'Cancel invite' : 'Save'}
        danger={!!dlg && (dlg.kind === 'remove' || dlg.kind === 'suspend')}
        busy={busy}
        onConfirm={confirm}
        onCancel={() => setDlg(null)}
      >
        {dlg && dlg.kind === 'role' ? (
          <label className="field"><span>Role</span>
            <select value={pickRole} onChange={(e) => setPickRole(e.target.value)}>
              {assignable.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
            </select>
          </label>
        ) : null}
        {dlg && dlg.kind === 'extra' ? <PermPicker value={pickExtra} onChange={setPickExtra} allowed={actorPerms} /> : null}
      </ConfirmDialog>

      {msg ? <div className={'toast' + (msg.ok ? '' : ' toast-err')} role="status">{msg.text}</div> : null}
    </>
  )
}
