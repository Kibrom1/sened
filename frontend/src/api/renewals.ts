import { apiClient } from './client'
import type { ActivityLogEntry, RenewalRequest } from './types'

export const renewalsApi = {
  /** GET /api/renewals/ — renewal requests for the org, newest first. */
  list: () =>
    apiClient.get<RenewalRequest[]>('/renewals/').then((r) => r.data),

  /** POST /api/renewals/send/<vendorId>/ — manually trigger a reminder. */
  send: (vendorId: string) =>
    apiClient
      .post<{ renewal_id: string; message: string }>(`/renewals/send/${vendorId}/`)
      .then((r) => r.data),

  /** GET /api/activity/ — recent activity feed for the org. */
  activity: (vendorId?: string) => {
    const params = vendorId ? { vendor: vendorId } : {}
    return apiClient
      .get<ActivityLogEntry[]>('/activity/', { params })
      .then((r) => r.data)
  },
}
