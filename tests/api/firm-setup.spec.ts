import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * The firm setup screen's contract with POST/PUT/GET /api/firms.
 *
 * Everything below was reachable only through the database before Task 78: the Add Firm form
 * exposed thirteen of the thirty-odd columns and there was no edit form at all, so IGST, the logo,
 * gstEnabled and loyaltyRate could be set once at creation (or not at all) and never again.
 * Opening them up moves three things onto a trust boundary, and these are them:
 *
 *  1. `logoUrl` is rendered into an <img> on every printed bill (invoice-doc.tsx). A remote URL
 *     would make a bill fetch from a third party mid-print; an SVG is script on a document handed
 *     to a customer. The route, not the form, is what refuses them.
 *  2. `credentialsSet` tells the form whether a gateway secret is stored. It must say so with
 *     booleans and never leak the value, or the column names, back into a response every counter
 *     machine caches.
 *  3. A blank credential still means "unchanged", now that a form the owner actually uses submits
 *     six of them on every save.
 *
 * Owner: be-auth-tenancy.
 */

const SECRET_COLUMNS = [
  'razorpayKeyId', 'razorpayKeySecret',
  'paytmMerchantId', 'paytmMerchantKey',
  'phonepeMerchantId', 'phonepeSaltKey',
] as const

/** 1×1 transparent PNG — the smallest thing the form's canvas re-encode could plausibly produce. */
const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

test.describe.serial('firm setup', () => {
  test.use({ storageState: STATE.admin }) // the JBS owner

  let outsider: APIRequestContext

  test.beforeAll(async ({ playwright }) => {
    void playwright
    outsider = await pwRequest.newContext({
      baseURL: test.info().project.use.baseURL!,
      storageState: STATE.outsider, // owner of MAD, no membership of JBS
    })
  })

  test.afterAll(async () => {
    await outsider.dispose()
    const db = testPrisma()
    try {
      // Put the fixture back exactly as the rest of the suite expects to find it.
      await db.firm.update({
        where: { id: FIX.firmJBS.id },
        data: {
          logoUrl: null, gstEnabled: true, igstRate: 3.0, cgstRate: 1.5, sgstRate: 1.5,
          loyaltyRate: 1.0, razorpayKeySecret: null,
        },
      })
    } finally {
      await db.$disconnect()
    }
  })

  test('the owner can set what only the database could set before', async ({ request }) => {
    const res = await request.put('/api/firms', {
      data: {
        id: FIX.firmJBS.id,
        logoUrl: PNG_1PX,
        igstRate: 5,
        gstEnabled: false,
        loyaltyRate: 2.5,
      },
    })
    expect(res.status()).toBe(200)

    const db = testPrisma()
    try {
      const firm = await db.firm.findUnique({ where: { id: FIX.firmJBS.id } })
      expect(firm!.logoUrl).toBe(PNG_1PX)
      expect(firm!.igstRate, 'IGST governs every inter-state sale and had no field at all').toBe(5)
      expect(firm!.gstEnabled).toBe(false)
      expect(firm!.loyaltyRate).toBe(2.5)
    } finally {
      await db.$disconnect()
    }
  })

  test('a logo that is not an uploaded image is refused by the route, not only by the form', async ({ request }) => {
    const refused = [
      'https://example.com/logo.png',                                   // a bill must not phone out mid-print
      'http://192.168.1.9/logo.png',                                    // nor to the shop LAN
      'data:image/svg+xml;base64,PHN2Zy8+',                             // SVG is a scripting surface
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',     // not an image at all
      'javascript:alert(1)',
      'data:image/png;base64,' + 'A'.repeat(70_000),                    // past the TEXT column cap
    ]
    for (const logoUrl of refused) {
      const res = await request.put('/api/firms', { data: { id: FIX.firmJBS.id, logoUrl } })
      expect(res.status(), `the route accepted ${logoUrl.slice(0, 40)}`).toBe(400)
    }

    const db = testPrisma()
    try {
      const firm = await db.firm.findUnique({ where: { id: FIX.firmJBS.id } })
      expect(firm!.logoUrl, 'a refused logo still landed').toBe(PNG_1PX)
    } finally {
      await db.$disconnect()
    }

    // '' is how the form clears it, and has to keep working.
    expect((await request.put('/api/firms', { data: { id: FIX.firmJBS.id, logoUrl: '' } })).status()).toBe(200)
  })

  test('credentialsSet reports whether a secret is stored without shipping it', async ({ request }) => {
    const db = testPrisma()
    try {
      await db.firm.update({ where: { id: FIX.firmJBS.id }, data: { razorpayKeySecret: 'rzp_secret_SETUPCANARY' } })
    } finally {
      await db.$disconnect()
    }

    const res = await request.get('/api/firms')
    const text = await res.text()
    expect(text, 'a gateway secret reached the browser').not.toContain('SETUPCANARY')
    for (const col of SECRET_COLUMNS) expect(text, `${col} was named in the response`).not.toContain(col)

    const firms = (await JSON.parse(text)).firms as any[]
    const jbs = firms.find((f) => f.id === FIX.firmJBS.id)
    expect(jbs.credentialsSet.razorpaySecret, 'the form cannot tell "saved" from "not set"').toBe(true)
    expect(jbs.credentialsSet.paytmKey).toBe(false)
  })

  test('a blank credential from the setup form leaves the stored one alone', async ({ request }) => {
    // Exactly the body the form submits when the owner edits the GSTIN and touches nothing else.
    const res = await request.put('/api/firms', {
      data: {
        id: FIX.firmJBS.id, name: FIX.firmJBS.name,
        razorpayKeyId: '', razorpayKeySecret: '',
        paytmMerchantId: '', paytmMerchantKey: '',
        phonepeMerchantId: '', phonepeSaltKey: '',
      },
    })
    expect(res.status()).toBe(200)
    expect(await res.text(), 'PUT echoed a credential back').not.toContain('SETUPCANARY')

    const db = testPrisma()
    try {
      const firm = await db.firm.findUnique({ where: { id: FIX.firmJBS.id } })
      expect(firm!.razorpayKeySecret, 'an untouched box wiped the stored secret').toBe('rzp_secret_SETUPCANARY')
    } finally {
      await db.$disconnect()
    }
  })

  test('the setup form is owner-only, and a firm you do not belong to is 403 not 404', async () => {
    // The MAD owner against JBS: no membership. Role is checked before existence, so this says
    // nothing about whether the id is real.
    const res = await outsider.put('/api/firms', { data: { id: FIX.firmJBS.id, logoUrl: PNG_1PX, igstRate: 0 } })
    expect(res.status()).toBe(403)

    const missing = await outsider.put('/api/firms', { data: { id: 'no-such-firm-at-all', igstRate: 0 } })
    expect(missing.status(), 'a non-member could enumerate firm ids by status code').toBe(403)
  })

  test('the firm code is not writable from the setup form', async ({ request }) => {
    const res = await request.put('/api/firms', { data: { id: FIX.firmJBS.id, code: 'HIJACK' } })
    expect(res.status()).toBe(200)
    const db = testPrisma()
    try {
      const firm = await db.firm.findUnique({ where: { id: FIX.firmJBS.id } })
      expect(firm!.code, 'the code keys every document already issued').toBe(FIX.firmJBS.code)
    } finally {
      await db.$disconnect()
    }
  })

  test('POST without a code is a 400, not a 500', async ({ request }) => {
    const res = await request.post('/api/firms', { data: { name: 'No Code Jewellers' } })
    expect(res.status()).toBe(400)
  })
})
