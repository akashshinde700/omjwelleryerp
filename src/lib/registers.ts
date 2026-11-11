import { round2 } from './gst'
import { maskLast4 } from './pii'
import { deriveLoan, isUnrecordedClosure, ofStream, type LoanTxnLike } from './interest'

/**
 * ── THE MONEY LENDERS ACT REGISTERS ───────────────────────────────────────────────────────────
 *
 * Namuna No. 9  — the loan register an inspector opens first. One row per loan account, showing
 *                 what went out, what came back and what still stands, as at the end of the window.
 * Namuna No. 15 — the annual return. One numbered block per CUSTOMER (not per loan): a customer
 *                 with three girvis files one line, with the three added together.
 *
 * Every figure here is replayed from LoanTransaction through src/lib/interest.ts deriveLoan().
 * Nothing in this file re-derives interest, invents a rate or reads a stored balance. The
 * conventions are settled and are NOT restated here — see the header of src/lib/interest.ts:
 * simple, per month, calendar-anchored pro-rata part months, no minimum period, payments
 * interest-first.
 *
 * ── TWO oMUNIM DEFECTS THIS FILE EXISTS TO NOT REPRODUCE ──────────────────────────────────────
 *
 * 1. oMunim's Namuna 15 prints NEGATIVE accrued interest (-16,371.27, for the opening AND the
 *    closing column) on a statutory return filed with the Registrar. Accrued interest is a
 *    quantity that cannot be negative: the customer either owes interest or owes none. Every
 *    subtraction in this file goes through nonNegative(), which clamps to 0 AND records a warning
 *    naming the row. A negative is SURFACED, never printed — a return is not the place to discover
 *    an arithmetic bug.
 *
 * 2. oMunim's loan screen SHOWS ₹14,829 and CHARGES ₹14,829.26 — the display truncates while the
 *    stored total carries the paise. Every number this module hands out is round2()'d exactly
 *    once, at the end of its own chain, and is the same number the release quote charges. The
 *    consumer prints what it is given and must not re-round or truncate.
 */

// ───────────────────────── shared input shapes ─────────────────────────

/** The Customer columns the registers read. Mirrors REGISTER_CUSTOMER_SELECT below. */
export type RegisterCustomer = {
  id?: string
  code?: string | null
  firstName?: string | null
  lastName?: string | null
  caste?: string | null
  aadhaar?: string | null
  fatherSpouse?: string | null
  fatherSpouseRel?: string | null
  mobile?: string | null
  phone?: string | null
  occupation?: string | null
  village?: string | null
  city?: string | null
  wardNo?: string | null
  tehsil?: string | null
  state?: string | null
  pincode?: string | null
  address?: string | null
  otherInfo?: string | null
}

export type RegisterLoanItem = {
  name: string
  purity?: string | null
  grossWeight?: number | null
  netWeight?: number | null
  estimatedValue?: number | null
}

export type RegisterTxn = LoanTxnLike & {
  paymentMode?: string | null
  note?: string | null
}

export type RegisterLoan = {
  id: string
  loanNo: string
  loanDate: Date | string
  dueDate?: Date | string | null
  releasedDate?: Date | string | null
  principalAmount: number
  interestRate?: number | null
  status?: string | null
  loanType?: string | null
  wardNo?: string | null
  village?: string | null
  city?: string | null
  note?: string | null
  pledgePlace?: string | null
  exFirmId?: string | null
  trFirmId?: string | null
  mlFirmId?: string | null
  items?: RegisterLoanItem[] | null
  transactions?: RegisterTxn[] | null
  customer?: RegisterCustomer | null
}

/**
 * Prisma `select` for the customer half of a register row. CASTE, ADHAAR NO., FATHER NAME, PHONE
 * NO and TALUKA are register columns that were ALREADY in the schema — on Customer, not on Loan —
 * and simply were never joined, which is why the loan list could neither show nor filter them.
 * They are JOINED, not copied: a copy on Loan would go stale the moment the customer's record is
 * corrected, and a register that disagrees with the KYC file is worse than one with a blank in it.
 */
export const REGISTER_CUSTOMER_SELECT = {
  id: true, code: true, firstName: true, lastName: true,
  caste: true, aadhaar: true, fatherSpouse: true, fatherSpouseRel: true,
  mobile: true, phone: true, occupation: true,
  village: true, city: true, wardNo: true, tehsil: true, state: true, pincode: true,
  address: true, otherInfo: true,
} as const

// ───────────────────────── guards ─────────────────────────

export type RegisterWarning = { code: string; ref: string; message: string }

/**
 * Defect 1, in one place. A statutory money quantity that has come out below zero is an arithmetic
 * fault, not a figure: clamp it to 0 and shout. Callers pass the row it belongs to, so the warning
 * names something the operator can go and look at.
 */
export function nonNegative(value: number, ref: string, label: string, warnings: RegisterWarning[]): number {
  if (value < -0.005) {
    warnings.push({
      code: 'negative_amount',
      ref,
      message: `${label} came out as ${round2(value)} — a statutory register cannot report a negative ${label.toLowerCase()}. Reported as 0; investigate back-dated payments or reversals on ${ref}.`,
    })
    return 0
  }
  return round2(Math.max(0, value))
}

const asDate = (d: Date | string) => (d instanceof Date ? d : new Date(d))
const fullName = (c?: RegisterCustomer | null) => [c?.firstName, c?.lastName].filter(Boolean).join(' ').trim()

/**
 * Live (non-reversed, non-topup) CUSTOMER receipts inside [from, to].
 *
 * ofStream() is not decoration: once a pledge can be re-pledged to a financier, the same loan
 * carries our payments OUT to that lender as well. Money we paid a money lender is not a receipt
 * from the pledgor and must never appear in the statutory register as one.
 */
function receiptsIn(loan: RegisterLoan, from: Date, to: Date): RegisterTxn[] {
  const txns = ofStream(loan.transactions ?? [])
  const reversed = new Set(txns.map((t) => t.reversalOfId).filter(Boolean) as string[])
  return txns.filter(
    (t) =>
      !t.reversalOfId &&
      !(t.id && reversed.has(t.id)) &&
      t.type !== 'topup' &&
      asDate(t.date) >= from &&
      asDate(t.date) <= to,
  )
}

/** "2 m 11 d" from pro-rata months. The MONTH/DAY column; the fraction is /30 by convention. */
export function monthDay(months: number): string {
  const whole = Math.floor(months + 1e-9)
  const days = Math.round((months - whole) * 30)
  return `${whole} m ${days} d`
}

// ───────────────────────── the flat register columns ─────────────────────────

/**
 * The oMunim loan-list register columns, resolved once:
 *   CASTE · WARD NO. · VILLAGE · CITY · TALUKA · ADHAAR NO. · FATHER NAME · PHONE NO ·
 *   LOAN TYPE · EX. FIRM · TR. FIRM · ML. FIRM · OTH INFO
 *
 * Loan-first, customer-fallback for the three address fields the Loan carries in its own right
 * (ward / village / city): the counter may record a different address for THIS pledge than the one
 * on the customer master, and the register must show the one taken at the counter. Everything else
 * has exactly one home — the Customer record — and is read straight from it.
 *
 * Returned FLAT so the loan list can search, sort and filter on it with no nested-path handling.
 *
 * ADHAAR NO. is MASKED unless `revealAadhaar` is passed. Both callers of this function serve JSON
 * over the wire (/api/loans and /api/loans/registers), so this is the one place that decides
 * whether a full Aadhaar leaves the server. The register endpoint passes true only for an
 * authorised, SystemLog-recorded `?reveal=` request — which is the inspector reading the statutory
 * register, the one lawful use for the full number. The loan LIST never passes it: 300 rows of
 * Aadhaar is a bulk export of an identifier that must not be bulk-retrievable.
 */
export function registerFields(loan: RegisterLoan, revealAadhaar = false) {
  const c = loan.customer
  return {
    caste: c?.caste ?? null,
    wardNo: loan.wardNo ?? c?.wardNo ?? null,
    village: loan.village ?? c?.village ?? null,
    city: loan.city ?? c?.city ?? null,
    taluka: c?.tehsil ?? null,
    aadhaarNo: c?.aadhaar ? (revealAadhaar ? c.aadhaar : maskLast4(c.aadhaar)) : null,
    fatherName: c?.fatherSpouse ? `${c.fatherSpouseRel || ''} ${c.fatherSpouse}`.trim() : null,
    phoneNo: c?.mobile ?? c?.phone ?? null,
    loanType: loan.loanType ?? 'secured',
    exFirmId: loan.exFirmId ?? null,
    trFirmId: loan.trFirmId ?? null,
    mlFirmId: loan.mlFirmId ?? null,
    pledgePlace: loan.pledgePlace ?? null,
    othInfo: loan.note ?? null,
    accountNo: c?.code ?? null,
  }
}

export type RegisterFields = ReturnType<typeof registerFields>

// ───────────────────────── Namuna No. 9 ─────────────────────────

export type Namuna9Row = {
  loanId: string
  /** DATE — the date the pledge was taken. */
  date: string
  /** BILL.NO RECEIPT */
  billNo: string
  customerName: string
  status: string
  /** LOAN AMOUNT — what was put out, and what it has earned over the life of the loan to `to`. */
  loanAmount: { loanAmt: number; int: number; total: number }
  /** RECEIVED AMT — cash actually taken in, split the way it was applied: interest first. */
  receivedAmt: { loanAmt: number; int: number }
  /** BALANCE AMT — what still stands at `to`, and the period the unpaid interest has run for. */
  balanceAmt: {
    /** MONTH/DAY — the pro-rata period behind the balance interest, e.g. "2 m 11 d". */
    monthDay: string
    months: number
    /** VALUE — principal + accrued interest: the figure a release on `to` would charge, to the paisa. */
    value: number
    principal: number
    interest: number
    /**
     * PROFIT/LOSS — settled loans only. Interest recovered less value forgiven or written off:
     * > 0 the loan earned, < 0 it lost. null while the loan is live, because a live loan has made
     * and lost nothing yet. oMunim prints an unsigned "loss" column and leaves the reader to infer
     * the direction from the text colour.
     */
    profitLoss: number | null
  }
  /** ORNAMENT DETAILS — GOLD/SILVER NAME, G.G (gross), N.G (net). */
  ornaments: { name: string; purity: string | null; gg: number; ng: number; value: number }[]
  ornamentTotals: { gg: number; ng: number; value: number }
  /** Payment Info */
  paymentInfo: string
  /** Other Info */
  otherInfo: string | null
  register: RegisterFields
  /** Closed before the payments endpoint existed: the money columns are unknown, not zero. */
  unrecordedClosure: boolean
}

/**
 * Which loans appear: every account that was LIVE at any point in the window — taken on or before
 * `to`, and not already settled before `from`. An inspector asking for a month expects the accounts
 * that ran during it, not only the ones opened in it. Every figure is as at `to`.
 */
export function namuna9(loans: RegisterLoan[], from: Date, to: Date, revealAadhaar = false) {
  const warnings: RegisterWarning[] = []
  const rows: Namuna9Row[] = []

  for (const loan of loans) {
    const opened = asDate(loan.loanDate)
    if (opened > to) continue
    const closed = loan.releasedDate ? asDate(loan.releasedDate) : null
    if (closed && closed < from) continue

    const txns = loan.transactions ?? []
    const unrecorded = isUnrecordedClosure({ status: loan.status, transactions: txns })
    const d = deriveLoan(loan, txns, to)

    // Interest EARNED over the life of the loan to `to` = what has been collected + what still
    // stands unpaid. Both halves come out of the same replay, so they cannot disagree.
    const lifetimeInterest = nonNegative(d.paidInterest + d.accruedInterest, loan.loanNo, 'Interest charged', warnings)
    if (unrecorded) {
      warnings.push({
        code: 'unrecorded_closure',
        ref: loan.loanNo,
        message: `Loan ${loan.loanNo} is ${loan.status} but no LoanTransaction stands behind the closure — it predates the payments endpoint. Its received and balance columns are UNKNOWN, reported as 0 with this warning and deliberately not backfilled: the real recovery date and amount are not knowable.`,
      })
    }

    const ornaments = (loan.items ?? []).map((i) => ({
      name: i.name,
      purity: i.purity ?? null,
      gg: round2(i.grossWeight || 0),
      ng: round2(i.netWeight || 0),
      value: round2(i.estimatedValue || 0),
    }))

    const live = receiptsIn(loan, new Date(0), to)
    const modes = [...new Set(live.map((t) => t.paymentMode).filter(Boolean))] as string[]

    rows.push({
      loanId: loan.id,
      date: opened.toISOString(),
      billNo: loan.loanNo,
      customerName: fullName(loan.customer),
      status: loan.status || 'active',
      loanAmount: {
        loanAmt: d.principalAdvanced,
        int: lifetimeInterest,
        total: round2(d.principalAdvanced + lifetimeInterest),
      },
      receivedAmt: {
        loanAmt: unrecorded ? 0 : d.paidPrincipal,
        int: unrecorded ? 0 : d.paidInterest,
      },
      balanceAmt: {
        monthDay: monthDay(unrecorded ? 0 : d.monthsSinceLastEvent),
        months: unrecorded ? 0 : d.monthsSinceLastEvent,
        value: unrecorded ? 0 : d.totalDue,
        principal: unrecorded ? 0 : d.outstandingPrincipal,
        interest: unrecorded ? 0 : d.accruedInterest,
        profitLoss:
          loan.status && loan.status !== 'active' && !unrecorded ? round2(d.paidInterest - d.totalDiscount) : null,
      },
      ornaments,
      ornamentTotals: {
        gg: round2(ornaments.reduce((s, o) => s + o.gg, 0)),
        ng: round2(ornaments.reduce((s, o) => s + o.ng, 0)),
        value: round2(ornaments.reduce((s, o) => s + o.value, 0)),
      },
      paymentInfo: live.length
        ? `${live.length} receipt${live.length === 1 ? '' : 's'}${modes.length ? ` (${modes.join(', ')})` : ''}`
        : unrecorded
          ? 'not recorded'
          : 'no receipts',
      otherInfo: loan.note ?? null,
      register: registerFields(loan, revealAadhaar),
      unrecordedClosure: unrecorded,
    })
  }

  rows.sort((a, b) => a.date.localeCompare(b.date) || a.billNo.localeCompare(b.billNo))

  const totals = {
    loanAmt: round2(rows.reduce((s, r) => s + r.loanAmount.loanAmt, 0)),
    int: round2(rows.reduce((s, r) => s + r.loanAmount.int, 0)),
    total: round2(rows.reduce((s, r) => s + r.loanAmount.total, 0)),
    receivedLoanAmt: round2(rows.reduce((s, r) => s + r.receivedAmt.loanAmt, 0)),
    receivedInt: round2(rows.reduce((s, r) => s + r.receivedAmt.int, 0)),
    balanceValue: round2(rows.reduce((s, r) => s + r.balanceAmt.value, 0)),
    profitLoss: round2(rows.reduce((s, r) => s + (r.balanceAmt.profitLoss ?? 0), 0)),
    gg: round2(rows.reduce((s, r) => s + r.ornamentTotals.gg, 0)),
    ng: round2(rows.reduce((s, r) => s + r.ornamentTotals.ng, 0)),
  }
  return { rows, totals, warnings }
}

// ───────────────────────── Namuna No. 15 (annual return) ─────────────────────────

export type Namuna15Row = {
  key: string
  customerId: string | null
  /** (1) Customer Name */ customerName: string
  /** (2) Business / Service / Homework */ occupation: string | null
  /** (3) Customer Address */ address: string | null
  /** (4) Contact No */ contactNo: string | null
  /** (5) Account No */ accountNo: string | null
  /** (6) caste / backward-class declaration */ caste: string | null
  /** (7) Opening Balance — Principal | Interest */ opening: { principal: number; interest: number }
  /** (8) Running-year loan given, with the interest charged on the year */
  givenInYear: { principal: number; interest: number }
  /** (9) Year-end paid total — cash received; a rebate is not a receipt */ paidInYear: number
  /** (10) Year-end due — Principal | Interest */ closing: { principal: number; interest: number }
  /** (11) Place of mortgage — business | storage | house; blank where it was never recorded */
  pledgePlace: string | null
  loanNos: string[]
}

/**
 * The annual return, one block per customer. Walk-in pledges with no Customer row get their own
 * block keyed off the loan, so nothing silently merges into a single nameless heap.
 *
 * `from` is EXCLUSIVE for the opening balance: a loan TAKEN during the year has no opening balance,
 * it belongs in clause (8). Forgetting this is how a register reports a year of fresh lending as an
 * opening balance carried forward.
 *
 * Clause (8) interest is a SUBTRACTION and is therefore the one figure that can come out negative:
 *      interest charged in the year = closing accrued + interest paid in the year − opening accrued
 * The identity is exact, because accrued interest moves only by accrual (up) or by a payment
 * (down). It falls below zero only when a back-dated payment or a reversal has rewritten history
 * inside the window — which is exactly the condition oMunim prints as "-16,371.27". Guarded.
 */
export function namuna15(loans: RegisterLoan[], from: Date, to: Date) {
  const warnings: RegisterWarning[] = []
  type Group = { row: Namuna15Row; openInt: number; closeInt: number; paidInt: number }
  const groups = new Map<string, Group>()

  for (const loan of loans) {
    const opened = asDate(loan.loanDate)
    if (opened > to) continue

    const txns = loan.transactions ?? []
    if (isUnrecordedClosure({ status: loan.status, transactions: txns })) {
      warnings.push({
        code: 'unrecorded_closure',
        ref: loan.loanNo,
        message: `Loan ${loan.loanNo} is ${loan.status} with no transaction behind the closure; it is left out of the return rather than reported as an outstanding balance it does not have.`,
      })
      continue
    }

    const c = loan.customer
    const key = c?.id || `loan:${loan.id}`
    const f = registerFields(loan)
    let g = groups.get(key)
    if (!g) {
      g = {
        row: {
          key,
          customerId: c?.id ?? null,
          customerName: fullName(c),
          occupation: c?.occupation ?? null,
          address:
            [f.wardNo && `Ward ${f.wardNo}`, f.village, f.taluka, f.city, c?.state, c?.pincode]
              .filter(Boolean)
              .join(', ') || null,
          contactNo: f.phoneNo,
          accountNo: f.accountNo,
          caste: f.caste,
          opening: { principal: 0, interest: 0 },
          givenInYear: { principal: 0, interest: 0 },
          paidInYear: 0,
          closing: { principal: 0, interest: 0 },
          pledgePlace: f.pledgePlace,
          loanNos: [],
        },
        openInt: 0,
        closeInt: 0,
        paidInt: 0,
      }
      groups.set(key, g)
    }
    g.row.loanNos.push(loan.loanNo)
    g.row.pledgePlace ??= f.pledgePlace

    const close = deriveLoan(loan, txns, to)
    g.row.closing.principal += close.outstandingPrincipal
    g.closeInt += close.accruedInterest

    if (opened < from) {
      const open = deriveLoan(loan, txns, from)
      g.row.opening.principal += open.outstandingPrincipal
      g.openInt += open.accruedInterest
    } else {
      // (8) Fresh lending inside the year.
      g.row.givenInYear.principal += loan.principalAmount || 0
    }
    // A topup is fresh lending too, whichever year the parent loan was taken in.
    g.row.givenInYear.principal += txns
      .filter((t) => t.type === 'topup' && !t.reversalOfId && asDate(t.date) >= from && asDate(t.date) <= to)
      .reduce((s, t) => s + (t.amount || 0), 0)

    g.row.paidInYear += receiptsIn(loan, from, to).reduce((s, t) => s + (t.amount || 0), 0)
    // Interest recovered inside the window, taken from the replay rather than from the stored
    // split columns, so a row written before those columns existed still contributes correctly.
    const before = deriveLoan(loan, txns, new Date(from.getTime() - 1))
    g.paidInt += close.paidInterest - before.paidInterest
  }

  const rows = [...groups.values()].map(({ row, openInt, closeInt, paidInt }) => {
    const ref = row.loanNos.join('/') || row.customerName || row.key
    row.opening.principal = nonNegative(row.opening.principal, ref, 'Opening principal', warnings)
    row.opening.interest = nonNegative(openInt, ref, 'Opening interest', warnings)
    row.closing.principal = nonNegative(row.closing.principal, ref, 'Closing principal', warnings)
    row.closing.interest = nonNegative(closeInt, ref, 'Closing interest', warnings)
    row.givenInYear.principal = nonNegative(row.givenInYear.principal, ref, 'Loan given in year', warnings)
    row.givenInYear.interest = nonNegative(closeInt + paidInt - openInt, ref, 'Interest charged in year', warnings)
    row.paidInYear = nonNegative(row.paidInYear, ref, 'Paid in year', warnings)
    return row
  })

  rows.sort((a, b) => a.customerName.localeCompare(b.customerName) || a.key.localeCompare(b.key))

  const totals = {
    openingPrincipal: round2(rows.reduce((s, r) => s + r.opening.principal, 0)),
    openingInterest: round2(rows.reduce((s, r) => s + r.opening.interest, 0)),
    givenPrincipal: round2(rows.reduce((s, r) => s + r.givenInYear.principal, 0)),
    givenInterest: round2(rows.reduce((s, r) => s + r.givenInYear.interest, 0)),
    paidInYear: round2(rows.reduce((s, r) => s + r.paidInYear, 0)),
    closingPrincipal: round2(rows.reduce((s, r) => s + r.closing.principal, 0)),
    closingInterest: round2(rows.reduce((s, r) => s + r.closing.interest, 0)),
  }
  return { rows, totals, warnings }
}
