import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { signIn } from './_session'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * ── STOCK TALLY: THE TENANT-ISOLATION AND ROLE GATE ────────────────────────────────────────────
 *
 * A tally names pieces, weights and valuations. A leak here hands one jeweller another jeweller's
 * entire inventory in one request, so every shape of every handler is probed from the wrong side:
 *
 *   src/app/api/stock/tally/route.ts        GET (4 shapes) / POST / PUT
 *   src/app/api/stock/tally/scan/route.ts   POST
 *
 * The three classes that have actually bitten this codebase before, in order of nastiness:
 *   1. `if (firmId) where.firmId = firmId` — omit the param, get every firm's rows. Probed on all
 *      four GET shapes, including `duplicates=1` and `scans=1`, which query StockItem and
 *      StockTallyScan directly rather than through the tally.
 *   2. a row id from the client used as a tenant scope. PUT takes NO firmId at all, so the only
 *      thing standing between MAD's tally and a JBS session is the firm check on the row it
 *      loaded. Probed with a valid own firmId AND a foreign row id — the combination that looks
 *      authorised to every guard that only reads the query string.
 *   3. membership mistaken for permission. Being in the firm is not permission to discard its
 *      stock-take.
 *
 * Every "JBS cannot see MAD" assertion is paired with a POSITIVE CONTROL proving the outsider CAN
 * see the same row — the seed ships no stock in MAD at all, and an absence proved against an
 * empty table is not proof of anything.
 *
 * Owner: qa-security-perf. Findings route to be-auth-tenancy.
 */

const JBS = FIX.firmJBS.id
const MAD = FIX.firmMAD.id
const TALLY = '/api/stock/tally'
const SCAN = '/api/stock/tally/scan'
const RUN = Date.now().toString(36)
/** Codes are trimmed + upper-cased by the handler before they are stored, so probe in upper case. */
const CODE = RUN.toUpperCase()

/**
 * The MAD canaries. `@@unique([firmId, itemCode])` and `@@unique([firmId, rfidNo])` mean barcode
 * is the ONLY field that can genuinely duplicate inside one firm, so the duplicate-report canary
 * is a shared barcode on two rows.
 */
const MAD_BARCODE = 'MADBC-DUP-CANARY'
const MAD_EXTRA_CODE = 'MAD-NOT-IN-BOOKS'
const MAD_ITEMS = [
  { id: 'tst-tally-mad-1', itemCode: 'MADCANARY1', name: 'MAD Canary Ring' },
  { id: 'tst-tally-mad-2', itemCode: 'MADCANARY2', name: 'MAD Canary Chain' },
]
const COUNTER = { loginId: `tally-counter-${RUN}`, password: 'counter-pass-1', name: 'Tally Counter' }

test.describe.serial('stock tally — tenant isolation & authorization', () => {
  // The `request` fixture is the JBS owner (admin/admin123, UserFirm.role 'owner').
  test.use({ storageState: STATE.admin })

  let db: PrismaClient
  let outsider: APIRequestContext // MAD only
  let staff: APIRequestContext // JBS, UserFirm.role 'staff' — a member, not a manager
  let staffId: string
  let madTally: string
  /** Every tally this file creates, dropped in afterAll so the next spec file sees the fixture. */
  const created: string[] = []

  /** The strings that must never appear in a JBS response. */
  const madLeakMarkers = () => [MAD_BARCODE, MAD_EXTRA_CODE, 'MADCANARY1', 'MADCANARY2', ...MAD_ITEMS.map((i) => i.id), madTally]
  function expectNoMadData(body: string, what: string) {
    for (const marker of madLeakMarkers()) expect(body, `${what} leaked MAD data (${marker})`).not.toContain(marker)
  }

  /**
   * Start a tally through the real route and remember its id for afterAll. `body` carries the
   * filters: a `counter` filter means nothing in the seed is in scope (the fixture items have no
   * counter), `category: 'fine'` means the seed items ARE in scope and scans resolve to a
   * stockItemId — which is what the mass-assignment test needs to assert on.
   */
  async function start(ctx: APIRequestContext, firmId: string, body: Record<string, string>): Promise<string> {
    const res = await ctx.post(TALLY, { data: { firmId, ...body } })
    expect(res.status(), await res.text()).toBe(200)
    const id = (await res.json()).tally.id as string
    created.push(id)
    return id
  }

  /**
   * Teardown for a throwaway tally, straight through Prisma. A firm may only hold 10 open at a
   * time (route.ts:93), and this file starts more than that across its cases — so each case
   * drops its own rather than leaning on afterAll.
   */
  async function drop(...ids: string[]) {
    await db.stockTallyScan.deleteMany({ where: { tallyId: { in: ids } } })
    await db.stockTally.deleteMany({ where: { id: { in: ids } } })
  }

  test.beforeAll(async () => {
    db = testPrisma()
    const baseURL = test.info().project.use.baseURL!

    outsider = await pwRequest.newContext({ baseURL, storageState: STATE.outsider })

    // A real non-manager member of JBS, minted through the real route (the seed's sales8 holds
    // UserFirm.role 'owner', so it is a MANAGER role and proves nothing about the role gate).
    const owner = await pwRequest.newContext({ baseURL, storageState: STATE.admin })
    const made = await owner.post('/api/staff', {
      data: { firmId: JBS, name: COUNTER.name, loginId: COUNTER.loginId, password: COUNTER.password, role: 'staff' },
    })
    expect(made.status(), await made.text()).toBe(200)
    staffId = (await made.json()).user.id
    await owner.dispose()
    expect((await db.userFirm.findUnique({ where: { userId_firmId: { userId: staffId, firmId: JBS } } }))!.role).toBe('staff')
    staff = await signIn(baseURL, COUNTER.loginId, COUNTER.password)

    // MAD stock + an open MAD tally with one counted and one extra scan, all written by the
    // outsider through the real routes. This is the data JBS must never reach.
    await db.stockItem.createMany({
      data: MAD_ITEMS.map((i) => ({
        ...i, firmId: MAD, barcode: MAD_BARCODE, category: 'fine', purity: '22K',
        grossWeight: 8, netWeight: 8, qty: 1, mrp: 60000, status: 'available',
      })),
    })
    madTally = await start(outsider, MAD, { category: 'fine' })
    const seeded = await outsider.post(SCAN, { data: { firmId: MAD, tallyId: madTally, codes: [MAD_BARCODE, MAD_EXTRA_CODE], source: 'keyboard' } })
    expect(seeded.status(), await seeded.text()).toBe(200)
  })

  test.afterAll(async () => {
    await staff?.dispose()
    await outsider?.dispose()
    if (db) {
      await db.stockTallyScan.deleteMany({ where: { tallyId: { in: created } } })
      await db.stockTally.deleteMany({ where: { id: { in: created } } })
      await db.stockItem.deleteMany({ where: { id: { in: MAD_ITEMS.map((i) => i.id) } } })
      if (staffId) {
        await db.userFirm.deleteMany({ where: { userId: staffId } })
        await db.user.deleteMany({ where: { id: staffId } })
      }
      await db.$disconnect()
    }
  })

  // ── 1. NO SESSION, NO ANSWER ────────────────────────────────────────────────────────────────
  test.describe('unauthenticated', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    const shapes = (firmId: string) => ({
      'GET list': `${TALLY}?firmId=${firmId}`,
      'GET one': `${TALLY}?firmId=${firmId}&id=any-id`,
      'GET duplicates': `${TALLY}?firmId=${firmId}&duplicates=1`,
      'GET scans': `${TALLY}?firmId=${firmId}&scans=1&limit=10`,
    })

    test('every GET shape, POST, PUT and scan are 401 with no cookie', async ({ request }) => {
      for (const [name, url] of Object.entries(shapes(JBS))) {
        const res = await request.get(url)
        expect(res.status(), `${name} answered an anonymous caller`).toBe(401)
        expect(await res.text()).toContain('Unauthorized')
      }
      // Same for MAD's own firmId: an anonymous caller is refused before any firm logic runs.
      for (const [name, url] of Object.entries(shapes(MAD))) {
        expect((await request.get(url)).status(), `${name} (MAD) answered an anonymous caller`).toBe(401)
      }
      expect((await request.post(TALLY, { data: { firmId: JBS, counter: 'anon' } })).status()).toBe(401)
      expect((await request.put(TALLY, { data: { id: 'any-id', action: 'close' } })).status()).toBe(401)
      expect((await request.put(TALLY, { data: { id: 'any-id', action: 'discard' } })).status()).toBe(401)
      expect((await request.post(SCAN, { data: { firmId: JBS, tallyId: 'any-id', codes: ['P1'] } })).status()).toBe(401)
    })

    test('a malformed anonymous body is still 401, not 400 — the session check runs first', async ({ request }) => {
      // A 400 here would mean the route parsed attacker input before deciding it had a caller.
      expect((await request.post(TALLY, { data: { nonsense: true } })).status()).toBe(401)
      expect((await request.put(TALLY, { data: {} })).status()).toBe(401)
      expect((await request.post(SCAN, { data: {} })).status()).toBe(401)
    })
  })

  // ── 2. MISSING firmId IS 400, NEVER A CROSS-FIRM LIST ───────────────────────────────────────
  test('every GET shape refuses an omitted or blank firmId with 400 and no rows', async ({ request }) => {
    const probes: [string, string][] = [
      ['list', TALLY],
      ['one', `${TALLY}?id=${madTally}`],
      ['duplicates', `${TALLY}?duplicates=1`],
      ['scans', `${TALLY}?scans=1&limit=500`],
      ['blank firmId, list', `${TALLY}?firmId=`],
      ['blank firmId, duplicates', `${TALLY}?firmId=&duplicates=1`],
      ['blank firmId, scans', `${TALLY}?firmId=&scans=1`],
      ['blank firmId, one', `${TALLY}?firmId=&id=${madTally}`],
    ]
    for (const [name, url] of probes) {
      const res = await request.get(url)
      expect(res.status(), `${name} without firmId did not 400`).toBe(400)
      const body = await res.text()
      expect(JSON.parse(body).error).toBe('firmId required')
      for (const key of ['tallies', 'duplicates', 'scans', 'tally', 'counted', 'missing']) {
        expect(body, `${name} returned data alongside its 400`).not.toContain(`"${key}"`)
      }
      expectNoMadData(body, `${name} without firmId`)
    }
  })

  // ── 3. ANOTHER FIRM'S firmId IS 403, ON EVERY SHAPE, IN BOTH DIRECTIONS ─────────────────────
  test("a non-member is 403 on every firmId-bearing shape", async ({ request }) => {
    const shapes = (f: string, tallyId: string) => [
      `${TALLY}?firmId=${f}`,
      `${TALLY}?firmId=${f}&id=${tallyId}`,
      `${TALLY}?firmId=${f}&duplicates=1`,
      `${TALLY}?firmId=${f}&scans=1&limit=500`,
    ]
    // JBS owner asking for MAD.
    for (const url of shapes(MAD, madTally)) {
      const res = await request.get(url)
      expect(res.status(), `${url} was not 403 for a non-member`).toBe(403)
      expectNoMadData(await res.text(), url)
    }
    expect((await request.post(TALLY, { data: { firmId: MAD, counter: `steal-${RUN}` } })).status()).toBe(403)
    expect((await request.post(SCAN, { data: { firmId: MAD, tallyId: madTally, codes: [MAD_BARCODE] } })).status()).toBe(403)

    // The outsider asking for JBS — the same refusal in the other direction.
    const jbs = await start(request, JBS, { counter: `JBS-403-${RUN}` })
    for (const url of shapes(JBS, jbs)) {
      expect((await outsider.get(url)).status(), `${url} was not 403 for the outsider`).toBe(403)
    }
    expect((await outsider.post(TALLY, { data: { firmId: JBS, counter: `steal-back-${RUN}` } })).status()).toBe(403)
    expect((await outsider.post(SCAN, { data: { firmId: JBS, tallyId: jbs, codes: ['P1'] } })).status()).toBe(403)

    // A firm that does not exist answers exactly as a foreign one does — no existence oracle.
    expect((await request.get(`${TALLY}?firmId=tst-firm-no-such-thing`)).status()).toBe(403)
    expect((await request.get(`${TALLY}?firmId=tst-firm-no-such-thing&duplicates=1`)).status()).toBe(403)
    expect((await request.post(TALLY, { data: { firmId: 'tst-firm-no-such-thing', counter: 'x' } })).status()).toBe(403)

    // Refused reads and writes wrote nothing, and no refusal was logged against MAD by a JBS user.
    expect(await db.stockTally.count({ where: { firmId: MAD, counter: `steal-${RUN}` } })).toBe(0)
    expect(await db.stockTallyScan.count({ where: { tallyId: madTally, code: MAD_BARCODE, source: null } })).toBe(0)
    expect(await db.systemLog.count({ where: { userId: FIX.admin.id, firmId: MAD } })).toBe(0)
    await drop(jbs)
  })

  // ── 4. A FOREIGN ROW ID CARRIED ON A VALID OWN firmId ───────────────────────────────────────
  test("GET ?firmId=<mine>&id=<their tally> is 404 and ships no MAD data", async ({ request }) => {
    const res = await request.get(`${TALLY}?firmId=${JBS}&id=${madTally}`)
    expect(res.status(), 'a MAD tally was readable through a JBS firmId').toBe(404)
    const body = await res.text()
    expect(JSON.parse(body).error).toBe('Tally not found')
    expectNoMadData(body, 'cross-firm GET by id')
    // A nonexistent id is the same answer, so the 404 cannot be used to enumerate MAD's tallies.
    const ghost = await request.get(`${TALLY}?firmId=${JBS}&id=tst-tally-does-not-exist`)
    expect(ghost.status()).toBe(404)
    expect(await ghost.text()).toBe(body)
  })

  test("PUT {id: <their tally>} is 404 and the MAD tally is still open afterwards", async ({ request }) => {
    for (const action of ['close', 'discard'] as const) {
      const res = await request.put(TALLY, { data: { id: madTally, action } })
      expect(res.status(), `PUT ${action} on a MAD tally from a JBS session`).toBe(404)
      const body = await res.text()
      expect(JSON.parse(body).error).toBe('Tally not found')
      // Not 403/ROLE_REQUIRED either: the role gate must not fire before the firm gate, or the
      // response tells an outsider the id is real.
      expect(body).not.toContain('ROLE_REQUIRED')
      expectNoMadData(body, `PUT ${action} cross-firm`)
      // A nonexistent id answers identically.
      expect(await (await request.put(TALLY, { data: { id: 'tst-tally-does-not-exist', action } })).text()).toBe(body)
    }
    // The row itself, read straight from the database and then back through MAD's own session.
    const row = await db.stockTally.findUniqueOrThrow({ where: { id: madTally } })
    expect(row.status, 'a JBS session changed a MAD tally').toBe('open')
    expect(row.closedAt).toBeNull()
    expect(row.expectedQty).toBeNull()
    const mine = await outsider.get(`${TALLY}?firmId=${MAD}&id=${madTally}`)
    expect(mine.status(), 'positive control: MAD must still be able to read its own tally').toBe(200)
    expect((await mine.json()).tally.status).toBe('open')
  })

  test("POST /scan {firmId: <mine>, tallyId: <their tally>} is 404 and writes no scan", async ({ request }) => {
    const before = await db.stockTallyScan.count({ where: { tallyId: madTally } })
    const res = await request.post(SCAN, { data: { firmId: JBS, tallyId: madTally, codes: ['P1', MAD_BARCODE], source: 'manual' } })
    expect(res.status(), 'a JBS session scanned into a MAD tally').toBe(404)
    expect(JSON.parse(await res.text()).error).toBe('Tally not found')
    expectNoMadData(await res.text(), 'cross-firm scan')
    expect(await db.stockTallyScan.count({ where: { tallyId: madTally } })).toBe(before)
    expect(await db.stockTallyScan.count({ where: { tallyId: madTally, firmId: JBS } })).toBe(0)
    expect(await db.stockTallyScan.count({ where: { tallyId: madTally, source: 'manual' } })).toBe(0)
    // Same answer for an id that does not exist at all.
    const ghost = await request.post(SCAN, { data: { firmId: JBS, tallyId: 'tst-tally-does-not-exist', codes: ['P1'] } })
    expect(ghost.status()).toBe(404)
    expect(await ghost.text()).toBe(await res.text())
    // And nothing was logged against MAD.
    expect(await db.systemLog.count({ where: { userId: FIX.admin.id, entityId: madTally } })).toBe(0)
  })

  // ── 5. ENDING A TALLY IS NOT COUNTER WORK ───────────────────────────────────────────────────
  test('a non-manager member cannot discard, and cannot end a tally that is not theirs', async ({ request }) => {
    // Started by the JBS OWNER, so the counter hand is a third party to it.
    const id = await start(request, JBS, { counter: `DISCARD-${RUN}` })
    const open = async (tallyId: string) => (await db.stockTally.findUniqueOrThrow({ where: { id: tallyId } })).status

    // Every `staff.*` call below is a bare API client with no browser and no UI, so each 403 is
    // the server's refusal, not a disabled button.
    const denied = await staff.put(TALLY, { data: { id, action: 'discard' } })
    expect(denied.status(), 'a counter hand discarded a stock-take').toBe(403)
    expect((await denied.json()).code).toBe('ROLE_REQUIRED')
    expect(await open(id), 'the refused discard still landed').toBe('open')
    expect(await db.systemLog.count({ where: { entityId: id, details: { contains: 'Discarded' } } })).toBe(0)

    // Close of someone else's tally is manager-only too (route.ts:124-127).
    const noClose = await staff.put(TALLY, { data: { id, action: 'close' } })
    expect(noClose.status(), "a counter hand closed the owner's stock-take").toBe(403)
    expect((await noClose.json()).code).toBe('ROLE_REQUIRED')
    expect(await open(id), 'the refused close still landed').toBe('open')
    expect(await db.systemLog.count({ where: { entityId: id, details: { contains: 'Closed' } } })).toBe(0)

    // A counter hand MAY start a tally and close their OWN — that is the counting job.
    const theirs = await start(staff, JBS, { counter: `STAFF-OWN-${RUN}` })
    expect((await staff.put(TALLY, { data: { id: theirs, action: 'close' } })).status()).toBe(200)
    // But discard stays manager-only even for their own.
    const theirs2 = await start(staff, JBS, { counter: `STAFF-OWN2-${RUN}` })
    const ownDiscard = await staff.put(TALLY, { data: { id: theirs2, action: 'discard' } })
    expect(ownDiscard.status(), 'a counter hand discarded their own count, losing the evidence').toBe(403)
    expect(await open(theirs2)).toBe('open')

    // The owner's discard goes through.
    expect((await request.put(TALLY, { data: { id, action: 'discard' } })).status()).toBe(200)
    const row = await db.stockTally.findUniqueOrThrow({ where: { id } })
    expect(row.status).toBe('discarded')
    expect(row.closedAt).not.toBeNull()
    await drop(id, theirs, theirs2)
  })

  // ── 6. THE SCAN LOG AND DUPLICATE REPORT MUST NOT LEAK ──────────────────────────────────────
  test('duplicates=1 and scans=1 contain nothing belonging to MAD', async ({ request }) => {
    // Positive controls FIRST: prove the canaries are real and visible to their owner, so the
    // absence asserted below means isolation and not an empty table.
    const theirDupes = await outsider.get(`${TALLY}?firmId=${MAD}&duplicates=1`)
    expect(theirDupes.status()).toBe(200)
    expect(await theirDupes.text(), 'the duplicate canary is not actually in MAD').toContain(MAD_BARCODE)
    const theirScans = await outsider.get(`${TALLY}?firmId=${MAD}&scans=1&limit=500`)
    expect(theirScans.status()).toBe(200)
    const theirScanText = await theirScans.text()
    expect(theirScanText).toContain(MAD_BARCODE)
    expect(theirScanText).toContain(MAD_EXTRA_CODE)

    // Now the JBS view of the same two shapes.
    const dupes = await request.get(`${TALLY}?firmId=${JBS}&duplicates=1`)
    expect(dupes.status()).toBe(200)
    expectNoMadData(await dupes.text(), 'duplicates=1')
    for (const d of (await dupes.json()).duplicates) {
      for (const item of d.items) {
        const row = await db.stockItem.findUniqueOrThrow({ where: { id: item.id }, select: { firmId: true } })
        expect(row.firmId, 'the duplicates report listed an item from another firm').toBe(JBS)
      }
    }

    const scans = await request.get(`${TALLY}?firmId=${JBS}&scans=1&limit=500`)
    expect(scans.status()).toBe(200)
    expectNoMadData(await scans.text(), 'scans=1')
    const rows = (await scans.json()).scans as { id: string; tallyId: string }[]
    for (const s of rows) {
      const row = await db.stockTallyScan.findUniqueOrThrow({ where: { id: s.id }, select: { firmId: true } })
      expect(row.firmId, 'the scan log listed a scan from another firm').toBe(JBS)
      expect(s.tallyId, "the scan log named another firm's tally").not.toBe(madTally)
    }

    // And the list shape, which is the one an operator actually opens.
    const list = await request.get(`${TALLY}?firmId=${JBS}`)
    expect(list.status()).toBe(200)
    expectNoMadData(await list.text(), 'tally list')
  })

  // ── 7. limit ABUSE ──────────────────────────────────────────────────────────────────────────
  test('scans=1 clamps a huge, negative or non-numeric limit and never widens the firm scope', async ({ request }) => {
    // Three scans in a throwaway JBS tally, so the clamp is observable without 500 rows.
    const id = await start(request, JBS, { counter: `LIMIT-${RUN}` })
    const codes = ['P1', 'P2', `GHOST-${CODE}`]
    expect((await request.post(SCAN, { data: { firmId: JBS, tallyId: id, codes } })).status()).toBe(200)

    const probe = async (limit: string) => {
      const res = await request.get(`${TALLY}?firmId=${JBS}&scans=1&limit=${limit}`)
      expect(res.status(), `limit=${limit} errored out`).toBe(200)
      const body = await res.text()
      expectNoMadData(body, `scans=1&limit=${limit}`)
      const scans = JSON.parse(body).scans as unknown[]
      expect(Array.isArray(scans)).toBe(true)
      expect(scans.length, `limit=${limit} broke the 500 cap`).toBeLessThanOrEqual(500)
      return scans.length
    }

    expect(await probe('1'), 'limit is not honoured at all').toBe(1)
    expect(await probe('-5'), 'a negative limit was not clamped to 1').toBe(1)
    expect(await probe('abc'), 'a non-numeric limit did not fall back to the default').toBeGreaterThanOrEqual(3)
    expect(await probe('0')).toBeGreaterThanOrEqual(3)
    await probe('999999999')
    await probe('1e9')
    await probe('Infinity')
    await probe('9007199254740993')
    // A repeated param: searchParams.get takes the first, and either value must still clamp.
    const repeated = await request.get(`${TALLY}?firmId=${JBS}&scans=1&limit=999999&limit=1`)
    expect(repeated.status()).toBe(200)
    expect(((await repeated.json()).scans as unknown[]).length).toBeLessThanOrEqual(500)
    await drop(id)
  })

  // ── 8. MASS ASSIGNMENT ──────────────────────────────────────────────────────────────────────
  test('POST refuses a body carrying extra columns and cannot set them', async ({ request }) => {
    const counter = `MASSPOST-${RUN}`
    const res = await request.post(TALLY, {
      data: {
        firmId: JBS, counter,
        status: 'closed', expectedQty: 0, countedQty: 999, missingItemIds: '[]',
        closedAt: '2020-01-01T00:00:00.000Z', startedAt: '2020-01-01T00:00:00.000Z',
        userId: FIX.outsider.id, id: `tst-tally-planted-${RUN}`,
      },
    })
    expect(res.status(), 'a tally body with extra columns was accepted').toBe(400)
    expect((await res.json()).error).toBe('Invalid tally payload')
    expect(await db.stockTally.count({ where: { id: `tst-tally-planted-${RUN}` } })).toBe(0)
    expect(await db.stockTally.count({ where: { counter } })).toBe(0)

    // A foreign firmId plus extra columns: the schema refuses it before the firm gate is reached,
    // which is a 400 rather than a 403 — safe, but for the schema's reason, not the tenancy one.
    const foreign = await request.post(TALLY, { data: { firmId: MAD, counter, status: 'closed' } })
    expect(foreign.status()).toBe(400)
    expect(await db.stockTally.count({ where: { firmId: MAD, counter } })).toBe(0)

    // A clean body creates a row that is unambiguously this firm's and this user's.
    const ok = await request.post(TALLY, { data: { firmId: JBS, counter } })
    expect(ok.status()).toBe(200)
    const id = (await ok.json()).tally.id as string
    created.push(id)
    const row = await db.stockTally.findUniqueOrThrow({ where: { id } })
    expect(row.firmId).toBe(JBS)
    expect(row.userId).toBe(FIX.admin.id)
    expect(row.status).toBe('open')
    expect(row.expectedQty).toBeNull()
    await drop(id)
  })

  test('PUT refuses a firmId or a status in the body', async ({ request }) => {
    const id = await start(request, JBS, { counter: `MASSPUT-${RUN}` })
    const bodies = [
      { id, action: 'close', firmId: MAD },
      { id, action: 'close', status: 'discarded' },
      { id, action: 'close', closedAt: '2020-01-01T00:00:00.000Z' },
      { id, action: 'close', expectedQty: 0, countedQty: 0, missingQty: 0 },
      { id, action: 'promote' },
      { id: madTally, action: 'close', firmId: JBS },
    ]
    for (const data of bodies) {
      const res = await request.put(TALLY, { data })
      expect([400, 404], `PUT accepted ${JSON.stringify(data)}`).toContain(res.status())
      if (res.status() === 400) expect((await res.json()).error).toBe('Invalid tally payload')
    }
    const row = await db.stockTally.findUniqueOrThrow({ where: { id } })
    expect(row.status, 'a refused PUT still mutated the tally').toBe('open')
    expect(row.firmId).toBe(JBS)
    expect(row.closedAt).toBeNull()
    expect((await db.stockTally.findUniqueOrThrow({ where: { id: madTally } })).status).toBe('open')
    await drop(id)
  })

  test('a scan cannot carry its own stockItemId, scannedAt or firm', async ({ request }) => {
    const id = await start(request, JBS, { category: 'fine' })
    const bodies = [
      { firmId: JBS, tallyId: id, codes: ['P1'], stockItemId: FIX.stock[1].id },
      { firmId: JBS, tallyId: id, codes: ['P1'], scannedAt: '2020-01-01T00:00:00.000Z' },
      { firmId: JBS, tallyId: id, codes: ['P1'], userId: FIX.outsider.id },
      { firmId: JBS, tallyId: id, codes: ['P1'], id: `tst-scan-planted-${RUN}` },
      { firmId: JBS, tallyId: id, codes: ['P1'], source: 'telepathy' },
      { firmId: JBS, tallyId: id, codes: 'P1' },
      { firmId: JBS, tallyId: id, codes: [] },
    ]
    for (const data of bodies) {
      const res = await request.post(SCAN, { data })
      expect(res.status(), `scan accepted ${JSON.stringify(data)}`).toBe(400)
      expect((await res.json()).error).toBe('Invalid scan payload')
    }
    expect(await db.stockTallyScan.count({ where: { tallyId: id } })).toBe(0)
    expect(await db.stockTallyScan.count({ where: { id: `tst-scan-planted-${RUN}` } })).toBe(0)

    // The accepted scan takes its stockItemId from the server's own match and its timestamp from
    // the server clock — oMunim baked the client's date into the page and got every scan after
    // midnight wrong.
    //
    // ON ITS OWN PIECE, not the fixture's P2. This assertion read `FIX.stock[1].id` and passed
    // alone while failing in the full suite: other API specs SELL P1..P4, and a sold piece is
    // correctly not counted (it comes back as an extra, reason `not_available`, with a null
    // stockItemId). The product was right and the test was leaning on shared state.
    const mine = await db.stockItem.create({
      data: {
        firmId: JBS, itemCode: `TLY-${RUN}`, name: 'Tenancy scan subject', category: 'fine',
        purity: '22K', grossWeight: 6, netWeight: 6, qty: 1, mrp: 40000, status: 'available',
      },
    })
    const sent = Date.now()
    const ok = await request.post(SCAN, { data: { firmId: JBS, tallyId: id, codes: [mine.itemCode!], source: 'keyboard' } })
    expect(ok.status(), await ok.text()).toBe(200)
    const row = await db.stockTallyScan.findFirstOrThrow({ where: { tallyId: id } })
    expect(row.firmId).toBe(JBS)
    expect(row.userId, 'a scan was attributed to someone other than the caller').toBe(FIX.admin.id)
    expect(row.stockItemId, 'the scan did not resolve to the item the server matched').toBe(mine.id)
    expect(row.scannedAt.getTime(), 'a scan timestamp came from somewhere other than the server clock')
      .toBeGreaterThan(sent - 120_000)
    expect(row.scannedAt.getTime()).toBeLessThan(sent + 120_000)
    await drop(id)
    await db.stockItem.delete({ where: { id: mine.id } })
  })

  // ── 9. CONCURRENCY ──────────────────────────────────────────────────────────────────────────
  test('two simultaneous closes: exactly one 200 and one 409, frozen once', async ({ request }) => {
    const id = await start(request, JBS, { counter: `RACE-CLOSE-${RUN}` })
    expect((await request.post(SCAN, { data: { firmId: JBS, tallyId: id, codes: ['P1'] } })).status()).toBe(200)

    const both = await Promise.all([
      request.put(TALLY, { data: { id, action: 'close' } }),
      request.put(TALLY, { data: { id, action: 'close' } }),
    ])
    expect(both.map((r) => r.status()).sort(), 'a tally was closed twice').toEqual([200, 409])

    const row = await db.stockTally.findUniqueOrThrow({ where: { id } })
    expect(row.status).toBe('closed')
    expect(row.closedAt).not.toBeNull()
    expect(row.expectedQty).not.toBeNull()
    expect(row.countedQty).not.toBeNull()
    expect(
      await db.systemLog.count({ where: { entityId: id, details: { contains: 'Closed stock tally' } } }),
      'the close ran twice',
    ).toBe(1)
    // A third close is a plain 409 — and a discard of a closed tally is 409 too, not a silent win.
    expect((await request.put(TALLY, { data: { id, action: 'close' } })).status()).toBe(409)
    expect((await request.put(TALLY, { data: { id, action: 'discard' } })).status()).toBe(409)
    // Scans cannot be added to a frozen tally.
    expect((await request.post(SCAN, { data: { firmId: JBS, tallyId: id, codes: ['P2'] } })).status()).toBe(409)
    expect(await db.stockTallyScan.count({ where: { tallyId: id } })).toBe(1)
    await drop(id)
  })

  const raceBatch = (tallyId: string) => ({
    firmId: JBS, tallyId, codes: ['P1', 'P2', 'P3', `GHOST-RACE-${CODE}`], source: 'rfid' as const,
  })

  test('two simultaneous identical scan batches count each piece exactly once', async ({ request }) => {
    const id = await start(request, JBS, { counter: `RACE-SCAN-${RUN}` })
    const batch = raceBatch(id)
    const codes = batch.codes

    const both = await Promise.all([request.post(SCAN, { data: batch }), request.post(SCAN, { data: batch })])
    // At least one batch must land. The other may lose a MySQL deadlock and come back 500 — see
    // the test below, which pins that defect separately. What must hold either way: no piece is
    // counted twice, and no half-written batch.
    expect(both.map((r) => r.status()), 'neither racing batch landed').toContain(200)
    expect(await db.stockTallyScan.count({ where: { tallyId: id } }), 'a replayed batch wrote extra rows').toBe(codes.length)
    for (const code of codes) {
      expect(await db.stockTallyScan.count({ where: { tallyId: id, code } }), `${code} was counted twice`).toBe(1)
    }
    for (const r of both) {
      if (r.status() !== 200) continue
      const j = await r.json()
      expect(j.accepted + j.duplicates).toBe(codes.length)
    }
    // A sequential replay is a clean no-op — the idempotency itself is sound.
    const again = await request.post(SCAN, { data: batch })
    expect(again.status()).toBe(200)
    expect((await again.json()).accepted).toBe(0)
    expect(await db.stockTallyScan.count({ where: { tallyId: id } })).toBe(codes.length)
    await drop(id)
  })

  /**
   * ── OPEN DEFECT, NOT GATED HERE ─────────────────────────────────────────────────────────────
   * src/app/api/stock/tally/scan/route.ts:45 — `createMany({ skipDuplicates: true })` is an
   * INSERT IGNORE, and concurrent identical batches deadlock each other on
   * `@@unique([tallyId, code])`. Prisma raises P2034 ("write conflict or deadlock"), nothing
   * catches it, and the loser gets an unhandled 500. The handheld this batch shape exists for
   * (offline queue, flush on reconnect, retry on failure) then retries a batch the server has
   * already stored, and the operator sees a hard error on a count that actually succeeded.
   * Observed on 2 of 3 runs with 2 parallel batches of 4 codes.
   * Fix: retry once on P2034, as POST /api/invoices already does on P2002.
   * Owner: be-platform-data. Reported, deliberately NOT patched from a test file.
   *
   * It is NOT asserted as a failure here because the race does not fire on every run, and a
   * flaky red is a worse gate than none. What IS asserted is everything that must hold whether
   * the deadlock fires or not — a losing batch must roll back WHOLE (never a half-counted
   * drawer), one batch must always land, and the 500 must not ship internals to the client.
   * The observed 500 count is attached to the test as an annotation so the trend is visible.
   */
  test('a racing scan batch is either stored whole or refused whole, and no 500 leaks internals', async ({ request }) => {
    let deadlocks = 0
    for (let i = 0; i < 4; i++) {
      const t = await start(request, JBS, { counter: `RACE-SCAN-500-${RUN}-${i}` })
      const all = await Promise.all([
        request.post(SCAN, { data: raceBatch(t) }),
        request.post(SCAN, { data: raceBatch(t) }),
        request.post(SCAN, { data: raceBatch(t) }),
      ])
      expect(all.map((r) => r.status()), 'every racing batch was refused').toContain(200)
      for (const r of all) {
        expect([200, 500], `an unexpected status from a racing batch`).toContain(r.status())
        if (r.status() !== 500) continue
        deadlocks++
        // The one piece of good news, asserted so it stays true: the 500 body is empty. The
        // Prisma message, the SQL and the absolute source path reach the SERVER log only.
        const body = await r.text()
        for (const m of ['stockTallyScan', 'prisma', 'E:\\', 'insert', 'P2034', '.ts:']) {
          expect(body.toLowerCase(), `the 500 body leaked internals (${m})`).not.toContain(m.toLowerCase())
        }
      }
      // All-or-nothing: exactly the batch, never a partial write and never a double count.
      expect(await db.stockTallyScan.count({ where: { tallyId: t } }), 'a racing batch was written partially or twice')
        .toBe(raceBatch(t).codes.length)
      await drop(t)
    }
    test.info().annotations.push({ type: 'known-defect', description: `scan deadlock 500s observed: ${deadlocks}/12 (scan/route.ts:45, P2034 unhandled)` })
  })

  // ── 10. THE AUDIT TRAIL NAMES THE RIGHT FIRM AND THE RIGHT PERSON ───────────────────────────
  test('SystemLog rows for start / scan / close / discard carry this firm and this user', async ({ request }) => {
    const started = await start(request, JBS, { counter: `LOG-${RUN}` })
    expect((await request.post(SCAN, { data: { firmId: JBS, tallyId: started, codes: ['P1'] } })).status()).toBe(200)
    expect((await request.put(TALLY, { data: { id: started, action: 'close' } })).status()).toBe(200)

    const discarded = await start(request, JBS, { counter: `LOG-DISCARD-${RUN}` })
    expect((await request.put(TALLY, { data: { id: discarded, action: 'discard' } })).status()).toBe(200)

    for (const id of [started, discarded]) {
      const logs = await db.systemLog.findMany({ where: { entityId: id } })
      expect(logs.length, `no audit trail for ${id}`).toBeGreaterThanOrEqual(2)
      for (const l of logs) {
        expect(l.firmId, 'a tally log named the wrong firm').toBe(JBS)
        expect(l.userId, 'a tally log named the wrong user').toBe(FIX.admin.id)
        expect(l.entity).toBe('stock-tally')
        expect(l.details || '', 'a tally log recorded another firm').not.toContain(MAD)
        for (const marker of madLeakMarkers()) expect(l.details || '').not.toContain(marker)
      }
    }
    // MAD's own start was logged under MAD and the outsider, never under JBS or admin.
    const theirs = await db.systemLog.findMany({ where: { entityId: madTally } })
    expect(theirs.length).toBeGreaterThanOrEqual(1)
    for (const l of theirs) {
      expect(l.firmId).toBe(MAD)
      expect(l.userId).toBe(FIX.outsider.id)
    }
    // The staff user's refused discard left no trace claiming it happened.
    expect(await db.systemLog.count({ where: { userId: staffId, details: { contains: 'Discarded' } } })).toBe(0)
    // And no log anywhere attributes a JBS tally to MAD.
    expect(await db.systemLog.count({ where: { entity: 'stock-tally', firmId: MAD, userId: FIX.admin.id } })).toBe(0)
    await drop(started, discarded)
  })
})
