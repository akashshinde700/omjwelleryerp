import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { InvoicePagePreview } from '@/components/app/print/invoice-doc'
import {
  DEFAULT_INVOICE_CONFIG, invoiceFigures, metalSubtotals,
  type InvoiceConfig, type PrintInvoice,
} from '@/components/app/print/invoice-print'
import { sampleInvoice, SAMPLE_IDS, SAMPLE_FIRM, SAMPLE_CUSTOMER } from '@/components/app/print/invoice-sample'
import type { FieldOverrides } from '@/components/app/print/invoice-fields'

/**
 * ── THE SHOP'S OWN WORDS, AND THE THREE TRADE COLUMNS, ON THE PAPER ───────────────────────────────
 *
 * invoice-field-attrs.test.ts holds the REGISTRY and the resolvers (what a stored label parses to,
 * which fields may be renamed, and the rule that no label ever reaches the stylesheet). This file
 * holds the other half, which nothing could see before: what actually comes out of the RENDERER.
 *
 * It matters because the resolvers were total and correct while the sheet called none of them —
 * every caption was a literal at one of ~74 call sites, so a shop could save "Touch", reload it,
 * see it in the studio's field list and still print "Purity". The captions now funnel through four
 * primitives (RollLine · DocLine · Money · Th) and the assertions below are on the markup those
 * primitives produce.
 *
 * Rendered through InvoicePagePreview, which is a wrapper over the one <InvoicePage> the printer
 * mounts — so what passes here is what comes off the paper.
 *
 * Owner: ux-design-lead.
 */

const html = (config: InvoiceConfig, fieldOverrides?: FieldOverrides, invoice?: PrintInvoice) =>
  renderToStaticMarkup(createElement(InvoicePagePreview as never, {
    invoice: invoice ?? sampleInvoice('sale'), firm: SAMPLE_FIRM, customer: SAMPLE_CUSTOMER,
    config, fieldOverrides,
  }))

/** The inner markup of the ONE node that carries this field count — the caption under test. */
function node(markup: string, count: number): string {
  // `tr` is in the list because a totals row carries its field count on the ROW — Money renders a
  // <tr> with two cells — while a column heading carries it on the <th> itself.
  const m = markup.match(new RegExp(`<(t[rdh]|div|dt|p|span)[^>]*data-field-count="${count}"[^>]*>([\\s\\S]*?)</\\1>`))
  return m ? m[2] : ''
}

/** Markup with the tags taken out — what a reader actually sees in that cell. A tag becomes a
 *  SPACE, because that is what it is on the page: `Touch<span>टच</span>` reads as two words. */
const text = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

/** Every cell of one column, heading first: `data-field-count="121"` … up to the next tag. */
const column = (markup: string, count: number): string[] =>
  [...markup.matchAll(new RegExp(`data-field-count="${count}"[^>]*>([^<]*)<`, 'g'))].map((m) => m[1])

describe('a renamed label reaches the paper', () => {
  it('Purity prints as Touch / टच — the owner’s headline ask, on the heading itself', () => {
    const out = html(DEFAULT_INVOICE_CONFIG, { '111': { text: 'Touch', textHi: 'टच' } })
    expect(text(node(out, 111))).toBe('Touch टच')
    // …and the registry word is gone from that heading. ('Purity quoted' in the old-metal block is
    // a different node and is deliberately untouched — it is not field 111.)
    expect(node(out, 111)).not.toContain('Purity')
  })

  it('a column that ships with NO Hindi can be given one, and keeps its English', () => {
    // Nothing but the Devanagari half: the Rate heading has none of its own on this sheet.
    expect(text(node(html(DEFAULT_INVOICE_CONFIG, { '116': { textHi: 'भाव' } }), 116))).toBe('Rate भाव')
    // And the English half alone leaves the registry's Hindi where it was (Description has one).
    expect(text(node(html(DEFAULT_INVOICE_CONFIG, { '101': { text: 'Particulars' } }), 101)))
      .toBe('Particulars विवरण')
  })

  it('an emptied label prints NOTHING, and an untouched sheet is unchanged', () => {
    const blanked = html(DEFAULT_INVOICE_CONFIG, { '111': { text: '', textHi: '' } })
    expect(text(node(blanked, 111))).toBe('')
    // The <th> is still there — a column is never removed by a caption, only by its flag.
    expect(blanked).toContain('data-field-count="111"')
    expect(text(node(html(DEFAULT_INVOICE_CONFIG), 111))).toBe('Purity')
  })

  it('all four caption primitives honour it: Th, DocLine, Money and RollLine', () => {
    const ov: FieldOverrides = {
      '111': { text: 'Touch' },                      // Th      — a column heading
      '44': { text: 'Bill No', textHi: 'बिल नं.' },   // DocLine — the document block
      '211': { text: 'Net payable', textHi: 'देय' },  // Money   — the totals column
    }
    const sheet = html(DEFAULT_INVOICE_CONFIG, ov)
    expect(text(node(sheet, 111))).toBe('Touch')
    expect(text(node(sheet, 44))).toContain('Bill No बिल नं.')
    expect(text(node(sheet, 211))).toContain('Net payable देय')
    // RollLine: the 80mm receipt, where the same count carries the same word.
    const roll = html({ ...DEFAULT_INVOICE_CONFIG, paper: 'roll80' }, { '44': { text: 'Receipt No' } })
    expect(text(node(roll, 44))).toContain('Receipt No')
  })

  it('renaming the paid row keeps the TENDER: "Received — Cash", not N identical rows', () => {
    // Count 212 is ONE field over N rows. The mode is data, not wording, so it survives a rename.
    const out = html(DEFAULT_INVOICE_CONFIG, { '212': { text: 'Received' } })
    const rows = [...out.matchAll(/data-field-count="212"[\s\S]*?<\/td>/g)].map((m) => text(m[0]))
    expect(rows.length).toBeGreaterThan(1)
    expect(rows.some((r) => r.includes('Received — Cash'))).toBe(true)
    expect(rows.some((r) => r.includes('Received — UPI'))).toBe(true)
    expect(new Set(rows).size).toBe(rows.length)
  })

  it('a noLabel field ignores a stored label: the statutory line is content, not a caption', () => {
    const out = html(DEFAULT_INVOICE_CONFIG, { '214': { text: 'No tax on this bill' } }, sampleInvoice('sale-inclusive'))
    expect(out).not.toContain('No tax on this bill')
    expect(text(node(out, 214))).toContain('Item amounts include GST')
  })
})

/**
 * THE LABEL IS A TRUST BOUNDARY. It is free text out of a MySQL TEXT column a manager can write,
 * and it reaches the page TWICE over: as a React text child (escaped) and — never — as CSS. The
 * stylesheet half is asserted on fieldOverrideCss in invoice-field-attrs.test.ts; this is the same
 * assertion on the COMPILED PAGE, which is the artefact that actually ships to a printer.
 */
describe('a hostile label cannot reach the stylesheet or the markup as code', () => {
  const HOSTILE = [
    '"} body{display:none} .x{"',
    '</style>',
    '<img src=x onerror=alert(1)>',
    'url(javascript:alert(1))',
    'expression(alert(1))',
    "it's quoted",
    'back\\slash',
    '‮dnalsi',
    'Touch 💍',
  ]

  it('no fragment of it appears anywhere in the compiled CSS', () => {
    for (const bad of HOSTILE) {
      // fontSize forces a real rule out of the compiler, so the <style> element exists to inspect.
      const out = html(DEFAULT_INVOICE_CONFIG, { '111': { text: bad, textHi: bad, fontSize: 10 } })
      const style = out.match(/<style>([\s\S]*?)<\/style>/)
      expect(style, 'the override stylesheet should still be emitted').toBeTruthy()
      expect(style![1]).toBe('.inv-f-sell [data-field-count="111"]{font-size:10px}')
      for (const token of ['content:', 'display:none', 'img', 'onerror', 'url(', 'expression(', '💍', 'dnalsi', '\\']) {
        expect(style![1], `the stylesheet leaked ${token}`).not.toContain(token)
      }
    }
  })

  it('it prints as TEXT: the markup carries it escaped, and no new tag or attribute', () => {
    const out = html(DEFAULT_INVOICE_CONFIG, { '111': { text: '<img src=x onerror=alert(1)>' } })
    expect(out).not.toContain('<img src=x')
    // The whole string is on the page — as TEXT. What may not exist is a TAG carrying it: no
    // element on this sheet has an onerror, a src or any other attribute out of a stored label.
    expect(node(out, 111)).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(out).not.toMatch(/<[a-z][^>]*onerror/i)
    expect(out).not.toMatch(/<img/i)
    // A closing style tag typed into a label cannot end the sheet's own stylesheet.
    const styled = html(DEFAULT_INVOICE_CONFIG, { '111': { text: '</style><b>x', fontSize: 9 } })
    expect(styled.match(/<style>/g)).toHaveLength(1)
    expect(styled.match(/<\/style>/g)).toHaveLength(1)
    expect(styled).not.toContain('<b>x')
  })
})

/**
 * THE THREE TRADE COLUMNS, AND THE MAKING COLUMN'S TWO FORMS.
 *
 * All three default OFF, which is what keeps the paper geometry where it was. Every figure is a
 * presentation of a STORED column — nothing here is summed into anything.
 */
describe('fine weight · value addition · labour & other, on the sheet', () => {
  const ON: InvoiceConfig = {
    ...DEFAULT_INVOICE_CONFIG,
    showFineWeight: true, showValueAdd: true, showLineOtherCharges: true,
  }

  it('none of the three is on the default sheet at all', () => {
    const out = html(DEFAULT_INVOICE_CONFIG)
    for (const c of [121, 122, 123]) expect(out).not.toContain(`data-field-count="${c}"`)
  })

  it('fine weight prints the post-wastage fine grams: 22K + 2% on 12.000 g = 11.232 g', () => {
    const out = html(ON)
    // The heading, then one cell per line: gold, silver, the loose diamond (no purity), the MRP set.
    expect(column(out, 121)).toEqual(['Fine wt (g)', '11.232g', '55.500g', '—', '—'])
  })

  it('value addition and labour & other print the line’s own stored figures, or a dash', () => {
    // The sample bills carry neither, so the columns are honest dashes — and a line that HAS them
    // prints them: this is the itemised counterpart of the "Other charges (not itemised)" row.
    const base = sampleInvoice('purchase')
    const bill: PrintInvoice = {
      ...base,
      items: [{ ...base.items![0], valueAddAmount: 1200, otherCharges: 350 }],
    }
    const out = html(ON, undefined, bill)
    expect(column(out, 122)).toEqual(['Value add', '₹1,200'])
    // '&amp;' because this is compiled markup: the heading is escaped, which is the point.
    expect(column(out, 123)).toEqual(['Labour &amp; other', '₹350'])
    // A line with neither prints a dash, never ₹0.
    expect(column(html(ON), 122)).toEqual(['Value add', '—', '—', '—', '—'])
  })

  it('makingDisplay: percent prints the percentage, and falls back to rupees — never 0% or ∞', () => {
    const pct = html({ ...DEFAULT_INVOICE_CONFIG, makingDisplay: 'percent' })
    expect(column(pct, 117)).toEqual(['Making', '6.09%', '9.3%', '—', '—'])
    // The default form is the rupee figure the counter entered, exactly as before.
    expect(column(html(DEFAULT_INVOICE_CONFIG), 117)).toEqual(['Making', '₹5,400', '₹480', '—', '—'])
  })

  it('a loose stone IS the goods: the Stone ₹ column shows its value instead of a dash', () => {
    // An old bill, or one filled from stock: a pure-stone line with no stoneAmount column stored.
    const bill: PrintInvoice = {
      ...sampleInvoice('sale'),
      items: [{
        id: 'x1', name: 'Loose diamond 0.50 ct', hsnCode: '7102', stoneCertNo: 'GIA 2185471',
        netWeight: 0, stoneWeight: 0.1, rate: 0, amount: 42_500, qty: 1,
      }],
    }
    const out = html({ ...DEFAULT_INVOICE_CONFIG, showStone: true }, undefined, bill)
    expect(column(out, 118)).toEqual(['Stone ₹', '₹42,500'])
    // A metal line is never given a stone value it was not billed: the gold necklace stays a dash.
    expect(column(html({ ...DEFAULT_INVOICE_CONFIG, showStone: true }), 118))
      .toEqual(['Stone ₹', '—', '—', '₹42,500', '—'])
  })

  it('the 80mm roll shows the same figures, from the same functions', () => {
    const out = html({ ...ON, paper: 'roll80', makingDisplay: 'percent' })
    expect(text(node(out, 121))).toBe('FN 11.232g')
    expect(text(node(out, 117))).toBe('MC 6.09%')
  })

  /**
   * A5 drops all three, whatever is saved — see paperColumns(). Measured in the browser on a
   * one-line stone bill: the twelve default columns are already 138.4mm of a 124mm half sheet and
   * each of these adds ~9.5mm, which on paper is the Amount column printed off the right edge.
   */
  it('the half sheet prints none of the three, however they were saved', () => {
    const a5 = html({ ...ON, paper: 'a5' })
    for (const c of [121, 122, 123]) {
      expect(a5, `field ${c} reached the half sheet`).not.toContain(`data-field-count="${c}"`)
    }
    // The making-charge FORM is not a column, so A5 keeps it: no width is at stake.
    expect(column(html({ ...DEFAULT_INVOICE_CONFIG, paper: 'a5', makingDisplay: 'percent' }), 117))
      .toEqual(['Making', '6.09%', '9.3%', '—', '—'])
    // A4 and the roll are untouched by the correction.
    expect(html(ON)).toContain('data-field-count="121"')
    expect(html({ ...ON, paper: 'roll80' })).toContain('data-field-count="121"')
  })
})

/**
 * ── THE STONE GETS ITS OWN ROW ────────────────────────────────────────────────────────────────────
 *
 * oMunim puts the ring on the parent row and each stone on a child row beneath it, under the same
 * columns. The owner chose that over the prose run this sheet used to print under the item name
 * ("Stones: dia 5.00 ct FL E Round · GIA · ₹1,000/pc"), because at a counter you check a figure in
 * the column that says what it is.
 *
 * SO THE AMOUNT COLUMN MEANS SOMETHING NEW ON A STONE BILL, and that is what these assertions pin:
 * the item's row carries the METAL AND THE MAKING, each stone carries its own value, and the rows
 * add up to the line's stored amount. It is a presentation split of a figure already in the line —
 * nothing is recomputed — so invoiceFigures() and metalSubtotals() may not notice.
 */
describe('a stone prints as its own row in the item table', () => {
  /** The snapshot shape deriveLineStones() writes, with the per-stone `amount` it stores. */
  const SNAP = JSON.stringify([
    {
      seq: 0, name: 'dia', clarity: 'FL', colorGrade: 'E', shape: 'Round', certLab: 'GIA',
      certNo: '2185471', qty: 1, caratWeight: 1, weightUnit: 'GM', weightGrams: 1,
      rateCt: 1_000, rateUnit: 'PP', sellRateCt: null, amount: 1_000, deductFromGross: true,
    },
    { seq: 1, name: 'ruby', qty: 2, weightGrams: 0.4, rateCt: 500, rateUnit: 'CT', amount: 2_000 },
  ])
  /** 9.000 g at ₹15,000/g = ₹1,35,000 metal + ₹1,000 making + ₹3,000 of stones = ₹1,39,000. */
  const bill = (extra?: Partial<PrintInvoice>): PrintInvoice => ({
    ...sampleInvoice('purchase'),
    items: [{
      id: 's1', name: 'Diamond bridal necklace 22K', hsnCode: '7113', purity: '22K',
      metalType: 'gold', grossWeight: 10, netWeight: 9, stoneWeight: 1.4, stoneAmount: 3_000,
      stones: SNAP, makingCharge: 1_000, rate: 15_000, qty: 1, amount: 139_000,
    }],
    ...extra,
  })

  it('one row per stone, each under the columns that already exist', () => {
    const out = html(DEFAULT_INVOICE_CONFIG, undefined, bill())
    // Amount: the metal and the making on the item's row, each stone's own value below it, and the
    // three adding up to the ₹1,39,000 the line is stored at.
    expect(column(out, 120).slice(0, 4)).toEqual(['Amount', '₹1,36,000', '₹1,000', '₹2,000'])
    expect(136_000 + 1_000 + 2_000).toBe(139_000)
    // Weight in the Stone wt column — the line's aggregate on the parent (gross − stone = net is
    // still checkable there), each stone's own below it.
    expect(column(out, 113).slice(0, 4)).toEqual(['Stone wt', '1.400g', '1.000g', '0.400g'])
    // THE RATE, in the same column as the metal rate and in its own unit, per stone.
    expect(column(out, 116).slice(0, 4)).toEqual(['Rate', '₹1,50,000', '₹1,000/pc', '₹500/ct'])
    // The identity reads under the description, carat included, as it always did.
    expect(text(node(out, 105))).toContain('dia 5.00 ct FL E Round GIA 2185471')
    // …and the prose run is GONE from the sheet: the same facts twice is how a bill stops being
    // read at all.
    expect(out).not.toContain('Stones:')
  })

  it('the figures do not move — it is a split of a figure already in the line', () => {
    const inv = bill()
    const before = JSON.stringify([invoiceFigures(inv), metalSubtotals(inv.items || [])])
    html({ ...DEFAULT_INVOICE_CONFIG, showStone: true, showStoneCert: true }, undefined, inv)
    expect(JSON.stringify([invoiceFigures(inv), metalSubtotals(inv.items || [])])).toBe(before)
    // The Total row is the stored item total, not the parent cells added up.
    expect(invoiceFigures(inv).itemTotal).toBe(139_000)
    expect(column(html(DEFAULT_INVOICE_CONFIG, undefined, inv), 120).at(-1)).toBe('₹1,39,000')
  })

  it('a line that is PURELY a stone shows a dash, never ₹0, where its metal would be', () => {
    const loose = bill({
      items: [{
        id: 'l1', name: 'Loose diamond', netWeight: 0, stoneWeight: 1, stoneAmount: 1_000,
        stones: JSON.stringify([{ name: 'dia', weightGrams: 1, certLab: 'GIA', rateCt: 1_000, rateUnit: 'PP', amount: 1_000 }]),
        rate: 0, amount: 1_000, qty: 1,
      }],
    })
    expect(column(html(DEFAULT_INVOICE_CONFIG, undefined, loose), 120).slice(0, 3))
      .toEqual(['Amount', '—', '₹1,000'])
  })

  it('the 80mm roll keeps the stacked run — 74mm has no columns to put a row into', () => {
    const out = html({ ...DEFAULT_INVOICE_CONFIG, paper: 'roll80' }, undefined, bill())
    expect(text(node(out, 105)))
      .toBe('Stones: dia 5.00 ct FL E Round · GIA 2185471 · ₹1,000/pc; ruby ×2 2.00 ct · ₹500/ct')
  })

  it('a bill with no stones is untouched: no extra row, no dash, the stored amount', () => {
    const plain = html(DEFAULT_INVOICE_CONFIG, undefined, sampleInvoice('urd'))
    expect(plain).not.toContain('data-field-count="105"')
    expect(column(plain, 120).slice(0, 2)).toEqual(['Amount', '₹86,760'])
  })
})

/**
 * ── THE OLD-METAL BLOCK COMES APART ───────────────────────────────────────────────────────────────
 *
 * The owner, twice, the first time as "some customer dont want to show old metal prity hide the he
 * can". One field (216) covered the whole block, so a shop could hide the exchange or none of it and
 * could rename nothing inside it. The five figures are now fields 230–235, each with its own node,
 * its own switch and its own caption — and 216 still switches the block as a whole.
 */
describe('the old-metal block is five fields, not one', () => {
  const withOldMetal = (extra?: Partial<PrintInvoice>): PrintInvoice =>
    ({ ...sampleInvoice('sale'), ...extra })

  // node() reads the CAPTION of a Pair and not its figure: it stops at the first close tag, and a
  // Pair nests the Devanagari half inside the caption span. The caption is what is under test here.
  it('every figure in it has a node of its own, captioned in both languages', () => {
    const out = html(DEFAULT_INVOICE_CONFIG, undefined, withOldMetal({ bhavCut: 500 }))
    expect(text(node(out, 230))).toBe('Weight वजन')
    expect(text(node(out, 231))).toBe('Purity quoted तुन्च')
    expect(text(node(out, 232))).toBe('Rate paid भाव')
    expect(text(node(out, 233))).toBe('Value मूल्य')
    expect(text(node(out, 234))).toBe('Bhav cut भाव कटौती')
    expect(text(node(out, 235))).toBe('Credited जमा')
    // …and every figure they caption is on the paper beside them.
    for (const v of ['5.000g', '22K / 91.6', '₹66,000', '− ₹500']) {
      expect(out, `the old-metal block lost ${v}`).toContain(v)
    }
  })

  it('the purity can be hidden on its own, and the rest of the block still prints', () => {
    const out = html(DEFAULT_INVOICE_CONFIG, { '231': { show: false } }, withOldMetal())
    expect(out).toContain('[data-field-count="231"]{display:none !important}')
    // Nothing else in the block picked up a rule, and the block itself is still there.
    expect(out).not.toContain('[data-field-count="230"]{display:none')
    expect(out).toContain('data-field-count="216"')
    expect(out).toContain('5.000g')
  })

  it('each caption is renameable, and the block heading with them', () => {
    const out = html(DEFAULT_INVOICE_CONFIG, {
      '216': { text: 'Old gold taken', textHi: 'पुराना सोना' },
      '231': { text: 'Tunch', textHi: 'टंच' },
      '235': { text: 'Adjusted', textHi: '' },
    }, withOldMetal())
    expect(out).toContain('Old gold taken')
    expect(out).toContain('पुराना सोना')
    expect(out).not.toContain('Old metal received')
    expect(text(node(out, 231))).toBe('Tunch टंच')
    // An emptied Hindi half prints nothing at all rather than an empty span.
    expect(text(node(out, 235))).toBe('Adjusted')
  })

  it('the "(from value ÷ weight)" disclosure survives a rename — it is data, not wording', () => {
    // A bill raised before Invoice.oldGoldRate existed: the rate has to be reconstructed.
    const old = withOldMetal({ oldGoldRate: null })
    const out = html(DEFAULT_INVOICE_CONFIG, { '232': { text: 'Bhav' } }, old)
    expect(text(node(out, 232))).toBe('Bhav (from value ÷ weight) भाव')
  })
})

/**
 * THE TABLE STAYS RECTANGULAR.
 *
 * The three new columns live between Net wt and Amount, which is inside the span the per-metal
 * subtotal rows and the Total row leave blank (itemColumnSpans' `tail`). Get that addition wrong by
 * one and the bands print under the wrong headings — the exact defect itemColumnSpans was written
 * to end. So every row of the item table is counted, colspans included, at every combination that
 * matters.
 */
describe('every row of the item table is the same number of columns wide', () => {
  const widths = (markup: string): number[] => {
    const table = markup.split('<table').find((t) => t.includes('Invoice line items'))
    expect(table, 'the item table should be in the markup').toBeTruthy()
    const body = table!.slice(0, table!.indexOf('</table>'))
    return body.split('<tr').slice(1).map((row) =>
      [...row.matchAll(/<t[dh]([^>]*)>/g)]
        // `colSpan` — renderToStaticMarkup keeps React's camel case, so this is case-insensitive
        // rather than the lower-case attribute a browser would show in devtools.
        .reduce((n, m) => n + Number(/colspan="(\d+)"/i.exec(m[1])?.[1] ?? 1), 0))
  }

  const COMBOS: [string, Partial<InvoiceConfig>][] = [
    ['the default sheet', {}],
    ['all three on', { showFineWeight: true, showValueAdd: true, showLineOtherCharges: true }],
    ['fine weight only', { showFineWeight: true }],
    ['value add only', { showValueAdd: true }],
    ['labour & other only', { showLineOtherCharges: true }],
    ['everything, with the framed bands', {
      showFineWeight: true, showValueAdd: true, showLineOtherCharges: true,
      showWastage: true, showStone: true, showHsn: true, showPurity: true, showGrossWeight: true,
      table: 'framed',
    }],
    ['nothing optional at all', {
      showFineWeight: true, showHsn: false, showPurity: false, showGrossWeight: false,
      showMaking: false, showStone: false,
    }],
  ]

  for (const [name, patch] of COMBOS) {
    it(name, () => {
      for (const id of SAMPLE_IDS) {
        const w = widths(html({ ...DEFAULT_INVOICE_CONFIG, ...patch }, undefined, sampleInvoice(id)))
        expect(w.length, `${id}: no rows`).toBeGreaterThan(1)
        expect(new Set(w), `${id} / ${name}: ragged table, row widths ${w.join(',')}`).toHaveLength(1)
      }
    })
  }
})

/**
 * NO MONEY MOVES. Every knob added here is PRESENTATION: a stone value read off a stored column, a
 * fine weight derived from stored purity, a making charge restated as a percentage, a caption the
 * shop typed. invoiceFigures() and metalSubtotals() are the two functions the whole sheet's
 * arithmetic comes out of, and neither may notice any of it.
 */
describe('the bill’s figures are byte-identical with every new knob on', () => {
  it('for all six sample bills, before and after rendering the loudest possible sheet', () => {
    for (const id of SAMPLE_IDS) {
      const inv = sampleInvoice(id)
      const before = JSON.stringify([invoiceFigures(inv), metalSubtotals(inv.items || [])])
      html(
        {
          ...DEFAULT_INVOICE_CONFIG,
          showFineWeight: true, showValueAdd: true, showLineOtherCharges: true,
          makingDisplay: 'percent', showStone: true, showWastage: true,
        },
        { '111': { text: 'Touch', textHi: 'टच' }, '211': { text: 'Net payable' }, '118': { text: 'Nag ₹' } },
        inv,
      )
      const after = JSON.stringify([invoiceFigures(inv), metalSubtotals(inv.items || [])])
      expect(after, `${id}: a presentational knob moved a figure`).toBe(before)
      expect(JSON.stringify(inv), `${id}: the bill itself was mutated`).toBe(JSON.stringify(sampleInvoice(id)))
    }
  })

  it('and the printed grand total is the same string with the knobs on as with them off', () => {
    for (const id of SAMPLE_IDS) {
      const plain = node(html(DEFAULT_INVOICE_CONFIG, undefined, sampleInvoice(id)), 211)
      const loud = node(html({
        ...DEFAULT_INVOICE_CONFIG, showFineWeight: true, showValueAdd: true,
        showLineOtherCharges: true, makingDisplay: 'percent',
      }, undefined, sampleInvoice(id)), 211)
      expect(text(loud), id).toBe(text(plain))
    }
  })
})
