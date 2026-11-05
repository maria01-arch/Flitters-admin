import { redirect } from 'next/navigation'
import { getStaffContext, can } from '@/lib/staff'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCounts } from '@/lib/counts'
import Shell from '@/components/Shell'

export const dynamic = 'force-dynamic'

export default async function ConsoleLayout({ children }) {
  const ctx = await getStaffContext()
  if (ctx.error) redirect('/login')

  // prio decides which five show in the phone's bottom bar.
  const groups = [
    { title: 'Overview', items: [{ label: 'Dashboard', short: 'Home', href: '/', icon: 'home', prio: 1 }] },
    {
      title: 'Moderation',
      items: [
        { label: 'Reports', href: '/reports', icon: 'flag', badge: 'reports', prio: 2, show: can(ctx, 'reports.view') },
        { label: 'Appeals', href: '/appeals', icon: 'message', badge: 'appeals', prio: 4, show: can(ctx, 'appeals.review') },
        { label: 'Users', href: '/users', icon: 'user', prio: 5, show: can(ctx, 'users.view') },
      ],
    },
    {
      title: 'Ads',
      items: [
        { label: 'Ads', href: '/ads', icon: 'megaphone', badge: 'ads', prio: 3, show: can(ctx, 'ads.review') || can(ctx, 'ads.edit') || can(ctx, 'ads.billing.view') },
        { label: 'Pricing', href: '/pricing', icon: 'tag', prio: 8, show: can(ctx, 'pricing.manage') },
      ],
    },
    {
      title: 'Admin',
      items: [
        { label: 'Team', href: '/team', icon: 'users', prio: 6, show: can(ctx, 'staff.manage') },
        { label: 'Audit log', short: 'Audit', href: '/audit', icon: 'clipboard', prio: 7, show: can(ctx, 'audit.view') },
      ],
    },
  ]
    .map((g) => ({ ...g, items: g.items.filter((i) => i.show !== false).map(({ show, ...rest }) => rest) }))
    .filter((g) => g.items.length > 0)

  let counts = { reports: null, urgent: null, ads: null, appeals: null }
  try {
    counts = await getCounts(createAdminClient(), ctx)
  } catch (err) {
    console.error('Counts failed:', err)
  }

  return (
    <Shell
      email={ctx.user.email}
      roleName={ctx.role?.name || ctx.member.role_key}
      groups={groups}
      initialCounts={counts}
      canSearchUsers={can(ctx, 'users.view')}
    >
      {children}
    </Shell>
  )
}
