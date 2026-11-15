'use client'
import { useEffect, useState } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'
import BanFields from '@/components/BanFields'
import { call } from '@/lib/clientApi'
import { banLabel, utc } from '@/lib/format'

export default function UserClient({ user, bannedUntil: initialBan, isStaff, perms }) {
  const [bannedUntil, setBannedUntil] = useState(initialBan)
  const [badges, setBadges] = useState({ authentic: user.is_authentic, verified: user.verified })
  const [dlg, setDlg] = useState(null) // { kind: 'ban' | 'unban' | 'badge', badge?, value? }
  const [hours, setHours] = useState('72')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    if (!msg) return undefined
    const t = setTimeout(() => setMsg(null), 7000)
    return () => clearTimeout(t)
  }, [msg])

  const ban = banLabel(bannedUntil)
  const paid = !!user.verified_plan

  async function confirm() {
    setBusy(true)
    try {
      if (dlg.kind === 'ban') {
        const j = await call({ action: 'ban', userId: user.id, hours: hours === 'perm' ? null : Number(hours), reason: reason.trim() })
        setBannedUntil(j.bannedUntil || '2999-01-01T00:00:00Z')
        setMsg({ ok: true, text: 'User banned.' + (j.profileNote ? ' The reason could not be saved for their ban screen: ' + j.profileNote : '') })
      } else if (dlg.kind === 'unban') {
        await call({ action: 'unban', userId: user.id })
        setBannedUntil(null)
        setMsg({ ok: true, text: 'User unbanned.' })
      } else {
        const j = await call({ action: 'set_badge', userId: user.id, badge: dlg.badge, value: dlg.value })
        setBadges((prev) => ({ ...prev, [dlg.badge]: j.value }))
        setMsg({ ok: true, text: dlg.value ? 'Badge given.' : 'Badge removed.' })
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
    if (dlg.kind === 'ban') {
      title = 'Ban @' + user.username + '?'
      message = 'They can’t sign in until the ban ends. Someone already signed in can carry on for up to an hour.'
    } else if (dlg.kind === 'unban') {
      title = 'Unban @' + user.username + '?'
      message = 'They will be able to sign in again right away.'
    } else {
      const name = dlg.badge === 'authentic' ? 'blue badge' : 'gold ring'
      title = (dlg.value ? 'Give the ' : 'Remove the ') + name + '?'
      message = dlg.value ? '@' + user.username + ' will show the ' + name + ' in the apps.' : 'The ' + name + ' disappears from @' + user.username + '.'
    }
  }

  return (
    <section className="card">
      <h2>Status and tools</h2>
      <dl className="kv">
        <dt>Ban</dt>
        <dd>{ban ? 'Banned (' + ban + ')' : 'Not banned'}</dd>
        <dt>Blue badge</dt>
        <dd>
          {badges.authentic ? (paid ? 'Yes, from a paid plan (' + user.verified_plan + (user.verified_until ? ' until ' + utc(user.verified_until) : '') + ')' : 'Yes, given by staff') : 'No'}
        </dd>
        <dt>Gold ring</dt>
        <dd>{badges.verified ? 'Yes' : 'No'}</dd>
      </dl>

      <div className="actions">
        {perms.canBan && !isStaff ? (
          <button type="button" className="btn btn-small btn-danger" onClick={() => { setHours('72'); setReason(''); setDlg({ kind: 'ban' }) }}>
            {ban ? 'Change ban' : 'Ban'}
          </button>
        ) : null}
        {perms.canUnban && ban ? (
          <button type="button" className="btn btn-small" onClick={() => setDlg({ kind: 'unban' })}>
            Unban
          </button>
        ) : null}
        {perms.canBadge && !paid ? (
          <button type="button" className="btn btn-small" onClick={() => setDlg({ kind: 'badge', badge: 'authentic', value: !badges.authentic })}>
            {badges.authentic ? 'Remove blue badge' : 'Give blue badge'}
          </button>
        ) : null}
        {perms.canBadge ? (
          <button type="button" className="btn btn-small" onClick={() => setDlg({ kind: 'badge', badge: 'verified', value: !badges.verified })}>
            {badges.verified ? 'Remove gold ring' : 'Give gold ring'}
          </button>
        ) : null}
      </div>
      {isStaff ? <p className="hint">This is a staff account, so it can’t be banned here.</p> : null}
      {paid ? <p className="hint">The blue badge comes from a paid plan and follows the subscription.</p> : null}

      <ConfirmDialog
        open={!!dlg}
        title={title}
        message={message}
        confirmLabel={dlg && dlg.kind === 'ban' ? 'Ban' : dlg && dlg.kind === 'unban' ? 'Unban' : 'Confirm'}
        danger={!!dlg && dlg.kind === 'ban'}
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
    </section>
  )
}
