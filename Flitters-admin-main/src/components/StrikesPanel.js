'use client'
import { useEffect, useState } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'
import { callHealth } from '@/lib/clientApi'
import { utc } from '@/lib/format'

const REASONS = [
  ['spam', 'Spam or scam'], ['harassment', 'Harassment'], ['hate_speech', 'Hate speech'], ['violence', 'Violence'],
  ['nudity_sexual', 'Nudity or sexual content'], ['child_safety', 'Child safety'], ['impersonation', 'Impersonation'],
  ['copyright', 'Copyright'], ['other', 'Other'],
]
const LABEL = Object.fromEntries(REASONS)
const TYPES = [['', 'Not linked to content'], ['post', 'A post'], ['comment', 'A comment'], ['reel', 'A reel'], ['reel_comment', 'A reel comment'], ['message', 'A message'], ['profile', 'The profile'], ['other', 'Something else']]

function stateOf(s) {
  if (s.status === 'overturned') return 'removed'
  if (new Date(s.expires_at) <= new Date()) return 'expired'
  return s.status === 'appealed' ? 'appealed' : 'active'
}

export default function StrikesPanel({ userId, initial, canIssue, canReview, missing }) {
  const [strikes, setStrikes] = useState(initial)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ reasonCode: 'spam', reason: '', severity: '1', expiresDays: '90', contentType: '', contentId: '', snapshot: '' })
  const [removing, setRemoving] = useState(null)
  const [note, setNote] = useState('')
  const [confirmIssue, setConfirmIssue] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    if (!msg) return undefined
    const t = setTimeout(() => setMsg(null), 7000)
    return () => clearTimeout(t)
  }, [msg])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const points = strikes.filter((s) => ['active', 'appealed'].includes(stateOf(s))).reduce((n, s) => n + s.severity, 0)

  async function issue() {
    setBusy(true)
    try {
      const j = await callHealth({
        action: 'issue_strike', userId, reasonCode: form.reasonCode, reason: form.reason.trim(), severity: Number(form.severity),
        expiresDays: Number(form.expiresDays), contentType: form.contentType || null, contentId: form.contentId.trim() || null, snapshot: form.snapshot.trim() || null,
      })
      setStrikes((prev) => [{ ...j.strike, status: 'active' }, ...prev])
      setForm({ reasonCode: 'spam', reason: '', severity: '1', expiresDays: '90', contentType: '', contentId: '', snapshot: '' })
      setOpen(false)
      setConfirmIssue(false)
      setMsg({ ok: true, text: 'Strike given. The person gets an alert in the app.' })
    } catch (e) {
      setMsg({ ok: false, text: e.message })
      setConfirmIssue(false)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await callHealth({ action: 'overturn_strike', strikeId: removing.id, note: note.trim() })
      setStrikes((prev) => prev.map((s) => (s.id === removing.id ? { ...s, status: 'overturned' } : s)))
      setRemoving(null)
      setMsg({ ok: true, text: 'Strike removed. The person was told.' })
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally {
      setBusy(false)
    }
  }

  if (missing) {
    return (
      <section className="card">
        <h2>Strikes</h2>
        <p className="hint">Strikes aren’t set up in the database yet. Run 03_account_health_help.sql in Supabase.</p>
      </section>
    )
  }

  return (
    <section className="card" id="strikes">
      <h2>Strikes ({points} active point{points === 1 ? '' : 's'})</h2>
      {strikes.length === 0 ? <p>No strikes.</p> : (
        <ul className="rows">
          {strikes.map((s) => {
            const st = stateOf(s)
            return (
              <li key={s.id}>
                <span>
                  {LABEL[s.reason_code] || s.reason_code} · {s.severity} pt · {st}
                  <br /><small className="meta">{s.reason}</small>
                  {s.content_snapshot ? <><br /><small className="meta">“{String(s.content_snapshot).slice(0, 160)}”</small></> : null}
                </span>
                <small>
                  {utc(s.issued_at)}
                  {canReview && (st === 'active' || st === 'appealed') ? (
                    <> · <button type="button" className="linkbtn" onClick={() => { setNote(''); setRemoving(s) }}>Remove</button></>
                  ) : null}
                </small>
              </li>
            )
          })}
        </ul>
      )}

      {canIssue ? (
        open ? (
          <div className="stack">
            <label className="field"><span>Reason</span>
              <select value={form.reasonCode} onChange={set('reasonCode')}>{REASONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </label>
            <label className="field"><span>What the person is told</span>
              <textarea rows={3} maxLength={500} value={form.reason} onChange={set('reason')} placeholder="e.g. Your post promoted a scam link, which breaks our spam rules." />
            </label>
            <div className="seg wrap">
              <label className="field"><span>Points</span>
                <select value={form.severity} onChange={set('severity')}><option value="1">1 (minor)</option><option value="2">2</option><option value="3">3 (serious)</option></select>
              </label>
              <label className="field"><span>Fades after</span>
                <select value={form.expiresDays} onChange={set('expiresDays')}><option value="30">30 days</option><option value="90">90 days</option><option value="180">180 days</option><option value="365">1 year</option></select>
              </label>
            </div>
            <label className="field"><span>Content</span>
              <select value={form.contentType} onChange={set('contentType')}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </label>
            {form.contentType ? (
              <>
                <label className="field"><span>Copy of the content (the person can see it; optional)</span>
                  <textarea rows={3} maxLength={500} value={form.snapshot} onChange={set('snapshot')} />
                </label>
                <label className="field"><span>Content ID (optional)</span>
                  <input value={form.contentId} onChange={set('contentId')} placeholder="uuid" />
                </label>
              </>
            ) : null}
            <div className="actions">
              <button type="button" className="btn btn-small btn-danger" disabled={form.reason.trim().length < 3} onClick={() => setConfirmIssue(true)}>Give strike…</button>
              <button type="button" className="btn btn-small" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="actions"><button type="button" className="btn btn-small btn-danger" onClick={() => setOpen(true)}>Give a strike</button></div>
        )
      ) : null}

      <ConfirmDialog
        open={confirmIssue}
        title="Give this strike?"
        message={`${LABEL[form.reasonCode]} · ${form.severity} point(s). The person is alerted right away and can see the reason${form.snapshot ? ' and the copy of the content' : ''}.`}
        confirmLabel="Give strike"
        danger
        busy={busy}
        onConfirm={issue}
        onCancel={() => setConfirmIssue(false)}
      />
      <ConfirmDialog
        open={!!removing}
        title="Remove this strike?"
        message="It stops counting right away and the person is told."
        confirmLabel="Remove strike"
        busy={busy}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      >
        <label className="field"><span>Message to the person (optional)</span>
          <textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </ConfirmDialog>

      {msg ? <div className={'toast' + (msg.ok ? '' : ' toast-err')} role="status">{msg.text}</div> : null}
    </section>
  )
}
