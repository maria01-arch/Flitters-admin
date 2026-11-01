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

export function money(minor, currency) {
  if (minor == null) return '—'
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).format(Number(minor) / 100)
  } catch {
    return (Number(minor) / 100).toFixed(2) + ' ' + currency
  }
}

export const ACTION_LABELS = {
  'auth.sign_in': 'Signed in',
  'content.delete': 'Deleted content',
  'content.media_delete': 'Removed files from storage',
  'user.ban': 'Banned a user',
  'user.unban': 'Unbanned a user',
  'report.status': 'Changed a report',
  'badge.grant': 'Gave a badge',
  'badge.remove': 'Removed a badge',
  'message.view_reported': 'Viewed a reported message',
  'ad.approve': 'Approved an ad',
  'ad.reject': 'Rejected an ad',
  'ad.pause': 'Paused an ad',
  'ad.resume': 'Resumed an ad',
  'ad.house_save': 'Saved a house ad',
  'ad.house_toggle': 'Switched a house ad',
  'ad.house_delete': 'Deleted a house ad',
  'ad.house_upload': 'Uploaded an ad image',
  'price.save': 'Saved a price',
  'price.set_active': 'Switched a price',
  'currency.set': 'Changed a currency',
  'country.save': 'Saved country settings',
  'country.delete': 'Removed country settings',
  'staff.invite': 'Invited staff',
  'staff.invite_revoked': 'Cancelled an invite',
  'staff.invite_accepted': 'Accepted an invite',
  'staff.set_role': 'Changed a staff role',
  'staff.set_extra': 'Changed extra access',
  'staff.set_status': 'Suspended or reactivated staff',
  'staff.remove': 'Removed staff',
  'role.save': 'Saved a role',
  'role.delete': 'Deleted a role',
}
