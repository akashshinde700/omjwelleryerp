import { describe, it, expect } from 'vitest'
import { loanTagItem, type LoanTagLoan } from '@/lib/label-loan'
import { formatField, TAG_SOURCES } from '@/lib/label-tags'
import { formatDate } from '@/lib/format'

/** The slot engine's own formatting, so these assert what the PRINTER receives, not an intermediate. */
const f = (loan: LoanTagLoan, source: string, firmName?: string) => formatField(loanTagItem(loan, firmName), { source })

const base = (over: Partial<LoanTagLoan> = {}): LoanTagLoan => ({
  id: 'ln1', loanNo: 'A101', loanDate: new Date('2026-02-11T16:05:00'),
  principalAmount: 25000, interestRate: 2, customerName: 'Ramesh Patel', customerMobile: '9876543210',
  city: 'Nashik', packetNo: 'P-77', boxNo: 'A-12', lockerNo: '3', note: '  chain is bent  ',
  items: [
    { name: 'Chain', grossWeight: 12.345, netWeight: 12.1, createdAt: new Date('2026-02-11T10:00:00') },
    { name: 'Ring', grossWeight: 4.2, netWeight: 4, createdAt: new Date('2026-02-11T10:01:00') },
    { name: 'Bangle', grossWeight: 8.055, netWeight: null, createdAt: new Date('2026-02-11T10:02:00') },
  ],
  customer: { firstName: 'Ramesh', lastName: 'Patel', fatherSpouse: 'Kanti', fatherSpouseRel: 'S/o', city: 'Nashik', mobile: '9876543210' },
  ...over,
})

describe('loanTagItem - the girvi packet tag', () => {
  it('the pledge: number, date, principal, rate, pledger', () => {
    const l = base()
    expect(f(l, 'loanNo')).toBe('A101')
    expect(f(l, 'loanDate')).toBe(formatDate(l.loanDate as Date)) // the girvi note's own helper, not a second format
    expect(f(l, 'loanDateTime')).toBe(`${formatDate(l.loanDate as Date)} 16:05`)
    expect(f(l, 'loanPrincipal')).toBe('25000') // money, 0 decimals
    expect(f(l, 'loanRate')).toBe('2') // no '%' - the slot's suffix adds it
    expect(formatField(loanTagItem(l), { source: 'loanRate', suffix: '%' })).toBe('2%')
    expect(f(l, 'loanCustomer')).toBe('Ramesh Patel')
    expect(f(l, 'loanCustomerFather')).toBe('S/o Kanti')
    expect(f(l, 'loanCustomerCity')).toBe('Nashik')
    expect(f(l, 'loanCustomerPhone')).toBe('9876543210')
    expect(f(l, 'loanNote')).toBe('chain is bent')
    expect(f(l, 'firmName', 'Om Jewellers')).toBe('Om Jewellers')
    expect(f(l, 'firmName')).toBe('') // the route supplies it or nothing does
  })

  it('weights are the plain SUM of the stored grams, 3 decimals, a null contributing 0', () => {
    // 12.345 + 4.2 + 8.055 = 24.600 gross; 12.1 + 4 + null = 16.100 net.
    expect(f(base(), 'loanGrossWeight')).toBe('24.600')
    expect(f(base(), 'loanNetWeight')).toBe('16.100')
  })

  it('a loan with no weights prints EMPTY, never 0.000 - a tag the pawnbroker signs may not claim a weight', () => {
    const none = base({ items: [{ name: 'Chain' }, { name: 'Ring', grossWeight: 0, netWeight: 0 }] })
    expect(loanTagItem(none).loanGrossWeight).toBe('')
    expect(loanTagItem(none).loanNetWeight).toBe('')
    expect(f(none, 'loanGrossWeight')).toBe('')
    expect(f(none, 'loanNetWeight')).toBe('')
    // ... and a prefix/suffix on an empty slot prints nothing at all, not a bare "GW: g".
    expect(formatField(loanTagItem(none), { source: 'loanGrossWeight', prefix: 'GW-', suffix: 'G' })).toBe('')
    // Gross recorded, net not: the one that exists still prints.
    const half = base({ items: [{ name: 'Chain', grossWeight: 5 }] })
    expect(f(half, 'loanGrossWeight')).toBe('5.000')
    expect(f(half, 'loanNetWeight')).toBe('')
    expect(f(base({ items: [] }), 'loanGrossWeight')).toBe('')
  })

  it('the ornaments are joined in entry order, and an unnamed row does not leave a dangling +', () => {
    expect(f(base(), 'loanItems')).toBe('Chain + Ring + Bangle')
    // Out of order from the wire (GET /api/loans does not order the nested items): createdAt wins.
    const shuffled = base({ items: [base().items![2], base().items![0], base().items![1]] })
    expect(f(shuffled, 'loanItems')).toBe('Chain + Ring + Bangle')
    expect(f(base({ items: [{ name: 'Chain' }, { name: '' }, { name: null }] }), 'loanItems')).toBe('Chain')
  })

  it('where the packet is: box and locker read together, or whichever one is set', () => {
    expect(f(base(), 'loanPouch')).toBe('P-77')
    expect(f(base(), 'loanLocation')).toBe('Box A-12 / Locker 3')
    expect(f(base({ lockerNo: null }), 'loanLocation')).toBe('Box A-12')
    expect(f(base({ boxNo: null }), 'loanLocation')).toBe('Locker 3')
    expect(f(base({ boxNo: null, lockerNo: null }), 'loanLocation')).toBe('')
  })

  it('no joined customer: the loan\'s own columns carry the tag, nothing throws', () => {
    const l = base({ customer: null, items: null })
    expect(f(l, 'loanCustomer')).toBe('Ramesh Patel')
    expect(f(l, 'loanCustomerFather')).toBe('')
    expect(f(l, 'loanCustomerCity')).toBe('Nashik')
    expect(f(l, 'loanCustomerPhone')).toBe('9876543210')
    expect(f(l, 'loanItems')).toBe('')
    // Name only on the joined row (an older loan whose customerName was never filled).
    expect(f(base({ customerName: '' }), 'loanCustomer')).toBe('Ramesh Patel')
    // City falls back customer -> loan village -> customer village, the register's own rule.
    expect(f(base({ city: null, customer: { village: 'Sinnar' } }), 'loanCustomerCity')).toBe('Sinnar')
    // A bad date is not a tag that says "Invalid Date".
    expect(f(base({ loanDate: 'not a date' }), 'loanDate')).toBe('')
    expect(f(base({ loanDate: null, interestRate: null, principalAmount: null }), 'loanDateTime')).toBe('')
    expect(f(base({ interestRate: null }), 'loanRate')).toBe('')
  })

  it('NO AADHAAR, NO PAN, NO PHOTO can reach a packet tag, even when the row carries them', () => {
    const l = {
      ...base(),
      // Every identifier-bearing column the Loan/Customer/LoanItem rows actually have, planted here
      // as if someone widened the route's select. A packet tag is handled by all counter staff.
      photoUrl: 'data:image/png;base64,PLEDGEPHOTO',
      customer: { ...base().customer, aadhaar: '123456789012', pan: 'ABCDE1234F', kycDocNo: 'DL-9', bankAccNumber: '00123456', photoUrl: 'data:image/png;base64,FACE' },
      items: [{ name: 'Chain', grossWeight: 5, netWeight: 5, photoUrl: 'data:image/png;base64,ORNAMENT' }],
    } as unknown as LoanTagLoan
    const out = loanTagItem(l, 'Om Jewellers')
    const printed = JSON.stringify(out)
    for (const secret of ['123456789012', 'ABCDE1234F', 'DL-9', '00123456', 'PLEDGEPHOTO', 'FACE', 'ORNAMENT', 'base64']) {
      expect(printed).not.toContain(secret)
    }
    // Not even under a key nothing is bound to: the mapper whitelists, it does not spread the row.
    expect(Object.keys(out).filter((k) => /aadhaar|pan|photo|kyc|bank/i.test(k))).toEqual([])
    // And there is no slot source that could ask for one.
    expect(TAG_SOURCES.filter((s) => /aadhaar|pan|photo|kyc|bank/i.test(s.key))).toEqual([])
    // A balance has no key either: it is derived (deriveLoan) and would be stale by tomorrow.
    expect(Object.keys(out).filter((k) => /due|balance|outstand|interestAmt|accrued/i.test(k))).toEqual([])
  })

  it('every loan key the setup screen offers is a key the mapper actually fills', () => {
    const keys = Object.keys(loanTagItem(base(), 'F'))
    for (const s of TAG_SOURCES.filter((x) => x.key.startsWith('loan'))) expect(keys).toContain(s.key)
  })
})
