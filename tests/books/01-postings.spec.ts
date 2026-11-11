import { test, expect, type APIRequestContext } from '@playwright/test'
import { STATE } from '../auth'
import { computeInvoiceTotals } from '../../src/lib/gst'
import {
  BOOKS_CUSTOMER, BOOKS_CUSTOMER_NAME, BOOKS_FIRM, ALL_TIME,
  fyIso, inr, patch, post, r2, readBooks, balanceOf,
} from './books'
import { FIX } from '../seed'

/** The other tenant. Used only to prove the deny path on the bank endpoints this gate now drives. */
const FOREIGN_FIRM = FIX.firmJBS.id

/**
 * PHASE 1 of the books gate: drive EVERY sanctioned posting path once, into a firm nothing else
 * writes to, so phase 2 (02-reconciliation.spec.ts) has a full set of books to audit.
 *
 * Nothing here asserts a statement — these tests assert only that the event was accepted and that
 * its own voucher balances. The statement-level invariants are all in phase 2, deliberately: a
 * defect that only shows when two events interact must not be maskable by an early exit.
 *
 * Run order matters (02 audits what 01 posted) and is by filename, under `workers: 1`.
 * `describe.serial` stops the chain on first failure — after a refused loan disbursal there is no
 * loan to release, and twelve cascading failures hide the one that mattered.
 *
 * Owners: qa-lead (this gate), be-accounting (ledger + statements), qa-finance (every figure).
 */

test.use({ storageState: STATE.outsider })

/**
 * Everything the gate creates, so phase 2 can address it by id rather than by guessing at names.
 * Module state in one Playwright worker; phase 2 never reads it — it re-reads the books from the
 * API instead, which is the whole point. This is only for cross-test wiring inside this file.
 */
const made = {
  invoices: [] as { id: string; invoiceNo: string }[],
  loans: {} as Record<string, string>,
  schemeEntries: {} as Record<string, string>,
}

const inv = (id: string, invoiceNo: string) => { made.invoices.push({ id, invoiceNo }); return id }

/** One voucher's legs, straight from the ledger the accountant reads. */
async function legsOf(request: APIRequestContext, voucherId: string) {
  const { entries } = await readBooks(request, BOOKS_FIRM, ALL_TIME)
  return entries.filter((e) => e.voucherId === voucherId)
}

/** Every event must leave a self-balancing voucher. Asserted here AND again in bulk in phase 2. */
async function expectVoucherBalances(request: APIRequestContext, voucherId: string, what: string) {
  const legs = await legsOf(request, voucherId)
  expect(legs.length, `${what}: voucher ${voucherId} has no legs in the ledger`).toBeGreaterThanOrEqual(2)
  const dr = r2(legs.reduce((s, l) => s + (l.debit || 0), 0))
  const cr = r2(legs.reduce((s, l) => s + (l.credit || 0), 0))
  expect(dr, `${what}: voucher ${voucherId} is out by ${inr(r2(dr - cr))}\n` +
    legs.map((l) => `    ${l.accountName.padEnd(30)} Dr ${inr(l.debit || 0)}  Cr ${inr(l.credit || 0)}`).join('\n'))
    .toBe(cr)
  return legs
}

const goldLine = (name: string, amount: number, over: Record<string, unknown> = {}) => ({
  name, category: 'fine', metalType: 'gold', purity: '22K', hsnCode: '7113',
  grossWeight: 10, netWeight: 10, makingCharge: 0, rate: amount, amount, qty: 1, ...over,
})

test.describe.serial('every posting path', () => {
  // ───────────────────────── opening capital ─────────────────────────

  test('opening: capital introduced into the business', async ({ request }) => {
    const body = await post(request, '/api/ledger', {
      firmId: BOOKS_FIRM,
      type: 'opening',
      date: fyIso(0),
      narration: 'Opening capital',
      legs: [
        { accountName: 'Cash in Hand', debit: 2_000_000 },
        { accountName: 'Capital Account', credit: 2_000_000 },
      ],
    }, 'opening capital voucher')
    await expectVoucherBalances(request, body.voucherId, 'opening capital')
  })

  // ───────────────────────── stock in: purchase and URD ─────────────────────────

  test('purchase invoice: stock capitalised, input GST claimed, part on credit', async ({ request }) => {
    const { invoice } = await post(request, '/api/invoices', {
      firmId: BOOKS_FIRM, type: 'purchase',
      customerId: BOOKS_CUSTOMER, customerName: BOOKS_CUSTOMER_NAME,
      invoiceDate: fyIso(5),
      gstType: 'intra', gstTypeOverride: true,
      discount: 0, metalAmount: 0,
      amountByCash: 100_000, paymentMode: 'cash', status: 'completed',
      items: [goldLine('Gold Bar 100g', 100_000), goldLine('Gold Coin 60g', 60_000)],
    }, 'purchase invoice')
    inv(invoice.id, invoice.invoiceNo)

    // 160,000 taxable + 1.5% + 1.5% = 164,800; 100,000 paid, 64,800 stays with the supplier.
    expect(invoice.subtotal).toBe(160_000)
    expect(invoice.cgst).toBe(2_400)
    expect(invoice.sgst).toBe(2_400)
    expect(invoice.totalAmount).toBe(164_800)

    const legs = await legsOf(request, (await firstVoucherFor(request, invoice.id)))
    const stock = legs.filter((l) => l.accountName === 'Gold Stock')
    expect(r2(stock.reduce((s, l) => s + l.debit, 0)),
      'a purchase must capitalise its whole taxable value into the metal stock asset — ' +
      'anything less and the stock account carries a residue that never clears').toBe(160_000)
  })

  test('URD purchase: outside GST, still capitalised', async ({ request }) => {
    const { invoice } = await post(request, '/api/invoices', {
      firmId: BOOKS_FIRM, type: 'urd',
      customerId: BOOKS_CUSTOMER, customerName: BOOKS_CUSTOMER_NAME,
      invoiceDate: fyIso(8),
      amountByCash: 40_000, paymentMode: 'cash', status: 'completed',
      items: [goldLine('Old Gold Lot URD', 40_000)],
    }, 'URD purchase')
    inv(invoice.id, invoice.invoiceNo)
    expect(invoice.cgst, 'URD is an unregistered supply: no GST on either side').toBe(0)
    expect(invoice.sgst).toBe(0)
    expect(invoice.igst).toBe(0)
    expect(invoice.totalAmount).toBe(40_000)
  })

  // ───────────────────────── stock out: sales ─────────────────────────

  test('sale against stock: revenue, output GST and COGS in one voucher', async ({ request }) => {
    const item = await availableStock(request)
    const { invoice } = await post(request, '/api/invoices', {
      firmId: BOOKS_FIRM, type: 'sale',
      customerId: BOOKS_CUSTOMER, customerName: BOOKS_CUSTOMER_NAME,
      invoiceDate: fyIso(12),
      gstType: 'intra', gstTypeOverride: true,
      amountByCash: 123_600, paymentMode: 'cash', status: 'completed',
      items: [{ ...goldLine(item.name, 120_000), stockItemId: item.id, itemCode: item.itemCode }],
    }, 'cash sale against stock')
    inv(invoice.id, invoice.invoiceNo)

    const vid = await firstVoucherFor(request, invoice.id)
    const legs = await expectVoucherBalances(request, vid, 'cash sale')
    const cogs = legs.find((l) => l.accountName === 'Cost of Goods Sold - Gold')
    expect(cogs, 'a sale of a costed stock item must relieve inventory at its cost basis').toBeTruthy()
    expect(cogs!.debit).toBeCloseTo(item.costPrice, 2)
  })

  test('invoice delete: the money is un-posted by a mirrored reversing voucher', async ({ request }) => {
    const ACCOUNTS = ['Sales Revenue', 'CGST Payable', 'SGST Payable', 'Cash in Hand', 'Gold Stock']
    const before = await readBooks(request, BOOKS_FIRM, ALL_TIME)

    const { invoice } = await post(request, '/api/invoices', {
      firmId: BOOKS_FIRM, type: 'sale',
      customerId: BOOKS_CUSTOMER, customerName: BOOKS_CUSTOMER_NAME,
      invoiceDate: fyIso(18),
      gstType: 'intra', gstTypeOverride: true,
      amountByCash: 20_600, paymentMode: 'cash', status: 'completed',
      items: [goldLine('Cancelled Bangle', 20_000)],
    }, 'sale to be deleted')

    const posted = await readBooks(request, BOOKS_FIRM, ALL_TIME)
    expect(balanceOf(posted, 'Sales Revenue'),
      'the sale must actually reach the books before its deletion proves anything')
      .toBeCloseTo(r2(balanceOf(before, 'Sales Revenue') - 20_000), 2)

    const del = await request.delete(`/api/invoices?id=${invoice.id}`)
    expect(del.status(), await del.text()).toBe(200)
    expect((await del.json()).reversals, 'DELETE must report the reversing voucher it posted').toHaveLength(1)

    // A reversal is a new mirrored voucher, not an edit — so every account returns to the figure it
    // stood at before the invoice existed. oMunim's equivalent leaves the legs posted for ever and
    // the GST report then disagrees with the P&L about the same invoice.
    const after = await readBooks(request, BOOKS_FIRM, ALL_TIME)
    for (const account of ACCOUNTS) {
      expect(balanceOf(after, account),
        `deleting the invoice must return ${account} to ${inr(balanceOf(before, account))} ` +
        `(it stood at ${inr(balanceOf(posted, account))} while the invoice was live, ` +
        `and is ${inr(balanceOf(after, account))} now)`)
        .toBeCloseTo(balanceOf(before, account), 2)
    }
  })

  // ───────────────────────── expenses ─────────────────────────

  test('expense: paid out of the drawer, and a deleted one is reversed', async ({ request }) => {
    const kept = await post(request, '/api/expenses', {
      firmId: BOOKS_FIRM, category: 'rent', amount: 15_000,
      paymentMode: 'cash', description: 'Shop rent', expenseDate: fyIso(20),
    }, 'rent expense')
    await expectVoucherBalances(request, kept.voucherId, 'rent expense')

    const doomed = await post(request, '/api/expenses', {
      firmId: BOOKS_FIRM, category: 'marketing', amount: 5_000,
      paymentMode: 'bank', description: 'Cancelled hoarding', expenseDate: fyIso(21),
    }, 'marketing expense')
    const before = balanceOf(await readBooks(request, BOOKS_FIRM, ALL_TIME), 'Marketing Expense')

    const del = await request.delete(`/api/expenses?id=${doomed.expense.id}`)
    expect(del.status(), await del.text()).toBe(200)
    expect((await del.json()).reversalVoucherId, 'a deleted expense must name its reversal').toBeTruthy()

    const after = balanceOf(await readBooks(request, BOOKS_FIRM, ALL_TIME), 'Marketing Expense')
    expect(after, `deleting the ₹5,000 marketing expense must take Marketing Expense from ` +
      `${inr(before)} back to ${inr(r2(before - 5_000))}, not leave it at ${inr(after)}`)
      .toBeCloseTo(r2(before - 5_000), 2)
  })

  // ───────────────────────── gold loan (girvi) ─────────────────────────

  test('loan disbursal x4: cash out of the drawer, an asset on the books', async ({ request }) => {
    const loans: [string, number][] = [['topup', 100_000], ['release', 50_000], ['surplus', 60_000], ['shortfall', 40_000]]
    for (const [key, principal] of loans) {
      const { loan } = await post(request, '/api/loans', {
        firmId: BOOKS_FIRM,
        loanNo: `BK-${key}`,
        customerId: BOOKS_CUSTOMER, customerName: BOOKS_CUSTOMER_NAME,
        principalAmount: principal, interestRate: 2, interestType: 'monthly',
        loanDate: fyIso(25), timePeriod: 12,
        items: [{ name: 'Pledged chain', purity: '22K', grossWeight: 30, netWeight: 29, estimatedValue: principal * 1.6 }],
      }, `loan disbursal ${key}`)
      made.loans[key] = loan.id
    }
    expect(Object.keys(made.loans)).toHaveLength(4)
  })

  test('loan top-up: additional principal on a live loan', async ({ request }) => {
    const body = await post(request, `/api/loans/${made.loans.topup}/topup`,
      { amount: 20_000, paymentMode: 'cash', date: fyIso(40) }, 'loan top-up')
    await expectVoucherBalances(request, body.transaction.voucherId, 'loan top-up')
  })

  test('loan part payment: interest first, then principal', async ({ request }) => {
    const body = await post(request, `/api/loans/${made.loans.topup}/payments`,
      { type: 'part_payment', amount: 30_000, paymentMode: 'cash', date: fyIso(55) }, 'loan part payment')
    const legs = await expectVoucherBalances(request, body.transaction.voucherId, 'loan part payment')
    expect(legs.find((l) => l.accountName === 'Interest Income'),
      'a part payment is applied interest-first, so it must recognise interest income').toBeTruthy()
  })

  test('loan release: the full derived due, settled with a rebate', async ({ request }) => {
    const id = made.loans.release
    const asOf = fyIso(85)
    const { quote } = await (await request.get(`/api/loans/${id}/payments?asOf=${asOf}`)).json()
    // Settle short by a rebate rather than to the paisa — a release that only ever tests the
    // exact-amount path never exercises the Loan Rebate expense leg.
    const rebate = 100
    const body = await post(request, `/api/loans/${id}/payments`, {
      type: 'release', amount: r2(quote.totalDue - rebate), discount: rebate,
      paymentMode: 'cash', date: asOf,
    }, 'loan release')
    const legs = await expectVoucherBalances(request, body.transaction.voucherId, 'loan release')
    expect(legs.find((l) => l.accountName === 'Loan Rebate')?.debit).toBeCloseTo(rebate, 2)
  })

  test('auction with a SURPLUS: the excess is owed back to the pledgor, not booked as profit', async ({ request }) => {
    const body = await post(request, `/api/loans/${made.loans.surplus}/auction`, {
      outcome: 'auctioned', proceeds: 95_000, charges: 1_500,
      buyer: 'Books Gate Auctioneer', paymentMode: 'cash', date: fyIso(90),
    }, 'auction with surplus')
    expect(body.settlement.surplus, 'proceeds above the dues are a liability, not income').toBeGreaterThan(0)
    const legs = await expectVoucherBalances(request, body.transaction.voucherId, 'auction with surplus')
    expect(legs.find((l) => l.accountName === 'Auction Surplus Payable')?.credit).toBeCloseTo(body.settlement.surplus, 2)
  })

  test('auction with a SHORTFALL: the gap is a bad-debt expense, not a negative asset', async ({ request }) => {
    const body = await post(request, `/api/loans/${made.loans.shortfall}/auction`, {
      outcome: 'auctioned', proceeds: 30_000, charges: 500,
      buyer: 'Books Gate Auctioneer', paymentMode: 'cash', date: fyIso(95),
    }, 'auction with shortfall')
    // `surplus` is SIGNED, deliberately: negative is a write-off, positive is money owed back.
    expect(body.settlement.surplus, 'proceeds below the dues must come back NEGATIVE').toBeLessThan(0)
    expect(body.settlement.surplusPayable, 'nothing is payable to the pledgor on a shortfall').toBe(0)
    const legs = await expectVoucherBalances(request, body.transaction.voucherId, 'auction with shortfall')
    expect(legs.find((l) => l.accountName === 'Bad Debts Written Off')?.debit,
      'an unrecovered pledge is an expense of the firm — oMunim stores Math.abs() of this and ' +
      'tells a loss from a gain by the text colour').toBeGreaterThan(0)
  })

  // ───────────────────────── savings schemes ─────────────────────────

  test('scheme instalments: money held on behalf of the customer is a liability', async ({ request }) => {
    const { scheme } = await post(request, '/api/schemes', {
      firmId: BOOKS_FIRM, name: 'Books Gate Gold Plan', emiAmount: 5_000,
      durationMonths: 11, totalInstallments: 11, bonusMonths: 1,
    }, 'scheme create')

    for (const [key, count] of [['redeem', 3], ['close', 2]] as const) {
      const { entry } = await post(request, `/api/schemes/${scheme.id}/entries`, {
        customerId: BOOKS_CUSTOMER, customerName: BOOKS_CUSTOMER_NAME,
        startDate: fyIso(30), earlyExitDeduction: 1_000,
      }, `scheme enrolment ${key}`)
      made.schemeEntries[key] = entry.id
      for (let i = 1; i <= count; i++) {
        const body = await post(request, `/api/schemes/entries/${entry.id}/installments`,
          { amount: 5_000, installmentNo: i, paymentMode: 'cash', paidDate: fyIso(30 * i) },
          `scheme instalment ${i} (${key})`)
        await expectVoucherBalances(request, body.installment.voucherId, `scheme instalment ${i}`)
      }
    }
  })

  test('scheme redemption: the deposit becomes a credit against a sale, never a cash payout', async ({ request }) => {
    const target = made.invoices[made.invoices.length - 1]
    const body = await patch(request, `/api/schemes/entries/${made.schemeEntries.redeem}`, {
      action: 'redeem', invoiceId: target.id, date: fyIso(100),
    }, 'scheme redemption')
    const legs = await expectVoucherBalances(request, body.voucherId, 'scheme redemption')
    expect(legs.find((l) => l.accountName === 'Scheme Deposits')?.debit,
      'redeeming must clear the whole deposit liability').toBeCloseTo(body.derived.totalPaid, 2)
    expect(legs.find((l) => l.accountName === 'Customer Advances')?.credit).toBeCloseTo(body.creditApplied, 2)
  })

  test('scheme early close: refund out, the deduction is forfeiture income', async ({ request }) => {
    const body = await patch(request, `/api/schemes/entries/${made.schemeEntries.close}`, {
      action: 'close', earlyExitDeduction: 1_000, paymentMode: 'cash', date: fyIso(105),
    }, 'scheme early close')
    const legs = await expectVoucherBalances(request, body.voucherId, 'scheme early close')
    expect(legs.find((l) => l.accountName === 'Scheme Forfeiture Income')?.credit).toBeCloseTo(1_000, 2)
    expect(legs.find((l) => l.accountName === 'Cash in Hand')?.credit).toBeCloseTo(body.refund, 2)
  })

  // ───────────────────────── receipts against a balance ─────────────────────────

  test('customer receipt: cash in against an outstanding debtor balance', async ({ request }) => {
    const body = await post(request, '/api/ledger', {
      firmId: BOOKS_FIRM, type: 'receipt', date: fyIso(110),
      narration: 'On account from Vikram Madaan', customerId: BOOKS_CUSTOMER,
      legs: [
        { accountName: 'Cash in Hand', debit: 5_000 },
        { accountName: 'Sundry Debtors', credit: 5_000 },
      ],
    }, 'customer receipt')
    await expectVoucherBalances(request, body.voucherId, 'customer receipt')
  })
})

/**
 * NOT part of the serial chain above, on purpose.
 *
 * These are the invoices with awkward arithmetic — a raw total that does not land on a whole rupee,
 * so the round-off line has to go somewhere. oMunim's invoice IS21/96 prints `TOTAL AMOUNT 5,918.00`
 * in the summary block and `5,917.00` in the HSN block, and raises the receivable for 5,917 — the
 * shop chases a figure its own invoice contradicts.
 *
 * They are isolated because a failure here is a defect in ONE arithmetic path, and it must not
 * abort the loan/scheme chain above and take twelve unrelated results with it.
 */
test.describe('invoice arithmetic that does not land on a whole rupee', () => {
  /** The firm's own rates, so the tender below is computed with exactly what the handler will use. */
  const RATES = { cgstRate: 1.5, sgstRate: 1.5, igstRate: 3.0 }
  const LINES = [
    goldLine('Gold Ring 8.62g', 26_345.75, { grossWeight: 8.62, netWeight: 8.62 }),
    goldLine('Gold Stud Pair', 9_876.55, { grossWeight: 3.4, netWeight: 3.4 }),
  ]
  const HEADER = { discount: 1_337.5, metalAmount: 4_321.75, previousAmount: 2_500, loyaltyRedeemed: 50 }

  /**
   * The invoice's totals from the SAME pure function the handler uses (src/lib/gst.ts), so the
   * tender below is the exact figure the bill will print. This isolates the round-off: if the
   * customer hands over precisely the printed total, the only thing left that could unbalance the
   * voucher is the rounding the invoice applied to get to that total.
   */
  const totals = computeInvoiceTotals({
    lines: LINES.map((l) => ({ amount: l.amount })),
    ...HEADER, gstType: 'intra', rates: RATES, taxed: true,
  })

  test('a sale with discount, loose metal, a previous balance, loyalty AND a round-off', async ({ request }) => {
    expect(totals.rofAmount,
      'the fixture is meant to force a round-off; a zero here means these figures now land on a ' +
      'whole rupee and the fixture needs new numbers').not.toBe(0)

    const res = await request.post('/api/invoices', {
      data: {
        firmId: BOOKS_FIRM, type: 'sale',
        customerId: BOOKS_CUSTOMER, customerName: BOOKS_CUSTOMER_NAME,
        invoiceDate: fyIso(15),
        gstType: 'intra', gstTypeOverride: true,
        ...HEADER,
        // Paid to the rupee — exactly what the invoice asks for, nothing over, nothing under.
        amountByCash: totals.totalAmount, paymentMode: 'cash', status: 'completed',
        items: LINES,
      },
    })
    const body = await res.text()
    expect(res.status(),
      `A jewellery bill almost never totals a whole rupee. This one prints a total of ` +
      `${inr(totals.totalAmount)} including a round-off of ${inr(totals.rofAmount)}, and the customer ` +
      'pays it to the rupee. A 400 UNBALANCED here means the round-off the invoice PRINTS ' +
      '(Invoice.rofAmount, stored on the row) has no ledger leg in buildLedgerEntries() — so debits ' +
      'and credits differ by exactly that round-off and postVoucher refuses the entire sale. ' +
      'Server said: ' + body).toBe(200)

    const { invoice } = JSON.parse(body)
    inv(invoice.id, invoice.invoiceNo)
    expect(invoice.rofAmount).toBeCloseTo(totals.rofAmount, 2)
    await expectVoucherBalances(request, await firstVoucherFor(request, invoice.id), 'round-off sale')
  })

  test('a sale tendered for MORE than it asks for: the excess is the customer\'s money', async ({ request }) => {
    // Handing over ₹50,000 against a ₹42,833 bill is an everyday counter event (a round figure, or
    // old gold worth more than the purchase). The excess is a customer advance — a liability — and
    // it needs a leg. Without one, debits exceed credits by the overpayment and the sale is refused
    // outright, so the bill cannot be raised at all.
    const over = 5_000
    const res = await request.post('/api/invoices', {
      data: {
        firmId: BOOKS_FIRM, type: 'sale',
        customerId: BOOKS_CUSTOMER, customerName: BOOKS_CUSTOMER_NAME,
        invoiceDate: fyIso(16),
        gstType: 'intra', gstTypeOverride: true,
        amountByCash: 20_600 + over, paymentMode: 'cash', status: 'completed',
        items: [goldLine('Overpaid Chain', 20_000)],
      },
    })
    const body = await res.text()
    expect(res.status(),
      `A ₹20,600 bill tendered with ₹${(20_600 + over).toLocaleString('en-IN')}. The ${inr(over)} ` +
      'excess is money the shop now holds on the customer\'s behalf and belongs on a liability ' +
      '(Customer Advances). buildLedgerEntries() posts the shortfall leg only ' +
      '(`balance > 0 ? balance : 0`), so an over-tender has no leg, the voucher is out by the ' +
      'overpayment, and the whole invoice is rejected. Server said: ' + body).toBe(200)
  })
})

/**
 * A cheque taken at the BILLING COUNTER, not on the bank screen.
 *
 * Bank reconciliation gave cheques a home — `Cheques in Transit` until the bank clears them, a
 * named account to clear INTO, and a reversing voucher when one bounces — but only for entries made
 * on the bank screen. An invoice pooled cheque, card and UPI into the single generic `Bank Account`
 * on the invoice date, so a cheque that had not cleared (or had bounced) was indistinguishable in
 * the books from money the shop could spend. That is the defect these tests hold shut.
 *
 * Serial: the clear and the bounce act on cheques the earlier tests raise.
 */
test.describe.serial('cheques and cards taken at the billing counter', () => {
  const BANK = 'MAD ICICI Current 4521'
  const LEDGER_BANK = `Bank - ${BANK}`
  const counter = { bankAccountId: '', clearInvoiceNo: '' }

  /** The pending cheque an invoice raised, found by the narration it carries. */
  async function pendingCheque(request: APIRequestContext, invoiceNo: string) {
    const res = await request.get(`/api/bank/transactions?firmId=${BOOKS_FIRM}&status=pending`)
    expect(res.status(), await res.text()).toBe(200)
    const { transactions } = await res.json()
    const row = transactions.find((t: { narration?: string }) => (t.narration || '').includes(invoiceNo))
    expect(row, `taking a cheque on ${invoiceNo} must raise a pending BankTransaction, otherwise ` +
      'nothing can ever clear or bounce it and the balance sits in Cheques in Transit forever ' +
      `(pending rows seen: ${transactions.map((t: { narration?: string }) => t.narration).join(' | ') || 'none'})`).toBeTruthy()
    return row as { id: string; amount: number; clearingDate: string | null; counterAccountName: string | null }
  }

  test('a named bank account exists to take card, UPI and cleared cheques', async ({ request }) => {
    const { bankAccount } = await post(request, '/api/bank/accounts', {
      firmId: BOOKS_FIRM, name: BANK, bankName: 'ICICI Bank', openingBalance: 0,
    }, 'named bank account')
    counter.bankAccountId = bankAccount.id
    expect(bankAccount.accountId, 'a bank account must own a chart-of-accounts row to post through').toBeTruthy()
  })

  test('a sale part-paid by card and part by cheque: card to the bank, cheque into transit', async ({ request }) => {
    const card = 30_000
    const cheque = 40_000
    const { invoice } = await post(request, '/api/invoices', {
      firmId: BOOKS_FIRM, type: 'sale',
      customerId: BOOKS_CUSTOMER, customerName: BOOKS_CUSTOMER_NAME,
      invoiceDate: fyIso(60),
      gstType: 'intra', gstTypeOverride: true,
      amountByCard: card, amountByCheque: cheque, chequeNumber: '004417',
      paymentMode: 'cheque', status: 'completed',
      items: [goldLine('Gold Kada 40g', 100_000)],
    }, 'sale part card part cheque')
    inv(invoice.id, invoice.invoiceNo)
    counter.clearInvoiceNo = invoice.invoiceNo

    const legs = await expectVoucherBalances(request, await firstVoucherFor(request, invoice.id), 'card+cheque sale')
    const dr = (name: string) => r2(legs.filter((l) => l.accountName === name).reduce((t, l) => t + (l.debit || 0), 0))

    expect(dr(LEDGER_BANK),
      'card settles same-day into a NAMED bank account — a shop with two banks has to know which one')
      .toBeCloseTo(card, 2)
    expect(dr('Cheques in Transit'),
      "the cheque must NOT reach a bank account on the invoice date. It is the shop's asset in " +
      'transit until the bank clears it; posting it straight to the bank is what made an uncleared ' +
      'cheque indistinguishable from spendable money.').toBeCloseTo(cheque, 2)
    expect(dr('Bank Account'),
      'nothing may still pool into the generic pre-bank-rec "Bank Account" from an invoice').toBe(0)

    const cq = await pendingCheque(request, invoice.invoiceNo)
    expect(cq.amount).toBeCloseTo(cheque, 2)
    expect(cq.clearingDate, 'a cheque has no clearing date until the bank gives it one').toBeNull()
  })

  test('the cheque clears: the money reaches the bank on the CLEARING date, not the invoice date', async ({ request }) => {
    const before = await readBooks(request, BOOKS_FIRM, ALL_TIME)
    const transitBefore = balanceOf(before, 'Cheques in Transit')
    const bankBefore = balanceOf(before, LEDGER_BANK)

    const cq = await pendingCheque(request, counter.clearInvoiceNo)
    const body = await post(request, `/api/bank/transactions/${cq.id}`, {
      firmId: BOOKS_FIRM, action: 'clear', clearingDate: fyIso(67),
    }, 'clear a counter cheque')
    expect(body.transaction.status).toBe('cleared')
    expect(body.transaction.clearingDate, 'clearing must record the day the bank actually paid').toBeTruthy()

    const after = await readBooks(request, BOOKS_FIRM, ALL_TIME)
    expect(r2(balanceOf(after, 'Cheques in Transit') - transitBefore),
      'clearing must empty this cheque out of transit').toBeCloseTo(-cq.amount, 2)
    expect(r2(balanceOf(after, LEDGER_BANK) - bankBefore),
      'and put exactly that much on the named bank account').toBeCloseTo(cq.amount, 2)
  })

  test('a cheque bounces: the debt comes back, the SALE stands, nothing is deleted', async ({ request }) => {
    const cheque = 25_000
    const { invoice } = await post(request, '/api/invoices', {
      firmId: BOOKS_FIRM, type: 'sale',
      customerId: BOOKS_CUSTOMER, customerName: BOOKS_CUSTOMER_NAME,
      invoiceDate: fyIso(70),
      gstType: 'intra', gstTypeOverride: true,
      amountByCheque: cheque, chequeNumber: '004418', paymentMode: 'cheque', status: 'completed',
      items: [goldLine('Gold Pendant 10g', 30_000)],
    }, 'sale paid by cheque that will bounce')
    inv(invoice.id, invoice.invoiceNo)

    const before = await readBooks(request, BOOKS_FIRM, ALL_TIME)
    const revenueBefore = balanceOf(before, 'Sales Revenue')
    const debtorsBefore = balanceOf(before, 'Sundry Debtors')
    const transitBefore = balanceOf(before, 'Cheques in Transit')

    const cq = await pendingCheque(request, invoice.invoiceNo)
    const body = await post(request, `/api/bank/transactions/${cq.id}`, {
      firmId: BOOKS_FIRM, action: 'bounce', clearingDate: fyIso(74),
      narration: `Cheque 004418 returned unpaid — ${invoice.invoiceNo}`,
    }, 'bounce a counter cheque')
    expect(body.transaction.status).toBe('bounced')
    expect(body.transaction.reversalVoucherId, 'a bounce posts a voucher; it never edits or deletes one').toBeTruthy()

    const after = await readBooks(request, BOOKS_FIRM, ALL_TIME)
    expect(r2(balanceOf(after, 'Cheques in Transit') - transitBefore),
      'a bounced cheque leaves nothing in transit').toBeCloseTo(-cq.amount, 2)
    expect(r2(balanceOf(after, 'Sundry Debtors') - debtorsBefore),
      'the customer kept the jewellery and the payment failed, so the customer owes it again')
      .toBeCloseTo(cq.amount, 2)
    expect(balanceOf(after, 'Sales Revenue'),
      'a bounced cheque must NOT un-sell the goods — reversing the whole invoice voucher would, ' +
      'which is why a counter cheque corrects its own leg instead').toBeCloseTo(revenueBefore, 2)

    const reversal = await expectVoucherBalances(request, body.transaction.reversalVoucherId, 'bounce voucher')
    expect(reversal.length, 'the correction is the cheque leg and its counter leg, nothing else').toBe(2)

    const again = await request.post(`/api/bank/transactions/${cq.id}`, {
      data: { firmId: BOOKS_FIRM, action: 'bounce' },
    })
    expect(again.status(), 'bouncing an already-bounced cheque must be refused, not posted twice').toBe(409)
  })

  test('deleting the bill un-posts the cheque too, and the cheque can no longer be cleared', async ({ request }) => {
    const cheque = 12_000
    const { invoice } = await post(request, '/api/invoices', {
      firmId: BOOKS_FIRM, type: 'sale',
      customerId: BOOKS_CUSTOMER, customerName: BOOKS_CUSTOMER_NAME,
      invoiceDate: fyIso(78),
      gstType: 'intra', gstTypeOverride: true,
      amountByCheque: cheque, chequeNumber: '004419', paymentMode: 'cheque', status: 'completed',
      items: [goldLine('Gold Ring (bill cancelled)', 15_000)],
    }, 'sale by cheque, to be cancelled')

    const cq = await pendingCheque(request, invoice.invoiceNo)
    const before = balanceOf(await readBooks(request, BOOKS_FIRM, ALL_TIME), 'Cheques in Transit')

    const del = await request.delete(`/api/invoices?id=${invoice.id}`)
    expect(del.status(), await del.text()).toBe(200)

    const after = balanceOf(await readBooks(request, BOOKS_FIRM, ALL_TIME), 'Cheques in Transit')
    expect(r2(after - before),
      'cancelling the bill must un-post the cheque leg with the rest of the voucher, not leave ' +
      'money sitting in transit against a sale that no longer exists').toBeCloseTo(-cheque, 2)

    const res = await request.post(`/api/bank/transactions/${cq.id}`, {
      data: { firmId: BOOKS_FIRM, action: 'clear', clearingDate: fyIso(80) },
    })
    expect(res.status(),
      'the cheque is still marked pending, but what put it in transit has been reversed. Clearing ' +
      'it now would credit Cheques in Transit a second time and drive that asset negative — it ' +
      `must be refused. Server said: ${await res.text()}`).toBe(409)
  })

  test('the books never cross firms: the other tenant cannot see these cheques', async ({ request }) => {
    const res = await request.get(`/api/bank/transactions?firmId=${FOREIGN_FIRM}&status=pending`)
    expect(res.status(), "a signed-in user must be refused another firm's bank transactions").toBe(403)
  })
})

/**
 * The same defect, on the two paths that still had it after the billing counter was fixed: UDHAAR
 * and EXPENSES pooled a cheque into the generic "Bank Account" on the transaction date. An uncleared
 * cheque, and a bounced one, both read as money the shop had.
 *
 * These are money-lending and money-spending, not selling, so the BOUNCE shape is different from a
 * sale's and that difference is asserted below: reversing the whole voucher is the truth here (no
 * money moved, so the receivable comes back whole), where reversing a sale would un-sell the goods.
 *
 * Serial: each test acts on the cheque the one before it raised.
 */
test.describe.serial('cheques taken and written away from the billing counter', () => {
  const LEDGER_BANK = 'Bank - MAD ICICI Current 4521'
  const TRANSIT = 'Cheques in Transit'

  /** The pending cheque a non-invoice path raised, addressed by the number written on it. */
  async function pending(request: APIRequestContext, chequeNumber: string) {
    const res = await request.get(`/api/bank/transactions?firmId=${BOOKS_FIRM}&status=pending`)
    expect(res.status(), await res.text()).toBe(200)
    const { transactions } = await res.json()
    const row = transactions.find((t: { chequeNumber?: string | null }) => t.chequeNumber === chequeNumber)
    expect(row, `cheque ${chequeNumber} must raise a pending BankTransaction, otherwise nothing can ` +
      'ever clear or bounce it and the balance sits in Cheques in Transit forever ' +
      `(pending: ${transactions.map((t: { chequeNumber?: string | null; narration?: string }) => `${t.chequeNumber || 'no number'} ${t.narration}`).join(' | ') || 'none'})`)
      .toBeTruthy()
    return row as { id: string; amount: number; type: string; clearingDate: string | null; counterAccountName: string | null }
  }

  test('an udhaar repaid by cheque sits in transit, not in the bank', async ({ request }) => {
    const amount = 60_000
    const before = await readBooks(request, BOOKS_FIRM, ALL_TIME)

    // No bankAccountId on purpose: the clerk taking the cheque does not know which account it will
    // be paid into. It must still be accepted, defaulted to the firm's primary, and reassignable
    // when it is actually banked — see resolveBankAccount() in src/lib/accounting.ts.
    const body = await post(request, '/api/udhaar', {
      firmId: BOOKS_FIRM, customerId: BOOKS_CUSTOMER, customerName: BOOKS_CUSTOMER_NAME,
      type: 'debit', transactionType: 'cheque', amount, chequeNumber: '551201',
      description: 'Udhaar repaid by cheque 551201', status: 'active',
    }, 'udhaar repaid by cheque')
    expect(body.posted, 'a money udhaar must reach the books').toBe(true)
    await expectVoucherBalances(request, body.voucherId, 'udhaar cheque receipt')

    const after = await readBooks(request, BOOKS_FIRM, ALL_TIME)
    expect(r2(balanceOf(after, TRANSIT) - balanceOf(before, TRANSIT)),
      'the cheque is the shop\'s asset in transit until the bank clears it')
      .toBeCloseTo(amount, 2)
    expect(r2(balanceOf(after, 'Bank Account') - balanceOf(before, 'Bank Account')),
      'nothing may still pool into the generic pre-bank-rec "Bank Account" from udhaar').toBe(0)
    expect(r2(balanceOf(after, LEDGER_BANK) - balanceOf(before, LEDGER_BANK)),
      'and it must not reach the real bank account on the day it was handed over either').toBe(0)

    const cq = await pending(request, '551201')
    expect(cq.type, 'money coming IN to the shop').toBe('cheque_in')
    expect(cq.amount).toBeCloseTo(amount, 2)
    expect(cq.clearingDate, 'a cheque has no clearing date until the bank gives it one').toBeNull()
  })

  test('that udhaar cheque clears onto the named bank account, dated the clearing day', async ({ request }) => {
    const before = await readBooks(request, BOOKS_FIRM, ALL_TIME)
    const cq = await pending(request, '551201')

    const body = await post(request, `/api/bank/transactions/${cq.id}`, {
      firmId: BOOKS_FIRM, action: 'clear', clearingDate: fyIso(92),
    }, 'clear an udhaar cheque')
    expect(body.transaction.status).toBe('cleared')

    const after = await readBooks(request, BOOKS_FIRM, ALL_TIME)
    expect(r2(balanceOf(after, TRANSIT) - balanceOf(before, TRANSIT)),
      'clearing empties this cheque out of transit').toBeCloseTo(-cq.amount, 2)
    expect(r2(balanceOf(after, LEDGER_BANK) - balanceOf(before, LEDGER_BANK)),
      'and puts exactly that much on the named bank account').toBeCloseTo(cq.amount, 2)
  })

  test('an udhaar cheque that bounces puts the WHOLE debt back, not half of it', async ({ request }) => {
    const amount = 15_000
    await post(request, '/api/udhaar', {
      firmId: BOOKS_FIRM, customerId: BOOKS_CUSTOMER, customerName: BOOKS_CUSTOMER_NAME,
      type: 'debit', transactionType: 'cheque', amount, chequeNumber: '551202',
      description: 'Udhaar repaid by cheque 551202', status: 'active',
    }, 'udhaar repaid by a cheque that will bounce')

    const before = await readBooks(request, BOOKS_FIRM, ALL_TIME)
    const cq = await pending(request, '551202')

    const body = await post(request, `/api/bank/transactions/${cq.id}`, {
      firmId: BOOKS_FIRM, action: 'bounce', clearingDate: fyIso(95),
      narration: 'Cheque 551202 returned unpaid',
    }, 'bounce an udhaar cheque')
    expect(body.transaction.status).toBe('bounced')
    expect(body.transaction.reversalVoucherId, 'a bounce posts a voucher; it never edits or deletes one').toBeTruthy()

    const after = await readBooks(request, BOOKS_FIRM, ALL_TIME)
    expect(r2(balanceOf(after, TRANSIT) - balanceOf(before, TRANSIT)),
      'a bounced cheque leaves nothing in transit').toBeCloseTo(-amount, 2)
    expect(r2(balanceOf(after, 'Sundry Debtors') - balanceOf(before, 'Sundry Debtors')),
      'no money reached the shop, so the party owes the whole amount again. Unlike a sale — where ' +
      'the goods left the shop and only the cheque leg is corrected — nothing about an udhaar ' +
      'receipt survives a bounce.').toBeCloseTo(amount, 2)
    await expectVoucherBalances(request, body.transaction.reversalVoucherId, 'udhaar bounce reversal')
  })

  test('an expense in a category outside the fixed list still lands on the P&L (D1)', async ({ request }) => {
    // Kept in the books on purpose: 02-reconciliation's whole-book checks (balance sheet ties,
    // every account on the right statement) then cover an off-list category too. Before the fix
    // 'Tea and snacks Expense' was 'unclassified' and the balance sheet was out by exactly 640.
    const before = await readBooks(request, BOOKS_FIRM, ALL_TIME)
    const body = await post(request, '/api/expenses', {
      firmId: BOOKS_FIRM, category: 'tea and snacks', amount: 640, paymentMode: 'cash',
      description: 'Customer tea, typed as free text', expenseDate: fyIso(22),
    }, 'off-list expense')
    await expectVoucherBalances(request, body.voucherId, 'off-list expense')
    const after = await readBooks(request, BOOKS_FIRM, ALL_TIME)
    const tb = after.trialBalance.find((r: { name: string }) => r.name === 'Tea and snacks Expense')
    expect(tb?.type, 'an off-list expense category must be typed expense, not unclassified').toBe('expense')
    expect(r2(after.profitLoss.expense - before.profitLoss.expense),
      'the whole 640 reaches the P&L').toBeCloseTo(640, 2)
  })

  test('an expense paid by cheque does not leave the bank until it clears', async ({ request }) => {
    const amount = 18_000
    const before = await readBooks(request, BOOKS_FIRM, ALL_TIME)

    const body = await post(request, '/api/expenses', {
      firmId: BOOKS_FIRM, category: 'utility', amount, paymentMode: 'cheque',
      chequeNumber: '551203', description: 'Electricity bill by cheque 551203',
      expenseDate: fyIso(96),
    }, 'expense paid by cheque')
    await expectVoucherBalances(request, body.voucherId, 'expense cheque payment')

    const after = await readBooks(request, BOOKS_FIRM, ALL_TIME)
    expect(r2(balanceOf(after, 'Utility Expense') - balanceOf(before, 'Utility Expense')),
      'the expense itself is recognised on the expense date').toBeCloseTo(amount, 2)
    expect(r2(balanceOf(after, TRANSIT) - balanceOf(before, TRANSIT)),
      'a cheque written and not yet presented is an outstanding cheque — it credits transit, it ' +
      'does not reduce the bank').toBeCloseTo(-amount, 2)
    expect(r2(balanceOf(after, LEDGER_BANK) - balanceOf(before, LEDGER_BANK)),
      'the money is still in the bank until the payee presents the cheque').toBe(0)
    expect(r2(balanceOf(after, 'Bank Account') - balanceOf(before, 'Bank Account')),
      'nothing may still pool into the generic pre-bank-rec "Bank Account" from an expense').toBe(0)

    const cq = await pending(request, '551203')
    expect(cq.type, 'money going OUT of the shop').toBe('cheque_out')
    expect(cq.amount).toBeCloseTo(amount, 2)

    const cleared = await post(request, `/api/bank/transactions/${cq.id}`, {
      firmId: BOOKS_FIRM, action: 'clear', clearingDate: fyIso(101),
    }, 'clear an expense cheque')
    expect(cleared.transaction.status).toBe('cleared')

    const settled = await readBooks(request, BOOKS_FIRM, ALL_TIME)
    expect(r2(balanceOf(settled, LEDGER_BANK) - balanceOf(after, LEDGER_BANK)),
      'presentation is what takes the money off the bank, on the day it happened')
      .toBeCloseTo(-amount, 2)
    expect(r2(balanceOf(settled, TRANSIT) - balanceOf(after, TRANSIT)),
      'and clears the outstanding cheque').toBeCloseTo(amount, 2)
  })

  /**
   * OVER-TENDER BY CHEQUE, then a bounce — a known, deliberate imperfection, pinned so it cannot
   * silently be "fixed" into something worse.
   *
   * A ₹20,600 bill settled with a ₹25,600 cheque posts Dr Cheques in Transit 25,600 with the ₹5,000
   * excess credited to Customer Advances. The BankTransaction can name exactly ONE counter account,
   * so a bounce restores the whole 25,600 to Sundry Debtors and leaves the 5,000 advance standing.
   *
   * The customer's NET position is right; it simply reads across two accounts. Left as it is on
   * purpose: splitting the bounce back across Sundry Debtors and Customer Advances needs the
   * BankTransaction to record the split, and — worse — would debit an advance that may already have
   * been consumed by another bill in the meantime, driving that liability negative. A correct net
   * spread over two accounts beats a tidier presentation that can go negative. What must never
   * change is the net, so that is what this asserts.
   */
  test('an over-tendered cheque that bounces: the net the customer owes is still right', async ({ request }) => {
    const bill = 20_600
    const over = 5_000
    const { invoice } = await post(request, '/api/invoices', {
      firmId: BOOKS_FIRM, type: 'sale',
      customerId: BOOKS_CUSTOMER, customerName: BOOKS_CUSTOMER_NAME,
      invoiceDate: fyIso(108),
      gstType: 'intra', gstTypeOverride: true,
      amountByCheque: bill + over, chequeNumber: '551204', paymentMode: 'cheque', status: 'completed',
      items: [goldLine('Over-tendered Chain', 20_000)],
    }, 'sale over-tendered by cheque')
    inv(invoice.id, invoice.invoiceNo)

    const before = await readBooks(request, BOOKS_FIRM, ALL_TIME)
    const cq = await pending(request, '551204')
    expect(cq.amount, 'the whole cheque goes into transit, not just the billed part').toBeCloseTo(bill + over, 2)

    const body = await post(request, `/api/bank/transactions/${cq.id}`, {
      firmId: BOOKS_FIRM, action: 'bounce', clearingDate: fyIso(112),
    }, 'bounce an over-tendered cheque')
    expect(body.transaction.status).toBe('bounced')

    const after = await readBooks(request, BOOKS_FIRM, ALL_TIME)
    const debtors = r2(balanceOf(after, 'Sundry Debtors') - balanceOf(before, 'Sundry Debtors'))
    const advances = r2(balanceOf(after, 'Customer Advances') - balanceOf(before, 'Customer Advances'))
    expect(debtors, 'the bounce restores the full tendered amount to the receivable').toBeCloseTo(bill + over, 2)
    expect(advances, 'and the advance raised by the over-tender is deliberately left standing').toBeCloseTo(0, 2)
    expect(r2(debtors + advances),
      'THE INVARIANT: receivable less advance held is what the customer actually owes. It may read ' +
      `across two accounts, but it must come to ${inr(bill + over)} and not a paisa else.`)
      .toBeCloseTo(bill + over, 2)
    expect(r2(balanceOf(after, 'Cheques in Transit') - balanceOf(before, 'Cheques in Transit')),
      'and nothing is left in transit').toBeCloseTo(-(bill + over), 2)
    expect(balanceOf(after, 'Sales Revenue'),
      'the goods left the shop: a bounced cheque must not un-sell them')
      .toBeCloseTo(balanceOf(before, 'Sales Revenue'), 2)
  })

  /**
   * THE UNHEDGED METAL POSITION. A gold scheme is a promise in GRAMS; the balance sheet carries only
   * the rupees received (Gold Scheme Deposits, 2008). The gap moves with the metal price and appears
   * on no statement. It is DISCLOSED as a note, not revalued — see metalSchemePosition() in
   * src/lib/accounting.ts for why inventing a mark-to-market is the chart owner's decision.
   */
  test('a gold scheme discloses the grams the shop owes, and states no rupee value for them', async ({ request }) => {
    const { scheme } = await post(request, '/api/schemes', {
      firmId: BOOKS_FIRM, name: 'Books Gate Gram Plan', type: 'gold', emiAmount: 5_000,
      durationMonths: 11, totalInstallments: 11, bonusMonths: 1,
    }, 'gold scheme create')
    const { entry } = await post(request, `/api/schemes/${scheme.id}/entries`, {
      customerId: BOOKS_CUSTOMER, customerName: BOOKS_CUSTOMER_NAME, startDate: fyIso(30),
      metalRate: 6_000,
    }, 'gold scheme enrolment')

    // Two receipts at two different rates — the point of the note is that grams, not rupees, are
    // what is owed, so the two receipts must NOT buy the same weight.
    let expectedGrams = 0
    for (const [i, rate] of [[1, 6_000], [2, 6_500]] as const) {
      const body = await post(request, `/api/schemes/entries/${entry.id}/installments`,
        { amount: 5_000, installmentNo: i, paymentMode: 'cash', metalRate: rate, paidDate: fyIso(30 + i) },
        `gold scheme instalment ${i}`)
      await expectVoucherBalances(request, body.installment.voucherId, `gold scheme instalment ${i}`)
      expectedGrams += 5_000 / rate
    }

    const res = await request.get(`/api/ledger?firmId=${BOOKS_FIRM}&limit=1&notes=1`)
    expect(res.status(), await res.text()).toBe(200)
    const { notes } = await res.json()
    expect(notes, 'the balance sheet must be able to ask for its notes').toBeTruthy()

    const gold = notes.metalSchemes.find((n: { metal: string }) => n.metal === 'gold')
    expect(gold, 'a live gold scheme must appear in the note; an obligation disclosed nowhere is ' +
      'the oMunim failure mode this gate exists against').toBeTruthy()
    expect(gold.gramsAccrued,
      'summed unrounded across receipts bought at different rates, then rounded once at 3dp')
      .toBeCloseTo(Math.round(expectedGrams * 1000) / 1000, 3)
    expect(gold.openSubscriptions).toBeGreaterThanOrEqual(1)
    expect(notes.disclosure).toContain('g gold')
    expect(notes.disclosure,
      'the note states a POSITION. The moment it states a rupee value it has made a revaluation ' +
      'policy decision that nobody took.').not.toMatch(/₹/)

    const plain = await (await request.get(`/api/ledger?firmId=${BOOKS_FIRM}&limit=1`)).json()
    expect(plain.notes,
      'and the note is opt-in: the day book must not pay for four aggregate queries it never shows')
      .toBeUndefined()
  })

  test('a bankAccountId this firm does not own is refused, on both paths', async ({ request }) => {
    // Cross-firm ownership is re-checked inside resolveBankAccount (tests/unit/accounting.test.ts
    // covers the other-firm case directly). Here: an id that resolves to nothing must 404 rather
    // than silently falling back to the primary account and posting money somewhere plausible.
    const u = await request.post('/api/udhaar', {
      data: {
        firmId: BOOKS_FIRM, customerName: BOOKS_CUSTOMER_NAME, type: 'debit',
        transactionType: 'cheque', amount: 1_000, bankAccountId: 'not-this-firms-bank-account',
        status: 'active',
      },
    })
    expect(u.status(), `udhaar must refuse an unknown bank account: ${await u.text()}`).toBe(404)

    const e = await request.post('/api/expenses', {
      data: {
        firmId: BOOKS_FIRM, category: 'other', amount: 1_000, paymentMode: 'cheque',
        bankAccountId: 'not-this-firms-bank-account',
      },
    })
    expect(e.status(), `expenses must refuse an unknown bank account: ${await e.text()}`).toBe(404)

    const fb = await request.post('/api/udhaar', {
      data: {
        firmId: FOREIGN_FIRM, customerName: 'Somebody Else', type: 'debit',
        transactionType: 'cheque', amount: 1_000, status: 'active',
      },
    })
    expect(fb.status(), "and the books never cross firms: another tenant's udhaar is forbidden").toBe(403)
  })
})

// ───────────────────────── small helpers ─────────────────────────

/** The voucher an invoice created. Invoices post exactly one, so "first" is "the". */
async function firstVoucherFor(request: APIRequestContext, invoiceId: string): Promise<string> {
  const res = await request.get(`/api/ledger?firmId=${BOOKS_FIRM}&from=${ALL_TIME.from}&to=${ALL_TIME.to}&limit=500`)
  const { entries } = await res.json()
  const leg = entries.find((e: { invoiceId?: string | null; reversalOfId?: string | null }) =>
    e.invoiceId === invoiceId && !e.reversalOfId)
  expect(leg, `no ledger leg was posted for invoice ${invoiceId} — the invoice exists but the ` +
    'books do not know about it').toBeTruthy()
  return leg.voucherId
}

/** Any item the purchase/URD invoices put on the shelf, with the cost basis they capitalised. */
async function availableStock(request: APIRequestContext) {
  const res = await request.get(`/api/stock?firmId=${BOOKS_FIRM}&status=available`)
  expect(res.status(), await res.text()).toBe(200)
  const items = (await res.json()).items as { id: string; name: string; itemCode: string; costPrice: number }[]
  const item = items.find((i) => (i.costPrice || 0) > 0)
  expect(item, 'the purchase invoices should have left costed stock on the shelf').toBeTruthy()
  return item!
}
