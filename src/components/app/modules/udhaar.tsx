'use client'
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader, EmptyState, ToneBadge, Field } from '../shared'
import { DataTable, Column } from '../data-table'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, Wallet, Trash2, CheckCircle2, HandCoins } from 'lucide-react'
import { api } from '@/lib/api-client'
import { useApp, useViewContext, type ViewContext } from '@/store/app'
import { formatINR, formatDate, daysBetween } from '@/lib/format'
import { udhaarBreakdown, udhaarDue, udhaarMetal, udhaarSchedule } from '@/lib/udhaar'
import { splitPayment } from '@/lib/interest'
import { toast } from 'sonner'
import { useFirmRole, MANAGER_ONLY_TITLE } from './use-firm-role'

type Udhaar = any

function todayISO() { return new Date().toISOString().slice(0, 10) }

/**
 * ONE pair of words for the two udhaar actions, everywhere on this screen. It used to be three:
 * tabs "Credit Given / Money Received", the Home buttons "Udhaar Out (lend) / Udhaar In", and the raw
 * API value in the dialog title ("Add credit Entry"). A counter clerk thinks in diya / liya — what
 * the shop GAVE and what it TOOK — so that is the pair. The API values (credit / debit) are internal
 * and never shown. The Home buttons in customers.tsx should read the same two `tab` strings.
 */
export const UDHAAR_TYPE_LABELS: Record<string, { tab: string; hindi: string; title: string; desc: string }> = {
  credit: { tab: 'Diya (Given)', hindi: 'दिया', title: 'Diya (Given) — money given out', desc: 'Money given' },
  debit: { tab: 'Liya (Taken)', hindi: 'लिया', title: 'Liya (Taken) — money taken in', desc: 'Money taken' },
  advance: { tab: 'Advance', hindi: 'एडवांस', title: 'Advance', desc: 'Advances' },
}
const typeLabel = (t: string) => UDHAAR_TYPE_LABELS[t] ?? UDHAAR_TYPE_LABELS.credit

/** Same squash the server's party resolver uses: case and whitespace never split one person in two. */
const squashName = (s: string | null | undefined) => (s || '').trim().replace(/\s+/g, ' ').toLowerCase()

/** An open, money (not metal) "Diya" row for this party — the thing a "Liya" is usually repaying. */
function isOpenGivenFor(u: Udhaar, party: { customerId?: string; customerName?: string }) {
  if (u.type !== 'credit' || u.status === 'settled' || u.metal) return false
  if (!(Number(u.amount) - Number(u.settledAmount || 0) > 0.005)) return false
  if (party.customerId && u.customerId) return party.customerId === u.customerId
  return !!party.customerName && squashName(u.customerName) === squashName(party.customerName)
}

/** Does this row bear interest? The API contract makes every interest field null together, on
 * every row written before Task 87 — so checking any one of them (here, `interest`) is exact. */
const hasInterest = (u: Udhaar) => u.interest != null

export function UdhaarModule() {
  const { activeFirmId } = useApp()
  const { isManager } = useFirmRole()
  const [type, setType] = useState('credit')
  const [showForm, setShowForm] = useState(false)
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [prefill, setPrefill] = useState<ViewContext['customer']>()
  const [paymentsRow, setPaymentsRow] = useState<Udhaar | null>(null)
  const [paymentsPrefill, setPaymentsPrefill] = useState<number | undefined>(undefined)
  const qc = useQueryClient()

  // Launched from a customer record — money in (debit) / money out (credit), party filled.
  useViewContext((ctx) => {
    if (!ctx.customer && !ctx.open) return
    setPrefill(ctx.customer)
    if (ctx.mode === 'credit' || ctx.mode === 'debit' || ctx.mode === 'advance') setType(ctx.mode)
    setShowForm(true)
  })

  function openNew() { setPrefill(undefined); setShowForm(true) }

  const { data, isLoading } = useQuery({
    queryKey: ['udhaar', activeFirmId, type],
    queryFn: () => api<{ udhaars: Udhaar[] }>('/api/udhaar', { search: { firmId: activeFirmId!, type } }),
    enabled: !!activeFirmId,
  })

  const udhaars = data?.udhaars || []
  // Outstanding for the tab on screen = amount still due (amount - settledAmount) on rows that
  // are not settled. Same helper the dashboard and customer panel use — src/lib/udhaar.ts.
  const tabTotals = udhaarBreakdown(udhaars)
  const outstanding = type === 'credit' ? tabTotals.toReceive : type === 'debit' ? tabTotals.toPay : tabTotals.advance

  // Past due date and not settled. Metal rows can be overdue too (flagged on the row) but their
  // debt is in grams, not rupees — see src/lib/udhaar.ts — so they're kept out of the ₹ total.
  const isOverdue = (u: Udhaar) => !!u.dueDate && u.status !== 'settled' && new Date(u.dueDate) < new Date()
  const overdueRows = udhaars.filter(isOverdue)
  const overdueMoneyRows = overdueRows.filter((u) => !udhaarMetal(u.metal))
  const overdueAmount = overdueMoneyRows.reduce((sum, u) => sum + udhaarDue(u), 0)
  const visibleRows = overdueOnly ? overdueRows : udhaars
  // Interest columns only earn their place on screen once a row on this tab actually uses them —
  // a firm that never charges interest never sees the extra columns.
  const showInterestCols = type === 'credit' && visibleRows.some(hasInterest)

  async function remove(id: string) {
    if (!confirm('Delete this entry? Anything already posted for it is reversed with a dated entry.')) return
    // The server can refuse (a manager-only action, a ledger refusal, a lost connection) — the clerk
    // must see why instead of a click that silently did nothing.
    try {
      await api('/api/udhaar', { method: 'DELETE', search: { id } })
      toast.success('Deleted')
    } catch (e: any) {
      toast.error(e?.message || 'Could not delete this entry')
    } finally {
      qc.invalidateQueries({ queryKey: ['udhaar'] })
    }
  }
  async function settle(u: Udhaar) {
    // An interest-bearing row cannot be closed by writing settledAmount = amount — that ignores
    // whatever interest has accrued. The API refuses it (two settlement paths would post different
    // ledger legs); send the clerk to the Payments dialog, prefilled with the full amount owed today.
    if (hasInterest(u)) {
      setPaymentsPrefill(u.leftWithInterest ?? undefined)
      setPaymentsRow(u)
      return
    }
    try {
      await api('/api/udhaar', { method: 'PUT', body: { id: u.id, status: 'settled', settledAmount: u.amount } })
      toast.success('Settled')
    } catch (e: any) {
      toast.error(e?.message || 'Could not settle this entry')
    } finally {
      qc.invalidateQueries({ queryKey: ['udhaar'] })
    }
  }
  /** "Record as repayment of <entry>" from the new-entry form: the money goes onto the ORIGINAL row. */
  function repayInstead(u: Udhaar, amount: number | undefined) {
    setShowForm(false)
    setType('credit')
    setPaymentsPrefill(amount && amount > 0 ? amount : undefined)
    setPaymentsRow(u)
  }

  const columns: Column<Udhaar>[] = [
    { key: 'customerName', header: 'Customer', sortable: true, render: (u) => <div><p className="font-medium">{u.customerName}</p>{u.customerMobile && <p className="text-xs text-muted-foreground">{u.customerMobile}</p>}</div> },
    { key: 'amount', header: 'Amount', numeric: true, sortable: true, render: (u) => (
      <div><p className="font-semibold">{formatINR(u.amount)}</p>{u.settledAmount > 0 && u.status !== 'settled' && <p className="text-xs text-muted-foreground">{formatINR(u.amount - u.settledAmount)} due</p>}</div>
    ) },
    { key: 'description', header: 'Description', render: (u) => <span className="text-xs">{u.description || '—'}</span> },
    { key: 'createdAt', header: 'Date', sortable: true, render: (u) => <span className="text-xs text-muted-foreground">{formatDate(u.createdAt)}</span> },
    { key: 'dueDate', header: 'Due', sortable: true, render: (u) => {
      if (!u.dueDate) return <span className="text-xs text-muted-foreground">—</span>
      if (!isOverdue(u)) return <span className="text-xs text-muted-foreground">{formatDate(u.dueDate)}</span>
      return (
        <div>
          <p className="text-xs text-rose-600 font-medium">{formatDate(u.dueDate)}</p>
          <p className="text-[10px] text-muted-foreground">{daysBetween(u.dueDate)} days overdue</p>
        </div>
      )
    } },
    { key: 'status', header: 'Status', render: (u) => <ToneBadge tone={u.status === 'active' ? 'amber' : 'green'}>{u.status}</ToneBadge> },
    ...(showInterestCols ? [
      { key: 'interest', header: 'Interest', numeric: true, render: (u: Udhaar) => hasInterest(u)
        ? <span className="tabular-nums text-amber-600">{formatINR(u.interest)}</span>
        : <span className="text-muted-foreground">—</span> },
      { key: 'leftAmount', header: 'Left to pay', numeric: true, render: (u: Udhaar) => hasInterest(u) ? (
        <div>
          <p className="font-medium tabular-nums">{formatINR(u.leftAmount)}</p>
          {u.emiTotal != null && (
            <p className="text-[10px] text-muted-foreground">
              Installment {Math.min((u.emiPaid || 0) + 1, u.emiTotal)} of {u.emiTotal}
              {u.nextDueDate ? ` · due ${formatDate(u.nextDueDate)}` : ''}
            </p>
          )}
        </div>
      ) : <span className="text-muted-foreground">—</span> },
      { key: 'leftWithInterest', header: 'Total with interest', numeric: true, render: (u: Udhaar) => hasInterest(u)
        ? <span className="font-semibold tabular-nums">{formatINR(u.leftWithInterest)}</span>
        : <span className="text-muted-foreground">—</span> },
    ] as Column<Udhaar>[] : []),
    { key: 'actions', header: '', width: '150px', render: (u) => (
      <div className="flex items-center gap-1">
        {/* 'partial' is still open — it used to lose both buttons after its first part payment.
            Payments on a metal or advance row has no money path, so it is not offered there. */}
        {u.status !== 'settled' && !u.metal && u.type !== 'advance' && <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" onClick={() => { setPaymentsPrefill(undefined); setPaymentsRow(u) }} title="Payments"><HandCoins className="size-3.5" /></Button>}
        {u.status !== 'settled' && <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" onClick={() => settle(u)} title="Mark settled"><CheckCircle2 className="size-3.5" /></Button>}
        <Button
          variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive disabled:opacity-30"
          disabled={isManager === false} title={isManager === false ? MANAGER_ONLY_TITLE : 'Delete'}
          onClick={() => remove(u.id)}
        ><Trash2 className="size-3.5" /></Button>
      </div>
    )},
  ]

  return (
    <div>
      <PageHeader
        title="Udhaar (CR/DR)"
        hindi="उधार"
        desc={`${typeLabel(type).desc} · Outstanding:${formatINR(outstanding)}${overdueAmount > 0 ? ` · Overdue: ${formatINR(overdueAmount)} (${overdueMoneyRows.length} ${overdueMoneyRows.length === 1 ? 'entry' : 'entries'})` : ''}`}
        actions={<Button className="btn-brand" onClick={openNew}><Plus className="size-4" /> Add Entry</Button>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={type} onValueChange={setType}>
          <TabsList>
            {(['credit', 'debit', 'advance'] as const).map((t) => (
              <TabsTrigger key={t} value={t}>{UDHAAR_TYPE_LABELS[t].tab} <span className="hindi text-muted-foreground ml-1">{UDHAAR_TYPE_LABELS[t].hindi}</span></TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button
          variant="outline" size="sm" className="h-9 gap-1.5"
          aria-pressed={overdueOnly} onClick={() => setOverdueOnly((v) => !v)}
        >
          Overdue only <span className="hindi text-muted-foreground">बकाया</span>
          {overdueOnly && overdueRows.length > 0 && (
            <span className="ml-0.5 rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">{overdueRows.length}</span>
          )}
        </Button>
      </div>
      {/* Diya and Liya post a balanced voucher. An advance FROM A CUSTOMER is now taken through
          POST /api/receipts (Dr <tender> / Cr Customer Advances) — the same path, account and receipt
          slip as the customer panel's Money tab, so it can later be set against a bill or returned.
          Only an advance paid out to a karigar is still recorded here unposted: that direction has
          no decided ledger treatment. See src/app/api/udhaar/route.ts. */}
      {type === 'advance' && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          An advance <strong>taken from a customer</strong> is posted to Customer Advances with a receipt — it
          appears on that customer&rsquo;s Money tab, not in this list. An advance <strong>paid to a karigar</strong>{' '}
          is listed here and is <strong>not posted to the ledger</strong> yet.
        </div>
      )}
      {isLoading ? <div className="h-64 rounded-xl bg-muted animate-pulse" /> : visibleRows.length === 0 ? (
        <div className="rounded-xl border">
          <EmptyState
            icon={Wallet}
            title={overdueOnly ? 'No overdue entries' : 'No entries'}
            desc={overdueOnly ? 'Nothing on this tab is past its due date' : 'Add your first udhaar entry'}
            action={overdueOnly ? undefined : <Button onClick={openNew}><Plus className="size-4" /> Add Entry</Button>}
          />
        </div>
      ) : <DataTable data={visibleRows} columns={columns} searchKeys={['customerName', 'customerMobile']} searchPlaceholder="Search…" />}
      <UdhaarForm open={showForm} onOpenChange={setShowForm} firmId={activeFirmId!} type={type} prefill={prefill} onRepay={repayInstead} />
      <UdhaarPaymentsDialog
        udhaar={paymentsRow}
        prefillAmount={paymentsPrefill}
        onOpenChange={(v) => { if (!v) { setPaymentsRow(null); setPaymentsPrefill(undefined) } }}
      />
    </div>
  )
}

function UdhaarForm({ open, onOpenChange, firmId, type, prefill, onRepay }: {
  open: boolean; onOpenChange: (v: boolean) => void; firmId: string; type: string; prefill?: ViewContext['customer']
  /** Hand the money to the ORIGINAL Diya row's Payments path instead of writing a new Liya row. */
  onRepay: (u: Udhaar, amount: number | undefined) => void
}) {
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const qc = useQueryClient()
  const { data: custData } = useQuery({
    queryKey: ['cust-udhaar', firmId],
    queryFn: () => api<{ customers: any[] }>('/api/customers', { search: { firmId, type: 'all' } }),
    enabled: open && !!firmId,
  })
  const [prevOpen, setPrevOpen] = useState(open)
  const [prevType, setPrevType] = useState(type)
  const [prevPrefill, setPrevPrefill] = useState(prefill)
  if (open !== prevOpen || type !== prevType || prefill !== prevPrefill) {
    setPrevOpen(open)
    setPrevType(type)
    setPrevPrefill(prefill)
    if (open) setForm({ type, status: 'active', advanceFrom: 'customer',
      customerId: prefill?.id, customerName: prefill?.name || '', customerMobile: prefill?.mobile || '', village: prefill?.village || '' })
  }

  /**
   * TWO WAYS TO RECORD ONE REPAYMENT WAS THE DEFECT. A new "Liya" row for money that is really
   * paying back an open "Diya" leaves the Diya open forever: the party shows as owing AND as owed,
   * the overdue list keeps chasing him, and interest keeps accruing on principal he has repaid. So
   * when the party on a Liya has an open Diya, the form offers to record the money ON that entry
   * (its Payments path — interest-first on an interest row, settle-by-delta otherwise). A Liya
   * that is genuinely new money (a loan TO the shop) is still one click away.
   */
  const partyKey = (form.customerMobile || form.customerName || '').trim()
  const { data: givenData } = useQuery({
    queryKey: ['udhaar-open-given', firmId, form.customerId || partyKey],
    queryFn: () => api<{ udhaars: Udhaar[] }>('/api/udhaar', {
      search: { firmId, type: 'credit', metal: 'money', ...(form.customerId ? {} : { search: partyKey }) },
    }),
    enabled: open && type === 'debit' && !!firmId && (!!form.customerId || partyKey.length >= 3),
  })
  const openGiven = (givenData?.udhaars || []).filter((u) => isOpenGivenFor(u, form)).slice(0, 3)

  // An advance's direction is STATED here, never inferred. 'customer' = the shop takes booking money
  // (posted via /api/receipts); 'karigar' = the shop pays out against future work (unposted).
  const advanceFromCustomer = type === 'advance' && form.advanceFrom !== 'karigar'

  function toggleInterest(v: boolean) {
    setForm((f: any) => v
      ? { ...f, chargeInterest: true, interestType: f.interestType || 'monthly', interestStartDate: f.interestStartDate || todayISO() }
      // Off clears every interest/installment field it set — so a form saved with the switch off
      // posts exactly the body it posted before this feature existed.
      : { ...f, chargeInterest: false, interestRate: undefined, interestType: undefined, interestStartDate: undefined, interestEndDate: undefined, repayInstallments: false, emiIntervalDays: undefined, emiOccurrences: undefined })
  }
  function toggleInstallments(v: boolean) {
    setForm((f: any) => v
      ? { ...f, repayInstallments: true, emiIntervalDays: f.emiIntervalDays || 30 }
      : { ...f, repayInstallments: false, emiIntervalDays: undefined, emiOccurrences: undefined })
  }

  // Live plain-English preview of the installment plan — the SAME pure function that prices the
  // real thing (src/lib/udhaar.ts). No second interest formula lives in this file.
  const previewSchedule = useMemo(() => {
    if (type !== 'credit' || !form.chargeInterest || !form.repayInstallments) return []
    const amount = Number(form.amount) || 0
    const rate = Number(form.interestRate) || 0
    const occurrences = Number(form.emiOccurrences) || 0
    const intervalDays = Number(form.emiIntervalDays) || 0
    if (!(amount > 0) || !(rate > 0) || !(occurrences > 0) || !(intervalDays > 0)) return []
    return udhaarSchedule({
      amount, metal: null, type: 'credit',
      interestRate: rate, interestType: form.interestType || 'monthly',
      interestStartDate: form.interestStartDate || todayISO(), interestEndDate: form.interestEndDate || null,
      emiIntervalDays: intervalDays, emiOccurrences: occurrences,
      createdAt: new Date(),
    })
  }, [type, form.chargeInterest, form.repayInstallments, form.amount, form.interestRate, form.interestType, form.interestStartDate, form.interestEndDate, form.emiIntervalDays, form.emiOccurrences])

  const previewText = useMemo(() => {
    if (previewSchedule.length === 0) return undefined
    const avg = Math.round(previewSchedule.reduce((s, r) => s + r.amount, 0) / previewSchedule.length)
    const first = previewSchedule[0]
    const last = previewSchedule[previewSchedule.length - 1]
    return `${previewSchedule.length} installments of about ${formatINR(avg)} — first due ${formatDate(first.due)}, last due ${formatDate(last.due)}.`
  }, [previewSchedule])

  async function save() {
    if (!form.customerName) return toast.error('Customer name required')
    if (!form.amount) return toast.error('Amount required')
    if (form.chargeInterest && !(Number(form.interestRate) > 0)) return toast.error('Enter an interest rate, or turn off Charge interest')
    if (form.chargeInterest && form.repayInstallments && !(Number(form.emiOccurrences) > 0)) return toast.error('Enter the number of installments')
    if (advanceFromCustomer && !form.customerId) return toast.error('Pick the customer from the list — an advance is held against a customer account')
    setSaving(true)
    try {
      if (advanceFromCustomer) {
        // The SAME route, account and receipt series as the customer panel's "Take advance" —
        // Dr <tender> / Cr Customer Advances — so it can be set against a bill or returned later.
        // Not a second posting path and not a new account.
        const tender = form.transactionType === 'bank' ? 'bank' : form.transactionType === 'cheque' ? 'cheque' : form.transactionType === 'upi' ? 'upi' : 'cash'
        const res = await api<{ receipt?: { docNo?: string } }>('/api/receipts', {
          method: 'POST',
          body: { firmId, customerId: form.customerId, kind: 'advance-receive', amount: Number(form.amount), tender, ...(form.description ? { note: form.description } : {}) },
        })
        toast.success(`Advance received${res?.receipt?.docNo ? ` — ${res.receipt.docNo}` : ''}. It is held on the customer’s Money tab.`)
        onOpenChange(false)
        qc.invalidateQueries({ queryKey: ['udhaar'] })
        qc.invalidateQueries({ queryKey: ['customer-detail'] })
        return
      }
      // chargeInterest/repayInstallments/advanceFrom are UI-only — the API reads the fields they
      // turn on, not the switches themselves.
      const { chargeInterest, repayInstallments, advanceFrom, ...rest } = form
      await api('/api/udhaar', { method: 'POST', body: { ...rest, firmId, type } })
      toast.success('Entry added'); onOpenChange(false)
      qc.invalidateQueries({ queryKey: ['udhaar'] })
    } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
  }
  const tenderOptions = advanceFromCustomer
    ? [['cash', 'Cash'], ['upi', 'UPI'], ['bank', 'Bank'], ['cheque', 'Cheque']]
    : [['cash', 'Cash'], ['bank', 'Bank'], ['cheque', 'Cheque']]
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>{type === 'advance' ? (advanceFromCustomer ? 'Advance — taken from a customer' : 'Advance — paid to a karigar') : typeLabel(type).title}</DialogTitle></DialogHeader>
        {type === 'advance' && (
          <Field label="Which advance is this?">
            <Select value={form.advanceFrom || 'customer'} onValueChange={(v) => setForm({ ...form, advanceFrom: v, transactionType: v === 'karigar' && form.transactionType === 'upi' ? 'bank' : form.transactionType })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">Customer gave us an advance (booking money) — posted, with receipt</SelectItem>
                <SelectItem value="karigar">We paid an advance to a karigar — recorded here, not posted</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        )}
        {type === 'debit' && openGiven.length > 0 && (
          <div className="rounded-lg border border-sky-300 bg-sky-50 p-3 text-sm text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100" role="status">
            <p className="font-medium">{openGiven[0].customerName} still has money given (Diya) open. Is this a repayment?</p>
            <p className="text-xs mt-0.5 opacity-80">Record it on the original entry so that entry closes. Save below only if this is new money taken in.</p>
            <div className="mt-2 flex flex-col gap-1.5">
              {openGiven.map((u) => {
                const due = hasInterest(u) ? (u.leftWithInterest ?? udhaarDue(u)) : udhaarDue(u)
                return (
                  <Button key={u.id} type="button" variant="outline" size="sm" className="justify-start h-auto py-1.5 text-left whitespace-normal"
                    onClick={() => onRepay(u, Number(form.amount) > 0 ? Math.min(Number(form.amount), due) : undefined)}>
                    Record as repayment of {formatINR(u.amount)} given on {formatDate(u.createdAt)} ({formatINR(due)} due)
                  </Button>
                )
              })}
            </div>
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Customer"><Select value={form.customerId || ''} onValueChange={(v) => { const c = custData?.customers.find((x) => x.id === v); setForm({ ...form, customerId: v, customerName: c ? `${c.firstName} ${c.lastName || ''}`.trim() : '', customerMobile: c?.mobile || '', village: c?.village || '' }) }}><SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{(custData?.customers || []).map((c) => <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Customer Name *"><Input value={form.customerName || ''} onChange={(e) => setForm({ ...form, customerName: e.target.value })} /></Field>
          <Field label="Mobile"><Input value={form.customerMobile || ''} onChange={(e) => setForm({ ...form, customerMobile: e.target.value })} /></Field>
          <Field label="Village/City"><Input value={form.village || ''} onChange={(e) => setForm({ ...form, village: e.target.value })} /></Field>
          <Field label="Amount (₹) *"><Input type="number" value={form.amount || 0} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></Field>
          <Field label="Transaction Type"><Select value={form.transactionType || 'cash'} onValueChange={(v) => setForm({ ...form, transactionType: v })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{tenderOptions.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Due Date"><Input type="date" value={form.dueDate || ''} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></Field>
        </div>
        <Field label="Description"><Textarea rows={2} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>

        {/* Interest and an installment plan only ever apply to money the firm lends out — the API
            refuses both on a debit or advance row, so the controls are not offered there. */}
        {type === 'credit' && (
          <div className="mt-1 rounded-lg border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Charge interest <span className="hindi text-muted-foreground">ब्याज लगाएं</span></p>
                <p className="text-xs text-muted-foreground">Off by default.</p>
              </div>
              <Switch checked={!!form.chargeInterest} onCheckedChange={toggleInterest} />
            </div>
            {form.chargeInterest && (
              <>
                <div className="grid sm:grid-cols-3 gap-3">
                  <Field label="Interest rate (%) *"><Input type="number" inputMode="decimal" className="text-right tabular-nums" step="0.01" value={form.interestRate || 0} onChange={(e) => setForm({ ...form, interestRate: Number(e.target.value) })} /></Field>
                  <Field label="Per"><Select value={form.interestType || 'monthly'} onValueChange={(v) => setForm({ ...form, interestType: v })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="monthly">per month</SelectItem><SelectItem value="annually">per year</SelectItem><SelectItem value="days">per day</SelectItem></SelectContent></Select></Field>
                  <Field label="Interest from"><Input type="date" value={form.interestStartDate || todayISO()} onChange={(e) => setForm({ ...form, interestStartDate: e.target.value })} /></Field>
                </div>
                <Field label="Interest until (optional)"><Input type="date" value={form.interestEndDate || ''} onChange={(e) => setForm({ ...form, interestEndDate: e.target.value })} /></Field>

                <div className="flex items-center justify-between border-t pt-3">
                  <p className="text-sm font-medium">Repay in installments <span className="hindi text-muted-foreground">किश्तों में</span></p>
                  <Switch checked={!!form.repayInstallments} onCheckedChange={toggleInstallments} />
                </div>
                {form.repayInstallments && (
                  <div className="grid sm:grid-cols-2 gap-3">
                    <Field label="Repay every"><Select value={String(form.emiIntervalDays || 30)} onValueChange={(v) => setForm({ ...form, emiIntervalDays: Number(v) })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="30">Month</SelectItem><SelectItem value="15">Fortnight</SelectItem><SelectItem value="7">Week</SelectItem></SelectContent></Select></Field>
                    <Field label="Number of installments *"><Input type="number" inputMode="numeric" className="text-right tabular-nums" value={form.emiOccurrences || 0} onChange={(e) => setForm({ ...form, emiOccurrences: Number(e.target.value) })} /></Field>
                  </div>
                )}
                {previewText && <p className="text-xs text-muted-foreground">{previewText}</p>}
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="btn-brand">{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Take a payment against one udhaar. ONE amount field — the interest-first split is computed here
 * and shown live, never typed by the clerk (that is the seven-mode picker oMunim makes them use).
 * Also doubles as the installment plan / payment history viewer for a row that has neither.
 */
function UdhaarPaymentsDialog({ udhaar, onOpenChange, prefillAmount }: { udhaar: Udhaar | null; onOpenChange: (v: boolean) => void; prefillAmount?: number }) {
  const open = !!udhaar
  const qc = useQueryClient()
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [prevOpen, setPrevOpen] = useState(open)
  const [prevId, setPrevId] = useState(udhaar?.id)
  if (open !== prevOpen || udhaar?.id !== prevId) {
    setPrevOpen(open)
    setPrevId(udhaar?.id)
    if (open) setForm({ amount: prefillAmount ? String(prefillAmount) : '', date: todayISO(), paymentMode: 'cash' })
  }

  const { data, isLoading } = useQuery({
    queryKey: ['udhaar-detail', udhaar?.id],
    queryFn: () => api<{ udhaar: any; payments: any[]; derived: any; schedule: any[] }>(`/api/udhaar/${udhaar!.id}`),
    enabled: open,
  })
  const derived = data?.derived
  const schedule = data?.schedule || []
  const payments = data?.payments || []

  const amountNum = Number(form.amount) || 0
  // THE SAME function the payments route splits the receipt with (src/lib/interest.ts), not a
  // re-implementation of it. A hand-rolled Math.min here skips round2 and can show a split a paise
  // away from the one actually posted to the ledger — the "two screens, two numbers" defect this
  // whole task exists to prevent, reappearing between the preview and the voucher.
  const { interestComponent: interestPart, principalComponent: principalPart } =
    splitPayment(amountNum, derived ? derived.accruedInterest : 0)

  // Header band reads off the freshest detail call once it lands; the row already passed in from
  // the list carries the same figures, so there is no loading flash for the numbers that matter.
  const principalLeft = derived ? derived.outstandingPrincipal : (udhaar?.leftAmount ?? (udhaar ? udhaar.amount - (udhaar.settledAmount || 0) : 0))
  const interestOwed = derived ? derived.accruedInterest : (udhaar?.interest ?? 0)
  const totalToday = derived ? derived.totalDue : (udhaar?.leftWithInterest ?? principalLeft)

  // ONE settlement path per KIND of row, which the API enforces: an interest row takes a receipt
  // (POST [id]/payments, split interest-first); an interest-free row moves settledAmount forward
  // (PUT, which posts only the delta, mirrored on the row's own creation voucher and tender). This
  // dialog used to offer the receipt path on every row, and the API refused it on interest-free ones.
  const interestRow = !!udhaar && hasInterest(udhaar)
  const live = data?.udhaar ?? udhaar
  const plainDue = live ? Math.max(0, Math.round((Number(live.amount) - Number(live.settledAmount || 0)) * 100) / 100) : 0

  async function save() {
    if (!udhaar) return
    if (!(amountNum > 0)) return toast.error('Enter an amount greater than ₹0')
    if (!interestRow && amountNum > plainDue + 0.005) return toast.error(`Only ${formatINR(plainDue)} is still due on this entry`)
    setSaving(true)
    try {
      if (!interestRow) {
        const next = Math.round((Number(live.settledAmount || 0) + amountNum) * 100) / 100
        await api('/api/udhaar', { method: 'PUT', body: { id: udhaar.id, settledAmount: next, status: next >= Number(live.amount) - 0.005 ? 'settled' : 'partial' } })
        toast.success('Repayment recorded')
        qc.invalidateQueries({ queryKey: ['udhaar'] })
        qc.invalidateQueries({ queryKey: ['udhaar-detail', udhaar.id] })
        if (next >= Number(live.amount) - 0.005) onOpenChange(false)
        else setForm({ amount: '', date: form.date, paymentMode: form.paymentMode })
        return
      }
      await api(`/api/udhaar/${udhaar.id}/payments`, { method: 'POST', body: { amount: amountNum, paymentMode: form.paymentMode || 'cash', date: form.date || todayISO() } })
      toast.success('Payment recorded')
      qc.invalidateQueries({ queryKey: ['udhaar'] })
      qc.invalidateQueries({ queryKey: ['udhaar-detail', udhaar.id] })
      setForm({ amount: '', date: form.date, paymentMode: form.paymentMode })
    } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
  }

  const statusTone = (s: string) => s === 'paid' ? 'green' : s === 'overdue' ? 'red' : s === 'partial' || s === 'due' ? 'amber' : 'gray'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>Payments — {udhaar?.customerName}</DialogTitle></DialogHeader>
        {isLoading ? <div className="h-40 rounded-lg bg-muted animate-pulse" /> : (
          <>
            <div className="grid grid-cols-3 gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
              <div><p className="text-[11px] text-muted-foreground">Principal left</p><p className="font-semibold tabular-nums">{formatINR(principalLeft)}</p></div>
              <div><p className="text-[11px] text-muted-foreground">Interest</p><p className="font-semibold text-amber-600 tabular-nums">{formatINR(interestOwed)}</p></div>
              <div><p className="text-[11px] text-muted-foreground">Total to pay today</p><p className="font-bold tabular-nums">{formatINR(totalToday)}</p></div>
            </div>

            <div className="grid sm:grid-cols-3 gap-3 mt-3">
              <Field label="Amount (₹) *">
                <Input autoFocus type="number" inputMode="decimal" step="0.01" min={0} className="text-right tabular-nums"
                  value={form.amount ?? ''} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </Field>
              {interestRow ? (
                <>
                  <Field label="Date"><Input type="date" value={form.date || todayISO()} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
                  <Field label="Payment mode">
                    <Select value={form.paymentMode || 'cash'} onValueChange={(v) => setForm({ ...form, paymentMode: v })}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="bank">Bank</SelectItem><SelectItem value="upi">UPI</SelectItem></SelectContent>
                    </Select>
                  </Field>
                </>
              ) : (
                <p className="sm:col-span-2 self-end text-xs text-muted-foreground pb-2">
                  {formatINR(plainDue)} still due. Recorded today, by <span className="capitalize">{udhaar?.transactionType || 'cash'}</span> — the same mode as the original entry.
                </p>
              )}
            </div>
            {interestRow && derived && amountNum > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {formatINR(amountNum)} → {formatINR(interestPart)} interest, {formatINR(principalPart)} principal
              </p>
            )}

            <div className="mt-4">
              {/* The plan AND the receipts, never one instead of the other. A row with an
                  installment plan used to show only the plan, so the clerk could never see what had
                  actually been handed over or how each receipt split — on precisely the rows where
                  that matters most. */}
              {schedule.length > 0 && (
                <div className="overflow-x-auto nice-scroll">
                  <table className="w-full min-w-[46rem] border-collapse text-xs">
                    <caption className="sr-only">Installment plan for {udhaar?.customerName}</caption>
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th scope="col" className="py-1 pr-2 font-medium">#</th>
                        <th scope="col" className="py-1 pr-2 font-medium">From</th>
                        <th scope="col" className="py-1 pr-2 font-medium">Due</th>
                        <th scope="col" className="py-1 pr-2 font-medium text-right">Principal</th>
                        <th scope="col" className="py-1 pr-2 font-medium text-right">Interest</th>
                        <th scope="col" className="py-1 pr-2 font-medium text-right">Installment</th>
                        <th scope="col" className="py-1 pr-2 font-medium">Status</th>
                        <th scope="col" className="py-1 font-medium">Paid on</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schedule.map((r: any) => (
                        <tr key={r.no} className={'border-b last:border-0 ' + (r.status === 'overdue' ? 'bg-rose-50 dark:bg-rose-950/20' : '')}>
                          <td className="py-1.5 pr-2 tabular-nums">{r.no}</td>
                          <td className="py-1.5 pr-2 whitespace-nowrap">{formatDate(r.from)}</td>
                          <td className={'py-1.5 pr-2 whitespace-nowrap ' + (r.status === 'overdue' ? 'text-rose-600 font-medium' : '')}>{formatDate(r.due)}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">{formatINR(r.principal)}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">{formatINR(r.interest)}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums font-medium">{formatINR(r.amount)}</td>
                          <td className="py-1.5 pr-2"><ToneBadge tone={statusTone(r.status)}>{r.status}</ToneBadge></td>
                          <td className="py-1.5 whitespace-nowrap text-muted-foreground">{r.paidDate ? formatDate(r.paidDate) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {payments.length > 0 ? (
                <div className="overflow-x-auto nice-scroll mt-4">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Payment history</p>
                  <table className="w-full min-w-[36rem] border-collapse text-xs">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th scope="col" className="py-1 pr-2 font-medium">Date</th>
                        <th scope="col" className="py-1 pr-2 font-medium">Mode</th>
                        <th scope="col" className="py-1 pr-2 font-medium text-right">Interest</th>
                        <th scope="col" className="py-1 pr-2 font-medium text-right">Principal</th>
                        <th scope="col" className="py-1 font-medium text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p: any) => (
                        <tr key={p.id} className="border-b last:border-0">
                          <td className="py-1.5 pr-2 whitespace-nowrap tabular-nums">{formatDate(p.date)}</td>
                          <td className="py-1.5 pr-2 capitalize">{p.paymentMode || '—'}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">{p.interestComponent != null ? formatINR(p.interestComponent) : '—'}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">{p.principalComponent != null ? formatINR(p.principalComponent) : '—'}</td>
                          <td className="py-1.5 text-right tabular-nums font-medium">{formatINR(p.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : schedule.length === 0 ? (
                <p className="text-xs text-muted-foreground">No payments recorded yet.</p>
              ) : null}
            </div>
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={save} disabled={saving || isLoading || (!interestRow && plainDue <= 0)} className="btn-brand">{saving ? 'Saving…' : 'Save payment'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
