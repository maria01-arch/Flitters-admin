'use client'
import { useEffect, useState } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'
import BanFields from '@/components/BanFields'
import { call } from '@/lib/clientApi'

const REASONS = {
  child_safety: 'Child sexual abuse or exploitation',
  nudity_sexual: 'Nudity or sexual content',
  violence: 'Violence or dangerous behavior',
  harassment: 'Harassment or bullying',
  hate_speech: 'Hate speech',
  spam: 'Spam or scam',
  other: 'Something else',
}

const KIND_LABEL = { post: 'Post', comment: 'Comment', reel: 'Reel', reel_comment: 'Reel comment', message: 'Message', user: 'User', unknown: 'Unknown' }
const DELETABLE = ['post', 'comment', 'reel', 'reel_comment']

function ago(iso) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return Math.floor(s / 60) + ' min ago'
  if (s < 86400) return Math.floor(s / 3600) + ' h ago'
  return Math.floor(s / 86400) + ' d ago'
}

function mediaKind(url) {
  const path = String(url).split('?')[0].toLowerCase()
  if (/\.(mp4|mov|webm|m4v)$/.test(path)) return 'video'
  if (/\.(m4a|mp3|aac|wav|ogg|caf)$/.test(path)) return 'audio'
  return 'image'
}

export default function ReportsClient({ initial, filter, perms }) {
  const [items, setItems] = useState(initial)
  const [shown, setShown] = useState({})
  const [msgs, setMsgs] = useState({})
  const [dlg, setDlg] = useState(null) // { kind: 'delete' | 'ban' | 'unban' | 'viewmsg', item }
  const [hours, setHours] = useState('72')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [banned, setBanned] = useState({})

  useEffect(() => {
    if (!msg) return undefined
    const t = setTimeout(() => setMsg(null), 9000)
    return () => clearTimeout(t)
  }, [msg])

  const nameOf = (p) => (p ? '@' + p.username : 'this user')

  function openDialog(kind, item) {
    setHours('72')
    setReason('')
    setDlg({ kind, item })
  }

  async function setStatus(item, status) {
    try {
      await call({ action: 'set_report_status', reportId: item.id, status })
      setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, status } : x)))
      setMsg({ ok: true, text: status === 'dismissed' ? 'Report dismissed.' : 'Report marked as handled.' })
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    }
  }

  function mediaNote(m) {
    if (!m) return ''
    if (!m.configured) return ' Files were not removed from storage (storage keys are not set up yet).'
    if (m.failed > 0) return ' ' + m.deleted + ' file(s) removed, ' + m.failed + ' could not be removed.'
    if (m.deleted > 0) return ' ' + m.deleted + ' file(s) removed from storage.'
    return ''
  }

  async function confirm() {
    const { kind, item } = dlg
    setBusy(true)
    try {
      if (kind === 'delete') {
        const j = await call({ action: 'delete_content', type: item.kind, id: item.targetId, reportId: item.id })
        setItems((prev) =>
          prev.map((x) =>
            x.kind === item.kind && x.targetId === item.targetId
              ? { ...x, status: 'actioned', target: { missing: true, deleted: true }, offenderId: x.offenderId || j.userId }
              : x
          )
        )
        setMsg({ ok: true, text: 'Deleted.' + mediaNote(j.media) + ' You can still ban the author from this card.' })
      } else if (kind === 'ban') {
        const j = await call({
          action: 'ban',
          userId: item.offenderId,
          hours: hours === 'perm' ? null : Number(hours),
          reason: reason.trim(),
          reportId: item.id,
        })
        setBanned((prev) => ({ ...prev, [item.offenderId]: j.bannedUntil || 'permanent' }))
        setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, status: 'actioned' } : x)))
        setMsg({ ok: true, text: 'User banned.' })
      } else if (kind === 'unban') {
        await call({ action: 'unban', userId: item.offenderId, reportId: item.id })
        setBanned((prev) => {
          const n = { ...prev }
          delete n[item.offenderId]
          return n
        })
        setMsg({ ok: true, text: 'User unbanned.' })
      } else if (kind === 'viewmsg') {
        const j = await call({ action: 'view_message', reportId: item.id })
        setMsgs((prev) => ({ ...prev, [item.id]: j.message }))
        setShown((prev) => ({ ...prev, [item.id]: true }))
        setItems((prev) =>
          prev.map((x) =>
            x.id === item.id ? { ...x, offenderId: x.offenderId || j.message.sender_id, offender: x.offender || j.message.sender } : x
          )
        )
      }
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally {
      setBusy(false)
      setDlg(null)
    }
  }

  let title = ''
  let message = ''
  if (dlg) {
    const nm = nameOf(dlg.item.offender)
    if (dlg.kind === 'delete') {
      title = 'Delete this ' + KIND_LABEL[dlg.item.kind].toLowerCase() + '?'
      message =
        dlg.item.kind === 'comment'
          ? 'The comment and any replies under it are removed for everyone. This cannot be undone.'
          : dlg.item.kind === 'post'
          ? 'The post (and the rest of its thread) is removed for everyone, and its files are deleted from storage. This cannot be undone.'
          : dlg.item.kind === 'reel'
          ? 'The reel is removed for everyone, and its files are deleted from storage. This cannot be undone.'
          : 'The comment is removed for everyone. This cannot be undone.'
    } else if (dlg.kind === 'ban') {
      title = 'Ban ' + nm + '?'
      message = 'They can’t sign in until the ban ends. Someone already signed in can carry on for up to an hour.'
    } else if (dlg.kind === 'unban') {
      title = 'Unban ' + nm + '?'
      message = 'They will be able to sign in again right away.'
    } else {
      title = 'View this reported message?'
      message = 'Only this one message is shown, nothing else from the chat. Your view is recorded in the audit log.'
    }
  }

  return (
    <>
      <h1>Reports</h1>
      <div className="seg" role="tablist" aria-label="Filter reports">
        <a href="/reports" className={'segitem' + (filter === 'pending' ? ' segitem-on' : '')}>
          Pending
        </a>
        <a href="/reports?filter=all" className={'segitem' + (filter === 'all' ? ' segitem-on' : '')}>
          All
        </a>
      </div>

      {items.length === 0 ? (
        <section className="card">
          <h2>{filter === 'pending' ? 'No pending reports' : 'No reports yet'}</h2>
          <p>New reports from the apps show up here.</p>
        </section>
      ) : null}

      {items.map((item) => {
        const hasContent = DELETABLE.includes(item.kind)
        const t = item.target
        const m = msgs[item.id]
        const urgent = item.reason === 'child_safety' && item.status === 'pending'
        const bannedUntil = item.offenderId ? banned[item.offenderId] : null
        return (
          <section key={item.id} className={'card report' + (urgent ? ' report-urgent' : '')}>
            <div className="report-head">
              <div>
                <strong>{REASONS[item.reason] || item.reason || 'No reason given'}</strong>
                <small className="meta">
                  {KIND_LABEL[item.kind]} {item.targetId ? item.targetId.slice(0, 8) : ''} · reported by{' '}
                  {item.reporter ? '@' + item.reporter.username : 'unknown'} · {ago(item.created_at)}
                </small>
              </div>
              <span className={'badge' + (urgent ? ' badge-urgent' : '')}>{urgent ? 'Urgent' : item.status || 'pending'}</span>
            </div>

            {item.details ? <p className="details">{item.details}</p> : null}
            {bannedUntil ? (
              <p className="note">
                {nameOf(item.offender)} is banned (
                {bannedUntil === 'permanent' ? 'permanent' : 'until ' + String(bannedUntil).slice(0, 16).replace('T', ' ') + ' UTC'}).
              </p>
            ) : null}

            {item.kind === 'message' && !m ? (
              <p className="hint">
                {perms.canViewMessage
                  ? 'This report is about a private message. You can open just that one message.'
                  : 'This report is about a private message. Your role can’t open it.'}
              </p>
            ) : null}

            {item.kind === 'message' && m ? (
              <div className="preview">
                <small className="meta">
                  Reported message (the only part of the chat you can see) · from{' '}
                  {m.sender ? m.sender.display_name + ' (@' + m.sender.username + ')' : 'unknown'} · {m.source === 'group' ? 'group chat' : 'direct chat'}
                </small>
                {m.content ? <p className="content">{m.content}</p> : null}
                {m.media.map((u) => {
                  const k = mediaKind(u)
                  return k === 'video' ? (
                    <video key={u} src={u} controls playsInline preload="none" />
                  ) : k === 'audio' ? (
                    <audio key={u} src={u} controls preload="none" />
                  ) : (
                    <img key={u} src={u} alt="" loading="lazy" />
                  )
                })}
              </div>
            ) : null}

            {shown[item.id] && t && item.kind !== 'message' ? (
              <div className="preview">
                {t.missing ? (
                  <p>{t.deleted ? 'This ' + KIND_LABEL[item.kind].toLowerCase() + ' has been deleted.' : 'This ' + KIND_LABEL[item.kind].toLowerCase() + ' no longer exists.'}</p>
                ) : (
                  <>
                    <small className="meta">
                      {KIND_LABEL[item.kind]} by {t.author ? t.author.display_name + ' (@' + t.author.username + ')' : 'unknown'}
                    </small>
                    {t.content ? <p className="content">{t.content}</p> : null}
                    {t.image_url ? <img src={t.image_url} alt="" loading="lazy" /> : null}
                    {t.video_url ? <video src={t.video_url} controls playsInline preload="none" /> : null}
                  </>
                )}
              </div>
            ) : null}

            <div className="actions">
              {hasContent ? (
                <button type="button" className="btn btn-small" onClick={() => setShown((p) => ({ ...p, [item.id]: !p[item.id] }))}>
                  {shown[item.id] ? 'Hide content' : 'Show content'}
                </button>
              ) : null}
              {item.kind === 'message' && perms.canViewMessage && !m ? (
                <button type="button" className="btn btn-small" onClick={() => openDialog('viewmsg', item)}>
                  View reported message
                </button>
              ) : null}
              {hasContent && perms.canDelete && !(t && t.missing) ? (
                <button type="button" className="btn btn-small btn-danger" onClick={() => openDialog('delete', item)}>
                  Delete {KIND_LABEL[item.kind].toLowerCase()}
                </button>
              ) : null}
              {perms.canBan && item.offenderId ? (
                <button type="button" className="btn btn-small btn-danger" onClick={() => openDialog('ban', item)}>
                  Ban {item.offender ? '@' + item.offender.username : 'user'}
                </button>
              ) : null}
              {perms.canUnban && item.offenderId ? (
                <button type="button" className="btn btn-small" onClick={() => openDialog('unban', item)}>
                  Unban
                </button>
              ) : null}
              {perms.canViewUsers && item.offenderId ? (
                <a className="btn btn-small" href={'/users/' + item.offenderId}>
                  View profile
                </a>
              ) : null}
              {perms.canResolve && item.status === 'pending' ? (
                <>
                  <button type="button" className="btn btn-small" onClick={() => setStatus(item, 'actioned')}>
                    Mark handled
                  </button>
                  <button type="button" className="btn btn-small" onClick={() => setStatus(item, 'dismissed')}>
                    Dismiss
                  </button>
                </>
              ) : null}
            </div>
          </section>
        )
      })}

      <ConfirmDialog
        open={!!dlg}
        title={title}
        message={message}
        confirmLabel={dlg && dlg.kind === 'delete' ? 'Delete' : dlg && dlg.kind === 'ban' ? 'Ban' : dlg && dlg.kind === 'unban' ? 'Unban' : 'View message'}
        danger={!!dlg && (dlg.kind === 'delete' || dlg.kind === 'ban')}
        busy={busy}
        onConfirm={confirm}
        onCancel={() => setDlg(null)}
      >
        {dlg && dlg.kind === 'ban' ? (
          <BanFields hours={hours} setHours={setHours} reason={reason} setReason={setReason} canPermanent={perms.canBanPermanent} />
        ) : null}
      </ConfirmDialog>

      {msg ? (
        <div className={'toast' + (msg.ok ? '' : ' toast-err')} role="status">
          {msg.text}
        </div>
      ) : null}
    </>
  )
}
