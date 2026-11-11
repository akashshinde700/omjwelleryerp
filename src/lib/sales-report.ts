import { round2, derivePlaceOfSupply } from '@/lib/gst'
import { metalPerPiece } from '@/components/app/print/invoice-print'

// GST SELL REPORT (oMunim's Ledger): one row per invoice LINE.
//
// THE TRAP: tender (cash/bank/card/online), previous amount, round off, total discount and GSTIN
// belong to the INVOICE, but every row is a line. A 3-line bill repeats the same cash 3 times, so
// summing that column down the rows triples the takings. Therefore:
//   - line columns are summed over rows;
//   - invoice columns are summed over DISTINCT invoices (invoiceId), never over rows.
// Every figure below is a stored column; nothing is re-priced. Not sourced (no stored value, and a
// plausible number would be a lie): DIA.WT/DIA.VAL (no diamond predicate exists; stones JSON is
// free-text named), LBR.VAL (labour is folded into otherCharges at save), MKG CHARGE DISC, GS WT TYPE
// (unit is stripped at save).
// MET.VAL IS derivable: invoice-print's metalPerPiece x qty (the engine's own identity). It is left
// BLANK (null, not 0) when the line carries a stone but no stoneAmount (legacy bill): the identity
// would then hand the stone's value to the metal. A blank on a GST return beats a wrong number.

type Inv = Record<string, any> & { items: Record<string, any>[] }
const n = (v: unknown) => Number(v) || 0

export type SaleRow = {
  id: string; invoiceId: string; invoiceNo: string; invoiceDate: string; firm: string
  party: string; mobile: string; address: string; metalType: string; category: string
  itemCode: string; name: string; hsnCode: string; qty: number; grossWeight: number; netWeight: number
  purity: string; stoneWeight: number; stoneAmount: number; rate: number
  taxable: number; cgst: number; sgst: number; igst: number; total: number; huid: string
  /** Per-line metal value; null = not derivable (legacy line with a stone but no stoneAmount). */
  metalValue: number | null
  /** StockItem.barcode of the linked piece; '' for a manually typed line (no stock item). */
  tagNo: string
  /** invoiceNo split on its LAST '-' or '/': 'INV-1036' -> 'INV' + '1036'. No separator: '' + whole. */
  invSeries: string; invSeq: string
  /** Set only on the one extra row that reconciles a bill's lines to its own header. */
  residual?: 'metal' | 'unexplained'
  /** Invoice-level - identical on every line of the bill. Never sum these over rows. */
  inv: {
    gstin: string; cash: number; bank: number; card: number; online: number; previous: number; roundOff: number; totalDisc: number
    gold: number; oldGoldWeight: number; oldGoldValue: number; bhavCut: number; loyaltyRedeemed: number; loyaltyEarned: number; billTotal: number
    goldRate: number; oldGoldRate: number
    salesPerson: string; staffCode: string; counterName: string; billingName: string; supplierBillNo: string; paymentMode: string
    taxInclusive: string; note: string; oldGoldPurity: string; irn: string
  }
  /** Line columns straight from InvoiceItem. Charges are per-piece x qty (the engine stores them per piece); 0 = none. */
  makingCharge: number; otherCharges: number; valueAdd: number; markUp: number; discountAmount: number
  lessWeight: number; packetWeight: number; tagWeight: number; cwWeight: number
  wastagePercent: number; valueAddPct: number; discountPct: number
  size: string; length: string; modelNo: string; counterNo: string; otherInfo: string; stoneCertNo: string
  /** GSTR-1 facts. supplyType comes from the tax CHARGED; supplyCheck compares it with the two states. */
  placeOfSupply: string; b2b: 'B2B' | 'B2C'; supplyType: '' | 'Intra' | 'Inter'; supplyCheck: string; taxRate: number
}

export const LINE_SUM = ['qty', 'grossWeight', 'netWeight', 'stoneWeight', 'stoneAmount', 'metalValue', 'makingCharge', 'otherCharges', 'valueAdd', 'markUp', 'discountAmount', 'lessWeight', 'packetWeight', 'tagWeight', 'cwWeight', 'taxable', 'cgst', 'sgst', 'igst', 'total'] as const
export const INV_SUM = ['cash', 'bank', 'card', 'online', 'previous', 'roundOff', 'totalDisc', 'gold', 'oldGoldWeight', 'oldGoldValue', 'bhavCut', 'loyaltyRedeemed', 'loyaltyEarned', 'billTotal'] as const

export function splitInvoiceNo(no: string): { series: string; seq: string } {
  const m = /^(.+)[-/](.+)$/.exec(no || '')
  return m ? { series: m[1], seq: m[2] } : { series: '', seq: no || '' }
}

/** Stored per piece (see invoice-print's identity), shown as line values so they tie to MET.VAL and the line total.
 *  The stone figures (stoneAmount, stoneWeight) are per piece too - stored from one piece's stones - and are scaled the same way in flattenInvoices. */
const qtyOf = (l: Record<string, any>) => Math.max(1, Math.round(n(l.qty) || 1))

/** STN.WT multiplier. Per piece when the stones array wrote it (deriveLineStones) or the line was typed by hand. A stock-backed
 *  line with no stones array had its stoneWeight FILLED from the StockItem, which holds a LOT total (and is not scaled for a
 *  part-sale): multiplying that by qty would triple-count, so it is left as stored. See the weight probe in tests/api. */
const stoneWtQty = (l: Record<string, any>) => (l.stockItemId && !(l.stones && l.stones !== '[]') ? 1 : qtyOf(l))

function lineExtra(l: Record<string, any>) {
  const q = qtyOf(l)
  const ln = (v: unknown) => round2(n(v) * q)
  return {
    makingCharge: ln(l.makingCharge), otherCharges: ln(l.otherCharges), valueAdd: ln(l.valueAddAmount), markUp: ln(l.markUp),
    discountAmount: n(l.discountAmount), lessWeight: n(l.lessWeight), packetWeight: n(l.packetWeight), tagWeight: n(l.tagWeight), cwWeight: n(l.cwWeight),
    wastagePercent: n(l.wastagePercent), valueAddPct: n(l.valueAddPct), discountPct: n(l.discountPct),
    size: l.size || '', length: l.length || '', modelNo: l.modelNo || '', counterNo: l.counterNo || '', otherInfo: l.otherInfo || '', stoneCertNo: l.stoneCertNo || '',
  }
}

const SLABS = [0.1, 0.25, 1, 1.5, 3, 5, 12, 18, 28] // GST rates for goods; the tax is rounded to the paisa per half, so one paisa of slack

/** What a CA files from. Supply type is what was CHARGED (igst>0 = inter, cgst/sgst = intra), never inferred
 *  from the states; the states only produce a check. Rate is derived from the charged tax (none is stored). */
function gstFacts(cgst: number, sgst: number, igst: number, taxable: number, c: Record<string, any> | undefined, firmState: string) {
  const supplyType: SaleRow['supplyType'] = igst > 0 ? 'Inter' : cgst > 0 || sgst > 0 ? 'Intra' : ''
  const said = derivePlaceOfSupply(firmState, c?.state)
  const want = said === 'inter' ? 'Inter' : said === 'intra' ? 'Intra' : ''
  const supplyCheck = !supplyType ? '' : !want ? 'States unknown' : want === supplyType ? 'OK' : `CHECK: states say ${want.toLowerCase()}-state`
  const tax = cgst + sgst + igst
  const raw = taxable > 0.005 ? (tax / taxable) * 100 : 0
  // A rate is printed as a statutory slab ONLY when the paisa rounding of the charged tax proves it: every other slab
  // is more than a paisa away. Otherwise the true derived rate is shown - never a nearest-quarter guess (that printed
  // 3.25% for a Rs 5 line taxed at 3%, and 3% for a line truly taxed at 2.97%).
  const hits = SLABS.filter((s) => Math.abs(tax - (taxable * s) / 100) <= 0.011)
  return {
    placeOfSupply: c?.state || '', b2b: (c?.gstin ? 'B2B' : 'B2C') as 'B2B' | 'B2C', supplyType, supplyCheck,
    taxRate: raw ? (hits.length === 1 ? hits[0] : round2(raw)) : 0,
  }
}

function metalValueOf(l: Record<string, any>): number | null {
  const hasStone = n(l.stoneWeight) > 0 || !!l.stoneCertNo || (!!l.stones && l.stones !== '[]')
  if (hasStone && !(n(l.stoneAmount) > 0)) return null
  const per = metalPerPiece(l as any)
  const v = round2(per * qtyOf(l))
  return v < 0 ? null : v
}

const invParts = (no: string) => { const { series, seq } = splitInvoiceNo(no); return { invSeries: series, invSeq: seq } }

/** `customers` is the firm's own Customer rows for these invoices (address / GSTIN live there). */
export function flattenInvoices(invoices: Inv[], customers: Map<string, Record<string, any>>, firmName: string, tags: Map<string, string> = new Map(), firmState = ''): SaleRow[] {
  return invoices.flatMap((i) => {
    const c = i.customerId ? customers.get(i.customerId) : undefined
    const inv: SaleRow['inv'] = {
      gstin: c?.gstin || '',
      cash: n(i.amountByCash), bank: n(i.amountByCheque), card: n(i.amountByCard), online: n(i.amountByUPI),
      previous: n(i.previousAmount), roundOff: n(i.rofAmount),
      gold: n(i.amountByGold), oldGoldWeight: n(i.oldGoldWeight), oldGoldValue: n(i.oldGoldValue), bhavCut: n(i.bhavCut),
      loyaltyRedeemed: n(i.loyaltyRedeemed), loyaltyEarned: n(i.loyaltyEarned), billTotal: n(i.totalAmount),
      goldRate: n(i.goldRate), oldGoldRate: n(i.oldGoldRate),
      salesPerson: i.salesPersonName || '', staffCode: i.staffCode || '', counterName: i.counterName || '', billingName: i.billingName || '',
      supplierBillNo: i.supplierBillNo || '', paymentMode: i.paymentMode || '', taxInclusive: i.taxInclusive ? 'Yes' : '', note: i.note || '',
      oldGoldPurity: i.oldGoldPurity || '', irn: i.irn || '',
      // invoice-level discount + the per-line discounts that were taken before the line was saved
      totalDisc: round2(n(i.discount) + i.items.reduce((s, l) => s + n(l.discountAmount), 0)),
    }
    const lines: SaleRow[] = i.items.map((l) => ({
      id: l.id, invoiceId: i.id, invoiceNo: i.invoiceNo, invoiceDate: new Date(i.invoiceDate).toISOString(), firm: firmName,
      party: i.customerName || '', mobile: i.customerMobile || '', address: [c?.address, c?.city].filter(Boolean).join(', '),
      metalType: l.metalName || l.metalType || '', category: l.itemCategory || '',
      itemCode: l.itemCode || '', name: l.name || '', hsnCode: l.hsnCode || '', qty: n(l.qty),
      grossWeight: n(l.grossWeight), netWeight: n(l.netWeight), purity: l.purity || '',
      stoneWeight: Math.round(n(l.stoneWeight) * stoneWtQty(l) * 1000) / 1000, stoneAmount: round2(n(l.stoneAmount) * qtyOf(l)), rate: n(l.rate),
      // taxable is not a column: line total = taxable + cgst + sgst + igst exactly (computeInvoiceTotals)
      taxable: round2(n(l.total) - n(l.cgst) - n(l.sgst) - n(l.igst)),
      cgst: n(l.cgst), sgst: n(l.sgst), igst: n(l.igst), total: n(l.total), huid: l.huid || '', inv,
      ...lineExtra(l), ...gstFacts(n(l.cgst), n(l.sgst), n(l.igst), n(l.total) - n(l.cgst) - n(l.sgst) - n(l.igst), c, firmState), metalValue: metalValueOf(l), tagNo: (l.stockItemId && tags.get(l.stockItemId)) || '', ...invParts(i.invoiceNo),
    }))
    // RECONCILIATION. A register must never silently differ from the invoice it came from, so the
    // line figures are compared with the invoice's own stored taxable value and GST; any difference
    // beyond a paisa becomes ONE extra row on that bill, never a change to a line. Two honest kinds:
    //   'metal'       - header "Metal Amount" (loose metal) is taxed as a pseudo-line that is not an
    //                   InvoiceItem (computeInvoiceTotals), AND the bill's own total still equals its
    //                   components. A known, explained cause.
    //   'unexplained' - anything else (e.g. legacy/seeded bills with tax on the header and none on the
    //                   lines, or a bill whose stored total is not its components). Labelled as such
    //                   and counted in the report's basis block so the bill gets fixed, not filed.
    // Stored taxable falls back to subtotal - discount + metal for rows written before the column
    // existed (same rule as buildLedgerEntries); if neither exists it is unknown and not compared.
    const sumOf = (k: 'taxable' | 'cgst' | 'sgst' | 'igst') => lines.reduce((t, r) => t + r[k], 0)
    const storedTaxable = n(i.taxableValue) > 0 ? n(i.taxableValue) : n(i.subtotal) > 0 ? round2(n(i.subtotal) - n(i.discount) + n(i.metalAmount)) : null
    const d = (stored: number, rows: number) => { const x = round2(stored - rows); return Math.abs(x) > 0.01 ? x : 0 }
    const taxable = storedTaxable === null ? 0 : d(storedTaxable, sumOf('taxable'))
    const cgst = d(n(i.cgst), sumOf('cgst')), sgst = d(n(i.sgst), sumOf('sgst')), igst = d(n(i.igst), sumOf('igst'))
    if (taxable || cgst || sgst || igst) {
      const components = storedTaxable === null ? null
        : round2(storedTaxable + n(i.cgst) + n(i.sgst) + n(i.igst) + n(i.previousAmount) - n(i.loyaltyRedeemed) + n(i.rofAmount))
      const coherent = components !== null && Math.abs(components - n(i.totalAmount)) <= 0.01
      const residual = n(i.metalAmount) > 0 && coherent ? 'metal' : 'unexplained'
      const name = residual === 'metal' ? 'Loose metal (bill header)'
        : 'UNRECONCILED: bill header differs from its lines' +
          (coherent ? '' : ` (stored total ${n(i.totalAmount)}${components === null ? '' : ` but its parts add to ${components}`})`) + ' - check this bill'
      lines.push({
        id: `${i.id}:residual`, invoiceId: i.id, invoiceNo: i.invoiceNo, invoiceDate: new Date(i.invoiceDate).toISOString(), firm: firmName,
        party: i.customerName || '', mobile: i.customerMobile || '', address: [c?.address, c?.city].filter(Boolean).join(', '), inv, name, itemCode: '', hsnCode: '', qty: 0, grossWeight: 0, netWeight: 0,
        purity: '', stoneWeight: 0, stoneAmount: 0, rate: 0, huid: '', category: '', metalType: '', residual, ...lineExtra({}), ...gstFacts(0, 0, 0, 0, c, firmState), metalValue: null, tagNo: '', ...invParts(i.invoiceNo),
        taxable, cgst, sgst, igst, total: round2(taxable + cgst + sgst + igst),
      })
    }
    return lines
  })
}

/** TOTALS row. Invoice-level columns count each invoice once, however many lines it has. */
export function totalsOf(rows: Pick<SaleRow, 'invoiceId' | 'inv'>[] & Partial<SaleRow>[]) {
  const out: Record<string, number> = {}
  for (const k of LINE_SUM) out[k] = round2(rows.reduce((s, r) => s + n((r as any)[k]), 0))
  const seen = new Map<string, SaleRow['inv']>()
  for (const r of rows) if (!seen.has(r.invoiceId!)) seen.set(r.invoiceId!, r.inv!)
  for (const k of INV_SUM) out[k] = round2([...seen.values()].reduce((s, v) => s + v[k], 0))
  return out
}
