/**
 * Sample bills for the Invoice Design studio, so a layout can be previewed with no database and on
 * a fresh firm that has never billed.
 *
 * Every figure is produced by the REAL engines (computeSaleLine -> computeInvoiceTotals), the same
 * way POST /api/invoices stores a bill. Nothing here hand-computes a tax or a total, so a sample
 * cannot drift from the engine and print a reconcile warning on the owner's own design screen.
 * tests/unit/invoice-sample.test.ts pins that.
 *
 * Pure: no React, no prisma, no fetch. A print path may not throw, so an unknown type is `sale`.
 */
import { computeInvoiceTotals, type GstType } from '@/lib/gst'
import {
  computeSaleLine, metalRateToPerGram, type MetalKind, type SaleLineInput, type OmunimChargeInput,
} from '@/lib/stock-calc'
import type { PrintInvoice, PrintInvoiceItem } from './invoice-print'
import type { PrintCustomer } from './invoice-doc'
import type { FirmLike } from './print-sheet'

/** Sample figures only — a real bill reads these off the firm record, never from here. */
const RATES = { cgstRate: 1.5, sgstRate: 1.5, igstRate: 3 }

/** The sample's board rates, in each metal's OWN convention: gold ₹/10 g, silver ₹/kg. */
export const SAMPLE_RATES = { gold22: 72_300, gold24: 78_900, silver925: 86_000 } as const

export const SAMPLE_FIRM: FirmLike = {
  code: 'SAMPLE', name: 'Sample Jewellers', legalName: 'Sample Jewellers Pvt. Ltd.',
  address: '12, Sarafa Bazaar', city: 'Pune', state: 'Maharashtra', pincode: '411002',
  phone: '020 5550 0100', email: 'billing@sample-jewellers.example',
  gstin: '27ABCDE1234F1Z5', pan: 'ABCDE1234F', logoUrl: null,
}

export const SAMPLE_CUSTOMER: PrintCustomer = {
  id: 'sample-customer', firstName: 'Anjali', lastName: 'Deshmukh',
  address: '5, Shivaji Nagar', city: 'Pune', state: 'Maharashtra', pincode: '411005',
  mobile: '9800000000', gstin: '27AAAAA0000A1Z5', pan: null,
}

const NO: OmunimChargeInput = { value: 0, type: 'FX', by: 'byNetWt' }

type Spec = {
  name: string; itemCode?: string; hsnCode: string; huid?: string; stoneCertNo?: string
  metal: MetalKind; purity?: string
  line: SaleLineInput
  stoneWeight?: number
  /** InvoiceItem.stones snapshot (JSON text). */
  stones?: string
}

function lineInput(o: Partial<SaleLineInput>): SaleLineInput {
  return {
    qty: 1, grossWeight: 0, grossWeightUnit: 'GM', lessWeight: 0, lessWeightUnit: 'GM',
    packetWeight: 0, tagWeight: 0, purityPercent: 100, wastagePercent: 0,
    valuationBy: 'byNetWt', finalFineBy: 'byNetWt', metal: 'gold', metalRate: 0,
    byWeight: true, flatPrice: 0, stones: [],
    charges: { making: NO, labour: NO, other: NO },
    valueAddPct: 0, markUp: 0, discountPct: 0, gstRate: RATES.cgstRate + RATES.sgstRate, taxed: false,
    ...o,
  }
}

/** 22K ornament: 12.500 g gross, 0.500 g less, 2% wastage, making ₹450/g, priced at the 22K board
 *  rate declared as a 91.6% rate — so purity is applied once, not twice. Exported for the test. */
export const SAMPLE_GOLD_22K: SaleLineInput = lineInput({
  grossWeight: 12.5, lessWeight: 0.5, purityPercent: 91.6, ratePurityPercent: 91.6, wastagePercent: 2,
  metal: 'gold', metalRate: SAMPLE_RATES.gold22,
  charges: { making: { value: 450, type: 'GM', by: 'byNetWt' }, labour: NO, other: NO },
})

const SILVER: SaleLineInput = lineInput({
  grossWeight: 60, purityPercent: 92.5, ratePurityPercent: 92.5, metal: 'silver',
  metalRate: SAMPLE_RATES.silver925,
  charges: { making: { value: 8, type: 'GM', by: 'byNetWt' }, labour: NO, other: NO },
})

/**
 * A loose certified diamond, 0.50 ct (0.100 g), as the counter actually bills one: no metal, one
 * stone row priced at the SELL rate (the purchase rate is carried too, and must never print). The
 * engine derives the stone's value (0.5 ct x 85,000 = 42,500), the same way sell.tsx's stone rows
 * reach deriveLineStones() — the sample used to be a flat-priced line with no stone data, which no
 * counter can produce.
 */
const DIAMOND: SaleLineInput = lineInput({
  grossWeight: 0.1, metal: 'other', byWeight: true, metalRate: 0,
  stones: [{ weight: 0.5, weightUnit: 'CT', sellRate: 85_000, rate: 62_000, rateUnit: 'CT', qty: 1, deductFromGross: true }],
})

/** The InvoiceItem.stones snapshot of DIAMOND — the shape deriveLineStones() writes. */
const DIAMOND_STONES = JSON.stringify([{
  seq: 0, name: 'Diamond', clarity: 'VS1', colorGrade: 'G', shape: 'Round', size: null,
  certNo: '2185471', certLab: 'GIA', otherInfo: null, qty: 1, caratWeight: 0.5, weightUnit: 'CT',
  weightGrams: 0.1, rateCt: 62_000, rateUnit: 'CT', sellRateCt: 85_000, amount: 42_500, deductFromGross: true,
}])

/** Imitation bangle set, MRP-tagged: a real weight, a flat price. */
const MRP: SaleLineInput = lineInput({
  grossWeight: 25, metal: 'other', byWeight: false, flatPrice: 1_850,
})

const SALE_SPECS: Spec[] = [
  { name: 'Gold necklace 22K', itemCode: 'GN-0412', hsnCode: '7113', huid: 'AB1C23', metal: 'gold', purity: '22K', line: SAMPLE_GOLD_22K },
  { name: 'Silver payal pair', itemCode: 'SP-1180', hsnCode: '711311', metal: 'silver', purity: '925', line: SILVER },
  { name: 'Loose diamond 0.50 ct VS1 G', itemCode: 'DM-0077', hsnCode: '7102', stoneCertNo: 'GIA 2185471', metal: 'other', line: DIAMOND, stoneWeight: 0.1, stones: DIAMOND_STONES },
  { name: 'Imitation bangle set (MRP)', itemCode: 'IM-3301', hsnCode: '7117', metal: 'other', line: MRP },
]

type Build = {
  id: string; type: string; invoiceNo: string; specs: Spec[]
  gstType?: GstType; taxed?: boolean; inclusive?: boolean; discount?: number
  oldMetal?: { weight: number; rate: number; purity: string }
  /** cash/upi are fractions of the grand total; full = cash for everything not settled by old metal. */
  pay?: { cash?: number; upi?: number; settleOldMetal?: boolean; full?: boolean }
  extra?: Partial<PrintInvoice>
}

function build(b: Build): PrintInvoice {
  const taxed = b.taxed ?? true
  const sale = b.specs.map((s) => computeSaleLine({ ...s.line, taxed: false }))
  const t = computeInvoiceTotals({
    lines: sale.map((r, i) => ({ amount: r.taxable, hsnCode: b.specs[i].hsnCode })),
    discount: b.discount ?? 0, gstType: b.gstType ?? 'intra', rates: RATES, taxed,
    taxInclusive: !!b.inclusive,
    oldGoldWeight: b.oldMetal?.weight, oldGoldRate: b.oldMetal?.rate,
  })
  const items: PrintInvoiceItem[] = b.specs.map((s, i) => {
    const r = sale[i]
    return {
      id: `${b.id}-${i + 1}`, itemCode: s.itemCode, name: s.name, hsnCode: s.hsnCode,
      purity: s.purity ?? null, huid: s.huid ?? null, stoneCertNo: s.stoneCertNo ?? null,
      grossWeight: s.line.grossWeight, netWeight: r.netWeightGrams,
      stoneWeight: s.stoneWeight ?? null, stoneAmount: r.stoneValue || null, stones: s.stones ?? null,
      wastagePercent: s.line.wastagePercent || null,
      makingCharge: r.totalMaking || null,
      // Per gram on a weighed line (the metal's own rate converted once, like sell.tsx); the flat
      // piece price on an MRP line.
      rate: s.line.byWeight ? metalRateToPerGram(s.line.metalRate, s.metal) : s.line.flatPrice,
      amount: t.lineTax[i].base, cgst: t.lineTax[i].cgst, sgst: t.lineTax[i].sgst, igst: t.lineTax[i].igst,
      total: t.lineTax[i].total, metalType: s.metal, qty: 1,
      otherCharges: r.totalLabour + r.totalOther || null,
      valueAddAmount: r.valueAddAmount || null, markUp: r.markUp || null,
    }
  })

  const p = b.pay ?? {}
  const gold = p.settleOldMetal ? t.netOldGold : 0
  const cash = p.full ? round(t.totalAmount - gold) : Math.round(t.totalAmount * (p.cash ?? 0))
  const upi = Math.round(t.totalAmount * (p.upi ?? 0))
  return {
    id: b.id, type: b.type, invoiceNo: b.invoiceNo, invoiceDate: '2026-10-01',
    customerName: 'Anjali Deshmukh', customerMobile: SAMPLE_CUSTOMER.mobile,
    goldRate: SAMPLE_RATES.gold22,
    subtotal: t.subtotal, taxableValue: t.taxableValue, taxInclusive: !!b.inclusive,
    discount: t.discount, metalAmount: t.metalAmount,
    cgst: t.cgst, sgst: t.sgst, igst: t.igst, rofAmount: t.rofAmount, totalAmount: t.totalAmount,
    ...(b.oldMetal ? {
      oldGoldWeight: b.oldMetal.weight, oldGoldRate: b.oldMetal.rate, oldGoldPurity: b.oldMetal.purity,
      oldGoldValue: t.oldGoldValue, bhavCut: 0,
    } : {}),
    amountByCash: cash || null, amountByUPI: upi || null, amountByGold: gold || null,
    paymentMode: cash && upi ? 'split' : cash ? 'cash' : null,
    salesPersonName: 'Rakesh', counterName: 'Counter 1', status: 'completed',
    items,
    ...b.extra,
  }
}

const round = (n: number) => Math.round(n * 100) / 100

const sale = (): PrintInvoice => build({
  id: 'sample-sale', type: 'sale', invoiceNo: 'SAMPLE/0001', specs: SALE_SPECS,
  discount: 1_000, oldMetal: { weight: 5, rate: 66_000, purity: '22K / 91.6' },
  pay: { cash: 0.3, upi: 0.2, settleOldMetal: true },
  extra: { loyaltyEarned: 120 },
})

/** Tax-INCLUSIVE ("TAX BY VAL"): item amounts already contain GST. No discount, so that
 *  taxableValue + tax === items total exactly. */
const saleInclusive = (): PrintInvoice => build({
  id: 'sample-sale-inclusive', type: 'sale', invoiceNo: 'SAMPLE/0002', specs: SALE_SPECS,
  inclusive: true, pay: { cash: 0.5, upi: 0.25 },
})

const purchase = (): PrintInvoice => build({
  id: 'sample-purchase', type: 'purchase', invoiceNo: 'PUR/0001',
  specs: [SALE_SPECS[0], SALE_SPECS[1]], pay: { full: true },
})

const urd = (): PrintInvoice => build({
  id: 'sample-urd', type: 'urd', invoiceNo: 'URD/0001', taxed: false,
  specs: [{
    ...SALE_SPECS[0], name: 'Old gold ornament 22K', huid: undefined,
    line: { ...SAMPLE_GOLD_22K, charges: { making: NO, labour: NO, other: NO }, wastagePercent: 0 },
  }],
  pay: { full: true },
})

const saleReturn = (): PrintInvoice => build({
  id: 'sample-sale-return', type: 'sale-return', invoiceNo: 'CN/0001',
  specs: [SALE_SPECS[1]], pay: { full: true },
})

const purchaseReturn = (): PrintInvoice => build({
  id: 'sample-purchase-return', type: 'purchase-return', invoiceNo: 'DN/0001',
  specs: [SALE_SPECS[0]], pay: { full: true },
})

const MAKERS: Record<string, () => PrintInvoice> = {
  sale, 'sale-inclusive': saleInclusive, purchase, urd, 'sale-return': saleReturn, 'purchase-return': purchaseReturn,
}

/** Every id sampleInvoice() knows. 'sale-inclusive' is the tax-inclusive layout branch. */
export const SAMPLE_IDS = Object.keys(MAKERS)

/** A complete, reconciling bill for `type`. Unknown or empty falls back to the `sale` sample. */
export function sampleInvoice(type: string): PrintInvoice {
  const make = Object.prototype.hasOwnProperty.call(MAKERS, type) ? MAKERS[type] : sale
  return make()
}
