import { claimSlot } from './slot'

/**
 * Saved NextAuth sessions, written once by tests/global-setup.ts. The directory is
 * per-slot: two concurrent runs must not read each other's half-written state file.
 */
export const AUTH_DIR = claimSlot().authDir

export const STATE = {
  /** admin/admin123 — member of firm JBS only. */
  admin: `${AUTH_DIR}/admin.json`,
  /** outsider/outsider123 — member of firm MAD only. Used to prove cross-tenant refusal. */
  outsider: `${AUTH_DIR}/outsider.json`,
}
