'use client'
import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { PageHeader, EmptyState, ToneBadge, Field } from '../shared'
import { DataTable, Column } from '../data-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Landmark, Plus, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Receipt, Upload, CheckCircle2, XCircle } from 'lucide-react'
import { api } from '@/lib/api-client'
import { useApp } from '@/store/app'
import { formatINR, formatDate } from '@/lib/format'
import { useFirmRole, MANAGER_ONLY_TITLE } from './use-firm-role'

type BankAccount = { id: string; name: string; bankName?: string | null; accountNumber?: string | null; ifsc?: string | null; openingBalance: number; active: boolean }

function useBankAccounts(includeInactive = false) {
  const { activeFirmId } = useApp()
  return useQuery({
    queryKey: ['bank-accounts', activeFirmId, includeInactive],
    queryFn: () => api<{ bankAccounts: BankAccount[] }>('/api/bank/accounts', { search: { firmId: activeFirmId!, includeInactive: String(includeInactive) } }),
    enabled: !!activeFirmId,
  })
}

/** Native date input, current FY defaults — same pattern as accounting.tsx's usePeriod(). */
function currentFY() {
  const now = new Date()
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  return { from: `${y}-04-01`, to: `${y + 1}-03-31` }
}

export function BankRecModule() {
  const { data } = useBankAccounts()
  const bankAccounts = data?.bankAccounts || []
  const [selected, setSelected] = useState<string>('')
  const activeId = selected || bankAccounts[0]?.id || ''

  return (
    <div>
      <PageHeader title="Bank Reconciliation" hindi="बैंक समाधान" desc="Named bank accounts, cheque clearing and statement matching" />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Bank account">
          <Select value={activeId} onValueChange={setSelected}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Select a bank account" /></SelectTrigger>
            <SelectContent>{bankAccounts.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}{b.bankName ? ` (${b.bankName})` : ''}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </div>
      <Tabs defaultValue="accounts">
        <TabsList className="mb-4">
          <TabsTrigger value="accounts">Bank Accounts</TabsTrigger>
          <TabsTrigger value="entry" disabled={!activeId}>Record Entry</TabsTrigger>
          <TabsTrigger value="ledger" disabled={!activeId}>Ledger View</TabsTrigger>
          <TabsTrigger value="reconcile" disabled={!activeId}>Statement & Reconcile</TabsTrigger>
        </TabsList>
        <TabsContent value="accounts"><BankAccountsTab bankAccounts={bankAccounts} /></TabsContent>
        <TabsContent value="entry">{activeId && <EntryTab bankAccounts={bankAccounts} bankAccountId={activeId} />}</TabsContent>
        <TabsContent value="ledger">{activeId && <LedgerTab bankAccountId={activeId} />}</TabsContent>
        <TabsContent value="reconcile">{activeId && <ReconcileTab bankAccountId={activeId} />}</TabsContent>
      </Tabs>
    </div>
  )
}

// ───────────────────────── Bank Accounts ─────────────────────────

function BankAccountsTab({ bankAccounts }: { bankAccounts: BankAccount[] }) {
  const [open, setOpen] = useState(false)
  const { isManager } = useFirmRole()
  const columns: Column<BankAccount>[] = [
    { key: 'name', header: 'Name', sortable: true },
    { key: 'bankName', header: 'Bank', render: (b) => b.bankName || '—' },
    { key: 'accountNumber', header: 'A/C No.', render: (b) => b.accountNumber || '—' },
    { key: 'ifsc', header: 'IFSC', render: (b) => b.ifsc || '—' },
    { key: 'openingBalance', header: 'Opening', render: (b) => formatINR(b.openingBalance) },
    { key: 'active', header: 'Status', render: (b) => <ToneBadge tone={b.active ? 'green' : 'gray'}>{b.active ? 'Active' : 'Inactive'}</ToneBadge> },
  ]
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button className="btn-brand" disabled={isManager === false} title={isManager === false ? MANAGER_ONLY_TITLE : undefined} onClick={() => setOpen(true)}><Plus className="size-4" /> New Bank Account</Button>
      </div>
      {bankAccounts.length === 0 ? (
        <div className="rounded-xl border"><EmptyState icon={Landmark} title="No bank accounts yet" desc="Add ICICI, AXIS or any other named account this firm banks with" action={<Button disabled={isManager === false} title={isManager === false ? MANAGER_ONLY_TITLE : undefined} onClick={() => setOpen(true)}><Plus className="size-4" /> New Bank Account</Button>} /></div>
      ) : <DataTable data={bankAccounts} columns={columns} searchKeys={['name', 'bankName']} searchPlaceholder="Search bank accounts…" />}
      <BankAccountForm open={open} onOpenChange={setOpen} />
    </div>
  )
}

function BankAccountForm({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { activeFirmId } = useApp()
  const qc = useQueryClient()
  const [form, setForm] = useState<any>({})
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setForm({ name: '', bankName: '', accountNumber: '', ifsc: '', branch: '', openingBalance: 0 })
  }
  const create = useMutation({
    mutationFn: (body: any) => api('/api/bank/accounts', { method: 'POST', body }),
    onSuccess: () => { toast.success('Bank account added'); onOpenChange(false); qc.invalidateQueries({ queryKey: ['bank-accounts'] }) },
    onError: (e: any) => toast.error(e.message || 'Could not add bank account'),
  })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent size="md">
      <DialogHeader><DialogTitle>New Bank Account</DialogTitle></DialogHeader>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Display Name *" full><Input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ICICI Current 4521" /></Field>
        <Field label="Bank"><Input value={form.bankName || ''} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="ICICI Bank" /></Field>
        <Field label="Branch"><Input value={form.branch || ''} onChange={(e) => setForm({ ...form, branch: e.target.value })} /></Field>
        <Field label="Account Number"><Input value={form.accountNumber || ''} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} /></Field>
        <Field label="IFSC"><Input value={form.ifsc || ''} onChange={(e) => setForm({ ...form, ifsc: e.target.value })} /></Field>
        <Field label="Opening Balance (₹)"><Input type="number" value={form.openingBalance ?? 0} onChange={(e) => setForm({ ...form, openingBalance: Number(e.target.value) })} /></Field>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button disabled={!form.name || create.isPending} onClick={() => create.mutate({ ...form, firmId: activeFirmId })} className="btn-brand">{create.isPending ? 'Saving…' : 'Save'}</Button>
      </DialogFooter>
    </DialogContent></Dialog>
  )
}

// ───────────────────────── Record Entry ─────────────────────────

const TX_TYPES = [
  { value: 'deposit', label: 'Deposit (cash/other → bank)', icon: ArrowDownToLine },
  { value: 'withdrawal', label: 'Withdrawal (bank → cash/other)', icon: ArrowUpFromLine },
  { value: 'transfer', label: 'Transfer (bank → bank)', icon: ArrowLeftRight },
  { value: 'cheque_in', label: 'Cheque received (in transit)', icon: Receipt },
  { value: 'cheque_out', label: 'Cheque issued (in transit)', icon: Receipt },
] as const

function EntryTab({ bankAccounts, bankAccountId }: { bankAccounts: BankAccount[]; bankAccountId: string }) {
  const { activeFirmId } = useApp()
  const { isManager } = useFirmRole()
  const qc = useQueryClient()
  const [form, setForm] = useState<any>({ type: 'deposit', amount: 0, transactionDate: new Date().toISOString().slice(0, 10), counterAccountName: 'Cash in Hand' })
  const [clearDialog, setClearDialog] = useState<any>(null)

  const { data } = useQuery({
    queryKey: ['bank-transactions', activeFirmId, bankAccountId],
    queryFn: () => api<{ transactions: any[] }>('/api/bank/transactions', { search: { firmId: activeFirmId!, bankAccountId } }),
    enabled: !!activeFirmId && !!bankAccountId,
  })
  const transactions = data?.transactions || []

  const create = useMutation({
    mutationFn: (body: any) => api('/api/bank/transactions', { method: 'POST', body }),
    onSuccess: () => { toast.success('Posted'); setForm({ ...form, amount: 0, chequeNumber: '', narration: '' }); qc.invalidateQueries({ queryKey: ['bank-transactions'] }); qc.invalidateQueries({ queryKey: ['bank-ledger'] }) },
    onError: (e: any) => toast.error(e.message || 'Could not post'),
  })
  const act = useMutation({
    mutationFn: ({ id, action, clearingDate }: any) => api(`/api/bank/transactions/${id}`, { method: 'POST', body: { firmId: activeFirmId, action, clearingDate } }),
    onSuccess: (_d, v) => { toast.success(v.action === 'clear' ? 'Cheque cleared' : 'Cheque bounced — reversed'); setClearDialog(null); qc.invalidateQueries({ queryKey: ['bank-transactions'] }); qc.invalidateQueries({ queryKey: ['bank-ledger'] }) },
    onError: (e: any) => toast.error(e.message || 'Could not update'),
  })

  const isCheque = form.type === 'cheque_in' || form.type === 'cheque_out'
  const isTransfer = form.type === 'transfer'
  const otherBanks = bankAccounts.filter((b) => b.id !== bankAccountId)

  const columns: Column<any>[] = [
    { key: 'transactionDate', header: 'Date', render: (t) => formatDate(t.transactionDate) },
    { key: 'type', header: 'Type', render: (t) => <ToneBadge tone="blue">{t.type.replace('_', ' ')}</ToneBadge> },
    { key: 'amount', header: 'Amount', numeric: true, render: (t) => formatINR(t.amount) },
    { key: 'counterAccountName', header: 'Against', render: (t) => t.counterAccountName || '—' },
    { key: 'status', header: 'Status', render: (t) => <ToneBadge tone={t.status === 'cleared' ? 'green' : t.status === 'bounced' ? 'red' : 'amber'}>{t.status}</ToneBadge> },
    { key: 'clearingDate', header: 'Cleared', render: (t) => t.clearingDate ? formatDate(t.clearingDate) : '—' },
    {
      key: 'actions', header: '', render: (t) => t.status === 'pending' ? (
        <div className="flex gap-1">
          <Button size="sm" variant="outline" disabled={isManager === false} title={isManager === false ? MANAGER_ONLY_TITLE : undefined} onClick={() => setClearDialog(t)}><CheckCircle2 className="size-3.5 text-emerald-600" /> Clear</Button>
          <Button size="sm" variant="outline" disabled={isManager === false} title={isManager === false ? MANAGER_ONLY_TITLE : undefined} onClick={() => { if (confirm('Mark this cheque as bounced? This reverses the original entry.')) act.mutate({ id: t.id, action: 'bounce' }) }}><XCircle className="size-3.5 text-rose-600" /> Bounce</Button>
        </div>
      ) : '—',
    },
  ]

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">New entry</CardTitle></CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Type">
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{TX_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Amount (₹) *"><Input type="number" value={form.amount || 0} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></Field>
            <Field label="Date"><Input type="date" value={form.transactionDate} onChange={(e) => setForm({ ...form, transactionDate: e.target.value })} /></Field>
            {isTransfer ? (
              <Field label="To bank account *">
                <Select value={form.toBankAccountId || ''} onValueChange={(v) => setForm({ ...form, toBankAccountId: v })}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select destination" /></SelectTrigger>
                  <SelectContent>{otherBanks.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            ) : (
              <Field label={isCheque ? 'Against account *' : 'Other account *'}>
                <Input value={form.counterAccountName || ''} onChange={(e) => setForm({ ...form, counterAccountName: e.target.value })} placeholder={isCheque ? 'Sundry Debtors' : 'Cash in Hand'} />
              </Field>
            )}
            {isCheque && <Field label="Cheque Number"><Input value={form.chequeNumber || ''} onChange={(e) => setForm({ ...form, chequeNumber: e.target.value })} /></Field>}
          </div>
          <Field label="Narration" full><Textarea rows={2} value={form.narration || ''} onChange={(e) => setForm({ ...form, narration: e.target.value })} /></Field>
          {isCheque && <p className="mt-1 text-xs text-muted-foreground">Posted to "Cheques in Transit" now — clear it once the bank actually shows it, dated the real clearing date.</p>}
          <div className="mt-3 flex justify-end">
            <Button disabled={!form.amount || create.isPending || isManager === false} title={isManager === false ? MANAGER_ONLY_TITLE : undefined} onClick={() => create.mutate({ ...form, firmId: activeFirmId, bankAccountId })} className="btn-brand">{create.isPending ? 'Posting…' : 'Post Entry'}</Button>
          </div>
        </CardContent>
      </Card>
      {transactions.length === 0 ? (
        <div className="rounded-xl border"><EmptyState icon={Receipt} title="No entries yet" desc="Record a deposit, withdrawal, transfer or cheque above" /></div>
      ) : <DataTable data={transactions} columns={columns} searchKeys={['counterAccountName', 'chequeNumber']} searchPlaceholder="Search entries…" />}
      {clearDialog && (
        <ClearDialog transaction={clearDialog} onClose={() => setClearDialog(null)} onConfirm={(clearingDate) => act.mutate({ id: clearDialog.id, action: 'clear', clearingDate })} pending={act.isPending} />
      )}
    </div>
  )
}

function ClearDialog({ transaction, onClose, onConfirm, pending }: { transaction: any; onClose: () => void; onConfirm: (d: string) => void; pending: boolean }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  return (
    <Dialog open onOpenChange={onClose}><DialogContent>
      <DialogHeader><DialogTitle>Clear cheque {transaction.chequeNumber ? `#${transaction.chequeNumber}` : ''}</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">₹{formatINR(transaction.amount)} moves onto the real bank account on the date it actually cleared — not today, unless that's the same day.</p>
      <Field label="Clearing date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={pending} onClick={() => onConfirm(date)} className="btn-brand">{pending ? 'Clearing…' : 'Confirm Clear'}</Button>
      </DialogFooter>
    </DialogContent></Dialog>
  )
}

// ───────────────────────── Ledger View (oMunim parity: 4 presentations, 1 query) ─────────────────────────

function LedgerTab({ bankAccountId }: { bankAccountId: string }) {
  const { activeFirmId } = useApp()
  const [period, setPeriod] = useState(currentFY)
  const { data } = useQuery({
    queryKey: ['bank-ledger', activeFirmId, bankAccountId, period.from, period.to],
    queryFn: () => api<any>('/api/bank/ledger', { search: { firmId: activeFirmId!, bankAccountId, ...period } }),
    enabled: !!activeFirmId && !!bankAccountId,
  })
  const entries: any[] = data?.entries || []
  const opening = data?.openingBalance || 0

  const normal = entries.reduce<any[]>((acc, e) => {
    const prevBalance = acc.length ? acc[acc.length - 1].balance : opening
    acc.push({ ...e, balance: prevBalance + (e.debit || 0) - (e.credit || 0) })
    return acc
  }, [])
  const bankView = [...normal].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const crWise = entries.filter((e) => e.credit > 0).sort((a, b) => b.credit - a.credit)
  const drWise = entries.filter((e) => e.debit > 0).sort((a, b) => b.debit - a.debit)

  const balCol: Column<any> = { key: 'balance', header: 'Balance', numeric: true, render: (e) => formatINR(e.balance) }
  const baseCols: Column<any>[] = [
    { key: 'date', header: 'Date', render: (e) => formatDate(e.date) },
    { key: 'particulars', header: 'Particulars', render: (e) => e.particulars || '—' },
    { key: 'debit', header: 'Debit', numeric: true, render: (e) => e.debit ? formatINR(e.debit) : '—' },
    { key: 'credit', header: 'Credit', numeric: true, render: (e) => e.credit ? formatINR(e.credit) : '—' },
  ]

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">From<input type="date" value={period.from} max={period.to} onChange={(e) => setPeriod({ ...period, from: e.target.value })} className="block mt-1 h-9 rounded-md border bg-background px-2 text-sm" /></label>
        <label className="text-xs text-muted-foreground">To<input type="date" value={period.to} min={period.from} onChange={(e) => setPeriod({ ...period, to: e.target.value })} className="block mt-1 h-9 rounded-md border bg-background px-2 text-sm" /></label>
        <p className="text-xs text-muted-foreground">Opening balance: <span className="font-semibold">{formatINR(opening)}</span></p>
      </div>
      <Tabs defaultValue="bankview">
        <TabsList className="mb-3">
          <TabsTrigger value="bankview">Bank View</TabsTrigger>
          <TabsTrigger value="normal">Normal View</TabsTrigger>
          <TabsTrigger value="crwise">Cr Wise List</TabsTrigger>
          <TabsTrigger value="drwise">Dr Wise List</TabsTrigger>
        </TabsList>
        <TabsContent value="bankview"><Card><CardContent className="p-0"><DataTable data={bankView} columns={[...baseCols, balCol]} /></CardContent></Card></TabsContent>
        <TabsContent value="normal"><Card><CardContent className="p-0"><DataTable data={normal} columns={[...baseCols, balCol]} /></CardContent></Card></TabsContent>
        <TabsContent value="crwise"><Card><CardContent className="p-0"><DataTable data={crWise} columns={baseCols} /></CardContent></Card></TabsContent>
        <TabsContent value="drwise"><Card><CardContent className="p-0"><DataTable data={drWise} columns={baseCols} /></CardContent></Card></TabsContent>
      </Tabs>
      {data?.entriesTotal > entries.length && <p className="px-1 py-2 text-xs text-muted-foreground">Showing {entries.length} of {data.entriesTotal} entries in this period — running balance covers only what's shown.</p>}
    </div>
  )
}

// ───────────────────────── Statement import & reconciliation ─────────────────────────

function ReconcileTab({ bankAccountId }: { bankAccountId: string }) {
  const { activeFirmId } = useApp()
  const { isManager } = useFirmRole()
  const qc = useQueryClient()
  const [csv, setCsv] = useState('')
  const [period] = useState(currentFY)

  const { data } = useQuery({
    queryKey: ['bank-reconcile', activeFirmId, bankAccountId, period.from, period.to],
    queryFn: () => api<any>('/api/bank/reconcile', { search: { firmId: activeFirmId!, bankAccountId, ...period } }),
    enabled: !!activeFirmId && !!bankAccountId,
  })

  const importMutation = useMutation({
    mutationFn: (body: any) => api('/api/bank/statement', { method: 'POST', body }),
    onSuccess: (d: any) => { toast.success(`Imported ${d.imported} line(s), ${d.autoMatched} auto-matched`); setCsv(''); qc.invalidateQueries({ queryKey: ['bank-reconcile'] }) },
    onError: (e: any) => toast.error(e.message || 'Import failed'),
  })
  const matchMutation = useMutation({
    mutationFn: (body: any) => api('/api/bank/statement/match', { method: 'POST', body }),
    onSuccess: () => { toast.success('Updated'); qc.invalidateQueries({ queryKey: ['bank-reconcile'] }) },
    onError: (e: any) => toast.error(e.message || 'Could not match'),
  })

  const unmatchedLines = data?.unmatchedStatementLines || []
  const unmatchedEntries = data?.unmatchedLedgerEntries || []

  const lineColumns: Column<any>[] = [
    { key: 'date', header: 'Date', render: (l) => formatDate(l.date) },
    { key: 'description', header: 'Description' },
    { key: 'amount', header: 'Amount', numeric: true, render: (l) => l.credit ? `+${formatINR(l.credit)}` : `-${formatINR(l.debit)}` },
    {
      key: 'match', header: 'Match to', render: (l) => {
        const isCredit = l.credit > 0
        const candidates = unmatchedEntries.filter((e: any) => (isCredit ? e.debit === l.credit : e.credit === l.debit))
        return (
          <Select disabled={isManager === false} onValueChange={(voucherId) => matchMutation.mutate({ firmId: activeFirmId, id: l.id, voucherId })}>
            <SelectTrigger className="h-8 w-48" title={isManager === false ? MANAGER_ONLY_TITLE : undefined}><SelectValue placeholder={candidates.length ? 'Pick a voucher' : 'No candidates'} /></SelectTrigger>
            <SelectContent>{candidates.map((e: any) => <SelectItem key={e.id} value={e.voucherId}>{formatDate(e.date)} — {e.particulars || e.accountName}</SelectItem>)}</SelectContent>
          </Select>
        )
      },
    },
  ]
  const entryColumns: Column<any>[] = [
    { key: 'date', header: 'Date', render: (e) => formatDate(e.date) },
    { key: 'particulars', header: 'Particulars', render: (e) => e.particulars || e.accountName },
    { key: 'amount', header: 'Amount', numeric: true, render: (e) => e.debit ? `Dr ${formatINR(e.debit)}` : `Cr ${formatINR(e.credit)}` },
  ]

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Upload className="size-4" /> Import bank statement (CSV)</CardTitle></CardHeader>
        <CardContent>
          <p className="mb-2 text-xs text-muted-foreground">Header row: <code>date,description,amount</code> (amount positive = money in) or <code>date,description,debit,credit</code>. Matching against the books runs automatically right after import.</p>
          <Textarea rows={5} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'date,description,amount\n2026-09-01,Cheque deposit,15000\n2026-09-03,Bank charges,-118'} />
          <div className="mt-2 flex justify-end">
            <Button disabled={!csv.trim() || importMutation.isPending || isManager === false} title={isManager === false ? MANAGER_ONLY_TITLE : undefined} onClick={() => importMutation.mutate({ firmId: activeFirmId, bankAccountId, csv })} className="btn-brand">{importMutation.isPending ? 'Importing…' : 'Import & Auto-Match'}</Button>
          </div>
        </CardContent>
      </Card>

      {data && (
        <p className="text-sm">
          {data.fullyReconciled
            ? <span className="text-emerald-600 font-medium">Fully reconciled for this period.</span>
            : <span className="text-amber-700">{unmatchedLines.length} statement line(s) and {unmatchedEntries.length} book entr{unmatchedEntries.length === 1 ? 'y' : 'ies'} still unmatched.</span>}
        </p>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">On the statement, not in the books</CardTitle></CardHeader>
        <CardContent className="p-0">
          {unmatchedLines.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Nothing unmatched.</p> : <DataTable data={unmatchedLines} columns={lineColumns} />}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">In the books, not on the statement</CardTitle></CardHeader>
        <CardContent className="p-0">
          {unmatchedEntries.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Nothing unmatched — likely a cheque still in transit.</p> : <DataTable data={unmatchedEntries} columns={entryColumns} />}
        </CardContent>
      </Card>
    </div>
  )
}
