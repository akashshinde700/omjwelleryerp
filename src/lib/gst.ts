// GST + money math shared by server (invoices route) and client (sell.tsx / mobile).
// Pure — no prisma/next imports. Money bundled with jewellery (making charges, stones on the
// same HSN) is a COMPOSITE supply taxed at the metal rate — see multiple AAR rulings since 2019.
// Do NOT add a separate making-charge GST rate. `gstRate` on a line exists only for a genuinely
// different HSN (e.g. loose stones), never for making charges.

import { ratePerGram, computeSaleLine, type OldMetalPricing, type SaleLineInput } from './stock-calc' // pure (imports only ./constants) — keeps this file pure

/**
 * One repeating old-metal-receive row (oMunim's TYPE/DESC/NAME/GROSS/LESS/NET/TUNCH). net weight is
 * DERIVED (gross - less), never stored. See Invoice.oldMetalRows in schema.prisma.
 */
export type OldMetalRow = {
  type: 'gold' | 'silver' | 'alloy' | 'stone'
  description?: string
  name?: string
  grossWeight: number    // grams
  lessWeight: number     // grams
  tunch?: number         // purity %, 0-100 — RECORDED, deliberately NOT multiplied into the price
  rate?: number          // gold: INR per 10 GRAM. silver: INR per KILOGRAM. absent for alloy/stone
  flatValue?: number     // alloy/stone ONLY: the flat agreed rupee value
  /**
   * METAL-TO-METAL (stock-calc computeMetalExchange). `rate` is the PURE board rate and the row is
   * worth net x tunch% x rate, whatever the firm-wide oldMetalPricing says. It is per row so a Cash
   * exchange and a netting exchange cannot be confused by a global switch. A flagged row with no
   * usable tunch is worth 0, NEVER net x rate: that fallback is the gram-for-gram giveaway (10 g of
   * 18K cancelling 10 g of 22K) the netting mode exists to prevent.
   */
  priceOnFine?: boolean
}

export type GstType = 'intra' | 'inter'
export type GstRates = { cgstRate: number; sgstRate: number; igstRate: number }
export type TaxableLine = { amount: number; gstRate?: number; hsnCode?: string | null }
export type LineTax = { base: number; discount: number; taxable: number; cgst: number; sgst: number; igst: number; total: number }

export type InvoiceTotalsInput = {
  lines: TaxableLine[]
  discount?: number
  metalAmount?: number       // loose metal sold — taxable, treated as one extra pseudo-line at the default rate
  previousAmount?: number
  loyaltyRedeemed?: number
  oldGoldWeight?: number
  oldGoldRate?: number       // per 10 gm
  /** When non-empty this is AUTHORITATIVE and oldGoldWeight/oldGoldRate are ignored for pricing. */
  oldMetalRows?: OldMetalRow[]
  bhavCut?: number
  /** How an old-metal row's rate is quoted. 'agreedRate' (default) = the rate is for the metal as
   *  received, tunch recorded but not priced — today's behaviour, bit for bit. */
  oldMetalPricing?: OldMetalPricing
  gstType: GstType
  rates: GstRates
  taxed: boolean             // false => URD / gstEnabled false => every tax figure is 0
  /**
   * oMunim's "TAX BY VAL". FALSE (default) is the normal path: the amounts entered are the taxable
   * value and tax is added ON TOP. TRUE means the amounts entered ALREADY CONTAIN the tax, and the
   * taxable value is worked back out of them — the counter quotes "₹50,000 all in" and the bill
   * has to show what part of that was GST.
   *
   * This changes what `taxableValue` MEANS, which is why it is a flag on the shared engine and not
   * a subtraction done in the form: taxableValue feeds the GST report and the ledger's revenue leg.
   * Deriving it anywhere else would file a return on a figure the invoice never showed.
   */
  taxInclusive?: boolean
}

export type InvoiceTotals = {
  lineTax: LineTax[]         // index-aligned with input.lines (the metal pseudo-line is NOT included)
  subtotal: number           // sum of line bases, metal excluded
  discount: number           // clamped to the total base
  metalAmount: number
  taxableValue: number       // subtotal - discount + metalAmount
  cgst: number; sgst: number; igst: number
  oldGoldValue: number       // sum of oldMetalRows values, else oldGoldWeight * oldGoldRate / 10
  oldMetalRowValues: number[] // index-aligned with input.oldMetalRows; [] when none
  /** Sum of row net weights in grams. Mixes gold + silver grams: a RECORD figure, never priced. 0 when no rows. */
  oldMetalNetWeight: number
  /** Sum of every old-metal row's GROSS weight, 3dp — the alternative basis for a per-10g rate cut. */
  oldMetalGrossWeight: number
  netOldGold: number         // max(0, oldGoldValue - bhavCut) — a PAYMENT, never in taxableValue
  previousAmount: number
  loyaltyRedeemed: number
  rawTotal: number           // taxableValue + cgst + sgst + igst + previousAmount - loyaltyRedeemed
  rofAmount: number          // round(rawTotal) - rawTotal
  totalAmount: number        // Math.round(rawTotal) — netOldGold is NOT subtracted here
}

// Half-away-from-zero, float-safe: plain Math.round(x*100)/100 mis-rounds cases like 1.005 because
// 1.005 * 100 is 100.49999999999999 in floating point. Nudge by a small epsilon before rounding.
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0
  const EPS = 1e-8
  const sign = n < 0 ? -1 : 1
  const abs = Math.abs(n)
  return (sign * Math.round((abs + EPS) * 100)) / 100
}

export function derivePlaceOfSupply(firmState?: string | null, customerState?: string | null): GstType | null {
  const f = (firmState || '').trim().toLowerCase()
  const c = (customerState || '').trim().toLowerCase()
  if (!f || !c) return null
  return f === c ? 'intra' : 'inter'
}

/**
 * Split one already-known total tax into cgst/sgst in the firm's configured proportion. The second
 * half is a SUBTRACTION, never a second rounded multiplication, so cgst + sgst is exactly `tax`.
 */
function splitIntra(tax: number, rates: GstRates) {
  const configuredTotal = rates.cgstRate + rates.sgstRate
  const cgstRatio = configuredTotal > 0 ? rates.cgstRate / configuredTotal : 0.5
  const cgst = round2(tax * cgstRatio)
  return { cgst, sgst: round2(tax - cgst), igst: 0 }
}

/**
 * Tax-inclusive entry: `gross` already contains the tax.
 *   taxable = gross x 100 / (100 + rate)
 *   tax     = gross - taxable      <- a subtraction, deliberately
 *
 * Computing the tax independently as `taxable x rate / 100` would round twice and leave
 * taxable + tax a paisa away from the amount the customer was quoted. Deriving it as the remainder
 * makes "₹50,000 all in" come to exactly ₹50,000 on the bill, every time.
 */
function entryTaxInclusive(gross: number, gstType: GstType, rates: GstRates, gstRateOverride: number | undefined, taxed: boolean) {
  if (!taxed) return { taxable: round2(gross), cgst: 0, sgst: 0, igst: 0 }
  const lineRate = gstRateOverride ?? (gstType === 'intra' ? rates.cgstRate + rates.sgstRate : rates.igstRate)
  if (lineRate <= -100) return { taxable: round2(gross), cgst: 0, sgst: 0, igst: 0 }
  const taxable = round2((gross * 100) / (100 + lineRate))
  const tax = round2(gross - taxable)
  const split = gstType === 'intra' ? splitIntra(tax, rates) : { cgst: 0, sgst: 0, igst: tax }
  return { taxable, ...split }
}

function entryTax(taxable: number, gstType: GstType, rates: GstRates, gstRateOverride: number | undefined, taxed: boolean) {
  if (!taxed) return { cgst: 0, sgst: 0, igst: 0 }
  const lineRate = gstRateOverride ?? (gstType === 'intra' ? rates.cgstRate + rates.sgstRate : rates.igstRate)
  if (gstType === 'intra') {
    // Split the line rate into cgst/sgst in the firm's configured proportion (normally an even
    // half each) so an overridden per-line rate still respects the firm's cgst:sgst split.
    const configuredTotal = rates.cgstRate + rates.sgstRate
    const cgstRatio = configuredTotal > 0 ? rates.cgstRate / configuredTotal : 0.5
    const cgstRateForLine = lineRate * cgstRatio
    const sgstRateForLine = lineRate - cgstRateForLine
    return {
      cgst: round2((taxable * cgstRateForLine) / 100),
      sgst: round2((taxable * sgstRateForLine) / 100),
      igst: 0,
    }
  }
  return { cgst: 0, sgst: 0, igst: round2((taxable * lineRate) / 100) }
}

export function computeInvoiceTotals(input: InvoiceTotalsInput): InvoiceTotals {
  const { rates, gstType, taxed } = input
  const lines = input.lines || []
  const metalAmount = round2(input.metalAmount || 0)

  const lineBases = lines.map((l) => round2(l.amount || 0))
  const subtotal = round2(lineBases.reduce((s, b) => s + b, 0))
  const totalBase = round2(subtotal + metalAmount)

  const discountInput = Math.max(0, input.discount || 0)
  const discount = round2(Math.min(discountInput, totalBase))

  // Entities taxed identically: every real line, plus the metal amount as one trailing pseudo-line.
  // The pseudo-line's own tax is folded into the header totals but never exposed in `lineTax`.
  const entryBases = [...lineBases, metalAmount]
  const n = entryBases.length

  // Pro-rata discount allocation by base; the rounding remainder lands on the largest-base entry
  // so the allocated shares sum EXACTLY to `discount` (never a stray paisa left over/short).
  const shares = new Array(n).fill(0)
  if (discount > 0 && totalBase > 0) {
    for (let i = 0; i < n; i++) shares[i] = round2((entryBases[i] / totalBase) * discount)
    let maxIdx = 0
    for (let i = 1; i < n; i++) if (entryBases[i] > entryBases[maxIdx]) maxIdx = i
    const sumOthers = shares.reduce((s: number, v: number, i: number) => (i === maxIdx ? s : s + v), 0)
    shares[maxIdx] = round2(discount - sumOthers)
  }

  const lineTax: LineTax[] = []
  let cgstTotal = 0
  let sgstTotal = 0
  let igstTotal = 0

  const inclusive = !!input.taxInclusive
  // In inclusive mode the taxable value is DERIVED per entry rather than being `subtotal - discount
  // + metalAmount`, so it has to be accumulated here — it is what the GST report and the revenue
  // leg are filed on.
  let taxableAccum = 0

  for (let i = 0; i < n; i++) {
    const base = entryBases[i]
    const disc = shares[i]
    const gstRateOverride = i < lines.length ? lines[i].gstRate : undefined
    // Discount comes off the amount the customer was quoted in BOTH modes; in inclusive mode that
    // quoted amount happens to contain the tax, so the back-calculation runs on the discounted
    // figure. Discounting after extracting the tax would hand the customer a discount on the GST.
    const afterDiscount = round2(Math.max(0, base - disc))
    const e = inclusive
      ? entryTaxInclusive(afterDiscount, gstType, rates, gstRateOverride, taxed)
      : { taxable: afterDiscount, ...entryTax(afterDiscount, gstType, rates, gstRateOverride, taxed) }
    cgstTotal += e.cgst
    sgstTotal += e.sgst
    igstTotal += e.igst
    taxableAccum += e.taxable
    if (i < lines.length) {
      const total = round2(e.taxable + e.cgst + e.sgst + e.igst)
      lineTax.push({ base, discount: disc, taxable: e.taxable, cgst: e.cgst, sgst: e.sgst, igst: e.igst, total })
    }
  }
  cgstTotal = round2(cgstTotal)
  sgstTotal = round2(sgstTotal)
  igstTotal = round2(igstTotal)

  // Exclusive: the entered amounts ARE the taxable value. Inclusive: they contained the tax, so
  // the taxable value is what came back out of them.
  const taxableValue = inclusive ? round2(taxableAccum) : round2(subtotal - discount + metalAmount)

  // Old metal is a PAYMENT the customer settles with; nothing below may ever reach taxableValue
  // (that overcharged GST on metal the customer already owned — fixed and tested).
  const oldRows = input.oldMetalRows ?? []
  let oldGoldValue: number
  let oldMetalRowValues: number[] = []
  let oldMetalNetWeight = 0
  let oldMetalGrossWeight = 0
  if (oldRows.length) {
    // tunch is RECORDED, not priced: the rate the shop quotes is already the agreed rate for the
    // metal as received. (oMunim computes purity then silently ignores it, pricing 22K and 24K
    // alike; ours is a stated contract.) alloy/stone have NO metal rate — flatValue only, and
    // `rate` is ignored for them even if present, so they can never inherit a gold/silver rate.
    oldMetalRowValues = oldRows.map((r) => {
      const net = Math.max(0, (r.grossWeight || 0) - (r.lessWeight || 0))
      oldMetalNetWeight += net
      oldMetalGrossWeight += r.grossWeight || 0
      // fineAtPureRate: the quoted rate is the PURE rate, so price the fine weight (net x tunch%).
      // GUARD: a missing / 0 / negative / >100 tunch must NOT price the row at 0 (or above net) —
      // fall back to net x rate, exactly as agreedRate does.
      const t = r.tunch
      const tunchOk = t != null && t > 0 && t <= 100
      if (r.priceOnFine && !tunchOk && (r.type === 'gold' || r.type === 'silver')) return 0
      const fineOk = (r.priceOnFine || input.oldMetalPricing === 'fineAtPureRate') && tunchOk
      const qty = fineOk ? (net * (t as number)) / 100 : net
      if (r.type === 'gold') return round2(qty * ratePerGram(r.rate || 0, 'per_10g'))
      if (r.type === 'silver') return round2(qty * ratePerGram(r.rate || 0, 'per_kg'))
      return round2(r.flatValue || 0)
    })
    oldMetalNetWeight = Math.round(oldMetalNetWeight * 1000) / 1000
    oldMetalGrossWeight = Math.round(oldMetalGrossWeight * 1000) / 1000
    oldGoldValue = round2(oldMetalRowValues.reduce((s, v) => s + v, 0))
  } else {
    // Legacy scalar path, verbatim — every invoice without rows prices exactly as before.
    const oldGoldWeight = input.oldGoldWeight || 0
    const oldGoldRate = input.oldGoldRate || 0
    oldGoldValue = round2((oldGoldWeight * oldGoldRate) / 10)
  }
  const bhavCut = input.bhavCut || 0
  const netOldGold = Math.max(0, round2(oldGoldValue - bhavCut))

  const previousAmount = round2(input.previousAmount || 0)
  const loyaltyRedeemed = round2(input.loyaltyRedeemed || 0)

  const rawTotal = taxableValue + cgstTotal + sgstTotal + igstTotal + previousAmount - loyaltyRedeemed
  const totalAmount = Math.round(rawTotal)
  const rofAmount = round2(totalAmount - rawTotal)

  return {
    lineTax,
    subtotal,
    discount,
    metalAmount,
    taxableValue,
    cgst: cgstTotal,
    sgst: sgstTotal,
    igst: igstTotal,
    oldGoldValue,
    oldMetalRowValues,
    oldMetalNetWeight,
    oldMetalGrossWeight,
    netOldGold,
    previousAmount,
    loyaltyRedeemed,
    rawTotal: round2(rawTotal),
    rofAmount,
    totalAmount,
  }
}

// ── Cash / PAN compliance thresholds (Setting key/value, per firm — no schema change) ──────────
// Rule 114B requires PAN for a cash transaction above a threshold; s.269ST bars accepting ₹2L+ in
// cash from a person regardless of PAN. Firm-configurable rather than hardcoded because the
// threshold differs by transaction category and firms may set it more conservatively than the law
// requires. Read via db.setting.findMany({ key: { in: Object.values(CASH_LIMIT_KEYS) } }).
export const CASH_LIMIT_KEYS = { sale: 'cashLimitSale', purchase: 'cashLimitPurchase' } as const

// ── Target-amount ("reverse") billing ───────────────────────────────────────────────────────────
// "Make it ₹50,000 flat": back-solve ONE pre-tax lever so the STATED total is exact and every tax
// figure is still computed from a real taxable base — never a post-tax fudge.
export type ReverseLever = 'discount' | 'making' | 'wastage' | 'metalRate'
export type ReverseTargetResult = {
  totals: InvoiceTotals
  lines: TaxableLine[]   // adjusted lines — identical to input unless a line lever (making/wastage/metalRate) was used
  discount: number       // adjusted discount — identical to input unless lever === 'discount'
  exact: boolean         // false when the lever ran out of room
  shortfall: number      // targetTotal - totals.totalAmount; 0 when exact
  /** The total actually achieved. Print this when !exact — never the target. */
  reachedTotal: number
  /** Why it stopped, when !exact. */
  limit?: 'clamped' | 'noWeightPricedLine' | 'noMakingCharge' | 'converged'
  /** Line lever only: the adjusted per-line inputs, index-aligned with the lines passed in, so the
   *  caller can write the moved figure back onto the bill line it belongs to. */
  adjustedLines?: SaleLineInput[]
}

/**
 * Pro-rata `delta` across `bases` by current weight, remainder on the largest — same technique
 * computeInvoiceTotals uses for discount allocation, so shares sum EXACTLY to `delta`.
 */
function allocateDelta(lines: TaxableLine[], delta: number): TaxableLine[] {
  const bases = lines.map((l) => l.amount || 0)
  const sum = bases.reduce((a, b) => a + b, 0)
  if (sum <= 0) return lines.map((l, i) => (i === 0 ? { ...l, amount: round2(Math.max(0, (l.amount || 0) + delta)) } : l))
  let maxIdx = 0
  const shares = bases.map((b, i) => { if (b > bases[maxIdx]) maxIdx = i; return round2((b / sum) * delta) })
  const others = shares.reduce((s, v, i) => (i === maxIdx ? s : s + v), 0)
  shares[maxIdx] = round2(delta - others)
  return lines.map((l, i) => ({ ...l, amount: round2(Math.max(0, (l.amount || 0) + shares[i])) }))
}

// ── TCS u/s 206C(1H) Income-tax Act — "collect at source" on a buyer's cumulative receipts ────────
// SCOPE, decided explicitly (do not conflate with s.206C(1)):
//   - 206C(1H) is a RECEIPTS test: once a seller (whose own preceding-year turnover exceeds the
//     206C(1H) threshold, statutorily ₹10 crore) has RECEIVED more than ₹50 lakh in a financial
//     year FROM ONE BUYER (cumulative, any mode/goods), it collects tax on the excess over ₹50 lakh
//     at 0.1% (1% if the buyer has no PAN, per s.206CC) — it attaches when money arrives, not when
//     an invoice is raised.
//   - s.206C(1) is a DIFFERENT, older provision: 1% TCS on a CASH sale of bullion (> ₹2 lakh cash)
//     or jewellery (> ₹5 lakh cash) PER TRANSACTION, regardless of cumulative receipts, and the two
//     do not stack on the same rupee (a sale already taxed under (1) is excluded from (1H)).
//     Deliberately NOT implemented here: it needs a per-transaction cash-only test keyed to a
//     bullion/jewellery classification, which is a materially different trigger than the cumulative
//     per-buyer counter below, and stacking the two wrongly is worse than shipping one correctly.
//     Left to the shop's accountant as a known gap — see worklog for this task.
//   - Whether the FIRM itself crosses the ₹10cr turnover gate that makes 206C(1H) apply at all is
//     NOT computed here (this app has no multi-year turnover ledger to check) — `tcsApplicable` is
//     an accountant-set Setting, off by default, exactly per "implement the clear part, make the
//     rest configurable, do not invent a tax rule."
export const TCS_SETTING_KEYS = {
  applicable: 'tcsApplicable', // 'true' | 'false' (or unset = off) — accountant confirms the firm is liable
  threshold: 'tcsThreshold',   // cumulative per-buyer receipts in the FY above which TCS applies (default 5000000)
  rate: 'tcsRate',             // % on the excess once the buyer HAS a PAN on file (default 0.1)
  rateNoPan: 'tcsRateNoPan',   // % rate when the buyer has no PAN on file, s.206CC (default 1)
} as const
export const TCS_DEFAULTS: { threshold: number; rate: number; rateNoPan: number } = { threshold: 5000000, rate: 0.1, rateNoPan: 1 }

export type TcsInput = {
  priorReceipts: number // cumulative monetary receipts from this buyer, this FY, BEFORE this invoice
  thisReceipt: number   // monetary amount received on THIS invoice (cash+card+upi+cheque; excludes old-gold exchange, which is barter, not a cash receipt)
  hasPan: boolean
  threshold: number
  rate: number
  rateNoPan: number
}
export type TcsResult = {
  cumulativeReceipts: number
  taxableReceipt: number // the slice of THIS receipt that falls above `threshold`, cumulatively
  rate: number           // rate actually applied (rate or rateNoPan)
  tcsAmount: number
}

/**
 * TCS applies only to the portion of a receipt that pushes the buyer's running FY total past the
 * threshold — not the whole receipt, and not re-taxing what earlier receipts already crossed.
 * `priorReceipts` must be computed fresh (inside the caller's transaction) to avoid two concurrent
 * invoices for the same buyer both under-counting the threshold crossing.
 */
export function computeTcs(input: TcsInput): TcsResult {
  const priorReceipts = Math.max(0, input.priorReceipts || 0)
  const thisReceipt = Math.max(0, input.thisReceipt || 0)
  const threshold = Math.max(0, input.threshold || 0)
  const cumulativeReceipts = round2(priorReceipts + thisReceipt)
  const priorExcess = Math.max(0, round2(priorReceipts - threshold))
  const newExcess = Math.max(0, round2(cumulativeReceipts - threshold))
  const taxableReceipt = round2(Math.max(0, newExcess - priorExcess))
  const rate = input.hasPan ? input.rate : input.rateNoPan
  const tcsAmount = round2((taxableReceipt * rate) / 100)
  return { cumulativeReceipts, taxableReceipt, rate, tcsAmount }
}

// Each line lever = one number on a SaleLineInput that computeSaleLine (the ONE pricing engine)
// turns into rupees. `dp` is the precision the figure is written back at.
const LINE_LEVERS = {
  making: {
    get: (l: SaleLineInput) => l.charges.making.value,
    set: (l: SaleLineInput, v: number): SaleLineInput => ({ ...l, charges: { ...l.charges, making: { ...l.charges.making, value: v } } }),
    min: 0, max: Infinity, dp: 4, step: 1,
    eligible: (l: SaleLineInput) => computeSaleLine(l).totalMaking > 0,
    weight: (l: SaleLineInput) => computeSaleLine(l).totalMaking * Math.max(1, l.qty || 1),
    none: 'noMakingCharge' as const,
  },
  wastage: {
    get: (l: SaleLineInput) => l.wastagePercent || 0,
    set: (l: SaleLineInput, v: number): SaleLineInput => ({ ...l, wastagePercent: v }),
    min: 0, max: 25, dp: 3, step: 0.01,
    eligible: (l: SaleLineInput) => l.byWeight,
    weight: (l: SaleLineInput) => computeSaleLine(l).metalAmount * Math.max(1, l.qty || 1),
    none: 'noWeightPricedLine' as const,
  },
  metalRate: {
    get: (l: SaleLineInput) => l.metalRate || 0,
    set: (l: SaleLineInput, v: number): SaleLineInput => ({ ...l, metalRate: v }),
    min: 0.01, max: Infinity, dp: 2, step: 1,
    eligible: (l: SaleLineInput) => l.byWeight && (l.metalRate || 0) > 0,
    weight: (l: SaleLineInput) => computeSaleLine(l).metalAmount * Math.max(1, l.qty || 1),
    none: 'noWeightPricedLine' as const,
  },
}

/**
 * Back-solves ONE pre-tax lever so `computeInvoiceTotals(...).totalAmount` lands exactly on
 * `targetTotal`; tax is then computed on the moved base, never fudged after.
 *  - 'discount': the bill-level discount, clamped 0..totalBase (LESS only; never negative).
 *  - 'making' | 'wastage' | 'metalRate': need `saleLines` (index-aligned with input.lines). The delta is
 *    pro-rated over the eligible lines (allocateDelta), converted to that line's lever figure by its
 *    own computeSaleLine slope, and re-run through computeSaleLine with everything else — including
 *    ratePurityPercent — untouched. Clamps: making >= 0; wastage 0..25; metalRate > 0.
 *
 * ponytail: computeInvoiceTotals is the oracle and the estimate is iterated (cap 12), rather than a
 * hand-derived closed form that would be a second, driftable source of truth.
 */
export function solveReverseTarget(input: InvoiceTotalsInput, targetTotal: number, lever: ReverseLever, saleLines?: SaleLineInput[]): ReverseTargetResult {
  const totalRate = !input.taxed ? 0 : input.gstType === 'intra' ? (input.rates.cgstRate + input.rates.sgstRate) / 100 : input.rates.igstRate / 100

  let discount = input.discount || 0
  let lines = (input.lines || []).map((l) => ({ ...l }))
  let totals = computeInvoiceTotals({ ...input, discount, lines })
  const finish = (limit: ReverseTargetResult['limit'], adjustedLines?: SaleLineInput[]): ReverseTargetResult => {
    const shortfall = round2(targetTotal - totals.totalAmount)
    return { totals, lines, discount, exact: shortfall === 0, shortfall, reachedTotal: totals.totalAmount, ...(shortfall === 0 ? {} : { limit }), ...(adjustedLines ? { adjustedLines } : {}) }
  }

  if (lever === 'discount') {
    let clamped = false
    for (let i = 0; i < 8; i++) {
      const diff = round2(targetTotal - totals.totalAmount)
      if (diff === 0) break
      const deltaTaxable = diff / (1 + totalRate) // first-order estimate: delta total ~ delta taxable * (1 + rate)
      const totalBase = lines.reduce((s, l) => s + (l.amount || 0), 0) + (input.metalAmount || 0)
      // Increasing discount REDUCES taxable, so it moves opposite to deltaTaxable.
      const want = discount - deltaTaxable
      discount = Math.max(0, Math.min(want, totalBase))
      clamped = discount !== want
      totals = computeInvoiceTotals({ ...input, discount, lines })
    }
    return finish(clamped ? 'clamped' : 'converged')
  }

  const cfg = LINE_LEVERS[lever]
  const sale = saleLines ?? []
  let cur = sale.map((l) => ({ ...l }))
  const base = lines.map((l) => l.amount)
  const taxable0 = sale.map((l) => computeSaleLine(l).taxable)
  const ok = sale.length === lines.length ? sale.map((l) => cfg.eligible(l)) : sale.map(() => false)
  if (!ok.some(Boolean)) return finish(cfg.none, cur)

  // Re-price the bill with lever set `next`; the ONE place lines/totals are rebuilt from a candidate.
  const reprice = (next: SaleLineInput[]) => {
    lines = lines.map((l, i) => ({ ...l, amount: round2(base[i] + computeSaleLine(next[i]).taxable - taxable0[i]) }))
    totals = computeInvoiceTotals({ ...input, discount, lines })
  }
  for (let it = 0; it < 12; it++) {
    const diff = round2(targetTotal - totals.totalAmount)
    if (diff === 0) break
    const deltaTaxable = diff / (1 + totalRate)
    // Lines that still have room in the direction we need, and a live slope (rupees per lever unit).
    const slope = cur.map((l, i) => {
      if (!ok[i]) return 0
      const v = cfg.get(l)
      if (deltaTaxable > 0 ? v >= cfg.max : v <= cfg.min) return 0
      return (computeSaleLine(cfg.set(l, v + cfg.step)).taxable - computeSaleLine(l).taxable) / cfg.step
    })
    const active = slope.map((sl) => sl > 0)
    if (!active.some(Boolean)) break
    // Pro-rate over active lines by their current lever amount, via the ONE allocator.
    const w = cur.map((l, i) => (active[i] ? Math.max(cfg.weight(l), 1e-9) : 0))
    const shares = allocateDelta(w.map((amount) => ({ amount })), deltaTaxable).map((l, i) => l.amount - w[i])
    let moved = false
    cur = cur.map((l, i) => {
      if (!active[i]) return l
      const v = cfg.get(l)
      const nv = Number(Math.min(cfg.max, Math.max(cfg.min, v + shares[i] / slope[i])).toFixed(cfg.dp))
      if (nv !== v) moved = true
      return cfg.set(l, nv)
    })
    reprice(cur)
    if (!moved) break
  }
  // The lever is quantised (written back at cfg.dp), so the loop can stop on the farther of two reachable
  // totals. Try the neighbouring quanta on every eligible line and keep the closest (ties keep current).
  if (round2(targetTotal - totals.totalAmount) !== 0) {
    const q = 10 ** -cfg.dp
    let best = { cur, gap: Math.abs(targetTotal - totals.totalAmount) }
    for (const k of [-2, -1, 1, 2]) {
      const cand = cur.map((l, i) => (ok[i] ? cfg.set(l, Number(Math.min(cfg.max, Math.max(cfg.min, cfg.get(l) + k * q)).toFixed(cfg.dp))) : l))
      reprice(cand)
      const gap = Math.abs(targetTotal - totals.totalAmount)
      if (gap < best.gap) best = { cur: cand, gap }
    }
    cur = best.cur
    reprice(cur)
  }
  // 'clamped' only when a lever actually sits on a bound; a quantisation stop is 'converged'.
  const limit: ReverseTargetResult['limit'] = cur.some((l, i) => ok[i] && (cfg.get(l) <= cfg.min || cfg.get(l) >= cfg.max)) ? 'clamped' : 'converged'
  return finish(limit, cur)
}
