'use client'
import { useId, useMemo, useState } from 'react'
import { PageHeader, EmptyState, ToneBadge, Field } from '../shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Printer, Barcode, FileText, Settings, Eye, Trash2, Building2, Columns3, Save, HandCoins, Tag, BookOpen, Gavel, ScrollText, Search, Palette, ImagePlus, X, Languages, Percent, BadgeCheck, UserRound, LayoutTemplate, Copy, MousePointerClick, RotateCcw, Lock, ShieldAlert, type LucideIcon } from 'lucide-react'
import { useApp } from '@/store/app'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { formatINR, formatDate } from '@/lib/format'
import { parseCalcSettings, type CalcSettings } from '@/lib/stock-calc'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { GirviNoteSheet, PacketTagSheet, PawnRegisterSheet, NoticeSheet, type PrintLoan, type UdhaarLike } from '../print/girvi-docs'
import { DayBookSheet, LabelSheet } from '../print/shop-docs'
import { ThermalTagsPanel } from '../print/thermal-tags'
import { InvoiceSheet, InvoicePagePreview, type PrintCustomer } from '../print/invoice-doc'
import {
  INVOICE_FIELDS, INVOICE_FIELD_GROUPS, INVOICE_DOC_TYPES, invoiceField, canHideField, statutoryWarning, isSwitchedOff, invoiceTypeOfDocType,
  invoiceFieldsKey, parseFieldOverrides, serializeFieldOverrides, countFieldOverrides,
  FIELD_FONT_MIN, FIELD_FONT_MAX, FIELD_MARGIN_MAX, FIELD_LABEL_MAX, canRenameField, fieldLabel,
  type InvoiceFieldDef, type FieldOverride, type FieldOverrides,
} from '../print/invoice-fields'
import { INVOICE_TEMPLATES, applyTemplate, matchesTemplate, paletteHex } from '../print/invoice-templates'
import { sampleInvoice, SAMPLE_FIRM, SAMPLE_CUSTOMER } from '../print/invoice-sample'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useIsMobile } from '@/hooks/use-mobile'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import {
  parseInvoiceConfig, invoiceLayoutKey, INVOICE_BANNER_KEYS, BANNER_MAX_CHARS, BANNER_BOX,
  accentPaint, contrastRatio, contentWidthMm, printableHeightMm, bannerSpareMm,
  skinOf,
  type InvoiceConfig, type PrintInvoice, type FirmRate,
} from '../print/invoice-print'
import {
  parseLoanDocConfig, loanContentWidthMm, loanContentHeightMm, roiQuote, LOAN_DOCS_LAYOUT_KEY, LOAN_LICENSE_KEY,
  LOAN_DOC_SETTING_KEYS, NOTICE_LANGS, NOTE_PAPERS, REGISTER_PAPERS, NOTICE_PAPERS,
  type LoanDocConfig,
} from '../print/loan-docs-config'
import { PAPERS, type FirmLike, type PaperId } from '../print/print-sheet'
import { useFirmRole, MANAGER_ONLY_TITLE } from './use-firm-role'
import { downscaleImage } from '@/lib/image'

export function PrintModule() {
  return (
    <div>
      <PageHeader
        title="Print Center"
        hindi="प्रिंट सेंटर"
        desc="Girvi notes, statutory registers, notices, day book, thermal tags, and the saved layout for your bills and your loan papers"
      />
      <Tabs defaultValue="documents" className="w-full">
        {/* Tabs wrap to two rows below sm rather than crushing the Devanagari-free labels
            into two characters each. */}
        <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="documents"><ScrollText className="size-4 mr-1" /> Documents</TabsTrigger>
          {/* A4 sticker sheet hidden on purpose: tags print on the thermal printer. To restore, put back this trigger and the TabsContent below. */}
          <TabsTrigger value="thermal"><Printer className="size-4 mr-1" /> Bar-Code Print Panel</TabsTrigger>
          <TabsTrigger value="invoice"><FileText className="size-4 mr-1" /> Invoice Layout</TabsTrigger>
          <TabsTrigger value="loandocs"><HandCoins className="size-4 mr-1" /> Loan Documents</TabsTrigger>
        </TabsList>

        {/* ─── Girvi notes, registers, notices, day book ─── */}
        <TabsContent value="documents" className="mt-4">
          <DocumentsPanel />
        </TabsContent>

        {/* <TabsContent value="barcode" className="mt-4"><BarcodePrintPanel /></TabsContent>  -- A4 sheet, hidden; see the trigger above */}

        {/* ─── Thermal tags: the shop's own printer file, filled per item ─── */}
        <TabsContent value="thermal" className="mt-4">
          <ThermalTagsPanel />
        </TabsContent>

        {/* ─── Invoice layout: the shop's own bill ─── */}
        <TabsContent value="invoice" className="mt-4">
          <InvoiceStudio />
        </TabsContent>

        {/* ─── Loan document layout: the pawnbroker's own paper ─── */}
        <TabsContent value="loandocs" className="mt-4">
          <LoanDocsLayoutPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ═════════════════ Documents ═════════════════

/**
 * The paper a jewellery shop actually has to hand over or file. Every document here is ONE
 * component parameterised by paper size and a toggle or two — not oMunim's dozen near-identical
 * templates per document.
 */
function DocumentsPanel() {
  const { activeFirmId } = useApp()
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  // Every per-loan document takes a LIST, so one row and fifty rows are the same print job.
  const [doc, setDoc] = useState<
    | { kind: 'note' | 'auction' | 'tags'; loans: PrintLoan[] }
    | { kind: 'register' }
    | { kind: 'daybook' }
    | { kind: 'demand'; udhaar: UdhaarLike }
    | null
  >(null)

  const { data: firmData } = useQuery({
    queryKey: ['firms'],
    queryFn: () => api<{ firms: (FirmLike & { id: string })[] }>('/api/firms'),
  })
  const firm = firmData?.firms?.find((f) => f.id === activeFirmId)

  // Two rows, not the whole settings bag — the layout blob and the licence number. Same query key
  // as the layout panel, so switching tabs costs no second request.
  const { data: settingsData } = useQuery({
    queryKey: ['settings', activeFirmId, 'loan-docs'],
    queryFn: () => api<{ settings: { key: string; value: string }[] }>('/api/settings', {
      search: { firmId: activeFirmId!, keys: LOAN_DOC_SETTING_KEYS.join(',') },
    }),
    enabled: !!activeFirmId,
  })
  const config = useMemo(() => parseLoanDocConfig(settingsData?.settings), [settingsData])

  const { data, isLoading, error } = useQuery({
    queryKey: ['print-loans', activeFirmId],
    queryFn: () => api<{ loans: PrintLoan[] }>('/api/loans', { search: { firmId: activeFirmId!, status: 'all' } }),
    enabled: !!activeFirmId,
  })
  const { data: udhaarData } = useQuery({
    queryKey: ['print-udhaar', activeFirmId],
    queryFn: () => api<{ udhaars: UdhaarLike[] }>('/api/udhaar', { search: { firmId: activeFirmId!, status: 'active' } }),
    enabled: !!activeFirmId,
  })

  const loans = data?.loans || []
  const filtered = q
    ? loans.filter((l) => `${l.loanNo} ${l.customerName} ${l.customerMobile || ''}`.toLowerCase().includes(q.toLowerCase()))
    : loans
  const selectedLoans = loans.filter((l) => selected[l.id])
  // Only an unredeemed pledge can be noticed for auction — the batch honours the same rule the
  // per-row button does, silently dropping the rest rather than printing a notice that is untrue.
  const noticeable = selectedLoans.filter((l) => l.status === 'active')
  const openUdhaars = (udhaarData?.udhaars || []).filter((u) => (u.amount || 0) - (u.settledAmount || 0) > 0.005)

  return (
    <div className="space-y-4">
      {/* Shop-wide documents */}
      <div className="grid gap-3 sm:grid-cols-2">
        <DocCard
          icon={BookOpen} title="Day Book" hindi="दैनिक बही"
          desc="Opening balances, every voucher of the day, a summary by voucher type and closing balances — on one sheet."
          action="Open day book"
          onClick={() => setDoc({ kind: 'daybook' })}
          disabled={!activeFirmId}
        />
        <DocCard
          icon={ScrollText} title="Pawnbroker Register" hindi="साहूकार रजिस्टर"
          desc="Form 7 (pledges received) and Form 8 (redemptions & disposals), month-ruled, from the loan book."
          action="Open register"
          onClick={() => setDoc({ kind: 'register' })}
          disabled={!loans.length}
          note={!loans.length ? 'No loans recorded for this firm yet.' : undefined}
        />
      </div>

      {/* Per-loan documents */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <HandCoins className="size-4 text-amber-600" /> Gold Loan Documents
              <span className="text-xs font-normal leading-[1.6] text-muted-foreground">गिरवी दस्तावेज़</span>
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  value={q} onChange={(e) => setQ(e.target.value)}
                  placeholder="Loan no, customer, mobile…" aria-label="Search loans"
                  className="h-8 w-56 pl-7 text-sm"
                />
              </div>
              <Button
                size="sm" variant="outline" disabled={!selectedLoans.length}
                onClick={() => setDoc({ kind: 'note', loans: selectedLoans })}
                title="Print a girvi note for every selected loan as one job"
              >
                <FileText className="size-3.5" /> Notes ({selectedLoans.length})
              </Button>
              <Button
                size="sm" variant="outline" disabled={!selectedLoans.length}
                onClick={() => setDoc({ kind: 'tags', loans: selectedLoans })}
              >
                <Tag className="size-3.5" /> Packet tags ({selectedLoans.length})
              </Button>
              <Button
                size="sm" variant="outline" disabled={!noticeable.length}
                onClick={() => setDoc({ kind: 'auction', loans: noticeable })}
                title={selectedLoans.length && !noticeable.length
                  ? 'None of the selected loans is unredeemed — a released pledge cannot be noticed'
                  : 'Print a pre-auction notice for every selected unredeemed pledge as one job'}
              >
                <Gavel className="size-3.5" /> Notices ({noticeable.length})
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading && <div className="space-y-1 p-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-9 rounded-lg bg-muted animate-pulse" />)}</div>}
          {error && (
            <p className="p-4 text-sm text-rose-600" role="alert">
              Could not load loans: {(error as Error).message}
            </p>
          )}
          {!isLoading && !error && filtered.length === 0 && (
            <EmptyState
              icon={HandCoins}
              title={q ? 'No loan matches that search' : 'No gold loans yet'}
              desc={q ? 'Clear the search to see every loan on this firm.' : 'A girvi note can only be printed once a loan exists. Create one in Gold Loan.'}
            />
          )}
          {!isLoading && !error && filtered.length > 0 && (
            <div className="max-h-[26rem] overflow-y-auto nice-scroll">
              <table className="w-full text-sm">
                <caption className="sr-only">Gold loans available for printing</caption>
                <thead className="sticky top-0 z-1 bg-muted/80 backdrop-blur">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th scope="col" className="w-9 p-2">
                      <input
                        type="checkbox" aria-label="Select all loans"
                        checked={filtered.length > 0 && filtered.every((l) => selected[l.id])}
                        onChange={(e) => setSelected(Object.fromEntries(filtered.map((l) => [l.id, e.target.checked])))}
                        className="size-3.5 accent-amber-500"
                      />
                    </th>
                    <th scope="col" className="p-2 font-medium">Loan No</th>
                    <th scope="col" className="p-2 font-medium">Customer</th>
                    <th scope="col" className="p-2 font-medium">Date</th>
                    <th scope="col" className="p-2 font-medium text-right">Principal</th>
                    <th scope="col" className="p-2 font-medium">Items</th>
                    <th scope="col" className="p-2 font-medium">Status</th>
                    <th scope="col" className="p-2 font-medium text-right">Print</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((l) => (
                    <tr key={l.id} className="border-t hover:bg-muted/30">
                      <td className="p-2">
                        <input
                          type="checkbox" checked={!!selected[l.id]} aria-label={`Select loan ${l.loanNo}`}
                          onChange={(e) => setSelected((s) => ({ ...s, [l.id]: e.target.checked }))}
                          className="size-3.5 accent-amber-500"
                        />
                      </td>
                      <td className="p-2 font-mono text-xs font-semibold text-amber-600">{l.loanNo}</td>
                      <td className="p-2">
                        <span className="block truncate">{l.customerName}</span>
                        <span className="block font-mono text-[10px] text-muted-foreground">{l.customerMobile || '—'}</span>
                      </td>
                      <td className="p-2 text-xs">{formatDate(l.loanDate)}</td>
                      <td className="p-2 text-right font-mono text-xs">{formatINR(l.principalAmount)}</td>
                      <td className="p-2 text-xs text-muted-foreground">{l.items?.length || 0}</td>
                      <td className="p-2">
                        <ToneBadge tone={l.status === 'active' ? 'amber' : l.status === 'released' ? 'green' : 'gray'}>{l.status}</ToneBadge>
                      </td>
                      <td className="p-2">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setDoc({ kind: 'note', loans: [l] })}>
                            <FileText className="size-3.5" /> Note
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setDoc({ kind: 'tags', loans: [l] })}>
                            <Tag className="size-3.5" /> Tag
                          </Button>
                          <Button
                            size="sm" variant="outline" className="h-7 px-2"
                            disabled={l.status !== 'active'}
                            title={l.status !== 'active' ? 'Only an unredeemed pledge can be noticed for auction' : 'Pre-auction notice'}
                            onClick={() => setDoc({ kind: 'auction', loans: [l] })}
                          >
                            <Gavel className="size-3.5" /> Notice
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Udhaar demand notices */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ScrollText className="size-4 text-amber-600" /> Udhaar Demand Notices
            <span className="text-xs font-normal leading-[1.6] text-muted-foreground">उधार वसूली सूचना</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {openUdhaars.length === 0 ? (
            <EmptyState icon={ScrollText} title="Nothing outstanding" desc="Every udhaar on this firm is settled — there is no one to send a demand to." />
          ) : (
            <div className="max-h-64 overflow-y-auto nice-scroll">
              <table className="w-full text-sm">
                <caption className="sr-only">Outstanding udhaar accounts</caption>
                <thead className="sticky top-0 z-1 bg-muted/80 backdrop-blur">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th scope="col" className="p-2 font-medium">Customer</th>
                    <th scope="col" className="p-2 font-medium">Type</th>
                    <th scope="col" className="p-2 font-medium">Due</th>
                    <th scope="col" className="p-2 font-medium text-right">Balance</th>
                    <th scope="col" className="p-2 font-medium text-right">Print</th>
                  </tr>
                </thead>
                <tbody>
                  {openUdhaars.map((u) => (
                    <tr key={u.id} className="border-t hover:bg-muted/30">
                      <td className="p-2">{u.customerName}<span className="block font-mono text-[10px] text-muted-foreground">{u.customerMobile || '—'}</span></td>
                      <td className="p-2 text-xs capitalize">{u.type}</td>
                      <td className="p-2 text-xs">{u.dueDate ? formatDate(u.dueDate) : '—'}</td>
                      <td className="p-2 text-right font-mono text-xs font-semibold">{formatINR((u.amount || 0) - (u.settledAmount || 0))}</td>
                      <td className="p-2 text-right">
                        <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setDoc({ kind: 'demand', udhaar: u })}>
                          <FileText className="size-3.5" /> Notice
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── the print sheets ── */}
      {/* Mounted only while open, like the register and the notices below. A sheet seeds its paper
          and copy count from the saved layout on mount, and one that lived through the settings
          query resolving would be stuck on the defaults it was born with. */}
      {doc?.kind === 'note' && <GirviNoteSheet open onClose={() => setDoc(null)} firm={firm} loans={doc.loans} config={config} />}
      {doc?.kind === 'tags' && <PacketTagSheet open onClose={() => setDoc(null)} firm={firm} loans={doc.loans} config={config} />}
      {doc?.kind === 'register' && <PawnRegisterSheet open onClose={() => setDoc(null)} firm={firm} loans={loans} config={config} />}
      {doc?.kind === 'daybook' && activeFirmId && <DayBookSheet open onClose={() => setDoc(null)} firm={firm} firmId={activeFirmId} />}
      {doc?.kind === 'auction' && <NoticeSheet open kind="auction" onClose={() => setDoc(null)} firm={firm} loans={doc.loans} config={config} />}
      {doc?.kind === 'demand' && <NoticeSheet open kind="udhaar" onClose={() => setDoc(null)} firm={firm} udhaar={doc.udhaar} config={config} />}
    </div>
  )
}

function DocCard({ icon: Icon, title, hindi, desc, action, onClick, disabled, note }: {
  icon: LucideIcon; title: string; hindi: string; desc: string; action: string
  onClick: () => void; disabled?: boolean; note?: string
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-950/40">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {title} <span className="ml-1 text-xs font-normal leading-[1.6] text-muted-foreground">{hindi}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
          {note && <p className="mt-1 text-xs text-amber-600">{note}</p>}
        </div>
        <Button size="sm" variant="outline" onClick={onClick} disabled={disabled} className="shrink-0">
          <Printer className="size-3.5" /> {action}
        </Button>
      </CardContent>
    </Card>
  )
}

// ═════════════════ Barcode Print Panel ═════════════════

function BarcodePrintPanel() {
  const { activeFirmId } = useApp()
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [sheetOpen, setSheetOpen] = useState(false)
  const [search, setSearch] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['print-stock', activeFirmId],
    queryFn: () => api<{ items: any[] }>('/api/stock', { search: { firmId: activeFirmId!, status: 'all' } }),
    enabled: !!activeFirmId,
  })
  const items = data?.items || []
  const filtered = search
    ? items.filter((i) => `${i.name || ''} ${i.itemCode || ''} ${i.barcode || ''}`.toLowerCase().includes(search.toLowerCase()))
    : items
  const chosen = items.filter((i) => selected[i.id])

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Barcode className="size-4 text-amber-600" /> Bulk Barcode Labels
              <span className="text-xs font-normal leading-[1.6] text-muted-foreground">बारकोड लेबल</span>
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Item, code, barcode…" aria-label="Search stock" className="h-8 w-56 pl-7 text-sm" />
              </div>
              <Button size="sm" variant="outline" onClick={() => setSelected({})} disabled={!chosen.length}>
                <Trash2 className="size-3.5" /> Clear ({chosen.length})
              </Button>
              <Button
                size="sm" disabled={!chosen.length} onClick={() => setSheetOpen(true)}
                className="bg-amber-500 text-stone-950 hover:bg-amber-400"
              >
                <Printer className="size-4" /> Print {chosen.length || ''} label{chosen.length === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Label size, copies and what each label shows are set in the preview. One print job however
            many items — a label size is a setting, not a template.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading && <div className="space-y-1 p-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-9 rounded-lg bg-muted animate-pulse" />)}</div>}
          {error && <p className="p-4 text-sm text-rose-600" role="alert">Could not load stock: {(error as Error).message}</p>}
          {!isLoading && !error && filtered.length === 0 && (
            <EmptyState
              icon={Barcode}
              title={search ? 'No item matches that search' : 'No stock to label'}
              desc={search ? 'Clear the search to see the whole stock list.' : 'Add stock items first — a label needs an item code or barcode to carry.'}
            />
          )}
          {!isLoading && !error && filtered.length > 0 && (
            <div className="max-h-[30rem] overflow-y-auto nice-scroll">
              <table className="w-full text-sm">
                <caption className="sr-only">Stock items available for labelling</caption>
                <thead className="sticky top-0 z-1 bg-muted/80 backdrop-blur">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th scope="col" className="w-9 p-2">
                      <input
                        type="checkbox" aria-label="Select all items"
                        checked={filtered.length > 0 && filtered.every((i) => selected[i.id])}
                        onChange={(e) => setSelected(Object.fromEntries(filtered.map((i) => [i.id, e.target.checked])))}
                        className="size-3.5 accent-amber-500"
                      />
                    </th>
                    <th scope="col" className="p-2 font-medium">Code</th>
                    <th scope="col" className="p-2 font-medium">Name</th>
                    <th scope="col" className="p-2 font-medium">Barcode</th>
                    <th scope="col" className="p-2 font-medium">Purity</th>
                    <th scope="col" className="p-2 font-medium text-right">Net Wt</th>
                    <th scope="col" className="p-2 font-medium text-right">MRP</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr
                      key={item.id}
                      className="cursor-pointer border-t hover:bg-muted/30"
                      onClick={() => setSelected((s) => ({ ...s, [item.id]: !s[item.id] }))}
                    >
                      <td className="p-2">
                        <input
                          type="checkbox" checked={!!selected[item.id]} aria-label={`Select ${item.name}`}
                          onChange={(e) => setSelected((s) => ({ ...s, [item.id]: e.target.checked }))}
                          onClick={(e) => e.stopPropagation()}
                          className="size-3.5 accent-amber-500"
                        />
                      </td>
                      <td className="p-2 font-mono text-xs text-amber-600">{item.itemCode || '—'}</td>
                      <td className="p-2">{item.name}</td>
                      <td className="p-2 font-mono text-xs">{item.barcode || item.hallmarkUid || '—'}</td>
                      <td className="p-2 text-xs">{item.purity || '—'}</td>
                      <td className="p-2 text-right font-mono text-xs">{item.netWeight || 0}g</td>
                      <td className="p-2 text-right font-semibold">{formatINR(item.mrp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <LabelSheet open={sheetOpen} onClose={() => setSheetOpen(false)} items={chosen} />
    </div>
  )
}



// ═════════════════ Loan Documents Layout ═════════════════

/**
 * The pawnbroker's own paper, set once instead of re-chosen on every print.
 *
 * The invoice got this a release ago; the loan papers — which a pawn shop prints far more often
 * than bills — got a paper dropdown that forgot its answer the moment the dialog closed.
 *
 * What is deliberately NOT here: nine Form 8 arrangements, four "FORM 8 SAMPLE" variants, seven
 * Form 7 layouts, five notice layouts. None of them changes what the document says, and shipping
 * forty of them is refusing to decide. What is here is the handful of settings that change the
 * MEANING of the paper: which stationery, which language the pledger reads, which basis the
 * interest rate is quoted in, the licence number the form is not valid without, and the
 * declarations the shop's own lawyer wrote.
 */
function LoanDocsLayoutPanel() {
  const { activeFirmId } = useApp()
  const { isManager } = useFirmRole()
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [preview, setPreview] = useState<{ kind: 'note' | 'auction' | 'register' | 'tags'; loan?: PrintLoan } | null>(null)
  const [saving, setSaving] = useState(false)

  const { data: settingsData } = useQuery({
    queryKey: ['settings', activeFirmId, 'loan-docs'],
    queryFn: () => api<{ settings: { key: string; value: string }[] }>('/api/settings', {
      search: { firmId: activeFirmId!, keys: LOAN_DOC_SETTING_KEYS.join(',') },
    }),
    enabled: !!activeFirmId,
  })
  const { data: firmData } = useQuery({
    queryKey: ['firms'],
    queryFn: () => api<{ firms: (FirmLike & { id: string })[] }>('/api/firms'),
  })
  const firm = firmData?.firms?.find((f) => f.id === activeFirmId)

  const saved = useMemo(() => parseLoanDocConfig(settingsData?.settings), [settingsData])

  // Seeded from the server copy and re-seeded during render when that changes — same tracker the
  // invoice panel uses, for the same reason: an effect would flash the previous firm's layout.
  const savedJson = JSON.stringify(saved)
  const [seed, setSeed] = useState(savedJson)
  const [cfg, setCfg] = useState<LoanDocConfig>(saved)
  if (seed !== savedJson) { setSeed(savedJson); setCfg(saved) }

  const dirty = JSON.stringify(cfg) !== savedJson
  const set = <K extends keyof LoanDocConfig>(k: K, v: LoanDocConfig[K]) => setCfg((c) => ({ ...c, [k]: v }))

  const { data, isLoading, error } = useQuery({
    queryKey: ['print-loans', activeFirmId],
    queryFn: () => api<{ loans: PrintLoan[] }>('/api/loans', { search: { firmId: activeFirmId!, status: 'all' } }),
    enabled: !!activeFirmId,
  })
  const loans = data?.loans || []
  const filtered = q
    ? loans.filter((l) => `${l.loanNo} ${l.customerName} ${l.customerMobile || ''}`.toLowerCase().includes(q.toLowerCase()))
    : loans

  async function save() {
    if (!activeFirmId) return
    setSaving(true)
    try {
      // The licence goes to its own row and is stripped from the blob: the registers API reads
      // Setting['moneyLenderLicenseNo'] directly and must keep reading the row it reads today.
      const { licenseNo, ...layout } = cfg
      const put = (key: string, value: string) =>
        api('/api/settings', { method: 'PUT', body: { firmId: activeFirmId, key, value } })
      await put(LOAN_DOCS_LAYOUT_KEY, JSON.stringify(layout))
      if (licenseNo.trim() !== saved.licenseNo) await put(LOAN_LICENSE_KEY, licenseNo.trim())
      await qc.invalidateQueries({ queryKey: ['settings'] })
      toast.success('Loan document layout saved for this firm')
    } catch (e) {
      toast.error((e as Error).message || 'Could not save the layout')
    } finally {
      setSaving(false)
    }
  }

  if (!activeFirmId) {
    return (
      <EmptyState
        icon={HandCoins}
        title="No firm selected"
        desc="Pick a firm from the top bar — a licence number and a set of declarations belong to one firm, not to the installation."
      />
    )
  }

  const roiSample = roiQuote(1, cfg)

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      {/* ── the controls ── */}
      <div className="space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="size-4 text-amber-600" /> Paper, per document
              <span className="text-xs font-normal leading-[1.6] text-muted-foreground">कागज़</span>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              What each document opens on. The operator can still change it for one job in the print
              preview without changing what the shop prints tomorrow.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <PaperField
              label="Girvi note / pawn ticket" hint="A6 and the 4-inch roll are pawn-ticket stationery — a ticket on A4 wastes half a sheet."
              value={cfg.notePaper} choices={NOTE_PAPERS} onChange={(v) => set('notePaper', v)} cfg={cfg}
            />
            <PaperField
              label="Form 7 / Form 8 register" hint="Landscape by nature: twelve ruled columns do not fit down a portrait page."
              value={cfg.registerPaper} choices={REGISTER_PAPERS} onChange={(v) => set('registerPaper', v)} cfg={cfg}
            />
            <PaperField
              label="Notices" hint="Pre-auction and demand notices."
              value={cfg.noticePaper} choices={NOTICE_PAPERS} onChange={(v) => set('noticePaper', v)} cfg={cfg}
            />
            <div className="grid grid-cols-3 gap-2">
              <MmField label="Top" value={cfg.marginTopMm} onChange={(v) => set('marginTopMm', v)} />
              <MmField label="Side" value={cfg.marginSideMm} onChange={(v) => set('marginSideMm', v)} />
              <MmField label="Bottom" value={cfg.marginBottomMm} onChange={(v) => set('marginBottomMm', v)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Margins are stated for A4 and scaled down for a smaller sheet, so one setting serves an
              A4 register and a 105 mm ticket — 12 mm here is 6 mm on A6. A roll ignores them
              entirely: its usable width belongs to the print head.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BadgeCheck className="size-4 text-amber-600" /> Licence &amp; signature
              <span className="text-xs font-normal leading-[1.6] text-muted-foreground">अनुज्ञप्ति</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Money-lender / pawnbroker licence no.">
              <Input
                value={cfg.licenseNo} onChange={(e) => set('licenseNo', e.target.value)}
                placeholder="e.g. ML/2019/0147" className="font-mono"
              />
            </Field>
            <p className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
              Prints in the letterhead of every loan document and under the licensee&apos;s signature on
              the register. Namuna 15&apos;s header has always expected this number — until now there was
              nowhere to type it, so it printed blank.
            </p>
            <Field label="Signed by">
              <Input
                value={cfg.signatory} onChange={(e) => set('signatory', e.target.value)}
                placeholder={`For ${firm?.name || 'the firm'}`}
              />
            </Field>
            <p className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
              Name, address, phone, GSTIN and PAN print from the firm record — edit them in
              Setup › Firms so the bill, the girvi note and the register never disagree.
              {firm && <span className="mt-1 block font-medium text-foreground">{firm.legalName || firm.name}</span>}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Percent className="size-4 text-amber-600" /> Interest rate on forms
              <span className="text-xs font-normal leading-[1.6] text-muted-foreground">ब्याज दर</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Quote the rate">
              <Select value={cfg.roiBasis} onValueChange={(v) => set('roiBasis', v as LoanDocConfig['roiBasis'])}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Per month — as the counter quotes it</SelectItem>
                  <SelectItem value="annual">Per annum — as an inspector reads it</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="rounded-md border bg-muted/40 p-2">
              <p className="text-xs text-muted-foreground">A loan priced at 1% per month prints as</p>
              <p className="mt-0.5 text-sm font-medium">{roiSample.text}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                …and the register column is headed <b className="text-foreground">{cfg.roiBasis === 'annual' ? 'Rate % per annum' : 'Rate % per month'}</b>.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              This changes only what the paper <em>says</em>, never what is charged. The figure comes
              from the convention frozen on the loan itself, so a loan priced per annum and a loan
              priced per month both print correctly under either setting — and both bases are always
              named in words. oMunim prints a bare <span className="font-mono">12 %</span> beside an
              unlabelled Monthly/Annually pair, which is how a 1%-per-month loan reads as 12 against 1
              on an inspector&apos;s desk.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Languages className="size-4 text-amber-600" /> Notices
              <span className="text-xs font-normal leading-[1.6] text-muted-foreground">सूचना</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Notice language">
              <Select value={cfg.noticeLang} onValueChange={(v) => set('noticeLang', v as LoanDocConfig['noticeLang'])}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NOTICE_LANGS.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.label}{l.label !== l.native ? ` · ${l.native}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <p className="text-xs text-muted-foreground">
              The whole notice body is written in this language — subject, recital, the sum, the
              deadline and the consequence. When it is not English, the operative sentence is repeated
              in English at the foot for an inspector or a court outside the state. Figures and dates
              stay numerals so they tie to the ledger.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Auction notice period (days)">
                <Input
                  type="number" min={1} max={180} value={cfg.auctionNoticeDays}
                  onChange={(e) => set('auctionNoticeDays', Math.min(180, Math.max(1, Number(e.target.value) || 1)))}
                />
              </Field>
              <Field label="Demand notice period (days)">
                <Input
                  type="number" min={1} max={180} value={cfg.demandNoticeDays}
                  onChange={(e) => set('demandNoticeDays', Math.min(180, Math.max(1, Number(e.target.value) || 1)))}
                />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ScrollText className="size-4 text-amber-600" /> Declarations
              <span className="text-xs font-normal leading-[1.6] text-muted-foreground">घोषणा व शर्तें</span>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              The wording your own lawyer settled on. Ours are defaults, not advice.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Girvi note — redemption terms (one clause per line)">
              <Textarea rows={7} value={cfg.noteTerms} onChange={(e) => set('noteTerms', e.target.value)} className="text-xs" />
            </Field>
            <Field label="Register — certificate at the foot">
              <Textarea rows={2} value={cfg.registerDeclaration} onChange={(e) => set('registerDeclaration', e.target.value)} className="text-xs" />
            </Field>
            <p className="-mt-1 text-xs text-muted-foreground">
              <code className="rounded bg-muted px-1">{'{month}'}</code> is replaced with the month the register covers.
            </p>
            <Field label="Notice — how it was served">
              <Textarea rows={2} value={cfg.noticeDeclaration} onChange={(e) => set('noticeDeclaration', e.target.value)} className="text-xs" />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="size-4 text-amber-600" /> Job defaults
              <span className="text-xs font-normal leading-[1.6] text-muted-foreground">डिफ़ॉल्ट</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <ToggleRow
              label="Office copy of the girvi note in the same job"
              hint="One copy is signed and filed, one goes with the customer."
              checked={cfg.officeCopy} onChange={(v) => set('officeCopy', v)}
            />
            <div className="pt-2">
              <Field label="Packet tags per loan">
                <Input
                  type="number" min={1} max={20} value={cfg.tagCopies}
                  onChange={(e) => set('tagCopies', Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
                  className="w-24"
                />
              </Field>
            </div>
            <p className="pt-2 text-xs text-muted-foreground">
              Deliberately not offered: a second arrangement of the same Form 8, a “modern” skin, or a
              choice of where on the page the totals sit. A form an inspector reads should look like
              the form every other shop hands them.
            </p>
          </CardContent>
        </Card>

        <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t bg-background/95 py-2 backdrop-blur">
          <Button onClick={save} disabled={!dirty || saving || isManager === false} title={isManager === false ? MANAGER_ONLY_TITLE : undefined} className="bg-amber-500 text-stone-950 hover:bg-amber-400">
            <Save className="size-4" /> {saving ? 'Saving…' : 'Save layout'}
          </Button>
          <Button variant="outline" onClick={() => setCfg(saved)} disabled={!dirty}>Discard changes</Button>
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {dirty ? 'Unsaved changes — the preview already shows them.' : 'Saved for this firm.'}
          </span>
        </div>
      </div>

      {/* ── a real loan, not a mock ── */}
      <Card className="self-start">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="size-4 text-amber-600" /> Preview on a real loan
              <span className="text-xs font-normal leading-[1.6] text-muted-foreground">असली ऋण पर</span>
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={!loans.length} onClick={() => setPreview({ kind: 'register' })}>
                <ScrollText className="size-3.5" /> Register
              </Button>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Loan no, customer…" aria-label="Search loans" className="h-8 w-52 pl-7 text-sm" />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading && <div className="space-y-1 p-3">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-9 rounded-lg bg-muted animate-pulse" />)}</div>}
          {error && <p className="p-4 text-sm text-rose-600" role="alert">Could not load loans: {(error as Error).message}</p>}
          {!isLoading && !error && filtered.length === 0 && (
            <EmptyState
              icon={HandCoins}
              title={q ? 'No loan matches that search' : 'No gold loan yet'}
              desc={q
                ? 'Clear the search to see every loan on this firm.'
                : 'The layout still saves — you just cannot preview it until a pledge exists. Take one in Gold Loan.'}
            />
          )}
          {!isLoading && !error && filtered.length > 0 && (
            <div className="max-h-[36rem] overflow-y-auto nice-scroll">
              <table className="w-full text-sm">
                <caption className="sr-only">Loans available to preview</caption>
                <thead className="sticky top-0 z-1 bg-muted/80 backdrop-blur">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th scope="col" className="p-2 font-medium">Loan No</th>
                    <th scope="col" className="p-2 font-medium">Customer</th>
                    <th scope="col" className="p-2 font-medium">Date</th>
                    <th scope="col" className="p-2 font-medium text-right">Principal</th>
                    <th scope="col" className="p-2 font-medium text-right">Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((l) => (
                    <tr key={l.id} className="border-t hover:bg-muted/30">
                      <td className="p-2 font-mono text-xs font-semibold text-amber-600">{l.loanNo}</td>
                      <td className="p-2">
                        <span className="block truncate">{l.customerName}</span>
                        <span className="block font-mono text-[10px] text-muted-foreground">{l.customerMobile || '—'}</span>
                      </td>
                      <td className="p-2 text-xs">{formatDate(l.loanDate)}</td>
                      <td className="p-2 text-right font-mono text-xs font-semibold">{formatINR(l.principalAmount)}</td>
                      <td className="p-2">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setPreview({ kind: 'note', loan: l })}>
                            <Printer className="size-3.5" /> Note
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setPreview({ kind: 'tags', loan: l })}>
                            <Tag className="size-3.5" /> Tag
                          </Button>
                          <Button
                            size="sm" variant="outline" className="h-7 px-2"
                            disabled={l.status !== 'active'}
                            title={l.status !== 'active' ? 'Only an unredeemed pledge can be noticed for auction' : 'Pre-auction notice'}
                            onClick={() => setPreview({ kind: 'auction', loan: l })}
                          >
                            <Gavel className="size-3.5" /> Notice
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Remounted whenever the working config changes: each sheet seeds its paper and copy count
          on mount, so without the key an edit here would not reach an open preview. */}
      {preview?.kind === 'note' && preview.loan && (
        <GirviNoteSheet key={savedJson + JSON.stringify(cfg)} open onClose={() => setPreview(null)} firm={firm} loans={[preview.loan]} config={cfg} />
      )}
      {preview?.kind === 'tags' && preview.loan && (
        <PacketTagSheet key={JSON.stringify(cfg)} open onClose={() => setPreview(null)} firm={firm} loans={[preview.loan]} config={cfg} />
      )}
      {preview?.kind === 'auction' && preview.loan && (
        <NoticeSheet key={JSON.stringify(cfg)} open kind="auction" onClose={() => setPreview(null)} firm={firm} loans={[preview.loan]} config={cfg} />
      )}
      {preview?.kind === 'register' && (
        <PawnRegisterSheet key={JSON.stringify(cfg)} open onClose={() => setPreview(null)} firm={firm} loans={loans} config={cfg} />
      )}
    </div>
  )
}

/** One document's paper choice, with the printable width it works out to on this config. */
function PaperField({ label, hint, value, choices, onChange, cfg }: {
  label: string; hint: string; value: PaperId; choices: PaperId[]
  onChange: (v: PaperId) => void; cfg: LoanDocConfig
}) {
  const widthMm = loanContentWidthMm(cfg, value)
  const heightMm = loanContentHeightMm(cfg, value)
  // Field takes ONE control — a second child makes it an unkeyed list. The hint sits outside it.
  return (
    <div className="space-y-1">
      <Field label={label}>
        <Select value={value} onValueChange={(v) => onChange(v as PaperId)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {choices.map((p) => <SelectItem key={p} value={p}>{PAPERS[p].label}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <p className="text-xs text-muted-foreground">
        {hint}{' '}
        <span className="text-foreground">
          {widthMm
            ? `Printable area ${widthMm} × ${heightMm} mm.`
            : `Continuous — ${PAPERS[value].contentMm} mm of usable width, as long as the document needs.`}
        </span>
      </p>
    </div>
  )
}
// ═════════════════ Invoice Layout ═════════════════

/**
 * The invoice studio. Every shop wants its own bill and nobody can hand-build one per shop, so this
 * is ONE renderer (invoice-doc.tsx) driven by configuration: a template (a named set of flags and
 * a skin), the Layout options sheet, and a per-field override map for each document type. The
 * preview in the middle is the very component the printer renders, with the draft applied, so what
 * is on screen is what prints.
 *
 * Saved per firm in the existing Setting model: one `invoice.layout.<docType>` blob per document type
 * (template id inside it; a type with no row reads the legacy global `invoice.layout`)
 * plus one `invoice.fields.<docType>` row per document type that was actually changed.
 */
const STYLEABLE_DOC_TYPES = INVOICE_DOC_TYPES.filter((d) => d.rendered && invoiceTypeOfDocType(d.id))
const STYLEABLE_IDS = STYLEABLE_DOC_TYPES.map((d) => d.id)

/** Order- and key-order-independent form of an override map, so "edited then undone" is not dirty. */
function canonOverrides(ov: FieldOverrides | undefined): string {
  const clean = JSON.parse(serializeFieldOverrides(ov || {})) as FieldOverrides
  return JSON.stringify(
    Object.keys(clean).sort((a, b) => Number(a) - Number(b)).map((k) => [k, Object.entries(clean[k]).sort(([a], [b]) => (a < b ? -1 : 1))]),
  )
}

/** The layout blob: everything except the banners, which live in their own global rows. */
function layoutOf(c: InvoiceConfig): Partial<InvoiceConfig> {
  const r: Partial<InvoiceConfig> = { ...c }
  delete r.bannerTop
  delete r.bannerBottom
  return r
}

type SettingRow = { key: string; value: string }

function InvoiceStudio() {
  const { activeFirmId } = useApp()
  const { isManager } = useFirmRole()
  const qc = useQueryClient()
  const [docType, setDocType] = useState('sell')
  const [source, setSource] = useState<'sample' | 'real'>('sample')
  const [q, setQ] = useState('')
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [printOpen, setPrintOpen] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const isMobile = useIsMobile()
  const [showOutlines, setShowOutlines] = useState(true)
  const [saving, setSaving] = useState(false)
  const invType = invoiceTypeOfDocType(docType) ?? 'sale'

  const { data: settingsData } = useQuery({
    queryKey: ['settings', activeFirmId],
    queryFn: () => api<{ settings: SettingRow[] }>('/api/settings', { search: { firmId: activeFirmId! } }),
    enabled: !!activeFirmId,
  })
  const { data: firmData } = useQuery({
    queryKey: ['firms'],
    queryFn: () => api<{ firms: (FirmLike & { id: string; gstEnabled?: boolean; state?: string })[] }>('/api/firms'),
  })
  const firm = firmData?.firms?.find((f) => f.id === activeFirmId)

  // One layout per document type (Setting `invoice.layout.<type>`, reading through the legacy
  // global row). Banners are the exception: global, so they are the same in every type's config.
  const savedLay = useMemo(
    () => Object.fromEntries(STYLEABLE_IDS.map((id) => [id, parseInvoiceConfig(settingsData?.settings, id)])) as Record<string, InvoiceConfig>,
    [settingsData],
  )
  const saved = savedLay[docType]
  const calc = useMemo(() => parseCalcSettings(settingsData?.settings), [settingsData])
  const savedOv = useMemo(
    () => Object.fromEntries(STYLEABLE_IDS.map((id) => [id, parseFieldOverrides(settingsData?.settings, id)])) as Record<string, FieldOverrides>,
    [settingsData],
  )

  // Seed the draft from the server copy, and re-seed whenever the server copy changes — during
  // render via a tracker, never in an effect (an effect would flash the previous shop's layout).
  // The layout and every document type's override map are ONE seed, so one Discard resets all.
  const seedKey = JSON.stringify(savedLay) + '\u0000' + JSON.stringify(STYLEABLE_IDS.map((id) => canonOverrides(savedOv[id])))
  const [seed, setSeed] = useState(seedKey)
  const [lay, setLay] = useState<Record<string, InvoiceConfig>>(savedLay)
  const [ov, setOv] = useState<Record<string, FieldOverrides>>(savedOv)
  if (seed !== seedKey) { setSeed(seedKey); setLay(savedLay); setOv(savedOv) }
  const [copyOpen, setCopyOpen] = useState(false)
  const [copyFields, setCopyFields] = useState(false)

  const cfg = lay[docType]
  const bannersChanged = JSON.stringify([cfg.bannerTop, cfg.bannerBottom]) !== JSON.stringify([saved.bannerTop, saved.bannerBottom])
  const changedLayouts = STYLEABLE_IDS.filter((id) => JSON.stringify(layoutOf(lay[id])) !== JSON.stringify(layoutOf(savedLay[id])))
  const changedTypes = STYLEABLE_IDS.filter((id) => canonOverrides(ov[id]) !== canonOverrides(savedOv[id]))
  const dirty = changedLayouts.length > 0 || bannersChanged || changedTypes.length > 0
  const patchCfg = (fn: (c: InvoiceConfig) => InvoiceConfig) => setLay((all) => ({ ...all, [docType]: fn(all[docType]) }))
  const set = <K extends keyof InvoiceConfig>(k: K, v: InvoiceConfig[K]) =>
    setLay((all) => k === 'bannerTop' || k === 'bannerBottom'
      // Banners are global: one edit lands in every type's draft.
      ? Object.fromEntries(STYLEABLE_IDS.map((id) => [id, { ...all[id], [k]: v }])) as Record<string, InvoiceConfig>
      : { ...all, [docType]: { ...all[docType], [k]: v } })
  const otherTypes = STYLEABLE_DOC_TYPES.filter((d) => d.id !== docType)
  const copyToAll = () => {
    setLay((all) => Object.fromEntries(STYLEABLE_IDS.map((id) => [id, id === docType ? all[id] : { ...all[docType], bannerTop: all[id].bannerTop, bannerBottom: all[id].bannerBottom }])) as Record<string, InvoiceConfig>)
    if (copyFields) setOv((all) => Object.fromEntries(STYLEABLE_IDS.map((id) => [id, id === docType ? all[id] : { ...(all[docType] ?? {}) }])) as Record<string, FieldOverrides>)
    setCopyOpen(false)
  }
  const docOv = ov[docType] ?? {}
  const lawOff = hiddenStatutory(docOv, docType)
  // Fields this shop has changed get a solid outline on the studio's preview (never on paper).
  const changedCss = Object.keys(docOv).filter((k) => /^\d+$/.test(k) && Object.keys(docOv[k] ?? {}).length > 0)
    .map((k) => `.studio-bill [data-field-count="${k}"]{outline:2px solid #d97706}`).join('')

  const setField = (count: number, patch: Partial<FieldOverride>) => setOv((all) => {
    const cur: Record<string, unknown> = { ...(all[docType]?.[String(count)] ?? {}), ...patch }
    for (const k of Object.keys(cur)) if (cur[k] === undefined) delete cur[k]
    const next = { ...(all[docType] ?? {}) }
    if (Object.keys(cur).length) next[String(count)] = cur as FieldOverride
    else delete next[String(count)]
    return { ...all, [docType]: next }
  })

  // The rate board the bill's rate bar reads. Same query key as the app-shell ticker.
  const { data: rateData } = useQuery({
    queryKey: ['gold-rate', activeFirmId],
    queryFn: () => api<{ rates: FirmRate[] }>('/api/gold-rate', { search: { firmId: activeFirmId! } }),
    enabled: !!activeFirmId,
  })

  const { data, isLoading, error } = useQuery({
    queryKey: ['print-invoices', activeFirmId, invType],
    queryFn: () => api<{ invoices: PrintInvoice[] }>('/api/invoices', { search: { firmId: activeFirmId!, type: invType, status: 'all' } }),
    enabled: !!activeFirmId && source === 'real',
  })
  const invoices = data?.invoices || []
  const filtered = q
    ? invoices.filter((i) => `${i.invoiceNo} ${i.customerName} ${i.customerMobile || ''}`.toLowerCase().includes(q.toLowerCase()))
    : invoices
  const realInvoice = invoices.find((i) => i.id === previewId) || null

  // The buyer block: the invoice row carries only a name and a mobile, so a real bill's customer is
  // fetched by its own customerId from /api/customers, which masks PII server-side. Nothing else.
  const { data: custData } = useQuery({
    queryKey: ['print-invoice-customer', activeFirmId, realInvoice?.customerId],
    queryFn: () => api<{ customers: PrintCustomer[] }>('/api/customers', {
      search: { firmId: activeFirmId!, search: realInvoice?.customerMobile || realInvoice?.customerName || '' },
    }),
    enabled: !!activeFirmId && source === 'real' && !!realInvoice?.customerId,
  })
  const sample = useMemo(() => sampleInvoice(invType), [invType])
  const shown = source === 'real' ? realInvoice : sample
  const customer = source === 'real'
    ? custData?.customers?.find((c) => c.id === realInvoice?.customerId) || null
    : SAMPLE_CUSTOMER
  const gstEnabled = firm?.gstEnabled !== false
  const inForce = INVOICE_TEMPLATES.find((t) => matchesTemplate(cfg, skinOf(cfg), t))

  async function save() {
    if (!activeFirmId) return
    setSaving(true)
    try {
      // The banners go to their own rows and are stripped from the layout blob — one MySQL TEXT
      // column cannot hold both (see INVOICE_BANNER_KEYS). Each is written only when it changed,
      // so saving a margin does not re-upload 40KB of advert. Override maps are written only for
      // the document types that actually changed.
      const { bannerTop, bannerBottom } = cfg
      const put = (key: string, value: string) =>
        api('/api/settings', { method: 'PUT', body: { firmId: activeFirmId, key, value } })
      for (const id of changedLayouts) {
        await put(invoiceLayoutKey(id), JSON.stringify(layoutOf(lay[id])))
      }
      if (bannerTop !== saved.bannerTop) await put(INVOICE_BANNER_KEYS.top, bannerTop)
      if (bannerBottom !== saved.bannerBottom) await put(INVOICE_BANNER_KEYS.bottom, bannerBottom)
      for (const id of changedTypes) await put(invoiceFieldsKey(id), serializeFieldOverrides(ov[id] ?? {}))
      await qc.invalidateQueries({ queryKey: ['settings'] })
      toast.success('Invoice layout saved for this firm')
    } catch (e) {
      toast.error((e as Error).message || 'Could not save the layout')
    } finally {
      setSaving(false)
    }
  }

  if (!activeFirmId) {
    return (
      <EmptyState
        icon={FileText}
        title="No firm selected"
        desc="Pick a firm from the top bar — an invoice layout belongs to one firm, not to the installation."
      />
    )
  }

  const editDef = editing !== null ? invoiceField(editing) : undefined
  const editorBody = editDef && (
    <FieldEditor
      key={`${docType}-${editDef.count}`}
      def={editDef}
      docType={docType}
      ov={docOv}
      o={docOv[String(editDef.count)] ?? {}}
      flagOn={editDef.configFlag ? !!cfg[editDef.configFlag] : undefined}
      onChange={(p) => setField(editDef.count, p)}
      onReset={() => setOv((all) => {
        const next = { ...(all[docType] ?? {}) }
        delete next[String(editDef.count)]
        return { ...all, [docType]: next }
      })}
      onOpenOptions={() => { setEditing(null); setOptionsOpen(true) }}
    />
  )

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] xl:grid-rows-[auto_1fr] xl:items-start">
      {/* ── the 19 document types ── */}
      <Card className="xl:col-start-1 xl:row-start-1">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="size-4 text-amber-600" /> Documents
            <span className="text-xs font-normal leading-[1.6] text-muted-foreground">दस्तावेज़</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div role="group" aria-label="Document type" className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-1">
            {INVOICE_DOC_TYPES.filter((d) => STYLEABLE_IDS.includes(d.id)).map((d) => {
              const n = countFieldOverrides(ov[d.id] ?? {})
              const law = hiddenStatutory(ov[d.id] ?? {}, d.id).length
              const active = d.id === docType
              return (
                <button
                  key={d.id} type="button" aria-pressed={active}
                  onClick={() => { setDocType(d.id); setEditing(null) }}
                  className={cn(
                    'rounded-md border px-2.5 py-1.5 text-left transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                    active ? 'border-amber-500 bg-amber-50 dark:bg-amber-500/10' : 'border-border hover:bg-muted/60',
                  )}
                >
                  <span className="block text-sm font-medium">{d.label}</span>
                  <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="mr-auto leading-[1.6]">{d.hindi}</span>
                    {law > 0 && <span className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 text-[10px] font-medium text-red-800 dark:bg-red-500/20 dark:text-red-200"><ShieldAlert className="size-3" aria-hidden />{law} GST {law === 1 ? 'field' : 'fields'} off</span>}
                    {n > 0 && <span className={'rounded bg-muted px-1.5 text-[10px] font-medium text-foreground'}>{n} customised</span>}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="pt-1 text-xs font-medium text-muted-foreground">Not printed by this app yet</p>
          <p className="text-xs text-muted-foreground">
            This app does not print these documents yet, so there is nothing to style. They are listed
            so the gap is visible, not hidden.
          </p>
          <div role="group" aria-label="Documents this app does not print" className="grid gap-1 sm:grid-cols-2 xl:grid-cols-1">
            {INVOICE_DOC_TYPES.filter((d) => !STYLEABLE_IDS.includes(d.id)).map((d) => (
              <button
                key={d.id} type="button" disabled
                title={d.rendered ? 'Prints on its own estimate slip, which this studio does not style yet' : 'This app does not print this document yet'}
                className="rounded-md border border-dashed px-2.5 py-1 text-left opacity-60"
              >
                <span className="block text-xs font-medium">{d.label}</span>
                <span className="block text-[11px] leading-[1.6] text-muted-foreground">
                  {d.hindi}{d.rendered ? ' · own slip, not styled here' : ''}
                </span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── every field, by group: the keyboard way in, and the way in for fields you cannot find ── */}
      <Card className="xl:col-start-1 xl:row-start-2">
        <CardHeader className="pb-1">
          <CardTitle className="text-base">
            Fields on this bill
            <span className="ml-2 text-xs font-normal leading-[1.6] text-muted-foreground">सभी फ़ील्ड</span>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Pick a field to restyle it. Clicking a label on the bill does the same; this list is also
            the keyboard route to every one of them.
          </p>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple">
            {INVOICE_FIELD_GROUPS.map((g) => {
              const fields = INVOICE_FIELDS.filter((f) => f.group === g.id)
              return (
                <AccordionItem key={g.id} value={g.id}>
                  <AccordionTrigger className="py-2.5">
                    <span>
                      {g.label} <span className="text-xs font-normal leading-[1.6] text-muted-foreground">{g.hindi} · {fields.length}</span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-2">
                    <ul className="space-y-0.5">
                      {fields.map((f) => {
                        const custom = !!docOv[String(f.count)]
                        const off = isSwitchedOff(docOv[String(f.count)])
                        const lawField = off && !!statutoryWarning(f, docType)
                        const shownLabel = fieldLabel(docOv, f.count, f.label)
                        return (
                          <li key={f.count}>
                            <button
                              type="button"
                              // The editor opens beside the preview, which is far up the page from this list.
                              onClick={() => { setEditing(f.count); document.getElementById('field-editor-anchor')?.scrollIntoView({ block: 'center' }) }}
                              aria-current={editing === f.count}
                              className={cn(
                                'w-full rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-muted/60',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500',
                                editing === f.count && 'bg-amber-50 dark:bg-amber-500/10',
                              )}
                            >
                              <span className="flex items-center gap-1.5">
                                <span className="font-medium">{shownLabel}</span>
                                {shownLabel !== f.label && <span className="text-muted-foreground">(was {f.label})</span>}
                                {off && (
                                  <span data-testid="field-off-marker" className={cn('ml-auto inline-flex shrink-0 items-center gap-1 rounded px-1.5 text-[10px] font-medium', lawField ? 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200' : 'bg-muted text-foreground')}>
                                    {lawField && <ShieldAlert className="size-3" aria-hidden />}
                                    {docOv[String(f.count)]?.show === false ? 'hidden' : 'not printed'}{lawField && <span className="sr-only"> — required by GST law</span>}
                                  </span>
                                )}
                                {custom && !off && <span className="ml-auto shrink-0 rounded bg-amber-100 px-1.5 text-[10px] font-medium text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">changed</span>}
                              </span>
                              <span className="block leading-[1.6] text-muted-foreground">
                                {f.hindi} · #{f.count}{!f.defaultCheck ? ' · off by default' : ''}
                              </span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              )
            })}
          </Accordion>
        </CardContent>
      </Card>

      {/* ── the live preview and the template gallery ── */}
      <div className="min-w-0 space-y-4 xl:col-start-2 xl:row-span-2 xl:row-start-1">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="size-4 text-amber-600" /> Live preview
                <span className="text-xs font-normal leading-[1.6] text-muted-foreground">लाइव प्रीव्यू</span>
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <div role="group" aria-label="Preview source" className="flex overflow-hidden rounded-md border">
                  {(['sample', 'real'] as const).map((s) => (
                    <button
                      key={s} type="button" aria-pressed={source === s} onClick={() => setSource(s)}
                      className={cn(
                        'px-2.5 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500',
                        source === s ? 'bg-amber-500 text-stone-950' : 'hover:bg-muted/60',
                      )}
                    >
                      {s === 'sample' ? 'Sample bill' : 'A real bill'}
                    </button>
                  ))}
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => setOptionsOpen(true)}>
                  <Settings className="size-3.5" /> Layout options
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={!shown} onClick={() => setPrintOpen(true)}>
                  <Printer className="size-3.5" /> Full print preview
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {source === 'sample'
                ? 'A sample bill built by the real billing engine, so this works before your first sale. '
                : 'One of your own bills. '}
              Template in force: <span className="font-medium text-foreground">{inForce ? inForce.label : 'Custom — your own flags'}</span>.
            </p>
            {lawOff.length > 0 && (
              <div data-testid="statutory-summary" className="rounded-md border border-red-500/50 bg-red-50 p-2 text-xs text-red-950 dark:bg-red-500/10 dark:text-red-100">
                <p className="flex items-center gap-1.5 font-semibold">
                  <ShieldAlert className="size-3.5 shrink-0" aria-hidden />
                  {lawOff.length} statutory {lawOff.length === 1 ? 'field' : 'fields'} hidden on this bill
                </p>
                <p className="mt-0.5">GST law requires {lawOff.length === 1 ? 'it' : 'them'} on a tax invoice. Until {lawOff.length === 1 ? 'it is' : 'they are'} switched back on, this is not a valid tax invoice.</p>
                <ul className="mt-1 flex flex-wrap gap-1">
                  {lawOff.map((f) => (
                    <li key={f.count}>
                      <button type="button" onClick={() => setEditing(f.count)} className="rounded border border-red-500/40 bg-background px-1.5 py-0.5 font-medium text-red-800 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-red-200">
                        {fieldLabel(docOv, f.count, f.label)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Popover open={!isMobile && editing !== null} onOpenChange={(o) => { if (!o) setEditing(null) }}>
              <PopoverTrigger asChild>
                <button
                  type="button" id="field-editor-anchor"
                  className="flex w-full items-center gap-2 rounded-md border-2 border-amber-500 bg-amber-50 px-3 py-2 text-left text-sm font-medium text-amber-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:bg-amber-500/10 dark:text-amber-100"
                >
                  <MousePointerClick className="size-4 shrink-0 text-amber-600" aria-hidden />
                  <span className="min-w-0">
                    {editDef
                      ? `Editing: ${fieldLabel(docOv, editDef.count, editDef.label)}`
                      : 'The bill below is editable: tap any label on it to rename it, hide it or restyle it.'}
                    {!editDef && <span className="block text-xs font-normal leading-[1.6] text-amber-900/80 dark:text-amber-100/70">बिल पर किसी भी नाम को दबाइए — नाम बदलें, छुपाएँ, या सजाएँ।</span>}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" collisionPadding={12} className="max-h-[80vh] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto nice-scroll">
                {editorBody}
              </PopoverContent>
            </Popover>
            {/* Phone width: a fixed centred dialog. An anchored popover can land off-screen (the banner may sit anywhere in a long page, and a field with no node on the sample bill gives it nothing to follow). */}
            <Dialog open={isMobile && editing !== null} onOpenChange={(o) => { if (!o) setEditing(null) }}>
              <DialogContent size="md" className="p-3 pt-10">
                <DialogTitle className="sr-only">Edit bill field</DialogTitle>
                {editorBody}
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="space-y-3 p-3 pt-0">
            {source === 'real' && (
              <div className="overflow-hidden rounded-md border">
                <div className="flex items-center justify-between gap-2 border-b bg-muted/40 p-2">
                  <span className="text-xs text-muted-foreground">Pick one of your {invType} bills</span>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bill no, customer…" aria-label="Search invoices" className="h-8 w-44 pl-7 text-sm" />
                  </div>
                </div>
                {isLoading && <div className="space-y-1 p-3">{[0, 1, 2].map((i) => <div key={i} className="h-9 rounded-lg bg-muted animate-pulse" />)}</div>}
                {error && <p className="p-4 text-sm text-rose-600" role="alert">Could not load invoices: {(error as Error).message}</p>}
                {!isLoading && !error && filtered.length === 0 && (
                  <EmptyState
                    icon={FileText}
                    title={q ? 'No bill matches that search' : `No ${invType} invoice yet`}
                    desc={q
                      ? 'Clear the search to see every bill on this firm.'
                      : 'The layout still saves — switch to the sample bill to see it, or raise one in Billing.'}
                  />
                )}
                {!isLoading && !error && filtered.length > 0 && (
                  <div className="max-h-56 overflow-auto nice-scroll">
                    <table className="w-full text-sm">
                      <caption className="sr-only">Invoices available to preview</caption>
                      <thead className="sticky top-0 z-1 bg-muted/80 backdrop-blur">
                        <tr className="text-left text-xs text-muted-foreground">
                          <th scope="col" className="p-2 font-medium">Bill No</th>
                          <th scope="col" className="p-2 font-medium">Customer</th>
                          <th scope="col" className="p-2 font-medium">Date</th>
                          <th scope="col" className="p-2 font-medium text-right">Items</th>
                          <th scope="col" className="p-2 font-medium text-right">Total</th>
                          <th scope="col" className="p-2 font-medium text-right">Use</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((inv) => (
                          <tr key={inv.id} className={cn('border-t hover:bg-muted/30', inv.id === previewId && 'bg-amber-50 dark:bg-amber-500/10')}>
                            <td className="p-2 font-mono text-xs font-semibold text-amber-600">{inv.invoiceNo}</td>
                            <td className="p-2">
                              <span className="block truncate">{inv.customerName}</span>
                              <span className="block font-mono text-[10px] text-muted-foreground">{inv.customerMobile || '—'}</span>
                            </td>
                            <td className="p-2 text-xs">{formatDate(inv.invoiceDate)}</td>
                            <td className="p-2 text-right text-xs text-muted-foreground">{inv.items?.length || 0}</td>
                            <td className="p-2 text-right font-mono text-xs font-semibold">{formatINR(inv.totalAmount)}</td>
                            <td className="p-2 text-right">
                              <Button size="sm" variant="outline" className="h-7 px-2" aria-pressed={inv.id === previewId} onClick={() => setPreviewId(inv.id)}>
                                <Eye className="size-3.5" /> {inv.id === previewId ? 'Showing' : 'Show'}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {shown ? (
              <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  <span className="mr-1 inline-block h-3 w-4 rounded-sm border border-dotted border-amber-500 align-middle" aria-hidden /> dotted = tap to edit
                  <span className="mr-1 ml-3 inline-block h-3 w-4 rounded-sm border-2 border-amber-600 align-middle" aria-hidden /> solid = you changed it
                </span>
                <label className="flex items-center gap-1.5">
                  <Switch checked={showOutlines} onCheckedChange={setShowOutlines} aria-label="Outline the editable labels" className="data-[state=checked]:bg-amber-500" />
                  Outline editable labels
                </label>
              </div>
              {/* The bill itself is drawn by invoice-doc; the cue lives out here so it never reaches the paper. */}
              <style>{changedCss}</style>
              <div className={cn(
                'studio-bill overflow-x-auto rounded-md bg-muted/40 p-2 sm:p-3',
                showOutlines && '[&_[data-field-count]]:outline-1 [&_[data-field-count]]:outline-dotted [&_[data-field-count]]:outline-amber-500/50',
                '[&_[data-field-count]:hover]:outline-2 [&_[data-field-count]:hover]:outline-solid [&_[data-field-count]:hover]:outline-amber-500 [&_[data-field-count]:hover]:bg-amber-200/40',
              )}>
                <InvoicePagePreview
                  invoice={shown}
                  firm={firm ?? SAMPLE_FIRM}
                  customer={customer}
                  config={cfg}
                  calc={calc}
                  rates={rateData?.rates}
                  gstEnabled={gstEnabled}
                  fieldOverrides={docOv}
                  docType={docType}
                  onFieldClick={setEditing}
                />
              </div>
              </div>
            ) : (
              <p className="rounded-md bg-muted/40 p-6 text-center text-sm text-muted-foreground">
                Pick one of your bills above to see it here.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <LayoutTemplate className="size-4 text-amber-600" /> Templates
              <span className="text-xs font-normal leading-[1.6] text-muted-foreground">टेम्पलेट</span>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Six different pages, not one page in six colours: each one lays the blocks out
              differently — where the letterhead goes, whether the customer block is boxed or
              filled, how the rate board and the item table are framed, and what the bottom of the
              page is made of — and leaves your own terms, bank details, banners, signatory and BIS
              number alone. Selling stones, silver or imitation? Pick the look you want and
              turn those columns on under Layout options — and anything you have restyled field by
              field survives the switch untouched. Nothing is saved until you press Save.
            </p>
          </CardHeader>
          <CardContent>
            <div role="group" aria-label="Invoice templates" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {INVOICE_TEMPLATES.map((t) => {
                const active = matchesTemplate(cfg, skinOf(cfg), t)
                const hex = paletteHex(t.palette)
                return (
                  <button
                    key={t.id} type="button" aria-pressed={active}
                    onClick={() => patchCfg((c) => applyTemplate(c, t))}
                    className={cn(
                      'rounded-md border px-2.5 py-2 text-left transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                      active ? 'border-amber-500 bg-amber-50 dark:bg-amber-500/10' : 'border-border hover:bg-muted/60',
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <span
                        aria-hidden className="size-3.5 shrink-0 rounded-sm border"
                        style={{ backgroundColor: hex || '#e7e5e4' }}
                      />
                      <span className="min-w-0 truncate">{t.label}</span>
                      {active && (
                        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">In use</span>
                      )}
                    </span>
                    <span className="block text-xs leading-[1.6] text-muted-foreground">{t.hindi}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{t.desc}</span>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── the save bar ── */}
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t bg-background/95 py-2 backdrop-blur xl:col-span-2">
        <Button onClick={save} disabled={!dirty || saving || isManager === false} title={isManager === false ? MANAGER_ONLY_TITLE : undefined} className="bg-amber-500 text-stone-950 hover:bg-amber-400">
          <Save className="size-4" /> {saving ? 'Saving…' : 'Save layout'}
        </Button>
        <Button variant="outline" onClick={() => { setLay(savedLay); setOv(savedOv) }} disabled={!dirty}>Discard changes</Button>
        <Button variant="outline" onClick={() => setCopyOpen(true)} disabled={isManager === false || otherTypes.length === 0}>
          <Copy className="size-4" /> Use this design for every document
          <span className="text-xs font-normal leading-[1.6] text-muted-foreground">सभी दस्तावेज़ों में</span>
        </Button>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {dirty ? 'Unsaved changes — the preview already shows them.' : 'Saved for this firm.'}
        </span>
      </div>

      <AlertDialog open={copyOpen} onOpenChange={setCopyOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Use the {STYLEABLE_DOC_TYPES.find((d) => d.id === docType)?.label} design for every document?</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces the layout of {otherTypes.map((d) => d.label).join(', ')} with this one. Banners are shared already.
              Nothing is saved until you press Save layout, and Discard changes undoes it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={copyFields} onCheckedChange={(v) => setCopyFields(v === true)} />
            Also copy the field styling (font sizes, colours, hidden fields)
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={copyToAll}>Overwrite {otherTypes.length} documents</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Layout options: paper, identity, brand, buyer, columns, blocks, skin ── */}
      <Sheet open={optionsOpen} onOpenChange={setOptionsOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl">
          <SheetHeader className="pb-0">
            <SheetTitle>
              Layout options <span className="ml-1 text-xs font-normal leading-[1.6] text-muted-foreground">लेआउट विकल्प</span>
            </SheetTitle>
            <SheetDescription>Changes show in the preview straight away and are saved with the Save button.</SheetDescription>
          </SheetHeader>
          <div className="space-y-3 overflow-y-auto px-4 pb-4 nice-scroll">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="size-4 text-amber-600" /> Paper
              <span className="text-xs font-normal leading-[1.6] text-muted-foreground">कागज़</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Paper size">
              <Select value={cfg.paper} onValueChange={(v) => set('paper', v as InvoiceConfig['paper'])}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="a4">A4 — full bill</SelectItem>
                  <SelectItem value="a5">A5 — half sheet</SelectItem>
                  <SelectItem value="roll80">80 mm thermal roll — counter printer</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <MmField label="Top" value={cfg.marginTopMm} onChange={(v) => set('marginTopMm', v)} />
              <MmField label="Side" value={cfg.marginSideMm} onChange={(v) => set('marginSideMm', v)} />
              <MmField label="Bottom" value={cfg.marginBottomMm} onChange={(v) => set('marginBottomMm', v)} />
            </div>
            {/* THE ONE SWITCH over the firm information block — the owner's second ask, and the
                switch that already governed counts 1, 2, 3, 4, 5, 6 and 8. It was labelled "Print
                the shop letterhead", which is the trade word for it and not the one he used, and it
                said nothing about WHAT disappears. Both fixed here rather than by adding a second
                flag over the same block: two switches over one band can only ever disagree. */}
            <ToggleRow
              label="Print the firm information · दुकान की जानकारी छापें"
              hint={
                'The whole top block: shop name, address, phone · GSTIN · PAN, email, BIS number, the '
                + 'logo and the monogram ring. OFF removes all of it AND the space it used, so the bill '
                + 'starts at your top margin — that is the setting for pre-printed letterhead paper. '
                + 'The document title and the Original / Duplicate marker always print.'
              }
              checked={cfg.showLetterhead}
              onChange={(v) => set('showLetterhead', v)}
            />
            {/* The unhappy path for this switch: a shop on PLAIN paper that switched it off by
                mistake gets a bill with no shop name on it and, without this, no clue why. role is
                not "alert" — nothing has gone wrong, it is a stated consequence of a setting the
                shop can see is off. */}
            {!cfg.showLetterhead && (
              <p
                data-testid="letterhead-off-note"
                className="rounded-md border border-amber-500/40 bg-amber-50 p-2 text-xs text-amber-950 dark:bg-amber-500/10 dark:text-amber-100"
              >
                <span className="font-medium">This bill will not print your shop&rsquo;s name, address or GSTIN.</span>{' '}
                Leave it off only if the paper you feed the printer already carries them — and set the
                top margin deep enough to clear what is pre-printed on it
                {cfg.marginTopMm < 30 && <> (yours is {cfg.marginTopMm} mm; pre-printed letterhead usually needs 40–55 mm)</>}.
              </p>
            )}
            <ToggleRow
              label="Print the logo"
              hint={
                !cfg.showLetterhead
                  ? 'The firm information switch above already takes the logo off — it is drawn inside the letterhead.'
                  : firm?.logoUrl ? 'From the firm record.' : 'No logo on this firm yet — add one in Setup › Firms.'
              }
              checked={cfg.showLogo}
              onChange={(v) => set('showLogo', v)}
              disabled={!cfg.showLetterhead}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="size-4 text-amber-600" /> Shop identity &amp; terms
              <span className="text-xs font-normal leading-[1.6] text-muted-foreground">दुकान विवरण</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
              Name, address, phone, GSTIN and PAN print from the firm record — edit them in
              Setup › Firms so the bill, the girvi note and the register never disagree.
              {firm && <span className="mt-1 block font-medium text-foreground">{firm.legalName || firm.name}</span>}
            </p>
            <Field label="BIS hallmarking registration no.">
              <Input value={cfg.bisNo} onChange={(e) => set('bisNo', e.target.value)} placeholder="e.g. HM/1234567" />
            </Field>
            <Field label="Terms & conditions (one per line)">
              <Textarea rows={4} value={cfg.terms} onChange={(e) => set('terms', e.target.value)} className="text-xs" />
            </Field>
            <Field label="Payment / bank details">
              <Textarea
                rows={2} value={cfg.bankDetails} onChange={(e) => set('bankDetails', e.target.value)}
                placeholder="Bank, A/c no, IFSC, UPI ID" className="text-xs"
              />
            </Field>
            <Field label="Closing line">
              <Input value={cfg.footNote} onChange={(e) => set('footNote', e.target.value)} />
            </Field>
            <Field label="Signed by">
              <Input value={cfg.signatory} onChange={(e) => set('signatory', e.target.value)} placeholder={`For ${firm?.name || 'the firm'}`} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Palette className="size-4 text-amber-600" /> Brand &amp; banners
              <span className="text-xs font-normal leading-[1.6] text-muted-foreground">रंग व विज्ञापन</span>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              One colour and two images — the cheapest way to make the bill look like yours.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <AccentPicker value={cfg.accent} onChange={(v) => set('accent', v)} />
            <BannerField
              label="Header banner"
              hint={
                cfg.bannerTopAbove
                  ? 'Prints at the very top of the sheet, with your firm information below it.'
                  : 'Prints below your letterhead, above the customer block.'
              }
              value={cfg.bannerTop} onChange={(v) => set('bannerTop', v)}
              widthMm={contentWidthMm(cfg)} pageMm={printableHeightMm(cfg)} spareMm={bannerSpareMm(cfg)}
            />
            {/* THE OWNER'S FIRST ASK, as a choice rather than a move: "the hedar banner has to come
                at the top of invoice and below the frim information". Default OFF = today's bill, so
                no shop that has already saved a layout sees its paper change.
                THE HINT NO LONGER PROMISES A CAP. It used to say "scaled to fit 36 mm", which is
                exactly what made a wide advert print narrower than the bill. The banner prints the
                same size in both places now, so this switch is about PLACEMENT only — and the cost
                in paper is quoted per image by the BannerField above, which knows the shape of the
                file the shop actually uploaded. */}
            <ToggleRow
              label="Put the header banner above the firm information"
              hint={
                `Which comes first on the sheet — nothing else. Off (default) the banner prints below `
                + `your letterhead; on, it prints first as a masthead with the firm information under `
                + `it. Either way it prints the same: the full width of the bill, at its own shape, `
                + `so its edges line up with the item table. What it costs in paper is the same in `
                + `both places and is stated above. This is per document type.`
                // Measured, and true of BOTH placements — so it is a fact about A5 and a banner,
                // not about this switch. Stated here because this is where a shop is looking at the
                // banner on a half sheet. See the e2e gate's own note for the arithmetic.
                + (cfg.paper === 'a5' && cfg.bannerTop
                  ? ' On A5 a header banner costs a second half sheet wherever it sits — the half sheet has about 7 mm of slack and the smallest readable banner is bigger than that.'
                  : '')
              }
              checked={cfg.bannerTopAbove}
              onChange={(v) => set('bannerTopAbove', v)}
            />
            <BannerField
              label="Footer banner" hint="Prints below the signatures."
              value={cfg.bannerBottom} onChange={(v) => set('bannerBottom', v)}
              widthMm={contentWidthMm(cfg)} pageMm={printableHeightMm(cfg)} spareMm={bannerSpareMm(cfg)}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <UserRound className="size-4 text-amber-600" /> Buyer block
              <span className="text-xs font-normal leading-[1.6] text-muted-foreground">ग्राहक विवरण</span>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Name, address and phone print whenever the customer record has them, and vanish when
              it does not. These two are the ones worth deciding.
            </p>
          </CardHeader>
          <CardContent className="space-y-1">
            <ToggleRow
              label="Buyer&rsquo;s GSTIN"
              hint="Keep ON if you sell to other businesses — without it your buyer cannot claim input credit on this bill."
              checked={cfg.showBuyerGstin} onChange={(v) => set('showBuyerGstin', v)}
            />
            <ToggleRow
              label="Buyer&rsquo;s PAN"
              hint="Off by default. The law asks for your buyer's GSTIN, not their PAN, and a customer's PAN on a sheet that crosses the counter is a leak, not a feature. Switched on it still prints nothing: PAN reaches this screen masked, and a masked PAN is left off the bill rather than printed as XXXX XX 234F."
              checked={cfg.showBuyerPan} onChange={(v) => set('showBuyerPan', v)}
            />
            <p className="pt-2 text-xs text-muted-foreground">
              Place of supply is not a toggle — it is required on a tax invoice, so it is not the
              shop&rsquo;s to remove. Aadhaar is never printed on a bill at all.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Columns3 className="size-4 text-amber-600" /> Item columns
              <span className="text-xs font-normal leading-[1.6] text-muted-foreground">कॉलम</span>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Turn off what your trade does not use — a column of dashes is worse than no column.
              Description, net weight, rate and amount always print.
            </p>
          </CardHeader>
          <CardContent className="space-y-1">
            <ToggleRow label="Item / tag code" hint="Your own SKU beside the description. Off keeps internal tag codes off the customer's copy." checked={cfg.showItemCode} onChange={(v) => set('showItemCode', v)} />
            <ToggleRow label="HSN code" hint="Required on a tax invoice above the turnover threshold." checked={cfg.showHsn} onChange={(v) => set('showHsn', v)} />
            <ToggleRow label="Purity" hint="22K / 916 / 92.5" checked={cfg.showPurity} onChange={(v) => set('showPurity', v)} />
            <ToggleRow label="Gross weight" hint="Off for a shop that bills on net weight only." checked={cfg.showGrossWeight} onChange={(v) => set('showGrossWeight', v)} />
            <ToggleRow label="Wastage %" hint="Off when wastage is already built into the rate." checked={cfg.showWastage} onChange={(v) => set('showWastage', v)} />
            <ToggleRow label="Making charge" hint="Off prints “making included in the rate” instead." checked={cfg.showMaking} onChange={(v) => set('showMaking', v)} />
            <Field label="Making charge shown as">
              <Select value={cfg.makingDisplay} onValueChange={(v) => set('makingDisplay', v as InvoiceConfig['makingDisplay'])}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="amount">Rupees (₹) — the amount charged</SelectItem>
                  <SelectItem value="percent">Percent (%) — of the metal value</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <ToggleRow label="Fine weight (FN)" hint="Net weight × purity — the pure-gold weight, as the trade settles it. Column “FN”." checked={cfg.showFineWeight} onChange={(v) => set('showFineWeight', v)} />
            <ToggleRow label="Value addition (VA)" hint="The customer wastage as a rupee figure, beside making. Column “VA”." checked={cfg.showValueAdd} onChange={(v) => set('showValueAdd', v)} />
            <ToggleRow label="Labour & other charges" hint="Labour, polish, rhodium, certification — one column per line instead of a lump at the foot." checked={cfg.showLineOtherCharges} onChange={(v) => set('showLineOtherCharges', v)} />
            <ToggleRow
              label="Stone weight & value"
              hint="Two columns. Off for plain gold — but a bill that actually carries a stone prints them anyway, whatever this says. Turn it on to show the columns on every bill."
              checked={cfg.showStone} onChange={(v) => set('showStone', v)}
            />
            <ToggleRow
              label="Stone certificate no. & detail"
              hint="Carat, clarity, colour, shape and the GIA / IGI / HRD / BIS number, beside the item name. Also automatic on a bill carrying stones; it never costs a column."
              checked={cfg.showStoneCert} onChange={(v) => set('showStoneCert', v)}
            />
            <p className="pt-2 text-xs text-muted-foreground">
              The <span className="font-medium text-foreground">HUID</span> is not a toggle. Since
              April 2023 a hallmarked gold article&rsquo;s six-character Hallmark UID belongs on its
              bill, so it is not yours to switch off — but nor is it forced onto a shop that has
              none. It prints beside the item name on every line that carries one, and on no line
              that does not. A silver or imitation bill never shows it.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="size-4 text-amber-600" /> Blocks
              <span className="text-xs font-normal leading-[1.6] text-muted-foreground">ब्लॉक</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <ToggleRow
              label="Metal rate bar"
              hint="One rate per metal and purity the bill actually contains, each with its unit, as at the bill's own date. Plus the rate the bill was made at."
              checked={cfg.showGoldRate} onChange={(v) => set('showGoldRate', v)}
            />
            <ToggleRow
              label="Payment / bank details block"
              hint={cfg.bankDetails.trim() ? undefined : 'Fill in the bank details above first.'}
              checked={cfg.showBank} onChange={(v) => set('showBank', v)} disabled={!cfg.bankDetails.trim()}
            />
            <ToggleRow label="Signature lines" checked={cfg.showSignature} onChange={(v) => set('showSignature', v)} />
            <ToggleRow label="Office copy in the same print job" hint="A roll receipt never gets a second copy." checked={cfg.officeCopy} onChange={(v) => set('officeCopy', v)} />
            <p className="pt-2 text-xs text-muted-foreground">
              Old-metal exchange, previous balance, loyalty, round off, the GST summary and the
              amount in words are deliberately not toggles: they print whenever the bill has them.
              Neither is the per-metal subtotal band — how many grams of gold left the shop on this
              bill is the one line a jeweller always reads.
              A figure that exists but is not printed is how a customer ends up paying for a line
              they never saw.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <LayoutTemplate className="size-4 text-amber-600" /> Design
              <span className="text-xs font-normal leading-[1.6] text-muted-foreground">रूप-रंग</span>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              The six choices in the first row change WHERE the blocks sit — the letterhead’s shape,
              whether the customer and bill-number blocks are boxed, the rate board’s shape, how the
              item table is framed, how the money column is treated, and what the bottom of the page
              is made of. The ones after them change how that design is dressed. The serif shop name
              does not reach the Centred letterhead — that one is drawn by the shared letterhead the
              girvi documents use too. A thermal roll ignores all of it: 74mm has no columnar table
              to frame, and a thermal head prints a tint as a black bar.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Letterhead">
                <Select value={cfg.header} onValueChange={(v) => set('header', v as InvoiceConfig['header'])}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="centered">Centred — the shared letterhead</SelectItem>
                    <SelectItem value="left">Left — identity flush left</SelectItem>
                    <SelectItem value="band">Band — title in a tinted strip</SelectItem>
                    <SelectItem value="letterhead">Full letterhead — title between rules</SelectItem>
                    <SelectItem value="angular">Angular band — phone knocked out</SelectItem>
                    <SelectItem value="monogram">Monogram — your initials in a ring</SelectItem>
                    <SelectItem value="corner">Corner — title left, ring right</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Customer &amp; bill-number blocks">
                <Select value={cfg.blocks} onValueChange={(v) => set('blocks', v as InvoiceConfig['blocks'])}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="boxed">Two bordered boxes</SelectItem>
                    <SelectItem value="plain">Plain, under a rule</SelectItem>
                    <SelectItem value="card">Customer filled, bill outlined</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Rate board">
                <Select value={cfg.rateBand} onValueChange={(v) => set('rateBand', v as InvoiceConfig['rateBand'])}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="strip">Full-width strip with headings</SelectItem>
                    <SelectItem value="boxed">A board in its own box</SelectItem>
                    <SelectItem value="inline">One line between rules</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Item table">
                <Select value={cfg.table} onValueChange={(v) => set('table', v as InvoiceConfig['table'])}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="filled">Filled heading</SelectItem>
                    <SelectItem value="ruled">Ruled — headings in your colour</SelectItem>
                    <SelectItem value="framed">Framed, with full-width metal totals</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Money column">
                <Select value={cfg.totals} onValueChange={(v) => set('totals', v as InvoiceConfig['totals'])}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="plain">Plain stack</SelectItem>
                    <SelectItem value="banded">Total in a band</SelectItem>
                    <SelectItem value="coded">Green paid · red still due</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Bottom of the page">
                <Select value={cfg.footer} onValueChange={(v) => set('footer', v as InvoiceConfig['footer'])}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="signatures">Stacked, then signatures</SelectItem>
                    <SelectItem value="threeCol">Three columns — terms · bank · money</SelectItem>
                    <SelectItem value="band">Closing band with your phone</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Row spacing">
                <Select value={cfg.density} onValueChange={(v) => set('density', v as InvoiceConfig['density'])}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compact">Compact</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="roomy">Roomy</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Table rules">
                <Select value={cfg.rules} onValueChange={(v) => set('rules', v as InvoiceConfig['rules'])}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hairline">Hairline</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="bold">Bold</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Table headings">
                <Select value={cfg.headingCase} onValueChange={(v) => set('headingCase', v as InvoiceConfig['headingCase'])}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="upper">UPPER CASE</SelectItem>
                    <SelectItem value="title">Title Case</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Shop name &amp; title">
                <Select value={cfg.titleFont} onValueChange={(v) => set('titleFont', v as InvoiceConfig['titleFont'])}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sans">Plain (sans)</SelectItem>
                    <SelectItem value="serif">Serif — traditional</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Space between sections">
                <Select value={cfg.sectionGap} onValueChange={(v) => set('sectionGap', v as InvoiceConfig['sectionGap'])}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tight">Tight</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="loose">Loose</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <ToggleRow label="Alternate row shading" checked={cfg.zebra} onChange={(v) => set('zebra', v)} />
            <ToggleRow
              label="Tint the table heading with the colour"
              hint="Off keeps the neutral stone heading, which is what a mono printer reproduces best."
              checked={cfg.tint} onChange={(v) => set('tint', v)}
            />
            {/* Stated on the screen where the choice is made, not discovered at the printer. */}
            <p className="text-xs text-muted-foreground">
              On A5 three things give way so a one-line bill still fits on one half sheet: the
              three-column bottom goes back to stacked, the closing band is left off, the rate board
              prints as one line, and roomy rows come back to normal. A4 keeps all four.
            </p>
          </CardContent>
        </Card>
          </div>
        </SheetContent>
      </Sheet>

      {printOpen && shown && (
        <InvoiceSheet
          open
          onClose={() => setPrintOpen(false)}
          invoice={shown}
          firm={firm ?? SAMPLE_FIRM}
          customer={customer}
          config={cfg}
          calc={calc}
          rates={rateData?.rates}
          gstEnabled={gstEnabled}
          fieldOverrides={docOv}
          docType={docType}
        />
      )}
    </div>
  )
}

/** The statutory fields switched off (hidden or not printed) on this document, in registry order. */
function hiddenStatutory(docOv: FieldOverrides, docType: string): InvoiceFieldDef[] {
  return INVOICE_FIELDS.filter((f) => statutoryWarning(f, docType) && isSwitchedOff(docOv[String(f.count)]))
}

/**
 * One field's editor. Every control here bites: a field with no node of its own (flagOnly) gets no
 * style controls at all, and a field that may not be hidden gets its visibility switches disabled
 * with the reason beside them, rather than a switch that does nothing.
 */
function FieldEditor({ def, docType, ov, o, flagOn, onChange, onReset, onOpenOptions }: {
  def: InvoiceFieldDef
  docType: string
  ov: FieldOverrides
  o: FieldOverride
  /** Current value of the InvoiceConfig flag that governs this field, when there is one. */
  flagOn?: boolean
  onChange: (patch: Partial<FieldOverride>) => void
  onReset: () => void
  onOpenOptions: () => void
}) {
  const group = INVOICE_FIELD_GROUPS.find((g) => g.id === def.group)
  const hideable = canHideField(def)
  const customised = Object.keys(o).length > 0
  const reason = def.flagOnly
    ? 'This field has no line of its own to hide.'
    : def.configFlag
      ? 'Whether it prints is a switch in Layout options, not here.'
      : def.column
        ? 'A column cannot be hidden here: it would leave a hole in every row.'
        : ''
  const law = statutoryWarning(def, docType)
  const off = isSwitchedOff(o)
  const reasonId = `${useId()}-why`
  const state = !hideable ? 'Not switchable here'
    : o.show === false ? 'Hidden everywhere'
    : o.print === false ? 'On screen only, not printed'
    : 'Shown and printed'
  const linkToOptions = !!(def.configFlag || def.column)

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold">
            {fieldLabel(ov, def.count, def.label)}
            {fieldLabel(ov, def.count, def.label) !== def.label && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">was “{def.label}”</span>
            )}
          </p>
          <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 px-2 text-xs" disabled={!customised} onClick={onReset}>
            <RotateCcw className="size-3" aria-hidden /> Reset
          </Button>
        </div>
        <p className="text-xs leading-[1.6] text-muted-foreground">
          {def.hindi} · field #{def.count} · {group?.label}
          {customised && <span className="ml-1 font-medium text-amber-700 dark:text-amber-400">· changed</span>}
        </p>
        {def.note && <p className="mt-1.5 rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">{def.note}</p>}
        {def.count === 23 && (
          <p className="mt-1.5 rounded-md border border-amber-500/40 bg-amber-50 p-2 text-xs dark:bg-amber-500/10">
            Printing a customer&rsquo;s full Aadhaar on a tax invoice is a compliance decision, not a
            layout one, so it stays off and is not switchable from here.
          </p>
        )}
        {flagOn !== undefined && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Currently <span className="font-medium text-foreground">{flagOn ? 'printing' : 'switched off'}</span> in Layout options.
          </p>
        )}
        {def.flagOnly && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Default: {def.defaultCheck ? 'printed' : 'off'}. Nothing to restyle — {def.configFlag ? 'it prints on the line of its neighbours, so set that line’s style instead.' : 'it renders nothing today.'}
          </p>
        )}
      </div>

      {!def.flagOnly && (
        canRenameField(def) ? (
          <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-50/50 p-2 dark:bg-amber-500/5">
            <p className="text-xs font-medium">Change the title on the bill</p>
            <LabelInput
              label="Title (English)" value={o.text} placeholder={printedWord(def.label)}
              onCommit={(v) => onChange({ text: v })}
            />
            <LabelInput
              label="Title (Hindi) · हिन्दी नाम" hindi value={o.textHi} placeholder={def.hindi}
              onCommit={(v) => onChange({ textHi: v })}
            />
          </div>
        ) : (
          <p className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
            This one cannot be renamed: it prints the thing itself (a name, a logo or a legal sentence), not a caption beside it.
          </p>
        )
      )}
      {def.flagOnly && (
        <p className="text-xs text-muted-foreground">It has no label of its own, so there is nothing to rename.</p>
      )}

      {!def.flagOnly && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <OptNum
              label="Font size (px)" min={FIELD_FONT_MIN} max={FIELD_FONT_MAX} step={0.5}
              value={o.fontSize} placeholder="sheet’s own" onCommit={(v) => onChange({ fontSize: v })}
            />
            <Field label="Colour">
              <div className="flex items-center gap-1.5">
                <input
                  type="color" value={o.color || '#000000'}
                  onChange={(e) => onChange({ color: e.target.value })}
                  className="size-9 shrink-0 cursor-pointer rounded-md border bg-background p-0.5"
                />
                <Button type="button" variant="outline" size="sm" className="h-9" disabled={!o.color} onClick={() => onChange({ color: undefined })}>
                  Clear
                </Button>
              </div>
            </Field>
            <Field label="Weight">
              <Select
                value={o.bold === undefined ? 'default' : o.bold ? 'bold' : 'regular'}
                onValueChange={(v) => onChange({ bold: v === 'default' ? undefined : v === 'bold' })}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Sheet’s own</SelectItem>
                  <SelectItem value="bold">Bold</SelectItem>
                  <SelectItem value="regular">Regular</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Align">
              <Select
                value={o.align ?? 'default'}
                onValueChange={(v) => onChange({ align: v === 'default' ? undefined : (v as FieldOverride['align']) })}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Sheet’s own</SelectItem>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="center">Centre</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <OptNum label="Top mm" min={0} max={FIELD_MARGIN_MAX} step={0.5} value={o.mt} onCommit={(v) => onChange({ mt: v })} />
            <OptNum label="Bottom mm" min={0} max={FIELD_MARGIN_MAX} step={0.5} value={o.mb} onCommit={(v) => onChange({ mb: v })} />
            <OptNum label="Left mm" min={0} max={FIELD_MARGIN_MAX} step={0.5} value={o.ml} onCommit={(v) => onChange({ ml: v })} />
            <OptNum label="Right mm" min={0} max={FIELD_MARGIN_MAX} step={0.5} value={o.mr} onCommit={(v) => onChange({ mr: v })} />
          </div>
          <div className="space-y-0.5 border-t pt-2">
            <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground" data-testid="field-visibility-state">
              Now:
              <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium',
                !hideable ? 'bg-muted text-foreground'
                  : o.show === false ? 'border-red-500/40 text-red-700 dark:text-red-400'
                  : o.print === false ? 'border-amber-500/40 text-amber-700 dark:text-amber-400'
                  : 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400')}>
                {!hideable && <Lock className="size-3" aria-hidden />}{state}
              </span>
            </p>
            {law && off && (
              <p role="status" data-testid="field-statutory-warning" className="flex items-start gap-1.5 rounded-md border border-red-500/50 bg-red-50 p-2 text-xs text-red-950 dark:bg-red-500/10 dark:text-red-100">
                <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>{law}</span>
              </p>
            )}
            <ToggleRow
              label="Show this field"
              hint={hideable ? (law ? 'Required on a tax invoice. Off hides it on screen and on paper.' : 'Off hides it on screen and on paper.') : undefined}
              checked={hideable ? o.show !== false : true}
              onChange={(v) => onChange({ show: v ? undefined : false, print: undefined })}
              disabled={!hideable}
              describedBy={!hideable ? reasonId : undefined}
            />
            <ToggleRow
              label="Hide on paper only"
              hint={hideable ? (def.count === 101 ? 'Not available for a column: it leaves the screen and the paper together.' : 'Stays on screen, left off the printed copy.') : undefined}
              checked={hideable ? o.print === false : false}
              onChange={(v) => onChange({ print: v ? false : undefined })}
              disabled={!hideable || o.show === false || def.count === 101}
              describedBy={!hideable ? reasonId : undefined}
            />
            {!hideable && (
              <p id={reasonId} data-testid="field-lock-reason" className="flex items-start gap-1.5 rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
                <Lock className="mt-0.5 size-3 shrink-0" aria-hidden />
                <span>
                  <span className="font-medium text-foreground">Not switchable here. </span>
                  {reason}
                  {linkToOptions && (
                    <> <button type="button" onClick={onOpenOptions} className="font-medium text-amber-700 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:text-amber-400">Open Layout options</button>.</>
                  )}
                </span>
              </p>
            )}
          </div>
        </>
      )}
      {def.flagOnly && def.configFlag && (
        <button type="button" onClick={onOpenOptions} className="text-xs font-medium text-amber-700 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:text-amber-400">
          Open Layout options
        </button>
      )}
    </div>
  )
}

/** The word the sheet prints by default, from the registry's "Column — Purity" style label. */
const printedWord = (label: string) => label.replace(/^Column\s+[—-]\s+/, '')

/**
 * One label override. Empty box = the sheet's own word (shown as the placeholder); the checkbox is
 * the separate, deliberate "print nothing" ('' in storage), so clearing a box never blanks a label
 * by accident.
 */
function LabelInput({ label, value, placeholder, hindi, onCommit }: {
  label: string; value: string | undefined; placeholder: string; hindi?: boolean
  onCommit: (v: string | undefined) => void
}) {
  const id = useId()
  const blank = value === ''
  const len = (value ?? '').length
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <Input
        id={id} value={value ?? ''} maxLength={FIELD_LABEL_MAX} disabled={blank}
        lang={hindi ? 'hi' : undefined}
        placeholder={blank ? 'Prints nothing' : `${placeholder || '—'} (sheet’s own)`}
        onChange={(e) => onCommit(e.target.value === '' ? undefined : e.target.value)}
        aria-describedby={`${id}-n`}
        className={cn('h-9', hindi && 'leading-[1.6]')}
      />
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <label className="flex items-center gap-1.5">
          <Checkbox checked={blank} onCheckedChange={(c) => onCommit(c ? '' : undefined)} aria-label={`${label}: print no label`} />
          Print no label
        </label>
        <span id={`${id}-n`} className={cn('tabular-nums', len >= FIELD_LABEL_MAX && 'font-medium text-amber-700 dark:text-amber-400')}>
          {len}/{FIELD_LABEL_MAX}
        </span>
      </div>
    </div>
  )
}


/**
 * An optional number: empty means "the sheet's own value". Keeps its own text so typing "1" on the
 * way to "12" is not snapped back for being below the minimum; commits only values inside the
 * range, and tidies the text on blur. Also never lets the wheel change a value.
 */
function OptNum({ label, value, min, max, step, placeholder, onCommit }: {
  label: string; value: number | undefined; min: number; max: number; step: number
  placeholder?: string; onCommit: (v: number | undefined) => void
}) {
  const [text, setText] = useState(value === undefined ? '' : String(value))
  const [last, setLast] = useState(value)
  if (last !== value) {
    setLast(value)
    if (!(text === '' && value === undefined) && parseFloat(text) !== value) setText(value === undefined ? '' : String(value))
  }
  return (
    <Field label={label}>
      <Input
        type="number" inputMode="decimal" min={min} max={max} step={step}
        value={text} placeholder={placeholder}
        onWheel={(e) => (e.target as HTMLInputElement).blur()}
        onChange={(e) => {
          const t = e.target.value
          setText(t)
          if (t === '') return onCommit(undefined)
          const n = Number(t)
          if (Number.isFinite(n) && n >= min && n <= max) onCommit(n)
        }}
        onBlur={() => setText(value === undefined ? '' : String(value))}
        className="text-right tabular-nums"
      />
    </Field>
  )
}

/**
 * The shop's one colour. oMunim calls it TABLE HEADING COLOR and lets a shop pick anything,
 * including a yellow its own white heading text vanishes into. Here the foreground is COMPUTED
 * (accentPaint) and the panel shows the resulting contrast ratio and its WCAG grade, so a shop
 * that picks an illegible pair is told before it prints a thousand bills.
 */
function AccentPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const id = useId()
  const paint = accentPaint(value)
  // Both numbers, because the shop prints on both: the greyscale one is usually the lower.
  const ratio = paint?.headContrast ?? Math.round(contrastRatio('#f5f5f4', '#44403c') * 10) / 10
  const grey = paint?.headContrastGrey ?? ratio
  const worst = Math.min(ratio, grey)
  const grade = worst >= 7 ? 'AAA' : worst >= 4.5 ? 'AA' : worst >= 3 ? 'AA large text only' : 'below AA'
  const ok = worst >= 4.5

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor={id} className="text-xs text-muted-foreground">Table heading colour</Label>
          <div className="flex items-center gap-2">
            <input
              id={id} type="color" value={paint?.head || '#b45309'}
              onChange={(e) => onChange(e.target.value)}
              className="size-9 shrink-0 cursor-pointer rounded-md border bg-background p-0.5"
            />
            <Input
              value={value} onChange={(e) => onChange(e.target.value)}
              placeholder="#b45309" aria-label="Heading colour hex code"
              className="h-9 w-28 font-mono text-sm"
            />
            <Button
              type="button" variant="outline" size="sm" className="h-9"
              onClick={() => onChange('')} disabled={!value}
            >
              None
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Suggested heading colours">
        {ACCENT_SWATCHES.map((sw) => (
          <button
            key={sw.hex} type="button" onClick={() => onChange(sw.hex)}
            aria-label={sw.name} aria-pressed={paint?.head === sw.hex}
            className={cn(
              'size-7 rounded-md border-2 transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500',
              paint?.head === sw.hex ? 'border-foreground scale-110' : 'border-transparent hover:scale-105',
            )}
            style={{ backgroundColor: sw.hex }}
          />
        ))}
      </div>

      {/* Exactly what will print, at print scale. */}
      <div className="overflow-hidden rounded-md border">
        <div
          className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide"
          style={paint
            ? { backgroundColor: paint.head, color: paint.headText }
            : { backgroundColor: '#f5f5f4', color: '#44403c' }}
        >
          Description · Net wt · Rate · Amount
        </div>
        <div
          className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide"
          style={paint ? { backgroundColor: paint.band, color: paint.bandText } : { backgroundColor: '#f5f5f4', color: '#1c1917' }}
        >
          Total gold · 5.000 g · ₹5,745.00
        </div>
      </div>

      <p className={cn('text-xs', ok ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-400')} aria-live="polite">
        {paint
          ? `${paint.headText === '#ffffff' ? 'White' : 'Black'} heading text, chosen for you — ${ratio}:1 on paper, ${grey}:1 once a mono printer greys it (${grade}).`
          : 'No colour: the neutral grey heading.'}
        {!ok && ' Legible, but not by much — a darker or lighter colour reads better across the counter.'}
      </p>
    </div>
  )
}

const ACCENT_SWATCHES = [
  { hex: '#b45309', name: 'Amber' },
  { hex: '#1e3a5f', name: 'Navy' },
  { hex: '#7f1d1d', name: 'Maroon' },
  { hex: '#14532d', name: 'Bottle green' },
  { hex: '#4c1d95', name: 'Purple' },
  { hex: '#0f766e', name: 'Teal' },
  { hex: '#1c1917', name: 'Black' },
]

/**
 * One banner slot.
 *
 * The file is re-encoded in the browser before it is ever sent: Setting.value is a 65,535-byte
 * MySQL TEXT and a phone photo is twenty times that. downscaleBanner() fits it to 1280×500 and
 * steps the JPEG quality down until the data URL is under BANNER_MAX_CHARS, so the shop gets a
 * clear "too large" instead of a 500 from a truncated row.
 *
 * The printed size in mm is stated up front, because a 2.56:1 banner across an A4 is ~73mm tall —
 * a third of the page, and the one change here that can silently add a sheet to every bill.
 */
function BannerField({ label, hint, value, onChange, widthMm, pageMm, spareMm }: {
  label: string; hint: string; value: string; onChange: (v: string) => void
  widthMm: number
  /** Printable height of the chosen paper, 0 for the continuous roll. */
  pageMm: number
  /**
   * How much of that height a one-line bill leaves over — bannerSpareMm(cfg). 0 on the roll, which
   * has no page to run out of.
   *
   * This replaced `capMm`, the masthead's old height budget. The honest question is not "what share
   * of the page is this advert" (a flat 20% alarm said nothing about the owner's own 4:1 banner at
   * 17%, which fits, and nothing about a 3.4:1 one at 19.6%, which does not) — it is "does this
   * image cost me a second sheet of every copy", and that is this number against the one below.
   */
  spareMm: number
}) {
  const id = useId()
  const [busy, setBusy] = useState(false)
  const [ratio, setRatio] = useState<number | null>(null)
  const kb = value ? Math.round((value.length * 3) / 4 / 1024) : 0
  // ONE size, in either placement: the full printable width, at the image's own aspect ratio. There
  // is no cap and no crop any more — see `bannerTopAbove` in invoice-print.ts for why both went.
  const printWidthMm = Math.round(widthMm)
  const heightMm = ratio ? Math.round(widthMm / ratio) : null
  const spills = !!heightMm && spareMm > 0 && heightMm > spareMm

  async function pick(file: File | undefined) {
    if (!file) return
    setBusy(true)
    try {
      const { dataUrl, aspect } = await downscaleBanner(file)
      onChange(dataUrl)
      setRatio(aspect)
    } catch (e) {
      toast.error((e as Error).message || 'That image could not be read')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <p className="text-xs text-muted-foreground">{hint} Best at {BANNER_BOX.w}×{BANNER_BOX.h}.</p>
      {value ? (
        <div className="space-y-1.5">
          <img
            src={value} alt={`${label} preview`}
            onLoad={(e) => setRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
            className="w-full rounded-md border bg-white"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {kb} KB{heightMm ? ` · prints ${printWidthMm}×${heightMm} mm — the full width of the bill` : ''}
            </span>
            <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => { onChange(''); setRatio(null) }}>
              <X className="size-3.5" /> Remove
            </Button>
          </div>
          {/**
            * WHAT THIS IMAGE COSTS IN PAPER, for the image the shop has actually uploaded, stated
            * before it saves — which is the whole of what is left now that the masthead's height cap
            * is gone. Both branches print: "it fits" is as much use to a shopkeeper as "it does
            * not", and a panel that only ever speaks up to complain is a panel nobody reads.
            *
            * `aria-live` so the sentence is announced when a new file changes the verdict — the
            * number moves without anything being focused.
            */}
          {heightMm !== null && spareMm > 0 && (
            <p
              className={cn('text-xs', spills ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}
              aria-live="polite"
            >
              {spills ? (
                <>
                  {heightMm} mm is more than the ~{spareMm} mm a one-item bill leaves spare on this
                  paper, so this image adds a second sheet to every copy — wherever you place it on
                  the page. A wider, shorter picture fits: at {printWidthMm} mm across, {BANNER_BOX.w}×
                  {Math.round((BANNER_BOX.w * spareMm) / printWidthMm)} or flatter stays on one sheet.
                </>
              ) : (
                <>
                  {heightMm} mm fits: a one-item bill leaves about {spareMm} mm spare on this paper.
                  A longer bill, or a picture in both banner slots, uses that up — check the preview.
                </>
              )}
            </p>
          )}
        </div>
      ) : null}
      <Input
        id={id} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy}
        onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }}
        className="h-9 cursor-pointer text-xs file:mr-2 file:cursor-pointer"
      />
      {busy && <p className="text-xs text-muted-foreground" aria-live="polite"><ImagePlus className="mr-1 inline size-3" />Resizing…</p>}
    </div>
  )
}

/**
 * Fit an uploaded image into the banner slot and into a MySQL TEXT column. Resize is the shared
 * src/lib/image.ts helper (also used by the firm-logo picker); this just states the banner's box,
 * budget and JPEG ladder. Quality steps down until it fits; if even the last step does not, it
 * throws rather than writing a row MySQL will reject.
 */
async function downscaleBanner(file: File): Promise<{ dataUrl: string; aspect: number }> {
  return downscaleImage(file, {
    box: BANNER_BOX,
    maxChars: BANNER_MAX_CHARS,
    quality: [0.82, 0.7, 0.58, 0.45, 0.32],
    invalidTypeMessage: 'That is not an image file',
    tooLargeMessage: 'That image is too detailed to fit — try a simpler or smaller one',
  })
}

function MmField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <Field label={`${label} margin (mm)`}>
      <Input
        type="number" min={0} max={60} step={0.5} value={value}
        onChange={(e) => onChange(Math.min(60, Math.max(0, Number(e.target.value) || 0)))}
      />
    </Field>
  )
}

function ToggleRow({ label, hint, checked, onChange, disabled, describedBy }: {
  label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean
  /** Id of a paragraph that says WHY a disabled switch cannot move. */
  describedBy?: string
}) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <div className="min-w-0">
        {/* Devanagari matras sit above and below the baseline and clip at `text-sm`'s own 1.25
            leading when the row wraps. Only the labels that actually carry Devanagari pay for the
            extra line box, so the other two dozen switches in this panel keep their density. */}
        <Label
          htmlFor={id}
          className={cn('text-sm', /[ऀ-ॿ]/.test(label) && 'leading-[1.6]', disabled && 'text-muted-foreground')}
        >
          {label}
        </Label>
        {hint && <p id={hintId} className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-disabled={disabled || undefined}
        aria-describedby={[hintId, describedBy].filter(Boolean).join(' ') || undefined}
        className={cn('mt-0.5 shrink-0', disabled ? 'data-[state=checked]:bg-muted-foreground/40' : 'data-[state=checked]:bg-amber-500')}
      />
    </div>
  )
}
