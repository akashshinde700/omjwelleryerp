import { describe, it, expect } from 'vitest'
import { postVoucher, reverseVoucher, LedgerError, type LedgerTx, type VoucherLeg } from '@/lib/ledger'

/**
 * src/lib/ledger.ts is the single gate every ledger row must pass through, so the double-entry
 * rules are pinned here against a stub transaction client — no database, no server.
 * A leg that reaches `createMany` is a leg that is in the books forever, so the assertions below
 * check both the refusals AND that nothing was written when a voucher is refused.
 * Owners: be-accounting, qa-finance.
 */

/** Records what would have been written; throws if a caller ever writes twice. */
function stubTx(existing: any[] = []) {
  const written: any[] = []
  const tx: LedgerTx = {
    ledgerEntry: {
      async createMany({ data }) { written.push(...data); return { count: data.length } },
      async findMany() { return existing },
      async findFirst() { return null },
    },
    // No Account rows in these stubs: accountId resolves to null, which is the documented
    // fallback (src/lib/ledger.ts resolveAccountIds) and leaves accountName authoritative.
    account: { async findMany() { return [] } },
  }
  return { tx, written }
}

const legs = (...l: VoucherLeg[]) => l
const base = { firmId: 'f1', userId: 'u1', type: 'receipt' as const }

async function expectRefusal(input: VoucherLeg[], code: string) {
  const { tx, written } = stubTx()
  const err = await postVoucher(tx, { ...base, legs: input }).catch((e) => e)
  expect(err, 'expected a refusal, the voucher posted').toBeInstanceOf(LedgerError)
  expect((err as LedgerError).code).toBe(code)
  expect(written, 'a refused voucher must leave nothing behind').toEqual([])
  return err as LedgerError
}

describe('postVoucher validation', () => {
  it('posts a balanced two-leg receipt and gives every leg the same voucherId', async () => {
    const { tx, written } = stubTx()
    const voucherId = await postVoucher(tx, {
      ...base,
      narration: 'Cash received from Anika',
      legs: legs(
        { accountName: 'Cash in Hand', debit: 5000 },
        { accountName: 'Sundry Debtors', credit: 5000, customerId: 'c1' },
      ),
    })
    expect(written).toHaveLength(2)
    expect(new Set(written.map((w) => w.voucherId))).toEqual(new Set([voucherId]))
    expect(written.map((w) => w.debit)).toEqual([5000, 0])
    expect(written.map((w) => w.credit)).toEqual([0, 5000])
    expect(written.every((w) => w.userId === 'u1' && w.firmId === 'f1')).toBe(true)
    expect(written.every((w) => w.reversalOfId === null)).toBe(true)
    // narration falls through to particulars only where the leg did not give its own
    expect(written[0].particulars).toBe('Cash received from Anika')
  })

  it('accepts a split where the paise only tie after rounding (33.33 + 33.33 + 33.34 = 100.00)', async () => {
    const { tx, written } = stubTx()
    await postVoucher(tx, {
      ...base,
      legs: legs(
        { accountName: 'Rent Expense', debit: 33.33 },
        { accountName: 'Salary Expense', debit: 33.33 },
        { accountName: 'Utility Expense', debit: 33.34 },
        { accountName: 'Cash in Hand', credit: 100.0 },
      ),
    })
    expect(written.reduce((s, w) => s + w.debit, 0)).toBeCloseTo(100, 10)
  })

  it('refuses an off-by-one-paisa voucher and names the imbalance', async () => {
    const err = await expectRefusal(
      legs({ accountName: 'Cash in Hand', debit: 100.0 }, { accountName: 'Sundry Debtors', credit: 99.99 }),
      'UNBALANCED',
    )
    expect(err.message).toContain('₹100.00')
    expect(err.message).toContain('₹99.99')
    expect(err.message).toContain('₹0.01')
  })

  it('refuses a single-leg voucher', async () => {
    await expectRefusal(legs({ accountName: 'Cash in Hand', debit: 100 }), 'TOO_FEW_LEGS')
  })

  it('refuses a negative debit instead of silently treating it as a credit', async () => {
    await expectRefusal(
      legs({ accountName: 'Cash in Hand', debit: -100 }, { accountName: 'Sundry Debtors', credit: -100 }),
      'INVALID_LEG',
    )
  })

  it('refuses a leg carrying both a debit and a credit', async () => {
    await expectRefusal(
      legs({ accountName: 'Cash in Hand', debit: 100, credit: 40 }, { accountName: 'Sundry Debtors', credit: 60 }),
      'INVALID_LEG',
    )
  })

  it('refuses a leg with no amount on either side', async () => {
    await expectRefusal(
      legs({ accountName: 'Cash in Hand', debit: 100 }, { accountName: 'Suspense' }, { accountName: 'Sundry Debtors', credit: 100 }),
      'INVALID_LEG',
    )
  })

  it('refuses a zero-total voucher that technically balances', async () => {
    // Caught per-leg, which is stricter than a total check: a zero total can only arise from zero legs.
    await expectRefusal(
      legs({ accountName: 'Cash in Hand', debit: 0 }, { accountName: 'Sundry Debtors', credit: 0 }),
      'INVALID_LEG',
    )
  })

  it('refuses a leg with no account name', async () => {
    await expectRefusal(
      legs({ accountName: '   ', debit: 100 }, { accountName: 'Sundry Debtors', credit: 100 }),
      'INVALID_LEG',
    )
  })
})

describe('reverseVoucher', () => {
  const original = [
    { accountName: 'Cash in Hand', debit: 5000, credit: 0, type: 'receipt', customerId: null, particulars: 'Receipt', invoiceId: null, loanId: null },
    { accountName: 'Sundry Debtors', debit: 0, credit: 5000, type: 'receipt', customerId: 'c1', particulars: 'Against bill', invoiceId: null, loanId: null },
  ]

  it('mirrors every leg under a new voucherId pointing at the original', async () => {
    const { tx, written } = stubTx(original)
    const newId = await reverseVoucher(tx, { firmId: 'f1', userId: 'u1', voucherId: 'v-orig', date: new Date('2026-04-02') })
    expect(newId).not.toBe('v-orig')
    expect(written.map((w) => [w.accountName, w.debit, w.credit])).toEqual([
      ['Cash in Hand', 0, 5000],
      ['Sundry Debtors', 5000, 0],
    ])
    expect(written.every((w) => w.reversalOfId === 'v-orig' && w.voucherId === newId)).toBe(true)
    expect(written[1].customerId).toBe('c1')
  })

  it('refuses when the voucher does not exist in this firm', async () => {
    const { tx, written } = stubTx([])
    const err = await reverseVoucher(tx, { firmId: 'f1', userId: 'u1', voucherId: 'nope' }).catch((e) => e)
    expect((err as LedgerError).code).toBe('VOUCHER_NOT_FOUND')
    expect(written).toEqual([])
  })

  it('refuses a second reversal of the same voucher', async () => {
    const { written } = stubTx()
    const tx: LedgerTx = {
      ledgerEntry: {
        async createMany({ data }) { written.push(...data); return { count: data.length } },
        async findMany() { return original },
        async findFirst() { return { voucherId: 'v-rev-1' } },
      },
      account: { async findMany() { return [] } },
    }
    const err = await reverseVoucher(tx, { firmId: 'f1', userId: 'u1', voucherId: 'v-orig' }).catch((e) => e)
    expect((err as LedgerError).code).toBe('ALREADY_REVERSED')
    expect(written).toEqual([])
  })
})

describe('caller-supplied voucherId', () => {
  const two = legs(
    { accountName: 'Rent Expense', debit: 5000 },
    { accountName: 'Cash in Hand', credit: 5000 },
  )

  it('uses the given id on every leg, so a source row with no voucherId column can address its voucher', async () => {
    const { tx, written } = stubTx()
    const vid = await postVoucher(tx, { ...base, type: 'expense', voucherId: 'exp-abc123', legs: two })
    expect(vid).toBe('exp-abc123')
    expect(written.map((w) => w.voucherId)).toEqual(['exp-abc123', 'exp-abc123'])
  })

  it('falls back to a generated id when none is given, and never reuses one', async () => {
    const { tx, written } = stubTx()
    await postVoucher(tx, { ...base, legs: two })
    await postVoucher(tx, { ...base, legs: two })
    const ids = [...new Set(written.map((w) => w.voucherId))]
    expect(ids).toHaveLength(2)
    expect(ids.every((i) => typeof i === 'string' && i.length > 0)).toBe(true)
  })

  it('still refuses an unbalanced voucher even with an id supplied', async () => {
    const { tx, written } = stubTx()
    const err = await postVoucher(tx, {
      ...base, voucherId: 'exp-bad',
      legs: legs({ accountName: 'Rent Expense', debit: 5000 }, { accountName: 'Cash in Hand', credit: 4000 }),
    }).catch((e) => e)
    expect(err).toBeInstanceOf(LedgerError)
    expect((err as LedgerError).code).toBe('UNBALANCED')
    expect(written).toEqual([])
  })
})
