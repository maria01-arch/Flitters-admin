import { STATUS } from '@/lib/format'

export default function StatusPill({ status }) {
  const [label, tone] = STATUS[status] || [status, '']
  return <span className={'pill' + (tone ? ' pill-' + tone : '')}>{label}</span>
}
