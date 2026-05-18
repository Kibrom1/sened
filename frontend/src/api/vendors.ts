import { apiClient } from './client'
import type { Vendor, RequirementProfile } from './types'

export const vendorsApi = {
  list: () => apiClient.get<Vendor[]>('/vendors/').then((r) => r.data),
  get: (id: string) => apiClient.get<Vendor>(`/vendors/${id}/`).then((r) => r.data),
  create: (data: Partial<Vendor>) =>
    apiClient.post<Vendor>('/vendors/', data).then((r) => r.data),
  update: (id: string, data: Partial<Vendor>) =>
    apiClient.patch<Vendor>(`/vendors/${id}/`, data).then((r) => r.data),
  delete: (id: string) => apiClient.delete(`/vendors/${id}/`),
  import: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiClient.post('/vendors/import/', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}

export interface RequirementLineInput {
  coverage_type: string
  is_required: boolean
  min_each_occurrence: number | null
  min_aggregate: number | null
  additional_insured_required: boolean
  waiver_required: boolean
}

export interface RequirementProfileInput {
  name: string
  lines?: RequirementLineInput[]
}

export const profilesApi = {
  list: () =>
    apiClient.get<RequirementProfile[]>('/requirement-profiles/').then((r) => r.data),
  get: (id: string) =>
    apiClient.get<RequirementProfile>(`/requirement-profiles/${id}/`).then((r) => r.data),
  create: (data: RequirementProfileInput) =>
    apiClient.post<RequirementProfile>('/requirement-profiles/', data).then((r) => r.data),
  update: (id: string, data: RequirementProfileInput) =>
    apiClient.patch<RequirementProfile>(`/requirement-profiles/${id}/`, data).then((r) => r.data),
  delete: (id: string) =>
    apiClient.delete(`/requirement-profiles/${id}/`),
}
