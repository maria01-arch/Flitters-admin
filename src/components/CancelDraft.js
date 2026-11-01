'use client'
import { useState } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'

export default function CancelDraft({ id }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function go() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', id }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Could not delete')
      window.location.href = '/campaigns'
    } catch (e) {
      setError(e.message)
      setBusy(false)
      setOpen(false)
    }
  }

  return (
    <>
      <button type="button" className="btn btn-wide" onClick={() => setOpen(true)}>Delete this draft</button>
      {error ? <p className="err">{error}</p> : null}
      <ConfirmDialog open={open} title="Delete this draft?" message="This can’t be undone." confirmLabel="Delete" danger busy={busy} onConfirm={go} onCancel={() => setOpen(false)} />
    </>
  )
}
