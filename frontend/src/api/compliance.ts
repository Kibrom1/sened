import { apiClient } from './client'
import type { VendorComplianceStatus } from './types'

export const complianceApi = {
  /** GET /api/compliance/vendor/<vendorId>/ */
  vendorStatus: (vendorId: string) =>
    apiClient
      .get<VendorComplianceStatus>(`/compliance/vendor/${vendorId}/`)
      .then((r) => r.data),
}
