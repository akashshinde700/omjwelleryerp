import { test, expect } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * A multi-firm owner who picked a firm stays on it across reload and window refocus (the session
 * refetch). Used to snap back to firms[0] because setFirms overwrote activeFirmId. Owner: fe-platform.
 */
test.use({ storageState: STATE.admin })

let db: PrismaClient
let secondId = ''
test.beforeAll(() => { db = testPrisma() })
test.afterAll(async () => {
  if (secondId) {
    await db.userFirm.deleteMany({ where: { firmId: secondId } })
    await db.firm.deleteMany({ where: { id: secondId } })
  }
  await db.$disconnect()
})

test('selected second firm survives reload and refocus', async ({ page, request }) => {
  const res = await request.post('/api/firms', { data: { code: 'PERSIST2', name: 'Persist Two', phone: '9999999999', address: 'x', city: 'x', state: 'Madhya Pradesh', pincode: '452001' } })
  expect(res.status()).toBe(200)
  secondId = (await res.json()).firm.id

  await page.goto('/')
  const picker = page.locator('header button').filter({ hasText: FIX.firmJBS.code }).first()
  await expect(picker).toBeVisible()
  await picker.click()
  await page.getByRole('menuitem').filter({ hasText: 'PERSIST2' }).click()
  const second = page.locator('header button').filter({ hasText: 'PERSIST2' }).first()
  await expect(second).toBeVisible()

  await page.reload()
  await expect(page.locator('header button').filter({ hasText: 'PERSIST2' }).first()).toBeVisible()

  // Refocus: NextAuth refetches the session on visibilitychange/focus.
  const sessionCalls: string[] = []
  page.on('request', (r) => { if (r.url().includes('/api/auth/session')) sessionCalls.push(r.url()) })
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')) })
  await expect.poll(() => sessionCalls.length, { timeout: 5000 }).toBeGreaterThan(0)
  await page.waitForTimeout(1000)
  await expect(page.locator('header button').filter({ hasText: 'PERSIST2' }).first()).toBeVisible()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('omunim-app') || '{}').state?.activeFirmId)).toBe(secondId)
})
