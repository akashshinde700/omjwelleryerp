import type { SessionUser } from '@/lib/session'

/**
 * ── PII MASKING (DPDP Act 2023) ────────────────────────────────────────────────────────────────
 *
 * The rule, in one line: identifiers are MASKED on the wire by default; the full value comes back
 * only for an explicit `?reveal=` request from an authorised role, and every reveal writes a
 * SystemLog row naming who, what record and which fields — never the values themselves.
 *
 * Masking used to live in the customer panel's render (`maskLast4` in customers.tsx), which means
 * the full Aadhaar was still on the wire, in every browser's network log, in the Expo app's HTTP
 * cache and in any proxy in between. Masking a value after it has been transmitted is not masking.
 *
 * WHY A REVEAL PATH EXISTS AT ALL: an inspector reading a Money Lenders Act register is legally
 * entitled to the full Aadhaar — that is what the register is for. Blanket masking would break a
 * lawful use, so the answer is not "never" but "authorised, narrow and recorded".
 *
 * WHAT DOES NOT GET A REVEAL PATH: the bulk list endpoints (/api/customers, /api/loans). Aadhaar
 * must not be retrievable in bulk; the statutory registers endpoint is the single audited bulk
 * path, and a single-record reveal is the other. Both are logged.
 *
 * NOT IN SCOPE HERE (and still open): the columns are plaintext at rest — field-level encryption
 * and KYC document-URL access control are separate pieces of work.
 */

/**
 * Sensitive identifiers. `shipPan` is here because it IS a PAN: it sat one panel row away from
 * `c.pan` and was served in full by every customer read. One list drives four behaviours — mask on
 * read, drop on write, reveal by name, and the PiiField type — so a field is either in all four or
 * in none of them.
 */
export const PII_FIELDS = ['aadhaar', 'pan', 'kycDocNo', 'bankAccNumber', 'shipPan'] as const
export type PiiField = (typeof PII_FIELDS)[number]

const isPiiField = (f: string): f is PiiField => (PII_FIELDS as readonly string[]).includes(f)

/** `123456789012` → `XXXX XXXX 9012`. Values of 4 characters or fewer are not maskable, so are left. */
export function maskLast4(raw: string): string {
  const clean = raw.replace(/\s+/g, '')
  if (clean.length <= 4) return raw
  const hiddenLen = clean.length - 4
  const groups: string[] = []
  for (let i = 0; i < hiddenLen; i += 4) groups.push('X'.repeat(Math.min(4, hiddenLen - i)))
  return [...groups, clean.slice(-4)].join(' ')
}

/**
 * Is this value one WE masked? The write path needs to know, because every edit form in the product
 * (web dialog, Expo screen) seeds itself from the record it fetched and PUTs the whole object back
 * — so a masked read would otherwise be written straight over the real Aadhaar on the next save.
 *
 * ponytail: shape check, not a marker column — a run of X followed by exactly 4 characters is what
 * maskLast4 emits and is not a shape any real Aadhaar, PAN, account or KYC number takes.
 */
export function isMasked(value: string): boolean {
  return /^X+.{4}$/.test(value.replace(/\s+/g, ''))
}

/** Mask every PII field present on a row, except those explicitly revealed. Non-destructive copy. */
export function maskPii<T extends Record<string, any>>(row: T, reveal?: ReadonlySet<string>): T {
  const out: Record<string, any> = { ...row }
  for (const field of PII_FIELDS) {
    const v = out[field]
    if (typeof v === 'string' && v && !reveal?.has(field)) out[field] = maskLast4(v)
  }
  return out as T
}

/**
 * Write-path guard: drop any PII field the client sent back in its masked form, the same way the
 * customers PUT already treats a blank password as "unchanged" rather than "clear".
 */
export function dropMaskedPii<T extends Record<string, any>>(data: T): T {
  for (const field of PII_FIELDS) {
    const v = data[field]
    if (typeof v === 'string' && isMasked(v)) delete data[field]
  }
  return data
}

/** `?reveal=aadhaar,pan` → the fields asked for. `1`/`all`/`true` → everything. Unknown names ignored. */
export function parseReveal(raw: string | null | undefined): Set<PiiField> {
  if (!raw) return new Set()
  if (raw === '1' || raw === 'true' || raw === 'all') return new Set(PII_FIELDS)
  return new Set(raw.split(',').map((s) => s.trim()).filter(isPiiField))
}

/**
 * Who may unmask, decided per firm: the `UserFirm.role` for the firm that owns the record, and
 * nothing else. A global `staff` who is the owner of this firm is the person who signs the
 * register; a plain counter hand is not.
 *
 * The global `User.role` used to count too, and that was the hole: PUT /api/staff spread the
 * request body into `user.update`, so anyone could set their own global role to `owner` and unmask
 * Aadhaar in every firm they belonged to. That route is fixed, but a deployment-wide column should
 * never have decided a per-firm question in the first place.
 */
const REVEAL_ROLES = new Set(['admin', 'owner', 'manager'])
export function canReveal(firmRole: string | null | undefined): boolean {
  return REVEAL_ROLES.has(firmRole || '')
}

/**
 * The whole reveal decision for a route: parse, authorise, and record it.
 *
 * Returns the fields that may be sent in full — an empty set when none were asked for (the normal
 * masked read, no log row), or `null` when the caller asked and is not allowed, which the route
 * turns into a 403.
 *
 * The SystemLog row names the FIELDS, never the values: an audit trail that copies the Aadhaar into
 * `details` has just created a second, less protected store of it.
 */
export async function resolveReveal(
  searchParams: URLSearchParams,
  user: SessionUser,
  firmId: string,
  ctx: { entity: string; entityId: string; label: string },
): Promise<Set<PiiField> | null> {
  const fields = parseReveal(searchParams.get('reveal'))
  if (!fields.size) return fields

  // Imported here, not at the top: everything above this function is pure, which is what lets the
  // register code (tests/unit/registers.test.ts) pull in maskLast4 without standing up Prisma.
  const { db } = await import('@/lib/db')
  const uf = await db.userFirm.findUnique({ where: { userId_firmId: { userId: user.id, firmId } } })
  if (!canReveal(uf?.role)) return null

  // WHY AN AUDIT FIELD IS ALTERED BEFORE STORAGE (this is deliberate, not a bug): `reason` is free
  // text from the caller and lands both in `details` and in the reverse proxy's query-string log. A
  // caller who pastes an Aadhaar into it turns the audit trail into the second, less protected copy
  // of the number the paragraph above exists to prevent. Runs of 8+ digits are therefore REPLACED,
  // not silently dropped — an auditor must be able to see that something was taken out.
  //
  // ponytail: 8+ digits, spaces tolerated between them — that is `123456789012` and the
  // `1234 5678 9012` an operator types, and it leaves the dates and loan numbers a real reason needs
  // (`2026-09-29` is 8 digits too, which is why `-` is NOT a tolerated separator here). A
  // hyphen-grouped Aadhaar would still get through; the field is a hint for an auditor, not the
  // control — the control is that the VALUES never enter this string in the first place.
  const reason = (searchParams.get('reason') || '')
    .trim()
    .replace(/\d(?: ?\d){7,}/g, '[redacted]')
    .slice(0, 200)
  await db.systemLog.create({
    data: {
      userId: user.id,
      firmId,
      action: 'reveal',
      entity: ctx.entity,
      entityId: ctx.entityId,
      details: `Revealed ${[...fields].sort().join(', ')} on ${ctx.label} — reason: ${reason || 'not given'}`,
    },
  })
  return fields
}
