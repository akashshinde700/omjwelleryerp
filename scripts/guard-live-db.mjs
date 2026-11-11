// Stands in front of `db:push --accept-data-loss`, `db:migrate` and `db:reset`.
// Those three are one word away from destroying the customer's live records, so they
// now refuse to run against a database that is not explicitly marked as disposable.
//
//   ALLOW_DESTRUCTIVE_DB=1 npm run db:reset   <- the deliberate escape hatch
import { readFileSync } from 'node:fs'

const DISPOSABLE = /_test$|_scratch$|_dev$/

function currentUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  try {
    const raw = readFileSync(new URL('../.env', import.meta.url), 'utf8')
    return /^\s*DATABASE_URL\s*=\s*(.*)$/m.exec(raw)?.[1].trim().replace(/^["']|["']$/g, '')
  } catch {
    return undefined
  }
}

const url = currentUrl()
if (!url) {
  console.error('guard-live-db: no DATABASE_URL found — refusing to run a destructive Prisma command.')
  process.exit(1)
}

const name = new URL(url).pathname.replace(/^\//, '').split('?')[0]

if (process.env.ALLOW_DESTRUCTIVE_DB === '1') {
  console.warn(`guard-live-db: ALLOW_DESTRUCTIVE_DB=1 — proceeding against "${name}". Hope you meant it.`)
  process.exit(0)
}

if (!DISPOSABLE.test(name)) {
  console.error(
    `\nguard-live-db: REFUSING to run a destructive Prisma command against "${name}".\n` +
      `  That database holds live business data (customers, invoices, loans, ledger).\n` +
      `  If you are certain, re-run with ALLOW_DESTRUCTIVE_DB=1.\n` +
      `  For tests use the isolated database instead:  npm run test:db:setup\n`
  )
  process.exit(1)
}

console.log(`guard-live-db: "${name}" is disposable — continuing.`)
