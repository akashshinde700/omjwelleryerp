'use client'
/**
 * Stock Tally — the physical stock-take. Desktop job = REVIEW and PRINT; counting happens on the
 * handheld (Expo app), but a USB scanner on this PC works too via the one scan box.
 *
 * oMunim ships five cards for this (fine RFID tally, imitation manual tally, imitation RFID tally,
 * tracking log, duplicate report), each with a REQUIRED counter + location picker. Removed here:
 *  - the five cards -> one screen; "fine / imitation / manual / RFID" is just an optional Category
 *    filter plus how the code arrived (source), not a separate workflow;
 *  - required Counter/Location pickers -> optional free text with suggestions (his stock has none);
 *  - the report you only see AFTER finishing -> MISSING is a live counter while you scan;
 *  - a scan box that silently dies when focus leaves -> a visible "not active" line.
 */
import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '../shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { ClipboardCheck, ScanLine, Printer, AlertTriangle, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { PrintSheet, Page, Letterhead, DocFooter, Fact, type PaperId, type FirmLike } from '../print/print-sheet'
import { api } from '@/lib/api-client'
import { useApp } from '@/store/app'
import { formatINR, formatWeight, formatDateTime } from '@/lib/format'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useFirmRole, MANAGER_ONLY_TITLE } from './use-firm-role'

type Line = { id: string; itemCode: string | null; barcode: string | null; rfidNo: string | null; name: string; category: string | null; purity: string | null; qty: number; netWeight: number; value: number; counter: string | null; location: string | null; scannedAt?: string; source?: string }
type ExtraLine = { code: string; scannedAt: string; source: string; reason: 'not_in_books' | 'other_counter' | 'not_available'; item?: Line }
type Agg = { pieces: number; qty: number; netWeight: number; value: number }
type TallyRow = { id: string; counter: string | null; location: string | null; category: string | null; status: 'open' | 'closed' | 'discarded'; startedAt: string; closedAt: string | null; userName: string | null; expectedQty: number; countedQty: number; missingQty: number; extraCount: number; expectedNetWeight: number; countedNetWeight: number; missingNetWeight: number }
type Detail = { linesMatchTotals: boolean; tally: TallyRow & { note: string | null }; counted: Line[]; missing: Line[]; extra: ExtraLine[]; totals: { expected: Agg; counted: Agg; missing: Agg; extra: { count: number } } }
type Dup = { code: string; field: string; items: Line[] }
type Scan = { id: string; code: string; scannedAt: string; source: string; tallyId: string; tallyCounter: string | null; item: Line | null }

const CATEGORIES = ['fine', 'imitation', 'raw', 'crystal', 'sterling']
const REASON = (e: ExtraLine) =>
  e.reason === 'not_in_books' ? 'not in the books'
  : e.reason === 'other_counter' ? `belongs to another counter${e.item?.counter ? ` (${e.item.counter})` : ''}`
  : 'in the books as sold/transferred'
const scopeOf = (t: Pick<TallyRow, 'counter' | 'location' | 'category'>) =>
  [t.category, t.counter, t.location].filter(Boolean).join(' · ') || 'the whole firm'

/** Same-origin call that keeps the body of a non-2xx answer (api() throws it away; the 409 carries tallyId). */
async function tallyCall(method: string, body: unknown) {
  const res = await fetch('/api/stock/tally', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

const scans = (n: number) => `${n} ${n === 1 ? 'scan' : 'scans'}`

const DRIFT = 'Stock has changed since this count was closed. The totals above are the figures recorded on the day; the list below shows those pieces as they are priced today.'

function Banner({ children, tone = 'amber' }: { children: React.ReactNode; tone?: 'amber' | 'red' | 'green' }) {
  return (
    <div role={tone === 'red' ? 'alert' : 'status'} className={cn('mb-3 flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
      tone === 'amber' && 'border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
      tone === 'red' && 'border-red-500 bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-200',
      tone === 'green' && 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200')}>
      {tone === 'green' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export function StockTallyModule() {
  const [tallyId, setTallyId] = useState<string | null>(null)
  return tallyId ? <TallyView id={tallyId} onBack={() => setTallyId(null)} /> : <TallyList onOpen={setTallyId} />
}

// ───────────────────────── level 1 ─────────────────────────

function TallyList({ onOpen }: { onOpen: (id: string) => void }) {
  const { activeFirmId } = useApp()
  const qc = useQueryClient()
  const [f, setF] = useState({ counter: '', location: '', category: 'all', note: '' })
  const [busy, setBusy] = useState(false)
  const [conflict, setConflict] = useState<{ message: string; tallyId: string } | null>(null)
  const [scansOpen, setScansOpen] = useState(false)

  const list = useQuery({
    queryKey: ['stock-tally', activeFirmId],
    queryFn: () => api<{ tallies: TallyRow[] }>('/api/stock/tally', { search: { firmId: activeFirmId! } }),
    enabled: !!activeFirmId, retry: false,
  })
  const dups = useQuery({
    queryKey: ['stock-tally-dups', activeFirmId],
    queryFn: () => api<{ duplicates: Dup[] }>('/api/stock/tally', { search: { firmId: activeFirmId!, duplicates: '1' } }),
    enabled: !!activeFirmId, retry: false,
  })
  const scans = useQuery({
    queryKey: ['stock-tally-scans', activeFirmId],
    queryFn: () => api<{ scans: Scan[] }>('/api/stock/tally', { search: { firmId: activeFirmId!, scans: '1' } }),
    enabled: !!activeFirmId && scansOpen, retry: false,
  })
  // Suggestions only — his stock has no counters yet, so this is usually an empty datalist.
  const stock = useQuery({
    queryKey: ['stock-tally-stock', activeFirmId],
    queryFn: () => api<{ items: { counter?: string | null; location?: string | null }[] }>('/api/stock', { search: { firmId: activeFirmId!, status: 'all' } }),
    enabled: !!activeFirmId,
  })
  const uniq = (k: 'counter' | 'location') => [...new Set((stock.data?.items || []).map((i) => i[k]).filter(Boolean) as string[])]

  const tallies = list.data?.tallies || []
  const open = tallies.filter((t) => t.status === 'open')
  const past = tallies.filter((t) => t.status !== 'open')

  async function start() {
    if (!activeFirmId || busy) return
    setBusy(true); setConflict(null)
    try {
      const r = await tallyCall('POST', {
        firmId: activeFirmId, counter: f.counter.trim() || undefined, location: f.location.trim() || undefined,
        category: f.category === 'all' ? undefined : f.category, note: f.note.trim() || undefined,
      })
      if (r.status === 409 && r.data.tallyId) setConflict({ message: r.data.error, tallyId: r.data.tallyId })
      else if (!r.ok) toast.error(r.data.error || 'Could not start the tally')
      else { qc.invalidateQueries({ queryKey: ['stock-tally'] }); onOpen(r.data.tally.id) }
    } catch { toast.error('Could not reach the server. Nothing was started.') }
    setBusy(false)
  }

  const dupList = dups.data?.duplicates || []
  return (
    <div>
      <PageHeader title="Stock Tally" hindi="स्टॉक मिलान" desc="Count what is on the shelf against what the books say" />

      {list.error && <Banner><b>Stock tally is not ready.</b> {(list.error as Error).message}</Banner>}

      <div className="mb-4">
        <div className="sheet-fields grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_9rem_1.5fr_auto] lg:items-end">
          <div><label className="sheet-label" htmlFor="tl-counter">Counter (optional)</label>
            <Input id="tl-counter" list="tl-counters" value={f.counter} onChange={(e) => setF({ ...f, counter: e.target.value })} placeholder="All counters" className="h-8" /></div>
          <div><label className="sheet-label" htmlFor="tl-loc">Location (optional)</label>
            <Input id="tl-loc" list="tl-locs" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="All locations" className="h-8" /></div>
          <div><label className="sheet-label" htmlFor="tl-cat">Category (optional)</label>
            <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v })}>
              <SelectTrigger id="tl-cat" className="h-8 w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All</SelectItem>{CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
            </Select></div>
          <div><label className="sheet-label" htmlFor="tl-note">Note (optional)</label>
            <Input id="tl-note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && start()} className="h-8" /></div>
          <Button className="btn-brand h-8" onClick={start} disabled={busy || !activeFirmId}><ClipboardCheck className="size-4" /> Start a stock tally</Button>
          <datalist id="tl-counters">{uniq('counter').map((v) => <option key={v} value={v} />)}</datalist>
          <datalist id="tl-locs">{uniq('location').map((v) => <option key={v} value={v} />)}</datalist>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Leave Counter and Location empty to count every available piece in this firm.</p>
      </div>

      {conflict && (
        <Banner>
          {conflict.message}{' '}
          <Button size="sm" variant="outline" className="ml-2 h-7" onClick={() => onOpen(conflict.tallyId)}>Open it</Button>
        </Banner>
      )}

      {open.map((t) => (
        <div key={t.id} className="mb-3 flex flex-wrap items-center gap-3 rounded-md border-2 border-amber-500 bg-amber-50 px-3 py-2 dark:bg-amber-950/30">
          <ScanLine className="size-5 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Tally in progress — <span className="capitalize">{scopeOf(t)}</span></p>
            <p className="text-xs text-muted-foreground">Started {formatDateTime(t.startedAt)} by {t.userName || '—'} · {t.countedQty} of {t.expectedQty} counted · <b className="text-red-600">{t.missingQty} missing</b></p>
          </div>
          <Button className="btn-brand" onClick={() => onOpen(t.id)}>Continue</Button>
        </div>
      ))}

      <h3 className="sheet-title mb-1 mt-4">Past tallies</h3>
      {list.isLoading ? <p className="p-3 text-sm text-muted-foreground">Loading…</p> : list.error ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Past tallies could not be read.</p>
      ) : past.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No finished tallies yet.</p>
      ) : (
        <div className="overflow-hidden rounded-md border">
          {past.map((t) => (
            <button key={t.id} onClick={() => onOpen(t.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-0.5 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/50">
              <span className="w-40 tabular-nums">{formatDateTime(t.startedAt)}</span>
              <span className="min-w-0 flex-1 capitalize">{scopeOf(t)} <span className="text-xs normal-case text-muted-foreground">· {t.userName || '—'}</span></span>
              {t.status === 'discarded' ? <span className="text-xs text-muted-foreground">Discarded — no figures recorded</span> : <>
                <span className="text-xs tabular-nums">Expected {t.expectedQty}</span>
                <span className="text-xs tabular-nums">Counted {t.countedQty}</span>
                <span className={cn('text-xs tabular-nums', t.missingQty > 0 && 'font-semibold text-red-600')}>Missing {t.missingQty}</span>
                <span className={cn('text-xs tabular-nums', t.extraCount > 0 && 'font-semibold text-amber-600')}>Extra {t.extraCount}</span>
              </>}
            </button>
          ))}
        </div>
      )}

      <details className={cn('mt-4 rounded-md border', dupList.length > 0 && 'border-red-500')}>
        <summary className={cn('cursor-pointer px-3 py-2 text-sm font-semibold', dupList.length > 0 ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-400')}>
          {dups.error ? 'Duplicate tags' : dupList.length > 0 ? `${dupList.length} duplicate tag${dupList.length > 1 ? 's' : ''} — every count that touches them is wrong` : 'No duplicate tags'}
        </summary>
        <div className="space-y-2 p-3 text-sm">
          {dups.error && <Banner>{(dups.error as Error).message}</Banner>}
          {dupList.map((d) => (
            <div key={d.field + d.code} className="rounded border border-red-300 p-2">
              <p className="font-mono font-semibold text-red-700 dark:text-red-300">{d.code} <span className="font-sans text-xs font-normal text-muted-foreground">({d.field}) is on {d.items.length} pieces</span></p>
              {d.items.map((i) => <p key={i.id} className="text-xs">{i.itemCode} · {i.name} · {formatWeight(i.netWeight)}{i.counter ? ` · ${i.counter}` : ''}</p>)}
            </div>
          ))}
        </div>
      </details>

      <details className="mt-3 rounded-md border" onToggle={(e) => setScansOpen((e.currentTarget as HTMLDetailsElement).open)}>
        <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">Recent scans</summary>
        <div className="p-3 text-sm">
          {scans.error && <Banner>{(scans.error as Error).message}</Banner>}
          {scans.isLoading && <p className="text-muted-foreground">Loading…</p>}
          {scans.data && scans.data.scans.length === 0 && <p className="text-muted-foreground">No scans recorded yet.</p>}
          {scans.data?.scans.map((s) => (
            <div key={s.id} className="flex flex-wrap gap-x-4 border-b py-1 last:border-b-0">
              <span className="w-40 text-xs tabular-nums text-muted-foreground">{formatDateTime(s.scannedAt)}</span>
              <span className="w-32 font-mono text-xs">{s.code}</span>
              <span className="min-w-0 flex-1 text-xs">{s.item ? `${s.item.itemCode} · ${s.item.name}` : <i className="text-amber-600">not in the books</i>}</span>
              <span className="text-xs text-muted-foreground">{s.tallyCounter || 'all counters'}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}

// ───────────────────────── level 2 ─────────────────────────

function TallyView({ id, onBack }: { id: string; onBack: () => void }) {
  const { activeFirmId } = useApp()
  const { isManager } = useFirmRole()
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [active, setActive] = useState(true)
  const [last, setLast] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null)
  const [confirm, setConfirm] = useState<'close' | 'discard' | null>(null)
  const [printing, setPrinting] = useState(false)
  const [paper, setPaper] = useState<PaperId>('a4')

  const q = useQuery({
    queryKey: ['stock-tally-detail', id],
    queryFn: () => api<Detail>('/api/stock/tally', { search: { firmId: activeFirmId!, id } }),
    enabled: !!activeFirmId, retry: false,
  })
  const { data: firmsData } = useQuery({ queryKey: ['firms'], queryFn: () => api<{ firms: (FirmLike & { id: string })[] }>('/api/firms'), staleTime: 5 * 60 * 1000 })
  const firm = firmsData?.firms.find((x) => x.id === activeFirmId)

  const d = q.data
  const t = d?.tally
  const isOpen = t?.status === 'open'

  async function scan(raw: string) {
    const code = raw.trim()
    if (!code || !activeFirmId) return
    try {
      const r = await api<{ accepted: number; duplicates: number; matched: Line[]; extra: ExtraLine[] }>('/api/stock/tally/scan', { method: 'POST', body: { firmId: activeFirmId, tallyId: id, codes: [code], source: 'keyboard' } })
      // `duplicates` is the count the server REFUSED as already-scanned (the scan endpoint is
      // idempotent on (tally, code)). It still echoes the piece in `matched`, so this branch has to
      // come first: a second pass over the same tag must read as "already counted", never as a
      // fresh green confirm — that is how a counter convinces itself it counted two pieces.
      if (r.duplicates > 0) setLast({ tone: 'warn', text: `${code}: already counted in this tally — not counted twice` })
      else if (r.extra?.length) setLast({ tone: 'warn', text: `${code}: EXTRA — ${REASON(r.extra[0])}` })
      else if (r.matched?.length) setLast({ tone: 'ok', text: `${code}: ${r.matched[0].itemCode || ''} ${r.matched[0].name}` })
      else setLast({ tone: 'warn', text: `${code}: not recorded` })
      qc.invalidateQueries({ queryKey: ['stock-tally-detail', id] }); qc.invalidateQueries({ queryKey: ['stock-tally'] }); qc.invalidateQueries({ queryKey: ['stock-tally-scans'] })
    } catch (e) { setLast({ tone: 'warn', text: `${code}: not recorded — ${(e as Error).message}` }) }
  }

  async function finish(action: 'close' | 'discard') {
    const r = await tallyCall('PUT', { id, action })
    if (!r.ok) return toast.error(r.data.error || (r.status === 403 ? MANAGER_ONLY_TITLE : 'Could not update the tally'))
    toast.success(action === 'close' ? 'Tally closed. Stock was not changed.' : 'Tally discarded.')
    qc.invalidateQueries({ queryKey: ['stock-tally'] }); qc.invalidateQueries({ queryKey: ['stock-tally-detail', id] })
    if (action === 'discard') onBack()
  }

  const back = <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="size-4" /> All tallies</Button>
  if (q.error) return <div>{back}<Banner><b>Stock tally is not ready.</b> {(q.error as Error).message}</Banner></div>
  if (!d || !t) return <div>{back}<p className="p-4 text-sm text-muted-foreground">Loading…</p></div>

  const T = d.totals
  const scope = scopeOf(t)
  const closeText = `Close the tally for ${scope}? ${T.expected.qty} expected, ${T.counted.qty} counted, ${T.missing.qty} missing (${formatWeight(T.missing.netWeight)}), ${T.extra.count} extra. Closing records this result and freezes the figures. It changes no stock.`

  return (
    <div>
      <PageHeader title={`Stock Tally — ${scope}`} hindi="स्टॉक मिलान"
        desc={`${isOpen ? 'Open · started' : 'Started'} ${formatDateTime(t.startedAt)} by ${t.userName || '—'}${isOpen ? '' : ` · ${t.status === 'closed' ? 'Closed' : 'Discarded'}${t.closedAt ? ` ${formatDateTime(t.closedAt)}` : ''}`}`}
        actions={<div className="flex flex-wrap gap-2">
          {back}
          <Button variant="outline" size="sm" onClick={() => setPrinting(true)}><Printer className="size-4" /> Print</Button>
          {isOpen && <Button size="sm" className="btn-brand" onClick={() => setConfirm('close')}>Close tally</Button>}
          {isOpen && <Button size="sm" variant="outline" className="text-destructive disabled:opacity-40" disabled={isManager === false} title={isManager === false ? MANAGER_ONLY_TITLE : 'Discard this tally'} onClick={() => setConfirm('discard')}>Discard</Button>}
        </div>} />

      <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Counter label="Expected" a={T.expected} />
        <Counter label="Counted" a={T.counted} tone="green" />
        <Counter label="Missing" a={T.missing} tone={T.missing.qty > 0 ? 'red' : 'green'} />
        <Counter label="Extra" count={T.extra.count} tone={T.extra.count > 0 ? 'amber' : 'green'} />
      </div>

      {isOpen && (
        <div className="mb-4">
          <div className="sheet-fields grid-cols-1">
            <label className="sheet-label" htmlFor="tl-scan">Scan or type a barcode / RFID / item code, then Enter</label>
            <Input id="tl-scan" ref={inputRef} autoFocus autoComplete="off" className="h-10 font-mono text-base"
              onFocus={() => setActive(true)} onBlur={() => setActive(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); const el = e.currentTarget; const v = el.value; el.value = ''; scan(v) }
                else if (e.key === 'Escape') e.currentTarget.value = ''
              }} />
            {last && <p className={cn('text-sm font-medium', last.tone === 'ok' ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400')} aria-live="polite">{last.text}</p>}
          </div>
          {!active && (
            <button type="button" onClick={() => inputRef.current?.focus()} className="mt-1 w-full rounded-md border border-amber-400 bg-amber-50 px-3 py-1.5 text-left text-sm font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Scan box is not active — click here to resume scanning
            </button>
          )}
          <p className="mt-1 text-xs text-muted-foreground">Barcode scanners in keyboard mode, and typed codes, work today. The UHF RFID trigger on a Chainway handheld is not wired yet; use the handheld app or its keyboard mode.</p>
        </div>
      )}
      {!isOpen && <Banner tone="green">This tally is {t.status}. The figures below are frozen and read-only.</Banner>}

      {t.status === 'closed' && d.linesMatchTotals === false && <Banner>{DRIFT}</Banner>}

      <Lists d={d} />

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === 'close' ? 'Close this tally?' : 'Discard this tally?'}</AlertDialogTitle>
            <AlertDialogDescription>{confirm === 'close' ? closeText : `Discard the tally for ${scope}? It will not count as a result. It changes no stock.`}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep counting</AlertDialogCancel>
            <AlertDialogAction onClick={() => finish(confirm!)}>{confirm === 'close' ? 'Close tally' : 'Discard'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PrintSheet open={printing} onClose={() => setPrinting(false)} title={`Stock tally — ${scope}`} paper={paper} onPaperChange={setPaper} paperChoices={['a4', 'a5']}>
        <Page paper={paper}>
          <Letterhead firm={firm} title="Stock Tally Reconciliation" hindi="स्टॉक मिलान" />
          <div className="my-2 grid grid-cols-4 gap-2">
            <Fact label="Scope" value={scope} /><Fact label="Status" value={t.status} />
            <Fact label="Started" value={formatDateTime(t.startedAt)} /><Fact label="Closed" value={t.closedAt ? formatDateTime(t.closedAt) : 'still open'} />
            <Fact label="By" value={t.userName || '—'} />
            <Fact label="Expected" value={`${T.expected.qty} · ${formatWeight(T.expected.netWeight)} · ${formatINR(T.expected.value)}`} />
            <Fact label="Counted" value={`${T.counted.qty} · ${formatWeight(T.counted.netWeight)} · ${formatINR(T.counted.value)}`} />
            <Fact label="Missing" value={`${T.missing.qty} · ${formatWeight(T.missing.netWeight)} · ${formatINR(T.missing.value)}`} />
            <Fact label="Extra" value={scans(T.extra.count)} />
            {t.note && <Fact label="Note" value={t.note} className="col-span-3" />}
          </div>
          {t.status === 'closed' && d.linesMatchTotals === false && <p className="my-2 border border-stone-400 px-2 py-1 text-xs">{DRIFT.replace('above', 'at the top').replace('below', 'on this sheet')}</p>}
          <PrintList title="Missing (in the books, not on the shelf)" lines={d.missing} agg={T.missing} />
          <PrintList title="Extra (scanned, not reconciled)" extra={d.extra} />
          <PrintList title="Counted (reconciled)" lines={d.counted} agg={T.counted} />
          <DocFooter note="Closing a tally records the result only; it changes no stock." />
        </Page>
      </PrintSheet>
    </div>
  )
}

function Counter({ label, a, count, tone }: { label: string; a?: Agg; count?: number; tone?: 'green' | 'red' | 'amber' }) {
  return (
    <div className={cn('rounded-md border-2 px-3 py-2',
      !tone && 'border-border', tone === 'green' && 'border-emerald-500/60', tone === 'amber' && 'border-amber-500 bg-amber-50 dark:bg-amber-950/30',
      tone === 'red' && 'border-red-600 bg-red-600 text-white')}>
      <p className={cn('text-[10px] font-bold uppercase tracking-wider', tone === 'red' ? 'text-red-100' : 'text-muted-foreground')}>{label}</p>
      <p className="text-3xl font-bold leading-tight tabular-nums">{a ? a.qty : count}<span className="ml-1 text-xs font-medium opacity-70">{a ? 'pcs' : count === 1 ? 'scan' : 'scans'}</span></p>
      {a && <p className="text-xs tabular-nums opacity-80">{a.pieces} {a.pieces === 1 ? "line" : "lines"} · {formatWeight(a.netWeight)} · {formatINR(a.value)}</p>}
    </div>
  )
}

function Lists({ d }: { d: Detail }) {
  const T = d.totals
  return (
    <div className="space-y-4">
      <Section title="Missing" sub="in the books, not scanned" tone="red" agg={T.missing}>
        {d.missing.map((l) => <Row key={l.id} l={l} />)}
      </Section>
      <Section title="Extra" sub="scanned, but not reconciled" tone="amber" countOnly={T.extra.count}>
        {d.extra.map((e, i) => <Row key={e.code + i} l={e.item} code={e.code} note={REASON(e)} />)}
      </Section>
      <Section title="Counted" sub="found and matched" tone="green" agg={T.counted}>
        {d.counted.map((l) => <Row key={l.id} l={l} />)}
      </Section>
    </div>
  )
}

function Section({ title, sub, tone, agg, countOnly, children }: { title: string; sub: string; tone: 'red' | 'amber' | 'green'; agg?: Agg; countOnly?: number; children: React.ReactNode[] }) {
  return (
    <section className="overflow-hidden rounded-md border">
      <h3 className={cn('flex flex-wrap items-baseline gap-x-3 px-3 py-1.5 text-sm font-bold',
        tone === 'red' && 'bg-red-600 text-white', tone === 'amber' && 'bg-amber-500 text-stone-950', tone === 'green' && 'bg-emerald-600 text-white')}>
        {title} <span className="text-xs font-normal opacity-90">{sub}</span>
        <span className="ml-auto text-xs tabular-nums">{agg ? `${agg.qty} pcs · ${formatWeight(agg.netWeight)} · ${formatINR(agg.value)}` : scans(countOnly ?? 0)}</span>
      </h3>
      {children.length === 0 ? <p className="px-3 py-2 text-sm text-muted-foreground">Nothing here.</p> : <div className="max-h-96 overflow-auto">{children}</div>}
    </section>
  )
}

/** Stacked on a phone (flex-wrap), one line on a desktop. */
function Row({ l, code, note }: { l?: Line; code?: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b px-3 py-1.5 text-sm last:border-b-0">
      <span className="w-24 shrink-0 font-mono text-xs text-amber-600">{l?.itemCode || code}</span>
      <span className="min-w-0 flex-1 basis-40">{l?.name || <i className="text-muted-foreground">unknown tag</i>}{note && <b className="ml-2 text-xs text-amber-700 dark:text-amber-400">{note}</b>}</span>
      {l && <>
        <span className="text-xs text-muted-foreground">{l.purity ? `${l.purity}` : ''}{l.counter ? ` · ${l.counter}` : ''}</span>
        <span className="w-24 text-right tabular-nums">{formatWeight(l.netWeight)}</span>
        <span className="w-24 text-right tabular-nums">{formatINR(l.value)}</span>
      </>}
    </div>
  )
}

function PrintList({ title, lines, agg, extra }: { title: string; lines?: Line[]; agg?: Agg; extra?: ExtraLine[] }) {
  const rows = lines ?? []
  return (
    <section className="mt-3">
      <h2 className="avoid-break border-b border-stone-400 pb-0.5 text-[11px] font-bold uppercase">
        {title}<span className="float-right normal-case">{agg ? `${agg.qty} pcs · ${formatWeight(agg.netWeight)} · ${formatINR(agg.value)}` : scans(extra?.length ?? 0)}</span>
      </h2>
      {rows.length === 0 && !extra?.length && <p className="py-1 text-stone-500">None</p>}
      <table className="w-full border-collapse">
        <tbody>
          {rows.map((l) => (
            <tr key={l.id} className="avoid-break border-b border-stone-200">
              <td className="py-0.5 pr-2 font-mono">{l.itemCode}</td><td className="pr-2">{l.name}</td>
              <td className="pr-2 text-right tabular-nums">{formatWeight(l.netWeight)}</td><td className="text-right tabular-nums">{formatINR(l.value)}</td>
            </tr>
          ))}
          {extra?.map((e, i) => (
            <tr key={e.code + i} className="avoid-break border-b border-stone-200">
              <td className="py-0.5 pr-2 font-mono">{e.code}</td><td className="pr-2">{e.item?.name || 'unknown tag'}</td>
              <td colSpan={2} className="text-right">{REASON(e)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
