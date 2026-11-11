import { test, expect, type Locator, type Page } from '@playwright/test'
import { STATE } from '../auth'
import { FIX } from '../seed'
import { gotoView, setRateBoard } from './app'
import { invoiceFieldsKey } from '@/components/app/print/invoice-fields'
import { INVOICE_LAYOUT_KEY, invoiceLayoutKey, DEFAULT_INVOICE_CONFIG, INVOICE_BANNER_KEYS, contentWidthMm } from '@/components/app/print/invoice-print'
import { INVOICE_TEMPLATES, paletteHex } from '@/components/app/print/invoice-templates'

/**
 * THE INVOICE CUSTOMIZATION STUDIO, AS FAR AS THE PAPER
 *
 * The studio's one promise is "click a label on the bill, change that label, and that is what
 * prints". Four agents have worked on this feature and the half that kept being left out is the
 * second half of that sentence: the registry, the twelve skins, the clickable preview, the editor
 * popover and the save all landed, and sell.tsx - the ONLY path that reaches actual paper at the
 * counter - mounted <InvoiceSheet> without `fieldOverrides`. A shop could restyle its bill, press
 * Save, watch the preview change, print the real invoice and get the untouched sheet.
 *
 * It was silent in every other gate: `fieldOverrides` is an optional prop, so omitting it is legal
 * TypeScript, renders fine, and the unit tests all passed because they exercise the studio's own
 * preview. Only printing it catches this.
 *
 * So this file does the whole journey in the browser and then reads the PRINTED sheet:
 *   1. restyle a label through the studio's own popover, by clicking the label on the bill;
 *   2. save it;
 *   3. open a real bill at the counter, press Print, and require the SAME computed size and
 *      colour on the sheet that is about to go through the printer;
 *   4. and for the print-only flag, emulate print media - the one override class that exists
 *      nowhere except on paper.
 *
 * Owner: erp-manager (found and fixed here). Companion unit guard:
 * tests/unit/invoice-field-attrs.test.ts, which fails if any <InvoiceSheet> mount drops the prop.
 */

test.use({ storageState: STATE.admin })

const FIRM = FIX.firmJBS.id
const STAMP = Date.now().toString(36)
const PARTY = `Studio ${STAMP}`
/** The stone bill - INV-1035's own shape. See the stone test at the foot of this file. */
const STONE_PARTY = `Stone ${STAMP}`
/** A bill settled partly with old gold, for the old-metal block's own test. */
const EXCHANGE_PARTY = `Exchange ${STAMP}`

/** 215 `amountInWords` - always on the sheet, and freely styleable (not locked, not a column). */
const AMOUNT_IN_WORDS = 215
/** 42 `copyMarker` - "Original for Recipient", always rendered, and hideable. */
const COPY_MARKER = 42

const RED = '#b91c1c'
const RED_RGB = 'rgb(185, 28, 28)'
const SIZE = 20

/** The studio's live preview - one copy, so exactly one node per field. */
const studioField = (page: Page, count: number) =>
  page.locator(`[data-field-count="${count}"]`).first()

/** The print sheet. `officeCopy` defaults ON, so read the copy the customer is handed. */
const printSheet = (page: Page) => page.getByRole('dialog', { name: /print preview$/ })
const sheetField = (page: Page, count: number) =>
  printSheet(page).locator(`.print-paper [data-field-count="${count}"]`).first()
/**
 * The first BODY cell of a column, not its heading. A column's attribute is on the <th> AND on
 * every <td> under it (that is the point - a shop styling a column styles the whole column), so
 * sheetField() on a column count resolves to the heading and reads back "Stone wt" rather than
 * "1.000 g". Cost me a full 10-minute suite run.
 */
const sheetCell = (page: Page, count: number) =>
  printSheet(page).locator(`.print-paper tbody td[data-field-count="${count}"]`).first()

const css = (el: Locator, prop: string) =>
  el.evaluate((n, p) => getComputedStyle(n).getPropertyValue(p), prop)

/**
 * The sheet's VISIBLE text — innerText, not textContent.
 *
 * A hidden field keeps its node: fieldOverrideCss writes `display:none !important` and never
 * removes anything, so textContent still carries a hidden caption while the paper and the PDF carry
 * none of it. For "did this actually stop printing?" innerText is the only honest reader.
 */
const visibleText = (page: Page) =>
  printSheet(page).locator('.print-paper').first().evaluate((n) => (n as HTMLElement).innerText)

/** Write one saved override map straight onto the firm, the way the studio's Save does. */
async function putOverrides(page: Page, map: Record<string, unknown>) {
  const res = await page.request.put('/api/settings', {
    data: { firmId: FIRM, key: invoiceFieldsKey('sell'), value: JSON.stringify(map) },
  })
  expect(res.status(), await res.text()).toBe(200)
}

/** A plain taxed sale with one gold line, posted through the real API. */
test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: STATE.admin })
  const page = await ctx.newPage()
  // THE BOARD FIRST, and this is a gate correction, not setup noise. billRates() returns [] when
  // the firm has no rates, so without this every geometry measurement below was taken on a sheet
  // with NO RATE BAND — a bill no shop can actually print. That is ~21px of header the gate never
  // saw: classic measured 652px on A5 here and 673px inside the full run (where another spec had
  // seeded the board), and at 673px it spills to a second page. The paper gate must measure the
  // bill a real shop prints, so the board is seeded here and stays seeded.
  await setRateBoard(page, FIRM)
  const rate = 137538
  const res = await page.request.post('/api/invoices', {
    data: {
      firmId: FIRM, type: 'sale', customerName: PARTY, customerMobile: '9876500123',
      invoiceDate: new Date().toISOString(),
      goldRate: rate, subtotal: rate, discount: 0, metalAmount: 0,
      cgst: rate * 0.015, sgst: rate * 0.015, igst: 0,
      totalAmount: Math.round(rate * 1.03), rofAmount: 0,
      amountByCash: Math.round(rate * 1.03), paymentMode: 'cash', status: 'completed',
      items: [{
        name: `Studio ring ${STAMP}`, hsnCode: '7113', purity: '22K', category: 'fine',
        grossWeight: 10, netWeight: 10, makingCharge: 0, qty: 1, rate,
        amount: rate, cgst: rate * 0.015, sgst: rate * 0.015, igst: 0, total: rate,
      }],
    },
  })
  expect(res.status(), await res.text()).toBe(200)

  /**
   * INV-1035, re-raised: ONE certified round diamond on a 22K line, posted through the real API so
   * the `stones` TEXT column is written by deriveLineStones() and not by this test.
   *
   * 10.000 g gross, the stone's 1.000 g deducted from it (deductFromGross) -> 9.000 g net, priced
   * at ₹15,000/g, + ₹1,000 stone + ₹1,000 making = ₹1,37,000. Exactly the sheet the owner
   * screenshotted, on which the word "diamond" appeared nowhere.
   */
  const stoneBase = 9 * 15_000 + 1_000 + 1_000
  const stoneRes = await page.request.post('/api/invoices', {
    data: {
      firmId: FIRM, type: 'sale', customerName: STONE_PARTY, customerMobile: '9876500124',
      invoiceDate: new Date().toISOString(),
      goldRate: 150_000, subtotal: stoneBase, discount: 0, metalAmount: 0,
      totalAmount: Math.round(stoneBase * 1.03), paymentMode: 'cash', status: 'completed',
      items: [{
        name: `sring ${STAMP}`, hsnCode: '7113', purity: '24K', category: 'fine', metalType: 'gold',
        byWeight: true, grossWeight: 10, netWeight: 9, makingCharge: 1_000, qty: 1, rate: 15_000,
        amount: stoneBase,
        stones: [{
          name: 'dia', clarity: 'FL', colorGrade: 'E', shape: 'Round', certLab: 'GIA',
          qty: 1, caratWeight: 1, weightUnit: 'GM', rateCt: 1_000, rateUnit: 'PP',
          deductFromGross: true,
        }],
      }],
    },
  })
  expect(stoneRes.status(), await stoneRes.text()).toBe(200)
  // The premise of the whole test: the DATA was always right. If this drifts, the print test below
  // would pass or fail for a reason that has nothing to do with printing.
  const stored = (await stoneRes.json()).invoice.items[0]
  expect(stored.stoneWeight, 'the stone’s own weight').toBe(1)
  expect(stored.stoneAmount, 'the stone’s own value').toBe(1000)
  expect(stored.netWeight, 'gross 10 g less the deducted stone').toBe(9)
  expect(JSON.parse(stored.stones)).toMatchObject([{
    name: 'dia', clarity: 'FL', colorGrade: 'E', shape: 'Round', certLab: 'GIA',
    weightGrams: 1, amount: 1000, deductFromGross: true,
  }])
  // NOT double-counted: the line's taxable amount is metal + making + stone, once each.
  expect(stored.amount, 'the stone billed exactly once').toBe(stoneBase)

  /**
   * AN EXCHANGE BILL, for the old-metal block: 5.000 g of 91.6 tunch at ₹66,000 per 10 g = ₹33,000,
   * less a ₹500 bhav cut = ₹32,500 credited, and the balance settled in cash.
   *
   * No bill in this file carried old metal before, so the block the owner has now asked about twice
   * ("some customer dont want to show old metal prity hide the he can") had never been printed by a
   * gate at all — and Invoice.bhavCut, the figure a customer argues about when he hands over gold,
   * had never been proven to reach paper.
   */
  const exchangeBase = 1_00_000
  const exchangeRes = await page.request.post('/api/invoices', {
    data: {
      firmId: FIRM, type: 'sale', customerName: EXCHANGE_PARTY, customerMobile: '9876500125',
      invoiceDate: new Date().toISOString(),
      goldRate: 150_000, subtotal: exchangeBase, discount: 0, metalAmount: 0,
      oldGoldWeight: 5, oldGoldRate: 66_000, oldGoldPurity: '91.6 tunch', bhavCut: 500,
      paymentMode: 'cash', status: 'completed',
      items: [{
        name: `Exchange chain 22K ${STAMP}`, hsnCode: '7113', purity: '22K', category: 'fine',
        metalType: 'gold', byWeight: true, grossWeight: 8, netWeight: 8, qty: 1,
        rate: 12_500, makingCharge: 0, amount: exchangeBase,
      }],
    },
  })
  expect(exchangeRes.status(), await exchangeRes.text()).toBe(200)
  const ex = (await exchangeRes.json()).invoice
  expect([ex.oldGoldWeight, ex.oldGoldValue, ex.bhavCut], 'the exchange figures as stored')
    .toEqual([5, 33_000, 500])

  await ctx.close()
})

/**
 * A Setting is PER FIRM and PERSISTED - a spec that writes one owes the slot a clean board back,
 * or every later spec in this run prints on whatever paper and colour the last case left behind.
 * Both keys this file writes are reset: the per-field overrides AND the layout blob.
 */
test.afterEach(async ({ page }) => {
  await putOverrides(page, {})
  // The legacy global row AND every per-type row this file writes. A layout is now read per
  // document type with the global row as the fallback, so resetting only the global one would
  // leave `invoice.layout.sell` in force over it and hand the next spec this one's design.
  for (const key of [INVOICE_LAYOUT_KEY, invoiceLayoutKey('sell'), invoiceLayoutKey('purchase')]) {
    const res = await page.request.put('/api/settings', {
      data: { firmId: FIRM, key, value: JSON.stringify(DEFAULT_INVOICE_CONFIG) },
    })
    expect(res.status(), await res.text()).toBe(200)
  }
})

/** Open the counter's own reprint of this spec's bill (sell.tsx InvoiceView -> InvoiceSheet). */
async function openCounterPrint(page: Page, party = PARTY) {
  await gotoView(page, 'Sell & Purchase')
  await page.getByPlaceholder('Search invoice, party…').fill(party)
  const row = page.getByRole('row').filter({ hasText: party })
  await expect(row).toHaveCount(1)
  await row.getByTitle('View').click()
  const view = page.getByRole('dialog', { name: /^Tax Invoice — / })
  await expect(view).toBeVisible()
  await view.getByRole('button', { name: /^Print$/ }).click()
  // Wait on the SHEET, not on any one field: the 80mm roll renders a stacked layout and need not
  // carry every node the A4 columnar bill does, so waiting on a field here would make the geometry
  // cases below fail for the wrong reason.
  await expect(printSheet(page).locator('.print-paper').first()).toBeVisible()
}

test('restyling a label in the studio reaches the printed bill at the counter', async ({ page }, info) => {
  await page.goto('/')
  await gotoView(page, 'Print')
  await page.getByRole('tab', { name: 'Invoice Layout' }).click()

  // 1. click the label ON THE BILL, which is the whole premise of the studio
  const label = studioField(page, AMOUNT_IN_WORDS)
  await expect(label).toBeVisible()
  const before = await css(label, 'font-size')
  expect(before, 'the sheet already prints at the size under test - pick another').not.toBe(`${SIZE}px`)
  await label.click()

  const editor = page.getByRole('dialog').filter({ hasText: `field #${AMOUNT_IN_WORDS}` })
  await expect(editor).toBeVisible()
  await expect(editor).toContainText('Amount in words')

  // 2. size and colour, and the PREVIEW has to move
  await editor.getByLabel('Font size (px)').fill(String(SIZE))
  await editor.locator('input[type="color"]').fill(RED)
  await expect(label).toHaveCSS('font-size', `${SIZE}px`)
  await expect(label).toHaveCSS('color', RED_RGB)

  await page.keyboard.press('Escape')
  await page.screenshot({ path: info.outputPath('studio-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 400, height: 900 })
  await page.screenshot({ path: info.outputPath('studio-400px.png'), fullPage: true })
  await page.setViewportSize({ width: 1280, height: 900 })

  // 3. save it, and prove the row landed
  await page.getByRole('button', { name: /Save layout/ }).click()
  await expect(page.getByText('Invoice layout saved for this firm')).toBeVisible()
  const rows = await (await page.request.get(`/api/settings?firmId=${FIRM}`)).json()
  const saved = rows.settings.find((r: { key: string }) => r.key === invoiceFieldsKey('sell'))
  expect(saved, 'Save wrote no invoice.fields.sell row').toBeTruthy()
  expect(JSON.parse(saved.value)[String(AMOUNT_IN_WORDS)]).toMatchObject({ fontSize: SIZE, color: RED })

  // 4. THE ACCEPTANCE TEST: the same figure on the sheet that goes through the printer.
  // This is the assertion that was failing - sell.tsx mounted the sheet without fieldOverrides,
  // so the studio moved and the paper did not.
  await openCounterPrint(page)
  const printed = sheetField(page, AMOUNT_IN_WORDS)
  await expect(printed, 'the saved size never reached the printed bill').toHaveCSS('font-size', `${SIZE}px`)
  await expect(printed, 'the saved colour never reached the printed bill').toHaveCSS('color', RED_RGB)
  await page.screenshot({ path: info.outputPath('counter-print.png'), fullPage: true })

  // 5. and on the actual paper: print to PDF with print CSS in force
  await page.emulateMedia({ media: 'print' })
  await expect(printed).toHaveCSS('font-size', `${SIZE}px`)
  await expect(printed).toHaveCSS('color', RED_RGB)
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true })
  const pages = Number(/\/Count\s+(\d+)/.exec(pdf.toString('latin1'))?.[1] ?? NaN)
  expect(Number.isFinite(pages) && pages > 0, 'no printable PDF came out').toBe(true)
  await page.emulateMedia({ media: null })
})

test('leave off the printed copy: on screen, gone from the paper', async ({ page }) => {
  // The @media print branch of fieldOverrideCss is the one rule class that exists nowhere but on
  // paper, so screen-only verification can never see it.
  await putOverrides(page, { [String(COPY_MARKER)]: { print: false } })
  await page.goto('/')
  await openCounterPrint(page)

  const marker = sheetField(page, COPY_MARKER)
  await expect(marker, 'on screen it must still be visible - that is the point of the flag').toBeVisible()

  await page.emulateMedia({ media: 'print' })
  await expect(marker, 'print:false did not reach @media print').toHaveCSS('display', 'none')
  await page.emulateMedia({ media: null })
  await expect(marker).toBeVisible()
})

/**
 * PAPER GEOMETRY: EVERY SKIN, ON ALL THREE PAPERS, READ BACK OUT OF THE PDF
 *
 * A screenshot cannot answer "did this gain a page" or "did Chromium keep the @page size". Both
 * have been real defects here: a tag spilled to two pages, a barcode ate a price line, an A5 stone
 * preset overflowed by 8px, and an 80mm roll printed on US Letter because `size: 80mm auto` was
 * silently discarded. `/Count` is the page tree's own count; `/MediaBox` is the paper Chromium
 * actually used, in points.
 *
 * tests/e2e/invoice-print-sheet.spec.ts wrote these checks and then DELETED them, honestly, because
 * every one of them drove the sheet's paper picker: the print preview opens on top of the invoice
 * dialog, a second `dialog-overlay` sits between the pointer and that trigger, and the click never
 * lands even from the keyboard. This file does not fight that overlay. It sets the shop's SAVED
 * paper through the layout Setting - which is the real path a shop's paper choice takes anyway -
 * and never opens the picker at all.
 *
 * Driven off the exported INVOICE_TEMPLATES, so it covers whatever skins ship rather than a list
 * that goes stale the next time the gallery is edited.
 */

/** mm per paper, as Chromium should emit it. Roll height is content-driven, so only width is fixed. */
const PAPER_MM: Record<string, { w: number; h?: number }> = {
  a4: { w: 210, h: 297 },
  a5: { w: 148, h: 210 },
  roll80: { w: 80 },
}

/**
 * Save a whole InvoiceConfig as the firm's layout for ONE document type, the way the studio's Save
 * does.
 *
 * It must be the per-type row, not the legacy global one: the layout is now read per document type
 * with the global row only as the FALLBACK, so a per-type row - even one holding nothing but
 * defaults - shadows anything written globally. Writing the global key here made every skin below
 * render as the default sheet, in the default colour, on the default paper, and the geometry
 * assertions then measured a bill that no setting under test had produced.
 *
 * The legacy fallback is guaranteed where it is deterministic and free - a unit test over
 * parseInvoiceConfig in tests/unit/invoice-field-attrs.test.ts - rather than through a browser,
 * where it would depend on a row this very file keeps writing.
 */
async function putLayout(page: Page, config: Record<string, unknown>, docType = 'sell') {
  const res = await page.request.put('/api/settings', {
    data: { firmId: FIRM, key: invoiceLayoutKey(docType), value: JSON.stringify(config) },
  })
  expect(res.status(), await res.text()).toBe(200)
}

/** Page count and the distinct MediaBoxes, in mm, out of the real printed bytes. */
async function pdfGeometry(page: Page) {
  // Fonts FIRST. `next/font` self-hosts Geist but serves the file on demand, so under `next dev`
  // a pdf() taken too early renders in the system fallback - different metrics, different line
  // heights, a different sheet height - and a design sitting near the page boundary spills or does
  // not depending on whether the font had landed. That is the whole flake: this case failed inside
  // the full run and passed every time the e2e project ran alone.
  // `.then(() => undefined)`: document.fonts.ready resolves with the FontFaceSet itself, which is
  // not serialisable across the CDP boundary - returning it directly makes Playwright try to ship a
  // live DOM object back and the call stalls instead of resolving.
  // Fonts, properly. `document.fonts.ready` alone is NOT enough and this cost a full debugging
  // cycle: it resolves as soon as nothing is *pending*, and under `next dev` a face that has not
  // been REQUESTED yet is not pending — so it returns instantly and the sheet is then measured in
  // the system fallback. Fallback metrics run ~8% taller: the same classic A5 sheet measured 652px
  // alone and 673px inside the full run, and at 673px it spilled to a second page. Loading every
  // registered face first makes the measurement the same number every time.
  await page.evaluate(() =>
    Promise.all(Array.from(document.fonts).map((f) => f.load()))
      .then(() => document.fonts.ready)
      .then(() => undefined),
  )
  // How tall the sheet actually is, so a spill reports a measurement instead of just a page count.
  const sheetPx = await page.locator('.print-paper').first().evaluate((n) => ({
    h: Math.round(n.getBoundingClientRect().height), scroll: n.scrollHeight,
  }))
  const buf = await page.pdf({ preferCSSPageSize: true, printBackground: true })
  const raw = buf.toString('latin1')
  const pages = Number(/\/Count\s+(\d+)/.exec(raw)?.[1] ?? NaN)
  expect(Number.isFinite(pages), 'no /Count in the generated PDF').toBe(true)
  const boxes = [...new Set(raw.match(/\/MediaBox\s*\[[^\]]*\]/g) ?? [])].map((b) => {
    const [x0, y0, x1, y1] = b.replace(/[^\d.\s-]/g, '').trim().split(/\s+/).map(Number)
    const mm = (pt: number) => Math.round((pt / 72) * 25.4 * 10) / 10
    return { w: mm(x1 - x0), h: mm(y1 - y0) }
  })
  expect(boxes.length, 'no /MediaBox in the generated PDF').toBeGreaterThan(0)
  return { pages, boxes, sheetPx }
}

test.describe('every skin prints on A4, A5 and the 80mm roll', () => {
  // 3 papers x N skins, each a settings write, a reload and a real PDF render.
  test.setTimeout(180_000)

  for (const t of INVOICE_TEMPLATES) {
    test(`skin "${t.id}" (${t.label})`, async ({ page }) => {
      const report: string[] = []
      for (const paper of ['a4', 'a5', 'roll80'] as const) {
        // The skin, its OWN PALETTE, then the paper under test, then ONE copy - so a page count
        // above 1 on a single-line bill means the sheet genuinely spilled, not that an office copy
        // was printed.
        //
        // The accent is not decoration here. Without it every fill on the sheet renders down its
        // neutral branch - the angular band's two tones, the framed table's border, the banded
        // grand total, the closing band - and the gate measures a bill no shop will ever print.
        // A fill costs no height, so the page counts were never wrong; the COLOURED path was
        // simply never exercised. It is now.
        const accent = paletteHex(t.palette)
        await putLayout(page, {
          ...DEFAULT_INVOICE_CONFIG, ...t.patch, ...t.skin,
          accent, paper, officeCopy: false, template: t.id,
        })
        await page.goto('/')
        await openCounterPrint(page)

        await page.emulateMedia({ media: 'print' })
        const { pages, boxes, sheetPx } = await pdfGeometry(page)
        await page.emulateMedia({ media: null })

        const want = PAPER_MM[paper]
        report.push(
          `${paper}: ${pages}p ${boxes.map((b) => `${b.w}x${b.h}mm`).join(' ')} sheet ${sheetPx.h}px`,
        )

        // A skin that ships a palette must actually put it on the paper. 'none' is the neutral
        // stone sheet by design (minimal, thermal), and the 80mm roll refuses every accent -
        // a thermal head renders a filled heading as a solid black bar the text vanishes into.
        if (accent && paper !== 'roll80') {
          // Match BOTH spellings. React sets these through the CSSOM rather than as an authored
          // attribute string, so the browser hands innerHTML back the normalised `rgb(r, g, b)` -
          // asserting on the hex alone fails on a sheet that is visibly, correctly coloured, which
          // is exactly what this check did on its first run.
          const html = (await printSheet(page).locator('.print-paper').first().innerHTML()).toLowerCase()
          const n = (i: number) => parseInt(accent.slice(1 + i * 2, 3 + i * 2), 16)
          const rgb = `rgb(${n(0)}, ${n(1)}, ${n(2)})`
          expect(
            html.includes(accent.toLowerCase()) || html.includes(rgb),
            `${t.id} ships palette "${t.palette}" (${accent} / ${rgb}) but it reaches nothing on ${paper}`,
          ).toBe(true)
        }

        // The paper Chromium actually used. A roll that lands on Letter (216x279) fails here.
        for (const b of boxes) {
          expect(Math.abs(b.w - want.w), `${t.id} ${paper}: width ${b.w}mm, wanted ${want.w}mm (${report.join(' | ')})`).toBeLessThan(2)
          if (want.h !== undefined) {
            expect(Math.abs(b.h - want.h), `${t.id} ${paper}: height ${b.h}mm, wanted ${want.h}mm`).toBeLessThan(2)
          }
        }
        // One gold line, one copy. Anything above one page is the sheet spilling.
        expect(
          pages,
          `${t.id} on ${paper} spilled to ${pages} pages on a one-line bill - the sheet measured ` +
            `${sheetPx.h}px tall (content ${sheetPx.scroll}px) against a ${want.h ?? 'rolling'}mm ` +
            `page (${report.join(' | ')})`,
        ).toBe(1)
      }
      console.log(`[geometry] ${t.id}: ${report.join(' | ')}`)
    })
  }
})

/**
 * A DIFFERENT DESIGN PER DOCUMENT TYPE - the owner's own words:
 *
 *   "my sell invoice has a different template and purchase has different - it is totally my
 *    choice what I want, same or different."
 *
 * The field overrides were already per document type. The LAYOUT was one global `invoice.layout`
 * row, so picking a design for the sale invoice silently re-skinned the purchase bill, the credit
 * note, the debit note and the URD voucher too - on the one screen whose entire left-hand column
 * is a document-type list.
 *
 * This prints BOTH types through the studio's own full print preview, which mounts the same
 * InvoiceSheet the counter mounts, and requires the two sheets to actually come out different.
 */
const byId = (id: string) => {
  const t = INVOICE_TEMPLATES.find((x) => x.id === id)
  if (!t) throw new Error(`template "${id}" is gone - this test needs a colour one and a plain one`)
  return t
}

/** '#rrggbb' as the browser serialises it back out of the CSSOM. */
const asRgb = (hex: string) =>
  `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`

/** Open the studio's full print preview for the selected document type and return the sheet HTML. */
async function studioPrintHtml(page: Page, docLabel: string) {
  await page.getByRole('button', { name: new RegExp(`^${docLabel}`) }).click()
  await page.getByRole('button', { name: /Full print preview/ }).click()
  const sheet = printSheet(page).locator('.print-paper').first()
  await expect(sheet).toBeVisible()
  const html = (await sheet.innerHTML()).toLowerCase()
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true })
  const pages = Number(/\/Count\s+(\d+)/.exec(pdf.toString('latin1'))?.[1] ?? NaN)
  await page.keyboard.press('Escape')
  await expect(printSheet(page)).toBeHidden()
  return { html, pages }
}

test('a saved "no office copy" survives settings arriving AFTER the sheet is open', async ({ page }) => {
  // THE DEFECT THIS PINS: InvoiceSheet latched `officeCopy` out of `config` on the closed -> open
  // transition, but `config` is parsed from a settings fetch and the dialog is mounted ALREADY open.
  // The first render therefore got parseInvoiceConfig(undefined) - the defaults, where officeCopy is
  // true - and the shop's saved `false` landed after the only transition that read it. Result: two
  // copies of every bill, on a sheet that measures well inside one page. Twice the paper, silently.
  //
  // The 1.2s delay makes that race certain instead of load-dependent: this failed in a full run and
  // passed every time the e2e project ran alone, which is no way to hold a defect down.
  await putLayout(page, { ...DEFAULT_INVOICE_CONFIG, paper: 'a4', officeCopy: false, template: 'classic' })
  await page.route('**/api/settings?*', async (route) => {
    await new Promise((r) => setTimeout(r, 1200))
    await route.continue()
  })

  await page.goto('/')
  await openCounterPrint(page)
  // The settings response is now certainly in flight behind the open sheet. Let it land.
  await expect
    .poll(async () => printSheet(page).locator('.print-paper').count(), { timeout: 15_000 })
    .toBe(1)
  await expect(printSheet(page)).not.toContainText('Duplicate for Supplier')

  await page.emulateMedia({ media: 'print' })
  const { pages } = await pdfGeometry(page)
  await page.emulateMedia({ media: null })
  expect(pages, 'a one-line bill with office copies OFF printed more than one page').toBe(1)
  await page.unroute('**/api/settings?*')
})

test('Sale and Purchase each keep their own design, and both reach the paper', async ({ page }) => {
  const colour = byId('classic')
  const plain = byId('minimal')
  const accent = paletteHex(colour.palette)
  expect(accent, 'the colour template under test ships no palette').not.toBe('')

  // Sale gets the coloured design, Purchase the colourless one - saved exactly as the studio saves.
  const layout = (t: typeof colour, acc: string) => ({
    ...DEFAULT_INVOICE_CONFIG, ...t.patch, ...t.skin,
    accent: acc, paper: 'a4', officeCopy: false, template: t.id,
  })
  for (const [docType, cfg] of [['sell', layout(colour, accent)], ['purchase', layout(plain, '')]] as const) {
    const res = await page.request.put('/api/settings', {
      data: { firmId: FIRM, key: invoiceLayoutKey(docType), value: JSON.stringify(cfg) },
    })
    expect(res.status(), await res.text()).toBe(200)
  }

  await page.goto('/')
  await gotoView(page, 'Print')
  await page.getByRole('tab', { name: 'Invoice Layout' }).click()

  const sale = await studioPrintHtml(page, 'Sale invoice')
  const purchase = await studioPrintHtml(page, 'Purchase bill')

  // THE ASSERTION: two document types, two designs, on the paper.
  expect(sale.html, 'the sale design never reached its own sheet').toContain(asRgb(accent))
  expect(purchase.html, 'the purchase bill inherited the sale invoice’s colour').not.toContain(asRgb(accent))
  expect(sale.html === purchase.html, 'both document types printed the identical sheet').toBe(false)
  // Both produced real printable paper. Page COUNT is deliberately not asserted here: this prints
  // the studio's four-line sample bill, where a letterhead design legitimately runs to a second
  // sheet. The one-line no-spill guarantee is the geometry suite's job, above.
  expect(sale.pages, 'no printable PDF came out of the sale design').toBeGreaterThan(0)
  expect(purchase.pages, 'no printable PDF came out of the purchase design').toBeGreaterThan(0)
})

/**
 * ═════════ A BILL THAT CARRIES A DIAMOND PRINTS THE DIAMOND ═════════
 *
 * The owner, on INV-1035: "look at invoice I added stone here but the invoice not showing the
 * diamond details". The sheet read
 *
 *   1 | sring | HSN 7113 | 24K | 9.000g | ₹1,50,000 ₹/10 g | MAKING ₹1,000 | TAX ₹4,110 | ₹1,37,000
 *
 * and the words "dia", "FL", "E", "Round" and "GIA" were on none of it — on a tax invoice whose
 * line amount INCLUDED the ₹1,000 he charged for that stone, and whose 9.000 g net was the 10.000 g
 * gross less the stone's own 1.000 g.
 *
 * TWO causes, both now closed, and neither visible to tsc, eslint or the unit suite before this:
 *   1. `showStone`/`showStoneCert` default OFF and only the Stone & diamond PRESET turns them on.
 *      He never found it. stoneAwareConfig() now forces both ON for a bill whose lines carry stone
 *      data, and leaves every other bill alone (which is why the geometry gate above, on a plain
 *      gold line, measures exactly what it measured before).
 *   2. stoneDetail() refused any line with FEWER THAN TWO stones — so a single certified
 *      solitaire, the commonest stone line a jeweller writes, could not print its carat, clarity,
 *      colour, shape or lab at ANY setting. One stone that identifies itself now earns the run.
 *
 * This is the acceptance test, on the DEFAULT layout (no stone preset, nothing saved), read off the
 * sheet that goes through the printer at the counter — and then off real PDF bytes on all three
 * papers, because two extra columns are exactly how a sheet gains a page.
 */
test('the stone the customer paid for reaches the printed bill, with no toggle to find', async ({ page }, info) => {
  test.setTimeout(150_000)
  // Default EVERYTHING. If the shop had to save a setting for this, this line is the proof it did not.
  await putLayout(page, { ...DEFAULT_INVOICE_CONFIG, paper: 'a4', officeCopy: false })
  await page.goto('/')
  await openCounterPrint(page, STONE_PARTY)

  const sheet = printSheet(page).locator('.print-paper').first()

  // 1. THE STONE'S OWN ROW (field 105) — the actual complaint, now in oMunim's layout rather than
  //    as prose under the item name: name, carat, clarity, colour, shape and lab in the description
  //    column, and the stone's weight, rate and value in the columns that already exist.
  const run = sheetField(page, 105)
  await expect(run, 'the bill still prints no stone detail at all').toBeVisible()
  // 1.000 g IS 5.00 ct (1 ct = 0.2 g), read off the same canonical weight the Stone wt column uses,
  // so the row and the column can never disagree. He entered the weight in GRAMS - weightUnit 'GM'.
  await expect(run).toContainText('dia 5.00 ct FL E Round')
  await expect(run, 'the lab is the thing he is buying').toContainText('GIA')
  // The rate is not decoration: the stone's own price is the figure a customer queries, and it had
  // never appeared anywhere on this sheet. rateUnit PP on the fixture -> '/pc'. It reads in the
  // RATE column now, directly under the metal rate, which is the whole point of the row.
  await expect(run).toContainText('₹1,000/pc')

  // 2. THE AGGREGATE COLUMNS (113 Stone wt, 118 Stone ₹), which were absent from his sheet
  //    entirely. They stay on the ITEM's row: gross - stone = net is checkable by eye there, and
  //    Stone ₹ is the visible sum of the stone rows' Amount cells.
  await expect(sheetCell(page, 113), 'no Stone wt column').toHaveText('1.000g')
  await expect(sheetCell(page, 118), 'no Stone ₹ column').toContainText('1,000')

  // 3. The figures the stone sits inside are UNCHANGED - this is a print fix, not a money fix.
  //    Net 9.000 g (gross 10.000 g less the stone's 1.000 g).
  await expect(sheetCell(page, 112), 'gross weight moved').toHaveText('10.000g')
  await expect(sheetCell(page, 114), 'net weight moved').toHaveText('9.000g')
  //    THE AMOUNT COLUMN, SPLIT — the owner's decision, following oMunim's reading. The item's own
  //    row carries the METAL AND THE MAKING (9 x 15,000 + 1,000 = 1,36,000), the stone's row
  //    carries its own 1,000, and the two add up to the 1,37,000 the line is stored at. That
  //    stored figure is still what the Total row, the per-metal band and the totals column print.
  await expect(sheetCell(page, 120), 'the item row should carry the metal and the making')
    .toContainText('1,36,000')
  await expect(run, 'the stone row should carry the stone’s own value').toContainText('1,000')
  await expect(sheet, 'the line’s stored total left the sheet').toContainText('1,37,000')
  // The stone is inside that amount ONCE: 9 x 15,000 + 1,000 making + 1,000 stone.
  await expect(sheet, 'the stone was double-counted into the line').not.toContainText('1,38,000')

  await page.screenshot({ path: info.outputPath('stone-bill-a4.png'), fullPage: true })
  // Looked at, not assumed: the counter's own reprint on a phone-width screen. (The A4 sheet
  // scrolls horizontally below ~400px rather than scaling - PRE-EXISTING, worklog Task 96.)
  await page.setViewportSize({ width: 400, height: 900 })
  await expect(sheetField(page, 105), 'the stone run is gone at 400px').toBeVisible()
  await page.screenshot({ path: info.outputPath('stone-bill-400px.png'), fullPage: true })
  await page.setViewportSize({ width: 1280, height: 900 })

  // 4. ON PAPER, all three sizes. Two extra columns must not spill the sheet - A5 is the tight one,
  //    and an "A5 stone preset overflowed by 8px" is a defect this project has already had.
  const report: string[] = []
  for (const paper of ['a4', 'a5', 'roll80'] as const) {
    await putLayout(page, { ...DEFAULT_INVOICE_CONFIG, paper, officeCopy: false })
    await page.goto('/')
    await openCounterPrint(page, STONE_PARTY)
    // The 80mm roll has no columns at all, so there the stacked RUN is how a stone reaches a
    // receipt; A4 and A5 give it a row. Field 105 must be on every paper either way, which is also
    // what proves the ONE config resolution point covers both the columnar sheet and the roll.
    await expect(sheetField(page, 105), `the stone detail is missing on ${paper}`).toBeVisible()
    await expect(sheetField(page, 105), `the stone is nameless on ${paper}`).toContainText('dia')
    // LOOKED AT, on every paper. The last two serious defects on this sheet passed every numeric
    // gate and were caught only by a human opening the bill, so the artefact is produced here.
    await page.screenshot({ path: info.outputPath(`stone-bill-${paper}.png`), fullPage: true })
    await page.emulateMedia({ media: 'print' })
    const { pages, sheetPx } = await pdfGeometry(page)
    await page.emulateMedia({ media: null })
    report.push(`${paper}: ${pages}p sheet ${sheetPx.h}px`)
    expect(pages, `a one-line stone bill spilled to ${pages} pages on ${paper} (${report.join(' | ')})`).toBe(1)
  }
  console.log(`[stone bill] ${report.join(' | ')}`)

  // 5. And the plain-gold bill in this same file is untouched by all of it: no stone columns, and
  //    above all no column of em-dashes, which is this sheet's own standing rule.
  await putLayout(page, { ...DEFAULT_INVOICE_CONFIG, paper: 'a4', officeCopy: false })
  await page.goto('/')
  await openCounterPrint(page)
  await expect(printSheet(page).locator('.print-paper').first()).toBeVisible()
  await expect(printSheet(page).locator('[data-field-count="105"]')).toHaveCount(0)
  await expect(printSheet(page).locator('[data-field-count="113"]')).toHaveCount(0)
  await expect(printSheet(page).locator('[data-field-count="118"]')).toHaveCount(0)
  await expect(printSheet(page)).not.toContainText('Stone wt')
})

/** 111 `colPurity` - the column the owner wants to call "Touch". */
const COL_PURITY = 111

test('renaming Purity to Touch in the studio reaches the PRINTED bill', async ({ page }, info) => {
  await page.goto('/')
  await gotoView(page, 'Print')
  await page.getByRole('tab', { name: 'Invoice Layout' }).click()

  // The affordance itself: the bill announces that it is editable.
  await expect(page.getByText(/The bill below is editable/)).toBeVisible()

  await studioField(page, COL_PURITY).click()
  const editor = page.getByRole('dialog').filter({ hasText: `field #${COL_PURITY}` })
  await expect(editor).toBeVisible()
  await editor.getByLabel('Title (English)', { exact: true }).fill('Touch')
  await editor.getByLabel('Title (Hindi) · हिन्दी नाम', { exact: true }).fill('टच')
  await expect(editor).toContainText('was “Column — Purity”')
  await expect(editor).toContainText('5/44')
  // preview moves at once
  await expect(studioField(page, COL_PURITY)).toContainText(/touch/i)
  await page.screenshot({ path: info.outputPath('rename-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 400, height: 900 })
  await page.screenshot({ path: info.outputPath('rename-400px.png'), fullPage: true })
  await page.setViewportSize({ width: 1280, height: 900 })

  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /Save layout/ }).click()
  await expect(page.getByText('Invoice layout saved for this firm')).toBeVisible()
  const rows = await (await page.request.get(`/api/settings?firmId=${FIRM}`)).json()
  const saved = rows.settings.find((r: { key: string }) => r.key === invoiceFieldsKey('sell'))
  expect(JSON.parse(saved.value)[String(COL_PURITY)]).toMatchObject({ text: 'Touch', textHi: 'टच' })

  // THE PAPER, not the preview.
  await openCounterPrint(page)
  const head = printSheet(page).locator(`.print-paper th[data-field-count="${COL_PURITY}"]`).first()
  await expect(head, 'the new title never reached the printed bill').toContainText(/touch/i)
  await expect(head).not.toContainText(/purity/i)
  await expect(head).toContainText('टच')
})

/**
 * ── THE OLD-METAL BLOCK COMES APART, ON PAPER ─────────────────────────────────────────────────────
 *
 * The owner asked twice, the first time as "some customer dont want to show old metal prity hide
 * the he can". Field 216 was ONE field over the whole "OLD METAL RECEIVED / पुराना माल" block —
 * weight, purity quoted, rate paid, value, bhav cut and the credit given — so a shop could hide the
 * entire exchange or none of it, and could rename nothing inside it. (It could not even rename the
 * block's own heading: 216 was renameable in the registry and the heading was a literal in the
 * sheet, which is exactly the "a box with no effect" defect this studio's rules forbid.)
 *
 * They are now fields 230-235, each with its own node, its own switch and its own caption, and 216
 * still switches the block as a whole so a shop that had already turned it off is not surprised.
 *
 * Done in the browser and read off the sheet that goes through the printer, because the whole class
 * of defect this file exists for is "the studio changed, the paper did not".
 */
test('a shop hides the tunch it bought at, renames the rest, and the exchange still prints', async ({ page }, info) => {
  await putLayout(page, { ...DEFAULT_INVOICE_CONFIG, paper: 'a4', officeCopy: false })
  await page.goto('/')
  await openCounterPrint(page, EXCHANGE_PARTY)

  // 1. EVERY FIGURE IS ON THE PAPER TO BEGIN WITH — including the bhav cut, which is stored on
  //    every invoice and had never been proven to print. 5.000 g at ₹66,000/10 g = ₹33,000, less
  //    ₹500 = ₹32,500 credited.
  await expect(sheetField(page, 230), 'the old metal has no weight').toContainText('5.000g')
  await expect(sheetField(page, 231), 'the tunch quoted is missing').toContainText('91.6 tunch')
  await expect(sheetField(page, 232), 'the rate paid is missing').toContainText('₹66,000')
  await expect(sheetField(page, 233), 'the value is missing').toContainText('33,000')
  await expect(sheetField(page, 234), 'the BHAV CUT never reached the bill').toContainText('500')
  await expect(sheetField(page, 235), 'the credit given is missing').toContainText('32,500')
  await page.screenshot({ path: info.outputPath('old-metal-block-default.png'), fullPage: true })
  await page.keyboard.press('Escape')

  // 2. HIDE THE PURITY ALONE — his actual request. Everything else in the block stays.
  await putOverrides(page, {
    [231]: { show: false },
    [230]: { text: 'Old gold weight', textHi: 'पुराना सोना वजन' },
    [235]: { text: 'Adjusted against bill', textHi: 'समायोजित' },
  })
  await page.goto('/')
  await openCounterPrint(page, EXCHANGE_PARTY)

  await expect(
    printSheet(page).locator('.print-paper [data-field-count="231"]'),
    'the tunch is still visible after the shop hid it',
  ).toBeHidden()
  // What a HUMAN sees, which is innerText and not textContent: a `display:none` field keeps its
  // node (that is how every hideable field on this sheet works — fieldOverrideCss writes a rule, it
  // never removes a node), so textContent still carries the string while the paper and the PDF
  // carry nothing. Asserting on textContent here reads as a pass for a field that IS on the bill
  // and as a failure for one that is not, which is the wrong way round.
  await expect(await visibleText(page), 'the tunch is still printed').not.toContain('91.6 tunch')
  // The renames, and the figures they caption, both on the sheet.
  await expect(sheetField(page, 230)).toContainText('Old gold weight')
  await expect(sheetField(page, 230)).toContainText('पुराना सोना वजन')
  await expect(sheetField(page, 230)).toContainText('5.000g')
  await expect(sheetField(page, 235)).toContainText('Adjusted against bill')
  await expect(sheetField(page, 235)).toContainText('32,500')
  // …and the rest of the block is untouched: a hidden purity may not take the money with it.
  await expect(sheetField(page, 232)).toContainText('₹66,000')
  await expect(sheetField(page, 234)).toContainText('500')
  await expect(sheetField(page, 216), 'the block itself went with the purity').toBeVisible()
  await page.screenshot({ path: info.outputPath('old-metal-block-hidden-renamed.png'), fullPage: true })
  await page.keyboard.press('Escape')

  // 3. AND 216 STILL SWITCHES THE WHOLE BLOCK, which is what a shop that already turned it off has.
  await putOverrides(page, { [216]: { show: false } })
  await page.goto('/')
  await openCounterPrint(page, EXCHANGE_PARTY)
  await expect(printSheet(page).locator('.print-paper [data-field-count="216"]')).toBeHidden()
  const bare = await visibleText(page)
  expect(bare, 'the exchange block is still printed').not.toContain('5.000g')
  expect(bare, 'the tunch is still printed').not.toContain('91.6 tunch')
  // The money it settled is still in the totals column — nothing reaches a total unseen.
  expect(bare, 'the credit the bill was settled with left the sheet').toContain('32,500')
})

/**
 * ── THE HEADER BANNER AS A MASTHEAD, AND ONE SWITCH OVER THE FIRM INFORMATION ─────────────────────
 *
 * The owner, in his own words: "in invoice cusromization the hedar banner has to come at the top of
 * invoice and below the frim information and want to hide or show the firm infromation option".
 *
 * Two things, and both of them are things the SHEET does, so both are read off the paper:
 *
 *  1. `bannerTopAbove` — the advert prints FIRST and the identity under it. It is a choice, not a
 *     move: the flag defaults false, so a shop that never opens the switch keeps the advert below
 *     the letterhead where it has always been (asserted first, below).
 *
 *     THE DEFECT THIS CASE NOW GATES, in the owner's words: "look at the heder image it has to
 *     cover exact the width of invoice". The masthead used to be held inside a height cap
 *     (BANNER_ABOVE_MAX_MM, deleted) enforced as `max-height` + `object-contain` — which scales the
 *     WHOLE image down, width included. So his ~4:1 festival banner printed 102mm wide inside a
 *     186mm bill, inset with white either side, directly above a full-width letterhead bar. It was
 *     visible on the page at a glance and INVISIBLE to this gate, which asserted a page count and a
 *     height and never once a WIDTH. It does now, against the bill's own content: the letterhead
 *     bar and the item table, which is the pair of edges he is looking at.
 *
 *  2. `showLetterhead` — the ONE switch over the identity band. It is not new; what this proves is
 *     the part that matters for the use it exists for (pre-printed letterhead stationery): the block
 *     goes AND THE SPACE GOES WITH IT, so the bill does not start an inch and a half down the page.
 *
 * The widths and heights this logs are the whole evidence that the banner covers the sheet — keep
 * them printing, because "covers the full width" is only checkable against a number somebody can
 * re-read, and the last version of this test asserted it nowhere.
 */
/**
 * THREE SHAPES, because one was never enough and the one that was missing is the owner's.
 *
 * Across A4's 186mm printable width, at natural aspect:
 *   OWNER_BANNER   400x100   4.00:1    47mm — fits the ~64mm a one-line A4 bill leaves spare
 *   WIDE_BANNER    256x100   2.56:1    73mm — the slot oMunim advertises; costs a second sheet
 *   SQUARE_BANNER  120x120   1.00:1   186mm — hostile; 69% of the page on its own
 *
 * The last two were ALREADY a second sheet in the default below-the-letterhead placement, which has
 * never been capped. What this case proves is that the masthead is not quietly smaller than that
 * placement, and that the studio is the thing that warns about the height (unit-gated through
 * bannerSpareMm in tests/unit/invoice-print.test.ts).
 */
// 400x100 - 4:1, THE OWNER'S OWN SHAPE: a wide, short Marathi festival advert with a phone number
// in it. Wide and short is the case a height cap mangles and the case nobody had measured.
const OWNER_BANNER =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAZAAAABkCAIAAAAnqfEgAAABEklEQVR42u3UMQ0AAAgEsV/Rh1UEogPSpApuuEwXwAmRADAsAMMCDAvAsAAMCzAsAMMCMCzAsAAMC8CwAMMCMCwAwwIMC8CwAAwLMCwAwwIwLMCwAAwLwLAAwwIwLADDAgwLwLAAw1IBMCwAwwIMC8CwAAwLMCwAwwIwLMCwAAwLwLAAwwIwLADDAgwLwLAADAswLADDAjAswLAADAvAsADDAjAsAMMCDAvAsADDUgEwLADDAgwLwLAADAswLADDAjAswLAADAvAsADDAjAsAMMCDAvAsAAMCzAsAMMCMCzAsAAMC8CwAMMCMCwAwwIMC8CwAMMCMCwAwwIMC8CwAAwLMCwAwwIwLMCwAAwLwLCAvxbO2g27uMfnzgAAAABJRU5ErkJggg=='
// 256x100 - 2.56:1, the slot oMunim advertises and what downscaleBanner targets.
const WIDE_BANNER =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAABkCAIAAADmAnnJAAABJklEQVR4nO3ToQ0AMAzAsPL9T/fl+M4oiCUfEJJ590DWrBfAIgOQZgDSDECaAUgzAGkGIM0ApBmANAOQZgDSDECaAUgzAGkGIM0ApBmANAOQZgDSDECaAUgzAGkGIM0ApBmANAOQZgDSDECaAUgzAGkGIM0ApBmANAOQZgDSDECaAUgzAGkGIM0ApBmANAOQZgDSDECaAUgzAGkGIM0ApBmANAOQZgDSDECaAUgzAGkGIM0ApBmANAOQZgDSDECaAUgzAGkGIM0ApBmANAOQZgDSDECaAUgzAGkGIM0ApBmANAOQZgDSDECaAUgzAGkGIM0ApBmANAOQZgDSDECaAUgzAGkGIM0ApBmANAOQZgDSDECaAUgzAGkGIM0ApBmANAOQZgDSPhIywXC0LuSEAAAAAElFTkSuQmCC'
// 120x120 - the hostile case: 1:1 across A4 is 186mm of advert, 69% of the printable page.
const SQUARE_BANNER =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAAB4CAIAAAC2BqGFAAAA60lEQVR4nO3QAQkAIADAMBOY1iBGtoXCHTzA2Zhr60Lj+cEngQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtzqfQDgFZsyFxAAAAABJRU5ErkJggg=='

/**
 * mm per CSS px on the sheet in hand — self-calibrating, so the preview's own zoom cancels out.
 * Page draws the paper as `contentMm` plus its 8mm of screen padding on each side.
 */
async function sheetScale(page: Page, contentMm: number) {
  const w = await printSheet(page).locator('.print-paper').first().evaluate((n) => n.getBoundingClientRect().width)
  return (contentMm + 16) / w
}

/**
 * The identity band: <Letterhead> on A4/A5, <RollHead> on the roll, and the bare title block when
 * the firm information is switched off. All of them render `.print-paper > header`.
 */
const sheetHead = (page: Page) => printSheet(page).locator('.print-paper > header').first()

/**
 * THE BILL'S OWN CONTENT WIDTH, as the two edges a shopkeeper actually compares the banner against:
 * the letterhead bar immediately under the masthead, and the item table in the middle of the sheet.
 * Both are full-width on all three papers (the item table only exists on A4/A5 — the roll stacks
 * its lines), so a banner that is narrower than the bill fails against them and nothing else.
 */
const sheetItemTable = (page: Page) =>
  printSheet(page).locator('.print-paper table:has(caption[data-field-count="130"])').first()

/**
 * THE BANNER AS IT IS ACTUALLY PAINTED — and this one cost two red runs to get right, so it is
 * written down in full.
 *
 * Neither DOM box tells you how wide the advert prints:
 *  - count 7 is on the wrapping <div>, a block element, so it is ALWAYS the full width of the sheet
 *    whatever the image inside it does;
 *  - and the <img> itself was `w-full` with a `max-height`, so ITS box was full width too. Under
 *    `object-contain` the bitmap is letterboxed INSIDE that box — 102mm of advert centred in a
 *    186mm element, with 42mm of nothing either side. getBoundingClientRect() reports 186mm and is
 *    not lying; it is answering a different question.
 *
 * THAT IS EXACTLY WHY THIS DEFECT WAS INVISIBLE TO EVERY GATE while being obvious on the page. So
 * this reads the PAINTED extent: the box, the natural aspect ratio, and the `object-fit` rule that
 * decides which of the two the ink follows. `contain` letterboxes (ink ≤ box); anything else fills
 * or crops (ink = box). A future cap of either kind is measured honestly by this.
 */
async function paintedBanner(page: Page) {
  const img = printSheet(page).locator('.print-paper [data-field-count="7"] img').first()
  await expect(img, 'there is no banner image on the sheet at all').toBeVisible()
  return img.evaluate((n) => {
    const i = n as HTMLImageElement
    const r = i.getBoundingClientRect()
    const fit = getComputedStyle(i).objectFit
    const aspect = i.naturalWidth / i.naturalHeight
    const contained = fit === 'contain' || fit === 'scale-down'
    return {
      x: r.x, y: r.y, fit, aspect,
      width: contained ? Math.min(r.width, r.height * aspect) : r.width,
      height: contained ? Math.min(r.height, r.width / aspect) : r.height,
      boxWidth: r.width, boxHeight: r.height,
    }
  })
}

const boxOf = async (l: Locator) => {
  const b = await l.boundingBox()
  expect(b, 'that node is not on the sheet at all').not.toBeNull()
  return b!
}

/**
 * The banner row is GLOBAL — one row for every document type, because it is shop identity — so it
 * does not leave this file: the next spec would otherwise measure every bill with an advert on it.
 */
test.afterAll(async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: STATE.admin })
  const page = await ctx.newPage()
  await page.request.put('/api/settings', { data: { firmId: FIRM, key: INVOICE_BANNER_KEYS.top, value: '' } })
  await page.request.put('/api/settings', { data: { firmId: FIRM, key: invoiceFieldsKey('sell'), value: '{}' } })
  await page.request.put('/api/settings', {
    data: { firmId: FIRM, key: invoiceLayoutKey('sell'), value: JSON.stringify(DEFAULT_INVOICE_CONFIG) },
  })
  await ctx.close()
})

test('the header banner prints the full width of the bill, above the letterhead or below it', async ({ page }, info) => {
  await putOverrides(page, {})

  /**
   * ONE assertion, used six times below: the banner's left and right edges land on the bill's own.
   *
   * Tolerance is ~1mm, not a percentage. These are the same CSS box — the banner is `w-full` of the
   * page's content and so are the letterhead bar and the item table — so the honest expectation is
   * EQUAL, and the slack is there for the subpixel rounding of a zoomed preview and nothing else.
   * The old capped masthead missed by 84mm on a 4:1 image, so this is not a near-miss detector.
   */
  async function expectFullWidth(paper: string, label: string) {
    const banner = await paintedBanner(page)
    const head = await boxOf(sheetHead(page))
    const slack = banner.width / 186 + 1
    expect(
      Math.abs(banner.width - head.width),
      `${paper} ${label}: the banner is ${Math.round(banner.width)}px wide against a ${Math.round(head.width)}px letterhead `
      + `— it does not cover the width of the invoice`,
    ).toBeLessThan(slack)
    // The roll stacks its lines and has no item table.
    if (paper !== 'roll80') {
      const table = await boxOf(sheetItemTable(page))
      expect(
        Math.abs(banner.width - table.width),
        `${paper} ${label}: the banner is ${Math.round(banner.width)}px wide and the item table under it is `
        + `${Math.round(table.width)}px — a banner narrower than the table it heads is the defect being fixed`,
      ).toBeLessThan(slack)
    }
    return banner
  }

  // ── 1. THE DEFAULT IS TODAY'S BILL: the advert below the identity, full width, natural size. ──
  await page.request.put('/api/settings', { data: { firmId: FIRM, key: INVOICE_BANNER_KEYS.top, value: WIDE_BANNER } })
  await putLayout(page, { ...DEFAULT_INVOICE_CONFIG, paper: 'a4', officeCopy: false })
  await page.goto('/')
  await openCounterPrint(page)
  {
    const mm = await sheetScale(page, 186)
    const head = await boxOf(sheetHead(page))
    const banner = await expectFullWidth('a4', 'default placement')
    expect(
      banner.y,
      'the default placement moved: the advert must still print BELOW the letterhead for every shop that has not touched the new switch',
    ).toBeGreaterThan(head.y + head.height - 1)
    // Uncapped there, exactly as before: 2.56:1 across 186mm is ~73mm.
    expect(Math.round(banner.height * mm), 'the default placement is no longer full size').toBeGreaterThan(60)
  }
  await page.keyboard.press('Escape')

  // ── 2. THE OWNER'S OWN BANNER, as a masthead, on all three papers. ──
  //
  // 4:1 and short: the shape a height cap mangles, and the shape he is actually printing. The
  // promise here is the one he asked for and the one the old gate never checked — FULL WIDTH, edge
  // to edge with the letterhead bar and the item table — plus the paper it costs, which for this
  // shape is none: 186/4 = 47mm against the ~64mm a one-line A4 bill leaves spare.
  //
  // WHAT THIS STILL CANNOT PROMISE, measured rather than hoped, and unchanged by this work: an A5
  // bill with a header banner has ALWAYS taken two half sheets, in either placement. The half sheet
  // has ~7mm of slack and this banner across its 124mm printable width is 31mm; there is no
  // placement that makes that fit and no readable cap that would. That is the shop's own decision
  // and the banner panel has stated it in mm since it shipped.
  await page.request.put('/api/settings', { data: { firmId: FIRM, key: INVOICE_BANNER_KEYS.top, value: OWNER_BANNER } })

  /**
   * ── AND THE STUDIO HAS TO SAY WHAT IT COSTS, FOR THIS IMAGE, BEFORE HE PRINTS ──
   *
   * This is the half of the change that replaced the height cap. The cap bought "never a second
   * sheet" by shrinking the shop's advert; what is left is the full-width advert plus an honest
   * quote, per uploaded image, against the paper's own spare height (bannerSpareMm). It has to name
   * BOTH numbers — the image's printed height and what the paper has to give — or it is just another
   * percentage nobody reads. 4:1 across A4: 47mm printed, ~64mm spare, so it fits and says so.
   */
  await putLayout(page, { ...DEFAULT_INVOICE_CONFIG, paper: 'a4', officeCopy: false })
  await page.goto('/')
  await gotoView(page, 'Print')
  await page.getByRole('tab', { name: 'Invoice Layout' }).click()
  await page.getByRole('button', { name: 'Layout options', exact: true }).click()
  {
    const panel = page.getByRole('dialog').last()
    const quote = panel.getByText(/mm (fits|is more than)/).first()
    await expect(quote, 'the studio states no paper cost for the banner the shop has uploaded').toBeVisible()
    await expect(quote).toContainText('47 mm')
    await expect(quote, 'the quote names no spare height, so "47 mm" means nothing').toContainText('64 mm')
    await expect(
      panel.getByText(/prints 186×47 mm — the full width of the bill/),
      'the panel does not state the printed size, or still claims a scaled-down masthead band',
    ).toBeVisible()
    // The panel scrolls, so a full-page shot of it is a shot of the paper card. Scroll the banner
    // slot into view and photograph THAT, in both themes — this sentence is the only thing standing
    // between a shop and a surprise second sheet, so it has to be legible in the one the shop uses.
    await quote.scrollIntoViewIfNeeded()
    await panel.screenshot({ path: info.outputPath('studio-banner-cost-light.png') })
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await panel.screenshot({ path: info.outputPath('studio-banner-cost-dark.png') })
    await page.evaluate(() => document.documentElement.classList.remove('dark'))
    await page.keyboard.press('Escape')
  }

  const report: string[] = []
  for (const paper of ['a4', 'a5', 'roll80'] as const) {
    // Today's placement first, as the baseline this change may not be worse than.
    await putLayout(page, { ...DEFAULT_INVOICE_CONFIG, paper, officeCopy: false })
    await page.goto('/')
    await openCounterPrint(page)
    await page.emulateMedia({ media: 'print' })
    const below = await pdfGeometry(page)
    await page.emulateMedia({ media: null })
    await page.keyboard.press('Escape')

    await putLayout(page, { ...DEFAULT_INVOICE_CONFIG, paper, officeCopy: false, bannerTopAbove: true })
    await page.goto('/')
    await openCounterPrint(page)

    const contentMm = contentWidthMm({ ...DEFAULT_INVOICE_CONFIG, paper })
    const mm = await sheetScale(page, contentMm)
    const banner = await expectFullWidth(paper, 'masthead 4:1')
    const head = await boxOf(sheetHead(page))

    expect(
      head.y,
      `${paper}: the banner is not above the letterhead — banner at ${Math.round(banner.y)}px, header at ${Math.round(head.y)}px`,
    ).toBeGreaterThan(banner.y + banner.height - 1)
    // The firm's name is STILL on the sheet: the whole objection to this placement was that an
    // advert could push the identity off the top of it.
    expect(await visibleText(page), `${paper}: the shop's name left the sheet`).toContain('Jai Bhavani')

    const widthMm = Math.round(banner.width * mm * 10) / 10
    const bannerMm = Math.round(banner.height * mm * 10) / 10
    const headMm = Math.round(head.height * mm * 10) / 10
    // THE WIDTH, IN MM, AGAINST THE PRINTABLE WIDTH OF THE PAPER. The parity check above compares
    // boxes; this one says the box is the SHEET's, so a bill whose content was itself narrow could
    // not pass both.
    expect(
      Math.abs(widthMm - contentMm),
      `${paper}: the masthead printed ${widthMm}mm wide inside a ${contentMm}mm bill`,
    ).toBeLessThan(1.5)
    // 4:1 at full width, so the height follows the width and nothing clips it.
    expect(
      Math.abs(bannerMm - contentMm / 4),
      `${paper}: a 4:1 banner ${widthMm}mm wide should print ${Math.round(contentMm / 4)}mm tall, not ${bannerMm}mm — something is still scaling or cropping it`,
    ).toBeLessThan(1.5)

    await page.emulateMedia({ media: 'print' })
    const above = await pdfGeometry(page)
    await page.emulateMedia({ media: null })
    report.push(
      `${paper}: banner ${widthMm}x${bannerMm}mm of ${contentMm}mm | letterhead ${headMm}mm | `
      + `sheet ${below.sheetPx.h}px/${below.pages}p below -> ${above.sheetPx.h}px/${above.pages}p above`,
    )
    // The banner is the same image at the same size in both placements, so moving it can only
    // reorder the sheet, never lengthen it. Equality is the expected result; `<=` catches a
    // placement that somehow spends more.
    expect(
      above.pages,
      `${paper}: moving the advert above the letterhead cost a page — ${below.pages} below, ${above.pages} above`,
    ).toBeLessThanOrEqual(below.pages)
    expect(
      above.sheetPx.h,
      `${paper}: the masthead made the sheet TALLER than today's placement (${below.sheetPx.h}px -> ${above.sheetPx.h}px)`,
    ).toBeLessThanOrEqual(below.sheetPx.h + 1)
    // A4 with HIS banner has to fit one sheet. This is the whole point of 47mm against 64mm, and it
    // is the figure the studio quotes him before he saves.
    if (paper === 'a4') expect(above.pages, `a4: the owner's own 4:1 masthead spilled the bill to ${above.pages} pages`).toBe(1)

    await page.screenshot({ path: info.outputPath(`banner-above-${paper}.png`), fullPage: true })
    await page.keyboard.press('Escape')
  }

  // ── 3. THE TWO TALL SHAPES ON A4, where full width costs real paper — stated, not prevented. ──
  //
  // 2.56:1 is 73mm and 1:1 is 186mm across 186mm, both over the ~64mm a one-line A4 bill leaves
  // spare, so both take the bill to two sheets. THAT IS NOT NEW AND IT IS NOT THE MASTHEAD: the
  // default below-the-letterhead placement has always been uncapped and does exactly the same —
  // asserted here as equality, which is the real promise. The height cap that used to hide this
  // bought it by printing the shop's advert narrower than its own bill, which is the defect the
  // owner sent back. The studio now quotes the mm and the second sheet per image before he saves
  // (bannerSpareMm, unit-gated).
  const tallCases = [['2.56:1', WIDE_BANNER, 2.56], ['1:1', SQUARE_BANNER, 1]] as const
  for (const [label, src, aspect] of tallCases) {
    await page.request.put('/api/settings', { data: { firmId: FIRM, key: INVOICE_BANNER_KEYS.top, value: src } })
    for (const masthead of [false, true]) {
      await putLayout(page, { ...DEFAULT_INVOICE_CONFIG, paper: 'a4', officeCopy: false, bannerTopAbove: masthead })
      await page.goto('/')
      await openCounterPrint(page)
      const where = masthead ? 'masthead' : 'default'
      const mm = await sheetScale(page, 186)
      const banner = await expectFullWidth('a4', `${label} ${where}`)
      const widthMm = Math.round(banner.width * mm * 10) / 10
      const bannerMm = Math.round(banner.height * mm * 10) / 10
      expect(
        Math.abs(bannerMm - 186 / aspect),
        `a4 ${label} ${where}: printed ${widthMm}x${bannerMm}mm — a ${label} image at full width is ${Math.round(186 / aspect)}mm tall`,
      ).toBeLessThan(2)
      expect(await visibleText(page), `a4 ${label}: a tall advert pushed the shop name off the sheet`).toContain('Jai Bhavani')
      await page.emulateMedia({ media: 'print' })
      const { pages } = await pdfGeometry(page)
      await page.emulateMedia({ media: null })
      report.push(`a4 ${label} ${where}: banner ${widthMm}x${bannerMm}mm of 186mm | ${pages}p`)
      if (masthead) {
        await page.screenshot({ path: info.outputPath(`banner-above-${label.replace(/[:.]/g, '')}-a4.png`), fullPage: true })
      }
      await page.keyboard.press('Escape')
    }
  }
  console.log(`[banner-above] ${report.join(' || ')}`)
  // The two placements must cost the same paper for the same image — that is what "one size, both
  // placements" means, and it is the sentence the studio is allowed to print.
  const pagesOf = (line: string) => Number(/\| (\d+)p$/.exec(line)?.[1] ?? NaN)
  for (const [label] of tallCases) {
    const d = report.find((l) => l.includes(`a4 ${label} default`))!
    const a = report.find((l) => l.includes(`a4 ${label} masthead`))!
    expect(pagesOf(a), `a4 ${label}: the masthead and the default placement disagree about paper — ${d} vs ${a}`).toBe(pagesOf(d))
  }
})

test('one switch takes the whole firm information block off — and gives the space back', async ({ page }, info) => {
  await putOverrides(page, {})
  await page.request.put('/api/settings', { data: { firmId: FIRM, key: INVOICE_BANNER_KEYS.top, value: '' } })
  await putLayout(page, { ...DEFAULT_INVOICE_CONFIG, paper: 'a4', officeCopy: false })

  /**
   * ── THE STUDIO HAS TO SAY WHAT THE SWITCH DOES ──
   *
   * The switch itself is not new — `showLetterhead` has always governed counts 1, 2, 3, 4, 5, 6 and
   * 8, so it was never five switches. What was missing is the half a shopkeeper actually sees: it
   * was labelled "Print the shop letterhead", which is the trade's word and not his, and it said
   * nothing about what disappears. A shop on PLAIN paper that switches it off by mistake gets a bill
   * with no shop name on it, and must not have to guess why.
   */
  await page.goto('/')
  await gotoView(page, 'Print')
  await page.getByRole('tab', { name: 'Invoice Layout' }).click()
  await page.getByRole('button', { name: 'Layout options', exact: true }).click()
  const panel = page.getByRole('dialog').last()
  const firmSwitch = panel.getByRole('switch', { name: /^Print the firm information/ })
  await expect(firmSwitch, 'the studio offers no single switch over the firm information').toBeVisible()
  await expect(panel.getByTestId('letterhead-off-note'), 'the warning shows while the block is still printing').toHaveCount(0)
  await firmSwitch.click()
  await expect(
    panel.getByTestId('letterhead-off-note'),
    'nothing in the studio told the shop its bill would carry no name, address or GSTIN',
  ).toContainText(/will not print your shop/i)
  // And the masthead switch, beside the banner whose placement it decides.
  await expect(
    panel.getByRole('switch', { name: /^Put the header banner above/ }),
    'the studio offers no way to put the header banner above the letterhead',
  ).toBeVisible()
  await page.screenshot({ path: info.outputPath('studio-layout-options.png'), fullPage: true })

  for (const paper of ['a4', 'roll80'] as const) {
    // The block ON, for its height to be measured against.
    await putLayout(page, { ...DEFAULT_INVOICE_CONFIG, paper, officeCopy: false, bisNo: 'HM/1234567' })
    await page.goto('/')
    await openCounterPrint(page)
    const withBlock = await boxOf(sheetHead(page))
    const scale = await sheetScale(page, contentWidthMm({ ...DEFAULT_INVOICE_CONFIG, paper }))
    await page.keyboard.press('Escape')

    await putLayout(page, { ...DEFAULT_INVOICE_CONFIG, paper, officeCopy: false, bisNo: 'HM/1234567', showLetterhead: false })
    await page.goto('/')
    await openCounterPrint(page)
    const text = await visibleText(page)
    const headText = await sheetHead(page).evaluate((n) => (n as HTMLElement).innerText)

    // EVERY part of the band: name (1), address (2), phone · GSTIN · PAN (3), email (4) and the
    // BIS number (5). The name is checked against the HEAD rather than the whole sheet on purpose:
    // the signature strip signs "For <firm name>", which is the SIGNATORY and not the letterhead —
    // a shop on pre-printed paper still wants its bill signed for by somebody. That is the owner's
    // call to reverse, and it is a different switch (showSignature / the Signed by box) if he does.
    expect(headText, `${paper}: the shop name still prints with the firm information switched off`).not.toContain('Jai Bhavani')
    expect(headText, `${paper}: the shop address still prints`).not.toContain('Madhya Pradesh')
    expect(text, `${paper}: the shop GSTIN still prints`).not.toContain('23AABCJ1234F1Z5')
    expect(text, `${paper}: the BIS number still prints`).not.toContain('HM/1234567')
    // …and the LOGO and the monogram ring, which is the answer to "does the switch cover the logo":
    // every node carrying count 6 or 8 on this sheet is drawn inside the letterhead, so there can be
    // none left. Asserted by COUNT, not by CSS — the node must not exist at all.
    expect(await printSheet(page).locator('.print-paper [data-field-count="6"]').count(), `${paper}: the logo survived`).toBe(0)
    expect(await printSheet(page).locator('.print-paper [data-field-count="8"]').count(), `${paper}: the monogram ring survived`).toBe(0)

    // What the DOCUMENT is still says who the document is — that is never the paper's to carry.
    await expect(sheetField(page, 40), `${paper}: the document lost its own title`).toBeVisible()
    await expect(sheetField(page, 42), `${paper}: the copy marker went with the letterhead`).toBeVisible()

    // THE POINT OF THE SWITCH: the space is RECLAIMED. A bill on pre-printed stationery must start
    // at the shop's own top margin, not an inch and a half down the page.
    const without = await boxOf(sheetHead(page))
    const r1 = (px: number) => Math.round(px * scale * 10) / 10
    const savedMm = Math.round((withBlock.height - without.height) * scale * 10) / 10
    console.log(`[firm-info-off] ${paper}: head ${r1(withBlock.height)}mm -> ${r1(without.height)}mm (${savedMm}mm reclaimed)`)
    expect(savedMm, `${paper}: switching the firm information off left a ${savedMm}mm gap instead of giving the paper back`).toBeGreaterThan(4)
    // Same starting line, to within a subpixel: the space comes off the BOTTOM of the band, it is
    // not a gap left where the identity used to be.
    expect(
      Math.abs(without.y - withBlock.y) * scale,
      `${paper}: the bill no longer starts at the top of the printable area`,
    ).toBeLessThan(0.5)

    await page.screenshot({ path: info.outputPath(`firm-info-off-${paper}.png`), fullPage: true })
    await page.keyboard.press('Escape')
  }

  /**
   * ── BOTH SWITCHES AT ONCE: pre-printed stationery that still wants the shop's advert on it. ──
   *
   * OWNER_BANNER, not WIDE_BANNER, and the swap is the honest consequence of deleting the masthead's
   * height cap rather than a test being bent to fit. This case used to assert ONE PAGE with the
   * 2.56:1 image, and it only ever passed because the cap scaled that advert down to 36mm — i.e.
   * printed it 102mm wide inside a 186mm bill, which is the defect the owner sent back. Measured
   * here on the no-letterhead A4 bill: 4:1 is 47mm and fits one sheet; 2.56:1 is 73mm and takes two,
   * exactly as the SAME image already did in the default below-the-letterhead placement, which has
   * never been capped. The page count follows the shape of the shop's artwork, in both placements,
   * and the studio quotes it per image before he saves.
   */
  await page.request.put('/api/settings', { data: { firmId: FIRM, key: INVOICE_BANNER_KEYS.top, value: OWNER_BANNER } })
  for (const paper of ['a4', 'roll80'] as const) {
    await putLayout(page, {
      ...DEFAULT_INVOICE_CONFIG, paper, officeCopy: false, showLetterhead: false, bannerTopAbove: true,
    })
    await page.goto('/')
    await openCounterPrint(page)
    const banner = await boxOf(sheetField(page, 7))
    const head = await boxOf(sheetHead(page))
    expect(head.y, `${paper}: the banner is not above the title block`).toBeGreaterThan(banner.y + banner.height - 1)
    expect(
      await sheetHead(page).evaluate((n) => (n as HTMLElement).innerText),
      `${paper}: the shop name came back into the head band`,
    ).not.toContain('Jai Bhavani')
    await expect(sheetField(page, 40), `${paper}: the title went missing`).toBeVisible()
    if (paper === 'a4') {
      await page.emulateMedia({ media: 'print' })
      const { pages } = await pdfGeometry(page)
      await page.emulateMedia({ media: null })
      expect(pages, 'advert above + no letterhead spilled the bill').toBe(1)
    }
    await page.screenshot({ path: info.outputPath(`banner-above-no-firm-${paper}.png`), fullPage: true })
    await page.keyboard.press('Escape')
  }
})
