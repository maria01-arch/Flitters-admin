'use client'
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase/browser'
import Icon from '@/components/Icon'

const IDLE_MS = 60 * 60 * 1000

const isOn = (path, href) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'))

export default function Shell({ business, children }) {
  const path = usePathname() || '/'
  const timer = useRef(null)

  // Signs out after an hour with no touch, key press or scroll.
  useEffect(() => {
    const out = async () => {
      try { await getBrowserClient().auth.signOut() } catch {}
      window.location.href = '/login?reason=idle'
    }
    const reset = () => {
      clearTimeout(timer.current)
      timer.current = setTimeout(out, IDLE_MS)
    }
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart']
    events.forEach((ev) => window.addEventListener(ev, reset, { passive: true }))
    reset()
    return () => {
      clearTimeout(timer.current)
      events.forEach((ev) => window.removeEventListener(ev, reset))
    }
  }, [])

  return (
    <div className="app">
      <header className="appbar">
        <a className="brand" href="/"><span className="logo-mark">F</span>Flitters <b>Ads</b></a>
        <nav className="topnav" aria-label="Sections">
          <a href="/" className={isOn(path, '/') ? 'on' : ''}>Home</a>
          <a href="/campaigns" className={isOn(path, '/campaigns') ? 'on' : ''}>Campaigns</a>
          <a href="/account" className={isOn(path, '/account') ? 'on' : ''}>Account</a>
          <a href="/create" className="on">+ New campaign</a>
        </nav>
        <span className="chipbiz">{business}</span>
      </header>
      <main className="page">{children}</main>
      <nav className="tabbar" aria-label="Sections">
        <a href="/" className={'tab' + (isOn(path, '/') ? ' on' : '')}><Icon name="home" />Home</a>
        <a href="/campaigns" className={'tab' + (isOn(path, '/campaigns') ? ' on' : '')}><Icon name="list" />Campaigns</a>
        <a href="/create" className="tab tab-new" aria-label="New campaign"><span><Icon name="plus" /></span><em>New ad</em></a>
        <a href="/account" className={'tab' + (isOn(path, '/account') ? ' on' : '')}><Icon name="user" />Account</a>
      </nav>
    </div>
  )
}
