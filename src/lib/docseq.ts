import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

/**
 * Race-free visible numbers (ORD-1001, REP-1001, QT-1001) for orders, repairs and quotations.
 *
 * These used `count(*) + 1`, which two concurrent POSTs both read - same number twice, and a number
 * reissued after a delete. They now use the SAME InvoiceSequence (firmId, type) row-lock counter as
 * invoices and receipts (allocateInvoiceNo() in src/app/api/invoices/route.ts): one atomic
 * `INSERT ... ON DUPLICATE KEY UPDATE seq = seq + 1`. No schema change - `type` is free text.
 *
 * First use for a firm seeds the row (outside the transaction - see the note in the function) from the highest number already issued in that series, so a firm
 * that already has ORD-1001 gets ORD-1002 next (visible number = 1000 + seq, as everywhere else).
 *
 * Call it INSIDE the document's own transaction: the row lock is held until commit, so numbers are
 * gapless (a rolled-back document gives its number back) and the next caller simply waits.
 */
export type DocSeries = 'order' | 'repair' | 'quotation'

const SERIES = {
  order: { table: '`Order`', col: 'orderNo', re: '^(ORD)-[0-9]{1,9}$' },
  repair: { table: '`Repair`', col: 'repairNo', re: '^(REP)-[0-9]{1,9}$' },
  // QT and EST share one counter (they always did: both counted the firm's whole quotation table).
  quotation: { table: '`Quotation`', col: 'quoteNo', re: '^(QT|EST)-[0-9]{1,9}$' },
} as const

export async function nextDocSeq(tx: Prisma.TransactionClient, firmId: string, series: DocSeries): Promise<number> {
  const s = SERIES[series]
  const type = `doc-${series}`

  // 1. First use only: seed the row from the highest number already issued. Done with plain
  //    (non-locking) reads and an autocommitted INSERT IGNORE on the pool, NOT inside `tx`: an
  //    INSERT ... SELECT over the document table takes next-key locks that deadlock against
  //    concurrent document inserts (seen as MySQL 1213 under 10 parallel POSTs).
  const have = await db.$queryRaw<{ seq: number | bigint }[]>(Prisma.sql`
    SELECT seq FROM InvoiceSequence WHERE firmId = ${firmId} AND type = ${type}
  `)
  if (!have.length) {
    const top = await db.$queryRaw<{ n: number | bigint | null }[]>(Prisma.sql`
      SELECT MAX(CAST(SUBSTRING_INDEX(${Prisma.raw(s.col)}, '-', -1) AS UNSIGNED)) AS n
        FROM ${Prisma.raw(s.table)}
       WHERE firmId = ${firmId} AND ${Prisma.raw(s.col)} REGEXP ${s.re}
    `)
    const base = Math.max(Number(top[0]?.n ?? 1000), 1000) - 1000 // 1001 already issued -> seq 1 already used
    await db.$executeRaw(Prisma.sql`
      INSERT IGNORE INTO InvoiceSequence (firmId, type, seq) VALUES (${firmId}, ${type}, ${base})
    `)
  }

  // 2. The atomic increment, inside the caller's transaction: the row lock is held until commit.
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO InvoiceSequence (firmId, type, seq) VALUES (${firmId}, ${type}, 1)
    ON DUPLICATE KEY UPDATE seq = seq + 1
  `)
  const rows = await tx.$queryRaw<{ seq: number | bigint }[]>(Prisma.sql`
    SELECT seq FROM InvoiceSequence WHERE firmId = ${firmId} AND type = ${type}
  `)
  return 1000 + Number(rows[0].seq)
}
