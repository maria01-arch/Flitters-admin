import { redirect } from 'next/navigation'
import { getStaffContext, can } from '@/lib/staff'
import Shell from '@/components/Shell'

export const dynamic = 'force-dynamic'

export default async function ConsoleLayout({ children }) {
  const ctx = await getStaffContext()
  if (ctx.error) redirect('/login')

  const nav = [
    { label: 'Dashboard', href: '/' },
    { label: 'Reports', href: '/reports', show: can(ctx, 'reports.view') },
    { label: 'Users', href: '/users', show: can(ctx, 'users.view') },
    { label: 'Appeals', href: '/appeals', show: can(ctx, 'appeals.review') },
    { label: 'Ads', href: '/ads', show: can(ctx, 'ads.review') || can(ctx, 'ads.edit') || can(ctx, 'ads.billing.view') },
    { label: 'Pricing', href: '/pricing', show: can(ctx, 'pricing.manage') },
    { label: 'Team', href: '/team', show: can(ctx, 'staff.manage') },
    { label: 'Audit log', href: '/audit', show: can(ctx, 'audit.view') },
  ].filter((n) => n.show !== false)

  return (
    <Shell email={ctx.user.email} roleName={ctx.role?.name || ctx.member.role_key} nav={nav}>
      {children}
    </Shell>
  )
}
