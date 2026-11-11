'use client'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { useApp } from '@/store/app'

/** Mirrors src/app/api/_authz.ts MANAGER_ROLES/OWNER_ROLES — the lines staff and manager sit below. */
const MANAGER_ROLES = new Set(['owner', 'admin', 'manager'])
const OWNER_ROLES = new Set(['owner', 'admin'])

/**
 * The signed-in user's role in the ACTIVE firm — UserFirm.role, never the global User.role (that
 * distinction was a privilege-escalation bug elsewhere in this app). The session only carries the
 * global role; /api/firms is the one place UserFirm.role reaches the client, so this reads it
 * there directly rather than gate UI on the wrong field. Same queryKey the app shell already uses
 * for the firm switcher, so this doesn't add a request.
 */
export function useFirmRole() {
  const activeFirmId = useApp((s) => s.activeFirmId)
  const { data, isLoading } = useQuery({
    queryKey: ['firms'],
    queryFn: () => api<{ firms: { id: string; role: string }[] }>('/api/firms'),
    staleTime: 5 * 60 * 1000,
  })
  const role = data?.firms.find((f) => f.id === activeFirmId)?.role
  // Undefined while the role hasn't loaded yet, so callers can skip gating on first paint instead
  // of flashing a control disabled-then-enabled. Once loaded, an unknown/missing role is NOT manager/owner.
  return {
    role,
    isManager: isLoading ? undefined : MANAGER_ROLES.has(role || ''),
    isOwner: isLoading ? undefined : OWNER_ROLES.has(role || ''),
    loading: isLoading,
  }
}

/** Title text for a manager-only control a staff user can see but not use. */
export const MANAGER_ONLY_TITLE = 'Only the owner or a manager can do this. Ask them to do it for you.'
/** Title text for an owner-only control — a stricter line than manager (see OWNER_ROLES in _authz.ts). */
export const OWNER_ONLY_TITLE = 'Only the owner can change this. Ask them to do it for you.'
