import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

export type SessionUser = {
  id: string
  name: string
  email?: string | null
  role: string
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  return {
    id: (session.user as any).id,
    name: session.user.name || '',
    email: session.user.email,
    role: (session.user as any).role || 'staff',
  }
}

export async function getUserFirms(userId: string) {
  const userFirms = await db.userFirm.findMany({
    where: { userId },
    include: { firm: true },
  })
  return userFirms.map((uf) => ({ ...uf.firm, role: uf.role }))
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')
  return user
}

export async function verifyFirmAccess(userId: string, firmId: string): Promise<boolean> {
  const uf = await db.userFirm.findUnique({
    where: { userId_firmId: { userId, firmId } },
  })
  return !!uf
}

/**
 * The one place a list GET gets its firmId from. Fixes the tenant-isolation bypass where
 * `if (firmId) where.firmId = firmId` silently returned every firm's rows when the query
 * string omitted firmId — the guard above it was skipped for the same reason. Returns the
 * validated firmId, or the 400/403 response to return as-is.
 */
export async function requireFirm(
  searchParams: URLSearchParams,
  user: SessionUser,
): Promise<string | NextResponse> {
  const firmId = searchParams.get('firmId') || ''
  if (!firmId) return NextResponse.json({ error: 'firmId required' }, { status: 400 })
  if (!(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return firmId
}

/**
 * Firm-scoped role gate. `verifyFirmAccess` answers "is this person in the firm at all"; this
 * answers "may they do an owner's job in it".
 *
 * The authority is `UserFirm.role`, never the global `User.role`: the global column is a
 * deployment-wide attribute that says nothing about THIS firm, and a route that could write it
 * (PUT /api/staff, before today) turned it into a self-service escalation. Roles are matched
 * exactly — an unknown role, a missing membership or a blank id is a refusal.
 */
export async function requireFirmRole(userId: string, firmId: string, roles: readonly string[]): Promise<boolean> {
  if (!userId || !firmId) return false
  const uf = await db.userFirm.findUnique({
    where: { userId_firmId: { userId, firmId } },
  })
  return !!uf && roles.includes(uf.role)
}
