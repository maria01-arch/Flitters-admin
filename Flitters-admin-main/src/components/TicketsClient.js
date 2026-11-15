'use client'
import { useEffect, useState } from 'react'
import { callHealth } from '@/lib/clientApi'
import { utc } from '@/lib/format'

const CATEGORIES = {
  account: 'My account', bug: 'Something is broken', payment: 'Payments or coins', content: 'Content issue',
  safety: 'Safety or harassment', verification: 'Verification badge', other: 'Something else',
}
const STATUS = { open: 'waiting for us', pending_user: 'we replied', resolved: 'resolved' }
const FILTER_LABELS = [['open', 'Waiting for us'], ['pending_user', 'We replied'], ['resolved', 'Resolved'], ['all', 'All']]

export default function TicketsClient({ initial, filter, canReply, canViewUsers }) {
  const [items, setItems] = useState(initial)
  const [drafts, setDrafts] = useState({})
  const [busy, setBusy] = useState(null)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    if (!msg) return undefined
    const t = setTimeout(() => setMsg(null), 7000)
    return () => clearTimeout(t)
  }, [msg])

  const patch = (id, fn) => setItems((prev) => prev.map((t) => (t.id === id ? fn(t) : t)))

  async function reply(t) {
    const text = (drafts[t.id] || '').trim()
    if (!text) return
    setBusy(t.id)
    try {
      const j = await callHealth({ action: 'reply_ticket', ticketId: t.id, body: text })
      patch(t.id, (x) => ({ ...x, status: 'pending_user', messages: [...x.messages, j.message] }))
      setDrafts((d) => ({ ...d, [t.id]: '' }))
      setMsg({ ok: true, text: 'Reply sent. The person gets an alert in the app.' })
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally {
      setBusy(null)
    }
  }

  async function setStatus(t, status) {
    setBusy(t.id)
    try {
      const j = await callHealth({ action: 'set_ticket_status', ticketId: t.id, status })
      patch(t.id, (x) => ({ ...x, status: j.status }))
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <h1>Help requests</h1>
      <p className="lead">Messages from people using Help center in the app. Reply here and they get an alert.</p>
      <div className="seg wrap">
        {FILTER_LABELS.map(([k, label]) => (
          <a key={k} href={'/tickets' + (k === 'open' ? '' : '?filter=' + k)} className={'segitem' + (filter === k ? ' segitem-on' : '')}>{label}</a>
        ))}
      </div>

      {items.length === 0 ? (
        <section className="card">
          <h2>Nothing here</h2>
          <p>No requests in this list.</p>
        </section>
      ) : null}

      {items.map((t) => (
        <section key={t.id} className="card report">
          <div className="report-head">
            <div>
              <strong>{t.subject}</strong>
              <small className="meta">
                {t.display_name || 'Unknown'} {t.username ? '@' + t.username : ''} · {CATEGORIES[t.category] || t.category} · {utc(t.created_at)}
              </small>
            </div>
            <span className={'badge' + (t.status === 'open' ? ' badge-on' : '')}>{STATUS[t.status] || t.status}</span>
          </div>

          <div className="stack">
            {t.messages.map((m) => (
              <div key={m.id} className="preview" style={m.from === 'staff' ? { borderLeft: '3px solid var(--ink)' } : undefined}>
                <small className="meta">{m.from === 'staff' ? 'Support' : 'Person'} · {utc(m.created_at)}</small>
                <p className="content">{m.body}</p>
              </div>
            ))}
          </div>

          {canReply ? (
            <>
              <label className="field">
                <span>Reply</span>
                <textarea rows={3} maxLength={2000} value={drafts[t.id] || ''} onChange={(e) => setDrafts((d) => ({ ...d, [t.id]: e.target.value }))} />
              </label>
              <div className="actions">
                <button type="button" className="btn btn-small btn-primary" disabled={busy === t.id || !(drafts[t.id] || '').trim()} onClick={() => reply(t)}>Send reply</button>
                {t.status === 'resolved' ? (
                  <button type="button" className="btn btn-small" disabled={busy === t.id} onClick={() => setStatus(t, 'open')}>Reopen</button>
                ) : (
                  <button type="button" className="btn btn-small" disabled={busy === t.id} onClick={() => setStatus(t, 'resolved')}>Mark resolved</button>
                )}
                {canViewUsers ? <a className="btn btn-small" href={'/users/' + t.user_id}>View profile</a> : null}
              </div>
            </>
          ) : canViewUsers ? (
            <div className="actions"><a className="btn btn-small" href={'/users/' + t.user_id}>View profile</a></div>
          ) : null}
        </section>
      ))}

      {msg ? <div className={'toast' + (msg.ok ? '' : ' toast-err')} role="status">{msg.text}</div> : null}
    </>
  )
}
