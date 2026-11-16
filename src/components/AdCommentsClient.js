'use client'
import { useEffect, useState } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'
import { callHealth } from '@/lib/clientApi'
import { utc } from '@/lib/format'

export default function AdCommentsClient({ initial, canViewUsers }) {
  const [items, setItems] = useState(initial)
  const [target, setTarget] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    if (!msg) return undefined
    const t = setTimeout(() => setMsg(null), 6000)
    return () => clearTimeout(t)
  }, [msg])

  async function remove() {
    setBusy(true)
    try {
      await callHealth({ action: 'delete_ad_comment', commentId: target.id })
      setItems((prev) => prev.filter((x) => x.id !== target.id))
      setMsg({ ok: true, text: 'Comment removed.' })
      setTarget(null)
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h1>Ad comments</h1>
      <p className="hint">The latest 100 comments people left under ads. Removing one is logged.</p>
      {items.length === 0 ? <section className="card"><p>No comments yet.</p></section> : null}
      {items.map((c) => (
        <section className="card" key={c.id}>
          <div className="spread">
            <strong>
              {canViewUsers ? <a href={'/users/' + c.user_id}>{c.display_name || c.username || 'User'}</a> : (c.display_name || c.username || 'User')}
              {c.username ? <span className="hint"> @{c.username}</span> : null}
            </strong>
            <span className="hint">{utc(c.created_at)}</span>
          </div>
          <p className="hint">On: {c.ad}</p>
          <p style={{ overflowWrap: 'anywhere' }}>{c.content}</p>
          <button className="btn btn-danger" onClick={() => setTarget(c)}>Remove</button>
        </section>
      ))}
      <ConfirmDialog open={!!target} title="Remove this comment?" message="It disappears for everyone right away." confirmLabel="Remove" danger busy={busy} onConfirm={remove} onCancel={() => setTarget(null)} />
      {msg ? <div className={'toast' + (msg.ok ? '' : ' toast-err')} role="status">{msg.text}</div> : null}
    </>
  )
}
