import { describe, it, expect } from 'vitest'
import { computeInvoiceTotals, round2 } from '@/lib/gst'
import { invoiceFigures, type PrintInvoice } from '@/components/app/print/invoice-print'

/**
 * qa-api money gate, item 2: the HSN summary of a MIXED-category bill must tie to the header.
 * The invoice row is built exactly the way POST /api/invoices stores it (computeInvoiceTotals ->
 * Invoice.* header, InvoiceItem.{amount,cgst,sgst,igst} = lineTax.{base,cgst,sgst,igst}), then read
 * back through the real invoiceFigures()/buildTaxGroups(). No statutory RATE is asserted anywhere:
 * rates here are arbitrary numbers to exercise the mechanism.
 */
function rng(seed: number) {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const HSNS = ['7113', '7117', '7102', '7108', '7106']
const RATES = { cgstRate: 1.5, sgstRate: 1.5, igstRate: 3 }

function stored(opts: { lines: { amount: number; hsnCode: string; gstRate?: number }[]; discount: number; metalAmount: number; gstType: 'intra' | 'inter'; taxed: boolean; inclusive: boolean }): PrintInvoice {
  const t = computeInvoiceTotals({ lines: opts.lines, discount: opts.discount, metalAmount: opts.metalAmount, gstType: opts.gstType, rates: RATES, taxed: opts.taxed, taxInclusive: opts.inclusive })
  return {
    id: 'i', type: 'sale', invoiceNo: 'INV-1', invoiceDate: '2026-10-01', customerName: 'T',
    subtotal: t.subtotal, taxableValue: t.taxableValue, taxInclusive: opts.inclusive, discount: t.discount, metalAmount: t.metalAmount,
    cgst: t.cgst, sgst: t.sgst, igst: t.igst, rofAmount: t.rofAmount, totalAmount: t.totalAmount,
    items: opts.lines.map((l, i) => ({ name: `L${i}`, hsnCode: l.hsnCode, netWeight: 10, qty: 1, amount: t.lineTax[i].base, cgst: t.lineTax[i].cgst, sgst: t.lineTax[i].sgst, igst: t.lineTax[i].igst, total: t.lineTax[i].total })),
  }
}

describe('HSN summary ties to the header on a mixed-category bill', () => {
  it('the concrete mixed bill: gold chain 7113, imitation 7117, loose diamond 7102, platinum 7113 (+ a per-line rate on one)', () => {
    const inv = stored({ lines: [
      { amount: 130_000.55, hsnCode: '7113' }, { amount: 5_000, hsnCode: '7117', gstRate: 5 },
      { amount: 125_000, hsnCode: '7102' }, { amount: 81_600, hsnCode: '7113' },
    ], discount: 1000.57, metalAmount: 0, gstType: 'intra', taxed: true, inclusive: false })
    const f = invoiceFigures(inv)
    expect(f.taxGroups.map((g) => g.hsn)).toEqual(['7113', '7117', '7102'])
    const sum = (k: 'taxable' | 'cgst' | 'sgst' | 'igst') => round2(f.taxGroups.reduce((s, g) => s + g[k], 0))
    expect([sum('cgst'), sum('sgst'), sum('igst')]).toEqual([f.cgst, f.sgst, f.igst])
    expect(sum('taxable')).toBe(f.taxableValue)
  })

  it('SWEEP 60k random mixed bills (exclusive+inclusive, intra+inter, discount, loose metal, per-line rate): tax columns tie EXACTLY', () => {
    const r = rng(7); const bad: string[] = []
    for (let i = 0; i < 60000; i++) {
      const n = 2 + Math.floor(r() * 5)
      const lines = Array.from({ length: n }, () => ({
        amount: Math.round(r() * 30_000_000) / 100, hsnCode: HSNS[Math.floor(r() * HSNS.length)],
        ...(r() < 0.3 ? { gstRate: [0, 0.25, 1.5, 3, 5, 12, 18][Math.floor(r() * 7)] } : {}),
      }))
      const total = lines.reduce((s, l) => s + l.amount, 0)
      const inv = stored({ lines, discount: r() < 0.5 ? Math.round(r() * total * 10) / 100 : 0, metalAmount: r() < 0.2 ? Math.round(r() * 5_000_000) / 100 : 0,
        gstType: r() < 0.5 ? 'intra' : 'inter', taxed: true, inclusive: r() < 0.3 })
      const f = invoiceFigures(inv)
      const sum = (k: 'cgst' | 'sgst' | 'igst') => round2(f.taxGroups.reduce((s, g) => s + g[k], 0))
      if (sum('cgst') !== f.cgst || sum('sgst') !== f.sgst || sum('igst') !== f.igst) { if (bad.length < 3) bad.push('TAX ' + JSON.stringify({ lines, inv: { d: inv.discount, m: inv.metalAmount } })) }
    }
    expect(bad).toEqual([])
  })

  // KNOWN DEFECT (see report): it.fails passes while the defect exists and goes red when fixed.
  it('SWEEP 60k: the TAXABLE column ties to the header taxable value (measured, not assumed)', () => {
    const r = rng(8); let off = 0, maxGap = 0, first = ''
    for (let i = 0; i < 60000; i++) {
      const n = 2 + Math.floor(r() * 5)
      const lines = Array.from({ length: n }, () => ({ amount: Math.round(r() * 30_000_000) / 100, hsnCode: HSNS[Math.floor(r() * HSNS.length)] }))
      const total = lines.reduce((s, l) => s + l.amount, 0)
      const inv = stored({ lines, discount: r() < 0.5 ? Math.round(r() * total * 10) / 100 : 0, metalAmount: 0, gstType: 'intra', taxed: true, inclusive: false })
      const f = invoiceFigures(inv)
      const gap = Math.abs(round2(f.taxGroups.reduce((s, g) => s + g.taxable, 0)) - f.taxableValue)
      if (gap > 0) { off++; maxGap = Math.max(maxGap, gap); if (!first) first = JSON.stringify({ lines, discount: inv.discount }) }
    }
    console.log(`[taxable column] bills off vs header: ${off}/60000, max gap ${maxGap.toFixed(2)}; first: ${first}`)
    expect(off).toBe(0)
  })

  it('URD / untaxed mixed bill: every tax figure is 0, group columns 0, amounts intact', () => {
    const lines = [{ amount: 130_000.55, hsnCode: '7113' }, { amount: 5_000, hsnCode: '7117', gstRate: 5 }, { amount: 125_000, hsnCode: '7102', gstRate: 18 }]
    const inv = stored({ lines, discount: 500, metalAmount: 0, gstType: 'intra', taxed: false, inclusive: false })
    const f = invoiceFigures(inv)
    expect([inv.cgst, inv.sgst, inv.igst]).toEqual([0, 0, 0])
    expect(f.taxGroups.every((g) => g.cgst === 0 && g.sgst === 0 && g.igst === 0)).toBe(true)
    expect(f.taxableValue).toBe(round2(130_000.55 + 5_000 + 125_000 - 500))
  })
})
