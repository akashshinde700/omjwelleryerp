import { test, expect, type Locator, type Page } from '@playwright/test'
import { STATE } from '../auth'
import { FIX } from '../seed'
import { gotoView } from './app'

/**
 * Stock Tally, in a browser — the physical stock-take screen nobody had opened yet.
 *
 * Every assertion here is about what reaches the SCREEN. The route handlers and the reconciliation
 * maths have their own specs (tests/api/stock-tally*.spec.ts, tests/unit/stock-tally.test.ts); what
 * those cannot answer is whether the panel mounts at all, whether the big number on a card agrees
 * with the list under it, and whether the confirm dialog says what it is about to freeze. A module
 * that throws on mount passes tsc, eslint and the whole unit suite and shows an empty shell.
 *
 * WHAT IS PINNED, AND WHAT IS DELIBERATELY NOT:
 * The fixture reserves P91/P92/P93 for the browser suite (tests/seed.ts FIX.e2eStock) — 10 g each,
 * category 'fine', NO counter, NO location, NO barcode, NO rfid, exactly like the owner's real data
 * where only itemCode is filled. Those three codes are pinned. The firm's total EXPECTED is NOT:
 * the api project sells and creates stock in this same slot schema, so every expected figure below
 * is either READ OFF THE SCREEN first and then asserted to MOVE correctly, or cross-checked against
 * an independent route (/api/stock?status=available). A hardcoded EXPECTED here would fail as a
 * fake product defect the first time another agent's spec ran before this one.
 *
 * Navigation is by click only — the app is one page (src/app/page.tsx ViewRouter); 'stocktally' is a
 * tab in SECTIONS.stock, not a URL. tests/e2e/app.ts's TAB_PARENT map is shared and owned elsewhere,
 * so this file resolves the tab itself rather than editing it.
 *
 * Owner: qa-lead.
 */

test.use({ storageState: STATE.admin })

const FIRM = FIX.firmJBS.id
const [P91, P92, P93] = FIX.e2eStock
const BOGUS = 'ZZ999'
const SHOTS = 'test-results/stock-tally'
const DESKTOP = { width: 1440, height: 900 }
const NARROW = { width: 400, height: 900 }

/** The 503 the two tally tables answer with when they are missing. Seeing it means the harness did not push the schema. */
const TABLES_MISSING = /two tables are missing/i

// ───────────────────────── reaching the screen ─────────────────────────

/** Stock → the Stock Tally tab. Proves the tab is in the strip on the way through. */
async function gotoTally(page: Page) {
  if ((await page.evaluate(() => window.innerWidth)) < 1024) {
    // Below lg the sidebar is off-canvas (app-shell.tsx:124) and gotoView's nav click lands on an
    // element outside the viewport. It opens from the top bar's menu button — which carries no
    // accessible name (DEFECT D4, app-shell.tsx:225), so it can only be addressed by position.
    await page.getByRole('banner').getByRole('button').first().click()
    await page.locator('nav').first().getByRole('button').filter({ hasText: 'Stock' }).first().click()
  } else {
    await gotoView(page, 'Stock')
  }
  const tab = page.getByRole('tab', { name: 'Stock Tally', exact: true })
  await expect(tab, 'the Stock Tally tab is missing from the Stock tab strip (nav-config.ts SECTIONS.stock)').toBeVisible()
  await tab.click()
  await expect(page.getByRole('heading', { name: /^Stock Tally$/ })).toBeVisible()
  await expect(page.getByText(TABLES_MISSING), 'the slot schema has no stock-tally tables — tests/global-setup.ts did not push the schema').toHaveCount(0)
}

// ───────────────────────── the four counter cards ─────────────────────────

/**
 * The cards, scoped to their own grid. The print sheet repeats the words Expected/Counted/Missing/
 * Extra as <Fact> labels, so an unscoped locator silently repoints at the paper once Print is open.
 */
const cardGrid = (page: Page) => page.locator('div.grid').filter({ has: page.getByText(/^expected$/i) }).first()

/**
 * One card's headline figure and its small "N lines" figure (the Extra card has no lines).
 *
 * Expected / Counted / Missing count PIECES ("7 pcs"); EXTRA counts SCANS ("1 scan"). That is not
 * sloppiness to paper over in the helper: an extra is a tag with no piece behind it, so there is no
 * piece to count. The screen said "1 pcs", its own list header said "1 scans" and the paper said
 * "1 pieces" — three units for one number (defect D3) — and the unit is now "scan(s)" in all three.
 */
async function card(page: Page, label: string) {
  const el = cardGrid(page).getByText(new RegExp(`^${label}$`, 'i')).first().locator('xpath=..')
  await expect(el, `no ${label} card on screen`).toBeVisible()
  const text = (await el.innerText()).replace(/\s+/g, ' ')
  const unit = /^extra$/i.test(label) ? /(\d[\d,]*)\s*scans?\b/i : /(\d[\d,]*)\s*pcs/i
  const pcs = Number(unit.exec(text)?.[1].replace(/,/g, '') ?? NaN)
  expect(Number.isFinite(pcs), `${label} card shows no count: ${JSON.stringify(text)}`).toBe(true)
  const lines = /(\d+)\s*lines?\b/i.exec(text)
  return { el, text, pcs, lines: lines ? Number(lines[1]) : null }
}

const figures = async (page: Page) => ({
  expected: await card(page, 'Expected'),
  counted: await card(page, 'Counted'),
  missing: await card(page, 'Missing'),
  extra: await card(page, 'Extra'),
})

// ───────────────────────── the three lists ─────────────────────────

/** A list section by its own heading ("Missing", "Extra", "Counted"). */
const section = (page: Page, title: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { level: 3, name: new RegExp(`^${title}\\b`) }) })

/** The rows inside a list section. Empty sections render "Nothing here." and no rows. */
const rows = (s: Locator) => s.locator('div.max-h-96 > div')

// ───────────────────────── driving it ─────────────────────────

const scanBox = (page: Page) => page.locator('#tl-scan')

/**
 * The element is inside the window, left edge and right. `main` is `overflow-x-hidden`, so an
 * element that does not fit at 400px is CLIPPED rather than scrollable — the page looks fine and
 * the figure is simply not there. Measuring the box is the only way to see that.
 */
async function expectFits(el: Locator, what: string) {
  const box = await el.boundingBox()
  expect(box, `${what} is not on screen at all`).not.toBeNull()
  const width = await el.page().evaluate(() => window.innerWidth)
  expect(box!.x, `${what} is clipped off the left edge`).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width, `${what} runs past the right edge (${Math.round(box!.x + box!.width)}px of ${width}px)`)
    .toBeLessThanOrEqual(width + 1)
}

/** Type a code + Enter, the way a USB scanner in keyboard mode and the owner's own fingers do. */
async function scan(page: Page, code: string) {
  await scanBox(page).fill(code)
  await scanBox(page).press('Enter')
  // The last-scan line is the only confirmation the counter gets; wait on it, not on a timeout.
  await expect(page.getByText(new RegExp(`^${code}:`)), `no last-scan line for ${code}`).toBeVisible()
}

/** Start a whole-firm tally from level 1 (no counter, no location, category All) and land on level 2. */
async function startWholeFirmTally(page: Page) {
  await gotoTally(page)
  await expect(page.getByText('Leave Counter and Location empty to count every available piece in this firm.')).toBeVisible()
  await expect(page.getByLabel('Counter (optional)')).toHaveValue('')
  await expect(page.getByLabel('Location (optional)')).toHaveValue('')
  const start = page.getByRole('button', { name: /Start a stock tally/ })
  await expect(start).toBeEnabled()
  await start.click()
  await expect(scanBox(page), 'Start did not open the counting screen').toBeVisible()
  await expect(page.getByRole('heading', { name: /^Stock Tally — the whole firm$/ })).toBeVisible()
}

/** Set-up shortcut for the tests that are ABOUT the closed/level-1 views, not about counting. */
async function seedTally(page: Page, codes: string[]) {
  const post = await page.request.post('/api/stock/tally', { data: { firmId: FIRM } })
  expect(post.status(), `POST /api/stock/tally said ${post.status()}: ${await post.text()}`).toBe(200)
  const id = (await post.json()).tally.id as string
  const s = await page.request.post('/api/stock/tally/scan', { data: { firmId: FIRM, tallyId: id, codes, source: 'keyboard' } })
  expect(s.status(), await s.text()).toBe(200)
  return id
}

/**
 * Leave no open tally behind. POST refuses a second tally for the same scope with a 409, so one
 * abandoned tally would turn every later test in this file into a conflict banner.
 */
test.afterEach(async ({ page }) => {
  const res = await page.request.get(`/api/stock/tally?firmId=${FIRM}`)
  if (!res.ok()) return
  for (const t of (await res.json()).tallies as { id: string; status: string }[]) {
    if (t.status === 'open') await page.request.put('/api/stock/tally', { data: { id: t.id, action: 'discard' } })
  }
})

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(DESKTOP)
  await page.goto('/')
})

// ═════════════════════════════ 1. it is reachable, and it renders ═════════════════════════════

test('the Stock Tally tab is in the Stock strip and the panel actually renders', async ({ page }) => {
  // The API first: if the tables are missing the panel renders a banner instead of a screen, and
  // every assertion below would fail for a reason that has nothing to do with the UI.
  const probe = await page.request.get(`/api/stock/tally?firmId=${FIRM}`)
  expect(probe.status(), `GET /api/stock/tally returned ${probe.status()}: ${await probe.text()}`).toBe(200)

  await gotoTally(page)

  // The white-screen check: the panel's own furniture, not just the heading.
  await expect(page.getByText('Count what is on the shelf against what the books say')).toBeVisible()
  await expect(page.getByText('स्टॉक मिलान')).toBeVisible()
  await expect(page.getByLabel('Counter (optional)')).toBeVisible()
  await expect(page.getByLabel('Location (optional)')).toBeVisible()
  await expect(page.getByLabel('Note (optional)')).toBeVisible()
  await expect(page.getByRole('button', { name: /Start a stock tally/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Past tallies' })).toBeVisible()
  await expect(page.getByRole('group').filter({ hasText: 'duplicate tag' })).toBeVisible()
  await expect(page.getByRole('group').filter({ hasText: 'Recent scans' })).toBeVisible()
  // No error banner at all on a healthy database.
  await expect(page.getByText('Stock tally is not ready.')).toHaveCount(0)
  await expect(page.locator('main').getByRole('alert'), 'the panel rendered an error').toHaveCount(0)

  await page.screenshot({ path: `${SHOTS}/level1-desktop.png`, fullPage: true })

  // 400px — the width the shop's staff use on a phone browser. RELOADED at that size, not just
  // resized: the sidebar is `transition-transform` (app-shell.tsx:125), so a screenshot taken
  // straight after setViewportSize catches it mid-slide and photographs a layout bug that is not
  // there. Loading at the narrow width is also what a phone actually does.
  await page.setViewportSize(NARROW)
  await page.reload()
  await gotoTally(page)
  await expect(page.getByRole('button', { name: /Start a stock tally/ }), 'the Start button is unreachable at 400px').toBeVisible()
  await expectFits(page.getByRole('button', { name: /Start a stock tally/ }), 'the Start button')
  await page.screenshot({ path: `${SHOTS}/level1-narrow.png`, fullPage: true })
})

// ═══════════════ 2 + 3. a tally end to end, and the cards agreeing with the lists ═══════════════

test('counting P91 and P92 moves COUNTED up, MISSING down, and the cards agree with the lists', async ({ page }) => {
  await startWholeFirmTally(page)

  // ── t0: nothing counted yet. EXPECTED is read, not assumed.
  const t0 = await figures(page)
  expect(t0.counted.pcs, 'a fresh tally has counted nothing').toBe(0)
  expect(t0.extra.pcs).toBe(0)
  expect(t0.missing.pcs, 'everything in scope starts out missing').toBe(t0.expected.pcs)
  expect(t0.expected.pcs, 'the fixture alone guarantees at least P91, P92, P93').toBeGreaterThanOrEqual(3)

  // Cross-check the expected SET against an independent route: a whole-firm tally must expect
  // exactly the firm's available stock. This is the assertion that catches a broken scope filter.
  const stock = await page.request.get(`/api/stock?firmId=${FIRM}&status=available&limit=300`)
  expect(stock.status()).toBe(200)
  const availableRows = (await stock.json()).total as number
  expect(t0.expected.lines, `the EXPECTED card counts ${t0.expected.lines} lines but the firm has ${availableRows} available stock rows`)
    .toBe(availableRows)

  // All three fixture pieces start in Missing, by name.
  const missing = section(page, 'Missing')
  for (const s of [P91, P92, P93]) {
    await expect(rows(missing).filter({ hasText: s.itemCode }), `${s.itemCode} is not in Missing before it is scanned`).toHaveCount(1)
  }

  // ── scan two of them by typing + Enter
  await scan(page, P91.itemCode)
  await expect(page.getByText(`${P91.itemCode}: ${P91.itemCode} ${P91.name}`), 'the last-scan line does not name the piece').toBeVisible()
  await scan(page, P92.itemCode)

  const counted = section(page, 'Counted')
  await expect(rows(counted).filter({ hasText: P91.itemCode })).toHaveCount(1)
  await expect(rows(counted).filter({ hasText: P92.itemCode })).toHaveCount(1)
  // The counted list NAMES them — an item code alone is not enough for someone holding the piece.
  await expect(rows(counted).filter({ hasText: P91.itemCode })).toContainText(P91.name)
  await expect(rows(counted).filter({ hasText: P92.itemCode })).toContainText(P92.name)

  // P93 was not scanned and must stay missing.
  await expect(rows(missing).filter({ hasText: P93.itemCode }), 'P93 was never scanned and must still be Missing').toHaveCount(1)
  await expect(rows(missing).filter({ hasText: P91.itemCode }), 'P91 is counted but still listed as Missing').toHaveCount(0)
  await expect(rows(missing).filter({ hasText: P92.itemCode })).toHaveCount(0)

  // ── a code the books have never heard of
  await scan(page, BOGUS)
  await expect(page.getByText(`${BOGUS}: EXTRA — not in the books`), 'a bogus code did not report itself as EXTRA').toBeVisible()
  const extra = section(page, 'Extra')
  const extraRow = rows(extra).filter({ hasText: BOGUS })
  await expect(extraRow).toHaveCount(1)
  await expect(extraRow, 'the Extra row does not say WHY the tag is extra').toContainText('not in the books')

  // ── the figures, and the identity that makes a stock-take mean anything
  const t1 = await figures(page)
  expect(t1.counted.pcs, 'COUNTED did not rise to 2').toBe(2)
  expect(t1.missing.pcs, 'MISSING did not fall by the two pieces that were found').toBe(t0.missing.pcs - 2)
  expect(t1.expected.pcs, 'EXPECTED moved during a tally — it is a snapshot of the books, not a counter').toBe(t0.expected.pcs)
  expect(t1.counted.pcs + t1.missing.pcs, 'counted + missing no longer adds up to expected').toBe(t1.expected.pcs)
  expect(t1.extra.pcs, 'the bogus code did not land in EXTRA').toBe(1)

  // ── each card equals what its own list contains
  expect(t1.counted.lines, 'the COUNTED card and the Counted list disagree').toBe(await rows(counted).count())
  expect(t1.missing.lines, 'the MISSING card and the Missing list disagree').toBe(await rows(missing).count())
  expect(t1.extra.pcs, 'the EXTRA card and the Extra list disagree').toBe(await rows(extra).count())
  // and the section headers repeat the same figures
  await expect(counted.getByRole('heading', { level: 3 })).toContainText(`${t1.counted.pcs} pcs`)
  await expect(missing.getByRole('heading', { level: 3 })).toContainText(`${t1.missing.pcs} pcs`)
  // "1 scan", "2 scans" — the screen pluralises, so the assertion must too.
  await expect(extra.getByRole('heading', { level: 3 }))
    .toContainText(`${t1.extra.pcs} scan${t1.extra.pcs === 1 ? '' : 's'}`)

  // ── MISSING is the alarming one. A missing-stock figure that looks like the others is the defect.
  expect(t1.missing.pcs).toBeGreaterThan(0)
  await expect(t1.missing.el, 'MISSING > 0 is not visibly alarming — it must not look like the other cards').toHaveClass(/bg-red-600/)
  await expect(t1.counted.el).not.toHaveClass(/bg-red-600/)
  await expect(t1.expected.el).not.toHaveClass(/bg-red-600/)

  await page.screenshot({ path: `${SHOTS}/tally-desktop.png`, fullPage: true })

  // ── level 1 shows the tally as in progress, and Continue comes back to the same figures
  await page.getByRole('button', { name: /All tallies/ }).click()
  const inProgress = page.locator('div').filter({ hasText: /^Tally in progress/ }).first()
  await expect(inProgress).toBeVisible()
  await expect(inProgress).toContainText(/\d+ of \d+ counted/)

  /**
   * DEFECT D1, raised 2026-10-19 and FIXED the same day — this assertion is the regression.
   *
   * The row used to read "0 of 7 counted · 7 missing" here: the figures from before a single piece
   * was scanned. The scan handler invalidated only ['stock-tally-detail', id], never the level-1
   * list key ['stock-tally', firmId], and the app's QueryClient runs staleTime 30_000
   * (src/components/providers/query-provider.tsx), so for up to half a minute after finding two
   * pieces the screen told the owner they were missing. It is now invalidated with the detail.
   *
   * NO RELOAD before this line — a reload would hide exactly the bug it is here to catch.
   */
  await expect(page.getByText(`${t1.counted.pcs} of ${t1.expected.pcs} counted`),
    'the in-progress row is showing stale counts after a scan (defect D1 has regressed)')
    .toBeVisible()

  // And again from cold, which proves the figures above came from the server and not from a cache
  // that happened to agree with it.
  await page.reload()
  await gotoTally(page)
  await expect(page.getByText(`${t1.counted.pcs} of ${t1.expected.pcs} counted`),
    'after a reload the in-progress row still does not show the scanned count — this is worse than D1: the server lost the scans')
    .toBeVisible()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(scanBox(page)).toBeVisible()
  expect((await card(page, 'Counted')).pcs, 'Continue came back to a different tally').toBe(t1.counted.pcs)

  // ── mid-tally at 400px: the width the shop's staff use on a phone browser.
  // Reloaded at that width rather than resized (see the note on level1-narrow), then re-entered
  // through Continue, because the open tally is component state and does not survive a reload.
  await page.setViewportSize(NARROW)
  await page.reload()
  await gotoTally(page)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(scanBox(page), 'the scan box is unreachable at 400px').toBeVisible()
  await expectFits(scanBox(page), 'the scan box')
  await expectFits((await card(page, 'Missing')).el, 'the MISSING card')
  await expectFits(rows(section(page, 'Counted')).first(), 'a counted row')
  await page.screenshot({ path: `${SHOTS}/tally-narrow.png`, fullPage: true })
})

// ═════════════════════════ 4. the focus warning oMunim does not have ═════════════════════════

test('losing focus on the scan box says so, and the warning puts focus back', async ({ page }) => {
  await seedTally(page, [P91.itemCode])
  await gotoTally(page)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()

  const warning = page.getByRole('button', { name: 'Scan box is not active — click here to resume scanning' })
  // On arrival the box is focused (autoFocus) and the warning is NOT on screen — otherwise it is
  // just noise the counter learns to ignore.
  await expect(scanBox(page)).toBeFocused()
  await expect(warning).toHaveCount(0)

  // Click away, the way anyone does when they glance at the lists.
  await page.getByRole('heading', { name: /^Stock Tally — / }).click()
  await expect(scanBox(page)).not.toBeFocused()
  await expect(warning, 'focus left the scan box SILENTLY — this is the oMunim defect we refuse to inherit').toBeVisible()

  await warning.click()
  await expect(scanBox(page), 'the resume control did not put focus back in the scan box').toBeFocused()
  await expect(warning).toHaveCount(0)
  // And a scan actually lands after resuming — a focused box that does not count is the same defect.
  await scan(page, P92.itemCode)
  await expect(rows(section(page, 'Counted')).filter({ hasText: P92.itemCode })).toHaveCount(1)
})

// ═════════════════════ 5. closing: the confirm names what it is freezing ═════════════════════

test('the close confirm names the scope and the counts, and a closed tally is frozen and read-only', async ({ page }) => {
  await startWholeFirmTally(page)
  await scan(page, P91.itemCode)
  await scan(page, P92.itemCode)
  await scan(page, BOGUS)
  const before = await figures(page)

  await page.getByRole('button', { name: 'Close tally', exact: true }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toBeVisible()

  // oMunim's confirm does not say what it is about to wipe. This one must name the scope and every
  // figure it is freezing, or the operator is clicking OK on an unknown.
  await expect(dialog).toContainText('the whole firm')
  await expect(dialog, 'the confirm does not state the EXPECTED count').toContainText(`${before.expected.pcs} expected`)
  await expect(dialog, 'the confirm does not state the COUNTED count').toContainText(`${before.counted.pcs} counted`)
  await expect(dialog, 'the confirm does not state the MISSING count').toContainText(`${before.missing.pcs} missing`)
  await expect(dialog, 'the confirm does not state the EXTRA count').toContainText(`${before.extra.pcs} extra`)
  await expect(dialog, 'the confirm does not say that closing changes no stock').toContainText('It changes no stock.')
  await expect(dialog.getByRole('button', { name: 'Keep counting' }), 'there is no way out of the confirm').toBeVisible()

  await dialog.getByRole('button', { name: 'Close tally', exact: true }).click()

  // Read-only: the banner says so, the scan box is gone, and the figures survived the close.
  await expect(page.getByText('This tally is closed. The figures below are frozen and read-only.')).toBeVisible()
  await expect(scanBox(page), 'a closed tally still accepts scans from the screen').toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Close tally', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Discard' })).toHaveCount(0)

  const after = await figures(page)
  for (const k of ['expected', 'counted', 'missing', 'extra'] as const) {
    expect(after[k].pcs, `${k} changed when the tally was closed (live ${before[k].pcs} → frozen ${after[k].pcs})`).toBe(before[k].pcs)
  }
  // The lists are still there too — a frozen result nobody can read is not a result.
  await expect(rows(section(page, 'Counted')).filter({ hasText: P91.itemCode })).toHaveCount(1)
  await expect(rows(section(page, 'Missing')).filter({ hasText: P93.itemCode })).toHaveCount(1)
  await expect(rows(section(page, 'Extra')).filter({ hasText: BOGUS })).toHaveCount(1)

  await page.screenshot({ path: `${SHOTS}/closed-desktop.png`, fullPage: true })

  // And it is now in Past tallies, with its figures on the row.
  await page.getByRole('button', { name: /All tallies/ }).click()
  await expect(page.locator('div').filter({ hasText: /^Tally in progress/ }), 'the closed tally is still shown as in progress').toHaveCount(0)
  const row = page.getByRole('button')
    .filter({ hasText: 'the whole firm' })
    .filter({ hasText: `Counted ${before.counted.pcs}` })
    .filter({ hasText: `Missing ${before.missing.pcs}` })
  await expect(row, 'the closed tally did not appear in Past tallies with its counts').toHaveCount(1)
  await expect(row).toContainText(`Expected ${before.expected.pcs}`)
  await expect(row).toContainText(`Extra ${before.extra.pcs}`)
})

// ═════════════════════════════ 6. the printed reconciliation ═════════════════════════════

test('Print renders the reconciliation on the firm letterhead with the four totals and the three lists', async ({ page }) => {
  const id = await seedTally(page, [P91.itemCode, P92.itemCode, BOGUS])
  const put = await page.request.put('/api/stock/tally', { data: { id, action: 'close' } })
  expect(put.status(), await put.text()).toBe(200)

  await gotoTally(page)
  await page.getByRole('button', { name: 'the whole firm' }).first().click()
  const f = await figures(page)

  await page.getByRole('button', { name: /^Print$/ }).click()
  const sheet = page.getByRole('dialog', { name: /print preview$/ })
  await expect(sheet).toBeVisible()
  const paper = sheet.locator('.print-paper').first()
  await expect(paper).toBeVisible()

  // Letterhead — a stock-take sheet that cannot be traced to a firm is not evidence.
  await expect(paper, 'the print sheet has no firm letterhead').toContainText(FIX.firmJBS.name)
  await expect(paper).toContainText('23AABCJ1234F1Z5')
  await expect(paper.getByRole('heading', { name: /Stock Tally Reconciliation/i })).toBeVisible()

  // The four totals, as printed. Case-insensitive regexes: these labels are uppercased in CSS.
  for (const [label, value] of [['Expected', f.expected.pcs], ['Counted', f.counted.pcs], ['Missing', f.missing.pcs]] as const) {
    await expect(paper.getByText(new RegExp(`^${label}$`, 'i')).locator('xpath=..'), `the printed ${label} total is missing or wrong`)
      .toContainText(String(value))
  }
  // Extras are scans, not pieces — same unit on the paper as on the card and the list header.
  await expect(paper.getByText(/^extra$/i).locator('xpath=..')).toContainText(`${f.extra.pcs} scan`)
  await expect(paper).toContainText('the whole firm')
  await expect(paper).toContainText('closed')

  // The three lists, by their printed captions, each with its own rows.
  await expect(paper.getByRole('heading', { name: /Missing \(in the books, not on the shelf\)/ })).toBeVisible()
  await expect(paper.getByRole('heading', { name: /Extra \(scanned, not reconciled\)/ })).toBeVisible()
  await expect(paper.getByRole('heading', { name: /Counted \(reconciled\)/ })).toBeVisible()
  await expect(paper).toContainText(P93.name)
  await expect(paper).toContainText(P91.name)
  await expect(paper).toContainText(BOGUS)
  await expect(paper, 'the paper does not state that closing changed no stock').toContainText('changes no stock')

  await paper.screenshot({ path: `${SHOTS}/print-desktop.png` })
  // Nothing is actually printed: the preview is closed again, not sent to a printer.
  await sheet.getByRole('button', { name: 'Close print preview' }).click()
  await expect(sheet).toHaveCount(0)
})

// ═════════════════════════ 7. the two collapsed sections on level 1 ═════════════════════════

test('Duplicate tags and Recent scans both open and render', async ({ page }) => {
  await seedTally(page, [P91.itemCode, BOGUS])
  await gotoTally(page)

  // Duplicate tags — the fixture has none, and "none" has to read as good news, not as an empty box.
  const dups = page.getByRole('group').filter({ hasText: /duplicate tag/i })
  const dupSummary = dups.locator('summary')
  await expect(dupSummary, 'with no duplicates the summary must say so').toHaveText(/No duplicate tags/)
  await expect(dupSummary, 'the "no duplicates" line is not green').toHaveClass(/text-emerald/)
  await dupSummary.click()
  await expect(dups).toHaveAttribute('open', '')
  await expect(dups.getByRole('alert')).toHaveCount(0)

  // Recent scans — the scans just made, with timestamps. The query only fires on open.
  const scans = page.getByRole('group').filter({ hasText: 'Recent scans' })
  await scans.locator('summary').click()
  await expect(scans).toHaveAttribute('open', '')
  // Recent scans is FIRM-WIDE and spans tallies (GET /api/stock/tally?scans=1, newest first), so
  // every earlier test in this file has rows in here too — assert on the newest, not on a count.
  const scanRow = scans.locator('div.border-b').filter({ hasText: P91.itemCode }).first()
  await expect(scanRow, 'the scan just recorded is not in Recent scans').toBeVisible()
  await expect(scanRow, 'a scan row does not name the piece it hit').toContainText(P91.name)
  await expect(scanRow, 'a scan row carries no timestamp — "when" is the whole point of a scan log')
    .toContainText(/\d{2} \w{3} \d{4}/)
  const bogusRow = scans.locator('div.border-b').filter({ hasText: BOGUS }).first()
  await expect(bogusRow).toBeVisible()
  await expect(bogusRow, 'an unmatched scan does not say it is unmatched').toContainText('not in the books')
})

// ════════ 8 + 9. the state the owner's live database is in RIGHT NOW: the tables are missing ════════

/**
 * The owner's `omerp` does not have StockTally / StockTallyScan yet, and will not until he runs the
 * migration by hand — deliberately, because nothing here touches his live database. So the FIRST
 * thing he will ever see on this tab is every tally endpoint answering 503 with this one sentence.
 *
 * That sentence is pinned against the exported constant in tests/unit/stock-tally.test.ts
 * (TABLES_MISSING_MESSAGE, which is also asserted there to contain the folder name). It is written
 * out in full here because these two tests are about the text that reaches the SCREEN: importing
 * src/lib/stock-tally.ts would drag a PrismaClient into the browser-test process to prove it.
 *
 * In this slot the tables DO exist (global-setup pushes the schema), so the state is provoked at the
 * network edge rather than by faking its cause — the panel cannot tell the difference, and the five
 * tests above keep running against a real database.
 */
const SENTENCE =
  'Stock Tally is not set up on this database yet - its two tables are missing. Run the migration in prisma/migrations/20261019120000_stock_tally (see prisma/MIGRATION-RESYNC.md Part 4), then restart.'

/** One glob covers all three shapes the panel calls: the list, the `&id=` detail, and /scan. */
async function tablesMissing(page: Page) {
  await page.route('**/api/stock/tally**', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: SENTENCE }) }))
}

/**
 * Anything React threw. This is the whole point of these two tests: a module that throws on mount
 * renders an EMPTY SHELL — heading, tab strip and screen all gone — and that has happened on this
 * project before. A thrown error fails the test even if every other assertion passes.
 */
function watchForThrows(page: Page) {
  const thrown: string[] = []
  page.on('pageerror', (e) => thrown.push(e.message))
  return thrown
}

/** The amber "Stock tally is not ready." banner INSIDE the panel — never the sonner toast outside it. */
const notReady = (page: Page) =>
  page.locator('main').getByRole('status').filter({ hasText: 'Stock tally is not ready.' })

test('with the two tally tables missing, the panel still renders and calmly says what to run', async ({ page }) => {
  const thrown = watchForThrows(page)
  await tablesMissing(page)

  // Not gotoTally() — its last line asserts this very message is ABSENT, because there it guards
  // against an unpushed slot schema. Same two clicks, desktop width.
  await gotoView(page, 'Stock')
  await page.getByRole('tab', { name: 'Stock Tally', exact: true }).click()

  // ── 1. it is still a screen. No white screen, no empty shell.
  const main = page.locator('main')
  await expect(page.getByRole('heading', { name: /^Stock Tally$/ }), 'the panel did not mount at all').toBeVisible()
  await expect(main, 'main is empty — the module threw on mount and took the whole screen with it').not.toBeEmpty()
  await expect(page.getByText('Count what is on the shelf against what the books say')).toBeVisible()
  await expect(page.getByLabel('Counter (optional)')).toBeVisible()
  await expect(page.getByLabel('Location (optional)')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Past tallies' })).toBeVisible()

  // ── 2. the banner carries the SERVER's own sentence, not a paraphrase — including the folder he
  // has to type. A banner that said "something went wrong" would leave him stuck.
  await expect(notReady(page), 'the 503 did not reach the screen as a banner').toBeVisible()
  await expect(notReady(page), "the banner does not carry the server's sentence word for word").toContainText(SENTENCE)
  await expect(notReady(page), 'the banner does not name the migration folder to run').toContainText('prisma/migrations/20261019120000_stock_tally')
  await expect(notReady(page), 'the banner does not point at the instructions').toContainText('MIGRATION-RESYNC.md Part 4')
  // Amber, not red: nothing is broken and no data is at risk — he has one command left to run.
  await expect(notReady(page), 'the not-ready banner is not the calm amber one').toHaveClass(/amber/)

  // ── 3. nothing left spinning. An endpoint that ANSWERED must not leave a "Loading…" behind.
  await expect(main.getByText('Loading…'), 'something is still spinning after the server answered').toHaveCount(0)

  // ── 4. Start must not pretend to work. It is still enabled (nothing on the client knows the
  // tables are gone until a call fails), so clicking it has to surface the same instruction.
  const start = page.getByRole('button', { name: /Start a stock tally/ })
  await expect(start).toBeVisible()
  expect(await start.isEnabled(), 'Start is now disabled in this state — fine, but then this test needs updating').toBe(true)
  await start.click()
  await expect(page.locator('[data-sonner-toast]'), 'Start failed SILENTLY — he clicks it and nothing at all happens')
    .toContainText('20261019120000_stock_tally')
  await expect(scanBox(page), 'Start opened the counting screen with no tally behind it').toHaveCount(0)
  // The toast is sonner's and it disappears after a few seconds. The banner is the copy he can
  // still read afterwards — which is why the message has to live in BOTH places.
  await expect(notReady(page), 'once the toast goes there is nothing left on screen telling him what to run').toContainText(SENTENCE)

  // ── 5. the two collapsed sections degrade the same way instead of exploding — and neither
  // reports good news it never actually checked.
  const dups = page.getByRole('group').filter({ hasText: /duplicate tag/i })
  await expect(dups.locator('summary'), 'the summary claims "No duplicate tags" when it never got an answer').toHaveText('Duplicate tags')
  await dups.locator('summary').click()
  await expect(dups).toHaveAttribute('open', '')
  await expect(dups.getByRole('status'), 'the duplicates section opened onto nothing').toContainText(SENTENCE)

  const scans = page.getByRole('group').filter({ hasText: 'Recent scans' })
  await scans.locator('summary').click()
  await expect(scans).toHaveAttribute('open', '')
  await expect(scans.getByRole('status'), 'the scan log opened onto nothing').toContainText(SENTENCE)
  await expect(scans.getByText('No scans recorded yet.'), 'the scan log reports "no scans" when it could not read them').toHaveCount(0)
  await expect(scans.getByText('Loading…'), 'the scan log is stuck on Loading…').toHaveCount(0)

  // This is the screenshot of what the owner sees before he runs the SQL.
  await page.screenshot({ path: `${SHOTS}/not-set-up-desktop.png`, fullPage: true })

  expect(thrown, `the panel threw: ${thrown.join(' | ')}`).toEqual([])
})

test('the detail shape answering 503 leaves a notice and a way back, not a blank panel', async ({ page }) => {
  const thrown = watchForThrows(page)
  // Seeded over the API while the tables are still there, so there is a row to click. Then they go
  // missing under him — which is also what a mid-session deploy against the wrong schema looks like.
  await seedTally(page, [P91.itemCode])
  await gotoTally(page)
  await tablesMissing(page)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()

  await expect(notReady(page), 'the detail view swallowed the 503').toContainText(SENTENCE)
  await expect(page.getByRole('button', { name: /All tallies/ }), 'there is no way back out of the broken detail view').toBeVisible()
  await expect(page.locator('main'), 'main is empty — the detail view threw instead of rendering the notice').not.toBeEmpty()
  await expect(page.locator('main').getByText('Loading…'), 'the detail view is stuck on Loading… forever').toHaveCount(0)
  await expect(scanBox(page), 'the counting screen opened with no tally data behind it').toHaveCount(0)
  await expect(page.locator('main').getByText(/^\d+ pcs$/), 'the cards rendered figures with nothing behind them').toHaveCount(0)
  expect(thrown, `the detail view threw: ${thrown.join(' | ')}`).toEqual([])

  // Hand the endpoints back so the afterEach can actually discard the tally this test seeded.
  await page.unroute('**/api/stock/tally**')
})
