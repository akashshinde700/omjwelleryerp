'use client'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader, EmptyState, ToneBadge, Field } from '../shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, PiggyBank, Trash2, Users, Coins } from 'lucide-react'
import { api } from '@/lib/api-client'
import { useApp } from '@/store/app'
import { formatINR, formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { useFirmRole, MANAGER_ONLY_TITLE } from './use-firm-role'
import { useGoldRates } from '../use-gold-rates'
import { roundMoney } from '@/lib/stock-calc'

type Scheme = any

/**
 * Tenders a scheme instalment or an early-close refund can move through. The API also accepts
 * cheque, but a scheme cheque has no clearing/bounce path yet (see src/app/api/schemes/_money.ts),
 * so the counter is not offered it. upi/bank/card post to the firm's bank account, cash to the till.
 */
const SCHEME_TENDERS = [['cash', 'Cash'], ['upi', 'UPI'], ['bank', 'Bank transfer'], ['card', 'Card']] as const

/**
 * Today's metal rate for a weight scheme, PER GRAM, prefilled from the firm's Daily Rates board.
 *
 * The board quotes gold per 10 g and silver per kg; a weight scheme's API takes ₹ per GRAM. The
 * conversion is done ONCE, by useGoldRates() (goldRateToPerGram in src/lib/stock-calc.ts) — this
 * file reads `perGram` and never divides by 10 or 1000 itself. The clerk can still type over it.
 *
 * A scheme carries no purity, so the board row is a visible, changeable pick: 22K for gold (the
 * jewellery a gold scheme is redeemed into) or 999 for silver when the board has them, otherwise
 * the first row for that metal. A board with no row for the metal prefills nothing — a blank the
 * clerk notices beats a wrong number he does not.
 */
function useSchemeRate(firmId: string | null | undefined, metal: 'gold' | 'silver' | null) {
  const board = useGoldRates(firmId)
  const purities = metal
    ? Array.from(new Set(board.rows.filter((r) => String(r.metal).toLowerCase() === metal).map((r) => r.purity.trim().toUpperCase())))
    : []
  const [purityPick, setPurityPick] = useState<string | null>(null)
  const [typed, setTyped] = useState<string | null>(null)
  const preferred = metal === 'gold' ? ['22K', '24K'] : ['999', '925']
  const purity = (purityPick && purities.includes(purityPick) ? purityPick : null) ?? preferred.find((p) => purities.includes(p)) ?? purities[0] ?? null
  const hit = metal && purity ? board.find(metal, purity) : null
  const value = typed ?? (hit ? String(roundMoney(hit.perGram)) : '')
  return {
    value,
    rate: Number(value) || 0,
    following: typed === null && !!hit,
    hit,
    purity,
    purities,
    setPurity: (p: string) => { setPurityPick(p); setTyped(null) },
    setTyped,
    reset: () => setTyped(null),
  }
}

function SchemeRateField({ metal, r, label }: { metal: 'gold' | 'silver'; r: ReturnType<typeof useSchemeRate>; label: string }) {
  return (
    <div className="sm:col-span-2 space-y-1">
      <div className="grid grid-cols-[8rem_1fr] gap-2">
        <Field label="Board purity">
          <Select value={r.purity || ''} onValueChange={r.setPurity} disabled={r.purities.length === 0}>
            <SelectTrigger className="w-full"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{r.purities.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label={`${label} (₹ per GRAM) *`}>
          <Input type="number" inputMode="decimal" step="0.01" min="0" placeholder="₹ per 1 gram"
            className={'text-right tabular-nums' + (r.following ? ' bg-amber-50 dark:bg-amber-950/30' : '')}
            title={r.following ? r.hit?.note : undefined}
            value={r.value} onChange={(e) => r.setTyped(e.target.value)} />
        </Field>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {r.hit
          ? <>Daily Rates board: {metal} {r.hit.purity} ₹{r.hit.perMetalUnit.toLocaleString('en-IN')}{r.hit.unitLabel} = <strong>₹{roundMoney(r.hit.perGram).toLocaleString('en-IN')} per gram</strong>.{r.following ? ' Type over it to use your own rate.' : ''}</>
          : <>No {metal} rate on today&rsquo;s Daily Rates board — type the rate for ONE gram (not per 10 g{metal === 'silver' ? ' or per kg' : ''}).</>}
      </p>
    </div>
  )
}

export function SchemesModule() {
  const { activeFirmId } = useApp()
  const { isManager } = useFirmRole()
  const [showForm, setShowForm] = useState(false)
  const [viewingScheme, setViewingScheme] = useState<any | null>(null)
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['schemes', activeFirmId],
    queryFn: () => api<{ schemes: Scheme[] }>('/api/schemes', { search: { firmId: activeFirmId! } }),
    enabled: !!activeFirmId,
  })
  const schemes = data?.schemes || []
  async function remove(id: string) {
    if (!confirm('Delete this scheme?')) return
    await api('/api/schemes', { method: 'DELETE', search: { id } })
    toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['schemes'] })
  }

  return (
    <div>
      <PageHeader title="Schemes" hindi="स्कीम" desc="Gold savings & kitty schemes"
        actions={<Button className="btn-brand" onClick={() => setShowForm(true)}><Plus className="size-4" /> New Scheme</Button>} />
      {isLoading ? <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{[...Array(3)].map((_, i) => <div key={i} className="h-44 rounded-xl bg-muted animate-pulse" />)}</div>
        : schemes.length === 0 ? <div className="rounded-xl border"><EmptyState icon={PiggyBank} title="No schemes" desc="Create a gold savings scheme" action={<Button onClick={() => setShowForm(true)}><Plus className="size-4" /> New Scheme</Button>} /></div>
        : <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {schemes.map((s) => (
              <Card key={s.id} className="overflow-hidden">
                <CardHeader className="flex flex-row items-start justify-between pb-2">
                  <div className="size-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-700 grid place-items-center text-white">
                    {s.type && s.type !== 'cash' ? <Coins className="size-5" /> : <PiggyBank className="size-5" />}
                  </div>
                  <Button
                    variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive disabled:opacity-30"
                    disabled={isManager === false} title={isManager === false ? MANAGER_ONLY_TITLE : 'Delete'}
                    onClick={() => remove(s.id)}
                  ><Trash2 className="size-3.5" /></Button>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-bold text-lg">{s.name}</p>
                    {s.type && s.type !== 'cash' && <ToneBadge tone={s.type === 'gold' ? 'amber' : 'blue'}>{s.type}</ToneBadge>}
                  </div>
                  {s.groupName && <p className="text-xs text-muted-foreground mb-2">{s.groupName}</p>}
                  {s.type && s.type !== 'cash' && (
                    <p className="text-xs text-muted-foreground -mt-1 mb-2">Denominated in {s.type} — each instalment buys grams at that day's rate.</p>
                  )}
                  <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                    <div><p className="text-xs text-muted-foreground">EMI</p><p className="font-semibold">{formatINR(s.emiAmount)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Duration</p><p className="font-semibold">{s.durationMonths} mo</p></div>
                    <div><p className="text-xs text-muted-foreground">Installments</p><p className="font-semibold">{s.totalInstallments}</p></div>
                    <div><p className="text-xs text-muted-foreground">Bonus</p><p className="font-semibold">{s.bonusMonths} mo{s.type && s.type !== 'cash' ? ' (grams)' : ''}</p></div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Users className="size-4 text-muted-foreground" />
                    <span className="text-sm">{s.subscriberCount ?? 0} subscribers</span>
                    <ToneBadge tone={s.active ? 'green' : 'gray'}>{s.active ? 'active' : 'inactive'}</ToneBadge>
                    <Button variant="outline" size="sm" className="ml-auto h-7 text-xs" onClick={() => setViewingScheme(s)}>View Subscribers</Button>
                  </div>
                  {s.description && <p className="text-xs text-muted-foreground mt-2">{s.description}</p>}
                </CardContent>
              </Card>
            ))}
          </div>}
      <SchemeForm open={showForm} onOpenChange={setShowForm} firmId={activeFirmId!} />
      <SchemeSubscribersDialog scheme={viewingScheme} onClose={() => setViewingScheme(null)} />
    </div>
  )
}

function SchemeSubscribersDialog({ scheme, onClose }: { scheme: any | null; onClose: () => void }) {
  const [enrolling, setEnrolling] = useState(false)
  const [passbookId, setPassbookId] = useState<string | null>(null)
  // Subscribers moved off the scheme list payload (it was 1,150KB nesting every entry and every
  // instalment for every scheme). This dialog is the one place that needs the roster, so it is the
  // one place that fetches it, already carrying each entry's DERIVED position, never re-computed here.
  const { data } = useQuery({
    queryKey: ['scheme-entries', scheme?.id],
    queryFn: () => api<{ scheme: any; entries: any[] }>(`/api/schemes/${scheme.id}/entries`),
    enabled: !!scheme,
  })
  const live = data?.scheme || scheme
  if (!scheme) return null
  const entries = data?.entries || []
  const metal = live.type === 'gold' || live.type === 'silver'
  const totalCollected = entries.reduce((s: number, e: any) => s + (e.totalPaid || 0), 0)
  const totalExpected = entries.reduce((s: number, e: any) => s + e.emiAmount * (e.totalInstallments || 0), 0)
  const totalGrams = entries.reduce((s: number, e: any) => s + (e.totalGramsDisplay || 0), 0)
  const overdue = entries.reduce((s: number, e: any) => s + (e.missed || 0), 0)
  return (
    <Dialog open={!!scheme} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><PiggyBank className="size-5 text-amber-600" /> {live.name} &mdash; Subscribers</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 p-3"><p className="text-xs text-muted-foreground">Subscribers</p><p className="text-lg font-bold text-amber-700">{entries.length}</p></div>
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-3"><p className="text-xs text-muted-foreground">Collected</p><p className="text-lg font-bold text-emerald-700">{formatINR(totalCollected)}</p></div>
          {metal ? (
            <div className="rounded-lg bg-violet-50 dark:bg-violet-950/30 p-3"><p className="text-xs text-muted-foreground">Grams accumulated</p><p className="text-lg font-bold text-violet-700">{totalGrams.toFixed(3)} g</p></div>
          ) : (
            <div className="rounded-lg bg-violet-50 dark:bg-violet-950/30 p-3"><p className="text-xs text-muted-foreground">Expected</p><p className="text-lg font-bold text-violet-700">{formatINR(totalExpected)}</p></div>
          )}
          <div className="rounded-lg bg-rose-50 dark:bg-rose-950/30 p-3"><p className="text-xs text-muted-foreground">Missed EMIs</p><p className="text-lg font-bold text-rose-700">{overdue}</p></div>
        </div>
        <div className="flex justify-end mb-2">
          <Button size="sm" onClick={() => setEnrolling(true)}><Plus className="size-4" /> Add Subscriber</Button>
        </div>
        <div className="space-y-1 max-h-96 overflow-y-auto nice-scroll">
          {entries.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No subscribers yet. Add customers to this scheme.</p>}
          {entries.map((e: any) => (
            <button key={e.id} className="w-full flex items-center justify-between rounded-lg border p-3 text-left hover:bg-muted/50" onClick={() => setPassbookId(e.id)}>
              <div>
                <p className="font-medium">{e.customerName}</p>
                <p className="text-xs text-muted-foreground">{e.customerMobile || '\u2014'} &middot; Started {formatDate(e.startDate)} &middot; Matures {formatDate(e.maturityDate)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">{e.paid ?? 0}/{e.totalInstallments} paid</p>
                <p className="text-xs text-muted-foreground">{formatINR(e.totalPaid || 0)} collected{metal ? ` \u00b7 ${(e.totalGramsDisplay || 0).toFixed(3)} g` : ''}</p>
                <div className="flex gap-1 justify-end mt-1">
                  {e.status !== 'active' && <ToneBadge tone="gray">{e.status}</ToneBadge>}
                  {e.status === 'active' && e.missed > 0 && <ToneBadge tone="red">{e.missed} missed</ToneBadge>}
                  {e.status === 'active' && e.due > 0 && e.missed === 0 && <ToneBadge tone="amber">{e.due} due</ToneBadge>}
                  {e.matured && <ToneBadge tone="green">matured{metal ? ` ${(e.maturityGrams || 0).toFixed(3)}g` : ` ${formatINR(e.maturityValue)}`}</ToneBadge>}
                  {e.fullyPaid && !e.matured && e.status === 'active' && <ToneBadge tone="blue">all paid, bonus on {formatDate(e.maturityDate)}</ToneBadge>}
                </div>
              </div>
            </button>
          ))}
        </div>
        {enrolling && <EnrolDialog open onOpenChange={setEnrolling} scheme={live} />}
        <PassbookDialog entryId={passbookId} onClose={() => setPassbookId(null)} />
      </DialogContent>
    </Dialog>
  )
}

function EnrolDialog({ open, onOpenChange, scheme }: { open: boolean; onOpenChange: (v: boolean) => void; scheme: any }) {
  // Mounted only while open (see the caller), so the defaults are a useState initialiser
  // rather than an effect that re-fires.
  const metal: 'gold' | 'silver' | null = scheme.type === 'gold' || scheme.type === 'silver' ? scheme.type : null
  const [form, setForm] = useState<any>(() => ({
    emiAmount: scheme.emiAmount,
    startDate: new Date().toISOString().slice(0, 10),
    // Frozen on the server at enrolment: the shop sees exactly what it is promising.
    bonusAmount: scheme.bonusMonths * scheme.emiAmount,
    earlyExitDeduction: 0,
  }))
  const [saving, setSaving] = useState(false)
  const qc = useQueryClient()
  const { data: custData } = useQuery({
    queryKey: ['customers', scheme?.firmId],
    queryFn: () => api<{ customers: any[] }>('/api/customers', { search: { firmId: scheme.firmId, type: 'customer' } }),
    enabled: !!scheme?.firmId,
  })
  // Weight schemes only — freezes bonusGrams. Prefilled from the board per GRAM, still editable.
  const rateField = useSchemeRate(scheme?.firmId, metal)
  const rate = rateField.rate
  const bonusGramsPreview = metal && rate > 0 ? (scheme.bonusMonths * (form.emiAmount || 0)) / rate : 0
  async function save() {
    if (!form.customerName) return toast.error('Customer name is required')
    if (metal && !(rate > 0)) return toast.error(`Enter today's ${metal} rate (₹ per gram) to freeze the bonus`)
    setSaving(true)
    try {
      // metalRate/bonusAmount are mutually exclusive — sending an empty metalRate on a cash scheme
      // (or vice versa) would fail the API's own positive-number check, not just be redundant.
      const body = metal ? { ...form, metalRate: rate, bonusAmount: undefined } : { ...form, metalRate: undefined }
      await api(`/api/schemes/${scheme.id}/entries`, { method: 'POST', body })
      toast.success('Subscriber enrolled'); onOpenChange(false)
      qc.invalidateQueries({ queryKey: ['schemes'] }) // subscriberCount on the list card
      qc.invalidateQueries({ queryKey: ['scheme-entries', scheme.id] }) // the roster this dialog reads
    } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
  }
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))
  const deposit = (form.emiAmount || 0) * (scheme?.totalInstallments || 0)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent size="md">
      <DialogHeader><DialogTitle>Enrol in {scheme?.name}</DialogTitle></DialogHeader>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Customer">
          <Select value={form.customerId || ''} onValueChange={(v) => { const c = custData?.customers.find((x: any) => x.id === v); setForm({ ...form, customerId: v, customerName: c ? `${c.firstName} ${c.lastName || ''}`.trim() : '', customerMobile: c?.mobile || '' }) }}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select customer" /></SelectTrigger>
            <SelectContent>{(custData?.customers || []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName} ({c.mobile})</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Customer Name *"><Input value={form.customerName || ''} onChange={(e) => set('customerName', e.target.value)} /></Field>
        <Field label="Mobile"><Input value={form.customerMobile || ''} onChange={(e) => set('customerMobile', e.target.value)} /></Field>
        <Field label="Start Date"><Input type="date" value={form.startDate || ''} onChange={(e) => set('startDate', e.target.value)} /></Field>
        <Field label="EMI (Rs)"><Input type="number" value={form.emiAmount ?? 0} onChange={(e) => set('emiAmount', Number(e.target.value))} /></Field>
        {metal ? (
          <SchemeRateField metal={metal} r={rateField} label={`Today's ${metal} rate`} />
        ) : (
          <Field label="Bonus at maturity (Rs)"><Input type="number" value={form.bonusAmount ?? 0} onChange={(e) => set('bonusAmount', Number(e.target.value))} /></Field>
        )}
        <Field label="Early-exit deduction (Rs)"><Input type="number" value={form.earlyExitDeduction ?? 0} onChange={(e) => set('earlyExitDeduction', Number(e.target.value))} /></Field>
        <Field label="Nominee"><Input value={form.nomineeName || ''} onChange={(e) => set('nomineeName', e.target.value)} /></Field>
      </div>
      <p className="text-xs text-muted-foreground">
        {metal ? (
          <>{scheme?.totalInstallments} &times; {formatINR(form.emiAmount || 0)} = {formatINR(deposit)} deposited, buying grams at each instalment's own rate. Bonus frozen at today's rate: {scheme.bonusMonths} &times; {formatINR(form.emiAmount || 0)} ÷ {rate > 0 ? `₹${rate.toFixed(2)}/g` : '(rate above)'} = <strong>{bonusGramsPreview.toFixed(3)}g</strong>, payable after {scheme?.durationMonths} months. These terms are frozen for this subscriber.</>
        ) : (
          <>{scheme?.totalInstallments} &times; {formatINR(form.emiAmount || 0)} = {formatINR(deposit)} deposited, redeemable {formatINR(deposit + (form.bonusAmount || 0))} against a purchase after {scheme?.durationMonths} months. These terms are frozen for this subscriber.</>
        )}
      </p>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button onClick={save} disabled={saving} className="btn-brand">{saving ? 'Saving...' : 'Enrol'}</Button>
      </DialogFooter>
    </DialogContent></Dialog>
  )
}

function PassbookDialog({ entryId, onClose }: { entryId: string | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [redeeming, setRedeeming] = useState(false)
  // How the money moves \u2014 the instalment received, or the early-close refund paid out. It used to be
  // hard-coded to cash, so a UPI instalment landed in the till's book and the drawer never tallied.
  const [mode, setMode] = useState<string>('cash')
  const { activeFirmId } = useApp()
  const { isManager } = useFirmRole()
  const qc = useQueryClient()
  const { data, refetch } = useQuery({
    queryKey: ['scheme-entry', entryId],
    queryFn: () => api<any>(`/api/schemes/entries/${entryId}`),
    enabled: !!entryId,
  })
  const entry = data?.entry
  const d = data?.derived
  const installments = data?.installments || []
  const metal: 'gold' | 'silver' | null = entry?.type === 'gold' || entry?.type === 'silver' ? entry.type : null
  // Today's rate, rupees per GRAM \u2014 required on a weight scheme's receive AND redeem. Prefilled from
  // the Daily Rates board (converted once, by useGoldRates), and editable.
  const rateField = useSchemeRate(entry?.scheme?.firmId ?? activeFirmId, metal)
  const rate = rateField.rate
  async function act(fn: () => Promise<any>, ok: string) {
    setBusy(true)
    try {
      await fn(); toast.success(ok); await refetch()
      rateField.reset()
      qc.invalidateQueries({ queryKey: ['schemes'] })
      qc.invalidateQueries({ queryKey: ['scheme-entries'] }) // the subscribers dialog's roster, whichever scheme this entry belongs to
      return true
    }
    catch (e: any) { toast.error(e.message); return false } finally { setBusy(false) }
  }
  const modeLabel = SCHEME_TENDERS.find(([v]) => v === mode)?.[1] || mode
  const receive = () => {
    if (metal && !(rate > 0)) return toast.error(`Enter today's ${metal} rate (\u20b9 per gram) before receipting this instalment`)
    return act(() => api(`/api/schemes/entries/${entryId}/installments`, { method: 'POST', body: { amount: entry.emiAmount, paymentMode: mode, ...(metal ? { metalRate: rate } : {}) } }), `Installment received (${modeLabel})`)
  }
  const redeem = () => {
    if (metal && !(rate > 0)) return toast.error(`Enter the maturity-day ${metal} rate (\u20b9 per gram) before redeeming \u2014 it values the ${d?.maturityGrams?.toFixed(3) || '0.000'}g claim`)
    setRedeeming(true)
  }
  const closeEarly = () => {
    if (!confirm(`Close early? Refund ${formatINR(d?.refundIfClosedNow || 0)} by ${modeLabel} - deposits back, no bonus${metal ? ` (forfeits ${d?.totalGramsDisplay?.toFixed(3) || '0.000'}g accumulated)` : ''}.`)) return
    return act(() => api(`/api/schemes/entries/${entryId}`, { method: 'PATCH', body: { action: 'close', paymentMode: mode } }), 'Subscription closed')
  }
  return (
    <Dialog open={!!entryId} onOpenChange={(v) => !v && onClose()}><DialogContent size="md">
      <DialogHeader><DialogTitle>Passbook {entry ? `- ${entry.customerName}` : ''}</DialogTitle></DialogHeader>
      {!data ? <div className="h-40 rounded-xl bg-muted animate-pulse" /> : <>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Paid</p><p className="font-bold">{d.paid}/{entry.totalInstallments}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Deposited</p><p className="font-bold">{formatINR(d.totalPaid)}</p></div>
          {metal ? (
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Grams accumulated</p><p className="font-bold tabular-nums">{d.totalGramsDisplay.toFixed(3)} g</p></div>
          ) : (
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Redeemable now</p><p className="font-bold">{formatINR(d.maturityValue)}</p></div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Matures {formatDate(entry.maturityDate)} &middot; bonus {metal ? `${(entry.bonusGrams || 0).toFixed(3)}g` : formatINR(entry.bonusAmount)} {d.matured ? 'payable' : d.fullyPaid ? 'withheld until the maturity date' : 'needs every installment and the maturity date'}
          {d.missed > 0 ? ` \u00b7 ${d.missed} missed` : ''}{d.due > 0 ? ` \u00b7 ${d.due} due now` : ''}
          {metal ? ' \u00b7 a weight scheme values in grams \u2014 enter the day\'s rate to receipt or redeem, never guessed' : ''}
        </p>
        <div className="space-y-1 max-h-60 overflow-y-auto nice-scroll">
          {installments.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No installments received yet.</p>}
          {installments.map((i: any) => (
            <div key={i.id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
              <span className="font-medium">#{i.installmentNo}</span>
              <span className="text-xs text-muted-foreground">{formatDate(i.paidDate)} &middot; {i.paymentMode}{metal && i.grams != null ? ` \u00b7 ${Number(i.grams).toFixed(3)}g @ \u20b9${Number(i.metalRate).toFixed(2)}/g` : ''}</span>
              <span className="font-semibold">{formatINR(i.amount)}</span>
            </div>
          ))}
        </div>
        {entry.status === 'active' && (
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Payment mode (instalment / refund)">
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{SCHEME_TENDERS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            {metal && <SchemeRateField metal={metal} r={rateField} label={`Today's ${metal} rate`} />}
          </div>
        )}
        {redeeming && entry && (
          <RedeemDialog
            entry={entry}
            firmId={entry.scheme?.firmId ?? activeFirmId}
            summary={metal ? `${(d?.maturityGrams || 0).toFixed(3)} g at \u20b9${rate.toFixed(2)}/g` : formatINR(d?.maturityValue || 0)}
            busy={busy}
            onClose={() => setRedeeming(false)}
            onRedeem={async (invoiceNo) => {
              const ok = await act(() => api(`/api/schemes/entries/${entryId}`, { method: 'PATCH', body: { action: 'redeem', invoiceNo, ...(metal ? { metalRate: rate } : {}) } }), `Redeemed against ${invoiceNo}`)
              if (ok) setRedeeming(false)
            }}
          />
        )}
        <DialogFooter className="gap-2">
          {entry.status === 'active' ? <>
            <Button variant="outline" onClick={closeEarly} disabled={busy || isManager === false} title={isManager === false ? MANAGER_ONLY_TITLE : undefined}>Close early</Button>
            <Button variant="outline" onClick={redeem} disabled={busy || isManager === false} title={isManager === false ? MANAGER_ONLY_TITLE : undefined}>Redeem into sale</Button>
            <Button onClick={receive} disabled={busy || d.paid >= entry.totalInstallments} className="btn-brand">
              Receive {formatINR(entry.emiAmount)}{metal && rate > 0 ? ` = ${(entry.emiAmount / rate).toFixed(3)}g` : ''}
            </Button>
          </> : <ToneBadge tone="gray">{entry.status}{entry.closedDate ? ` on ${formatDate(entry.closedDate)}` : ''}</ToneBadge>}
        </DialogFooter>
      </>}
    </DialogContent></Dialog>
  )
}

/**
 * Redeem a subscription into a sale. Replaces a browser prompt() whose free text went straight onto
 * the entry and the voucher. The clerk types the printed bill number; the bill is looked up in THIS
 * firm and shown back — whose bill it is, its date and total — and Redeem stays off unless it is a
 * live sale billed to this subscriber. The server repeats every check (PATCH /api/schemes/entries/[id]),
 * so this screen is a convenience, never the guard.
 */
function RedeemDialog({ entry, firmId, summary, busy, onClose, onRedeem }: {
  entry: any; firmId: string | null; summary: string; busy: boolean
  onClose: () => void; onRedeem: (invoiceNo: string) => void
}) {
  const [invoiceNo, setInvoiceNo] = useState('')
  const typed = invoiceNo.trim()
  const squash = (s: string | null | undefined) => (s || '').trim().replace(/\s+/g, ' ').toLowerCase()
  const belongs = (inv: any) => entry.customerId ? inv.customerId === entry.customerId : squash(inv.customerName) === squash(entry.customerName)
  // This subscriber's recent sales, so the usual case is one click rather than typing a number.
  const partySearch = entry.customerMobile || entry.customerName
  const { data: recent } = useQuery({
    queryKey: ['scheme-redeem-recent', firmId, partySearch],
    queryFn: () => api<{ invoices: any[] }>('/api/invoices', { search: { firmId: firmId!, type: 'sale', search: partySearch, limit: '20' } }),
    enabled: !!firmId && !!partySearch,
  })
  const own = (recent?.invoices || []).filter((i) => belongs(i) && i.status !== 'deleted' && i.status !== 'returned').slice(0, 5)
  const { data: found, isFetching } = useQuery({
    queryKey: ['scheme-redeem-lookup', firmId, typed],
    queryFn: () => api<{ invoices: any[] }>('/api/invoices', { search: { firmId: firmId!, type: 'sale', search: typed, limit: '20' } }),
    enabled: !!firmId && typed.length >= 2,
  })
  const match = (found?.invoices || []).find((i) => squash(i.invoiceNo) === squash(typed))
  const problem = !typed ? null
    : isFetching && !match ? null
    : !match ? `No sale invoice ${typed} in this firm.`
    : match.status === 'deleted' || match.status === 'returned' ? `${match.invoiceNo} is ${match.status}.`
    : !belongs(match) ? `${match.invoiceNo} is billed to ${match.customerName}, not to ${entry.customerName}.`
    : null
  const ok = !!match && !problem
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}><DialogContent size="sm">
      <DialogHeader><DialogTitle>Redeem into a sale — {entry.customerName}</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">Credit of <strong className="text-foreground">{summary}</strong> goes onto the bill as an advance against it.</p>
      <Field label="Sale invoice number *">
        <Input autoFocus placeholder="e.g. INV-1042" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && ok && !busy) onRedeem(match.invoiceNo) }} />
      </Field>
      {match && !problem && (
        <p className="text-xs rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          {match.invoiceNo} · {match.customerName} · {formatDate(match.invoiceDate)} · {formatINR(match.totalAmount)}
        </p>
      )}
      {problem && <p className="text-xs text-rose-600" role="alert">{problem}</p>}
      {own.length > 0 && (
        <div>
          <p className="text-[11px] text-muted-foreground mb-1">Recent bills for {entry.customerName}</p>
          <div className="flex flex-wrap gap-1.5">
            {own.map((i) => (
              <Button key={i.id} type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setInvoiceNo(i.invoiceNo)}>
                {i.invoiceNo} · {formatINR(i.totalAmount)}
              </Button>
            ))}
          </div>
        </div>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button className="btn-brand" disabled={!ok || busy} onClick={() => match && onRedeem(match.invoiceNo)}>{busy ? 'Redeeming…' : 'Redeem'}</Button>
      </DialogFooter>
    </DialogContent></Dialog>
  )
}

function SchemeForm({ open, onOpenChange, firmId }: { open: boolean; onOpenChange: (v: boolean) => void; firmId: string }) {
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const qc = useQueryClient()
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setForm({ type: 'cash', durationMonths: 11, totalInstallments: 11, bonusMonths: 1, active: true })
  }
  async function save() {
    if (!form.name) return toast.error('Scheme name required')
    if (!form.emiAmount) return toast.error('EMI amount required')
    setSaving(true)
    try {
      await api('/api/schemes', { method: 'POST', body: { ...form, firmId } })
      toast.success('Scheme created'); onOpenChange(false)
      qc.invalidateQueries({ queryKey: ['schemes'] })
    } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent size="md">
      <DialogHeader><DialogTitle>New Scheme</DialogTitle></DialogHeader>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Scheme Name *"><Input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Group Name"><Input value={form.groupName || ''} onChange={(e) => setForm({ ...form, groupName: e.target.value })} /></Field>
        <Field label="Type">
          <Select value={form.type || 'cash'} onValueChange={(v) => setForm({ ...form, type: v })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash — a fixed rupee bonus</SelectItem>
              <SelectItem value="gold">Gold — instalments buy grams at the day's rate</SelectItem>
              <SelectItem value="silver">Silver — instalments buy grams at the day's rate</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="EMI Amount (₹) *"><Input type="number" value={form.emiAmount || 0} onChange={(e) => setForm({ ...form, emiAmount: Number(e.target.value) })} /></Field>
        <Field label="Duration (months)"><Input type="number" value={form.durationMonths || 0} onChange={(e) => setForm({ ...form, durationMonths: Number(e.target.value) })} /></Field>
        <Field label="Total Installments"><Input type="number" value={form.totalInstallments || 0} onChange={(e) => setForm({ ...form, totalInstallments: Number(e.target.value) })} /></Field>
        <Field label={form.type && form.type !== 'cash' ? 'Bonus Months (grams)' : 'Bonus Months'}><Input type="number" value={form.bonusMonths || 0} onChange={(e) => setForm({ ...form, bonusMonths: Number(e.target.value) })} /></Field>
      </div>
      {form.type && form.type !== 'cash' && (
        <p className="text-xs text-muted-foreground">
          Denominated in {form.type}: each subscriber's instalments buy grams at that day's rate (entered per receipt, never defaulted), and the bonus above is frozen as grams at enrolment — never rupees.
        </p>
      )}
      <Field label="Description"><Textarea rows={2} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button onClick={save} disabled={saving} className="btn-brand">{saving ? 'Saving…' : 'Create Scheme'}</Button>
      </DialogFooter>
    </DialogContent></Dialog>
  )
}
