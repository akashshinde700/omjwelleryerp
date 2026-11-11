import { monthsBetween } from './interest'
import { round2 } from './gst'
import { roundWeight } from './stock-calc'

/**
 * Savings-scheme (kitty/chit) arithmetic — the one place a subscriber's position is worked out.
 *
 * NOTHING here is stored. paid / totalPaid / due / missed / maturityValue are derived from the
 * SchemeInstallment rows every time they are asked for. SchemeEntry.paidInstallments and
 * SchemeEntry.totalPaid are dead columns kept only until their last reader is migrated off them
 * (see prisma/schema.prisma) — a cached counter that drifts against the receipts is unrecoverable.
 *
 * THE RULES, stated once (worked example: 11+1 at ₹5,000, started 2026-01-10)
 *
 *   maturityDate  = startDate + durationMonths, day-clamped     → 2026-12-10
 *   bonusAmount   = FROZEN at enrolment (default bonusMonths × emiAmount = ₹5,000). Editing the
 *                   parent Scheme afterwards must never change what an existing subscriber signed.
 *   elapsed       = whole calendar months from startDate to today (a part month counts as 0)
 *   expected      = min(totalInstallments, elapsed + 1)  — slot 1 is due on day one
 *   due           = max(0, expected − paid)
 *   missed        = max(0, min(totalInstallments, elapsed) − paid) — only months already gone
 *   bonusPayable  = (paid === totalInstallments) AND (today >= maturityDate) ? bonusAmount : 0
 *   maturityValue = Σ installment amounts + bonusPayable
 *
 * BOTH maturity conditions are required. A customer who pays all 11 EMIs by March collects
 * ₹55,000 in March and ₹60,000 only from 10 December — the bonus is the price of the money having
 * sat with the shop for the full term, not a volume discount for paying early.
 *
 * Early exit / default: refund = Σ installments − earlyExitDeduction. No bonus, ever.
 *
 * ─────────────────────── WEIGHT (metal) SCHEMES ───────────────────────
 * A scheme whose type is 'gold' or 'silver' is denominated in METAL, not rupees. The customer still
 * pays rupees; each receipt buys grams at the metal rate of that day, and maturity values the
 * accumulated grams at the maturity-day rate. That is the whole product: the shop is SHORT METAL
 * for the term, and the price movement is the shop's risk, not the customer's.
 *
 *   grams(i)      = amount(i) / metalRate(i)        metalRate is INR per GRAM, never per 10g
 *   totalGrams    = Σ grams(i)                      FULL PRECISION - see the rounding rule below
 *   maturityValue = round2((totalGrams + bonusGramsPayable) × valuationRate)
 *
 * Worked example (the one in the brief): ₹5,000/month at ₹10,000/g, ₹10,200/g, ₹10,404/g buys
 * 0.500000 + 0.490196 + 0.480584 = 1.470780 g. At a maturity rate of ₹10,612/g that is
 * ₹15,607.92 against ₹15,000 deposited. The ₹607.92 is the shop's loss on being short the metal.
 *
 * ROUNDING, stated because getting it wrong is the defect: grams are carried at FULL precision and
 * rounded ONCE, at the end. 3dp is the precision a physical ornament is WEIGHED to; a scheme's
 * accumulated grams is a computed claim, and rounding each of 11 receipts to 3dp compounds - the
 * example above becomes 0.500 + 0.490 + 0.481 = 1.471 g = ₹15,610.25, ₹2.33 of invented liability
 * on ₹15,000 and growing with the term. `totalGramsDisplay` is the 3dp figure a passbook shows;
 * the MONEY is always computed from the unrounded claim.
 *
 * BONUS ON A WEIGHT SCHEME — the decision, in one line: it is extra GRAMS, never cash and never a
 * making-charge discount, frozen at enrolment as bonusMonths × emiAmount ÷ the enrolment-day rate.
 * Frozen so the shop's exposure is known the day it sells the scheme, and stored in its own column
 * (SchemeEntry.bonusGrams, with bonusAmount held at 0) so the UNIT of a bonus is never a question
 * at the counter. It is released on exactly the same two conditions as a cash bonus.
 *
 * EARLY EXIT on a weight scheme refunds the RUPEES deposited less the deduction, and forfeits every
 * accumulated gram. Finishing the term is what buys the metal; walking away gets the cash back.
 */

/** startDate + n months, clamped to the last day of a short target month (31 Jan + 1 = 28/29 Feb). */
export function addMonths(from: Date | string, n: number): Date {
  const d = new Date(from)
  const day = d.getUTCDate()
  const daysInTarget = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n + 1, 0)).getUTCDate()
  const out = new Date(d.getTime())
  out.setUTCFullYear(d.getUTCFullYear(), d.getUTCMonth() + n, Math.min(day, daysInTarget))
  return out
}

export type SchemeEntryBasis = {
  startDate: Date | string
  emiAmount: number
  totalInstallments: number
  bonusAmount: number
  /** cash | gold | silver — frozen onto the entry at enrolment, never read off the parent Scheme. */
  type?: string | null
  /** Weight schemes: the bonus in GRAMS, frozen at enrolment. 0 on a cash scheme. */
  bonusGrams?: number | null
  maturityDate?: Date | string | null
  earlyExitDeduction?: number | null
  status?: string
}

export type InstallmentLike = {
  installmentNo: number
  amount: number
  paidDate: Date | string
  /** Weight schemes: grams this receipt bought, unrounded. */
  grams?: number | null
  /** Weight schemes: INR per GRAM on the day of this receipt. */
  metalRate?: number | null
}

/** The metal a scheme is denominated in, or null for an ordinary cash scheme. */
export function schemeMetal(type: string | null | undefined): 'gold' | 'silver' | null {
  return type === 'gold' || type === 'silver' ? type : null
}

export type SchemeDerivation = {
  paid: number
  totalPaid: number
  due: number
  missed: number
  remaining: number
  elapsedMonths: number
  maturityDate: Date
  /** Every EMI is in — but the bonus may still be locked behind the date. */
  fullyPaid: boolean
  matured: boolean
  bonusPayable: number
  /** cash | gold | silver, echoed so a caller never has to re-join the parent Scheme. */
  type: string
  /** gold | silver, or null for a cash scheme. */
  metal: 'gold' | 'silver' | null
  /** Grams bought so far, FULL precision. The money is always derived from this, never from 3dp. */
  totalGrams: number
  /** The same claim at 3dp — for a passbook. Never multiply this by a rate. */
  totalGramsDisplay: number
  /** Bonus grams released on the same two conditions as a cash bonus. 0 until then. */
  bonusGramsPayable: number
  /** totalGrams + bonusGramsPayable, full precision. */
  maturityGrams: number
  /** INR per GRAM the weight position was valued at, or null when the caller supplied no rate. */
  valuationRate: number | null
  /** What the customer can put against a purchase today. On a weight scheme this is 0 until a
   *  valuation rate is supplied — a metal claim has no rupee value without the rate of the day. */
  maturityValue: number
  /** What the customer gets if they walk away today: deposits back, no bonus, less any deduction. */
  refundIfClosedNow: number
  /** Suggested next receipt number — max(existing) + 1. Out-of-order numbers are allowed. */
  nextInstallmentNo: number
}

export function deriveSchemeEntry(
  entry: SchemeEntryBasis,
  installments: InstallmentLike[] = [],
  asOf: Date | string = new Date(),
  /** Weight schemes only: the metal rate (INR per GRAM) to value the accumulated grams at. */
  valuationRate: number | null = null,
): SchemeDerivation {
  const today = new Date(asOf)
  const total = Math.max(0, Math.trunc(entry.totalInstallments || 0))
  const paid = installments.length
  // Float money summed then rounded ONCE — rounding each leg first would drift on 11 receipts.
  const totalPaid = round2(installments.reduce((s, i) => s + (Number(i.amount) || 0), 0))

  const maturityDate = entry.maturityDate ? new Date(entry.maturityDate) : addMonths(entry.startDate, total)
  const elapsedMonths = Math.floor(monthsBetween(entry.startDate, today))
  const expected = Math.min(total, elapsedMonths + 1)
  const due = Math.max(0, expected - paid)
  const missed = Math.max(0, Math.min(total, elapsedMonths) - paid)

  const fullyPaid = total > 0 && paid >= total
  const matured = fullyPaid && today.getTime() >= maturityDate.getTime()

  const metal = schemeMetal(entry.type)
  // Grams accumulate UNROUNDED — rounding each receipt to 3dp compounds across the term.
  const totalGrams = installments.reduce((g, i) => g + (Number(i.grams) || 0), 0)
  const bonusGramsPayable = matured && metal ? Number(entry.bonusGrams) || 0 : 0
  const maturityGrams = totalGrams + bonusGramsPayable
  // Exactly one bonus unit is ever live: grams on a weight scheme, rupees on a cash one.
  const bonusPayable = matured && !metal ? round2(entry.bonusAmount || 0) : 0
  const rate = metal && valuationRate && valuationRate > 0 ? valuationRate : null
  // Rounded ONCE, here, at the end of the chain.
  const maturityValue = metal ? (rate ? round2(maturityGrams * rate) : 0) : round2(totalPaid + bonusPayable)

  return {
    type: entry.type || 'cash',
    metal,
    totalGrams,
    totalGramsDisplay: roundWeight(totalGrams, 3),
    bonusGramsPayable,
    maturityGrams,
    valuationRate: rate,
    paid,
    totalPaid,
    due,
    missed,
    remaining: Math.max(0, total - paid),
    elapsedMonths,
    maturityDate,
    fullyPaid,
    matured,
    bonusPayable,
    maturityValue,
    // A weight scheme refunds the RUPEES deposited and forfeits the grams — see the header.
    refundIfClosedNow: round2(Math.max(0, totalPaid - (entry.earlyExitDeduction || 0))),
    nextInstallmentNo: installments.reduce((m, i) => Math.max(m, i.installmentNo), 0) + 1,
  }
}

/** Ledger account a receipt/refund moves money through. Mirrors the map in loans/[id]/payments. */
export const MONEY_ACCOUNTS: Record<string, string> = {
  cash: 'Cash in Hand',
  bank: 'Bank Account',
  cheque: 'Bank Account',
  upi: 'Bank Account',
  card: 'Bank Account',
}

/**
 * A scheme deposit is a LIABILITY: the shop owes it back as goods. Never income.
 * Booking installments as revenue would overstate profit on every receipt and then again on the
 * sale at redemption.
 */
export const SCHEME_DEPOSITS = 'Scheme Deposits'
/** Goods handed over that no one paid for — the bonus is a real cost, recognised at redemption. */
export const SCHEME_BONUS_EXPENSE = 'Scheme Bonus Expense'
/** An early-exit deduction the firm keeps. Income, and visible as its own line. */
export const SCHEME_FORFEITURE_INCOME = 'Scheme Forfeiture Income'
/** Redemption parks the maturity value here; the sale invoice settles against it. */
export const CUSTOMER_ADVANCES = 'Customer Advances'

/**
 * Metal-scheme accounts. NEW ACCOUNTS — src/lib/accounting.ts is off-limits to this module, so they
 * are self-provisioned per firm with ensureSchemeAccount() below and the names/types are reported to
 * the chart's owner:
 *   'Gold Scheme Deposits'      liability  2008
 *   'Silver Scheme Deposits'    liability  2009
 *   'Scheme Metal Revaluation'  expense    5006
 *
 * Metal-SEPARATED, following the precedent already set by METAL_STOCK / METAL_COGS: a gold book and
 * a silver book are different books and a merged one cannot be unmerged after the fact. The deposit
 * liability carries the RUPEES received; the gap between that and the grams' value on the maturity
 * day is the shop's price risk and lands in Scheme Metal Revaluation — an expense that is allowed to
 * carry a credit balance when metal falls, exactly as 'Round Off' is allowed a debit one.
 */
export const METAL_SCHEME_DEPOSITS = {
  gold: { name: 'Gold Scheme Deposits', type: 'liability', code: '2008' },
  silver: { name: 'Silver Scheme Deposits', type: 'liability', code: '2009' },
} as const
export const SCHEME_METAL_REVALUATION = { name: 'Scheme Metal Revaluation', type: 'expense', code: '5006' }

/** The deposit liability a subscription's receipts land in: metal-separated, or the cash one. */
export function schemeDepositAccount(type: string | null | undefined): string {
  const metal = schemeMetal(type)
  return metal ? METAL_SCHEME_DEPOSITS[metal].name : SCHEME_DEPOSITS
}

/**
 * Self-provision a firm's Account row (the ensureAccount pattern from the invoice route, kept local
 * so nothing here imports a route module). A real Account row always beats CHART_OF_ACCOUNTS, so
 * this is what keeps a new account on the right statement. Takes the caller's tx — never its own.
 */
export async function ensureSchemeAccount(
  /** The caller's Prisma transaction client. */
  tx: any,
  firmId: string,
  want: { name: string; type: string; code: string },
): Promise<string> {
  const existing = await tx.account.findFirst({ where: { firmId, name: want.name } })
  if (existing) return want.name
  const taken = new Set(
    (await tx.account.findMany({ where: { firmId }, select: { code: true } })).map((a: { code: string }) => a.code),
  )
  let code = Number(want.code)
  while (taken.has(String(code))) code++
  await tx.account.create({ data: { firmId, code: String(code), name: want.name, type: want.type, group: 'Schemes' } })
  return want.name
}

/**
 * Grams one receipt buys. INR per GRAM in, grams out, UNROUNDED — the caller rounds once at the end.
 * Returns null when there is no usable rate, so a weight receipt can never silently record 0 g.
 */
export function gramsFor(amount: number, ratePerGram: number | null | undefined): number | null {
  if (!ratePerGram || !Number.isFinite(ratePerGram) || ratePerGram <= 0) return null
  return amount / ratePerGram
}
