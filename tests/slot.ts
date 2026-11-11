import { spawnSync } from 'node:child_process'
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs'
import { resolve } from 'node:path'
import { databaseUrlFor, loadTestEnv, SLOT_URL_VAR } from './db-guard'

/**
 * Two agents running `npm run test:api` at the same time used to destroy each other:
 * one schema, one port, one `.next-test` dir, one `tests/.auth`. A run now CLAIMS a
 * numbered slot and owns everything about it for its lifetime.
 *
 *   slot 2  ->  schema omerp_test_2 | port 3112 | .next-test-2 | tests/.auth/slot-2
 *
 * The claim is an exclusive lock file (O_EXCL) holding the owning pid. A lock whose pid
 * is gone is stale and gets stolen, so a killed run does not wedge a slot forever.
 * A slot is only taken if its port is also free, so a stray leftover server costs one
 * slot instead of blocking every run.
 */
export const SLOT_COUNT = Number(process.env.OMERP_TEST_SLOTS || 4)
export const PORT_BASE = Number(process.env.OMERP_TEST_PORT_BASE || 3110)
const LOCK_DIR = resolve(process.cwd(), 'tests/.locks')

export type Slot = {
  index: number
  databaseUrl: string
  port: number
  baseURL: string
  distDir: string
  authDir: string
  outputDir: string
}

function describe(index: number): Slot {
  const baseUrl = loadTestEnvBaseUrl()
  const port = PORT_BASE + index
  return {
    index,
    databaseUrl: databaseUrlFor(baseUrl, `${dbName(baseUrl)}_${index}`),
    port,
    baseURL: `http://localhost:${port}`,
    distDir: `.next-test-${index}`,
    authDir: resolve(process.cwd(), 'tests/.auth', `slot-${index}`),
    outputDir: resolve(process.cwd(), 'test-results', `slot-${index}`),
  }
}

/** The base URL from .env.test, ignoring any slot override already in the environment. */
function loadTestEnvBaseUrl(): string {
  const saved = process.env[SLOT_URL_VAR]
  delete process.env[SLOT_URL_VAR]
  try {
    return loadTestEnv().DATABASE_URL
  } finally {
    if (saved) process.env[SLOT_URL_VAR] = saved
  }
}

const dbName = (url: string) => new URL(url).pathname.replace(/^\//, '').split('?')[0]

function pidAlive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Sync, because a Playwright config cannot await. One short child process per check. */
function portFree(port: number) {
  const probe = `const s=require('net').createServer();s.once('error',()=>process.exit(1));s.listen(${port},'127.0.0.1',()=>s.close(()=>process.exit(0)))`
  return spawnSync(process.execPath, ['-e', probe]).status === 0
}

function tryClaim(index: number): Slot | null {
  const lock = resolve(LOCK_DIR, `slot-${index}.lock`)
  let fd: number
  try {
    fd = openSync(lock, 'wx')
  } catch {
    const owner = Number(readFileSync(lock, 'utf8').split(/\s/)[0])
    if (!owner || pidAlive(owner)) return null
    rmSync(lock, { force: true }) // stale: the run that held it is dead
    return tryClaim(index)
  }
  writeSync(fd, `${process.pid} ${new Date().toISOString()}\n`)
  closeSync(fd)
  const slot = describe(index)
  if (!portFree(slot.port)) {
    rmSync(lock, { force: true })
    return null
  }
  process.on('exit', () => rmSync(lock, { force: true }))
  return slot
}

const sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

/**
 * Claim a slot for this run, or reuse the one this process tree already holds
 * (Playwright re-evaluates the config in every worker — those must not claim a second slot).
 */
export function claimSlot(waitMs = 10 * 60_000): Slot {
  const inherited = Number(process.env.OMERP_TEST_SLOT)
  if (inherited) return describe(inherited)

  mkdirSync(LOCK_DIR, { recursive: true })
  const deadline = Date.now() + waitMs
  for (;;) {
    for (let i = 1; i <= SLOT_COUNT; i++) {
      const slot = tryClaim(i)
      if (!slot) continue
      process.env.OMERP_TEST_SLOT = String(slot.index)
      process.env[SLOT_URL_VAR] = slot.databaseUrl
      process.env.OMERP_TEST_PORT = String(slot.port)
      console.log(`[slot ${slot.index}] ${dbName(slot.databaseUrl)} on ${slot.baseURL}`)
      return slot
    }
    if (Date.now() > deadline) {
      throw new Error(
        `All ${SLOT_COUNT} test slots are busy (tests/.locks). Wait for a run to finish, ` +
          `raise OMERP_TEST_SLOTS, or delete a lock whose process is gone.`
      )
    }
    sleep(1000)
  }
}
