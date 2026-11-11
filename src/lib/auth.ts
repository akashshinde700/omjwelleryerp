import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { clientIp, limiters } from '@/lib/rate-limit'
import { LOGIN_PASSWORD_MAX_CHARS } from '@/lib/password-policy'

/**
 * Error string the login screen keys its "too many attempts" message on. next-auth v4 surfaces a
 * thrown authorize() error to `signIn(..., { redirect: false })` as `result.error`.
 */
export const TOO_MANY_ATTEMPTS = 'TooManyAttempts'

/** Thrown from the jwt callback to end a session; next-auth then clears the session cookie. */
const SESSION_REVOKED = 'SessionRevoked'

/**
 * NEXTAUTH_SECRET signs every session. In production it MUST come from the environment (deploy.py
 * writes it into the PM2 ecosystem env): a hardcoded fallback is a published signing key, and
 * anyone holding it can mint a session for any user id. So production refuses to run without it.
 * `next build` also runs with NODE_ENV=production but signs nothing, so the build phase is exempt.
 */
function resolveSecret(): string | undefined {
  const fromEnv = process.env.NEXTAUTH_SECRET
  if (fromEnv) return fromEnv
  if (process.env.NODE_ENV === 'production') {
    if (process.env.NEXT_PHASE === 'phase-production-build') return undefined
    throw new Error('NEXTAUTH_SECRET is not set. Refusing to start: sessions cannot be signed safely.')
  }
  return 'omunim-clone-dev-secret-change-me' // development/test only
}
const SECRET = resolveSecret()

/**
 * A bcrypt hash of a random string, compared against when the login ID does not exist, so an
 * unknown ID costs the same bcrypt round as a wrong password and response time does not reveal
 * which login IDs exist.
 */
let dummyHash: Promise<string> | null = null
function getDummyHash(): Promise<string> {
  dummyHash ??= bcrypt.hash(`no-such-user-${Math.random()}`, 10)
  return dummyHash
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        loginId: { label: 'Login ID / Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.loginId || !credentials?.password) return null
        const id = credentials.loginId.trim()
        if (!id) return null

        // Brute-force limits, checked BEFORE any DB or bcrypt work. Keys are counted whether or not
        // the login ID exists, so the limiter is not an oracle for which IDs are real.
        const ipKey = clientIp(req?.headers as Record<string, string> | undefined)
        const idKey = id.toLowerCase()
        if (limiters.loginIp.isBlocked(ipKey) || limiters.loginId.isBlocked(idKey)) {
          throw new Error(TOO_MANY_ATTEMPTS)
        }
        const fail = () => {
          limiters.loginIp.recordFailure(ipKey)
          limiters.loginId.recordFailure(idKey)
          return null
        }

        // No real password is this long (the policy caps new ones at 72 bytes); refuse before
        // bcrypt so a megabyte "password" cannot be used to burn CPU.
        if (credentials.password.length > LOGIN_PASSWORD_MAX_CHARS) return fail()

        const user = await db.user.findFirst({
          where: {
            OR: [{ loginId: id }, { email: id.toLowerCase() }],
            active: true,
          },
        })

        // bcrypt only. The legacy `demo$<base64>` format was reversible; a row still in it fails
        // to compare and cannot log in — reset it with `node scripts/create-admin.js`.
        const valid = await bcrypt
          .compare(credentials.password, user?.passwordHash ?? (await getDummyHash()))
          .catch(() => false)
        if (!user || !valid) return fail()

        // The login ID's counter is cleared; the IP's is NOT — otherwise one valid account would
        // let an attacker reset their IP allowance every 19 guesses while spraying other IDs.
        limiters.loginId.reset(idKey)

        return {
          id: user.id,
          name: user.name,
          email: user.email || undefined,
          role: user.role,
        } as any
      },
    }),
  ],
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: '/' },
  // Behind a proxy, set NEXTAUTH_URL — v4 has no `trustHost` option (it was ignored here).
  callbacks: {
    /**
     * Runs at sign-in AND on every session read (/api/auth/session, and getServerSession in each
     * route handler). next-auth 4 re-encodes the JWT with a fresh expiry and a fresh `iat` on every
     * /api/auth/session call, so neither `exp` nor `iat` says when the user actually authenticated.
     * `authAt` does: it is set once, at the password check, and carried forward unchanged.
     *
     * On every later call the account is re-read. Throwing here makes next-auth clear the session
     * cookie (/api/auth/session) and makes getServerSession return null (route handlers → 401):
     *  - the user is gone or deactivated;
     *  - the password was changed or reset after this session authenticated. A token from before
     *    `authAt` existed counts as authAt = 0, so it is revoked only if a change has happened.
     * The role is refreshed from the DB rather than trusted from the token.
     */
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id
        token.role = (user as any).role
        token.authAt = Date.now()
        return token
      }
      const userId = typeof token.id === 'string' ? token.id : null
      if (!userId) throw new Error(SESSION_REVOKED)
      const row = await db.user.findUnique({
        where: { id: userId },
        select: { active: true, role: true, passwordChangedAt: true },
      })
      if (!row || !row.active) throw new Error(SESSION_REVOKED)
      const authAt = typeof token.authAt === 'number' ? token.authAt : 0
      if (row.passwordChangedAt && row.passwordChangedAt.getTime() > authAt) throw new Error(SESSION_REVOKED)
      token.role = row.role
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        ;(session.user as any).id = token.id
        ;(session.user as any).role = token.role
      }
      return session
    },
  },
  secret: SECRET,
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10)
}
