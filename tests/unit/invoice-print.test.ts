import { describe, it, expect } from 'vitest'
import { stoneColumnAmount, lineFineWeight, lineMakingPercent, LINE_COLUMN_LABELS } from '@/components/app/print/invoice-print'
import { sampleInvoice, SAMPLE_IDS } from '@/components/app/print/invoice-sample'
import { computeInvoiceTotals, type GstRates } from '@/lib/gst'
import {
  invoiceFigures, parseInvoiceConfig, pageMargin, contentWidthMm, lineRate, invoiceTitle,
  metalOfLine, metalSubtotals, itemColumnSpans, billRates, INVOICE_PRESETS, matchesPreset,
  normalizeAccent, accentPaint, contrastRatio, normalizeBanner, printableHeightMm, oldMetalRate,
  stoneDetail, stoneAwareConfig,
  DEFAULT_INVOICE_CONFIG, INVOICE_LAYOUT_KEY, INVOICE_BANNER_KEYS, BANNER_MAX_CHARS,
  bannerSpareMm, invoiceLayoutKey,
  type PrintInvoice, type PrintInvoiceItem, type InvoiceConfig, type FirmRate,
} from '@/components/app/print/invoice-print'
import { amountInWords } from '@/components/app/print/print-sheet'

/**
 * Pins the four defects captured on oMunim's real printed invoices so none of them can come back.
 * Owner: ux-design-lead (figures reviewed with qa-finance's rules in src/lib/gst.ts).
 */

const RATES: GstRates = { cgstRate: 1.5, sgstRate: 1.5, igstRate: 3.0 }

/** Builds the invoice row the server would have stored, so the test never invents its own maths. */
function posted(input: {
  lines: { amount: number; hsnCode?: string }[]
  discount?: number
  metalAmount?: number
  previousAmount?: number
  paid?: Partial<Pick<PrintInvoice, 'amountByCash' | 'amountByCard' | 'amountByUPI'>>
  /** Simulates the oMunim bug: a charge inside the header subtotal with no item line for it. */
  hiddenCharge?: number
}): PrintInvoice {
  const t = computeInvoiceTotals({
    lines: input.lines,
    discount: input.discount,
    metalAmount: input.metalAmount,
    previousAmount: input.previousAmount,
    gstType: 'intra',
    rates: RATES,
    taxed: true,
  })
  return {
    id: 'i1',
    type: 'sale',
    invoiceNo: 'INV-1',
    invoiceDate: '2026-01-10',
    customerName: 'Test',
    subtotal: t.subtotal,
    discount: t.discount,
    metalAmount: t.metalAmount,
    cgst: t.cgst,
    sgst: t.sgst,
    igst: t.igst,
    previousAmount: t.previousAmount,
    rofAmount: t.rofAmount,
    totalAmount: t.totalAmount,
    ...input.paid,
    items: input.lines.map((l, i) => ({
      id: `it${i}`,
      name: `Item ${i + 1}`,
      hsnCode: l.hsnCode ?? '7113',
      netWeight: 10,
      rate: 60000,
      // The hidden charge is deliberately NOT given a line, exactly as oMunim did with its
      // ₹45/piece hallmarking fee.
      amount: i === 0 ? l.amount - (input.hiddenCharge || 0) : l.amount,
      cgst: t.lineTax[i].cgst,
      sgst: t.lineTax[i].sgst,
      igst: t.lineTax[i].igst,
      total: t.lineTax[i].total,
    })),
  }
}

describe('defect 1 — one sheet, one total', () => {
  it('the HSN summary sums to exactly the header tax, metal pseudo-line included', () => {
    // 86.175 of tax is the shape of the bill where oMunim printed 5,918.00 in the summary and
    // 5,917.00 in the HSN block.
    const inv = posted({ lines: [{ amount: 2872.5 }], metalAmount: 0 })
    const f = invoiceFigures(inv)
    const sum = (k: 'cgst' | 'sgst' | 'igst') => f.taxGroups.reduce((s, g) => s + g[k], 0)
    expect(sum('cgst')).toBeCloseTo(f.cgst, 2)
    expect(sum('sgst')).toBeCloseTo(f.sgst, 2)
    expect(sum('igst')).toBeCloseTo(f.igst, 2)
  })

  it('still ties when loose metal carries tax that no item line holds', () => {
    const inv = posted({ lines: [{ amount: 5000 }, { amount: 3000, hsnCode: '7117' }], metalAmount: 12345.67 })
    const f = invoiceFigures(inv)
    const sum = (k: 'cgst' | 'sgst' | 'igst') => f.taxGroups.reduce((s, g) => s + g[k], 0)
    expect(sum('cgst')).toBeCloseTo(f.cgst, 2)
    expect(sum('sgst')).toBeCloseTo(f.sgst, 2)
    // The loose metal is a row of its own; it is never folded into a jewellery HSN.
    expect(f.taxGroups.map((g) => g.hsn)).toContain('Loose metal')
  })

  it('every group carries a taxable value that adds up to the invoice taxable value', () => {
    const inv = posted({ lines: [{ amount: 5000 }, { amount: 3000, hsnCode: '7117' }], discount: 500 })
    const f = invoiceFigures(inv)
    const taxable = f.taxGroups.reduce((s, g) => s + g.taxable, 0)
    expect(taxable).toBeCloseTo(f.taxableValue, 2)
  })
})

describe('defect 2 — round off is applied once', () => {
  it('the words are the grand total, not the pre-round-off figure', () => {
    const inv = posted({ lines: [{ amount: 176_000 }], previousAmount: 0 })
    const f = invoiceFigures(inv)
    expect(amountInWords(f.grandTotal)).toBe(amountInWords(inv.totalAmount!))
    // Whole rupees: the total is already rounded, so the words never carry a "Point Six Six".
    expect(amountInWords(f.grandTotal)).not.toMatch(/Paise/)
  })

  it('the printed rows rebuild the stored total exactly', () => {
    const inv = posted({ lines: [{ amount: 2872.5 }], discount: 100, previousAmount: 1234.56 })
    const f = invoiceFigures(inv)
    const rebuilt = f.taxableValue + f.taxTotal + f.previousAmount - f.loyaltyRedeemed + f.rofAmount
    expect(rebuilt).toBeCloseTo(f.grandTotal, 2)
    expect(f.warnings).toEqual([])
  })

  it('spells Forty, not Fourty', () => {
    expect(amountInWords(45)).toBe('Forty Five Rupees Only')
  })
})

describe('defect 3 — nothing reaches a total without a printed line', () => {
  it('surfaces a charge that is in the subtotal but has no item row', () => {
    // 13 pieces × ₹45 hallmarking = ₹585, folded into the taxable value and never named.
    const inv = posted({ lines: [{ amount: 50_000 }], hiddenCharge: 585 })
    const f = invoiceFigures(inv)
    expect(f.unitemised).toBeCloseTo(585, 2)
    // …and the rows still rebuild the total, because the ₹585 is now one of the rows.
    const rebuilt = f.itemTotal + f.unitemised - f.discount + f.metalAmount + f.taxTotal + f.rofAmount
    expect(rebuilt).toBeCloseTo(f.grandTotal, 2)
  })

  it('is silent when every rupee is accounted for by a line', () => {
    const f = invoiceFigures(posted({ lines: [{ amount: 50_000 }, { amount: 1_250.25 }] }))
    expect(f.unitemised).toBe(0)
    expect(f.warnings).toEqual([])
  })

  it('warns on the sheet when the stored total cannot be rebuilt from the rows', () => {
    const inv = posted({ lines: [{ amount: 10_000 }] })
    const f = invoiceFigures({ ...inv, totalAmount: (inv.totalAmount || 0) + 7 })
    expect(f.warnings).toHaveLength(1)
    expect(f.warnings[0]).toMatch(/Check this bill/)
  })
})

describe('defect 4 — the balance is labelled as a balance', () => {
  it('is zero on a fully paid bill, so the sheet can print "Paid in full"', () => {
    const inv = posted({ lines: [{ amount: 10_000 }] })
    const f = invoiceFigures({ ...inv, amountByCash: inv.totalAmount })
    expect(f.paidTotal).toBeCloseTo(f.grandTotal, 2)
    expect(f.balance).toBe(0)
  })

  it('is signed: negative means the shop owes the customer a refund', () => {
    const inv = posted({ lines: [{ amount: 10_000 }] })
    const f = invoiceFigures({ ...inv, amountByCash: (inv.totalAmount || 0) + 500 })
    expect(f.balance).toBeCloseTo(-500, 2)
  })

  it('lists only the tenders actually used', () => {
    const inv = posted({ lines: [{ amount: 10_000 }] })
    const f = invoiceFigures({ ...inv, amountByCash: 5000, amountByUPI: 2000, amountByCard: 0 })
    expect(f.paid.map((p) => p.label)).toEqual(['Cash', 'UPI'])
  })
})

/**
 * Defect 5 — a printed rate whose unit nobody can rely on.
 *
 * It used to be answered at the column HEADING, from the firm's `calc.rateUnit` setting. That
 * setting governs the Add-Stock path and not a stored invoice line, so on a default firm the header
 * said "₹/10 g" over a per-GRAM number: INV-1029 printed ₹13,753.80 under a rate band reading
 * ₹1,37,538 ₹/10 g for the same gold on the same sheet. The unit now comes off the LINE, with the
 * value, so the two cannot be separated again. Nothing stored changed.
 */
describe('defect 5 — every printed rate carries its own unit', () => {
  const rateLine = (o: Partial<PrintInvoiceItem>): PrintInvoiceItem =>
    ({ name: 'Item', netWeight: 10, amount: 0, ...o })

  it('scales a weight-priced gold line from the stored per-gram figure to ₹/10 g', () => {
    // 13,753.80 per gram IS 1,37,538 per 10 g — a unit conversion, not a new figure.
    expect(lineRate(rateLine({ rate: 13753.8, metalType: 'gold', netWeight: 9, amount: 123784.2 })))
      .toEqual({ rate: 137538, unit: '₹/10 g' })
  })

  it('scales a weight-priced silver line to ₹/kg', () => {
    expect(lineRate(rateLine({ rate: 85.5, metalType: 'silver', netWeight: 50, amount: 4275.5 })))
      .toEqual({ rate: 85500, unit: '₹/kg' })
  })

  it('never scales an MRP line, even one with a real weight and a real metal', () => {
    // The identity: (amount + discountAmount) / qty − the non-metal components === the stored rate.
    // 2 pieces at ₹2,500 with ₹300 of making each. An imitation bangle HAS a weight, so guessing
    // from netWeight alone would print ₹25,000 here and invent a fresh 10x error.
    expect(lineRate(rateLine({
      rate: 2500, metalType: 'gold', netWeight: 12, qty: 2, makingCharge: 300, amount: 5600,
    }))).toEqual({ rate: 2500, unit: '₹/pc' })
  })

  it('reads the identity through a line discount', () => {
    expect(lineRate(rateLine({ rate: 2500, metalType: 'gold', amount: 2300, discountAmount: 200 })))
      .toEqual({ rate: 2500, unit: '₹/pc' })
  })

  it('treats a weightless line as priced per piece', () => {
    expect(lineRate(rateLine({ rate: 999, metalType: 'gold', netWeight: 0, amount: 12345 })))
      .toEqual({ rate: 999, unit: '₹/pc' })
  })

  it('prints nothing at all when there is no rate — the cell keeps its dash', () => {
    expect(lineRate(rateLine({ rate: 0 }))).toBeNull()
    expect(lineRate(rateLine({ rate: null }))).toBeNull()
    expect(lineRate(rateLine({}))).toBeNull()
    expect(lineRate(rateLine({ rate: -5 }))).toBeNull()
  })

  it('never scales a metal it could not establish — ₹/g, verbatim', () => {
    // No metalType, no HSN, no purity, a name that says nothing: metalOfLine() returns 'other'.
    expect(lineRate(rateLine({ rate: 500, name: 'Repair', amount: 9999 })))
      .toEqual({ rate: 500, unit: '₹/g' })
  })

  it('prefers the stored metalType over the inference, and falls back to it when absent', () => {
    // HSN 7106 is silver; a stored metalType of 'gold' is what the counter actually picked.
    expect(lineRate(rateLine({ rate: 100, metalType: 'gold', hsnCode: '7106', amount: 1 })))
      .toEqual({ rate: 1000, unit: '₹/10 g' })
    expect(lineRate(rateLine({ rate: 100, hsnCode: '7106', amount: 1 })))
      .toEqual({ rate: 100000, unit: '₹/kg' })
  })

  it('INV-1029: the mring line now agrees with the rate band above it', () => {
    const inv1029Line: PrintInvoiceItem = {
      name: 'mring', rate: 13753.8, grossWeight: 10, netWeight: 9, purity: '22k',
      metalType: 'gold', amount: 125784.2,
    }
    expect(lineRate(inv1029Line)).toEqual({ rate: 137538, unit: '₹/10 g' })
  })
})

/**
 * Defect 6 — INV-1029 was a tax-INCLUSIVE bill printed in the exclusive layout.
 *
 * Its totals column was arithmetically sound and simply mislabelled; its HSN summary was not — the
 * taxable column was Σ `it.amount`, the GROSS tax-included figure, printed beside the header's tax.
 */
describe('defect 6 — a tax-inclusive bill reconciles on the sheet', () => {
  /** INV-1029's header, verbatim. Nothing here is derived, so a regression moves a printed number. */
  const inv1029: PrintInvoice = {
    id: 'i1029',
    type: 'sale',
    invoiceNo: 'INV-1029',
    invoiceDate: '2026-09-20',
    customerName: 'Walk-in',
    taxInclusive: true,
    subtotal: 125_784.2,
    taxableValue: 122_120.58,
    cgst: 1_831.81,
    sgst: 1_831.81,
    rofAmount: -0.2,
    totalAmount: 125_784,
    items: [{
      name: 'mring', hsnCode: '7113', rate: 13753.8, grossWeight: 10, netWeight: 9,
      purity: '22k', metalType: 'gold', amount: 125_784.2, cgst: 1_831.81, sgst: 1_831.81,
    }],
  }

  it('is sound arithmetic, so no warning banner fires', () => {
    const f = invoiceFigures(inv1029)
    expect(f.taxInclusive).toBe(true)
    expect(f.itemTotal).toBe(125_784.2)
    expect(f.taxableValue).toBe(122_120.58)
    expect(f.taxTotal).toBe(3_663.62)
    expect(f.rofAmount).toBe(-0.2)
    expect(f.grandTotal).toBe(125_784)
    // 1,22,120.58 + 1,831.81 + 1,831.81 = 1,25,784.20, then − 0.20 = 1,25,784. Both steps print.
    expect(f.taxableValue + f.taxTotal + f.rofAmount).toBeCloseTo(f.grandTotal, 2)
    expect(f.warnings).toEqual([])
  })

  it('prints the extracted taxable value in the HSN summary, not the gross', () => {
    const f = invoiceFigures(inv1029)
    // Was 1,25,784.20 against 3,663.62 of tax — 2.91%, on a GSTR-1 HSN shape.
    expect(f.taxGroups.map((g) => g.taxable)).toEqual([122_120.58])
    expect(f.taxGroups.reduce((s, g) => s + g.taxable, 0)).toBeCloseTo(f.taxableValue, 2)
    // …and the tax columns still sum to the header, exactly as before.
    expect(f.taxGroups.reduce((s, g) => s + g.cgst, 0)).toBeCloseTo(f.cgst, 2)
    expect(f.taxGroups.reduce((s, g) => s + g.sgst, 0)).toBeCloseTo(f.sgst, 2)
    expect(f.taxGroups.reduce((s, g) => s + g.igst, 0)).toBeCloseTo(f.igst, 2)
  })

  it('ties across several HSNs and drops the remainder on the last group', () => {
    const inv: PrintInvoice = {
      ...inv1029,
      subtotal: 30_900,
      taxableValue: 30_000,
      cgst: 450, sgst: 450, rofAmount: 0, totalAmount: 30_900,
      items: [
        { name: 'A', hsnCode: '7113', amount: 20_600, cgst: 300, sgst: 300 },
        { name: 'B', hsnCode: '7117', amount: 10_300, cgst: 150, sgst: 150 },
      ],
    }
    const f = invoiceFigures(inv)
    expect(f.taxGroups.map((g) => g.taxable)).toEqual([20_000, 10_000])
    expect(f.taxGroups.reduce((s, g) => s + g.taxable, 0)).toBeCloseTo(f.taxableValue, 2)
  })

  it('is a NO-OP on a tax-exclusive bill: the taxable column is what it always was', () => {
    const f = invoiceFigures(posted({ lines: [{ amount: 5000 }, { amount: 3000, hsnCode: '7117' }], discount: 500 }))
    expect(f.taxInclusive).toBe(false)
    // Pro-rata discount shares of 312.50 / 187.50 off 5,000 / 3,000 — unchanged by this change.
    expect(f.taxGroups.map((g) => [g.hsn, g.taxable])).toEqual([['7113', 4687.5], ['7117', 2812.5]])
    expect(f.taxGroups.reduce((s, g) => s + g.taxable, 0)).toBeCloseTo(f.taxableValue, 2)
  })

  it('leaves an unitemised charge out of the HSN block in exclusive mode, where it has no HSN', () => {
    // It has its own labelled row in the totals block (defect 3). Pro-rating it into a jewellery
    // HSN to tidy a column would be inventing a classification on a statutory summary.
    const f = invoiceFigures(posted({ lines: [{ amount: 50_000 }], hiddenCharge: 585 }))
    expect(f.taxGroups.map((g) => g.taxable)).toEqual([49_415])
    expect(f.unitemised).toBeCloseTo(585, 2)
  })
})

describe('old metal is a payment, never a deduction from taxable value', () => {
  it('nets the bhav cut off the credit and leaves the taxable value alone', () => {
    const inv = posted({ lines: [{ amount: 100_000 }] })
    const f = invoiceFigures({ ...inv, oldGoldValue: 30_000, bhavCut: 1_200 })
    expect(f.netOldGold).toBe(28_800)
    expect(f.taxableValue).toBeCloseTo(100_000, 2)
    expect(f.grandTotal).toBe(inv.totalAmount)
  })
})

describe('config', () => {
  it('falls back to defaults for missing, unparseable or out-of-range values', () => {
    expect(parseInvoiceConfig(undefined)).toEqual(DEFAULT_INVOICE_CONFIG)
    expect(parseInvoiceConfig([{ key: INVOICE_LAYOUT_KEY, value: 'not json' }])).toEqual(DEFAULT_INVOICE_CONFIG)
    expect(parseInvoiceConfig([{ key: INVOICE_LAYOUT_KEY, value: '[1,2]' }])).toEqual(DEFAULT_INVOICE_CONFIG)
    const c = parseInvoiceConfig([{ key: INVOICE_LAYOUT_KEY, value: JSON.stringify({ paper: 'letter', marginTopMm: 999, showHsn: 'yes' }) }])
    expect(c.paper).toBe('a4')
    expect(c.marginTopMm).toBe(DEFAULT_INVOICE_CONFIG.marginTopMm)
    expect(c.showHsn).toBe(DEFAULT_INVOICE_CONFIG.showHsn)
  })

  it('round-trips a real layout', () => {
    const saved = { ...DEFAULT_INVOICE_CONFIG, paper: 'roll80' as const, marginTopMm: 45, showLetterhead: false, bisNo: 'HM/9' }
    expect(parseInvoiceConfig([{ key: INVOICE_LAYOUT_KEY, value: JSON.stringify(saved) }])).toEqual(saved)
  })

  it('derives the page margin and the printable width from the shop settings', () => {
    const c = { ...DEFAULT_INVOICE_CONFIG, marginTopMm: 45, marginSideMm: 10, marginBottomMm: 8 }
    expect(pageMargin(c)).toBe('45mm 10mm 8mm')
    expect(contentWidthMm(c)).toBe(190)
    expect(contentWidthMm({ ...c, paper: 'a5' })).toBe(128)
    expect(contentWidthMm({ ...c, paper: 'roll80' })).toBe(60)
  })
})

describe('document title', () => {
  it('names the document the law names, not "INVOICE" for everything', () => {
    expect(invoiceTitle('sale', true).en).toBe('Tax Invoice')
    expect(invoiceTitle('sale', false).en).toBe('Bill of Supply')
    expect(invoiceTitle('urd', false).en).toBe('URD Purchase Voucher')
    expect(invoiceTitle('sale-return', true).en).toBe('Credit Note')
    expect(invoiceTitle('purchase-return', true).en).toBe('Debit Note')
  })
})


// ═════════════ what oMunim's bill has that ours did not ═════════════

const line = (o: Partial<PrintInvoiceItem>): PrintInvoiceItem =>
  ({ name: 'Item', netWeight: 0, amount: 0, ...o })

describe('per-metal subtotal — the most-read row on a jeweller’s bill', () => {
  it('sums gross weight, net weight and value per metal', () => {
    const rows = metalSubtotals([
      line({ name: 'Gold chain', purity: '22K', grossWeight: 3, netWeight: 2.5, amount: 2000 }),
      line({ name: 'Gold ring', purity: '22K', grossWeight: 2, netWeight: 2.5, amount: 3745 }),
      line({ name: 'Silver payal', purity: '925', grossWeight: 40, netWeight: 39, amount: 4000 }),
    ])
    expect(rows.map((r) => r.metal)).toEqual(['gold', 'silver'])
    // oMunim's own captured row: TOTAL GOLD 5.000 | 5.000 | 5,745.00
    expect(rows[0]).toMatchObject({ lines: 2, grossWeight: 5, netWeight: 5, amount: 5745 })
    expect(rows[1]).toMatchObject({ lines: 1, grossWeight: 40, netWeight: 39, amount: 4000 })
  })

  it('always adds up to the item total the table foot prints', () => {
    const items = [
      line({ purity: '22K', amount: 5000 }),
      line({ purity: '925', amount: 3000 }),
      line({ name: 'Polish charge', amount: 250 }),
    ]
    const f = invoiceFigures({
      id: 'i', invoiceNo: 'X', invoiceDate: '2026-01-10', customerName: 'C',
      subtotal: 8250, totalAmount: 8250, items,
    })
    const sum = metalSubtotals(items).reduce((s, r) => s + r.amount, 0)
    expect(sum).toBeCloseTo(f.itemTotal, 2)
    // The unplaceable line is not silently dropped — it gets its own row, because the rows must
    // reconcile to the total (defect 3's rule, applied to the new band).
    expect(metalSubtotals(items).map((r) => r.metal)).toEqual(['gold', 'silver', 'other'])
  })

  it('prints nothing rather than a band labelled with a metal it could not establish', () => {
    expect(metalSubtotals([line({ name: 'Repair labour', amount: 500 })])).toEqual([])
    expect(metalSubtotals([])).toEqual([])
  })

  it('reads HSN first, then the description, then purity', () => {
    expect(metalOfLine({ name: 'Anything', hsnCode: '7106', purity: '22K' })).toBe('silver')
    expect(metalOfLine({ name: 'Anything', hsnCode: '711319', purity: '925' })).toBe('gold')
    expect(metalOfLine({ name: 'Silver payal 999', hsnCode: '7113', purity: '999' })).toBe('silver')
    expect(metalOfLine({ name: 'चांदी का सिक्का', hsnCode: null, purity: null })).toBe('silver')
    expect(metalOfLine({ name: 'Bangle', hsnCode: '7113', purity: '18K' })).toBe('gold')
    expect(metalOfLine({ name: 'Bangle', hsnCode: '7113', purity: '92.5' })).toBe('silver')
    // 999 is both fine gold and fine silver; with nothing else to go on it ties to gold.
    expect(metalOfLine({ name: 'Biscuit', hsnCode: null, purity: '999' })).toBe('gold')
    // and never guesses: an imitation line stays 'other' instead of inflating the gold band.
    expect(metalOfLine({ name: 'AD necklace', hsnCode: '7117', purity: null })).toBe('other')
  })
})

describe('item table columns', () => {
  it('counts every column, for all 64 toggle combinations', () => {
    // The bug this pins: the Total row counted 4 always-on columns when there are 5, so on a
    // default layout the invoice total printed under the Tax heading, not Amount.
    for (let mask = 0; mask < 64; mask++) {
      const c: InvoiceConfig = {
        ...DEFAULT_INVOICE_CONFIG,
        showHsn: !!(mask & 1), showPurity: !!(mask & 2), showGrossWeight: !!(mask & 4),
        showWastage: !!(mask & 8), showMaking: !!(mask & 16), showStone: !!(mask & 32),
      }
      for (const taxed of [true, false]) {
        const { lead, tail, total } = itemColumnSpans(c, taxed)
        // header cells, counted the way the <thead> writes them
        const header = 2 + [c.showHsn, c.showPurity, c.showGrossWeight, c.showStone].filter(Boolean).length
          + 1 + (c.showWastage ? 1 : 0) + 1 + (c.showMaking ? 1 : 0) + (c.showStone ? 1 : 0)
          + (taxed ? 1 : 0) + 1
        expect(total).toBe(header)
        // the metal band: lead + [gross] + [stone wt] + net + tail + amount
        const band = lead + (c.showGrossWeight ? 1 : 0) + (c.showStone ? 1 : 0) + 1 + tail + 1
        expect(band).toBe(total)
      }
    }
  })
})

describe('brand accent colour', () => {
  it('accepts what a shop actually types, rejects the rest', () => {
    expect(normalizeAccent('#B45309')).toBe('#b45309')
    expect(normalizeAccent('b45309')).toBe('#b45309')
    expect(normalizeAccent('#abc')).toBe('#aabbcc')
    expect(normalizeAccent('  #1E3A5F  ')).toBe('#1e3a5f')
    expect(normalizeAccent('red')).toBe('')
    expect(normalizeAccent('#12345')).toBe('')
    expect(normalizeAccent('javascript:alert(1)')).toBe('')
    expect(normalizeAccent(null)).toBe('')
  })

  it('picks a legible foreground for ANY colour the shop chooses', () => {
    // Including the ones a shop picks off its signboard and software usually prints white on.
    for (const hex of ['#ffff00', '#ffffff', '#000000', '#b45309', '#1e3a5f', '#7f1d1d', '#14532d',
                       '#00ff00', '#ff0000', '#f5f5f4', '#808080', '#4c1d95', '#0f766e']) {
      const paint = accentPaint(hex)!
      expect(paint).not.toBeNull()
      // 3.0 is the floor the greyscale-safe rule guarantees over the whole RGB cube; pure red is
      // the colour that costs the most for it (3.998:1 on paper, 12:1 in grey, vs 5.25/1.74).
      expect(contrastRatio(paint.head, paint.headText)).toBeGreaterThanOrEqual(3)
      // The subtotal band is a light tint, so the sheet's own ink always reads on it.
      expect(contrastRatio(paint.band, paint.bandText)).toBeGreaterThanOrEqual(4.5)
    }
    // Every colour a jeweller actually picks — the designer's own swatches — clears AA outright.
    for (const hex of ['#b45309', '#1e3a5f', '#7f1d1d', '#14532d', '#4c1d95', '#0f766e', '#1c1917']) {
      const paint = accentPaint(hex)!
      expect(Math.min(paint.headContrast, paint.headContrastGrey)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('survives a greyscale printer — the case a colour-only rule gets WRONG', () => {
    // Rec.709 luma on the encoded channels: what a printer driver and a photocopier do.
    const grey = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
      const v = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b).toString(16).padStart(2, '0')
      return `#${v}${v}${v}`
    }
    // Pure red is the trap: WCAG relative luminance says "use black" (5.25:1 on screen), and that
    // pair greys to 1.74:1 — an unreadable header on the mono laser in the back office.
    const red = accentPaint('#ff0000')!
    expect(red.headText).toBe('#ffffff')
    expect(contrastRatio(grey('#ff0000'), '#000000')).toBeLessThan(2) // the rejected pair
    expect(red.headContrastGrey).toBeGreaterThanOrEqual(4.5)

    for (const hex of ['#ffff00', '#b45309', '#1e3a5f', '#14532d', '#ff0000', '#0000ff', '#00ff00']) {
      const paint = accentPaint(hex)!
      // 3.0 is the floor the rule guarantees over the whole RGB cube (worst case #ff14ff, 3.09).
      expect(contrastRatio(grey(paint.head), paint.headText)).toBeGreaterThanOrEqual(3)
      expect(paint.headContrastGrey).toBeCloseTo(contrastRatio(grey(paint.head), paint.headText), 1)
    }
  })

  it('is off by default, so no shop gets a colour it never asked for', () => {
    expect(DEFAULT_INVOICE_CONFIG.accent).toBe('')
    expect(accentPaint('')).toBeNull()
  })
})

describe('marketing banners', () => {
  it('takes only an image the shop uploaded, never a URL the bill has to fetch', () => {
    const ok = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
    expect(normalizeBanner(ok)).toBe(ok)
    expect(normalizeBanner('https://cdn.example.com/ad.png')).toBe('')
    expect(normalizeBanner('data:image/svg+xml;base64,PHN2Zz4=')).toBe('')
    expect(normalizeBanner('data:text/html;base64,PGgxPg==')).toBe('')
    expect(normalizeBanner('  ')).toBe('')
  })

  it('refuses anything that would not fit the Setting row MySQL gives it', () => {
    const huge = `data:image/jpeg;base64,${'A'.repeat(BANNER_MAX_CHARS)}`
    expect(huge.length).toBeGreaterThan(BANNER_MAX_CHARS)
    expect(normalizeBanner(huge)).toBe('')
    expect(BANNER_MAX_CHARS).toBeLessThan(65_535) // MySQL TEXT, hard ceiling
  })

  it('comes from its own Setting row, and reaches the sheet even with no layout saved', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo='
    const c = parseInvoiceConfig([{ key: INVOICE_BANNER_KEYS.top, value: png }])
    expect(c.bannerTop).toBe(png)
    expect(c.bannerBottom).toBe('')
    expect(c.paper).toBe(DEFAULT_INVOICE_CONFIG.paper)
    // A banner smuggled into the layout blob is ignored — that row cannot hold one.
    const blob = parseInvoiceConfig([{ key: INVOICE_LAYOUT_KEY, value: JSON.stringify({ bannerTop: png }) }])
    expect(blob.bannerTop).toBe('')
  })

  /**
   * WHERE the top banner prints — the owner's ask, as a choice rather than a move: "the hedar banner
   * has to come at the top of invoice and below the frim information".
   *
   * The placement is the one banner value that DOES live in the layout blob, so it is per document
   * type like the rest of the layout, while the two images stay global. And it defaults to today's
   * bill, which is the constraint the whole change is under: a shop that never opens the switch must
   * not find its paper rearranged.
   */
  it('places the top banner below the letterhead until the shop says otherwise', () => {
    expect(DEFAULT_INVOICE_CONFIG.bannerTopAbove).toBe(false)
    // No row at all, an empty blob, and a junk value all have to mean "today's bill".
    expect(parseInvoiceConfig([]).bannerTopAbove).toBe(false)
    expect(parseInvoiceConfig([{ key: INVOICE_LAYOUT_KEY, value: '{}' }]).bannerTopAbove).toBe(false)
    for (const junk of ['yes', 1, null, {}, []]) {
      const c = parseInvoiceConfig([{ key: INVOICE_LAYOUT_KEY, value: JSON.stringify({ bannerTopAbove: junk }) }])
      expect(c.bannerTopAbove, `bannerTopAbove: ${JSON.stringify(junk)} should have fallen to the default`).toBe(false)
    }
    // And it round-trips, per document type: the sale bill carries the masthead, the purchase bill
    // keeps its letterhead first.
    const rows = [
      { key: invoiceLayoutKey('sell'), value: JSON.stringify({ bannerTopAbove: true }) },
      { key: invoiceLayoutKey('purchase'), value: JSON.stringify({ bannerTopAbove: false }) },
    ]
    expect(parseInvoiceConfig(rows, 'sell').bannerTopAbove).toBe(true)
    expect(parseInvoiceConfig(rows, 'purchase').bannerTopAbove).toBe(false)
  })

  /**
   * WHAT A BANNER COSTS IN PAPER, which is what replaced the masthead's height cap.
   *
   * The cap (BANNER_ABOVE_MAX_MM, 36/22/26mm) is gone: `max-height` + `object-contain` scaled a
   * wide advert down WHOLE, so it printed narrower than the bill it was crowning. A banner now
   * prints at the full printable width at its own aspect ratio in BOTH placements, and the honest
   * thing left to do is quote the cost — bannerSpareMm() is that quote, and the three aspect ratios
   * below are the three real cases the e2e gate then measures on actual paper.
   */
  it('quotes how tall a banner may print before it costs a second sheet', () => {
    // A4, default margins: 271mm printable over a 207mm one-line bill.
    expect(bannerSpareMm(DEFAULT_INVOICE_CONFIG)).toBe(64)
    // A5 has nothing to give, which is the pre-existing fact the studio already states in words:
    // any readable banner costs a second half sheet in either placement.
    expect(bannerSpareMm({ ...DEFAULT_INVOICE_CONFIG, paper: 'a5' })).toBeLessThan(20)
    // The roll has no page to run out of, so there is no promise to make.
    expect(bannerSpareMm({ ...DEFAULT_INVOICE_CONFIG, paper: 'roll80' })).toBe(0)
    // Deeper margins leave less for the advert, and the quote has to follow the shop's own paper.
    expect(bannerSpareMm({ ...DEFAULT_INVOICE_CONFIG, marginTopMm: 40 })).toBe(36)
    // Margins that swallow the bill promise nothing rather than a negative allowance.
    expect(bannerSpareMm({ ...DEFAULT_INVOICE_CONFIG, paper: 'a5', marginTopMm: 40, marginBottomMm: 40 })).toBe(0)

    // THE THREE SHAPES, across A4's 186mm printable width. These are the figures the owner's ask
    // turns on: his own wide banner fits, the slot oMunim advertises does not, a square one is
    // most of the page. Same arithmetic the studio shows and the e2e gate measures.
    const width = contentWidthMm(DEFAULT_INVOICE_CONFIG)
    expect(width).toBe(186)
    const tall = (aspect: number) => Math.round(width / aspect)
    expect(tall(4), 'a 4:1 banner across A4').toBe(47)
    expect(tall(2.56), 'the 2.56:1 slot across A4').toBe(73)
    expect(tall(1), 'a 1:1 banner across A4').toBe(186)
    const spare = bannerSpareMm(DEFAULT_INVOICE_CONFIG)
    expect(tall(4), '4:1 must fit one A4 sheet — the owner’s own banner').toBeLessThan(spare)
    expect(tall(2.56), '2.56:1 must be reported as a second sheet').toBeGreaterThan(spare)
    expect(tall(1), '1:1 must be reported as a second sheet').toBeGreaterThan(spare)
  })
})

describe('metal rate bar', () => {
  const rates: FirmRate[] = [
    { metal: 'gold', purity: '22K', rate: 108_750, rateDate: '2026-01-09' },
    { metal: 'gold', purity: '22K', rate: 99_000, rateDate: '2025-06-01' },
    { metal: 'gold', purity: '24K', rate: 118_000, rateDate: '2026-01-09' },
    { metal: 'gold', purity: '18K', rate: 89_000, rateDate: '2026-02-20' }, // after the bill
    { metal: 'silver', purity: '999', rate: 9_850, rateDate: '2026-01-05' },
  ]
  const items = [
    line({ name: 'Chain', purity: '22K', hsnCode: '711319' }),
    line({ name: 'Payal', purity: '999', hsnCode: '7106' }),
    line({ name: 'Ring', purity: '18K', hsnCode: '711319' }),
  ]

  it('shows only the metals and purities the bill itself has, each with its unit', () => {
    const rows = billRates(items, rates, '2026-01-10')
    // Gold before silver, dearest first — the way a rate board is read.
    expect(rows.map((r) => r.label)).toEqual(['22K Gold', '18K Gold', '999 Silver'])
    // The units the rest of the app already prints for these rows (app-shell's ticker, the
    // settings fields): gold per 10 grams, silver per kilo. The bill must not contradict them.
    expect(rows[0]).toMatchObject({ rate: 108_750, unit: '₹/10 g' })
    expect(rows[2]).toMatchObject({ rate: 9_850, unit: '₹/kg' })
    // 24K is on the rate board but not on this bill, so it is not on this bill's rate bar.
    expect(rows.map((r) => r.label)).not.toContain('24K Gold')
  })

  it('prefers the rate in force on the bill date over a newer one', () => {
    expect(billRates(items, rates, '2025-07-01')[0]).toMatchObject({ rate: 99_000, asOn: new Date('2025-06-01') })
    expect(billRates(items, rates, '2026-01-10')[0]).toMatchObject({ rate: 108_750 })
  })

  it('falls back to the nearest later rate, and dates it, rather than printing nothing', () => {
    // The real case: a shop enters a rate when it changes, so a bill raised yesterday has no rate
    // row of its own. The 18K rate here is dated a month AFTER this bill.
    const r18 = billRates(items, rates, '2026-01-10').find((r) => r.label === '18K Gold')
    expect(r18).toMatchObject({ rate: 89_000 })
    // …and carries the date it is actually from, so nobody reads it as this bill's rate.
    expect(r18!.asOn).toEqual(new Date('2026-02-20'))
  })

  it('prints nothing for a METAL the firm has never entered a rate for', () => {
    const noSilver = rates.filter((r) => r.metal !== 'silver')
    expect(billRates(items, noSilver, '2026-01-10').map((r) => r.label).join()).not.toContain('Silver')
  })

  it('falls back to the metal\u2019s own board rate, under the purity that rate is really for', () => {
    // The live case that found this: the firm's board is 22K/24K gold and 999 silver, and the bill
    // is 925 silver. Matching purity-for-purity printed no silver rate at all.
    const bill = [line({ name: 'Silver chain', purity: '925', hsnCode: '7106' })]
    const rows = billRates(bill, rates, '2026-01-10')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ label: '999 Silver', rate: 9_850, unit: '₹/kg' })
    // A line with no purity at all still gets its metal's rate.
    expect(billRates([line({ name: 'Gold bangle' })], rates, '2026-01-10')).toHaveLength(1)
  })

  it('states the printable height a banner has to fit inside', () => {
    expect(printableHeightMm(DEFAULT_INVOICE_CONFIG)).toBe(297 - 12 - 14)
    expect(printableHeightMm({ ...DEFAULT_INVOICE_CONFIG, paper: 'a5' })).toBe(210 - 12 - 14)
    // A continuous roll has no page to run out of.
    expect(printableHeightMm({ ...DEFAULT_INVOICE_CONFIG, paper: 'roll80' })).toBe(0)
  })

  it('is simply absent when the firm keeps no rate history', () => {
    expect(billRates(items, [], '2026-01-10')).toEqual([])
    expect(billRates(items, undefined, '2026-01-10')).toEqual([])
    expect(billRates([], rates, '2026-01-10')).toEqual([])
    expect(billRates(items, rates, 'not a date')).toEqual([])
  })
})

describe('rate bar unit — the 10x risk', () => {
  /**
   * The bar used to decide the unit from the METAL ("silver is per kg, everything else per 10 g").
   * A firm that keeps gold per gram then had 11,400 printed on a customer's bill as "₹/10 g" — a
   * tenth of the real price, on the one figure the customer checks by hand. The row's own unit,
   * which GoldRate has carried since goldRateToPerGram() landed, is what prints.
   */
  const item = [line({ name: 'Chain', purity: '22K' })]

  it("prints the row's own unit, not one guessed from the metal", () => {
    const perGram = billRates(item, [{ metal: 'gold', purity: '22K', rate: 11_400, rateDate: '2026-01-09', unit: 'per_gram' }], '2026-01-10')
    expect(perGram[0]).toMatchObject({ rate: 11_400, unit: '₹/g' })

    const per10 = billRates(item, [{ metal: 'gold', purity: '22K', rate: 114_000, rateDate: '2026-01-09', unit: 'per_10_gram' }], '2026-01-10')
    expect(per10[0]).toMatchObject({ rate: 114_000, unit: '₹/10 g' })

    // Gold quoted per kilo is unusual but legal in the schema, and it must not read "per 10 g".
    const perKg = billRates(item, [{ metal: 'gold', purity: '22K', rate: 11_400_000, rateDate: '2026-01-09', unit: 'per_kg' }], '2026-01-10')
    expect(perKg[0]!.unit).toBe('₹/kg')
  })

  it('falls back to the same default /api/gold-rate writes, for a row saved before the column existed', () => {
    expect(billRates(item, [{ metal: 'gold', purity: '22K', rate: 108_750, rateDate: '2026-01-09' }], '2026-01-10')[0]!.unit).toBe('₹/10 g')
    expect(billRates([line({ name: 'Payal', purity: '999', hsnCode: '7106' })], [{ metal: 'silver', purity: '999', rate: 9_850, rateDate: '2026-01-09' }], '2026-01-10')[0]!.unit).toBe('₹/kg')
    // An unrecognised unit is NEVER silently scaled or relabelled either.
    expect(billRates(item, [{ metal: 'gold', purity: '22K', rate: 108_750, rateDate: '2026-01-09', unit: 'tola' }], '2026-01-10')[0]!.unit).toBe('₹/10 g')
  })
})

describe('trade presets', () => {
  /** A preset that quietly reset a shop's letterhead, terms or accent would be used once. */
  const OFF_LIMITS = [
    'paper', 'marginTopMm', 'marginSideMm', 'marginBottomMm', 'showLetterhead', 'showLogo',
    'bisNo', 'terms', 'bankDetails', 'footNote', 'signatory', 'accent', 'bannerTop', 'bannerBottom',
    'showBank', 'showSignature', 'officeCopy',
  ]

  it('only ever touches columns and the buyer block', () => {
    expect(INVOICE_PRESETS.length).toBeGreaterThan(0)
    for (const p of INVOICE_PRESETS) {
      for (const k of Object.keys(p.patch)) expect(OFF_LIMITS).not.toContain(k)
    }
  })

  it('applies cleanly onto a config and then reports itself as in use', () => {
    const shop: InvoiceConfig = { ...DEFAULT_INVOICE_CONFIG, accent: '#7a1f2b', terms: 'mine', marginTopMm: 48 }
    for (const p of INVOICE_PRESETS) {
      const next = { ...shop, ...p.patch }
      expect(matchesPreset(next, p)).toBe(true)
      // the shop's own identity survived
      expect(next.accent).toBe('#7a1f2b')
      expect(next.terms).toBe('mine')
      expect(next.marginTopMm).toBe(48)
    }
  })

  it('the retail preset is the compact one and the B2B preset prints the buyer GSTIN', () => {
    const retail = INVOICE_PRESETS.find((p) => p.id === 'retail')!
    const b2b = INVOICE_PRESETS.find((p) => p.id === 'b2b')!
    const cols = (c: InvoiceConfig) => itemColumnSpans(c, true).total
    expect(cols({ ...DEFAULT_INVOICE_CONFIG, ...retail.patch })).toBeLessThan(cols({ ...DEFAULT_INVOICE_CONFIG, ...b2b.patch }))
    expect(b2b.patch.showBuyerGstin).toBe(true)
    // A walk-in customer's PAN does not belong on a counter bill.
    expect(retail.patch.showBuyerPan).toBe(false)
  })

  it("round-trips the new flags through the Setting blob, and defaults them to today's bill", () => {
    expect(DEFAULT_INVOICE_CONFIG.showBuyerGstin).toBe(true)
    // OFF by default since 2026-09-29. The buyer's PAN reaches the print screen from the MASKED bulk
    // customers list (src/lib/pii.ts), so switching it on used to print `PAN XXXX XX 234F` onto a
    // filed tax invoice. GST Rule 46 asks for the recipient's GSTIN, not their PAN — nothing
    // statutory is lost. A real PAN would have to come from the audited ?reveal=pan path.
    expect(DEFAULT_INVOICE_CONFIG.showBuyerPan).toBe(false)
    expect(DEFAULT_INVOICE_CONFIG.showItemCode).toBe(true)
    const saved = parseInvoiceConfig([{ key: INVOICE_LAYOUT_KEY, value: JSON.stringify({ showBuyerPan: false, showItemCode: false }) }])
    expect(saved.showBuyerPan).toBe(false)
    expect(saved.showItemCode).toBe(false)
    expect(saved.showBuyerGstin).toBe(true)
  })
})

/**
 * Fields that landed on the models in Task 81 and had to reach the paper.
 * Owner: ux-design-lead. The judgement calls they pin are in the comments on each field.
 */
describe('HUID, stone certificate and the old-metal rate', () => {
  it('gives HUID no toggle at all — it is the law, not a preference', () => {
    // A `showHuid` flag would let a shop hand a customer a hallmarked gold article on a bill with
    // no HUID on it, which is a defective invoice. Same reason the tax summary and the place of
    // supply are not toggles either. The suppression rule is "the line has one", in the sheet.
    expect(Object.keys(DEFAULT_INVOICE_CONFIG)).not.toContain('showHuid')
    for (const p of INVOICE_PRESETS) expect(Object.keys(p.patch)).not.toContain('showHuid')
  })

  it('costs no column, so the table is exactly as wide as it was', () => {
    // The guard that matters: HUID and the certificate number live in the description cell, so
    // every span the metal bands and the Total row land on is untouched at every preset.
    for (const cert of [false, true]) {
      for (const taxed of [true, false]) {
        const c: InvoiceConfig = { ...DEFAULT_INVOICE_CONFIG, showStoneCert: cert }
        expect(itemColumnSpans(c, taxed)).toEqual(itemColumnSpans({ ...c, showStoneCert: !cert }, taxed))
      }
    }
    const stone = INVOICE_PRESETS.find((p) => p.id === 'stone')!
    expect(itemColumnSpans({ ...DEFAULT_INVOICE_CONFIG, ...stone.patch }, true).total).toBe(12)
  })

  it('puts the stone certificate in the stone preset and nowhere else', () => {
    const by = (id: string) => INVOICE_PRESETS.find((p) => p.id === id)!.patch.showStoneCert
    expect(by('stone')).toBe(true)
    expect(by('retail')).toBe(false)
    expect(by('b2b')).toBe(false)
    // Off for a shop that never asked — a gold counter has no certificates.
    expect(DEFAULT_INVOICE_CONFIG.showStoneCert).toBe(false)
    expect(parseInvoiceConfig([{ key: INVOICE_LAYOUT_KEY, value: JSON.stringify({ showStoneCert: true }) }]).showStoneCert).toBe(true)
    // and a preset still only ever touches columns and the buyer block
    expect(INVOICE_PRESETS.every((p) => !Object.keys(p.patch).some((k) => ['paper', 'terms', 'accent', 'bisNo'].includes(k)))).toBe(true)
  })

  it('prints the STORED old-metal rate, per 10 g, when the bill has one', () => {
    // 12.45 g at ₹87,376.50 /10 g = ₹1,08,783.74 — the value the server derived FROM the rate.
    const r = oldMetalRate({ oldGoldRate: 87376.5, oldGoldWeight: 12.45 }, 108783.74)!
    expect(r).toEqual({ rate: 87376.5, unit: '₹/10 g', derived: false })
  })

  it('falls back to value ÷ weight for a bill written before the column existed', () => {
    const r = oldMetalRate({ oldGoldRate: null, oldGoldWeight: 12.45 }, 108783.74)!
    expect(r.derived).toBe(true)
    // SAME unit as the stored branch: one field must not print per-gram on March's bill and
    // per-10g on April's. 108783.74 / 12.45 * 10 = 87376.50 — the same figure the stored branch
    // returns, to the paisa, on this bill. It is still only ever an APPROXIMATION of what the shop
    // quoted, because it is reconstructed from two already-rounded numbers; that is the whole
    // reason the stored column now wins when it exists.
    expect(r.unit).toBe('₹/10 g')
    expect(r.rate).toBe(87376.5)
  })

  it('prints nothing rather than a zero or an Infinity', () => {
    expect(oldMetalRate({ oldGoldRate: null, oldGoldWeight: 0 }, 0)).toBeNull()
    // a weightless credit cannot produce a rate — division by zero is not a figure
    expect(oldMetalRate({ oldGoldRate: null, oldGoldWeight: 0 }, 5000)).toBeNull()
    expect(oldMetalRate({ oldGoldRate: 0, oldGoldWeight: 10 }, 0)).toBeNull()
    // a stored rate with no weight is still the rate the shop quoted
    expect(oldMetalRate({ oldGoldRate: 87376.5, oldGoldWeight: 0 }, 0)!.derived).toBe(false)
  })

  it('leaves the old metal out of the taxable value however the rate arrived', () => {
    // The stored rate is a display change, not a money one: nothing here feeds invoiceFigures.
    const inv = { ...posted({ lines: [{ amount: 100000 }] }), oldGoldWeight: 12.45, oldGoldValue: 108783.74, oldGoldRate: 87376.5 }
    const f = invoiceFigures(inv)
    expect(f.taxableValue).toBe(100000)
    expect(f.warnings).toEqual([])
    expect(f.netOldGold).toBe(108783.74)
  })
})

/**
 * Several stones on ONE sold line (InvoiceItem.stones, Task 90).
 *
 * The decision being pinned: six stone rows on the counter screen must not become six lines on the
 * customer's bill. The aggregate stoneWeight / stoneAmount / stoneCertNo columns keep doing exactly
 * what they did; a line that genuinely carries more than one stone gets ONE extra text run under
 * the item name, and only where the shop already asked for certificates.
 */
describe('several stones on one invoice line', () => {
  const on: InvoiceConfig = { ...DEFAULT_INVOICE_CONFIG, showStoneCert: true }
  const json = (...rows: Record<string, unknown>[]) => JSON.stringify(rows)

  // 0.1 g = 0.50 ct. caratWeight is deliberately a lie here: weightGrams is the canonical figure
  // and the only one the sheet is allowed to read.
  const diamond = { name: 'Diamond', clarity: 'VS1', colorGrade: 'G', shape: 'Round', certLab: 'GIA', certNo: '2185471', qty: 1, caratWeight: 99, weightUnit: 'CT', weightGrams: 0.1 }
  const melee = { name: 'Diamond', clarity: 'SI1', certLab: 'IGI', certNo: 'IGI-7742', qty: 4, weightGrams: 0.04 }
  const ruby = { name: 'Ruby', qty: 1, weightGrams: 0.06 }

  it('prints nothing at all for a line with no stones — today’s bill, unchanged', () => {
    expect(stoneDetail({ stones: null }, on)).toBe('')
    expect(stoneDetail({ stones: undefined }, on)).toBe('')
    expect(stoneDetail({ stones: '[]' }, on)).toBe('')
    expect(stoneDetail({ stones: '   ' }, on)).toBe('')
  })

  /**
   * INV-1035 — the owner's own bill, the `stones` column VERBATIM out of the live row.
   *
   * His report: "I added stone here but the invoice not showing the diamond details". The sheet
   * printed `24K 9.000g ₹1,50,000/10g MAKING ₹1,000 ₹1,37,000` and the word "diamond" appeared
   * nowhere on it — no carat, no FL, no E, no Round, no GIA. TWO causes, both live here:
   * showStone/showStoneCert default OFF (fixed by stoneAwareConfig), and this function refused
   * every single-stone line (fixed below). A certified solitaire is the commonest stone line a
   * jeweller writes, and it was the one shape that could never print.
   */
  const INV1035 = '[{"seq":0,"name":"dia","clarity":"FL","colorGrade":"E","shape":"Round","size":null,'
    + '"certNo":null,"certLab":"GIA","otherInfo":null,"qty":1,"caratWeight":1,"weightUnit":"GM",'
    + '"weightGrams":1,"rateCt":1000,"rateUnit":"PP","sellRateCt":null,"amount":1000,"deductFromGross":true}]'

  it('prints the ONE diamond on INV-1035 — name, carat, clarity, colour, shape and lab', () => {
    // 1 g is 5.00 ct off the canonical weightGrams, which is also what the Stone wt column prints.
    expect(stoneDetail({ stones: INV1035 }, on)).toBe('Stones: dia 5.00 ct FL E Round · GIA · ₹1,000/pc')
  })

  it('a single stone carrying nothing but a weight still prints nothing', () => {
    // The old rule, kept where it was actually right: a sub-line costs ~2.5mm of every row, and
    // this one would only repeat the Stone wt / Stone ₹ columns back at the reader.
    expect(stoneDetail({ stones: json({ qty: 1, weightGrams: 0.1 }) }, on)).toBe('')
    expect(stoneDetail({ stones: json({ weightGrams: 0.1, amount: 1000 }) }, on)).toBe('')
    // ...and one that names itself does, which is the whole difference.
    expect(stoneDetail({ stones: json(diamond) }, on))
      .toBe('Stones: Diamond 0.50 ct VS1 G Round · GIA 2185471')
  })

  it('names every stone and every certificate on a multi-stone line, in one run', () => {
    expect(stoneDetail({ stones: json(diamond, melee, ruby) }, on)).toBe(
      'Stones: Diamond 0.50 ct VS1 G Round · GIA 2185471; ' +
      'Diamond ×4 0.20 ct SI1 · IGI IGI-7742; ' +
      'Ruby 0.30 ct',
    )
    const run = stoneDetail({ stones: json(diamond, melee, ruby) }, on)
    // Both certificates reach the paper — the single stoneCertNo column can only hold the first.
    expect(run).toContain('2185471')
    expect(run).toContain('IGI-7742')
    // ONE line, not three: it goes inside the existing item-name cell.
    expect(run.split('\n')).toHaveLength(1)
    // An uncertified stone contributes no dash of any kind.
    expect(run).not.toMatch(/—/)
  })

  it('reads weightGrams and never caratWeight, so it agrees with the Stone wt column', () => {
    // 0.25 g is 1.25 ct whatever unit the operator typed; caratWeight here says 99.
    expect(stoneDetail({ stones: json({ ...diamond, weightGrams: 0.25 }, ruby) }, on))
      .toContain('Diamond 1.25 ct')
    // A chip that 2dp would round to "0.00 ct" keeps 3dp rather than reading as weightless.
    expect(stoneDetail({ stones: json({ name: 'Chip', weightGrams: 0.0004 }, ruby) }, on))
      .toContain('Chip 0.002 ct')
    // A stone with no usable weight simply loses the weight, not the stone.
    expect(stoneDetail({ stones: json({ name: 'Pearl' }, ruby) }, on)).toBe('Stones: Pearl; Ruby 0.30 ct')
  })

  it('NEVER throws on a malformed snapshot — it prints as if the line had no stones', () => {
    // The defect class that matters most here: a bill that white-screens at the printer is worse
    // than a bill missing a detail line. Every one of these is a real shape a TEXT column can hold.
    for (const bad of ['{not json', '', 'null', 'undefined', '{"a":1}', '"[]"', '[1,2,3]', '[null,null]', '[[],[]]', '3']) {
      expect(() => stoneDetail({ stones: bad }, on)).not.toThrow()
      expect(stoneDetail({ stones: bad }, on)).toBe('')
    }
    // A single junk row beside one real stone is a one-stone line — and the Ruby names itself,
    // so it prints. The junk row contributes nothing, not a dash.
    expect(stoneDetail({ stones: '[null,{"name":"Ruby","weightGrams":0.06}]' }, on))
      .toBe('Stones: Ruby 0.30 ct')
    // Junk beside a row that says nothing is still nothing.
    expect(stoneDetail({ stones: '[null,{"weightGrams":0.06}]' }, on)).toBe('')
  })

  it('reuses showStoneCert instead of adding a toggle, so a gold counter never sees it', () => {
    const three = json(diamond, melee, ruby)
    expect(stoneDetail({ stones: three }, DEFAULT_INVOICE_CONFIG)).toBe('')
    expect(stoneDetail({ stones: three }, { ...on, showStoneCert: false })).toBe('')
    // No new config field appeared, and no preset grew one.
    expect(Object.keys(DEFAULT_INVOICE_CONFIG)).not.toContain('showStones')
    for (const p of INVOICE_PRESETS) expect(Object.keys(p.patch)).not.toContain('showStones')
    // The shops that want it are the ones already on the Stone & diamond preset.
    expect(INVOICE_PRESETS.find((p) => p.id === 'stone')!.patch.showStoneCert).toBe(true)
  })

  it('costs the table no column, at any preset', () => {
    // Same guard as HUID and the cert chip: the run lives in the description cell, so the metal
    // bands and the Total row land exactly where they did.
    for (const taxed of [true, false]) {
      expect(itemColumnSpans(on, taxed)).toEqual(itemColumnSpans(DEFAULT_INVOICE_CONFIG, taxed))
    }
  })
})

/**
 * ── A BILL THAT CARRIES A STONE SHOWS IT, WITH NO TOGGLE TO FIND ─────────────────────────────
 *
 * The owner's INV-1035 defect, at the config layer. Both stone flags default OFF — correctly, a
 * plain-gold shop may not be handed two columns of em-dashes — and only the Stone & diamond preset
 * turns them on. He never found that preset, so a tax invoice carrying a certified FL/E GIA
 * solitaire printed as plain gold.
 *
 * The fix is DATA-DRIVEN, not a flipped default: a bill with no stones must still print exactly
 * what it prints today (which is every bill the paper-geometry gate measures).
 */
describe('stoneAwareConfig — the stone columns follow the bill, not a setting', () => {
  const gold: PrintInvoiceItem = { name: 'Gold ring 22K', netWeight: 10, amount: 137000 }
  const stoneLine: PrintInvoiceItem = {
    name: 'sring', netWeight: 9, grossWeight: 10, stoneWeight: 1, stoneAmount: 1000, amount: 137000,
    stones: '[{"name":"dia","clarity":"FL","colorGrade":"E","shape":"Round","certLab":"GIA","qty":1,"weightGrams":1,"amount":1000,"deductFromGross":true}]',
  }

  it('leaves a plain-gold bill byte-identical — the SAME object, not a copy', () => {
    expect(stoneAwareConfig(DEFAULT_INVOICE_CONFIG, [gold])).toBe(DEFAULT_INVOICE_CONFIG)
    expect(stoneAwareConfig(DEFAULT_INVOICE_CONFIG, [])).toBe(DEFAULT_INVOICE_CONFIG)
    expect(stoneAwareConfig(DEFAULT_INVOICE_CONFIG, null)).toBe(DEFAULT_INVOICE_CONFIG)
    expect(stoneAwareConfig(DEFAULT_INVOICE_CONFIG, undefined)).toBe(DEFAULT_INVOICE_CONFIG)
    // A zero/absent stone is not a stone.
    expect(stoneAwareConfig(DEFAULT_INVOICE_CONFIG, [{ ...gold, stoneWeight: 0, stoneAmount: 0, stones: null }]))
      .toBe(DEFAULT_INVOICE_CONFIG)
    expect(stoneAwareConfig(DEFAULT_INVOICE_CONFIG, [{ ...gold, stones: '[]' }])).toBe(DEFAULT_INVOICE_CONFIG)
    // ...and the defaults themselves are untouched: this is not a defaults flip.
    expect(DEFAULT_INVOICE_CONFIG.showStone).toBe(false)
    expect(DEFAULT_INVOICE_CONFIG.showStoneCert).toBe(false)
  })

  it('turns both flags on for INV-1035, and for ONE stone line among many', () => {
    const c = stoneAwareConfig(DEFAULT_INVOICE_CONFIG, [gold, stoneLine, gold])
    expect(c.showStone).toBe(true)
    expect(c.showStoneCert).toBe(true)
    // Nothing else moved.
    expect({ ...c, showStone: false, showStoneCert: false }).toEqual(DEFAULT_INVOICE_CONFIG)
    // Which is what makes the detail run reachable at all on the owner's own bill.
    expect(stoneDetail(stoneLine, c)).toBe('Stones: dia 5.00 ct FL E Round · GIA')
    expect(stoneDetail(stoneLine, DEFAULT_INVOICE_CONFIG)).toBe('')
  })

  it('an OLD bill with only the aggregate scalars still shows its stone', () => {
    // Pre-`stones` rows, and every line filled from stock, carry no snapshot at all.
    for (const only of [{ stoneWeight: 0.5 }, { stoneAmount: 4000 }]) {
      expect(stoneAwareConfig(DEFAULT_INVOICE_CONFIG, [{ ...gold, ...only }]).showStone).toBe(true)
    }
  })

  it('a malformed snapshot decides nothing and throws nothing', () => {
    for (const bad of ['{not json', 'null', '3', '[1,2]', '[[]]', '"x"', '   ']) {
      expect(() => stoneAwareConfig(DEFAULT_INVOICE_CONFIG, [{ ...gold, stones: bad }])).not.toThrow()
      expect(stoneAwareConfig(DEFAULT_INVOICE_CONFIG, [{ ...gold, stones: bad }]).showStone).toBe(false)
    }
  })

  it('an explicitly ON setting still forces the columns onto a plain-gold bill', () => {
    const forced: InvoiceConfig = { ...DEFAULT_INVOICE_CONFIG, showStone: true, showStoneCert: true }
    expect(stoneAwareConfig(forced, [gold])).toBe(forced)
    expect(stoneAwareConfig(forced, [gold]).showStone).toBe(true)
  })

  it('a saved OFF cannot hide a stone the customer was charged for', () => {
    // The deliberate call. The stone's ₹1,000 is inside this line's taxable amount and its 1.000 g
    // came out of the gross weight the sheet prints a net weight against. A layout preference may
    // not silence a charge on a tax invoice. A shop that hates the columns can still raise the bill
    // without stone data; it cannot bill a stone and print no stone.
    const off: InvoiceConfig = { ...DEFAULT_INVOICE_CONFIG, showStone: false, showStoneCert: false }
    expect(stoneAwareConfig(off, [stoneLine]).showStone).toBe(true)
    expect(stoneAwareConfig(off, [stoneLine]).showStoneCert).toBe(true)
  })

  it('the stone columns are the ONLY thing it can move', () => {
    // A guard against this helper ever growing into a second config layer: whatever a bill carries,
    // the only keys that may differ from the shop's saved config are these two.
    const c = stoneAwareConfig(DEFAULT_INVOICE_CONFIG, [stoneLine])
    const moved = (Object.keys(c) as (keyof InvoiceConfig)[]).filter((k) => c[k] !== DEFAULT_INVOICE_CONFIG[k])
    expect(moved.sort()).toEqual(['showStone', 'showStoneCert'])
  })
})

describe('stone column fallback, fine weight, making %, and the four new knobs', () => {
  const gold: PrintInvoiceItem = {
    name: 'Chain', purity: '22K', netWeight: 9, wastagePercent: 2, rate: 700, makingCharge: 3150, amount: 66150, qty: 1,
  }
  const looseStone: PrintInvoiceItem = {
    name: 'Loose diamond', netWeight: 0, stoneWeight: 0.1, rate: 0, amount: 42500,
  }

  it('stoneColumnAmount: own stoneAmount wins; a pure-stone line falls back to its amount', () => {
    expect(stoneColumnAmount({ ...gold, stoneAmount: 1000, stoneWeight: 0.2 })).toBe(1000)
    expect(stoneColumnAmount(looseStone)).toBe(42500)
    // flat-priced (MRP) line with a stone weight and no stoneAmount: the stone is the goods
    expect(stoneColumnAmount({ name: 'Stone', netWeight: 0.1, stoneWeight: 0.1, rate: 42500, amount: 42500, qty: 1 })).toBe(42500)
  })

  it('stoneColumnAmount never fabricates: metal lines, stoneless lines, MRP lines without a stone', () => {
    expect(stoneColumnAmount(gold)).toBe(0)
    expect(stoneColumnAmount({ ...gold, stoneWeight: 0.2 })).toBe(0) // old bill: weight, no amount, real metal
    expect(stoneColumnAmount({ name: 'Bangle', netWeight: 0, rate: 1850, amount: 1850 })).toBe(0)
    expect(stoneColumnAmount({ name: 'x' })).toBe(0)
  })

  it('fine weight is post-wastage, composed from the engine: 22K (91.6) + 2% on 9 g = 8.424 g', () => {
    expect(lineFineWeight(gold)).toBe(8.424)
    expect(lineFineWeight({ ...gold, wastagePercent: null })).toBe(8.244) // 9 x 0.916
    expect(lineFineWeight({ ...gold, purity: '925', wastagePercent: 0 })).toBe(8.325)
    expect(lineFineWeight({ ...gold, purity: 'junk' })).toBeNull()
    expect(lineFineWeight({ ...gold, netWeight: 0 })).toBeNull()
    expect(lineFineWeight({ name: 'x' })).toBeNull()
  })

  it('making % = making / metal value; null (never 0% or Infinity) when metal is unknowable', () => {
    expect(lineMakingPercent(gold)).toBe(5) // 3150 / (66150 - 3150)
    expect(lineMakingPercent({ ...gold, makingCharge: 0 })).toBeNull()
    expect(lineMakingPercent({ name: 'Bangle', makingCharge: 100, amount: 100 })).toBeNull() // metal 0
    expect(lineMakingPercent(looseStone)).toBeNull()
    expect(lineMakingPercent({ name: 'x', makingCharge: 10, amount: 5 })).toBeNull() // negative metal
  })

  it('the four knobs default off / amount, round-trip, and an invalid value falls to its default', () => {
    const d = DEFAULT_INVOICE_CONFIG
    expect([d.showFineWeight, d.showValueAdd, d.showLineOtherCharges, d.makingDisplay]).toEqual([false, false, false, 'amount'])
    const set = parseInvoiceConfig([{ key: INVOICE_LAYOUT_KEY, value: JSON.stringify({
      showFineWeight: true, showValueAdd: true, showLineOtherCharges: true, makingDisplay: 'percent' }) }])
    expect([set.showFineWeight, set.showValueAdd, set.showLineOtherCharges, set.makingDisplay]).toEqual([true, true, true, 'percent'])
    const bad = parseInvoiceConfig([{ key: INVOICE_LAYOUT_KEY, value: JSON.stringify({
      showFineWeight: 'yes', makingDisplay: 'ratio' }) }])
    expect([bad.showFineWeight, bad.makingDisplay]).toEqual([false, 'amount'])
    expect(LINE_COLUMN_LABELS.otherCharges).toMatch(/labour/i)
  })

  it('MOVES NO MONEY: the knobs and the stone fallback change no figure on any sample bill', () => {
    for (const id of SAMPLE_IDS) {
      const inv = sampleInvoice(id)
      const before = JSON.stringify([invoiceFigures(inv), metalSubtotals(inv.items!)])
      // exercise every presentational derivation on every line; none may touch the bill
      for (const it of inv.items!) { stoneColumnAmount(it); lineFineWeight(it); lineMakingPercent(it) }
      const after = JSON.stringify([invoiceFigures(inv), metalSubtotals(inv.items!)])
      expect(after).toBe(before)
      expect(JSON.stringify(inv)).toBe(JSON.stringify(sampleInvoice(id)))
    }
    // and the loose stone's own 42,500 is in the goods total exactly once
    const f = invoiceFigures(sampleInvoice('sale'))
    const dia = sampleInvoice('sale').items![2]
    expect(stoneColumnAmount(dia)).toBe(42500)
    expect(f.itemTotal).toBe(sampleInvoice('sale').items!.reduce((s, i) => s + (i.amount || 0), 0))
  })
})
