import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess, requireFirm } from '@/lib/session'
import { MANAGER_ROLES, denyForeignCustomer, denyUnlessRole } from '@/app/api/_authz'
import { paging } from '@/app/api/_paging'
import { db } from '@/lib/db'
import { resolveParty } from '@/lib/party'
import { postVoucher, reverseVoucher, LedgerError, type VoucherLeg } from '@/lib/ledger'
import { round2 } from '@/lib/gst'
import { roundWeight } from '@/lib/stock-calc'
import { udhaarMoneyAccount, BankAccountNotFoundError } from '@/lib/accounting'
import { udhaarSummary } from '@/lib/udhaar'
import {
  GIRVI_INTEREST_SETTING_KEY,
  isDefaultConvention,
  resolveConvention,
  type InterestConvention,
} from '@/lib/interest'

/**
 * Udhaar — informal money lending, and the second half of the sign convention in src/lib/udhaar.ts.
 *
 * ───────────────────────── what reaches the books ─────────────────────────
 * Every rupee that moves here is now a balanced voucher written by postVoucher INSIDE the same
 * db.$transaction as the Udhaar row and its SystemLog. Before this the module wrote a row and a log
 * and nothing else, so the cash book, Sundry Debtors and the balance sheet were blind to it.
 *
 * Disbursal / receipt, on create, for an amount A paid in `transactionType`:
 *   credit  (money LEFT the firm, a receivable)   Dr Sundry Debtors A      Cr <tender> A
 *   debit   (money CAME BACK from the party)      Dr <tender> A            Cr Sundry Debtors A
 *   debit   from a moneyLender/supplier/karigar/staff (money BORROWED, a payable)
 *                                                 Dr <tender> A            Cr Sundry Creditors A
 * The third line is D5 (2026-10), for NEW rows only — see partyAccountFor() below. With it the
 * identity below reads Σ Debtors − Σ Creditors (from udhaar) == udhaarBreakdown(rows).net.
 *
 * <tender> is resolved by udhaarMoneyAccount() (src/lib/accounting.ts), NOT by a name map:
 * cash -> Cash in Hand, bank ->
 * the named `Bank - <account>`, cheque -> Cheques in Transit until the bank actually clears it. A
 * cheque also raises a pending BankTransaction so it can be cleared or bounced.
 *
 * Settlement, on PUT, for the INCREASE d in settledAmount: the mirror of that row's own creation
 * voucher, sized d. A credit settled in full therefore nets Sundry Debtors back to zero, exactly as
 * udhaarBreakdown() drops a settled row from the net — the module's own figure and the ledger agree
 * by construction:
 *     Σ (Sundry Debtors movement from udhaar) == udhaarBreakdown(rows).net
 * Worked example: credit ₹80,000 cash → Dr Debtors 80,000 / Cr Cash 80,000. Debit ₹30,000 cash →
 * Dr Cash 30,000 / Cr Debtors 30,000. Debtors = ₹50,000 = the net the dashboard reports. Settle the
 * credit for ₹5,000 → Dr Cash 5,000 / Cr Debtors 5,000, Debtors ₹45,000, net ₹45,000. Ties.
 *
 * ──────────────────── what deliberately does NOT reach the books ────────────────────
 *
 * ANSWERED FOR CUSTOMERS, 2026-10 — the UNDETERMINED note below is resolved, and the answer is NOT
 * here. The owner asked for an explicit "take an advance from a customer / return it" pair, which
 * settles both questions the note says were never decided:
 *   DIRECTION   is STATED at capture, not inferred: POST /api/receipts takes
 *               kind = 'advance-receive' (Dr <tender> / Cr Customer Advances) or
 *               kind = 'advance-refund'  (Dr Customer Advances / Cr <tender>).
 *   SETTLEMENT  is already built: apply it against a bill per source document (openItems() /
 *               src/app/api/invoices/route.ts), or hand it back as cash through that same route.
 * The legs live in settlementLegs() in src/lib/accounting.ts.
 *
 * THIS ROUTE IS DELIBERATELY UNCHANGED. `type: 'advance'` here still posts NOTHING and still warns,
 * for two reasons: the KARIGAR half (money paid out against future work, Dr Sundry Creditors) is
 * still undecided, so the type is still unqualified; and the firm's existing unposted advance rows
 * stay exactly as they are — retro-posting a live shop's books is the owner's decision, not a
 * route's. New customer advances go through /api/receipts and ARE posted.
 *
 * `type: 'advance'` is NOT posted, and that is a decision, not an oversight. See the
 * "UNDETERMINED — read this before touching udhaar" note in worklog.md (Task 52). An advance here is
 * unqualified in the schema, the route, the "Advance Money" tab and the seed data: it can be money
 * TAKEN from a customer against an order (Cr Customer Advances, a liability) or money PAID OUT to a
 * karigar (Dr Sundry Creditors, an advance against future work). Posting it needs TWO decisions this
 * codebase has never made — the direction at capture, and what settling one means (applied against
 * an order, or refunded in cash). Guessing either silently mis-states the balance sheet, which is
 * worse than a declared gap, so an advance is created with `posted: false` and a warning on the
 * response, in SystemLog and on the screen. The fix is a data-model change (a `direction` column, or
 * explicit advance_received / advance_paid types, captured in the UI and backfilled) —
 * be-platform-data's call, not this route's.
 *
 * ───────── METAL UDHAAR — grams, and why they deliberately do NOT reach the books ─────────
 * `metal: 'gold' | 'silver'` makes a row a debt in GRAMS ("you owe me 10 g"), the commonest udhaar
 * in a jewellery shop and one this system could not represent at all. Direction is the SAME
 * convention in the same function (src/lib/udhaar.ts): credit = the metal left the firm, debit = it
 * came back. A row is money OR metal, never both — a metal row is created with amount 0 and carries
 * grams/settledGrams, and POST/PUT refuse any mixture. One column holding two units is the counter
 * dispute this whole convention exists to prevent.
 *
 * THE DECISION: a metal udhaar posts NOTHING to the ledger, and that is a decision, not an
 * oversight. Three reasons, in order of weight:
 *   1. DOUBLE COUNT. Inventory is perpetual and metal-separated: `Gold Stock` is driven by StockItem
 *      movements (src/lib/accounting.ts METAL_STOCK). The grams leaving the shop are recorded by the
 *      stock module when they leave. Crediting Gold Stock from here as well would relieve the same
 *      metal twice and put the stock asset permanently out of step with the stock ledger.
 *   2. IT IS NOT MONEY. Sundry Debtors is a rupee account. Freezing 10 g into it at one day's rate
 *      invents a fixed-rupee asset for a claim whose value moves every morning, and nobody has set a
 *      revaluation policy for it. (A weight SCHEME can be valued because its redemption date and
 *      rate are defined by the product; an open-ended metal udhaar has neither.)
 *   3. The honest alternative — a metal-separated receivable revalued daily — is a real accounting
 *      policy with a real P&L consequence, and it is the chart owner's call, not this route's.
 * So the position is carried in grams, reported in grams (udhaarBreakdown().metal, 3dp) and shown
 * in grams. `posted: false` with a warning naming the reason, in the response and in SystemLog.
 *
 * This does NOT resolve the 'advance' question above. An advance is unposted because its DIRECTION
 * is unknown; a metal row's direction is perfectly clear and it is unposted because its UNIT is not
 * rupees. Two different gaps, and settling one settles nothing about the other.
 *
 * ───────────────────────── immutability ─────────────────────────
 * A posted leg is never updated or deleted. PUT refuses to change anything the voucher was built
 * from (amount, type, transactionType) once the row is posted, and refuses to walk settledAmount
 * backwards; DELETE posts a dated mirror through reverseVoucher, exactly as expenses does.
 *
 * Udhaar has no voucherId column (schema change is be-platform-data's), so vouchers are addressed
 * deterministically and found by an indexed (firmId, voucherId) prefix scan:
 *   creation    `udh-<id>`
 *   settlement  `udh-<id>-s-<cumulative settledAmount>`   (monotonic: settledAmount cannot decrease)
 *   receipt     `udh-<id>-p-<paymentId>`                  (POST /api/udhaar/[id]/payments)
 * All three share the `udh-<id>` prefix, so DELETE's scan reverses every one of them.
 *
 * ───────────────── INTEREST-BEARING UDHAAR (Task 87) ─────────────────
 * A money `credit` row may now carry interestRate + interestType (days | monthly | annually), an
 * interest window and an installment plan. It is priced by src/lib/interest.ts through
 * src/lib/udhaar.ts (udhaarLoanBasis / deriveUdhaar / udhaarSchedule) — the SAME engine as a girvi
 * pledge, and the only one. Nothing is cached: there is no interest column anywhere, and the
 * figures on the list are derived from the row plus its UdhaarPayment rows on every read.
 *
 * The convention is FROZEN onto the row at creation from the firm's Setting['girvi.interest'],
 * exactly as a Loan freezes it, and the firm's ONE convention block is reused — there is
 * deliberately no separate udhaar convention setting. A firm that changes its policy in April must
 * not re-price an udhaar it wrote in March.
 *
 * SETTLEMENT HAS ONE PATH PER KIND OF ROW, never two for the same row:
 *   no interest   PUT settledAmount     (unchanged, posts the mirror of the creation voucher)
 *   interest      POST [id]/payments    (splits interest-first and credits Interest Income)
 * PUT refuses a settledAmount change on an interest-bearing row for that reason. On such a row
 * `settledAmount` means PRINCIPAL RECOVERED, which keeps udhaarBreakdown(), the dashboard and the
 * balance sheet reporting the principal position exactly as they always have.
 */

// type carries the direction of the money — see src/lib/udhaar.ts for the sign convention
// (credit = given out/receivable, debit = received back, advance = unqualified).
const TYPES = ['credit', 'debit', 'advance'] as const
const METALS = ['gold', 'silver'] as const
const STATUSES = ['active', 'settled', 'partial'] as const
/** The unit interestRate is quoted in. Mapped onto the engine's %/month in src/lib/udhaar.ts. */
const INTEREST_TYPES = ['days', 'monthly', 'annually'] as const

// Which account the money side of an udhaar lands on: udhaarMoneyAccount() in src/lib/accounting.ts.
// It moved there so POST /api/udhaar/[id]/payments resolves its tender through the SAME function —
// a second tender map is the defect that helper exists to remove.

const udhaarVoucherId = (id: string) => `udh-${id}`
const settlementVoucherId = (id: string, cumulativeSettled: number) => `udh-${id}-s-${round2(cumulativeSettled)}`

type Movement = { customerName: string; type: string; transactionType: string }

/**
 * ───────── WHICH PARTY ACCOUNT AN UDHAAR LANDS ON (D5, 2026-10) ─────────
 *
 * THE DEFECT. A `debit` (money the firm RECEIVED) always credited Sundry Debtors. When the party is
 * a money lender the firm borrowed from, nobody owes the firm anything — the firm owes HIM — so the
 * trial balance showed Sundry Debtors, an asset, sitting in CREDIT. udhaarBreakdown() has always
 * called an open debit row `toPay` (a payable); the books said "negative receivable" instead.
 *
 * THE RULE, decided on the party's TYPE at the moment the row is created:
 *   credit (money given out)                         -> Sundry Debtors     (asset, 1004)
 *   debit from a customer / visitor / unnamed party  -> Sundry Debtors     (a receipt from a debtor)
 *   debit from a moneyLender / supplier / karigar / staff
 *                                                    -> Sundry Creditors   (liability, 2001)
 *
 * Why Sundry Creditors and not a new "Borrowings" head: it is an EXISTING liability in
 * CHART_OF_ACCOUNTS and it is one of PARTY_CONTROL_ACCOUNTS, so the lender's own statement and the
 * customer panel pick the debt up with no further change. 'Financier Loans Payable' (2010) was
 * considered and rejected: it is specifically the shop's borrowing against RE-PLEDGED girvi gold and
 * is NOT a party-control account, so a money lender's statement would go blind to his own loan.
 *
 * Why a customer's debit stays on Sundry Debtors: from a customer, money in is overwhelmingly a
 * repayment, and the screen now steers a repayment to the original entry (Payments / settle) — what
 * is left is a genuine receipt against what he owes. This is a business-rule CHOICE; the opposite
 * (every debit is a liability) is defensible too, but would gross up every customer who repays the
 * wrong way into a receivable AND a payable for the same rupees.
 *
 * NEW POSTINGS ONLY. Existing ledger rows are never rewritten. A settlement does not re-decide the
 * account from the party's current type either: it MIRRORS the party leg of the row's own creation
 * voucher (creationPartyAccount below), so a legacy debit that credited Debtors is paid back out of
 * Debtors, and a new borrowing is paid back out of Creditors — each nets to zero on its own account.
 *
 * Ledger identity after this change:
 *   Σ Sundry Debtors (udhaar) − Σ Sundry Creditors (udhaar) == udhaarBreakdown(rows).net
 * Worked example: lend ₹80,000 to a customer -> Dr Debtors 80,000 / Cr Cash 80,000. Borrow ₹50,000
 * from a money lender -> Dr Cash 50,000 / Cr Creditors 50,000. Debtors Dr 80,000 (asset), Creditors
 * Cr 50,000 (liability), net 30,000 = toReceive 80,000 − toPay 50,000. Repay the lender ₹20,000 ->
 * Dr Creditors 20,000 / Cr Cash 20,000; Creditors Cr 30,000, net 50,000. Trial balance still ties.
 */
const UDHAAR_RECEIVABLE = 'Sundry Debtors'
const UDHAAR_PAYABLE = 'Sundry Creditors'
/** Party types whose money handed to the firm is a debt the firm owes, never a receipt from a debtor. */
const LIABILITY_PARTY_TYPES = new Set(['moneyLender', 'supplier', 'karigar', 'staff'])

function partyAccountFor(type: string, partyType: string | null | undefined): string {
  return type === 'debit' && partyType && LIABILITY_PARTY_TYPES.has(partyType) ? UDHAAR_PAYABLE : UDHAAR_RECEIVABLE
}

/** The party leg the row's creation voucher actually used, or null if it was never posted. */
async function creationPartyAccount(tx: any, firmId: string, id: string): Promise<string | null> {
  const leg = await tx.ledgerEntry.findFirst({
    where: { firmId, voucherId: udhaarVoucherId(id), accountName: { in: [UDHAAR_RECEIVABLE, UDHAAR_PAYABLE] }, reversalOfId: null },
    select: { accountName: true },
  })
  return leg?.accountName ?? null
}

async function partyTypeOf(tx: any, customerId: string | null | undefined): Promise<string | null> {
  if (!customerId) return null
  const c = await tx.customer.findUnique({ where: { id: customerId }, select: { type: true } })
  return c?.type ?? null
}

/**
 * The two legs of one udhaar movement, in the direction money actually moved.
 * `outward` = money left the firm (a credit disbursal, or the settlement of a debit row).
 * `money` is the resolved tender account from udhaarMoneyAccount() — passed in rather than looked
 * up here, because resolving it needs the transaction and may create an Account row.
 * `party` is Sundry Debtors or Sundry Creditors — see partyAccountFor() above.
 * Returns null for a type whose direction is not established — see the header note on 'advance'.
 */
function udhaarLegs(u: Movement, amount: number, outward: boolean, particulars: string, money: string, party: string): VoucherLeg[] | null {
  if (u.type !== 'credit' && u.type !== 'debit') return null
  return outward
    ? [
        { accountName: party, debit: amount, particulars, type: 'udhaar' },
        { accountName: money, credit: amount, particulars, type: 'payment' },
      ]
    : [
        { accountName: money, debit: amount, particulars, type: 'receipt' },
        { accountName: party, credit: amount, particulars, type: 'udhaar' },
      ]
}

/** Money leaves the firm when a credit is disbursed, and when a debit row is settled back. */
const isOutward = (type: string, settlement: boolean) => (type === 'credit') !== settlement

const METAL_WARNING =
  'A metal udhaar is carried in GRAMS and is NOT posted to the ledger: the grams leaving the shop ' +
  'are the stock module\'s entry, and a gram claim has no fixed rupee value. See the header of ' +
  'src/app/api/udhaar/route.ts.'

const ADVANCE_WARNING =
  "type 'advance' has no established direction in this system, so it is NOT posted to the ledger. " +
  'To take an advance FROM A CUSTOMER into the books, use the customer panel’s MONEY tab ' +
  '(POST /api/receipts, kind advance-receive: Dr <tender> / Cr Customer Advances) — that path ' +
  'posts, prints a receipt and can be applied to a bill or returned. An advance PAID TO A KARIGAR ' +
  'against future work is still undecided and still belongs here, unposted.'

const nullableDate = z
  .union([z.string(), z.date(), z.null()])
  .optional()
  .transform((v) => (v === '' || v == null ? null : new Date(v)))
  .refine((d) => d === null || !Number.isNaN(d.getTime()), 'invalid date')

// Explicit whitelist: the client used to hand its whole form object to Prisma (mass assignment),
// which let it set id/createdAt or move a row to another firm.
const fields = z.object({
  customerId: z.string().min(1).nullish(),
  customerName: z.string().min(1),
  customerMobile: z.string().nullish(),
  village: z.string().nullish(),
  type: z.enum(TYPES),
  transactionType: z.enum(['cash', 'bank', 'cheque']),
  amount: z.coerce.number().finite().min(0),
  description: z.string().nullish(),
  dueDate: nullableDate,
  status: z.enum(STATUSES),
  settledAmount: z.coerce.number().finite().min(0),
  // Metal udhaar. '' / null is an ordinary money row.
  metal: z
    .union([z.enum(METALS), z.literal(''), z.null()])
    .optional()
    .transform((v) => (v === '' || v == null ? null : v)),
  grams: z.coerce.number().finite().min(0),
  settledGrams: z.coerce.number().finite().min(0),
  /**
   * Interest. All optional and all NULL by default — an udhaar bears no interest unless a rate is
   * typed, which is every row that already exists. The ranges are checked in checkInterest() rather
   * than here so the operator gets a sentence instead of a zod path; the bounds that remain here are
   * the ones that stop nonsense reaching the column at all.
   * interestConvention is deliberately ABSENT: it is resolved from the firm's setting and frozen by
   * the server, never accepted from a request body.
   */
  interestRate: z.coerce.number().finite().min(0).max(100).nullish(),
  interestType: z.enum(INTEREST_TYPES).nullish(),
  interestStartDate: nullableDate,
  interestEndDate: nullableDate,
  emiIntervalDays: z.coerce.number().int().nullish(),
  emiOccurrences: z.coerce.number().int().nullish(),
  // Tender routing. NOT Udhaar columns — both are stripped before the row is written (see POST/PUT)
  // and only ever reach the ledger leg and the pending BankTransaction.
  // Optional by design: the clerk taking a cheque does not know which account it will be paid into,
  // and clearing can reassign it. See resolveBankAccount() in src/lib/accounting.ts.
  bankAccountId: z.string().min(1).nullish(),
  chequeNumber: z.string().trim().max(60).nullish(),
})

const createSchema = fields.extend({
  firmId: z.string().min(1),
  type: z.enum(TYPES).default('credit'),
  transactionType: z.enum(['cash', 'bank', 'cheque']).default('cash'),
  status: z.enum(STATUSES).default('active'),
  // A METAL row states no rupee amount at all, so amount defaults to 0 here. A zero-amount money
  // row was already legal (a placeholder that posts nothing) - see the POST body.
  amount: z.coerce.number().finite().min(0).default(0),
  settledAmount: z.coerce.number().finite().min(0).default(0),
  grams: z.coerce.number().finite().min(0).default(0),
  settledGrams: z.coerce.number().finite().min(0).default(0),
})

// No defaults here on purpose: a PUT that omits `type` must leave the row's direction alone.
// A default would silently rewrite a debit into a credit on every "mark settled" click.
const updateSchema = fields.partial().extend({ id: z.string().min(1) })

function badRequest(err: z.ZodError) {
  return NextResponse.json({ error: 'Invalid request', details: z.treeifyError(err) }, { status: 400 })
}

const bad = (error: string) => NextResponse.json({ error }, { status: 400 })

/**
 * A row is money OR metal, never both. Returns the complaint, or null when the row is coherent.
 * One guard, used by POST on the new row and by PUT on the merged row, so neither can drift.
 */
function checkUnit(row: { metal: string | null; amount: number; grams: number; settledAmount: number; settledGrams: number }) {
  if (row.metal) {
    if (row.amount > 0) return 'A metal udhaar is denominated in grams: leave amount at 0 and use grams'
    if (row.settledAmount > 0) return 'A metal udhaar settles in grams: use settledGrams, not settledAmount'
    if (!(row.grams > 0)) return 'grams must be greater than zero on a metal udhaar'
    if (row.settledGrams > row.grams + 0.0005) return 'settledGrams cannot exceed grams'
    return null
  }
  if (row.grams > 0 || row.settledGrams > 0) {
    return "grams are only meaningful with metal: 'gold' or 'silver'"
  }
  return null
}

/**
 * Is this row's interest coherent? Returns the complaint in plain English, or null. One guard, used
 * by POST on the new row and by PUT on the MERGED row, so the two cannot drift apart.
 *
 * The rate lives on ONE kind of row on purpose: money the firm lent out. A metal debt has no rupee
 * principal to charge a rate on, and a debit/advance is money coming the other way — modelling the
 * firm's own borrowings needs a direction this system has never captured (see the header).
 */
function checkInterest(row: {
  metal: string | null
  type: string
  interestRate: number | null
  interestType: string | null
  interestStartDate: Date | null
  interestEndDate: Date | null
  emiIntervalDays: number | null
  emiOccurrences: number | null
  createdAt?: Date | null
}) {
  const rate = row.interestRate ?? 0
  if (rate > 0) {
    if (row.metal) return 'A metal udhaar is a debt in grams, not rupees — it cannot carry a rate of interest.'
    if (row.type !== 'credit') {
      return (
        'Only money lent out (type credit) can carry a rate of interest. Interest-bearing borrowings — ' +
        'money the firm has taken — are not modelled here, so a debit or an advance takes no rate.'
      )
    }
    if (!row.interestType) {
      return 'Say what the rate is per: set interest type to days, monthly or annually.'
    }
  }
  const k = row.emiIntervalDays
  const n = row.emiOccurrences
  if ((k == null) !== (n == null)) {
    return 'An installment plan needs both an interval in days and a number of installments — or neither.'
  }
  if (k != null && !(rate > 0)) {
    return 'An installment plan is priced off a rate of interest — set one, or drop the plan and use a single due date.'
  }
  if (k != null && !(k >= 1 && k <= 366)) return 'The installment interval must be between 1 and 366 days.'
  if (n != null && !(n >= 1 && n <= 600)) return 'An installment plan must have between 1 and 600 installments.'
  if (row.interestEndDate) {
    const start = row.interestStartDate ?? row.createdAt ?? null
    if (start && row.interestEndDate.getTime() <= start.getTime()) {
      return 'The date interest stops must be after the date it starts.'
    }
  }
  return null
}

/**
 * The firm's CURRENT default convention, read ONLY when a rate is first put on a row and then
 * frozen onto it. Same setting, same reader and same fallback as a girvi loan (see firmConvention()
 * in src/app/api/loans/route.ts) — one convention block for the whole of lending, deliberately: a
 * second udhaar-only setting would be a second policy to keep in step, which is how two engines
 * start. A missing or unreadable setting is the built-in default, so a firm that never opened the
 * settings screen behaves exactly as it always has.
 */
async function firmConvention(firmId: string): Promise<InterestConvention> {
  const row = await db.setting.findUnique({ where: { firmId_key: { firmId, key: GIRVI_INTEREST_SETTING_KEY } } })
  if (!row?.value) return resolveConvention(null)
  try {
    return resolveConvention((JSON.parse(row.value) as { convention?: unknown }).convention as never)
  } catch {
    return resolveConvention(null)
  }
}

/** NULL means "priced the default way" — the same encoding Loan.interestConvention uses. */
async function freezeConvention(firmId: string, rate: number | null | undefined): Promise<string | null> {
  if (!rate || rate <= 0) return null
  const resolved = await firmConvention(firmId)
  return isDefaultConvention(resolved) ? null : JSON.stringify(resolved)
}

function ledgerFailure(e: unknown) {
  // A bankAccountId in the body naming another firm's account, or one that no longer exists.
  if (e instanceof BankAccountNotFoundError) {
    return NextResponse.json({ error: e.message }, { status: 404 })
  }
  if (e instanceof LedgerError) {
    return NextResponse.json({ error: `Ledger posting refused: ${e.message}`, code: e.code }, { status: 409 })
  }
  throw e
}

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const firmId = await requireFirm(searchParams, user)
  if (firmId instanceof NextResponse) return firmId
  const status = searchParams.get('status')
  const type = searchParams.get('type')
  // metal=gold|silver narrows to one metal book; metal=money is the ordinary rupee list.
  const metal = searchParams.get('metal')
  const search = searchParams.get('search') || ''
  const where: any = { firmId }
  if (status && status !== 'all') where.status = status
  if (type && type !== 'all') where.type = type
  if (metal === 'money') where.metal = null
  else if (metal === 'gold' || metal === 'silver') where.metal = metal
  if (search) {
    where.OR = [{ customerName: { contains: search } }, { customerMobile: { contains: search } }]
  }
  const page = paging(searchParams, 300)
  const [rows, total] = await Promise.all([
    db.udhaar.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      // Fetched in the SAME round trip: the derived figures below replay these rows, and deriving
      // inside a map that lazy-loads them is an N+1 across 300 rows.
      include: { payments: true },
      ...page,
    }),
    db.udhaar.count({ where }),
  ])
  // Derived on every read, never stored. The payment rows themselves are stripped — the list shows
  // figures, and the history belongs to GET /api/udhaar/[id]. Every added field is NULL on a row
  // that bears no interest, so an existing row reads back exactly as it did before Task 87.
  // Same two pure functions the detail route calls, so the list and the detail cannot price one row
  // two different ways.
  const asOf = new Date()
  const udhaars = rows.map(({ payments, ...u }) => ({ ...u, ...udhaarSummary(u, payments, asOf) }))
  return NextResponse.json({ udhaars, total, limit: page.take, skip: page.skip })
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = createSchema.safeParse(await req.json())
  if (!parsed.success) return badRequest(parsed.error)
  // Split off the two tender-routing fields: Udhaar has no column for either, and `data` is spread
  // into tx.udhaar.create below.
  const { bankAccountId, chequeNumber, ...data } = parsed.data
  if (!(await verifyFirmAccess(user.id, data.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const amount = round2(data.amount)
  const grams = roundWeight(data.grams, 3)
  const settledGrams = roundWeight(data.settledGrams, 3)
  if (round2(data.settledAmount) > amount) return bad('settledAmount cannot exceed amount')
  const unit = checkUnit({ metal: data.metal, amount, grams, settledAmount: round2(data.settledAmount), settledGrams })
  if (unit) return bad(unit)

  // A rate of 0 IS no interest: stored as NULL so the row is indistinguishable from every row
  // written before Task 87, and so bearsInterest() refuses it without a special case.
  const interestRate = data.interestRate && data.interestRate > 0 ? data.interestRate : null
  const interest = {
    interestRate,
    interestType: interestRate ? (data.interestType ?? null) : null,
    interestStartDate: interestRate ? data.interestStartDate : null,
    interestEndDate: interestRate ? data.interestEndDate : null,
    emiIntervalDays: interestRate ? (data.emiIntervalDays ?? null) : null,
    emiOccurrences: interestRate ? (data.emiOccurrences ?? null) : null,
  }
  const badInterest = checkInterest({
    ...interest,
    metal: data.metal,
    type: data.type,
    // Interest runs from interestStartDate, else from the moment the row is written — which is
    // `now` here, near enough for the end-date check, and what udhaarInterestFrom() falls back to.
    createdAt: new Date(),
  })
  if (badInterest) return bad(badInterest)
  // Frozen HERE, once, from the firm's current policy — and never re-read afterwards. NULL when the
  // policy is the built-in default, so a default row and a legacy row are the same row. There is no
  // request field for it: see `fields`. Read before the transaction opens, never inside it.
  const interestConvention = await freezeConvention(data.firmId, interestRate)

  // THE PARTY MUST BELONG TO THIS FIRM. The FK only proves the customer exists SOMEWHERE, so an id
  // belonging to another shop was accepted here and then stamped onto this firm's ledger legs by
  // postVoucher (customerId travels onto every LedgerEntry) and onto every receipt voucher the
  // payments route writes afterwards. Nothing leaked outward - the other firm still cannot read the
  // row - but the receivable was attributed to a party in a book it does not appear in, which no
  // statement or customer panel could ever reconcile. Closed HERE, at the only place an udhaar's
  // customerId is ever set — and now by the ONE shared guard in src/app/api/_authz.ts, which also
  // closes the same hole on /api/invoices, /api/quotations, /api/orders, /api/repairs, /api/tasks
  // and /api/ledger, so the counter sees one message for one mistake whichever screen it made it on.
  const notOurs = await denyForeignCustomer(data.customerId, data.firmId)
  if (notOurs) return notOurs

  try {
    const { udhaar, voucherId } = await db.$transaction(async (tx) => {
      const party = await resolveParty(tx, { firmId: data.firmId, userId: user.id, source: 'udhaar entry', customerId: data.customerId, name: data.customerName, mobile: data.customerMobile, village: data.village })
      const created = await tx.udhaar.create({
        data: {
          ...data,
          customerId: party.id,
          amount,
          grams,
          settledGrams,
          ...interest,
          interestConvention,
        },
      })
      // A zero-amount row has no money movement to post, and postVoucher rightly refuses a zero
      // leg. The row is still allowed — it is a placeholder, not a payment. A metal row is always
      // amount 0, so it lands here too and posts nothing, deliberately (see the header).
      // Resolved inside this transaction, before the legs are built: a cheque may have to
      // self-provision the firm's Cheques in Transit row, and that write must roll back with
      // everything else if the voucher is refused.
      const money = amount > 0 ? await udhaarMoneyAccount(tx, created.firmId, created.transactionType, bankAccountId) : null
      // Decided ONCE, here, from the party's type — see partyAccountFor(). Settlements mirror it.
      const partyAccount = partyAccountFor(created.type, created.type === 'debit' ? await partyTypeOf(tx, created.customerId) : null)
      const legs = money
        ? udhaarLegs(created, amount, isOutward(created.type, false), `Udhaar ${created.type} - ${created.customerName}`, money.name, partyAccount)
        : null
      const voucherId = legs
        ? await postVoucher(tx, {
            firmId: created.firmId,
            userId: user.id,
            type: 'udhaar',
            narration: created.description || `Udhaar ${created.type} - ${created.customerName}`,
            customerId: created.customerId,
            voucherId: udhaarVoucherId(created.id),
            legs,
          })
        : null
      // The handle that lets this cheque be cleared or bounced (src/app/api/bank/transactions/[id]).
      // Without it the in-transit leg above would sit there forever with nothing able to move it.
      // A BOUNCE reverses the whole udhaar voucher, which is right here: no money changed hands, so
      // the receivable and the tender leg both go back. (Contrast a sale, where the goods left the
      // shop and only the cheque leg is corrected.)
      if (voucherId && created.transactionType === 'cheque' && money?.bank?.id) {
        await tx.bankTransaction.create({
          data: {
            firmId: created.firmId, bankAccountId: money.bank.id,
            type: isOutward(created.type, false) ? 'cheque_out' : 'cheque_in',
            amount, transactionDate: created.createdAt, clearingDate: null, status: 'pending',
            chequeNumber: chequeNumber ?? null,
            counterAccountName: partyAccount,
            // Same narration the voucher carries, so the pending-cheque list and the day book read
            // alike — and two cheques from the same party are told apart by what was written on them.
            narration: created.description || `Udhaar ${created.type} - ${created.customerName}`,
            voucherId, userId: user.id,
          },
        })
      }
      await tx.systemLog.create({
        data: {
          userId: user.id, firmId: created.firmId, action: 'create', entity: 'udhaar', entityId: created.id,
          details: `${created.type} ${
            created.metal ? `${grams.toFixed(3)} g ${created.metal}` : `₹${amount.toFixed(2)}`
          } — ${created.customerName}${
            voucherId
              ? ` - voucher ${voucherId}`
              : ` - NOT POSTED (${
                  created.metal
                    ? 'metal udhaar, carried in grams'
                    : created.type === 'advance'
                      ? 'advance direction undetermined'
                      : 'zero amount'
                })`
          }`,
        },
      })
      return { udhaar: created, voucherId }
    })
    return NextResponse.json({
      udhaar,
      voucherId,
      posted: !!voucherId,
      ...(udhaar.metal
        ? { warning: METAL_WARNING }
        : udhaar.type === 'advance' && amount > 0
          ? { warning: ADVANCE_WARNING }
          : {}),
    })
  } catch (e) {
    return ledgerFailure(e)
  }
}

export async function PUT(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = updateSchema.safeParse(await req.json())
  if (!parsed.success) return badRequest(parsed.error)
  const { id, bankAccountId, chequeNumber, ...data } = parsed.data
  const existing = await db.udhaar.findUnique({ where: { id } })
  if (!existing || !(await verifyFirmAccess(user.id, existing.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Same firm-scoping as POST: re-pointing a live row at another shop's customer would put a
  // foreign party id on this firm's settlement vouchers. Closing it on create alone would leave
  // the edit path open, which is no fix at all.
  const notOursPut = await denyForeignCustomer(data.customerId, existing.firmId)
  if (notOursPut) return notOursPut

  // The creation voucher was built from amount/type/transactionType and its legs are immutable.
  // Editing any of them in place would leave the books stating one thing and the row another;
  // the correction is DELETE (which posts a reversal) and re-enter.
  const posted = await db.ledgerEntry.findFirst({
    where: { firmId: existing.firmId, voucherId: udhaarVoucherId(id) },
    select: { id: true },
  })
  if (posted) {
    for (const key of ['amount', 'type', 'transactionType'] as const) {
      const next = key === 'amount' ? (data.amount == null ? null : round2(data.amount)) : data[key]
      if (next != null && next !== existing[key]) {
        return bad(
          `This udhaar entry is already in the ledger, so its ${key} cannot be edited in place. ` +
            'Delete it (which posts a dated reversing voucher) and enter it again.',
        )
      }
    }
  }

  /**
   * ONCE MONEY HAS MOVED, THE TERMS ARE FROZEN. Before the first receipt an operator may fix a
   * mistyped rate or interval freely and the schedule regenerates from the new terms; after it,
   * never — every figure already quoted, split and posted was priced off these terms, and moving
   * one of them re-prices periods that are already settled (oMunim defect 7, in slow motion).
   * The correction after that point is a reversing receipt, not an edit.
   */
  const receipt = await db.udhaarPayment.findFirst({ where: { udhaarId: id, firmId: existing.firmId }, select: { id: true } })
  if (receipt) {
    // settledAmount is OWNED BY THE PAYMENTS ROUTE from the first receipt onwards — it is re-derived
    // there as principal recovered. Letting PUT move it too would post a second, unsplit voucher for
    // money the receipt voucher has already accounted for, and double the Sundry Debtors movement.
    if (data.settledAmount != null && round2(data.settledAmount) !== round2(existing.settledAmount)) {
      return bad(
        'Receipts have been recorded against this udhaar, so the settled figure is derived from them and ' +
          `cannot be typed in. Record the money through POST /api/udhaar/${id}/payments, or reverse a ` +
          'receipt if one was wrong.',
      )
    }
    const FROZEN = [
      'amount', 'type', 'transactionType',
      'interestRate', 'interestType', 'interestStartDate', 'interestEndDate',
      'emiIntervalDays', 'emiOccurrences',
    ] as const
    for (const key of FROZEN) {
      const next = (data as Record<string, unknown>)[key]
      if (next === undefined) continue
      const before = (existing as Record<string, unknown>)[key]
      const time = (v: unknown) => (v instanceof Date ? v.getTime() : v == null ? null : v)
      const same =
        key === 'amount'
          ? round2(next as number) === round2(before as number)
          : time(next) === time(before)
      if (!same) {
        return bad(
          `The terms are frozen once a payment has been taken, so ${key} cannot be changed on this udhaar. ` +
            'Reverse the receipts and re-enter the udhaar if the terms themselves were wrong.',
        )
      }
    }
  }

  /**
   * TWO SETTLEMENT PATHS FOR ONE ROW IS THE DEFECT, not the convenience. On an interest-bearing row
   * a receipt has to be split interest-first and post Interest Income; settledAmount here posts a
   * flat mirror of the disbursal and no interest at all. Whichever the clerk happened to use would
   * decide what the books said about the same money.
   */
  if (existing.interestRate && data.settledAmount != null && round2(data.settledAmount) !== round2(existing.settledAmount)) {
    return bad(
      `This udhaar carries interest, so it is settled by recording the receipt — POST /api/udhaar/${id}/payments ` +
        'with the amount handed over. That splits it interest-first, posts the interest income and re-derives ' +
        'what is left. settledAmount on an interest-bearing udhaar is principal recovered, and it is written by ' +
        'that route alone.',
    )
  }

  // The UNIT of a debt is never edited in place: flipping gold to silver, or metal to money,
  // silently re-denominates what somebody owes. Delete and re-enter.
  if (data.metal !== undefined && (data.metal ?? null) !== (existing.metal ?? null)) {
    return bad('The metal on an udhaar entry cannot be changed — delete it and enter it again')
  }

  const settled = data.settledAmount == null ? existing.settledAmount : round2(data.settledAmount)
  const delta = round2(settled - existing.settledAmount)
  if (delta < 0) {
    return bad(
      'settledAmount cannot be reduced — a settlement that is already in the ledger is undone by a reversal, not by editing the figure down',
    )
  }
  if (settled > round2(existing.amount) + 0.005) {
    return bad(`₹${settled.toFixed(2)} settled is more than the ₹${round2(existing.amount).toFixed(2)} on this entry`)
  }

  // Metal settles in grams on exactly the same rules: forward only, never past the debt.
  const grams = data.grams == null ? existing.grams : roundWeight(data.grams, 3)
  const settledGrams = data.settledGrams == null ? existing.settledGrams : roundWeight(data.settledGrams, 3)
  if (settledGrams < existing.settledGrams - 0.0005) {
    return bad('settledGrams cannot be reduced — correct it with a fresh entry in the opposite direction')
  }
  const unit = checkUnit({
    metal: existing.metal,
    amount: data.amount == null ? round2(existing.amount) : round2(data.amount),
    grams,
    settledAmount: settled,
    settledGrams,
  })
  if (unit) return bad(unit)

  // Clearing the rate clears everything priced off it — leaving an orphan interval or end date on a
  // row that no longer bears interest is dead data that reads as a plan.
  const clearsRate = data.interestRate !== undefined && !(data.interestRate && data.interestRate > 0)
  const nextRate =
    data.interestRate === undefined
      ? existing.interestRate
      : data.interestRate && data.interestRate > 0
        ? data.interestRate
        : null
  // An OMITTED key leaves the column alone; a key sent as null clears it. `?? null` on its own
  // would turn every omission into a clear.
  const keep = <T>(next: T | null | undefined, before: T | null) => (next === undefined ? before : (next ?? null))
  const merged = {
    metal: existing.metal,
    type: data.type ?? existing.type,
    interestRate: nextRate,
    interestType: clearsRate ? null : keep(data.interestType, existing.interestType),
    interestStartDate: clearsRate ? null : keep(data.interestStartDate, existing.interestStartDate),
    interestEndDate: clearsRate ? null : keep(data.interestEndDate, existing.interestEndDate),
    emiIntervalDays: clearsRate ? null : keep(data.emiIntervalDays, existing.emiIntervalDays),
    emiOccurrences: clearsRate ? null : keep(data.emiOccurrences, existing.emiOccurrences),
    createdAt: existing.createdAt,
  }
  const badInterest = checkInterest(merged)
  if (badInterest) return bad(badInterest)
  const interestPatch: Record<string, unknown> = clearsRate
    ? { interestRate: null, interestType: null, interestStartDate: null, interestEndDate: null, emiIntervalDays: null, emiOccurrences: null, interestConvention: null }
    : {}
  // A rate typed onto a row that never had one freezes the firm's policy now, exactly as creation
  // would have. A row that already carries a convention keeps it, always.
  if (nextRate && !existing.interestConvention) {
    interestPatch.interestConvention = await freezeConvention(existing.firmId, nextRate)
  }

  try {
    const { udhaar, voucherId } = await db.$transaction(async (tx) => {
      const updated = await tx.udhaar.update({
        where: { id },
        data: { ...data, settledAmount: settled, grams, settledGrams, ...interestPatch },
      })
      // A settlement is the MIRROR of the row's own creation: a credit given out is settled by cash
      // coming back, a debit is settled by cash going out again. Only the delta is posted, so two
      // part settlements of ₹5,000 post ₹5,000 twice and never ₹10,000.
      const money = delta > 0 ? await udhaarMoneyAccount(tx, updated.firmId, updated.transactionType, bankAccountId) : null
      // The MIRROR of the creation voucher's own party leg — never re-decided from the party's type
      // today, so a legacy debit (posted to Debtors) and a new borrowing (Creditors) each unwind on
      // the account they were booked to. A row that was never posted falls back to the rule.
      const party = money
        ? (await creationPartyAccount(tx, updated.firmId, id)) ??
          partyAccountFor(updated.type, updated.type === 'debit' ? await partyTypeOf(tx, updated.customerId) : null)
        : UDHAAR_RECEIVABLE
      const legs = money
        ? udhaarLegs(updated, delta, isOutward(updated.type, true), `Udhaar settlement - ${updated.customerName}`, money.name, party)
        : null
      const voucherId = legs
        ? await postVoucher(tx, {
            firmId: updated.firmId,
            userId: user.id,
            type: 'udhaar',
            narration: `Udhaar settlement ₹${delta.toFixed(2)} - ${updated.customerName}`,
            customerId: updated.customerId,
            voucherId: settlementVoucherId(id, settled),
            legs,
          })
        : null
      // A settlement cheque is a cheque like any other — it clears or it bounces, and a bounce must
      // put the receivable back. Its own pending row, against its own settlement voucher.
      if (voucherId && updated.transactionType === 'cheque' && money?.bank?.id) {
        await tx.bankTransaction.create({
          data: {
            firmId: updated.firmId, bankAccountId: money.bank.id,
            type: isOutward(updated.type, true) ? 'cheque_out' : 'cheque_in',
            amount: delta, transactionDate: new Date(), clearingDate: null, status: 'pending',
            chequeNumber: chequeNumber ?? null,
            counterAccountName: party,
            narration: `Udhaar settlement ₹${delta.toFixed(2)} - ${updated.customerName}`,
            voucherId, userId: user.id,
          },
        })
      }
      await tx.systemLog.create({
        data: {
          userId: user.id, firmId: existing.firmId, action: 'update', entity: 'udhaar', entityId: id,
          details: `Updated ${Object.keys(data).join(', ') || '(no fields)'} on ${existing.customerName}${
            voucherId ? ` - settled ₹${delta.toFixed(2)}, voucher ${voucherId}` : ''
          }`,
        },
      })
      return { udhaar: updated, voucherId }
    })
    return NextResponse.json({
      udhaar,
      voucherId,
      ...(udhaar.metal
        ? { warning: METAL_WARNING }
        : delta > 0 && !voucherId
          ? { warning: ADVANCE_WARNING }
          : {}),
    })
  } catch (e) {
    return ledgerFailure(e)
  }
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id') || ''
  const existing = await db.udhaar.findUnique({ where: { id } })
  if (!existing || !(await verifyFirmAccess(user.id, existing.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const denied = await denyUnlessRole(user.id, existing.firmId, MANAGER_ROLES, 'delete an udhaar entry (it reverses the vouchers already posted for it)')
  if (denied) return denied

  const reversals: string[] = []
  try {
    await db.$transaction(async (tx) => {
      // Every voucher this row caused: the disbursal `udh-<id>`, any settlement `udh-<id>-s-<n>`
      // and any interest receipt `udh-<id>-p-<paymentId>` — all three share the prefix, so the one
      // scan reverses the lot. The UdhaarPayment rows themselves go with the row (schema cascade).
      // Ids are fixed-length cuids, so one row's prefix cannot match another's.
      // A reversal gets a random voucherId, so this scan never picks up its own output.
      const legs = await tx.ledgerEntry.findMany({
        where: { firmId: existing.firmId, voucherId: { startsWith: udhaarVoucherId(id) } },
        select: { voucherId: true },
        orderBy: { createdAt: 'asc' },
      })
      const voucherIds = Array.from(new Set(legs.map((l) => l.voucherId).filter((v): v is string => !!v)))
      for (const voucherId of voucherIds) {
        const already = await tx.ledgerEntry.findFirst({ where: { firmId: existing.firmId, reversalOfId: voucherId } })
        if (already) continue
        reversals.push(
          await reverseVoucher(tx, {
            firmId: existing.firmId,
            userId: user.id,
            voucherId,
            date: new Date(),
            narration: `Reversal: deleted udhaar ${existing.type} ₹${round2(existing.amount).toFixed(2)} - ${existing.customerName}`,
          }),
        )
      }
      await tx.udhaar.delete({ where: { id } })
      await tx.systemLog.create({
        data: {
          userId: user.id, firmId: existing.firmId, action: 'delete', entity: 'udhaar', entityId: id,
          details: `Deleted ${existing.type} ${
            existing.metal ? `${existing.grams.toFixed(3)} g ${existing.metal}` : `₹${round2(existing.amount).toFixed(2)}`
          } — ${existing.customerName}${
            reversals.length ? ` - reversed ${reversals.length} voucher(s): ${reversals.join(', ')}` : ' - no voucher to reverse'
          }`,
        },
      })
    })
  } catch (e) {
    return ledgerFailure(e)
  }
  return NextResponse.json({ ok: true, reversalVoucherIds: reversals })
}
