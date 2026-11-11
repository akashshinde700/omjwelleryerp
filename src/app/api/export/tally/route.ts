import { NextResponse } from 'next/server'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { MANAGER_ROLES, denyUnlessRole } from '@/app/api/_authz'
import { db } from '@/lib/db'
import { financialYear, dayStart, dayEnd, isDay, CHART_OF_ACCOUNTS, expenseCategoryEntry, type AccountType } from '@/lib/accounting'

/**
 * Tally (ERP 9 / Prime) XML voucher export — oMunim ships one ("SELL REPORT BY INVOICE (TALLY
 * IMPORT)" + a `ledger.xml` mapping); an accountant who lives in Tally cannot use our books at all
 * without this, so it is the difference between usable and re-keyed by hand.
 *
 * Source of truth: LedgerEntry, grouped by voucherId — every business event (sale, purchase,
 * return, receipt, payment, loan, expense, scheme, journal) already funnels through the ONE
 * sanctioned posting path (postVoucher, src/lib/ledger.ts) into that one table, so this file reads
 * one place, not one per module.
 *
 * ACCOUNT MAPPING is the part a silent bug hides in: our chart has five account types and
 * metal-separated stock/COGS that Tally's default chart has no ledger for. Every name below is
 * either mapped to a defensible Tally ledger+group, or carries an explicit `note` telling the
 * accountant to create it — never a guess presented as a fact.
 */

// ── Tally sign convention (documented, widely-used Tally XML import convention) ────────────────
// A DEBIT ledger entry: ISDEEMEDPOSITIVE=Yes, AMOUNT negative.
// A CREDIT ledger entry: ISDEEMEDPOSITIVE=No, AMOUNT positive.
// Sum of signed amounts across one voucher = 0 exactly when (and because) postVoucher already
// proved Σdebit == Σcredit before it ever wrote the leg — this export invents no new balancing.

type TallyLedger = { ledger: string; group: string; note?: string }

const ACCOUNT_TALLY_MAP: Record<string, TallyLedger> = {
  'Cash in Hand': { ledger: 'Cash', group: 'Cash-in-Hand' },
  'Bank Account': { ledger: 'Bank Account', group: 'Bank Accounts',
    note: 'Pooled ledger — split into one ledger per real bank account in Tally if the firm operates more than one.' },
  'Sundry Debtors': { ledger: 'Sundry Debtors', group: 'Sundry Debtors',
    note: 'Fallback only, used when a leg has no named customer. Legs that DO carry a customer are exported under that customer\'s own ledger (see below) — the standard Tally convention for accounts receivable, so each party\'s outstanding balance is separately trackable.' },
  'Sundry Creditors': { ledger: 'Sundry Creditors', group: 'Sundry Creditors',
    note: 'Fallback only — see Sundry Debtors note (same convention, payables side).' },
  'Sales Revenue': { ledger: 'Sales Account', group: 'Sales Accounts' },
  Purchases: { ledger: 'Purchase Account', group: 'Purchase Accounts' },
  'CGST Payable': { ledger: 'CGST Payable', group: 'Duties & Taxes' },
  'SGST Payable': { ledger: 'SGST Payable', group: 'Duties & Taxes' },
  'IGST Payable': { ledger: 'IGST Payable', group: 'Duties & Taxes' },
  'CGST Input Receivable': { ledger: 'CGST Input Credit', group: 'Duties & Taxes' },
  'SGST Input Receivable': { ledger: 'SGST Input Credit', group: 'Duties & Taxes' },
  'IGST Input Receivable': { ledger: 'IGST Input Credit', group: 'Duties & Taxes' },
  'TCS Payable': { ledger: 'TCS Payable', group: 'Duties & Taxes' },
  'Gold Stock': { ledger: 'Gold Stock', group: 'Stock-in-Hand',
    note: 'CREATE THIS LEDGER. Tally has no per-metal stock ledger by default, and our stock is PERPETUAL (posted on every sale/purchase) while Tally normally values stock periodically via its own Stock Item feature — these two will not reconcile automatically. Treat this as a manual balance-check ledger, not a live Tally stock item.' },
  'Silver Stock': { ledger: 'Silver Stock', group: 'Stock-in-Hand',
    note: 'CREATE THIS LEDGER — see Gold Stock note (same caveat, silver book).' },
  'Other Stock': { ledger: 'Other Stock', group: 'Stock-in-Hand',
    note: 'CREATE THIS LEDGER — see Gold Stock note (imitation/crystal/non-precious book).' },
  'Cost of Goods Sold - Gold': { ledger: 'Cost of Goods Sold - Gold', group: 'Direct Expenses',
    note: 'CREATE THIS LEDGER. Tally normally derives COGS from Opening+Purchases-Closing stock, not a posted account — our perpetual COGS has no Tally-native counterpart to reconcile against.' },
  'Cost of Goods Sold - Silver': { ledger: 'Cost of Goods Sold - Silver', group: 'Direct Expenses',
    note: 'CREATE THIS LEDGER — see the gold COGS note.' },
  'Cost of Goods Sold - Other': { ledger: 'Cost of Goods Sold - Other', group: 'Direct Expenses',
    note: 'CREATE THIS LEDGER — see the gold COGS note.' },
  'Old Gold Purchases': { ledger: 'Old Gold Purchases', group: 'Direct Expenses',
    note: 'CREATE THIS LEDGER — exchange gold taken in trade against a sale has no native Tally ledger.' },
  'Scheme Deposits': { ledger: 'Scheme Deposits', group: 'Current Liabilities',
    note: 'CREATE THIS LEDGER — gold-savings/kitty scheme money held for customers has no native Tally equivalent.' },
  'Customer Advances': { ledger: 'Advance from Customers', group: 'Current Liabilities',
    note: 'CREATE THIS LEDGER if not already present.' },
  'Cheques in Transit': { ledger: 'Cheques in Transit', group: 'Current Assets',
    note: 'CREATE THIS LEDGER. A cheque received or issued but not yet cleared by the bank — it is deliberately NOT on any bank ledger until its clearing date, which is what makes an uncleared cheque distinguishable from cleared money. Tally has no built-in equivalent.' },
  'Advance to Supplier': { ledger: 'Advance to Supplier', group: 'Loans & Advances (Asset)',
    note: 'CREATE THIS LEDGER — the mirror of Advance from Customers, opposite direction.' },
  'Round Off': { ledger: 'Round Off', group: 'Indirect Expenses',
    note: 'This app nets both directions (rounding up = income, down = expense) on ONE ledger. Tally\'s own built-in "Round Off" voucher-level feature is a different mechanism (per-voucher, not a posted ledger) — this export uses a manual ledger equivalent instead so the figure still reconciles.' },
  'Sales Return': { ledger: 'Sales Return', group: 'Sales Accounts',
    note: 'This app posts a return as a same-day ledger entry, not a Tally Credit Note voucher. Sale-return invoices ALSO get their own Credit Note voucher below (VCHTYPE=Credit Note) — if you import both, you will double-count; pick one convention and drop the other set before importing.' },
  'Loyalty Redemption Expense': { ledger: 'Loyalty Redemption Expense', group: 'Indirect Expenses',
    note: 'CREATE THIS LEDGER.' },
  'Loan Rebate': { ledger: 'Loan Rebate', group: 'Indirect Expenses', note: 'CREATE THIS LEDGER.' },
  'Scheme Forfeiture Income': { ledger: 'Scheme Forfeiture Income', group: 'Indirect Incomes', note: 'CREATE THIS LEDGER.' },
  'Scheme Bonus Expense': { ledger: 'Scheme Bonus Expense', group: 'Indirect Expenses', note: 'CREATE THIS LEDGER.' },
  'Loans Given': { ledger: 'Loans Given (Girvi)', group: 'Loans & Advances (Asset)',
    note: 'CREATE THIS LEDGER — gold-loan principal outstanding has no native Tally equivalent.' },
  'Interest Income': { ledger: 'Interest on Loans', group: 'Indirect Incomes' },
  'Capital Account': { ledger: 'Capital Account', group: 'Capital Account' },
}

// Fallback Tally parent group by our own AccountType, for any account name not explicitly mapped
// above (e.g. per-category expense ledgers like "Rent Expense" from src/app/api/expenses/route.ts).
const FALLBACK_GROUP: Record<AccountType, string> = {
  asset: 'Current Assets', liability: 'Current Liabilities',
  income: 'Indirect Incomes', expense: 'Indirect Expenses',
  equity: 'Capital Account', unclassified: 'Suspense A/c',
}

function resolveTallyLedger(accountName: string, customerName?: string | null): TallyLedger {
  const isDebtorPool = accountName === 'Sundry Debtors'
  const isCreditorPool = accountName === 'Sundry Creditors'
  if ((isDebtorPool || isCreditorPool) && customerName) {
    return { ledger: customerName, group: isDebtorPool ? 'Sundry Debtors' : 'Sundry Creditors' }
  }
  const mapped = ACCOUNT_TALLY_MAP[accountName]
  if (mapped) return mapped
  // A NAMED bank account (src/app/api/bank/accounts creates one Account row `Bank - <name>` per
  // BankAccount). Per-firm data, so it cannot be enumerated in the map above — but Tally's own
  // convention is one ledger per real bank under Bank Accounts, which is exactly what this is.
  // Without this it would fall through to Suspense A/c, since it is in no static chart either.
  if (accountName.startsWith('Bank - ')) {
    return { ledger: accountName.slice('Bank - '.length), group: 'Bank Accounts' }
  }
  // An off-list expense category ("Tea Expense") is an expense by the same rule the statements use.
  const chart = CHART_OF_ACCOUNTS[accountName] ?? expenseCategoryEntry(accountName)
  const group = chart ? FALLBACK_GROUP[chart.type] : FALLBACK_GROUP.unclassified
  return {
    ledger: accountName, group,
    note: chart
      ? undefined
      : `Not in this app's own chart of accounts either — Tally group defaulted to "${group}" by guesswork. Verify manually before relying on this ledger's placement.`,
  }
}

// VCHTYPE by priority: a single voucher's legs can carry more than one LedgerEntry.type (e.g. a
// sale voucher's GST legs are typed 'sale' while its cash leg is typed 'receipt') — the first match
// below wins, so the invoice/return type always outranks the incidental payment-mode leg type.
const TYPE_PRIORITY: [string, string][] = [
  ['sale-return', 'Credit Note'], ['purchase-return', 'Debit Note'],
  ['sale', 'Sales'], ['purchase', 'Purchase'], ['urd', 'Purchase'],
  ['contra', 'Contra'], ['receipt', 'Receipt'], ['payment', 'Payment'],
]
function voucherTypeFor(types: Set<string>): string {
  for (const [key, vch] of TYPE_PRIORITY) if (types.has(key)) return vch
  return 'Journal'
}

const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const tallyDate = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`

type Group = {
  key: string
  date: Date
  narration: string
  invoiceNo?: string
  legs: { accountName: string; customerId: string | null; debit: number; credit: number; type: string; particulars: string | null }[]
}

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const firmId = searchParams.get('firmId') || ''
  if (!firmId) return NextResponse.json({ error: 'firmId is required' }, { status: 400 })
  if (!(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const denied = await denyUnlessRole(user.id, firmId, MANAGER_ROLES, 'export the whole account book')
  if (denied) return denied
  const fromParam = searchParams.get('from')
  const toParam = searchParams.get('to')
  const fy = financialYear()
  const from = isDay(fromParam) ? dayStart(fromParam) : fy.from
  const to = isDay(toParam) ? dayEnd(toParam) : fy.to
  const asJson = searchParams.get('format') === 'json'

  const firm = await db.firm.findUnique({ where: { id: firmId }, select: { name: true, code: true } })
  if (!firm) return NextResponse.json({ error: 'Firm not found' }, { status: 400 })

  const entries = await db.ledgerEntry.findMany({
    where: { firmId, date: { gte: from, lte: to } },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    select: { voucherId: true, invoiceId: true, customerId: true, accountName: true, date: true, particulars: true, debit: true, credit: true, type: true },
  })

  // Batch-resolve display names for the two dynamic lookups this export needs: customer names
  // (for per-party debtor/creditor ledgers) and invoice numbers (for a human voucher number instead
  // of a raw cuid). Both firmId-scoped, both one query for the whole export.
  const customerIds = Array.from(new Set(entries.map((e) => e.customerId).filter((v): v is string => !!v)))
  const invoiceIds = Array.from(new Set(entries.map((e) => e.invoiceId).filter((v): v is string => !!v)))
  const [customers, invoices] = await Promise.all([
    customerIds.length ? db.customer.findMany({ where: { id: { in: customerIds }, firmId }, select: { id: true, firstName: true, lastName: true } }) : Promise.resolve([]),
    invoiceIds.length ? db.invoice.findMany({ where: { id: { in: invoiceIds }, firmId }, select: { id: true, invoiceNo: true } }) : Promise.resolve([]),
  ])
  const customerName = new Map<string, string>(customers.map((c) => [c.id, [c.firstName, c.lastName].filter(Boolean).join(' ')] as [string, string]))
  const invoiceNo = new Map<string, string>(invoices.map((i) => [i.id, i.invoiceNo] as [string, string]))

  // Group into vouchers. voucherId is the normal case; legacy invoice-era rows with no voucherId
  // (see src/app/api/invoices/route.ts reverseInvoicePostings) are grouped by invoiceId instead —
  // the same fallback that file already documents. Anything with neither cannot be reassembled into
  // a balanced voucher and is reported as skipped rather than guessed at.
  const groups = new Map<string, Group>()
  let skipped = 0
  for (const e of entries) {
    const key = e.voucherId || (e.invoiceId ? `legacy-invoice-${e.invoiceId}` : '')
    if (!key) { skipped++; continue }
    let g = groups.get(key)
    if (!g) {
      g = { key, date: e.date, narration: e.particulars || '', invoiceNo: e.invoiceId ? invoiceNo.get(e.invoiceId) : undefined, legs: [] }
      groups.set(key, g)
    }
    g.legs.push({ accountName: e.accountName, customerId: e.customerId, debit: e.debit, credit: e.credit, type: e.type, particulars: e.particulars })
  }

  const usedLedgers = new Map<string, TallyLedger>() // dedup by ledger name
  const warnings: string[] = []
  if (skipped) warnings.push(`${skipped} ledger row(s) had neither a voucherId nor an invoiceId and could not be grouped into a balanced voucher — excluded from this export.`)

  const voucherXml: string[] = []
  let voucherCount = 0
  for (const g of groups.values()) {
    const totalDebit = g.legs.reduce((s, l) => s + (l.debit || 0), 0)
    const totalCredit = g.legs.reduce((s, l) => s + (l.credit || 0), 0)
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      warnings.push(`Voucher ${g.key} does not balance (Dr ${totalDebit.toFixed(2)} / Cr ${totalCredit.toFixed(2)}) — excluded from this export; investigate in Ledger before importing anything else from this run.`)
      continue
    }
    const types = new Set(g.legs.map((l) => l.type))
    const vchType = voucherTypeFor(types)
    let partyLedgerName = firm.name
    const legXml = g.legs.map((l) => {
      const cust = l.customerId ? customerName.get(l.customerId) : null
      const resolved = resolveTallyLedger(l.accountName, cust)
      usedLedgers.set(resolved.ledger, resolved)
      if (cust && (l.accountName === 'Sundry Debtors' || l.accountName === 'Sundry Creditors')) partyLedgerName = resolved.ledger
      const isDebit = l.debit > 0
      const amount = isDebit ? -l.debit : l.credit
      return `      <ALLLEDGERENTRIES.LIST>\n        <LEDGERNAME>${esc(resolved.ledger)}</LEDGERNAME>\n        <ISDEEMEDPOSITIVE>${isDebit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>\n        <AMOUNT>${amount.toFixed(2)}</AMOUNT>\n      </ALLLEDGERENTRIES.LIST>`
    }).join('\n')
    voucherCount++
    voucherXml.push(
      `    <TALLYMESSAGE xmlns:UDF="TallyUDF">\n` +
      `      <VOUCHER VCHTYPE="${esc(vchType)}" ACTION="Create">\n` +
      `        <DATE>${tallyDate(g.date)}</DATE>\n` +
      `        <VOUCHERTYPENAME>${esc(vchType)}</VOUCHERTYPENAME>\n` +
      `        <VOUCHERNUMBER>${esc(g.invoiceNo || g.key.slice(0, 12))}</VOUCHERNUMBER>\n` +
      `        <PARTYLEDGERNAME>${esc(partyLedgerName)}</PARTYLEDGERNAME>\n` +
      `        <NARRATION>${esc(g.narration)}</NARRATION>\n` +
      legXml + `\n` +
      `      </VOUCHER>\n` +
      `    </TALLYMESSAGE>`,
    )
  }

  const ledgerNotes = Array.from(usedLedgers.values()).filter((l) => l.note)
  if (ledgerNotes.length) {
    warnings.push(...ledgerNotes.map((l) => `Ledger "${l.ledger}" (${l.group}): ${l.note}`))
  }

  if (asJson) {
    return NextResponse.json({
      from: from.toISOString(), to: to.toISOString(),
      voucherCount, ledgerCount: usedLedgers.size,
      ledgers: Array.from(usedLedgers.values()),
      warnings,
    })
  }

  const ledgerXml = Array.from(usedLedgers.values()).map((l) =>
    `    <TALLYMESSAGE xmlns:UDF="TallyUDF">\n      <LEDGER NAME="${esc(l.ledger)}" ACTION="Create">\n        <PARENT>${esc(l.group)}</PARENT>\n      </LEDGER>\n    </TALLYMESSAGE>`,
  ).join('\n')

  const noteComment = warnings.length
    ? `  <!-- Read before importing:\n${warnings.map((w) => `       - ${w}`).join('\n')}\n  -->\n`
    : ''

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<ENVELOPE>\n` +
    `  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>\n` +
    `  <BODY>\n` +
    `    <IMPORTDATA>\n` +
    `      <REQUESTDESC>\n` +
    `        <REPORTNAME>Vouchers</REPORTNAME>\n` +
    `        <STATICVARIABLES><SVCURRENTCOMPANY>${esc(firm.name)}</SVCURRENTCOMPANY></STATICVARIABLES>\n` +
    `      </REQUESTDESC>\n` +
    `      <REQUESTDATA>\n` +
    noteComment +
    ledgerXml + `\n` +
    voucherXml.join('\n') + `\n` +
    `      </REQUESTDATA>\n` +
    `    </IMPORTDATA>\n` +
    `  </BODY>\n` +
    `</ENVELOPE>\n`

  await db.systemLog.create({ data: { userId: user.id, firmId, action: 'export', entity: 'tally', details: `Tally export ${from.toISOString().slice(0, 10)}..${to.toISOString().slice(0, 10)}: ${voucherCount} voucher(s), ${usedLedgers.size} ledger(s)${warnings.length ? `, ${warnings.length} note(s)` : ''}` } })

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="tally-${firm.code}-${from.toISOString().slice(0, 10)}-${to.toISOString().slice(0, 10)}.xml"`,
    },
  })
}
