'use client'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PageHeader, EmptyState, ToneBadge, chartAxis, chartGrid, chartTooltip } from '../shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { DataTable, Column } from '../data-table'
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { api } from '@/lib/api-client'
import { useApp } from '@/store/app'
import { formatINR, formatWeight } from '@/lib/format'
import { TrendingUp, Clock, HardHat, Boxes, RefreshCw, LayoutGrid, Package, Search } from 'lucide-react'

type FastMover = { name: string; qty: number; weight: number; amount: number }
type DeadStock = {
  id: string; itemCode: string | null; name: string; itemCategory: string | null
  netWeight: number; mrp: number | null; ageDays: number
  soldInCategory: number; photoUrl: string | null
}
type KarigarRow = { name: string; soldQty: number; soldAmount: number; availableQty: number; availableWeight: number }
type CounterRow = {
  name: string; inQty: number; inWeight: number; outQty: number
  outWeight: number; availableQty: number; availableWeight: number
}
type ReorderRow = { category: string; soldQty: number; availableQty: number; monthlyRate: number; monthsCover: number }
type Insights = {
  days: number; from: string; to: string
  fast: FastMover[]; slow: DeadStock[]; karigar: KarigarRow[]; counter: CounterRow[]; reorder: ReorderRow[]
}
type StockRow = {
  id: string; name: string; itemCode: string | null; itemCategory: string | null
  purity: string | null; netWeight: number | null; mrp: number | null; photoUrl: string | null
}

/** Rows the backend sends without a stable id — DataTable's generic requires one for its React key. */
function withId<T extends object>(rows: T[], key: (r: T) => string): (T & { id: string })[] {
  return rows.map((r, i) => ({ ...r, id: key(r) || `row-${i}` }))
}

const PERIODS = [30, 90, 180, 365] as const

export function StockInsightsModule() {
  const { activeFirmId } = useApp()
  const [days, setDays] = useState<number>(90)
  const [search, setSearch] = useState('')
  const [photosOnly, setPhotosOnly] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['stock-insights', activeFirmId, days],
    queryFn: () => api<Insights>('/api/stock/insights', { search: { firmId: activeFirmId!, days: String(days) } }),
    enabled: !!activeFirmId,
  })
  const { data: catalogue } = useQuery({
    queryKey: ['stock-catalogue', activeFirmId],
    queryFn: () => api<{ items: StockRow[] }>('/api/stock', { search: { firmId: activeFirmId!, status: 'available', limit: '300' } }),
    enabled: !!activeFirmId,
  })

  // Backend not merged yet, or a real fetch failure: every array below falls back to [] so no
  // tab ever calls .map() on undefined — an insights outage degrades to empty states, not a blank screen.
  const fast = data?.fast ?? []
  const slow = data?.slow ?? []
  const karigar = data?.karigar ?? []
  const counter = data?.counter ?? []
  const reorder = data?.reorder ?? []
  const items = catalogue?.items ?? []

  const catalogueItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((s) => {
      if (photosOnly && !s.photoUrl) return false
      if (!q) return true
      return [s.name, s.itemCode, s.itemCategory].some((v) => (v || '').toLowerCase().includes(q))
    })
  }, [items, search, photosOnly])

  const fastRows = useMemo(() => withId(fast, (r) => r.name), [fast])
  const karigarRows = useMemo(() => withId(karigar, (r) => r.name), [karigar])
  const counterRows = useMemo(() => withId(counter, (r) => r.name), [counter])
  const reorderRows = useMemo(() => withId(reorder, (r) => r.category), [reorder])

  return (
    <div>
      <PageHeader
        title="Stock Insights"
        hindi="स्टॉक विश्लेषण"
        desc="What is selling, what is not, and what to re-order"
        actions={
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
            {PERIODS.map((p) => (
              <Button key={p} size="sm" variant={days === p ? 'default' : 'ghost'} className="h-7 px-2.5 text-xs" onClick={() => setDays(p)}>
                {p}d
              </Button>
            ))}
          </div>
        }
      />

      {isLoading ? (
        <div className="h-64 rounded-xl bg-muted animate-pulse" />
      ) : (
        <Tabs defaultValue="fast" className="w-full">
          <TabsList className="mb-3 max-w-full justify-start overflow-x-auto nice-scroll">
            <TabsTrigger value="fast">Fast movers</TabsTrigger>
            <TabsTrigger value="dead">Dead stock</TabsTrigger>
            <TabsTrigger value="karigar">Karigar</TabsTrigger>
            <TabsTrigger value="counter">Counter movement</TabsTrigger>
            <TabsTrigger value="reorder">Re-order</TabsTrigger>
            <TabsTrigger value="catalogue">Catalogue</TabsTrigger>
          </TabsList>

          <TabsContent value="fast" className="space-y-4">
            {fastRows.length === 0 ? (
              <EmptyState icon={TrendingUp} title="No sales in this period" desc="Fast movers will show up here once bills are made in the selected period." />
            ) : (
              <>
                <Card>
                  <CardHeader><CardTitle className="text-base">Top Sellers by Quantity</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={Math.max(260, fastRows.length * 28)}>
                      <BarChart data={fastRows} layout="vertical">
                        <CartesianGrid {...chartGrid} horizontal={false} />
                        <XAxis type="number" {...chartAxis} allowDecimals={false} />
                        <YAxis type="category" dataKey="name" {...chartAxis} width={120} />
                        <Tooltip {...chartTooltip} />
                        <Bar dataKey="qty" fill="#d97706" radius={[0, 8, 8, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base">Fast Movers</CardTitle></CardHeader>
                  <CardContent>
                    <DataTable data={fastRows} columns={fastColumns} searchKeys={['name']} searchPlaceholder="Search items…" pageSize={10} />
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="dead" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Dead Stock</CardTitle></CardHeader>
              <CardContent>
                {slow.length === 0 ? (
                  <EmptyState icon={Clock} title="Nothing sitting idle" desc="Items that have aged without selling will be listed here, oldest first." />
                ) : (
                  <DataTable data={slow} columns={deadColumns} searchKeys={['name', 'itemCode', 'itemCategory']} searchPlaceholder="Search dead stock…" pageSize={10} />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="karigar" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Karigar Performance</CardTitle></CardHeader>
              <CardContent>
                {karigarRows.length === 0 ? (
                  <EmptyState icon={HardHat} title="No karigar sales yet" desc="Once tagged items sell, each karigar's performance shows up here." />
                ) : (
                  <DataTable data={karigarRows} columns={karigarColumns} searchKeys={['name']} searchPlaceholder="Search karigar…" pageSize={10} />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="counter" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Counter Movement</CardTitle></CardHeader>
              <CardContent>
                {counterRows.length === 0 ? (
                  <EmptyState icon={Boxes} title="No counter movement" desc="Stock moved in and out of counters in the selected period will show up here." />
                ) : (
                  <DataTable data={counterRows} columns={counterColumns} searchKeys={['name']} searchPlaceholder="Search counters…" pageSize={10} />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reorder" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Re-order List</CardTitle>
                <p className="text-xs text-muted-foreground">Derived from actual sales velocity over the selected period, not a manually-set minimum level.</p>
              </CardHeader>
              <CardContent>
                {reorderRows.length === 0 ? (
                  <EmptyState icon={RefreshCw} title="Nothing to re-order" desc="Categories running low against their sales velocity will show up here." />
                ) : (
                  <DataTable data={reorderRows} columns={reorderColumns} searchKeys={['category']} searchPlaceholder="Search category…" pageSize={10} />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="catalogue" className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[9rem] flex-1 sm:w-64 sm:flex-none">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, code, category…" className="pl-9 h-9" />
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Switch checked={photosOnly} onCheckedChange={setPhotosOnly} /> Photos only
              </label>
            </div>
            {items.length === 0 ? (
              <EmptyState icon={LayoutGrid} title="No stock available" desc="Available items will appear here as a visual catalogue." />
            ) : catalogueItems.length === 0 ? (
              <EmptyState icon={Search} title="No matches" desc="Try a different search or turn off Photos only." />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                {catalogueItems.map((s) => (
                  <Card key={s.id} className="overflow-hidden py-0 gap-0">
                    <div className="aspect-square bg-muted grid place-items-center overflow-hidden">
                      {s.photoUrl ? (
                        // Data URLs — next/image cannot optimise these, a plain <img> is correct.
                        <img src={s.photoUrl} alt={s.name} className="w-full h-full object-cover aspect-square" />
                      ) : (
                        <Package className="size-8 text-muted-foreground" />
                      )}
                    </div>
                    <CardContent className="p-2.5 space-y-0.5">
                      <p className="text-sm font-medium truncate" title={s.name}>{s.name}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">{s.itemCode || '—'}</p>
                      <p className="text-xs text-muted-foreground truncate">{[s.purity, s.netWeight != null ? formatWeight(s.netWeight) : null].filter(Boolean).join(' · ')}</p>
                      <p className="text-sm font-semibold">{formatINR(s.mrp)}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

const fastColumns: Column<FastMover & { id: string }>[] = [
  { key: 'name', header: 'Item' },
  { key: 'qty', header: 'Qty', numeric: true, sortable: true },
  { key: 'weight', header: 'Weight', numeric: true, render: (r) => formatWeight(r.weight) },
  { key: 'amount', header: 'Amount', numeric: true, sortable: true, render: (r) => <span className="font-semibold">{formatINR(r.amount)}</span> },
]

const deadColumns: Column<DeadStock>[] = [
  { key: 'itemCode', header: 'Code', render: (s) => <span className="font-mono text-xs text-amber-600">{s.itemCode || '—'}</span> },
  { key: 'name', header: 'Item' },
  { key: 'itemCategory', header: 'Category', render: (s) => s.itemCategory || '—' },
  { key: 'ageDays', header: 'Age (days)', numeric: true, sortable: true, render: (s) => <span className={s.ageDays > 180 ? 'text-rose-600 font-bold' : ''}>{s.ageDays}</span> },
  { key: 'netWeight', header: 'Net Wt', numeric: true, render: (s) => formatWeight(s.netWeight) },
  { key: 'mrp', header: 'MRP', numeric: true, render: (s) => formatINR(s.mrp) },
  { key: 'soldInCategory', header: 'Category sold', numeric: true, render: (s) => s.soldInCategory === 0 ? <ToneBadge tone="red">nothing sold</ToneBadge> : s.soldInCategory },
]

const karigarColumns: Column<KarigarRow & { id: string }>[] = [
  { key: 'name', header: 'Karigar' },
  { key: 'soldQty', header: 'Sold Qty', numeric: true },
  { key: 'soldAmount', header: 'Sold Value', numeric: true, sortable: true, render: (k) => <span className="font-semibold">{formatINR(k.soldAmount)}</span> },
  { key: 'availableQty', header: 'In stock (qty)', numeric: true },
  { key: 'availableWeight', header: 'In stock (weight)', numeric: true, render: (k) => formatWeight(k.availableWeight) },
]

const counterColumns: Column<CounterRow & { id: string }>[] = [
  { key: 'name', header: 'Counter' },
  { key: 'inQty', header: 'In (qty)', numeric: true },
  { key: 'inWeight', header: 'In (wt)', numeric: true, render: (c) => formatWeight(c.inWeight) },
  { key: 'outQty', header: 'Out (qty)', numeric: true },
  { key: 'outWeight', header: 'Out (wt)', numeric: true, render: (c) => formatWeight(c.outWeight) },
  { key: 'availableQty', header: 'Available (qty)', numeric: true },
  { key: 'availableWeight', header: 'Available (wt)', numeric: true, render: (c) => formatWeight(c.availableWeight) },
]

const reorderColumns: Column<ReorderRow & { id: string }>[] = [
  { key: 'category', header: 'Category' },
  { key: 'soldQty', header: 'Sold in period', numeric: true },
  { key: 'availableQty', header: 'Available', numeric: true },
  { key: 'monthlyRate', header: 'Per month', numeric: true, render: (r) => r.monthlyRate.toFixed(1) },
  { key: 'monthsCover', header: 'Months of cover', numeric: true, render: (r) => <span className={r.monthsCover < 1 ? 'text-rose-600 font-bold' : ''}>{r.monthsCover.toFixed(1)}</span> },
]
