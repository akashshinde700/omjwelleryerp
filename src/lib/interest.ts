import { round2 } from './gst'

/**
 * Girvi interest — the single source of truth. The loan list, the girvi calculator, the release
 * quote and the payments route all call these functions. Three divergent formulas used to live in
 * loans.tsx (days/30), girvicalc.tsx (whole months typed by the operator) and the release dialog
 * (whatever the operator overtyped); the number the counter charged was never the number the
 * calculator quoted.
 *
 * ── THE CONVENTION (decided by the business, do not re-derive) ────────────────────────────────
 *
 * 1. SIMPLE interest, per month, on the OUTSTANDING principal:  interest = P × rate% × months.
 *    Compounding is not the girvi default; the calculator offers it as an explicit what-if only.
 *
 * 2. Part months are PRO-RATA BY DAYS, CALENDAR-ANCHORED:
 *
 *        months = completeCalendarMonths(from, to) + remainderDays / 30
 *
 *    Complete months are counted on the calendar ANNIVERSARY of `from`; the remainder runs from
 *    the last anniversary to `to`. It is NOT totalDays/30 — that charges a customer whose loan
 *    spanned February less than one whose loan spanned March, for the same elapsed calendar term.
 *
 *      2026-01-01 → 2026-02-10 : anniversary 2026-02-01 reached ⇒ 1 month, remainder 9 days
 *                                = 1 + 9/30 = 1.3 months
 *      2026-02-10 → 2026-04-11 : anniversaries 03-10 and 04-10  ⇒ 2 months, remainder 1 day
 *                                = 2 + 1/30 = 2.0333333 months
 *
 * 3. NO MINIMUM INTEREST PERIOD. A loan released 5 days in accrues 5/30 = 0.166667 months
 *    (₹208.33 on ₹50,000 at 2.5%/mo), not a full month of ₹1,250.
 *
 * 4. A PART PAYMENT APPLIES TO INTEREST FIRST, THEN PRINCIPAL. Interest thereafter accrues on the
 *    reduced principal from the payment date onwards.
 *
 * 5. A TOPUP (additional principal on a live girvi, oMunim's olggapin.php) CARRIES ITS OWN DATE.
 *    The principal rises from that date only: every segment before it accrues on the old balance
 *    and every segment after on the new one. It is an advance, not a receipt — it clears no
 *    interest and is not part of totalPaid. Worked: ₹50,000 at 2.5%/mo from 01-01, ₹20,000 topped
 *    up on 02-01 ⇒ Jan accrues on ₹50,000 (₹1,250), Feb on ₹70,000 (₹1,750), NOT ₹70,000 for both.
 *
 * 6. AN AUCTION settles the loan on its date and nothing accrues afterwards: the auction
 *    LoanTransaction carries the recovery as `amount` and the unrecoverable remainder as
 *    `discount`, which together equal the whole principal + interest then standing, so the replay
 *    drives the balance to exactly zero with no special case. The SIGN of the difference between
 *    the proceeds and the dues is the whole point and is decided in the auction route, never by
 *    Math.abs: proceeds above dues are a LIABILITY owed back to the pledgor, proceeds below are a
 *    bad debt. See src/app/api/loans/[id]/auction/route.ts.
 *
 * 8. A RE-PLEDGE RUNS A SECOND, INDEPENDENT STREAM ON THE SAME GOLD. When the shop re-pledges a
 *    customer's ornaments to a financier it keeps the customer's loan as its asset AND takes on a
 *    borrowing. Two interest streams, two rates, one set of ornaments; the difference is the shop's
 *    margin and the two are NEVER netted. Every LoanTransaction therefore carries a `stream`:
 *    'in' (the customer's leg, the default and every row ever written before this) or 'out' (what
 *    we paid the financier). deriveLoan() sees only 'in'; deriveTransfer() sees only 'out' and
 *    prices it off the loan's transfer* columns through THIS SAME ENGINE. A financier receipt can
 *    therefore never pay down a customer's balance, and neither leg has a hand-rolled formula.
 *
 * 7. THE OUTSTANDING IS NEVER STORED. deriveLoan() replays the LoanTransaction rows in date order
 *    every time, accruing each segment on the principal that stood during it. A stored balance
 *    cannot survive a back-dated correction or a reversal; a replay can.
 *
 * Rounding: money is rounded half-up to paise ONCE, at the end of a chain — round2() from gst.ts.
 * Inside the replay the running interest and principal stay unrounded; only the figures handed
 * back (and the components written to a LoanTransaction / ledger leg) are rounded.
 *
 * ── WORKED EXAMPLE ────────────────────────────────────────────────────────────────────────────
 * ₹50,000 at 2.5%/month, disbursed 2026-01-01. ₹15,000 paid on 2026-02-10. Released 2026-04-11.
 *   segment 1: 1.3 months × ₹50,000 × 2.5%          = ₹1,625.00 interest
 *   payment:   ₹1,625.00 → interest, ₹13,375.00 → principal ⇒ outstanding ₹36,625.00
 *   segment 2: 2.0333333 months × ₹36,625 × 2.5%    = ₹1,861.77 interest
 *   release:   ₹36,625.00 + ₹1,861.77               = ₹38,486.77
 *   total received over the life of the loan        = ₹53,486.77
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000

function toDate(d: Date | string | number): Date {
  return d instanceof Date ? d : new Date(d)
}

/**
 * `from` plus n calendar months, clamped to the end of the target month so that
 * 31 Jan + 1 month is 28 Feb, not 3 March. Time-of-day is preserved, so a remainder measured
 * against an anniversary cancels out the time component of `from`. Calendar arithmetic is done in
 * UTC so the answer does not shift with the server timezone.
 */
function addMonthsClamped(from: Date, n: number): Date {
  const y = from.getUTCFullYear()
  const m = from.getUTCMonth()
  const day = from.getUTCDate()
  const daysInTarget = new Date(Date.UTC(y, m + n + 1, 0)).getUTCDate()
  const out = new Date(from.getTime())
  out.setUTCFullYear(y, m + n, Math.min(day, daysInTarget))
  return out
}

/**
 * Calendar-anchored pro-rata months between two instants:
 * complete calendar months + whole remainder days / 30. Never negative — a `to` before `from`
 * (a back-dated correction, clock skew) yields 0 rather than a credit.
 */
export function monthsBetween(from: Date | string | number, to: Date | string | number): number {
  const a = toDate(from)
  const b = toDate(to)
  if (!(b.getTime() > a.getTime())) return 0
  let whole = 0
  // Bounded by the elapsed days, so this cannot run away even on a nonsense date.
  while (addMonthsClamped(a, whole + 1).getTime() <= b.getTime()) whole++
  const anniversary = addMonthsClamped(a, whole)
  const remainderDays = Math.floor((b.getTime() - anniversary.getTime()) / MS_PER_DAY)
  return whole + remainderDays / 30
}

/** Simple interest for a period already expressed in (fractional) months. Deliberately unrounded. */
export function simpleInterest(principal: number, monthlyRatePct: number, months: number): number {
  return (principal * monthlyRatePct * months) / 100
}

/**
 * ── THE INTEREST-CONVENTION ENGINE (Task 71) ──────────────────────────────────────────────────
 *
 * Everything above is ONE convention — the one this shop settled on, and still the default. Real
 * girvi shops quote others, and a shop we are migrating arrives with a live book already priced
 * under theirs. A convention is therefore a value, resolved once when the loan is written and
 * PERSISTED ON THE LOAN (Loan.interestConvention, JSON). A firm that changes its policy next year
 * re-prices nothing: every live pledge keeps the convention that priced it.
 *
 * A convention is four independent choices plus three modifiers:
 *
 *   dayBasis   'calendar' | 'days30'
 *              How the raw term is measured, before any rounding.
 *              calendar (DEFAULT) = complete calendar months on the anniversary + remainder days.
 *                                   oMunim LOAN DAYS OPTION "30 Day in last Month".
 *              days30             = every month is 30 days: floor(days/30) whole months and
 *                                   (days mod 30) leftover. oMunim "30 Days in All Months".
 *
 *   rounding   'exact' | 'full' | 'half' | 'weekly'      (oMunim MONTHLY INTEREST OPTION)
 *              What the leftover days after the last whole month cost.
 *              exact  (DEFAULT) = remainderDays/30, pro-rata, no minimum. oMunim "Default".
 *              full             = one leftover day rounds the term UP to a whole month.
 *              half             = 1–15 leftover days cost half a month, 16–30 cost a whole one.
 *              weekly           = leftover days charged in whole 7-day weeks, ceil(d/7)×7/30,
 *                                 capped at one month.
 *
 *   compound   false (DEFAULT) | true, with restMonths = the rest period
 *              (oMunim girviCompoundedOption: 1 monthly · 3 quarterly · 6 half-yearly · 12 yearly
 *              · 24 · 36). At every rest the interest accrued so far in that segment folds into
 *              the balance and earns interest from then on.
 *
 *   slab       null (DEFAULT) | { steps, recurring }     (oMunim Settings ▸ ROI, 13 presets)
 *              The rate escalates with the AGE OF THE LOAN. The loan's own interestRate is the
 *              base; each step ADDS its increment CUMULATIVELY once the loan is that many months
 *              old. `recurring` keeps stepping past the last threshold, by the last increment,
 *              every (lastThreshold − previousThreshold) months.
 *              oMunim ROI 1 = base 1%, steps (3,+0.5) (6,+0.5) (9,+0.5) (12,+0.5), recurring:
 *                0–3 → 1.0%   3–6 → 1.5%   6–9 → 2.0%   9–12 → 2.5%
 *                12–15 → 3.0%   15–18 → 3.5%   … stride 3, +0.5 each.
 *              (The PHP is encrypted; the CUMULATIVE reading is OUR stated rule — the alternative
 *              makes rows 2–4 of every preset meaningless. Worked examples live in the tests.)
 *
 *   rateBasis  'monthly' (DEFAULT) | 'annual'
 *              Whether Loan.interestRate is per month or per annum. annual divides by 12 ONCE, at
 *              the point of use, so the stored rate stays the number the operator typed.
 *
 *   firstMonthFull  false (DEFAULT) | true                (oMunim FIRST MONTH FULL INT.)
 *              The first month is charged in full however early the pledge is redeemed. Applies
 *              ONLY to the segment starting at disbursal — a part payment does not restart it.
 *
 *   graceDays  0 (DEFAULT)                                (oMunim LOAN GRACE PERIOD)
 *              A pledge redeemed within this many days of disbursal pays NO interest. Checked
 *              before everything else, so it beats firstMonthFull. It is a waiver window, not a
 *              deduction: on day graceDays+1 the interest runs from day 0.
 *
 * NOT implemented, deliberately:
 *   · FIRST MONTH INT. REC (interest deducted at disbursement) — that changes the cash paid out
 *     and the disbursal voucher, so it is a ledger change, not an accrual rule. Separate task.
 *   · I-AMOUNT AND O-AMOUNT RATIO and the second parallel interest set (oMunim carries
 *     ototalInterest and itotalInterest exactly 3× apart on every loan). Nobody can say what it is
 *     for and the source is encrypted. Replicating an unexplained 3× multiplier on a money figure
 *     is how a shop over-charges for six months.
 *
 * ROUNDING IS STILL ONCE, AT THE END. Every convention accrues unrounded; deriveLoan() alone
 * rounds, so what a screen displays and what the counter charges stay the same number. The 75%
 * LTV warning lives in POST /api/loans and is untouched by any of this.
 */

export type DayBasis = 'calendar' | 'days30'
export type MonthRounding = 'exact' | 'full' | 'half' | 'weekly'
export type RateBasis = 'monthly' | 'annual'

/** One rung of an ROI slab: from `afterMonths` of loan age on, add `increaseBy` % to the rate. */
export type RoiStep = { afterMonths: number; increaseBy: number }
export type RoiSlab = { steps: RoiStep[]; recurring: boolean }

export type InterestConvention = {
  dayBasis: DayBasis
  rounding: MonthRounding
  compound: boolean
  /** Rest period in months when compound. 12 = yearly rests. Ignored when compound is false. */
  restMonths: number
  rateBasis: RateBasis
  firstMonthFull: boolean
  graceDays: number
  slab: RoiSlab | null
}

/**
 * The convention the business settled on, and the one every existing loan is priced by: a loan with
 * no stored convention resolves to exactly this, and that path runs the identical arithmetic it ran
 * before the engine existed. Changing a value here re-prices the whole book — don't.
 */
export const DEFAULT_CONVENTION: InterestConvention = {
  dayBasis: 'calendar',
  rounding: 'exact',
  compound: false,
  restMonths: 12,
  rateBasis: 'monthly',
  firstMonthFull: false,
  graceDays: 0,
  slab: null,
}

/** Per-firm Setting key holding GirviInterestSettings as JSON. */
export const GIRVI_INTEREST_SETTING_KEY = 'girvi.interest'

/** An ROI preset as the settings screen stores it: a base rate plus its escalation ladder. */
export type RoiPreset = { label: string; rate: number; steps: RoiStep[]; recurring: boolean; isDefault?: boolean }

/** The shape of Setting['girvi.interest'].value. Defined here, rendered by the settings screen. */
export type GirviInterestSettings = { convention: InterestConvention; roiPresets: RoiPreset[] }

const DAY_BASES: DayBasis[] = ['calendar', 'days30']
const ROUNDINGS: MonthRounding[] = ['exact', 'full', 'half', 'weekly']
const RATE_BASES: RateBasis[] = ['monthly', 'annual']

function pick<T extends string>(allowed: T[], v: unknown, fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback
}

function num(v: unknown, fallback: number, min = 0): number {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n >= min ? n : fallback
}

function parseSlab(v: unknown): RoiSlab | null {
  const raw = v as { steps?: unknown; recurring?: unknown } | null | undefined
  if (!raw || !Array.isArray(raw.steps)) return null
  const steps = (raw.steps as unknown[])
    .map((s) => {
      const o = s as { afterMonths?: unknown; increaseBy?: unknown }
      return { afterMonths: num(o?.afterMonths, 0), increaseBy: num(o?.increaseBy, 0, -100) }
    })
    .filter((s) => s.afterMonths > 0)
    .sort((a, b) => a.afterMonths - b.afterMonths)
  return steps.length ? { steps, recurring: raw.recurring === true } : null
}

/**
 * Turns whatever was stored — a JSON string off the Loan column, a plain object off a request, null
 * for a legacy loan — into a complete convention. TOTAL: it never throws and never returns a
 * partial. An unreadable field falls back to the default for THAT FIELD ALONE, so one bad key
 * cannot silently re-price a loan. Writes are zod-validated at the API boundary; this is the read
 * side, which runs inside a table render and must not be able to blank a screen.
 */
export function resolveConvention(
  input?: InterestConvention | Partial<InterestConvention> | string | null,
): InterestConvention {
  if (input == null || input === '') return DEFAULT_CONVENTION
  let raw: unknown = input
  if (typeof input === 'string') {
    try { raw = JSON.parse(input) } catch { return DEFAULT_CONVENTION }
  }
  if (!raw || typeof raw !== 'object') return DEFAULT_CONVENTION
  const o = raw as Record<string, unknown>
  return {
    dayBasis: pick(DAY_BASES, o.dayBasis, DEFAULT_CONVENTION.dayBasis),
    rounding: pick(ROUNDINGS, o.rounding, DEFAULT_CONVENTION.rounding),
    compound: o.compound === true,
    restMonths: num(o.restMonths, DEFAULT_CONVENTION.restMonths, 0),
    rateBasis: pick(RATE_BASES, o.rateBasis, DEFAULT_CONVENTION.rateBasis),
    firstMonthFull: o.firstMonthFull === true,
    graceDays: Math.floor(num(o.graceDays, 0, 0)),
    slab: parseSlab(o.slab),
  }
}

/** True when a convention prices exactly as the default does. */
export function isDefaultConvention(c: InterestConvention): boolean {
  return (
    c.dayBasis === DEFAULT_CONVENTION.dayBasis &&
    c.rounding === DEFAULT_CONVENTION.rounding &&
    !c.compound &&
    c.rateBasis === DEFAULT_CONVENTION.rateBasis &&
    !c.firstMonthFull &&
    c.graceDays === 0 &&
    c.slab === null
  )
}

const ROUNDING_LABEL: Record<MonthRounding, string> = {
  exact: 'pro-rata part months',
  full: 'part month charged as a full month',
  half: 'part month charged as a half or a full month',
  weekly: 'part month charged in whole weeks',
}
const REST_LABEL: Record<number, string> = {
  1: 'monthly', 3: 'quarterly', 6: 'half-yearly', 12: 'yearly', 24: '2-yearly', 36: '3-yearly',
}

/** One line for a receipt, a tooltip or an audit log: say what priced this loan, in words. */
export function describeConvention(c: InterestConvention): string {
  const bits = [
    c.dayBasis === 'days30' ? '30-day months' : 'calendar months',
    ROUNDING_LABEL[c.rounding],
    c.compound ? `compound, ${REST_LABEL[c.restMonths] || 'every ' + c.restMonths + ' months'} rests` : 'simple',
    `rate per ${c.rateBasis === 'annual' ? 'annum' : 'month'}`,
  ]
  if (c.firstMonthFull) bits.push('first month charged in full')
  if (c.graceDays > 0) bits.push(`${c.graceDays}-day grace`)
  if (c.slab) {
    bits.push(
      'escalating ' +
        c.slab.steps.map((s) => `+${s.increaseBy}% after ${s.afterMonths}mo`).join(', ') +
        (c.slab.recurring ? ', recurring' : ''),
    )
  }
  return bits.join(' · ')
}

/** Whole elapsed days between two instants, never negative. */
function daysElapsed(a: Date, b: Date): number {
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / MS_PER_DAY))
}

/**
 * The raw term split into whole months and leftover days, BEFORE any rounding rule. Kept as an
 * integer pair on purpose: every rounding rule below is then integer arithmetic on `remDays`, which
 * is exactly the "is 16 days half a month or a whole one?" boundary an operator will argue about.
 */
function rawTerm(from: Date, to: Date, dayBasis: DayBasis): { whole: number; remDays: number } {
  if (dayBasis === 'days30') {
    const d = daysElapsed(from, to)
    return { whole: Math.floor(d / 30), remDays: d % 30 }
  }
  let whole = 0
  while (addMonthsClamped(from, whole + 1).getTime() <= to.getTime()) whole++
  return { whole, remDays: daysElapsed(addMonthsClamped(from, whole), to) }
}

/**
 * The chargeable term in months under `conv`.
 *
 * `fromDisbursal` says this segment starts on the loan date, which is the only place graceDays and
 * firstMonthFull may act — after a part payment the clock restarts but the first month does not.
 */
export function conventionMonths(
  from: Date | string | number,
  to: Date | string | number,
  conv: InterestConvention = DEFAULT_CONVENTION,
  fromDisbursal = false,
): number {
  const a = toDate(from)
  const b = toDate(to)
  if (!(b.getTime() > a.getTime())) return 0
  if (fromDisbursal && conv.graceDays > 0 && daysElapsed(a, b) <= conv.graceDays) return 0

  const { whole, remDays } = rawTerm(a, b, conv.dayBasis)
  let months: number
  switch (conv.rounding) {
    case 'full':
      months = whole + (remDays > 0 ? 1 : 0)
      break
    case 'half':
      months = whole + (remDays === 0 ? 0 : remDays <= 15 ? 0.5 : 1)
      break
    case 'weekly':
      // Whole weeks — but a part month can never cost more than the month it sits inside.
      months = whole + Math.min(Math.ceil(remDays / 7) * 7, 30) / 30
      break
    default:
      months = whole + remDays / 30
  }
  if (fromDisbursal && conv.firstMonthFull && months > 0) months = Math.max(months, 1)
  return months
}

/**
 * The rate in force at `ageMonths` of loan age: the loan's own rate plus every slab step it has
 * passed, cumulatively, plus the recurring tail.
 */
function rateAtAge(baseRate: number, slab: RoiSlab | null, ageMonths: number): number {
  if (!slab || !slab.steps.length) return baseRate
  const EPS = 1e-9
  let rate = baseRate
  for (const s of slab.steps) if (ageMonths + EPS >= s.afterMonths) rate += s.increaseBy
  if (slab.recurring) {
    const last = slab.steps[slab.steps.length - 1]
    const prev = slab.steps.length > 1 ? slab.steps[slab.steps.length - 2].afterMonths : 0
    const stride = last.afterMonths - prev
    if (stride > 0 && ageMonths + EPS >= last.afterMonths + stride) {
      rate += Math.floor((ageMonths + EPS - last.afterMonths) / stride) * last.increaseBy
    }
  }
  return rate
}

/** The per-month rate actually charged: an annual quote is divided by 12 here and nowhere else. */
function perMonthRate(rate: number, conv: InterestConvention): number {
  return conv.rateBasis === 'annual' ? rate / 12 : rate
}

/** The rate a loan is on right now, slab included — for the screen and the receipt. */
export function effectiveRate(rate: number, conv: InterestConvention, ageMonths: number): number {
  return rateAtAge(perMonthRate(rate, conv), conv.slab, ageMonths)
}

/** Ages inside (a0, a1) at which the rate steps or the interest rests. */
function boundaries(conv: InterestConvention, a0: number, a1: number): { pts: number[]; rests: Set<number> } {
  const pts: number[] = []
  const rests = new Set<number>()
  const GUARD = 2000 // bounds both loops: no loan is priced across 2000 rests or steps
  const slab = conv.slab
  if (slab) {
    for (const s of slab.steps) if (s.afterMonths > a0 && s.afterMonths < a1) pts.push(s.afterMonths)
    if (slab.recurring) {
      const last = slab.steps[slab.steps.length - 1]
      const prev = slab.steps.length > 1 ? slab.steps[slab.steps.length - 2].afterMonths : 0
      const stride = last.afterMonths - prev
      if (stride > 0) {
        for (let p = last.afterMonths + stride, n = 0; p < a1 && n < GUARD; p += stride, n++) {
          if (p > a0) pts.push(p)
        }
      }
    }
  }
  if (conv.compound && conv.restMonths > 0) {
    for (let p = conv.restMonths, n = 0; p < a1 && n < GUARD; p += conv.restMonths, n++) {
      if (p > a0) { pts.push(p); rests.add(p) }
    }
  }
  return { pts: [...new Set(pts)].sort((x, y) => x - y), rests }
}

/**
 * Interest for ONE segment: `months` of chargeable term starting when the loan is `ageMonths` old,
 * on a balance of `principal`. Walks the segment band by band so a slab step or a compounding rest
 * falling inside it is honoured on its own date rather than at the segment edge. Unrounded.
 *
 * ponytail: interest carried UNPAID from before a part payment is carried simple — it is not folded
 * into the balance at a rest. That is the customer-favourable reading and matches what the loan
 * screen has always said ("carried forward unpaid, not added to the principal"). Fold it too only
 * if a migrating shop's book proves otherwise, and make it a named flag when you do.
 */
export function accrueSegment(
  principal: number,
  rate: number,
  conv: InterestConvention,
  ageMonths: number,
  months: number,
): number {
  if (months <= 0 || principal <= 0) return 0
  const base = perMonthRate(rate, conv)
  // The default and by far the commonest path: one multiplication, the exact expression this module
  // has always used. Keeping it literally identical keeps every existing loan penny-identical.
  if (!conv.compound && !conv.slab) return simpleInterest(principal, base, months)

  const end = ageMonths + months
  const { pts, rests } = boundaries(conv, ageMonths, end)
  let balance = principal
  let interest = 0
  let cursor = ageMonths
  for (const p of [...pts, end]) {
    const span = p - cursor
    if (span > 0) interest += simpleInterest(balance, rateAtAge(base, conv.slab, cursor), span)
    if (rests.has(p)) { balance += interest; interest = 0 }
    cursor = p
  }
  return balance + interest - principal
}

export type LoanBasis = {
  principalAmount: number
  /** % per month — or per annum when the loan's convention says rateBasis: 'annual'. */
  interestRate?: number | null
  loanDate: Date | string
  /**
   * The convention that PRICED this loan, as stored JSON (or already-resolved). Null/absent means
   * the default — which is every loan written before Task 71, and is why nothing about them moves.
   * Never read the firm's current setting here: a shop that changes its policy must not re-price a
   * live pledge.
   */
  interestConvention?: InterestConvention | string | null
}

export type LoanTxnLike = {
  id?: string | null
  date: Date | string
  /**
   * 'topup' ADDS `amount` to the principal from `date` onwards (a further advance against the same
   * pledge). Anything else is a receipt and is applied interest-first. A reversal carries
   * reversalOfId and is dropped by the replay along with the row it points at, so its type is
   * never read here.
   */
  type?: string | null
  /** Cash actually received — or, for a topup, cash advanced. */
  amount: number
  /** Value forgiven — applied to the dues alongside the cash, but never received. */
  discount?: number | null
  /** A reversal cancels both itself and the row it points at. */
  reversalOfId?: string | null
  /**
   * Which leg of a re-pledged loan this row belongs to - 'in' (the customer's, and the default for
   * every row that predates re-pledging) or 'out' (ours to the financier). ABSENT MEANS 'in', so a
   * caller that never heard of streams keeps the exact behaviour it had.
   */
  stream?: string | null
}

/** The two sides of a re-pledged pledge. 'in' = the customer owes us. 'out' = we owe the financier. */
export type LoanStream = 'in' | 'out'

/**
 * The rows belonging to one leg. The default matters: a row with no `stream` is a customer-leg row,
 * which is what every LoanTransaction written before the re-pledge feature is.
 */
export function ofStream<T extends LoanTxnLike>(txns: T[], stream: LoanStream = 'in'): T[] {
  return txns.filter((t) => (t.stream || 'in') === stream)
}

export type LoanDerivation = {
  /** Principal still outstanding after every payment up to `asOf`. */
  outstandingPrincipal: number
  /** Interest accrued and still unpaid as at `asOf`. */
  accruedInterest: number
  /** What the customer must hand over on `asOf` to close the loan. */
  totalDue: number
  /** Cash received over the life of the loan (excludes discounts). */
  totalPaid: number
  /** Interest recovered so far. */
  paidInterest: number
  /** Principal recovered so far. */
  paidPrincipal: number
  /** Value forgiven so far (a release rebate, or the unrecoverable part written off at auction). */
  totalDiscount: number
  /** Further principal advanced against the same pledge after disbursal. */
  totalTopUp: number
  /** Everything ever put out on this loan: the original principal plus every topup. */
  principalAdvanced: number
  /** Chargeable months from the last payment (or from disbursal) to `asOf`, under the convention. */
  monthsSinceLastEvent: number
  /** Chargeable months from disbursal to `asOf`, under the convention. */
  monthsElapsed: number
  /** The date `accruedInterest` runs from. */
  interestFrom: Date
  /** The convention that priced this loan — resolved, never the firm's current setting. */
  convention: InterestConvention
  /** %/month actually in force at `asOf`: the loan's rate after rateBasis and any ROI slab step. */
  effectiveRatePct: number
}

/**
 * Drops rows from the other leg, reversed rows and their reversals, and anything after `asOf`,
 * then orders by date.
 *
 * The stream filter lives HERE, inside the engine, and not at the twenty-odd call sites that hand
 * us `loan.transactions`. Every one of them - the loan list, the dashboard total, the statutory
 * register, the print layer, the phone - would otherwise have to remember to filter, and the one
 * that forgot would silently let a payment to the financier pay down a customer's principal.
 */
function usableTxns<T extends LoanTxnLike>(txns: T[], asOf: Date, stream: LoanStream = 'in'): T[] {
  const same = ofStream(txns, stream)
  const reversed = new Set(same.map((t) => t.reversalOfId).filter(Boolean) as string[])
  return same
    .filter((t) => !t.reversalOfId && !(t.id && reversed.has(t.id)))
    .filter((t) => toDate(t.date).getTime() <= asOf.getTime())
    .sort((x, y) => toDate(x.date).getTime() - toDate(y.date).getTime())
}

/**
 * Replays a loan's payments in date order and returns its position as at `asOf`.
 * Each payment closes a segment: interest accrues on the principal that stood during that segment,
 * the payment clears the accrued interest first and whatever is left reduces the principal.
 */
export function deriveLoan(
  loan: LoanBasis,
  txns: LoanTxnLike[] = [],
  asOf: Date | string = new Date(),
  /** Which leg to replay. Callers never pass this; deriveTransfer() does. */
  stream: LoanStream = 'in',
): LoanDerivation {
  const at = toDate(asOf)
  const rate = loan.interestRate || 0
  const conv = resolveConvention(loan.interestConvention)
  const start = toDate(loan.loanDate)
  /**
   * How old the loan is when a segment opens — the coordinate an ROI slab step and a compounding
   * rest are anchored to. Measured unrounded on the convention's own day basis, so a step that
   * falls inside a segment lands on its own date rather than at the segment edge.
   */
  const ageAt = (d: Date) => conventionMonths(start, d, { ...conv, rounding: 'exact', firstMonthFull: false, graceDays: 0 })
  let principal = loan.principalAmount || 0
  let unpaidInterest = 0
  let paidInterest = 0
  let paidPrincipal = 0
  let totalPaid = 0
  let totalDiscount = 0
  let totalTopUp = 0
  let cursor = start

  for (const t of usableTxns(txns, at, stream)) {
    const on = toDate(t.date)
    // Close the segment that ran up to this event on the principal that stood during it, whatever
    // the event is. Only then does the event change the principal.
    unpaidInterest += accrueSegment(principal, rate, conv, ageAt(cursor), conventionMonths(cursor, on, conv, cursor.getTime() === start.getTime()))
    // CLAMP TO THE LOAN DATE. A row dated BEFORE disbursal (a mis-keyed date, a receipt entered
    // against a pledge whose loanDate was corrected afterwards) must never drag the interest clock
    // behind the day the money went out: every later segment would then be measured from an anchor
    // that predates the loan and charge phantom months. On ₹1,00,000 at 2%/mo disbursed 2026-03-01
    // with a ₹500 receipt mis-dated 2026-01-01, accruedInterest at 2026-04-01 read ₹5,970 -- three
    // months -- against a single due cycle of ₹1,990.
    // THE ROW IS KEPT, NOT DROPPED: the cash was actually received, so it must still clear interest
    // and reduce the principal (₹99,500 × 2% × 1 month = ₹1,990). Dropping it would lose money the
    // shop holds. Only the clock is pinned.
    // The cursor then sits EXACTLY on `start`, so the next segment's `fromDisbursal` flag below stays
    // true -- correct, because graceDays and firstMonthFull are properties of the disbursal itself and
    // a receipt that predates it cannot consume them.
    cursor = on.getTime() < start.getTime() ? start : on
    // A TOPUP is a further advance on the live pledge: the principal goes UP from this date, and
    // every later segment accrues on the higher balance. It is not a receipt — it clears no
    // interest and never counts towards totalPaid.
    if (t.type === 'topup') {
      const advanced = t.amount || 0
      principal += advanced
      totalTopUp += advanced
      continue
    }
    const applied = (t.amount || 0) + (t.discount || 0)
    const toInterest = Math.min(applied, unpaidInterest)
    const toPrincipal = applied - toInterest
    unpaidInterest -= toInterest
    principal = Math.max(0, principal - toPrincipal)
    paidInterest += toInterest
    paidPrincipal += toPrincipal
    totalPaid += t.amount || 0
    totalDiscount += t.discount || 0
  }

  const monthsSinceLastEvent = conventionMonths(cursor, at, conv, cursor.getTime() === start.getTime())
  const accrued = unpaidInterest + accrueSegment(principal, rate, conv, ageAt(cursor), monthsSinceLastEvent)
  return {
    outstandingPrincipal: round2(principal),
    accruedInterest: round2(accrued),
    totalDue: round2(principal + accrued),
    totalPaid: round2(totalPaid),
    paidInterest: round2(paidInterest),
    paidPrincipal: round2(paidPrincipal),
    totalDiscount: round2(totalDiscount),
    totalTopUp: round2(totalTopUp),
    principalAdvanced: round2((loan.principalAmount || 0) + totalTopUp),
    monthsSinceLastEvent,
    monthsElapsed: conventionMonths(start, at, conv, true),
    interestFrom: cursor,
    convention: conv,
    effectiveRatePct: effectiveRate(rate, conv, ageAt(at)),
  }
}

/**
 * -- THE FINANCIER LEG OF A RE-PLEDGED PLEDGE -------------------------------------------------
 *
 * A girvi shop funds itself by re-pledging the gold its customers pledged to it. oMunim calls the
 * result a TRANSFERED LOAN and carries the two sides as itotalAmount/itotalInterest (what the
 * customer owes US) against ototalAmount/ototalInterest (what WE owe the financier).
 *
 * The financier leg has exactly the shape of a loan, so it is priced by exactly the same engine:
 * transferPrincipal / transferRate / transferDate / transferConvention are its principalAmount /
 * interestRate / loanDate / interestConvention, and the stream='out' LoanTransaction rows are its
 * repayments - applied interest-first, on the reducing balance, under the frozen convention. There
 * is no second formula anywhere.
 */
export type TransferBasis = {
  transferDate?: Date | string | null
  transferPrincipal?: number | null
  /** % per month - or per annum if the transfer convention says so. */
  transferRate?: number | null
  transferConvention?: InterestConvention | string | null
}

/** The financier leg as at `asOf`, or null when this pledge was never re-pledged. */
export function deriveTransfer(
  loan: TransferBasis,
  txns: LoanTxnLike[] = [],
  asOf: Date | string = new Date(),
): LoanDerivation | null {
  if (!loan.transferDate || !loan.transferPrincipal) return null
  return deriveLoan(
    {
      principalAmount: loan.transferPrincipal,
      interestRate: loan.transferRate,
      loanDate: loan.transferDate,
      interestConvention: loan.transferConvention,
    },
    txns,
    asOf,
    'out',
  )
}

export type LoanSpread = {
  /** What the customer owes us. oMunim's itotalAmount / itotalInterest. */
  customer: LoanDerivation
  /** What we owe the financier. oMunim's ototalAmount / ototalInterest. Null when not re-pledged. */
  financier: LoanDerivation | null
  /** Interest EARNED on the customer leg to date: recovered + still accruing. */
  interestEarned: number
  /** Interest OWED on the financier leg to date: paid + still accruing. */
  interestOwed: number
  /** The margin. Positive = the shop is ahead on this pledge, negative = it is lending at a loss. */
  spread: number
  /** The shop's OWN money still in this pledge: what the customer owes less what we owe. */
  ownFunds: number
}

/**
 * Both legs and the margin between them, for one pledge, as at `asOf`.
 *
 * DELIBERATELY NOT NETTED. A jeweller needs to see Rs 1,00,000 owed to him at 2.5% and Rs 70,000
 * owed by him at 1.5% side by side; a single net figure hides both the funding cost and the day the
 * spread goes negative. Each leg is rounded once at the end of its own replay and the two rounded
 * figures are then compared, so the spread is the difference between the two numbers actually
 * printed - never a third number nobody can tie back.
 */
export function deriveSpread(
  loan: LoanBasis & TransferBasis,
  txns: LoanTxnLike[] = [],
  asOf: Date | string = new Date(),
): LoanSpread {
  const customer = deriveLoan(loan, txns, asOf)
  const financier = deriveTransfer(loan, txns, asOf)
  const interestEarned = round2(customer.paidInterest + customer.accruedInterest)
  const interestOwed = financier ? round2(financier.paidInterest + financier.accruedInterest) : 0
  return {
    customer,
    financier,
    interestEarned,
    interestOwed,
    spread: round2(interestEarned - interestOwed),
    ownFunds: round2(customer.outstandingPrincipal - (financier?.outstandingPrincipal ?? 0)),
  }
}

/**
 * Splits one payment interest-first. Both components are rounded to paise and always sum back to
 * the applied value, so the ledger legs they become cannot fail to balance.
 */
export function splitPayment(applied: number, accruedInterest: number) {
  const interestComponent = round2(Math.min(round2(applied), accruedInterest))
  return { interestComponent, principalComponent: round2(round2(applied) - interestComponent) }
}

/** Caption for the UI: "3 months + 10/30 days = 3.3333". */
export function describeMonths(months: number): string {
  const whole = Math.floor(months + 1e-9)
  const days = Math.round((months - whole) * 30)
  return `${whole} month${whole === 1 ? '' : 's'} + ${days}/30 days = ${months.toFixed(4)}`
}

/**
 * Prisma `select` for a loan that is about to be handed to deriveLoan() — the loan basis plus the
 * transaction columns the replay reads, and nothing else. Use it so a summary query fetches the
 * history in the SAME round trip; calling deriveLoan() inside a loop that lazy-loads transactions
 * is an N+1 waiting to happen.
 */
export const LOAN_DERIVE_SELECT = {
  id: true,
  principalAmount: true,
  interestRate: true,
  loanDate: true,
  // The convention that priced the loan travels with it, or a summary screen would re-price a
  // non-default loan by the default rule and disagree with the loan screen to the paise.
  interestConvention: true,
  // `stream` is NOT optional here. Omit it and every row comes back undefined, i.e. 'in', and a
  // summary total would add the financier's repayments to the customer's - the exact bug the
  // engine-side filter exists to prevent.
  transactions: { select: { id: true, type: true, date: true, amount: true, discount: true, reversalOfId: true, stream: true } },
} as const

/**
 * Total principal still out on a set of loans. The ONLY correct way to total "loan outstanding":
 * summing Loan.principalAmount counts money that has already been repaid, because principalAmount
 * is what was disbursed and is deliberately never patched (see note 7 above).
 * Each loan's figure is rounded at the end of its own chain, then the rounded figures are added —
 * the same paise the loan screen and the release quote show, so the totals tie.
 */
export function sumOutstandingPrincipal(
  loans: (LoanBasis & { transactions?: LoanTxnLike[] | null })[],
  asOf: Date | string = new Date(),
): number {
  return round2(loans.reduce((s, l) => s + deriveLoan(l, l.transactions ?? [], asOf).outstandingPrincipal, 0))
}

/**
 * A loan that was closed BEFORE the payments endpoint existed: its status is terminal but not one
 * live LoanTransaction stands behind it. Nothing about the closing receipt was recorded — the
 * `releasedAmount` on those rows is the old release dialog's PREFILL (the bare principal, no
 * interest at all), not a counted receipt.
 *
 * The statutory register (Form 8) must print these as "not recorded" rather than as a ₹0 recovery,
 * and they must NOT be backfilled: the amount and the date of the real recovery are unknowable, and
 * a synthetic closing transaction would put money into the ledger that was never counted and assert
 * an interest figure nobody charged. A104 (₹50,000, 37 days at 2%/mo) and A105 (₹1,000, 7 days at
 * 18%/mo) in the live database are the two rows this describes; both carry releasedAmount exactly
 * equal to the principal, which is the fingerprint of the prefill.
 */
export function isUnrecordedClosure(loan: {
  status?: string | null
  transactions?: LoanTxnLike[] | null
}): boolean {
  if (!loan.status || loan.status === 'active') return false
  const txns = loan.transactions ?? []
  const reversed = new Set(txns.map((t) => t.reversalOfId).filter(Boolean) as string[])
  return !txns.some((t) => !t.reversalOfId && !(t.id && reversed.has(t.id)))
}

/**
 * -- THE MONTHLY INTEREST POSITION (byaj cycles) -----------------------------------------------
 *
 * In a real pawn shop most customers pay the MONTHLY INTEREST ONLY and leave the principal sitting
 * until they redeem. The shop's most valuable question is therefore not "what is the total" but
 * "WHOSE BYAJ IS DUE THIS MONTH, AND WHO HAS FALLEN BEHIND". oMunim cannot answer it: it carries a
 * girvi as one running total plus two crude ageing lists (TIME PERIOD EXPIRED, ONE YEAR OLD), and
 * has no per-loan monthly position at all. This is the arithmetic for that answer.
 *
 * A CYCLE is one byaj month. Cycle n runs from the (n-1)th anniversary of the loan date to the nth,
 * and its interest falls due ON that nth anniversary. Cycle 1 opens on the loan date itself.
 *
 * ANNIVERSARIES, NOT "EVERY 30 DAYS". A customer who pledged on the 5th pays on the 5th, every
 * month - that is what he was told at the counter and what the shop's diary says. Month ends clamp
 * the way the rest of this module clamps them: pledge on 31 Jan and the byaj falls due 28 Feb,
 * 31 Mar, 30 Apr (cycleAnniversary -> addMonthsClamped).
 *
 * BUILT OUT OF deriveLoan() REPLAYS, NOT A SECOND FORMULA. Every figure below is the difference
 * between two full replays taken at two dates:
 *
 *      chargedTo(d)   = deriveLoan(..., d).paidInterest + .accruedInterest   (charged, paid or not)
 *      paidTo(d)      = deriveLoan(..., d).paidInterest
 *      principalAt(d) = deriveLoan(..., d).outstandingPrincipal
 *
 * Nothing here multiplies a principal by a rate. That is the entire design: whatever priced the
 * loan - days30, full/half/weekly part months, compound with yearly rests, an ROI slab, an annual
 * rate quote, a grace window, first-month-full - the monthly view is the SAME arithmetic the
 * release quote is, sliced at different dates. It cannot drift from the counter, because there is
 * nothing for it to drift from, and the loan's own frozen `interestConvention` comes along for
 * free. Note that `charged` is unmoved by a receipt (a payment only shifts interest out of accrued
 * and into paid), so it is monotonic and the slices telescope exactly back to the total.
 *
 * interestPaid IS WINDOW-SCOPED; THE INTEREST-FIRST RULE IS LOAN-SCOPED. A payment is credited to
 * the cycle its DATE falls in, but rule 4 applies it to the loan's oldest unpaid interest first. So
 * a customer three months behind who hands over three months of byaj today shows the whole recovery
 * against TODAY's cycle while it is actually clearing the arrears of the two before it. That is the
 * honest reading - the money arrived today - and it is why arrears are measured by
 * `overdueInterest` (charged up to the last due date, less paid to date) and never by summing
 * per-cycle shortfalls.
 *
 * ponytail: one deriveLoan replay per cycle boundary (memoised by timestamp), so a 10-year loan is
 * ~120 replays - fine for a dialog and for a 300-row list. If a book ever renders thousands of rows
 * at once, memoise deriveCycles per loan id + asOf at the call site rather than making this
 * incremental; an incremental version would be a second formula in disguise.
 */

/** Bounds every cycle walk: 100 years of monthly byaj. A 1970 loan terminates; it does not spin. */
const CYCLE_GUARD = 1200

/**
 * The nth byaj due date of a loan: the nth calendar anniversary of the loan date, clamped to month
 * end. n = 0 is the loan date itself. Exported because a reminder or collection screen needs to
 * name a due date without deriving a whole position.
 */
export function cycleAnniversary(loanDate: Date | string | number, n: number): Date {
  return addMonthsClamped(toDate(loanDate), Math.max(0, Math.floor(n) || 0))
}

export type LoanCycle = {
  /** 1-based. Cycle 1 runs from the loan date to the first anniversary. */
  no: number
  /** Cycle start — the anniversary it opens on (cycle 1 opens on the loan date). */
  from: Date
  /** Cycle end — the anniversary its interest falls due on. NEVER capped to asOf. */
  to: Date
  /** Interest charged inside this cycle. For the current cycle, charged so far (from → asOf). */
  interestCharged: number
  /**
   * Interest for the WHOLE cycle. Equals interestCharged for closed cycles; for the current cycle
   * it is the projection to `to` if nothing changes — what the customer is expected to hand over.
   */
  interestForCycle: number
  /**
   * Interest RECOVERED by payments dated inside this window (from, to], up to asOf. WINDOW-SCOPED:
   * because payments apply interest-first across the WHOLE loan, a receipt sitting in this window
   * may in fact be clearing an older cycle's arrears. Judge who is behind by overdueInterest, never
   * by comparing this against interestForCycle cycle by cycle.
   */
  interestPaid: number
  /** Principal recovered by payments dated inside this window, up to asOf. */
  principalPaid: number
  /** Outstanding principal at min(to, asOf). */
  principalAfter: number
  /** true once `to` <= asOf — this cycle's interest has fallen due. */
  due: boolean
  /** true when from <= asOf < to. At most one cycle is current. */
  current: boolean
}

export type LoanMonthlyPosition = {
  cycles: LoanCycle[]
  /** Most recent anniversary <= asOf. null while the loan is still inside its first month. */
  lastDueDate: Date | null
  /** The next anniversary strictly after asOf — when this month's byaj falls due. */
  nextDueDate: Date
  /**
   * Interest charged up to lastDueDate less interest recovered to asOf, floored at 0.
   * This is ARREARS: byaj that has fallen due and has not been paid.
   */
  overdueInterest: number
  /**
   * How many whole DUE cycles `overdueInterest` covers, counting back from the newest.
   * 0 = up to date. 3 = three months of byaj outstanding.
   */
  cyclesBehind: number
  /** Interest accrued in the current cycle so far (lastDueDate ?? loanDate → asOf). NOT yet due. */
  thisCycleInterest: number
  /**
   * Interest for the whole current cycle (lastDueDate ?? loanDate → nextDueDate), GROSS — before any
   * receipt. This is what the cycle COSTS, not what is left to collect: a part payment made inside
   * the cycle has already paid some of it. Never show this as an amount to collect; use thisCycleDue.
   */
  thisCycleProjected: number
  /**
   * BYAJ STILL DUE THIS CYCLE: what the customer must still hand over on nextDueDate for the current
   * cycle, net of interest already received, floored at 0. This is the figure to collect.
   *
   *      thisCycleDue = max(0, charged(nextDueDate) − max(charged(cycleStart), paidToDate))
   *
   * Receipts are loan-scoped and interest-first (rule 4), so they clear the arrears up to the cycle
   * start before any of them counts towards this cycle — which is exactly what max(charged(start),
   * paid) encodes. Therefore overdueInterest + thisCycleDue = charged(nextDueDate) − paidToDate:
   * the two never double-count, and with no receipt this equals thisCycleProjected.
   *
   * Worked (A101): ₹50,000 at 1.5%/mo from 09 Sep; ₹5,000 on 24 Oct clears ₹1,100 interest
   * (1 month + 14/30) and ₹3,900 principal. Cycle 09 Oct → 09 Nov costs ₹350.00 (09→24 Oct on
   * ₹50,000) + ₹368.80 (16/30 on ₹46,100) = ₹718.80 gross, but charged(09 Oct) = ₹750 < paid ₹1,100,
   * so still due = ₹1,468.80 − ₹1,100.00 = ₹368.80.
   */
  thisCycleDue: number
  /**
   * Interest accrued in the current cycle so far and NOT yet paid (cycle start → asOf), floored at 0.
   * Same netting as thisCycleDue, stopped at asOf. Ties to the release quote's accruedInterest
   * whenever the loan is not in arrears.
   */
  thisCycleUnpaid: number
  /** Interest recovered over the life of the loan — deriveLoan(asOf).paidInterest. */
  interestPaidToDate: number
  /** Date of the most recent receipt (not a topup, not a reversal, not the financier leg), or null. */
  lastPaymentDate: Date | null
}

/**
 * The monthly byaj position of one loan as at `asOf`. TOTAL: it never throws — an asOf before the
 * loan date, a zero-rate loan, no transactions at all, a loan already repaid in full and a nonsense
 * far-future date all return a well-formed position. This renders inside a table.
 *
 * Arrears are deliberately measured against the LAST DUE DATE, not against asOf: interest accruing
 * in the cycle the customer is currently in has not fallen due yet and must not be dunned for.
 */
export function deriveCycles(
  loan: LoanBasis,
  txns: LoanTxnLike[] = [],
  asOf: Date | string = new Date(),
  /** Which leg to replay. Callers never pass this; deriveTransferCycles() does. */
  stream: LoanStream = 'in',
): LoanMonthlyPosition {
  const start = toDate(loan.loanDate)
  const at = toDate(asOf)
  // One replay per distinct boundary date, kept by timestamp: a cycle's `to` is the next cycle's
  // `from`, so the walk costs about (cycles + 2) replays rather than two per cycle.
  const replays = new Map<number, LoanDerivation>()
  const on = (d: Date): LoanDerivation => {
    const k = d.getTime()
    let r = replays.get(k)
    if (!r) { r = deriveLoan(loan, txns, d, stream); replays.set(k, r) }
    return r
  }
  /** Interest CHARGED up to d — paid plus still unpaid. Unmoved by a receipt, so monotonic. */
  const charged = (d: Date) => on(d).paidInterest + on(d).accruedInterest
  /** min(d, asOf) — every "so far" figure stops at asOf; only `to` and the projection run past it. */
  const upTo = (d: Date) => (d.getTime() <= at.getTime() ? d : at)

  let dueCount = 0
  while (dueCount < CYCLE_GUARD && cycleAnniversary(start, dueCount + 1).getTime() <= at.getTime()) dueCount++

  const cycles: LoanCycle[] = []
  for (let n = 1; n <= dueCount + 1; n++) {
    const from = cycleAnniversary(start, n - 1)
    const to = cycleAnniversary(start, n)
    const a = upTo(from)
    const b = upTo(to)
    cycles.push({
      no: n,
      from,
      to,
      interestCharged: round2(charged(b) - charged(a)),
      // Taken to `to` even when `to` is in the future: for the current cycle that IS the projection.
      interestForCycle: round2(charged(to) - charged(from)),
      interestPaid: round2(on(b).paidInterest - on(a).paidInterest),
      principalPaid: round2(on(b).paidPrincipal - on(a).paidPrincipal),
      principalAfter: on(b).outstandingPrincipal,
      due: to.getTime() <= at.getTime(),
      current: from.getTime() <= at.getTime() && to.getTime() > at.getTime(),
    })
  }

  const lastDueDate = dueCount > 0 ? cycleAnniversary(start, dueCount) : null
  const paidToDate = on(at).paidInterest
  const overdueInterest = round2(Math.max(0, lastDueDate ? charged(lastDueDate) - paidToDate : 0))

  // Walk the DUE cycles newest-first, eating the arrears a whole cycle at a time. The epsilon keeps
  // half a paisa of rounding dust from reading as "1 month behind" on a loan that is square.
  const EPS = 0.005
  let remaining = overdueInterest
  let cyclesBehind = 0
  for (let i = dueCount - 1; i >= 0 && remaining > EPS; i--) {
    cyclesBehind++
    remaining -= cycles[i].interestForCycle
  }

  const current = cycles[cycles.length - 1]
  // Interest received beyond what had been charged by the cycle start is the part of the receipts
  // that belongs to THIS cycle (interest-first clears the older arrears before it). See thisCycleDue.
  const coveredAtStart = Math.max(charged(current.from), paidToDate)
  const thisCycleDue = round2(Math.max(0, charged(current.to) - coveredAtStart))
  const thisCycleUnpaid = round2(Math.max(0, charged(at) - coveredAtStart))
  const receipts = usableTxns(txns, at, stream).filter((t) => t.type !== 'topup')
  return {
    cycles,
    lastDueDate,
    nextDueDate: cycleAnniversary(start, dueCount + 1),
    overdueInterest,
    cyclesBehind,
    thisCycleInterest: current.interestCharged,
    thisCycleProjected: current.interestForCycle,
    thisCycleDue,
    thisCycleUnpaid,
    interestPaidToDate: paidToDate,
    lastPaymentDate: receipts.length ? toDate(receipts[receipts.length - 1].date) : null,
  }
}

/**
 * The financier leg's monthly position, or null when this pledge was never re-pledged.
 *
 * Exactly what deriveTransfer() is to deriveLoan(): the transfer* columns reshaped into a LoanBasis
 * and replayed with stream='out'. It exists so nobody reaches for `deriveCycles(loan, txns, asOf,
 * 'out')` on a raw Loan record -- that filters to the right rows but prices them off the CUSTOMER's
 * principalAmount / interestRate / loanDate, which is the engine-side stream filter's bug resurfacing
 * one layer up at the call site.
 */
export function deriveTransferCycles(
  loan: TransferBasis,
  txns: LoanTxnLike[] = [],
  asOf: Date | string = new Date(),
): LoanMonthlyPosition | null {
  if (!loan.transferDate || !loan.transferPrincipal) return null
  return deriveCycles(
    {
      principalAmount: loan.transferPrincipal,
      interestRate: loan.transferRate,
      loanDate: loan.transferDate,
      interestConvention: loan.transferConvention,
    },
    txns,
    asOf,
    'out',
  )
}
