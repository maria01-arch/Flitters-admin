'use client'
import { useEffect, useState } from 'react'
import Icon from '@/components/Icon'
import { utc } from '@/lib/format'

// Search as you type: results appear after two letters, no button needed.
export default function UserSearch({ initialQ }) {
  const [q, setQ] = useState(initialQ || '')
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setResults(null)
      setBusy(false)
      setError('')
      return undefined
    }
    const ctrl = new AbortController()
    setBusy(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/search/users?q=' + encodeURIComponent(term), { signal: ctrl.signal })
        const j = await res.json().catch(() => ({}))
        if (res.status === 401) {
          window.location.href = '/login'
          return
        }
        if (!res.ok) throw new Error(j.error || 'Search failed')
        setResults(j.results || [])
        setError('')
      } catch (e) {
        if (e.name !== 'AbortError') setError(e.message)
      }
      if (!ctrl.signal.aborted) setBusy(false)
    }, 250)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [q])

  return (
    <>
      <div className="bigsearch">
        <Icon name="search" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Username, name, or user ID" aria-label="Search users" autoComplete="off" autoFocus />
        {q ? <button type="button" className="qs-x" onClick={() => setQ('')} aria-label="Clear"><Icon name="close" /></button> : null}
      </div>
      {error ? <p className="err">{error}</p> : null}
      {busy && !results ? <p className="hint">Searching…</p> : null}
      {results && results.length === 0 ? <section className="card"><p>No one found for “{q.trim()}”.</p></section> : null}
      {results && results.length > 0 ? (
        <section className="card">
          <ul className="rows">
            {results.map((u) => (
              <li key={u.id}>
                <a className="rowlink" href={'/users/' + u.id}>
                  <span>{u.display_name} <small>@{u.username}</small></span>
                  <small>{u.is_authentic ? 'Blue badge · ' : ''}{u.verified ? 'Gold ring · ' : ''}tap to open</small>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {!results && !busy && !error ? <p className="hint">Start typing. Results appear as you type.</p> : null}
    </>
  )
}
