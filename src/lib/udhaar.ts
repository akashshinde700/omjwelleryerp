import { round2 } from './gst'
import { roundWeight } from './stock-calc'
import {
  accrueSegment,
  conventionMonths,
  deriveLoan,
  resolveConvention,
  type InterestConvention,
  type LoanBasis,
  type LoanDerivation,
  type LoanTxnLike,
} from './interest'

/**
 * Udhaar sign convention — the single source of truth. Every receivable figure
 * (dashboard, customer panel, udhaar screen) routes through here.
 *
 *   +1  credit  — money LEFT the firm (credit given to the party) → receivable
 *   -1  debit   — money CAME BACK (received from the party)       → reduces the receivable
 *    0  advance — direction is not established anywhere in this codebase: the schema
 *                 comment, the udhaar route, the "Advance Money" tab and the seed data all
 *                 leave it unqualified, and an advance can be money taken from a customer
 *                 against an order OR money paid out to a karigar. Summing it into a
 *                 direction would be a guess, so it is excluded from the net and reported
 *                 separately (udhaarAdvance). Give it a real direction only once the UI
 *                 forces the user to state one.
 *
 * Net outstanding = Σ sign(type) × (amount − settledAmount) over rows that are not settled.
 * Worked example: credit ₹80,000 + debit ₹30,000, nothing settled → +80000 − 30000 = ₹50,000.
 * With ₹5,000 already settled against the credit → +75000 − 30000 = ₹45,000.
 *
 * ────────────────── METAL UDHAAR ("you owe me 10 grams") ──────────────────
 * A row with `metal` set to 'gold' or 'silver' is a debt in GRAMS, not rupees. It uses the SAME
 * direction function — credit = the metal LEFT the firm (a receivable in grams), debit = it came
 * back — and the same "unsettled = grams − settledGrams" rule, only in a different unit. A row is
 * money OR metal, never both: a metal row carries amount 0 and a money row carries grams 0, because
 * a single column holding two units is exactly the dispute this convention exists to prevent.
 *
 * Grams are the physical thing a shop weighs, so metal totals ARE rounded to 3dp (unlike a scheme's
 * accumulated claim, which is a computed ratio — see src/lib/scheme.ts).
 *
 * A metal row is deliberately NOT posted to the ledger. See the header of
 * src/app/api/udhaar/route.ts for the reasoning.
 */
export function udhaarSign(type: string | null | undefined): 1 | -1 | 0 {
  return type === 'credit' ? 1 : type === 'debit' ? -1 : 0
}

export type UdhaarRow = {
  type: string | null
  amount: number | null
  settledAmount?: number | null
  status?: string | null
  /** null/undefined = a money row. 'gold' | 'silver' = the debt is in grams. */
  metal?: string | null
  grams?: number | null
  settledGrams?: number | null
}

/** Unsettled amount of one row (or of one groupBy bucket). Never negative. */
export function udhaarDue(r: UdhaarRow): number {
  return Math.max(0, (r.amount || 0) - (r.settledAmount || 0))
}

/** The metal a row is denominated in, or null when it is an ordinary money row. */
export function udhaarMetal(metal: string | null | undefined): 'gold' | 'silver' | null {
  return metal === 'gold' || metal === 'silver' ? metal : null
}

/** Unsettled GRAMS of one metal row. Never negative. */
export function udhaarGramsDue(r: UdhaarRow): number {
  return Math.max(0, (r.grams || 0) - (r.settledGrams || 0))
}

/**
 * Directional totals over a set of rows — or over `groupBy({ by: ['type'] })` buckets
 * mapped to `{ type, amount: _sum.amount, settledAmount: _sum.settledAmount }`.
 * Rows with status 'settled' contribute nothing. Rounded half-up once, at the end.
 */
export function udhaarBreakdown(rows: UdhaarRow[]) {
  let toReceive = 0
  let toPay = 0
  let advance = 0
  // Net grams receivable per metal: +ve = the party owes the firm, -ve = the firm owes the party.
  const metals = { gold: 0, silver: 0 }
  for (const r of rows) {
    if (r.status === 'settled') continue
    const sign = udhaarSign(r.type)
    const metal = udhaarMetal(r.metal)
    if (metal) {
      // A metal row's rupee columns are 0 by construction; summing it into the money totals would
      // be a no-op today and a silent lie the day someone writes a rate into `amount`.
      metals[metal] += sign * udhaarGramsDue(r)
      continue
    }
    const due = udhaarDue(r)
    if (sign === 1) toReceive += due
    else if (sign === -1) toPay += due
    else advance += due
  }
  return {
    toReceive: round2(toReceive),
    toPay: round2(toPay),
    advance: round2(advance),
    net: round2(toReceive - toPay),
    /** Grams, 3dp. NOT valued in rupees and NOT in the ledger — see the header. */
    metal: { gold: roundWeight(metals.gold, 3), silver: roundWeight(metals.silver, 3) },
  }
}

/**
 * ───────────────── UDHAAR INTEREST AND INSTALLMENTS (Task 87) ─────────────────
 *
 * An udhaar can now carry a rate of interest. It is priced by THE SAME ENGINE that prices a girvi
 * pledge — src/lib/interest.ts — and by nothing else. There is no second formula in this file:
 * every rupee below comes out of deriveLoan() / accrueSegment() / conventionMonths(). oMunim runs
 * two engines and prices one pledge at ₹44,488 on its list and ₹14,829 on its detail screen, same
 * loan, same minute; one engine is the whole defence against that.
 *
 * WHAT BEARS INTEREST — bearsInterest() says no to everything else:
 *   · interestRate > 0, and
 *   · a MONEY row (metal null) — a metal udhaar is a debt in GRAMS and has no rupee principal to
 *     charge a rate on, and
 *   · type 'credit' — money the firm LENT OUT. A debit is money that came back and an advance has
 *     no established direction (see the header at the top of this file); neither is a lending.
 * Anything else is null, which is every udhaar row written before this migration — and a null row
 * reads back today EXACTLY as it always has. udhaarSign / udhaarDue / udhaarBreakdown are untouched.
 *
 * RATE MAPPING — the engine speaks %/month (or %/annum via the convention's rateBasis: 'annual'):
 *   'monthly'    rate as-is, rateBasis 'monthly'.
 *   'annually'   rate as-is, rateBasis 'annual' — the engine divides by 12 ONCE, at the point of use.
 *   'days'       rate is %/DAY. Passed as (rate × 30) %/month with dayBasis 'days30' and rounding
 *                'exact'. The algebra: days30 + exact makes months = days / 30, so
 *                    interest = P × (r × 30)% × (days / 30) = P × r% × days
 *                — exactly per-day, through the existing engine, with no new arithmetic. It is
 *                ELAPSED days (daysElapsed in interest.ts), so a loan taken and repaid the same day
 *                costs nothing and a 30-day loan costs 30 days, never 31 — oMunim counts both ends
 *                and charges one extra day of interest on every loan it writes (defect 2).
 *   anything else (a row predating the enum) is read as 'monthly', the commonest quote. POST
 *   /api/udhaar makes interestType mandatory whenever a rate is set, so a row written through the
 *   API can never reach that branch.
 *
 * interestEndDate CAPS THE CLOCK: asOf = min(asOf, interestEndDate), and nothing accrues past it.
 * A receipt dated AFTER that cap is NOT dropped — the cash was really received — it is replayed AT
 * the cap, the same pinning deriveLoan() already applies to a receipt dated before disbursal (see
 * its CLAMP TO THE LOAN DATE note). Dropping it would keep money the shop is holding on the
 * customer's balance forever.
 *
 * THE SCHEDULE IS THE PLAN. THE AUTHORITATIVE AMOUNT OWED TODAY IS deriveUdhaar().
 * udhaarSchedule() is a pure function of the FROZEN TERMS — principal, rate, convention, interval,
 * occurrences — and never of WHEN the money actually arrived. Payments only decide how much of the
 * plan is ticked off. That is deliberate: a part payment must never retroactively re-price a period
 * that was already settled (oMunim defect 7), and nothing here rewrites the row's date or principal
 * on payment (oMunim's UPDATED LOAN DATE / UPDATED PRINCIPAL AMOUNT, the direct cause of it).
 * A customer who pays late owes MORE than the plan says; both figures are shown, and the payment
 * flow always quotes the derived one.
 */

/**
 * The intervals the UI offers. Days, not "months", because the engine measures a plan in days and a
 * fortnight has no calendar name — 30 is a month's worth, not a calendar month. Any other positive
 * integer is legal on the column; these are just the three a shop actually asks for.
 */
export const EMI_INTERVALS = { week: 7, fortnight: 15, month: 30 } as const

/** An Udhaar row with its interest terms. Every added field is optional: a pre-Task-87 row is one. */
export type UdhaarInterestRow = UdhaarRow & {
  id?: string
  createdAt?: Date | string | null
  interestRate?: number | null
  interestType?: string | null
  interestStartDate?: Date | string | null
  interestEndDate?: Date | string | null
  interestConvention?: string | InterestConvention | null
  emiIntervalDays?: number | null
  emiOccurrences?: number | null
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
/** Bounds the schedule walk. Matches the cap POST /api/udhaar enforces on emiOccurrences. */
const SCHEDULE_GUARD = 600

/** A usable Date, or null — a blank, a null and an unparseable string all answer null. */
function asDate(v: Date | string | null | undefined): Date | null {
  if (v == null || v === '') return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

const addDays = (from: Date, days: number) => new Date(from.getTime() + days * MS_PER_DAY)

/** True when this row bears interest: a MONEY (non-metal) `credit` row with interestRate > 0. */
export function bearsInterest(u: UdhaarInterestRow): boolean {
  return !!u.interestRate && u.interestRate > 0 && !udhaarMetal(u.metal) && u.type === 'credit'
}

/**
 * The date interest runs from: interestStartDate, else the day the row was written.
 * NEVER the epoch. A missing anchor falls back to NOW, which accrues nothing, rather than to
 * new Date(null) = 1970, which would charge a customer fifty years of byaj on his first screen.
 */
export function udhaarInterestFrom(u: UdhaarInterestRow): Date {
  return asDate(u.interestStartDate) ?? asDate(u.createdAt) ?? new Date()
}

/**
 * The row reshaped as a LoanBasis — THE single rate mapping, and the only place any of it lives.
 * The list, the detail screen, the schedule and the payments route all price through this one
 * function with the same inputs, so they cannot disagree.
 *
 * A row that bears no interest is still a valid basis, at rate 0: an interest-free udhaar is just a
 * loan at 0%, and routing it through the same engine means the payments route needs no second path.
 * That is also where decisions 3 and 4 bite — a metal row and a debit/advance come back at rate 0,
 * so no caller can accidentally charge one.
 */
export function udhaarLoanBasis(u: UdhaarInterestRow): LoanBasis {
  const conv = resolveConvention(u.interestConvention ?? null)
  const principalAmount = u.amount || 0
  const loanDate = udhaarInterestFrom(u)
  if (!bearsInterest(u)) return { principalAmount, interestRate: 0, loanDate, interestConvention: conv }
  const rate = u.interestRate as number
  if (u.interestType === 'days') {
    // days30 + exact ⇒ months = days/30, so P × (r×30)% × days/30 = P × r% × days, exactly per day.
    return {
      principalAmount,
      interestRate: rate * 30,
      loanDate,
      interestConvention: { ...conv, rateBasis: 'monthly', dayBasis: 'days30', rounding: 'exact' },
    }
  }
  return {
    principalAmount,
    interestRate: rate,
    loanDate,
    interestConvention: { ...conv, rateBasis: u.interestType === 'annually' ? 'annual' : 'monthly' },
  }
}

/**
 * The AUTHORITATIVE amount owed as at `asOf`: deriveLoan() replayed over this row's receipts.
 *
 * interestEndDate is honoured with ONE engine call and no second formula. Nothing accrues after the
 * end date, so a receipt dated later prices identically AT the end date:
 *   · receipts after `asOf` are dropped — they have not happened yet as far as this quote goes;
 *   · a receipt between the cap and `asOf` has its DATE clamped down to the cap. With zero accrual
 *     after the cap only the ORDER of receipts can move a figure, and clamping preserves order, so
 *     no rupee moves. The row is never dropped — the cash was really received and must still clear
 *     the debt, the same reasoning deriveLoan() applies when it pins a pre-disbursal receipt.
 */
export function deriveUdhaar(
  u: UdhaarInterestRow,
  payments: LoanTxnLike[] = [],
  asOf: Date | string = new Date(),
): LoanDerivation {
  const at = asDate(asOf) ?? new Date()
  const end = asDate(u.interestEndDate)
  const cap = end && end.getTime() < at.getTime() ? end : at
  const clamped = payments
    .filter((p) => {
      const on = asDate(p.date)
      return !on || on.getTime() <= at.getTime()
    })
    .map((p) => {
      const on = asDate(p.date)
      return on && on.getTime() > cap.getTime() ? { ...p, date: cap } : p
    })
  return deriveLoan(udhaarLoanBasis(u), clamped, cap)
}

export type UdhaarInstallment = {
  no: number
  /** The period this installment covers: (from, due]. Row 1 opens on the interest start date. */
  from: Date
  due: Date
  /** The PLAN for this period. principal + interest = amount, each rounded once, here. */
  principal: number
  interest: number
  amount: number
  /** Cash allocated to this row by the waterfall, up to `asOf`. */
  paid: number
  /** The date the receipt that COMPLETED this row arrived. Null until it is fully covered. */
  paidDate: Date | null
  status: 'paid' | 'partial' | 'overdue' | 'due' | 'upcoming'
}

/**
 * The PLAN. [] when this udhaar has no installment plan.
 *
 * from / due / principal / interest / amount are a pure function of the FROZEN TERMS and NEVER of
 * payment timing — only `paid`, `paidDate` and `status` read the receipts. A customer
 * who pays late owes more than the plan says; deriveUdhaar() is what he is quoted, and the plan is
 * left alone so a part payment cannot retroactively re-price a period already settled.
 *
 * PAYING AHEAD IS ALLOWED. Receipts fill the installments in strict order and an overpayment flows
 * into the next one; there is deliberately no "pay the previous EMI first" block.
 */
export function udhaarSchedule(
  u: UdhaarInterestRow,
  payments: LoanTxnLike[] = [],
  asOf: Date | string = new Date(),
): UdhaarInstallment[] {
  const n = Math.min(Math.floor(u.emiOccurrences || 0), SCHEDULE_GUARD)
  const k = Math.floor(u.emiIntervalDays || 0)
  // A plan is priced off a rate: no interest, no plan. POST /api/udhaar refuses the combination, so
  // this only ever fires on hand-written data - and it keeps the list (udhaarSummary, gated on
  // bearsInterest) and the detail screen saying the same thing about the same row.
  if (!(n > 0) || !(k > 0) || !bearsInterest(u)) return []
  const basis = udhaarLoanBasis(u)
  // The anchor is read STRICTLY here, not through udhaarInterestFrom(): a row with neither a start
  // date nor a createdAt has no plan at all. Falling back to NOW would be safe for the accrual (it
  // charges nothing) but it would date every row from the moment of the render, so the same plan
  // would come back different on every refresh - a plan that moves is no better than a 1970 one.
  const start = asDate(u.interestStartDate) ?? asDate(u.createdAt)
  if (!start) return []
  const at = asDate(asOf) ?? new Date()

  const conv = resolveConvention(basis.interestConvention ?? null)
  const rate = basis.interestRate || 0
  const total = round2(basis.principalAmount || 0)
  const per = round2(total / n)
  /**
   * Cash received up to `d`, taken from the ENGINE's own replay (deriveLoan.totalPaid) so a reversal
   * is cancelled by exactly the rule the engine uses, never by a filter written a second time here.
   */
  const cashAt = (d: Date) => deriveUdhaar(u, payments, d).totalPaid
  const received = cashAt(at)
  // One point per distinct receipt date, ascending. Used ONLY to name the date a row was completed;
  // no figure is computed from it.
  const points = Array.from(
    new Set(payments.map((p) => asDate(p.date)?.getTime()).filter((t): t is number => t != null && t <= at.getTime())),
  )
    .sort((a, b) => a - b)
    .map((t) => ({ date: new Date(t), cash: cashAt(new Date(t)) }))

  const EPS = 0.005
  const rows: UdhaarInstallment[] = []
  let cumulative = 0 // plan amount required through the PREVIOUS row
  for (let i = 1; i <= n; i++) {
    const from = addDays(start, (i - 1) * k)
    const due = addDays(start, i * k)
    // The LAST row takes the remainder, so the principal column sums to `amount` EXACTLY.
    const principal = i < n ? per : round2(total - per * (n - 1))
    // The SCHEDULED reducing balance — the plan's own balance, not the real one.
    const balanceAtFrom = total - per * (i - 1)
    // `ageMonths` is the loan's own age when the period opens — the coordinate an ROI slab step and
    // a compounding rest hang off. Measured exactly as deriveLoan's ageAt() measures it.
    const age = conventionMonths(start, from, { ...conv, rounding: 'exact', firstMonthFull: false, graceDays: 0 })
    // fromDisbursal on row 1 only: graceDays and firstMonthFull are properties of the disbursal, and
    // deriveLoan applies them to the first segment alone. Same rule, same engine call.
    const interest = round2(accrueSegment(balanceAtFrom, rate, conv, age, conventionMonths(from, due, conv, i === 1)))
    const amount = round2(principal + interest)
    const paid = Math.min(Math.max(round2(received - cumulative), 0), amount)
    cumulative = round2(cumulative + amount)
    const settled = amount > 0 && paid >= amount - EPS
    rows.push({
      no: i,
      from,
      due,
      principal,
      interest,
      amount,
      paid,
      // The first receipt at which the cumulative cash covered everything through this row.
      paidDate: settled ? (points.find((pt) => pt.cash >= cumulative - EPS)?.date ?? null) : null,
      status: settled
        ? 'paid'
        : paid > 0
          ? 'partial'
          : // PAST its due date and nothing against it - this is the row a collection screen chases.
            due.getTime() < at.getTime()
            ? 'overdue'
            : from.getTime() <= at.getTime()
              ? 'due'
              : 'upcoming',
    })
  }
  return rows
}

export type UdhaarSummary = {
  /** Interest accrued and unpaid as at `asOf`. */
  interest: number | null
  /** Principal still outstanding. */
  leftAmount: number | null
  /** What closing the udhaar costs today: principal + accrued interest. */
  leftWithInterest: number | null
  /** Cash received over the life of the row. */
  paidSoFar: number | null
  /** ISO date of the next unpaid installment, else the row's own dueDate. */
  nextDueDate: string | null
  emiTotal: number | null
  emiPaid: number | null
}

const NO_INTEREST: UdhaarSummary = {
  interest: null,
  leftAmount: null,
  leftWithInterest: null,
  paidSoFar: null,
  nextDueDate: null,
  emiTotal: null,
  emiPaid: null,
}

/**
 * The flat figures a LIST row shows. Built out of deriveUdhaar() and udhaarSchedule() and nothing
 * else, so the list and the detail screen cannot price one row two ways (oMunim defect 5).
 * Every field is null on a row that bears no interest — which is every existing row, and the
 * invariant that lets this ship: such a row reads back exactly as it did before.
 */
export function udhaarSummary(
  u: UdhaarInterestRow & { dueDate?: Date | string | null },
  payments: LoanTxnLike[] = [],
  asOf: Date | string = new Date(),
): UdhaarSummary {
  // Gated on bearsInterest, not on a null basis: deriveUdhaar() now prices an interest-free row too
  // (at 0%), and a list row that never had interest must keep reading back as all-nulls.
  if (!bearsInterest(u)) return NO_INTEREST
  const derived = deriveUdhaar(u, payments, asOf)
  const schedule = udhaarSchedule(u, payments, asOf)
  const nextRow = schedule.find((r) => r.status !== 'paid')
  return {
    interest: derived.accruedInterest,
    leftAmount: derived.outstandingPrincipal,
    leftWithInterest: derived.totalDue,
    paidSoFar: derived.totalPaid,
    nextDueDate: (nextRow?.due ?? asDate(u.dueDate ?? null))?.toISOString() ?? null,
    emiTotal: schedule.length || null,
    emiPaid: schedule.length ? schedule.filter((r) => r.status === 'paid').length : null,
  }
}
