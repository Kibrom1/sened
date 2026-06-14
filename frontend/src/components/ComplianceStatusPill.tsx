/**
 * Single source of truth for compliance-status presentation across the app.
 *
 * Both the Dashboard and the Vendors page render this so a vendor can never
 * appear with two different status vocabularies. `no_data` covers vendors with
 * no confirmed COI / no compliance check yet.
 */

export type VendorComplianceStatus =
  | 'matches_requirements'
  | 'gaps_found'
  | 'expired'
  | 'needs_review'
  | 'no_data'

export const COMPLIANCE_STATUS_META: Record<
  VendorComplianceStatus,
  { label: string; pill: string; dot: string; sort: number }
> = {
  expired: {
    label: 'Expired',
    pill: 'bg-rose-50 text-rose-700 border-rose-200',
    dot: 'bg-rose-500',
    sort: 0,
  },
  gaps_found: {
    label: 'Gaps found',
    pill: 'bg-amber-50 text-amber-800 border-amber-200',
    dot: 'bg-amber-500',
    sort: 1,
  },
  needs_review: {
    label: 'Needs review',
    pill: 'bg-slate-50 text-slate-600 border-slate-200',
    dot: 'bg-slate-400',
    sort: 2,
  },
  no_data: {
    label: 'Not checked',
    pill: 'bg-slate-50 text-slate-500 border-slate-200',
    dot: 'bg-slate-300',
    sort: 3,
  },
  matches_requirements: {
    label: 'Matches requirements',
    pill: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
    sort: 4,
  },
}

export default function ComplianceStatusPill({
  status,
}: {
  status: VendorComplianceStatus
}) {
  const meta = COMPLIANCE_STATUS_META[status] ?? COMPLIANCE_STATUS_META.no_data
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${meta.pill}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  )
}
