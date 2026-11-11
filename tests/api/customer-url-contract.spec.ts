import { test, expect, type APIRequestContext } from '@playwright/test'
import { STATE } from '../auth'
import { FIX } from '../seed'
import { PLEDGE_PHOTO_MAX_CHARS } from '@/lib/image'

/**
 * Customer.photoUrl/2/3/4 (rendered as <img src> on open) accept a data-URL image only;
 * Customer.kycDocUrl accepts an https:// link only, max 500 chars. The bulk list drops kycDocUrl;
 * GET /api/customers/{id} still serves it. Owner: be-platform-data.
 */
test.use({ storageState: STATE.admin })

const FIRM = FIX.firmJBS.id
const PNG = 'data:image/png;base64,iVBORw0KGgo='
const HTTPS = 'https://drive.example.com/kyc/abc.pdf'

const post = (r: APIRequestContext, over: Record<string, unknown> = {}) =>
  r.post('/api/customers', { data: { firmId: FIRM, firstName: `UrlContract${Date.now()}${Math.random().toString(36).slice(2, 6)}`, ...over } })
const detail = async (r: APIRequestContext, id: string) =>
  (await (await r.get(`/api/customers/${id}`, { params: { firmId: FIRM } })).json()).customer

const HOSTILE_PHOTOS: [string, string][] = [
  ['javascript:', 'javascript:alert(1)'],
  ['data:text/html', 'data:text/html,<script>alert(1)</script>'],
  ['http://', 'http://evil.example/x.png'],
  ['off-site https', 'https://evil/x.png'],
  ['over the cap', 'data:image/png;base64,' + 'A'.repeat(PLEDGE_PHOTO_MAX_CHARS)],
]

test.describe('hostile photoUrl is a 400 and nothing is written', () => {
  for (const [label, value] of HOSTILE_PHOTOS) {
    test(`POST rejects ${label}`, async ({ request }) => {
      const firstName = `UrlReject${Date.now()}${label.length}`
      const res = await post(request, { firstName, photoUrl: value })
      expect(res.status()).toBe(400)
      const list = await (await request.get('/api/customers', { params: { firmId: FIRM, search: firstName } })).json()
      expect(list.customers).toHaveLength(0)
    })
    test(`PUT rejects ${label} in photoUrl3 and leaves the row alone`, async ({ request }) => {
      const created = (await (await post(request)).json()).customer
      const res = await request.put('/api/customers', { data: { id: created.id, photoUrl3: value } })
      expect(res.status()).toBe(400)
      expect((await detail(request, created.id)).photoUrl3).toBeNull()
    })
  }
})

test.describe('hostile kycDocUrl is a 400', () => {
  const bad = ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'http://drive.example.com/kyc.pdf', 'https://' + 'a'.repeat(500)]
  for (const value of bad) {
    test(`rejects ${value.slice(0, 30)}`, async ({ request }) => {
      const res = await post(request, { kycDocUrl: value })
      expect(res.status()).toBe(400)
      if (value.startsWith('http://')) expect(JSON.stringify(await res.json())).toContain('https://')
    })
  }
})

test('a legitimate data-URL photo and https kycDocUrl are accepted; list drops kycDocUrl, detail keeps it', async ({ request }) => {
  const res = await post(request, { photoUrl: PNG, photoUrl2: PNG, kycDocUrl: HTTPS })
  expect(res.status(), await res.text()).toBe(200)
  const { id, firstName } = (await res.json()).customer
  const d = await detail(request, id)
  expect(d.photoUrl).toBe(PNG)
  expect(d.kycDocUrl).toBe(HTTPS)

  const list = await (await request.get('/api/customers', { params: { firmId: FIRM, search: firstName } })).json()
  const row = list.customers.find((c: any) => c.id === id)
  expect(row).toBeTruthy()
  expect('kycDocUrl' in row).toBe(false)
  expect(row.photoUrl).toBe(PNG)

  // blank clears
  const cleared = await request.put('/api/customers', { data: { id, kycDocUrl: '' } })
  expect(cleared.status()).toBe(200)
  expect((await detail(request, id)).kycDocUrl).toBeNull()
})
