// `npm test` — run both runners and report both, then exit non-zero if either failed.
// Deliberately not `a && b`: a known-red unit test would otherwise hide the whole browser suite.
import { spawnSync } from 'node:child_process'

const steps = ['test:unit', 'test:pw']
const failed = steps.filter(
  (s) => spawnSync('npm', ['run', s], { stdio: 'inherit', shell: true }).status !== 0
)

if (failed.length) {
  console.error(`\nFAILED: ${failed.join(', ')}`)
  process.exit(1)
}
console.log('\nAll suites passed.')
