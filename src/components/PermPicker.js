'use client'
import { PERMISSIONS } from '@/lib/permissions'

// Tick boxes for permissions. Boxes the person can't hand out are greyed out.
export default function PermPicker({ value, onChange, allowed }) {
  const set = new Set(value)
  return (
    <div className="perms">
      {PERMISSIONS.map(([key, label]) => {
        const ok = allowed.includes('*') || allowed.includes(key)
        return (
          <label key={key} className={'permrow' + (ok ? '' : ' permrow-off')}>
            <input
              type="checkbox"
              checked={set.has(key)}
              disabled={!ok}
              onChange={(e) => {
                const next = new Set(value)
                if (e.target.checked) next.add(key)
                else next.delete(key)
                onChange(Array.from(next))
              }}
            />
            <span>
              {label}
              <small>{key}</small>
            </span>
          </label>
        )
      })}
    </div>
  )
}
