// Every permission the console understands. The server checks these on every action.
export const PERMISSIONS = [
  ['reports.view', 'See the reports queue'],
  ['reports.resolve', 'Mark reports handled or dismissed'],
  ['content.delete', 'Delete posts, comments and reels'],
  ['messages.view_reported', 'Open one reported private message'],
  ['users.view', 'Look up users'],
  ['users.ban', 'Ban users'],
  ['users.ban.permanent', 'Give permanent bans'],
  ['users.unban', 'Unban users'],
  ['appeals.review', 'Accept or reject ban appeals'],
  ['badges.grant', 'Give or remove badges'],
  ['ads.review', 'Approve or reject ads'],
  ['ads.edit', 'Create, edit and pause ads'],
  ['ads.billing.view', 'See ad payments and amounts'],
  ['ads.refund', 'Record ad refunds'],
  ['pricing.manage', 'Set ad prices'],
  ['subscriptions.view', 'See subscriptions'],
  ['announcements.manage', 'Manage announcements'],
  ['staff.manage', 'Invite and manage staff'],
  ['roles.manage', 'Create and edit roles'],
  ['audit.view', 'Read the audit log'],
  ['analytics.view', 'See analytics'],
]
export const PERMISSION_KEYS = PERMISSIONS.map((p) => p[0])

export function effective(role, extra) {
  return Array.from(new Set([...((role && role.permissions) || []), ...(extra || [])]))
}

// True if someone holding actorPerms may hand out `wanted` (nobody can give more than they hold).
export function covers(actorPerms, wanted) {
  if (actorPerms.includes('*')) return true
  return wanted.every((p) => p !== '*' && actorPerms.includes(p))
}
