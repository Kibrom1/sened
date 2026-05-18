import type { ComplianceStatus } from '@/api/types'

const STATUS_CONFIG: Record<ComplianceStatus, { label: string; className: string }> = {
  matches_requirements: {
    label: 'Matches Requirements',
    className: 'bg-green-100 text-green-800',
  },
  gaps_found: {
    label: 'Gaps Found',
    className: 'bg-yellow-100 text-yellow-800',
  },
  expired: {
    label: 'Expired',
    className: 'bg-red-100 text-red-800',
  },
  needs_review: {
    label: 'Needs Review',
    className: 'bg-blue-100 text-blue-800',
  },
}

interface Props {
  status: ComplianceStatus
}

export default function StatusBadge({ status }: Props) {
  const config = STATUS_CONFIG[status]
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  )
}
