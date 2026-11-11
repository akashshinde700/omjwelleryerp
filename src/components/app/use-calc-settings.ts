'use client'
/**
 * The firm's calculation policy, for any screen that needs it.
 *
 * This is the "settings context" in practice: ONE React Query key (`['settings', firmId]`, the same
 * one settings.tsx writes through) parsed by the one parseCalcSettings(). Every consumer was
 * already repeating these six lines — the stock form, the item detail dialog, the item panel — and
 * a copy that drifts is a screen that prices differently from the others.
 *
 * Deliberately NOT a React Context/Provider: the data is server state, not app state. Query owns
 * the cache, the invalidation and the refetch-on-focus; a Provider on top would add a second copy
 * that can be stale while the first is fresh.
 */
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { parseCalcSettings, DEFAULT_CALC_SETTINGS, type CalcSettings } from '@/lib/stock-calc'

export function useCalcSettings(firmId: string | null | undefined): {
  settings: CalcSettings
  /** False until the firm's own rows have arrived — the defaults are in use until then. */
  loaded: boolean
} {
  const { data, isSuccess } = useQuery({
    queryKey: ['settings', firmId],
    queryFn: () => api<{ settings: { key: string; value: string }[] }>('/api/settings', { search: { firmId: firmId! } }),
    enabled: !!firmId,
  })
  return {
    settings: data ? parseCalcSettings(data.settings) : DEFAULT_CALC_SETTINGS,
    loaded: isSuccess,
  }
}
