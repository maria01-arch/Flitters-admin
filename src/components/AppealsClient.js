'use client'
import { useEffect, useState } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'
import { call } from '@/lib/clientApi'
import { utc, banLabel } from '@/lib/format'

export default function AppealsClient({ initial, filter, canViewUsers }) {
  const [items, setItems] = useState(initial)
  const [dlg, setDlg] = useState(null) // { kind: 'approve' | 'reject', item }
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    if (!msg) return undefined
    const t = setTimeout(() => setMsg(null), 8000)
    return () => clearTimeout(t)
  }, [msg])

  async function confirm() {
    const { kind, item } = dlg
    setBusy(true)
    try {
      const j = await call({ action: 'review_appeal', appealId: item.id, decision: kind, note: note.trim() })
      setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, status: j.status, admin_note: note.trim() || null, reviewed_at: new Date().toISOString(), banned_until: kind === 'approve' ? null : x.banned_until } : x)))
      setMsg({ ok: true, text: kind === 'approve' ? 'Appeal accepted. The ban is lifted.' : 'Appeal rejected. The person will see your reason.' })
      setDlg(null)
    } catch (e) {
      setMsg({ ok: false, text: e.message })
      if (kind === 'approve') setDlg(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h1>Appeals</h1>
      <div className="seg">
        <a href="/appeals" className={'segitem' + (filter === 'pending' ? ' segitem-on' : '')}>Pending</a>
        <a href="/appeals?filter=all" className={'segitem' + (filter === 'all' ? ' segitem-on' : '')}>All</a>
      </div>

      {items.length === 0 ? (
        <section className="card">
          <h2>{filter === 'pending' ? 'No appeals waiting' : 'No appeals yet'}</h2>
          <p>Appeals from banned people show up here. Each person can appeal once per ban.</p>
        </section>
      ) : null}

      {items.map((a) => {
        const ban = banLabel(a.banned_until)
        return (
          <section key={a.id} className="card report">
            <div className="report-head">
              <div>
                <strong>{a.display_name || 'Unknown'} {a.username ? <small className="meta inline">@{a.username}</small> : null}</strong>
                <small className="meta">Sent {utc(a.created_at)}</small>
              </div>
              <span className={'badge' + (a.status === 'pending' ? ' badge-on' : '')}>{a.status}</span>
            </div>

            <dl className="kv">
              <dt>Ban reason</dt>
              <dd>{a.ban_reason || '—'}</dd>
              <dt>Banned on</dt>
              <dd>{a.banned_at ? utc(a.banned_at) : '—'}</dd>
              {a.status === 'pending' ? (
                <>
                  <dt>Ban now</dt>
                  <dd>{ban ? ban : 'Already ended or lifted'}</dd>
                </>
              ) : null}
            </dl>

            <div className="preview">
              <small className="meta">Their appeal</small>
              <p className="content">{a.message}</p>
            </div>

            {a.status !== 'pending' ? (
              <p className="hint">
                {a.status === 'approved' ? 'Accepted' : 'Rejected'} {a.reviewed_at ? utc(a.reviewed_at) : ''}
                {a.admin_note ? ' · ' + a.admin_note : ''}
              </p>
            ) : null}

            <div className="actions">
              {a.status === 'pending' ? (
                <>
                  <button type="button" className="btn btn-small btn-primary" onClick={() => setDlg({ kind: 'approve', item: a })}>Accept (lift ban)</button>
                  <button type="button" className="btn btn-small btn-danger" onClick={() => { setNote(''); setDlg({ kind: 'reject', item: a }) }}>Reject</button>
                </>
              ) : null}
              {canViewUsers ? <a className="btn btn-small" href={'/users/' + a.user_id}>View profile</a> : null}
            </div>
          </section>
        )
      })}

      <ConfirmDialog
        open={!!dlg}
        title={dlg && dlg.kind === 'approve' ? 'Accept this appeal?' : 'Reject this appeal?'}
        message={dlg && dlg.kind === 'approve' ? 'The ban is lifted right away and they can sign in again.' : 'The ban stays. They can’t appeal again for this ban.'}
        confirmLabel={dlg && dlg.kind === 'approve' ? 'Accept' : 'Reject'}
        danger={!!dlg && dlg.kind === 'reject'}
        busy={busy}
        onConfirm={confirm}
        onCancel={() => setDlg(null)}
      >
        {dlg && dlg.kind === 'reject' ? (
          <label className="field">
            <span>Reason (the person sees this on their ban screen)</span>
            <textarea rows={4} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        ) : dlg && dlg.kind === 'approve' ? (
          <label className="field">
            <span>Note (optional, only staff see it)</span>
            <textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        ) : null}
      </ConfirmDialog>

      {msg ? <div className={'toast' + (msg.ok ? '' : ' toast-err')} role="status">{msg.text}</div> : null}
    </>
  )
}
