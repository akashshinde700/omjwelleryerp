'use client'
import { useDeferredValue, useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { StatCard, PageHeader, chartAxis, chartGrid, chartTooltip } from '../shared'
import { AddCustomerDialog } from '../app-shell'
import { PARTY_ACTIONS, TYPE_ACTIONS, PERSON_TYPE_LABELS } from './customers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Users, Package, HandCoins, Receipt, ArrowRight, Search, UserPlus, X,
  Wallet, Wrench, Bell, AlertTriangle, Loader2,
} from 'lucide-react'
import { api } from '@/lib/api-client'
import { useApp, type ViewKey, type ViewContext } from '@/store/app'
import { formatINR, formatINRShort, formatDate } from '@/lib/format'

import { motion } from 'framer-motion'
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

type Party = {
  id: string; firstName: string; lastName?: string | null; mobile?: string | null
  village?: string | null; city?: string | null; code?: string | null; type?: string | null
}

const partyName = (c: Party) => [c.firstName, c.lastName].filter(Boolean).join(' ')

export function Dashboard({ onNavigate }: { onNavigate: (v: any) => void }) {
  const { activeFirmId } = useApp()
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard', activeFirmId],
    queryFn: () => api<any>('/api/dashboard', { search: { firmId: activeFirmId! } }),
    enabled: !!activeFirmId,
  })

  return (
    <div>
      <PageHeader title="Home" hindi="होम" desc="Find a customer, see today's rate, and what needs doing" />

      <CounterBar firmId={activeFirmId || undefined} />

      {isError && (
        <Card className="mb-5 border-rose-300 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="size-5 text-rose-600 dark:text-rose-400 shrink-0" />
            <p className="text-sm text-rose-700 dark:text-rose-300 flex-1">
              Today&apos;s figures could not be loaded. {(error as Error)?.message}
            </p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>Try again</Button>
          </CardContent>
        </Card>
      )}

      <RatesCard rates={data?.goldRates} loading={isLoading} />

      <Attention firmId={activeFirmId || undefined} toReceive={data?.counts?.udhaarToReceive ?? 0}
        overdueCount={data?.counts?.overdueLoans ?? 0} overduePrincipal={data?.counts?.overdueLoanPrincipalDisbursed ?? 0}
        onNavigate={onNavigate} />

      {isLoading || !data ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : (
        <TodayFigures data={data} onNavigate={onNavigate} />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ counter */

/**
 * Mobile-number-first lookup — the one thing oMunim's home screen gets right. A customer walks in,
 * you type the number they gave last time; if they are new you add them without retyping it, and
 * either way the bill starts from here instead of navigating to a module and searching again.
 */
function CounterBar({ firmId }: { firmId?: string }) {
  const setView = useApp((s) => s.setView)
  const [q, setQ] = useState('')
  const [party, setParty] = useState<Party | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const inputId = useId()
  // React 19's own debounce: the query re-runs on the settled value, not on every keystroke.
  const term = useDeferredValue(q).trim()
  const ready = term.length >= 3

  const { data, isFetching, isError } = useQuery({
    queryKey: ['counter-lookup', firmId, term],
    queryFn: () => api<{ customers: Party[] }>('/api/customers', { search: { firmId: firmId!, search: term } }),
    enabled: !!firmId && ready,
    staleTime: 30_000,
  })
  const results = (data?.customers || []).slice(0, 6)
  const isNumber = /^\d{6,}$/.test(term)

  function pick(c: Party) {
    setParty(c)
    setQ('')
  }

  function launch(view: ViewKey, mode?: ViewContext['mode']) {
    setView(view, {
      open: true,
      ...(party ? { customer: { id: party.id, name: partyName(party), mobile: party.mobile || undefined, village: party.village || undefined, city: party.city || undefined } } : {}),
      ...(mode ? { mode } : {}),
    })
  }

  const actions = party ? TYPE_ACTIONS[party.type || 'customer'] || TYPE_ACTIONS.customer : ['sale', 'loan', 'order', 'moneyIn']

  return (
    <Card className="mb-4 border-amber-200/70 dark:border-amber-900/50 py-0">
      <CardContent className="p-4 sm:p-5">
        {party ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="size-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-700 grid place-items-center text-white font-bold">
              {partyName(party).slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-semibold leading-tight truncate">{partyName(party)}</p>
              <p className="text-xs text-muted-foreground truncate">
                {[party.code, party.mobile, party.village || party.city].filter(Boolean).join(' · ') || 'No contact on file'}
              </p>
            </div>
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setParty(null)}>
              <X className="size-3.5" /> Change
            </Button>
          </div>
        ) : (
          <>
            <Label htmlFor={inputId} className="text-sm font-medium">
              Customer at the counter <span className="hindi text-muted-foreground font-normal">काउंटर पर कस्टमर</span>
            </Label>
            <div className="relative mt-1.5">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <Input
                id={inputId}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) { e.preventDefault(); pick(results[0]) } }}
                inputMode="tel"
                autoComplete="off"
                placeholder="Mobile number, name or code…"
                className="h-11 pl-9 text-base"
                aria-describedby={inputId + '-hint'}
              />
              {isFetching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 animate-spin text-amber-600" />}
            </div>
            <p id={inputId + '-hint'} className="mt-1 text-xs text-muted-foreground">
              {ready ? 'Enter picks the first match.' : 'Type at least 3 characters — the mobile number is fastest.'}
            </p>

            <div aria-live="polite" className="mt-2">
              {isError && <p className="text-xs text-rose-600 dark:text-rose-400">Could not search right now.</p>}
              {ready && !isFetching && results.length === 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3">
                  <span className="text-sm text-muted-foreground">Nobody found for {term}.</span>
                  <Button size="sm" className="gap-1.5 btn-brand" onClick={() => setShowAdd(true)}>
                    <UserPlus className="size-3.5" /> Add {isNumber ? term : 'new customer'}
                  </Button>
                </div>
              )}
              {results.length > 0 && (
                <ul className="rounded-lg border divide-y max-h-64 overflow-y-auto nice-scroll">
                  {results.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => pick(c)}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left rounded hover:bg-amber-50 dark:hover:bg-amber-950/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium truncate">{partyName(c)}</span>
                          <span className="block text-xs text-muted-foreground truncate">{[c.mobile, c.village || c.city].filter(Boolean).join(' · ') || '—'}</span>
                        </span>
                        <span className="text-xs font-mono text-amber-700 dark:text-amber-400">{c.code}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
          <span className="text-xs text-muted-foreground mr-1">{party ? 'Start for this customer:' : 'Or start without a customer:'}</span>
          {actions.map((key) => {
            const a = PARTY_ACTIONS[key]
            if (!a) return null
            const Icon = a.icon
            return (
              <Button key={key} size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => launch(a.view, a.mode)}>
                <Icon className="size-3.5" /> {a.label}
              </Button>
            )
          })}
        </div>
      </CardContent>

      <AddCustomerDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        firmId={firmId}
        defaultMobile={isNumber ? term : undefined}
        onSaved={(c) => { setParty(c); setQ('') }}
      />
    </Card>
  )
}

/* ------------------------------------------------------------------- rates */

function RatesCard({ rates, loading }: { rates?: { gold22: number; gold24: number; silver: number }; loading: boolean }) {
  if (loading && !rates) return <div className="h-20 rounded-xl bg-muted animate-pulse mb-4" />
  const g = rates || { gold22: 0, gold24: 0, silver: 0 }
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
      <Card className="overflow-hidden border-amber-200/70 dark:border-amber-900/50 py-0">
        <CardContent className="grid grid-cols-3 divide-x p-0">
          <RateTile label="22K" hindi="सोना" unit="/10gm" value={g.gold22} metal />
          <RateTile label="24K" hindi="सोना" unit="/10gm" value={g.gold24} metal />
          <RateTile label="999" hindi="चांदी" unit="/kg" value={g.silver} />
        </CardContent>
      </Card>
    </motion.div>
  )
}

/**
 * Today's rate is the most-read number on the screen — and on a phone this card is the ONLY
 * place it appears, because the top-bar ticker is lg-and-up. So nothing shares the figure's line:
 * no icon chip, no ring, and the unit sits up in the label. The old layout put a 40px coin beside
 * it and `₹1,08,750` truncated to `₹1,08,75…` at 390px. The label is "22K सोना", not
 * "GOLD 22K सोना": the Hindi already says gold, and the three words did not fit.
 */
function RateTile({ label, hindi, unit, value, metal }: { label: string; hindi: string; unit: string; value: number; metal?: boolean }) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <p className="truncate text-[11px] font-medium text-muted-foreground">
        <span className="uppercase tracking-wide">{label}</span>{' '}
        <span className="hindi">{hindi}</span>{' '}
        <span className="opacity-70">{unit}</span>
      </p>
      <p className={'mt-0.5 truncate text-base sm:text-lg font-bold tracking-tight tabular-nums ' + (metal ? 'text-amber-700 dark:text-amber-300' : 'text-foreground')}>
        {value ? '₹' + new Intl.NumberFormat('en-IN').format(value) : '—'}
      </p>
    </div>
  )
}

/* --------------------------------------------------------------- attention */

/** Four things that cost money if nobody looks at them today. Each is a link, not a statistic. */
function Attention({ firmId, toReceive, overdueCount, overduePrincipal, onNavigate }: { firmId?: string; toReceive: number; overdueCount: number; overduePrincipal: number; onNavigate: (v: ViewKey) => void }) {
  // Overdue loans are counted server-side (see /api/dashboard). This tile used to download every
  // active loan with its items and transactions — ~792KB — and filter in the browser, which also
  // silently under-reported once a firm passed the list's 300-row cap.
  const { data: repairs } = useQuery({
    queryKey: ['home-repairs', firmId],
    queryFn: () => api<{ repairs: any[] }>('/api/repairs', { search: { firmId: firmId!, status: 'ready' } }),
    enabled: !!firmId,
  })
  const { data: tasks } = useQuery({
    queryKey: ['home-tasks', firmId],
    queryFn: () => api<{ tasks: any[] }>('/api/tasks', { search: { firmId: firmId!, status: 'pending' } }),
    enabled: !!firmId,
  })

  const ready = repairs?.repairs || []
  const pending = tasks?.tasks || []

  return (
    <section aria-label="Needs attention" className="mb-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Needs attention <span className="hindi normal-case tracking-normal">· ध्यान दें</span>
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <AttentionTile icon={Wallet} tone="emerald" label="Money to receive" hindi="लेना है"
          value={formatINR(toReceive)} sub="Udhaar outstanding" onClick={() => onNavigate('udhaar')} />
        <AttentionTile icon={HandCoins} tone="rose" label="Overdue loans" hindi="मियाद पूरी"
          value={String(overdueCount)} sub={overdueCount ? formatINR(overduePrincipal) + ' lent out' : 'Nothing overdue'} onClick={() => onNavigate('loans')} />
        <AttentionTile icon={Wrench} tone="amber" label="Repairs ready" hindi="रिपेयर तैयार"
          value={String(ready.length)} sub={ready.length ? 'Call for delivery' : 'None waiting'} onClick={() => onNavigate('repairs')} />
        <AttentionTile icon={Bell} tone="slate" label="Follow-ups" hindi="फॉलो-अप"
          value={String(pending.length)} sub={pending.length ? 'Open tasks' : 'All clear'} onClick={() => onNavigate('reminders')} />
      </div>
    </section>
  )
}

function AttentionTile({ icon: Icon, tone, label, hindi, value, sub, onClick }: {
  icon: any; tone: 'emerald' | 'rose' | 'amber' | 'slate'; label: string; hindi: string; value: string; sub: string; onClick: () => void
}) {
  const tones = {
    emerald: 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300',
    rose: 'border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300',
    amber: 'border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300',
    slate: 'border-border bg-muted/50 text-foreground',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={'rounded-xl border p-3 text-left transition-colors hover:brightness-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ' + tones[tone]}
    >
      <span className="flex items-start gap-1.5 text-xs font-medium">
        <Icon className="size-3.5 shrink-0 mt-0.5" />
        <span className="min-w-0 leading-tight">
          <span className="block truncate">{label}</span>
          <span className="hindi block truncate text-[11px] opacity-70">{hindi}</span>
        </span>
      </span>
      <span className="mt-1 block text-xl font-bold tracking-tight tabular-nums truncate">{value}</span>
      <span className="block text-[11px] opacity-80 truncate">{sub}</span>
    </button>
  )
}

/* ----------------------------------------------------------------- figures */

function TodayFigures({ data, onNavigate }: { data: any; onNavigate: (v: ViewKey) => void }) {
  const c = data.counts
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard title="Customers" value={c.customers} icon={Users} tone="amber" hint="On the books" />
        <StatCard title="Stock Value" value={formatINRShort(c.stockValue)} icon={Package} tone="emerald" hint={c.stockItems + ' items'} />
        <StatCard title="Loan Outstanding" value={formatINRShort(c.loanOutstanding)} icon={HandCoins} tone="coral" hint={c.activeLoans + ' running'} />
        <StatCard title="Sales" value={formatINRShort(c.salesTotal)} icon={Receipt} tone="violet" hint={c.invoices + ' bills'} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 items-start">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base">Sales, last 6 months</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data.monthlySales}>
                <defs>
                  <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#d97706" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#d97706" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...chartGrid} vertical={false} />
                <XAxis dataKey="label" {...chartAxis} />
                <YAxis {...chartAxis} tickFormatter={(v) => formatINRShort(v)} />
                <Tooltip formatter={(v: any) => formatINR(v)} {...chartTooltip} />
                <Area type="monotone" dataKey="total" stroke="#d97706" strokeWidth={2.5} fill="url(#salesGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <RecentList title="Latest bills" items={data.recent.invoices.map((i: any) => ({ id: i.id, primary: i.invoiceNo, secondary: i.customerName, value: formatINR(i.totalAmount), date: i.invoiceDate }))} onMore={() => onNavigate('sell')} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-4 items-start">
        <RecentList title="Latest loans" items={data.recent.loans.map((l: any) => ({ id: l.id, primary: l.loanNo, secondary: l.customerName, value: formatINR(l.principalAmount), date: l.loanDate }))} onMore={() => onNavigate('loans')} />
        <RecentList title="New customers" items={data.recent.customers.map((c: any) => ({ id: c.id, primary: (c.firstName + ' ' + (c.lastName || '')).trim(), secondary: c.mobile || '—', value: PERSON_TYPE_LABELS[c.type] || c.type, muted: true, date: c.createdAt }))} onMore={() => onNavigate('customers')} />
      </div>
    </>
  )
}

function RecentList({ title, items, onMore }: { title: string; items: any[]; onMore: () => void }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <Button variant="ghost" size="sm" onClick={onMore} className="text-amber-700 dark:text-amber-400 hover:text-amber-800 h-8">
          View all <ArrowRight className="size-3.5 ml-1" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-0.5 nice-scroll max-h-64 overflow-y-auto">
        {items.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Nothing yet</p>}
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/60">
            <div className="size-7 rounded-lg bg-muted text-muted-foreground grid place-items-center text-xs font-semibold shrink-0" aria-hidden="true">
              {(it.primary || '?').slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{it.primary}</p>
              <p className="text-xs text-muted-foreground truncate">{it.secondary}</p>
            </div>
            <div className="text-right shrink-0">
              <p className={it.muted ? 'text-xs text-muted-foreground' : 'text-sm font-semibold tabular-nums'}>{it.value}</p>
              <p className="text-[10px] text-muted-foreground tabular-nums">{formatDate(it.date)}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
