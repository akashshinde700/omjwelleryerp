// Girvi interest — ported from src/lib/interest.ts (the web/server source of truth).
// Metro's default config only serves files inside mobile/, so this is a faithful port rather than
// a shared import — keep it in sync by hand if src/lib/interest.ts changes. See that file for the
// full rationale; the convention is summarised below.
//
// tests/unit/interest-parity.test.ts imports BOTH copies and asserts they agree to the paise across
// every convention, part-month boundary, slab step and compounding rest. If you edit one file and
// not the other, that test goes red before a topped-up loan shows a reduced balance on a phone.
//
// 1. SIMPLE interest, per month, on the OUTSTANDING principal: interest = P × rate% × months.
// 2. Part months are pro-rata by days, CALENDAR-ANCHORED:
//      months = completeCalendarMonths(from, to) + remainderDays / 30
//    NOT totalDays/30 — that under/over-charges depending which months the loan spans.
// 3. NO MINIMUM INTEREST PERIOD.
// 4. A part payment applies to interest FIRST, then principal.
// 5. A 'topup' transaction (additional principal on a live girvi) RAISES the principal from its
//    own date: segments before it stay priced at the old principal. It is an advance, not a
//    receipt, so it clears no interest and is not part of totalPaid.
// 6. An 'auction' transaction carries the cash recovery as `amount` and the written-off remainder
//    as `discount`, which together clear the whole dues — no special case is needed here.
// 7. The outstanding is never stored — deriveLoan() replays the transaction history every time.
//
// 1–7 above are the DEFAULT convention and still price every loan that carries none. A loan written
// under another one carries it as JSON on Loan.interestConvention, and is priced by THAT for life:
// a firm that changes its policy never re-prices a live pledge. See INTEREST CONVENTION below.

const MS_PER_DAY = 24 * 60 * 60 * 1000

function toDate(d: Date | string | number): Date {
  return d instanceof Date ? d : new Date(d)
}

/** Money rounded half-up to paise. */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0
  const EPS = 1e-8
  const sign = n < 0 ? -1 : 1
  const abs = Math.abs(n)
  return (sign * Math.round((abs + EPS) * 100)) / 100
}

/**
 * `from` plus n calendar months, clamped to the end of the target month (31 Jan + 1mo = 28 Feb).
 * Calendar arithmetic is done in UTC so the answer does not shift with the device timezone.
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
 * Calendar-anchored pro-rata months between two instants: complete calendar months + whole
 * remainder days / 30. Never negative.
 */
export function monthsBetween(from: Date | string | number, to: Date | string | number): number {
  const a = toDate(from)
  const b = toDate(to)
  if (!(b.getTime() > a.getTime())) return 0
  let whole = 0
  while (addMonthsClamped(a, whole + 1).getTime() <= b.getTime()) whole++
  const anniversary = addMonthsClamped(a, whole)
  const remainderDays = Math.floor((b.getTime() - anniversary.getTime()) / MS_PER_DAY)
  return whole + remainderDays / 30
}

/** Simple interest for a period already expressed in (fractional) months. Unrounded. */
export function simpleInterest(principal: number, monthlyRatePct: number, months: number): number {
  return (principal * monthlyRatePct * months) / 100
}

export function describeMonths(months: number): string {
  const whole = Math.floor(months + 1e-9)
  const days = Math.round((months - whole) * 30)
  return `${whole} month${whole === 1 ? '' : 's'} + ${days}/30 days = ${months.toFixed(4)}`
}

// ── INTEREST CONVENTION ───────────────────────────────────────────────────────────────────────
// dayBasis  calendar (default) = anniversary months + leftover days · days30 = every month 30 days
// rounding  exact (default) = leftover/30 · full = round up · half = 1–15d half, 16–30d whole ·
//           weekly = whole 7-day weeks, capped at a month
// compound  false (default) · restMonths = the rest period when true
// slab      null (default) · steps that ADD to the rate CUMULATIVELY as the loan ages, + recurring
// rateBasis monthly (default) · annual divides the stored rate by 12 at the point of use
// firstMonthFull / graceDays  first segment only; grace is a waiver window and beats firstMonthFull
// Full rationale, the oMunim mapping and what was deliberately NOT ported: src/lib/interest.ts.

export type DayBasis = 'calendar' | 'days30'
export type MonthRounding = 'exact' | 'full' | 'half' | 'weekly'
export type RateBasis = 'monthly' | 'annual'
export type RoiStep = { afterMonths: number; increaseBy: number }
export type RoiSlab = { steps: RoiStep[]; recurring: boolean }

export type InterestConvention = {
  dayBasis: DayBasis
  rounding: MonthRounding
  compound: boolean
  restMonths: number
  rateBasis: RateBasis
  firstMonthFull: boolean
  graceDays: number
  slab: RoiSlab | null
}

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

/** Total: never throws, never partial. One unreadable field falls back alone. */
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

function daysElapsed(a: Date, b: Date): number {
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / MS_PER_DAY))
}

function rawTerm(from: Date, to: Date, dayBasis: DayBasis): { whole: number; remDays: number } {
  if (dayBasis === 'days30') {
    const d = daysElapsed(from, to)
    return { whole: Math.floor(d / 30), remDays: d % 30 }
  }
  let whole = 0
  while (addMonthsClamped(from, whole + 1).getTime() <= to.getTime()) whole++
  return { whole, remDays: daysElapsed(addMonthsClamped(from, whole), to) }
}

/** The chargeable term in months. `fromDisbursal` gates graceDays and firstMonthFull. */
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
      months = whole + Math.min(Math.ceil(remDays / 7) * 7, 30) / 30
      break
    default:
      months = whole + remDays / 30
  }
  if (fromDisbursal && conv.firstMonthFull && months > 0) months = Math.max(months, 1)
  return months
}

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

function perMonthRate(rate: number, conv: InterestConvention): number {
  return conv.rateBasis === 'annual' ? rate / 12 : rate
}

export function effectiveRate(rate: number, conv: InterestConvention, ageMonths: number): number {
  return rateAtAge(perMonthRate(rate, conv), conv.slab, ageMonths)
}

function boundaries(conv: InterestConvention, a0: number, a1: number): { pts: number[]; rests: Set<number> } {
  const pts: number[] = []
  const rests = new Set<number>()
  const GUARD = 2000
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

/** Interest for ONE segment of `months`, starting at loan age `ageMonths`. Unrounded. */
export function accrueSegment(
  principal: number,
  rate: number,
  conv: InterestConvention,
  ageMonths: number,
  months: number,
): number {
  if (months <= 0 || principal <= 0) return 0
  const base = perMonthRate(rate, conv)
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
  /** The convention that PRICED this loan (JSON off the API). Null/absent = the default. */
  interestConvention?: InterestConvention | string | null
}

export type LoanTxnLike = {
  id?: string | null
  date: Date | string
  /** 'topup' ADDS `amount` to the principal from `date`. Anything else is a receipt. */
  type?: string | null
  /** Cash actually received — or, for a topup, cash advanced. */
  amount: number
  /** Value forgiven — applied to the dues alongside the cash, but never received. */
  discount?: number | null
  /** A reversal cancels both itself and the row it reverses. */
  reversalOfId?: string | null
  /** 'in' (default) = the customer's leg. 'out' = our borrowing from the financier. */
  stream?: string | null
}

/** The two sides of a re-pledged pledge. 'in' = the customer owes us. 'out' = we owe the financier. */
export type LoanStream = 'in' | 'out'

/** The rows of one leg. No `stream` means 'in' - every row written before re-pledging existed. */
export function ofStream<T extends LoanTxnLike>(txns: T[], stream: LoanStream = 'in'): T[] {
  return txns.filter((t) => (t.stream || 'in') === stream)
}

export type LoanDerivation = {
  outstandingPrincipal: number
  accruedInterest: number
  totalDue: number
  totalPaid: number
  paidInterest: number
  paidPrincipal: number
  totalDiscount: number
  totalTopUp: number
  principalAdvanced: number
  monthsSinceLastEvent: number
  monthsElapsed: number
  interestFrom: Date
  convention: InterestConvention
  effectiveRatePct: number
}

function usableTxns<T extends LoanTxnLike>(txns: T[], asOf: Date, stream: LoanStream = 'in'): T[] {
  const same = ofStream(txns, stream)
  const reversed = new Set(same.map((t) => t.reversalOfId).filter(Boolean) as string[])
  return same
    .filter((t) => !t.reversalOfId && !(t.id && reversed.has(t.id)))
    .filter((t) => toDate(t.date).getTime() <= asOf.getTime())
    .sort((x, y) => toDate(x.date).getTime() - toDate(y.date).getTime())
}

/**
 * Replays a loan's payments in date order and returns its position as at `asOf`. Each payment
 * closes a segment: interest accrues on the principal that stood during that segment under the
 * loan's own convention, the payment clears the accrued interest first and whatever is left
 * reduces the principal.
 */
export function deriveLoan(
  loan: LoanBasis,
  txns: LoanTxnLike[] = [],
  asOf: Date | string = new Date(),
  stream: LoanStream = 'in',
): LoanDerivation {
  const at = toDate(asOf)
  const rate = loan.interestRate || 0
  const conv = resolveConvention(loan.interestConvention)
  const start = toDate(loan.loanDate)
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
    unpaidInterest += accrueSegment(principal, rate, conv, ageAt(cursor), conventionMonths(cursor, on, conv, cursor.getTime() === start.getTime()))
    // CLAMP TO THE LOAN DATE — mirrors src/lib/interest.ts. A row dated BEFORE disbursal (a mis-keyed
    // date, or a receipt against a pledge whose loanDate was corrected later) must not drag the
    // interest clock behind the day the money went out: every later segment would then be measured
    // from an anchor that predates the loan and charge phantom months. The row is KEPT — the cash was
    // received, so it still clears interest and reduces principal; only the clock is pinned. The
    // cursor lands exactly on `start`, so the next segment's fromDisbursal flag stays true and
    // graceDays / firstMonthFull still apply from the loan date.
    cursor = on.getTime() < start.getTime() ? start : on
    // Additional principal: the balance rises from THIS date, and later segments accrue on it.
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
 * The financier leg of a re-pledged pledge (web: deriveTransfer). The shop borrows against gold a
 * customer pledged to it: the customer's loan stays our asset and the borrowing is a liability
 * beside it. Two streams, two rates, one set of ornaments, never netted. Priced by the SAME engine
 * off the loan's transfer* columns - the phone must not invent a second formula either.
 */
export type TransferBasis = {
  transferDate?: Date | string | null
  transferPrincipal?: number | null
  transferRate?: number | null
  transferConvention?: InterestConvention | string | null
}

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
  customer: LoanDerivation
  financier: LoanDerivation | null
  interestEarned: number
  interestOwed: number
  spread: number
  ownFunds: number
}

/** Both legs and the margin between them. Deliberately not netted. */
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

/** Splits one payment interest-first. Both components round to paise and sum back to `applied`. */
export function splitPayment(applied: number, accruedInterest: number) {
  const interestComponent = round2(Math.min(round2(applied), accruedInterest))
  return { interestComponent, principalComponent: round2(round2(applied) - interestComponent) }
}
