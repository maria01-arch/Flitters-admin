export function money(minor, currency) {
  if (minor == null) return '—'
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).format(Number(minor) / 100)
  } catch {
    return (Number(minor) / 100).toFixed(2) + ' ' + currency
  }
}

export function day(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export const STATUS = {
  draft: ['Draft', ''],
  awaiting_payment: ['Awaiting payment', 'warn'],
  pending_review: ['In review', 'info'],
  approved: ['Approved', 'ok'],
  live: ['Live', 'ok'],
  paused: ['Paused', 'warn'],
  completed: ['Completed', ''],
  rejected: ['Needs changes', 'bad'],
  refunded: ['Refunded', ''],
  cancelled: ['Cancelled', ''],
}
