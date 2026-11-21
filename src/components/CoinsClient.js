'use client'
import { useEffect, useState } from 'react'
import { utc } from '@/lib/format'

async function post(body) {
  const res = await fetch('/api/coins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = await res.json().catch(() => ({}))
  if (res.status === 401) { window.location.href = '/login'; throw new Error('Please sign in again') }
  if (!res.ok) throw new Error(j.error || 'Something went wrong (' + res.status + ')')
  return j
}

export default function CoinsClient({ gifts: g0, packs: p0, activity, config, withdrawals: w0 }) {
  const [gifts, setGifts] = useState(g0)
  const [packs, setPacks] = useState(p0)
  const [msg, setMsg] = useState(null)
  const [cfg, setCfg] = useState(config || { receiver_share_pct: 70, coins_per_usd: 10, min_withdraw_coins: 100, withdraw_opens_at: '2027-01-05T08:00:00Z' })
  const [wds, setWds] = useState(w0 || [])
  const [adj, setAdj] = useState({ username: '', delta: '', reason: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!msg) return undefined
    const t = setTimeout(() => setMsg(null), 6000)
    return () => clearTimeout(t)
  }, [msg])

  async function run(fn, ok) {
    setBusy(true)
    try { const r = await fn(); setMsg({ ok: true, text: typeof ok === 'function' ? ok(r) : ok }) }
    catch (e) { setMsg({ ok: false, text: e.message }) }
    finally { setBusy(false) }
  }

  const setG = (i, k, v) => setGifts((a) => a.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  const setP = (i, k, v) => setPacks((a) => a.map((x, j) => (j === i ? { ...x, [k]: v } : x)))

  return (
    <>
      <h1>Flit coins</h1>
      <p className="hint">People buy coins with Google Play and spend them on gifts. Coins can’t be cashed out. Changes apply in the app right away.</p>

      <h2>Rules</h2>
      <section className="card">
        <div className="spread" style={{ gap: 8, flexWrap: 'wrap' }}>
          <label>Receiver gets % <input style={{ width: 70 }} type="number" value={cfg.receiver_share_pct} onChange={(e) => setCfg({ ...cfg, receiver_share_pct: e.target.value })} /></label>
          <label>Coins = $1 <input style={{ width: 80 }} type="number" value={cfg.coins_per_usd} onChange={(e) => setCfg({ ...cfg, coins_per_usd: e.target.value })} /></label>
          <label>Minimum withdrawal (coins) <input style={{ width: 100 }} type="number" value={cfg.min_withdraw_coins} onChange={(e) => setCfg({ ...cfg, min_withdraw_coins: e.target.value })} /></label>
          <label>Withdrawals open (UTC) <input type="datetime-local" value={String(cfg.withdraw_opens_at).slice(0, 16)} onChange={(e) => setCfg({ ...cfg, withdraw_opens_at: e.target.value + ':00Z' })} /></label>
          <button className="btn" disabled={busy} onClick={() => run(() => post({ action: 'save_config', ...cfg }), 'Rules saved.')}>Save</button>
        </div>
        <hr />
        <div className="spread" style={{ gap: 8, flexWrap: 'wrap' }}>
          <label><input type="checkbox" checked={!!cfg.play_purchase_enabled} onChange={(e) => setCfg({ ...cfg, play_purchase_enabled: e.target.checked })} /> Sell coins with Google Play in the app</label>
          <label>Website link in the app <select value={cfg.web_link_mode || 'off'} onChange={(e) => setCfg({ ...cfg, web_link_mode: e.target.value })}>
            <option value="off">Off (recommended)</option>
            <option value="allowed_regions">Only US, UK and EEA phones</option>
            <option value="always">Everyone (breaks Google’s rules in most countries)</option>
          </select></label>
          <input style={{ minWidth: 220 }} value={cfg.web_buy_url || ''} onChange={(e) => setCfg({ ...cfg, web_buy_url: e.target.value })} aria-label="Website address" />
        </div>
        <p className="hint">Google’s payments policy says apps selling virtual currency must use Google Play billing, and may not point people to another way to pay, except in regions covered by Google’s link-out programme. Showing the link where it isn’t allowed can get the app removed. Save after changing.</p>
        <p className="hint">Only coins earned from gifts can be withdrawn. Changing the share affects new gifts only.</p>
      </section>

      <h2>Withdrawal requests</h2>
      {wds.length === 0 ? <section className="card"><p>No requests yet.</p></section> : null}
      {wds.map((w) => (
        <section className="card" key={w.id}>
          <div className="spread">
            <strong>@{w.username} · {Number(w.coins).toLocaleString()} coins · ${(w.usd_cents / 100).toFixed(2)}</strong>
            <span className="hint">{w.status} · {utc(w.created_at)}</span>
          </div>
          {w.status === 'pending' ? (
            <div className="spread" style={{ gap: 8, marginTop: 8 }}>
              <button className="btn" disabled={busy} onClick={() => run(async () => { await post({ action: 'handle_withdrawal', id: w.id, status: 'paid' }); setWds((a) => a.map((x) => (x.id === w.id ? { ...x, status: 'paid' } : x))) }, 'Marked paid.')}>Mark paid (after you sent the money)</button>
              <button className="btn btn-danger" disabled={busy} onClick={() => { const note = window.prompt('Reason the person will see:'); if (note) run(async () => { await post({ action: 'handle_withdrawal', id: w.id, status: 'rejected', note }); setWds((a) => a.map((x) => (x.id === w.id ? { ...x, status: 'rejected' } : x))) }, 'Rejected. Coins returned.') }}>Reject</button>
            </div>
          ) : null}
        </section>
      ))}

      <h2>Gifts</h2>
      {gifts.map((x, i) => (
        <section className="card" key={x.id}>
          <div className="spread" style={{ gap: 8, flexWrap: 'wrap' }}>
            <input style={{ width: 60 }} value={x.emoji} onChange={(e) => setG(i, 'emoji', e.target.value)} aria-label="Emoji" />
            <input value={x.name} onChange={(e) => setG(i, 'name', e.target.value)} aria-label="Name" />
            <input style={{ width: 90 }} type="number" value={x.cost} onChange={(e) => setG(i, 'cost', e.target.value)} aria-label="Cost in coins" />
            <input style={{ width: 70 }} type="number" value={x.sort} onChange={(e) => setG(i, 'sort', e.target.value)} aria-label="Order" />
            <label><input type="checkbox" checked={x.active} onChange={(e) => setG(i, 'active', e.target.checked)} /> On</label>
            <button className="btn" disabled={busy} onClick={() => run(() => post({ action: 'save_gift', ...x }), 'Gift saved.')}>Save</button>
          </div>
          <p className="hint">id: {x.id} · cost in coins · order</p>
        </section>
      ))}
      <button className="btn" onClick={() => setGifts((a) => [...a, { id: 'new_gift', name: 'New gift', emoji: '🎁', cost: 10, sort: a.length + 1, active: true }])}>Add a gift</button>

      <h2>Coin packs</h2>
      <p className="hint">Website price is in US cents (500 = $5.00); the website converts it to Naira at checkout. The product id must match an in-app product in Play Console only if you sell with Google Play, whose prices are set there.</p>
      {packs.map((x, i) => (
        <section className="card" key={x.sku + i}>
          <div className="spread" style={{ gap: 8, flexWrap: 'wrap' }}>
            <input value={x.sku} onChange={(e) => setP(i, 'sku', e.target.value)} aria-label="Product id" />
            <input style={{ width: 100 }} type="number" value={x.coins} onChange={(e) => setP(i, 'coins', e.target.value)} aria-label="Coins" />
            <input style={{ width: 110 }} type="number" value={x.price_usd_cents ?? ''} placeholder="US cents" onChange={(e) => setP(i, 'price_usd_cents', e.target.value)} aria-label="Website price in US cents" />
            <input style={{ width: 130 }} value={x.label || ''} placeholder="Label" onChange={(e) => setP(i, 'label', e.target.value)} aria-label="Label" />
            <input style={{ width: 70 }} type="number" value={x.sort} onChange={(e) => setP(i, 'sort', e.target.value)} aria-label="Order" />
            <label><input type="checkbox" checked={x.active} onChange={(e) => setP(i, 'active', e.target.checked)} /> On</label>
            <button className="btn" disabled={busy} onClick={() => run(() => post({ action: 'save_pack', ...x }), 'Pack saved.')}>Save</button>
          </div>
        </section>
      ))}
      <button className="btn" onClick={() => setPacks((a) => [...a, { sku: 'flitcoins_', coins: 100, label: '', sort: a.length + 1, active: true }])}>Add a pack</button>

      <h2>Fix a balance</h2>
      <p className="hint">Use a minus number to take coins away, for example after Google refunds a purchase. A balance never goes below zero. This is logged.</p>
      <section className="card">
        <div className="spread" style={{ gap: 8, flexWrap: 'wrap' }}>
          <input placeholder="username" value={adj.username} onChange={(e) => setAdj({ ...adj, username: e.target.value })} />
          <input style={{ width: 110 }} type="number" placeholder="coins ±" value={adj.delta} onChange={(e) => setAdj({ ...adj, delta: e.target.value })} />
          <input style={{ flex: 1, minWidth: 180 }} placeholder="reason" value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} />
          <button className="btn btn-danger" disabled={busy} onClick={() => run(() => post({ action: 'adjust', ...adj, delta: Number(adj.delta) }), (r) => '@' + r.username + ' balance is now ' + Number(r.balance).toLocaleString())}>Apply</button>
        </div>
      </section>

      <h2>Recent activity</h2>
      {activity.length === 0 ? <section className="card"><p>Nothing yet.</p></section> : null}
      {activity.map((a) => (
        <section className="card" key={a.id}>
          <div className="spread"><span>{a.text}</span><span className="hint">{utc(a.at)}</span></div>
        </section>
      ))}
      {msg ? <div className={'toast' + (msg.ok ? '' : ' toast-err')} role="status">{msg.text}</div> : null}
    </>
  )
}
