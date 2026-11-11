import { test, expect, type APIRequestContext } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'
import { PARTY_CONTROL_ACCOUNTS } from '../../src/lib/accounting'
import {
  ALL_TIME, BOOKS_CUSTOMER, BOOKS_CUSTOMER_NAME, BOOKS_FIRM, EXPECTED_TYPE, expectedTypeOf,
  balanceOf, balanceSheet, fyIso, inr, post, r2, readBooks, renderBalanceSheet,
  renderTrading, renderTrialBalance, tradingAccount, type Books,
} from './books'

/**
 * PHASE 2 of the books gate: the seven things that must be true of a set of books, asserted over
 * the firm 01-postings.spec.ts just drove every posting path through.
 *
 * Each of the seven is a defect the incumbent (oMunim) ships today, with its own numbers in the
 * test's comment. Every failure message names the ACCOUNT and the DIFFERENCE, because a gate whose
 * output is "expected true, received false" is a gate the next person deletes instead of debugging.
 *
 * These are identities, not fixtures: none of them hard-codes a total. They hold for an empty set
 * of books and for ten years of them, which is what makes them safe to leave running for ever.
 *
 * Owners: qa-lead (this gate) · be-accounting (src/lib/ledger.ts, src/lib/accounting.ts)
 *         qa-finance (independent verification of every figure)
 */

test.use({ storageState: STATE.outsider })

let db: PrismaClient
test.beforeAll(() => { db = testPrisma() })
test.afterAll(async () => { await db.$disconnect() })

/**
 * Both views of the same books: the default screen (current financial year, with prior years
 * carried as retained earnings) and an all-time range. Every invariant must hold in BOTH — a
 * statement that only balances when you look at it from the right angle is not balanced.
 */
async function bothViews(request: APIRequestContext): Promise<[string, Books][]> {
  return [
    ['the default view (current financial year)', await readBooks(request, BOOKS_FIRM)],
    ['an all-time range', await readBooks(request, BOOKS_FIRM, ALL_TIME)],
  ]
}

test('the gate is auditing a real set of books, not an empty schema', async ({ request }) => {
  const books = await readBooks(request, BOOKS_FIRM, ALL_TIME)
  // Without this, every identity below is vacuously true and a run where phase 1 silently posted
  // nothing would report seven green checks over an empty ledger.
  expect(books.trialBalance.length,
    `only ${books.trialBalance.length} accounts have any balance — 01-postings.spec.ts did not run, ` +
    'or ran against a different firm. Nothing below this line means anything.\n' + renderTrialBalance(books))
    .toBeGreaterThanOrEqual(10)
  expect(books.entriesTotal).toBeGreaterThan(30)
})

// ═════════════════════════ 1. double entry ═════════════════════════

test('1. Σ debits == Σ credits, across the whole ledger and inside every single voucher', async () => {
  // oMunim: trial balance debits 12,302,917.16 vs credits 15,191,605.95 — out by 2,888,688.79,
  // and it prints the statements anyway.
  const whole = await db.ledgerEntry.aggregate({ _sum: { debit: true, credit: true } })
  const dr = r2(Number(whole._sum.debit) || 0)
  const cr = r2(Number(whole._sum.credit) || 0)
  expect(dr, `THE LEDGER DOES NOT BALANCE: debits ${inr(dr)} vs credits ${inr(cr)}, ` +
    `difference ${inr(r2(dr - cr))} across every firm in the database.`).toBe(cr)

  // Per voucher, because a ledger can foot to zero while individual events are each half-posted:
  // two opposite errors cancel in the total and neither statement is right.
  const vouchers = await db.ledgerEntry.groupBy({
    by: ['firmId', 'voucherId'],
    _sum: { debit: true, credit: true },
    _count: { _all: true },
  })
  const broken = vouchers
    .filter((v) => v.voucherId !== null)
    .map((v) => ({
      firmId: v.firmId,
      voucherId: v.voucherId as string,
      legs: v._count._all,
      debit: r2(Number(v._sum.debit) || 0),
      credit: r2(Number(v._sum.credit) || 0),
    }))
    .filter((v) => v.debit !== v.credit || v.legs < 2)

  expect(broken, `${broken.length} voucher(s) do not balance:\n` + broken.map((v) =>
    `    ${v.voucherId} (firm ${v.firmId}, ${v.legs} leg(s)) Dr ${inr(v.debit)} Cr ${inr(v.credit)} ` +
    `out by ${inr(r2(v.debit - v.credit))}`).join('\n')).toEqual([])

  // In the audited firm every leg must carry the voucherId postVoucher gave it. A leg with none is
  // a leg nothing can reverse — the shape that let deleted invoices stay posted for ever.
  const orphans = await db.ledgerEntry.count({ where: { firmId: BOOKS_FIRM, voucherId: null } })
  expect(orphans, `${orphans} ledger leg(s) in the audited firm have no voucherId, so no correcting ` +
    'entry can ever find them. Everything posted through src/lib/ledger.ts has one.').toBe(0)
})

// ═════════════════════════ 2. the balance sheet, with no plug ═════════════════════════

test('2. the balance sheet balances with NO suspense, difference or plug line', async ({ request }) => {
  // oMunim forces its sheet to balance with one unlabelled `Diff. in Balances 68,417,032.96`
  // against a `Total 70,757,680.11` — 97% of the sheet is the plug.
  for (const [view, books] of await bothViews(request)) {
    const sheet = balanceSheet(books)

    expect(books.difference, `TRIAL BALANCE OUT in ${view}: debits ${inr(books.totalDebit)} vs ` +
      `credits ${inr(books.totalCredit)}, difference ${inr(books.difference)}.\n` + renderTrialBalance(books)).toBe(0)
    expect(books.balanced, `the API reports the books as unbalanced in ${view}`).toBe(true)

    expect(sheet.difference,
      `BALANCE SHEET OUT in ${view} by ${inr(sheet.difference)}. ` +
      'A plug would close it; a plug is what oMunim does. Find the account instead:\n' +
      renderBalanceSheet(sheet)).toBe(0)

    // …and nothing is allowed to close the gap by pretending to be an account.
    const plugs = books.trialBalance.filter((r) => /suspense|difference|diff\.|plug|unadjusted/i.test(r.name))
    expect(plugs.map((p) => `${p.name} ${inr(r2(p.debit - p.credit))}`),
      `${view}: a balancing/suspense account is on the books. There is no legitimate reason for one ` +
      'here — every voucher is proven balanced before it is written.').toEqual([])

    // The API's own self-diagnosis must agree. A warning nobody reads is a plug with extra steps.
    expect(books.warnings, `${view}: src/lib/accounting.ts is reporting problems with these books`).toEqual([])
  }
})

// ═════════════════════════ 3. one net profit, not three ═════════════════════════

test('3. trading profit == P&L net profit == balance-sheet net profit', async ({ request }) => {
  // oMunim prints three in one run: Trading 1,870,539.87, P&L 1,691,909.41, Balance Sheet
  // 1,661,673.99 — because each statement re-derives the figure its own way and nothing compares
  // them. It also prints `Discount Paid 32,346.00` twice in the same P&L.
  for (const [view, books] of await bothViews(request)) {
    const trading = tradingAccount(books)
    const sheet = balanceSheet(books)

    expect(trading.unplaced, `${view}: ${trading.unplaced.length} account(s) have no type, so they ` +
      `reach neither the trading account nor the P&L: ${trading.unplaced.join(', ')}`).toEqual([])

    // Every nominal row landed in exactly one bucket — no row counted twice, none dropped.
    const nominal = books.trialBalance.filter((r) => r.type === 'income' || r.type === 'expense')
    expect(trading.placed.length, `${view}: the trading/P&L split covers ${trading.placed.length} of ` +
      `${nominal.length} nominal accounts — a row is being double-counted or dropped.\n` + renderTrading(trading))
      .toBe(nominal.length)
    const names = trading.placed.map((p) => p.name)
    expect(names.length - new Set(names).size,
      `${view}: an account appears more than once in the P&L (${names.join(', ')}). oMunim prints ` +
      'Discount Paid twice in one statement; this is that defect.').toBe(0)

    expect(trading.net, `${view}: NET PROFIT DISAGREES.\n` +
      `    trading account   ${inr(trading.net)}\n` +
      `    P&L statement     ${inr(books.profitLoss.net)}\n` +
      `    difference        ${inr(r2(trading.net - books.profitLoss.net))}\n` + renderTrading(trading))
      .toBeCloseTo(books.profitLoss.net, 2)

    expect(sheet.netProfit, `${view}: the balance sheet's P&L line says ${inr(sheet.netProfit)} while ` +
      `the P&L statement says ${inr(books.profitLoss.net)}`).toBeCloseTo(books.profitLoss.net, 2)

    // And the same figure again from the other direction: income and expense must net to it.
    expect(r2(books.profitLoss.income - books.profitLoss.expense),
      `${view}: income ${inr(books.profitLoss.income)} − expense ${inr(books.profitLoss.expense)} is not ` +
      `the ${inr(books.profitLoss.net)} the statement prints`).toBe(books.profitLoss.net)
  }
})

// ═════════════════════════ 4. TB and BS agree per account ═════════════════════════

test('4. the trial balance and the balance sheet agree account by account', async ({ request }) => {
  // oMunim, same period, same run: CASH IN HAND 879,641.55 CR on one statement and −854,641.55 on
  // the other; SUNDRY CREDITORS 563,492.00 vs 588,492.00. Each off by exactly ₹25,000 in opposite
  // directions — one voucher is reaching one statement and not the other.
  for (const [view, books] of await bothViews(request)) {
    const sheet = balanceSheet(books)
    const onSheet = new Map([...sheet.assets, ...sheet.liabEquity].map((l) => [l.name, l]))

    const mismatches: string[] = []
    for (const row of books.trialBalance) {
      if (row.type !== 'asset' && row.type !== 'liability' && row.type !== 'equity') continue
      // An account that moved during the period but closes at nil belongs on neither side — a
      // balance sheet lists balances, not activity. (Bank Account does exactly this once the
      // deleted expense is reversed.) Its movement is still checked by the trial balance itself.
      if (row.debit === 0 && row.credit === 0) continue
      const line = onSheet.get(row.name)
      if (!line) {
        mismatches.push(`${row.name}: trial balance shows Dr ${inr(row.debit)} / Cr ${inr(row.credit)} ` +
          'but the account is on no side of the balance sheet at all')
        continue
      }
      const expected = row.debit > 0 ? row.debit : row.credit
      if (r2(line.amount - expected) !== 0) {
        mismatches.push(`${row.name}: trial balance ${inr(expected)}, balance sheet ${inr(line.amount)}, ` +
          `out by ${inr(r2(line.amount - expected))}`)
      }
    }
    // …and nothing on the sheet that the trial balance has never heard of.
    for (const line of onSheet.values()) {
      if (!books.trialBalance.some((r) => r.name === line.name)) {
        mismatches.push(`${line.name}: ${inr(line.amount)} on the balance sheet, absent from the trial balance`)
      }
    }
    expect(mismatches, `${view}: the two statements disagree about ${mismatches.length} account(s):\n` +
      mismatches.map((m) => '    ' + m).join('\n')).toEqual([])
  }
})

test('4b. REGRESSION omunim-25000: one voucher, and both statements move by the same ₹25,000', async ({ request }) => {
  // The named fixture for oMunim's signature defect. A ₹25,000 supplier payment out of the drawer:
  // Sundry Creditors falls by 25,000 and Cash in Hand falls by 25,000. On oMunim's books one
  // statement saw it and the other did not, so the two reports were out by exactly ₹25,000 in
  // opposite directions on exactly these two accounts. Here they must move together or not at all.
  const AMOUNT = 25_000
  const before = await readBooks(request, BOOKS_FIRM, ALL_TIME)
  const beforeSheet = balanceSheet(before)
  const sheetAmount = (s: ReturnType<typeof balanceSheet>, name: string) => {
    const a = s.assets.find((l) => l.name === name)
    if (a) return a.amount
    const l = s.liabEquity.find((x) => x.name === name)
    return l ? -l.amount : 0
  }

  const { voucherId } = await post(request, '/api/ledger', {
    firmId: BOOKS_FIRM, type: 'payment', date: fyIso(112),
    narration: 'Settled supplier account — the omunim-25000 regression fixture',
    customerId: BOOKS_CUSTOMER,
    legs: [
      { accountName: 'Sundry Creditors', debit: AMOUNT },
      { accountName: 'Cash in Hand', credit: AMOUNT },
    ],
  }, 'the ₹25,000 supplier payment')
  expect(voucherId).toBeTruthy()

  const after = await readBooks(request, BOOKS_FIRM, ALL_TIME)
  const afterSheet = balanceSheet(after)

  for (const [name, delta] of [['Sundry Creditors', AMOUNT], ['Cash in Hand', -AMOUNT]] as const) {
    const tbMoved = r2(balanceOf(after, name) - balanceOf(before, name))
    const bsMoved = r2(sheetAmount(afterSheet, name) - sheetAmount(beforeSheet, name))
    expect(tbMoved, `TRIAL BALANCE: ${name} moved ${inr(tbMoved)} on a ${inr(AMOUNT)} voucher; ` +
      `expected ${inr(delta)}`).toBe(delta)
    expect(bsMoved, `THE ₹25,000 DEFECT: voucher ${voucherId} moved ${name} by ${inr(tbMoved)} on the ` +
      `trial balance but by ${inr(bsMoved)} on the balance sheet. One statement is seeing a voucher ` +
      'the other is not — this is exactly what oMunim does.').toBe(delta)
  }
  expect(afterSheet.difference, 'and the sheet still balances afterwards').toBe(0)
})

// ═════════════════════════ 5. an invoice agrees with itself ═════════════════════════

test('5. every invoice reconciles with itself — lines, tax block, header total, and the receivable it raises', async ({ request }) => {
  // oMunim's invoice IS21/96 prints TOTAL AMOUNT 5,918.00 in the summary block and 5,917.00 in the
  // HSN block — one truncates 86.175 to 86.17, the other rounds to 86.18 — and raises the
  // receivable for 5,917. The shop chases a figure its own invoice contradicts. Every invoice.
  const res = await request.get(`/api/invoices?firmId=${BOOKS_FIRM}&type=all&status=all`)
  expect(res.status(), await res.text()).toBe(200)
  const invoices = (await res.json()).invoices as any[]
  expect(invoices.length, 'no invoices to reconcile — phase 1 did not run').toBeGreaterThan(0)

  const legs = await db.ledgerEntry.findMany({
    where: { firmId: BOOKS_FIRM, invoiceId: { not: null }, reversalOfId: null },
  })
  const legsFor = (id: string) => legs.filter((l) => l.invoiceId === id)
  const problems: string[] = []
  const note = (inv: any, msg: string) => problems.push(`${inv.invoiceNo} (${inv.type}): ${msg}`)

  for (const inv of invoices) {
    const items = inv.items || []
    const sum = (pick: (i: any) => number) => r2(items.reduce((s: number, i: any) => s + (pick(i) || 0), 0))

    // (a) the line block foots to the header subtotal.
    if (sum((i) => i.amount) !== r2(inv.subtotal)) {
      note(inv, `line items foot to ${inr(sum((i) => i.amount))} but the header subtotal says ${inr(inv.subtotal)}`)
    }

    // (b) the tax block. Each line stores its own taxable value implicitly as total − its taxes;
    //     loose metal (metalAmount) is taxed as one trailing pseudo-line that has no item row, so
    //     the gap between the header and the line block is allowed to be — and must be — exactly
    //     that pseudo-line, never a rounding drift.
    const lineTaxable = r2(items.reduce(
      (s: number, i: any) => s + r2((i.total || 0) - (i.cgst || 0) - (i.sgst || 0) - (i.igst || 0)), 0))
    const taxableValue = r2(inv.subtotal - inv.discount + inv.metalAmount)
    const metalTaxable = r2(taxableValue - lineTaxable)
    if (metalTaxable < -0.005 || metalTaxable > r2(inv.metalAmount) + 0.005) {
      note(inv, `the line block's taxable value is ${inr(lineTaxable)} against a header taxable value of ` +
        `${inr(taxableValue)}. The ${inr(metalTaxable)} gap cannot be the loose-metal line ` +
        `(metalAmount ${inr(inv.metalAmount)}) — it is a rounding drift between two blocks of the ` +
        'same invoice, which is the oMunim two-totals defect.')
    }
    const taxGap = r2(r2(inv.cgst + inv.sgst + inv.igst) - r2(sum((i) => i.cgst) + sum((i) => i.sgst) + sum((i) => i.igst)))
    if (inv.metalAmount === 0 && taxGap !== 0) {
      note(inv, `the HSN/line tax block adds to ${inr(r2(inv.cgst + inv.sgst + inv.igst - taxGap))} but the ` +
        `header tax block says ${inr(r2(inv.cgst + inv.sgst + inv.igst))} — out by ${inr(taxGap)} with no ` +
        'loose metal to explain it')
    }
    if (taxGap < -0.005) note(inv, `the line tax block exceeds the header tax block by ${inr(-taxGap)}`)

    // (c) the header total is the sum of its own parts, and the round-off is exactly the remainder.
    const raw = r2(taxableValue + inv.cgst + inv.sgst + inv.igst + inv.previousAmount - inv.loyaltyRedeemed)
    if (r2(inv.totalAmount) !== Math.round(raw)) {
      note(inv, `header total ${inr(inv.totalAmount)} is not the ${inr(Math.round(raw))} its own parts add to ` +
        `(taxable ${inr(taxableValue)} + tax ${inr(r2(inv.cgst + inv.sgst + inv.igst))} + previous ` +
        `${inr(inv.previousAmount)} − loyalty ${inr(inv.loyaltyRedeemed)} = ${inr(raw)})`)
    }
    if (r2(inv.rofAmount) !== r2(inv.totalAmount - raw)) {
      note(inv, `round-off is printed as ${inr(inv.rofAmount)} but the arithmetic makes it ${inr(r2(inv.totalAmount - raw))}`)
    }

    // (d) the books agree with the paper. This is oMunim's receivable-of-5,917 on an invoice that
    //     says 5,918: the revenue and tax the ledger recognised must be the invoice's own figures.
    const mine = legsFor(inv.id)
    if (mine.length === 0) {
      note(inv, 'has no ledger legs at all — it exists on paper and nowhere in the books')
      continue
    }
    const posted = (name: string, side: 'debit' | 'credit') =>
      r2(mine.filter((l) => l.accountName === name).reduce((s, l) => s + (l[side] || 0), 0) -
         mine.filter((l) => l.accountName === name).reduce((s, l) => s + (l[side === 'debit' ? 'credit' : 'debit'] || 0), 0))
    const isSale = inv.type === 'sale'
    const revenueSide = isSale ? 'credit' : 'debit'
    const revenueAccount = isSale ? 'Sales Revenue' : null
    if (revenueAccount && r2(posted(revenueAccount, revenueSide)) !== taxableValue) {
      note(inv, `the invoice's taxable value is ${inr(taxableValue)} but ${inr(posted(revenueAccount, revenueSide))} ` +
        'reached Sales Revenue')
    }
    for (const [label, amount] of [['CGST', inv.cgst], ['SGST', inv.sgst], ['IGST', inv.igst]] as const) {
      if (!amount) continue
      const account = isSale ? `${label} Payable` : `${label} Input Receivable`
      if (r2(posted(account, revenueSide)) !== r2(amount)) {
        note(inv, `the invoice charges ${inr(amount)} of ${label} but ${inr(posted(account, revenueSide))} reached ${account}`)
      }
    }
  }

  expect(problems, `${problems.length} invoice(s) contradict themselves:\n` +
    problems.map((p) => '    ' + p).join('\n')).toEqual([])
})

// ═════════════════════════ 6. the right statement ═════════════════════════

test('6. no account appears on the wrong statement', async ({ request }) => {
  // oMunim's balance sheet carries MAKING CHARGES — an income account — under liabilities.
  const books = await readBooks(request, BOOKS_FIRM, ALL_TIME)
  const wrong: string[] = []

  for (const row of books.trialBalance) {
    const expected = expectedTypeOf(row.name)
    if (!expected) {
      wrong.push(`${row.name} (code ${row.code}) is posted to but is on no chart of accounts this gate ` +
        'recognises, so nothing has decided which statement it belongs on. Classify it in ' +
        'src/lib/accounting.ts CHART_OF_ACCOUNTS and add it to EXPECTED_TYPE in tests/books/books.ts.')
    } else if (row.type !== expected) {
      wrong.push(`${row.name} is classified '${row.type}' and therefore appears on the ` +
        `${row.type === 'income' || row.type === 'expense' ? 'PROFIT & LOSS' : 'BALANCE SHEET'}; ` +
        `it is a '${expected}' account and belongs on the ` +
        `${expected === 'income' || expected === 'expense' ? 'PROFIT & LOSS' : 'BALANCE SHEET'}. ` +
        `Balance: ${inr(r2(row.debit - row.credit))}`)
    }
  }
  expect(wrong, `${wrong.length} account(s) are on the wrong statement:\n` +
    wrong.map((w) => '    ' + w).join('\n')).toEqual([])

  // Belt and braces: the two statements must not both be showing the same account.
  const sheet = balanceSheet(books)
  const trading = tradingAccount(books)
  const overlap = [...sheet.assets, ...sheet.liabEquity]
    .map((l) => l.name)
    .filter((n) => trading.placed.some((p) => p.name === n))
  expect(overlap, `these accounts appear on BOTH the balance sheet and the P&L: ${overlap.join(', ')}`).toEqual([])
})

// ═════════════════════════ 7. signs ═════════════════════════

test('7. no negative asset or liability passes silently — the sign is right or the account is reclassified', async ({ request }) => {
  // oMunim's sheet shows SECURED LOANS −254,221.00 under liabilities, CASH IN HAND −854,641.55
  // under assets, and negative stock. A negative on a balance sheet is either a wrong sign or a
  // misclassification; it is never a presentation choice.
  for (const [view, books] of await bothViews(request)) {
    const sheet = balanceSheet(books)

    const negatives = [...sheet.assets, ...sheet.liabEquity].filter((l) => l.amount < 0)
    expect(negatives.map((l) => `${l.name} ${inr(l.amount)}`),
      `${view}: a balance sheet line is printed NEGATIVE. Post the opposite side or reclassify the ` +
      'account; never print a minus sign on a statement.\n' + renderBalanceSheet(sheet)).toEqual([])

    // A trial-balance row must sit on exactly one side; both at once means the netting is broken.
    const twoSided = books.trialBalance.filter((r) => r.debit > 0 && r.credit > 0)
    expect(twoSided.map((r) => r.name),
      `${view}: account(s) carrying a debit AND a credit closing balance at once`).toEqual([])

    // The reclassification rule, asserted rather than assumed: an account sitting on its unnatural
    // side must be on the OPPOSITE statement side, and the gate says which and why.
    for (const line of sheet.assets) {
      if (!line.reclassified) continue
      expect(['liability', 'equity'], `${view}: ${line.name} (${line.type}) carries a DEBIT balance of ` +
        `${inr(line.amount)} and is shown under ASSETS as an advance paid — correct only for a ` +
        'liability or equity account').toContain(line.type)
    }
    for (const line of sheet.liabEquity) {
      if (!line.reclassified) continue
      expect(line.type, `${view}: ${line.name} carries a CREDIT balance of ${inr(line.amount)} and is shown ` +
        'under LIABILITIES as an overdraft — correct only for an asset account').toBe('asset')
    }

    // An overdrawn cash/bank account is a real overdraft and is correctly an overdraft. Overdrawn
    // INVENTORY is not: you cannot hold minus ten grams of gold. If a stock account is credit-side,
    // stock left the shop that was never brought onto the books.
    const stock = ['Gold Stock', 'Silver Stock', 'Other Stock']
      .map((name) => ({ name, balance: balanceOf(books, name) }))
      .filter((s) => s.balance < 0)
    expect(stock.map((s) => `${s.name} ${inr(s.balance)}`),
      `${view}: a metal stock account has a CREDIT balance — the shop has sold inventory that was ` +
      'never capitalised. Every item that leaves must have been brought in through a posting path.').toEqual([])
  }
})

// ═════════════════════════ the thing the gate exists to catch ═════════════════════════

/**
 * Not one of the seven. The seven prove the statements are internally consistent; these two prove
 * they are COMPLETE. A module that moves money without posting a voucher leaves books that tie
 * perfectly and are still wrong — and it is the failure mode the brief names: "it will rot silently
 * the first time someone adds a posting path that skips postVoucher".
 *
 * Each is deliberately a separate test so a red one names the module, not "the books".
 */
test('stock taken into the shop is capitalised: POST /api/stock must reach the books', async ({ request }) => {
  const COST = 77_777
  const before = balanceOf(await readBooks(request, BOOKS_FIRM, ALL_TIME), 'Gold Stock')

  const { item } = await post(request, '/api/stock', {
    firmId: BOOKS_FIRM, name: 'Books Gate Direct Intake Bangle', category: 'fine', metalType: 'gold',
    purity: '22K', purityPercent: 91.6, hsnCode: '7113', grossWeight: 12, netWeight: 12,
    qty: 1, costPrice: COST, mrp: COST * 1.2, status: 'available',
  }, 'direct stock intake')
  expect(item.costPrice).toBe(COST)

  const after = balanceOf(await readBooks(request, BOOKS_FIRM, ALL_TIME), 'Gold Stock')
  expect(r2(after - before),
    `A stock item worth ${inr(COST)} was added through POST /api/stock and the Gold Stock asset moved ` +
    `${inr(r2(after - before))}. Inventory is PERPETUAL here (src/lib/accounting.ts METAL_STOCK): a sale ` +
    'credits Gold Stock and debits COGS at this cost basis, so stock that arrives without a matching ' +
    'debit understates inventory and overstates cost of goods sold the moment it is sold. The handler ' +
    '(src/app/api/stock/route.ts POST) writes a StockItem and a SystemLog and never calls postVoucher.')
    .toBe(COST)
})

test('money lent on udhaar leaves the drawer: POST /api/udhaar must reach the books', async ({ request }) => {
  const AMOUNT = 33_333
  const before = balanceOf(await readBooks(request, BOOKS_FIRM, ALL_TIME), 'Cash in Hand')

  await post(request, '/api/udhaar', {
    firmId: BOOKS_FIRM, customerId: BOOKS_CUSTOMER, customerName: BOOKS_CUSTOMER_NAME,
    type: 'credit', transactionType: 'cash', amount: AMOUNT,
    description: 'Books gate — cash lent on udhaar', status: 'active',
  }, 'udhaar given out')

  const after = balanceOf(await readBooks(request, BOOKS_FIRM, ALL_TIME), 'Cash in Hand')
  expect(r2(before - after),
    `${inr(AMOUNT)} of cash was lent out through POST /api/udhaar and Cash in Hand moved ` +
    `${inr(r2(before - after))}. The whole udhaar module (src/app/api/udhaar/route.ts) writes an Udhaar ` +
    'row and a SystemLog and never calls postVoucher, so the cash book, the debtors balance and the ' +
    'balance sheet are all blind to every rupee this shop lends informally.')
    .toBe(AMOUNT)
})

// ═════════════════════════ 8. a party's own statement ═════════════════════════

/**
 * THE CUSTOMER STATEMENT — the figure a shopkeeper reads out loud to the person standing at the
 * counter. It comes from The Books (GET /api/customers/[id] → `statement`) and from exactly one
 * other thing: `Customer.openingBalance`, a DECLARED seed that is never posted to the ledger.
 *
 *     statement = opening (declared, unposted) + Σ(party-control legs, from The Books)
 *
 * It is NOT a fourth way of adding money up. There is no sum over invoices or payments here: the
 * legs are the ones postVoucher() wrote, so the statement cannot disagree with the trial balance
 * above it. What these tests prove is that it cannot disagree with the two ENGINES either —
 * deriveLoan() for girvi principal and udhaarBreakdown() for the informal ledger — because those
 * are the figures the same screen prints beside it.
 *
 * A FULLY-PAID CASH SALE RAISES NO ROW HERE, and that is correct: Dr Cash / Cr Sales + GST creates
 * no receivable (pinned by tests/api/invoices.spec.ts:65). This is the party's ACCOUNT, like a Tally
 * party ledger — only what moved what he owes. Every bill, paid or not, is in the SELL tab.
 */
type StatementRow = {
  id: string
  date: string
  voucherId: string | null
  invoiceId: string | null
  loanId: string | null
  accountName: string
  type: string
  particulars: string | null
  debit: number
  credit: number
  balance: number
}
type Statement = {
  rows: StatementRow[]
  opening: number
  closing: number
  closingType: 'debit' | 'credit'
  totalDebit: number
  totalCredit: number
  truncated: boolean
}
type Panel = {
  customer: { openingBalance: number; balanceType: string }
  loans: { loanNo: string; status: string; derived: { outstandingPrincipal: number } }[]
  statement: Statement
  totals: { udhaarNet: number; activeLoanPrincipal: number }
}

async function panel(request: APIRequestContext, customerId = BOOKS_CUSTOMER, firmId = BOOKS_FIRM): Promise<Panel> {
  const res = await request.get(`/api/customers/${customerId}?firmId=${firmId}`)
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()) as Panel
}

/** Dr-positive movement on one party control account, read off the statement the screen is given. */
function movement(st: Statement, accountName: string, keep: (r: StatementRow) => boolean = () => true): number {
  return r2(st.rows
    .filter((row) => row.accountName === accountName && keep(row))
    .reduce((s, row) => s + row.debit - row.credit, 0))
}

/** Rendered the way the panel renders it, so a failure message is readable. */
function renderStatement(st: Statement): string {
  return [`    opening ${inr(st.opening)}`]
    .concat(st.rows.map((r) =>
      `    ${String(r.date).slice(0, 10)}  ${r.accountName.padEnd(20)} ${r.type.padEnd(9)} ` +
      `Dr ${inr(r.debit).padStart(14)}  Cr ${inr(r.credit).padStart(14)}  = ${inr(r.balance)}`))
    .concat([`    closing ${inr(st.closing)} ${st.closingType === 'credit' ? 'Cr' : 'Dr'}`])
    .join('\n')
}

test('8. THE TRAP: a girvi borrower’s statement must not read ZERO', async ({ request }) => {
  // postVoucher stamps input.customerId onto EVERY leg of a voucher (src/lib/ledger.ts:157), not
  // just the party leg: a girvi disbursal posts Dr Loans Given / Cr Cash in Hand / Cr Loan Processing
  // Fee and all three legs carry the borrower's id. A voucher is proven balanced before it is written
  // (test 1 above), so for any FULLY tagged voucher `SUM(debit) − SUM(credit) WHERE customerId = X` is
  // ZERO BY CONSTRUCTION. Anyone who writes the obvious query gets a figure built out of the shop's
  // own cash, revenue, stock and GST legs — and believes it.
  //
  // Both halves are asserted: the construction fact per voucher, and then that the statement does not
  // fall into it. The naive TOTAL is not asserted to be zero, because it is not: the firm's posting
  // paths tag vouchers to varying depths, so the number it produces is arbitrary rather than nil —
  // which is worse, since nil at least looks wrong.
  const mine = await db.ledgerEntry.findMany({
    where: { firmId: BOOKS_FIRM, customerId: BOOKS_CUSTOMER, voucherId: { not: null } },
    select: { voucherId: true },
  })
  const voucherIds = [...new Set(mine.map((r) => r.voucherId as string))]
  const allLegs = await db.ledgerEntry.findMany({
    where: { firmId: BOOKS_FIRM, voucherId: { in: voucherIds } },
    select: { voucherId: true, customerId: true, accountName: true, debit: true, credit: true },
  })
  const byVoucher = new Map<string, typeof allLegs>()
  for (const l of allLegs) {
    const k = l.voucherId as string
    byVoucher.set(k, (byVoucher.get(k) || []).concat(l))
  }
  const fullyTagged = [...byVoucher.entries()]
    .map(([voucherId, legs]) => ({ voucherId, legs, mine: legs.filter((l) => l.customerId === BOOKS_CUSTOMER) }))
    .filter((v) => v.mine.length === v.legs.length && v.legs.length > 1)
  expect(fullyTagged.length, 'no voucher on the audited party has every leg tagged with his id, so the ' +
    'trap this test exists for cannot be demonstrated here').toBeGreaterThan(0)
  const notNil = fullyTagged
    .map((v) => ({ ...v, net: r2(v.mine.reduce((s, l) => s + l.debit - l.credit, 0)) }))
    .filter((v) => v.net !== 0)
  expect(notNil.map((v) => `${v.voucherId} nets ${inr(v.net)} over ${v.legs.length} tagged legs`),
    `${notNil.length} fully tagged voucher(s) do NOT net to zero over customerId alone. If this is ` +
    'non-empty, test 1 above is also red (a voucher that does not balance), not this one.').toEqual([])

  // At least one of them is a girvi disbursal — the exact worked example in the chart-of-accounts note.
  const disbursals = fullyTagged.filter((v) => v.legs.some((l) => l.accountName === 'Loans Given' && l.debit > 0))
  expect(disbursals.length, 'the audited party has no fully tagged girvi disbursal').toBeGreaterThan(0)

  const naiveTotal = r2(allLegs.filter((l) => l.customerId === BOOKS_CUSTOMER)
    .reduce((s, l) => s + l.debit - l.credit, 0))

  const p = await panel(request)
  expect(p.loans.length, 'no loans on the audited party — 01-postings.spec.ts did not run, so this ' +
    'test is vacuous').toBeGreaterThan(0)
  expect(p.statement.closing,
    `${BOOKS_CUSTOMER_NAME} has ${p.loans.length} girvi loan(s) on these books and his statement ` +
    `reads ${inr(p.statement.closing)}. A zero here is the signature of the naive customerId query: ` +
    'the filter must be customerId AND accountName IN PARTY_CONTROL_ACCOUNTS.\n' + renderStatement(p.statement))
    .not.toBe(0)
  expect(movement(p.statement, 'Loans Given'),
    'and the girvi principal specifically must be on it').not.toBe(0)
  // The whole point, in one line: the obvious query and the right one are different numbers, and on
  // this fixture they are different SIGNS.
  expect(p.statement.closing, `the statement (${inr(p.statement.closing)}) has come out equal to the ` +
    `naive customerId sum (${inr(naiveTotal)}). Either the account filter has been dropped, or the ` +
    'fixture no longer posts a shop-side leg against this party and the test has stopped proving anything.')
    .not.toBe(naiveTotal)
})

test('8a. RECONCILES WITH THE LOAN ENGINE: Loans Given movement == Σ deriveLoan().outstandingPrincipal', async ({ request }) => {
  // The ledger credits Loans Given by `principalComponent` on a payment (loans/[id]/payments:136),
  // by the whole outstanding principal on an auction (loans/[id]/auction:157), and debits it on a
  // disbursal and a top-up. deriveLoan() subtracts the same figures off the same transactions. So
  // the asset still on the books for this party IS what the engine says he still owes in principal —
  // or one of the two is wrong, and a shop that bills the difference is chasing money twice.
  const p = await panel(request)
  expect(p.loans.length, 'the loan list is capped at 100; the identity would be vacuous past that')
    .toBeLessThan(100)

  // Legs dated after the instant the handler derived at are deliberately excluded: deriveLoan()
  // replays `asOf` = now and cannot see a future-dated transaction, while the leg is already
  // written. Both sides are therefore read as at the same moment.
  const now = Date.now()
  const onBooks = movement(p.statement, 'Loans Given', (r) => new Date(r.date).getTime() <= now)
  const engine = r2(p.loans.reduce((s, l) => s + l.derived.outstandingPrincipal, 0))

  expect(onBooks, `LOANS GIVEN DISAGREES WITH THE LOAN ENGINE for ${BOOKS_CUSTOMER_NAME}: the books ` +
    `carry ${inr(onBooks)} of girvi principal against him, src/lib/interest.ts derives ${inr(engine)} ` +
    `across ${p.loans.length} loan(s) — out by ${inr(r2(onBooks - engine))}.\n` +
    p.loans.map((l) => `    ${l.loanNo.padEnd(14)} ${l.status.padEnd(10)} outstanding ${inr(l.derived.outstandingPrincipal)}`).join('\n') +
    '\n' + renderStatement(p.statement)).toBeCloseTo(engine, 2)

  // A released or auctioned pledge leaves the asset entirely — the defect that kept a "Loans Given"
  // debit on the books for ever (src/app/api/loans/[id]/auction/route.ts:16).
  for (const l of p.loans.filter((x) => x.status !== 'active')) {
    expect(l.derived.outstandingPrincipal,
      `${l.loanNo} is ${l.status} but still carries ${inr(l.derived.outstandingPrincipal)} of principal`).toBe(0)
  }
  // And the panel's own headline figure is the same engine, not a second sum of principalAmount.
  expect(p.totals.activeLoanPrincipal,
    'totals.activeLoanPrincipal must be the active subset of the very figures above').toBeCloseTo(
    r2(p.loans.filter((l) => l.status === 'active').reduce((s, l) => s + l.derived.outstandingPrincipal, 0)), 2)
})

test('8b. RECONCILES WITH THE UDHAAR MODULE: Sundry Debtors movement from udhaar legs == udhaarBreakdown().net', async ({ request }) => {
  // The identity src/app/api/udhaar/route.ts:40 declares in prose and tests/api/udhaar-interest.spec.ts
  // asserts firm-wide through the dashboard. Here it is asserted PER PARTY, off the statement the
  // counter actually reads: creation posts Dr/Cr Sundry Debtors, settlement posts the mirror sized
  // to the increase, a payment credits it by principalComponent only, and a bounced cheque puts the
  // whole debt back. Every one of those legs carries type 'udhaar', which is what separates the
  // informal ledger's share of Sundry Debtors from a credit sale's.
  const p = await panel(request)
  const fromUdhaar = movement(p.statement, 'Sundry Debtors', (r) => r.type === 'udhaar')

  /**
   * ── ONE DECLARED BRIDGING TERM, and it is a DEFECT, not a reconciling item ──────────────────────
   *
   * A BOUNCED CHEQUE is reversed in the books and NOT in the udhaar module.
   * `/api/bank/transactions/[id]` action=bounce calls reverseVoucher() and then updates only the
   * BankTransaction row (src/app/api/bank/transactions/[id]/route.ts:138-144). The Udhaar row that
   * cheque was recorded against is never touched. So the books correctly say the party owes the money
   * again, while udhaarBreakdown() — which drives the dashboard, the udhaar screen AND
   * totals.udhaarNet on this very panel — still counts it as repaid.
   *
   * Measured on this fixture: the books say the udhaar position is ₹26,667.00 Cr, the module says
   * ₹41,667.00 Cr, and the gap is exactly the ₹15,000 cheque 551202 that 01-postings.spec.ts bounces.
   * The module understates the shop's informal receivable by every bounced cheque.
   *
   * It is bridged rather than ignored so the identity still holds for every OTHER cause — a deletion,
   * a settlement, an interest split — and so the number is named. Owner: be-lending (the Udhaar row's
   * lifecycle) with the bank route. Whether a bounce should reverse the Udhaar row, flag it, or raise
   * a fresh row is a business decision, not this test's. If this term ever comes out 0, the defect was
   * fixed: delete the bridge and this comment with it.
   */
  const bounced = await db.bankTransaction.findMany({
    where: { firmId: BOOKS_FIRM, status: 'bounced' },
    select: { chequeNumber: true, amount: true, reversalVoucherId: true },
  })
  const bounceVouchers = new Set(bounced.map((b) => b.reversalVoucherId).filter(Boolean) as string[])
  const unseenByModule = movement(p.statement, 'Sundry Debtors',
    (r) => r.type === 'udhaar' && !!r.voucherId && bounceVouchers.has(r.voucherId))

  expect(r2(fromUdhaar - unseenByModule),
    `THE UDHAAR MODULE AND THE BOOKS DISAGREE for ${BOOKS_CUSTOMER_NAME}: the udhaar legs on Sundry ` +
    `Debtors net to ${inr(fromUdhaar)}, of which ${inr(unseenByModule)} is bounced-cheque reversal the ` +
    `module is known not to see, leaving ${inr(r2(fromUdhaar - unseenByModule))} against the ` +
    `${inr(p.totals.udhaarNet)} net receivable udhaarBreakdown() reports — out by ` +
    `${inr(r2(fromUdhaar - unseenByModule - p.totals.udhaarNet))}. Either a posting path moved money ` +
    'without a voucher, or a voucher moved money the module does not count. Metal udhaar (grams) and ' +
    'type=advance are deliberately in NEITHER figure.\n' + renderStatement(p.statement))
    .toBeCloseTo(p.totals.udhaarNet, 2)

  expect(p.statement.rows.some((r) => r.type === 'udhaar'),
    'no udhaar legs on the audited party, so this identity is vacuous').toBe(true)
})

test('8c. the statement adds up: closing == opening + Σdebit − Σcredit, leg by leg', async ({ request }) => {
  const p = await panel(request)
  const st = p.statement

  // The declared seed is the customer's own column, signed — NOT something re-derived. It is never
  // posted to the ledger (grep src/app/api and src/lib: only Account.openingBalance is), which is
  // exactly why the statement takes it as a parameter instead of summing for it.
  expect(st.opening, 'the opening is Customer.openingBalance signed by Customer.balanceType, nothing else')
    .toBe(r2((p.customer.balanceType === 'credit' ? -1 : 1) * (p.customer.openingBalance || 0)))

  expect(st.truncated, 'the statement hit its leg cap, so its opening balance is a lie — ' +
    'page it or aggregate an opening in SQL (see STATEMENT_CAP in the handler)').toBe(false)

  // Every row's running balance is the TRUE cumulative, not a figure computed independently of the
  // column above it. This is the oMunim defect in miniature: a statement whose rows and whose total
  // are two different calculations.
  let running = st.opening
  const drift: string[] = []
  for (const row of st.rows) {
    running = r2(running + row.debit - row.credit)
    if (row.balance !== running) {
      drift.push(`${String(row.date).slice(0, 10)} ${row.accountName}: row says ${inr(row.balance)}, ` +
        `the column says ${inr(running)}`)
    }
  }
  expect(drift, `${drift.length} row(s) carry a running balance that is not the cumulative of the ` +
    'rows above them:\n' + drift.map((d) => '    ' + d).join('\n')).toEqual([])

  expect(st.closing, 'the closing is the last row’s balance\n' + renderStatement(st)).toBe(running)
  expect(st.closing, 'and it is the opening plus the two column totals\n' + renderStatement(st))
    .toBe(r2(st.opening + st.totalDebit - st.totalCredit))
  expect(st.totalDebit).toBe(r2(st.rows.reduce((s, r) => s + r.debit, 0)))
  expect(st.totalCredit).toBe(r2(st.rows.reduce((s, r) => s + r.credit, 0)))
  // Dr-positive: a positive closing means he owes the shop. One sign convention, not a third one.
  expect(st.closingType).toBe(st.closing < 0 ? 'credit' : 'debit')
})

test('8d. only a PARTY account reaches the statement — and a saver is never reported as a creditor', async ({ request }) => {
  const p = await panel(request)
  const names = [...new Set(p.statement.rows.map((r) => r.accountName))]

  // The shop's own side of the event — cash, revenue, stock, GST, the processing fee — carries the
  // customer's id too and must never move what he owes.
  const strays = names.filter((n) => !(PARTY_CONTROL_ACCOUNTS as readonly string[]).includes(n))
  expect(strays, `${strays.length} account(s) on the statement are not a party control account: ` +
    `${strays.join(', ')}. The shop's own legs are not the party's balance.`).toEqual([])

  // A savings-scheme deposit IS money the shop owes him — and folding it in here would report a
  // saver as a creditor and net his savings off a bill he owes. Disclosed separately, by decision.
  const schemeAccounts = ['Scheme Deposits', 'Gold Scheme Deposits', 'Silver Scheme Deposits']
  expect(names.filter((n) => schemeAccounts.includes(n)),
    'a scheme deposit must stay OFF the party statement (src/lib/accounting.ts PARTY_CONTROL_ACCOUNTS)')
    .toEqual([])
  const schemeLegs = await db.ledgerEntry.count({
    where: { firmId: BOOKS_FIRM, customerId: BOOKS_CUSTOMER, accountName: { in: schemeAccounts } },
  })
  expect(schemeLegs, 'no scheme deposit legs on the audited party, so the exclusion is untested here')
    .toBeGreaterThan(0)
})

test('8e. one firm’s customer statement is not reachable from another firm', async ({ request }) => {
  // The outsider is a member of firm MAD only (tests/auth.ts STATE.outsider).
  const otherFirm = await request.get(`/api/customers/${BOOKS_CUSTOMER}?firmId=${FIX.firmJBS.id}`)
  expect(otherFirm.status(), 'asking for a statement under a firm this session does not belong to ' +
    `must be refused, not served: ${await otherFirm.text()}`).toBe(403)

  // The sharper one: a firm this session DOES own, and another firm's customer id. The session check
  // passes here — only the row-level firmId check stands between the caller and the other tenant's
  // books (src/app/api/customers/[id]/route.ts:22).
  const otherCustomer = await request.get(`/api/customers/${FIX.pooja.id}?firmId=${BOOKS_FIRM}`)
  expect(otherCustomer.status(), 'another tenant’s customer must not be readable by passing a firmId ' +
    `the caller does own: ${await otherCustomer.text()}`).toBe(403)

  const noFirm = await request.get(`/api/customers/${BOOKS_CUSTOMER}`)
  expect(noFirm.status(), 'and firmId is not optional').toBe(400)
})
