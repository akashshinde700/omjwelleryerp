import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, requireFirm, verifyFirmAccess } from '@/lib/session'
import { MANAGER_ROLES, denyForeignCustomer, denyUnlessRole } from '@/app/api/_authz'
import { paging } from '@/app/api/_paging'
import { db } from '@/lib/db'
import { resolveParty } from '@/lib/party'
import { postVoucher, LedgerError, type VoucherLeg } from '@/lib/ledger'
import { financialYear } from '@/lib/accounting'
import { MONEY_ACCOUNTS, PROCESSING_FEE_ACCOUNT, ensureAccount } from '@/app/api/loans/_accounts'
import { LOAN_STATUSES, GIRVI_MAX_LTV_PCT, PLEDGE_PLACES } from '@/lib/constants'
import { LOAN_STALE_DAYS } from '@/lib/attention'
import { REGISTER_CUSTOMER_SELECT, registerFields } from '@/lib/registers'
import { round2 } from '@/lib/gst'
import { maskPii } from '@/lib/pii'
import { IMAGE_DATA_URL_RE, PLEDGE_PHOTO_MAX_CHARS } from '@/lib/image'
import {
  GIRVI_INTEREST_SETTING_KEY,
  describeConvention,
  isDefaultConvention,
  resolveConvention,
  type InterestConvention,
} from '@/lib/interest'

/**
 * Girvi lifecycle. Interest and the outstanding balance are NOT stored here — they are derived
 * from the LoanTransaction history by src/lib/interest.ts. `principalAmount` is the amount
 * originally disbursed; it, the rate and the loan date are PRICING fields, correctable by a manager
 * only while the loan is still active and no money has moved against it (see PUT), never afterwards.
 * Repayments live in LoanTransaction and are posted by
 * POST /api/loans/[id]/payments, which is also the only way a loan reaches 'released'.
 */

const statusEnum = z.enum(LOAN_STATUSES as [string, ...string[]])

const nullableDate = z
  .union([z.string(), z.date(), z.null()])
  .optional()
  .transform((v) => (v === '' || v == null ? null : new Date(v)))
  .refine((d) => d === null || !Number.isNaN(d.getTime()), 'invalid date')

/**
 * A PHOTO OF THE PLEDGE, at the boundary. Stored as a browser-downscaled `data:` URL in the TEXT
 * column — the same storage the firm logo and the invoice banners already use, so there is no
 * upload endpoint, no multipart and nothing on disk to back up.
 *
 * This field was `z.string().nullish()`, which accepted `http://evil/x` (a pledge record that
 * phones out to a third party when it is opened or printed), `javascript:...`, an SVG (a scripting
 * surface), and a 40MB body straight at MySQL. The rule is now the firms logo rule:
 * data URL only, png/jpeg/webp, base64 charset, hard char cap.
 *
 * The regex and the cap come from src/lib/image.ts, which is also what the picker in the loan form
 * encodes against — one definition, so the browser and the server cannot drift into "the form let
 * me take it, the server refuses to save it".
 *
 *   omitted     → undefined   PUT leaves the column alone (see the .partial() note on updateSchema)
 *   '' or null  → null        "no photo" / clear it
 */
const photoUrlSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === null || v.trim() === '' ? null : v.trim()))
  // Length FIRST, then the regex: an oversized string is rejected on a `.length` read instead of
  // scanning 10MB of base64 to learn what the cap already said. (The regex itself is linear — this
  // is about not doing the work at all.)
  .refine((v) => v == null || (v.length <= PLEDGE_PHOTO_MAX_CHARS && IMAGE_DATA_URL_RE.test(v)), {
    message: `Photo must be an image taken or picked in the loan form — PNG, JPEG or WebP, under ${Math.round((PLEDGE_PHOTO_MAX_CHARS * 3) / 4 / 1024)}KB. A web link or a file path is not accepted; re-take the photo from the form and it will be resized for you.`,
  })

const itemSchema = z.object({
  stockItemId: z.string().min(1).nullish(),
  name: z.string().min(1),
  purity: z.string().nullish(),
  grossWeight: z.coerce.number().finite().min(0).default(0),
  netWeight: z.coerce.number().finite().min(0).default(0),
  stoneWeight: z.coerce.number().finite().min(0).nullish(),
  estimatedValue: z.coerce.number().finite().min(0).default(0),
  /** The ornament, photographed at intake. See photoUrlSchema — validated, capped, never a link. */
  photoUrl: photoUrlSchema,
})

// Explicit whitelist. The handler used to spread the client's whole form object into Prisma, which
// let it set id/createdAt/releasedAmount or move a row to another firm.
const fields = z.object({
  loanNo: z.string().min(1).optional(),
  customerId: z.string().min(1).nullish(),
  customerName: z.string().min(1),
  customerMobile: z.string().nullish(),
  loanDate: nullableDate,
  loanType: z.enum(['secured', 'unsecured']).default('secured'),
  /**
   * ROUNDED AT THE BOUNDARY, not at the comparison. The PUT correction gate asks
   * `round2(new) !== round2(old)`, but the raw value was what got stored — so `130000.004` on a
   * ₹130000 loan compared EQUAL, skipped the manager check, the reason and the voucher, and still
   * wrote 130000.004 to the column. A staff login could move a pricing field through a gate that
   * had decided nothing moved. Rounding here makes the value that is compared the value that is
   * stored, which also stops a legitimate manager correction storing a principal the correcting
   * voucher (rounded per leg by postVoucher) can never equal.
   *
   * The refine is after the transform on purpose: `.positive()` passes 0.004, which rounds to 0,
   * and a zero-principal loan is not a loan.
   */
  principalAmount: z.coerce.number().finite().positive().transform(round2).refine((n) => n > 0, 'A principal under ₹0.01 is not a loan'),
  interestRate: z.coerce.number().finite().min(0).max(100).default(2),
  interestType: z.string().default('monthly'),
  timePeriod: z.coerce.number().int().min(0).nullish(),
  dueDate: nullableDate,
  wardNo: z.string().nullish(),
  village: z.string().nullish(),
  city: z.string().nullish(),
  // Money Lenders Act register references. Free strings, not firm ids in disguise: an EX. FIRM is
  // routinely a lender outside this installation. The UI resolves the value to a firm NAME when it
  // matches one, and prints it as typed when it does not.
  exFirmId: z.string().nullish(),
  trFirmId: z.string().nullish(),
  mlFirmId: z.string().nullish(),
  /** Namuna 15 clause (11) — where the pledge is physically kept. */
  pledgePlace: z.enum(PLEDGE_PLACES.map((p) => p.value) as [string, ...string[]]).nullish(),
  /**
   * PHYSICAL CUSTODY — oMunim LOAN/PACKET NO., SELECT BOX, LOAN LOCKER NO. We already print a
   * 55x13mm packet tag with a barcode; until now there was nowhere to write down which box the
   * packet went into, so a shop with 300 live pledges could not find the ornaments. Free text on
   * purpose: every shop numbers its boxes its own way. `boxNo` is auto-assigned at creation when
   * it is left blank and the firm has configured Setting['girvi.boxLocation'] (see assignBox).
   */
  packetNo: z.string().max(60).nullish(),
  boxNo: z.string().max(60).nullish(),
  lockerNo: z.string().max(60).nullish(),
  /** oMunim JOINT LOAN SR NO. — the serial the paper joint-loan register uses. A reference, not a link. */
  jointLoanNo: z.string().max(60).nullish(),
  note: z.string().nullish(),
  // NB: photoUrl is deliberately NOT here — `fields` feeds updateSchema. See createSchema.
})

/**
 * The interest convention, validated at the boundary. Every key is optional: what arrives is a
 * PATCH over the firm's default, and resolveConvention() fills the rest. An unknown key is dropped
 * by zod rather than reaching Prisma — the convention is stored as JSON, so a stray field would be
 * persisted verbatim and read back by resolveConvention() forever.
 */
const conventionSchema = z.object({
  dayBasis: z.enum(['calendar', 'days30']).optional(),
  rounding: z.enum(['exact', 'full', 'half', 'weekly']).optional(),
  compound: z.coerce.boolean().optional(),
  restMonths: z.coerce.number().int().min(0).max(120).optional(),
  rateBasis: z.enum(['monthly', 'annual']).optional(),
  firstMonthFull: z.coerce.boolean().optional(),
  graceDays: z.coerce.number().int().min(0).max(365).optional(),
  slab: z
    .object({
      steps: z
        .array(z.object({ afterMonths: z.coerce.number().positive().max(600), increaseBy: z.coerce.number().min(-100).max(100) }))
        .max(12),
      recurring: z.coerce.boolean().default(false),
    })
    .nullish(),
})

const createSchema = fields.extend({
  firmId: z.string().min(1),
  /**
   * Loan-level photo (the customer / the whole packet). Same rule as the per-item pledge photo, and
   * WRITE-ONCE for the same reason: it is evidence. It lives on createSchema rather than on `fields`
   * so it cannot reach the PUT path — a PUT could previously swap the image and the only trace was
   * `Updated photoUrl on loan A101`, no before, no after. Mutable evidence with no record of the
   * mutation is the worst of both worlds, and the per-ITEM photos were already write-once; this was
   * the odd one out. A wrong photo is corrected the way a wrong figure is: a new record, not an
   * overwrite. If the shop ever genuinely needs re-shoots, that is a distinct logged action
   * ("photo replaced", old length → new length), not a field on the edit form.
   */
  photoUrl: photoUrlSchema,
  /**
   * HARD CEILING — do not remove it as a nuisance. A route handler has no request-body cap (Next's
   * `bodySizeLimit` is Server Actions / Pages API only, and the Caddyfile sets none), so without a
   * `.max()` a single counter session could POST 30MB of items, have JSON.parse materialise it,
   * have zod walk every element, and stall the ONE Node process that serves every firm on the
   * installation. A stored 500-item loan would also make every later GET /api/loans/[id] a 30MB
   * response — an amplifier paid for once. Measured: 500 items × a max-legal 60,000-char photo =
   * 30,013,590 bytes, accepted end to end before this cap existed.
   *
   * 50, not 30: a bridal pledge is itemised piece by piece and a 24-bangle set plus chains,
   * necklace, earrings and rings genuinely reaches the high 30s. 50 leaves headroom over the
   * largest real packet while bounding the worst-case body at ~3MB.
   */
  items: z.array(itemSchema).max(50, 'A loan can carry at most 50 pledged items').default([]),
  /** Per-loan override. Omitted ⇒ the firm's current default ⇒ the built-in default. */
  convention: conventionSchema.nullish(),
  /**
   * oMunim ADD NEW LOAN: WITH PROCESSING AMT. A one-off fee DEDUCTED from the cash handed over —
   * the customer signs for the full principal and walks out with principal − fee, which is how a
   * girvi shop charges it. Create-only: it moves money, so it can never be edited onto a live loan
   * by a PUT. A loan booked without a fee that should have had one is corrected by a receipt.
   */
  processingFee: z.coerce.number().finite().min(0).default(0),
})

// No defaults on PUT: an omitted field must be left alone, not reset to a schema default.
// status/releasedAmount are deliberately absent — a release is a payment, not a field edit.
// `convention` is deliberately absent too: re-pricing a live pledge after the fact is not an edit
// either. A loan written under the wrong convention is closed and re-written, leaving both on the
// record. See `fields` — it has never carried interestConvention, so PUT cannot reach the column.
const updateSchema = fields.partial().extend({
  id: z.string().min(1),
  status: statusEnum.optional(),
  /**
   * WHY a correction was made. Optional here and mandatory in the handler (see PRICING_FIELDS):
   * a ward-number edit should not have to justify itself, a re-priced loan always must. It is
   * never stored on the Loan — a column would be the last reason only, overwritten by the next
   * edit; the SystemLog keeps every one of them, dated and attributed.
   */
  // .max() to match note fields elsewhere: `details` is a TEXT column, so an unbounded reason wrote
  // 60KB audit rows, and anything over 64KB failed the whole correction with a 500 instead of a 400.
  reason: z.string().trim().min(5).max(500).optional(),
  /**
   * .partial() makes a key optional but does NOT strip the `.default()` underneath it: zod still
   * substitutes the default for an omitted key, so `fields.partial().parse({ note: 'x' })` returns
   * `{ note: 'x', loanType: 'secured', interestRate: 2, interestType: 'monthly' }`.
   *
   * Every PUT therefore RE-RATED the loan. Editing a ward number on a 3%/month pledge quietly reset
   * it to 2% and turned an unsecured loan secured — no error, no log line, and the loan screen then
   * showed and charged the new rate for the rest of its life. Found by tests/api/loan-convention.spec.ts.
   *
   * These three are re-declared WITHOUT a default so an omitted key stays omitted. Any future
   * defaulted field in `fields` must be repeated here as well.
   */
  loanType: z.enum(['secured', 'unsecured']).optional(),
  interestRate: z.coerce.number().finite().min(0).max(100).optional(),
  interestType: z.string().optional(),
})

/**
 * ── THE GIRVI STATE MACHINE ───────────────────────────────────────────────────────────────────
 *
 *   active ──POST /payments (type=release)──────────────→ released
 *   active ──POST /auction ─────────────────────────────→ auctioned   (pledge sold)
 *   active ──POST /auction (outcome=loss)──────────────→ loss        (nothing realised)
 *   active ──PUT status ───────────────────────────────→ transferred | tally
 *   released | auctioned | loss | transferred           TERMINAL — undone only by reversing the
 *                                                       closing LoanTransaction
 *   tally  ──PUT status ───────────────────────────────→ active       (tally is a review marker)
 *
 * PUT used to accept ANY status string on any loan, so `released → active` was one silent request
 * and the closing ledger entries stayed behind describing a settlement that no longer existed.
 * A transition is now either listed below or refused.
 */
const MONEY_MOVING_STATUS: Record<string, string> = {
  released: 'Release a loan through POST /api/loans/{id}/payments with type=release, so the interest is derived and the ledger is posted',
  auctioned: 'Record an auction through POST /api/loans/{id}/auction, so the proceeds, the charges and the SIGNED surplus or shortfall are posted',
  loss: 'Write a loan off through POST /api/loans/{id}/auction with outcome=loss, so the bad debt is posted and Loans Given is cleared',
  transferred:
    'Re-pledging is not a status flag. POST /api/loans/{id}/transfer with action=repledge, which posts the money the financier advanced (Dr Cash, Cr Financier Loans Payable) and starts the second interest stream. The loan STAYS active — the customer still owes you and can still redeem.',
}

/**
 * 'transferred' used to be reachable by a bare PUT and posted NOTHING: the shop's own borrowing
 * against the pledge existed nowhere in its books, and the loan went terminal so the customer could
 * no longer pay it. Both were wrong. A re-pledge is now POST /api/loans/{id}/transfer, it posts a
 * real liability, and the loan stays active with two interest streams running on it.
 *
 * The status itself is left in LOAN_STATUSES for the rows that already carry it; nothing new
 * reaches it, and a legacy 'transferred' row is terminal exactly as it was.
 */
const PUT_TRANSITIONS: Record<string, readonly string[]> = {
  active: ['tally'],
  tally: ['active'],
  released: [],
  auctioned: [],
  loss: [],
  transferred: [],
}

/**
 * Every LoanItem column EXCEPT photoUrl — the shape every MULTI-row or echo-back response uses.
 * A pledge photo is up to 60,000 chars of base64 (PLEDGE_PHOTO_MAX_CHARS) and the list caps at 300
 * loans, so selecting it here is a multi-megabyte response; the bytes are served one loan at a time
 * by GET /api/loans/[id]. Do not add photoUrl back.
 */
export const LIST_ITEM_SELECT = {
  id: true, loanId: true, stockItemId: true, name: true, purity: true,
  grossWeight: true, netWeight: true, stoneWeight: true, estimatedValue: true, createdAt: true,
} as const

function badRequest(err: z.ZodError) {
  return NextResponse.json({ error: 'Invalid request', details: z.treeifyError(err) }, { status: 400 })
}

/**
 * THE PLEDGER MUST BELONG TO THIS FIRM. Loan.customerId is a plain FK: it proves the Customer row
 * exists SOMEWHERE on the installation, never that it is this shop's party. So a firm could stamp
 * another firm's customer id onto its own loan, and that id then travelled
 *   - onto every LedgerEntry, via postVoucher({ customerId }) — the disbursal here, the principal
 *     correction in PUT, and every receipt the payments/topup/auction routes post afterwards, so
 *     the receivable was attributed to a party who does not appear in that book at all; and
 *   - back out through the `include: { customer: ... }` join on GET /api/loans and
 *     GET /api/loans/[id] — the identifiers are masked, but name, mobile, village, father's name
 *     and caste are not, so the loan list returned another firm's register row.
 *
 * Checked at BOTH write paths — create alone would leave the edit path open. Nothing else needs a
 * check: every other loans handler ([id]/payments, [id]/topup, [id]/auction, [id]/transfer) takes
 * customerId from the STORED loan, never from a request body, so they inherit this one.
 *
 * The guard itself now lives in src/app/api/_authz.ts as denyForeignCustomer: the same rule had
 * been hand-copied into /api/udhaar and /api/schemes/[id]/entries and was MISSING from
 * /api/invoices, /api/quotations, /api/orders, /api/repairs, /api/tasks and /api/ledger. One
 * function, one message, every call site.
 */

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  /**
   * TENANT ISOLATION. This used to be `if (firmId && !verifyFirmAccess(...)) 403` over a `where`
   * that only gained `firmId` when one was supplied — so OMITTING firmId skipped BOTH the access
   * check and the scoping, and any signed-in session read every shop's loan book on the
   * installation. A pawnbroker's whole pledge register, customers and all, one query string short.
   * requireFirm() makes the firm mandatory: no firmId is a 400, someone else's is a 403.
   */
  const firmId = await requireFirm(searchParams, user)
  if (firmId instanceof NextResponse) return firmId
  const status = searchParams.get('status')
  const search = searchParams.get('search') || ''
  const where: any = { firmId }
  if (status && status !== 'all') where.status = status
  // Every multi-column filter goes into this ONE array as its own `{ OR: [...] }`. ?overdue and
  // ?search both used to assign `where.OR` directly, so `?overdue=true&search=x` silently dropped
  // the overdue half and returned every matching loan — wrong rows, no error.
  const AND: any[] = []
  // ?overdue=true — the same rule as isLoanOverdue() in src/lib/attention.ts, evaluated in MySQL.
  // The notification bell and the Home tile only ever show a handful, and pulling every active loan
  // with its items and transactions to filter in the browser cost ~792KB per render — and silently
  // under-reported once a firm passed this list's row cap.
  // daysSince() floors, so `> LOAN_STALE_DAYS` first becomes true on day 181: loanDate <= now-181d.
  if (searchParams.get('overdue') === 'true') {
    const now = new Date()
    const staleOn = new Date(now.getTime() - (LOAN_STALE_DAYS + 1) * 86_400_000)
    AND.push({ OR: [{ dueDate: { lt: now } }, { AND: [{ dueDate: null }, { loanDate: { lte: staleOn } }] }] })
  }
  if (search) {
    // A register column you cannot search is no use to an inspector standing at the counter, so the
    // free-text box reaches the joined Customer columns (CASTE / ADHAAR / FATHER NAME / TALUKA)
    // as well as the loan's own. Nested relation filters, so the search runs in MySQL rather than
    // by pulling 300 rows and filtering in the browser.
    AND.push({ OR: [
      { loanNo: { contains: search } },
      // The counter searches for a packet the same way it searches for a customer.
      { packetNo: { contains: search } },
      { boxNo: { contains: search } },
      { lockerNo: { contains: search } },
      { jointLoanNo: { contains: search } },
      { customerName: { contains: search } },
      { customerMobile: { contains: search } },
      { village: { contains: search } },
      { city: { contains: search } },
      { wardNo: { contains: search } },
      { customer: { caste: { contains: search } } },
      // NO `customer.aadhaar` CLAUSE HERE — see the register filter loop below for why.
      { customer: { fatherSpouse: { contains: search } } },
      { customer: { tehsil: { contains: search } } },
      { customer: { village: { contains: search } } },
      { customer: { city: { contains: search } } },
    ] })
  }
  // Statutory register filters, exactly the columns oMunim makes first-class on its loan list.
  // ward/village/city sit on the Loan when the counter recorded them and on the Customer otherwise,
  // so each one matches EITHER — the same loan-first/customer-fallback rule registerFields() uses
  // for display. A filter that disagreed with the column it filters is worse than no filter.
  const eq = (v: string | null) => (v ? { contains: v } : undefined)
  for (const [param, loanCol, custCol] of [
    ['village', 'village', 'village'],
    ['city', 'city', 'city'],
    ['wardNo', 'wardNo', 'wardNo'],
  ] as const) {
    const v = eq(searchParams.get(param))
    if (v) AND.push({ OR: [{ [loanCol]: v }, { customer: { [custCol]: v } }] })
  }
  /**
   * NO AADHAAR MATCHER — do not add one back, here or to ?search= above.
   *
   * `{ customer: { aadhaar: { contains: v } } }` is a blind oracle. The list masks the value on the
   * way out, so nobody can READ an Aadhaar from the response — but the ROW COUNT answers "does this
   * firm hold an Aadhaar starting 4…?", and ~120 unlogged requests walk out all 12 digits one
   * character at a time. Query strings also land in the server's access logs, so the guessed digits
   * are written down twice.
   *
   * Why deleted outright rather than hashed, exact-matched or moved to a POST body:
   *   (a) nothing calls it — no call site in src/ (the register filter panel in
   *       modules/loans.tsx sends village/city/wardNo/caste/taluka only), none in mobile/, no test;
   *   (b) a hash column is a schema change, and three migrations are already queued against the
   *       owner's live database, so it could not ship today;
   *   (c) an exact match would still put a full Aadhaar in an access log for a feature nobody calls;
   *   (d) the two lawful full-Aadhaar paths already exist and are BOTH audited —
   *       GET /api/customers/[id]?reveal=aadhaar&reason=… and GET /api/loans/registers?reveal=aadhaar,
   *       each writing a SystemLog `reveal` row through resolveReveal() in src/lib/pii.ts.
   * Removing an unused blind search removes the only UNLOGGED path to the number, not a lawful one.
   *
   * caste / taluka / village / city / wardNo stay: they are Money Lenders Act register columns an
   * inspector filters on, not identifiers.
   */
  for (const [param, custCol] of [['caste', 'caste'], ['taluka', 'tehsil']] as const) {
    const v = eq(searchParams.get(param))
    if (v) AND.push({ customer: { [custCol]: v } })
  }
  // Exact-value filters. boxNo/packetNo/lockerNo are the packet-box report: "what is in box A-2026-27"
  // has to be answerable at the counter with the ornaments in front of you, and transferStatus is
  // the TRANSFERED / UNSETTLED TRANS. LOANS split.
  for (const col of [
    'loanType', 'exFirmId', 'trFirmId', 'mlFirmId', 'pledgePlace',
    'boxNo', 'packetNo', 'lockerNo', 'jointLoanNo', 'transferStatus',
  ] as const) {
    const v = searchParams.get(col)
    if (v && v !== 'all') AND.push({ [col]: v })
  }
  if (AND.length) where.AND = AND

  const page = paging(searchParams, 300)
  const [loans, total] = await Promise.all([
    db.loan.findMany({
      where,
      orderBy: { loanDate: 'desc' },
      ...page,
      // transactions travel with the loan so the list can DERIVE interest and total due instead of
      // charging interest on the full principal forever (src/lib/interest.ts deriveLoan).
      // customer travels with it so the Money Lenders Act register columns (CASTE, TALUKA, ADHAAR NO.,
      // FATHER NAME, PHONE NO) resolve without a second round trip — they were always in the schema,
      // on Customer; the loan list simply never joined them.
      include: {
        // No photoUrl — see LIST_ITEM_SELECT. 300 loans × several ornaments × 60,000 chars is the
        // same class of regression as the ~792KB one recorded above. Each item gets a `hasPhoto`
        // boolean instead, filled in below.
        items: { select: LIST_ITEM_SELECT },
        transactions: { orderBy: { date: 'asc' } },
        customer: { select: REGISTER_CUSTOMER_SELECT },
      },
    }),
    db.loan.count({ where }),
  ])
  // WHICH ITEMS CARRY A PHOTO — ids only. MySQL evaluates `photoUrl IS NOT NULL` and returns no
  // image bytes at all, one indexed query on loanId for the whole page, so the list can show a
  // camera marker without the payload it was just spared. (A blank photo is stored as NULL by
  // photoUrlSchema, so IS NOT NULL is exactly "has a photo".)
  const withPhotoIds = loans.length
    ? new Set(
        (
          await db.loanItem.findMany({
            where: { loanId: { in: loans.map((l) => l.id) }, NOT: { photoUrl: null } },
            select: { id: true },
          })
        ).map((i) => i.id),
      )
    : new Set<string>()
  // Flattened alongside the row, never instead of it: the client filters and searches on `register`
  // without walking a nested relation, and nothing downstream has to re-implement the fallback.
  //
  // Both copies of the identifier are masked: `register.aadhaarNo` by registerFields, and the joined
  // `customer` object it was read from, which carries the same number a level down. This list has no
  // reveal path — a 300-row list is a bulk export, and the audited single-record and statutory
  // register endpoints are the two ways to a full Aadhaar.
  return NextResponse.json({
    loans: loans.map((l) => ({
      ...l,
      // The loan's own photo is a TEXT column on every row of this page for the same reason; the
      // detail endpoint serves it. Prisma has no "all columns except" on the root model, so it is
      // dropped here rather than by listing 60 Loan columns that would rot on the next migration.
      photoUrl: undefined,
      hasPhoto: !!l.photoUrl,
      items: l.items.map((i) => ({ ...i, hasPhoto: withPhotoIds.has(i.id) })),
      customer: l.customer ? maskPii(l.customer) : l.customer,
      register: registerFields(l as any),
    })),
    total,
    limit: page.take,
    skip: page.skip,
  })
}

/**
 * Loan-to-value against the appraised value of the pledge.
 *
 * A WARNING, NEVER A BLOCK — over-lending to a known customer is a commercial call a pawnbroker is
 * entitled to make; not noticing it is not. oMunim put ₹14,82,926 out against a pledge appraised at
 * ₹1,02,976 — 14.4x — in silence, and recorded the outcome in a "loss" column months later.
 *
 * Uses GIRVI_MAX_LTV_PCT, the SAME constant the girvi calculator quotes "Max Loan" from, so the
 * threshold the counter was shown before writing the loan is the threshold the create warns on.
 * Unsecured loans have no pledge and are skipped; a secured loan with no appraised value on any
 * item gets its own warning, because an LTV nobody can compute is not an LTV that is fine.
 */
function ltvWarning(
  loanType: string,
  principal: number,
  items: { estimatedValue?: number | null }[],
): string | null {
  if (loanType !== 'secured') return null
  const pledgeValue = round2(items.reduce((s, i) => s + (i.estimatedValue || 0), 0))
  if (pledgeValue <= 0) {
    return items.length
      ? 'No appraised value on the pledged items, so the loan-to-value could not be checked. Record an estimated value against each ornament.'
      : 'Secured loan with no pledged items recorded, so the loan-to-value could not be checked.'
  }
  const ltv = round2((principal / pledgeValue) * 100)
  if (ltv <= GIRVI_MAX_LTV_PCT) return null
  return `Over-lending: ₹${principal} against a pledge appraised at ₹${pledgeValue} is ${ltv}% LTV, above the ${GIRVI_MAX_LTV_PCT}% ceiling. Maximum at the ceiling is ₹${round2((pledgeValue * GIRVI_MAX_LTV_PCT) / 100)}. The loan has been created.`
}

/**
 * oMunim LOAN ITEM BOX LOCATION SETTING — auto-assign a storage box by loan amount and financial
 * year, so the counter does not have to remember the filing rule for the thousandth pledge.
 *
 * Setting['girvi.boxLocation'], per firm, as JSON:
 *   { "ranges": [ { "upto": 25000, "box": "A" }, { "upto": 100000, "box": "B" }, { "box": "C" } ],
 *     "byFinancialYear": true }
 *
 * The first band whose `upto` covers the principal wins; a band with no `upto` is the catch-all.
 * With byFinancialYear the FY is appended, so a ₹40,000 pledge taken in June 2026 files to
 * "B-2026-27" and the same shelf is reused next year without mixing the two years' packets.
 *
 * ADVISORY ONLY, and only when the operator left the box blank: a typed box is never overwritten,
 * and a firm with no setting gets no box rather than a guess. It never throws — a malformed setting
 * must not be able to stop a loan being written.
 */
// Not exported: a route module may only export its HTTP handlers.
const GIRVI_BOX_SETTING_KEY = 'girvi.boxLocation'

function assignBox(raw: string | null | undefined, principal: number, on: Date): string | null {
  if (!raw) return null
  try {
    const cfg = JSON.parse(raw) as { ranges?: { upto?: number | null; box?: string }[]; byFinancialYear?: boolean }
    const ranges = (cfg.ranges ?? [])
      .filter((r) => typeof r?.box === 'string' && r.box.trim())
      .map((r) => ({ upto: typeof r.upto === 'number' && Number.isFinite(r.upto) ? r.upto : Infinity, box: r.box!.trim() }))
      .sort((a, b) => a.upto - b.upto)
    const hit = ranges.find((r) => principal <= r.upto)
    if (!hit) return null
    return cfg.byFinancialYear ? `${hit.box}-${financialYear(on).label.replace(/^FY /, '')}` : hit.box
  } catch {
    return null
  }
}

/**
 * The firm's CURRENT default convention, from Setting['girvi.interest'].convention. Read only when
 * a loan is created; never when one is read back. A missing or unreadable setting is the built-in
 * default, so a firm that has never opened the settings screen behaves exactly as it always has.
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

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return badRequest(parsed.error)
  const { items, firmId, loanNo, loanDate, convention, processingFee, ...loanData } = parsed.data
  if (!(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const notOurs = await denyForeignCustomer(loanData.customerId, firmId)
  if (notOurs) return notOurs

  const date = loanDate || new Date()
  // The convention is resolved HERE, once, and frozen onto the row: what the request sent, else the
  // firm's current policy, else the built-in default. It is never re-read afterwards, which is the
  // whole point — a firm that switches to "full month" in April must not re-price a March pledge.
  const resolved = resolveConvention({ ...(await firmConvention(firmId)), ...(convention ?? {}) })
  const ltv = ltvWarning(loanData.loanType, loanData.principalAmount, items)
  const fee = round2(processingFee)
  if (fee >= loanData.principalAmount) {
    return NextResponse.json(
      { error: `A processing fee of ₹${fee.toFixed(2)} is not less than the ₹${loanData.principalAmount.toFixed(2)} principal — the customer would receive nothing.` },
      { status: 400 },
    )
  }
  // Auto-filed only when the operator left the box blank; a typed box always wins.
  const boxNo =
    loanData.boxNo ||
    assignBox(
      (await db.setting.findUnique({ where: { firmId_key: { firmId, key: GIRVI_BOX_SETTING_KEY } } }))?.value,
      loanData.principalAmount,
      date,
    )
  try {
    // The loan, its pledged items, its disbursal voucher and the audit row land together or not at
    // all. Previously the loan was created first and the ledger legs in a separate untransacted
    // call, so a failure there left a disbursal with no debit.
    const loan = await db.$transaction(async (tx) => {
      const party = await resolveParty(tx, { firmId, userId: user.id, source: 'loan', customerId: loanData.customerId, name: loanData.customerName, mobile: loanData.customerMobile })
      const count = await tx.loan.count({ where: { firmId } })
      const created = await tx.loan.create({
        data: {
          ...loanData,
          customerId: party.id,
          firmId,
          userId: user.id,
          loanDate: date,
          status: 'active',
          loanNo: loanNo || 'A' + (101 + count),
          // NULL for the default convention: the column then says "priced the way everything
          // always was", and a legacy row and a new default row read back identically.
          interestConvention: isDefaultConvention(resolved) ? null : JSON.stringify(resolved),
          boxNo,
          processingFee: fee > 0 ? fee : null,
          items: items.length ? { create: items } : undefined,
        },
        // Echo back the list shape, photos excluded (LIST_ITEM_SELECT): the client just sent the
        // images, and this response is merged into the loans list.
        include: { items: { select: LIST_ITEM_SELECT }, transactions: true },
      })
      // Disbursal: Dr Loans Given (the asset the customer owes in full), Cr Cash for what actually
      // left the drawer, Cr Loan Processing Fee for the part he never received. The customer owes
      // the WHOLE principal either way — the fee is income earned at disbursal, not a smaller loan.
      //   ₹50,000 at a ₹500 fee: Dr Loans Given 50,000 / Cr Cash 49,500 / Cr Processing Fee 500.
      const feeAccount = fee > 0 ? await ensureAccount(tx, firmId, PROCESSING_FEE_ACCOUNT) : null
      await postVoucher(tx, {
        firmId,
        userId: user.id,
        date,
        type: 'loan',
        narration: `Loan ${created.loanNo} - ${created.customerName}`,
        loanId: created.id,
        customerId: created.customerId,
        legs: ([
          { accountName: 'Loans Given', debit: created.principalAmount },
          { accountName: MONEY_ACCOUNTS.cash, credit: round2(created.principalAmount - fee), particulars: `Disbursed ${created.loanNo}`, type: 'payment' },
          feeAccount ? { accountName: feeAccount, credit: fee, particulars: `Processing fee on ${created.loanNo}` } : null,
        ].filter(Boolean) as VoucherLeg[]).filter((l) => (l.debit || l.credit || 0) > 0),
      })
      await tx.systemLog.create({
        data: {
          userId: user.id, firmId, action: 'create', entity: 'loan', entityId: created.id,
          // The over-lending warning goes in the audit trail, not only on the operator's screen: a
          // toast that was clicked away is not a record that anybody was told.
          details:
            `New ${created.loanType} loan ${created.loanNo} ₹${created.principalAmount} @ ${created.interestRate}%` +
            // The convention goes in the audit trail because it is what priced the loan. Six months
            // on, "why was this one charged a full month?" has to be answerable from the log alone.
            ` — priced by: ${describeConvention(resolved)}` +
            (fee > 0 ? ` — processing fee ₹${fee.toFixed(2)} deducted, paid out ₹${round2(created.principalAmount - fee).toFixed(2)}` : '') +
            (created.boxNo ? ` — filed in box ${created.boxNo}` : '') +
            (ltv ? ` — LTV WARNING: ${ltv}` : ''),
        },
      })
      return created
    })
    return NextResponse.json({ loan, warnings: ltv ? [ltv] : [] })
  } catch (e) {
    if (e instanceof LedgerError) return NextResponse.json({ error: e.message, code: e.code }, { status: 400 })
    throw e
  }
}

/**
 * ── PRICING FIELDS ────────────────────────────────────────────────────────────────────────────
 *
 * principalAmount, interestRate and loanDate are not register columns, however much the edit form
 * makes them look like three more boxes. deriveLoan() (src/lib/interest.ts) REPLAYS every
 * LoanTransaction against all three, so changing one retroactively re-prices interest that was
 * already charged, receipted and posted — while those receipts' ledger legs stay at the old
 * figures. And the disbursal voucher stands behind the OLD principal, so moving the loan without
 * moving the books leaves 'Loans Given' describing an amount nobody lent.
 *
 * Refusing every correction is its own failure, though: a counter operator genuinely does mistype
 * a rate the morning a loan is written, and a shop that cannot correct it will delete the loan and
 * re-key it, which loses the history entirely. So correction is allowed exactly in the window
 * where it is provably safe — manager, loan still active, not one rupee moved against it yet — and
 * it costs a reason, a voucher and a log line that names old → new.
 *
 * Once money has moved, a correction is a REVERSAL, not an edit. That path already exists.
 */
export async function PUT(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = updateSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return badRequest(parsed.error)
  // `reason` is destructured out with id/status because it is NOT a Loan column — anything left in
  // `data` is spread straight into db.loan.update, and Prisma throws on an unknown field.
  const { id, status, reason, ...data } = parsed.data
  const existing = await db.loan.findUnique({ where: { id } })
  if (!existing || !(await verifyFirmAccess(user.id, existing.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // Scoped to the LOAN's firm, not to anything the body sent: `fields` has no firmId, so a loan can
  // never be walked into another tenant, and re-pointing it at a foreign party is refused here.
  const notOurs = await denyForeignCustomer(data.customerId, existing.firmId)
  if (notOurs) return notOurs
  if (status && status !== existing.status) {
    // A status move reaches auctioned/loss/transferred — writing off a debt. Raising or editing a
    // loan stays with the counter; ending one does not.
    const deniedPut = await denyUnlessRole(user.id, existing.firmId, MANAGER_ROLES, 'change a loan status')
    if (deniedPut) return deniedPut
    const via = MONEY_MOVING_STATUS[status]
    // A status that moves money must produce a LoanTransaction, balanced ledger legs and a figure
    // nobody can overtype. It is never a field patch.
    if (via) return NextResponse.json({ error: via }, { status: 400 })
    if (!(PUT_TRANSITIONS[existing.status] || []).includes(status)) {
      return NextResponse.json(
        {
          error:
            `Loan ${existing.loanNo} cannot go ${existing.status} → ${status}. ` +
            (PUT_TRANSITIONS[existing.status]?.length
              ? `From ${existing.status} this endpoint allows: ${PUT_TRANSITIONS[existing.status].join(', ')}.`
              : `${existing.status} is terminal; undo it with an explicit reversal first.`),
        },
        { status: 400 },
      )
    }
  }
  // WHICH pricing fields actually moved. A value the edit form posted back unchanged — it renders
  // every box it holds — is not a correction and must not drag a loan through any of the gates
  // below; only a figure that genuinely differs from the stored row counts.
  const day = (d: Date) => d.toISOString().slice(0, 10)
  const priced: { field: string; from: string; to: string }[] = []
  // EXACT, not round2-vs-round2: the incoming figure is already rounded by the schema, so comparing
  // rounded copies could only ever hide a difference that the update then wrote to the column.
  if (data.principalAmount !== undefined && data.principalAmount !== existing.principalAmount) {
    priced.push({ field: 'principalAmount', from: String(existing.principalAmount), to: String(data.principalAmount) })
  }
  if (data.interestRate !== undefined && data.interestRate !== existing.interestRate) {
    priced.push({ field: 'interestRate', from: String(existing.interestRate), to: String(data.interestRate) })
  }
  if (data.loanDate !== undefined) {
    // The column is NOT NULL and a pledge with no date has no interest to derive, so an emptied
    // date is a 400 rather than a Prisma failure the operator sees as a 500.
    if (data.loanDate === null) {
      return NextResponse.json({ error: 'A loan must keep a date. Send the corrected loanDate rather than an empty one.' }, { status: 400 })
    }
    if (data.loanDate.getTime() !== existing.loanDate.getTime()) {
      // A shift WITHIN one day is still a pricing change (it can cross a convention's day boundary),
      // and `loanDate 2026-06-15 → 2026-06-15` is an audit line that says nothing moved. Fall back
      // to the full instant when the dates print the same.
      const [from, to] = [day(existing.loanDate), day(data.loanDate)]
      priced.push(
        from === to
          ? { field: 'loanDate', from: existing.loanDate.toISOString(), to: data.loanDate.toISOString() }
          : { field: 'loanDate', from, to },
      )
    }
  }

  // delta = new principal − old. 0 when the principal did not move, which is also "post nothing".
  let delta = 0
  if (priced.length) {
    // Same bar as ending a loan: raising or annotating one stays with the counter, re-pricing one
    // does not.
    const deniedPricing = await denyUnlessRole(
      user.id, existing.firmId, MANAGER_ROLES, `correct ${priced.map((p) => p.field).join(', ')} on a loan`,
    )
    if (deniedPricing) return deniedPricing
    if (existing.status !== 'active') {
      return NextResponse.json(
        {
          error:
            `Loan ${existing.loanNo} is ${existing.status} and its pricing can no longer be edited. ` +
            'Reverse the closing transaction first; correcting a settled loan in place would re-price a receipt the customer has already been given.',
        },
        { status: 400 },
      )
    }
    /**
     * NOT ONE RUPEE MOVED YET — the whole basis of this window. Every live row on either stream
     * counts, of any type: a part payment and a top-up were both priced by these three fields, and
     * a transfer leg was posted against them too. A reversal, and a row that has itself been
     * reversed, are excluded — the replay drops both (src/lib/interest.ts:571-573), so they price
     * nothing and must not block a correction for ever.
     */
    const txns = await db.loanTransaction.findMany({ where: { loanId: id }, select: { id: true, reversalOfId: true } })
    const reversedIds = new Set(txns.map((t) => t.reversalOfId).filter(Boolean) as string[])
    const live = txns.filter((t) => !t.reversalOfId && !reversedIds.has(t.id))
    if (live.length) {
      return NextResponse.json(
        {
          error:
            `Loan ${existing.loanNo} already has ${live.length} recorded transaction${live.length === 1 ? '' : 's'}, ` +
            'so its principal, rate and date cannot be edited — doing so would re-price interest that has already been ' +
            'charged, receipted and posted. Reverse the affected payment(s) with ' +
            'POST /api/loans/{id}/payments/{txId}/reverse, correct the loan, then re-enter them.',
        },
        { status: 400 },
      )
    }
    // Mandatory only here, which is why it is checked in the handler and not in updateSchema: an
    // ordinary register edit must not start demanding an essay. Six months on, "why is this loan
    // ₹13,000 when the pledge card says ₹1,30,000?" has to be answerable from the log alone.
    if (!reason) {
      return NextResponse.json(
        { error: `Correcting ${priced.map((p) => p.field).join(', ')} on loan ${existing.loanNo} needs a reason (at least 5 characters) — it goes into the audit trail.` },
        { status: 400 },
      )
    }
    if (data.principalAmount !== undefined) delta = round2(data.principalAmount - existing.principalAmount)
  }

  const update: any = { ...data }
  if (status) update.status = status

  try {
    const loan = await db.$transaction(async (tx) => {
      // Same exclusion as the list (LIST_ITEM_SELECT): a PUT cannot touch items anyway — `fields` has
      // no `items` key, so updateSchema drops it — and the edit screen has no use for the bytes.
      const updated = await tx.loan.update({
        where: { id },
        data: update,
        include: { items: { select: LIST_ITEM_SELECT }, transactions: true },
      })
      /**
       * The books follow the loan, in the same transaction or not at all. The disbursal posted
       * Dr Loans Given / Cr Cash for the OLD principal; this posts only the difference, so the two
       * vouchers together say what was actually lent and the asset stops describing money nobody
       * received. postVoucher is the only sanctioned path — it proves Σdebit == Σcredit before a
       * single leg is written.
       *
       * The money account is MONEY_ACCOUNTS.cash because that is the account the disbursal used:
       * a loan carries no payment mode, so cash is the only account it could have been. Mirrored,
       * never re-chosen — a correction posted to a different account than the disbursal is two
       * wrong balances instead of one.
       *
       * The PROCESSING FEE IS NOT RECOMPUTED. It was income earned and posted at disbursal against
       * the old principal; re-deriving it would move money the customer already did or did not
       * receive. If the fee is wrong too, it is corrected by its own receipt. The log line says so
       * when a fee exists, so an auditor can see which principal the fee relates to.
       */
      let correctionVoucherId: string | null = null
      if (delta !== 0) {
        correctionVoucherId = await postVoucher(tx, {
          firmId: existing.firmId,
          userId: user.id,
          // Dated with the loan's own date, not today: the whole point of this window is that
          // nothing has happened to the loan since disbursal, so the corrected asset should stand
          // from the day the loan says it was given rather than leaving 'Loans Given' wrong for a
          // stretch of days that the statements would then print.
          date: updated.loanDate,
          type: 'loan',
          narration: `Principal correction ${updated.loanNo} - ${updated.customerName}`,
          loanId: updated.id,
          customerId: updated.customerId,
          legs:
            delta > 0
              ? [
                  { accountName: 'Loans Given', debit: delta },
                  { accountName: MONEY_ACCOUNTS.cash, credit: delta, particulars: `Further disbursed on ${updated.loanNo}`, type: 'payment' },
                ]
              : [
                  { accountName: MONEY_ACCOUNTS.cash, debit: -delta, particulars: `Over-disbursal returned on ${updated.loanNo}`, type: 'receipt' },
                  { accountName: 'Loans Given', credit: -delta },
                ],
        })
      }
      await tx.systemLog.create({
        data: {
          userId: user.id,
          firmId: existing.firmId,
          action: priced.length ? 'correction' : status ? 'status' : 'update',
          entity: 'loan',
          entityId: id,
          // A correction line names old → new for every field, the reason verbatim and the voucher,
          // because `Updated principalAmount on loan A103` tells an auditor nothing at all.
          details: priced.length
            ? `Corrected loan ${existing.loanNo}: ${priced.map((p) => `${p.field} ${p.from} → ${p.to}`).join(', ')}` +
              ` — reason: ${JSON.stringify(reason)}` +
              (correctionVoucherId ? ` — correction voucher ${correctionVoucherId}` : '') +
              (delta !== 0 && existing.processingFee
                ? ` — processing fee ₹${existing.processingFee.toFixed(2)} NOT recomputed; it still relates to the old principal ₹${existing.principalAmount}`
                : '') +
              (status && status !== existing.status ? ` — status ${existing.status} → ${status}` : '')
            : status
              ? `Loan ${existing.loanNo}: ${existing.status} → ${status}`
              : `Updated ${Object.keys(data).join(', ') || '(no fields)'} on loan ${existing.loanNo}`,
        },
      })
      return updated
    })
    return NextResponse.json({ loan })
  } catch (e) {
    if (e instanceof LedgerError) return NextResponse.json({ error: e.message, code: e.code }, { status: 400 })
    throw e
  }
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id') || ''
  const existing = await db.loan.findUnique({ where: { id } })
  if (!existing || !(await verifyFirmAccess(user.id, existing.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const deniedDel = await denyUnlessRole(user.id, existing.firmId, MANAGER_ROLES, 'delete a loan')
  if (deniedDel) return deniedDel
  // LedgerEntry.loanId is a bare string with no FK, so deleting a disbursed loan orphaned its
  // "Loans Given" debit forever — the books kept an asset nothing could explain. A loan that has
  // moved money leaves by a status transition (auctioned / loss / transferred), never by DELETE.
  const [payments, postings] = await Promise.all([
    db.loanTransaction.count({ where: { loanId: id } }),
    db.ledgerEntry.count({ where: { firmId: existing.firmId, loanId: id } }),
  ])
  if (payments > 0 || postings > 0 || existing.status === 'active' || existing.status === 'released') {
    return NextResponse.json(
      {
        error: `Loan ${existing.loanNo} has been disbursed and cannot be deleted — it would orphan ${postings} ledger entr${postings === 1 ? 'y' : 'ies'} and ${payments} payment(s). Move it to auctioned, loss or transferred instead.`,
      },
      { status: 409 },
    )
  }
  await db.$transaction(async (tx) => {
    await tx.loan.delete({ where: { id } })
    await tx.systemLog.create({
      data: {
        userId: user.id, firmId: existing.firmId, action: 'delete', entity: 'loan', entityId: id,
        details: `Deleted undisbursed loan ${existing.loanNo} — ${existing.customerName}`,
      },
    })
  })
  return NextResponse.json({ ok: true })
}
