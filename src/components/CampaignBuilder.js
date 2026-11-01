'use client'
import { useEffect, useState } from 'react'
import Icon from '@/components/Icon'
import AdPreview from '@/components/AdPreview'
import { money } from '@/lib/format'

const STEPS = ['Where', 'Your ad', 'Schedule', 'Review']
const CTAS = ['Learn more', 'Shop now', 'Sign up', 'Book now', 'Order now', 'Contact us']
const DAY_CHIPS = [3, 7, 14, 30]
const MAX_IMG = 4 * 1024 * 1024
const MAX_VID = 30 * 1024 * 1024

const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10)
const addDays = (s, n) => {
  const d = new Date(s + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const nice = (s) => (s ? new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—')

function videoSeconds(file) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(v.src)
      resolve(v.duration)
    }
    v.onerror = () => reject(new Error('Could not read that video'))
    v.src = URL.createObjectURL(file)
  })
}

export default function CampaignBuilder({ initial, business, countryLabel, storageReady }) {
  const locked = !!(initial && initial.locked)
  const [step, setStep] = useState(locked ? 1 : 0)
  const [id, setId] = useState(initial ? initial.id : null)
  const [name, setName] = useState(initial ? initial.name : '')
  const [placement, setPlacement] = useState(initial ? initial.placement : '')
  const [content, setContent] = useState(initial ? initial.content || '' : '')
  const [cta, setCta] = useState(initial ? initial.cta_text || '' : '')
  const [link, setLink] = useState(initial ? initial.link_url || '' : '')
  const [imageUrl, setImageUrl] = useState(initial ? initial.image_url : null)
  const [videoUrl, setVideoUrl] = useState(initial ? initial.video_url : null)
  const [imageKey, setImageKey] = useState(null)
  const [videoKey, setVideoKey] = useState(null)
  const [startDate, setStartDate] = useState(initial && initial.start_date ? initial.start_date : tomorrow())
  const [days, setDays] = useState(initial && initial.days ? initial.days : 7)
  const [quote, setQuote] = useState(null)
  const [quoteBusy, setQuoteBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pct, setPct] = useState(0)
  const [error, setError] = useState('')

  const shownQuote = locked && initial.money ? initial.money : quote

  useEffect(() => {
    if (locked || step < 2 || !placement) return undefined
    const d = Number(days)
    if (!(d >= 1 && d <= 365)) {
      setQuote(null)
      return undefined
    }
    setQuoteBusy(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ placement, days: d }) })
        const j = await res.json().catch(() => ({}))
        setQuote(res.ok ? j.quote : { error: j.error || 'Could not get the price' })
      } catch {
        setQuote({ error: 'Could not get the price' })
      } finally {
        setQuoteBusy(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [step, placement, days, locked])

  function stepError(s) {
    if (s === 0) {
      if (name.trim().length < 2) return 'Give your campaign a name'
      if (!placement) return 'Choose where your ad shows'
    }
    if (s === 1) {
      if (!/^https:\/\/\S+$/i.test(link.trim())) return 'Add the link people open, starting with https://'
      if (placement === 'feed' && !imageUrl) return 'Add an image for your ad'
      if (placement === 'reel' && !videoUrl) return 'Add a video for your ad'
    }
    if (s === 2 && !locked) {
      if (!startDate || startDate < tomorrow()) return 'Pick a start date from tomorrow'
      if (!(Number(days) >= 1 && Number(days) <= 365)) return 'Choose how many days'
      if (quoteBusy || !quote) return 'Working out your price… try again in a second'
      if (quote.error) return quote.error
    }
    return ''
  }

  async function save() {
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save', id, name, placement, content, cta_text: cta, link_url: link.trim(),
        start_date: startDate, days: Number(days),
        image_key: imageKey || undefined, video_key: videoKey || undefined,
      }),
    })
    const j = await res.json().catch(() => ({}))
    if (res.status === 401) {
      window.location.href = '/login'
      throw new Error('Please sign in again')
    }
    if (!res.ok) throw new Error(j.error || 'Could not save')
    const c = j.campaign
    if (!id) window.history.replaceState(null, '', '/campaigns/' + c.id + '/edit')
    setId(c.id)
    setImageKey(null)
    setVideoKey(null)
    setImageUrl(c.image_url)
    setVideoUrl(c.video_url)
    return c
  }

  async function next() {
    const err = stepError(step)
    if (err) return setError(err)
    setError('')
    setBusy(true)
    try {
      await save()
      setStep(step + 1)
      window.scrollTo(0, 0)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function pay() {
    setBusy(true)
    setError('')
    try {
      const c = await save()
      if (locked) {
        const res = await fetch('/api/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'resubmit', id: c.id }) })
        const j = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(j.error || 'Could not send it for review')
        window.location.href = '/campaigns/' + c.id + '?pay=resubmitted'
        return
      }
      const res = await fetch('/api/pay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaignId: c.id }) })
      const j = await res.json().catch(() => ({}))
      if (res.status === 401) {
        window.location.href = '/login'
        return
      }
      if (!res.ok) throw new Error(j.error || 'Could not start the payment')
      window.location.href = j.url
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  async function finishLater() {
    setBusy(true)
    setError('')
    try {
      const c = await save()
      window.location.href = '/campaigns/' + c.id
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  function choose(p) {
    if (locked || p === placement) return
    setPlacement(p)
    setImageUrl(null)
    setVideoUrl(null)
    setImageKey(null)
    setVideoKey(null)
    setQuote(null)
  }

  async function pickImage(e) {
    const f = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!f) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) return setError('Use a JPG, PNG or WebP image')
    if (f.size > MAX_IMG) return setError('That image is over 4 MB. Try a smaller one.')
    setError('')
    setUploading(true)
    setPct(0)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const res = await fetch('/api/upload/image', { method: 'POST', body: fd })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Upload failed')
      setImageKey(j.key)
      setImageUrl(URL.createObjectURL(f))
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  async function pickVideo(e) {
    const f = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!f) return
    if (f.type !== 'video/mp4') return setError('Use an MP4 video')
    if (f.size > MAX_VID) return setError('That video is over 30 MB. Try a smaller one.')
    setError('')
    setUploading(true)
    setPct(0)
    try {
      const secs = await videoSeconds(f)
      if (secs > 30.5) throw new Error('Videos can be up to 30 seconds long')
      const res = await fetch('/api/upload/video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ size: f.size, type: f.type }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Could not start the upload')
      await new Promise((resolve, reject) => {
        const x = new XMLHttpRequest()
        x.open('PUT', j.url)
        x.setRequestHeader('Content-Type', f.type)
        x.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setPct(Math.round((ev.loaded / ev.total) * 100))
        }
        x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error('Upload failed (' + x.status + ')')))
        x.onerror = () => reject(new Error('The upload was blocked. Check your connection and try again.'))
        x.send(f)
      })
      setVideoKey(j.key)
      setVideoUrl(URL.createObjectURL(f))
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const endDate = startDate && Number(days) >= 1 ? addDays(startDate, Number(days) - 1) : null
  const hasMedia = placement === 'feed' ? !!imageUrl : placement === 'reel' ? !!videoUrl : false
  const todo = [
    [name.trim().length >= 2, 'Campaign name'],
    [!!placement, 'Where it shows'],
    [hasMedia, placement === 'reel' ? 'Video' : 'Image'],
    [/^https:\/\/\S+$/i.test(link.trim()), 'Link (https)'],
    [locked || (startDate >= tomorrow() && Number(days) >= 1), 'Dates'],
  ]
  const ready = todo.every((t) => t[0])
  const showPreview = (step === 1 || step === 3) && !!placement

  return (
    <>
      <header className="bar">
        <a className="bar-close" href={id ? '/campaigns/' + id : '/campaigns'} aria-label="Close"><Icon name="close" /></a>
        <span className="bar-title">{initial ? 'Edit campaign' : 'New campaign'}</span>
      </header>
      <div className="progress" aria-hidden="true">{STEPS.map((s, i) => <i key={s} className={i <= step ? 'done' : ''} />)}</div>
      <div className="progress-labels">{STEPS.map((s, i) => <span key={s} className={i === step ? 'on' : ''}>{s}</span>)}</div>

      <div className="builder">
        {initial && initial.rejection_reason ? (
          <div className="card card-flat"><span className="pill pill-bad">Needs changes</span><p>{initial.rejection_reason}</p><p className="hint">Fix this below, then send it for review again. You have 7 days.</p></div>
        ) : null}
        {!storageReady && step === 1 ? <p className="note">Uploads are not set up yet, so you can’t add a picture or video right now.</p> : null}

        <div className={'builder-grid' + (showPreview ? ' has-preview' : '')}>
          <div key={step} className="step">
            {step === 0 ? (
              <>
                <h1>Where should your ad show?</h1>
                <div className="choices">
                  <button type="button" className={'choice' + (placement === 'feed' ? ' on' : '')} onClick={() => choose('feed')} disabled={locked}>
                    <span className="choice-ic"><Icon name="feed" /></span>
                    <span><strong>In the feed</strong><small>A picture between posts. Great for offers and announcements.</small></span>
                  </button>
                  <button type="button" className={'choice' + (placement === 'reel' ? ' on' : '')} onClick={() => choose('reel')} disabled={locked}>
                    <span className="choice-ic"><Icon name="video" /></span>
                    <span><strong>In Reels</strong><small>A full-screen video, up to 30 seconds. Great for showing your product.</small></span>
                  </button>
                </div>
                <label className="field"><span>Campaign name <small>(only you see this)</small></span><input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="For example: December sale" /></label>
              </>
            ) : null}

            {step === 1 ? (
              <>
                <h1>Create your ad</h1>
                {placement === 'feed' ? (
                  <div className="stack">
                    <label className="drop">
                      <Icon name="image" />
                      <strong>{imageUrl ? 'Change image' : 'Add an image'}</strong>
                      <span className="hint">JPG, PNG or WebP, up to 4 MB. Square works best.</span>
                      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pickImage} disabled={uploading || !storageReady} />
                    </label>
                    {imageUrl ? <img className="thumb" src={imageUrl} alt="Your image" /> : null}
                  </div>
                ) : (
                  <div className="stack">
                    <label className="drop">
                      <Icon name="video" />
                      <strong>{videoUrl ? 'Change video' : 'Add a video'}</strong>
                      <span className="hint">MP4, up to 30 seconds and 30 MB. Vertical (9:16) works best.</span>
                      <input type="file" accept="video/mp4" onChange={pickVideo} disabled={uploading || !storageReady} />
                    </label>
                    {uploading ? <div className="bar-progress" aria-label="Uploading"><i style={{ width: pct + '%' }} /></div> : null}
                    {videoUrl && !uploading ? <p className="hint">Video added.</p> : null}
                  </div>
                )}
                {uploading && placement === 'feed' ? <p className="hint">Uploading…</p> : null}

                <label className="field"><span>Text <small>(optional, up to 300 characters)</small></span><textarea value={content} maxLength={300} onChange={(e) => setContent(e.target.value)} placeholder="Say something short and clear" /><span className="counter">{content.length}/300</span></label>
                <div className="field">
                  <span>Button text <small>(up to 24 characters)</small></span>
                  <div className="chips">{CTAS.map((c) => <button key={c} type="button" className={'chipbtn' + (cta === c ? ' on' : '')} onClick={() => setCta(c)}>{c}</button>)}</div>
                  <input value={cta} maxLength={24} onChange={(e) => setCta(e.target.value)} placeholder="Learn more" />
                </div>
                <label className="field"><span>Where the button goes</span><input type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://your-website.com" /></label>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <h1>When should it run?</h1>
                {locked ? (
                  <div className="card card-flat"><p>Dates and price are fixed because this campaign is already paid.</p><p className="hint">{initial.start_date ? nice(initial.start_date) : ''} · {initial.days} days</p></div>
                ) : (
                  <>
                    <label className="field"><span>Start date <small>(from tomorrow, so we can review first)</small></span><input type="date" min={tomorrow()} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
                    <div className="field">
                      <span>How many days?</span>
                      <div className="chips">{DAY_CHIPS.map((n) => <button key={n} type="button" className={'chipbtn' + (Number(days) === n ? ' on' : '')} onClick={() => setDays(n)}>{n} days</button>)}</div>
                      <input type="number" inputMode="numeric" min="1" max="365" value={days} onChange={(e) => setDays(e.target.value)} />
                    </div>
                    {endDate ? <p className="hint">Runs {nice(startDate)} to {nice(endDate)} (dates are in UTC).</p> : null}
                  </>
                )}
                <div className="pricebox" aria-live="polite">
                  {shownQuote && !shownQuote.error ? (
                    <>
                      <span className="hint">You pay in {shownQuote.currency}</span>
                      <span className="total">{money(shownQuote.total_minor, shownQuote.currency)}</span>
                      <div className="line"><span>{money(shownQuote.price_per_day_minor, shownQuote.currency)} × {shownQuote.days} days</span><span>{money(shownQuote.subtotal_minor, shownQuote.currency)}</span></div>
                      {Number(shownQuote.vat_percent) > 0 ? <div className="line"><span>VAT {Number(shownQuote.vat_percent)}%</span><span>{money(shownQuote.vat_minor, shownQuote.currency)}</span></div> : null}
                    </>
                  ) : shownQuote && shownQuote.error ? <span className="err">{shownQuote.error}</span> : <span className="hint">{quoteBusy ? 'Working out your price…' : 'Your price shows here.'}</span>}
                </div>
              </>
            ) : null}

            {step === 3 ? (
              <>
                <h1>Review your campaign</h1>
                <section className="card card-flat">
                  <dl className="kv">
                    <dt>Name</dt><dd>{name}</dd>
                    <dt>Shows in</dt><dd>{placement === 'reel' ? 'Reels' : 'The feed'}</dd>
                    <dt>Runs</dt><dd>{nice(startDate)} to {nice(endDate)}</dd>
                    <dt>Link</dt><dd>{link}</dd>
                    <dt>Business</dt><dd>{business} · {countryLabel}</dd>
                  </dl>
                </section>
                <div className="pricebox">
                  {shownQuote && !shownQuote.error ? (
                    <>
                      <span className="hint">Total in {shownQuote.currency}</span>
                      <span className="total">{money(shownQuote.total_minor, shownQuote.currency)}</span>
                      {Number(shownQuote.vat_percent) > 0 ? <div className="line"><span>Includes VAT {Number(shownQuote.vat_percent)}%</span><span>{money(shownQuote.vat_minor, shownQuote.currency)}</span></div> : null}
                    </>
                  ) : <span className="hint">Price not available yet.</span>}
                </div>
                <ul className="todo">
                  {todo.map(([ok, label]) => <li key={label} className={ok ? '' : 'bad'}><Icon name={ok ? 'check' : 'alert'} />{label}</li>)}
                </ul>
                <p className="hint">{locked ? 'Your fixes are saved. Send it for review again when you are ready.' : 'You pay securely with Paystack. We review every ad within 24 hours, and your ad goes live on its start date once approved.'}</p>
                <p className="hint">By {locked ? 'sending this' : 'paying'} you agree to the <a href="/terms" target="_blank" rel="noreferrer">terms</a>, <a href="/ad-policy" target="_blank" rel="noreferrer">ad policy</a> and <a href="/refunds" target="_blank" rel="noreferrer">refund policy</a>.</p>
                <button type="button" className="btn btn-wide" onClick={finishLater} disabled={busy}>Save and finish later</button>
              </>
            ) : null}
          </div>

          {showPreview ? (
            <aside className="sticky-preview">
              <small>Preview</small>
              <AdPreview placement={placement} business={business} content={content} ctaText={cta} imageUrl={imageUrl} videoUrl={videoUrl} />
            </aside>
          ) : null}
        </div>

        {error ? <p className="err" role="alert">{error}</p> : null}
      </div>

      <div className="actionbar">
        {step > (locked ? 1 : 0) ? <button type="button" className="btn" onClick={() => { setStep(step - 1); setError(''); window.scrollTo(0, 0) }} disabled={busy}><Icon name="back" />Back</button> : null}
        {step < 3 ? (
          <button type="button" className="btn btn-primary" onClick={next} disabled={busy || uploading}>{busy ? 'Saving…' : 'Continue'}</button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={pay} disabled={busy || !ready || (!locked && !(shownQuote && !shownQuote.error))}>
            {busy ? 'Please wait…' : locked ? 'Send for review again' : shownQuote && !shownQuote.error ? 'Pay ' + money(shownQuote.total_minor, shownQuote.currency) : 'Pay'}
          </button>
        )}
      </div>
    </>
  )
}
