/**
 * Perf rig environment. Its own schema (`omerp_perf_test`) and its own port, so a volume seed
 * never lands in `omerp` and never fights a test slot (3111-3114) or the dev server (3002).
 * The URL goes through the same db-guard as the test harness: *_test only, lowercase only.
 */
import { assertSafeDatabaseUrl, databaseUrlFor, loadTestEnv } from '../db-guard'

// Credentials come from .env.test (git-ignored), never from source.
export const PERF_DATABASE_URL =
  process.env.OMERP_PERF_DATABASE_URL || databaseUrlFor(loadTestEnv().DATABASE_URL, 'omerp_perf_test')
assertSafeDatabaseUrl(PERF_DATABASE_URL)

export const PERF_PORT = Number(process.env.OMERP_PERF_PORT || 3120)
export const PERF_BASE = `http://localhost:${PERF_PORT}`

export const PERF = {
  firm: { id: 'pf-firm-1', code: 'PFA', name: 'Perf Jewellers' },
  otherFirm: { id: 'pf-firm-2', code: 'PFB', name: 'Other Perf Jewellers' },
  admin: { id: 'pf-user-admin', loginId: 'admin', password: 'admin123' },
  counts: { customers: 5000, stock: 10000, invoices: 20000, loans: 2000, ledger: 50000 },
} as const
