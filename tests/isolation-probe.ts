/**
 * Re-proves the defect this harness was built to kill: two runs seeding at the same time
 * used to truncate each other's data mid-read (a probe read 70 rows, then 0). Run it TWICE
 * AT ONCE — each copy claims its own slot and must never see the other's wipe:
 *
 *   npm run test:isolation & npm run test:isolation & wait
 *
 * Exits non-zero if any read came back with anything other than the fixture's own counts.
 */
import { claimSlot } from './slot'
import { seedTestDb, testPrisma } from './seed'

const slot = claimSlot()
const db = testPrisma()
let clobbered = 0

for (let round = 1; round <= 6; round++) {
  await seedTestDb()
  for (let i = 0; i < 12; i++) {
    const [customers, firms] = await Promise.all([db.customer.count(), db.firm.count()])
    if (customers !== 7 || firms !== 2) {
      clobbered++
      console.log(`slot ${slot.index} round ${round}: read ${customers} customers / ${firms} firms — CLOBBERED`)
    }
    await new Promise((r) => setTimeout(r, 50))
  }
  console.log(`slot ${slot.index} round ${round}: 12 reads, all 7 customers / 2 firms`)
}

await db.$disconnect()
console.log(clobbered ? `slot ${slot.index} FAIL: ${clobbered} clobbered reads` : `slot ${slot.index} PASS: no read was clobbered`)
process.exit(clobbered ? 1 : 0)
