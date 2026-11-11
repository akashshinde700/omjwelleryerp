import { defineConfig, devices } from '@playwright/test'
import { loadTestEnv } from './tests/db-guard'
import { claimSlot } from './tests/slot'

/**
 * Every run claims a SLOT (tests/slot.ts) and owns a private schema, port, build dir,
 * auth dir and output dir for its lifetime — so two agents (or CI and a developer) can
 * run the suite at the same time without truncating each other's data mid-test.
 *
 * `loadTestEnv()` is what stands between this and `omerp`: it reads `.env.test`, applies
 * the claimed slot schema, and throws unless the result is a lowercase *_test[_n] database.
 * A dev server on 3002 is never adopted (`reuseExistingServer: false`); tests/global-setup.ts
 * additionally proves the server it started is talking to the seeded fixture, not live data.
 */
const SLOT = claimSlot()
const testEnv = loadTestEnv()

export const E2E_PORT = SLOT.port
export const BASE_URL = SLOT.baseURL

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.ts/,
  globalSetup: './tests/global-setup.ts',
  outputDir: SLOT.outputDir,
  // One worker per run: the specs share this run's single schema, so parallel workers
  // would race on invoice numbering and stock status. Concurrency is exercised inside a
  // test instead. Parallelism across RUNS is what the slot gives you.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'api', testDir: './tests/api', use: { ...devices['Desktop Chrome'] } },
    { name: 'e2e', testDir: './tests/e2e', use: { ...devices['Desktop Chrome'] } },
    // The books gate. LAST on purpose: it drives every posting path into its own firm and then
    // audits the result, so it wants the rest of the suite's writes already on disk. Its two spec
    // files run in filename order (01 posts, 02 reconciles) under this config's `workers: 1`.
    { name: 'books', testDir: './tests/books', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `npx next dev -p ${SLOT.port}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...testEnv,
      NEXTAUTH_URL: BASE_URL,
      NODE_ENV: 'development',
      // Private build dir: two Next dev servers sharing one would corrupt each other's output.
      NEXT_DIST_DIR: SLOT.distDir,
    },
  },
})
