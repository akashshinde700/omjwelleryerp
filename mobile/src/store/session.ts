import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

// The per-FIRM role (UserFirm.role, e.g. 'owner' | 'manager' | 'staff') — never the global
// User.role, which grants nothing server-side (src/lib/pii.ts, src/app/api/_authz.ts). Mirrors
// MANAGER_ROLES in src/app/api/_authz.ts: a role outside this set gets a 403 from every destructive
// route (delete stock/customer/expense/udhaar/invoice, loan status change, loan top-up, stock
// transfer approval). Screens use this to hide what the server will refuse, not to enforce it —
// the enforcement is, and stays, server-side.
const MANAGER_ROLES = new Set(['owner', 'admin', 'manager'])
export function canManage(role: string | null | undefined): boolean {
  return MANAGER_ROLES.has(role || '')
}

type SessionState = {
  token: string | null
  user: { name: string; email?: string } | null
  firmId: string | null
  /** UserFirm.role for the active firm — set alongside firmId by FirmsScreen. */
  role: string | null
  baseURL: string
  setToken: (t: string | null) => void
  setUser: (u: { name: string; email?: string } | null) => void
  setFirm: (id: string, role?: string | null) => void
  setBaseURL: (u: string) => void
  logout: () => void
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      firmId: null,
      role: null,
      baseURL: 'http://localhost:3000',
      setToken: (t) => set({ token: t }),
      setUser: (u) => set({ user: u }),
      setFirm: (id, role) => set({ firmId: id, role: role ?? null }),
      setBaseURL: (u) => set({ baseURL: u }),
      logout: () => set({ token: null, user: null, firmId: null, role: null }),
    }),
    { name: 'omgold-session', storage: createJSONStorage(() => AsyncStorage) }
  )
)
