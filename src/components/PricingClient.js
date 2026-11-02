'use client'
import { useEffect, useState } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'
import { money } from '@/lib/format'

async function api(body) {
  const res = await fetch('/api/ads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = await res.json().catch(() => ({}))
  if (res.status === 401) {
    window.location.href = '/login'
    throw new Error('Please sign in again')
  }
  if (!res.ok) throw new Error(j.error || 'Something went wrong (' + res.status + ')')
  return j
}

const EMPTY_RULE = { id: null, country_code: '', placement: 'feed', currency: 'USD', price: '', min_days: 1, max_days: 90, active: true, note: '' }

export default function PricingClient({ rules: r0, currencies: c0, countrySettings: s0, countries }) {
  const [rules, setRules] = useState(r0)
  const [currencies, setCurrencies] = useState(c0)
  const [settings, setSettings] = useState(s0)
  const [dlg, setDlg] = useState(null) // 'rule' | 'country' | 'currency' | { kind: 'del_country', code }
  const [rule, setRule] = useState(EMPTY_RULE)
  const [cs, setCs] = useState({ country_code: 'NG', currency: 'NGN', vat_percent: '0' })
  const [newCur, setNewCur] = useState('')
  const [q, setQ] = useState({ country: 'NG', placement: 'feed', days: '7' })
  const [quote, setQuote] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    if (!msg) return undefined
    const t = setTimeout(() => setMsg(null), 8000)
    return () => clearTimeout(t)
  }, [msg])

  const nameOf = (code) => (code ? (countries.find((c) => c.code === code) || { name: code }).name : 'All regions')
  const enabled = currencies.filter((c) => c.enabled).map((c) => c.currency)

  function openRule(r) {
    setRule(r ? { id: r.id, country_code: r.country_code || '', placement: r.placement, currency: r.currency, price: String(r.price_per_day_minor / 100), min_days: r.min_days, max_days: r.max_days, active: r.active, note: r.note || '' } : EMPTY_RULE)
    setDlg('rule')
  }

  async function reload() {
    window.location.reload()
  }

  async function confirm() {
    setBusy(true)
    try {
      if (dlg === 'rule') {
        await api({ action: 'price_save', ...rule, country_code: rule.country_code || null })
        setMsg({ ok: true, text: 'Price saved.' })
        await reload()
        return
      }
      if (dlg === 'country') {
        await api({ action: 'country_save', ...cs })
        setMsg({ ok: true, text: 'Saved.' })
        await reload()
        return
      }
      if (dlg === 'currency') {
        await api({ action: 'currency_set', currency: newCur, enabled: true })
        setMsg({ ok: true, text: 'Currency added.' })
        await reload()
        return
      }
      if (dlg && dlg.kind === 'del_country') {
        await api({ action: 'country_delete', country_code: dlg.code })
        setSettings((p) => p.filter((s) => s.country_code !== dlg.code))
        setMsg({ ok: true, text: 'Removed.' })
      }
      setDlg(null)
    } catch (e) {
      setMsg({ ok: false, text: e.message })
      if (dlg && dlg.kind === 'del_country') setDlg(null)
    } finally {
      setBusy(false)
    }
  }

  async function setActive(r) {
    try {
      await api({ action: 'price_set_active', id: r.id, active: !r.active })
      setRules((p) => p.map((x) => (x.id === r.id ? { ...x, active: !r.active } : x)))
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    }
  }

  async function toggleCurrency(c) {
    try {
      await api({ action: 'currency_set', currency: c.currency, enabled: !c.enabled })
      setCurrencies((p) => p.map((x) => (x.currency === c.currency ? { ...x, enabled: !c.enabled } : x)))
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    }
  }

  async function runQuote(e) {
    e.preventDefault()
    setQuote(null)
    try {
      const j = await api({ action: 'quote', country: q.country, placement: q.placement, days: Number(q.days) })
      setQuote(j.quote)
    } catch (err) {
      setQuote({ error: err.message })
    }
  }

  const rf = (k) => (e) => setRule((r) => ({ ...r, [k]: e.target.value }))
  const countrySelect = (value, onChange, withAll) => (
    <select value={value} onChange={onChange}>
      {withAll ? <option value="">All regions</option> : null}
      {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
    </select>
  )

  return (
    <>
      <h1>Pricing</h1>
      <p className="lead">Prices are per day. A country price beats the all-regions price. Paid campaigns keep the price they paid, so changes here never affect them.</p>

      <section className="card">
        <div className="report-head"><h2>Prices</h2><button type="button" className="btn btn-small btn-primary" onClick={() => openRule(null)}>Add price</button></div>
        {rules.length === 0 ? <p>No prices yet. Add an all-regions price first, in USD.</p> : null}
        <ul className="rows">
          {rules.map((r) => (
            <li key={r.id}>
              <span>
                <strong>{nameOf(r.country_code)}</strong> · {r.placement === 'reel' ? 'Reel' : 'Feed'} · {money(r.price_per_day_minor, r.currency)} per day
              </span>
              <small>{r.min_days}–{r.max_days} days · {r.active ? 'On' : 'Off'}{r.note ? ' · ' + r.note : ''}</small>
              <div className="actions">
                <button type="button" className="btn btn-small" onClick={() => openRule(r)}>Edit</button>
                <button type="button" className="btn btn-small" onClick={() => setActive(r)}>{r.active ? 'Turn off' : 'Turn on'}</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <div className="report-head"><h2>Countries: currency and VAT</h2><button type="button" className="btn btn-small" onClick={() => { setCs({ country_code: 'NG', currency: enabled[0] || 'USD', vat_percent: '0' }); setDlg('country') }}>Add country</button></div>
        <p className="hint">A country with no row here pays in USD with no VAT.</p>
        <ul className="rows">
          {settings.map((s) => (
            <li key={s.country_code}>
              <span><strong>{s.name}</strong> · pays in {s.currency} · VAT {Number(s.vat_percent)}%</span>
              <div className="actions">
                <button type="button" className="btn btn-small" onClick={() => { setCs({ country_code: s.country_code, currency: s.currency, vat_percent: String(Number(s.vat_percent)) }); setDlg('country') }}>Edit</button>
                <button type="button" className="btn btn-small btn-danger" onClick={() => setDlg({ kind: 'del_country', code: s.country_code })}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <div className="report-head"><h2>Currencies</h2><button type="button" className="btn btn-small" onClick={() => { setNewCur(''); setDlg('currency') }}>Add currency</button></div>
        <p className="hint">Only switch on currencies your Paystack account can charge. If USD is off, advertisers outside the countries you set pay in the first currency that is on.</p>
        <ul className="chips">
          {currencies.map((c) => (
            <li key={c.currency}>
              <button type="button" className={'btn btn-small' + (c.enabled ? ' btn-primary' : '')} onClick={() => toggleCurrency(c)}>{c.currency} {c.enabled ? 'on' : 'off'}</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Try a price</h2>
        <form onSubmit={runQuote} className="stack">
          <label className="field"><span>Advertiser’s country</span>{countrySelect(q.country, (e) => setQ((x) => ({ ...x, country: e.target.value })), false)}</label>
          <label className="field"><span>Where</span><select value={q.placement} onChange={(e) => setQ((x) => ({ ...x, placement: e.target.value }))}><option value="feed">Feed</option><option value="reel">Reels</option></select></label>
          <label className="field"><span>Days</span><input inputMode="numeric" value={q.days} onChange={(e) => setQ((x) => ({ ...x, days: e.target.value }))} /></label>
          <button type="submit" className="btn">Show price</button>
        </form>
        {quote && quote.error ? <p className="err">{quote.error}</p> : null}
        {quote && !quote.error ? (
          <dl className="kv">
            <dt>Price used</dt><dd>{quote.rule_scope} · {money(quote.price_per_day_minor, quote.currency)} per day</dd>
            <dt>Subtotal</dt><dd>{money(quote.subtotal_minor, quote.currency)} ({quote.days} days)</dd>
            <dt>VAT {quote.vat_percent}%</dt><dd>{money(quote.vat_minor, quote.currency)}</dd>
            <dt>Total</dt><dd><strong>{money(quote.total_minor, quote.currency)}</strong></dd>
          </dl>
        ) : null}
      </section>

      <ConfirmDialog
        open={!!dlg}
        title={dlg === 'rule' ? (rule.id ? 'Edit price' : 'Add price') : dlg === 'country' ? 'Country settings' : dlg === 'currency' ? 'Add currency' : 'Remove country settings?'}
        message={dlg && dlg.kind === 'del_country' ? 'Advertisers from this country will pay in USD with no VAT.' : ''}
        confirmLabel={dlg && dlg.kind === 'del_country' ? 'Remove' : 'Save'}
        danger={!!dlg && dlg.kind === 'del_country'}
        busy={busy}
        onConfirm={confirm}
        onCancel={() => setDlg(null)}
      >
        {dlg === 'rule' ? (
          <div className="stack">
            <label className="field"><span>Region</span>{countrySelect(rule.country_code, rf('country_code'), true)}</label>
            <label className="field"><span>Where</span><select value={rule.placement} onChange={rf('placement')}><option value="feed">Feed</option><option value="reel">Reels</option></select></label>
            <label className="field"><span>Currency</span><select value={rule.currency} onChange={rf('currency')}>{currencies.map((c) => <option key={c.currency} value={c.currency}>{c.currency}</option>)}</select></label>
            <label className="field"><span>Price per day (for example 5000 or 12.50)</span><input inputMode="decimal" value={rule.price} onChange={rf('price')} /></label>
            <label className="field"><span>Fewest days</span><input inputMode="numeric" value={rule.min_days} onChange={rf('min_days')} /></label>
            <label className="field"><span>Most days</span><input inputMode="numeric" value={rule.max_days} onChange={rf('max_days')} /></label>
            <label className="field"><span>Note (only you see it)</span><input maxLength={200} value={rule.note} onChange={rf('note')} /></label>
            <label className="permrow"><input type="checkbox" checked={rule.active} onChange={(e) => setRule((r) => ({ ...r, active: e.target.checked }))} /><span>Price is on</span></label>
          </div>
        ) : null}
        {dlg === 'country' ? (
          <div className="stack">
            <label className="field"><span>Country</span>{countrySelect(cs.country_code, (e) => setCs((x) => ({ ...x, country_code: e.target.value })), false)}</label>
            <label className="field"><span>Pays in</span><select value={cs.currency} onChange={(e) => setCs((x) => ({ ...x, currency: e.target.value }))}>{currencies.map((c) => <option key={c.currency} value={c.currency}>{c.currency}</option>)}</select></label>
            <label className="field"><span>VAT percent</span><input inputMode="decimal" value={cs.vat_percent} onChange={(e) => setCs((x) => ({ ...x, vat_percent: e.target.value }))} /></label>
          </div>
        ) : null}
        {dlg === 'currency' ? (
          <label className="field"><span>3-letter code, for example GHS</span><input maxLength={3} value={newCur} onChange={(e) => setNewCur(e.target.value.toUpperCase())} /></label>
        ) : null}
      </ConfirmDialog>

      {msg ? <div className={'toast' + (msg.ok ? '' : ' toast-err')} role="status">{msg.text}</div> : null}
    </>
  )
}
