'use client'
import { useEffect, useState } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'
import PermPicker from '@/components/PermPicker'

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

const EMPTY = { key: null, name: '', description: '', permissions: [] }

export default function RolesClient({ roles, actorPerms, canRoles }) {
  const [dlg, setDlg] = useState(null) // { kind: 'edit' } | { kind: 'delete', role }
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    if (!msg) return undefined
    const t = setTimeout(() => setMsg(null), 8000)
    return () => clearTimeout(t)
  }, [msg])

  async function confirm() {
    setBusy(true)
    try {
      if (dlg.kind === 'edit') await api({ action: 'role_save', key: form.key, name: form.name, description: form.description, permissions: form.permissions })
      else await api({ action: 'role_delete', key: dlg.role.key })
      window.location.reload()
    } catch (err) {
      setMsg({ ok: false, text: err.message })
      if (dlg.kind === 'delete') setDlg(null)
      setBusy(false)
    }
  }

  return (
    <>
      <h1>Roles</h1>
      <div className="seg">
        <a href="/team" className="segitem">People</a>
        <a href="/team/roles" className="segitem segitem-on">Roles</a>
      </div>
      {canRoles ? (
        <div className="actions"><button type="button" className="btn btn-primary" onClick={() => { setForm(EMPTY); setDlg({ kind: 'edit' }) }}>New role</button></div>
      ) : null}

      {roles.map((r) => (
        <section key={r.key} className="card">
          <div className="report-head">
            <div>
              <strong>{r.name}</strong>
              <small className="meta">{r.description || r.key}</small>
            </div>
            <span className="badge">{r.is_system ? 'Built in' : 'Custom'}</span>
          </div>
          {r.permissions.includes('*') ? <p>Everything.</p> : <ul className="chips">{r.permissions.map((p) => <li key={p} className="chip">{p}</li>)}</ul>}
          {canRoles && !r.is_system ? (
            <div className="actions">
              <button type="button" className="btn btn-small" onClick={() => { setForm({ key: r.key, name: r.name, description: r.description || '', permissions: r.permissions }); setDlg({ kind: 'edit' }) }}>Edit</button>
              <button type="button" className="btn btn-small btn-danger" onClick={() => setDlg({ kind: 'delete', role: r })}>Delete</button>
            </div>
          ) : null}
        </section>
      ))}

      <ConfirmDialog
        open={!!dlg}
        title={dlg && dlg.kind === 'delete' ? 'Delete this role?' : form.key ? 'Edit role' : 'New role'}
        message={dlg && dlg.kind === 'delete' ? 'Only works if no one uses it.' : 'You can only tick access you have yourself.'}
        confirmLabel={dlg && dlg.kind === 'delete' ? 'Delete' : 'Save'}
        danger={!!dlg && dlg.kind === 'delete'}
        busy={busy}
        onConfirm={confirm}
        onCancel={() => setDlg(null)}
      >
        {dlg && dlg.kind === 'edit' ? (
          <div className="stack">
            <label className="field"><span>Name</span><input maxLength={40} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></label>
            <label className="field"><span>Short description</span><input maxLength={120} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></label>
            <PermPicker value={form.permissions} onChange={(p) => setForm((f) => ({ ...f, permissions: p }))} allowed={actorPerms} />
          </div>
        ) : null}
      </ConfirmDialog>

      {msg ? <div className={'toast' + (msg.ok ? '' : ' toast-err')} role="status">{msg.text}</div> : null}
    </>
  )
}
