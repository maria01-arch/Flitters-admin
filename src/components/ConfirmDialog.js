'use client'
import { useEffect, useRef } from 'react'

// The one dialog used everywhere instead of the browser's pop-ups.
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
  children,
}) {
  const cancelRef = useRef(null)
  const onCancelRef = useRef(onCancel)

  // Always call the newest onCancel without restarting the effect below.
  useEffect(() => {
    onCancelRef.current = onCancel
  })

  // Runs only when the dialog opens or closes. It must NOT run on every key
  // press, or focus jumps away from the text box and the phone keyboard closes.
  useEffect(() => {
    if (!open) return undefined
    if (cancelRef.current) cancelRef.current.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') onCancelRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null
  return (
    <div
      className="dlg-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="dlg" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
        <h2 id="dlg-title">{title}</h2>
        {message ? <p>{message}</p> : null}
        {children}
        <div className="dlg-actions">
          <button ref={cancelRef} type="button" className="btn" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={'btn ' + (danger ? 'btn-danger' : 'btn-primary')}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
