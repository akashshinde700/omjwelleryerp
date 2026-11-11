import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

// Unit tests only — pure functions, no database, no server. Anything that needs a
// running app lives in tests/api and tests/e2e and is run by Playwright.
export default defineConfig({
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    reporters: ['verbose'],
    // Vitest's default is 5s, and several tests here are deliberate brute-force sweeps - 100k
    // random engine inputs, 60k mixed bills, 6k reverse-billing solves, a 100-year loan replayed
    // against CYCLE_GUARD. Run alone they take 0.9-9.3s; run together on a loaded machine they
    // tip over 5s and report `STACK_TRACE_ERROR` with no assertion message, so the suite goes red
    // somewhere different each time and the number stops meaning anything. Measured on this tree:
    // three consecutive runs gave 816/1, 815/2 and 817/0, failing a DIFFERENT test each time.
    //
    // 30s is ample for the slowest sweep and still catches what these tests are actually for: a
    // genuine runaway loop blows 30s just as surely as 5s.
    testTimeout: 30_000,
  },
})
