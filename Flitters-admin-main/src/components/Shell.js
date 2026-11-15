'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase/browser'
import ConfirmDialog from '@/components/ConfirmDialog'
import QuickSearch from '@/components/QuickSearch'
import Icon from '@/components/Icon'
import Logo from '@/components/Logo'

const IDLE_MS = 30 * 60 * 1000
const isOn = (path, href) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'))

export default function Shell({ email, roleName, groups, initialCounts, canSearchUsers, children }) {
  const path = usePathname() || '/'
  const [counts, setCounts] = useState(initialCounts)
  const [menu, setMenu] = useState(false)
  const [search, setSearch] = useState(false)
  const [confirmOut, setConfirmOut] = useState(false)
  const [busy, setBusy] = useState(false)
  const timer = useRef(null)

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups])
  const tabs = useMemo(() => [...flat].sort((a, b) => a.prio - b.prio).slice(0, 5), [flat])
  const total = (counts.reports || 0) + (counts.ads || 0) + (counts.appeals || 0)

  async function signOut(reason) {
    setBusy(true)
    try {
      await getBrowserClient().auth.signOut()
    } catch {}
    window.location.href = '/login' + (reason ? '?reason=' + reason : '')
  }

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/counts', { cache: 'no-store' })
      if (!res.ok) return
      const j = await res.json()
      if (j.counts) setCounts(j.counts)
    } catch {}
  }, [])

  // Counts refresh every minute, when you come back to the tab, and after each page change.
  useEffect(() => {
    const iv = setInterval(() => { if (document.visibilityState === 'visible') refresh() }, 60000)
    const onVis = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', refresh)
    return () => {
      clearInterval(iv)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', refresh)
    }
  }, [refresh])

  useEffect(() => {
    refresh()
    setMenu(false)
  }, [path, refresh])

  useEffect(() => {
    document.title = (total ? '(' + total + ') ' : '') + 'Flitters Admin'
  }, [total])

  // "/" or Ctrl/Cmd+K opens search.
  useEffect(() => {
    const open = () => setSearch(true)
    const onKey = (e) => {
      const tag = (e.target && e.target.tagName) || ''
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || (e.target && e.target.isContentEditable)
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        setSearch(true)
      }
    }
    window.addEventListener('open-search', open)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('open-search', open)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  // Signs out after 30 minutes with no touch, key press or scroll.
  useEffect(() => {
    const reset = () => {
      clearTimeout(timer.current)
      timer.current = setTimeout(() => signOut('idle'), IDLE_MS)
    }
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart']
    events.forEach((ev) => window.addEventListener(ev, reset, { passive: true }))
    reset()
    return () => {
      clearTimeout(timer.current)
      events.forEach((ev) => window.removeEventListener(ev, reset))
    }
  }, [])

  const badge = (item) => {
    const n = item.badge ? counts[item.badge] : null
    if (!n) return null
    const red = item.badge === 'reports' && counts.urgent > 0
    return <span className={'nbadge' + (red ? ' nbadge-red' : '')}>{n > 99 ? '99+' : n}</span>
  }

  return (
    <div className="shell">
      <aside className="side">
        <Link className="brand" href="/"><Logo />Flitters <b>Admin</b></Link>
        <button type="button" className="side-search" onClick={() => setSearch(true)}>
          <Icon name="search" /><span>Search</span><kbd>/</kbd>
        </button>
        <nav className="side-nav" aria-label="Sections">
          {groups.map((g) => (
            <div className="side-group" key={g.title}>
              <small>{g.title}</small>
              {g.items.map((it) => (
                <Link key={it.href} href={it.href} className={'side-link' + (isOn(path, it.href) ? ' on' : '')}>
                  <Icon name={it.icon} />{it.label}{badge(it)}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-foot">
          <div><strong>{email}</strong><small>{roleName}</small></div>
          <button type="button" className="side-out" onClick={() => setConfirmOut(true)}><Icon name="logout" />Sign out</button>
        </div>
      </aside>

      <div className="main-col">
        <header className="appbar">
          <Link className="brand" href="/"><Logo />Flitters <b>Admin</b></Link>
          <div className="appbar-r">
            <button type="button" className="appbar-btn" onClick={() => setSearch(true)} aria-label="Search"><Icon name="search" /></button>
            <button type="button" className="appbar-btn" onClick={() => setMenu(true)} aria-label="Menu"><Icon name="menu" />{total ? <span className="dot" /> : null}</button>
          </div>
        </header>
        <main className="main">{children}</main>
      </div>

      <nav className="tabbar" aria-label="Sections" style={{ gridTemplateColumns: 'repeat(' + tabs.length + ', 1fr)' }}>
        {tabs.map((it) => (
          <Link key={it.href} href={it.href} className={'tab' + (isOn(path, it.href) ? ' on' : '')}>
            <span className="tab-ic"><Icon name={it.icon} />{badge(it)}</span>
            {it.short || it.label}
          </Link>
        ))}
      </nav>

      {menu ? (
        <div className="sheet-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setMenu(false) }}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="spread"><strong>{email}</strong><button type="button" className="qs-x" onClick={() => setMenu(false)} aria-label="Close menu"><Icon name="close" /></button></div>
            <p className="hint">{roleName}</p>
            <div className="sheet-list">
              {flat.map((it) => (
                <Link key={it.href} href={it.href} className={'sheet-link' + (isOn(path, it.href) ? ' on' : '')}>
                  <Icon name={it.icon} />{it.label}{badge(it)}
                </Link>
              ))}
            </div>
            <button type="button" className="btn btn-wide" onClick={() => { setMenu(false); setConfirmOut(true) }}><Icon name="logout" />Sign out</button>
          </div>
        </div>
      ) : null}

      <QuickSearch open={search} onClose={() => setSearch(false)} pages={flat} canSearchUsers={canSearchUsers} />
      <ConfirmDialog
        open={confirmOut}
        title="Sign out?"
        message="You will need your password and your 2-step code to get back in."
        confirmLabel="Sign out"
        busy={busy}
        onConfirm={() => signOut()}
        onCancel={() => setConfirmOut(false)}
      />
    </div>
  )
}
