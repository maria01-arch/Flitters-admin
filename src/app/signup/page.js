'use client'
import { useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/browser'
import AuthShell from '@/components/AuthShell'

function randomName() {
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  return 'adv_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [exists, setExists] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 8) return setError('Use a password of at least 8 characters.')
    if (password !== again) return setError('The two passwords don’t match.')
    setBusy(true)
    const { data, error: err } = await getBrowserClient().auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: window.location.origin + '/auth/callback?next=/onboarding',
        // Marks this as a business sign-up, so no Flitters app profile is kept for it.
        data: { account_type: 'advertiser', username: randomName(), display_name: 'Advertiser' },
      },
    })
    setBusy(false)
    if (err) {
      setError(/rate|too many/i.test(err.message || '') ? 'Too many tries. Wait a few minutes and try again.' : err.message || 'Could not create the account.')
      return
    }
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      setExists(true)
      return
    }
    if (data.session) {
      window.location.href = '/onboarding'
      return
    }
    setSent(true)
  }

  return (
    <AuthShell>
      {sent ? (
        <>
          <h2>Check your email</h2>
          <p>We sent a link to <strong>{email}</strong>. Open it to confirm your address, then sign in.</p>
          <a className="btn btn-primary btn-wide" href="/login">Go to sign in</a>
        </>
      ) : exists ? (
        <>
          <h2>You already have an account</h2>
          <p>That email is already registered with Flitters. Sign in with your Flitters password and we will set up your business next.</p>
          <a className="btn btn-primary btn-wide" href="/login">Sign in</a>
        </>
      ) : (
        <>
          <h2>Create your account</h2>
          {error ? <p className="err" role="alert">{error}</p> : null}
          <form onSubmit={onSubmit} className="stack">
            <label className="field"><span>Email</span><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            <label className="field"><span>Password <small>(8 or more characters)</small></span><input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
            <label className="field"><span>Password again</span><input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required /></label>
            <button type="submit" className="btn btn-primary btn-wide" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
          </form>
          <p className="hint">Already have an account? <a href="/login">Sign in</a></p>
        </>
      )}
    </AuthShell>
  )
}
