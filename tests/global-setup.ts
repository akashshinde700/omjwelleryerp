import { chromium, request, type FullConfig } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { ensureTestSchema, seedTestDb, FIX } from './seed'
import { AUTH_DIR, STATE } from './auth'
import { assertFixtureFirmIds, loadTestEnv } from './db-guard'
import { claimSlot } from './slot'

/**
 * Bring the test schema up to date before every run. The app's schema moves under us
 * (a colleague adds a column mid-sprint) and a drifted test database produces a 500
 * that looks exactly like a product bug.
 *
 * `db push` only — deliberately NOT `migrate deploy` first. A slot schema is reused across
 * runs, so yesterday's push has already created today's tables; a new migration file then
 * dies on "Table 'hallmarkbatch' already exists" (P3018/1050) and blocks every run. push
 * diffs schema.prisma against the live schema and is idempotent. Whether the MIGRATIONS
 * apply cleanly is a different question and belongs to a migration check against a blank
 * database, not to the test harness. `db push` is destructive by nature, which is exactly
 * why it is only ever handed the db-guard-vetted *_test URL.
 */
function syncTestSchema(DATABASE_URL: string) {
  execFileSync('npx', ['prisma', 'db', 'push', '--accept-data-loss', '--skip-generate'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, DATABASE_URL },
  })
}

/** Log in through the real login screen once per role and keep the session cookie. */
async function saveSession(baseURL: string, loginId: string, password: string, file: string) {
  const browser = await chromium.launch()
  const page = await browser.newPage({ baseURL })
  await page.goto('/')
  await page.locator('#loginId').fill(loginId)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: /sign in|login/i }).click()
  // The SPA swaps the login screen for the app shell; the login field going away proves it took.
  await page.waitForSelector('#loginId', { state: 'detached', timeout: 45_000 })
  await page.context().storageState({ path: file })
  await browser.close()
}

/**
 * The last line of defence, and the one that matters: prove the SERVER the specs are about
 * to write to is on the seeded fixture. Config-level URL checks only vet what this process
 * reads — this checks what the app actually connected to. Every fixture firm id starts
 * `tst-`; a real database cannot produce that.
 */
async function assertServerOnTestDatabase(baseURL: string) {
  const ctx = await request.newContext({ baseURL, storageState: STATE.admin })
  try {
    const res = await ctx.get('/api/firms')
    const firms = res.ok() ? (await res.json()).firms : []
    assertFixtureFirmIds((firms ?? []).map((f: { id: string }) => f.id), baseURL)
  } finally {
    await ctx.dispose()
  }
}

export default async function globalSetup(config: FullConfig) {
  const slot = claimSlot()
  const DATABASE_URL = loadTestEnv().DATABASE_URL
  if (DATABASE_URL !== slot.databaseUrl) {
    throw new Error(`ABORTING: slot ${slot.index} expected ${slot.databaseUrl} but the harness resolved ${DATABASE_URL}.`)
  }
  await ensureTestSchema(DATABASE_URL)
  syncTestSchema(DATABASE_URL)
  await seedTestDb()
  mkdirSync(AUTH_DIR, { recursive: true })
  const baseURL = config.projects[0]?.use?.baseURL || slot.baseURL
  await saveSession(baseURL, FIX.admin.loginId, FIX.admin.password, STATE.admin)
  await saveSession(baseURL, FIX.outsider.loginId, FIX.outsider.password, STATE.outsider)
  await assertServerOnTestDatabase(baseURL)
}
