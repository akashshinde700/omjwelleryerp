/**
 * ONE-OFF: put Jaydeep Dilip Khamkar in the customer list and attach his three bills.
 *
 * WHY THIS SCRIPT EXISTS. Until commit b9e526a, typing a party's name on a bill stored it as TEXT
 * and created no Customer, so the man had no entry in the list, no history and no balance. That is
 * fixed for every NEW transaction. These three bills predate the fix:
 *
 *     INV-1021  28 Sep  07775951999  Rs 1,49,050
 *     INV-1029  30 Sep   7775951999  Rs 1,25,784
 *     INV-1035  03 Oct    775951999  Rs 1,41,110
 *                                    Rs 4,15,944
 *
 * Three spellings of one number: a leading zero on the first, and the third is nine digits — one
 * `7` short of the other two. The owner confirmed they are the same person, so the canonical mobile
 * is 7775951999.
 *
 * It is a SCRIPT rather than a migration because it is a judgement about which real human these
 * rows belong to, not a schema change. Nothing else in the database is touched.
 *
 * SAFE TO RUN TWICE: it refuses if any of the three is already linked, or if some other customer
 * already holds that mobile. Everything happens in one transaction, so it either all lands or none
 * of it does. It writes a SystemLog row recording what was merged and why.
 *
 *   node link-jaydeep.mjs            # do it
 *   node link-jaydeep.mjs --dry-run  # show what it would do, change nothing
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const DRY = process.argv.includes('--dry-run')
const MOBILE = '7775951999'
const NOS = ['INV-1021', 'INV-1029', 'INV-1035']

const invs = await db.invoice.findMany({
  where: { invoiceNo: { in: NOS } },
  select: { id: true, invoiceNo: true, firmId: true, customerId: true, customerName: true, customerMobile: true, totalAmount: true },
  orderBy: { invoiceDate: 'asc' },
})

if (invs.length !== NOS.length) {
  console.log(`REFUSED: expected ${NOS.length} invoices, found ${invs.length}.`)
  process.exit(1)
}
const firmId = invs[0].firmId
if (!invs.every((i) => i.firmId === firmId)) {
  console.log('REFUSED: those invoices do not all belong to one firm.')
  process.exit(1)
}
const already = invs.filter((i) => i.customerId)
if (already.length) {
  console.log(`REFUSED: already linked — ${already.map((i) => i.invoiceNo).join(', ')}. Nothing to do.`)
  process.exit(1)
}
const clash = await db.customer.findFirst({ where: { firmId, mobile: MOBILE }, select: { code: true, firstName: true, lastName: true } })
if (clash) {
  console.log(`REFUSED: ${clash.code} "${clash.firstName} ${clash.lastName ?? ''}" already holds ${MOBILE}.`)
  console.log('Link the bills to that customer by hand instead — this script will not merge two records.')
  process.exit(1)
}

const total = invs.reduce((t, i) => t + Number(i.totalAmount || 0), 0)
console.log(`Firm ${firmId}`)
for (const i of invs) console.log(`  ${i.invoiceNo}  typed ${i.customerMobile}  Rs ${Number(i.totalAmount || 0).toLocaleString('en-IN')}`)
console.log(`  -> one customer on ${MOBILE}, Rs ${total.toLocaleString('en-IN')} of business\n`)

if (DRY) {
  console.log('DRY RUN — nothing written.')
  await db.$disconnect()
  process.exit(0)
}

const out = await db.$transaction(async (tx) => {
  const count = await tx.customer.count({ where: { firmId } })
  const customer = await tx.customer.create({
    data: {
      firmId,
      code: 'C' + (1001 + count), // same rule as POST /api/customers and src/lib/party.ts
      type: 'customer',
      title: 'Mr.',
      firstName: 'Jaydeep',
      lastName: 'Dilip Khamkar',
      mobile: MOBILE,
    },
  })
  // `customerId: null` in the where so a concurrent link cannot be overwritten.
  const linked = await tx.invoice.updateMany({
    where: { id: { in: invs.map((i) => i.id) }, customerId: null },
    data: { customerId: customer.id },
  })
  await tx.systemLog.create({
    data: {
      firmId,
      action: 'update',
      entity: 'customer',
      entityId: customer.id,
      details:
        `Linked ${NOS.join(', ')} to ${customer.code} "Jaydeep Dilip Khamkar" (${MOBILE}). ` +
        `The bills were typed 07775951999 / 7775951999 / 775951999 — three spellings of one number, ` +
        `confirmed by the owner as one person. Raised before party auto-linking existed (b9e526a).`,
    },
  })
  return { customer, linked: linked.count }
})

console.log(`Created ${out.customer.code} — ${out.customer.firstName} ${out.customer.lastName} (${out.customer.mobile})`)
console.log(`Linked ${out.linked} invoice${out.linked === 1 ? '' : 's'}.`)
console.log('\nHe should now appear in Customers, with all three bills under SELL in his hub.')
await db.$disconnect()
