import type { Prisma } from '@prisma/client'

/**
 * ONE place that turns a typed party (name + mobile) on a bill/loan/order/... into a Customer row.
 * Every route that carries a free-text `customerName` calls resolveParty() inside its own
 * transaction — do not re-implement any of this in a route (the copies drift, silently).
 */

/**
 * The 10-digit Indian mobile hidden in whatever was typed, or null if there is none.
 * `07775951999`, `+91 77759-51999`, `917775951999`, `7775951999` are one number. A 9-digit,
 * letter-only, empty or non-[6-9]-leading entry is not a mobile and never matches anybody.
 */
export function normaliseMobile(raw: string | null | undefined): string | null {
  let d = (raw ?? '').replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  return /^[6-9]\d{9}$/.test(d) ? d : null
}

const ANONYMOUS = new Set([
  'cash', 'cash sale', 'cash customer', 'walk-in', 'walk in', 'walkin', 'walk-in customer', 'walkin customer',
  'counter', 'counter sale', 'customer', 'guest', 'unknown', 'na', 'n/a', 'none', 'nil', 'test',
])
const squash = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * THE LINE between a party and an anonymous counter sale: a name that is generic ("Cash", "Walk-in",
 * "Counter"...) or has fewer than two letters/digits is NOT a person and never gets a Customer row
 * created for it. Everything else — a real name, with or without a mobile — is a party.
 */
export function isAnonymousName(name: string | null | undefined): boolean {
  const n = squash(name ?? '')
  return n.replace(/[^a-z0-9]/g, '').length < 2 || ANONYMOUS.has(n)
}

type Client = Pick<Prisma.TransactionClient, 'customer' | 'systemLog'>
export type PartyInput = {
  firmId: string
  name: string
  mobile?: string | null
  /** Customer.type used when a row has to be created, and the only type a NAME-only match may hit. */
  type?: 'customer' | 'supplier'
  /** Captured by the transaction itself; stored only on a newly created row, never over an existing one. */
  pan?: string | null
  village?: string | null
}

/**
 * Existing party in THIS firm. Mobile first (any type: one man, one record). With no usable mobile,
 * an exact full-name match of the same Customer.type — never a fuzzy match, never across firms.
 */
export async function findParty(c: Pick<Prisma.TransactionClient, 'customer'>, p: PartyInput) {
  const name = squash(p.name)
  const mobile = normaliseMobile(p.mobile)
  const select = { id: true, state: true, loyaltyPoints: true, pan: true } as const
  const order = [{ active: 'desc' as const }, { createdAt: 'asc' as const }]
  if (mobile) {
    // Stored mobiles are free text ("77759 51999", "+91..."), so narrow in SQL by the last 4 digits and decide in JS.
    const rows = await c.customer.findMany({
      where: { firmId: p.firmId, OR: [{ mobile: { contains: mobile.slice(-4) } }, { altMobile: { contains: mobile.slice(-4) } }] },
      select: { ...select, mobile: true, altMobile: true }, orderBy: order,
    })
    return rows.find((r) => normaliseMobile(r.mobile) === mobile || normaliseMobile(r.altMobile) === mobile) ?? null
  }
  if (isAnonymousName(p.name)) return null
  const rows = await c.customer.findMany({
    where: { firmId: p.firmId, type: p.type ?? 'customer', firstName: { startsWith: name.split(' ')[0] } },
    select: { ...select, firstName: true, lastName: true }, orderBy: order,
  })
  return rows.find((r) => squash(`${r.firstName} ${r.lastName ?? ''}`) === name) ?? null
}

/**
 * Link-or-create. Call INSIDE the record's own transaction.
 *  - `customerId` already supplied -> returned untouched (the caller's own firm check stands).
 *  - found -> its id; nothing on the existing record is ever changed (a counter typo must not damage good data).
 *  - not found and a real name -> a Customer with only what was typed (name, mobile, pan, village) + a SystemLog row.
 *  - anonymous and not found -> null; the record keeps its free-text name only.
 */
export async function resolveParty(
  tx: Client,
  p: PartyInput & { customerId?: string | null; userId: string; source: string },
): Promise<{ id: string | null; created: boolean }> {
  if (p.customerId) return { id: p.customerId, created: false }
  const found = await findParty(tx, p)
  if (found) return { id: found.id, created: false }
  if (isAnonymousName(p.name)) return { id: null, created: false }

  const [first, ...rest] = p.name.trim().replace(/\s+/g, ' ').split(' ')
  const mobile = normaliseMobile(p.mobile) ?? (p.mobile?.trim() || null)
  const count = await tx.customer.count({ where: { firmId: p.firmId } })
  const created = await tx.customer.create({
    data: {
      firmId: p.firmId, code: 'C' + (1001 + count), type: p.type ?? 'customer',
      firstName: first, lastName: rest.join(' ') || null, mobile,
      pan: p.pan?.trim() || null, village: p.village?.trim() || null,
    },
  })
  await tx.systemLog.create({
    data: {
      userId: p.userId, firmId: p.firmId, action: 'create', entity: 'customer', entityId: created.id,
      details: `Auto-created ${created.code} "${p.name.trim()}" from a ${p.source} (typed at the counter, not entered in Customers)`,
    },
  })
  return { id: created.id, created: true }
}
