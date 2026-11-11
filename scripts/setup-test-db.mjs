// One-time (and idempotent) setup of the isolated test database:
//   CREATE DATABASE omerp_test  ->  prisma db push  ->  seed
// Reads .env.test only, and refuses any database not named *_test.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const raw = readFileSync(new URL('../.env.test', import.meta.url), 'utf8')
const url = /^\s*DATABASE_URL\s*=\s*(.*)$/m.exec(raw)?.[1].trim().replace(/^["']|["']$/g, '')
if (!url) {
  console.error('.env.test has no DATABASE_URL')
  process.exit(1)
}

const parsed = new URL(url)
const name = parsed.pathname.replace(/^\//, '').split('?')[0]
if (!name.endsWith('_test') || name !== name.toLowerCase()) {
  console.error(`REFUSING: "${name}" is not a lowercase *_test database.`)
  process.exit(1)
}

try {
  execFileSync(
    'mysql',
    [
      `-h${parsed.hostname}`,
      `-P${parsed.port || 3306}`,
      `-u${decodeURIComponent(parsed.username)}`,
      '-e',
      `CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
    ],
    { stdio: 'inherit', env: { ...process.env, MYSQL_PWD: decodeURIComponent(parsed.password) } }
  )
} catch {
  console.error(
    `\nCould not create "${name}" with the mysql client. Create it by hand and re-run:\n` +
      `  CREATE DATABASE ${name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n`
  )
  process.exit(1)
}

const run = (args, extraEnv = {}) =>
  execFileSync('npx', args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...extraEnv },
  })

// `db push` (not `migrate deploy`): it diffs schema.prisma against the database and is
// idempotent on a schema that already has the tables. Destructive by nature, which is
// precisely why it is only ever aimed at the *_test database.
run(['prisma', 'db', 'push', '--accept-data-loss', '--skip-generate'], { DATABASE_URL: url })
run(['vite-node', 'tests/seed-cli.ts'])

console.log(`\nTest database "${name}" is ready.`)
