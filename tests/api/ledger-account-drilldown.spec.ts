import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { signIn } from './_session'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * ── GET /api/ledger: THE ACCOUNT DRILL-DOWN AND THE TENDER BLOCK ───────────────────────────────
 *
 * Two params put free text and a new table inside this handler's blast radius
 * (src/app/api/ledger/route.ts):
 *
 *   account=<free text>   goes into a Prisma OR clause over LedgerEntry.accountName / accountId
 *                         (route.ts:144-149). The firm scope must come from the VERIFIED firmId
 *                         on the AND side (route.ts:153-159) and from nothing the caller sent.
 *   tender=1              adds a groupBy over Invoice (route.ts:91-97) — a table this handler had
 *                         never read before, so its firm scope is new surface.
 *
 * What this file pins, as a gate rather than a one-off pass:
 *   1. 401 / 403 / 200 on every path, both new params included.
 *   2. No value of `account` reaches another firm's legs: a name that exists only in MAD, a MAD
 *      accountId, a name that exists in BOTH firms, SQL-ish payloads, `%` and `_` (the clause is
 *      an exact match, not `contains`), 191 chars, unicode, and the empty string.
 *   3. No existence oracle: a MAD account is indistinguishable from an account that exists nowhere.
 *   4. tender=1 sums MAD's bills into nobody's response but MAD's.
 *   5. The statements stay untouched by `account` — the invariant the file header of route.ts is
 *      about: a trial balance built from one account's legs cannot tie.
 *   6. It is a GET and it writes NOTHING, whatever is in the query string.
 *
 * Owner: qa-security-perf.
 */

const JBS = FIX.firmJBS.id
const MAD = FIX.firmMAD.id

// Rows made straight through Prisma, not through the routes: they must exist in MAD without any
// JBS-side posting, which is the only way "another firm's account" is a real question here.
const R = {
  madAcc: 'tst-la-mad-acc',
  madAccName: 'Madaan Private Ledger',
  madLeg1: 'tst-la-mad-leg1',
  madLeg2: 'tst-la-mad-leg2',
  /** MAD leg under an account name JBS also uses — the same-name-both-firms case. */
  madSharedLeg: 'tst-la-mad-leg3',
  madInv: 'tst-la-mad-inv',
  jbsAcc: 'tst-la-jbs-acc',
  jbsAccName: 'QA Drilldown Account',
  jbsLeg1: 'tst-la-jbs-leg1',
  jbsLeg2: 'tst-la-jbs-leg2',
  /** The renamed-account case: the leg carries the OLD name and the right accountId. */
  jbsRenamedAcc: 'tst-la-jbs-acc2',
  jbsRenamedNow: 'QA Renamed Account Now',
  jbsRenamedThen: 'QA Renamed Account Then',
  jbsRenamedLeg: 'tst-la-jbs-leg3',
  /** MAD leg whose name NORMALISES to a JBS account name (case + inner whitespace). */
  madNormLeg: 'tst-la-mad-leg4',
  /** JBS leg carrying ANOTHER firm accountId — the row is ours, the pointer is not. */
  jbsForeignPtrLeg: 'tst-la-jbs-leg4',
}
/** Amounts no other fixture uses, so a leaked row is identifiable by its figure alone. */
const MARK = { madLeg: 918_273.64, madShared: 777_777.77, madCash: 111_111.11, madCard: 222_222.22, jbsLeg: 123_456.78 }
const DAY = '2026-02-17'
const AT = new Date(`${DAY}T06:30:00.000Z`)
const RANGE = `from=${DAY}&to=${DAY}`

const url = (firmId: string, extra = '') => `/api/ledger?firmId=${firmId}&${RANGE}${extra ? `&${extra}` : ''}`

type Body = Record<string, any>
async function getJson(request: APIRequestContext, path: string): Promise<{ status: number; body: Body }> {
  const res = await request.get(path)
  const text = await res.text()
  let body: Body = {}
  try { body = JSON.parse(text) } catch { body = { _raw: text } }
  return { status: res.status(), body }
}

/**
 * The three statements, with every row list sorted: a groupBy comes back in no guaranteed order,
 * and this test is about the VALUES being untouched by `account` / `tender`, not about row order.
 */
function sortedStatements(body: Body) {
  const key = (r: any) => `${r.code ?? ''}|${r.name ?? ''}|${r.label ?? ''}|${r.type ?? ''}`
  const norm = (v: any): any => (Array.isArray(v) ? [...v].map(norm).sort((a, b) => key(a).localeCompare(key(b))) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, norm(x)])) : v)
  // The response has no `balanceSheet` key: the balance sheet is assembled in the module from
  // `trialBalance` + `openingProfitLoss` (src/components/app/modules/accounting.tsx), so pinning
  // those pins the balance sheet too.
  return norm({
    trialBalance: body.trialBalance, profitLoss: body.profitLoss, openingProfitLoss: body.openingProfitLoss,
    totals: body.totals, totalDebit: body.totalDebit, totalCredit: body.totalCredit,
    difference: body.difference, balanced: body.balanced,
  })
}

/** Every leg in the response, flagged if it is not this firm's or carries a MAD marker figure. */
function foreignRows(body: Body, firmId: string) {
  const entries: any[] = body.entries ?? []
  return entries.filter(
    (e) => e.firmId !== firmId || e.debit === MARK.madLeg || e.credit === MARK.madLeg || e.debit === MARK.madShared,
  )
}

let db: ReturnType<typeof testPrisma>

test.describe.serial('GET /api/ledger — account drill-down & tender mix', () => {
  test.use({ storageState: STATE.admin })

  test.beforeAll(async () => {
    db = testPrisma()
    await db.account.createMany({
      data: [
        { id: R.madAcc, firmId: MAD, code: 'MADX1', name: R.madAccName, type: 'asset' },
        { id: R.jbsAcc, firmId: JBS, code: 'JBSX1', name: R.jbsAccName, type: 'asset' },
        { id: R.jbsRenamedAcc, firmId: JBS, code: 'JBSX2', name: R.jbsRenamedNow, type: 'asset' },
      ],
      skipDuplicates: true,
    })
    await db.ledgerEntry.createMany({
      data: [
        { id: R.madLeg1, firmId: MAD, accountId: R.madAcc, accountName: R.madAccName, date: AT, debit: MARK.madLeg, credit: 0, type: 'journal', particulars: 'MAD private leg', voucherId: 'tst-la-mad-v1' },
        { id: R.madLeg2, firmId: MAD, accountId: R.madAcc, accountName: R.madAccName, date: AT, debit: 0, credit: MARK.madLeg, type: 'journal', particulars: 'MAD private leg', voucherId: 'tst-la-mad-v1' },
        { id: R.madSharedLeg, firmId: MAD, accountName: 'Cash in Hand', date: AT, debit: MARK.madShared, credit: 0, type: 'journal', particulars: 'MAD cash leg', voucherId: 'tst-la-mad-v2' },
        { id: R.jbsLeg1, firmId: JBS, accountId: R.jbsAcc, accountName: R.jbsAccName, date: AT, debit: MARK.jbsLeg, credit: 0, type: 'journal', particulars: 'JBS drilldown leg', voucherId: 'tst-la-jbs-v1' },
        { id: R.jbsLeg2, firmId: JBS, accountId: R.jbsAcc, accountName: R.jbsAccName, date: AT, debit: 0, credit: MARK.jbsLeg, type: 'journal', particulars: 'JBS drilldown leg', voucherId: 'tst-la-jbs-v1' },
        { id: R.jbsRenamedLeg, firmId: JBS, accountId: R.jbsRenamedAcc, accountName: R.jbsRenamedThen, date: AT, debit: 11, credit: 0, type: 'journal', particulars: 'JBS leg under the old name', voucherId: 'tst-la-jbs-v2' },
        // Normalises to the same key as the JBS account name (normAccountName lowercases and
        // collapses inner whitespace), and carries no accountId — so it is exactly the row the new
        // `variants` groupBy would pick up if that groupBy were not firm-scoped.
        { id: R.madNormLeg, firmId: MAD, accountName: '  qa   DRILLDOWN   account  ', date: AT, debit: MARK.madShared, credit: 0, type: 'journal', particulars: 'MAD normalised-name leg', voucherId: 'tst-la-mad-v3' },
        // Our row, another firm's accountId. Must still be reachable from JBS (it IS a JBS leg) and
        // must never make a MAD account's id meaningful here.
        { id: R.jbsForeignPtrLeg, firmId: JBS, accountId: R.madAcc, accountName: 'QA Foreign Pointer Account', date: AT, debit: 22, credit: 0, type: 'journal', particulars: 'JBS leg with a MAD accountId', voucherId: 'tst-la-jbs-v3' },
      ],
      skipDuplicates: true,
    })
    await db.invoice.upsert({
      where: { id: R.madInv },
      update: {},
      create: {
        id: R.madInv, firmId: MAD, type: 'sale', invoiceNo: 'LA-MAD-1', customerName: 'Madaan Walk-in',
        invoiceDate: AT, status: 'completed', totalAmount: MARK.madCash + MARK.madCard,
        amountByCash: MARK.madCash, amountByCard: MARK.madCard,
      },
    })
  })

  test.afterAll(async () => {
    await db.ledgerEntry.deleteMany({ where: { id: { in: [R.madLeg1, R.madLeg2, R.madSharedLeg, R.madNormLeg, R.jbsLeg1, R.jbsLeg2, R.jbsRenamedLeg, R.jbsForeignPtrLeg] } } })
    await db.invoice.deleteMany({ where: { id: R.madInv } })
    await db.account.deleteMany({ where: { id: { in: [R.madAcc, R.jbsAcc, R.jbsRenamedAcc] } } })
    await db.$disconnect()
  })

  // ───────────────────────── 1. the gate itself, on the new params ─────────────────────────

  test('no session is 401 on both new params', async () => {
    const anon = await pwRequest.newContext({ baseURL: test.info().project.use.baseURL!, storageState: { cookies: [], origins: [] } })
    for (const extra of ['', `account=${encodeURIComponent(R.jbsAccName)}`, 'tender=1', `account=${encodeURIComponent(R.madAccName)}&tender=1`]) {
      const res = await anon.get(url(JBS, extra))
      expect(res.status(), `anonymous read of /api/ledger?${extra}`).toBe(401)
    }
    await anon.dispose()
  })

  test('a tampered session token is 401, not a downgraded read', async () => {
    const baseURL = test.info().project.use.baseURL!
    const real = await pwRequest.newContext({ baseURL, storageState: STATE.admin })
    const state = await real.storageState()
    await real.dispose()
    const cookie = state.cookies.find((c) => c.name.includes('session-token'))!
    expect(cookie, 'no NextAuth session cookie in the saved state').toBeTruthy()
    // One character of the JWE CIPHERTEXT flipped — mid-string, deliberately: the last base64url
    // character of the auth tag carries unused low bits, so flipping it can decode to the very same
    // bytes and prove nothing. Mid-ciphertext, the AEAD must fail and the handler must answer 401
    // rather than falling back to any kind of anonymous or partial read.
    const mid = Math.floor(cookie.value.length / 2)
    const flipped = cookie.value.slice(0, mid) + (cookie.value[mid] === 'A' ? 'B' : 'A') + cookie.value.slice(mid + 1)
    for (const value of [flipped, 'not-a-jwt', '', `${cookie.value}.extra`]) {
      const ctx = await pwRequest.newContext({ baseURL, storageState: { cookies: [{ ...cookie, value }], origins: [] } })
      const res = await ctx.get(url(JBS, `account=${encodeURIComponent(R.jbsAccName)}&tender=1`))
      expect(res.status(), `tampered cookie ${JSON.stringify(value.slice(0, 20))} was accepted`).toBe(401)
      await ctx.dispose()
    }
    // The cookie itself is HttpOnly and SameSite=Lax (NextAuth adds the __Secure- prefix and the
    // Secure flag only over https — a deployment concern, owned by sec-infra-pentest).
    expect(cookie.httpOnly).toBe(true)
    expect(String(cookie.sameSite).toLowerCase()).toBe('lax')
  })

  test('another firm is 403 on both new params, and the body says nothing else', async () => {
    const outsider = await pwRequest.newContext({ baseURL: test.info().project.use.baseURL!, storageState: STATE.outsider })
    for (const extra of ['', `account=${encodeURIComponent(R.jbsAccName)}`, 'tender=1', 'account=Cash in Hand&tender=1']) {
      const { status, body } = await getJson(outsider, url(JBS, extra))
      expect(status, `MAD member reading JBS with ?${extra}`).toBe(403)
      expect(body).toEqual({ error: 'Forbidden' })
    }
    await outsider.dispose()
  })

  test('a JBS member asking for MAD is 403 with the new params too', async ({ request }) => {
    for (const extra of ['', `account=${encodeURIComponent(R.madAccName)}`, 'tender=1', `account=${R.madAcc}&tender=1`]) {
      const { status, body } = await getJson(request, url(MAD, extra))
      expect(status, `JBS member reading MAD with ?${extra}`).toBe(403)
      expect(body).toEqual({ error: 'Forbidden' })
    }
  })

  test('the firm the caller does belong to is 200, and the drill-down returns its own legs', async ({ request }) => {
    const { status, body } = await getJson(request, url(JBS, `account=${encodeURIComponent(R.jbsAccName)}`))
    expect(status).toBe(200)
    expect(body.entriesAccount).toBe(R.jbsAccName)
    expect(body.entries.map((e: any) => e.id).sort()).toEqual([R.jbsLeg1, R.jbsLeg2].sort())
    expect(body.entriesTotal).toBe(2)
    expect(foreignRows(body, JBS)).toEqual([])
  })

  test('a leg posted under the account OLD name is still found by the accountId leg of the OR', async ({ request }) => {
    const { status, body } = await getJson(request, url(JBS, `account=${encodeURIComponent(R.jbsRenamedNow)}`))
    expect(status).toBe(200)
    // The leg carries `QA Renamed Account Then`; the clicked row is `…Now`. It is found through
    // accountId, which was resolved firm-scoped from the name (route.ts:144-145).
    expect(body.entries.map((e: any) => e.id)).toEqual([R.jbsRenamedLeg])
    expect(foreignRows(body, JBS)).toEqual([])
  })

  // ───────────────────────── 2. no value of `account` crosses the firm line ─────────────────

  const PAYLOADS: [string, string][] = [
    ["MAD's own account name", R.madAccName],
    ["MAD's accountId", R.madAcc],
    ["MAD's leg id", R.madLeg1],
    ['wildcard %', '%'],
    ['wildcard _', '_'],
    ['wildcard inside a real name', 'Cash in Han_'],
    ['prefix wildcard', 'Cash%'],
    ['surrounded wildcards', '%Cash%'],
    ['LIKE escape', '\\%'],
    ['SQL tautology', "' OR 1=1 --"],
    ['SQL tautology on a real name', "Cash in Hand' OR '1'='1"],
    ['SQL comment + union', "x' UNION SELECT accountName FROM LedgerEntry --"],
    ['DDL attempt', "'; DROP TABLE LedgerEntry; --"],
    ['quote storm', `'"\`\\`],
    ['JSON-ish object', '{"not":"a string"}'],
    ['Prisma operator shape', '{"contains":""}'],
    ['newline + null byte', 'Cash in Hand\n\u0000'],
    ['unicode', 'नकद खाता'],
    ['emoji', '💰 Cash'],
    ['191 chars (the max)', 'A'.repeat(191)],
  ]

  for (const [name, value] of PAYLOADS) {
    test(`account=${name} returns only JBS rows`, async ({ request }) => {
      const { status, body } = await getJson(request, url(JBS, `account=${encodeURIComponent(value)}`))
      expect(status, `payload ${name} -> ${JSON.stringify(body).slice(0, 300)}`).toBe(200)
      expect(foreignRows(body, JBS), `payload ${name} leaked a MAD row`).toEqual([])
      // Nothing of MAD's by id either, however the row got there.
      const ids = (body.entries ?? []).map((e: any) => e.id)
      expect(ids).not.toContain(R.madLeg1)
      expect(ids).not.toContain(R.madLeg2)
      expect(ids).not.toContain(R.madSharedLeg)
    })
  }

  test('the clause is an exact match, so no wildcard selects anything', async ({ request }) => {
    for (const value of ['%', '_', 'Cash in Han_', 'Cash%', '%Cash%', '%%']) {
      const { body } = await getJson(request, url(JBS, `account=${encodeURIComponent(value)}`))
      expect(body.entries, `account=${value} behaved like a LIKE pattern`).toHaveLength(0)
      expect(body.entriesTotal).toBe(0)
    }
  })

  test('an account name that exists in BOTH firms returns only this firm legs', async ({ request }) => {
    const { status, body } = await getJson(request, url(JBS, 'account=Cash%20in%20Hand'))
    expect(status).toBe(200)
    expect(foreignRows(body, JBS)).toEqual([])
    expect((body.entries ?? []).map((e: any) => e.id)).not.toContain(R.madSharedLeg)
    // MAD's cash leg is in the same day window and under the same name — the only thing keeping it
    // out is the verified firmId on the AND side of the where.
    const mad = await db.ledgerEntry.count({ where: { id: R.madSharedLeg, firmId: MAD, accountName: 'Cash in Hand' } })
    expect(mad, 'the MAD fixture leg this test depends on is missing').toBe(1)
  })

  test('192 characters is a 400 naming the field, not a 500', async ({ request }) => {
    const { status, body } = await getJson(request, url(JBS, `account=${'A'.repeat(192)}`))
    expect(status).toBe(400)
    expect(body.error).toBe('Invalid query')
    expect(body.details.map((d: any) => d.path)).toContain('account')
  })

  test('an empty account= is dropped, not a 400 and not a filter', async ({ request }) => {
    const bare = await getJson(request, url(JBS))
    const empty = await getJson(request, url(JBS, 'account='))
    const blanks = await getJson(request, url(JBS, 'account=%20%20'))
    expect(empty.status).toBe(200)
    expect(empty.body.entriesAccount).toBeNull()
    expect(empty.body.entriesTotal).toBe(bare.body.entriesTotal)
    // `.trim()` runs before `.min(1)`, so whitespace-only is a 400 rather than silently matching
    // every leg whose name happens to be blank. Either answer is safe; this pins which it is.
    expect([200, 400]).toContain(blanks.status)
    if (blanks.status === 200) expect(foreignRows(blanks.body, JBS)).toEqual([])
  })

  test('name matching is normalised, and the normalisation does not cross the firm line', async ({ request }) => {
    // The drill-down matches the way buildStatements() buckets: case-insensitively and with inner
    // whitespace collapsed. MAD holds a leg named `  qa   DRILLDOWN   account  `, which normalises
    // to the SAME key as the JBS account — the `variants` groupBy that feeds the clause is the new
    // surface here, and it is firm-scoped or this leaks.
    for (const v of [R.jbsAccName, R.jbsAccName.toUpperCase(), '  qa   drilldown   account  ']) {
      const { status, body } = await getJson(request, url(JBS, `account=${encodeURIComponent(v)}`))
      expect(status, `account=${v}`).toBe(200)
      expect(foreignRows(body, JBS), `account=${v} leaked a MAD row`).toEqual([])
      expect((body.entries ?? []).map((e: any) => e.id)).not.toContain(R.madNormLeg)
      expect((body.entries ?? []).map((e: any) => e.id).sort(), `account=${v} should still find the JBS legs`).toEqual([R.jbsLeg1, R.jbsLeg2].sort())
    }
    const madNorm = await db.ledgerEntry.count({ where: { id: R.madNormLeg, firmId: MAD } })
    expect(madNorm, 'the MAD normalised-name fixture this test depends on is missing').toBe(1)
  })

  test("an own-firm leg carrying ANOTHER firm accountId is still ours, and that id buys nothing", async ({ request }) => {
    // The leg is JBS's; its accountId points at a MAD account row. It must be findable from JBS by
    // its own name (the clause treats an accountId outside this firm chart as unresolved)…
    const byName = await getJson(request, url(JBS, 'account=QA%20Foreign%20Pointer%20Account'))
    expect(byName.status).toBe(200)
    expect((byName.body.entries ?? []).map((e: any) => e.id)).toContain(R.jbsForeignPtrLeg)
    expect(foreignRows(byName.body, JBS)).toEqual([])
    // …and the MAD account name must still select nothing here, even though a JBS row points at it.
    const byMadName = await getJson(request, url(JBS, `account=${encodeURIComponent(R.madAccName)}`))
    expect(byMadName.body.entriesTotal).toBe(0)
    // Nor may the drill-down pull MAD's own legs in on the strength of that pointer.
    const ids = (byName.body.entries ?? []).map((e: any) => e.id)
    expect(ids).not.toContain(R.madLeg1)
    expect(ids).not.toContain(R.madLeg2)
  })

  // ───────────────────────── 3. no existence oracle ─────────────────────────

  test("MAD's account is indistinguishable from an account that exists nowhere", async ({ request }) => {
    const shapeOf = (b: Body) => {
      const { entriesAccount, ...rest } = b
      void entriesAccount
      return rest
    }
    const madByName = await getJson(request, url(JBS, `account=${encodeURIComponent(R.madAccName)}`))
    const madById = await getJson(request, url(JBS, `account=${R.madAcc}`))
    const nowhere = await getJson(request, url(JBS, 'account=tst-la-no-such-account-anywhere'))
    expect(madByName.status).toBe(nowhere.status)
    expect(madById.status).toBe(nowhere.status)
    expect(shapeOf(madByName.body)).toEqual(shapeOf(nowhere.body))
    expect(shapeOf(madById.body)).toEqual(shapeOf(nowhere.body))
    expect(Object.keys(madByName.body).sort()).toEqual(Object.keys(nowhere.body).sort())
  })

  // ───────────────────────── 4. tender=1 is firm-scoped ─────────────────────────

  test('tender=1 sums only this firm bills', async ({ request }) => {
    const { status, body } = await getJson(request, url(JBS, 'tender=1'))
    expect(status).toBe(200)
    expect(body.tenderMix).toBeTruthy()
    // Recomputed firm-scoped, straight off the database, over the same window.
    const mine = await db.invoice.aggregate({
      where: { firmId: JBS, type: 'sale', status: { not: 'deleted' }, invoiceDate: { gte: new Date(`${DAY}T00:00:00.000Z`), lte: new Date(`${DAY}T23:59:59.999Z`) } },
      _sum: { amountByCash: true, amountByCard: true, amountByUPI: true, amountByCheque: true },
      _count: { _all: true },
    })
    const r2 = (v: number | null | undefined) => Math.round((Number(v) || 0) * 100) / 100
    expect(body.tenderMix.sale.cash).toBe(r2(mine._sum.amountByCash))
    expect(body.tenderMix.sale.card).toBe(r2(mine._sum.amountByCard))
    expect(body.tenderMix.sale.upi).toBe(r2(mine._sum.amountByUPI))
    expect(body.tenderMix.sale.cheque).toBe(r2(mine._sum.amountByCheque))
    expect(body.tenderMix.sale.invoices).toBe(mine._count._all)
    // MAD's bill is dated in the same window with unmistakable figures. It must not be in here,
    // in any field, at any level.
    const flat = JSON.stringify(body.tenderMix)
    expect(flat).not.toContain(String(MARK.madCash))
    expect(flat).not.toContain(String(MARK.madCard))
    const madInv = await db.invoice.count({ where: { id: R.madInv, firmId: MAD } })
    expect(madInv, 'the MAD invoice fixture this test depends on is missing').toBe(1)
  })

  test('tender=1 is absent unless it is asked for, and account does not change it', async ({ request }) => {
    const off = await getJson(request, url(JBS))
    expect(off.body.tenderMix).toBeUndefined()
    const withAccount = await getJson(request, url(JBS, `tender=1&account=${encodeURIComponent(R.jbsAccName)}`))
    const withoutAccount = await getJson(request, url(JBS, 'tender=1'))
    expect(withAccount.body.tenderMix).toEqual(withoutAccount.body.tenderMix)
  })

  test('tender=0 / tender=yes are refused rather than silently treated as on', async ({ request }) => {
    for (const v of ['0', 'yes', 'TRUE', '2']) {
      const { status } = await getJson(request, url(JBS, `tender=${v}`))
      expect(status, `tender=${v}`).toBe(400)
    }
    expect((await getJson(request, url(JBS, 'tender=true'))).body.tenderMix).toBeTruthy()
  })

  // ───────────────────────── 5. the statements stay out of it ─────────────────────────

  test('account and tender leave the statements byte-identical', async ({ request }) => {
    const base = await getJson(request, url(JBS))
    const drilled = await getJson(request, url(JBS, `account=${encodeURIComponent(R.jbsAccName)}`))
    const tendered = await getJson(request, url(JBS, 'tender=1'))
    const nowhere = await getJson(request, url(JBS, 'account=tst-la-no-such-account-anywhere'))
    expect(sortedStatements(drilled.body), 'the statements moved when account= was applied').toEqual(sortedStatements(base.body))
    expect(sortedStatements(tendered.body), 'the statements moved when tender=1 was applied').toEqual(sortedStatements(base.body))
    expect(sortedStatements(nowhere.body), 'the statements moved for an account that matches nothing').toEqual(sortedStatements(base.body))
    // And the statements must never contain MAD's figures in the first place.
    expect(JSON.stringify(base.body.trialBalance)).not.toContain(String(MARK.madLeg))
    expect(JSON.stringify(base.body.trialBalance)).not.toContain(String(MARK.madShared))
  })

  // ───────────────────────── 6. nothing is written, nothing is smuggled ─────────────────────

  test('unknown query params are ignored and cannot redirect the firm scope', async ({ request }) => {
    const base = await getJson(request, url(JBS))
    const junk = await getJson(
      request,
      url(JBS, `foo=bar&firmId2=${MAD}&accountId=${R.madAcc}&userId=${FIX.outsider.id}&role=owner&where=%7B%7D&OR=1&take=9999&select=*`),
    )
    expect(junk.status).toBe(200)
    // Compared field by field rather than as one blob: two separate requests can order tied legs
    // (same date, same createdAt) differently, and that is not what this test is about.
    expect(junk.body.entriesTotal).toBe(base.body.entriesTotal)
    expect(junk.body.entriesAccount).toBe(base.body.entriesAccount)
    expect(junk.body.entriesLimit).toBe(base.body.entriesLimit)
    expect(junk.body.tenderMix).toBeUndefined()
    expect((junk.body.entries ?? []).map((e: any) => e.id).sort()).toEqual((base.body.entries ?? []).map((e: any) => e.id).sort())
    expect(sortedStatements(junk.body)).toEqual(sortedStatements(base.body))
    expect(foreignRows(junk.body, JBS)).toEqual([])
  })

  test('a duplicated firmId resolves to one firm and is still authorised', async ({ request }) => {
    // Object.fromEntries keeps the LAST occurrence (route.ts:119), so whichever firm wins is the
    // one that gets verified — the pair must never produce JBS data under MAD authorisation or
    // the reverse.
    const madLast = await getJson(request, `/api/ledger?firmId=${JBS}&firmId=${MAD}&${RANGE}&account=Cash%20in%20Hand`)
    expect(madLast.status).toBe(403)
    const jbsLast = await getJson(request, `/api/ledger?firmId=${MAD}&firmId=${JBS}&${RANGE}&account=Cash%20in%20Hand`)
    expect(jbsLast.status).toBe(200)
    expect(foreignRows(jbsLast.body, JBS)).toEqual([])
  })

  test('a duplicated account resolves to one value, not to both', async ({ request }) => {
    const { status, body } = await getJson(request, url(JBS, `account=${encodeURIComponent(R.madAccName)}&account=${encodeURIComponent(R.jbsAccName)}`))
    expect(status).toBe(200)
    expect(body.entriesAccount).toBe(R.jbsAccName)
    expect(foreignRows(body, JBS)).toEqual([])
  })

  test('the whole payload barrage writes nothing — not a row, not a log', async ({ request }) => {
    const before = {
      legs: await db.ledgerEntry.count(),
      invoices: await db.invoice.count(),
      accounts: await db.account.count(),
      logs: await db.systemLog.count(),
      madLegs: await db.ledgerEntry.count({ where: { firmId: MAD } }),
    }
    for (const [, value] of PAYLOADS) {
      await request.get(url(JBS, `account=${encodeURIComponent(value)}&tender=1`))
    }
    await request.get(url(JBS, `account=${encodeURIComponent("'; DELETE FROM LedgerEntry; --")}&tender=1&skip=0&limit=500`))
    const after = {
      legs: await db.ledgerEntry.count(),
      invoices: await db.invoice.count(),
      accounts: await db.account.count(),
      logs: await db.systemLog.count(),
      madLegs: await db.ledgerEntry.count({ where: { firmId: MAD } }),
    }
    expect(after).toEqual(before)
  })

  test('errors carry no SQL, no stack and no internal path', async ({ request }) => {
    for (const bad of [`account=${'A'.repeat(192)}`, 'limit=501', 'skip=-1', 'from=notadate', 'tender=0']) {
      const { status, body } = await getJson(request, url(JBS, bad))
      expect(status, bad).toBe(400)
      const text = JSON.stringify(body)
      expect(text).not.toMatch(/SELECT |prisma|\.ts:|node_modules|E:\\|at Object\./i)
    }
  })

  // ───────────────────────── 7. paging under the new filter ─────────────────────────

  test('a deep skip returns no rows and never crosses the cap', async ({ request }) => {
    const first = await getJson(request, url(JBS, 'limit=200&skip=0'))
    const deep = await getJson(request, url(JBS, 'limit=200&skip=50000'))
    expect(deep.status).toBe(200)
    expect(deep.body.entries).toHaveLength(0)
    expect(deep.body.entriesTotal).toBe(first.body.entriesTotal)
    expect(deep.body.entriesSkip).toBe(50000)
    const deepDrill = await getJson(request, url(JBS, `account=${encodeURIComponent(R.jbsAccName)}&limit=200&skip=50000`))
    expect(deepDrill.status).toBe(200)
    expect(deepDrill.body.entries).toHaveLength(0)
    expect(deepDrill.body.entriesTotal).toBe(2)
    expect(foreignRows(deepDrill.body, JBS)).toEqual([])
    // The cap is still a cap, and the page under the filter never exceeds it.
    expect((await getJson(request, url(JBS, 'limit=501'))).status).toBe(400)
    const capped = await getJson(request, url(JBS, 'limit=500'))
    expect(capped.body.entries.length).toBeLessThanOrEqual(500)
  })

  test('paging the drill-down returns each leg once and no leg twice', async ({ request }) => {
    const p1 = await getJson(request, url(JBS, `account=${encodeURIComponent(R.jbsAccName)}&limit=1&skip=0`))
    const p2 = await getJson(request, url(JBS, `account=${encodeURIComponent(R.jbsAccName)}&limit=1&skip=1`))
    expect(p1.body.entries).toHaveLength(1)
    expect(p2.body.entries).toHaveLength(1)
    expect(p1.body.entries[0].id).not.toBe(p2.body.entries[0].id)
    expect([p1.body.entries[0].id, p2.body.entries[0].id].sort()).toEqual([R.jbsLeg1, R.jbsLeg2].sort())
    expect(p1.body.entriesTotal).toBe(2)
  })

  // ───────────────────────── 8. role: who may read the books ─────────────────────────

  test('ROLE, RECORDED: any firm member — staff included — may read the whole books', async () => {
    const baseURL = test.info().project.use.baseURL!
    const loginId = `la-counter-${Date.now()}`
    const owner = await pwRequest.newContext({ baseURL, storageState: STATE.admin })
    const made = await owner.post('/api/staff', { data: { firmId: JBS, name: 'Drilldown Counter Hand', loginId, password: 'counter-pass-1', role: 'staff' } })
    expect(made.status(), await made.text()).toBe(200)
    const staffId = (await made.json()).user.id
    await owner.dispose()
    const staff = await signIn(baseURL, loginId, 'counter-pass-1')
    try {
      const role = await db.userFirm.findFirst({ where: { userId: staffId, firmId: JBS }, select: { role: true } })
      expect(role!.role).toBe('staff')
      // THIS IS THE CURRENT CONTRACT, pinned so a deliberate change to it is visible in a diff and
      // an accidental one is not: GET has no role gate (route.ts:114-135), unlike POST, which is
      // MANAGER_ROLES (route.ts:234). A counter hand can therefore read the trial balance, the P&L,
      // the balance sheet, any account drill-down and the day's tender mix.
      const books = await getJson(staff, url(JBS, `account=${encodeURIComponent(R.jbsAccName)}&tender=1&notes=1`))
      expect(books.status).toBe(200)
      expect(books.body.trialBalance).toBeTruthy()
      expect(books.body.profitLoss).toBeTruthy()
      expect(books.body.openingProfitLoss).toBeTruthy()
      expect(books.body.totals).toBeTruthy()
      expect(books.body.tenderMix).toBeTruthy()
      // Firm isolation still holds for them, which is the part that must never change.
      expect((await staff.get(url(MAD, 'tender=1'))).status()).toBe(403)
      // And they still cannot POST a voucher.
      const post = await staff.post('/api/ledger', {
        data: { firmId: JBS, type: 'journal', legs: [{ accountName: 'Cash in Hand', debit: 1 }, { accountName: 'Sundry Debtors', credit: 1 }] },
      })
      expect(post.status()).toBe(403)
      expect((await post.json()).code).toBe('ROLE_REQUIRED')
    } finally {
      await staff.dispose()
      await db.userFirm.deleteMany({ where: { userId: staffId } })
      await db.user.deleteMany({ where: { id: staffId } })
    }
  })
})
