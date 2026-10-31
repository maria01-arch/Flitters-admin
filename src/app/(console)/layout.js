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
    { label: 'Users', soon: true, show: can(ctx, 'users.view') },
    { label: 'Ads', soon: true, show: can(ctx, 'ads.review') },
    { label: 'Pricing', soon: true, show: can(ctx, 'pricing.manage') },
    { label: 'Team', soon: true, show: can(ctx, 'staff.manage') },
    { label: 'Audit log', soon: true, show: can(ctx, 'audit.view') },
  ].filter((n) => n.show !== false)

  return (
    <Shell email={ctx.user.email} roleName={ctx.role?.name || ctx.member.role_key} nav={nav}>
      {children}
    </Shell>
  )
}
