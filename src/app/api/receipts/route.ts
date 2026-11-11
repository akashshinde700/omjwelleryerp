import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess, requireFirm } from '@/lib/session'
import { denyForeignCustomer } from '@/app/api/_authz'
import { db } from '@/lib/db'
import { postVoucher, LedgerError } from '@/lib/ledger'
import { round2 } from '@/lib/gst'
import { CUSTOMER_ADVANCES } from '@/lib/scheme'
import {
  BankAccountNotFoundError,
  SETTLEMENT_KINDS,
  SETTLEMENT_RULES,
  docNoOfReceiptVoucher,
  normAccountName,
  partyPosition,
  receiptVoucherId,
  settlementLegs,
  udhaarMoneyAccount,
  type SettlementKind,
} from '@/lib/accounting'

/**
 * MONEY RECEIPTS AND PAYMENT VOUCHERS — money across the counter against a PARTY BALANCE, not
 * against a bill.
 *
 * Three directions, one mechanism, and the legs for all three are built in ONE place
 * (settlementLegs() in src/lib/accounting.ts, beside openItems() which reads their tags):
 *
 *   advance-receive   Dr <tender> / Cr Customer Advances    the shop takes booking money
 *   advance-refund    Dr Customer Advances / Cr <tender>    the shop hands it back
 *   due-collect       Dr <tender> / Cr Sundry Debtors       the shop collects a receivable
 *
 * ───────── THE DEFECT THIS ROUTE EXISTS TO CLOSE ─────────
 * The customer hub's "Money Out" button routed a payout to the UDHAAR screen, and an udhaar
 * `credit` posts Dr Sundry Debtors / Cr <tender> — money LENT (see that route's own header). Paying
 * back a customer whose `Customer Advances` stands at Cr 17,647.80 through it would have left the
 * liability untouched AND created a Sundry Debtors Dr 17,647.80 that does not exist: the same rupees
 * recorded twice in opposite directions, netting to ₹0 on his statement while the cash had left the
 * drawer. Nothing here can reach Sundry Debtors on a refund — the account is picked by
 * SETTLEMENT_RULES from the direction, never by the caller.
 *
 * ───────── WHAT IT MAY MOVE, AND WHO SAYS SO ─────────
 * The caps are partyPosition()'s, read INSIDE the transaction after the party row is locked
 * FOR UPDATE — the same lock, the same function and the same two caps the billing counter takes
 * before it spends an advance (src/app/api/invoices/route.ts), so a payout and a bill cannot spend
 * the same rupee. There is no fourth way to compute what a party owes.
 *
 *   advance-refund   capped at pos.advanceApplicable  (what Customer Advances actually holds)
 *   due-collect      capped at pos.dueCollectable     (what Sundry Debtors actually holds)
 *   advance-receive  uncapped — the shop may take any amount as a deposit
 *
 * Over-asking is REFUSED with the figure, never clamped: silently paying out less than the operator
 * keyed is how a drawer and a book disagree.
 *
 * A DECLARED OPENING BALANCE IS NOT SETTLEABLE HERE. Customer.openingBalance / balanceType is a
 * plain column that was never posted to the ledger (worklog Task 104; see buildCustomerStatement).
 * It is inside `pos.closing` and deliberately outside both caps, so a party whose whole balance is a
 * declared opening gets a refusal naming the reason rather than a voucher against an account holding
 * nothing. The screen says the same thing before the operator types.
 *
 * ───────── RESOLVED HERE: worklog Task 52, "advance direction undetermined" ─────────
 * `Udhaar.type = 'advance'` is unposted because its DIRECTION was unknown — money taken from a
 * customer or money paid to a karigar. The owner has answered for CUSTOMERS, and the answer is this
 * route: the direction is STATED at capture (`kind`), so nothing is inferred later, and settling one
 * is already built (apply it to a bill per document, or refund it here). The karigar half — money
 * paid out against future work, Dr Sundry Creditors — is NOT answered and is NOT built.
 *
 * Existing unposted `advance` rows are left exactly as they are, with their existing warning:
 * retro-posting a shop's live books is the owner's decision, not a route's. See the note on
 * ADVANCE_WARNING in src/app/api/udhaar/route.ts, which now points here.
 */

const nullableDate = z
  .union([z.string(), z.date(), z.null()])
  .optional()
  .transform((v) => (v === '' || v == null ? null : new Date(v)))
  .refine((d) => d === null || !Number.isNaN(d.getTime()), 'invalid date')

/**
 * `.strict()`: this body is never spread into a Prisma create, but an unknown key here means the
 * screen and the handler disagree about what was asked for, and on a payout that is worth a 400.
 */
const postSchema = z
  .object({
    firmId: z.string().min(1),
    customerId: z.string().min(1),
    kind: z.enum(SETTLEMENT_KINDS),
    amount: z.coerce.number().finite().positive().max(1e11),
    tender: z.enum(['cash', 'bank', 'cheque', 'upi']),
    bankAccountId: z.string().min(1).nullish(),
    chequeNumber: z.string().max(40).nullish(),
    date: nullableDate,
    note: z.string().max(500).nullish(),
    /**
     * Which open documents this settles — `source` is the key openItems() returned, so the server
     * re-derives the tag from its OWN open items and never trusts a tag off the wire. Empty = one
     * untagged leg, which openItems() takes off the oldest source first.
     */
    allocations: z
      .array(z.object({ source: z.string().min(1), amount: z.coerce.number().finite().positive() }))
      .max(50)
      .default([]),
  })
  .strict()

const bad = (error: string, code?: string) =>
  NextResponse.json({ error, ...(code ? { code } : {}) }, { status: 400 })

class SettlementRefused extends Error {}

/**
 * The next number in a firm's receipt or payment series, race-free.
 *
 * Same InvoiceSequence row-lock counter allocateInvoiceNo() uses (src/app/api/invoices/route.ts) and
 * for the same reason — counting rows races every concurrent POST — but NOT that function: its seed
 * backfills from `COUNT(*) FROM Invoice`, which is meaningless for a series that has no Invoice rows
 * at all. No schema change: InvoiceSequence is keyed (firmId, type) with a free-text `type`, so a
 * receipt series is one more row in it. Allocated in its own transaction, BEFORE the main one, so a
 * rolled-back voucher burns a number instead of reissuing one (gaps are safe, duplicates are not).
 */
const SERIES_PREFIX = { receipt: 'RCP-', payment: 'PAY-' } as const
async function allocateDocNo(firmId: string, series: 'receipt' | 'payment'): Promise<string> {
  const seq = await db.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO InvoiceSequence (firmId, type, seq) VALUES (${firmId}, ${series}, 1)
      ON DUPLICATE KEY UPDATE seq = seq + 1
    `
    const rows = await tx.$queryRaw<{ seq: number }[]>`
      SELECT seq FROM InvoiceSequence WHERE firmId = ${firmId} AND type = ${series}
    `
    return Number(rows[0].seq)
  })
  return SERIES_PREFIX[series] + (1000 + seq)
}

const partyName = (c: { title?: string | null; firstName?: string | null; lastName?: string | null }) =>
  [c.title, c.firstName, c.lastName].filter(Boolean).join(' ') || 'Party'

const PARTY_SELECT = { id: true, code: true, title: true, firstName: true, lastName: true, mobile: true, village: true, city: true } as const

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = postSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: z.treeifyError(parsed.error) }, { status: 400 })
  }
  const data = parsed.data
  if (!(await verifyFirmAccess(user.id, data.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // The party id in the body is user input. One firm must never settle another firm's party — the
  // customerId travels onto every leg postVoucher writes, so this is the guard that keeps a payout
  // out of a book the party does not appear in.
  const notOurs = await denyForeignCustomer(data.customerId, data.firmId)
  if (notOurs) return notOurs

  const amount = round2(data.amount)
  if (amount <= 0) return bad('Enter an amount greater than zero')
  const picks = data.allocations.map((a) => ({ source: a.source, amount: round2(a.amount) }))
  if (picks.length) {
    const sum = round2(picks.reduce((s, p) => s + p.amount, 0))
    if (sum !== amount) return bad(`The documents ticked add up to ₹${sum.toFixed(2)}, but the amount is ₹${amount.toFixed(2)}`)
  }
  const rule = SETTLEMENT_RULES[data.kind as SettlementKind]
  const docNo = await allocateDocNo(data.firmId, rule.series)
  const date = data.date ?? new Date()

  try {
    const result = await db.$transaction(async (tx) => {
      // The party's row lock FIRST, before any read in this transaction. InnoDB fixes the snapshot at
      // the first consistent read, so locking after one would let a payout and a bill both see the
      // same advance and both spend it. Exactly what the billing counter does.
      await tx.$queryRaw`SELECT id FROM Customer WHERE id = ${data.customerId} AND firmId = ${data.firmId} FOR UPDATE`
      const party = await tx.customer.findFirst({ where: { id: data.customerId, firmId: data.firmId }, select: PARTY_SELECT })
      if (!party) throw new SettlementRefused('That customer is not in this firm')
      const pos = await partyPosition(tx, data.firmId, data.customerId)
      if (!pos) throw new SettlementRefused('That customer is not in this firm')

      // ONE source of truth for the cap and for the open items: partyPosition().
      const cap = data.kind === 'advance-refund' ? pos.advanceApplicable : data.kind === 'due-collect' ? pos.dueCollectable : null
      const items = data.kind === 'advance-refund' ? pos.advanceItems : data.kind === 'due-collect' ? pos.dueItems : []
      if (cap != null && amount > cap) {
        const declared = round2(Math.abs(pos.closing) - cap)
        throw new SettlementRefused(
          `₹${amount.toFixed(2)} asked, but only ₹${cap.toFixed(2)} sits in ${rule.account} for this party.` +
            (declared > 0.004
              ? ` The other ₹${declared.toFixed(2)} of his ₹${Math.abs(pos.closing).toFixed(2)} balance is a declared opening balance (or a girvi/udhaar figure) that was never posted to the ledger, so it cannot be settled here.`
              : ''),
        )
      }
      // The tag is re-derived from the server's own open items, so a tag can never arrive off the
      // wire. Same rule and same wording as the bill: source 'other' carries no tag at all.
      const allocations = picks.map((p) => {
        const it = items.find((i) => i.source === p.source)
        if (!it || p.amount > it.amount) {
          throw new SettlementRefused(`${it?.docNo ?? p.source}: ₹${p.amount.toFixed(2)} asked, ₹${(it?.amount ?? 0).toFixed(2)} open`)
        }
        return { tag: p.source === 'other' ? '' : ` (from ${it.docNo})`, amount: p.amount, docNo: it.docNo }
      })

      // Resolved inside the transaction: a cheque may self-provision the firm's Cheques in Transit
      // row, and that write must roll back with everything else if the voucher is refused.
      const money = await udhaarMoneyAccount(tx, data.firmId, data.tender, data.bankAccountId)
      const voucherId = await postVoucher(tx, {
        firmId: data.firmId,
        userId: user.id,
        type: rule.moneyIn ? 'receipt' : 'payment',
        date,
        narration: `${rule.label} ${docNo} - ${partyName(party)}${data.note ? ` · ${data.note}` : ''}`,
        customerId: data.customerId,
        voucherId: receiptVoucherId(data.firmId, docNo),
        legs: settlementLegs({ kind: data.kind as SettlementKind, docNo, amount, moneyAccount: money.name, customerId: data.customerId, allocations }),
      })

      // The handle that lets this cheque be cleared or bounced (src/app/api/bank/transactions/[id]).
      // Without it the in-transit leg would sit there forever with nothing able to move it.
      if (data.tender === 'cheque' && money.bank?.id) {
        await tx.bankTransaction.create({
          data: {
            firmId: data.firmId, bankAccountId: money.bank.id,
            type: rule.moneyIn ? 'cheque_in' : 'cheque_out',
            amount, transactionDate: date, clearingDate: null, status: 'pending',
            chequeNumber: data.chequeNumber ?? null,
            counterAccountName: rule.account,
            narration: `${rule.label} ${docNo} - ${partyName(party)}`,
            voucherId, userId: user.id,
          },
        })
      }

      await tx.systemLog.create({
        data: {
          userId: user.id, firmId: data.firmId, action: 'create', entity: 'receipt', entityId: docNo,
          details: `${rule.label} ₹${amount.toFixed(2)} ${rule.moneyIn ? 'into' : 'out of'} ${money.name} — ${partyName(party)} (${party.code || party.id}) - voucher ${voucherId}${allocations.length ? ` - against ${allocations.map((a) => a.docNo).join(', ')}` : ''}`,
        },
      })

      // Re-derived AFTER the legs are written, by the same function, inside the same transaction:
      // the figure on the paper is the figure in the books, not a subtraction done in the handler.
      const after = await partyPosition(tx, data.firmId, data.customerId)
      // The document numbers are captured HERE, while the open items still exist: a fully settled
      // item is gone from `after`, so resolving them afterwards would print a cuid on the slip.
      return { voucherId, party, money, after, allocations: allocations.map((a) => ({ docNo: a.docNo, amount: a.amount })) }
    })

    return NextResponse.json({
      receipt: receiptPayload({
        docNo, kind: data.kind as SettlementKind, date, amount,
        tender: data.tender, tenderAccount: result.money.name, note: data.note ?? null,
        voucherId: result.voucherId, party: result.party,
        allocations: result.allocations,
      }),
      position: result.after,
    }, { status: 201 })
  } catch (e) {
    if (e instanceof SettlementRefused) return bad(e.message, 'SETTLEMENT_REFUSED')
    if (e instanceof LedgerError) return bad(e.message, e.code)
    if (e instanceof BankAccountNotFoundError) return NextResponse.json({ error: e.message }, { status: 404 })
    throw e
  }
}

type ReceiptPayloadInput = {
  docNo: string
  kind: SettlementKind
  date: Date
  amount: number
  tender: string
  tenderAccount: string
  note: string | null
  voucherId: string
  party: { code: string | null; title?: string | null; firstName?: string | null; lastName?: string | null; mobile: string | null; village?: string | null; city?: string | null }
  allocations: { docNo: string; amount: number }[]
}

/** Exactly what the printed slip shows. No figure on it is computed anywhere but here and the ledger. */
function receiptPayload(i: ReceiptPayloadInput) {
  const rule = SETTLEMENT_RULES[i.kind]
  return {
    docNo: i.docNo,
    kind: i.kind,
    direction: rule.moneyIn ? ('in' as const) : ('out' as const),
    label: rule.label,
    account: rule.account,
    date: i.date.toISOString(),
    amount: i.amount,
    tender: i.tender,
    tenderAccount: i.tenderAccount,
    note: i.note,
    voucherId: i.voucherId,
    customerName: partyName(i.party),
    customerCode: i.party.code,
    customerMobile: i.party.mobile,
    customerPlace: [i.party.village, i.party.city].filter(Boolean).join(', ') || null,
    allocations: i.allocations,
  }
}

/**
 * This firm's money receipts and payment vouchers, newest first — one row per voucher, derived from
 * the legs, because there is no Receipt table. Every voucher this route writes is addressed
 * `rcp:<firmId>:<docNo>`, which is both the firm scope and the index (@@index([voucherId])).
 *
 * ponytail: the latest 600 legs (~300 vouchers), unpaged. Page it the day a shop writes more
 * receipts than that between glances; the reprint path addresses one voucher directly and does not
 * go through here.
 */
async function listReceipts(firmId: string) {
  const legs = await db.ledgerEntry.findMany({
    where: { firmId, voucherId: { startsWith: `rcp:${firmId}:` } },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: 600,
    select: { voucherId: true, date: true, debit: true, credit: true, accountName: true, customerId: true, particulars: true },
  })
  const byVoucher = new Map<string, { voucherId: string; docNo: string; date: Date; account: string; direction: 'in' | 'out'; amount: number; customerId: string | null }>()
  for (const l of legs) {
    const party = normAccountName(l.accountName) === normAccountName(CUSTOMER_ADVANCES) || normAccountName(l.accountName) === normAccountName('Sundry Debtors')
    if (!party) continue
    const v = l.voucherId!
    const row = byVoucher.get(v) ?? {
      voucherId: v, docNo: docNoOfReceiptVoucher(v), date: l.date, account: l.accountName,
      // The party leg's side IS the direction: a debit to Customer Advances is money going out.
      direction: (normAccountName(l.accountName) === normAccountName(CUSTOMER_ADVANCES) && l.debit > 0 ? 'out' : 'in') as 'in' | 'out',
      amount: 0, customerId: l.customerId,
    }
    row.amount = round2(row.amount + l.debit + l.credit)
    byVoucher.set(v, row)
  }
  return NextResponse.json({ receipts: [...byVoucher.values()] })
}

/**
 * Reprint. The slip is REBUILT from the voucher's own legs — there is no Receipt table and no new
 * column anywhere; the ledger is the record. `kind` is re-derived from which party-control account
 * the voucher moved and in which direction, so nothing about the document is stored twice and
 * nothing can drift out of step with the posting.
 *
 * The party position printed on a reprint is the position AS AT THE REPRINT, labelled with the date
 * it was taken — a dated historical position would need a point-in-time partyPosition(), which does
 * not exist and is not worth inventing for a lost slip.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const firmId = await requireFirm(searchParams, user)
  if (firmId instanceof NextResponse) return firmId
  const voucherId = searchParams.get('voucherId') || ''
  if (!voucherId) return listReceipts(firmId)

  // firmId in the where, not only in the access check: a voucherId is guessable and books never
  // cross firms.
  const legs = await db.ledgerEntry.findMany({
    where: { firmId, voucherId },
    orderBy: { createdAt: 'asc' },
    select: { accountName: true, customerId: true, debit: true, credit: true, date: true, particulars: true },
  })
  if (!legs.length) return NextResponse.json({ error: 'No such receipt in this firm' }, { status: 404 })

  const isAdvance = legs.some((l) => normAccountName(l.accountName) === normAccountName(CUSTOMER_ADVANCES))
  const partyLeg = legs.find((l) => normAccountName(l.accountName) === normAccountName(isAdvance ? CUSTOMER_ADVANCES : 'Sundry Debtors'))
  if (!partyLeg) return NextResponse.json({ error: 'That voucher is not a money receipt' }, { status: 404 })
  const kind: SettlementKind = !isAdvance ? 'due-collect' : partyLeg.debit > 0 ? 'advance-refund' : 'advance-receive'
  const rule = SETTLEMENT_RULES[kind]
  const moneyLeg = legs.find((l) => normAccountName(l.accountName) !== normAccountName(rule.account))
  if (!moneyLeg) return NextResponse.json({ error: 'That voucher is not a money receipt' }, { status: 404 })

  const partyLegs = legs.filter((l) => normAccountName(l.accountName) === normAccountName(rule.account))
  const amount = round2(partyLegs.reduce((s, l) => s + l.debit + l.credit, 0))
  const customerId = partyLeg.customerId || ''
  const party = customerId
    ? await db.customer.findFirst({ where: { id: customerId, firmId }, select: PARTY_SELECT })
    : null
  if (!party) return NextResponse.json({ error: 'No such receipt in this firm' }, { status: 404 })

  const SOURCE_TAG = /\(from ([^)]+)\)/
  const docNo = docNoOfReceiptVoucher(voucherId) || voucherId.slice(-10).toUpperCase()
  return NextResponse.json({
    receipt: receiptPayload({
      docNo,
      kind, date: new Date(partyLeg.date), amount,
      // The tender is the money account's own name — 'cash' / 'bank' is not stored on a leg, and
      // the account is the thing that matters to a reader of the slip anyway.
      tender: moneyLeg.accountName, tenderAccount: moneyLeg.accountName,
      note: null, voucherId, party,
      // An advance-receive leg is tagged with its OWN receipt number (that is what makes it an open
      // item); printing "Against RCP-1001" on RCP-1001 would be a slip pointing at itself.
      allocations: partyLegs
        .map((l) => ({ docNo: SOURCE_TAG.exec(l.particulars || '')?.[1]?.trim() ?? 'Earlier balance', amount: round2(l.debit + l.credit) }))
        .filter((a) => a.docNo !== docNo && a.docNo !== 'Earlier balance'),
    }),
    position: await partyPosition(db, firmId, customerId),
    reprintedAt: new Date().toISOString(),
  })
}
