import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { db } from '@/lib/db'
import { dayStart, dayEnd, isDay, financialYear, ymd } from '@/lib/accounting'

/**
 * The unreconciled-items list — what a statement matcher gives you that a filtered ledger view
 * (oMunim's BANK REC) does not: two lists that should both be empty once a bank account is fully
 * reconciled for the period.
 *
 *  - unmatchedStatementLines: on the bank's own statement, but no ledger voucher was matched to
 *    it — a bank fee, interest credit, or an error never entered in the books.
 *  - unmatchedLedgerEntries: posted in the books against this bank account, but no statement line
 *    matched it — a cheque still in transit, or a payment recorded but not yet reflected by the bank.
 *
 * Both queries are bounded by [firmId, bankAccountId/accountId, date] — the same indexes
 * ledger.ts/route.ts and statement/route.ts already rely on.
 */
const querySchema = z.object({
  firmId: z.string().min(1),
  bankAccountId: z.string().min(1),
  from: z.string().refine(isDay, 'expected YYYY-MM-DD').optional(),
  to: z.string().refine(isDay, 'expected YYYY-MM-DD').optional(),
})

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query', details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, { status: 400 })
  }
  const q = parsed.data
  if (!(await verifyFirmAccess(user.id, q.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const bankAccount = await db.bankAccount.findUnique({ where: { id: q.bankAccountId } })
  if (!bankAccount || bankAccount.firmId !== q.firmId) return NextResponse.json({ error: 'Bank account not found' }, { status: 404 })

  const fy = financialYear()
  const from = q.from ? dayStart(q.from) : fy.from
  const to = q.to ? dayEnd(q.to) : fy.to
  if (from > to) return NextResponse.json({ error: '`from` is after `to`' }, { status: 400 })

  const [unmatchedStatementLines, matchedStatementLines, allStatementLines] = await Promise.all([
    db.bankStatementLine.findMany({ where: { firmId: q.firmId, bankAccountId: q.bankAccountId, date: { gte: from, lte: to }, matchedVoucherId: null }, orderBy: { date: 'asc' } }),
    db.bankStatementLine.findMany({ where: { firmId: q.firmId, bankAccountId: q.bankAccountId, date: { gte: from, lte: to }, matchedVoucherId: { not: null } }, select: { matchedVoucherId: true } }),
    db.bankStatementLine.count({ where: { firmId: q.firmId, bankAccountId: q.bankAccountId, date: { gte: from, lte: to } } }),
  ])

  let unmatchedLedgerEntries: any[] = []
  if (bankAccount.accountId) {
    const matchedVoucherIds = new Set(matchedStatementLines.map((l) => l.matchedVoucherId))
    const entries = await db.ledgerEntry.findMany({
      where: { firmId: q.firmId, accountId: bankAccount.accountId, date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
    })
    unmatchedLedgerEntries = entries.filter((e) => !e.voucherId || !matchedVoucherIds.has(e.voucherId))
  }

  return NextResponse.json({
    bankAccount,
    periodLabel: !q.from && !q.to ? fy.label : `${ymd(from)} to ${ymd(to)}`,
    statementLinesTotal: allStatementLines,
    matchedCount: matchedStatementLines.length,
    unmatchedStatementLines,
    unmatchedLedgerEntries,
    fullyReconciled: unmatchedStatementLines.length === 0 && unmatchedLedgerEntries.length === 0,
  })
}
