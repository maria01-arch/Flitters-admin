'use client'
import { useEffect, useState } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'
import { callHealth } from '@/lib/clientApi'
import { utc } from '@/lib/format'

const REASONS = {
  child_safety: 'Child safety', nudity_sexual: 'Nudity or sexual content', violence: 'Violence', harassment: 'Harassment',
  hate_speech: 'Hate speech', spam: 'Spam or scam', impersonation: 'Impersonation', copyright: 'Copyright', other: 'Other',
}

export default function StrikeAppealsClient({ initial, filter, canViewUsers }) {
  const [items, setItems] = useState(initial)
  const [dlg, setDlg] = useState(null) // { kind: 'overturn' | 'uphold', item }
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
      const j = await callHealth({ action: 'review_strike_appeal', appealId: item.id, decision: kind, note: note.trim() })
      setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, status: j.status, admin_note: note.trim() || null, reviewed_at: new Date().toISOString() } : x)))
      setMsg({ ok: true, text: kind === 'overturn' ? 'Strike removed. The person was told.' : 'Strike kept. The person will see your feedback.' })
      setDlg(null)
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h1>Strike appeals</h1>
      <p className="lead">People who think a strike was a mistake. Remove the strike, or keep it and write the feedback they will see in the app.</p>
      <div className="seg">
        <a href="/strike-appeals" className={'segitem' + (filter === 'pending' ? ' segitem-on' : '')}>Pending</a>
        <a href="/strike-appeals?filter=all" className={'segitem' + (filter === 'all' ? ' segitem-on' : '')}>All</a>
      </div>

      {items.length === 0 ? (
        <section className="card">
          <h2>{filter === 'pending' ? 'No strike appeals waiting' : 'No strike appeals yet'}</h2>
          <p>When someone appeals a strike in the app, it shows up here. Each strike can be appealed once.</p>
        </section>
      ) : null}

      {items.map((a) => (
        <section key={a.id} className="card report">
          <div className="report-head">
            <div>
              <strong>{a.display_name || 'Unknown'} {a.username ? <small className="meta inline">@{a.username}</small> : null}</strong>
              <small className="meta">Appealed {utc(a.created_at)}</small>
            </div>
            <span className={'badge' + (a.status === 'pending' ? ' badge-on' : '')}>{a.status === 'overturned' ? 'strike removed' : a.status === 'upheld' ? 'strike kept' : 'pending'}</span>
          </div>

          <dl className="kv">
            <dt>Strike</dt>
            <dd>{REASONS[a.strike.reason_code] || a.strike.reason_code || '—'} · {a.strike.severity || '?'} pt</dd>
            <dt>Given on</dt>
            <dd>{a.strike.issued_at ? utc(a.strike.issued_at) : '—'}</dd>
            <dt>Told to the person</dt>
            <dd>{a.strike.reason || '—'}</dd>
          </dl>
          {a.strike.content_snapshot ? (
            <div className="preview">
              <small className="meta">Content ({a.strike.content_type || 'content'})</small>
              <p className="content">{a.strike.content_snapshot}</p>
            </div>
          ) : null}

          <div className="preview">
            <small className="meta">Their appeal</small>
            <p className="content">{a.message}</p>
          </div>

          {a.status !== 'pending' ? (
            <p className="hint">
              {a.status === 'overturned' ? 'Strike removed' : 'Strike kept'} {a.reviewed_at ? utc(a.reviewed_at) : ''}
              {a.admin_note ? ' · ' + a.admin_note : ''}
            </p>
          ) : (
            <div className="actions">
              <button type="button" className="btn btn-small btn-primary" onClick={() => { setNote(''); setDlg({ kind: 'overturn', item: a }) }}>Remove strike</button>
              <button type="button" className="btn btn-small btn-danger" onClick={() => { setNote(''); setDlg({ kind: 'uphold', item: a }) }}>Keep strike</button>
              {canViewUsers ? <a className="btn btn-small" href={'/users/' + a.user_id}>View profile</a> : null}
            </div>
          )}
        </section>
      ))}

      <ConfirmDialog
        open={!!dlg}
        title={dlg && dlg.kind === 'overturn' ? 'Remove this strike?' : 'Keep this strike?'}
        message={dlg && dlg.kind === 'overturn' ? 'It stops counting against the account right away and the person is told.' : 'The strike stays and can’t be appealed again. They see your feedback.'}
        confirmLabel={dlg && dlg.kind === 'overturn' ? 'Remove strike' : 'Keep strike'}
        danger={!!dlg && dlg.kind === 'uphold'}
        busy={busy}
        onConfirm={confirm}
        onCancel={() => setDlg(null)}
      >
        <label className="field">
          <span>{dlg && dlg.kind === 'uphold' ? 'Feedback (the person sees this)' : 'Message to the person (optional)'}</span>
          <textarea rows={4} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </ConfirmDialog>

      {msg ? <div className={'toast' + (msg.ok ? '' : ' toast-err')} role="status">{msg.text}</div> : null}
    </>
  )
}
