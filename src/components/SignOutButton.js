'use client'
import { useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/browser'
import ConfirmDialog from '@/components/ConfirmDialog'

export default function SignOutButton() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  async function out() {
    setBusy(true)
    try { await getBrowserClient().auth.signOut() } catch {}
    window.location.href = '/login'
  }
  return (
    <>
      <button type="button" className="btn btn-wide" onClick={() => setOpen(true)}>Sign out</button>
      <ConfirmDialog open={open} title="Sign out?" message="Your campaigns keep running while you are signed out." confirmLabel="Sign out" busy={busy} onConfirm={out} onCancel={() => setOpen(false)} />
    </>
  )
}
