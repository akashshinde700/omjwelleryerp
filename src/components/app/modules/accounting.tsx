'use client'
import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { PageHeader, EmptyState } from '../shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable, Column } from '../data-table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { api } from '@/lib/api-client'
import { useApp } from '@/store/app'
import { formatINR, formatDate } from '@/lib/format'
import { round2 } from '@/lib/gst'
import { cn } from '@/lib/utils'
import { tillSummary } from '@/lib/accounting'
import { BookOpen, Scale, FileSpreadsheet, BookMarked, Wallet, CreditCard, ArrowLeft } from 'lucide-react'
import { useFirmRole, MANAGER_ONLY_TITLE } from './use-firm-role'

type Period = { from: string; to: string }

/** Current Indian financial year, 1 April – 31 March. Mirrors financialYear() in src/lib/accounting.ts. */
function currentFY(): Period {
  const now = new Date()
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  return { from: `${y}-04-01`, to: `${y + 1}-03-31` }
}

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function today(): Period { const t = isoDay(new Date()); return { from: t, to: t } }
function thisMonth(): Period {
  const n = new Date()
  return { from: isoDay(new Date(n.getFullYear(), n.getMonth(), 1)), to: isoDay(new Date(n.getFullYear(), n.getMonth() + 1, 0)) }
}

/** Native date inputs — no picker dependency, and the browser already localises them.
 *  `initial` is 'fy' for the statements and 'today' for the Day Book (a diary opens on today). */
function usePeriod(initial: 'fy' | 'today' = 'fy') {
  const [period, setPeriod] = useState<Period>(initial === 'today' ? today : currentFY)
  const quick = 'h-9 rounded-md border px-3 text-sm hover:bg-muted'
  const control = (
    <div className="flex flex-wrap items-end gap-3 mb-4">
      <label className="text-xs text-muted-foreground">From
        <input type="date" value={period.from} max={period.to} onChange={(e) => setPeriod({ ...period, from: e.target.value })}
          className="block mt-1 h-9 rounded-md border bg-background px-2 text-sm" />
      </label>
      <label className="text-xs text-muted-foreground">To
        <input type="date" value={period.to} min={period.from} onChange={(e) => setPeriod({ ...period, to: e.target.value })}
          className="block mt-1 h-9 rounded-md border bg-background px-2 text-sm" />
      </label>
      <button type="button" onClick={() => setPeriod(today())} className={quick}>Today</button>
      <button type="button" onClick={() => setPeriod(thisMonth())} className={quick}>This month</button>
      <button type="button" onClick={() => setPeriod(currentFY())} className={quick}>This FY</button>
    </div>
  )
  return { period, control }
}

/** `extra` carries the entries-list filters — account / type / skip / tender. Statements ignore them. */
function useLedger(period?: Period, extra?: Record<string, string | undefined>) {
  const { activeFirmId } = useApp()
  return useQuery({
    queryKey: ['ledger', activeFirmId, period?.from, period?.to, extra],
    queryFn: () => api<any>('/api/ledger', { search: { firmId: activeFirmId!, ...(period || {}), ...(extra || {}) } }),
    enabled: !!activeFirmId,
  })
}

/**
 * The books not tying is a P1 defect, not a footnote. Every statement view renders this, because a
 * silently wrong total is far worse than a visible discrepancy someone can act on.
 */
function BooksWarning({ data }: { data: any }) {
  const warnings: string[] = data?.warnings || []
  if (!warnings.length) return null
  return (
    <div className="mb-4 rounded-md border border-rose-300 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 p-3">
      <p className="text-sm font-semibold text-rose-700 dark:text-rose-400">These books do not tie — figures below are unreliable</p>
      <ul className="mt-1 list-disc pl-5 text-xs text-rose-700 dark:text-rose-300 space-y-1">
        {warnings.map((w, i) => <li key={i}>{w}</li>)}
      </ul>
    </div>
  )
}

/** A balance with the side it actually sits on. A credit balance on cash is an overdraft, not a minus sign. */
const signedINR = (n: number) => (n < 0 ? `${formatINR(Math.abs(n))} Cr` : formatINR(n))

function PeriodNote({ data }: { data: any }) {
  return <p className="mb-3 text-xs text-muted-foreground">Period: {data?.periodLabel || '—'}</p>
}

/**
 * The 200-row window, with a way out of it. `skip` has always worked server-side
 * (src/app/api/ledger/route.ts) but nothing drove it, so the honest "showing the 200 most recent of
 * 4,312" notice was a dead end: there was no way to reach leg 201. Statement totals are unaffected
 * either way — they are summed in SQL over the whole range, never over this window.
 */
function Pager({ data, skip, onSkip }: { data: any; skip: number; onSkip: (n: number) => void }) {
  const total = data?.entriesTotal ?? 0
  const shown = data?.entries?.length ?? 0
  const limit = data?.entriesLimit ?? 200
  if (total <= shown && skip === 0) return null
  const first = total === 0 ? 0 : skip + 1
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
      <span>Entries {first}–{skip + shown} of {total}, newest first. Statement totals above are computed over all {total}.</span>
      <span className="flex gap-1">
        <button type="button" disabled={skip === 0} onClick={() => onSkip(0)} className="rounded border px-2 py-1 hover:bg-muted disabled:opacity-40">Newest</button>
        <button type="button" disabled={skip === 0} onClick={() => onSkip(Math.max(0, skip - limit))} className="rounded border px-2 py-1 hover:bg-muted disabled:opacity-40">Newer</button>
        <button type="button" disabled={skip + shown >= total} onClick={() => onSkip(skip + limit)} className="rounded border px-2 py-1 hover:bg-muted disabled:opacity-40">Older</button>
      </span>
    </div>
  )
}

export function DayBookModule() {
  const { period, control } = usePeriod('today')
  const [skip, setSkip] = useState(0)
  const [type, setType] = useState('')
  // `tender=1` asks for the sales tender mix; it is one extra aggregate and only this screen wants it.
  const { data } = useLedger(period, { skip: String(skip), type: type || undefined, tender: '1' })
  const entries = data?.entries || []
  return (
    <div>
      <PageHeader title="Day Book" hindi="दैनिक बही" desc="Daily diary of all transactions" />
      {control}
      <BooksWarning data={data} />
      <TillBlock data={data} />
      <TenderMixBlock data={data} />
      <div className="mb-4">
        <VoucherSelect value={type} onChange={(v) => { setType(v); setSkip(0) }} />
      </div>
      <Card><CardContent className="p-0">
        <DataTable data={entries} columns={dayColumns} searchKeys={['particulars', 'accountName', 'type']} searchPlaceholder="Search transactions…" />
        <Pager data={data} skip={skip} onSkip={setSkip} />
      </CardContent></Card>
    </div>
  )
}

/**
 * A native select, not DataTable's `filters` prop and not the Radix Select behind it: this filter
 * needs an "All vouchers" option, Radix refuses an empty-string item value, and the filter is
 * SERVER-side anyway (it changes the query, not the visible rows) so it does not belong inside the
 * table's own toolbar. Same control as the Ledger panel's, so the two screens filter identically.
 */
function VoucherSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="text-xs text-muted-foreground">Voucher
      <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 block h-9 rounded-md border bg-background px-2 text-sm">
        {VOUCHER_FILTER.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

/**
 * Every voucher type the posting layer writes (VOUCHER_TYPES in src/lib/ledger.ts). This is what
 * "categorised ledger" means in our books: a voucher's TYPE, which postVoucher stamps on every leg,
 * not a category guessed from an account name. Filters the entries list only — the API refuses to
 * let it anywhere near the statements, because dropping one leg of a voucher cannot tie.
 */
const VOUCHER_FILTER = [
  { value: '', label: 'All vouchers' },
  { value: 'sale', label: 'Sales' }, { value: 'purchase', label: 'Purchases' }, { value: 'urd', label: 'URD purchases' },
  { value: 'receipt', label: 'Receipts' }, { value: 'payment', label: 'Payments' }, { value: 'contra', label: 'Contra' },
  { value: 'loan', label: 'Gold loan' }, { value: 'udhaar', label: 'Udhaar' }, { value: 'scheme', label: 'Schemes' },
  { value: 'expense', label: 'Expenses' }, { value: 'journal', label: 'Journal' }, { value: 'opening', label: 'Opening' },
]

/**
 * Closing the till: what cash, bank and uncleared cheques opened at, what came in, what went out,
 * what they close at. Folded by tillSummary() from the trial-balance rows this response already
 * carries, so it cannot disagree with the trial balance — and it costs no extra query.
 *
 * There is no CARD or ONLINE column here on purpose: both tenders post to the bank account, so the
 * books do not hold that distinction. It is in the block below, from the bills, where it is true.
 */
function TillBlock({ data }: { data: any }) {
  const rows = tillSummary(data?.trialBalance || [])
  if (!data?.trialBalance) return null
  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2"><Wallet className="size-4 text-amber-600" /> What moved in the books
          <span className="text-xs font-normal text-muted-foreground">{data?.periodLabel} · cash, bank &amp; uncleared cheques</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-muted/50"><tr>
            <th className="p-2 text-left font-medium text-muted-foreground">Tender</th>
            <th className="p-2 text-right font-medium text-muted-foreground">Opening</th>
            <th className="p-2 text-right font-medium text-muted-foreground">In</th>
            <th className="p-2 text-right font-medium text-muted-foreground">Out</th>
            <th className="p-2 text-right font-medium text-muted-foreground">Net</th>
            <th className="p-2 text-right font-medium text-muted-foreground">Closing</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.group} className={`border-t ${r.group === 'total' ? 'bg-muted/30 font-bold' : ''}`}>
                <td className="p-2">{r.label}</td>
                <td className="p-2 text-right">{signedINR(r.opening)}</td>
                <td className="p-2 text-right text-emerald-600">{r.in ? formatINR(r.in) : '—'}</td>
                <td className="p-2 text-right text-rose-600">{r.out ? formatINR(r.out) : '—'}</td>
                <td className="p-2 text-right">{signedINR(r.net)}</td>
                <td className="p-2 text-right font-semibold">{signedINR(r.closing)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">Opening + In − Out = Closing, per row. These are the same figures the trial balance foots; a Cr (negative) closing on cash or bank is an overdraft.</p>
      </CardContent>
    </Card>
  )
}

/**
 * How customers PAID — cash / card / UPI / cheque — summed from the bills dated in this range.
 *
 * DELIBERATELY NOT COMPARABLE WITH THE BLOCK ABOVE, and labelled so no one tries. That one is what
 * moved through the money accounts in this range; this one is how bills dated in this range were
 * paid. They differ for ordinary, correct reasons: a receipt collected today against last month's
 * bill moves the books today and belongs to last month's mix, and a credit sale is billed with no
 * tender at all. Nothing here is added to anything there, and the two are never placed in one total.
 *
 * This is the only place card and UPI can be told apart: `Invoice.amountByCard` / `amountByUPI`
 * (prisma/schema.prisma:785-788), recorded on every bill ever raised and, until now, never shown.
 */
function TenderMixBlock({ data }: { data: any }) {
  const mix = data?.tenderMix
  if (!mix) return null
  const { sale, saleReturn } = mix
  if (!sale.invoices && !saleReturn.invoices) return null
  // `sign` is -1 for refunds: money handed BACK to a customer must not sit in the same positive
  // column as money taken in, or the two rows read as figures to add together. A net row follows.
  const line = (label: string, m: any, sign: 1 | -1 = 1) => (
    <tr className="border-t">
      <td className="p-2">{label} <span className="text-xs text-muted-foreground">({m.invoices})</span></td>
      {(['cash', 'card', 'upi', 'cheque'] as const).map((k) => (
        <td key={k} className={cn('p-2 text-right', sign < 0 && m[k] && 'text-rose-600')}>{m[k] ? formatINR(sign * m[k]) : '—'}</td>
      ))}
      <td className={cn('p-2 text-right font-semibold', sign < 0 && 'text-rose-600')}>{formatINR(sign * m.tendered)}</td>
    </tr>
  )
  // Billed − tendered − old gold. Positive = still on credit; NEGATIVE = customers handed over more
  // than the bills came to, which the posting layer holds on Customer Advances. Both happen in a
  // real shop and the sentence below says which one this is rather than leaving the gap dangling.
  const unsettled = round2(sale.billed - sale.tendered - sale.gold)
  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2"><CreditCard className="size-4 text-violet-600" /> How customers paid
          <span className="text-xs font-normal text-muted-foreground">from the bills dated in this range — not a ledger figure</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-muted/50"><tr>
            <th className="p-2 text-left font-medium text-muted-foreground">Bills</th>
            <th className="p-2 text-right font-medium text-muted-foreground">Cash</th>
            <th className="p-2 text-right font-medium text-muted-foreground">Card</th>
            <th className="p-2 text-right font-medium text-muted-foreground">UPI</th>
            <th className="p-2 text-right font-medium text-muted-foreground">Cheque</th>
            <th className="p-2 text-right font-medium text-muted-foreground">Tendered</th>
          </tr></thead>
          <tbody>
            {line('Sales', sale)}
            {saleReturn.invoices > 0 && line('Sale returns (refunded)', saleReturn, -1)}
            {saleReturn.invoices > 0 && (
              <tr className="border-t-2 bg-muted/30 font-bold">
                <td className="p-2">Net taken from customers</td>
                {(['cash', 'card', 'upi', 'cheque'] as const).map((k) => (
                  <td key={k} className="p-2 text-right">{round2(sale[k] - saleReturn[k]) ? formatINR(round2(sale[k] - saleReturn[k])) : '—'}</td>
                ))}
                <td className="p-2 text-right">{formatINR(round2(sale.tendered - saleReturn.tendered))}</td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          Bills dated in this range total {formatINR(sale.billed)}; {formatINR(sale.tendered)} was tendered
          {sale.gold ? `, ${formatINR(sale.gold)} taken in old gold` : ''}
          {unsettled > 0 ? `, and ${formatINR(unsettled)} is unsettled — on credit, collected on its own date.` : ''}
          {unsettled < 0 ? `, and ${formatINR(-unsettled)} more was tendered than billed — held as customer advance.` : ''}
          {unsettled === 0 ? '.' : ''}
          {' '}This block is about bills, not about the books: do not add it to the block above, and do not expect the two to agree.
        </p>
      </CardContent>
    </Card>
  )
}

export function JournalBookModule() {
  const { period, control } = usePeriod()
  const [skip, setSkip] = useState(0)
  const { data } = useLedger(period, { skip: String(skip) })
  const entries = data?.entries || []
  // Journal book groups by date and shows debit/credit entries in journal format
  const grouped = entries.reduce((acc: any, e: any) => {
    const dateKey = formatDate(e.date)
    if (!acc[dateKey]) acc[dateKey] = []
    acc[dateKey].push(e)
    return acc
  }, {})
  const dates = Object.keys(grouped).sort().reverse()
  /**
   * "This date does not tie" is only sayable when every leg in the range is on screen. The list is
   * newest-first and paged, so a page boundary ordinarily falls inside a date — flagging that date
   * as unbalanced would be an accusation against the books created by the pagination. A whole date
   * is either wholly in the window or not: from/to are day boundaries, so completeness is enough.
   */
  const complete = skip === 0 && entries.length >= (data?.entriesTotal ?? 0)

  return (
    <div>
      <PageHeader title="Journal Book" hindi="बहीखाता" desc="Journal entries grouped by date (double-entry format)" />
      {control}
      <BooksWarning data={data} />
      {!complete && entries.length > 0 && (
        <p className="mb-3 text-xs text-muted-foreground">Showing one page of this range, so each date&apos;s Dr/Cr totals below may be part of a date that continues on the next page — the per-date balance check is suppressed. Narrow the date range to check it.</p>
      )}
      <div className="space-y-4">
        {dates.length === 0 && <Card><CardContent className="py-12 text-center text-muted-foreground"><BookMarked className="size-12 mx-auto mb-2 opacity-30" />No journal entries yet</CardContent></Card>}
        {dates.map(date => {
          const dr = round2(grouped[date].reduce((s: number, e: any) => s + (e.debit || 0), 0))
          const cr = round2(grouped[date].reduce((s: number, e: any) => s + (e.credit || 0), 0))
          const ties = round2(dr - cr) === 0
          return (
          <Card key={date}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-amber-700 dark:text-amber-400">
                {date}
                {complete && (ties
                  ? <span className="ml-2 text-xs font-normal text-muted-foreground">balanced ✓</span>
                  : <span className="ml-2 text-xs font-semibold text-rose-600">DOES NOT TIE — out by {formatINR(round2(dr - cr))}</span>)}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2 font-medium text-muted-foreground">Account</th>
                    <th className="text-left p-2 font-medium text-muted-foreground">Particulars</th>
                    <th className="text-right p-2 font-medium text-muted-foreground">Debit (Dr)</th>
                    <th className="text-right p-2 font-medium text-muted-foreground">Credit (Cr)</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped[date].map((e: any) => (
                    <tr key={e.id} className="border-t">
                      <td className="p-2 font-medium">{e.accountName}</td>
                      <td className="p-2 text-xs text-muted-foreground">{e.particulars || '—'}</td>
                      <td className="p-2 text-right">{e.debit ? formatINR(e.debit) : '—'}</td>
                      <td className="p-2 text-right">{e.credit ? formatINR(e.credit) : '—'}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 bg-muted/30 font-bold">
                    <td colSpan={2} className="p-2 text-right">Total</td>
                    <td className="p-2 text-right text-emerald-600">{formatINR(dr)}</td>
                    <td className="p-2 text-right text-rose-600">{formatINR(cr)}</td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
          )
        })}
        <Pager data={data} skip={skip} onSkip={setSkip} />
      </div>
    </div>
  )
}

/**
 * The Ledger panel. It used to hold three tabs — All Entries, Trial Balance, Profit & Loss — two of
 * which are their own tabs in The Books, so the panel duplicated two screens and contained no
 * actual ledger: there was nowhere in the application to read ONE account's history. Pick an
 * account here and that is what you get; leave it on "All accounts" for the flat book.
 *
 * Grouped by voucher type rather than by oMunim's Stock/Sell/Purchase/Gold/Tax/Loan sub-tabs: the
 * type is on every leg because postVoucher put it there, whereas those categories would have to be
 * guessed from account names. The metal, tax and loan registers live on their own screens already.
 */
export function LedgerModule() {
  const { period, control } = usePeriod()
  const [account, setAccount] = useState('')
  const [type, setType] = useState('')
  const [skip, setSkip] = useState(0)
  // 500 (the cap) when one account is selected: the running balance is drawn only when every leg of
  // the range is on screen, so the higher limit is what makes it available for most real ranges.
  const { data } = useLedger(period, { account: account || undefined, type: type || undefined, skip: String(skip), limit: account ? '500' : undefined })
  const entries = data?.entries || []
  // The statements in this response ignore the entries filters by design, so the account list is
  // complete whatever is selected — no second request to populate the dropdown.
  const accounts: any[] = data?.trialBalance || []
  return (
    <div>
      <PageHeader title="Ledger Book" hindi="खाता बही" desc="One account's history, or the whole book" />
      {control}
      <BooksWarning data={data} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">Account
          <select value={account} onChange={(e) => { setAccount(e.target.value); setSkip(0) }} className="mt-1 block h-9 max-w-xs rounded-md border bg-background px-2 text-sm">
            <option value="">All accounts</option>
            {accounts.map((a) => <option key={`${a.code}-${a.name}`} value={a.name}>{a.code} · {a.name}</option>)}
          </select>
        </label>
        <VoucherSelect value={type} onChange={(v) => { setType(v); setSkip(0) }} />
      </div>
      {account
        ? <AccountLedgerView data={data} account={account} skip={skip} onSkip={setSkip} typeFiltered={!!type} />
        : (
          <Card><CardContent className="p-0">
            <DataTable data={entries} columns={ledgerColumns} searchKeys={['accountName', 'particulars']} searchPlaceholder="Search ledger…" />
            <Pager data={data} skip={skip} onSkip={setSkip} />
          </CardContent></Card>
        )}
    </div>
  )
}

/**
 * ONE account, as an accountant reads it: brought-forward balance, the legs, closing balance, and
 * the arithmetic between them written out so it can be checked by eye.
 *
 * Opening, period debit and period credit come from this account's TRIAL BALANCE row — summed in
 * SQL over the whole range — never from the visible legs. That is what makes the figures here
 * identical to the trial-balance row this view is opened from.
 *
 * THE RUNNING BALANCE COLUMN IS CONDITIONAL, and that is the whole point. The entries list is
 * newest-first and capped (500 here), so over a long range the visible legs are a window on the
 * middle of the account's history and a running balance computed over them would be a confident
 * wrong number. It is shown only when every leg in the range is on screen; otherwise the column is
 * withheld and the reason is printed. A missing column is recoverable, a wrong one is not.
 */
function AccountLedgerView({ data, account, skip, onSkip, typeFiltered }: {
  data: any; account: string; skip: number; onSkip: (n: number) => void; typeFiltered: boolean
}) {
  const row = (data?.trialBalance || []).find((r: any) => r.name === account)
  const legs: any[] = data?.entries || []
  const total = data?.entriesTotal ?? 0
  const opening = row ? round2(row.openingDebit - row.openingCredit) : 0
  const periodDebit = row?.periodDebit ?? 0
  const periodCredit = row?.periodCredit ?? 0
  const closing = row ? round2(row.debit - row.credit) : 0
  // Complete = this page holds every leg of the range, so a running balance is arithmetic on all of
  // it. A voucher-type filter also makes it a subset of the account, so no running balance then.
  const complete = skip === 0 && legs.length >= total && !typeFiltered
  // Oldest first for the running balance, then flipped back: the table reads newest-first like the
  // rest of The Books, while the balance accumulates in the only order it means anything in.
  const withBalance = (() => {
    if (!complete) return legs
    let bal = opening
    const asc = [...legs].reverse().map((l) => {
      bal = round2(bal + (l.debit || 0) - (l.credit || 0))
      return { ...l, running: bal }
    })
    return asc.reverse()
  })()
  // The legs on screen must agree with the SQL totals when every one of them is on screen. If they
  // do not, something is wrong with this view, not with the books — say so rather than show both.
  const legDebit = complete ? round2(legs.reduce((s, l) => s + (l.debit || 0), 0)) : null
  const legCredit = complete ? round2(legs.reduce((s, l) => s + (l.credit || 0), 0)) : null
  const mismatch = complete && (legDebit !== round2(periodDebit) || legCredit !== round2(periodCredit))

  const columns: Column<any>[] = [
    ...dayColumns.filter((c) => c.key !== 'accountName'),
    ...(complete ? [{ key: 'running', header: 'Balance', numeric: true, render: (l: any) => <span className="font-semibold">{signedINR(l.running)}</span> }] : []),
  ]
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <BookOpen className="size-4 text-amber-600" />
          <span className="font-mono text-xs text-amber-600">{row?.code ?? '?'}</span> {account}
          <span className="text-xs font-normal capitalize text-muted-foreground">{row?.type ?? 'no account row'} · {data?.periodLabel}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 border-b px-4 py-3 text-sm tabular-nums sm:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">Opening</p><p className="font-semibold">{signedINR(opening)}</p></div>
          <div><p className="text-xs text-muted-foreground">Debit this period</p><p className="font-semibold text-emerald-600">{formatINR(periodDebit)}</p></div>
          <div><p className="text-xs text-muted-foreground">Credit this period</p><p className="font-semibold text-rose-600">{formatINR(periodCredit)}</p></div>
          <div><p className="text-xs text-muted-foreground">Closing</p><p className="font-semibold">{signedINR(closing)}</p></div>
        </div>
        <p className="border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground tabular-nums">
          {signedINR(opening)} + {formatINR(periodDebit)} − {formatINR(periodCredit)} = <span className="font-semibold text-foreground">{signedINR(closing)}</span>
          {' '}· the same figures as this account&apos;s trial balance row, summed in SQL over the whole range
        </p>
        {mismatch && (
          <p className="border-b bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-950/30 dark:text-rose-400">
            The legs listed below total Dr {formatINR(legDebit!)} / Cr {formatINR(legCredit!)}, which does not match the Dr {formatINR(periodDebit)} / Cr {formatINR(periodCredit)} above. Trust the figures above — they are the aggregate — and report this screen.
          </p>
        )}
        {!complete && (
          <p className="border-b px-4 py-2 text-xs text-muted-foreground">
            No running balance column: {typeFiltered ? 'a voucher filter is on, so these are some of the account\'s legs, not all of them' : `${total} legs in this range, ${legs.length} on this page`}. The opening, debit, credit and closing figures above are unaffected — they are summed over the whole range. Narrow the date range to get the running balance.
          </p>
        )}
        <DataTable data={withBalance} columns={columns} searchKeys={['particulars', 'type']} searchPlaceholder="Search this account…" />
        <Pager data={data} skip={skip} onSkip={onSkip} />
      </CardContent>
    </Card>
  )
}

export function TrialBalanceModule() {
  const { period, control } = usePeriod()
  const [account, setAccount] = useState('')
  const [skip, setSkip] = useState(0)
  // The drill-down re-reads with `account` set; the statements in the response are identical either
  // way, so the figures in the account view are the figures of the row that was clicked.
  const { data } = useLedger(period, account ? { account, skip: String(skip), limit: '500' } : undefined)
  return (
    <div>
      <PageHeader title="Trial Balance" hindi="तलपत" desc="Opening, debit, credit and closing by account" />
      {control}
      <BooksWarning data={data} />
      {account ? (
        <div>
          <button type="button" onClick={() => { setAccount(''); setSkip(0) }} className="mb-3 inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-muted">
            <ArrowLeft className="size-3.5" /> Trial Balance
          </button>
          <AccountLedgerView data={data} account={account} skip={skip} onSkip={setSkip} typeFiltered={false} />
        </div>
      ) : (
        <Tabs defaultValue="tb">
          <TabsList className="mb-4"><TabsTrigger value="tb">Trial Balance</TabsTrigger><TabsTrigger value="coa">Chart of Accounts</TabsTrigger></TabsList>
          <TabsContent value="tb"><TrialBalanceView data={data} onAccount={(n) => { setAccount(n); setSkip(0) }} /></TabsContent>
          <TabsContent value="coa"><ChartOfAccountsView /></TabsContent>
        </Tabs>
      )}
    </div>
  )
}

/**
 * Chart of accounts - the first screen for it. /api/accounts POST and DELETE existed with no
 * consumer but a dropdown, so an account could only be added or corrected by a developer editing
 * the seed. A misfiled `type` silently moves real money onto the wrong statement
 * (src/lib/accounting.ts places every account by its type alone), so it has to be fixable in the
 * shop rather than in a release.
 *
 * Delete is refused server-side once anything is posted - deactivating is the correction for a
 * live account - and renaming is not offered at all, because posted legs address their account by
 * name as well as by id.
 */
const ACCOUNT_TYPE_OPTIONS = ['asset', 'liability', 'income', 'expense', 'equity'] as const
const BLANK_ACCOUNT = { code: '', name: '', type: 'expense' as (typeof ACCOUNT_TYPE_OPTIONS)[number], openingBalance: '0', balanceType: 'debit' as 'debit' | 'credit' }

function ChartOfAccountsView() {
  const { activeFirmId } = useApp()
  const { isManager } = useFirmRole()
  const qc = useQueryClient()
  const [form, setForm] = useState(BLANK_ACCOUNT)
  const [open, setOpen] = useState(false)

  const { data } = useQuery({
    queryKey: ['accounts', activeFirmId],
    queryFn: () => api<{ accounts: any[] }>('/api/accounts', { search: { firmId: activeFirmId! } }),
    enabled: !!activeFirmId,
  })
  const accounts = data?.accounts || []
  // The ledger is refetched too: adding or retyping an Account row reclassifies existing legs.
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['accounts'] }); qc.invalidateQueries({ queryKey: ['ledger'] }) }

  const create = useMutation({
    mutationFn: (body: any) => api('/api/accounts', { method: 'POST', body }),
    onSuccess: () => { toast.success('Account added'); setForm(BLANK_ACCOUNT); setOpen(false); invalidate() },
    onError: (e: any) => toast.error(e.message || 'Could not add account'),
  })
  const patch = useMutation({
    mutationFn: (body: any) => api('/api/accounts', { method: 'PUT', body }),
    onSuccess: () => { toast.success('Account updated'); invalidate() },
    onError: (e: any) => toast.error(e.message || 'Could not update account'),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api('/api/accounts', { method: 'DELETE', search: { id } }),
    onSuccess: () => { toast.success('Account deleted'); invalidate() },
    onError: (e: any) => toast.error(e.message || 'Could not delete account'),
  })

  const field = 'h-9 rounded-md border bg-background px-2 text-sm'
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2"><BookOpen className="size-4 text-amber-600" /> Chart of Accounts ({accounts.length})</CardTitle>
        <button type="button" onClick={() => setOpen((v) => !v)} className="h-9 rounded-md border px-3 text-sm hover:bg-muted">{open ? 'Cancel' : 'New account'}</button>
      </CardHeader>
      <CardContent className="p-0">
        {open && (
          <form
            className="flex flex-wrap items-end gap-2 border-b p-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (!activeFirmId) return
              create.mutate({ ...form, firmId: activeFirmId, openingBalance: Number(form.openingBalance) || 0 })
            }}
          >
            <label className="text-xs text-muted-foreground">Code<input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={`block mt-1 w-24 ${field}`} placeholder="5300" /></label>
            <label className="text-xs text-muted-foreground">Name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`block mt-1 w-56 ${field}`} placeholder="Packing Expense" /></label>
            <label className="text-xs text-muted-foreground">Type
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as any, balanceType: e.target.value === 'asset' || e.target.value === 'expense' ? 'debit' : 'credit' })} className={`block mt-1 ${field}`}>
                {ACCOUNT_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">Opening<input type="number" step="0.01" min="0" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} className={`block mt-1 w-32 ${field}`} /></label>
            <label className="text-xs text-muted-foreground">Dr/Cr
              <select value={form.balanceType} onChange={(e) => setForm({ ...form, balanceType: e.target.value as any })} className={`block mt-1 ${field}`}><option value="debit">debit</option><option value="credit">credit</option></select>
            </label>
            <button type="submit" disabled={create.isPending} className="h-9 rounded-md bg-amber-600 px-4 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">{create.isPending ? 'Saving...' : 'Add'}</button>
            <p className="w-full text-xs text-muted-foreground">An opening balance entered on one side alone unbalances the books - post the matching side on another account, or leave it at 0.</p>
          </form>
        )}
        {accounts.length === 0
          ? <EmptyState icon={BookOpen} title="No accounts yet" desc="Statements fall back to the built-in chart until this firm has its own" />
          : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr>
                <th className="text-left p-2 font-medium text-muted-foreground">Code</th>
                <th className="text-left p-2 font-medium text-muted-foreground">Name</th>
                <th className="text-left p-2 font-medium text-muted-foreground">Type</th>
                <th className="text-right p-2 font-medium text-muted-foreground">Opening</th>
                <th className="text-left p-2 font-medium text-muted-foreground">Status</th>
                <th className="p-2" />
              </tr></thead>
              <tbody>
                {accounts.map((a: any) => (
                  <tr key={a.id} className={`border-t ${a.active ? '' : 'opacity-50'}`}>
                    <td className="p-2 font-mono text-xs text-amber-600">{a.code}</td>
                    <td className="p-2">{a.name}</td>
                    <td className="p-2">
                      <select value={a.type} disabled={isManager === false} title={isManager === false ? MANAGER_ONLY_TITLE : undefined} onChange={(e) => patch.mutate({ id: a.id, type: e.target.value })} className="h-8 rounded-md border bg-background px-1 text-xs capitalize disabled:opacity-50">
                        {ACCOUNT_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td className="p-2 text-right">{a.openingBalance ? `${formatINR(a.openingBalance)} ${a.balanceType === 'credit' ? 'Cr' : 'Dr'}` : '—'}</td>
                    <td className="p-2 text-xs">{a.active ? 'active' : 'inactive'}</td>
                    <td className="p-2 text-right whitespace-nowrap">
                      <button type="button" disabled={isManager === false} title={isManager === false ? MANAGER_ONLY_TITLE : undefined} onClick={() => patch.mutate({ id: a.id, active: !a.active })} className="rounded border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50 disabled:hover:bg-transparent">{a.active ? 'Deactivate' : 'Activate'}</button>
                      <button type="button" disabled={isManager === false} title={isManager === false ? MANAGER_ONLY_TITLE : undefined} onClick={() => remove.mutate(a.id)} className="ml-2 rounded border px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-50 disabled:hover:bg-transparent">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </CardContent>
    </Card>
  )
}

export function PLModule() {
  const { period, control } = usePeriod()
  const { data } = useLedger(period)
  return <div><PageHeader title="Profit & Loss" hindi="लाभ-हानि" desc="Income statement" />{control}<BooksWarning data={data} /><PLView data={data} /></div>
}

export function BalanceSheetModule() {
  const { period, control } = usePeriod()
  const { data } = useLedger(period)
  const tb = data?.trialBalance || []
  /**
   * Place each account on the side its balance ACTUALLY sits on, not the side its type implies.
   * An overdrawn `Cash in Hand` — the normal state of a girvi shop once disbursals exceed receipts —
   * is a credit balance on an asset account: it is an overdraft and belongs under liabilities.
   * The old code summed only `debit` on assets and only `credit` on liabilities, so such a balance
   * contributed to neither side and the sheet could not balance even when the trial balance tied.
   */
  const bs = tb.filter((a: any) => a.type === 'asset' || a.type === 'liability' || a.type === 'equity')
  const assets = bs.filter((a: any) => a.debit > 0)
  const liabEquity = bs.filter((a: any) => a.credit > 0)
  const totalAssets = round2(assets.reduce((s: number, a: any) => s + a.debit, 0))
  // Books are never closed here, so prior years' result is carried as retained earnings, not lost
  const retained = data?.openingProfitLoss?.net || 0
  const netProfit = data?.profitLoss?.net || 0
  const totalLiabEquity = round2(liabEquity.reduce((s: number, a: any) => s + a.credit, 0) + retained + netProfit)
  const diff = round2(totalAssets - totalLiabEquity)
  return (
    <div>
      <PageHeader title="Balance Sheet" hindi="तुलना पत्र" desc="Assets, liabilities & equity" />
      {control}
      <BooksWarning data={data} />
      <PeriodNote data={data} />
      <div className="grid lg:grid-cols-2 gap-4">
        <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Scale className="size-4 text-emerald-600" /> Assets</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {assets.map((a: any, i: number) => <Row key={`asset-${i}-${a.code}`} code={a.code} name={a.type === 'asset' ? a.name : `${a.name} (advance paid)`} amount={a.debit} />)
            }<div className="flex justify-between font-bold border-t pt-2 mt-2"><span>Total Assets</span><span className="text-emerald-600">{formatINR(totalAssets)}</span></div>
          </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Scale className="size-4 text-rose-600" /> Liabilities & Equity</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {liabEquity.map((a: any, i: number) => <Row key={`liab-${i}-${a.code}`} code={a.code} name={a.type === 'asset' ? `${a.name} (overdrawn)` : a.name} amount={a.credit} />)
            }{retained !== 0 && <Row code="P&L b/f" name={`Retained earnings brought forward${retained < 0 ? ' — accumulated loss' : ''}`} amount={retained} />}
            <Row code="P&L" name={`Profit & Loss A/c (current period)${netProfit < 0 ? ' — loss' : ''}`} amount={netProfit} />
            <div className="flex justify-between font-bold border-t pt-2 mt-2"><span>Total Liabilities + Equity</span><span className="text-rose-600">{formatINR(totalLiabEquity)}</span></div>
          </CardContent></Card>
      </div>
      <p className={`mt-3 text-xs ${diff === 0 ? 'text-muted-foreground' : 'text-rose-600 font-medium'}`}>
        {diff === 0 ? 'Balanced: assets = liabilities + equity + retained earnings + current-period profit.' : `Out of balance by ${formatINR(diff)} — assets ${formatINR(totalAssets)} vs liabilities + equity ${formatINR(totalLiabEquity)}. This is the trial balance difference: the underlying ledger legs do not balance.`}
      </p>
    </div>
  )
}

function useInvoicesByType(type: 'sale' | 'purchase' | 'urd') {
  const { activeFirmId } = useApp()
  // `type` is always sent explicitly — never rely on the API default, a tax report must not move silently
  return useQuery({
    queryKey: ['gst-inv', activeFirmId, type],
    queryFn: () => api<{ invoices: any[] }>('/api/invoices', { search: { firmId: activeFirmId!, status: 'completed', type } }),
    enabled: !!activeFirmId,
  })
}
const sumBy = (rows: any[], key: string) => rows.reduce((s, r) => s + (r[key] || 0), 0)
/**
 * One invoice's taxable value, as STORED. The old inline `subtotal - discount` is only the taxable
 * value on a tax-EXCLUSIVE bill; under "Tax by value" the GST was extracted out of those amounts,
 * so the formula overstates it — and this is the figure a GST return is filed on. Rows written
 * before the column existed have 0 and fall back, which is exact for them: they are all exclusive.
 */
const rowTaxable = (r: any) => Number(r.taxableValue) > 0 ? Number(r.taxableValue) : (Number(r.subtotal) || 0) - (Number(r.discount) || 0)
const taxableOf = (rows: any[]) => rows.reduce((s, r) => s + rowTaxable(r), 0)

export function GstModule() {
  const { data: saleData } = useInvoicesByType('sale')
  const { data: purchaseData } = useInvoicesByType('purchase')
  const { data: urdData } = useInvoicesByType('urd')
  const sales = saleData?.invoices || []
  const purchases = purchaseData?.invoices || []
  const urd = urdData?.invoices || []

  const outCGST = sumBy(sales, 'cgst'), outSGST = sumBy(sales, 'sgst'), outIGST = sumBy(sales, 'igst')
  const outTotal = outCGST + outSGST + outIGST
  // URD purchases carry no GST and give no input tax credit — they are deliberately not in this sum
  const inCGST = sumBy(purchases, 'cgst'), inSGST = sumBy(purchases, 'sgst'), inIGST = sumBy(purchases, 'igst')
  const inTotal = inCGST + inSGST + inIGST
  const net = outTotal - inTotal

  return (
    <div>
      <PageHeader title="GST Report" hindi="जीएसटी" desc="Output tax, input credit & net GST payable" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Taxable Sales</p><p className="text-xl font-bold">{formatINR(taxableOf(sales))}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Output CGST</p><p className="text-xl font-bold text-amber-600">{formatINR(outCGST)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Output SGST</p><p className="text-xl font-bold text-emerald-600">{formatINR(outSGST)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Output Tax (incl. IGST)</p><p className="text-xl font-bold text-violet-600">{formatINR(outTotal)}</p></CardContent></Card>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Taxable Purchases</p><p className="text-xl font-bold">{formatINR(taxableOf(purchases))}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Input CGST</p><p className="text-xl font-bold text-amber-600">{formatINR(inCGST)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Input SGST</p><p className="text-xl font-bold text-emerald-600">{formatINR(inSGST)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Input Credit (incl. IGST)</p><p className="text-xl font-bold text-violet-600">{formatINR(inTotal)}</p></CardContent></Card>
      </div>
      <Card className="mb-4 border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20">
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Net GST Payable</p>
            <p className="text-xs text-muted-foreground">Output tax {formatINR(outTotal)} − input credit {formatINR(inTotal)} · URD purchases carry no ITC</p>
          </div>
          <p className={`text-2xl font-bold ${net >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{formatINR(Math.abs(net))}{net < 0 ? ' (credit)' : ''}</p>
        </CardContent>
      </Card>
      <Tabs defaultValue="sales">
        <TabsList className="mb-3 max-w-full justify-start overflow-x-auto nice-scroll">
          <TabsTrigger value="sales">Sales / Output ({sales.length})</TabsTrigger>
          <TabsTrigger value="purchases">Purchases / Input ({purchases.length})</TabsTrigger>
          <TabsTrigger value="urd">URD Register ({urd.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="sales"><Card><CardContent className="p-0"><DataTable data={sales} columns={gstColumns} searchKeys={['invoiceNo', 'customerName']} searchPlaceholder="Search sales invoices…" /></CardContent></Card></TabsContent>
        <TabsContent value="purchases"><Card><CardContent className="p-0"><DataTable data={purchases} columns={gstColumns} searchKeys={['invoiceNo', 'customerName']} searchPlaceholder="Search purchase bills…" /></CardContent></Card></TabsContent>
        <TabsContent value="urd">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-amber-700 dark:text-amber-400">URD Purchases — unregistered sellers · no GST, no input credit</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {urd.length === 0
                ? <EmptyState icon={FileSpreadsheet} title="No URD purchases" desc="Purchases from unregistered sellers will be listed here" />
                : <DataTable data={urd} columns={urdColumns} searchKeys={['invoiceNo', 'customerName']} searchPlaceholder="Search URD purchases…" />}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

/**
 * ACCOUNTS DETAILS / OPENING / DEBIT / CREDIT / CLOSING, with every column footed — the shape an
 * accountant actually works from, and the one thing this screen was missing. All five columns were
 * already in the API response (TrialBalanceRow, src/lib/accounting.ts) and the screen rendered only
 * the closing pair, so you could see what an account stood at but not what moved, and could not
 * foot the sheet you were reading.
 *
 * Rows are clickable: `onAccount` opens that account's ledger (AccountLedgerView) in place, with a
 * way back. oMunim's equivalent navigates away with no return — its own notes call that a fault.
 */
function TrialBalanceView({ data, onAccount }: { data: any; onAccount?: (name: string) => void }) {
  const tb = data?.trialBalance || []
  const t = data?.totals
  const totalDebit = data?.totalDebit || 0
  const totalCredit = data?.totalCredit || 0
  const diff = data?.difference ?? round2(totalDebit - totalCredit)
  const foot = (n: number | undefined) => formatINR(n || 0)
  return (
    <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Scale className="size-4 text-amber-600" /> Trial Balance <span className="text-xs font-normal text-muted-foreground">{data?.periodLabel}</span></CardTitle></CardHeader>
      <CardContent className="p-0">
        <DataTable
          data={tb} columns={trialColumns} searchKeys={['code', 'name']} searchPlaceholder="Search accounts…"
          onRowClick={onAccount ? (r: any) => onAccount(r.name) : undefined}
        />
        {/* Footed per column, and LABELLED rather than aligned under the columns: the table pages at
            10 rows, so a positional footer would sit under whichever page you happen to be on and
            read as that page's subtotal. These are the totals over all {tb.length} accounts. */}
        {t && (
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 border-t bg-muted/30 px-4 py-3 text-sm tabular-nums sm:grid-cols-3 lg:grid-cols-6">
            <div><p className="text-xs font-normal text-muted-foreground">Total opening Dr</p><p className="font-bold">{foot(t.openingDebit)}</p></div>
            <div><p className="text-xs font-normal text-muted-foreground">Total opening Cr</p><p className="font-bold">{foot(t.openingCredit)}</p></div>
            <div><p className="text-xs font-normal text-muted-foreground">Total debit</p><p className="font-bold text-emerald-600">{foot(t.periodDebit)}</p></div>
            <div><p className="text-xs font-normal text-muted-foreground">Total credit</p><p className="font-bold text-rose-600">{foot(t.periodCredit)}</p></div>
            <div><p className="text-xs font-normal text-muted-foreground">Total closing Dr</p><p className="font-bold">{foot(t.closingDebit)}</p></div>
            <div><p className="text-xs font-normal text-muted-foreground">Total closing Cr</p><p className="font-bold">{foot(t.closingCredit)}</p></div>
          </div>
        )}
        {t && (
          <p className="border-t px-4 py-2 text-xs text-muted-foreground">
            Opening Dr = Cr {round2(t.openingDebit - t.openingCredit) === 0 ? '✓' : `— OUT BY ${formatINR(round2(t.openingDebit - t.openingCredit))}`} ·
            {' '}Period Dr = Cr {round2(t.periodDebit - t.periodCredit) === 0 ? '✓' : `— OUT BY ${formatINR(round2(t.periodDebit - t.periodCredit))}`} ·
            {' '}each account&apos;s closing = opening + debit − credit{onAccount ? ' · click a row for that account\'s ledger' : ''}
          </p>
        )}
        <div className={`px-4 py-2 text-xs border-t ${diff === 0 ? 'text-muted-foreground' : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 font-semibold'}`}>
          {diff === 0 ? 'Balanced — closing debits equal closing credits.' : `DOES NOT BALANCE — out by ${formatINR(diff)}. Do not file anything from this.`}
        </div>
      </CardContent></Card>
  )
}

function PLView({ data }: { data: any }) {
  const pl = data?.profitLoss || { income: 0, expense: 0, net: 0 }
  const tb = data?.trialBalance || []
  const lines = (type: string, pick: (r: any) => number) =>
    tb.filter((r: any) => r.type === type).map((r: any) => ({ name: r.name, amount: round2(pick(r)) })).filter((r: any) => r.amount !== 0)
  const incomeLines = lines('income', (r: any) => r.periodCredit - r.periodDebit)
  const expenseLines = lines('expense', (r: any) => r.periodDebit - r.periodCredit)
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card><CardHeader><CardTitle className="text-base text-emerald-600">Income</CardTitle></CardHeader><CardContent>
        <div className="space-y-2 text-sm">
          {incomeLines.length === 0 && <div className="text-muted-foreground">No income in this period</div>}
          {incomeLines.map((l: any) => <div key={l.name} className="flex justify-between"><span>{l.name}</span><span className="font-semibold">{formatINR(l.amount)}</span></div>)}
          <div className="flex justify-between font-bold border-t pt-2"><span>Total Income</span><span className="text-emerald-600">{formatINR(pl.income)}</span></div>
        </div>
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base text-rose-600">Expenses</CardTitle></CardHeader><CardContent>
        <div className="space-y-2 text-sm">
          {expenseLines.length === 0 && <div className="text-muted-foreground">No expenses in this period</div>}
          {expenseLines.map((l: any) => <div key={l.name} className="flex justify-between"><span>{l.name}</span><span className="font-semibold">{formatINR(l.amount)}</span></div>)}
          <div className="flex justify-between font-bold border-t pt-2"><span>Total Expense</span><span className="text-rose-600">{formatINR(pl.expense)}</span></div>
        </div>
      </CardContent></Card>
      <Card className="lg:col-span-2"><CardContent className="p-4 flex items-center justify-between">
        <div><p className="text-sm text-muted-foreground">Net Profit / (Loss)</p><p className="text-xs text-muted-foreground">{data?.periodLabel} · this period only; prior years are retained earnings on the balance sheet</p></div>
        <p className={`text-2xl font-bold ${pl.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatINR(pl.net)}</p>
      </CardContent></Card>
    </div>
  )
}

const dayColumns: Column<any>[] = [
  { key: 'date', header: 'Date', render: (e) => <span className="text-xs">{formatDate(e.date)}</span> },
  { key: 'accountName', header: 'Account' },
  { key: 'particulars', header: 'Particulars', render: (e) => <span className="text-xs">{e.particulars || '—'}</span> },
  { key: 'type', header: 'Type', render: (e) => <span className="text-xs capitalize">{e.type}</span> },
  { key: 'debit', header: 'Debit', numeric: true, render: (e) => e.debit ? <span className="font-medium">{formatINR(e.debit)}</span> : '—' },
  { key: 'credit', header: 'Credit', numeric: true, render: (e) => e.credit ? <span className="font-medium">{formatINR(e.credit)}</span> : '—' },
]
const ledgerColumns = dayColumns
/**
 * Column order and headers follow the five-column trial balance an Indian accountant expects:
 * ACCOUNTS DETAILS / OPENING / DEBIT / CREDIT / CLOSING. Opening and closing are split into their
 * Dr and Cr columns rather than signed, so the sheet foots on each side independently — the whole
 * reason a trial balance has two columns instead of one.
 */
const trialColumns: Column<any>[] = [
  { key: 'code', header: 'Code', render: (a) => <span className="font-mono text-xs text-amber-600">{a.code}</span> },
  { key: 'name', header: 'Account Name', render: (a) => <span>{a.name}<span className="ml-2 text-[10px] capitalize text-muted-foreground">{a.type}</span></span> },
  { key: 'openingDebit', header: 'Opening Dr', numeric: true, render: (a) => a.openingDebit ? formatINR(a.openingDebit) : '—' },
  { key: 'openingCredit', header: 'Opening Cr', numeric: true, render: (a) => a.openingCredit ? formatINR(a.openingCredit) : '—' },
  { key: 'periodDebit', header: 'Debit', numeric: true, render: (a) => a.periodDebit ? <span className="text-emerald-600">{formatINR(a.periodDebit)}</span> : '—' },
  { key: 'periodCredit', header: 'Credit', numeric: true, render: (a) => a.periodCredit ? <span className="text-rose-600">{formatINR(a.periodCredit)}</span> : '—' },
  { key: 'debit', header: 'Closing Dr', numeric: true, render: (a) => a.debit ? <span className="font-semibold">{formatINR(a.debit)}</span> : '—' },
  { key: 'credit', header: 'Closing Cr', numeric: true, render: (a) => a.credit ? <span className="font-semibold">{formatINR(a.credit)}</span> : '—' },
]
const gstColumns: Column<any>[] = [
  { key: 'invoiceNo', header: 'Inv No', render: (i) => <span className="font-mono text-xs text-amber-600">{i.invoiceNo}</span> },
  { key: 'invoiceDate', header: 'Date', render: (i) => <span className="text-xs">{formatDate(i.invoiceDate)}</span> },
  { key: 'customerName', header: 'Customer' },
  { key: 'subtotal', header: 'Taxable', render: (i) => formatINR(rowTaxable(i)) },
  { key: 'cgst', header: 'CGST', numeric: true, render: (i) => i.cgst ? formatINR(i.cgst) : '—' },
  { key: 'sgst', header: 'SGST', numeric: true, render: (i) => i.sgst ? formatINR(i.sgst) : '—' },
  { key: 'totalAmount', header: 'Total', numeric: true, render: (i) => <span className="font-semibold">{formatINR(i.totalAmount)}</span> },
]
const urdColumns: Column<any>[] = [
  { key: 'invoiceNo', header: 'Bill No', render: (i) => <span className="font-mono text-xs text-amber-600">{i.invoiceNo}</span> },
  { key: 'invoiceDate', header: 'Date', render: (i) => <span className="text-xs">{formatDate(i.invoiceDate)}</span> },
  { key: 'customerName', header: 'Seller' },
  { key: 'subtotal', header: 'Taxable', render: (i) => formatINR(rowTaxable(i)) },
  { key: 'totalAmount', header: 'Amount Paid', numeric: true, render: (i) => <span className="font-semibold">{formatINR(i.totalAmount)}</span> },
]
function Row({ code, name, amount }: { code: string; name: string; amount: number }) {
  return <div className="flex justify-between text-sm py-1"><span><span className="font-mono text-xs text-amber-600 mr-2">{code}</span>{name}</span><span className="font-medium">{formatINR(amount)}</span></div>
}
