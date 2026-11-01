'use client'
import { useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/browser'

export default function InviteClient({ token, valid, email, roleName, signedInEmail }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function signIn(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error: err } = await getBrowserClient().auth.signInWithPassword({ email, password })
    if (err) {
      setError('Wrong password.')
      setBusy(false)
      return
    }
    window.location.reload()
  }

  async function accept() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/team', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'accept_invite', token }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Something went wrong')
      await getBrowserClient().auth.signOut()
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function switchAccount() {
    await getBrowserClient().auth.signOut()
    window.location.reload()
  }

  const match = signedInEmail && signedInEmail.toLowerCase() === email.toLowerCase()

  return (
    <div className="login">
      <div className="login-box">
        <h1 className="login-title">Flitters admin</h1>
        {!valid ? (
          <p className="err">This invite is not valid. It may have been used, cancelled or expired. Ask for a new one.</p>
        ) : done ? (
          <>
            <p>You are on the team as <strong>{roleName}</strong>.</p>
            <a className="btn btn-primary btn-wide" href="/login">Go to sign-in</a>
            <p className="hint">You will set up 2-step sign-in the first time.</p>
          </>
        ) : (
          <>
            <p>You are invited as <strong>{roleName}</strong>.</p>
            {error ? <p className="err" role="alert">{error}</p> : null}
            {match ? (
              <button type="button" className="btn btn-primary btn-wide" onClick={accept} disabled={busy}>{busy ? 'Working…' : 'Accept invite'}</button>
            ) : signedInEmail ? (
              <>
                <p className="hint">You are signed in as {signedInEmail}, but this invite is for {email}.</p>
                <button type="button" className="btn btn-wide" onClick={switchAccount}>Sign out</button>
              </>
            ) : (
              <form onSubmit={signIn} className="stack">
                <label className="field"><span>Email</span><input value={email} readOnly /></label>
                <label className="field"><span>Your Flitters password</span><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
                <button type="submit" className="btn btn-primary btn-wide" disabled={busy}>{busy ? 'Checking…' : 'Sign in'}</button>
                <p className="hint">No Flitters account with this email yet? Create one in the Flitters app first, then open this link again.</p>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}
