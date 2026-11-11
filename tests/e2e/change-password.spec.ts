import { test, expect, request as pwRequest } from '@playwright/test'
import { signIn } from '../api/_session'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * Change password from the user menu, through the real login screen and dialog.
 *
 * A change revokes every session of the user (jwt callback, src/lib/auth.ts), the browser's own
 * included — so the dialog signs straight back in with the new password. This proves the person
 * who changed it stays logged in while another session of theirs is cut off.
 * Owner: be-auth-tenancy.
 */

const stamp = Date.now()
const U = { loginId: `e2epw-${stamp}`, password: 'e2e-start-pass-1', name: 'Zed Pwchange' }
const NEW = 'e2e-next-pass-2'

test('change password in the dialog: this browser stays signed in, another session is revoked', async ({ page, baseURL }) => {
  const owner = await pwRequest.newContext({ baseURL, storageState: STATE.admin })
  const created = await owner.post('/api/staff', { data: { firmId: FIX.firmJBS.id, name: U.name, loginId: U.loginId, password: U.password, role: 'staff' } })
  expect(created.status(), await created.text()).toBe(200)
  const userId = (await created.json()).user.id as string

  try {
    const other = await signIn(baseURL!, U.loginId, U.password)

    // One login through the real screen.
    await page.goto('/')
    await page.locator('#loginId').fill(U.loginId)
    await page.locator('#password').fill(U.password)
    await page.getByRole('button', { name: /login/i }).click()
    await page.waitForSelector('#loginId', { state: 'detached', timeout: 45_000 })

    await page.locator('button[aria-haspopup="menu"]').filter({ hasText: /^Z$/ }).click()
    await page.getByRole('menuitem', { name: 'Change password' }).click()
    const dialog = page.getByRole('dialog', { name: 'Change password' })
    await dialog.locator('input[autocomplete="current-password"]').fill(U.password)
    await dialog.locator('input[autocomplete="new-password"]').nth(0).fill(NEW)
    await dialog.locator('input[autocomplete="new-password"]').nth(1).fill(NEW)
    await dialog.getByRole('button', { name: 'Change password' }).click()

    await expect(page.getByText('Password changed', { exact: true })).toBeVisible({ timeout: 20_000 })
    await expect(dialog).toBeHidden()

    // This browser holds a NEW, valid session…
    expect((await page.request.get('/api/firms')).status()).toBe(200)
    await page.reload()
    await expect(page.locator('#loginId')).toHaveCount(0)
    expect((await page.request.get('/api/firms')).status()).toBe(200)
    // …while the session opened before the change is dead.
    expect((await other.get('/api/firms')).status()).toBe(401)
    await other.dispose()
  } finally {
    await owner.dispose()
    const db = testPrisma()
    try {
      await db.systemLog.deleteMany({ where: { OR: [{ userId }, { entityId: userId }] } })
      await db.userFirm.deleteMany({ where: { userId } })
      await db.user.deleteMany({ where: { id: userId } })
    } finally {
      await db.$disconnect()
    }
  }
})
