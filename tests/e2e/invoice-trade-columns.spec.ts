import { test, expect, type Page } from '@playwright/test'
import { STATE } from '../auth'
import { FIX } from '../seed'
import { gotoView } from './app'
import { invoiceFieldsKey } from '@/components/app/print/invoice-fields'
import {
  DEFAULT_INVOICE_CONFIG, INVOICE_LAYOUT_KEY, invoiceLayoutKey,
} from '@/components/app/print/invoice-print'

/**
 * THE THREE TRADE COLUMNS AND THE RENAMED LABEL, ON REAL PAPER
 *
 * Fine weight (121), value addition (122) and labour & other (123) are three MORE columns on a
 * table that already carries up to 13, and the Making column can now print a percentage. All four
 * are off / 'amount' by default, which is why the geometry gate in invoice-studio.spec.ts — which
 * measures the SHIPPED skins — never exercises them. Nothing measures a sheet with them ON.
 *
 * That is the gap this file closes, and it closes it where the risk actually is: A5. The half sheet
 * has 130mm of printable width against A4's 186 and a one-line bill already measures ~177mm of its
 * 184mm printable height. Sixteen columns there crush the Description cell, a crushed cell wraps the
 * item name, and a wrapped row costs ~2.5mm — which is how a bill that fits becomes a bill that
 * spills onto a second, near-empty half sheet. "An A5 stone preset overflowed by 8px" is a defect
 * this project has already had once.
 *
 * So: ONE stone line (the widest bill there is — stoneAwareConfig forces the two stone columns on
 * for any bill carrying a stone, and the stone then takes a ROW of its own in the table on A4/A5
 * and a stacked run on the roll), every optional column switched on, a renamed heading in both
 * languages, and the PDF's own /Count and /MediaBox read back out of the printed bytes on all
 * three papers.
 *
 * One line and one copy, deliberately, because that is the convention the existing gate measures
 * by: a one-line bill is the floor, so anything over one page is the SHEET spilling and not the
 * bill being long. (A5 has no room for a three-line bill at any setting, with or without these
 * columns — that is the paper, not this change.)
 *
 * Owner: ux-design-lead.
 */

test.use({ storageState: STATE.admin })

const FIRM = FIX.firmJBS.id
const STAMP = Date.now().toString(36)
const PARTY = `Trade ${STAMP}`

/** 111 colPurity — the heading the owner wants to read "Touch". 121 is the new fine-weight column. */
const COL_PURITY = 111
const COL_FINE = 121

const printSheet = (page: Page) => page.getByRole('dialog', { name: /print preview$/ })
const sheetField = (page: Page, count: number) =>
  printSheet(page).locator(`.print-paper [data-field-count="${count}"]`).first()
/** The first BODY cell of a column — a column's attribute is on its <th> and on every <td> too. */
const sheetCell = (page: Page, count: number) =>
  printSheet(page).locator(`.print-paper tbody td[data-field-count="${count}"]`).first()

async function putSetting(page: Page, key: string, value: unknown) {
  const res = await page.request.put('/api/settings', {
    data: { firmId: FIRM, key, value: JSON.stringify(value) },
  })
  expect(res.status(), await res.text()).toBe(200)
}

/**
 * One certified-stone line carrying EVERY figure the new columns print: a purity (so fine weight
 * resolves), a wastage, a making charge (so the percentage resolves), a value addition and a
 * labour/other charge. Posted through the real API so `stones` is serialised by the route's own
 * deriveLineStones() and not by this test.
 *
 * 10.000 g gross less the stone's 1.000 g = 9.000 g net at ₹15,000/g, + ₹1,000 making + ₹1,000
 * stone + ₹2,500 value addition + ₹750 labour = ₹1,40,250.
 */
const METAL = 9 * 15_000
const BASE = METAL + 1_000 + 1_000 + 2_500 + 750

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: STATE.admin })
  const page = await ctx.newPage()
  const res = await page.request.post('/api/invoices', {
    data: {
      firmId: FIRM, type: 'sale', customerName: PARTY, customerMobile: '9876500131',
      invoiceDate: new Date().toISOString(),
      goldRate: 150_000, subtotal: BASE, discount: 0, metalAmount: 0,
      totalAmount: Math.round(BASE * 1.03), paymentMode: 'cash', status: 'completed',
      items: [{
        name: `Diamond bridal necklace 22K ${STAMP}`, hsnCode: '7113', purity: '22K',
        category: 'fine', metalType: 'gold', byWeight: true,
        grossWeight: 10, netWeight: 9, wastagePercent: 2, rate: 15_000, qty: 1,
        makingCharge: 1_000, valueAddAmount: 2_500, otherCharges: 750, amount: BASE,
        stones: [{
          name: 'dia', clarity: 'VS1', colorGrade: 'G', shape: 'Round', certLab: 'GIA',
          certNo: '2185471', qty: 1, caratWeight: 1, weightUnit: 'GM', rateCt: 1_000,
          rateUnit: 'PP', deductFromGross: true,
        }],
      }],
    },
  })
  expect(res.status(), await res.text()).toBe(200)
  // The premise: the DATA carries all three figures. If this drifts the print assertions below
  // would pass or fail for a reason that has nothing to do with the paper.
  const stored = (await res.json()).invoice.items[0]
  expect([stored.netWeight, stored.makingCharge, stored.valueAddAmount, stored.otherCharges])
    .toEqual([9, 1_000, 2_500, 750])
  await ctx.close()
})

/** A Setting is per firm and PERSISTED: hand the slot a clean board back or the next spec prints
 *  on this one's design. Both keys this file writes are reset. */
test.afterEach(async ({ page }) => {
  await putSetting(page, invoiceFieldsKey('sell'), {})
  for (const key of [INVOICE_LAYOUT_KEY, invoiceLayoutKey('sell')]) {
    await putSetting(page, key, DEFAULT_INVOICE_CONFIG)
  }
})

async function openCounterPrint(page: Page) {
  await gotoView(page, 'Sell & Purchase')
  await page.getByPlaceholder('Search invoice, party…').fill(PARTY)
  const row = page.getByRole('row').filter({ hasText: PARTY })
  await expect(row).toHaveCount(1)
  await row.getByTitle('View').click()
  const view = page.getByRole('dialog', { name: /^Tax Invoice — / })
  await expect(view).toBeVisible()
  await view.getByRole('button', { name: /^Print$/ }).click()
  await expect(printSheet(page).locator('.print-paper').first()).toBeVisible()
}

/** Page count and the MediaBoxes in mm, out of the real printed bytes. */
async function pdfGeometry(page: Page) {
  // Fonts first: `next/font` serves Geist on demand under `next dev`, and a pdf() taken before it
  // lands measures the system fallback's metrics — which is the whole flake on a sheet sitting
  // near the page boundary.
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
  const sheetPx = await page.locator('.print-paper').first().evaluate((n) => ({
    h: Math.round(n.getBoundingClientRect().height), scroll: n.scrollHeight,
  }))
  const raw = (await page.pdf({ preferCSSPageSize: true, printBackground: true })).toString('latin1')
  const pages = Number(/\/Count\s+(\d+)/.exec(raw)?.[1] ?? NaN)
  expect(Number.isFinite(pages), 'no /Count in the generated PDF').toBe(true)
  const widths = [...new Set(raw.match(/\/MediaBox\s*\[[^\]]*\]/g) ?? [])].map((b) => {
    const [x0, , x1] = b.replace(/[^\d.\s-]/g, '').trim().split(/\s+/).map(Number)
    return Math.round(((x1 - x0) / 72) * 25.4 * 10) / 10
  })
  return { pages, widths, sheetPx }
}

/**
 * The item table's own width against the printable width inside the shop's margins, in mm. An
 * overflowing table on paper is not a scrollbar: it is the Amount column printed off the right
 * edge of the bill, which is why this is measured and not eyeballed.
 */
async function tableWidthMm(page: Page) {
  return printSheet(page).locator('.print-paper').first().evaluate((sheet) => {
    const t = sheet.querySelector('table')
    if (!t) return null
    // offsetWidth / clientWidth, NOT getBoundingClientRect: the preview is CSS-scaled to fit the
    // dialog, so a bounding rect is the zoomed width and would read every sheet as fitting.
    const inner = (sheet as HTMLElement).clientWidth
      - parseFloat(getComputedStyle(sheet).paddingLeft) - parseFloat(getComputedStyle(sheet).paddingRight)
    const mm = (px: number) => Math.round((px / 96) * 25.4 * 10) / 10
    // `sheet` is the whole paper, margins included: a table may spill INTO the margin and still
    // print (it only stops lining up with the blocks above it), but a table wider than the paper
    // is a column cut off at the edge, which is the failure that matters.
    return { table: mm(t.offsetWidth), avail: mm(inner), sheet: mm((sheet as HTMLElement).clientWidth) }
  })
}

/** Every optional column on at once — the widest table this sheet can be asked to print. */
const WIDEST = {
  showFineWeight: true, showValueAdd: true, showLineOtherCharges: true,
  showWastage: true, showStone: true, showStoneCert: true,
  showHsn: true, showPurity: true, showGrossWeight: true, showMaking: true,
  makingDisplay: 'percent' as const,
  officeCopy: false,
}

const PAPER_W: Record<string, number> = { a4: 210, a5: 148, roll80: 80 }

test('the widest possible bill still prints ONE page on A4, A5 and the 80mm roll', async ({ page }, info) => {
  test.setTimeout(150_000)
  // A renamed heading is part of the measurement, not a separate case: "Touch टच" is wider than
  // "Purity" and the Devanagari half carries its own line-height.
  await putSetting(page, invoiceFieldsKey('sell'), {
    [COL_PURITY]: { text: 'Touch', textHi: 'टच' },
    [COL_FINE]: { text: 'Fine wt', textHi: 'फाइन' },
  })

  const report: string[] = []
  for (const paper of ['a4', 'a5', 'roll80'] as const) {
    await putSetting(page, invoiceLayoutKey('sell'), { ...DEFAULT_INVOICE_CONFIG, ...WIDEST, paper })
    await page.goto('/')
    await openCounterPrint(page)

    // The renamed heading, on paper — on every paper that HAS a heading to rename. (A5 keeps all
    // twelve of its own columns; only the three new ones are dropped there.)
    if (paper !== 'roll80') {
      await expect(sheetField(page, COL_PURITY), `the rename is missing on ${paper}`).toContainText('Touch')
      await expect(sheetField(page, COL_PURITY)).toContainText('टच')
    }
    // The new figures: fine weight (22K + 2% wastage on 9.000 g), the value addition, the labour
    // charge — on the two papers that can carry them. A5 drops all three by design (paperColumns):
    // the twelve default columns are already 138.4mm of its 124mm, and a 15th column is the Amount
    // column printed off the right edge of a half sheet.
    if (paper === 'a5') {
      for (const count of [121, 122, 123]) {
        await expect(
          printSheet(page).locator(`[data-field-count="${count}"]`),
          `field ${count} reached the half sheet, which has no width for it`,
        ).toHaveCount(0)
      }
    } else {
      const cell = (c: number) => (paper === 'roll80' ? sheetField(page, c) : sheetCell(page, c))
      await expect(cell(COL_FINE), `no fine weight on ${paper}`).toContainText('8.424g')
      await expect(cell(122), `no value addition on ${paper}`).toContainText('2,500')
      await expect(cell(123), `no labour charge on ${paper}`).toContainText('750')
    }
    // 1,000 / 1,35,000 = 0.74%. The making charge is on the bill as a percentage, not as rupees.
    await expect(
      paper === 'roll80' ? sheetField(page, 117) : sheetCell(page, 117),
      `the making charge is not a percentage on ${paper}`,
    ).toContainText('0.74%')
    // The stone is still the goods it was: its own row (or run, on the roll) with its own rate.
    await expect(sheetField(page, 105), `no stone detail on ${paper}`).toContainText('dia 5.00 ct VS1 G Round')
    // The Amount column SPLIT, on the two papers that have columns: metal + making on the item's
    // row (1,35,000 + 1,000 + 2,500 VA + 750 labour = 1,39,250), the stone's own 1,000 on its row.
    if (paper !== 'roll80') {
      await expect(sheetCell(page, 120), `the item row lost its metal on ${paper}`).toContainText('1,39,250')
    }
    // AND the money has not moved: the line total is the stored figure to the rupee.
    await expect(printSheet(page).locator('.print-paper').first()).toContainText('1,40,250')

    await page.screenshot({ path: info.outputPath(`trade-columns-${paper}.png`), fullPage: true })

    // WIDTH, on the two papers that print a table. A4 absorbs every column by narrowing the
    // Description cell; A5 only because it is not asked to carry the three. The half sheet's own
    // twelve columns already overrun it on a stone bill — PRE-EXISTING, measured at 138.4mm of
    // 124mm, and the owner's call to make — so this gate holds A5 to what it measured BEFORE these
    // columns existed rather than passing a defect off as fixed.
    const w = await tableWidthMm(page)
    if (w) {
      report.push(`${paper}: table ${w.table}mm in ${w.avail}mm of ${w.sheet}mm paper`)
      // A4 absorbs all sixteen columns: 187.9mm against 185.9mm of printable width, so it borrows
      // 2mm of a 12mm margin (a renamed heading with its Devanagari half is most of that) and
      // nothing is near the paper edge.
      //
      // A5 is held to 139mm — what it measured BEFORE these columns existed. Its own twelve
      // already overrun it on a stone bill (138.4mm inside 124mm, ~2.4mm past the right edge); that
      // is PRE-EXISTING and the owner's call, and this ceiling is here so no column added later
      // quietly makes it worse.
      const ceiling = paper === 'a5' ? 139 : w.sheet
      expect(
        w.table,
        `${paper}: the item table printed ${w.table}mm wide inside ${w.avail}mm of a ${w.sheet}mm ` +
          `sheet — the right-hand columns are off the paper (${report.join(' | ')})`,
      ).toBeLessThanOrEqual(ceiling)
    }

    await page.emulateMedia({ media: 'print' })
    const { pages, widths, sheetPx } = await pdfGeometry(page)
    await page.emulateMedia({ media: null })
    report.push(`${paper}: ${pages}p ${widths.join('/')}mm sheet ${sheetPx.h}px (content ${sheetPx.scroll}px)`)

    for (const w of widths) {
      expect(Math.abs(w - PAPER_W[paper]), `${paper}: printed ${w}mm wide, wanted ${PAPER_W[paper]}mm`).toBeLessThan(2)
    }
    expect(
      pages,
      `a ONE-LINE bill with every optional column on spilled to ${pages} pages on ${paper} — ` +
        `${report.join(' | ')}`,
    ).toBe(1)
  }
  console.log(`[trade columns] ${report.join(' | ')}`)
})

/**
 * …and the shop that asks for none of this gets exactly the bill it had: no fine-weight column, no
 * value-addition column, no labour column, and the making charge in rupees. The default sheet is
 * what keeps the geometry gate above meaningful, so it is asserted rather than assumed.
 */
test('a shop that asks for none of it prints the sheet it always printed', async ({ page }) => {
  await putSetting(page, invoiceLayoutKey('sell'), { ...DEFAULT_INVOICE_CONFIG, paper: 'a4', officeCopy: false })
  await page.goto('/')
  await openCounterPrint(page)

  for (const count of [121, 122, 123]) {
    await expect(
      printSheet(page).locator(`[data-field-count="${count}"]`),
      `field ${count} prints on a sheet that never asked for it`,
    ).toHaveCount(0)
  }
  await expect(sheetCell(page, 117), 'the making charge stopped being rupees').toContainText('₹1,000')
  await expect(sheetField(page, COL_PURITY), 'the heading is not the registry’s own word').toHaveText(/purity/i)
})
