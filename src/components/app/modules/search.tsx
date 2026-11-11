'use client'
import { useState, useEffect } from 'react'
import { PageHeader, EmptyState, ToneBadge } from '../shared'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Search, Users, Package, HandCoins, Receipt, ArrowRight } from 'lucide-react'
import { api } from '@/lib/api-client'
import { useApp } from '@/store/app'
import { formatINR, formatDate } from '@/lib/format'

export function SearchModule({ onNavigate }: { onNavigate: (v: any) => void }) {
  const { activeFirmId } = useApp()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any>(null)

  const shouldClear = !activeFirmId || query.length < 1

  // Debounced search via effect; clear when query empty
  useEffect(() => {
    if (shouldClear) return
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const r = await api<{ results: any }>('/api/search', { search: { firmId: activeFirmId!, q: query } })
        if (!cancelled) setResults(r.results)
      } catch {}
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query, activeFirmId, shouldClear])

  // Derived display: clear results when query too short
  const displayResults = shouldClear ? null : results

  const total = displayResults ? displayResults.customers.length + displayResults.stock.length + displayResults.loans.length + displayResults.invoices.length : 0

  return (
    <div>
      <PageHeader title="Global Search" hindi="खोज" desc="Search across customers, stock, loans & invoices" />

      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
        <Input
          autoFocus
          className="pl-12 h-14 text-lg bg-white dark:bg-stone-900 shadow-sm border-amber-200"
          placeholder="Type to search… (customer name, mobile, item code, loan no, invoice no)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {query && !displayResults && (
        <div className="text-center py-12 text-muted-foreground">Searching…</div>
      )}

      {query && displayResults && total === 0 && (
        <div className="rounded-xl border">
          <EmptyState icon={Search} title="No results found" desc={`No matches for "${query}"`} />
        </div>
      )}

      {displayResults && total > 0 && (
        <div className="space-y-6">
          {displayResults.customers.length > 0 && (
            <ResultGroup icon={Users} title="Customers" count={displayResults.customers.length} tone="amber" onMore={() => onNavigate('customers')}>
              {displayResults.customers.map((c: any) => (
                <ResultRow key={c.id} primary={`${c.firstName} ${c.lastName || ''}`.trim()} secondary={`${c.code || ''} · ${c.mobile || '—'}`} badge={c.type} />
              ))}
            </ResultGroup>
          )}
          {displayResults.stock.length > 0 && (
            <ResultGroup icon={Package} title="Stock Items" count={displayResults.stock.length} tone="emerald" onMore={() => onNavigate('stock')}>
              {displayResults.stock.map((s: any) => (
                <ResultRow key={s.id} primary={s.name} secondary={`${s.itemCode} · ${s.category}`} value={formatINR(s.mrp)} badge={s.status} />
              ))}
            </ResultGroup>
          )}
          {displayResults.loans.length > 0 && (
            <ResultGroup icon={HandCoins} title="Loans" count={displayResults.loans.length} tone="coral" onMore={() => onNavigate('loans')}>
              {displayResults.loans.map((l: any) => (
                <ResultRow key={l.id} primary={l.loanNo} secondary={`${l.customerName} · ${formatDate(l.loanDate)}`} value={formatINR(l.principalAmount)} badge={l.status} />
              ))}
            </ResultGroup>
          )}
          {displayResults.invoices.length > 0 && (
            <ResultGroup icon={Receipt} title="Invoices" count={displayResults.invoices.length} tone="violet" onMore={() => onNavigate('sell')}>
              {displayResults.invoices.map((i: any) => (
                <ResultRow key={i.id} primary={i.invoiceNo} secondary={`${i.customerName} · ${formatDate(i.invoiceDate)}`} value={formatINR(i.totalAmount)} />
              ))}
            </ResultGroup>
          )}
        </div>
      )}
    </div>
  )
}

function ResultGroup({ icon: Icon, title, count, tone, onMore, children }: { icon: any; title: string; count: number; tone: any; onMore: () => void; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between p-3 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <Icon className="size-4 text-amber-600" />
            <span className="font-medium">{title}</span>
            <span className="text-xs bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 rounded-full px-2 py-0.5">{count}</span>
          </div>
          <button onClick={onMore} className="text-xs text-amber-600 hover:underline flex items-center gap-1">
            View all <ArrowRight className="size-3" />
          </button>
        </div>
        <div className="divide-y">{children}</div>
      </CardContent>
    </Card>
  )
}

function ResultRow({ primary, secondary, value, badge }: { primary: string; secondary: string; value?: string; badge?: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors">
      <div className="size-8 rounded-lg bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 grid place-items-center text-xs font-bold shrink-0">
        {primary.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate">{primary}</p>
        <p className="text-xs text-muted-foreground truncate">{secondary}</p>
      </div>
      {value && <span className="text-sm font-semibold">{value}</span>}
      {badge && <ToneBadge tone={badge === 'available' ? 'green' : badge === 'sold' ? 'gray' : 'amber'}>{badge}</ToneBadge>}
    </div>
  )
}
