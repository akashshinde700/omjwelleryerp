import { NextResponse } from 'next/server'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { MANAGER_ROLES, denyForeignCustomer, denyUnlessRole } from '@/app/api/_authz'
import { db } from '@/lib/db'
import { z } from 'zod'
import { postVoucher, reverseVoucher, LedgerError, VOUCHER_TYPES } from '@/lib/ledger'
import { buildStatements, financialYear, dayStart, dayEnd, isDay, ymd, metalSchemePosition, metalSchemeDisclosure, normAccountName } from '@/lib/accounting'
import { round2 } from '@/lib/gst'

/**
 * GET returns two independent things, and they must stay independent:
 *
 *  - `entries`: a bounded, paged window of legs for the day book / ledger screens.
 *  - the statements (`trialBalance`, `profitLoss`, …): summed in SQL over the whole date range by
 *    src/lib/accounting.ts.
 *
 * Before this, the statements were aggregated in JavaScript over the SAME `take: 500` window, so a
 * shop crossed the cap in about 25 trading days and every statement quietly went wrong: opening
 * balances were counted in full while movements were truncated mid-voucher. A statement figure must
 * never be derived from the paged list — that is the whole point of the split below.
 *
 * `type` likewise filters ONLY the entries list. Filtering legs by voucher type before a trial
 * balance guarantees it cannot tie: you keep the cash leg of a sale and drop the revenue leg.
 */
const querySchema = z.object({
  firmId: z.string().min(1, 'firmId required'),
  /** Inclusive YYYY-MM-DD range. Defaults to the current Indian financial year (1 Apr – 31 Mar). */
  from: z.string().refine(isDay, 'expected YYYY-MM-DD').optional(),
  to: z.string().refine(isDay, 'expected YYYY-MM-DD').optional(),
  /** Entries list only — never reaches the statements. */
  type: z.enum(VOUCHER_TYPES).optional(),
  /**
   * Fetch ONE voucher's legs. Entries list only, like `type`.
   *
   * Without it the only way to see a voucher is to page a date-ordered list and filter client-side,
   * which silently stops working the moment the book grows past `limit`: the list is newest-first
   * and capped at 200 by default, so an older voucher simply is not in the response and the caller
   * concludes it has no legs. That is not hypothetical — it is exactly how the auction and payment
   * specs started reporting ₹0 for legs that were posted correctly, once other work added invoices
   * ahead of them in the same book.
   */
  voucherId: z.string().min(1).optional(),
  /**
   * ONE account's legs — the general ledger the screens never had. Entries list only, like `type`
   * and `voucherId`: a trial balance built from one account's legs cannot tie, by definition.
   *
   * THE VALUE IS AN ACCOUNT NAME, never an accountId. Passing an id returns an empty 200, which on
   * this screen reads as "this account has no money in it" — so the caller must send the name the
   * trial-balance row shows (accounting.tsx passes `r.name`). Resolving ids too would mean matching
   * a caller-supplied id against the chart of accounts, and name-only is what keeps this free of an
   * existence oracle for another firm's ids.
   *
   * The legs are then matched exactly as buildStatements() buckets that row (keyOf(),
   * src/lib/accounting.ts): by accountId when the leg has one, by normalised name otherwise (see
   * accountWhere below). The drill-down must show the same legs as the trial-balance row it was
   * opened from, or it reads as missing money.
   */
  account: z.string().trim().min(1).max(191).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  skip: z.coerce.number().int().min(0).default(0),
  /**
   * Balance-sheet notes. Opt-in because they are four aggregate queries that only the balance sheet
   * wants — the day book, the ledger and the GST screens all read this same endpoint and must not
   * pay for them. See metalSchemePosition() in src/lib/accounting.ts for what is disclosed and why
   * it is a note rather than a revaluation.
   */
  notes: z.enum(['1', 'true']).optional(),
  /**
   * The day book's sales tender mix — how customers actually paid, summed from `Invoice`.
   *
   * Opt-in for the same reason `notes` is: it is an extra aggregate that only the day book wants,
   * and the ledger, journal and GST screens read this endpoint too.
   *
   * THIS IS NOT THE LEDGER AND MUST NEVER BE ADDED TO IT. The till block beside it (tillSummary(),
   * src/lib/accounting.ts) is what moved through cash/bank/cheques in THIS range; this is how the
   * bills DATED in this range were paid. They legitimately differ: a receipt collected today
   * against last month's bill moves the ledger today and sits in last month's tender mix, and a
   * credit sale is billed with no tender at all. Card and UPI appear here, and only here, because
   * `Invoice.amountByCard` / `amountByUPI` is the only place that distinction is recorded — the
   * ledger posts both to the bank account and tags the leg in text (invoices/route.ts:614).
   */
  tender: z.enum(['1', 'true']).optional(),
})

/**
 * Σ of the tender columns on the bills dated in the range, per invoice type.
 *
 * `deleted` bills are excluded — a deleted bill's tender is not money. `returned` ones are kept:
 * the tender was genuinely taken when the bill was raised, and the refund shows as its own
 * sale-return row rather than by quietly erasing the original.
 *
 * `amountByGold` is summed but NEVER counted as tender: old gold taken in exchange is metal, not
 * money across the counter. It is returned so the screen can account for the gap between what was
 * billed and what was tendered instead of leaving the reader to wonder.
 */
async function salesTenderMix(firmId: string, from: Date, to: Date) {
  const rows = await db.invoice.groupBy({
    by: ['type'],
    where: { firmId, type: { in: ['sale', 'sale-return'] }, status: { not: 'deleted' }, invoiceDate: { gte: from, lte: to } },
    _sum: { amountByCash: true, amountByCard: true, amountByUPI: true, amountByCheque: true, amountByGold: true, totalAmount: true },
    _count: { _all: true },
  })
  const fold = (type: string) => {
    const r = rows.find((x) => x.type === type)
    const n = (v: number | null | undefined) => round2(Number(v) || 0)
    const cash = n(r?._sum.amountByCash), card = n(r?._sum.amountByCard)
    const upi = n(r?._sum.amountByUPI), cheque = n(r?._sum.amountByCheque)
    return {
      cash, card, upi, cheque,
      tendered: round2(cash + card + upi + cheque),
      gold: n(r?._sum.amountByGold),
      billed: n(r?._sum.totalAmount),
      invoices: Number(r?._count?._all) || 0,
    }
  }
  return { sale: fold('sale'), saleReturn: fold('sale-return') }
}

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const raw = Object.fromEntries(searchParams)
  if (raw.type === 'all' || raw.type === '') delete raw.type
  // An empty `account=` is "no account chosen", not a zero-length account name. Same courtesy the
  // line above pays `type`, and it keeps a hand-built URL off a 400 that tells it nothing useful.
  if (raw.account === '') delete raw.account
  const parsed = querySchema.safeParse(raw)
  if (!parsed.success) {
    const firstIsFirm = parsed.error.issues.some((i) => i.path[0] === 'firmId')
    return NextResponse.json({
      error: firstIsFirm ? 'firmId required' : 'Invalid query',
      details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    }, { status: 400 })
  }
  const q = parsed.data
  if (!(await verifyFirmAccess(user.id, q.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const fy = financialYear()
  const from = q.from ? dayStart(q.from) : fy.from
  const to = q.to ? dayEnd(q.to) : fy.to
  if (from > to) return NextResponse.json({ error: '`from` is after `to`' }, { status: 400 })

  // WHICH LEGS BELONG TO THE CLICKED ACCOUNT = the legs buildStatements() puts in that trial-balance
  // row, i.e. keyOf(leg) === norm(account). keyOf resolves a leg by its accountId first (so a renamed
  // account keeps its history) and only falls back to the accountName STRING when the leg has no
  // usable id. A bare `accountName = X OR accountId = X.id` is not that: it also drags in the legs of
  // a DIFFERENT account that used to be called X (rename, then reuse of the old name) and misses legs
  // whose stored name differs from X only in inner whitespace, which postVoucher keeps verbatim.
  // Firm-scoped: an account name is user input and must not reach another firm's legs.
  let accountWhere = {}
  if (q.account) {
    const key = normAccountName(q.account)
    const accounts = await db.account.findMany({ where: { firmId: q.firmId }, select: { id: true, name: true } })
    const ownIds = accounts.filter((a) => normAccountName(a.name) === key).map((a) => a.id)
    const allIds = accounts.map((a) => a.id)
    const unresolved = { OR: [{ accountId: null }, { accountId: { notIn: allIds } }] }
    const names = await db.ledgerEntry.groupBy({ by: ['accountName'], where: { firmId: q.firmId, date: { gte: from, lte: to }, ...unresolved } })
    const variants = [...new Set([q.account, ...names.map((n) => n.accountName).filter((n) => normAccountName(n) === key)])]
    accountWhere = { OR: [
      ...(ownIds.length ? [{ accountId: { in: ownIds } }] : []),
      { AND: [unresolved, { accountName: { in: variants } }] },
    ] }
  }

  // voucherId still carries firmId and the date window: a voucher id is opaque, but it must never
  // become a way to read another firm's legs by guessing one.
  const entryWhere = {
    firmId: q.firmId,
    date: { gte: from, lte: to },
    ...(q.type ? { type: q.type } : {}),
    ...(q.voucherId ? { voucherId: q.voucherId } : {}),
    ...accountWhere,
  }
  const [statements, entries, entriesTotal, metalSchemes, tenderMix] = await Promise.all([
    buildStatements(db, { firmId: q.firmId, from, to }),
    db.ledgerEntry.findMany({ where: entryWhere, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: q.limit, skip: q.skip }),
    db.ledgerEntry.count({ where: entryWhere }),
    q.notes ? metalSchemePosition(db, q.firmId) : Promise.resolve(null),
    q.tender ? salesTenderMix(q.firmId, from, to) : Promise.resolve(null),
  ])

  return NextResponse.json({
    ...statements,
    // How the bills dated in this range were paid. Beside the statements, never part of them.
    ...(tenderMix ? { tenderMix } : {}),
    // A gram obligation the rupee deposits on the balance sheet do not state. Disclosed, never
    // revalued — the figure is a position, not a valuation, and it carries no rupee number at all.
    ...(metalSchemes ? { notes: { metalSchemes, disclosure: metalSchemeDisclosure(metalSchemes) } } : {}),
    periodLabel: !q.from && !q.to ? fy.label : `${ymd(from)} to ${ymd(to)}`,
    entries,
    entriesTotal,
    entriesLimit: q.limit,
    entriesSkip: q.skip,
    /** Echoed so a drill-down can prove which account it is showing, and tests can assert it. */
    entriesAccount: q.account ?? null,
  })
}

// ───────────────────────── POST: vouchers ─────────────────────────
// The only way to write a ledger row by hand: a balanced voucher (receipt / payment / contra /
// journal), or a dated reversal of one. Validation of the double entry itself lives in
// src/lib/ledger.ts so every posting site shares it; this handler only guards the boundary.

const legSchema = z.object({
  accountName: z.string().trim().min(1).max(191),
  debit: z.coerce.number().optional(),
  credit: z.coerce.number().optional(),
  customerId: z.string().min(1).nullish(),
  particulars: z.string().max(500).nullish(),
  type: z.enum(VOUCHER_TYPES).nullish(),
})

const voucherSchema = z.object({
  firmId: z.string().min(1),
  date: z.coerce.date().optional(),
  type: z.enum(VOUCHER_TYPES),
  narration: z.string().max(500).nullish(),
  customerId: z.string().min(1).nullish(),
  invoiceId: z.string().min(1).nullish(),
  loanId: z.string().min(1).nullish(),
  legs: z.array(legSchema).min(2),
})

const reversalSchema = z.object({
  firmId: z.string().min(1),
  reverseVoucherId: z.string().min(1),
  date: z.coerce.date().optional(),
  narration: z.string().max(500).nullish(),
})

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let raw: any
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  // firmId is read here only to authorise; every value actually written comes from the parsed body
  // below, and userId always from the session — never from the request.
  const firmId = typeof raw?.firmId === 'string' ? raw.firmId : ''
  if (!firmId) return NextResponse.json({ error: 'firmId required' }, { status: 400 })
  if (!(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const denied = await denyUnlessRole(user.id, firmId, MANAGER_ROLES, 'post or reverse a journal voucher by hand')
  if (denied) return denied

  const isReversal = typeof raw?.reverseVoucherId === 'string'
  const parsed = isReversal ? reversalSchema.safeParse(raw) : voucherSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, { status: 400 })
  }

  // EVERY ID THIS VOUCHER POINTS AT MUST BE THIS FIRM'S. postVoucher stamps the voucher-level
  // customerId onto any leg that does not carry its own (src/lib/ledger.ts), so one foreign id in
  // the body attributed the whole hand-posted voucher to a party in another shop's master — a
  // receivable in a book that party does not appear in, which no statement can reconcile. The
  // voucher id and all its legs go in one call, so the check is one query however many legs there
  // are. A reversal has no ids of its own: it copies the legs of the voucher it reverses, and
  // reverseVoucher already scopes that lookup by firmId.
  if ('legs' in parsed.data) {
    const v = parsed.data
    const notOurs = await denyForeignCustomer([v.customerId, ...v.legs.map((l) => l.customerId)], firmId)
    if (notOurs) return notOurs
    // invoiceId/loanId ride onto the legs the same way and are the same class of mistake, just a
    // dangling pointer rather than a party's balance. Same answer, same reason.
    const foreignRef = (v.invoiceId && !(await db.invoice.count({ where: { id: v.invoiceId, firmId } })) && 'invoice')
      || (v.loanId && !(await db.loan.count({ where: { id: v.loanId, firmId } })) && 'loan')
    if (foreignRef) {
      return NextResponse.json({ error: `That ${foreignRef} is not in this firm.`, code: 'FOREIGN_REF' }, { status: 400 })
    }
  }

  try {
    const { voucherId, entries } = await db.$transaction(async (tx) => {
      const body = parsed.data
      const vid = 'reverseVoucherId' in body
        ? await reverseVoucher(tx, {
            firmId: body.firmId, userId: user.id, voucherId: body.reverseVoucherId,
            date: body.date, narration: body.narration,
          })
        : await postVoucher(tx, {
            firmId: body.firmId, userId: user.id, date: body.date, type: body.type,
            narration: body.narration, customerId: body.customerId,
            invoiceId: body.invoiceId, loanId: body.loanId,
            legs: body.legs.map((l) => ({ ...l, type: l.type ?? undefined })),
          })
      const rows = await tx.ledgerEntry.findMany({ where: { firmId: body.firmId, voucherId: vid }, orderBy: { createdAt: 'asc' } })
      const total = rows.reduce((s, r) => s + (r.debit || 0), 0)
      await tx.systemLog.create({ data: {
        userId: user.id, firmId: body.firmId, action: 'create', entity: 'voucher', entityId: vid,
        details: `${'reverseVoucherId' in body ? `Reversal of ${body.reverseVoucherId}` : body.type} - ${rows.length} legs ₹${total.toFixed(2)}`,
      } })
      return { voucherId: vid, entries: rows }
    })
    return NextResponse.json({ voucherId, entries })
  } catch (e: any) {
    if (e instanceof LedgerError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.code === 'VOUCHER_NOT_FOUND' ? 404 : 400 })
    }
    throw e
  }
}
