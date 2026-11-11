export const COUNTRIES = [
  'India', 'United States Of America', 'United State', 'United Kingdom', 'Australia',
  'Canada', 'Singapore', 'United Arab Emirates', 'Qatar', 'Saudi Arabia',
  'Nepal', 'Bangladesh', 'Bhutan', 'Sri Lanka', 'Pakistan', 'China', 'Japan',
  'Germany', 'France', 'Brazil', 'Indonesia', 'Other',
]

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan',
  'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
  'Uttarakhand', 'West Bengal', 'Delhi', 'Jammu and Kashmir',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli',
  'Daman and Diu', 'Lakshdweep', 'Pondicherry', 'Other Territory',
]

export const TITLES = ['Mr.', 'Mrs.', 'Ms.', 'M/S.']
export const RELATIONS = ['S/o', 'D/o', 'W/o', 'C/o', 'M/o']
export const GENDERS = ['male', 'female', 'kids', 'unisex']
export const MARITAL_STATUS = ['single', 'married', 'divorced', 'widowed']
export const CUSTOMER_TYPES = ['customer', 'supplier', 'staff', 'karigar', 'moneyLender', 'visitor']
export const SUPPLIER_TYPES = ['retailer', 'wholesaler', 'manufacturer', 'distributor']
export const QUALIFICATIONS = [
  'SSC / 10th', 'HSC / 12th', 'Graduate', 'Post Graduate', 'B.E.', 'B.Tech.',
  'MBBS', 'BSMS', 'M.S.', 'M.D.', 'Dr.', 'PHD', 'Other',
]

/**
 * Which form sections apply to each person type.
 * oMunim ships three near-identical forms (Add Customer / Add Supplier / Add Money
 * Lender) and four separate list pages; we keep one form and one list, and simply
 * hide the sections that do not apply. Same coverage, none of the duplication.
 */
export const TYPE_SECTIONS: Record<string, string[]> = {
  customer:    ['basic', 'contact', 'address', 'tax', 'bank', 'nominee', 'finance', 'shipping', 'loyaltyKyc'],
  supplier:    ['basic', 'contact', 'address', 'tax', 'bank', 'finance', 'ledger'],
  karigar:     ['basic', 'contact', 'address', 'tax', 'bank', 'karigarWork', 'finance', 'ledger'],
  moneyLender: ['basic', 'contact', 'address', 'tax', 'bank', 'nominee', 'finance', 'ledger'],
  staff:       ['basic', 'contact', 'address', 'tax', 'bank', 'nominee', 'login'],
  visitor:     ['basic', 'contact', 'address'],
}

/** Sections open on first render — the rest stay collapsed so the form reads short. */
export const DEFAULT_OPEN_SECTIONS = ['basic', 'contact']
export const PURITIES = ['24K', '22K', '21K', '20K', '18K', '14K', '925', '999']
/**
 * Deliberately NOT `karat × 100 / 24` (oMunim's own STEP 2 arithmetic — see
 * STOCK_ADD_PANEL_CALCULATION.md §6 STEP 2, which gives 22K = 91.67%, 24K = 100.00%). These are
 * instead the BIS IS 1417 hallmarking fineness marks — the number actually stamped on Indian
 * jewellery and printed on a shop's rate board: 999/958/916/875/833/750/585 for 24/23/22/21/20/18/14K.
 * That standard is not simple rounding of the arithmetic: 14K's stamped fineness is 585 (not the
 * arithmetic 583.33) and 24K's practical fineness is 999 (there is no such thing as a commercially
 * hallmarked 100.0% pure gold). Adopting oMunim's raw formula would misprice 22K gold by about ₹70
 * per ₹1,00,000 in the wrong direction relative to what the hallmark itself certifies — so this
 * table is kept as-is. A firm can still override per item via `purityPercent`, and
 * normalizePurityPercent() in stock-calc.ts falls back to the raw karat×100/24 formula for any
 * karat NOT in this table (e.g. "17K"), where no official fineness mark exists to defer to.
 */
export const PURITY_PERCENT: Record<string, number> = {
  '24K': 99.9, '23K': 95.8, '22K': 91.6, '21K': 87.5, '20K': 83.3,
  '19K': 79.2, '18K': 75.0, '14K': 58.5, '925': 92.5, '999': 99.9,
}

/** Karat rows a pure-gold (24K) rate fans out to: '22K', '18K'... — not 24K itself, nor 925/999. */
export function isDerivableKarat(purity: string): boolean {
  const k = purity.trim().toUpperCase()
  return k.endsWith('K') && k !== '24K' && k in PURITY_PERCENT
}

/**
 * Suggested rate for `purity` from a 24K rate, in proportion to BIS fineness (same unit in, same
 * unit out — never converts units). 1,50,000 -> 22K 137,538 · 18K 112,613 · 14K 87,838.
 * Null when the purity is not on the ladder or the input is not a positive number.
 */
export function deriveKaratRate(rate24: number, purity: string): number | null {
  if (!(rate24 > 0) || !isDerivableKarat(purity)) return null
  return Math.round((rate24 * PURITY_PERCENT[purity.trim().toUpperCase()]) / PURITY_PERCENT['24K'])
}
/**
 * The stock drawers. `legacy` means STILL UNDERSTOOD EVERYWHERE, but no longer OFFERED as a choice —
 * a picker shows it only when the row being edited already carries it, so an existing item never
 * loses its own value from a dropdown that cannot display it.
 *
 * STERLING is legacy as of the owner's instruction ("remove that sterling option, because we have
 * already silver metal type"), and he is right: its spec row is byte-identical to `fine`
 * (src/lib/stock-spec.ts), so a sterling piece is simply a fine piece whose metal is silver.
 * Offering both asks the operator the same question twice and lets the two answers disagree.
 *
 * The VALUE is deliberately NOT deleted — it does a second, load-bearing job that nothing else does:
 * it is how a row with a NULL metalType is known to be silver (src/app/api/stock/route.ts's metal
 * filter, stock/summary's "null + sterling is silver", metalOf() in src/lib/accounting.ts,
 * melting.tsx), and it sets the `B` item-code prefix (stock + invoices routes) and the `B` barcode
 * drawer (src/lib/barcode.ts). Every one of those read paths stays exactly as it was, so the items
 * already stored as sterling keep valuing as silver, keep appearing under the silver filter and
 * keep their codes. A new silver piece is now `fine` + metalType 'silver' and takes prefix `P`.
 */
export const STOCK_CATEGORIES: { value: string; label: string; legacy?: true }[] = [
  { value: 'fine', label: 'Fine Jewellery' },
  { value: 'imitation', label: 'Imitation Jewellery' },
  { value: 'sterling', label: 'Sterling Silver', legacy: true },
  { value: 'raw', label: 'Raw Metal' },
  { value: 'crystal', label: 'Diamond / Crystal' },
]

/** The drawers a picker may OFFER, plus whatever the current row already is. One rule, one array. */
export const offeredStockCategories = (current?: string | null) =>
  STOCK_CATEGORIES.filter((c) => !c.legacy || c.value === current)
export const LOAN_TYPES = [
  { value: 'secured', label: 'Secured Loan' },
  { value: 'unsecured', label: 'Unsecured Loan' },
]
export const LOAN_STATUSES = ['active', 'released', 'auctioned', 'loss', 'transferred', 'tally']
/**
 * What each status is CALLED on screen — the stored values above are API vocabulary.
 *
 * `tally` is oMunim's "Tally loans" register tab, carried over without its meaning ever being
 * recorded (worklog: "oMunim's exact meaning is unknown"). In this system it is a REVERSIBLE REVIEW
 * MARKER and nothing else: PUT /api/loans allows only active -> tally and tally -> active
 * (PUT_TRANSITIONS in src/app/api/loans/route.ts), it posts nothing, and no interest rule reads it.
 * Labelled for what it does here — a loan set aside to be checked against the physical packet —
 * rather than for oMunim's word, which a clerk reads as "Tally" the accounting package.
 */
export const LOAN_STATUS_LABELS: Record<string, { label: string; hint: string }> = {
  active: { label: 'Active', hint: 'Money out, ornaments held' },
  released: { label: 'Released', hint: 'Repaid in full, ornaments returned' },
  auctioned: { label: 'Auctioned', hint: 'Defaulted, ornaments sold' },
  loss: { label: 'Written off', hint: 'In loss — principal not recovered' },
  transferred: { label: 'Transferred', hint: 'Legacy: moved to another firm/lender' },
  tally: { label: 'Under review', hint: 'Set aside for checking against the packet (oMunim "Tally"). Posts nothing; can be moved back to Active.' },
}
/**
 * Loan-to-value ceiling for a secured girvi, as a % of the appraised value of the pledge.
 * ONE number: the girvi calculator, the loan form and POST /api/loans all read it, so the "Max
 * loan" the calculator quotes is the same threshold the create warning fires on. It was 0.75
 * hard-coded in three places in girvicalc.tsx and enforced nowhere at all — oMunim disbursed
 * ₹14,82,926 against a pledge appraised at ₹1,02,976 (14x) without a murmur.
 *
 * A WARNING, NEVER A BLOCK. Over-lending against a known customer is a commercial decision a
 * pawnbroker is entitled to make; silently not noticing it is not.
 * ponytail: one global figure, not per-firm. Move to a Firm column when a firm asks for its own.
 */
export const GIRVI_MAX_LTV_PCT = 75
/** Namuna 15 clause (11) — where the pledged goods are physically kept. */
export const PLEDGE_PLACES = [
  { value: 'business', label: 'Business Premises' },
  { value: 'storage', label: 'Storage / Strong Room' },
  { value: 'house', label: 'House' },
]
export const PAYMENT_MODES = ['cash', 'card', 'upi', 'cheque', 'gold', 'mixed']
/** Tenders POST /api/expenses actually posts (cash -> Cash in Hand, cheque -> Cheques in Transit, the rest -> bank). */
export const EXPENSE_PAYMENT_MODES = ['cash', 'bank', 'upi', 'card', 'cheque'] as const
export const EXPENSE_CATEGORIES = ['rent', 'salary', 'utility', 'purchase', 'marketing', 'other']
export const ACCOUNT_TYPES = [
  { value: 'asset', label: 'Asset' },
  { value: 'liability', label: 'Liability' },
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
  { value: 'equity', label: 'Equity' },
]
