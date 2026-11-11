import { formatDate } from './format'
import type { TagItem } from './label-tags'

/**
 * ONE GIRVI LOAN -> the tag that hangs on the pledge packet in the safe (oMunim TAIL LOAN /
 * 24L LOAN / LOAN TAG). Pure: no I/O, no Prisma, no interest.
 *
 * The slot engine is label-tags.ts and is not touched here. sourceValue() resolves a `loan*` source
 * as a plain `it[key]` lookup, so this file's whole job is to put those keys on one flat record:
 *   kind 'text'   -> printed as-is
 *   kind 'money'  -> toFixed(0)   (loanPrincipal: a number goes in)
 *   kind 'weight' -> toFixed(3)   (loanGrossWeight / loanNetWeight: a number, or '' for none)
 *
 * NO BALANCE, NO INTEREST, NO AMOUNT DUE on a packet tag. Every such figure is DERIVED by
 * src/lib/interest.ts deriveLoan() replaying the transaction stream, it changes every single day,
 * and a tag is printed once and then hangs on the packet for eleven months. Printing a figure that
 * is wrong by tomorrow is worse than printing none. The rate is on the tag; the quote is not.
 *
 * NO AADHAAR, NO PAN, NO PHOTO, EVER - there is no TAG_SOURCES key for any of them and none may be
 * added. A packet tag is handled by every member of counter staff and by anyone who opens the safe.
 *
 * ARITHMETIC: exactly two sums, plain addition of the STORED grams on LoanItem. No purity maths, no
 * fine-weight conversion, no re-derivation. A null or absent weight contributes 0, and a loan with
 * no weights at all prints EMPTY rather than 0.000 - a tag claiming 0.000 g on a pledge the
 * pawnbroker signs for is a lie, and an empty line is visibly a missing entry.
 */

/** Only the Customer columns the tag maps. Nothing else is read, so nothing else need be selected. */
export type LoanTagCustomer = {
  firstName?: string | null
  lastName?: string | null
  fatherSpouse?: string | null
  fatherSpouseRel?: string | null
  city?: string | null
  village?: string | null
  mobile?: string | null
  phone?: string | null
}

export type LoanTagOrnament = {
  name?: string | null
  grossWeight?: number | null
  netWeight?: number | null
  createdAt?: Date | string | null
}

/** Loose on purpose: the same shape arrives from Prisma (render route) and from GET /api/loans (panel). */
export type LoanTagLoan = {
  id: string
  loanNo?: string | null
  loanDate?: Date | string | null
  principalAmount?: number | null
  interestRate?: number | null
  customerName?: string | null
  customerMobile?: string | null
  city?: string | null
  village?: string | null
  packetNo?: string | null
  boxNo?: string | null
  lockerNo?: string | null
  note?: string | null
  items?: LoanTagOrnament[] | null
  customer?: LoanTagCustomer | null
}

const S = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const g = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const when = (d: Date | string | null | undefined) => { const t = d ? new Date(d) : null; return t && !Number.isNaN(t.getTime()) ? t : null }
const two = (n: number) => String(n).padStart(2, '0')

export function loanTagItem(loan: LoanTagLoan, firmName?: string): TagItem {
  const c = loan.customer ?? null
  const d = when(loan.loanDate)
  // createdAt order: LoanItem has no `seq` column (confirmed against prisma/schema.prisma), so the
  // row's own creation time is the order the counter entered the ornaments in. Sorted here as well
  // as in the query, because GET /api/loans does not order the nested items.
  const items = [...(loan.items ?? [])].sort((a, b) => (when(a.createdAt)?.getTime() ?? 0) - (when(b.createdAt)?.getTime() ?? 0))
  const sum = (k: 'grossWeight' | 'netWeight') => items.reduce((s, i) => s + g(i[k]), 0)
  // 0 means "nothing was weighed": grossWeight/netWeight are NOT NULL DEFAULT 0 on LoanItem, so a
  // blank weight at the counter is indistinguishable from a zero one, and neither belongs on a tag.
  const wt = (n: number) => (n > 0 ? n : '')
  const rate = loan.interestRate
  return {
    id: loan.id,
    loanNo: S(loan.loanNo),
    // The SAME helper the girvi documents print with (girvi-docs.tsx -> formatDate): a pledge note
    // and the tag on its packet disagreeing about the date is the kind of thing a shop never
    // reconciles. One format, one helper, no second one invented here.
    loanDate: d ? formatDate(d) : '',
    loanDateTime: d ? `${formatDate(d)} ${two(d.getHours())}:${two(d.getMinutes())}` : '',
    loanPrincipal: g(loan.principalAmount),
    // No unit and no '%': the slot's own suffix adds it, so one template can print "2%" and another "2 pm".
    loanRate: typeof rate === 'number' && Number.isFinite(rate) ? String(+rate) : '',
    loanCustomer: S(loan.customerName) || [S(c?.firstName), S(c?.lastName)].filter(Boolean).join(' '),
    // "S/o Ramlal", the same composition registerFields() uses for the Money Lenders Act FATHER NAME column.
    loanCustomerFather: c?.fatherSpouse ? `${S(c.fatherSpouseRel)} ${S(c.fatherSpouse)}`.trim() : '',
    // Loan column first, customer as the fallback - registerFields()' rule for village/city/wardNo.
    loanCustomerCity: S(loan.city) || S(c?.city) || S(loan.village) || S(c?.village),
    loanCustomerPhone: S(loan.customerMobile) || S(c?.mobile) || S(c?.phone),
    loanItems: items.map((i) => S(i.name)).filter(Boolean).join(' + '),
    loanGrossWeight: wt(sum('grossWeight')),
    loanNetWeight: wt(sum('netWeight')),
    loanPouch: S(loan.packetNo),
    // Whichever of the two is set; both -> "Box A-12 / Locker 3". Finding the packet again is the
    // entire point of the tag.
    loanLocation: [S(loan.boxNo) && `Box ${S(loan.boxNo)}`, S(loan.lockerNo) && `Locker ${S(loan.lockerNo)}`].filter(Boolean).join(' / '),
    loanNote: S(loan.note),
    firmName: S(firmName),
  }
}
