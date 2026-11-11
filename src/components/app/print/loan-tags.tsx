'use client'

/**
 * LOAN TAG - the tag that hangs on a girvi (pledge) packet. oMunim's TAIL LOAN / 24L LOAN /
 * LOAN TAG tabs, which we have never had at all: every tag path here printed stock items only.
 *
 * SIMPLER THAN IT LEFT. His panel is a 15-column DataTable with Copy/CSV/Excel/JSON/PDF and
 * column-visibility buttons, over three tabs that differ only by tag size. This is one tab: a
 * search box, a tick per loan, a print button. Tag SIZE is which template you pick, which is
 * already a per-firm setting - it was never a reason for three screens.
 *
 * It reads GET /api/loans (firm-scoped, items and customer joined, Aadhaar masked there and never
 * mapped onto a tag) and posts loanIds to the existing render route. No new endpoint, no new table.
 * NO AMOUNT DUE on the tag: that figure is derived from the transaction stream and changes daily,
 * while the tag is printed once and hangs on the packet for months (see src/lib/label-loan.ts).
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Download, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api-client'
import { useApp } from '@/store/app'
import { cn } from '@/lib/utils'
import { formatDate, formatINR } from '@/lib/format'
import { useTagConfig } from './thermal-tags'

const TOUCH = 'pointer-coarse:h-11'

type TagLoan = {
  id: string
  loanNo: string
  loanDate: string
  customerName: string
  principalAmount: number
  packetNo?: string | null
  status?: string | null
}

/** The same job the stock button makes, with loanIds instead of itemIds. */
async function downloadLoanTags(firmId: string, loanIds: string[], copies: number, templateId?: string | null) {
  const res = await fetch('/api/barcode-print/render', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
    body: JSON.stringify({ firmId, loanIds, copies, format: 'raw', ...(templateId ? { templateId } : {}) }),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Request failed (${res.status})`)
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = 'tags.prn'; a.click()
  URL.revokeObjectURL(a.href)
  return res.headers.get('X-Label-Count')
}

export function LoanTagsPanel() {
  const { activeFirmId } = useApp()
  const [search, setSearch] = useState('')
  const [all, setAll] = useState(false)
  const [chosen, setChosen] = useState<Record<string, boolean>>({})
  const [pick, setPick] = useState<string | null>(null) // null = the firm's default template
  const [busy, setBusy] = useState(false)
  // Switching shop clears the ticks DURING render (never in an effect): a ticked loan id from the
  // other firm would come back from the render route as a 404, which is right but unhelpful.
  const [firmSeen, setFirmSeen] = useState(activeFirmId)
  if (firmSeen !== activeFirmId) { setFirmSeen(activeFirmId); setChosen({}); setPick(null) }

  const { data: tag } = useTagConfig(activeFirmId, pick)
  // Searched in MySQL (loan no / pledger / packet / box / locker / village), exactly as the Girvi
  // screen does it - a shop past 300 live pledges must still be able to find one.
  const { data, isLoading } = useQuery({
    queryKey: ['loan-tags', activeFirmId, all, search],
    queryFn: () => api<{ loans: TagLoan[] }>('/api/loans', { search: { firmId: activeFirmId!, status: all ? 'all' : 'active', search } }),
    enabled: !!activeFirmId,
  })

  const loans = data?.loans ?? []
  const pickedIds = useMemo(() => loans.filter((l) => chosen[l.id]).map((l) => l.id), [loans, chosen])
  const cfg = tag?.config
  const usable = (tag?.templates ?? []).filter((t) => t.hasFile)
  const tplName = cfg?.name || cfg?.templateName || tag?.id || ''
  // A tag whose template binds no loan field at all prints a blank label, and a blank label is a
  // mystery at the counter. Say which template, and say when it has nothing loan-shaped in it.
  const loanSlots = Object.values(cfg?.fields ?? {}).filter((r) => r.source.startsWith('loan')).length
  const ready = !!cfg?.templateB64 && loanSlots > 0

  const print = async (ids: string[]) => {
    setBusy(true)
    try { toast.success(`${await downloadLoanTags(activeFirmId!, ids, cfg?.copies ?? 1, pick ?? tag?.id)} label(s) in tags.prn`) }
    catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-2">
      <div className="rounded-md border">
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 p-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Loan no., pledger, packet no..."
            aria-label="Search loans for packet tags" className={cn('h-8 w-56', TOUCH)} />
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} aria-label="Include released and closed loans" className="size-3.5 accent-amber-500" />
            Include released / closed
          </label>
          {usable.length > 1 && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Template
              <select className={cn('h-8 rounded-md border bg-background px-2 text-xs', TOUCH)} aria-label="Tag template" value={pick ?? ''}
                onChange={(e) => setPick(e.target.value || null)}>
                <option value="">Firm default</option>
                {usable.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          )}
          <Button size="sm" className={cn('ml-auto', TOUCH)} disabled={!pickedIds.length || !ready || busy} onClick={() => print(pickedIds)}>
            <Download className="size-4" /> Get printer file ({pickedIds.length})
          </Button>
        </div>
        <p className="border-b px-2 py-1.5 text-[11px] text-muted-foreground">
          {!cfg?.templateB64
            ? 'No tag template has a printer file yet - set one up in Thermal Tags first.'
            : loanSlots
              ? <>The tag prints with <span className="font-medium text-foreground">{tplName}</span> ({loanSlots} loan field{loanSlots > 1 ? 's' : ''} mapped). To change what is on it, map the <span className="font-medium text-foreground">Loan - …</span> fields to that template&apos;s slots under &quot;Printer file and the rest of this tab&apos;s setup&quot;.</>
              : <span className="text-amber-700 dark:text-amber-500">No slot in <span className="font-medium">{tplName}</span> is mapped to a Loan - … field, so this tag would print blank. Map one under &quot;Printer file and the rest of this tab&apos;s setup&quot; first (loan no., pledger, packet no. are the usual three).</span>}
        </p>
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-sm"><tbody>
            {loans.map((l) => (
              <tr key={l.id} className="cursor-pointer border-t hover:bg-muted/30" onClick={() => setChosen((s) => ({ ...s, [l.id]: !s[l.id] }))}>
                <td className="w-9 p-2 pointer-coarse:py-3">
                  <input type="checkbox" aria-label={`Select loan ${l.loanNo}`} checked={!!chosen[l.id]} onChange={() => undefined} className="size-3.5 accent-amber-500" />
                </td>
                <td className="p-2 font-mono text-xs text-amber-600 pointer-coarse:py-3">{l.loanNo}</td>
                <td className="p-2 text-xs text-muted-foreground pointer-coarse:py-3">{formatDate(l.loanDate)}</td>
                <td className="p-2 pointer-coarse:py-3">{l.customerName}</td>
                <td className="p-2 text-right tabular-nums pointer-coarse:py-3">{formatINR(l.principalAmount)}</td>
                <td className="p-2 text-xs text-muted-foreground pointer-coarse:py-3">{l.packetNo || '-'}</td>
                <td className="w-9 p-1 pointer-coarse:py-3">
                  <button type="button" className="rounded p-1 hover:bg-muted disabled:opacity-40" aria-label={`Print tag for loan ${l.loanNo}`}
                    disabled={!ready || busy} onClick={(e) => { e.stopPropagation(); void print([l.id]) }}>
                    <Printer className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
            {!loans.length && <tr><td className="p-2 text-xs text-muted-foreground">{isLoading ? 'Loading…' : 'No loan matches.'}</td></tr>}
          </tbody></table>
        </div>
      </div>
    </div>
  )
}
