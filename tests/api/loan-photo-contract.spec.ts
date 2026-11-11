import { test, expect, type APIRequestContext } from '@playwright/test'
import { STATE } from '../auth'
import { FIX } from '../seed'
import { PLEDGE_PHOTO_MAX_CHARS } from '@/lib/image'

/**
 * Contract tests for the pledge-photo change on the girvi loan endpoints
 * (src/app/api/loans/route.ts, src/app/api/loans/[id]/route.ts).
 *
 * LoanItem.photoUrl is a MySQL `@db.Text` column (65,535 bytes) storing a browser-downscaled
 * `data:image/...;base64,...` string — no upload endpoint, nothing on disk. Five behaviours are
 * locked here: the char cap IS the column (an over-length value is an INSERT error under
 * STRICT_TRANS_TABLES, not a truncation), hostile photoUrl values are rejected before Prisma,
 * `items[]` is bounded at 50 (an unauthenticated-adjacent DoS otherwise), the list stays
 * photo-free while the detail endpoint carries the bytes, and pledge photos are write-once while
 * `?overdue` and `?search` compose instead of one silently dropping the other.
 *
 * Owner: be-lending. Gate: qa-api (this file).
 */

test.use({ storageState: STATE.admin })

const FIRM = FIX.firmJBS.id
const LOAN_DATE = '2026-03-01T00:00:00.000Z'

/** A syntactically valid data URL of an exact total length — the regex only checks charset, not
 *  that the payload decodes to a real image, so padding with 'A' is enough to hit exact boundaries. */
function photoOfLength(n: number, mime: 'png' | 'jpeg' | 'webp' = 'png'): string {
  const prefix = `data:image/${mime};base64,`
  if (n < prefix.length) throw new Error(`cannot build a ${mime} data URL shorter than its own prefix (${prefix.length} chars)`)
  return prefix + 'A'.repeat(n - prefix.length)
}

let seq = 0
async function postLoan(request: APIRequestContext, over: Record<string, unknown> = {}) {
  return request.post('/api/loans', {
    data: {
      firmId: FIRM,
      loanNo: `PHOTO-${Date.now()}-${seq++}`,
      customerId: FIX.pooja.id,
      customerName: 'Pooja Sharma',
      principalAmount: 20000,
      interestRate: 2,
      loanDate: LOAN_DATE,
      items: [{ name: 'Gold Ring', purity: '22K', grossWeight: 5, netWeight: 4.8, estimatedValue: 20000 }],
      ...over,
    },
  })
}

async function newLoan(request: APIRequestContext, over: Record<string, unknown> = {}) {
  const res = await postLoan(request, over)
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()).loan
}

const loanDetail = async (request: APIRequestContext, id: string) =>
  (await (await request.get(`/api/loans/${id}`)).json()).loan

// ── 1. The photo cap boundary — the number is a hard MySQL limit, not taste ───────────────────

test.describe('1. the photo cap is the MySQL column, not taste', () => {
  test('exactly PLEDGE_PHOTO_MAX_CHARS chars passes and round-trips through the detail endpoint', async ({ request }) => {
    const photo = photoOfLength(PLEDGE_PHOTO_MAX_CHARS)
    expect(photo.length).toBe(PLEDGE_PHOTO_MAX_CHARS)

    const loan = await newLoan(request, { items: [{ name: 'Gold Bangle', photoUrl: photo }] })
    const detail = await loanDetail(request, loan.id)
    expect(detail.items[0].photoUrl).toBe(photo)
    expect(detail.items[0].photoUrl.length).toBe(PLEDGE_PHOTO_MAX_CHARS)
  })

  test('PLEDGE_PHOTO_MAX_CHARS + 1 is refused with 400, not an INSERT error against the column', async ({ request }) => {
    const photo = photoOfLength(PLEDGE_PHOTO_MAX_CHARS + 1)
    expect(photo.length).toBe(PLEDGE_PHOTO_MAX_CHARS + 1)

    const res = await postLoan(request, { items: [{ name: 'Gold Bangle', photoUrl: photo }] })
    expect(res.status(), await res.text()).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Invalid request')
  })
})

// ── 2. Hostile values are rejected before Prisma ───────────────────────────────────────────────

test.describe('2. hostile photoUrl values never reach Prisma', () => {
  const hostile: Record<string, string> = {
    'a remote URL (tracking pixel)': 'http://evil.example/track.png',
    'a javascript: URL': 'javascript:alert(1)',
    'an SVG data URL (scripting surface)': 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    'an HTML data URL': 'data:text/html;base64,PGgxPmhpPC9oMT4=',
    'a GIF data URL (not in the png/jpeg/webp allowlist)': 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
    'a bare filesystem path': '/etc/passwd',
  }

  for (const [label, value] of Object.entries(hostile)) {
    test(`${label} -> 400`, async ({ request }) => {
      const res = await postLoan(request, { items: [{ name: 'Gold Ring', photoUrl: value }] })
      expect(res.status(), `${label} (${value}) should be rejected: ${await res.text()}`).toBe(400)
    })
  }
})

// ── 3. items[] is bounded — this was an unauthenticated-adjacent DoS ──────────────────────────

test.describe('3. items[] is capped at 50', () => {
  const itemsOf = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Item ${i}` }))

  test('50 items passes validation', async ({ request }) => {
    const loan = await newLoan(request, { items: itemsOf(50) })
    expect(loan.items.length).toBe(50)
  })

  test('51 items is refused with 400 naming the item limit', async ({ request }) => {
    const res = await postLoan(request, { items: itemsOf(51) })
    expect(res.status(), await res.text()).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Invalid request')
    // The zod message from createSchema's `.max(50, 'A loan can carry at most 50 pledged items')`.
    expect(JSON.stringify(body.details)).toContain('A loan can carry at most 50 pledged items')
  })
})

// ── 4. The list stays photo-free — this is the perf contract ──────────────────────────────────

test.describe('4. GET /api/loans is photo-free; GET /api/loans/[id] carries the bytes', () => {
  test('the list has no photoUrl key anywhere, and hasPhoto is correct on the loan and on each item', async ({ request }) => {
    const photo = photoOfLength(1000)
    const loan = await newLoan(request, {
      photoUrl: photo, // loan-level packet photo
      items: [
        { name: 'Gold Ring (with photo)', photoUrl: photo },
        { name: 'Gold Chain (no photo)' },
      ],
    })

    const listRes = await request.get(`/api/loans?firmId=${FIRM}&search=${encodeURIComponent(loan.loanNo)}`)
    expect(listRes.status()).toBe(200)
    const { loans } = await listRes.json()
    const row = loans.find((l: any) => l.id === loan.id)
    expect(row, `loan ${loan.id} not found in the list`).toBeTruthy()

    // Absence of the KEY, not just a falsy value: `include: { items: true }` restoring photoUrl
    // would put a populated, truthy string back — a falsy check alone would miss that.
    expect('photoUrl' in row).toBe(false)
    expect(row.hasPhoto).toBe(true)
    expect(row.items.every((i: any) => !('photoUrl' in i))).toBe(true)

    const withPhoto = row.items.find((i: any) => i.name === 'Gold Ring (with photo)')
    const withoutPhoto = row.items.find((i: any) => i.name === 'Gold Chain (no photo)')
    expect(withPhoto.hasPhoto).toBe(true)
    expect(withoutPhoto.hasPhoto).toBe(false)
  })

  test('the detail endpoint round-trips the exact photoUrl string that was posted', async ({ request }) => {
    const ringPhoto = photoOfLength(2000, 'jpeg')
    const chainPhoto = photoOfLength(3000, 'webp')
    const loan = await newLoan(request, {
      items: [
        { name: 'Gold Ring', photoUrl: ringPhoto },
        { name: 'Gold Chain', photoUrl: chainPhoto },
        { name: 'Gold Pendant' }, // no photo at all
      ],
    })

    const detail = await loanDetail(request, loan.id)
    const ring = detail.items.find((i: any) => i.name === 'Gold Ring')
    const chain = detail.items.find((i: any) => i.name === 'Gold Chain')
    const pendant = detail.items.find((i: any) => i.name === 'Gold Pendant')
    expect(ring.photoUrl).toBe(ringPhoto)
    expect(chain.photoUrl).toBe(chainPhoto)
    expect(pendant.photoUrl).toBeNull()
  })
})

// ── 5. Pledge photos are write-once; ?overdue and ?search compose ────────────────────────────

test.describe('5. write-once photos, and overdue+search compose', () => {
  test('PUT with items, firmId and releasedAmount changes none of them — updateSchema has no items key and zod strips unknowns', async ({ request }) => {
    const originalPhoto = photoOfLength(500)
    const loan = await newLoan(request, { items: [{ name: 'Gold Ring', photoUrl: originalPhoto }] })

    const put = await request.put('/api/loans', {
      data: {
        id: loan.id,
        items: [{ name: 'Swapped Item', photoUrl: photoOfLength(500, 'jpeg') }],
        firmId: FIX.firmMAD.id,
        releasedAmount: 99999,
        note: 'contract test touch', // a field that IS on updateSchema, to prove the PUT itself worked
      },
    })
    // No `items` key on updateSchema -> zod strips it silently -> 200, no-op on that field.
    // This is a silent 200 no-op by design (not a 400) — documented here so a future reader does
    // not "fix" it into an error without checking this test first.
    expect(put.status(), await put.text()).toBe(200)
    expect((await put.json()).loan.note).toBe('contract test touch')

    const detail = await loanDetail(request, loan.id)
    expect(detail.firmId).toBe(FIRM) // not moved to MAD
    expect(detail.releasedAmount).toBeNull() // not set
    expect(detail.items.length).toBe(1)
    expect(detail.items[0].name).toBe('Gold Ring') // not replaced
    expect(detail.items[0].photoUrl).toBe(originalPhoto) // not swapped
  })

  test('?overdue=true&search=x apply together, not one silently winning over the other', async ({ request }) => {
    // Two loans that BOTH match the search term but only one is overdue, so a superset regression
    // (search wins, overdue silently dropped) is caught: it would return both instead of one.
    const tag = `PHOTOOD${Date.now()}`
    const staleDate = new Date(Date.now() - 200 * 86_400_000).toISOString() // > LOAN_STALE_DAYS (180), no dueDate
    const recentDate = new Date().toISOString()

    const overdueLoan = await newLoan(request, { loanNo: `${tag}-OVERDUE`, loanDate: staleDate })
    const recentLoan = await newLoan(request, { loanNo: `${tag}-RECENT`, loanDate: recentDate })

    // Sanity: search alone (no overdue) finds both — proves the two loans really do disagree only
    // on overdue-ness, so the composed query below is a real test and not a tautology.
    const searchOnly = await (await request.get(`/api/loans?firmId=${FIRM}&search=${tag}`)).json()
    const searchOnlyIds = searchOnly.loans.map((l: any) => l.id)
    expect(searchOnlyIds).toEqual(expect.arrayContaining([overdueLoan.id, recentLoan.id]))

    const composed = await (await request.get(`/api/loans?firmId=${FIRM}&overdue=true&search=${tag}`)).json()
    const composedIds = composed.loans.map((l: any) => l.id)
    expect(composedIds).toContain(overdueLoan.id)
    expect(composedIds).not.toContain(recentLoan.id)
  })
})
