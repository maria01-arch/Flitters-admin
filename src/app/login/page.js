'use client'
import { useEffect, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/browser'
import AuthShell from '@/components/AuthShell'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get('confirmed')) setNotice('Your email is confirmed. Sign in to continue.')
    if (p.get('reason') === 'idle') setNotice('You were signed out after an hour of no activity.')
  }, [])

  async function onSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error: err } = await getBrowserClient().auth.signInWithPassword({ email: email.trim(), password })
    if (err) {
      const m = String(err.message || '')
      setError(/not confirmed/i.test(m) ? 'Please confirm your email first. Check your inbox for our message.' : /banned/i.test(m) ? 'This account has been suspended.' : 'Wrong email or password.')
      setBusy(false)
      return
    }
    window.location.href = '/'
  }

  return (
    <AuthShell>
      <h2>Welcome back</h2>
      {notice ? <p className="note">{notice}</p> : null}
      {error ? <p className="err" role="alert">{error}</p> : null}
      <form onSubmit={onSubmit} className="stack">
        <label className="field"><span>Email</span><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="field"><span>Password</span><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        <button type="submit" className="btn btn-primary btn-wide" disabled={busy}>{busy ? 'Checking…' : 'Sign in'}</button>
      </form>
      <p className="hint">New here? <a href="/signup">Create an advertiser account</a></p>
      <p className="hint">Already use Flitters? Your Flitters email and password work here too.</p>
    </AuthShell>
  )
}
