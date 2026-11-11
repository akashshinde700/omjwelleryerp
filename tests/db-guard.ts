import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The one thing that must never happen: a test run pointed at `omerp`, the live
 * business database. Every entry point into the suite goes through here first.
 *
 * `.env.test` is the only source of the test DATABASE_URL — the app's own `.env`
 * is never read by the harness, so there is no path where a missing override
 * silently falls back to production.
 */
export const TEST_ENV_PATH = resolve(process.cwd(), '.env.test')

/**
 * Set by tests/slot.ts once a run has claimed a slot. It is ALWAYS re-vetted by
 * assertSafeDatabaseUrl below, so an inherited or hand-set value cannot smuggle in
 * `omerp`; it can only ever name one of the disposable `omerp_test*` schemas.
 */
export const SLOT_URL_VAR = 'OMERP_TEST_DATABASE_URL'

export function loadTestEnv(): Record<string, string> {
  let raw: string
  try {
    raw = readFileSync(TEST_ENV_PATH, 'utf8')
  } catch {
    throw new Error(
      `Missing ${TEST_ENV_PATH}. Create it with a DATABASE_URL pointing at a *_test database, e.g.\n` +
        `  DATABASE_URL="mysql://root:PASSWORD@localhost:3306/omerp_test"`
    )
  }
  const env: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
    if (!m) continue
    env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  // A claimed per-run schema (omerp_test_3) wins over the base URL in .env.test, so
  // every consumer - seed, specs, the Next server under test - lands on the same schema.
  if (process.env[SLOT_URL_VAR]) env.DATABASE_URL = process.env[SLOT_URL_VAR] as string
  assertSafeDatabaseUrl(env.DATABASE_URL)
  return env
}

/** Same server/credentials as `url`, different schema. The name is vetted before it is returned. */
export function databaseUrlFor(url: string, dbName: string): string {
  assertSafeDatabaseUrl(url)
  const u = new URL(url)
  u.pathname = '/' + dbName
  assertSafeDatabaseUrl(u.toString())
  return u.toString()
}

/**
 * Throws unless the URL names a disposable test schema: `<something>_test`, optionally
 * with a numeric per-run slot suffix (`omerp_test_2`). Nothing else is ever acceptable.
 */
export const TEST_DB_NAME = /_test(_\d+)?$/
export function assertSafeDatabaseUrl(url: string | undefined): string {
  if (!url) throw new Error('.env.test has no DATABASE_URL')
  const name = new URL(url).pathname.replace(/^\//, '').split('?')[0]
  if (!name) throw new Error(`Could not read a database name out of DATABASE_URL: ${url}`)
  if (!TEST_DB_NAME.test(name)) {
    throw new Error(
      `REFUSING TO RUN: the test suite is pointed at database "${name}". ` +
        `Only a database named *_test or *_test_<n> is allowed — "omerp" holds live business data.`
    )
  }
  if (name !== name.toLowerCase()) {
    // worklog Task 46: an uppercase database name makes Prisma blind to every foreign key.
    throw new Error(`REFUSING TO RUN: database name "${name}" must be lowercase.`)
  }
  return name
}

/**
 * The server-side half of the guard. A URL check only proves what THIS process read;
 * this proves what the app process actually connected to. Every fixture firm id starts
 * `tst-` (tests/seed.ts) and no real database can produce that, so a live-data server
 * is caught before a single spec writes to it.
 */
export function assertFixtureFirmIds(ids: string[], where: string): void {
  if (ids.length && ids.every((id) => id.startsWith('tst-'))) return
  throw new Error(
    `ABORTING: the server at ${where} is NOT connected to the test database. ` +
      `GET /api/firms returned firm ids [${ids.join(', ') || 'none'}] — the fixture only ever ` +
      `contains tst-* ids. Something started that server with the live DATABASE_URL; no test will run.`
  )
}

export const TEST_DATABASE_URL = () => loadTestEnv().DATABASE_URL
