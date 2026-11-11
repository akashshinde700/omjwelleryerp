import { z } from 'zod'

/**
 * The ONE password rule for every place a password is set: staff create (POST /api/staff), owner
 * reset (PATCH /api/staff) and self change (POST /api/account/password). Pure — safe to import
 * from client components too.
 *
 *  - min 8 characters;
 *  - max 72 BYTES (UTF-8): bcrypt silently ignores everything after byte 72, so a longer password
 *    would "work" while only its prefix is checked. Counted in bytes, not characters, because a
 *    Devanagari character is 3 bytes.
 */
export const PASSWORD_MIN_CHARS = 8
export const PASSWORD_MAX_BYTES = 72
/** Login refuses anything longer than this before it reaches bcrypt (cheap DoS guard). */
export const LOGIN_PASSWORD_MAX_CHARS = 128

export function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).length
}

/** First problem with `pw` as a NEW password, or null when it is acceptable. */
export function passwordProblem(pw: string, label = 'Password'): string | null {
  if (pw.length < PASSWORD_MIN_CHARS) return `${label} must be at least ${PASSWORD_MIN_CHARS} characters`
  if (utf8Bytes(pw) > PASSWORD_MAX_BYTES) return `${label} is too long (max ${PASSWORD_MAX_BYTES} bytes)`
  return null
}

/** Zod schema for a new password; `label` prefixes the error message ("New password must be…"). */
export function newPasswordSchema(label = 'Password') {
  return z.string().superRefine((pw, ctx) => {
    const problem = passwordProblem(pw, label)
    if (problem) ctx.addIssue({ code: 'custom', message: problem })
  })
}
