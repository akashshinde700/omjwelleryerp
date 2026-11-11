import { describe, it, expect } from 'vitest'
import { deriveLoan } from '../../src/lib/interest'
import { namuna9, namuna15, nonNegative, registerFields, type RegisterLoan, type RegisterWarning } from '../../src/lib/registers'

/**
 * Money Lenders Act registers — Namuna No. 9 and Namuna No. 15.
 *
 * Every figure traces to the worked example in the header of src/lib/interest.ts, which is settled
 * and is NOT re-derived here: simple interest per month on the outstanding principal, part months
 * calendar-anchored pro-rata (complete calendar months + remainder days / 30), no minimum period,
 * payments interest-first.
 *
 *   ₹50,000 at 2.5%/month, disbursed 2026-01-01. ₹15,000 paid 2026-02-10. Read on 2026-04-11.
 *     segment 1  2026-01-01 → 2026-02-10 : anniversary 02-01 reached, remainder 9 d
 *                = 1 + 9/30 = 1.3 months × ₹50,000 × 2.5%        = ₹1,625.00 interest
 *     payment    ₹15,000: ₹1,625.00 → interest, ₹13,375.00 → principal ⇒ ₹36,625.00 out
 *     segment 2  2026-02-10 → 2026-04-11 : anniversaries 03-10, 04-10, remainder 1 d
 *                = 2 + 1/30 = 2.0333333 months × ₹36,625 × 2.5%  = ₹1,861.77 interest
 *     due on 2026-04-11                                          = ₹38,486.77
 *
 * Owners: be-lending. Independent verification of every figure: qa-finance.
 */

const JAN1 = new Date('2026-01-01T00:00:00.000Z')
const FEB10 = new Date('2026-02-10T00:00:00.000Z')
const APR11 = new Date('2026-04-11T00:00:00.000Z')
const YEAR_FROM = new Date('2026-01-01T00:00:00.000Z')
const YEAR_TO = new Date('2026-12-31T23:59:59.999Z')

const CUSTOMER = {
  id: 'cust-1', code: 'C1673', firstName: 'Pooja', lastName: 'Sharma',
  caste: 'Maratha', aadhaar: '123456789012', fatherSpouse: 'Ramesh Sharma', fatherSpouseRel: 'D/o',
  mobile: '9876500002', phone: null, occupation: 'Business',
  village: 'Rau', city: 'Indore', wardNo: '12', tehsil: 'Depalpur', state: 'Madhya Pradesh', pincode: '453331',
  address: null, otherInfo: null,
}

function workedLoan(over: Partial<RegisterLoan> = {}): RegisterLoan {
  return {
    id: 'loan-1',
    loanNo: 'A101',
    loanDate: JAN1,
    principalAmount: 50000,
    interestRate: 2.5,
    status: 'active',
    loanType: 'secured',
    wardNo: null,
    village: null,
    city: null,
    note: 'gold bangle pledge',
    pledgePlace: 'storage',
    items: [{ name: 'Gold Bangle', purity: '22K', grossWeight: 22.4, netWeight: 21.5, estimatedValue: 65000 }],
    transactions: [{ id: 't1', date: FEB10, type: 'part_payment', amount: 15000, paymentMode: 'cash' }],
    customer: CUSTOMER,
    ...over,
  }
}

describe('registerFields — the oMunim register columns, resolved', () => {
  it('reads caste, taluka, adhaar, father name and phone from the joined Customer', () => {
    const f = registerFields(workedLoan())
    expect(f.caste).toBe('Maratha')
    expect(f.taluka).toBe('Depalpur')
    // MASKED by default: registerFields is the only thing standing between the joined Customer row
    // and two JSON endpoints, so the full number leaves only when a caller has been authorised.
    expect(f.aadhaarNo).toBe('XXXX XXXX 9012')
    expect(f.fatherName).toBe('D/o Ramesh Sharma')
    expect(f.phoneNo).toBe('9876500002')
    expect(f.accountNo).toBe('C1673')
    expect(f.othInfo).toBe('gold bangle pledge')
  })

  it('returns the full adhaar only when the caller was authorised to reveal it', () => {
    expect(registerFields(workedLoan(), true).aadhaarNo).toBe('123456789012')
    // Everything else is unchanged by the reveal — it unmasks one column, it does not widen the row.
    expect(registerFields(workedLoan(), true).caste).toBe('Maratha')
  })

  it('falls back to the customer address only when the counter recorded none on the loan', () => {
    expect(registerFields(workedLoan()).village).toBe('Rau')
    // A pledge taken at a different address must print THAT address, not the customer master's.
    expect(registerFields(workedLoan({ village: 'Mhow', wardNo: '3' })).village).toBe('Mhow')
    expect(registerFields(workedLoan({ village: 'Mhow', wardNo: '3' })).wardNo).toBe('3')
  })

  it('leaves a walk-in pledge blank rather than inventing a customer', () => {
    const f = registerFields(workedLoan({ customer: null }))
    expect(f.caste).toBeNull()
    expect(f.aadhaarNo).toBeNull()
    expect(f.fatherName).toBeNull()
  })
})

describe('nonNegative — oMunim prints -16,371.27 on a statutory return; we must not', () => {
  it('clamps a negative to zero AND records a warning naming the row', () => {
    const w: RegisterWarning[] = []
    expect(nonNegative(-16371.27, 'A101', 'Opening interest', w)).toBe(0)
    expect(w).toHaveLength(1)
    expect(w[0].code).toBe('negative_amount')
    expect(w[0].ref).toBe('A101')
    expect(w[0].message).toContain('-16371.27')
  })

  it('passes a genuine figure through untouched and warns about nothing', () => {
    const w: RegisterWarning[] = []
    expect(nonNegative(1861.7708333, 'A101', 'Closing interest', w)).toBe(1861.77)
    expect(w).toHaveLength(0)
  })

  it('treats a sub-paisa float residue as zero, not as a negative to shout about', () => {
    const w: RegisterWarning[] = []
    expect(nonNegative(-0.0000000004, 'A101', 'Closing interest', w)).toBe(0)
    expect(w).toHaveLength(0)
  })
})

describe('Namuna No. 9', () => {
  const { rows, totals, warnings } = namuna9([workedLoan()], JAN1, APR11)
  const r = rows[0]

  it('reports the worked example to the paisa', () => {
    expect(r.billNo).toBe('A101')
    expect(r.loanAmount.loanAmt).toBe(50000)
    expect(r.loanAmount.int).toBe(3486.77) // ₹1,625.00 collected + ₹1,861.77 still standing
    expect(r.loanAmount.total).toBe(53486.77)
    expect(r.receivedAmt.int).toBe(1625)
    expect(r.receivedAmt.loanAmt).toBe(13375)
    expect(r.balanceAmt.principal).toBe(36625)
    expect(r.balanceAmt.interest).toBe(1861.77)
    expect(r.balanceAmt.value).toBe(38486.77)
    expect(r.balanceAmt.monthDay).toBe('2 m 1 d') // 2026-02-10 → 2026-04-11
    expect(warnings).toHaveLength(0)
  })

  it('SHOWS exactly what it would CHARGE — oMunim shows ₹14,829 and charges ₹14,829.26', () => {
    const due = deriveLoan(workedLoan(), workedLoan().transactions!, APR11).totalDue
    expect(r.balanceAmt.value).toBe(due)
    expect(r.balanceAmt.principal + r.balanceAmt.interest).toBe(due)
  })

  it('carries the ornament columns: GOLD/SILVER NAME, G.G, N.G', () => {
    expect(r.ornaments).toEqual([{ name: 'Gold Bangle', purity: '22K', gg: 22.4, ng: 21.5, value: 65000 }])
    expect(r.ornamentTotals).toEqual({ gg: 22.4, ng: 21.5, value: 65000 })
  })

  it('leaves PROFIT/LOSS null while the loan is live and signs it once settled', () => {
    expect(r.balanceAmt.profitLoss).toBeNull()
    const settled = namuna9(
      [workedLoan({
        status: 'released',
        releasedDate: APR11,
        transactions: [
          { id: 't1', date: FEB10, type: 'part_payment', amount: 15000 },
          { id: 't2', date: APR11, type: 'release', amount: 38486.77 },
        ],
      })],
      JAN1, APR11,
    )
    // ₹1,625.00 + ₹1,861.77 interest recovered, nothing forgiven.
    expect(settled.rows[0].balanceAmt.profitLoss).toBe(3486.77)
    expect(settled.rows[0].balanceAmt.value).toBe(0)
  })

  it('includes an account opened before the window and still running, not just the ones opened in it', () => {
    const march = namuna9([workedLoan()], new Date('2026-03-01T00:00:00Z'), APR11)
    expect(march.rows.map((x) => x.billNo)).toEqual(['A101'])
  })

  it('excludes an account settled before the window opened, and one opened after it closed', () => {
    const closed = workedLoan({ status: 'released', releasedDate: FEB10 })
    expect(namuna9([closed], new Date('2026-03-01T00:00:00Z'), APR11).rows).toHaveLength(0)
    expect(namuna9([workedLoan()], new Date('2025-01-01T00:00:00Z'), new Date('2025-06-01T00:00:00Z')).rows).toHaveLength(0)
  })

  it('reports a closure with no transaction behind it as UNKNOWN and warns, never as a zero recovery', () => {
    const ghost = namuna9([workedLoan({ status: 'released', releasedDate: APR11, transactions: [] })], JAN1, APR11)
    expect(ghost.rows[0].unrecordedClosure).toBe(true)
    expect(ghost.rows[0].paymentInfo).toBe('not recorded')
    expect(ghost.rows[0].balanceAmt.value).toBe(0)
    expect(ghost.warnings.some((w) => w.code === 'unrecorded_closure')).toBe(true)
  })

  it('totals what it printed', () => {
    expect(totals.loanAmt).toBe(50000)
    expect(totals.total).toBe(53486.77)
    expect(totals.balanceValue).toBe(38486.77)
  })

  it('never emits a negative anywhere on the sheet', () => {
    const sweep = namuna9([workedLoan(), workedLoan({ id: 'l2', loanNo: 'A102', transactions: [] })], JAN1, APR11)
    for (const row of sweep.rows) {
      for (const n of [row.loanAmount.loanAmt, row.loanAmount.int, row.loanAmount.total,
        row.receivedAmt.loanAmt, row.receivedAmt.int, row.balanceAmt.principal,
        row.balanceAmt.interest, row.balanceAmt.value]) {
        expect(n).toBeGreaterThanOrEqual(0)
      }
    }
  })
})

describe('Namuna No. 15 — the annual return', () => {
  it('fills the numbered clauses from the customer record', () => {
    const { rows } = namuna15([workedLoan()], YEAR_FROM, APR11)
    const r = rows[0]
    expect(r.customerName).toBe('Pooja Sharma')          // (1)
    expect(r.occupation).toBe('Business')                // (2)
    expect(r.address).toBe('Ward 12, Rau, Depalpur, Indore, Madhya Pradesh, 453331') // (3)
    expect(r.contactNo).toBe('9876500002')               // (4)
    expect(r.accountNo).toBe('C1673')                    // (5)
    expect(r.caste).toBe('Maratha')                      // (6)
    expect(r.pledgePlace).toBe('storage')                // (11)
  })

  it('puts a loan taken INSIDE the year in clause (8), never in the opening balance', () => {
    const { rows, warnings } = namuna15([workedLoan()], YEAR_FROM, APR11)
    const r = rows[0]
    expect(r.opening).toEqual({ principal: 0, interest: 0 })   // (7) — taken on 01-01, the window start
    expect(r.givenInYear.principal).toBe(50000)                // (8)
    expect(r.givenInYear.interest).toBe(3486.77)               // ₹1,625.00 taken + ₹1,861.77 standing
    expect(r.paidInYear).toBe(15000)                           // (9)
    expect(r.closing).toEqual({ principal: 36625, interest: 1861.77 }) // (10)
    expect(warnings).toHaveLength(0)
  })

  it('carries a loan taken BEFORE the year into the opening balance, at the value it stood at', () => {
    // Read the same loan over 2026-03-01 → 2026-04-11. Opening is the position on 03-01:
    // 2026-02-10 → 2026-03-01 reaches no anniversary (03-10 is later), so 0 complete months and a
    // 19-day remainder = 19/30 month. ₹36,625 × 2.5% = ₹915.625/month × 0.633333 = ₹579.896 →
    // ₹579.90 rounded once at the end. Principal unchanged at ₹36,625.
    const from = new Date('2026-03-01T00:00:00.000Z')
    const { rows } = namuna15([workedLoan()], from, APR11)
    const r = rows[0]
    expect(r.opening.principal).toBe(36625)
    expect(r.opening.interest).toBe(579.9)
    expect(r.givenInYear.principal).toBe(0)
    // Interest charged in the window = closing (1861.77) + paid in window (0) − opening (579.90)
    expect(r.givenInYear.interest).toBe(1281.87)
    expect(r.paidInYear).toBe(0) // the ₹15,000 landed before the window
  })

  it('adds a customer’s several girvis into ONE numbered block', () => {
    const second = workedLoan({ id: 'loan-2', loanNo: 'A102', principalAmount: 20000, transactions: [] })
    const { rows } = namuna15([workedLoan(), second], YEAR_FROM, APR11)
    expect(rows).toHaveLength(1)
    expect(rows[0].loanNos.sort()).toEqual(['A101', 'A102'])
    expect(rows[0].givenInYear.principal).toBe(70000)
  })

  it('keeps a walk-in pledge in its own block instead of merging it into a nameless heap', () => {
    const walkIn = workedLoan({ id: 'loan-3', loanNo: 'A103', customer: null, transactions: [] })
    const { rows } = namuna15([workedLoan(), walkIn], YEAR_FROM, APR11)
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.key === 'loan:loan-3')?.customerName).toBe('')
  })

  it('counts a topup as fresh lending in the year it was advanced', () => {
    const topped = workedLoan({
      transactions: [
        { id: 't1', date: FEB10, type: 'part_payment', amount: 15000 },
        { id: 't2', date: new Date('2026-03-01T00:00:00Z'), type: 'topup', amount: 10000 },
      ],
    })
    const { rows } = namuna15([topped], YEAR_FROM, APR11)
    expect(rows[0].givenInYear.principal).toBe(60000)
  })

  it('leaves a closure with no transaction behind it OFF the return, with a warning', () => {
    const { rows, warnings } = namuna15(
      [workedLoan({ status: 'released', releasedDate: APR11, transactions: [] })], YEAR_FROM, YEAR_TO,
    )
    expect(rows).toHaveLength(0)
    expect(warnings[0].code).toBe('unrecorded_closure')
  })

  it('never emits a negative on any clause', () => {
    const { rows } = namuna15([workedLoan()], YEAR_FROM, YEAR_TO)
    for (const r of rows) {
      for (const n of [r.opening.principal, r.opening.interest, r.givenInYear.principal,
        r.givenInYear.interest, r.paidInYear, r.closing.principal, r.closing.interest]) {
        expect(n).toBeGreaterThanOrEqual(0)
      }
    }
  })
})
