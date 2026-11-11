import { describe, it, expect, beforeEach, vi } from 'vitest'
import { maskLast4, isMasked, maskPii, dropMaskedPii, parseReveal, canReveal, resolveReveal } from '@/lib/pii'

// resolveReveal is the one impure export: it reads UserFirm.role and writes the SystemLog row. The
// row's TEXT is the thing under test here, so the store is a stub rather than a database.
const { logged } = vi.hoisted(() => ({ logged: [] as any[] }))
vi.mock('@/lib/db', () => ({
  db: {
    userFirm: { findUnique: async () => ({ role: 'owner' }) },
    systemLog: { create: async ({ data }: any) => { logged.push(data); return data } },
  },
}))

/**
 * The masking primitives (DPDP Act 2023). The endpoint behaviour, the audit row and the refusal are
 * proved end to end in tests/api/pii-masking.spec.ts; this file pins the parts that decide what a
 * masked value looks like and, more importantly, what happens when one is sent back to us.
 */

describe('maskLast4', () => {
  it('leaves the last four characters and groups the rest in fours', () => {
    expect(maskLast4('123456789012')).toBe('XXXX XXXX 9012')
    expect(maskLast4('ABCDE1234F')).toBe('XXXX XX 234F')
    expect(maskLast4('50100123456789')).toBe('XXXX XXXX XX 6789')
  })

  it('ignores the spacing the operator typed, so 1234 5678 9012 masks identically', () => {
    expect(maskLast4('1234 5678 9012')).toBe('XXXX XXXX 9012')
  })

  it('cannot mask a value of four characters or fewer, so it returns it untouched', () => {
    // Nothing would be hidden by masking 'AB12' — pretending otherwise would only lose the value.
    expect(maskLast4('AB12')).toBe('AB12')
    expect(maskLast4('')).toBe('')
  })
})

describe('isMasked — the guard that stops a masked read being written back', () => {
  it('recognises what maskLast4 emits', () => {
    for (const v of ['123456789012', 'ABCDE1234F', '50100123456789']) {
      expect(isMasked(maskLast4(v))).toBe(true)
    }
  })

  it('does not mistake a real identifier for a masked one', () => {
    for (const v of ['123456789012', 'ABCDE1234F', '50100123456789', 'MH12XX3456', '']) {
      expect(isMasked(v), v).toBe(false)
    }
  })
})

describe('maskPii', () => {
  const row = {
    id: 'c1', firstName: 'Anika', aadhaar: '123456789012', pan: 'ABCDE1234F', mobile: '9876500002',
    // A second PAN under another name. It sat one panel row away from c.pan, unmasked.
    shipPan: 'WXYZA5678B',
  }

  it('masks every sensitive field and touches nothing else', () => {
    const out = maskPii(row)
    expect(out.aadhaar).toBe('XXXX XXXX 9012')
    expect(out.pan).toBe('XXXX XX 234F')
    expect(out.shipPan, 'the shipping PAN is a PAN').toBe('XXXX XX 678B')
    expect(out.mobile).toBe('9876500002')
    expect(out.firstName).toBe('Anika')
    expect(row.aadhaar, 'the source row must not be mutated').toBe('123456789012')
  })

  it('unmasks only the fields named in the reveal set', () => {
    const out = maskPii(row, new Set(['aadhaar']))
    expect(out.aadhaar).toBe('123456789012')
    expect(out.pan).toBe('XXXX XX 234F')
    expect(out.shipPan).toBe('XXXX XX 678B')
  })

  it('reveals the shipping PAN only when it is the field named', () => {
    // Naming pan must not unmask shipPan, and vice versa: the reveal is per field, not per kind.
    expect(maskPii(row, new Set(['pan'])).shipPan).toBe('XXXX XX 678B')
    expect(maskPii(row, new Set(['shipPan'])).shipPan).toBe('WXYZA5678B')
    expect(maskPii(row, new Set(['shipPan'])).pan).toBe('XXXX XX 234F')
  })
})

describe('dropMaskedPii — a masked value means "unchanged", never "overwrite"', () => {
  it('drops the fields that came back masked and keeps a genuine edit', () => {
    const out = dropMaskedPii({
      firstName: 'Anika',
      aadhaar: 'XXXX XXXX 9012', // untouched by the operator: leave the stored value alone
      pan: 'ABCDE1234F',         // actually retyped: write it
      shipPan: 'XXXX XX 678B',   // served masked by the same read the edit form seeded itself from
      bankAccNumber: '',
    })
    expect(out).not.toHaveProperty('aadhaar')
    expect(out, 'a masked shipPan would have been written over the real one').not.toHaveProperty('shipPan')
    expect(out.pan).toBe('ABCDE1234F')
    expect(out.firstName).toBe('Anika')
    // A blank is a separate question (clearing a field) and is not this guard's business.
    expect(out.bankAccNumber).toBe('')
  })
})

describe('parseReveal', () => {
  it('reads a named list and ignores anything not on it', () => {
    expect([...parseReveal('aadhaar,pan')]).toEqual(['aadhaar', 'pan'])
    expect([...parseReveal('aadhaar, notAField')]).toEqual(['aadhaar'])
    expect([...parseReveal('shipPan')]).toEqual(['shipPan'])
  })

  it('treats 1/true/all as the whole set, and nothing as nothing', () => {
    expect(parseReveal('1').size).toBe(5)
    expect(parseReveal('all').size).toBe(5)
    expect(parseReveal(null).size).toBe(0)
    expect(parseReveal('').size).toBe(0)
  })
})

describe('canReveal', () => {
  it('lets the firm owner, an admin or a firm manager through', () => {
    // The decision is per firm, so the argument is the UserFirm role — a global `staff` who owns
    // this firm is the person who signs the register.
    expect(canReveal('owner')).toBe(true)
    expect(canReveal('admin')).toBe(true)
    expect(canReveal('manager')).toBe(true)
  })

  it('refuses a counter hand, a non-member and an unknown role', () => {
    expect(canReveal('staff')).toBe(false)
    expect(canReveal(null)).toBe(false)
    expect(canReveal(undefined)).toBe(false)
    expect(canReveal('Owner'), 'role matching is exact, not case-folded').toBe(false)
  })

  it('ignores the deployment-wide User.role — it was self-settable through PUT /api/staff', () => {
    expect(canReveal('staff')).toBe(false) // even for a user whose global role reads "owner"
  })
})

describe('resolveReveal — the reason is recorded, and is not allowed to become a second copy', () => {
  beforeEach(() => { logged.length = 0 })

  const reveal = (reason: string, fields = 'aadhaar') =>
    resolveReveal(
      new URLSearchParams({ reveal: fields, reason }),
      { id: 'u1' } as any,
      'firm1',
      { entity: 'customer', entityId: 'c1', label: 'customer C001' },
    )

  it('redacts a run of 8+ digits, visibly, so an auditor can tell something was taken out', async () => {
    await reveal('Checked against 1234 5678 9012 shown at the counter')
    expect(logged).toHaveLength(1)
    expect(logged[0].details, 'an Aadhaar in ?reason= reached SystemLog').not.toContain('123456789012')
    expect(logged[0].details).not.toContain('1234 5678 9012')
    expect(logged[0].details).toContain('[redacted]')
    expect(logged[0].details).toContain('aadhaar') // the FIELD is still named
  })

  it('leaves the short numbers a real reason needs — a loan number, a page, a date', async () => {
    // A hyphenated date is eight digits as well, which is why a hyphen is not a tolerated separator:
    // over-redacting the audit field costs an auditor the context the field exists to carry.
    await reveal('Loan A105, register page 12, dated 2026-09-29')
    expect(logged[0].details).toContain('Loan A105, register page 12, dated 2026-09-29')
  })

  it('catches the spaced form an operator actually types', async () => {
    await reveal('Cross-checked 1234 5678 9012 against the card')
    expect(logged[0].details).toBe('Revealed aadhaar on customer C001 — reason: Cross-checked [redacted] against the card')
  })

  it('names every field asked for and returns them, shipPan included', async () => {
    const fields = await reveal('KYC re-verification', 'aadhaar,shipPan')
    expect([...(fields || [])].sort()).toEqual(['aadhaar', 'shipPan'])
    expect(logged[0].details).toContain('aadhaar, shipPan')
  })

  it('writes nothing at all when no reveal was asked for', async () => {
    const fields = await resolveReveal(
      new URLSearchParams({ reason: 'idle curiosity' }),
      { id: 'u1' } as any,
      'firm1',
      { entity: 'customer', entityId: 'c1', label: 'customer C001' },
    )
    expect(fields?.size).toBe(0)
    expect(logged, 'an ordinary masked read must not write an access record').toHaveLength(0)
  })
})
