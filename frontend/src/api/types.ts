export interface Organization {
  id: string
  name: string
  subscription_status: 'trialing' | 'active' | 'past_due' | 'canceled'
  reminder_lead_days: number
  reminder_cadence_days: number
  expiring_soon_days: number
  created_at: string
}

export interface User {
  id: string
  email: string
  name: string
  role: 'owner' | 'member'
  organization: Organization
  created_at: string
}

export interface RequirementLine {
  id: string
  coverage_type: string
  is_required: boolean
  min_each_occurrence: number | null
  min_aggregate: number | null
  additional_insured_required: boolean
  waiver_required: boolean
}

export interface RequirementProfile {
  id: string
  name: string
  lines: RequirementLine[]
  created_at: string
}

export interface Vendor {
  id: string
  name: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  notes: string | null
  requirement_profile: string | null
  requirement_profile_name: string | null
  status: 'active' | 'inactive'
  created_at: string
}

export type CoverageType =
  | 'general_liability'
  | 'automobile'
  | 'workers_comp'
  | 'umbrella'
  | 'professional_liability'
  | 'other'

export type ConfidenceIndicator = 'yes' | 'no' | 'unclear'

export interface ExtractedCoverage {
  id: string
  coverage_type: CoverageType
  carrier_name: string | null
  policy_number: string | null
  effective_date: string | null
  expiration_date: string | null
  limits: Record<string, number> | null
  additional_insured: ConfidenceIndicator | null
  waiver_of_subrogation: ConfidenceIndicator | null
  confidence: Record<string, number> | null
  confirmed: boolean
  confirmed_at: string | null
}

export interface COIDocument {
  id: string
  vendor: string
  status: 'uploaded' | 'processing' | 'extracted' | 'confirmed' | 'failed'
  source: 'upload' | 'magic_link'
  insured_name: string | null
  certificate_holder_name: string | null
  producer_name: string | null
  certificate_date: string | null
  coverages: ExtractedCoverage[]
  created_at: string
}

export type ComplianceStatus =
  | 'matches_requirements'
  | 'gaps_found'
  | 'expired'
  | 'needs_review'

export interface ComplianceCheck {
  id: string
  vendor: string
  document: string
  status: ComplianceStatus
  reasons: string[] | null
  checked_at: string
}

export interface DashboardBuckets {
  expired: ComplianceCheckWithVendor[]
  gaps_found: ComplianceCheckWithVendor[]
  needs_review: ComplianceCheckWithVendor[]
  matches_requirements: ComplianceCheckWithVendor[]
}

export interface ComplianceCheckWithVendor extends ComplianceCheck {
  vendor_name: string
  vendor_id: string
  next_expiration: string | null
}

/** Response from GET /api/compliance/vendor/<id>/ */
export interface VendorComplianceStatus {
  status: 'matches_requirements' | 'gaps_found' | 'expired' | 'needs_review' | 'no_data'
  reasons: string[]
  checked_at: string | null
}
