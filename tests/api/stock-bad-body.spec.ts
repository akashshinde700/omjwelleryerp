import { test, expect } from '@playwright/test'
import { STATE } from '../auth'

/**
 * GATE-AUTHZ-3: a JSON null / array / number / string / malformed body on any mutating
 * /api/stock route is a field-free 400 BAD_BODY (or the tally routes' 400 schema error), never
 * a 500 from dereferencing null.firmId. Also proves over-long ids / HUIDs / centre names are 400.
 */
test.use({ storageState: STATE.admin })

const BODIES = ['null', '[]', '42', '"x"', '{not json']
const ROUTES: Array<[string, 'post' | 'put']> = [
  ['/api/stock', 'post'], ['/api/stock', 'put'],
  ['/api/stock/hallmark', 'post'], ['/api/stock/hallmark', 'put'],
  ['/api/stock/melt', 'post'], ['/api/stock/melt', 'put'],
  ['/api/stock/tally', 'post'], ['/api/stock/tally', 'put'],
  ['/api/stock/tally/scan', 'post'],
]

for (const [url, method] of ROUTES) {
  for (const body of BODIES) {
    test(`${method.toUpperCase()} ${url} body ${body} -> 400`, async ({ request }) => {
      const res = await request[method](url, { data: body, headers: { 'content-type': 'application/json' } })
      expect(res.status(), await res.text()).toBe(400)
    })
  }
}

test('stock routes return code BAD_BODY for a null body', async ({ request }) => {
  const res = await request.post('/api/stock', { data: 'null', headers: { 'content-type': 'application/json' } })
  expect(res.status()).toBe(400)
  expect((await res.json()).code).toBe('BAD_BODY')
})

test('over-long ids, HUID and centre name are 400 not 500', async ({ request }) => {
  const long = 'x'.repeat(192)
  const h1 = await request.post('/api/stock/hallmark', { data: { firmId: 'f', itemIds: ['a'], centreName: long } })
  expect(h1.status()).toBe(400)
  const h2 = await request.put('/api/stock/hallmark', { data: { batchId: 'b', items: [{ itemId: 'a', hallmarkUid: long }] } })
  expect(h2.status()).toBe(400)
  const m = await request.put('/api/stock/melt', { data: { batchId: 'b', recoveredGrossWeight: 1, recoveredPurity: long, metalRate: 1 } })
  expect(m.status()).toBe(400)
  const s = await request.put('/api/stock', { data: { id: long } })
  expect(s.status()).toBe(403)
})
