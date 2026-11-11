import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/session'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { newPasswordSchema } from '@/lib/password-policy'
import { limiters } from '@/lib/rate-limit'

/**
 * POST /api/account/password — the signed-in user changes THEIR OWN password.
 *
 * Contract (fixed; the change-password dialog is built against it):
 *   body  { currentPassword: string, newPassword: string }
 *   200   { ok: true, loginId }   loginId is the CALLER's own, so the dialog can sign them back in
 *   400   { error }   bad body, wrong current password, too short/long, same as current
 *   401   { error }   no session, or the session's user no longer exists / is deactivated
 *   429   { error }   5 wrong current passwords in 15 min for this user. NOT 401: the client's
 *                     api() treats 401 as "logged out", and a guessing attacker holding a stolen
 *                     cookie should be throttled, not handed a reason to look elsewhere.
 *
 * Success sets `passwordChangedAt`, which ends EVERY existing session of this user, including the
 * caller's (see the jwt callback in src/lib/auth.ts). The dialog signs the caller straight back in
 * with the new password.
 *
 * The target is always the session's user id — never an id from the body — so there is no
 * tenant question to answer here. The current password is re-verified with bcrypt so a borrowed
 * or stolen session cookie alone cannot lock the real owner out of their account.
 */

const WRONG_CURRENT = 'Current password is incorrect'

const bodySchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required').max(128, WRONG_CURRENT),
  newPassword: newPasswordSchema('New password'),
})

export async function POST(req: Request) {
  const sessionUser = await getCurrentUser()
  if (!sessionUser?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid request' }, { status: 400 })
  }
  const { currentPassword, newPassword } = parsed.data

  // Re-read the account: a JWT can outlive a deactivation.
  const user = await db.user.findFirst({
    where: { id: sessionUser.id, active: true },
    select: { id: true, loginId: true, passwordHash: true },
  })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Same compare as authorize() in src/lib/auth.ts: bcrypt only. A legacy non-bcrypt row simply
  // fails here, which is the same answer as a wrong password.
  const limitKey = user.id
  if (limiters.passwordChange.isBlocked(limitKey)) {
    const retry = Math.ceil(limiters.passwordChange.retryAfterMs(limitKey) / 1000)
    return NextResponse.json(
      { error: 'Too many wrong attempts. Try again in 15 minutes.' },
      { status: 429, headers: { 'Retry-After': String(retry) } },
    )
  }
  const valid = await bcrypt.compare(currentPassword, user.passwordHash).catch(() => false)
  if (!valid) {
    limiters.passwordChange.recordFailure(limitKey)
    return NextResponse.json({ error: WRONG_CURRENT }, { status: 400 })
  }
  limiters.passwordChange.reset(limitKey)

  if (newPassword === currentPassword) {
    return NextResponse.json({ error: 'New password must be different from the current password' }, { status: 400 })
  }

  const passwordHash = await hashPassword(newPassword)
  await db.user.update({ where: { id: user.id }, data: { passwordHash, passwordChangedAt: new Date() } })

  // SystemLog.firmId is nullable, but the log viewer is firm-scoped: attach the user's first
  // membership so the owner of that firm can see the event. No password material is logged.
  const firstFirm = await db.userFirm.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
    select: { firmId: true },
  })
  await db.systemLog.create({
    data: {
      userId: user.id,
      firmId: firstFirm?.firmId ?? null,
      action: 'password.change',
      entity: 'user',
      entityId: user.id,
      details: 'Changed own password',
    },
  })

  return NextResponse.json({ ok: true, loginId: user.loginId })
}
