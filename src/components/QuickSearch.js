'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/Icon'

// One search box for the whole console: jump to a page, or find a person.
export default function QuickSearch({ open, onClose, pages, canSearchUsers }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [people, setPeople] = useState([])
  const [busy, setBusy] = useState(false)
  const [idx, setIdx] = useState(0)
  const input = useRef(null)

  useEffect(() => {
    if (!open) return
    setQ('')
    setPeople([])
    setIdx(0)
    const t = setTimeout(() => input.current && input.current.focus(), 40)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open || !canSearchUsers) return undefined
    const term = q.trim()
    if (term.length < 2) {
      setPeople([])
      setBusy(false)
      return undefined
    }
    const ctrl = new AbortController()
    setBusy(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/search/users?q=' + encodeURIComponent(term), { signal: ctrl.signal })
        const j = await res.json().catch(() => ({}))
        if (res.ok) setPeople(j.results || [])
      } catch {}
      if (!ctrl.signal.aborted) setBusy(false)
    }, 250)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [q, open, canSearchUsers])

  const items = useMemo(() => {
    const t = q.trim().toLowerCase()
    const pg = pages.filter((p) => !t || p.label.toLowerCase().includes(t)).map((p) => ({ key: 'p' + p.href, group: 'Pages', href: p.href, icon: p.icon, title: p.label, sub: 'Open page' }))
    const pe = people.map((u) => ({
      key: 'u' + u.id, group: 'People', href: '/users/' + u.id, icon: 'user', title: u.display_name || u.username,
      sub: '@' + u.username + (u.is_authentic ? ' · blue badge' : '') + (u.verified ? ' · gold ring' : ''),
    }))
    return [...pe, ...pg]
  }, [q, pages, people])

  useEffect(() => {
    setIdx(0)
  }, [q, people.length])

  if (!open) return null

  const go = (it) => {
    onClose()
    router.push(it.href)
  }
  const onKey = (e) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIdx((i) => Math.min(i + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      const it = items[idx]
      if (it) go(it)
    }
  }

  return (
    <div className="qs-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }} onKeyDown={onKey}>
      <div className="qs" role="dialog" aria-modal="true" aria-label="Search">
        <div className="qs-top">
          <Icon name="search" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={canSearchUsers ? 'Search a person or a page' : 'Search a page'}
            aria-label="Search"
            autoComplete="off"
          />
          <button type="button" className="qs-x" onClick={onClose} aria-label="Close search"><Icon name="close" /></button>
        </div>
        <div className="qs-list">
          {items.map((it, i) => (
            <div key={it.key}>
              {i === 0 || items[i - 1].group !== it.group ? <p className="qs-sec">{it.group}</p> : null}
              <button type="button" className={'qs-item' + (i === idx ? ' on' : '')} onMouseEnter={() => setIdx(i)} onClick={() => go(it)}>
                <span className="qs-ic"><Icon name={it.icon} /></span>
                <span><strong>{it.title}</strong><small>{it.sub}</small></span>
              </button>
            </div>
          ))}
          {busy ? <p className="qs-empty">Searching…</p> : null}
          {!busy && q.trim().length >= 2 && items.length === 0 ? <p className="qs-empty">Nothing found for “{q.trim()}”.</p> : null}
          {canSearchUsers && q.trim().length < 2 ? <p className="qs-empty">Type at least 2 letters of a username or name, or paste a user ID.</p> : null}
        </div>
      </div>
    </div>
  )
}
