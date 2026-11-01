'use client'
import { useEffect, useState } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'
import { utc, money } from '@/lib/format'

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

const STATUS_FILTERS = [
  ['', 'All'], ['live', 'Live'], ['approved', 'Approved'], ['paused', 'Paused'], ['completed', 'Completed'],
  ['rejected', 'Rejected'], ['awaiting_payment', 'Awaiting payment'], ['draft', 'Draft'],
]
const EMPTY_FORM = { id: null, type: 'post', advertiser_name: '', content: '', link_url: '', cta_text: '', image_url: '', video_url: '', advertiser_avatar_url: '' }

function Creative({ c }) {
  return (
    <div className="preview">
      {c.content ? <p className="content">{c.content}</p> : null}
      {c.image_url ? <img src={c.image_url} alt="" loading="lazy" /> : null}
      {c.video_url ? <video src={c.video_url} controls playsInline preload="none" /> : null}
      {c.cta_text || c.link_url ? (
        <small className="meta">
          Button: {c.cta_text || 'Learn More'} → {c.link_url || 'no link'}
        </small>
      ) : null}
    </div>
  )
}

export default function AdsClient({ tab, status, campaigns: initialCampaigns, houseAds: initialHouse, perms, error }) {
  const [campaigns, setCampaigns] = useState(initialCampaigns)
  const [house, setHouse] = useState(initialHouse)
  const [dlg, setDlg] = useState(null) // { kind: 'approve'|'reject'|'pause'|'resume'|'house'|'house_delete', item }
  const [reason, setReason] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    if (!msg) return undefined
    const t = setTimeout(() => setMsg(null), 9000)
    return () => clearTimeout(t)
  }, [msg])

  const setField = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const patch = (id, change) => setCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, ...change } : c)))

  async function upload(e) {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Upload failed')
      setForm((f) => ({ ...f, image_url: j.url }))
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }

  async function confirm() {
    const { kind, item } = dlg
    setBusy(true)
    try {
      if (kind === 'approve' || kind === 'reject') {
        const j = await api({ action: 'campaign_review', campaignId: item.id, decision: kind, reason })
        patch(item.id, { status: j.status, rejection_reason: kind === 'reject' ? reason.trim() : null })
        setMsg({ ok: true, text: (kind === 'approve' ? 'Approved.' : 'Rejected.') + (j.emailed ? ' The advertiser was emailed.' : ' No email sent: ' + (j.emailNote || 'unknown reason')) })
      } else if (kind === 'pause' || kind === 'resume') {
        const j = await api({ action: 'campaign_set_state', campaignId: item.id, to: kind === 'pause' ? 'paused' : 'live' })
        patch(item.id, { status: j.status })
        setMsg({ ok: true, text: kind === 'pause' ? 'Paused.' : 'Resumed.' })
      } else if (kind === 'house') {
        const j = await api({ action: 'house_save', id: form.id, fields: form })
        setHouse((prev) => (form.id ? prev.map((a) => (a.id === j.ad.id ? j.ad : a)) : [j.ad, ...prev]))
        setMsg({ ok: true, text: form.id ? 'Saved.' : 'Created. It is switched off until you turn it on.' })
      } else if (kind === 'house_delete') {
        await api({ action: 'house_delete', id: item.id })
        setHouse((prev) => prev.filter((a) => a.id !== item.id))
        setMsg({ ok: true, text: 'Deleted.' })
      }
      setDlg(null)
    } catch (e) {
      setMsg({ ok: false, text: e.message })
      if (dlg.kind !== 'house') setDlg(null)
    } finally {
      setBusy(false)
    }
  }

  async function toggleHouse(ad) {
    try {
      await api({ action: 'house_toggle', id: ad.id, active: !ad.active })
      setHouse((prev) => prev.map((a) => (a.id === ad.id ? { ...a, active: !ad.active } : a)))
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    }
  }

  function openHouse(ad) {
    setForm(ad ? { ...EMPTY_FORM, ...Object.fromEntries(Object.keys(EMPTY_FORM).map((k) => [k, ad[k] == null ? '' : ad[k]])), id: ad.id } : EMPTY_FORM)
    setDlg({ kind: 'house' })
  }

  const dialogs = {
    approve: ['Approve this ad?', 'It goes live at its start date. The advertiser is emailed.', 'Approve'],
    reject: ['Reject this ad?', 'The advertiser is emailed your reason and can fix and send it again.', 'Reject'],
    pause: ['Pause this ad?', 'It stops showing within minutes, once apps reload their ads.', 'Pause'],
    resume: ['Resume this ad?', 'It starts showing again until its end date.', 'Resume'],
    house_delete: ['Delete this house ad?', 'This cannot be undone.', 'Delete'],
    house: [form.id ? 'Edit house ad' : 'New house ad', '', 'Save'],
  }
  const d = dlg ? dialogs[dlg.kind] : null

  return (
    <>
      <h1>Ads</h1>
      <div className="seg">
        {perms.canReview ? <a href="/ads?tab=review" className={'segitem' + (tab === 'review' ? ' segitem-on' : '')}>To review</a> : null}
        <a href="/ads?tab=campaigns" className={'segitem' + (tab === 'campaigns' ? ' segitem-on' : '')}>Campaigns</a>
        <a href="/ads?tab=house" className={'segitem' + (tab === 'house' ? ' segitem-on' : '')}>House ads</a>
      </div>

      {tab === 'campaigns' ? (
        <div className="seg wrap">
          {STATUS_FILTERS.map(([v, label]) => (
            <a key={v} href={'/ads?tab=campaigns' + (v ? '&status=' + v : '')} className={'segitem' + ((status || '') === v ? ' segitem-on' : '')}>{label}</a>
          ))}
        </div>
      ) : null}

      {error ? <p className="err">{error}</p> : null}

      {tab !== 'house' && campaigns.length === 0 ? (
        <section className="card">
          <h2>{tab === 'review' ? 'Nothing to review' : 'No campaigns'}</h2>
          <p>Advertiser campaigns appear here once the Advertiser Portal is live.</p>
        </section>
      ) : null}

      {tab !== 'house' && campaigns.map((c) => (
        <section key={c.id} className="card report">
          <div className="report-head">
            <div>
              <strong>{c.name}</strong>
              <small className="meta">
                {c.advertiser ? c.advertiser.name + ' · ' + c.advertiser.country : 'Unknown advertiser'} · {c.placement === 'reel' ? 'Reel' : 'Feed'} · {c.days || '?'} days
              </small>
              <small className="meta">{utc(c.start_at)} → {utc(c.end_at)}</small>
            </div>
            <span className="badge">{c.status.replace('_', ' ')}</span>
          </div>

          {c.money ? (
            <p className="hint">
              {c.paid_at ? 'Paid ' + money(c.money.total_minor, c.money.currency) + ' (VAT ' + money(c.money.vat_minor, c.money.currency) + ') · ' + money(c.money.price_per_day_minor, c.money.currency) + ' per day' : 'Not paid yet'}
            </p>
          ) : null}
          {c.advertiser && c.advertiser.email ? <small className="meta">{c.advertiser.email}</small> : null}

          <Creative c={c} />

          <ul className="checks">
            {c.checks.map((k, i) => (
              <li key={i} className={k.ok ? 'check-ok' : 'check-bad'}>
                <strong>{k.ok ? 'OK' : 'Check'}</strong> {k.label}
              </li>
            ))}
          </ul>
          <p className="hint">Also read the ad policy yourself: this list can’t judge the content.</p>

          {c.stats ? <p className="hint">Views {c.stats.impressions} · Clicks {c.stats.clicks}</p> : null}
          {c.status === 'rejected' && c.rejection_reason ? <p className="note">Rejected: {c.rejection_reason}</p> : null}

          <div className="actions">
            {c.status === 'pending_review' && perms.canReview ? (
              <>
                <button type="button" className="btn btn-small btn-primary" onClick={() => setDlg({ kind: 'approve', item: c })}>Approve</button>
                <button type="button" className="btn btn-small btn-danger" onClick={() => { setReason(''); setDlg({ kind: 'reject', item: c }) }}>Reject</button>
              </>
            ) : null}
            {c.status === 'live' && perms.canEdit ? <button type="button" className="btn btn-small" onClick={() => setDlg({ kind: 'pause', item: c })}>Pause</button> : null}
            {c.status === 'paused' && perms.canEdit ? <button type="button" className="btn btn-small" onClick={() => setDlg({ kind: 'resume', item: c })}>Resume</button> : null}
          </div>
        </section>
      ))}

      {tab === 'house' ? (
        <>
          <p className="lead">House ads are your own ads (not from advertisers). They show in the apps while switched on.</p>
          {perms.canEdit ? <div className="actions"><button type="button" className="btn btn-primary" onClick={() => openHouse(null)}>New house ad</button></div> : null}
          {house.length === 0 ? <section className="card"><p>No house ads yet.</p></section> : null}
          {house.map((a) => (
            <section key={a.id} className="card report">
              <div className="report-head">
                <div>
                  <strong>{a.advertiser_name}</strong>
                  <small className="meta">{a.type === 'reel' ? 'Reel ad' : 'Feed ad'}</small>
                </div>
                <span className={'badge' + (a.active ? ' badge-on' : '')}>{a.active ? 'On' : 'Off'}</span>
              </div>
              <Creative c={a} />
              {perms.canEdit ? (
                <div className="actions">
                  <button type="button" className="btn btn-small" onClick={() => toggleHouse(a)}>{a.active ? 'Switch off' : 'Switch on'}</button>
                  <button type="button" className="btn btn-small" onClick={() => openHouse(a)}>Edit</button>
                  <button type="button" className="btn btn-small btn-danger" onClick={() => setDlg({ kind: 'house_delete', item: a })}>Delete</button>
                </div>
              ) : null}
            </section>
          ))}
        </>
      ) : null}

      <ConfirmDialog
        open={!!dlg}
        title={d ? d[0] : ''}
        message={d ? d[1] : ''}
        confirmLabel={d ? d[2] : 'OK'}
        danger={!!dlg && (dlg.kind === 'reject' || dlg.kind === 'house_delete')}
        busy={busy}
        onConfirm={confirm}
        onCancel={() => setDlg(null)}
      >
        {dlg && dlg.kind === 'reject' ? (
          <label className="field">
            <span>Reason the advertiser will read</span>
            <textarea rows={4} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        ) : null}
        {dlg && dlg.kind === 'house' ? (
          <div className="stack">
            <label className="field"><span>Where it shows</span>
              <select value={form.type} onChange={setField('type')}><option value="post">Feed (image)</option><option value="reel">Reels (video)</option></select>
            </label>
            <label className="field"><span>Advertiser name</span><input value={form.advertiser_name} maxLength={80} onChange={setField('advertiser_name')} /></label>
            <label className="field"><span>Text</span><textarea rows={3} maxLength={500} value={form.content} onChange={setField('content')} /></label>
            <label className="field"><span>Link (https://…)</span><input value={form.link_url} onChange={setField('link_url')} /></label>
            <label className="field"><span>Button text</span><input value={form.cta_text} maxLength={24} onChange={setField('cta_text')} /></label>
            {form.type === 'post' ? (
              <>
                <label className="field"><span>Image link (https://…)</span><input value={form.image_url} onChange={setField('image_url')} /></label>
                <label className="field"><span>Or upload an image (JPG, PNG or WebP, under 4 MB)</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} disabled={busy} /></label>
                {form.image_url ? <img className="thumb" src={form.image_url} alt="" /> : null}
              </>
            ) : (
              <label className="field"><span>Video link (https://…)</span><input value={form.video_url} onChange={setField('video_url')} /></label>
            )}
            <label className="field"><span>Advertiser logo link (optional)</span><input value={form.advertiser_avatar_url} onChange={setField('advertiser_avatar_url')} /></label>
          </div>
        ) : null}
      </ConfirmDialog>

      {msg ? <div className={'toast' + (msg.ok ? '' : ' toast-err')} role="status">{msg.text}</div> : null}
    </>
  )
}
