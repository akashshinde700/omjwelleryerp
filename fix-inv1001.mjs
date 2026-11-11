/**
 * INV-1001 correction — run with:  node fix-inv1001.mjs
 *
 * WHAT IS WRONG
 * The invoice stores a total of 289900. Its own components come to 288400:
 *   285000 subtotal − 5000 discount = 280000 taxable, + 4200 CGST + 4200 SGST = 288400.
 * The ledger looks healthy and is not: Sundry Debtors Dr 289900 against Sales Revenue
 * Cr 281500 + CGST 4200 + SGST 4200. It balances only because Sales Revenue was padded
 * by exactly the missing 1500 — a plug line. The row was written straight into the
 * database by prisma/seed.ts, bypassing postVoucher, so nothing ever checked it.
 *
 * Net effect while it stands: the P&L overstates sales by 1500, and the customer appears
 * to owe 1500 more than his own bill supports.
 *
 * WHAT THIS DOES
 * Writes a JSON backup of the invoice and its four legs, then in ONE transaction moves
 * the invoice to 288400, Sundry Debtors to 288400 and Sales Revenue to 280000. Balanced
 * before, balanced after. It prints the whole book's debit/credit totals at the end so
 * you can see nothing else shifted.
 *
 * prisma/seed.ts is already corrected, so a fresh database never has this problem.
 */
import { PrismaClient } from '@prisma/client'
import { writeFileSync, mkdirSync } from 'fs'
const db = new PrismaClient()

const inv = await db.invoice.findFirst({ where: { invoiceNo: 'INV-1001' }, include: { items: true } })
if (!inv) { console.log('No INV-1001 in this database — nothing to do.'); await db.$disconnect(); process.exit(0) }
const legs = await db.ledgerEntry.findMany({ where: { invoiceId: inv.id }, orderBy: { id: 'asc' } })

mkdirSync('.zscripts-backup', { recursive: true })
const backup = `.zscripts-backup/inv1001-before-${Date.now()}.json`
writeFileSync(backup, JSON.stringify({ invoice: inv, legs }, null, 2))
console.log('backup written:', backup)

const taxable = inv.subtotal - inv.discount                // 280000
const total = taxable + inv.cgst + inv.sgst + inv.igst     // 288400

console.log(`\ninvoice total ${inv.totalAmount} -> ${total}`)
for (const l of legs) console.log(`  before: ${l.accountName} dr ${l.debit} cr ${l.credit}`)

await db.$transaction(async (tx) => {
  await tx.invoice.update({ where: { id: inv.id }, data: { totalAmount: total, amountByCash: total, taxableValue: taxable } })
  // THE LINE TOO, or the bill still disagrees with itself. The seed wrote one item carrying the
  // UNDISCOUNTED 285000 and zero tax, while the header carried the 5000 discount and the 8400 GST.
  // The GST Sell Report builds its rows from items, so that bill prints as UNRECONCILED until the
  // item says what the bill says: taxable 280000 + 4200 + 4200 = 288400.
  const share = inv.items.length === 1 ? inv.items[0] : null
  if (share) {
    await tx.invoiceItem.update({
      where: { id: share.id },
      // discountAmount stays 0: the 5,000 is a BILL-LEVEL discount and `amount` already reflects it.
      // Stamping it on the line too makes TOTAL DISC (header discount + line discounts) count it twice.
      data: { amount: taxable, cgst: inv.cgst, sgst: inv.sgst, igst: inv.igst, total },
    })
  }
  for (const l of legs) {
    if (l.accountName === 'Sundry Debtors') {
      await tx.ledgerEntry.update({ where: { id: l.id }, data: { debit: total } })
    } else if (l.accountName === 'Sales Revenue') {
      await tx.ledgerEntry.update({ where: { id: l.id }, data: { credit: taxable } })
    }
  }
})

const item = await db.invoiceItem.findFirst({ where: { invoiceId: inv.id } })
console.log(`
  line after: amount ${item?.amount} cgst ${item?.cgst} sgst ${item?.sgst} total ${item?.total}`)
const after = await db.ledgerEntry.findMany({ where: { invoiceId: inv.id }, orderBy: { id: 'asc' } })
for (const l of after) console.log(`  after:  ${l.accountName} dr ${l.debit} cr ${l.credit}`)
const dr = after.reduce((s, l) => s + l.debit, 0)
const cr = after.reduce((s, l) => s + l.credit, 0)
console.log('\nthis voucher balanced:', dr === cr, `${dr} / ${cr}`)

const agg = await db.ledgerEntry.aggregate({ _sum: { debit: true, credit: true } })
console.log('WHOLE BOOK balanced:', agg._sum.debit === agg._sum.credit, `${agg._sum.debit} / ${agg._sum.credit}`)
await db.$disconnect()
