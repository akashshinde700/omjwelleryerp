/**
 * One-off cleanup: remove the test data that earlier verification runs wrote into `omerp`.
 *
 * Backup already taken:
 *   C:\Users\DELL\AppData\Local\Temp\claude\e--omjwellery-omjwellery\
 *     d5a3c5e9-177e-4b05-be9a-417d9ae8dad4\scratchpad\omerp-pre-cleanup.sql
 *
 * Run a dry run first (prints counts, deletes nothing):
 *   node cleanup-test-data.mjs
 * Then, to actually delete:
 *   node cleanup-test-data.mjs --apply
 *
 * Rule: anything created on/after 2026-09-14 is test residue, EXCEPT ledger legs that belong
 * to a surviving invoice or loan — a plain date cut would have stripped INV-1001's four legs
 * and erased your only real invoice from the books.
 *
 * Deletes nothing from Loan, Expense or Udhaar: all of those rows predate today and are real.
 */
import { PrismaClient } from '@prisma/client'

const APPLY = process.argv.includes('--apply')
const CUT = new Date('2026-09-14T00:00:00.000Z')
const db = new PrismaClient()

const keepInv = (await db.invoice.findMany({ where: { createdAt: { lt: CUT } }, select: { id: true } })).map((x) => x.id)
const keepLoan = (await db.loan.findMany({ select: { id: true } })).map((x) => x.id)
const delInv = (await db.invoice.findMany({ where: { createdAt: { gte: CUT } }, select: { id: true } })).map((x) => x.id)

// NOTE: `NOT: { field: { in: [...] } }` does NOT match rows where the field is NULL — SQL
// three-valued logic drops them. Most test legs have a NULL loanId, so the naive filter matched
// nothing. Each clause must therefore spell out the NULL case explicitly.
const ledgerDelete = {
  AND: [
    { createdAt: { gte: CUT } },
    { OR: [{ invoiceId: null }, { NOT: { invoiceId: { in: keepInv } } }] },
    { OR: [{ loanId: null }, { NOT: { loanId: { in: keepLoan } } }] },
  ],
}

console.log(APPLY ? '=== APPLYING ===' : '=== DRY RUN (nothing will be deleted) ===')
console.log('  InvoiceItem ', await db.invoiceItem.count({ where: { invoiceId: { in: delInv } } }))
console.log('  LedgerEntry ', await db.ledgerEntry.count({ where: ledgerDelete }))
console.log('  Invoice     ', delInv.length)
console.log('  StockItem   ', await db.stockItem.count({ where: { createdAt: { gte: CUT } } }))
console.log('  Customer    ', await db.customer.count({ where: { createdAt: { gte: CUT } } }))
console.log('  SystemLog   ', await db.systemLog.count({ where: { createdAt: { gte: CUT } } }))
console.log('\n  Ledger legs PRESERVED for surviving records:',
  await db.ledgerEntry.count({ where: { OR: [{ invoiceId: { in: keepInv } }, { loanId: { in: keepLoan } }] } }))
console.log('  Loans / Expenses / Udhaar: untouched (all predate the cut)')

if (APPLY) {
  const r = {}
  r.invoiceItem = await db.invoiceItem.deleteMany({ where: { invoiceId: { in: delInv } } })
  r.ledgerEntry = await db.ledgerEntry.deleteMany({ where: ledgerDelete })
  r.loanTx = await db.loanTransaction.deleteMany({ where: { createdAt: { gte: CUT } } }).catch(() => ({ count: 0 }))
  r.invoice = await db.invoice.deleteMany({ where: { id: { in: delInv } } })
  r.stockItem = await db.stockItem.deleteMany({ where: { createdAt: { gte: CUT } } })
  r.customer = await db.customer.deleteMany({ where: { createdAt: { gte: CUT } } })
  r.systemLog = await db.systemLog.deleteMany({ where: { createdAt: { gte: CUT } } })
  console.log('\nDELETED:', Object.entries(r).map(([k, v]) => `${k}=${v.count}`).join('  '))

  console.log('\n=== AFTER ===')
  console.log('  Customers', await db.customer.count(), '| Invoices', await db.invoice.count(),
    '| Ledger', await db.ledgerEntry.count(), '| Stock', await db.stockItem.count())
  console.log('  Loans', await db.loan.count(), '| Expenses', await db.expense.count(), '| Udhaar', await db.udhaar.count())
} else {
  console.log('\nRe-run with --apply to delete.')
}

await db.$disconnect()
