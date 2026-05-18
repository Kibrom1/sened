import { apiClient } from './client'
import type { COIDocument } from './types'

export interface COIDocumentListItem {
  id: string
  vendor: string
  vendor_name: string
  status: COIDocument['status']
  source: 'upload' | 'magic_link'
  insured_name: string | null
  certificate_date: string | null
  created_at: string
  earliest_expiration: string | null
}

export const documentsApi = {
  list: (vendorId?: string) => {
    const params = vendorId ? { vendor: vendorId } : {}
    return apiClient
      .get<COIDocumentListItem[]>('/documents/', { params })
      .then((r) => r.data)
  },

  get: (id: string) =>
    apiClient.get<COIDocument & { file_url: string | null }>(`/documents/${id}/`).then((r) => r.data),

  upload: (vendorId: string, file: File) => {
    const form = new FormData()
    form.append('vendor', vendorId)
    form.append('file', file)
    return apiClient
      .post<COIDocument>('/documents/', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data)
  },

  confirm: (docId: string, coverages: Array<{ id: string; [key: string]: unknown }>) =>
    apiClient
      .post<COIDocument>(`/documents/${docId}/confirm/`, { coverages })
      .then((r) => r.data),

  retry: (docId: string) =>
    apiClient.post(`/documents/${docId}/retry/`).then((r) => r.data),
}
