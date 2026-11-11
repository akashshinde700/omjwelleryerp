import { test, expect } from '@playwright/test'
import { STATE } from '../auth'
import { FIX } from '../seed'

/**
 * An expense must land on the P&L, whatever category the clerk typed.
 *
 * POST /api/expenses accepts ANY category string (zod: trim().min(1).max(60)) and the Expo form is a
 * free-text box ("Category (rent/salary/...)"), but the leg it posts, `<Category> Expense`, is only
 * typed when the category is one of EXPENSE_CATEGORIES (src/lib/accounting.ts CHART_OF_ACCOUNTS).
 * Anything else resolves to 'unclassified' in buildStatements and appears on NO statement: the money
 * leaves Cash in Hand (an asset) and the expense is on neither the P&L nor the balance sheet, so
 * assets no longer equal liabilities + equity + profit. Found 2026-10-24 when a 'misc' expense put
 * JBS's balance sheet out by exactly its Rs 105 (tests/api/inventory-cogs.spec.ts expectTied).
 *
 * Self-cleaning: the expense is deleted (reversed) whatever the verdict, so its legs net to zero and
 * no later whole-book check in JBS inherits the gap. Owner: be-accounting (fix), qa-api (this test).
 */
test.use({ storageState: STATE.admin })
const FIRM = FIX.firmJBS.id

test('an expense with a category outside the fixed list is still an EXPENSE on the statements', async ({ request }) => {
  const res = await request.post('/api/expenses', { data: { firmId: FIRM, category: 'misc', amount: 105, paymentMode: 'cash' } })
  expect(res.status(), await res.text()).toBe(200)
  const { expense } = await res.json()
  try {
    const books = await (await request.get(`/api/ledger?firmId=${FIRM}&from=2000-01-01&to=2099-12-31&limit=1`)).json()
    const row = books.trialBalance.find((r: { name: string }) => r.name === 'Misc Expense')
    expect(row, 'the expense leg reaches the trial balance').toBeTruthy()
    expect(row.type, "'Misc Expense' must be typed expense; 'unclassified' puts it on no statement and the balance sheet stops tying").toBe('expense')
  } finally {
    const del = await request.delete(`/api/expenses?id=${expense.id}`)
    expect(del.status(), await del.text()).toBe(200)
  }
})
