'use client'
import { useEffect, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/browser'

async function callSession(stage) {
  const res = await fetch('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage }),
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

function messageFor(status) {
  if (status === 403) return 'This account is not allowed here.'
  if (status === 429) return 'Too many tries. Wait a minute and try again.'
  if (status === 500) return 'The server is not set up yet. Check the environment variables in Vercel.'
  return 'Could not finish signing in. Try again.'
}

export default function LoginPage() {
  const [step, setStep] = useState('password') // password | code | enroll
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [factorId, setFactorId] = useState(null)
  const [qr, setQr] = useState('')
  const [secret, setSecret] = useState('')
  const [uri, setUri] = useState('')
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get('reason')
    if (reason === 'idle') setNotice('You were signed out after 30 minutes of no activity.')
  }, [])

  async function backToPassword(msg) {
    try {
      await getBrowserClient().auth.signOut()
    } catch {}
    setStep('password')
    setPassword('')
    setCode('')
    setError(msg)
  }

  async function finish() {
    const { status } = await callSession('verify')
    if (status === 200) {
      window.location.href = '/'
      return
    }
    await backToPassword(messageFor(status))
  }

  async function startEnroll(supabase) {
    const { data: lf } = await supabase.auth.mfa.listFactors()
    for (const f of (lf && lf.all) || []) {
      if (f.factor_type === 'totp' && f.status === 'unverified') {
        await supabase.auth.mfa.unenroll({ factorId: f.id })
      }
    }
    const { data, error: enrollErr } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Admin Console ' + Math.random().toString(36).slice(2, 7),
    })
    if (enrollErr || !data) {
      await backToPassword('Could not start 2-step setup: ' + ((enrollErr && enrollErr.message) || 'unknown error'))
      return
    }
    setFactorId(data.id)
    setQr(data.totp.qr_code)
    setSecret(data.totp.secret)
    setUri(data.totp.uri)
    setStep('enroll')
  }

  async function onPassword(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const supabase = getBrowserClient()
      const { error: signErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (signErr) {
        setError('Wrong email or password.')
        return
      }
      const chk = await callSession('check')
      if (chk.status !== 200) {
        await backToPassword(messageFor(chk.status))
        return
      }
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal && aal.currentLevel === 'aal2') {
        await finish()
        return
      }
      if (aal && aal.nextLevel === 'aal2') {
        const { data: lf } = await supabase.auth.mfa.listFactors()
        const factor = lf && lf.totp && lf.totp[0]
        if (factor) {
          setFactorId(factor.id)
          setStep('code')
          return
        }
      }
      await startEnroll(supabase)
    } finally {
      setBusy(false)
    }
  }

  async function onCode(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const supabase = getBrowserClient()
      const { error: verifyErr } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: code.replace(/\s/g, ''),
      })
      if (verifyErr) {
        setError('That code did not work. Open your authenticator app and enter the newest code.')
        setCode('')
        return
      }
      await finish()
    } finally {
      setBusy(false)
    }
  }

  async function copySecret() {
    try {
      await navigator.clipboard.writeText(secret)
      setCopied(true)
    } catch {}
  }

  return (
    <div className="login">
      <div className="login-box">
        <h1 className="login-title">Flitters admin</h1>

        {notice ? <p className="note">{notice}</p> : null}
        {error ? (
          <p className="err" role="alert">
            {error}
          </p>
        ) : null}

        {step === 'password' ? (
          <form onSubmit={onPassword} className="stack">
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <button type="submit" className="btn btn-primary btn-wide" disabled={busy}>
              {busy ? 'Checking…' : 'Continue'}
            </button>
            <p className="hint">Staff only. Use the same email and password as your Flitters account.</p>
          </form>
        ) : null}

        {step === 'enroll' ? (
          <form onSubmit={onCode} className="stack">
            <h2 className="step-title">Set up 2-step sign-in</h2>
            <p>
              Staff accounts need a code from an authenticator app (Google Authenticator, Microsoft Authenticator, Aegis
              or similar).
            </p>
            {uri ? (
              <a className="btn btn-wide" href={uri}>
                Open my authenticator app
              </a>
            ) : null}
            <p className="hint">On a different screen? Scan this code instead.</p>
            {qr ? <img className="qr" src={qr} alt="2-step setup QR code" width="180" height="180" /> : null}
            <p className="hint">Or type this key into the app yourself:</p>
            <div className="secret">
              <code>{secret}</code>
              <button type="button" className="btn btn-small" onClick={copySecret}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <label className="field">
              <span>6-digit code from the app</span>
              <input
                className="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </label>
            <button type="submit" className="btn btn-primary btn-wide" disabled={busy}>
              {busy ? 'Checking…' : 'Finish setup'}
            </button>
          </form>
        ) : null}

        {step === 'code' ? (
          <form onSubmit={onCode} className="stack">
            <h2 className="step-title">Enter your 2-step code</h2>
            <label className="field">
              <span>6-digit code from your authenticator app</span>
              <input
                className="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                autoFocus
              />
            </label>
            <button type="submit" className="btn btn-primary btn-wide" disabled={busy}>
              {busy ? 'Checking…' : 'Sign in'}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  )
}
