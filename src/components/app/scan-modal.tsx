'use client'
import { useState, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Barcode, ScanLine, Search, X, ArrowRight } from 'lucide-react'
import { routeBarcode, type BarcodeRoute } from '@/lib/barcode'
import { useApp } from '@/store/app'
import { api } from '@/lib/api-client'
import { toast } from 'sonner'
import { formatINR, formatDate } from '@/lib/format'

type ScanResult = {
  route: BarcodeRoute
  data: any
}

export function ScanModal({ open, onOpenChange, onResult }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onResult: (route: BarcodeRoute, data: any) => void
}) {
  const activeFirmId = useApp((s) => s.activeFirmId)
  const setView = useApp((s) => s.setView)
  const [scanValue, setScanValue] = useState('')
  const [result, setResult] = useState<ScanResult | null>(null)
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setScanValue('')
      setResult(null)
    }
  }

  useEffect(() => {
    // Auto-focus the input
    if (open) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  // Auto-submit on Enter (barcode scanners send Enter)
  async function handleScan(code: string) {
    if (!code.trim() || !activeFirmId) return
    setSearching(true)
    setResult(null)
    const route = routeBarcode(code)
    try {
      let data: any = null
      switch (route.type) {
        case 'loan': {
          const r = await api<{ loans: any[] }>('/api/loans', { search: { firmId: activeFirmId, status: 'all', search: route.searchValue } })
          data = r.loans?.[0]
          break
        }
        case 'stock': {
          const r = await api<{ items: any[] }>('/api/stock', { search: { firmId: activeFirmId, status: 'all', search: route.searchValue } })
          data = r.items?.[0]
          break
        }
        case 'customer': {
          const r = await api<{ customers: any[] }>('/api/customers', { search: { firmId: activeFirmId, search: route.searchValue } })
          data = r.customers?.[0]
          break
        }
        case 'invoice': {
          const r = await api<{ invoices: any[] }>('/api/invoices', { search: { firmId: activeFirmId, status: 'all', search: route.searchValue } })
          data = r.invoices?.[0]
          break
        }
        case 'unknown':
        default: {
          // Search everything
          const r = await api<{ results: any }>('/api/search', { search: { firmId: activeFirmId, q: route.searchValue } })
          data = r.results
          break
        }
      }
      setResult({ route, data })
      if (!data) toast.info(`No match found for: ${code}`)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSearching(false)
    }
  }

  function handleNavigate() {
    if (!result) return
    onResult(result.route, result.data)
    onOpenChange(false)
    switch (result.route.type) {
      case 'loan': setView('loans'); break
      case 'stock': setView('stock'); break
      case 'customer': setView('customers'); break
      case 'invoice': setView('sell'); break
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Barcode className="size-5 text-amber-600" /> Barcode Scanner
          </DialogTitle>
        </DialogHeader>

        {/* Scan input */}
        <div className="space-y-2">
          <div className="relative">
            <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-amber-500 animate-pulse" />
            <Input
              ref={inputRef}
              data-barcode-input
              data-enter-skip
              className="pl-11 h-14 text-lg font-mono tracking-wider border-2 border-amber-300 focus:border-amber-500"
              placeholder="Scan or type barcode…"
              value={scanValue}
              onChange={(e) => setScanValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleScan(scanValue) }}
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => handleScan(scanValue)} className="flex-1 btn-brand" disabled={!scanValue.trim() || searching}>
              {searching ? 'Searching…' : <><Search className="size-4" /> Scan</>}
            </Button>
            <Button variant="outline" onClick={() => { setScanValue(''); setResult(null); inputRef.current?.focus() }}>
              <X className="size-4" /> Clear
            </Button>
          </div>
        </div>

        {/* Prefix guide */}
        <div className="rounded-lg bg-muted/50 p-3 text-xs">
          <p className="font-semibold text-muted-foreground mb-1.5">Barcode Prefix Guide:</p>
          <div className="grid grid-cols-2 gap-1 text-muted-foreground">
            <span><code className="text-amber-600">S</code> Loan</span>
            <span><code className="text-amber-600">P</code> Fine Jewellery</span>
            <span><code className="text-amber-600">A</code> Imitation</span>
            <span><code className="text-amber-600">B</code> Sterling Silver</span>
            <span><code className="text-amber-600">C</code> Customer</span>
            <span><code className="text-amber-600">H</code> HUID</span>
            <span><code className="text-amber-600">M</code> Email</span>
            <span><code className="text-amber-600">L</code> Loyalty Card</span>
            <span><code className="text-amber-600">Q</code> Quotation</span>
            <span><code className="text-amber-600">T</code> Transfer Loan</span>
          </div>
        </div>

        {/* Result */}
        {result && result.data && (
          <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="size-8 rounded-lg bg-emerald-500 grid place-items-center text-white">
                <Search className="size-4" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">{result.route.type} found</p>
                <p className="font-bold">{getDisplayName(result.route.type, result.data)}</p>
              </div>
            </div>
            <div className="text-sm space-y-1">
              {getResultDetails(result.route.type, result.data)}
            </div>
            <Button onClick={handleNavigate} className="w-full mt-3 bg-emerald-600 hover:bg-emerald-700 text-white">
              View {result.route.type} <ArrowRight className="size-4 ml-1" />
            </Button>
          </div>
        )}
        {result && !result.data && !searching && (
          <div className="rounded-lg border-2 border-rose-300 bg-rose-50 dark:bg-rose-950/30 p-4 text-center">
            <X className="size-8 mx-auto mb-2 text-rose-500" />
            <p className="font-medium text-rose-700 dark:text-rose-300">No match found</p>
            <p className="text-xs text-muted-foreground mt-1">Barcode "{scanValue}" did not match any record</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function getDisplayName(type: string, data: any): string {
  if (type === 'loan') return `${data.loanNo} — ${data.customerName}`
  if (type === 'stock') return `${data.name} (${data.itemCode || '—'})`
  if (type === 'customer') return `${data.firstName} ${data.lastName || ''}`.trim()
  if (type === 'invoice') return `${data.invoiceNo} — ${data.customerName}`
  return 'Result'
}

function getResultDetails(type: string, data: any): React.ReactNode {
  if (type === 'loan') {
    return <>
      <Row label="Principal" value={formatINR(data.principalAmount)} />
      <Row label="Date" value={formatDate(data.loanDate)} />
      <Row label="Status" value={data.status} />
    </>
  }
  if (type === 'stock') {
    return <>
      <Row label="Category" value={data.category} />
      <Row label="Purity" value={data.purity || '—'} />
      <Row label="MRP" value={formatINR(data.mrp)} />
      <Row label="Status" value={data.status} />
    </>
  }
  if (type === 'customer') {
    return <>
      <Row label="Mobile" value={data.mobile || '—'} />
      <Row label="City" value={data.city || '—'} />
      <Row label="Type" value={data.type} />
    </>
  }
  if (type === 'invoice') {
    return <>
      <Row label="Date" value={formatDate(data.invoiceDate)} />
      <Row label="Amount" value={formatINR(data.totalAmount)} />
      <Row label="Payment" value={data.paymentMode} />
    </>
  }
  // Unknown — show counts
  if (data?.customers || data?.stock || data?.loans || data?.invoices) {
    return <>
      <Row label="Customers" value={data.customers?.length || 0} />
      <Row label="Stock Items" value={data.stock?.length || 0} />
      <Row label="Loans" value={data.loans?.length || 0} />
      <Row label="Invoices" value={data.invoices?.length || 0} />
    </>
  }
  return null
}

function Row({ label, value }: { label: string; value: any }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value}</span></div>
}
