'use client'
/**
 * 1. DayBookSheet  — the day book oMunim splits across omdaybook / omdaybookbal / omdaybooksummery.
 *                    One document: opening balances, the day's vouchers, the summary, closing
 *                    balances. A day book without opening and closing is just a list.
 * 2. LabelSheet    — bulk barcode labels. ONE print job for any number of items, laid out on a real
 *                    label grid, instead of one window.print() popup per item.
 *
 * Both read data that already exists: GET /api/ledger (aggregated in SQL, real opening balances)
 * and whatever stock rows the caller hands in.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { PrintSheet, Page, Letterhead, Signatures, DocFooter, Barcode, type PaperId, type FirmLike } from './print-sheet'
import { formatINR, formatWeight, formatDate } from '@/lib/format'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

// ═════════════════════════ 1. Day book ═════════════════════════

type TbRow = {
  code: string; name: string; type: string
  openingDebit: number; openingCredit: number
  periodDebit: number; periodCredit: number
  debit: number; credit: number
}
type LedgerLeg = {
  id: string; date: string; accountName: string; particulars?: string | null
  debit: number; credit: number; type: string; voucherId?: string | null; reversalOfId?: string | null
}

const VOUCHER_LABEL: Record<string, string> = {
  sale: 'Sales', purchase: 'Purchases', urd: 'URD purchases', loan: 'Gold loan', udhaar: 'Udhaar',
  scheme: 'Schemes', expense: 'Expenses', receipt: 'Receipts', payment: 'Payments',
  contra: 'Contra', journal: 'Journal', opening: 'Opening', repair: 'Repairs',
}

/** Net a trial-balance row onto its natural side: +ve = debit balance, -ve = credit balance. */
const net = (dr: number, cr: number) => Math.round((dr - cr) * 100) / 100
const signed = (n: number) => `${formatINR(Math.abs(n))} ${n < 0 ? 'Cr' : 'Dr'}`

/**
 * Cash and bank are singled out at the top because that is the number the owner checks the drawer
 * against. Matched on the account NAME, not the code — a firm that renamed its chart still has an
 * account with "cash" or "bank" in it, whereas its codes are its own business.
 */
const isCashOrBank = (r: TbRow) => r.type === 'asset' && /\b(cash|bank)\b/i.test(r.name)

export function DayBookSheet({ firmId, firm, open, onClose, defaultDate }: {
  firmId: string
  firm?: FirmLike | null
  open: boolean
  onClose: () => void
  defaultDate?: string
}) {
  const [day, setDay] = useState(() => defaultDate || new Date().toLocaleDateString('en-CA'))
  const [paper, setPaper] = useState<PaperId>('a4')

  const { data, isLoading, error } = useQuery({
    queryKey: ['daybook-print', firmId, day],
    // from = to = the single day. The route's opening column is then the true brought-forward
    // balance at 00:00 and the closing column the balance at 23:59.
    queryFn: () => api<any>('/api/ledger', { search: { firmId, from: day, to: day, limit: '500' } }),
    enabled: open && !!firmId && !!day,
  })

  const tb: TbRow[] = data?.trialBalance || []
  const legs: LedgerLeg[] = data?.entries || []
  const truncated = (data?.entriesTotal ?? 0) > legs.length

  // Only accounts that opened with a balance or moved today belong on a day book.
  const active = tb.filter((r) => r.periodDebit || r.periodCredit || r.openingDebit || r.openingCredit)
  const cashRows = active.filter(isCashOrBank)

  const byVoucher = useMemo(() => groupVouchers(legs), [legs])
  const summary = useMemo(() => {
    const m = new Map<string, { vouchers: Set<string>; debit: number; credit: number }>()
    for (const l of legs) {
      const k = l.type || 'journal'
      let b = m.get(k)
      if (!b) { b = { vouchers: new Set(), debit: 0, credit: 0 }; m.set(k, b) }
      b.vouchers.add(l.voucherId || l.id)
      b.debit += l.debit || 0
      b.credit += l.credit || 0
    }
    return [...m.entries()].map(([type, v]) => ({ type, count: v.vouchers.size, debit: v.debit, credit: v.credit }))
      .sort((a, b) => b.debit + b.credit - (a.debit + a.credit))
  }, [legs])

  const dayDebit = legs.reduce((s, l) => s + (l.debit || 0), 0)
  const dayCredit = legs.reduce((s, l) => s + (l.credit || 0), 0)
  const dateLabel = formatDate(day)

  return (
    <PrintSheet
      open={open} onClose={onClose}
      title={`Day Book — ${dateLabel}`}
      paper={paper} onPaperChange={setPaper}
      toolbar={
        <label className="flex items-center gap-1.5 text-xs">
          <span className="text-stone-400">Date</span>
          <Input
            type="date" value={day} onChange={(e) => setDay(e.target.value)}
            className="h-8 w-[9.5rem] border-stone-700 bg-stone-800 text-stone-100"
          />
        </label>
      }
    >
      <Page paper={paper}>
        <Letterhead
          firm={firm} title="Day Book" hindi="दैनिक बही"
          right={<div className="text-right text-[9px]"><p className="text-stone-500">For the day</p><p className="text-[12px] font-bold">{dateLabel}</p></div>}
        />

        {isLoading && <p className="py-10 text-center text-[10px] text-stone-500">Loading the day&apos;s entries…</p>}
        {error && (
          <p className="mt-4 rounded border border-rose-400 bg-rose-50 p-3 text-center text-[10px] text-rose-800">
            Could not load the day book: {(error as Error).message}. Nothing below is printable — close
            this preview rather than filing an incomplete day book.
          </p>
        )}

        {!isLoading && !error && (
          <>
            {(data?.warnings || []).map((w: string) => (
              <p key={w} className="mt-2 rounded border border-amber-500 bg-amber-50 p-1.5 text-[8px] text-amber-900">⚠ {w}</p>
            ))}
            {truncated && (
              <p className="mt-2 rounded border border-amber-500 bg-amber-50 p-1.5 text-[8px] text-amber-900">
                ⚠ {data.entriesTotal} legs posted on this date; only the first {legs.length} are listed
                (API page cap). The balance tables below are summed in SQL and remain complete.
              </p>
            )}

            {/* Opening — cash & bank band */}
            <Band title="Opening Balance" hindi="प्रारंभिक शेष" rows={cashRows.map((r) => ({
              name: r.name, value: signed(net(r.openingDebit, r.openingCredit)),
            }))} empty="No cash or bank account has an opening balance." />

            {/* The day's vouchers */}
            <section className="mt-3">
              <SectionTitle>Transactions of the day <Hi>दिन के लेन-देन</Hi></SectionTitle>
              {legs.length === 0 ? (
                <p className="rounded border border-dashed border-stone-400 p-5 text-center text-[10px] text-stone-500">
                  No transaction was posted on {dateLabel}.
                  <span className="mt-0.5 block leading-[1.6]">इस दिनांक को कोई लेन-देन दर्ज नहीं।</span>
                </p>
              ) : (
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-stone-100 text-[8px] uppercase tracking-wide text-stone-700">
                      <Th className="w-10 text-center">V. No</Th>
                      <Th className="w-[22mm]">Type</Th>
                      <Th className="w-[44mm]">Account</Th>
                      <Th>Particulars</Th>
                      <Th className="w-[24mm] text-right">Debit</Th>
                      <Th className="w-[24mm] text-right">Credit</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {byVoucher.map((v, vi) => v.legs.map((l, li) => (
                      <tr key={l.id} className={cn(
                        'border-b border-stone-200',
                        li === 0 && vi > 0 && 'border-t border-stone-300',
                        l.reversalOfId && 'text-stone-500 italic',
                      )}>
                        <Td className="text-center text-stone-500">{li === 0 ? vi + 1 : ''}</Td>
                        <Td className="capitalize">{li === 0 ? (VOUCHER_LABEL[l.type] || l.type) : ''}</Td>
                        <Td className={cn(l.credit > 0 && 'pl-4')}>
                          {l.debit > 0 ? 'Dr ' : 'To '}<span className="font-medium">{l.accountName}</span>
                        </Td>
                        <Td className="text-stone-600">{l.particulars || '—'}</Td>
                        <Td className="text-right font-mono">{l.debit ? formatINR(l.debit) : '—'}</Td>
                        <Td className="text-right font-mono">{l.credit ? formatINR(l.credit) : '—'}</Td>
                      </tr>
                    )))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-stone-500 bg-stone-50 font-bold">
                      <Td colSpan={4} className="text-right">Total for the day</Td>
                      <Td className="text-right font-mono">{formatINR(dayDebit)}</Td>
                      <Td className="text-right font-mono">{formatINR(dayCredit)}</Td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </section>

            {/* Summary by voucher type */}
            {summary.length > 0 && (
              <section className="avoid-break mt-3">
                <SectionTitle>Summary <Hi>सारांश</Hi></SectionTitle>
                <table className="w-[110mm] border-collapse">
                  <thead>
                    <tr className="bg-stone-100 text-[8px] uppercase tracking-wide text-stone-700">
                      <Th>Voucher type</Th><Th className="w-16 text-right">Count</Th>
                      <Th className="w-[26mm] text-right">Debit</Th><Th className="w-[26mm] text-right">Credit</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((s) => (
                      <tr key={s.type} className="border-b border-stone-200">
                        <Td className="capitalize font-medium">{VOUCHER_LABEL[s.type] || s.type}</Td>
                        <Td className="text-right font-mono">{s.count}</Td>
                        <Td className="text-right font-mono">{s.debit ? formatINR(s.debit) : '—'}</Td>
                        <Td className="text-right font-mono">{s.credit ? formatINR(s.credit) : '—'}</Td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-stone-500 bg-stone-50 font-bold">
                      <Td className="text-right" colSpan={2}>Total</Td>
                      <Td className="text-right font-mono">{formatINR(dayDebit)}</Td>
                      <Td className="text-right font-mono">{formatINR(dayCredit)}</Td>
                    </tr>
                  </tfoot>
                </table>
                {Math.round((dayDebit - dayCredit) * 100) !== 0 && (
                  <p className="mt-1 text-[8px] font-medium text-rose-700">
                    Debits and credits do not agree by {formatINR(Math.abs(dayDebit - dayCredit))} — the underlying legs are unbalanced.
                  </p>
                )}
              </section>
            )}

            {/* All account balances: opening, movement, closing */}
            <section className="mt-3">
              <SectionTitle>Account balances <Hi>खाता शेष</Hi></SectionTitle>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-stone-100 text-[8px] uppercase tracking-wide text-stone-700">
                    <Th className="w-12">Code</Th><Th>Account</Th>
                    <Th className="w-[26mm] text-right">Opening</Th>
                    <Th className="w-[22mm] text-right">Day Dr</Th>
                    <Th className="w-[22mm] text-right">Day Cr</Th>
                    <Th className="w-[26mm] text-right">Closing</Th>
                  </tr>
                </thead>
                <tbody>
                  {active.map((r) => (
                    <tr key={r.code + r.name} className={cn('border-b border-stone-200', isCashOrBank(r) && 'bg-amber-50 font-medium')}>
                      <Td className="font-mono text-stone-500">{r.code}</Td>
                      <Td>{r.name}</Td>
                      <Td className="text-right font-mono">{signed(net(r.openingDebit, r.openingCredit))}</Td>
                      <Td className="text-right font-mono">{r.periodDebit ? formatINR(r.periodDebit) : '—'}</Td>
                      <Td className="text-right font-mono">{r.periodCredit ? formatINR(r.periodCredit) : '—'}</Td>
                      <Td className="text-right font-mono font-semibold">{signed(net(r.debit, r.credit))}</Td>
                    </tr>
                  ))}
                  {!active.length && <tr><Td colSpan={6} className="py-4 text-center text-stone-500">No account has a balance or movement.</Td></tr>}
                </tbody>
              </table>
            </section>

            {/* Closing — cash & bank band */}
            <Band title="Closing Balance" hindi="अंतिम शेष" tone="amber" rows={cashRows.map((r) => ({
              name: r.name, value: signed(net(r.debit, r.credit)),
            }))} empty="No cash or bank account carries a closing balance." />
          </>
        )}

        <Signatures blocks={[
          { label: 'Prepared by', hindi: 'तैयारकर्ता' },
          { label: 'Checked by', hindi: 'जाँचकर्ता' },
          { label: 'Proprietor / Partner', hindi: 'स्वामी' },
        ]} />
        <DocFooter note={`Day Book · ${dateLabel} · ${firm?.name || ''}`} />
      </Page>
    </PrintSheet>
  )
}

/** Keeps the legs of one voucher together and debits above credits, the way a day book reads. */
function groupVouchers(legs: LedgerLeg[]) {
  const m = new Map<string, LedgerLeg[]>()
  for (const l of legs) {
    const k = l.voucherId || l.id
    const arr = m.get(k)
    if (arr) arr.push(l)
    else m.set(k, [l])
  }
  return [...m.values()]
    .map((ls) => ({
      legs: [...ls].sort((a, b) => (b.debit || 0) - (a.debit || 0)),
      at: new Date(ls[0].date).getTime(),
    }))
    .sort((a, b) => a.at - b.at)
}

function Band({ title, hindi, rows, empty, tone }: {
  title: string; hindi: string; rows: { name: string; value: string }[]; empty: string; tone?: 'amber'
}) {
  return (
    <section className={cn(
      'avoid-break mt-3 rounded border p-2',
      tone === 'amber' ? 'border-amber-600 bg-amber-50' : 'border-stone-400 bg-stone-50',
    )}>
      <p className="text-[8px] font-bold uppercase tracking-wide text-stone-700">
        {title} <span className="ml-1 font-medium normal-case leading-[1.6]">{hindi}</span>
      </p>
      {rows.length === 0 ? (
        <p className="mt-0.5 text-[9px] text-stone-500">{empty}</p>
      ) : (
        <div className="mt-1 flex flex-wrap gap-x-8 gap-y-1">
          {rows.map((r) => (
            <div key={r.name} className="flex items-baseline gap-2">
              <span className="text-[9px] text-stone-600">{r.name}</span>
              <span className="font-mono text-[11px] font-bold">{r.value}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-stone-700">{children}</h2>
}
function Hi({ children }: { children: React.ReactNode }) {
  return <span className="ml-1 font-medium normal-case tracking-normal leading-[1.6]">{children}</span>
}
function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th scope="col" className={cn('border-b border-stone-400 px-1 py-1 text-left font-semibold', className)}>{children}</th>
}
function Td({ children, className, colSpan }: { children?: React.ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={cn('px-1 py-[3px] align-top', className)}>{children}</td>
}

// ═════════════════════════ 2. Bulk barcode labels ═════════════════════════

export type LabelItem = {
  id: string
  name?: string | null
  itemCode?: string | null
  barcode?: string | null
  hallmarkUid?: string | null
  purity?: string | null
  netWeight?: number | null
  grossWeight?: number | null
  mrp?: number | null
}

export type LabelConfig = {
  widthMm: number
  heightMm: number
  gapMm: number
  copies: number
  showName: boolean
  showWeight: boolean
  showPrice: boolean
  showBorder: boolean
}

export const DEFAULT_LABEL_CONFIG: LabelConfig = {
  widthMm: 50, heightMm: 25, gapMm: 2, copies: 1,
  showName: true, showWeight: true, showPrice: true, showBorder: true,
}

const labelCode = (i: LabelItem) => i.barcode || i.itemCode || i.hallmarkUid || i.id.slice(-8).toUpperCase()

/**
 * Every selected item, every copy, ONE print job on one continuous A4 grid. The old path opened a
 * popup and called print() per item, so tagging fifty new pieces meant fifty dialogs.
 * Label size is a setting; there is no "65L template" and "84L template" — those are two numbers.
 * The presets below are named shortcuts for the sizes the trade asks for by name (TAIL 55×13, 65L,
 * 84L), not separate templates: each one only writes widthMm/heightMm.
 */
const LABEL_PRESETS: { label: string; w: number; h: number }[] = [
  { label: 'Tail 55×13', w: 55, h: 13 },   // oMunim TAIL LABELS / this app's `tag` paper size
  { label: '65L', w: 38.1, h: 21.2 },      // 65 per A4 — Avery L7651
  { label: '84L', w: 46, h: 11.1 },        // 84 per A4 — Avery L7656
  { label: '50×25', w: 50, h: 25 },        // DEFAULT_LABEL_CONFIG
]
export function LabelSheet({ items, open, onClose, config: configProp }: {
  items: LabelItem[]
  open: boolean
  onClose: () => void
  config?: Partial<LabelConfig>
}) {
  const [cfg, setCfg] = useState<LabelConfig>({ ...DEFAULT_LABEL_CONFIG, ...configProp })
  const set = <K extends keyof LabelConfig>(k: K, v: LabelConfig[K]) => setCfg((c) => ({ ...c, [k]: v }))

  const labels = useMemo(
    () => items.flatMap((it) => Array.from({ length: Math.max(1, cfg.copies) }, (_, c) => ({ it, key: `${it.id}-${c}` }))),
    [items, cfg.copies],
  )
  if (!items.length) return null

  return (
    <PrintSheet
      open={open} onClose={onClose}
      title={`Barcode labels — ${items.length} item${items.length > 1 ? 's' : ''} × ${cfg.copies} = ${labels.length}`}
      paper="label" paperChoices={['label']}
      toolbar={
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1" role="group" aria-label="Label size presets">
            {LABEL_PRESETS.map((p) => {
              const active = cfg.widthMm === p.w && cfg.heightMm === p.h
              return (
                <button
                  key={p.label}
                  type="button"
                  aria-pressed={active}
                  // Sets state directly, not through Num's integer clamp — 38.1 and 11.1 are fractional.
                  onClick={() => setCfg((c) => ({ ...c, widthMm: p.w, heightMm: p.h }))}
                  className={cn(
                    'h-8 rounded border px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500',
                    active
                      ? 'border-amber-500 bg-amber-500 text-stone-900'
                      : 'border-stone-700 bg-stone-800 text-stone-100 hover:bg-stone-700',
                  )}
                >
                  {p.label}
                </button>
              )
            })}
          </div>
          <Num label="W mm" value={cfg.widthMm} min={20} max={100} onChange={(v) => set('widthMm', v)} />
          <Num label="H mm" value={cfg.heightMm} min={8} max={60} onChange={(v) => set('heightMm', v)} />
          <Num label="Gap" value={cfg.gapMm} min={0} max={10} onChange={(v) => set('gapMm', v)} />
          <Num label="Copies" value={cfg.copies} min={1} max={20} onChange={(v) => set('copies', v)} />
          <Toggle label="Name" checked={cfg.showName} onChange={(v) => set('showName', v)} />
          <Toggle label="Wt" checked={cfg.showWeight} onChange={(v) => set('showWeight', v)} />
          <Toggle label="Price" checked={cfg.showPrice} onChange={(v) => set('showPrice', v)} />
          <Toggle label="Border" checked={cfg.showBorder} onChange={(v) => set('showBorder', v)} />
        </div>
      }
    >
      <Page paper="label" className="p-[2mm]">
        <div className="flex flex-wrap content-start" style={{ gap: `${cfg.gapMm}mm` }}>
          {labels.map(({ it, key }) => (
            <div
              key={key}
              className={cn(
                'avoid-break flex flex-col items-center justify-between overflow-hidden px-[1mm] py-[0.8mm] text-center',
                cfg.showBorder ? 'border border-dashed border-stone-400' : '',
              )}
              style={{ width: `${cfg.widthMm}mm`, height: `${cfg.heightMm}mm` }}
            >
              {cfg.showName && (
                <p className="w-full truncate text-[6.5px] font-bold uppercase leading-[1.1]">{it.name || '—'}</p>
              )}
              {cfg.showWeight && (
                <p className="w-full truncate text-[6px] leading-[1.1] text-stone-600">
                  {[it.purity, it.netWeight ? formatWeight(it.netWeight) : null].filter(Boolean).join(' · ') || ' '}
                </p>
              )}
              {/* Height-constrained, never width-constrained: a long code must get NARROWER bars,
                  not a taller barcode that swallows the price line. */}
              <div className="flex min-h-0 w-full flex-1 items-center justify-center">
                <Barcode
                  value={labelCode(it)}
                  heightPx={40}
                  barWidth={1}
                  showText={false}
                  className="h-full w-auto max-w-full object-contain"
                />
              </div>
              <p className="w-full truncate font-mono text-[6.5px] font-semibold leading-[1.1] tracking-wider">{labelCode(it)}</p>
              {cfg.showPrice && (
                <p className="w-full truncate text-[7.5px] font-bold leading-[1.1]">{formatINR(it.mrp)}</p>
              )}
            </div>
          ))}
        </div>
      </Page>
    </PrintSheet>
  )
}

function Num({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-1">
      <span className="text-stone-400">{label}</span>
      <Input
        type="number" min={min} max={max} step="0.1" value={value}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
        className="h-8 w-14 border-stone-700 bg-stone-800 px-1 text-center text-stone-100"
      />
    </label>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = `lbl-${label.toLowerCase()}`
  return (
    <div className="flex items-center gap-1">
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="data-[state=checked]:bg-amber-500" />
      <Label htmlFor={id} className="text-stone-300">{label}</Label>
    </div>
  )
}
