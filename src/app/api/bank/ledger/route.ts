import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { db } from '@/lib/db'
import { dayStart, dayEnd, isDay, financialYear, ymd } from '@/lib/accounting'

/**
 * The filtered per-account ledger view oMunim's own BANK REC screen is — Start Date / End Date /
 * Select Bank, four presentations (Bank View, Normal View, Cr Wise List, Dr Wise List). All four
 * are the SAME entries array; the presentation is sorting/filtering done client-side, so this is
 * one query, not four.
 *
 * `openingBalance` is the account's inception opening (Account.openingBalance) plus every posted
 * movement strictly before `from` — same construction as src/lib/accounting.ts buildStatements,
 * scoped to one account instead of the whole chart. Entries are a bounded, paged window; a running
 * balance is only exact if the client folds over every page it has fetched in order, same caveat
 * src/app/api/ledger/route.ts already documents for the day book / journal screens.
 */
const querySchema = z.object({
  firmId: z.string().min(1),
  bankAccountId: z.string().min(1),
  from: z.string().refine(isDay, 'expected YYYY-MM-DD').optional(),
  to: z.string().refine(isDay, 'expected YYYY-MM-DD').optional(),
  limit: z.coerce.number().int().min(1).max(500).default(500),
  skip: z.coerce.number().int().min(0).default(0),
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
  if (!bankAccount.accountId) return NextResponse.json({ bankAccount, openingBalance: 0, entries: [], entriesTotal: 0, periodLabel: '' })

  const fy = financialYear()
  const from = q.from ? dayStart(q.from) : fy.from
  const to = q.to ? dayEnd(q.to) : fy.to
  if (from > to) return NextResponse.json({ error: '`from` is after `to`' }, { status: 400 })

  const [account, openingAgg, entries, entriesTotal] = await Promise.all([
    db.account.findUnique({ where: { id: bankAccount.accountId } }),
    db.ledgerEntry.aggregate({ where: { firmId: q.firmId, accountId: bankAccount.accountId, date: { lt: from } }, _sum: { debit: true, credit: true } }),
    db.ledgerEntry.findMany({
      where: { firmId: q.firmId, accountId: bankAccount.accountId, date: { gte: from, lte: to } },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }], take: q.limit, skip: q.skip,
    }),
    db.ledgerEntry.count({ where: { firmId: q.firmId, accountId: bankAccount.accountId, date: { gte: from, lte: to } } }),
  ])

  const inceptionOpening = account ? (account.balanceType === 'credit' ? -Number(account.openingBalance || 0) : Number(account.openingBalance || 0)) : 0
  const movementOpening = Number(openingAgg._sum.debit || 0) - Number(openingAgg._sum.credit || 0)
  const openingBalance = inceptionOpening + movementOpening

  return NextResponse.json({
    bankAccount,
    openingBalance,
    entries,
    entriesTotal,
    entriesLimit: q.limit,
    entriesSkip: q.skip,
    periodLabel: !q.from && !q.to ? fy.label : `${ymd(from)} to ${ymd(to)}`,
  })
}
