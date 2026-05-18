import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import type { User } from '@/api/types'

export function useMe() {
  return useQuery<User>({
    queryKey: ['me'],
    queryFn: () => apiClient.get<User>('/me/').then((r) => r.data),
    staleTime: 60_000,
  })
}
