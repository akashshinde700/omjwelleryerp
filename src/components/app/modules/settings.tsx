'use client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader, Field } from '../shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Palette, Coins, Save, Users, CreditCard, Scale, Fingerprint, Star, Plus, KeyRound, Calculator, Banknote, Percent, Trash2, History } from 'lucide-react'
import { useState } from 'react'
import { api } from '@/lib/api-client'
import { useApp, useViewContext } from '@/store/app'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { formatINR } from '@/lib/format'
import { deriveKaratRate, PURITY_PERCENT } from '@/lib/constants'
import { CASH_LIMIT_KEYS, TCS_SETTING_KEYS, computeTcs } from '@/lib/gst'
import { CounterSettings, UI_SETTING_KEYS, parseCounterSettings } from '@/lib/counter-settings'
import {
  CalcSettings, WeightBasis, RateUnit, RoundOff,
  CALC_SETTING_KEYS, parseCalcSettings,
  computeNetWeight, computeFinalPurity, computeFineWeight,
  computeMakingCharge, ratePerGram, applyRoundOff, roundWeight,
  GoldRateUnit, GOLD_RATE_UNIT_LABEL,
  CounterCalcSettings, COUNTER_CALC_SETTING_KEYS, parseCounterCalcSettings,
} from '@/lib/stock-calc'
import { useFirmRole, MANAGER_ONLY_TITLE, OWNER_ONLY_TITLE } from './use-firm-role'
import { CredField } from './firms'

/**
 * What GET /api/firms actually returns. The six gateway credential columns are NOT on it and must
 * not be added back: they are `omit`ed by the route because this response is cached by every
 * counter machine. `credentialsSet` is the booleans-only stand-in the route sends instead.
 */
type Firm = {
  id: string
  name?: string
  credentialsSet?: Record<string, boolean>
  weighingScalePort?: string
  weighingScaleBaud?: number
  biometricEnabled?: boolean
  loyaltyRate?: number
  eInvoiceEnabled?: boolean
  whatsappEnabled?: boolean
}

/** A row from GET /api/gold-rate — see prisma/schema.prisma GoldRate. */
type GoldRateRow = { id: string; metal: string; purity: string; rate: number; unit: string; rateDate: string }

type Staff = {
  id: string
  loginId: string
  name: string
  email?: string
  phone?: string
  role: string
  /** UserFirm.role for the active firm — the authority for what this person may do here. */
  firmRole?: string
  active: boolean
  permissions?: string | null
  biometricHash?: string | null
  lastLoginAt?: string | null
}

const PERMISSION_GROUPS = [
  { key: 'main', label: 'Main / Dashboard', perms: ['dashboard', 'home', 'rates'] },
  { key: 'ops', label: 'Operations', perms: ['stock', 'sell', 'loan', 'scheme', 'approval'] },
  { key: 'accounts', label: 'Accounts', perms: ['invoices', 'receipts', 'payments', 'ledger', 'reports'] },
  { key: 'system', label: 'System', perms: ['customers', 'staff', 'firms', 'settings'] },
]

export function SettingsModule() {
  const { activeFirmId } = useApp()
  // Arriving from Add Stock's "Options" button, land ON the stock section rather than at the top
  // of a long Setup page — the whole point of that button is not making anyone hunt.
  useViewContext((ctx) => {
    if (!ctx.scrollTo) return
    requestAnimationFrame(() => document.getElementById(String(ctx.scrollTo))?.scrollIntoView({ block: 'start' }))
  })
  const { theme, setTheme } = useTheme()
  const qc = useQueryClient()
  const { isManager, isOwner } = useFirmRole()

  const { data } = useQuery({ queryKey: ['settings', activeFirmId], queryFn: () => api<{ settings: any[] }>('/api/settings', { search: { firmId: activeFirmId! } }), enabled: !!activeFirmId })
  const { data: firmsData } = useQuery({ queryKey: ['firms'], queryFn: () => api<{ firms: Firm[] }>('/api/firms') })
  const firm = (firmsData?.firms || []).find((f) => f.id === activeFirmId)
  const counter = parseCounterSettings(data?.settings)

  async function save(key: string, value: string) {
    await api('/api/settings', { method: 'PUT', body: { firmId: activeFirmId, key, value } })
    toast.success('Setting saved')
    qc.invalidateQueries({ queryKey: ['settings'] })
  }

  async function saveFirm(fields: Partial<Firm>) {
    if (!firm) { toast.error('No active firm selected'); return }
    await api('/api/firms', { method: 'PUT', body: { id: firm.id, ...fields } })
    toast.success('Firm settings saved')
    qc.invalidateQueries({ queryKey: ['firms'] })
  }

  return (
    <div>
      <PageHeader title="Setup" hindi="सेटअप" desc="Set it once. Every screen follows." />

      <Section title="At the counter" hindi="काउंटर पर">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Palette className="size-4 text-amber-600" /> Screen &amp; keyboard <span className="text-xs font-normal text-muted-foreground">स्क्रीन</span></CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div><Label htmlFor="dark-mode">Dark mode</Label><p className="text-xs text-muted-foreground">Easier on the eyes under shop lighting</p></div>
              <Switch id="dark-mode" checked={theme === 'dark'} onCheckedChange={(v) => setTheme(v ? 'dark' : 'light')} />
            </div>
            <div className="space-y-1.5">
              <Field label="Move to the next field with">
                <Select value={counter.enterMovesNext ? 'enter' : 'tab'} onValueChange={(v) => save(UI_SETTING_KEYS.enterMovesNext, String(v === 'enter'))}>
                  <SelectTrigger className="w-full sm:w-60"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tab">Tab key only</SelectItem>
                    <SelectItem value="enter">Enter key (and Tab)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <p className="text-xs text-muted-foreground">
                {counter.enterMovesNext
                  ? 'Enter jumps to the next field and selects what is already there, so the operator types straight over it. Item rows keep using Enter to add the line.'
                  : 'Standard browser behaviour. Switch to Enter if your operator learnt on a DOS counter — it saves a reach on every field.'}
              </p>
            </div>
          </CardContent>
        </Card>

        <DailyRatesCard firmId={activeFirmId!} isManager={isManager} />
      </Section>

      {/* Its own section, named after the screen it governs. It used to sit inside "Money and tax"
          beside the cash-limit and TCS cards, which is true but useless to someone looking for
          "why did Add Stock default Making to gross". id + scroll target so Add Stock's Options
          button can land on it directly rather than at the top of a long Setup page. */}
      {/* `id` stays "stock-settings": stock-add.tsx's Options button scrolls here by that name. The
          TITLE is no longer stock-only — Sell, Purchase, Old metal and Rate cut sit here too, and an
          intro promising "defaults the Add Stock form opens with" was false above four of the five
          cards. Each card now states its own contract; this paragraph only says what they share. */}
      <Section title="Calculation settings" hindi="गणना सेटिंग" id="stock-settings">
        {isManager === false && <p className="lg:col-span-2 text-xs text-muted-foreground -mt-1">{MANAGER_ONLY_TITLE}</p>}
        <p className="lg:col-span-2 text-xs text-muted-foreground -mt-1">
          How this shop costs an item, on each screen that prices one. Every setting here is only the
          <strong className="text-foreground"> default the form opens with</strong> — the per-row dropdowns stay editable
          for a one-off, and changing a setting <strong className="text-foreground">never touches an item or a bill
          already saved</strong>.
        </p>
        <fieldset disabled={isManager === false} className="contents">
          <CalculationCard settings={parseCalcSettings(data?.settings)} onSave={save} />
          <SellCard settings={parseCounterCalcSettings(data?.settings)} onSave={save} />
          <PurchaseCard settings={parseCounterCalcSettings(data?.settings)} onSave={save} />
          <OldMetalCard settings={parseCounterCalcSettings(data?.settings)} onSave={save} />
          <RateCutCard settings={parseCounterCalcSettings(data?.settings)} onSave={save} />
        </fieldset>
      </Section>

      <Section title="Money and tax" hindi="पैसा और टैक्स">
        {isManager === false && <p className="lg:col-span-2 text-xs text-muted-foreground -mt-1">{MANAGER_ONLY_TITLE}</p>}
        <fieldset disabled={isManager === false} className="contents">
          <CashPanCard settings={counter} onSave={save} />
          <TcsCard settings={counter} onSave={save} />
        </fieldset>
      </Section>

      <Section title="People" hindi="लोग">
        <StaffMgmtCard firmId={activeFirmId!} />
        <fieldset disabled={isOwner === false} className="contents">
          <LoyaltyCard firm={firm} onSave={saveFirm} />
        </fieldset>
      </Section>

      <Section title="Devices and integrations" hindi="डिवाइस">
        {isOwner === false && <p className="lg:col-span-2 text-xs text-muted-foreground -mt-1">{OWNER_ONLY_TITLE}</p>}
        <fieldset disabled={isOwner === false} className="contents">
          <PaymentGatewaysCard firm={firm} onSave={saveFirm} />
          <WeighingScaleCard firm={firm} onSave={saveFirm} />
          <BiometricSecurityCard firm={firm} onSave={saveFirm} />
        </fieldset>
      </Section>
    </div>
  )
}

/** A labelled band of cards. Same heading treatment as Home's "Needs attention", so Setup reads as
 *  four short lists instead of one wall of boxes. */
function Section({ title, hindi, id, children }: { title: string; hindi: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-6 scroll-mt-20">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        {title} <span className="normal-case tracking-normal">· {hindi}</span>
      </h2>
      {/* `whitespace-normal` on the triggers is what keeps these cards inside a 400px screen, and it
          is not cosmetic. A grid item's min-width is `auto`, so a track can never shrink below its
          MIN-CONTENT width — and SelectTrigger ships `whitespace-nowrap` (ui/select.tsx), which makes
          the min-content of a deliberately sentence-long option ("Yes — 22K item takes the 22K rate,
          metal on net weight") the full 546px. Every card was therefore 546px inside a 368px section
          and clipped, with no scrollbar to hint at it. Letting the text wrap drops min-content to one
          word, so every card now fits its 368px section.
          The second class re-applies `line-clamp-1` to the value AT HIGHER SPECIFICITY (1 class + 2
          attributes beats the primitive's 1 class + 1 attribute), because the primitive asks for both
          `line-clamp-1` AND `flex` on that element and `display:flex` wins — the clamp is dead, so a
          wrapped sentence rendered 40px tall inside the fixed 36px trigger and spilled over its
          border. With display back to -webkit-box the collapsed trigger is one line with an ellipsis.
          The full string stays in the DOM (the accessible name is unchanged) and in the open dropdown.
          Measured: byte-identical screenshot at 1440px — nothing wraps there. Overridden here and not
          in ui/select.tsx on purpose: that primitive is in all 29 modules. */}
      <div className="grid lg:grid-cols-2 gap-4 items-start [&_[data-slot=select-trigger]]:whitespace-normal [&_[data-slot=select-trigger]>[data-slot=select-value]]:line-clamp-1">{children}</div>
    </section>
  )
}

/**
 * A setting that is a number. Saves on its own button, never on blur — a half-typed limit must not
 * become the live one. Re-syncs during render (never in an effect) when the server value changes.
 */
function NumberSetting({ label, hint, value, unit, onSave, allowZero = true, step }: {
  label: string; hint?: string; value: number; unit: string
  onSave: (v: string) => void; allowZero?: boolean; step?: string
}) {
  const [text, setText] = useState(String(value))
  const [prev, setPrev] = useState(value)
  if (value !== prev) { setPrev(value); setText(String(value)) }
  const n = Number(text)
  const invalid = text.trim() === '' || !Number.isFinite(n) || n < 0 || (!allowZero && n === 0)
  return (
    <div className="space-y-1.5">
      <Field label={label}>
        <div className="flex gap-2">
          <span aria-hidden className="grid place-items-center min-w-9 px-2 rounded-md border bg-muted text-xs text-muted-foreground shrink-0">{unit}</span>
          <Input inputMode="decimal" type="number" min={0} step={step} value={text} onChange={(e) => setText(e.target.value)}
            aria-invalid={invalid || undefined} className="text-right" />
          <Button size="sm" variant="outline" disabled={invalid || n === value} onClick={() => onSave(String(n))} aria-label={'Save ' + label}>
            <Save className="size-3.5" />
          </Button>
        </div>
      </Field>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/* ───────────────────────── Cash & PAN ─────────────────────────
 * Both keys were already enforced by /api/invoices and already warned about on the sell screen —
 * they simply had no way in short of editing the database. This is that way in.
 */
function CashPanCard({ settings, onSave }: { settings: CounterSettings; onSave: (key: string, value: string) => void }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Banknote className="size-4 text-amber-600" /> Cash &amp; PAN limit <span className="text-xs font-normal text-muted-foreground">नकद सीमा</span></CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Take more cash than this on one bill and the counter must record the customer&apos;s PAN before it can save (Rule 114B). <strong>0 means no limit.</strong>
        </p>
        <NumberSetting label="Cash limit on a sale" unit="₹" value={settings.cashLimitSale} onSave={(v) => onSave(CASH_LIMIT_KEYS.sale, v)}
          hint={settings.cashLimitSale ? 'Sales taking over ' + formatINR(settings.cashLimitSale) + ' in cash ask for a PAN.' : 'No PAN prompt on sales.'} />
        <NumberSetting label="Cash limit on a purchase" unit="₹" value={settings.cashLimitPurchase} onSave={(v) => onSave(CASH_LIMIT_KEYS.purchase, v)}
          hint={settings.cashLimitPurchase ? 'Old-gold and supplier purchases paying over ' + formatINR(settings.cashLimitPurchase) + ' in cash ask for a PAN.' : 'No PAN prompt on purchases.'} />
      </CardContent>
    </Card>
  )
}

/* ───────────────────────── TCS ─────────────────────────
 * s.206C(1H). Off unless the accountant says the firm is liable — see TCS_SETTING_KEYS in
 * src/lib/gst.ts for why this is a setting and not a rule the app works out for itself.
 */
function TcsCard({ settings, onSave }: { settings: CounterSettings; onSave: (key: string, value: string) => void }) {
  // Worked example so the three numbers are not abstract: a buyer already at the threshold pays ₹10L more.
  const args = { priorReceipts: settings.tcsThreshold, thisReceipt: 1000000, threshold: settings.tcsThreshold, rate: settings.tcsRate, rateNoPan: settings.tcsRateNoPan }
  const withPan = computeTcs({ ...args, hasPan: true })
  const noPan = computeTcs({ ...args, hasPan: false })
  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Percent className="size-4 text-amber-600" /> TCS on big buyers <span className="text-xs font-normal text-muted-foreground">टीसीएस</span></CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="tcs-on">Collect TCS (s.206C(1H))</Label>
            <p className="text-xs text-muted-foreground">Turn on only if your accountant confirms the firm is liable.</p>
          </div>
          <Switch id="tcs-on" checked={settings.tcsApplicable} onCheckedChange={(v) => onSave(TCS_SETTING_KEYS.applicable, String(v))} />
        </div>
        {settings.tcsApplicable ? (
          <>
            <NumberSetting label="Applies above, per buyer per year" unit="₹" value={settings.tcsThreshold} allowZero={false}
              onSave={(v) => onSave(TCS_SETTING_KEYS.threshold, v)} />
            <div className="grid sm:grid-cols-2 gap-3">
              <NumberSetting label="Rate with PAN on file" unit="%" step="0.01" value={settings.tcsRate} allowZero={false}
                onSave={(v) => onSave(TCS_SETTING_KEYS.rate, v)} />
              <NumberSetting label="Rate with no PAN" unit="%" step="0.01" value={settings.tcsRateNoPan} allowZero={false}
                onSave={(v) => onSave(TCS_SETTING_KEYS.rateNoPan, v)} />
            </div>
            <p className="text-xs text-muted-foreground border-t pt-2">
              A buyer already at {formatINR(settings.tcsThreshold)} this year pays {formatINR(1000000)} more →
              TCS <strong className="text-amber-700 dark:text-amber-400">{formatINR(withPan.tcsAmount)}</strong> with a PAN,
              <strong className="text-amber-700 dark:text-amber-400"> {formatINR(noPan.tcsAmount)}</strong> without one.
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Nothing is collected. Bills are unaffected.</p>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * DAILY RATES — replaces the old "Today's rates" card, which wrote a Setting row (key 'gold22' /
 * 'gold24' / 'silver') that NOTHING ever read back: not the dashboard, not the rate ticker, not a
 * bill. It also hardcoded 22K gold as the only settable rate. This reads and writes the real
 * GoldRate table every other screen in the app already reads (app-shell.tsx ticker, invoice rate
 * bar, dashboard), so a rate entered here is a rate the shop actually sees.
 *
 * Shape kept from oMunim: one table, every metal/purity a firm has ever priced, an inline "new
 * rate" box on each row so a whole day's rates go in and SAVE ALL submits them together, per-row
 * delete, and history (rateDate) instead of only the latest row. Deliberately NOT kept: colour,
 * comment, LED rates, rate-id, DELETE ALL, and a "pull live rate" action — GET /api/gold-rate's
 * `live` figure is a sine-wave placeholder with no real MCX feed behind it (see the route), and
 * wiring a manager's real daily rate to synthetic noise is worse than the button it would replace.
 */
function DailyRatesCard({ firmId, isManager }: { firmId: string; isManager: boolean | undefined }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['gold-rate', firmId],
    queryFn: () => api<{ rates: GoldRateRow[] }>('/api/gold-rate', { search: { firmId } }),
    enabled: !!firmId,
  })
  const rates = data?.rates || []

  // GET already orders newest-first, so the first row seen per metal+purity+unit is the current one.
  const seen = new Set<string>()
  const current: GoldRateRow[] = []
  const older: GoldRateRow[] = []
  for (const r of rates) {
    const k = `${r.metal}|${r.purity}|${r.unit}`
    if (seen.has(k)) older.push(r)
    else { seen.add(k); current.push(r) }
  }

  type PendingRate = { id: string; purity: string; unit: GoldRateUnit }
  const [newRates, setNewRates] = useState<Record<string, string>>({})
  // Rows whose New rate was filled from the 24K row (amber) vs typed by hand (never overwritten).
  const [derived, setDerived] = useState<Set<string>>(new Set())
  const [manual, setManual] = useState<Set<string>>(new Set())
  // Proposals the owner has dismissed with the bin — remembered so they do not come straight back.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const pureRow = current.find((r) => r.metal === 'gold' && r.purity.trim().toUpperCase() === '24K')

  /**
   * The karats a shop board carries by default.
   *
   * These are DERIVED DURING RENDER from whatever 24K rate is in force — the New rate box if he has
   * typed one, otherwise the rate already saved on the board. Two earlier versions got this wrong in
   * turn: the first only filled karats the firm already had a row for, so a board holding nothing
   * but 24K did nothing at all; the second added the rows but only once he re-typed a rate he had
   * already saved. He should not have to re-enter ₹1,50,000 to be shown what 22K is worth.
   *
   * Derived state, not stored state: there is no effect writing these into `newRates`, so they
   * cannot drift from the 24K row they came from, and the render-time form rule is respected.
   */
  const STANDARD_KARATS = ['22K', '18K', '14K']
  const base24 = Number(newRates[pureRow?.id ?? '']) || pureRow?.rate || 0
  const haveKarats = new Set(current.filter((o) => o.metal === 'gold').map((o) => o.purity.trim().toUpperCase()))
  const pending: PendingRate[] = base24 > 0 && pureRow
    ? STANDARD_KARATS
        .filter((k) => !haveKarats.has(k) && !dismissed.has(`new:${k}`) && deriveKaratRate(base24, k) !== null)
        .map((k) => ({ id: `new:${k}`, purity: k, unit: pureRow.unit as GoldRateUnit }))
    : []
  /** What a proposed row shows: his own figure once he edits it, else the live derivation. */
  const pendingValue = (p: PendingRate) =>
    manual.has(p.id) ? (newRates[p.id] ?? '') : String(deriveKaratRate(base24, p.purity) ?? '')

  function setNew(r: GoldRateRow, v: string) {
    if (r.id !== pureRow?.id) {
      setNewRates((m) => ({ ...m, [r.id]: v }))
      setManual((s) => new Set(s).add(r.id)); setDerived((s) => { const n = new Set(s); n.delete(r.id); return n })
      return
    }
    const next: Record<string, string> = { ...newRates, [r.id]: v }
    const d = new Set(derived)

    // Existing gold rows quoted the same way.
    for (const o of current) {
      if (o.metal !== 'gold' || o.unit !== r.unit || manual.has(o.id)) continue
      const x = deriveKaratRate(Number(v), o.purity)
      if (x === null) { if (d.delete(o.id)) delete next[o.id]; continue }
      next[o.id] = String(x); d.add(o.id)
    }

    // Karats the board does not carry are handled by `pending` above — derived during render from
    // this same figure, so nothing to push here.
    setNewRates(next); setDerived(d)
  }
  const [saving, setSaving] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({ metal: 'gold', purity: '', unit: 'per_10_gram' as GoldRateUnit, rate: '' })
  const [adding, setAdding] = useState(false)

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['gold-rate', firmId] })
  }

  async function saveAll() {
    const edits = current.filter((r) => Number(newRates[r.id]) > 0)
    // Proposed karat rows are created by the same POST — /api/gold-rate writes a new dated row
    // whether or not that purity existed before, so one path saves both.
    const adds = pending.filter((p) => Number(pendingValue(p)) > 0)
    if (!edits.length && !adds.length) return toast.error('Enter at least one new rate first')
    setSaving(true)
    try {
      await Promise.all([
        ...edits.map((r) => api('/api/gold-rate', {
          method: 'POST',
          body: { firmId, metal: r.metal, purity: r.purity, unit: r.unit, rate: Number(newRates[r.id]) },
        })),
        ...adds.map((p) => api('/api/gold-rate', {
          method: 'POST',
          body: { firmId, metal: 'gold', purity: p.purity, unit: p.unit, rate: Number(pendingValue(p)) },
        })),
      ])
      const n = edits.length + adds.length
      toast.success(`Updated ${n} rate${n > 1 ? 's' : ''}${adds.length ? ` (${adds.length} added)` : ''}`)
      setNewRates({}); setDerived(new Set()); setManual(new Set()); setDismissed(new Set())
      invalidate()
    } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
  }

  async function addRate() {
    const rate = Number(addForm.rate)
    if (!addForm.purity.trim()) return toast.error('Purity / karat is required')
    if (!rate || rate <= 0) return toast.error('Enter a valid rate')
    setAdding(true)
    try {
      await api('/api/gold-rate', {
        method: 'POST',
        body: { firmId, metal: addForm.metal, purity: addForm.purity.trim(), unit: addForm.unit, rate },
      })
      toast.success('Rate added')
      setAddForm({ metal: 'gold', purity: '', unit: 'per_10_gram', rate: '' })
      setAddOpen(false)
      invalidate()
    } catch (e: any) { toast.error(e.message) } finally { setAdding(false) }
  }

  async function del(r: GoldRateRow) {
    if (!confirm(`Delete ${r.metal} ${r.purity} — ₹${r.rate}?`)) return
    try {
      await api('/api/gold-rate', { method: 'DELETE', search: { id: r.id, firmId } })
      toast.success('Rate deleted')
      invalidate()
    } catch (e: any) { toast.error(e.message) }
  }

  return (
    <Card id="daily-rates" className="lg:col-span-2">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base flex items-center gap-2"><Coins className="size-4 text-amber-600" /> Daily Rates <span className="text-xs font-normal text-muted-foreground">आज का भाव</span></CardTitle>
        <div className="flex items-center gap-2">
          {older.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setShowHistory((v) => !v)}>
              <History className="size-3.5" /> {showHistory ? 'Hide' : 'Show'} history ({older.length})
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={isManager === false} title={isManager === false ? MANAGER_ONLY_TITLE : undefined} onClick={() => setAddOpen((v) => !v)}>
            <Plus className="size-3.5" /> Add rate
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isManager === false && <p className="text-xs text-muted-foreground">{MANAGER_ONLY_TITLE}</p>}

        <fieldset disabled={isManager === false} className="contents">
          {addOpen && (
            <div className="flex flex-wrap items-end gap-2 rounded-md border p-3 bg-muted/30">
              <Field label="Metal">
                <Select value={addForm.metal} onValueChange={(v) => setAddForm((f) => ({ ...f, metal: v }))}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="gold">Gold</SelectItem><SelectItem value="silver">Silver</SelectItem></SelectContent>
                </Select>
              </Field>
              <Field label="Purity / karat">
                <Input className="w-28" placeholder="e.g. 18K, 925" value={addForm.purity} onChange={(e) => setAddForm((f) => ({ ...f, purity: e.target.value }))} />
              </Field>
              <Field label="Quoted per">
                <Select value={addForm.unit} onValueChange={(v) => setAddForm((f) => ({ ...f, unit: v as GoldRateUnit }))}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="per_gram">1 gram</SelectItem>
                    <SelectItem value="per_10_gram">10 gram</SelectItem>
                    <SelectItem value="per_kg">1 kg</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Rate (₹)">
                <Input className="w-32" type="number" value={addForm.rate} onChange={(e) => setAddForm((f) => ({ ...f, rate: e.target.value }))} />
              </Field>
              <Button size="sm" className="btn-brand" disabled={adding} onClick={addRate}>{adding ? 'Adding…' : 'Add'}</Button>
              <Button size="sm" variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            </div>
          )}

          {pureRow && <p className="text-xs text-muted-foreground">Type the 24K (pure gold) New rate — other gold karats quoted the same way fill in automatically (amber). Edit any of them to override; it then stops following 24K.</p>}
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : current.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rates entered yet for this firm.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Metal</TableHead>
                    <TableHead>Purity / karat</TableHead>
                    <TableHead>Quoted per</TableHead>
                    <TableHead>Current rate</TableHead>
                    <TableHead>As on</TableHead>
                    <TableHead>New rate</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {current.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="capitalize">{r.metal}</TableCell>
                      <TableCell>{r.purity}</TableCell>
                      <TableCell className="text-muted-foreground">{GOLD_RATE_UNIT_LABEL[r.unit as GoldRateUnit] || r.unit}</TableCell>
                      <TableCell className="font-mono">{formatINR(r.rate)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(r.rateDate).toLocaleDateString('en-IN')}</TableCell>
                      <TableCell>
                        <Input
                          type="number" inputMode="decimal" placeholder="0" onWheel={(e) => e.currentTarget.blur()}
                          aria-label={`New rate for ${r.metal} ${r.purity}`}
                          className={`w-32 text-right tabular-nums ${derived.has(r.id) ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800' : ''}`}
                          title={derived.has(r.id) ? `Derived: 24K rate × ${PURITY_PERCENT[r.purity.trim().toUpperCase()]} / ${PURITY_PERCENT['24K']}. Edit to override.` : undefined}
                          value={newRates[r.id] || ''}
                          onChange={(e) => setNew(r, e.target.value)}
                        />
                        {derived.has(r.id) && <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">auto: 24K × {PURITY_PERCENT[r.purity.trim().toUpperCase()]}/{PURITY_PERCENT['24K']}</p>}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="size-8" onClick={() => del(r)} aria-label={`Delete ${r.metal} ${r.purity} rate`}>
                          <Trash2 className="size-4 text-rose-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Karats the board does not carry yet, proposed by the 24K derivation. They read
                      "—" under Current rate because there is nothing to compare to: this firm has
                      never quoted that karat. Saving creates them. */}
                  {pending.map((p) => (
                    <TableRow key={p.id} className="bg-amber-50/40 dark:bg-amber-950/10">
                      <TableCell className="capitalize">gold</TableCell>
                      <TableCell>{p.purity} <span className="text-[11px] text-amber-700 dark:text-amber-400">new</span></TableCell>
                      <TableCell className="text-muted-foreground">{GOLD_RATE_UNIT_LABEL[p.unit] || p.unit}</TableCell>
                      <TableCell className="text-muted-foreground">—</TableCell>
                      <TableCell className="text-xs text-muted-foreground">—</TableCell>
                      <TableCell>
                        <Input
                          type="number" inputMode="decimal" placeholder="0" onWheel={(e) => e.currentTarget.blur()}
                          aria-label={`New rate for gold ${p.purity}`}
                          className={`w-32 text-right tabular-nums ${manual.has(p.id) ? '' : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800'}`}
                          title={manual.has(p.id) ? undefined : `Derived: 24K rate × ${PURITY_PERCENT[p.purity]} / ${PURITY_PERCENT['24K']}. Edit to override.`}
                          value={pendingValue(p)}
                          onChange={(e) => {
                            setNewRates((m) => ({ ...m, [p.id]: e.target.value }))
                            setManual((x) => new Set(x).add(p.id))
                            setDerived((x) => { const n = new Set(x); n.delete(p.id); return n })
                          }}
                        />
                        {!manual.has(p.id) && <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">auto: 24K × {PURITY_PERCENT[p.purity]}/{PURITY_PERCENT['24K']}</p>}
                      </TableCell>
                      <TableCell>
                        {/* Drop the proposal — it was never saved, so there is nothing to delete. */}
                        <Button variant="ghost" size="icon" className="size-8"
                          onClick={() => setDismissed((xs) => new Set(xs).add(p.id))}
                          aria-label={`Do not add gold ${p.purity}`}>
                          <Trash2 className="size-4 text-rose-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {showHistory && older.map((r) => (
                    <TableRow key={r.id} className="opacity-70">
                      <TableCell className="capitalize">{r.metal}</TableCell>
                      <TableCell>{r.purity}</TableCell>
                      <TableCell className="text-muted-foreground">{GOLD_RATE_UNIT_LABEL[r.unit as GoldRateUnit] || r.unit}</TableCell>
                      <TableCell className="font-mono">{formatINR(r.rate)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(r.rateDate).toLocaleDateString('en-IN')}</TableCell>
                      <TableCell />
                      <TableCell>
                        <Button variant="ghost" size="icon" className="size-8" onClick={() => del(r)} aria-label={`Delete ${r.metal} ${r.purity} rate from ${new Date(r.rateDate).toLocaleDateString('en-IN')}`}>
                          <Trash2 className="size-4 text-rose-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {current.length > 0 && (
            <div className="flex justify-end">
              <Button className="btn-brand" size="sm" disabled={saving} onClick={saveAll}>{saving ? 'Saving…' : 'Save all new rates'}</Button>
            </div>
          )}
        </fieldset>
      </CardContent>
    </Card>
  )
}

/* ───────────────────────── Calculation ─────────────────────────
 * The one settings surface for stock valuation maths. oMunim spreads this
 * across 20+ per-category setup files; here it's five fields because that's
 * all the arithmetic actually needs — see src/lib/stock-calc.ts.
 * Defaults match today's behaviour exactly, so an untouched firm sees no change.
 */
export function CalculationCard({ settings, onSave }: { settings: CalcSettings; onSave: (key: string, value: string) => void }) {
  // Fixed sample numbers so every control shows its effect in plain numbers, not prose.
  const gross = 10.500, less = 0.500 // → net 10.000g
  const net = computeNetWeight(gross, less, 0, 0)
  const purity = 91.6 // 22K
  const wastage = 2
  const metalRate = 65000 // ₹ per the configured unit
  const makingRate = 500 // ₹/gram

  const finalPurity = computeFinalPurity(purity, wastage)
  const fineWeight = computeFineWeight({ gross, net }, finalPurity, settings.wastageBasis)
  const rate = ratePerGram(metalRate, settings.rateUnit)
  // 'finalFine' must be present: WeightBasis gained it with the oMunim option matrix, and
  // `weights[settings.makingBasis]` below would otherwise index undefined and throw on .toFixed
  // the moment a firm picked BY FINAL FINE WT. In this sample the post-wastage figure IS
  // fineWeight, so the two share a value here.
  const weights = { gross, net, fine: fineWeight, finalFine: fineWeight }
  const making = computeMakingCharge('per_gram', makingRate, weights, settings.makingBasis, rate)

  // The metalRateByPurity pairing, worked both ways from ONE pure rate so the two examples below
  // are equal by construction: a 22K rate IS the pure rate × 91.6%, so net × karat rate and
  // fine × pure rate are the same money. 10.000g of 22K: ₹1,37,400 either way.
  const pure24Rate10g = 150000
  const karat22Rate10g = (pure24Rate10g * purity) / 100
  const sampleFine = (net * purity) / 100
  const byPurityMetal = (net * karat22Rate10g) / 10 // rate box holds the 22K rate → net weight
  const byFineMetal = (sampleFine * pure24Rate10g) / 10 // rate box holds the pure rate → fine weight
  const rawTotal = fineWeight * rate + making
  const total = applyRoundOff(rawTotal, settings.roundOff)

  return (
    <Card className="lg:col-span-2">
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Calculator className="size-4 text-amber-600" /> Add Stock options <span className="text-xs font-normal text-muted-foreground">स्टॉक गणना</span></CardTitle>
        <p className="text-xs text-muted-foreground">Defaults the Add Stock form opens with. The per-row &ldquo;By&rdquo; dropdowns there stay editable for a one-off, and changing a setting never touches items already saved.</p>
      </CardHeader>
      <CardContent className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Field label="Making charges calculated on">
            <Select value={settings.makingBasis} onValueChange={(v) => onSave(CALC_SETTING_KEYS.makingBasis, v as WeightBasis)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="net">Net weight</SelectItem><SelectItem value="gross">Gross weight</SelectItem>
                <SelectItem value="fine">Fine weight</SelectItem><SelectItem value="finalFine">Final fine weight</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <p className="text-xs text-muted-foreground">{weights[settings.makingBasis].toFixed(3)}g × ₹{makingRate}/g = {formatINR(making)}</p>
        </div>

        {/* The rest of oMunim's ADD STOCK OPTIONS. Each one is the DEFAULT the Add Stock form opens
            with; the per-row dropdowns there stay editable for the genuine one-off. */}
        <div className="space-y-1.5">
          <Field label="Labour charge calculated on">
            <Select value={settings.labourBasis} onValueChange={(v) => onSave(CALC_SETTING_KEYS.labourBasis, v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="net">Net weight</SelectItem><SelectItem value="gross">Gross weight</SelectItem>
                <SelectItem value="fine">Fine weight</SelectItem><SelectItem value="finalFine">Final fine weight</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <p className="text-xs text-muted-foreground">Shops really do bill making on net and labour on gross — hence two settings.</p>
        </div>

        <div className="space-y-1.5">
          <Field label="Final valuation priced on">
            <Select value={settings.valuationBasis} onValueChange={(v) => onSave(CALC_SETTING_KEYS.valuationBasis, v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {/* No 'Fine weight' here: this reaches the engine's finalFineBy, and 'fine' applies purity
                    twice (10g of 22K priced 8.4% short). stock-calc coerces a stored 'fine' to 'net'. */}
                <SelectItem value="finalFine">Final fine weight</SelectItem>
                <SelectItem value="net">Net weight</SelectItem><SelectItem value="gross">Gross weight</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <p className="text-xs text-muted-foreground">The money lever: metal amount = this weight × rate.</p>
        </div>

        <div className="space-y-1.5">
          <Field label="Fine weight (pre-wastage) shown on">
            <Select value={settings.finalFineBasis} onValueChange={(v) => onSave(CALC_SETTING_KEYS.finalFineBasis, v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="net">Net wt + wastage</SelectItem><SelectItem value="gross">Gross wt + wastage</SelectItem>
                <SelectItem value="fine">Fine wt + wastage</SelectItem><SelectItem value="finalFine">Default</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <p className="text-xs text-muted-foreground">Display only — the FN WT line on the stock form. The priced weight is the setting above.</p>
        </div>

        <div className="space-y-1.5">
          <Field label="Metal rate follows purity">
            <Select value={settings.metalRateByPurity ? 'yes' : 'no'} onValueChange={(v) => onSave(CALC_SETTING_KEYS.metalRateByPurity, v === 'yes' ? 'true' : 'false')}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Yes — 22K item takes the 22K rate, metal on net weight</SelectItem>
                <SelectItem value="no">No — rate box holds the pure 24K rate, metal on fine weight</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {/* Both examples land on the SAME rupee figure, computed from one pure rate so they cannot
              drift apart in the copy. That is the whole point: this switch decides which number the
              shop types into the rate box, not what the customer is charged. */}
          <p className="text-xs text-muted-foreground">
            <span className="block">Yes: {net.toFixed(3)}g of 22K at ₹{karat22Rate10g.toLocaleString('en-IN')}/10g = {formatINR(byPurityMetal)} — net weight × the 22K rate, wastage on top.</span>
            <span className="block">No: {net.toFixed(3)}g of 22K = {sampleFine.toFixed(3)}g fine at ₹{pure24Rate10g.toLocaleString('en-IN')}/10g = {formatINR(byFineMetal)} — fine weight × the pure rate.</span>
            <span className="block text-amber-700 dark:text-amber-400">Same {formatINR(byPurityMetal)} either way — it picks which rate you type, not what you charge. A 22K rate priced on fine weight bills {(100 - purity).toFixed(1)}% short.</span>
          </p>
        </div>

        <div className="space-y-1.5">
          <Field label="GST on hallmark charge">
            <Select value={settings.hallmarkGst ? 'yes' : 'no'} onValueChange={(v) => onSave(CALC_SETTING_KEYS.hallmarkGst, v === 'yes' ? 'true' : 'false')}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="yes">Yes — taxed with the item</SelectItem><SelectItem value="no">No — charged but not taxed</SelectItem></SelectContent>
            </Select>
          </Field>
          <p className="text-xs text-muted-foreground">No still CHARGES it — it only leaves the taxable base.</p>
        </div>

        <div className="space-y-1.5">
          <Field label="Stock managed by">
            <Select value={settings.stockMode} onValueChange={(v) => onSave(CALC_SETTING_KEYS.stockMode, v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="tagging">Tagging — each piece uniquely tagged</SelectItem><SelectItem value="category">Category — quantity per category</SelectItem></SelectContent>
            </Select>
          </Field>
          <p className="text-xs text-muted-foreground">Recorded for downstream screens; the stock form tags either way today.</p>
        </div>

        <div className="space-y-1.5">
          <Field label="Wastage calculated on">
            <Select value={settings.wastageBasis} onValueChange={(v) => onSave(CALC_SETTING_KEYS.wastageBasis, v as WeightBasis)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="net">Net weight</SelectItem><SelectItem value="gross">Gross weight</SelectItem></SelectContent>
            </Select>
          </Field>
          <p className="text-xs text-muted-foreground">Purity {purity}% + wastage {wastage}% = {finalPurity.toFixed(1)}% → fine weight {fineWeight.toFixed(3)}g</p>
        </div>

        <div className="space-y-1.5">
          <Field label="Metal rate quoted per">
            <Select value={settings.rateUnit} onValueChange={(v) => onSave(CALC_SETTING_KEYS.rateUnit, v as RateUnit)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="per_gram">1 gram</SelectItem><SelectItem value="per_10g">10 grams</SelectItem></SelectContent>
            </Select>
          </Field>
          <p className="text-xs text-muted-foreground">₹{metalRate.toLocaleString('en-IN')} per {settings.rateUnit === 'per_10g' ? '10g' : '1g'} = ₹{rate.toFixed(2)}/gram</p>
        </div>

        <div className="space-y-1.5">
          <Field label="Round off total to">
            <Select value={settings.roundOff} onValueChange={(v) => onSave(CALC_SETTING_KEYS.roundOff, v as RoundOff)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">No rounding (paise)</SelectItem><SelectItem value="nearest1">Nearest ₹1</SelectItem><SelectItem value="nearest0.5">Nearest ₹0.50</SelectItem></SelectContent>
            </Select>
          </Field>
          <p className="text-xs text-muted-foreground">{formatINR(rawTotal)} rounds to {formatINR(total)}</p>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Field label="Weight decimal places">
            <Select value={String(settings.weightDecimals)} onValueChange={(v) => onSave(CALC_SETTING_KEYS.weightDecimals, v)}>
              <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="2">2 decimals</SelectItem><SelectItem value="3">3 decimals (trade norm)</SelectItem></SelectContent>
            </Select>
          </Field>
          <p className="text-xs text-muted-foreground">10.4567g stores as {roundWeight(10.4567, settings.weightDecimals).toFixed(settings.weightDecimals)}g</p>
        </div>
      </CardContent>
    </Card>
  )
}

/* ───────────────────── Sell / Purchase / Old metal / Rate cut ─────────────────────
 * Same shape as CalculationCard: each control is a default; the bill's own boxes stay editable.
 * Every value is rendered straight from props — nothing is written on mount.
 */
const S = { gross: 10.5, net: 10, purity: 91.6, wastage: 2, pure: 150000, making: 500 }
const S_FINAL = S.purity + S.wastage // 93.6%
const S_KARAT10G = (S.pure * S.purity) / 100 // 22K rate = pure × 91.6%, so both worked examples are equal money
const S_FINE = (S.net * S.purity) / 100
const S_METAL = (S.net * S_KARAT10G) / 10
const inr10 = (n: number) => `₹${n.toLocaleString('en-IN')}`
const BASIS_LABEL: Record<WeightBasis, string> = { net: 'Net weight', gross: 'Gross weight', fine: 'Fine weight', finalFine: 'Final fine weight' }
const sampleWeight = (b: WeightBasis) => ({ net: S.net, gross: S.gross, fine: S_FINE, finalFine: (S.net * S_FINAL) / 100 })[b]

type CounterSave = (key: string, value: string) => void

/* Metal rate follows purity + metal basis + charge basis: shared by the Sell and Purchase cards.
 * Deliberately NO second "valuation basis" dropdown: the engine derives the metal weight as
 * finalFine × 100 / ratePurityPercent, so it converts to match whichever rate the shop types.
 * A karat rate on fine weight is therefore unrepresentable; adding that dropdown re-opens it. */
function MetalFields({ v, keys, onSave, who }: {
  v: { metalRateByPurity: boolean; metalBasis: 'net' | 'gross'; chargeBasis: WeightBasis }
  keys: { rate: string; basis: string; charge: string }
  onSave: CounterSave
  who: string
}) {
  const chargeW = sampleWeight(v.chargeBasis)
  const metalW = v.metalBasis === 'gross' ? S.gross : S.net
  return (
    <>
      <div className="space-y-1.5">
        <Field label="Metal rate follows purity">
          <Select value={v.metalRateByPurity ? 'yes' : 'no'} onValueChange={(x) => onSave(keys.rate, x === 'yes' ? 'true' : 'false')}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Yes — 22K item takes the 22K rate, metal priced on net weight</SelectItem>
              <SelectItem value="no">No — rate box holds the pure 24K rate, metal priced on fine weight</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <p className="text-xs text-muted-foreground">
          <span className="block">Yes: {S.net.toFixed(3)}g of 22K at {inr10(S_KARAT10G)}/10g = {formatINR(S_METAL)} — net weight × the 22K rate.</span>
          <span className="block">No: {S.net.toFixed(3)}g of 22K = {S_FINE.toFixed(3)}g fine at {inr10(S.pure)}/10g = {formatINR((S_FINE * S.pure) / 10)} — fine weight × the pure rate.</span>
          <span className="block text-amber-700 dark:text-amber-400">Same money either way — it picks which rate you type, not what you charge. A 22K rate priced on fine weight bills {(100 - S.purity).toFixed(1)}% short: {formatINR(S_METAL - (S_METAL * S.purity) / 100)} lost on one 10g {who}, with nothing on the screen telling you.</span>
        </p>
      </div>

      <div className="space-y-1.5">
        <Field label="Wastage & metal priced on">
          <Select value={v.metalBasis} onValueChange={(x) => onSave(keys.basis, x)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="net">Net weight</SelectItem><SelectItem value="gross">Gross weight</SelectItem></SelectContent>
          </Select>
        </Field>
        <p className="text-xs text-muted-foreground">
          <span className="block">Purity {S.purity}% + wastage {S.wastage}% = {S_FINAL.toFixed(1)}% → {metalW.toFixed(3)}g {v.metalBasis} becomes {((metalW * S_FINAL) / 100).toFixed(3)}g fine.</span>
          <span className="block">Gross weight prices the stones and packet at metal rate too — pick it only if that is genuinely how you quote.</span>
        </p>
      </div>

      <div className="space-y-1.5">
        <Field label="Charges calculated on">
          <Select value={v.chargeBasis} onValueChange={(x) => onSave(keys.charge, x)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(BASIS_LABEL) as WeightBasis[]).map((b) => <SelectItem key={b} value={b}>{BASIS_LABEL[b]}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <p className="text-xs text-muted-foreground">{chargeW.toFixed(3)}g × ₹{S.making}/g = {formatINR(chargeW * S.making)}</p>
      </div>
    </>
  )
}

const CardHead = ({ title, hindi, contract }: { title: string; hindi: string; contract: string }) => (
  <CardHeader>
    <CardTitle className="text-base flex items-center gap-2"><Calculator className="size-4 text-amber-600" /> {title} <span className="text-xs font-normal text-muted-foreground">{hindi}</span></CardTitle>
    <p className="text-xs text-muted-foreground">{contract}</p>
  </CardHeader>
)

type CounterCardProps = { settings: CounterCalcSettings; onSave: CounterSave }
const K = COUNTER_CALC_SETTING_KEYS

const REV_BILL = 120000
const REV_AGREED = 100000
const REV_DIFF = REV_BILL - REV_AGREED
const REV_LESS_COLUMN = { discount: 'discount line', making: 'making charge', wastage: 'wastage %', metalRate: 'metal rate' }
const REV_MORE_COLUMN = { making: 'making charge', wastage: 'wastage %', metalRate: 'metal rate' }

export function SellCard({ settings, onSave }: CounterCardProps) {
  const s = settings.sell
  return (
    <Card className="lg:col-span-2">
      <CardHead title="Sell options" hindi="बिक्री गणना" contract="Defaults the Sell form's item entry opens with. The per-row Making/Labour/Other 'By' dropdowns there stay editable for a one-off, and changing a setting never touches an invoice already saved." />
      <CardContent className="grid sm:grid-cols-2 gap-4">
        <MetalFields v={s} keys={{ rate: K.sellMetalRateByPurity, basis: K.sellMetalBasis, charge: K.sellChargeBasis }} onSave={onSave} who="sale" />
        <div className="space-y-1.5">
          <Field label="Making charge opens from">
            <Select value={s.makingSource} onValueChange={(x) => onSave(K.sellMakingSource, x)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="addStock">The item&apos;s own making charge (from Add Stock)</SelectItem>
                <SelectItem value="lastEntry">The last line you keyed on this bill</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <p className="text-xs text-muted-foreground">&lsquo;From Add Stock&rsquo; uses what the piece was tagged with. &lsquo;Last line&rsquo; repeats the charge you just keyed — faster for a tray of similar bangles.</p>
        </div>
        <div className="space-y-1.5">
          <Field label="When the agreed amount is LESS">
            <Select value={s.reverseLess} onValueChange={(x) => onSave(K.sellReverseLess, x)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="discount">Discount line on the bill</SelectItem>
                <SelectItem value="making">Making charges — take it off making</SelectItem>
                <SelectItem value="wastage">Customer wastage — lower the wastage %</SelectItem>
                <SelectItem value="metalRate">Metal rate — lower the rate</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <p className="text-xs text-muted-foreground">
            ₹{REV_BILL.toLocaleString('en-IN')} agreed at ₹{REV_AGREED.toLocaleString('en-IN')} → the <strong className="text-amber-700 dark:text-amber-400">₹{REV_DIFF.toLocaleString('en-IN')}</strong> comes off the {REV_LESS_COLUMN[s.reverseLess]}. It is solved before tax, so GST is charged on what the customer actually pays.
          </p>
          <p className="text-xs text-muted-foreground">Wastage and metal rate are WEIGHT levers — they change the fine weight and therefore the printed weights on the bill, not just the money.</p>
        </div>
        <div className="space-y-1.5">
          <Field label="When the agreed amount is MORE">
            <Select value={s.reverseMore} onValueChange={(x) => onSave(K.sellReverseMore, x)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="making">Making charges — add it to making</SelectItem>
                <SelectItem value="wastage">Customer wastage — raise the wastage %</SelectItem>
                <SelectItem value="metalRate">Metal rate — raise the rate</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <p className="text-xs text-muted-foreground">
            ₹{REV_AGREED.toLocaleString('en-IN')} agreed at ₹{REV_BILL.toLocaleString('en-IN')} → the <strong className="text-amber-700 dark:text-amber-400">₹{REV_DIFF.toLocaleString('en-IN')}</strong> goes onto the {REV_MORE_COLUMN[s.reverseMore]}.
          </p>
          <p className="text-xs text-muted-foreground">No discount option: a negative discount is a false invoice. oMunim&apos;s own &lsquo;amount more&rsquo; list leaves it out for the same reason.</p>
        </div>
        <p className="text-xs text-muted-foreground sm:col-span-2">The &ldquo;make it ₹1,00,000 flat&rdquo; box. Back-solved BEFORE tax so the stated total is exact and GST sits on a real base — never a fudge applied after tax.</p>
      </CardContent>
    </Card>
  )
}

export function PurchaseCard({ settings, onSave }: CounterCardProps) {
  return (
    <Card className="lg:col-span-2">
      <CardHead title="Purchase options" hindi="खरीद गणना" contract="Defaults the Purchase bill opens with. The per-row 'By' dropdowns there stay editable for a one-off, and changing a setting never touches a bill already saved." />
      <CardContent className="grid sm:grid-cols-2 gap-4">
        <MetalFields v={settings.purchase} keys={{ rate: K.purchaseMetalRateByPurity, basis: K.purchaseMetalBasis, charge: K.purchaseChargeBasis }} onSave={onSave} who="purchase" />
        <p className="text-xs text-muted-foreground sm:col-span-2">This is a bill you receive, so the wastage is the supplier&apos;s or karigar&apos;s. Purchase and URD bills both use these.</p>
      </CardContent>
    </Card>
  )
}

export function OldMetalCard({ settings, onSave }: CounterCardProps) {
  const agreed = (S.net * 95000) / 10
  const tunchFine = (S.net * 88) / 100
  const tunch = (tunchFine * 110000) / 10
  return (
    <Card className="lg:col-span-2">
      <CardHead title="Old metal / URD options" hindi="पुराना सोना" contract="How an old-metal row is valued when it is taken in exchange. Changing it never touches an invoice already saved." />
      <CardContent className="grid gap-4">
        <div className="space-y-1.5">
          <Field label="Old metal valued by">
            <Select value={settings.oldMetal.pricing} onValueChange={(x) => onSave(K.oldMetalPricing, x)}>
              <SelectTrigger className="w-full sm:w-96"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="agreedRate">Agreed rate on net weight</SelectItem>
                <SelectItem value="fineAtPureRate">Tunch fine weight at the pure rate</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <p className="text-xs text-muted-foreground">
            <span className="block">Agreed: the rate you quote is for the metal as it came in; tunch is recorded, not priced. {S.net.toFixed(3)}g net at {inr10(95000)}/10g = {formatINR(agreed)}</span>
            <span className="block">Tunch: tunch × net weight, priced at the 24K rate. 88% of {S.net.toFixed(3)}g = {tunchFine.toFixed(3)}g fine at {inr10(110000)}/10g = {formatINR(tunch)}</span>
            <span className="block">Two different ways shops quote, not two answers to one question — the rate you type means something different in each. oMunim computes tunch then ignores it, pricing 22K and 24K alike; here it is your choice and it is stated.</span>
            <span className="block">A row with no tunch entered falls back to net × rate, never ₹0.</span>
            <span className="block">Stone and alloy rows are always the flat agreed value — they have no metal rate to apply.</span>
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

export function RateCutCard({ settings, onSave }: CounterCardProps) {
  const r = settings.rateCut
  const w = r.basis === 'gross' ? S.gross : S.net
  return (
    <Card className="lg:col-span-2">
      <CardHead title="Rate cut / No rate cut" hindi="भाव कट" contract="Defaults for the Old Metal Exchange rate cut on a new bill. The bill's own rate-cut box stays editable, and changing this never touches an invoice already saved." />
      <CardContent className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Field label="A new bill opens with">
            <Select value={r.defaultMode} onValueChange={(x) => onSave(K.rateCutDefaultMode, x)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No rate cut</SelectItem>
                <SelectItem value="per10g">Rate cut per 10 grams</SelectItem>
                <SelectItem value="amount">Flat rupee cut</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <p className="text-xs text-muted-foreground">&lsquo;No rate cut&rsquo; is today&apos;s behaviour. Pick one of the others if you negotiate a cut on most exchanges.</p>
        </div>
        <div className="space-y-1.5">
          <Field label="A per-10g cut applies to">
            <Select value={r.basis} onValueChange={(x) => onSave(K.rateCutBasis, x)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="net">Net weight</SelectItem><SelectItem value="gross">Gross weight</SelectItem></SelectContent>
            </Select>
          </Field>
          <p className="text-xs text-muted-foreground">
            <span className="block">₹200/10g cut on {w.toFixed(3)}g {r.basis} = {formatINR((w * 200) / 10)} off the total.</span>
            <span className="block">Net is the metal you are actually buying. Gross also cuts on stone and packet weight.</span>
          </p>
        </div>
        <p className="text-xs text-muted-foreground sm:col-span-2">A per-10g cut is offered only when every old-metal row is gold — on a mixed gold + silver + stone exchange &lsquo;per 10 grams of what?&rsquo; has no honest answer, so the flat rupee cut is the way. That is already how the bill behaves.</p>
      </CardContent>
    </Card>
  )
}

/* ───────────────────────── Staff & User Management ───────────────────────── */
function StaffMgmtCard({ firmId }: { firmId: string }) {
  const qc = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [permStaff, setPermStaff] = useState<Staff | null>(null)
  const [resetStaff, setResetStaff] = useState<Staff | null>(null)
  const { isOwner } = useFirmRole()

  const { data } = useQuery({
    queryKey: ['staff', firmId],
    queryFn: () => api<{ staff: Staff[] }>('/api/staff', { search: { firmId } }),
    enabled: !!firmId,
  })
  const staff = data?.staff || []

  async function toggleActive(s: Staff, active: boolean) {
    await api('/api/staff', { method: 'PUT', body: { id: s.id, active } })
    toast.success(active ? 'Staff activated' : 'Staff deactivated')
    qc.invalidateQueries({ queryKey: ['staff'] })
  }

  const roleTone = (role: string) =>
    role === 'owner' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
    : role === 'manager' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
    : 'bg-muted text-muted-foreground'

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2"><Users className="size-4 text-amber-600" /> Staff & User Management</CardTitle>
        <Button size="sm" className="btn-brand" onClick={() => setAddOpen(true)}><Plus className="size-3.5" /> Add Staff</Button>
      </CardHeader>
      <CardContent>
        <div className="max-h-64 overflow-y-auto nice-scroll rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Login ID</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead className="w-10"><span className="sr-only">Password</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">No staff yet</TableCell></TableRow>
              )}
              {staff.map((s) => {
                const permSet = s.permissions ? s.permissions.split(',').map((p) => p.trim()).filter(Boolean) : null
                const summary = !permSet ? 'All access' : permSet.length === 0 ? 'None' : `${permSet.length} views`
                return (
                  <TableRow key={s.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setPermStaff(s)}>
                    <TableCell>
                      <p className="font-medium">{s.name}</p>
                      {s.email && <p className="text-xs text-muted-foreground">{s.email}</p>}
                    </TableCell>
                    <TableCell><span className="font-mono text-xs text-amber-600">{s.loginId}</span></TableCell>
                    <TableCell><span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize ${roleTone(s.role)}`}>{s.role}</span></TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Switch checked={s.active} onCheckedChange={(v) => toggleActive(s, v)} />
                    </TableCell>
                    <TableCell>
                      <button className="text-xs text-amber-700 dark:text-amber-400 hover:underline">{summary}</button>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {/* Owners reset staff and managers; another owner's password is theirs alone (the server enforces this too). */}
                      {s.firmRole !== 'owner' && s.firmRole !== 'admin' && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          disabled={!isOwner}
                          title={isOwner ? `Reset password for ${s.name}` : OWNER_ONLY_TITLE}
                          aria-label={`Reset password for ${s.name}`}
                          onClick={() => setResetStaff(s)}
                        >
                          <KeyRound className="size-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <AddStaffDialog open={addOpen} onOpenChange={setAddOpen} firmId={firmId} />
      {permStaff && <PermissionsDialog key={permStaff.id} staff={permStaff} onClose={() => setPermStaff(null)} />}
      <ResetPasswordDialog staff={resetStaff} firmId={firmId} onClose={() => setResetStaff(null)} />
    </Card>
  )
}

/** Owner sets a new password for a staff member — PATCH /api/staff. */
function ResetPasswordDialog({ staff, firmId, onClose }: { staff: Staff | null; firmId: string; onClose: () => void }) {
  const open = !!staff
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  // Reset the form during render when the dialog opens — never via useEffect.
  const [prevOpen, setPrevOpen] = useState(open)
  if (prevOpen !== open) {
    setPrevOpen(open)
    if (open) { setPw(''); setConfirm('') }
  }

  const mismatch = confirm.length > 0 && pw !== confirm
  async function save() {
    if (!staff) return
    if (pw.length < 8) return toast.error('Password must be at least 8 characters')
    if (pw !== confirm) return toast.error('Passwords do not match')
    setSaving(true)
    try {
      await api('/api/staff', { method: 'PATCH', body: { id: staff.id, firmId, newPassword: pw } })
      toast.success(`Password reset for ${staff.name}`)
      onClose()
    } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Reset password{staff ? ` — ${staff.name}` : ''}</DialogTitle>
          {staff && <p className="text-xs text-muted-foreground">Login: <span className="font-mono text-amber-600">{staff.loginId}</span>. Tell them the new password in person.</p>}
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save() }}>
          <Field label="New password *"><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus /></Field>
          <Field label="Confirm new password *"><Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={mismatch || undefined} /></Field>
          {mismatch && <p className="text-xs text-destructive">Passwords do not match</p>}
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !pw || !confirm} className="btn-brand">{saving ? 'Saving…' : 'Reset password'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AddStaffDialog({ open, onOpenChange, firmId }: { open: boolean; onOpenChange: (v: boolean) => void; firmId: string }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const f = form || {}
  const set = (k: string, v: any) => setForm({ ...form, [k]: v })

  async function save() {
    if (!f.name || !f.loginId || !f.password) return toast.error('Name, Login ID and Password are required')
    setSaving(true)
    try {
      await api('/api/staff', { method: 'POST', body: { firmId, name: f.name, loginId: f.loginId, email: f.email, phone: f.phone, password: f.password, role: f.role || 'staff' } })
      toast.success('Staff added')
      onOpenChange(false)
      setForm({})
      qc.invalidateQueries({ queryKey: ['staff'] })
    } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>Add Staff Member</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Full Name *"><Input value={f.name || ''} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Login ID *"><Input value={f.loginId || ''} onChange={(e) => set('loginId', e.target.value)} /></Field>
          <Field label="Email"><Input type="email" value={f.email || ''} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Phone"><Input value={f.phone || ''} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Password *"><Input type="password" value={f.password || ''} onChange={(e) => set('password', e.target.value)} /></Field>
          <Field label="Role"><Select value={f.role || 'staff'} onValueChange={(v) => set('role', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manager">Manager</SelectItem><SelectItem value="staff">Staff</SelectItem></SelectContent></Select></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="btn-brand">{saving ? 'Adding…' : 'Add Staff'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PermissionsDialog({ staff, onClose }: { staff: Staff; onClose: () => void }) {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<string[]>(() => staff.permissions ? staff.permissions.split(',').map((p) => p.trim()).filter(Boolean) : [])
  const [permText, setPermText] = useState(staff.permissions || '')

  function togglePerm(perm: string) {
    const next = selected.includes(perm) ? selected.filter((p) => p !== perm) : [...selected, perm]
    setSelected(next)
    setPermText(next.join(', '))
  }

  async function save() {
    if (!staff) return
    await api('/api/staff', { method: 'PUT', body: { id: staff.id, permissions: permText } })
    toast.success('Permissions updated')
    qc.invalidateQueries({ queryKey: ['staff'] })
    onClose()
  }

  if (!staff) return null
  return (
    <Dialog open={!!staff} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Permissions — {staff.name}</DialogTitle>
          <p className="text-xs text-muted-foreground">Login: <span className="font-mono text-amber-600">{staff.loginId}</span> · Role: <span className="capitalize">{staff.role}</span></p>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border p-3 bg-amber-50/50 dark:bg-amber-950/20">
            <p className="text-xs text-muted-foreground mb-2">Quick toggle by group</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {PERMISSION_GROUPS.map((g) => (
                <div key={g.key} className="space-y-1.5">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">{g.label}</p>
                  <div className="flex flex-wrap gap-1">
                    {g.perms.map((p) => (
                      <button key={p} type="button" onClick={() => togglePerm(p)} className={`text-[10px] px-2 py-0.5 rounded-full border ${selected.includes(p) ? 'bg-amber-500 text-white border-amber-500' : 'bg-transparent text-muted-foreground border-border'}`}>{p}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <Field label="Permissions CSV (empty = all access)"><Input value={permText} onChange={(e) => setPermText(e.target.value)} placeholder="e.g. dashboard,stock,sell,customers" /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} className="btn-brand">Save Permissions</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ───────────────────────── Payment Gateways ───────────────────────── */
/**
 * Gateway credentials, write-only.
 *
 * This card used to seed its six boxes from `firm.razorpayKeyId` and friends. Those keys stopped
 * arriving when GET /api/firms started omitting them, so every box rendered empty with no way to
 * tell "nothing saved" from "saved, not shown" — and pressing Save posted six blanks. Nothing was
 * ever wiped (the route treats a blank credential as "unchanged"), but the owner could not see
 * that, so the screen read as if the shop had no gateway configured at all.
 *
 * Now: always blank, a Saved / Not set badge off the route's booleans, and blanks stripped before
 * the PUT so the request says what it means.
 */
function PaymentGatewaysCard({ firm, onSave }: { firm?: Firm; onSave: (f: Partial<Firm>) => Promise<void> }) {
  const [saving, setSaving] = useState(false)
  const [entry, setEntry] = useState<Record<string, string>>({})
  const set = (k: string, v: string) => setEntry((p) => ({ ...p, [k]: v }))

  // Cleared when the active firm changes — during render, never in an effect: a half-typed key for
  // one firm must not be sitting in the boxes when another firm's card paints.
  const [prevFirm, setPrevFirm] = useState(firm)
  if (firm !== prevFirm) { setPrevFirm(firm); setEntry({}) }

  const cred = firm?.credentialsSet || {}

  async function save() {
    const body = Object.fromEntries(Object.entries(entry).filter(([, v]) => v.trim() !== ''))
    if (!Object.keys(body).length) { toast.info('Nothing to save — type a credential to replace it'); return }
    setSaving(true)
    try {
      await onSave(body as Partial<Firm>)
      setEntry({})
    } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><CreditCard className="size-4 text-amber-600" /> Payment Gateways</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          A saved credential is never sent back to this screen — it would sit in every counter
          machine&rsquo;s cache. Leave a box blank to keep what is stored; type in it to replace.
        </p>
        <GatewaySection title="Razorpay" accent="amber">
          <CredField label="Key ID" saved={!!cred.razorpayId} value={entry.razorpayKeyId || ''} onChange={(v) => set('razorpayKeyId', v)} />
          <CredField label="Key Secret" secret saved={!!cred.razorpaySecret} value={entry.razorpayKeySecret || ''} onChange={(v) => set('razorpayKeySecret', v)} />
        </GatewaySection>
        <GatewaySection title="Paytm" accent="emerald">
          <CredField label="Merchant ID" saved={!!cred.paytmId} value={entry.paytmMerchantId || ''} onChange={(v) => set('paytmMerchantId', v)} />
          <CredField label="Merchant Key" secret saved={!!cred.paytmKey} value={entry.paytmMerchantKey || ''} onChange={(v) => set('paytmMerchantKey', v)} />
        </GatewaySection>
        <GatewaySection title="PhonePe" accent="violet">
          <CredField label="Merchant ID" saved={!!cred.phonepeId} value={entry.phonepeMerchantId || ''} onChange={(v) => set('phonepeMerchantId', v)} />
          <CredField label="Salt Key" secret saved={!!cred.phonepeSalt} value={entry.phonepeSaltKey || ''} onChange={(v) => set('phonepeSaltKey', v)} />
        </GatewaySection>
        <Button onClick={save} disabled={saving} className="w-full btn-brand"><Save className="size-3.5 mr-1" /> Save Gateways</Button>
      </CardContent>
    </Card>
  )
}

function GatewaySection({ title, accent, children }: { title: string; accent: 'amber' | 'emerald' | 'violet'; children: React.ReactNode }) {
  const dot = { amber: 'bg-amber-500', emerald: 'bg-emerald-500', violet: 'bg-violet-500' }[accent]
  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-xs font-semibold flex items-center gap-1.5"><span className={`size-2 rounded-full ${dot}`} /> {title}</p>
      <div className="grid sm:grid-cols-2 gap-2">{children}</div>
    </div>
  )
}

/* ───────────────────────── Weighing Scale ───────────────────────── */
function WeighingScaleCard({ firm, onSave }: { firm?: Firm; onSave: (f: Partial<Firm>) => Promise<void> }) {
  const [port, setPort] = useState('')
  const [baud, setBaud] = useState('9600')
  const [saving, setSaving] = useState(false)

  const [prevFirm, setPrevFirm] = useState(firm)
  if (firm !== prevFirm) {
    setPrevFirm(firm)
    if (firm) {
      setPort(firm.weighingScalePort || '')
      setBaud(String(firm.weighingScaleBaud || 9600))
    }
  }

  async function save() {
    setSaving(true)
    try {
      await onSave({ weighingScalePort: port, weighingScaleBaud: Number(baud) })
    } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Scale className="size-4 text-amber-600" /> Weighing Scale Integration</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Serial Port"><Input value={port} onChange={(e) => setPort(e.target.value)} placeholder="COM3 / /dev/ttyUSB0" /></Field>
          <Field label="Baud Rate"><Select value={baud} onValueChange={setBaud}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{['9600', '19200', '38400', '57600', '115200'].map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent></Select></Field>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => toast.info(`Scale detected on ${port || '(no port)'} @ ${baud} baud (demo)`)}>Test Connection</Button>
          <Button onClick={save} disabled={saving} className="flex-1 btn-brand"><Save className="size-3.5 mr-1" /> Save</Button>
        </div>
        <p className="text-xs text-muted-foreground">Connects to a serial weighing scale to auto-capture gross weight during stock entry.</p>
      </CardContent>
    </Card>
  )
}

/* ───────────────────────── Biometric & Security ───────────────────────── */
function BiometricSecurityCard({ firm, onSave }: { firm?: Firm; onSave: (f: Partial<Firm>) => Promise<void> }) {
  async function toggle(field: 'biometricEnabled' | 'eInvoiceEnabled' | 'whatsappEnabled', val: boolean) {
    try { await onSave({ [field]: val } as Partial<Firm>) } catch (e: any) { toast.error(e.message) }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Fingerprint className="size-4 text-amber-600" /> Biometric & Security</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div><Label>Biometric Login</Label><p className="text-xs text-muted-foreground">Fingerprint scanner for staff login</p></div>
          <Switch checked={!!firm?.biometricEnabled} onCheckedChange={(v) => toggle('biometricEnabled', v)} />
        </div>
        <div className="flex items-center justify-between">
          <div><Label>GST E-Invoicing</Label><p className="text-xs text-muted-foreground">Generate IRN/QR for B2B invoices</p></div>
          <Switch checked={!!firm?.eInvoiceEnabled} onCheckedChange={(v) => toggle('eInvoiceEnabled', v)} />
        </div>
        <div className="flex items-center justify-between">
          <div><Label>WhatsApp Sharing</Label><p className="text-xs text-muted-foreground">Send invoices/receipts on WhatsApp</p></div>
          <Switch checked={!!firm?.whatsappEnabled} onCheckedChange={(v) => toggle('whatsappEnabled', v)} />
        </div>
        <p className="text-xs text-muted-foreground">Requires a USB fingerprint scanner (e.g. SecuGen RDService) installed on this terminal.</p>
      </CardContent>
    </Card>
  )
}

/* ───────────────────────── Loyalty Program ───────────────────────── */
function LoyaltyCard({ firm, onSave }: { firm?: Firm; onSave: (f: Partial<Firm>) => Promise<void> }) {
  const [rate, setRate] = useState('1')
  const [saving, setSaving] = useState(false)

  const [prevFirm, setPrevFirm] = useState(firm)
  if (firm !== prevFirm) {
    setPrevFirm(firm)
    if (firm) setRate(String(firm.loyaltyRate ?? 1))
  }

  async function save() {
    setSaving(true)
    try { await onSave({ loyaltyRate: Number(rate) || 0 }) } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
  }

  const examplePoints = Math.floor((10000 / 100) * (Number(rate) || 0))

  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Star className="size-4 text-amber-600" /> Loyalty Program</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Field label="Points earned per ₹100 spent">
          <div className="flex gap-2">
            <Input type="number" step="0.1" value={rate} onChange={(e) => setRate(e.target.value)} />
            <Button onClick={save} disabled={saving} className="btn-brand"><Save className="size-3.5" /></Button>
          </div>
        </Field>
        <div className="rounded-md border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-xs text-amber-800 dark:text-amber-300">
          <div className="flex items-center gap-1.5 mb-1"><KeyRound className="size-3.5" /> Example</div>
          At <strong>{Number(rate) || 0}</strong> rate, a ₹10,000 invoice earns <strong>{examplePoints} points</strong> (₹{examplePoints} redeemable).
        </div>
      </CardContent>
    </Card>
  )
}
