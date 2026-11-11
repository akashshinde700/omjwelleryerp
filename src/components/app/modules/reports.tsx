'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PageHeader, StatCard, chartAxis, chartGrid, chartTooltip } from '../shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { DataTable, Column } from '../data-table'
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts'
import { api } from '@/lib/api-client'
import { useApp } from '@/store/app'
import { formatINR, formatINRShort, formatDate, formatWeight } from '@/lib/format'
import { Package, HandCoins, Receipt, Users, TrendingUp, TrendingDown, FileDown } from 'lucide-react'
import { useFirmRole, MANAGER_ONLY_TITLE } from './use-firm-role'
import { toast } from 'sonner'
import { GstSellTable } from '../print/gst-sell-table'
import type { SaleRow } from '@/lib/sales-report'
import { financialYear } from '@/lib/accounting'

const COLORS = ['#d97706', '#10b981', '#8b5cf6', '#f43f5e', '#14b8a6', '#64748b']

/**
 * Direct fetch + blob download instead of window.open(url, '_blank'): the route returns a real
 * XML file on success but a JSON {error} body on 401/403, and window.open cannot tell the
 * difference — a refused staff user got raw JSON dumped in a blank tab instead of a refusal.
 */
async function downloadTallyExport(firmId: string) {
  const res = await fetch(`/api/export/tally?firmId=${firmId}`, { credentials: 'same-origin' })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    toast.error(data.error || `Export failed (${res.status})`)
    return
  }
  const blob = await res.blob()
  const filename = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || `tally-${firmId}.xml`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function ReportsModule() {
  const { activeFirmId } = useApp()
  const { isManager } = useFirmRole()
  const { data } = useQuery({ queryKey: ['dashboard', activeFirmId], queryFn: () => api<any>('/api/dashboard', { search: { firmId: activeFirmId! } }), enabled: !!activeFirmId })
  const { data: stockData } = useQuery({ queryKey: ['stock-report', activeFirmId], queryFn: () => api<{ items: any[] }>('/api/stock', { search: { firmId: activeFirmId!, status: 'all' } }), enabled: !!activeFirmId })
  const { data: loanData } = useQuery({ queryKey: ['loan-report', activeFirmId], queryFn: () => api<{ loans: any[] }>('/api/loans', { search: { firmId: activeFirmId!, status: 'all' } }), enabled: !!activeFirmId })
  // type is sent explicitly on both — purchases must never leak into the sales report
  const { data: invData } = useQuery({ queryKey: ['inv-report', activeFirmId, 'sale'], queryFn: () => api<{ invoices: any[] }>('/api/invoices', { search: { firmId: activeFirmId!, status: 'completed', type: 'sale' } }), enabled: !!activeFirmId })
  const { data: purchaseData } = useQuery({ queryKey: ['inv-report', activeFirmId, 'purchase'], queryFn: () => api<{ invoices: any[] }>('/api/invoices', { search: { firmId: activeFirmId!, status: 'completed', type: 'purchase' } }), enabled: !!activeFirmId })
  const { data: urdData } = useQuery({ queryKey: ['inv-report', activeFirmId, 'urd'], queryFn: () => api<{ invoices: any[] }>('/api/invoices', { search: { firmId: activeFirmId!, status: 'completed', type: 'urd' } }), enabled: !!activeFirmId })
  // Real sale returns — Invoice.type='sale-return', each line pointing back at the original via
  // InvoiceItem.returnOfItemId. status:'all' because a return is rarely left 'completed'.
  const { data: returnData } = useQuery({ queryKey: ['inv-report', activeFirmId, 'sale-return'], queryFn: () => api<{ invoices: any[] }>('/api/invoices', { search: { firmId: activeFirmId!, status: 'all', type: 'sale-return' } }), enabled: !!activeFirmId })
  // Cancelled/deleted bills — oMunim's DELETED SOLDOUT LIST. Nothing else in the app shows them.
  const { data: cancelledData } = useQuery({ queryKey: ['inv-report', activeFirmId, 'deleted'], queryFn: () => api<{ invoices: any[] }>('/api/invoices', { search: { firmId: activeFirmId!, status: 'deleted', type: 'all' } }), enabled: !!activeFirmId })
  const purchaseRows = [...(purchaseData?.invoices || []), ...(urdData?.invoices || [])]
  // Returned LINE ITEMS, not return documents — oMunim's RETURNED ITEM LIST is item-level.
  const returnedRows = (returnData?.invoices ?? []).flatMap((i: any) => (i.items ?? []).map((it: any) => ({
    ...it, invoiceNo: i.invoiceNo, invoiceDate: i.invoiceDate, customerName: i.customerName, returnReason: i.returnReason,
  })))

  if (!data) return <div><PageHeader title="Reports" hindi="रिपोर्ट" /><div className="h-64 rounded-xl bg-muted animate-pulse" /></div>
  const c = data.counts

  return (
    <div>
      <PageHeader title="Reports" hindi="रिपोर्ट" desc="Stock, sales, loans & business analytics" actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => activeFirmId && downloadTallyExport(activeFirmId)}
          disabled={!activeFirmId || isManager === false}
          title={isManager === false ? MANAGER_ONLY_TITLE : "Export this financial year's vouchers as a Tally (ERP 9 / Prime) XML import file"}
        >
          <FileDown className="size-4 mr-1.5" /> Export to Tally
        </Button>
      } />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <StatCard title="Total Sales" value={formatINRShort(c.salesTotal)} icon={TrendingUp} tone="violet" hint={`${c.invoices} invoices`} />
        <StatCard title="Purchases" value={formatINRShort(c.purchaseTotal || 0)} icon={Receipt} tone="amber" hint={`${c.purchaseInvoices || 0} bills`} />
        <StatCard title="Stock Value" value={formatINRShort(c.stockValue)} icon={Package} tone="emerald" hint={`${c.stockItems} items`} />
        <StatCard title="Loan Outstanding" value={formatINRShort(c.loanOutstanding)} icon={HandCoins} tone="coral" hint={`${c.activeLoans} active`} />
        <StatCard title="Expenses" value={formatINRShort(c.expenses)} icon={TrendingDown} tone="slate" />
      </div>

      <Tabs defaultValue="sales" className="w-full">
        <TabsList className="mb-3 max-w-full justify-start overflow-x-auto nice-scroll">
          <TabsTrigger value="sales">Sales Analysis</TabsTrigger>
          <TabsTrigger value="purchases">Purchases</TabsTrigger>
          <TabsTrigger value="stock">Stock Analysis</TabsTrigger>
          <TabsTrigger value="loans">Loan Analysis</TabsTrigger>
          <TabsTrigger value="returned">Returned Items</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled Bills</TabsTrigger>
          <TabsTrigger value="raw">Raw Metal</TabsTrigger>
          <TabsTrigger value="gstsell">GST Sell Report</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Monthly Sales Trend</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.monthlySales}><CartesianGrid {...chartGrid} vertical={false} /><XAxis dataKey="label" {...chartAxis} /><YAxis {...chartAxis} tickFormatter={(v) => formatINRShort(v)} /><Tooltip formatter={(v: any) => formatINR(v)} {...chartTooltip} /><Bar dataKey="total" fill="#d97706" radius={[8, 8, 0, 0]} /></BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Recent Invoices</CardTitle></CardHeader>
            <CardContent>
              <DataTable data={invData?.invoices || []} columns={invColumns} searchKeys={['invoiceNo', 'customerName']} searchPlaceholder="Search invoices…" pageSize={8} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="purchases" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Purchase Bills (incl. URD)</CardTitle></CardHeader>
            <CardContent>
              <DataTable data={purchaseRows} columns={invColumns} searchKeys={['invoiceNo', 'customerName']} searchPlaceholder="Search purchases…" pageSize={8} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stock" className="space-y-4">
          <div className="grid lg:grid-cols-2 gap-4">
            <Card><CardHeader><CardTitle className="text-base">Stock by Category</CardTitle></CardHeader><CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart><Pie data={data.stockByCategory.map((s: any) => ({ name: s.category, value: s._count }))} dataKey="value" nameKey="name" outerRadius={90} label>{data.stockByCategory.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart>
              </ResponsiveContainer>
            </CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">Stock Value by Category</CardTitle></CardHeader><CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.stockByCategory.map((s: any) => ({ name: s.category, value: s._sum?.mrp || 0 }))} layout="vertical"><CartesianGrid {...chartGrid} horizontal={false} /><XAxis type="number" {...chartAxis} tickFormatter={(v) => formatINRShort(v)} /><YAxis type="category" dataKey="name" {...chartAxis} width={80} /><Tooltip formatter={(v: any) => formatINR(v)} {...chartTooltip} /><Bar dataKey="value" fill="#10b981" radius={[0, 8, 8, 0]} /></BarChart>
              </ResponsiveContainer>
            </CardContent></Card>
          </div>
          <Card><CardHeader><CardTitle className="text-base">Stock Items</CardTitle></CardHeader><CardContent>
            <DataTable data={stockData?.items || []} columns={stockColumns} searchKeys={['name', 'itemCode', 'brand']} searchPlaceholder="Search stock…" pageSize={8} />
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="loans" className="space-y-4">
          <Card><CardHeader><CardTitle className="text-base">Loans by Status</CardTitle></CardHeader><CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.loanByStatus.map((l: any) => ({ name: l.status, count: l._count, amount: l._sum?.principalAmount || 0 }))}><CartesianGrid {...chartGrid} vertical={false} /><XAxis dataKey="name" {...chartAxis} /><YAxis {...chartAxis} /><Tooltip {...chartTooltip} /><Bar dataKey="count" fill="#f43f5e" radius={[8, 8, 0, 0]} /></BarChart>
            </ResponsiveContainer>
          </CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">All Loans</CardTitle></CardHeader><CardContent>
            <DataTable data={loanData?.loans || []} columns={loanColumns} searchKeys={['loanNo', 'customerName']} searchPlaceholder="Search loans…" pageSize={8} />
          </CardContent></Card>
        </TabsContent>

        {/* Re-order List tab removed: it was `qty <= 1 && status === 'available'`, a placeholder, not a
            re-order signal — real re-ordering now lives on the Stock Insights screen (/api/stock/insights). */}
        {/* Approval Items tab removed: approval / sale-or-return stock is not modelled anywhere in the
            schema, and the tab was listing all available fine stock under a misleading name. */}

        {/* Returned Items — real sale-return line items */}
        <TabsContent value="returned" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Returned Item List</CardTitle></CardHeader>
            <CardContent>
              <DataTable
                data={returnedRows}
                columns={returnItemColumns}
                searchKeys={['name', 'invoiceNo', 'customerName']}
                searchPlaceholder="Search returned items…"
                pageSize={10}
                emptyMessage="No returned items."
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cancelled Bills — Invoice.status='deleted' (oMunim's DELETED SOLDOUT LIST) */}
        <TabsContent value="cancelled" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Cancelled Bills</CardTitle></CardHeader>
            <CardContent>
              <DataTable
                data={cancelledData?.invoices ?? []}
                columns={cancelledColumns}
                searchKeys={['invoiceNo', 'customerName']}
                searchPlaceholder="Search cancelled bills…"
                pageSize={10}
                emptyMessage="No cancelled bills."
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Raw Metal Lists */}
        <TabsContent value="raw" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Raw Metal Stock</CardTitle></CardHeader>
            <CardContent>
              {(() => {
                const rawItems = (stockData?.items || []).filter(s => s.category === 'raw')
                return rawItems.length === 0
                  ? <p className="text-center py-8 text-muted-foreground">No raw metal stock</p>
                  : <DataTable data={rawItems} columns={[
                      { key: 'itemCode', header: 'Code', render: (s) => <span className="font-mono text-xs text-amber-600">{s.itemCode}</span> },
                      { key: 'name', header: 'Name' },
                      { key: 'metalType', header: 'Metal' },
                      { key: 'netWeight', header: 'Net Wt', numeric: true, render: (s) => <span className="font-mono text-xs">{s.netWeight}g</span> },
                      { key: 'purity', header: 'Purity' },
                      { key: 'mrp', header: 'Value', numeric: true, render: (s) => formatINR(s.mrp) },
                    ]} searchKeys={['name', 'itemCode']} searchPlaceholder="Search raw metal…" pageSize={10} />
              })()}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="gstsell"><GstSellReport firmId={activeFirmId} /></TabsContent>
      </Tabs>
    </div>
  )
}

/** One row per invoice line; oMunim's seven GST SELL REPORT variants are this table + column visibility. */
function GstSellReport({ firmId }: { firmId: string | null }) {
  // DEFAULT TO THIS FINANCIAL YEAR, not to all time. Measured on a 20,000-invoice shop, an unbounded
  // call is 7.33 MB and ~2s single / 7.3s at eight concurrent readers - on a counter PC, as the
  // DEFAULT view. An accountant works a year at a time anyway, and the dates are right there to widen.
  const fy = financialYear()
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const [from, setFrom] = useState(iso(fy.from))
  const [to, setTo] = useState(iso(fy.to))
  const firmQ = useQuery({ queryKey: ['firms'], queryFn: () => api<{ firms: any[] }>('/api/firms') })
  const { data, isLoading } = useQuery({
    queryKey: ['gst-sell-report', firmId, from, to],
    queryFn: () => api<{ rows: SaleRow[]; truncated: boolean }>('/api/reports/gst-sell', { search: { firmId: firmId!, ...(from && { from }), ...(to && { to }) } }),
    enabled: !!firmId,
  })
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center gap-3">
        <CardTitle className="text-base">GST Sell Report by Product and Invoice with Weight</CardTitle>
        <label className="ml-auto flex items-center gap-1.5 text-xs">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 rounded-md border bg-background px-2" /></label>
        <label className="flex items-center gap-1.5 text-xs">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 rounded-md border bg-background px-2" /></label>
      </CardHeader>
      <CardContent><GstSellTable rows={data?.rows ?? []} loading={isLoading} truncated={data?.truncated} firm={firmQ.data?.firms.find((f) => f.id === firmId)} from={from} to={to} /></CardContent>
    </Card>
  )
}

const invColumns: Column<any>[] = [
  { key: 'invoiceNo', header: 'Inv No', render: (i) => <span className="font-mono text-xs text-amber-600">{i.invoiceNo}</span> },
  { key: 'invoiceDate', header: 'Date', render: (i) => <span className="text-xs">{formatDate(i.invoiceDate)}</span> },
  { key: 'customerName', header: 'Customer' },
  { key: 'totalAmount', header: 'Total', numeric: true, render: (i) => <span className="font-semibold">{formatINR(i.totalAmount)}</span> },
]
// Item-level return list. Note InvoiceItem has no qty column in this schema — weight is the
// quantity a jewellery line is actually measured in, so that is what the column shows.
const returnItemColumns: Column<any>[] = [
  { key: 'invoiceDate', header: 'Date', render: (r) => <span className="text-xs">{formatDate(r.invoiceDate)}</span> },
  { key: 'invoiceNo', header: 'Return Inv No', render: (r) => <span className="font-mono text-xs text-amber-600">{r.invoiceNo}</span> },
  { key: 'customerName', header: 'Customer' },
  { key: 'name', header: 'Item', render: (r) => <span>{r.name}{r.itemCode ? <span className="ml-1.5 font-mono text-xs text-amber-600">{r.itemCode}</span> : null}</span> },
  { key: 'netWeight', header: 'Weight', numeric: true, render: (r) => (r.netWeight || r.grossWeight) ? <span className="font-mono text-xs">{formatWeight(r.netWeight || r.grossWeight)}</span> : '—' },
  { key: 'total', header: 'Amount', numeric: true, render: (r) => <span className="font-semibold">{formatINR(r.total || r.amount || 0)}</span> },
  { key: 'returnReason', header: 'Reason', render: (r) => <span className="text-xs text-muted-foreground">{r.returnReason || '—'}</span> },
]
const cancelledColumns: Column<any>[] = [
  ...invColumns,
  { key: 'type', header: 'Type', render: (i) => <span className="capitalize text-xs">{i.type}</span> },
]
const stockColumns: Column<any>[] = [
  { key: 'itemCode', header: 'Code', render: (s) => <span className="font-mono text-xs text-amber-600">{s.itemCode}</span> },
  { key: 'name', header: 'Name' },
  { key: 'category', header: 'Category', render: (s) => <span className="capitalize text-xs">{s.category}</span> },
  { key: 'netWeight', header: 'Net Wt', numeric: true, render: (s) => s.netWeight ? <span className="font-mono text-xs">{s.netWeight}g</span> : '—' },
  { key: 'mrp', header: 'MRP', numeric: true, render: (s) => formatINR(s.mrp) },
  { key: 'status', header: 'Status' },
]
const loanColumns: Column<any>[] = [
  { key: 'loanNo', header: 'Loan No', render: (l) => <span className="font-mono text-xs text-amber-600">{l.loanNo}</span> },
  { key: 'loanDate', header: 'Date', render: (l) => <span className="text-xs">{formatDate(l.loanDate)}</span> },
  { key: 'customerName', header: 'Customer' },
  { key: 'principalAmount', header: 'Principal', numeric: true, render: (l) => <span className="font-semibold">{formatINR(l.principalAmount)}</span> },
  { key: 'status', header: 'Status' },
]
