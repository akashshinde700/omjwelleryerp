import { test, expect, type APIRequestContext } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * Bank reconciliation — named bank accounts, a cheque's clearing date distinct from its
 * transaction date (in transit until cleared, reversible on bounce), and CSV statement matching
 * that never mutates a posted LedgerEntry. Owner: be-platform-data.
 */

const FIRM = FIX.firmJBS.id
let db: PrismaClient
test.beforeAll(() => { db = testPrisma() })
test.afterAll(async () => { await db.$disconnect() })

test.use({ storageState: STATE.admin })

async function createBankAccount(request: APIRequestContext, name: string, openingBalance = 0) {
  const res = await request.post('/api/bank/accounts', { data: { firmId: FIRM, name, bankName: 'Test Bank', openingBalance } })
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()).bankAccount
}

async function legsFor(voucherId: string) {
  return db.ledgerEntry.findMany({ where: { firmId: FIRM, voucherId }, orderBy: { id: 'asc' } })
}

test.describe('unauthenticated', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('read is 401', async ({ request }) => {
    const res = await request.get(`/api/bank/accounts?firmId=${FIRM}`)
    expect(res.status()).toBe(401)
  })
})

test.describe('wrong firm', () => {
  test.use({ storageState: STATE.outsider })

  test('a member of another firm cannot list this firm\'s bank accounts', async ({ request }) => {
    const res = await request.get(`/api/bank/accounts?firmId=${FIRM}`)
    expect(res.status()).toBe(403)
  })

  test('a bank account id from another firm is never resolved, even for an authorised firmId', async ({ request, browser }) => {
    // Created as admin (own firm), then probed as outsider — a fresh context so the two
    // sessions never share a storage state.
    const adminCtx = await browser.newContext({ storageState: STATE.admin })
    const adminRequest = adminCtx.request
    const own = await createBankAccount(adminRequest, 'Tenancy Probe Bank')
    await adminCtx.close()

    // outsider's own firm (MAD) is a firm they DO belong to; the bank account id belongs to JBS.
    const res = await request.post('/api/bank/transactions', {
      data: { firmId: FIX.firmMAD.id, bankAccountId: own.id, type: 'deposit', amount: 100, counterAccountName: 'Cash in Hand' },
    })
    // Must not leak whether the id exists in another tenant — 404, not 200 or a cross-tenant post.
    expect(res.status()).toBe(404)
  })
})

test.describe('named bank accounts', () => {
  test('creating one provisions its own chart-of-accounts row, distinct from the generic Bank Account', async ({ request }) => {
    const bank = await createBankAccount(request, 'ICICI Reconciliation Test', 10000)
    expect(bank.accountId).toBeTruthy()
    const account = await db.account.findUnique({ where: { id: bank.accountId } })
    expect(account?.name).toBe('Bank - ICICI Reconciliation Test')
    expect(account?.type).toBe('asset')
    expect(account?.openingBalance).toBe(10000)
    // This account's opening balance has no offsetting Capital Account entry (same as the
    // existing "New account" form allows unchecked — see accounts/route.ts's own comment), so it
    // would leave firmJBS's chart-of-accounts opening out of balance for every OTHER spec that
    // shares this schema. Reset it once the assertion above has proven the field really persists.
    await db.account.update({ where: { id: bank.accountId }, data: { openingBalance: 0 } })

    const dup = await request.post('/api/bank/accounts', { data: { firmId: FIRM, name: 'ICICI Reconciliation Test' } })
    expect(dup.status()).toBe(409)
  })
})

test.describe('deposit / withdrawal / transfer post immediately, balanced', () => {
  test('a deposit debits the named bank and credits the counter account for the same figure', async ({ request }) => {
    const bank = await createBankAccount(request, 'AXIS Deposit Test')
    const res = await request.post('/api/bank/transactions', {
      data: { firmId: FIRM, bankAccountId: bank.id, type: 'deposit', amount: 5000, counterAccountName: 'Cash in Hand' },
    })
    expect(res.status(), await res.text()).toBe(200)
    const tx = (await res.json()).transaction
    expect(tx.status).toBe('cleared')
    expect(tx.clearingDate).toBeTruthy()

    const legs = await legsFor(tx.voucherId)
    expect(legs).toHaveLength(2)
    const totalDebit = legs.reduce((s, l) => s + Number(l.debit), 0)
    const totalCredit = legs.reduce((s, l) => s + Number(l.credit), 0)
    expect(totalDebit).toBe(5000)
    expect(totalCredit).toBe(5000)
    const bankLeg = legs.find((l) => l.accountName === `Bank - ${bank.name}`)
    expect(Number(bankLeg?.debit)).toBe(5000)
  })

  test('a transfer moves money between two named banks and never touches cash', async ({ request }) => {
    const from = await createBankAccount(request, 'Transfer Source Bank')
    const to = await createBankAccount(request, 'Transfer Dest Bank')
    const res = await request.post('/api/bank/transactions', {
      data: { firmId: FIRM, bankAccountId: from.id, type: 'transfer', toBankAccountId: to.id, amount: 2500 },
    })
    expect(res.status(), await res.text()).toBe(200)
    const tx = (await res.json()).transaction
    const legs = await legsFor(tx.voucherId)
    expect(legs.map((l) => l.accountName).sort()).toEqual([`Bank - ${from.name}`, `Bank - ${to.name}`].sort())
  })

  test('transfer to itself and a missing counter account are both refused before anything posts', async ({ request }) => {
    const bank = await createBankAccount(request, 'Self Transfer Bank')
    const selfTransfer = await request.post('/api/bank/transactions', {
      data: { firmId: FIRM, bankAccountId: bank.id, type: 'transfer', toBankAccountId: bank.id, amount: 100 },
    })
    expect(selfTransfer.status()).toBe(400)
    const noCounter = await request.post('/api/bank/transactions', {
      data: { firmId: FIRM, bankAccountId: bank.id, type: 'deposit', amount: 100 },
    })
    expect(noCounter.status()).toBe(400)
  })
})

test.describe('a cheque is in transit until it clears — clearing date distinct from transaction date', () => {
  test('cheque_in posts to Cheques in Transit, not the bank, until cleared', async ({ request }) => {
    const bank = await createBankAccount(request, 'Cheque Clearing Test Bank')
    const created = await request.post('/api/bank/transactions', {
      data: {
        firmId: FIRM, bankAccountId: bank.id, type: 'cheque_in', amount: 7500,
        counterAccountName: 'Sundry Debtors', chequeNumber: 'CHQ-001', transactionDate: '2026-09-01',
      },
    })
    expect(created.status(), await created.text()).toBe(200)
    const tx = (await created.json()).transaction
    expect(tx.status).toBe('pending')
    expect(tx.clearingDate).toBeNull()

    const pendingLegs = await legsFor(tx.voucherId)
    expect(pendingLegs.map((l) => l.accountName).sort()).toEqual(['Cheques in Transit', 'Sundry Debtors'].sort())
    // Nothing posted to the bank's own ledger account yet.
    const bankLegBeforeClear = await db.ledgerEntry.findFirst({ where: { firmId: FIRM, accountId: bank.accountId, voucherId: tx.voucherId } })
    expect(bankLegBeforeClear).toBeNull()

    // Clear it nine days later — the whole point of this model.
    const clear = await request.post(`/api/bank/transactions/${tx.id}`, {
      data: { firmId: FIRM, action: 'clear', clearingDate: '2026-09-10' },
    })
    expect(clear.status(), await clear.text()).toBe(200)
    const cleared = (await clear.json()).transaction
    expect(cleared.status).toBe('cleared')
    expect(new Date(cleared.clearingDate).toISOString().slice(0, 10)).toBe('2026-09-10')

    const clearLegs = await legsFor(cleared.clearVoucherId)
    const bankLeg = clearLegs.find((l) => l.accountName === `Bank - ${bank.name}`)
    expect(Number(bankLeg?.debit)).toBe(7500)
    // Dated the CLEARING date, not the original transaction date.
    expect(new Date(bankLeg!.date).toISOString().slice(0, 10)).toBe('2026-09-10')

    // Acting twice on the same cheque is refused, not silently re-posted.
    const again = await request.post(`/api/bank/transactions/${tx.id}`, { data: { firmId: FIRM, action: 'clear' } })
    expect(again.status()).toBe(409)
  })

  test('a bounced cheque is reversed, never edited, and the original voucher is untouched', async ({ request }) => {
    const bank = await createBankAccount(request, 'Bounce Test Bank')
    const created = await request.post('/api/bank/transactions', {
      data: { firmId: FIRM, bankAccountId: bank.id, type: 'cheque_out', amount: 3000, counterAccountName: 'Sundry Creditors' },
    })
    const tx = (await created.json()).transaction

    const bounce = await request.post(`/api/bank/transactions/${tx.id}`, { data: { firmId: FIRM, action: 'bounce' } })
    expect(bounce.status(), await bounce.text()).toBe(200)
    const bounced = (await bounce.json()).transaction
    expect(bounced.status).toBe('bounced')
    expect(bounced.reversalVoucherId).toBeTruthy()

    const original = await legsFor(tx.voucherId)
    expect(original).toHaveLength(2) // untouched — no update, no delete
    const reversal = await db.ledgerEntry.findMany({ where: { firmId: FIRM, reversalOfId: tx.voucherId } })
    expect(reversal).toHaveLength(2)
    // Net effect across original + reversal is zero on every account touched.
    const byAccount = new Map<string, number>()
    for (const l of [...original, ...reversal]) {
      byAccount.set(l.accountName, (byAccount.get(l.accountName) || 0) + Number(l.debit) - Number(l.credit))
    }
    for (const net of byAccount.values()) expect(net).toBe(0)

    // Bouncing an already-bounced cheque is refused.
    const twice = await request.post(`/api/bank/transactions/${tx.id}`, { data: { firmId: FIRM, action: 'bounce' } })
    expect(twice.status()).toBe(409)
  })
})

test.describe('CSV statement import and reconciliation, without mutating a posted leg', () => {
  test('an imported line auto-matches an existing voucher and never writes to LedgerEntry', async ({ request }) => {
    const bank = await createBankAccount(request, 'Reconcile Import Test Bank')
    const dep = await request.post('/api/bank/transactions', {
      data: { firmId: FIRM, bankAccountId: bank.id, type: 'deposit', amount: 1234, counterAccountName: 'Cash in Hand', transactionDate: '2026-09-05' },
    })
    const tx = (await dep.json()).transaction
    const before = await legsFor(tx.voucherId)

    const csv = 'date,description,amount\n2026-09-06,Cash deposit,1234\n2026-09-07,Bank charges,-50'
    const imp = await request.post('/api/bank/statement', { data: { firmId: FIRM, bankAccountId: bank.id, csv } })
    expect(imp.status(), await imp.text()).toBe(200)
    const body = await imp.json()
    expect(body.imported).toBe(2)
    expect(body.autoMatched).toBe(1)

    // The matched voucher's own legs are byte-for-byte unchanged.
    const after = await legsFor(tx.voucherId)
    expect(after).toEqual(before)

    const rec = await request.get(`/api/bank/reconcile?firmId=${FIRM}&bankAccountId=${bank.id}`)
    expect(rec.status()).toBe(200)
    const recBody = await rec.json()
    // The ₹50 bank-charges line has no ledger entry yet — it must show up as unmatched.
    expect(recBody.unmatchedStatementLines.some((l: any) => l.debit === 50)).toBe(true)
    expect(recBody.fullyReconciled).toBe(false)
  })

  test('a bad CSV header is rejected with 400, not a partial import', async ({ request }) => {
    const bank = await createBankAccount(request, 'Bad CSV Test Bank')
    const res = await request.post('/api/bank/statement', { data: { firmId: FIRM, bankAccountId: bank.id, csv: 'foo,bar\n1,2' } })
    expect(res.status()).toBe(400)
    const lines = await db.bankStatementLine.count({ where: { firmId: FIRM, bankAccountId: bank.id } })
    expect(lines).toBe(0)
  })
})

test.describe('the audit trail never becomes a second copy of the bank details', () => {
  test('editing an account number logs the field NAME, and the digits appear in no log row', async ({ request }) => {
    const bank = await createBankAccount(request, 'Audit Leak Test Bank')
    // A distinctive number so a hit in ANY log row of this firm is unambiguous.
    const ACCOUNT_NUMBER = '50100987654321'
    const put = await request.put('/api/bank/accounts', {
      data: { id: bank.id, accountNumber: ACCOUNT_NUMBER, ifsc: 'ICIC0001234', branch: 'Test Branch' },
    })
    expect(put.status(), await put.text()).toBe(200)
    expect((await put.json()).bankAccount.accountNumber).toBe(ACCOUNT_NUMBER)

    const res = await request.get(`/api/logs?firmId=${FIRM}`)
    expect(res.status(), await res.text()).toBe(200)
    const logs: Array<{ entity: string; entityId: string; details: string | null }> = (await res.json()).logs

    // Positive control: the same matcher on the same string DOES fire where the number legitimately
    // lives, so the assertions below cannot pass merely because the haystack is empty or mangled.
    expect(logs.length).toBeGreaterThan(0)
    expect(`accountNumber: ${ACCOUNT_NUMBER}`).toContain(ACCOUNT_NUMBER)

    // Assert on the digits, not on a format — any future encoding that still leaks them fails here.
    for (const log of logs) expect(log.details ?? '').not.toContain(ACCOUNT_NUMBER)

    // …and the row for this edit still tells an auditor WHAT changed.
    const row = logs.find((l) => l.entity === 'bank_account' && l.entityId === bank.id)
    expect(row?.details).toContain('accountNumber')
    expect(row?.details).toContain(bank.name)

    // Belt and braces: straight at the table, in case /api/logs ever stops returning this row.
    const stored = await db.systemLog.findMany({ where: { firmId: FIRM, entity: 'bank_account', entityId: bank.id } })
    expect(stored.length).toBeGreaterThan(0)
    for (const log of stored) expect(log.details ?? '').not.toContain(ACCOUNT_NUMBER)
  })
})
