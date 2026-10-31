'use client'
import { DURATIONS } from '@/lib/clientApi'

export default function BanFields({ hours, setHours, reason, setReason, canPermanent }) {
  return (
    <div className="stack">
      <label className="field">
        <span>How long</span>
        <select value={hours} onChange={(e) => setHours(e.target.value)}>
          {DURATIONS.filter((d) => d.value !== 'perm' || canPermanent).map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Reason (kept in the audit log)</span>
        <input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
      </label>
    </div>
  )
}
