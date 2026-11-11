import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess, requireFirm } from '@/lib/session'
import { MANAGER_ROLES, denyForeignCustomer, denyUnlessRole } from '@/app/api/_authz'
import { paging } from '@/app/api/_paging'
import { db } from '@/lib/db'
import { COUNTER_CALC_SETTING_KEYS, type OldMetalPricing } from '@/lib/stock-calc'
import { hsnForCategory } from '@/lib/stock-spec'
import { computeInvoiceTotals, derivePlaceOfSupply, round2, CASH_LIMIT_KEYS, computeTcs, TCS_SETTING_KEYS, TCS_DEFAULTS, type LineTax, type GstType, type OldMetalRow } from '@/lib/gst'
import { postVoucher, reverseVoucher, LedgerError, type VoucherType } from '@/lib/ledger'
import {
  metalOf, METAL_STOCK, METAL_COGS, financialYear, type Metal,
  ensureAccount as ensureChartAccount, resolveBankAccount, BankAccountNotFoundError, partyPosition,
  CHEQUES_IN_TRANSIT_ACCOUNT, GENERIC_BANK_ACCOUNT,
} from '@/lib/accounting'
import { CUSTOMER_ADVANCES } from '@/lib/scheme'
import { isMasked } from '@/lib/pii'
import { findParty, resolveParty, isAnonymousName } from '@/lib/party'
import { roundWeight, stoneWeightGrams, stoneValue } from '@/lib/stock-calc'

// Thrown when a line references a StockItem that is no longer 'available' (e.g. sold by a
// concurrent request) — caught in POST and reported as 409, never a silent 500 or double-sale.
class StockUnavailableError extends Error {}

// Thrown when a concurrent invoice already spent the loyalty balance we clamped against before
// entering the transaction — caught in POST and reported as 409 rather than over-redeeming.
class InsufficientLoyaltyError extends Error {}

// The advance the bill tried to set against itself is more than the shop holds for that party.
class AdvanceExceededError extends Error {}

// A purchase line's HUID is already on another of this firm's stock items (@@unique([firmId, hallmarkUid])).
class HuidConflictError extends Error {}
const isHuidP2002 = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && String(e.meta?.target ?? '').includes('hallmarkUid')

// ── Boundary validation ───────────────────────────────────────────────────
// Explicit whitelist, numeric coercion, unknown keys silently stripped (zod's default object
// behaviour). Client-sent tax/total figures (subtotal, cgst, sgst, igst, totalAmount, rofAmount
// and per-line cgst/sgst/igst/total) are simply absent from these schemas — stripped, not 400'd —
// because they are always recomputed server-side from computeInvoiceTotals().
const money = () => z.coerce.number().finite().min(0)

/** One stone/diamond sold on a line — mirrors stoneSchema in src/app/api/stock/route.ts exactly
 * (see parseStones() there for the reasoning): clarity/colorGrade/certLab are free-form because
 * grading differs by stone family and the lab can be a shop's own valuer, so none of the three is
 * an enum. `weightGrams`/`amount` are never accepted here — they are derived server-side in
 * deriveLineStones() below, same as the stock route, so a hand-edited request cannot put a stone's
 * stated value out of step with its own weight and rate. */
const invoiceStoneSchema = z.object({
  name: z.string().trim().max(120).nullish(),
  clarity: z.string().trim().max(60).nullish(),
  colorGrade: z.string().trim().max(60).nullish(),
  shape: z.string().trim().max(60).nullish(),
  size: z.string().trim().max(60).nullish(),
  certNo: z.string().trim().max(120).nullish(),
  certLab: z.string().trim().max(120).nullish(),
  otherInfo: z.string().trim().max(255).nullish(),
  qty: z.coerce.number().finite().min(0).nullish(),
  caratWeight: z.coerce.number().finite().min(0).nullish(),
  weightUnit: z.enum(['CT', 'GM', 'MG', 'KG']).default('CT'),
  rateCt: z.coerce.number().finite().min(0).nullish(),
  rateUnit: z.enum(['CT', 'GM', 'MG', 'KG', 'PP', 'FX']).default('CT'),
  sellRateCt: z.coerce.number().finite().min(0).nullish(),
  deductFromGross: z.coerce.boolean().default(false),
})
// Same working cap as parseStones() in the stock route, for the same reason: an unbounded array is
// an unbounded write inside this route's own invoice transaction. ponytail: raise it if a real
// line ever hits it.
const invoiceLineStonesSchema = z.array(invoiceStoneSchema).max(40)

/** One old-metal-receive row. lessWeight > grossWeight is REJECTED (400), not clamped: a bill that
 * records more "less" than gross is a keying error on a legal document, and the shopkeeper should
 * see it, not have the engine floor net at 0 silently. (The engine still floors, as a backstop.)
 * `value`/net weight are never accepted — the engine derives them. */
const oldMetalRowSchema = z.object({
  type: z.enum(['gold', 'silver', 'alloy', 'stone']),
  description: z.string().trim().max(120).nullish(),
  name: z.string().trim().max(120).nullish(),
  grossWeight: money(),
  lessWeight: money().default(0),
  tunch: z.coerce.number().finite().min(0).max(100).nullish(),
  rate: money().nullish(),
  flatValue: money().nullish(),
  // Metal-to-metal row: `rate` is the PURE board rate and the row is worth net x tunch% x rate.
  priceOnFine: z.boolean().optional(),
}).refine((r) => r.lessWeight <= r.grossWeight, { message: 'Less weight cannot exceed gross weight', path: ['lessWeight'] })
  .refine((r) => !r.priceOnFine || (['gold', 'silver'].includes(r.type) && (r.tunch ?? 0) > 0), { message: 'A metal-to-metal row needs a gold/silver type and a tunch - it nets on fine weight', path: ['tunch'] })
const oldMetalRowsSchema = z.array(oldMetalRowSchema).max(20)

const invoiceItemSchema = z.object({
  stockItemId: z.string().max(191).nullish(),
  itemCode: z.string().max(191).nullish(),
  name: z.string().min(1, 'Item name is required').max(191),
  category: z.string().max(191).nullish(), // stock-only, used for purchase/urd StockItem creation
  // stock-only: which metal book this item belongs to. Optional — metalOf() falls back to category.
  metalType: z.enum(['gold', 'silver', 'other']).nullish(),
  // Free-text name for the 'other' metal (Platinum, Panchdhatu, Brass).
  metalName: z.string().max(60).nullish(),
  // Weight-priced line: `rate` is a per-GRAM metal rate, not a price. Decides what a purchased piece's mrp is.
  byWeight: z.boolean().nullish(),
  purity: z.string().max(191).nullish(),
  purityPercent: money().nullish(),
  hsnCode: z.string().max(191).nullish(),
  // BIS Hallmark UID (6 chars) — optional here because a stock-backed sale line gets it filled in
  // server-side from the linked StockItem when omitted (see stockFillMap below); accepted from the
  // client only for a manual/purchase line, where no stock row exists yet to source it from.
  huid: z.string().trim().max(20).nullish(),
  grossWeight: money().default(0),
  netWeight: money().default(0),
  stoneWeight: money().nullish(),
  stoneAmount: money().nullish(),
  // Certificate number for a certified stone (GIA/IGI/HRD/BIS) — same fill-from-stock-when-omitted
  // treatment as huid above.
  stoneCertNo: z.string().trim().max(60).nullish(),
  // Structured per-stone snapshot ONLY — never a pre-serialized JSON string from the client; this
  // route serializes it itself in deriveLineStones()/toInvoiceItemData() below. `.optional()`, not
  // `.default([])`: an absent key must stay indistinguishable from "the client never heard of
  // stones" so every caller that doesn't send it (mobile, quotations/orders/repairs, old builds)
  // keeps today's stockFill behaviour untouched. An explicit `[]` means "this line has no stones".
  stones: invoiceLineStonesSchema.optional(),
  makingCharge: money().default(0),
  wastagePercent: z.coerce.number().finite().nullish(),
  rate: money().default(0),
  amount: money().default(0),
  qty: money().nullish(),
  // The rest of the line as entered — see the block comment on InvoiceItem in schema.prisma for
  // why a bill has to be able to reproduce its own arithmetic.
  itemCategory: z.string().trim().max(120).nullish(),
  size: z.string().trim().max(60).nullish(),
  lessWeight: money().nullish(),
  packetWeight: money().nullish(),
  tagWeight: money().nullish(),
  cwWeight: money().nullish(),
  valueAddPct: z.coerce.number().finite().nullish(),
  valueAddAmount: money().nullish(),
  discountPct: z.coerce.number().finite().min(0).max(100).nullish(),
  discountAmount: money().nullish(),
  otherCharges: money().nullish(),
  markUp: money().nullish(),
  counterNo: z.string().trim().max(60).nullish(),
  length: z.string().trim().max(60).nullish(),
  modelNo: z.string().trim().max(60).nullish(),
  otherInfo: z.string().trim().max(255).nullish(),
  barcode: z.string().max(191).nullish(),
  gstRate: z.coerce.number().finite().min(0).max(100).nullish(), // genuinely different HSN (stones) only — never making charges
})

const invoicePostSchema = z.object({
  firmId: z.string().min(1),
  type: z.enum(['sale', 'purchase', 'urd']).default('sale'),
  customerId: z.string().max(191).nullish(),
  customerName: z.string().min(1, 'Party name is required').max(191),
  customerMobile: z.string().max(191).nullish(),
  // Captured at billing time when a large-cash sale/purchase has no PAN on file yet (Rule 114B) —
  // never trusted for anything but this compliance gate + a one-time backfill onto the Customer row.
  customerPan: z.string().trim().max(20).nullish(),
  invoiceDate: z.coerce.date().optional(),
  invoiceNo: z.string().max(191).nullish(),
  goldRate: money().nullish(),
  previousAmount: money().default(0),
  // Part (or all) of an advance the shop already holds for this party, set against THIS bill as a
  // tender. Moves money out of Customer Advances; it is not a discount and changes no tax.
  advanceApplied: money().default(0),
  // Per-document form of the two: which earlier bills' credit (advanceItems) or debit (dueItems) this
  // bill settles. When present they replace the aggregate figures; `source` is that bill's id.
  advanceItems: z.array(z.object({ source: z.string().min(1), amount: money() })).max(50).optional(),
  dueItems: z.array(z.object({ source: z.string().min(1), amount: money() })).max(50).optional(),
  discount: money().default(0),
  metalAmount: money().default(0),
  gstType: z.enum(['intra', 'inter']).optional(),
  gstTypeOverride: z.boolean().default(false),
  oldGoldWeight: money().default(0),
  oldGoldRate: money().default(0),
  // The tunch/purity the shop quoted the customer for the old metal — a free-text field (tunch is
  // often stated as "91.6" or "22K" or a shop-specific shorthand, not one enumerated set across
  // firms). Stored as-is; never used in any calculation (oldGoldRate/oldGoldWeight already carry
  // everything computeInvoiceTotals needs).
  oldGoldPurity: z.string().trim().max(20).nullish(),
  bhavCut: money().default(0),
  // Repeating old-metal rows. `.optional()`, not `.default([])`: absent must stay distinguishable
  // from `[]` so an ordinary invoice never touches the oldMetalRows column (see the create below).
  oldMetalRows: oldMetalRowsSchema.optional(),
  loyaltyRedeemed: money().default(0),
  // Who actually sold the piece (see Invoice.salesPersonId in the schema) — optional, scoped to this
  // firm below so an id from another firm can never attribute a bill to a stranger's staff record.
  salesPersonId: z.string().max(191).nullish(),
  counterName: z.string().trim().max(100).nullish(),
  // Link-only: see Invoice.schemeEntryId in the schema for why the money side is not wired here.
  schemeEntryId: z.string().max(191).nullish(),
  amountByCash: money().default(0),
  amountByCard: money().default(0),
  amountByUPI: money().default(0),
  amountByCheque: money().default(0),
  // Owner override for a memo / dummy bill — see the column comment in schema.prisma. Defaults to
  // true so every existing caller, and every invoice already written, keeps today's behaviour.
  updateInventory: z.boolean().default(true),
  // "Tax by Val" — see the column comment in schema.prisma. Default false = today's behaviour.
  taxInclusive: z.boolean().default(false),
  // Which named bank account the card/UPI/cheque tender belongs to. OPTIONAL by design — see
  // resolveBankAccount() in src/lib/accounting.ts: the counter defaults to the firm's primary and
  // whoever banks the cheque reassigns it when it clears.
  bankAccountId: z.string().min(1).nullish(),
  // Recorded on the BankTransaction this invoice raises when it takes a cheque, so the pending-
  // cheque list is addressable by cheque number. Not stored on Invoice.
  chequeNumber: z.string().trim().max(60).nullish(),
  amountByGold: money().default(0),
  paymentMode: z.string().max(191).nullish(),
  status: z.string().max(191).nullish(),
  note: z.string().nullish(),
  // Registered-supplier purchase detail (type='purchase' only) — accepted regardless of type and
  // simply unused on sale/urd rather than 400'd, same tolerance the rest of this schema gives
  // mode-specific fields (oldGoldWeight, bhavCut, etc. are equally present-but-zero off-mode).
  billingName: z.string().trim().max(200).nullish(),
  supplierBillNo: z.string().trim().max(100).nullish(),
  supplierBillDate: z.coerce.date().nullish(),
  supplierDueDate: z.coerce.date().nullish(),
  paymentTerms: z.string().trim().max(100).nullish(),
  // Taxable value is derived from items, never trusted from a client-sent subtotal (that trust is
  // exactly what caused the old-gold GST bug). An itemless invoice therefore has no defensible
  // taxable value — reject it here, with a message a shopkeeper can act on, rather than letting it
  // reach postVoucher and fail as an opaque "voucher needs at least 2 legs" (TOO_FEW_LEGS).
  items: z.array(invoiceItemSchema).min(1, 'An invoice needs at least one item'),
})

/** Statuses that kill a bill. Reachable through PUT, so they carry DELETE's role gate. */
const VOIDING_STATUS: readonly string[] = ['deleted', 'cancelled', 'void']
const INVOICE_PUT_ALLOWED = ['id', 'status', 'note', 'whatsappSent', 'paymentMode', 'customerName', 'customerMobile'] as const
const invoicePutSchema = z.object({
  id: z.string().min(1),
  status: z.string().max(191).optional(),
  note: z.string().nullish(),
  whatsappSent: z.boolean().optional(),
  paymentMode: z.string().max(191).optional(),
  customerName: z.string().min(1).max(191).optional(),
  customerMobile: z.string().max(191).nullish(),
})

// itemCode (StockItem, purchase/urd lines only) is still derived from a count-then-write read
// inside nextItemCode() below, which races under concurrent POSTs. @@unique([firmId, itemCode])
// is the real guard; on collision (P2002) we retry the whole transaction so the counts are
// re-derived fresh. invoiceNo no longer goes through this path — see allocateInvoiceNo().
// P2034 (MySQL deadlock / write conflict — e.g. two sales racing the conditional updateMany on
// the same StockItem row) is likewise transient; Prisma's own error text says "please retry your
// transaction", so it is retried the same way. Neither retry re-allocates invoiceNo — that already
// happened once, outside this function, before withRetry was ever called.
// Part-sale lot-total columns beyond the original set (see the comment in the split branch).
const LOT_WEIGHT_EXTRA = ['customerWastageWt', 'packetTotalWt1', 'packetTotalWt2', 'packetTotalWt3', 'packetTotalWt4', 'packetTotalWt5'] as const
const LOT_MONEY_EXTRA = [
  'makingCharge', 'labourCharge', 'totalLabourCharges', 'labourTotal1', 'labourTotal2', 'labourTotal3', 'labourTotal4', 'labourTotal5',
  'otherCharges', 'totalOtherCharges', 'totalHallmarkCharges', 'totalTax',
  'makingCgstAmount', 'makingSgstAmount', 'makingIgstAmount', 'priceCgstAmount', 'priceSgstAmount', 'priceIgstAmount',
  'valueAdded', 'valuation', 'markUp', 'sellPrice',
] as const
const LOT_COUNTS = ['packetQty1', 'packetQty2', 'packetQty3', 'packetQty4', 'packetQty5', 'labourQty1', 'labourQty2', 'labourQty3', 'labourQty4', 'labourQty5', 'stoneQty'] as const

export async function withRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      // A HUID collision is a client error, never transient: retrying cannot make it go away.
      const isRetryable = e instanceof Prisma.PrismaClientKnownRequestError && (e.code === 'P2002' || e.code === 'P2034') && !isHuidP2002(e)
      if (!isRetryable || i === attempts) throw e
    }
  }
  throw new Error('unreachable')
}

// 'sale-return' / 'purchase-return' are credit-note documents (src/app/api/invoices/return/route.ts)
// — never accepted on invoicePostSchema.type above, only allocated by that route. Sharing the same
// InvoiceSequence table (keyed by firmId+type) gives returns their own gapless numbering series for
// free, exactly like oMunim's separate RETURN INV NO series.
const INVOICE_TYPES = ['sale', 'purchase', 'urd', 'sale-return', 'purchase-return'] as const
export type InvoiceType = (typeof INVOICE_TYPES)[number]

const TYPE_PREFIX: Record<InvoiceType, string> = { sale: 'INV-', purchase: 'PUR-', urd: 'URD-', 'sale-return': 'SR-', 'purchase-return': 'PR-' }

// Monotonic per-(firm,type) invoice numbering. Replaces `tx.invoice.count()` — counting rows is
// O(n), races under concurrent POSTs (every retry re-derives from a count every other racer is
// also reading), and silently reissues a number after a soft-delete. The InvoiceSequence row is
// incremented atomically with a single `INSERT ... ON DUPLICATE KEY UPDATE seq = seq + 1` — this
// is the standard MySQL race-free counter pattern (the row-level lock it takes serialises only
// this one statement, not the whole invoice write). Bootstraps from the current count on first
// use so numbering carries on from whatever already exists, then never looks at count() again.
// Allocated in its own short transaction, ahead of the main invoice transaction, so contention
// under concurrent billing is over one small row, not the entire multi-write invoice creation —
// and a failed main transaction simply burns the number (gaps are fine; reuse is not).
// @@unique([firmId, invoiceNo]) on Invoice stays as the backstop.
export async function allocateInvoiceNo(firmId: string, type: InvoiceType): Promise<string> {
  const seq = await db.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO InvoiceSequence (firmId, type, seq)
      SELECT ${firmId}, ${type}, COUNT(*) + 1 FROM Invoice WHERE firmId = ${firmId} AND type = ${type}
      ON DUPLICATE KEY UPDATE seq = seq + 1
    `
    const rows = await tx.$queryRaw<{ seq: number }[]>`
      SELECT seq FROM InvoiceSequence WHERE firmId = ${firmId} AND type = ${type}
    `
    return rows[0].seq
  })
  return TYPE_PREFIX[type] + (1000 + seq)
}

/**
 * Normalises a line's `stones` array exactly like parseStones() in src/app/api/stock/route.ts —
 * same drop-untyped-row rule, same "first CERTIFIED stone wins the cert snapshot" rule (or a ring
 * whose lead diamond is listed second would show its uncertified ruby's blank cert on the bill) —
 * adapted for a JSON blob embedded on InvoiceItem rather than child Stone rows: no firmId per row,
 * because this isn't a table.
 *
 * Returns `undefined` when the line never mentioned `stones` at all — the caller MUST then leave
 * today's stockFill behaviour on stoneWeight/stoneAmount/stoneCertNo completely untouched. A real
 * (possibly empty, for an explicit `[]`) result otherwise. This mirrors parseStones()'s own
 * `undefined` vs `[]` distinction and for the same reason: every existing caller that doesn't know
 * about stones (mobile, quotations/orders/repairs, invoices already written) must not change.
 */
function deriveLineStones(stones: z.infer<typeof invoiceStoneSchema>[] | undefined) {
  if (stones === undefined) return undefined
  const rows = stones
    .filter((s) => s.name || s.certNo || Number(s.caratWeight) > 0 || Number(s.rateCt) > 0 || Number(s.sellRateCt) > 0)
    .map((s, i) => {
      const caratWeight = Number(s.caratWeight) || 0
      // Canonical weight — every calculation (including the aggregate below) reads this, never
      // caratWeight directly (1 ct = 0.2 g; the conversion lives in stoneWeightGrams).
      const weightGrams = roundWeight(stoneWeightGrams(caratWeight, s.weightUnit))
      // SELL rate on a sale, never the shop's PURCHASE rate: rateCt is what the stone cost the shop
      // to buy; billing the customer at it would sell every stone at cost. Fall back to rateCt only
      // when sellRateCt is blank (a manually keyed stone may only ever carry one rate typed in).
      const sellRate = s.sellRateCt ?? s.rateCt ?? 0
      const amount = stoneValue({ weight: caratWeight, weightUnit: s.weightUnit, rate: Number(sellRate) || 0, rateUnit: s.rateUnit, qty: Number(s.qty) || 1 })
      return {
        seq: i,
        name: s.name || null,
        clarity: s.clarity || null,
        colorGrade: s.colorGrade || null,
        shape: s.shape || null,
        size: s.size || null,
        certNo: s.certNo || null,
        certLab: s.certLab || null,
        otherInfo: s.otherInfo || null,
        qty: s.qty ?? null,
        caratWeight: s.caratWeight ?? null,
        weightUnit: s.weightUnit,
        weightGrams: weightGrams || null,
        rateCt: s.rateCt ?? null,
        rateUnit: s.rateUnit,
        sellRateCt: s.sellRateCt ?? null,
        amount: amount || null,
        deductFromGross: !!s.deductFromGross,
      }
    })
  const certified = rows.find((s) => s.certNo)
  return {
    rows,
    certNo: certified?.certNo ?? null,
    // Aggregates the print layer and every existing report already read off the scalar columns —
    // derived here so they can never drift from the detail rows above.
    totalWeightGrams: roundWeight(rows.reduce((a, r) => a + (r.weightGrams || 0), 0)),
    totalAmount: round2(rows.reduce((a, r) => a + (r.amount || 0), 0)),
  }
}

/**
 * Normalises old-metal rows into the engine's OldMetalRow shape (also what gets serialised).
 * alloy/stone carry ONLY flatValue and gold/silver ONLY rate, so a stray field can neither be
 * priced nor persisted. Returns undefined for absent OR empty input: nothing to record, and the
 * caller must then not mention the column at all.
 */
function deriveOldMetalRows(rows: z.infer<typeof oldMetalRowsSchema> | undefined): OldMetalRow[] | undefined {
  if (!rows?.length) return undefined
  return rows.map((r) => ({
    type: r.type,
    ...(r.description ? { description: r.description } : {}),
    ...(r.name ? { name: r.name } : {}),
    grossWeight: r.grossWeight,
    lessWeight: r.lessWeight,
    ...(r.tunch != null ? { tunch: r.tunch } : {}),
    ...(r.type === 'gold' || r.type === 'silver' ? { rate: r.rate ?? 0 } : { flatValue: r.flatValue ?? 0 }),
    ...(r.priceOnFine ? { priceOnFine: true } : {}),
  }))
}

// Whitelist InvoiceItem fields from a raw line — lines for purchase/urd also carry
// stock-only fields (category, purityPercent, qty, barcode) that must not reach this table.
// cgst/sgst/igst/total are NEVER taken from the client — always the server-computed LineTax.
// stockFill: values read from the linked StockItem, used ONLY to fill in what the client left
// absent/zero (grossWeight, stoneWeight, hsnCode, huid, stoneCertNo) — never overrides a value the
// client did send. netWeight is never filled from stock; it stays exactly as sent (see route POST
// comment). huid in particular is the legally-mandated BIS Hallmark UID snapshot: for a stock-backed
// line this is how the number gets onto the bill at all (see prisma/schema.prisma InvoiceItem.huid).
function toInvoiceItemData(
  line: any,
  lineTax: LineTax,
  stockItemId?: string | null,
  stockFill?: { grossWeight: number; stoneWeight: number | null; hsnCode: string | null; huid: string | null; stoneCertNo: string | null },
) {
  const grossWeight = Number(line.grossWeight) || 0
  const stoneWeight = line.stoneWeight != null ? Number(line.stoneWeight) : null
  // undefined when this line never sent `stones` — falls straight through to the client-value/
  // stockFill behaviour below, completely unchanged from before `stones` existed.
  const stoneRows = deriveLineStones(line.stones)
  return {
    stockItemId: stockItemId !== undefined ? stockItemId : line.stockItemId ?? null,
    itemCode: line.itemCode ?? null,
    name: line.name,
    hsnCode: line.hsnCode ?? stockFill?.hsnCode ?? null,
    huid: line.huid ?? stockFill?.huid ?? null,
    purity: line.purity ?? null,
    grossWeight: grossWeight || stockFill?.grossWeight || 0,
    // DOUBLE-CHARGE TRAP (a stone with deductFromGross:true sits inside the gross weight already —
    // see stock-add.tsx ~line 480): netWeight stays EXACTLY as sent, never adjusted by stones' weight
    // here in either direction. The client (computeSaleLine() in stock-calc.ts) owns that deduction
    // before this line's amount/netWeight ever reach the wire; this route must not re-apply it, and
    // must not add the stones' own amount into the line's taxable `amount` below either — both would
    // bill the same stone twice.
    netWeight: Number(line.netWeight) || 0,
    // When `stones` was sent, these three scalars are DERIVED from the detail rows and the client's
    // own stoneWeight/stoneAmount/stoneCertNo values for this line are IGNORED outright — that is
    // what stops the bill's printed summary and its own stone detail disagreeing on a legal
    // document. When `stones` was never sent, every existing behaviour (client value, else
    // stockFill) is untouched — see deriveLineStones()'s undefined-vs-[] contract above.
    stoneWeight: stoneRows ? (stoneRows.totalWeightGrams || null) : (stoneWeight != null ? stoneWeight : (stockFill?.stoneWeight ?? null)),
    stoneAmount: stoneRows ? (stoneRows.totalAmount || null) : (line.stoneAmount != null ? Number(line.stoneAmount) : null),
    stoneCertNo: stoneRows ? stoneRows.certNo : (line.stoneCertNo ?? stockFill?.stoneCertNo ?? null),
    stones: stoneRows ? (stoneRows.rows.length ? JSON.stringify(stoneRows.rows) : null) : null,
    makingCharge: Number(line.makingCharge) || 0,
    wastagePercent: line.wastagePercent != null ? Number(line.wastagePercent) : null,
    rate: Number(line.rate) || 0,
    amount: lineTax.base,
    cgst: lineTax.cgst,
    sgst: lineTax.sgst,
    igst: lineTax.igst,
    total: lineTax.total,
    // The line exactly as the counter entered it. `amount`/cgst/sgst/igst/total above stay
    // SERVER-computed — these are the inputs behind them, not a second version of the answer.
    metalType: line.metalType ?? null,
    metalName: line.metalName ?? null, // snapshot at sale, like huid
    itemCategory: line.itemCategory ?? null,
    size: line.size ?? null,
    qty: Math.max(1, Math.round(Number(line.qty) || 1)),
    lessWeight: line.lessWeight != null ? Number(line.lessWeight) : null,
    packetWeight: line.packetWeight != null ? Number(line.packetWeight) : null,
    tagWeight: line.tagWeight != null ? Number(line.tagWeight) : null,
    cwWeight: line.cwWeight != null ? Number(line.cwWeight) : null,
    valueAddPct: line.valueAddPct != null ? Number(line.valueAddPct) : null,
    valueAddAmount: line.valueAddAmount != null ? Number(line.valueAddAmount) : null,
    discountPct: line.discountPct != null ? Number(line.discountPct) : null,
    discountAmount: line.discountAmount != null ? Number(line.discountAmount) : null,
    otherCharges: line.otherCharges != null ? Number(line.otherCharges) : null,
    markUp: line.markUp != null ? Number(line.markUp) : null,
    counterNo: line.counterNo ?? null,
    length: line.length ?? null,
    modelNo: line.modelNo ?? null,
    otherInfo: line.otherInfo ?? null,
  }
}

// Mirrors src/app/api/stock/route.ts POST's item-code scheme exactly — one coding scheme only.
function stockPrefix(category: string) {
  return category === 'imitation' ? 'A' : category === 'sterling' ? 'B' : category === 'crystal' ? 'CR' : category === 'raw' ? 'R' : 'P'
}
async function nextItemCode(tx: any, firmId: string, category: string, counts: Map<string, number>) {
  const key = category || 'fine'
  if (!counts.has(key)) {
    counts.set(key, await tx.stockItem.count({ where: { firmId, category: key } }))
  }
  const n = counts.get(key)! + 1
  counts.set(key, n)
  return `${stockPrefix(key)}${n}`
}

/**
 * Split `total` across `weights` pro-rata, remainder onto the largest weight, so the parts sum
 * EXACTLY to `total` (the same technique computeInvoiceTotals uses for discount allocation).
 * Used to land the purchase's whole capitalised cost — taxable value, i.e. AFTER discount and
 * INCLUDING the header metal amount — onto the StockItem rows it created. Without this the
 * inventory account would be debited with one figure and relieved later with a different one, and
 * the stock account would carry a residue that never clears.
 */
function allocate(total: number, weights: number[]): number[] {
  const n = weights.length
  if (!n) return []
  const sum = weights.reduce((a, b) => a + b, 0)
  const out = sum > 0
    ? weights.map((w) => round2((w / sum) * total))
    : weights.map((_, i) => (i === 0 ? round2(total) : 0))
  let maxIdx = 0
  for (let i = 1; i < n; i++) if (weights[i] > weights[maxIdx]) maxIdx = i
  const others = out.reduce((a, v, i) => (i === maxIdx ? a : a + v), 0)
  out[maxIdx] = round2(total - others)
  return out
}

/** Cost basis moving in (purchase/urd) or out (sale), summed per metal book. */
export type StockMovement = Partial<Record<Metal, number>>

export function sumByMetal(rows: { metal: Metal; amount: number }[]): StockMovement {
  const out: StockMovement = {}
  for (const r of rows) {
    if (!r.amount) continue
    out[r.metal] = round2((out[r.metal] || 0) + r.amount)
  }
  return out
}

// Net income/expense of the rupee round-off invoices print (Invoice.rofAmount). One account, both
// directions — round-up posts credit (extra income), round-down posts debit (foregone income) —
// same convention Tally uses, so a single ledger nets correctly on the P&L either way.
// CHART_OF_ACCOUNTS (src/lib/accounting.ts) is be-accounting's file and off-limits here, so this
// self-provisions the firm's own Account row on first use rather than inventing an unclassified
// name — the exact pattern src/app/api/loans/[id]/auction/route.ts uses for its own new accounts.
export const ROUND_OFF_ACCOUNT = { name: 'Round Off', type: 'income', code: '4004' }
// Sale return (credit note, s.34): a contra-revenue account rather than debiting Sales Revenue
// directly, so gross sales and returns stay separately visible on the P&L (and in GSTR-1, credit
// notes are reported separately from sales) instead of blending into one netted figure.
// NEW ACCOUNT — not yet in src/lib/accounting.ts CHART_OF_ACCOUNTS / tests/books/books.ts
// EXPECTED_TYPE (both off-limits to this agent, same gap Round Off had — see worklog Task 66):
//   'Sales Return': 'income'  (code 4005, nets against Sales Revenue on the P&L exactly like
//   Round Off nets both directions on one account)
export const SALES_RETURN_ACCOUNT = { name: 'Sales Return', type: 'income', code: '4005' }
// Purchase return needs NO new account: the original purchase already debited the metal stock
// asset directly (no `Purchases` leg to mirror — see buildLedgerEntries), so its return is fully
// expressed with existing accounts (Metal Stock, GST Input Receivable, Cash/Bank/Sundry Creditors).
//
// Purchase/URD over-payment mirror of the sale over-tender leg (D2, worklog Task 66): the firm
// overpaying a supplier is an ASSET (money recoverable from them), not a liability — the opposite
// of Customer Advances. NEW ACCOUNT, same off-limits gap:
//   'Advance to Supplier': 'asset'  (code 1011)
export const ADVANCE_TO_SUPPLIER_ACCOUNT = { name: 'Advance to Supplier', type: 'asset', code: '1011' }
// TCS u/s 206C(1H) collected from a buyer is a liability owed to the government until deposited —
// see TCS_SETTING_KEYS in src/lib/gst.ts for the scope decision (1H only, not s.206C(1)).
// NEW ACCOUNT, same off-limits gap as the two above: 'TCS Payable': 'liability' (code 2007).
export const TCS_PAYABLE_ACCOUNT = { name: 'TCS Payable', type: 'liability', code: '2007' }
/** Thin alias: one self-provisioner lives in src/lib/accounting.ts; invoice-created accounts are
 *  grouped under Sales. Kept exported because return/route.ts already imports it from here. */
export const ensureAccount = (tx: any, firmId: string, want: { name: string; type: string; code: string }) =>
  ensureChartAccount(tx, firmId, { ...want, group: 'Sales' })

// One shared money-posting rule for both directions — sale credits revenue/tax and debits
// cash/bank/debtors; purchase & urd mirror it onto input-tax/creditors.
//
// Inventory (perpetual — see src/lib/accounting.ts METAL_STOCK for why):
//   purchase/urd  Dr <Metal> Stock            (replaces the old Dr Purchases expense leg)
//   sale          Dr Cost of Goods Sold - <Metal> / Cr <Metal> Stock, at the sold item's costPrice
// The sale's two stock legs are equal and opposite, so they cannot change whether the voucher
// balances; the purchase's stock legs sum to exactly the same `taxable` the Purchases leg used to
// carry (allocate() guarantees it), so that side is unchanged too.
function buildLedgerEntries(invoice: {
  id: string; firmId: string; customerId: string | null; customerName: string; invoiceNo: string
  invoiceDate: Date; subtotal: number; discount: number; metalAmount: number; taxableValue: number
  cgst: number; sgst: number; igst: number; totalAmount: number
  amountByCash: number; amountByCard: number; amountByUPI: number; amountByCheque: number; amountByGold: number
  previousAmount: number; loyaltyRedeemed: number; rofAmount: number
  /** Not an Invoice column: derived from the ledger, see advanceAppliedByInvoice(). */
  advanceApplied?: number
  /** One leg per source document; `tag` is " (from INV-9)" or empty. */
  advanceLegs?: { tag: string; amount: number }[]
  dueLegs?: { tag: string; amount: number }[]
}, type: InvoiceType, stock: StockMovement = {}, roundOffAccountName: string = ROUND_OFF_ACCOUNT.name,
   advanceToSupplierAccountName: string = ADVANCE_TO_SUPPLIER_ACCOUNT.name,
   tcs?: { amount: number; payableAccountName: string },
   tender: { bankAccountName: string; chequeAccountName: string } =
     { bankAccountName: GENERIC_BANK_ACCOUNT, chequeAccountName: CHEQUES_IN_TRANSIT_ACCOUNT.name }) {
  const isSale = type === 'sale'
  // Prefer the stored figure; fall back to the legacy formula only for rows written before the
  // column existed (every one of which was tax-exclusive, where the two agree exactly).
  const taxable = invoice.taxableValue > 0
    ? invoice.taxableValue
    : invoice.subtotal - invoice.discount + invoice.metalAmount
  const cash = invoice.amountByCash || 0
  // Card and UPI settle to a real bank account the same day, so they post there on the transaction
  // date. A CHEQUE does not: it sits in Cheques in Transit until the bank clears it, and only then
  // moves to the named account, dated the CLEARING date (src/app/api/bank/transactions/[id]).
  // Before this, all three pooled into one generic "Bank Account" on the transaction date, which
  // made an uncleared or bounced counter cheque indistinguishable from cleared money.
  const cardUpi = (invoice.amountByCard || 0) + (invoice.amountByUPI || 0)
  const cheque = invoice.amountByCheque || 0
  const advance = isSale ? invoice.advanceApplied || 0 : 0
  const paidTotal = cash + cardUpi + cheque + (invoice.amountByGold || 0) + advance
  const balance = invoice.totalAmount - paidTotal
  const label = type === 'urd' ? 'URD Purchase' : type === 'purchase' ? 'Purchase' : 'Invoice'
  const moneySide = isSale ? 'debit' : 'credit'
  const revenueSide = isSale ? 'credit' : 'debit'
  const base = { firmId: invoice.firmId, invoiceId: invoice.id, date: invoice.invoiceDate }

  const metals = Object.keys(stock) as Metal[]

  // Purchase/URD: the cost goes to the metal stock ASSET, not to a Purchases expense. Split per
  // metal; `taxable` and the allocation both come from totals.taxableValue so they agree to the
  // paisa. If a stock-in somehow produced no costed rows, fall back to the old Purchases leg rather
  // than silently dropping the debit and unbalancing the voucher.
  const stockInLegs = isSale || !metals.length
    ? []
    : metals.map((m) => ({ ...base, accountName: METAL_STOCK[m],
        particulars: `Stock in - ${label} ${invoice.invoiceNo}`, type, debit: stock[m] || 0 }))

  const entries = [
    ...(isSale || stockInLegs.length ? [] : [{ ...base, customerId: invoice.customerId, accountName: 'Purchases',
      particulars: `${label} ${invoice.invoiceNo} - ${invoice.customerName}`, type, [revenueSide]: taxable }]),
    ...stockInLegs,
    ...(isSale ? [{ ...base, customerId: invoice.customerId, accountName: 'Sales Revenue',
      particulars: `${label} ${invoice.invoiceNo} - ${invoice.customerName}`, type, credit: taxable }] : []),
    // Sale: relieve inventory at cost and recognise it as cost of goods sold. Self-balancing pair
    // per metal, so gross profit = revenue - COGS falls straight out of the P&L.
    ...(isSale ? metals.flatMap((m) => [
      { ...base, accountName: METAL_COGS[m], particulars: `Cost of goods sold - ${label} ${invoice.invoiceNo}`, type, debit: stock[m] || 0 },
      { ...base, accountName: METAL_STOCK[m], particulars: `Stock out - ${label} ${invoice.invoiceNo}`, type, credit: stock[m] || 0 },
    ]) : []),
    { ...base, accountName: isSale ? 'CGST Payable' : 'CGST Input Receivable',
      particulars: `CGST on ${invoice.invoiceNo}`, type, [revenueSide]: invoice.cgst },
    { ...base, accountName: isSale ? 'SGST Payable' : 'SGST Input Receivable',
      particulars: `SGST on ${invoice.invoiceNo}`, type, [revenueSide]: invoice.sgst },
    { ...base, accountName: isSale ? 'IGST Payable' : 'IGST Input Receivable',
      particulars: `IGST on ${invoice.invoiceNo}`, type, [revenueSide]: invoice.igst },
    { ...base, customerId: invoice.customerId, accountName: 'Cash in Hand',
      particulars: `${isSale ? 'Receipt' : 'Payment'} ${invoice.invoiceNo}`, type: isSale ? 'receipt' : 'payment', [moneySide]: cash },
    { ...base, customerId: invoice.customerId, accountName: tender.bankAccountName,
      particulars: `${isSale ? 'Receipt' : 'Payment'} ${invoice.invoiceNo} (card/UPI)`, type: isSale ? 'receipt' : 'payment', [moneySide]: cardUpi },
    // Cheque leg. An ASSET in transit, not money in the bank — the clearing voucher moves it onto
    // the named account, and a bounce posts a correction. Same side as cash: the shop has taken
    // something of value, it simply is not spendable yet.
    { ...base, customerId: invoice.customerId, accountName: tender.chequeAccountName,
      particulars: `${isSale ? 'Cheque received' : 'Cheque issued'} ${invoice.invoiceNo}`, type: isSale ? 'receipt' : 'payment', [moneySide]: cheque },
    // Old gold taken in exchange (or paid out) counts toward paidTotal below but previously had no
    // account posting at all, leaving gold-paid invoices unbalanced. Post it as a purchase leg
    // (never sale revenue) — same moneySide convention as cash/bank so debits still equal credits.
    { ...base, customerId: invoice.customerId, accountName: 'Old Gold Purchases',
      particulars: `${isSale ? 'Old gold received' : 'Old gold paid'} ${invoice.invoiceNo}`, type: isSale ? 'receipt' : 'payment', [moneySide]: invoice.amountByGold || 0 },
    // Advance applied: the customer's money the shop already holds (received and booked on an earlier
    // bill) settles this one. Dr Customer Advances releases the liability — NOT cash again and NOT a
    // discount. Same side as every other tender, so the voucher balances with no special case.
    ...(isSale && invoice.advanceLegs?.length ? invoice.advanceLegs : [{ tag: '', amount: advance }]).map((l) => ({ ...base, customerId: invoice.customerId, accountName: CUSTOMER_ADVANCES,
      particulars: `Advance adjusted against ${invoice.invoiceNo}${l.tag}`, type: 'receipt', debit: l.amount })),
    ...(balance > 0 ? [{ ...base, customerId: invoice.customerId, accountName: isSale ? 'Sundry Debtors' : 'Sundry Creditors',
      particulars: `${isSale ? 'Balance due' : 'Balance payable'} ${invoice.invoiceNo}`, type: isSale ? 'receipt' : 'payment', [moneySide]: balance }] : []),
    // Over-tender (balance < 0): the excess is the CUSTOMER's money held by the shop, not revenue —
    // a liability (Customer Advances, already posted to by the scheme flow) until it is refunded or
    // applied to a future bill.
    ...(isSale && balance < 0 ? [{ ...base, customerId: invoice.customerId, accountName: CUSTOMER_ADVANCES,
      particulars: `Excess tender held as advance - ${invoice.invoiceNo}`, type: 'receipt', credit: -balance }] : []),
    // Mirror for purchase/urd: the firm overpaid the supplier. That excess is money recoverable
    // FROM the supplier — an ASSET (Advance to Supplier), never a liability — the opposite entry
    // to Customer Advances above. See ADVANCE_TO_SUPPLIER_ACCOUNT for why this is a new account.
    ...(!isSale && balance < 0 ? [{ ...base, customerId: invoice.customerId, accountName: advanceToSupplierAccountName,
      particulars: `Overpayment held as advance - ${invoice.invoiceNo}`, type: 'payment', debit: -balance }] : []),
    // Round-off (D1): Invoice.rofAmount is what the invoice prints and stores, and previously had no
    // leg at all — debits and credits differed by exactly that figure and postVoucher refused the
    // ENTIRE sale (see worklog Task 64). One leg, net direction: sale rounds the bill up -> extra
    // income (credit); rounds down -> foregone income (debit). Purchase/urd mirror onto the opposite
    // side, same convention as every other leg above.
    ...(invoice.rofAmount !== 0 ? [{ ...base, accountName: roundOffAccountName,
      particulars: `Round off on ${invoice.invoiceNo}`, type,
      ...(isSale
        ? (invoice.rofAmount > 0 ? { credit: invoice.rofAmount } : { debit: -invoice.rofAmount })
        : (invoice.rofAmount > 0 ? { debit: invoice.rofAmount } : { credit: -invoice.rofAmount })) }] : []),
    // loyaltyRedeemed and previousAmount previously posted no leg at all, so the journal only
    // balanced when both were zero (see buildLedgerEntries header comment). Both go on the
    // moneySide/revenueSide legs respectively — same convention as every other leg above — so the
    // algebra holds for sale AND purchase/urd: debits = credits = totalAmount + loyaltyRedeemed.
    // Loyalty: the points redeemed stand in for cash the shop never collected — same side as
    // cash/bank/gold (moneySide), because it's a form of payment, not revenue.
    { ...base, customerId: invoice.customerId, accountName: 'Loyalty Redemption Expense',
      particulars: `Loyalty points redeemed on ${invoice.invoiceNo}`, type: isSale ? 'receipt' : 'payment', [moneySide]: invoice.loyaltyRedeemed || 0 },
    // previousAmount: collecting/settling a balance carried forward from an earlier invoice —
    // clears the existing debtor/creditor receivable/payable, it is not new revenue, so it sits on
    // the revenueSide leg (same side as Sales Revenue/Purchases) rather than moneySide.
    ...(isSale && invoice.dueLegs?.length ? invoice.dueLegs : [{ tag: '', amount: invoice.previousAmount || 0 }]).map((l) => ({ ...base, customerId: invoice.customerId, accountName: isSale ? 'Sundry Debtors' : 'Sundry Creditors',
      particulars: `${isSale ? 'Previous balance collected' : 'Previous balance settled'} ${invoice.invoiceNo}${l.tag}`, type, [revenueSide]: l.amount })),
    // TCS u/s 206C(1H): the buyer now owes this extra amount (Dr Sundry Debtors — never folded into
    // Sales Revenue, it is not consideration for the goods) and the firm owes it to the government
    // until deposited (Cr TCS Payable). Sale-only — the firm is the seller collecting, never on a
    // purchase/urd leg where the firm is the buyer. See TCS_SETTING_KEYS in src/lib/gst.ts.
    ...(isSale && tcs && tcs.amount > 0 ? [
      { ...base, customerId: invoice.customerId, accountName: 'Sundry Debtors',
        particulars: `TCS u/s 206C(1H) collected on ${invoice.invoiceNo}`, type, debit: tcs.amount },
      { ...base, accountName: tcs.payableAccountName,
        particulars: `TCS u/s 206C(1H) payable on ${invoice.invoiceNo}`, type, credit: tcs.amount },
    ] : []),
  ] as Array<{ firmId: string; invoiceId: string; customerId?: string | null; accountName: string; date: Date; particulars: string; type: string; debit?: number; credit?: number }>

  return entries.filter((e) => (e.credit || 0) > 0 || (e.debit || 0) > 0)
}

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  // requireFirm, not `if (firmId)`: omitting firmId used to skip BOTH the access check and the
  // where-clause scoping, returning every firm's invoices to any signed-in user.
  const firmId = await requireFirm(searchParams, user)
  if (firmId instanceof NextResponse) return firmId
  const status = searchParams.get('status')
  const search = searchParams.get('search') || ''
  const type = searchParams.get('type') || 'sale' // default: sale only, so existing callers never see purchase/urd rows
  const where: any = { firmId }
  if (type !== 'all') where.type = type
  if (status && status !== 'all') where.status = status
  if (search) {
    where.OR = [
      { invoiceNo: { contains: search } },
      { customerName: { contains: search } },
      { customerMobile: { contains: search } },
    ]
  }
  // The bill screen's "previous due / advance held" for one party, from the same legs as the customer
  // hub (partyPosition -> buildCustomerStatement). firmId is already access-checked above, and the
  // customer is looked up WITH it: another firm's party id answers 404, never a balance.
  const partyBalance = searchParams.get('partyBalance')
  if (partyBalance) {
    const pos = await partyPosition(db, firmId, partyBalance)
    return pos ? NextResponse.json(pos) : NextResponse.json({ error: 'Party not found' }, { status: 404 })
  }
  const page = paging(searchParams, 300)
  const [invoices, total] = await Promise.all([
    db.invoice.findMany({
      where,
      orderBy: { invoiceDate: 'desc' },
      ...page,
      include: { items: true },
    }),
    db.invoice.count({ where }),
  ])
  // Advance set against each bill lives in the ledger (one Dr Customer Advances leg), not on the
  // Invoice row. Attached so paid/balance on the list agree with the books.
  const adv = invoices.length
    ? await db.ledgerEntry.groupBy({
        by: ['invoiceId'],
        where: { firmId, invoiceId: { in: invoices.map((i) => i.id) }, accountName: CUSTOMER_ADVANCES, debit: { gt: 0 }, reversalOfId: null },
        _sum: { debit: true },
      })
    : []
  const advById = new Map(adv.map((a) => [a.invoiceId, a._sum.debit || 0]))
  return NextResponse.json({ invoices: invoices.map((i) => ({ ...i, advanceApplied: advById.get(i.id) || 0 })), total, limit: page.take, skip: page.skip })
}

/**
 * Public entry. Anything the handler does not map to a 4xx lands here as a JSON `{error}` with the
 * real cause on the server log - a bare `throw` made Next answer 500 with an EMPTY body, so a schema
 * drift on a live database (missing table/column) was invisible from the browser. What is sent to
 * the client is only the Prisma error code and an 8-hex ref; the same ref prefixes the full server log line.
 */
export async function POST(req: Request) {
  try {
    return await postInvoice(req)
  } catch (e) {
    // The browser gets a code and a reference only - Prisma's message carries table, schema,
    // constraint and DB host names. The full error goes to the server log under the same ref.
    const ref = crypto.randomUUID().slice(0, 8)
    console.error(`[POST /api/invoices] unexpected failure ref ${ref}:`, e)
    const code = e instanceof Prisma.PrismaClientKnownRequestError ? e.code : e instanceof Prisma.PrismaClientInitializationError ? 'INIT' : 'ERR'
    return NextResponse.json({ error: `Could not save the invoice (${code}) — ref ${ref}`, code: 'INTERNAL', ref }, { status: 500 })
  }
}

async function postInvoice(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const raw = await req.json().catch(() => null)
  if (raw == null || typeof raw !== 'object') return NextResponse.json({ error: 'Request body must be a JSON object' }, { status: 400 })
  const parsed = invoicePostSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid invoice payload', issues: parsed.error.issues }, { status: 400 })
  }
  const data = parsed.data
  // A masked PAN echoed back from a read (XXXX XX 234F) is "not supplied" — never a value to store or to
  // satisfy the Rule 114B check. PII_FIELDS names the column `pan`, not this body key, so use isMasked directly.
  if (data.customerPan && isMasked(data.customerPan)) data.customerPan = null
  const { firmId, type } = data

  if (!(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // THE BUYER MUST BELONG TO THIS FIRM, and this is the FIRST thing asked about the id, before
  // anything is read from the row or decided by it. A `customerId` was taken straight off the body
  // and used by primary key alone, which let a bill in firm A reach firm B's customer master:
  //   - it READ `state`, `loyaltyPoints` and `pan` off that row (below), and those three steer the
  //     place of supply (CGST+SGST vs IGST), what the bill may redeem, and the Rule 114B cash gate.
  //     Behaviour that differs by another firm's data is an oracle even when none of it is printed;
  //   - it WROTE to it — the loyalty block and the Rule 114B PAN backfill at the end of the
  //     transaction both run `customer.update` on this id, so a foreign balance moved and a foreign
  //     PAN could be overwritten. That is a cross-tenant KYC write, not just a leak.
  // `stockItemId` and `salesPersonId` were already firm-scoped; this closes the last one. PUT needs
  // no guard — INVOICE_PUT_ALLOWED does not include customerId, so a bill can never be re-pointed.
  const notOurs = await denyForeignCustomer(data.customerId, firmId)
  if (notOurs) return notOurs

  const firm = await db.firm.findUnique({
    where: { id: firmId },
    select: { state: true, gstEnabled: true, cgstRate: true, sgstRate: true, igstRate: true, loyaltyRate: true },
  })
  if (!firm) return NextResponse.json({ error: 'Firm not found' }, { status: 400 })

  // URD (unregistered seller) is outside GST scope; gstEnabled=false on the firm is the same.
  const taxed = type !== 'urd' && firm.gstEnabled

  // A typed name with no picked customer is still a party (src/lib/party.ts): link an existing one now,
  // or create it inside the transaction below. A sale's party is a customer; a purchase/URD's is a supplier.
  const partyType = type === 'sale' ? 'customer' : 'supplier'
  const picked = data.customerId ?? null
  if (!picked) {
    const existing = await findParty(db, { firmId, name: data.customerName, mobile: data.customerMobile, type: partyType })
    if (existing) data.customerId = existing.id
  }
  const creatingParty = !data.customerId && !isAnonymousName(data.customerName)
  const found = data.customerId && !picked ? data.customerId : null

  const customer = data.customerId
    ? await db.customer.findUnique({ where: { id: data.customerId }, select: { state: true, loyaltyPoints: true, pan: true } })
    : creatingParty ? { state: null, loyaltyPoints: 0, pan: data.customerPan ?? null } : null

  // Salesperson snapshot — firmId-scoped (unlike the customerId lookup above) so an id belonging to
  // another firm can never attribute this bill to a stranger's staff record. Name/code are frozen
  // here, at billing time, into the columns the invoice actually stores (see schema comment on
  // Invoice.salesPersonId) — a later rename or code reassignment must not rewrite this bill's history.
  const salesPerson = data.salesPersonId
    ? await db.customer.findFirst({ where: { id: data.salesPersonId, firmId }, select: { id: true, firstName: true, lastName: true, code: true } })
    : null
  const salesPersonName = salesPerson ? `${salesPerson.firstName} ${salesPerson.lastName || ''}`.trim() : null

  // ── Cash / PAN compliance gate (s.269ST / Rule 114B) — server-side, not just a UI hint ────────
  // A large cash bill with no PAN on file is direct penalty exposure for the shop owner. Firm-
  // configurable via the Setting key/value model (no schema change): Settings > Billing writes
  // CASH_LIMIT_KEYS.sale / .purchase. urd is excluded — an unregistered seller has no PAN capture
  // flow here and is already handled by the "Seller ID Proof" note on that voucher.
  let patchCustomerPan: string | null = null
  if ((type === 'sale' || type === 'purchase') && data.amountByCash > 0) {
    const limitKey = type === 'sale' ? CASH_LIMIT_KEYS.sale : CASH_LIMIT_KEYS.purchase
    const setting = await db.setting.findUnique({ where: { firmId_key: { firmId, key: limitKey } } })
    const limit = Number(setting?.value) || 0
    if (limit > 0 && data.amountByCash > limit) {
      const pan = (data.customerPan || customer?.pan || '').trim()
      if (!pan) {
        const who = type === 'sale' ? "the customer's" : "the supplier's"
        return NextResponse.json({
          error: `Cash amount ₹${data.amountByCash} exceeds this firm's ₹${limit} limit with no PAN on file. Record ${who} PAN (Income-tax Rule 114B) or keep the cash portion at or below ₹${limit} (s.269ST bars accepting ₹2,00,000+ in cash regardless of PAN).`,
          code: 'PAN_REQUIRED',
        }, { status: 400 })
      }
      // A PAN keyed in at the billing counter backfills the party record if it had none — the same
      // "PAN CARD NO UPDATE VALIDATION" behaviour oMunim's setting name describes. Never overwrites
      // an existing PAN (a billing-time typo must not silently clobber verified KYC data).
      if (data.customerId && data.customerPan && !customer?.pan) patchCustomerPan = data.customerPan
    }
  }

  // ── TCS u/s 206C(1H) (Income-tax Act) — off by default, per-firm opt-in ────────────────────────
  // Only meaningful for a sale to an identified buyer (cumulative-per-buyer is undecidable for an
  // anonymous walk-in cash sale with no customerId — create a customer record if this matters).
  // See TCS_SETTING_KEYS in src/lib/gst.ts for the full scope decision (1H only, not s.206C(1)).
  let tcsApplicable = false
  let tcsThreshold = TCS_DEFAULTS.threshold
  let tcsRate = TCS_DEFAULTS.rate
  let tcsRateNoPan = TCS_DEFAULTS.rateNoPan
  if (type === 'sale' && (data.customerId || creatingParty)) {
    const tcsSettings = await db.setting.findMany({ where: { firmId, key: { in: Object.values(TCS_SETTING_KEYS) } } })
    const settingMap = new Map(tcsSettings.map((s) => [s.key, s.value]))
    tcsApplicable = settingMap.get(TCS_SETTING_KEYS.applicable) === 'true'
    tcsThreshold = Number(settingMap.get(TCS_SETTING_KEYS.threshold)) || TCS_DEFAULTS.threshold
    tcsRate = Number(settingMap.get(TCS_SETTING_KEYS.rate)) || TCS_DEFAULTS.rate
    tcsRateNoPan = Number(settingMap.get(TCS_SETTING_KEYS.rateNoPan)) || TCS_DEFAULTS.rateNoPan
  }
  const thisReceipt = round2(data.amountByCash + data.amountByCard + data.amountByUPI + data.amountByCheque)

  // Place of supply is DERIVED from firm vs buyer state, never taken from a client click — unless
  // the operator explicitly overrides it (rare: incomplete state master data), in which case the
  // override is logged so a mis-filed return is traceable back to a human decision.
  const derived = derivePlaceOfSupply(firm.state, customer?.state ?? null)
  let gstType: GstType
  let overrideLogged = false
  if (derived) {
    if (data.gstTypeOverride && data.gstType) {
      gstType = data.gstType
      overrideLogged = gstType !== derived
    } else {
      gstType = derived
    }
  } else {
    gstType = data.gstType || 'intra'
  }

  // Loyalty redeem: clamp to the balance read here, then re-verify the same balance INSIDE the
  // transaction (a concurrent invoice could spend it first) — see InsufficientLoyaltyError below.
  const redeemRequested = data.loyaltyRedeemed
  const redeemClamped = type === 'sale' && customer ? Math.min(redeemRequested, customer.loyaltyPoints || 0) : 0

  // An advance is a named party's money. A walk-in, a purchase or a party about to be created holds none.
  // Per-document picks (merged per source) win over the aggregate figure.
  const merge = (rows: { source: string; amount: number }[] | undefined) => {
    const m = new Map<string, number>()
    for (const r of rows ?? []) if (r.amount > 0) m.set(r.source, round2((m.get(r.source) || 0) + r.amount))
    return m
  }
  const advancePicks = merge(data.advanceItems)
  const duePicks = merge(data.dueItems)
  const advanceApplied = advancePicks.size ? round2([...advancePicks.values()].reduce((a, b) => a + b, 0)) : round2(data.advanceApplied)
  if (duePicks.size) data.previousAmount = round2([...duePicks.values()].reduce((a, b) => a + b, 0))
  if ((advanceApplied > 0 || duePicks.size) && (type !== 'sale' || !(picked ?? found))) {
    return NextResponse.json({ error: 'An advance can only be set against a sale to a customer who already holds one', code: 'ADVANCE_NOT_APPLICABLE' }, { status: 400 })
  }

  const oldMetalRows = deriveOldMetalRows(data.oldMetalRows)
  // Metal-to-metal and a bhav cut are different answers to "how is the old metal settled": a cut
  // off the RATE PAID has nothing to bite on when the metal is cancelled weight for weight.
  if (oldMetalRows?.some((r) => r.priceOnFine) && data.bhavCut > 0) {
    return NextResponse.json({ error: 'A bhav cut cannot be combined with a metal-to-metal exchange', code: 'EXCHANGE_BHAV_CUT' }, { status: 400 })
  }
  // Same setting the sell screen previews with — a bill must save the way it was shown. Only read
  // when there are rows to price; absent/unknown value = 'agreedRate' (today's behaviour).
  let oldMetalPricing: OldMetalPricing = 'agreedRate'
  if (oldMetalRows?.length) {
    const pricingRow = await db.setting.findUnique({ where: { firmId_key: { firmId, key: COUNTER_CALC_SETTING_KEYS.oldMetalPricing } } })
    if (pricingRow?.value === 'fineAtPureRate') oldMetalPricing = 'fineAtPureRate'
  }
  const totals = computeInvoiceTotals({
    lines: data.items.map((l) => ({ amount: l.amount, gstRate: l.gstRate ?? undefined, hsnCode: l.hsnCode })),
    oldMetalRows,
    discount: data.discount,
    metalAmount: data.metalAmount,
    previousAmount: data.previousAmount,
    loyaltyRedeemed: redeemClamped,
    oldGoldWeight: data.oldGoldWeight,
    oldGoldRate: data.oldGoldRate,
    bhavCut: data.bhavCut,
    oldMetalPricing,
    gstType,
    rates: { cgstRate: firm.cgstRate, sgstRate: firm.sgstRate, igstRate: firm.igstRate },
    taxed,
    taxInclusive: data.taxInclusive,
  })

  // netOldGold always counts as a payment leg even if the operator never keyed the Gold field —
  // and never double-counts if they did (we take the larger of the two, not the sum).
  const amountByGold = Math.max(data.amountByGold, totals.netOldGold)
  if (advanceApplied > totals.totalAmount) {
    return NextResponse.json({ error: `The advance applied (₹${advanceApplied}) is more than the bill (₹${totals.totalAmount})`, code: 'ADVANCE_EXCEEDS_BILL' }, { status: 400 })
  }
  // An unpaid balance is a debt (Dr Sundry Debtors / Cr Sundry Creditors) and a debt needs a name.
  // Same rule, same helper as the sell screen's guard: no picked/found party and a blank or
  // anonymous ("Cash", "Walk-in") name would post the receivable to nobody. A real typed name is
  // fine - the party is created in the transaction below. Balance mirrors buildLedgerEntries().
  const unpaid = round2(totals.totalAmount - (data.amountByCash + data.amountByCard + data.amountByUPI + data.amountByCheque + amountByGold + (type === 'sale' ? advanceApplied : 0)))
  if (unpaid > 0.5 && !data.customerId && !creatingParty) {
    return NextResponse.json({
      error: `${unpaid.toFixed(2)} is left unpaid. Enter the ${type === 'sale' ? 'customer' : 'supplier'}'s real name (not "Cash"/"Walk-in") so it goes on their account, or pay the full amount.`,
      code: 'CREDIT_NEEDS_PARTY',
    }, { status: 400 })
  }
  const earned = type === 'sale' && customer ? Math.floor((totals.totalAmount / 100) * (firm.loyaltyRate || 0)) : 0

  const invoiceDate = data.invoiceDate ?? new Date()
  const isStockIn = type === 'purchase' || type === 'urd'
  const items = data.items

  // Allocated ahead of the main transaction — see allocateInvoiceNo() for why. An explicit
  // client-supplied invoiceNo (rare manual override) skips the sequence entirely, so it never
  // burns a number it doesn't use.
  const invoiceNo = data.invoiceNo || (await allocateInvoiceNo(firmId, type))

  let invoice
  // Cast on the initializer, not just the annotation: TS's control-flow narrowing does not see
  // inside the nested transaction closure below where this is actually assigned, and without the
  // cast it narrows the type back down to literal `null` at the read site near the bottom of this
  // function (a known TS closure-narrowing gap, reproduced and confirmed in isolation).
  let tcsPosted: ReturnType<typeof computeTcs> | null = null as ReturnType<typeof computeTcs> | null
  try {
    invoice = await withRetry(() => db.$transaction(async (tx) => {
      // Reset every attempt: a retried transaction rolled back the customer it created last time.
      data.customerId = picked ?? found
      // Take the party's row lock FIRST, before any read in this transaction. InnoDB fixes the
      // snapshot at the first consistent read, so locking after one would let two bills both see the
      // same advance and both spend it.
      let advanceLegs: { tag: string; amount: number }[] | undefined
      let dueLegs: { tag: string; amount: number }[] | undefined
      if ((advanceApplied > 0 || duePicks.size) && data.customerId) {
        await tx.$queryRaw`SELECT id FROM Customer WHERE id = ${data.customerId} AND firmId = ${firmId} FOR UPDATE`
        const pos = await partyPosition(tx, firmId, data.customerId)
        if (!pos || advanceApplied > pos.advanceApplicable) {
          throw new AdvanceExceededError(`Advance applied ₹${advanceApplied} is more than the ₹${pos?.advanceApplicable ?? 0} this party holds`)
        }
        // Each ticked document must still be open for at least what was asked of it.
        const legsFor = (picks: Map<string, number>, items: { source: string; docNo: string; amount: number }[], what: string) =>
          [...picks].map(([source, amount]) => {
            const it = items.find((i) => i.source === source)
            if (!it || amount > it.amount) throw new AdvanceExceededError(`${what} ${it?.docNo ?? source}: ₹${amount} asked, ₹${it?.amount ?? 0} open`)
            return { tag: source === 'other' ? '' : ` (from ${it.docNo})`, amount }
          })
        if (advancePicks.size) advanceLegs = legsFor(advancePicks, pos.advanceItems, 'Advance from')
        if (duePicks.size) {
          if (data.previousAmount > pos.dueCollectable) throw new AdvanceExceededError(`Previous balance ₹${data.previousAmount} is more than the ₹${pos.dueCollectable} that can be collected on a bill`)
          dueLegs = legsFor(duePicks, pos.dueItems, 'Previous balance')
        }
      }
      if (creatingParty) {
        data.customerId = (await resolveParty(tx, {
          firmId, userId: user.id, source: `${type} bill`, type: partyType,
          name: data.customerName, mobile: data.customerMobile, pan: data.customerPan,
        })).id
      }

      // Fill gross weight (stone weight / HSN / HUID / stone cert) for stock-backed lines that
      // omitted them, from the linked StockItem — one batched query, firmId-scoped so a line can
      // never pull another firm's stock row. netWeight is never touched — it stays exactly as the
      // client sent it. huid is the legally-mandated BIS Hallmark UID snapshot (see
      // prisma/schema.prisma InvoiceItem.huid) — this is the one query that gets it onto the bill.
      const stockLineIds = Array.from(new Set(items.filter((it) => it.stockItemId).map((it) => it.stockItemId as string)))
      const stockFillMap = new Map<string, { grossWeight: number; stoneWeight: number | null; hsnCode: string | null; huid: string | null; stoneCertNo: string | null; qty: number }>()
      // Cost basis of the items being sold, for the COGS legs. Read in the SAME firmId-scoped query
      // as the weight fill — one round trip, and a foreign firm's cost can never be relieved here.
      const costMap = new Map<string, { cost: number | null; metal: Metal }>()
      if (stockLineIds.length) {
        const stockRows = await tx.stockItem.findMany({
          where: { id: { in: stockLineIds }, firmId },
          select: { id: true, qty: true, grossWeight: true, stoneWeight: true, hsnCode: true, costPrice: true, metalType: true, category: true, hallmarkUid: true, diamondCertNo: true },
        })
        for (const s of stockRows) {
          stockFillMap.set(s.id, { grossWeight: s.grossWeight, stoneWeight: s.stoneWeight, hsnCode: s.hsnCode, huid: s.hallmarkUid, stoneCertNo: s.diamondCertNo, qty: s.qty })
          costMap.set(s.id, { cost: s.costPrice, metal: metalOf(s) })
        }
        // Any id this firm-scoped query did not return either does not exist or belongs to someone
        // else. Refuse here, not further down: the stock CLAIM below is skipped entirely on a memo
        // bill (`updateInventory: false`) and on a purchase, so those paths had no firm check at
        // all and would persist a foreign stockItemId onto an InvoiceItem. DELETE then read that id
        // back to restore stock — so another firm's sold piece could reappear on their shelf from a
        // bill they never issued. One guard where every path already converges.
        const foreign = stockLineIds.filter((id) => !stockFillMap.has(id))
        if (foreign.length) {
          throw new StockUnavailableError(
            `Stock item ${foreign[0]} is not in this firm — a bill can only sell this firm's own stock`,
          )
        }
      }

      const categoryCounts = new Map<string, number>()
      const itemsForCreate: ReturnType<typeof toInvoiceItemData>[] = []
      // Cost basis captured at stock-in. `costPrice` used to be the per-gram metal RATE (and was
      // NULL on every seeded row), which is not a cost at all — no COGS could ever be computed
      // from it. It is now this line's share of what the books actually capitalise: taxable value,
      // net of its pro-rata discount and including the header metal amount, so
      //   Σ costPrice over the invoice === the debit posted to the metal stock accounts.
      const lineCosts = isStockIn ? allocate(totals.taxableValue, totals.lineTax.map((t) => t.taxable)) : []
      const stockInByMetal: { metal: Metal; amount: number }[] = []
      for (let i = 0; i < items.length; i++) {
        const line = items[i]
        const lineTax = totals.lineTax[i]
        if (isStockIn) {
          const category = line.category || 'fine'
          const itemCode = line.itemCode || (await nextItemCode(tx, firmId, category, categoryCounts))
          // The hallmark UID the supplier's bill carries lands on the stock item it creates (it used to
          // be dropped, so a purchased piece could never be sold with its HUID). Checked here for a
          // named 409; the @@unique([firmId, hallmarkUid]) index stays the race-proof backstop.
          const huid = line.huid?.trim() || null
          if (huid) {
            const clash = await tx.stockItem.findFirst({ where: { firmId, hallmarkUid: huid }, select: { itemCode: true, name: true } })
            if (clash) throw new HuidConflictError(`HUID ${huid} is already on stock item ${clash.itemCode || clash.name} - a hallmark UID identifies one physical piece`)
          }
          const stockItem = await tx.stockItem.create({
            data: {
              firmId,
              itemCode,
              name: line.name,
              category,
              purity: line.purity ?? null,
              purityPercent: line.purityPercent != null ? Number(line.purityPercent) : null,
              hsnCode: line.hsnCode ?? hsnForCategory(category, line.metalType), // classification only, never a rate
              grossWeight: Number(line.grossWeight) || 0,
              netWeight: Number(line.netWeight) || 0,
              stoneWeight: line.stoneWeight != null ? Number(line.stoneWeight) : null,
              stoneAmount: line.stoneAmount != null ? Number(line.stoneAmount) : null,
              makingCharge: Number(line.makingCharge) || 0,
              qty: line.qty != null ? Number(line.qty) : 1,
              barcode: line.barcode || null,
              hallmarkUid: huid,
              metalType: line.metalType ?? null,
              metalName: line.metalName ?? null,
              costPrice: lineCosts[i],
              // mrp is the LOT TOTAL for `qty` pieces (schema convention: every money/weight column on
              // StockItem is the row total). A weight-priced line's `rate` is per-GRAM (writing it was the
              // old bug), so its lot total is the server-held line base; a flat line's rate is the
              // per-piece price, so lot total = rate x qty. Selling 1 of N scales mrp by sellQty/qty.
              mrp: line.byWeight ? round2(lineTax.base) : round2((Number(line.rate) || 0) * (Number(line.qty) > 0 ? Number(line.qty) : 1)),
              metalRate: data.goldRate != null ? Number(data.goldRate) : null,
              status: 'available',
              billDate: invoiceDate,
            },
          })
          stockInByMetal.push({ metal: metalOf({ metalType: line.metalType, category }), amount: lineCosts[i] })
          itemsForCreate.push(toInvoiceItemData(line, lineTax, stockItem.id))
        } else {
          let fill = line.stockItemId ? stockFillMap.get(line.stockItemId) : undefined
          // Weights on a StockItem are LOT TOTALS. A part-sale bills only its share of the lot's
          // gross weight (a whole-lot sale is left untouched, bit for bit).
          const lineQty = Math.max(1, Math.round(Number(line.qty) || 1))
          if (fill && fill.qty > lineQty) fill = { ...fill, grossWeight: roundWeight(fill.grossWeight * lineQty / fill.qty) }
          itemsForCreate.push(toInvoiceItemData(line, lineTax, undefined, fill))
        }
      }

      // Re-verify the loyalty balance inside the transaction — it may have moved since we read it
      // above. If it no longer covers what we clamped totals to, fail the whole invoice with 409
      // rather than silently redeeming a stale amount.
      if (type === 'sale' && data.customerId && redeemClamped > 0) {
        const freshCustomer = await tx.customer.findUnique({ where: { id: data.customerId }, select: { loyaltyPoints: true } })
        if (!freshCustomer || (freshCustomer.loyaltyPoints || 0) < redeemClamped) {
          throw new InsufficientLoyaltyError('Loyalty balance changed — please retry')
        }
      }

      // TCS u/s 206C(1H): cumulative receipts from THIS buyer, THIS financial year, computed fresh
      // inside the transaction (not the pre-transaction read above) so two concurrent invoices for
      // the same buyer cannot both under-count who crosses the threshold first — read here,
      // immediately before this invoice's own row is created, so it never counts itself.
      let tcsResult: ReturnType<typeof computeTcs> | null = null
      if (tcsApplicable && data.customerId) {
        const fy = financialYear(invoiceDate)
        const priorAgg = await tx.invoice.aggregate({
          where: { firmId, customerId: data.customerId, type: 'sale', status: { not: 'deleted' }, invoiceDate: { gte: fy.from, lte: fy.to } },
          _sum: { amountByCash: true, amountByCard: true, amountByUPI: true, amountByCheque: true },
        })
        const priorReceipts = round2(
          (priorAgg._sum.amountByCash || 0) + (priorAgg._sum.amountByCard || 0) +
          (priorAgg._sum.amountByUPI || 0) + (priorAgg._sum.amountByCheque || 0),
        )
        const panForTcs = (patchCustomerPan || customer?.pan || '').trim()
        tcsResult = computeTcs({
          priorReceipts, thisReceipt, hasPan: !!panForTcs,
          threshold: tcsThreshold, rate: tcsRate, rateNoPan: tcsRateNoPan,
        })
      }

      const created = await tx.invoice.create({
        data: {
          firmId,
          type,
          userId: user.id,
          updateInventory: data.updateInventory,
          taxInclusive: data.taxInclusive,
          invoiceDate,
          invoiceNo,
          customerId: data.customerId ?? null,
          customerName: data.customerName,
          customerMobile: data.customerMobile ?? null,
          billingName: data.billingName ?? null,
          supplierBillNo: data.supplierBillNo ?? null,
          supplierBillDate: data.supplierBillDate ?? null,
          supplierDueDate: data.supplierDueDate ?? null,
          paymentTerms: data.paymentTerms ?? null,
          goldRate: data.goldRate ?? null,
          previousAmount: totals.previousAmount,
          subtotal: totals.subtotal,
          taxableValue: totals.taxableValue,
          discount: totals.discount,
          rofAmount: totals.rofAmount,
          cgst: totals.cgst,
          sgst: totals.sgst,
          igst: totals.igst,
          totalAmount: totals.totalAmount,
          metalAmount: totals.metalAmount,
          amountByCash: data.amountByCash,
          amountByCard: data.amountByCard,
          amountByUPI: data.amountByUPI,
          amountByCheque: data.amountByCheque,
          amountByGold,
          paymentMode: data.paymentMode || 'cash',
          status: data.status || 'completed',
          note: data.note ?? null,
          // With rows: legacy scalars are DERIVED from them so the print sheet and old readers keep
          // working. Without rows: exactly as before.
          oldGoldWeight: oldMetalRows ? totals.oldMetalNetWeight : data.oldGoldWeight,
          oldGoldValue: totals.oldGoldValue,
          // AUTHORITATIVE per-10-gram — see schema comment on Invoice.oldGoldRate. Stored as-quoted
          // rather than defaulted to 0 so a print sheet can tell "never quoted" from "quoted at zero".
          // With rows, only a lone GOLD row has a per-10g rate to put here; a lone silver row is
          // per-KG (would be a 100x lie in this column), alloy/stone have none, and a mixed
          // exchange has no single rate — all NULL. The per-row rate lives in oldMetalRows.
          // A fine-priced row's rate is a PURE rate, so weight x rate would not equal its value on the print.
          oldGoldRate: oldMetalRows?.some((r) => r.priceOnFine) ? null : oldMetalRows
            ? (oldMetalRows.length === 1 && oldMetalRows[0].type === 'gold' ? oldMetalRows[0].rate || null : null)
            : data.oldGoldRate || null,
          oldGoldPurity: oldMetalRows
            ? (oldMetalRows.length === 1 && oldMetalRows[0].tunch != null ? String(oldMetalRows[0].tunch) : null)
            : data.oldGoldPurity ?? null,
          // CONDITIONAL SPREAD, DELIBERATELY. The live DB may not have the oldMetalRows column yet
          // (migration is applied by the owner); an ordinary invoice must not mention it at all or
          // Prisma emits it in the INSERT and every bill 500s. `oldMetalRows: x ?? null` is NOT
          // equivalent — do not "tidy" this into an unconditional write.
          ...(oldMetalRows ? { oldMetalRows: JSON.stringify(oldMetalRows) } : {}),
          bhavCut: data.bhavCut,
          loyaltyRedeemed: totals.loyaltyRedeemed,
          loyaltyEarned: earned,
          // salesPerson.id, never data.salesPersonId directly — an id that failed the firmId-scoped
          // lookup above (wrong firm, or simply doesn't exist) is dropped rather than stored, so a
          // bad client value can never trip the salesPersonId foreign key and fail the whole bill.
          salesPersonId: salesPerson?.id ?? null,
          salesPersonName,
          staffCode: salesPerson?.code ?? null,
          counterName: data.counterName ?? null,
          schemeEntryId: data.schemeEntryId ?? null,
          items: itemsForCreate.length ? { create: itemsForCreate } : undefined,
        },
        include: { items: true },
      })

      // Cost of what left the shelf, per metal book. Only stock-backed lines can have a cost:
      // an ad-hoc line names no StockItem, so there is no cost basis to relieve and no COGS leg is
      // invented for it. Counted, not ignored — `uncosted` goes into the SystemLog line below so
      // an unrelieved sale is traceable instead of quietly inflating gross profit.
      const cogsByMetal: { metal: Metal; amount: number }[] = []
      let uncosted = 0
      let splitLots = 0
      const pendingLines = created.items.map((l) => ({ id: l.id, stockItemId: l.stockItemId, qty: l.qty }))
      // `updateInventory: false` is the owner's memo-bill switch. It skips the stock status change
      // AND the COGS relief together — relieving cost for stock that was never relieved would
      // overstate gross profit by exactly the cost of every memo bill ever raised. The lines still
      // count as `uncosted`, so the SystemLog entry below records that this invoice moved no stock
      // rather than leaving a silent hole between revenue and inventory.
      if (type === 'sale' && data.updateInventory) {
        for (const it of items) {
          if (it.stockItemId) {
            const sellQty = Math.max(1, Math.round(Number(it.qty) || 1))
            const label = it.itemCode || it.stockItemId
            // Atomic claim: ONE conditional updateMany. count proves the stock was there; firmId
            // closes the cross-firm leak; status+qty stops two tills selling the last piece.
            const r = await tx.stockItem.updateMany({ where: { id: it.stockItemId, firmId, status: 'available', qty: { gte: sellQty } }, data: { qty: { decrement: sellQty } } })
            if (r.count !== 1) {
              // Read-after-failure is safe: nothing was written.
              const now = await tx.stockItem.findFirst({ where: { id: it.stockItemId, firmId, status: 'available' }, select: { qty: true } })
              throw new StockUnavailableError(now && now.qty < sellQty ? `Item ${label}: only ${now.qty} of the ${sellQty} requested are in stock` : `Item ${label} is no longer available`)
            }
            const row = await tx.stockItem.findUnique({ where: { id: it.stockItemId }, include: { stones: true } })
            if (!row) throw new StockUnavailableError(`Item ${label} is no longer available`)
            const remaining = row.qty
            let cost = row.costPrice
            if (remaining === 0) {
              // Whole lot (every existing qty=1 row): the row itself is sold, invoice line stays on it.
              await tx.stockItem.updateMany({ where: { id: row.id, firmId }, data: { status: 'sold' } })
            } else {
              if (row.hallmarkUid || row.rfidNo || row.barcode) {
                throw new StockUnavailableError(`Item ${label} carries a HUID/RFID — it is one physical article and cannot be part-sold; correct its quantity in Stock`)
              }
              // Lot totals split by exact remainder: the parent keeps v - share(v), so the shares
              // over the whole lot sum to EXACTLY v and no paisa/milligram is ever stranded.
              const total = remaining + sellQty
              // EVERY weight and money column on a StockItem is a LOT TOTAL for `qty` pieces (see the
              // StockItem comment in prisma/schema.prisma): computeOmunimStock() derives the charge
              // columns FROM the lot's own weights and qty (GM charge on lot gross weight, PP charge =
              // value x qty). finalValuation is their sum and is scaled, so the components must be too,
              // or the child contradicts itself and parent + child carry more charges than the lot had.
              // Counts scale (round2) so qty x rate == total still holds on the row.
              // NEVER scale rates / percentages / per-unit figures - dividing one silently re-prices the item:
              //   metalRate, purityPercent, finalPurity, wastagePercent, customerWastage (a %),
              //   makingCgst/Sgst/IgstPercent, priceCgst/Sgst/IgstPercent (rates),
              //   packetWt1..5 (weight of ONE packet), labourChrg1..5 (a rate), stoneRateCt, stoneSellRateCt.
              const W = ['grossWeight', 'lessWeight', 'packetWeight', 'netWeight', 'tagWeight', 'finalWeight', 'finalFineWeight', 'stoneWeight', 'stoneGrossWeightCt', ...LOT_WEIGHT_EXTRA] as const
              const M = ['finalValuation', 'mrp', 'costPrice', 'stoneAmount', ...LOT_MONEY_EXTRA] as const
              const C = LOT_COUNTS
              const childScaled: Record<string, number | null> = {}
              const parentScaled: Record<string, number | null> = {}
              for (const [cols, rnd] of [[W, roundWeight], [M, round2], [C, round2]] as const) {
                for (const k of cols) {
                  const v = row[k]
                  if (v == null) { childScaled[k] = null; parentScaled[k] = null; continue }
                  const share = rnd(v * sellQty / total)
                  childScaled[k] = share
                  parentScaled[k] = rnd(v - share)
                }
              }
              // A returned or deleted part-sale comes back as its OWN available row, not merged into
              // the parent — on purpose. Totals are unaffected (the child carries exactly its share;
              // stock reports sum rows). A merge would need an identity rule for "the same lot" that
              // the schema has no column for (e.g. a splitFromId on StockItem).
              const { id: _id, createdAt: _c, updatedAt: _u, stones: parentStones, ...rest } = row
              const child = await tx.stockItem.create({
                data: {
                  ...rest, ...childScaled,
                  // itemCode is unique per firm, so the child cannot reuse the parent's.
                  itemCode: row.itemCode ? `${row.itemCode}-${created.invoiceNo}-${splitLots + 1}` : null,
                  hallmarkUid: null, rfidNo: null, barcode: null, qty: sellQty, status: 'sold',
                } as Prisma.StockItemUncheckedCreateInput,
              })
              await tx.stockItem.update({ where: { id: row.id }, data: parentScaled })
              // Stone rows follow the lot: quantities use the same share / complement rule as the
              // scalar columns; rates, units and grading are copied untouched. Null stays null.
              const sh = (v: number | null, rnd: (n: number) => number) => {
                if (v == null) return { c: null, p: null }
                const c = rnd(v * sellQty / total)
                return { c, p: rnd(v - c) }
              }
              for (const st of parentStones) {
                const { id: stId, createdAt: _sc, updatedAt: _su, ...stRest } = st
                const q = sh(st.qty, round2), cw = sh(st.caratWeight, roundWeight), wg = sh(st.weightGrams, roundWeight), am = sh(st.amount, round2)
                await tx.stone.create({ data: { ...stRest, firmId, stockItemId: child.id, qty: q.c, caratWeight: cw.c, weightGrams: wg.c, amount: am.c } })
                await tx.stone.update({ where: { id: stId }, data: { qty: q.p, caratWeight: cw.p, weightGrams: wg.p, amount: am.p } })
              }
              const pi = pendingLines.findIndex((l) => l.stockItemId === row.id && l.qty === sellQty)
              if (pi < 0) throw new Error('Invoice line for a split lot not found')
              await tx.invoiceItem.update({ where: { id: pendingLines[pi].id }, data: { stockItemId: child.id } })
              pendingLines.splice(pi, 1)
              splitLots++
              cost = child.costPrice
            }
            const c = costMap.get(it.stockItemId)
            if (cost && c) cogsByMetal.push({ metal: c.metal, amount: round2(cost) })
            else uncosted++
          } else {
            uncosted++
          }
        }
      } else if (type === 'sale') {
        uncosted += items.length
      }

      const label = type === 'urd' ? 'URD Purchase' : type === 'purchase' ? 'Purchase' : 'Invoice'
      // Self-provision the Round Off account for this firm only when this invoice actually needs
      // it — most invoices land on a whole rupee and never touch it.
      const roundOffAccountName = created.rofAmount !== 0 ? await ensureAccount(tx, firmId, ROUND_OFF_ACCOUNT) : ROUND_OFF_ACCOUNT.name
      // Same self-provision, only when this purchase/urd actually overpaid the supplier.
      const paidTotal = (created.amountByCash || 0) + (created.amountByCard || 0) + (created.amountByUPI || 0) + (created.amountByCheque || 0) + (created.amountByGold || 0)
      const overpaid = type !== 'sale' && created.totalAmount - paidTotal < 0
      const advanceToSupplierAccountName = overpaid ? await ensureAccount(tx, firmId, ADVANCE_TO_SUPPLIER_ACCOUNT) : ADVANCE_TO_SUPPLIER_ACCOUNT.name
      // Same self-provision, only when this sale actually crossed the TCS threshold.
      const tcsPayableAccountName = tcsResult && tcsResult.tcsAmount > 0 ? await ensureAccount(tx, firmId, TCS_PAYABLE_ACCOUNT) : TCS_PAYABLE_ACCOUNT.name
      // Which bank the non-cash tender belongs to. Resolved only when there IS non-cash tender, so
      // a cash-only bill still costs no extra query. Throws BankAccountNotFoundError (-> 404) if the
      // body named an account belonging to another firm.
      const cardUpi = round2((created.amountByCard || 0) + (created.amountByUPI || 0))
      const chequeAmount = round2(created.amountByCheque || 0)
      const bank = cardUpi > 0 || chequeAmount > 0
        ? await resolveBankAccount(tx, firmId, data.bankAccountId)
        : { id: null, ledgerName: GENERIC_BANK_ACCOUNT }
      // Self-provision Cheques in Transit the first time this firm takes a cheque at the counter,
      // exactly as the bank screen does.
      //
      // Only when the firm actually has a named bank account. A firm that has named none gets the
      // old behaviour — cheque pooled into the generic "Bank Account" — deliberately: with no
      // BankAccount there is no BankTransaction to raise, so nothing could ever clear the cheque and
      // the balance would sit in Cheques in Transit forever. In-transit treatment arrives with bank
      // reconciliation, it is not forced on a firm that has not set it up.
      const chequeAccountName = chequeAmount > 0 && bank.id
        ? await ensureChartAccount(tx, firmId, CHEQUES_IN_TRANSIT_ACCOUNT)
        : bank.ledgerName
      // One voucher per invoice: every leg shares a voucherId, so DELETE can reverse the whole
      // event by reference instead of hunting legs. postVoucher proves debits = credits before it
      // writes, inside this same transaction — an unbalanced invoice never reaches the books.
      // buildLedgerEntries' zero-leg filter stays: normaliseLegs rejects a leg with no amount,
      // and most invoices legitimately have a zero IGST / zero balance / zero loyalty leg.
      const voucherId = await postVoucher(tx, {
        firmId,
        userId: user.id,
        date: created.invoiceDate,
        type,
        invoiceId: created.id,
        narration: `${label} ${created.invoiceNo} - ${created.customerName}`,
        // customerId is set per leg, not voucher-wide: buildLedgerEntries deliberately leaves the
        // GST legs unattributed to a party, and a voucher-level customerId would fill them in.
        legs: buildLedgerEntries({ ...created, advanceApplied, advanceLegs, dueLegs }, type, sumByMetal(type === 'sale' ? cogsByMetal : stockInByMetal), roundOffAccountName, advanceToSupplierAccountName,
          tcsResult && tcsResult.tcsAmount > 0 ? { amount: tcsResult.tcsAmount, payableAccountName: tcsPayableAccountName } : undefined,
          { bankAccountName: bank.ledgerName, chequeAccountName }).map((e) => ({
          accountName: e.accountName,
          debit: e.debit,
          credit: e.credit,
          customerId: e.customerId ?? null,
          particulars: e.particulars,
          type: e.type as VoucherType,
        })),
      })

      // A counter cheque becomes a pending BankTransaction in the SAME transaction as the invoice
      // and its voucher — so it shows in the pending-cheque list and can be cleared (money lands on
      // the named account, dated the real clearing date) or bounced (a correcting voucher, never an
      // edit) through src/app/api/bank/transactions/[id]. Without this row the cheque leg above
      // would sit in Cheques in Transit forever with nothing able to move it.
      if (chequeAmount > 0 && bank.id) {
        await tx.bankTransaction.create({
          data: {
            firmId, bankAccountId: bank.id, type: type === 'sale' ? 'cheque_in' : 'cheque_out',
            amount: chequeAmount, transactionDate: created.invoiceDate, clearingDate: null, status: 'pending',
            chequeNumber: data.chequeNumber ?? null,
            // What a bounce must restore: the party still owes (or is still owed) the money.
            counterAccountName: type === 'sale' ? 'Sundry Debtors' : 'Sundry Creditors',
            narration: `${label} ${created.invoiceNo} - ${created.customerName}`,
            voucherId, userId: user.id,
          },
        })
      }

      // Loyalty ledger — atomic with the invoice it belongs to, never a post-commit write.
      if (type === 'sale' && data.customerId) {
        if (redeemClamped > 0) {
          const pts = Math.round(redeemClamped)
          await tx.loyaltyPoint.create({ data: { firmId, customerId: data.customerId, points: -pts, type: 'redeem', refInvoiceId: created.id, note: `Redeemed on ${created.invoiceNo}` } })
          await tx.customer.update({ where: { id: data.customerId }, data: { loyaltyPoints: { decrement: pts } } })
        }
        if (earned > 0) {
          await tx.loyaltyPoint.create({ data: { firmId, customerId: data.customerId, points: earned, type: 'earn', refInvoiceId: created.id, note: `Earned on ${created.invoiceNo}` } })
          await tx.customer.update({ where: { id: data.customerId }, data: { loyaltyPoints: { increment: earned } } })
        }
      }

      if (patchCustomerPan && data.customerId) {
        await tx.customer.update({ where: { id: data.customerId }, data: { pan: patchCustomerPan } })
        await tx.systemLog.create({ data: { userId: user.id, firmId, action: 'update', entity: 'customer', entityId: data.customerId, details: `PAN captured at billing (Rule 114B, cash > limit) on ${created.invoiceNo}` } })
      }

      await tx.systemLog.create({ data: { userId: user.id, firmId, action: 'create', entity: 'invoice', entityId: created.id, details: `${label} ${created.invoiceNo} ₹${created.totalAmount}${advanceApplied > 0 ? ` · ₹${advanceApplied} advance adjusted` : ''}${type === 'sale' && !data.updateInventory ? ' · MEMO BILL — inventory deliberately not updated, no COGS posted' : uncosted ? ` · ${uncosted} line(s) sold with no cost basis — no COGS posted` : ''}${splitLots ? ' | ' + splitLots + ' lot(s) part-sold and split' : ''}` } })
      if (overrideLogged) {
        await tx.systemLog.create({ data: { userId: user.id, firmId, action: 'gst-override', entity: 'invoice', entityId: created.id, details: `Derived ${derived} but used ${gstType} on ${created.invoiceNo}` } })
      }
      if (tcsResult && tcsResult.tcsAmount > 0) {
        await tx.systemLog.create({ data: { userId: user.id, firmId, action: 'tcs', entity: 'invoice', entityId: created.id, details: `TCS u/s 206C(1H) ₹${tcsResult.tcsAmount} @ ${tcsResult.rate}% collected on ${created.invoiceNo} (cumulative FY receipts from this buyer now ₹${tcsResult.cumulativeReceipts})` } })
      }
      if (data.schemeEntryId) {
        // Link only — see Invoice.schemeEntryId schema comment. Logged so a bill that claims to be
        // scheme-settled but was not actually netted against Customer Advances is traceable.
        await tx.systemLog.create({ data: { userId: user.id, firmId, action: 'scheme-link', entity: 'invoice', entityId: created.id, details: `${created.invoiceNo} linked to scheme entry ${data.schemeEntryId} (link only — settle the redeemed amount against Customer Advances separately)` } })
      }
      tcsPosted = tcsResult

      return created
    }))
  } catch (e) {
    if (e instanceof StockUnavailableError) {
      return NextResponse.json({ error: e.message }, { status: 409 })
    }
    if (e instanceof AdvanceExceededError) {
      return NextResponse.json({ error: e.message, code: 'ADVANCE_EXCEEDED' }, { status: 409 })
    }
    if (e instanceof InsufficientLoyaltyError) {
      return NextResponse.json({ error: e.message }, { status: 409 })
    }
    if (e instanceof HuidConflictError) {
      return NextResponse.json({ error: e.message, code: 'HUID_CONFLICT' }, { status: 409 })
    }
    if (isHuidP2002(e)) {
      return NextResponse.json({ error: 'That HUID was just taken by another stock item - check the hallmark UID and retry', code: 'HUID_CONFLICT' }, { status: 409 })
    }
    // A bankAccountId in the body naming another firm's account, or one that no longer exists.
    if (e instanceof BankAccountNotFoundError) {
      return NextResponse.json({ error: e.message }, { status: 404 })
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      // invoiceNo is pre-allocated uniquely (allocateInvoiceNo) so this is now the itemCode
      // backstop (@@unique([firmId, itemCode])) on purchase/urd lines racing nextItemCode().
      return NextResponse.json({ error: 'Could not allocate a unique number, please retry' }, { status: 409 })
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034') {
      // All 5 retries in withRetry() hit a write conflict / deadlock — genuinely exhausted,
      // not a client error. The invoiceNo allocated for this attempt is simply burned.
      return NextResponse.json({ error: 'Could not complete the invoice due to a concurrent update, please retry' }, { status: 409 })
    }
    if (e instanceof LedgerError) {
      // The transaction rolled back, so no invoice and no legs were written.
      return NextResponse.json({ error: `Invoice could not be posted to the ledger: ${e.message}`, code: e.code }, { status: 400 })
    }
    throw e // POST() turns anything unmapped into a logged JSON 500
  }

  // tcsPosted is a reporting echo only (rate/amount/cumulative receipts as computed) — never trusted
  // back from a client and not itself a source of truth; the ledger legs above are.
  const out = { ...invoice, advanceApplied }
  return NextResponse.json(tcsPosted?.tcsAmount ? { invoice: out, tcs: tcsPosted } : { invoice: out })
}

export async function PUT(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()

  const extraKeys = Object.keys(body).filter((k) => !(INVOICE_PUT_ALLOWED as readonly string[]).includes(k))
  if (extraKeys.length) {
    return NextResponse.json({ error: `Invoice is immutable for these fields via PUT (use a credit note / cancellation instead): ${extraKeys.join(', ')}` }, { status: 400 })
  }
  const parsed = invoicePutSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid update payload', issues: parsed.error.issues }, { status: 400 })
  }
  const { id, ...data } = parsed.data

  const existing = await db.invoice.findUnique({ where: { id } })
  if (!existing || !(await verifyFirmAccess(user.id, existing.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // A deleted bill has had its ledger legs reversed. Editing the row afterwards (not least
  // status: back to 'completed') would resurrect a document the books have already unwound.
  if (existing.status === 'deleted') {
    return NextResponse.json({ error: `${existing.invoiceNo} has been deleted and can no longer be edited. Raise a fresh bill instead.` }, { status: 409 })
  }
  // Killing a bill through PUT reverses nothing; whoever may do it must be whoever may DELETE it.
  if (data.status && VOIDING_STATUS.includes(data.status)) {
    const denied = await denyUnlessRole(user.id, existing.firmId, MANAGER_ROLES, `mark a bill as ${data.status}`)
    if (denied) return denied
  }
  const invoice = await db.invoice.update({ where: { id }, data })
  await db.systemLog.create({ data: { userId: user.id, firmId: existing.firmId, action: 'update', entity: 'invoice', entityId: id, details: `Updated ${Object.keys(data).join(', ') || '(no fields)'} on ${existing.invoiceNo}` } })
  return NextResponse.json({ invoice })
}

/**
 * Deleting an invoice must un-post its money, and a posted leg is immutable — so the correction is
 * a new, dated, mirrored voucher, never an UPDATE or a DELETE of the original rows.
 *
 * Two shapes exist in the wild:
 *  - current: every leg carries the voucherId postVoucher gave it -> reverseVoucher() per voucher.
 *  - legacy (posted before vouchers existed): voucherId IS NULL, the only thing tying the legs
 *    together is invoiceId -> mirror that group under a deterministic voucherId. Their existing
 *    rows are read only; nothing is back-filled or mutated.
 *
 * Idempotent: a second DELETE finds the reversal already there and posts nothing.
 * Returns the voucherIds written, for the SystemLog line.
 */
async function reverseInvoicePostings(tx: any, args: {
  firmId: string; invoiceId: string; userId: string; date: Date; narration: string
}) {
  const { firmId, invoiceId, userId, date, narration } = args
  const legs = await tx.ledgerEntry.findMany({
    where: { firmId, invoiceId },
    orderBy: { createdAt: 'asc' },
  })
  const posted: string[] = []

  // Only original legs are reversible; a leg that is itself a reversal is never re-reversed.
  const originals = legs.filter((l: any) => !l.reversalOfId)

  const voucherIds: string[] = [...new Set<string>(originals.map((l: any) => l.voucherId).filter(Boolean))]
  for (const vid of voucherIds) {
    const already = await tx.ledgerEntry.findFirst({ where: { firmId, reversalOfId: vid } })
    if (already) continue
    posted.push(await reverseVoucher(tx, { firmId, userId, voucherId: vid, date, narration }))
  }

  const legacy = originals.filter((l: any) => !l.voucherId)
  if (legacy.length) {
    // Deterministic id so the existence check below rides the (firmId, voucherId) index.
    const revId = `revlegacy-inv-${invoiceId}`
    const already = await tx.ledgerEntry.findFirst({ where: { firmId, voucherId: revId } })
    if (!already) {
      posted.push(await postVoucher(tx, {
        firmId,
        userId,
        date,
        voucherId: revId,
        // Not a real voucherId — legacy legs have none. A provenance marker, so the reversal is
        // still identifiable as a correction of this invoice.
        reversalOfId: `invoice:${invoiceId}`,
        type: (legacy[0].type as VoucherType) || 'journal',
        invoiceId,
        narration,
        legs: legacy.map((e: any) => ({
          accountName: e.accountName,
          debit: e.credit,
          credit: e.debit,
          customerId: e.customerId,
          particulars: `Reversal: ${e.particulars || e.accountName}`,
          type: e.type as VoucherType,
        })),
      }))
    }
  }
  return posted
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id') || ''
  const existing = await db.invoice.findUnique({ where: { id }, include: { items: true } })
  if (!existing || !(await verifyFirmAccess(user.id, existing.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const denied = await denyUnlessRole(user.id, existing.firmId, MANAGER_ROLES, 'delete a bill (it un-posts the sale from the books)')
  if (denied) return denied
  const stockItemIds = existing.items.map((i) => i.stockItemId).filter((v): v is string => !!v)
  let skippedStockItems = 0

  const label = existing.type === 'urd' ? 'URD Purchase' : existing.type === 'purchase' ? 'Purchase' : 'Invoice'
  let reversals: string[] = []
  try {
    await db.$transaction(async (tx) => {
      await tx.invoice.update({ where: { id }, data: { status: 'deleted' } })
      // Un-post the money in the same transaction that marks the invoice deleted. Before this, a
      // deleted invoice kept its revenue and GST legs, so the P&L (all entries) and the GST report
      // (status='completed' only) disagreed about it. Reversed, both read zero without a filter.
      reversals = await reverseInvoicePostings(tx, {
        firmId: existing.firmId, invoiceId: id, userId: user.id,
        date: new Date(), narration: `Reversal: deleted ${label} ${existing.invoiceNo}`,
      })
      if (stockItemIds.length) {
        if (existing.type === 'sale') {
          // was sold on this invoice — return it to available stock
          // No quantity arithmetic needed: a part-sale re-pointed the line at its own child row, which
          // carries exactly the quantity sold. firmId keeps this from reaching across firms.
          await tx.stockItem.updateMany({ where: { id: { in: stockItemIds }, firmId: existing.firmId, status: 'sold' }, data: { status: 'available' } })
        } else {
          // was purchased-in on this invoice — remove it, but only if it hasn't already moved on
          const result = await tx.stockItem.updateMany({ where: { id: { in: stockItemIds }, firmId: existing.firmId, status: 'available' }, data: { status: 'deleted' } })
          skippedStockItems = stockItemIds.length - result.count
        }
      }
      await tx.systemLog.create({ data: { userId: user.id, firmId: existing.firmId, action: 'delete', entity: 'invoice', entityId: id, details: `Deleted ${label} ${existing.invoiceNo}${reversals.length ? ` - reversed voucher(s) ${reversals.join(', ')}` : ' - no ledger legs to reverse'}` } })
    })
  } catch (e) {
    if (e instanceof LedgerError) {
      // Nothing was written. The commonest cause is legacy legs that never balanced in the first
      // place: refuse rather than mirror an unbalanced voucher into the books.
      return NextResponse.json({ error: `Could not reverse the ledger postings for this invoice: ${e.message}`, code: e.code }, { status: 409 })
    }
    throw e
  }

  return NextResponse.json({ ok: true, skippedStockItems, reversals })
}
