export function utc(iso) {
  if (!iso) return '—'
  return new Date(iso).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
}

// null = not banned (or ban already over), 'permanent', or 'until <date>'
export function banLabel(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime()) || d <= new Date()) return null
  if (d.getUTCFullYear() > 2100) return 'permanent'
  return 'until ' + utc(iso)
}
