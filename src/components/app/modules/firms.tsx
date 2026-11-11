'use client'
import { useId, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader, EmptyState, Field, ToneBadge } from '../shared'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api } from '@/lib/api-client'
import { useApp } from '@/store/app'
import { INDIAN_STATES, COUNTRIES } from '@/lib/constants'
import { toast } from 'sonner'
import { Plus, Building2, MapPin, Phone, Mail, FileText, Check, Coins, ChevronDown, Settings2, X } from 'lucide-react'
import { MANAGER_ONLY_TITLE, OWNER_ONLY_TITLE } from './use-firm-role'
import { LOAN_LICENSE_KEY } from '../print/loan-docs-config'
import { downscaleImage } from '@/lib/image'

/** Mirrors src/app/api/_authz.ts MANAGER_ROLES. Gated per-row here off `f.role` (GET /api/firms
 * already returns UserFirm.role per firm) rather than the active-firm hook, because this screen
 * lists every firm the user belongs to and a role can differ firm to firm. */
const MANAGER_ROLES = new Set(['owner', 'admin', 'manager'])

export function FirmsModule() {
  const { setActiveFirm, activeFirmId, setView } = useApp()
  const [showForm, setShowForm] = useState(false)
  const [editFirm, setEditFirm] = useState<FirmRow | null>(null)
  const { data } = useQuery({ queryKey: ['firms'], queryFn: () => api<{ firms: any[] }>('/api/firms') })
  const firms = data?.firms || []

  // Rates used to be entered here, hardcoded to 22K gold — the only way to set a rate at all, and
  // the only one of gold/silver/18K/24K/etc. a shop could ever record. The Daily Rates panel in
  // Setup replaced it (many rates, one screen, history, per-row delete); this button just gets the
  // right firm active and takes the operator there.
  function goToRates(firmId: string) {
    setActiveFirm(firmId)
    setView('settings')
  }

  return (
    <div>
      <PageHeader title="Firms" hindi="फर्म" desc="Manage your jewellery businesses" actions={<Button className="btn-brand" onClick={() => setShowForm(true)}><Plus className="size-4" /> Add Firm</Button>} />
      {firms.length === 0 ? <div className="rounded-xl border"><EmptyState icon={Building2} title="No firms" desc="Add your first firm" /></div> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {firms.map((f) => (
            <Card key={f.id} className={`overflow-hidden ${f.id === activeFirmId ? 'ring-2 ring-amber-400' : ''}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="size-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-700 grid place-items-center text-white font-bold text-lg">{f.code.slice(0, 2)}</div>
                  {f.id === activeFirmId && <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium"><Check className="size-3.5" /> Active</span>}
                </div>
                <p className="font-bold text-lg">{f.name}</p>
                {f.legalName && <p className="text-xs text-muted-foreground">{f.legalName}</p>}
                <div className="mt-3 space-y-1.5 text-sm">
                  {f.gstin && <p className="flex items-center gap-2 text-xs"><FileText className="size-3.5 text-muted-foreground" /> GSTIN: {f.gstin}</p>}
                  {f.phone && <p className="flex items-center gap-2 text-xs"><Phone className="size-3.5 text-muted-foreground" /> {f.phone}</p>}
                  {f.email && <p className="flex items-center gap-2 text-xs"><Mail className="size-3.5 text-muted-foreground" /> {f.email}</p>}
                  {(f.city || f.state) && <p className="flex items-center gap-2 text-xs"><MapPin className="size-3.5 text-muted-foreground" /> {[f.address, f.city, f.state].filter(Boolean).join(', ')}</p>}
                </div>
                <div className="mt-4 flex gap-2">
                  {f.id !== activeFirmId && <Button variant="outline" size="sm" className="flex-1" onClick={() => setActiveFirm(f.id)}>Switch To</Button>}
                  <Button
                    variant="ghost" size="sm" disabled={!MANAGER_ROLES.has(f.role)}
                    title={MANAGER_ROLES.has(f.role) ? undefined : MANAGER_ONLY_TITLE}
                    onClick={() => goToRates(f.id)}
                  ><Coins className="size-3.5" /> Daily Rates</Button>
                  {/* Owner-only, gated off THIS firm's UserFirm.role — the same line PUT /api/firms
                      enforces server-side via requireFirmRole(OWNER_ROLES). The button being hidden
                      is a convenience; the 403 is the control. */}
                  <Button
                    variant="ghost" size="sm" disabled={!OWNER_ROLES.has(f.role)}
                    title={OWNER_ROLES.has(f.role) ? `Firm setup — ${f.code}` : OWNER_ONLY_TITLE}
                    aria-label={`Edit firm details for ${f.name}`}
                    onClick={() => setEditFirm(f as FirmRow)}
                  ><Settings2 className="size-3.5" /> Firm details / Edit</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <FirmForm open={showForm} onOpenChange={setShowForm} />
      <EditFirmDialog firm={editFirm} onClose={() => setEditFirm(null)} />
    </div>
  )
}

function FirmForm({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const qc = useQueryClient()
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setForm({ state: 'Madhya Pradesh', country: 'India', cgstRate: 1.5, sgstRate: 1.5, igstRate: 3.0 })
  }
  async function save() {
    if (!form.code || !form.name) return toast.error('Code and name required')
    setSaving(true)
    try {
      await api('/api/firms', { method: 'POST', body: form })
      toast.success('Firm created'); onOpenChange(false)
      qc.invalidateQueries({ queryKey: ['firms'] })
    } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
  }
  const set = (k: string, v: any) => setForm({ ...form, [k]: v })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent size="lg">
      <DialogHeader><DialogTitle>Add New Firm</DialogTitle></DialogHeader>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Firm Code *"><Input value={form.code || ''} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="JBS" /></Field>
        <Field label="Firm Name *"><Input value={form.name || ''} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Legal Name"><Input value={form.legalName || ''} onChange={(e) => set('legalName', e.target.value)} /></Field>
        <Field label="GSTIN"><Input value={form.gstin || ''} onChange={(e) => set('gstin', e.target.value)} /></Field>
        <Field label="PAN"><Input value={form.pan || ''} onChange={(e) => set('pan', e.target.value)} /></Field>
        <Field label="Phone"><Input value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Email"><Input value={form.email || ''} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="State"><Select value={form.state} onValueChange={(v) => set('state', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{INDIAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="City"><Input value={form.city || ''} onChange={(e) => set('city', e.target.value)} /></Field>
        <Field label="Pincode"><Input value={form.pincode || ''} onChange={(e) => set('pincode', e.target.value)} /></Field>
        <Field label="CGST %"><Input type="number" step="0.1" value={form.cgstRate} onChange={(e) => set('cgstRate', Number(e.target.value))} /></Field>
        <Field label="SGST %"><Input type="number" step="0.1" value={form.sgstRate} onChange={(e) => set('sgstRate', Number(e.target.value))} /></Field>
      </div>
      <Field label="Address"><Input value={form.address || ''} onChange={(e) => set('address', e.target.value)} /></Field>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button onClick={save} disabled={saving} className="btn-brand">{saving ? 'Saving…' : 'Create Firm'}</Button>
      </DialogFooter>
    </DialogContent></Dialog>
  )
}

/* ═══════════════════════════ Edit firm ═══════════════════════════
 *
 * Everything on the Firm row that had no screen. It was all stored, all read by the app, and none
 * of it reachable: an owner could set the GST rates once at creation and never again, and the
 * invoice layout panel's "add a logo in Setup › Firms" pointed at a form that had no logo field.
 *
 * Why this dialog and not thirty inputs
 * ────────────────────────────────────
 * What a shop opens this for is almost always ONE thing — a new GSTIN, this year's IGST, a logo
 * before a print run. So the identity block is open and everything else is a closed <details>
 * (native, no accordion component, keyboard- and find-in-page-friendly by default). Creating a
 * firm still asks for the short list in FirmForm; this is where the rest lives.
 *
 * What is deliberately NOT here
 * ────────────────────────────
 * `Firm.active`, `Firm.currency` and `Firm.hallmarking` are columns with no reader anywhere in the
 * app (grep: only the schema and the PUT whitelist). A toggle that visibly does nothing is worse
 * than no toggle — it reads as "hallmarking is off" to an owner and changes not one document.
 * They stay writable through the API for whoever wires them up.
 */

const OWNER_ROLES = new Set(['owner', 'admin'])

/** Mirrors LOGO_MAX_CHARS / LOGO_RE in src/app/api/firms/route.ts, which is the enforcing copy. */
const LOGO_MAX_CHARS = 60_000
/** A bill prints the logo about 14mm tall; 512px is already twice what any printer resolves. */
const LOGO_BOX = 512

type FirmRow = {
  id: string
  code: string
  name: string
  role: string
  credentialsSet?: Record<string, boolean>
  [k: string]: any
}

function EditFirmDialog({ firm, onClose }: { firm: FirmRow | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<any>({})
  const [logo, setLogo] = useState('')
  const [license, setLicense] = useState('')
  const [saving, setSaving] = useState(false)

  // The licence is not a Firm column — it is the Setting row `moneyLenderLicenseNo` that
  // /api/loans/registers reads for the Namuna 15 header, and that row stays authoritative.
  // `keys=` so this does not pull the firm's invoice banners (~120KB) to read one string.
  const { data: settingsData } = useQuery({
    queryKey: ['settings', firm?.id, LOAN_LICENSE_KEY],
    queryFn: () => api<{ settings: { key: string; value: string }[] }>('/api/settings', { search: { firmId: firm!.id, keys: LOAN_LICENSE_KEY } }),
    enabled: !!firm,
  })
  const savedLicense = settingsData?.settings.find((s) => s.key === LOAN_LICENSE_KEY)?.value || ''

  // Seeded during render, never in an effect (react-hooks/set-state-in-effect): an effect would
  // paint the previous firm's GSTIN for a frame on the way to this one's.
  const [prevId, setPrevId] = useState<string | null>(null)
  if (firm && firm.id !== prevId) {
    setPrevId(firm.id)
    setForm({
      name: firm.name || '', legalName: firm.legalName || '', gstin: firm.gstin || '', pan: firm.pan || '',
      phone: firm.phone || '', email: firm.email || '', address: firm.address || '', city: firm.city || '',
      state: firm.state || '', pincode: firm.pincode || '',
      gstEnabled: firm.gstEnabled !== false,
      cgstRate: firm.cgstRate ?? 1.5, sgstRate: firm.sgstRate ?? 1.5, igstRate: firm.igstRate ?? 3.0,
      loyaltyRate: firm.loyaltyRate ?? 1,
      weighingScalePort: firm.weighingScalePort || '', weighingScaleBaud: String(firm.weighingScaleBaud || 9600),
      biometricEnabled: !!firm.biometricEnabled,
      eInvoiceEnabled: !!firm.eInvoiceEnabled,
      whatsappEnabled: firm.whatsappEnabled !== false,
      razorpayKeyId: '', razorpayKeySecret: '',
      paytmMerchantId: '', paytmMerchantKey: '',
      phonepeMerchantId: '', phonepeSaltKey: '',
    })
    setLogo(firm.logoUrl || '')
  }
  if (!firm && prevId !== null) setPrevId(null)

  const [prevLicense, setPrevLicense] = useState(savedLicense)
  if (savedLicense !== prevLicense) { setPrevLicense(savedLicense); setLicense(savedLicense) }

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  async function save() {
    if (!firm) return
    if (!String(form.name || '').trim()) return toast.error('Firm name is required')
    setSaving(true)
    try {
      await api('/api/firms', {
        method: 'PUT',
        body: {
          ...form,
          id: firm.id,
          logoUrl: logo,
          cgstRate: Number(form.cgstRate) || 0,
          sgstRate: Number(form.sgstRate) || 0,
          igstRate: Number(form.igstRate) || 0,
          loyaltyRate: Number(form.loyaltyRate) || 0,
          weighingScaleBaud: Number(form.weighingScaleBaud) || 9600,
        },
      })
      if (license.trim() !== savedLicense) {
        await api('/api/settings', { method: 'PUT', body: { firmId: firm.id, key: LOAN_LICENSE_KEY, value: license.trim() } })
        qc.invalidateQueries({ queryKey: ['settings'] })
      }
      toast.success(firm.code + ' saved')
      qc.invalidateQueries({ queryKey: ['firms'] })
      onClose()
    } catch (e: any) {
      toast.error(e.message || 'Could not save this firm')
    } finally {
      setSaving(false)
    }
  }

  const cred = firm?.credentialsSet || {}

  return (
    <Dialog open={!!firm} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Firm setup — {firm?.code}</DialogTitle>
        </DialogHeader>

        {/* Identity: open, because it is what this is opened for nine times in ten. */}
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Firm Name *"><Input value={form.name || ''} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Legal Name"><Input value={form.legalName || ''} onChange={(e) => set('legalName', e.target.value)} /></Field>
          <Field label="GSTIN"><Input value={form.gstin || ''} onChange={(e) => set('gstin', e.target.value.toUpperCase())} /></Field>
          <Field label="PAN"><Input value={form.pan || ''} onChange={(e) => set('pan', e.target.value.toUpperCase())} /></Field>
          <Field label="Phone"><Input value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Email"><Input type="email" value={form.email || ''} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Address" full><Input value={form.address || ''} onChange={(e) => set('address', e.target.value)} /></Field>
          <Field label="City"><Input value={form.city || ''} onChange={(e) => set('city', e.target.value)} /></Field>
          <Field label="State">
            <Select value={form.state || ''} onValueChange={(v) => set('state', v)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select state" /></SelectTrigger>
              <SelectContent>{INDIAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Pincode"><Input value={form.pincode || ''} onChange={(e) => set('pincode', e.target.value)} /></Field>
        </div>
        <p className="text-xs text-muted-foreground -mt-1">
          The firm code <strong>{firm?.code}</strong> is fixed — it keys the firm and is printed on
          every document already issued under it.
        </p>

        <Group
          title="Tax" hindi="कर"
          summary={form.gstEnabled === false ? 'GST not charged' : 'CGST ' + form.cgstRate + ' · SGST ' + form.sgstRate + ' · IGST ' + form.igstRate}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="firm-gst-enabled">Charge GST on sales</Label>
              <p className="text-xs text-muted-foreground">Off means every bill is raised out of GST scope, the same as a URD purchase.</p>
            </div>
            <Switch id="firm-gst-enabled" checked={form.gstEnabled !== false} onCheckedChange={(v) => set('gstEnabled', v)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="CGST %"><Input type="number" step="0.1" min="0" value={form.cgstRate} onChange={(e) => set('cgstRate', e.target.value)} /></Field>
            <Field label="SGST %"><Input type="number" step="0.1" min="0" value={form.sgstRate} onChange={(e) => set('sgstRate', e.target.value)} /></Field>
            <Field label="IGST %"><Input type="number" step="0.1" min="0" value={form.igstRate} onChange={(e) => set('igstRate', e.target.value)} /></Field>
          </div>
          <p className="text-xs text-muted-foreground">
            CGST + SGST apply when the buyer is in <strong>{form.state || 'this firm&rsquo;s state'}</strong>;
            IGST replaces both when they are not. IGST had no field until now, so an inter-state bill
            carried whatever was seeded.
          </p>
        </Group>

        <Group title="Licences" hindi="लाइसेंस" summary={license || 'No money-lender licence number'}>
          <Field label="Money-lender / pawnbroker licence no.">
            <Input value={license} onChange={(e) => setLicense(e.target.value)} placeholder="e.g. 14/ML/2019" />
          </Field>
          <p className="text-xs text-muted-foreground">
            Printed in the header of the Namuna 15 / Form 8 register and on the girvi note. Blank
            here prints blank on a statutory return. The loan-document panel in Print edits the same
            value.
          </p>
        </Group>

        <Group title="Branding" hindi="लोगो" summary={logo ? 'Logo set' : 'No logo'}>
          <LogoField value={logo} onChange={setLogo} />
        </Group>

        <Group title="Loyalty" hindi="लॉयल्टी" summary={(Number(form.loyaltyRate) || 0) + ' point(s) per ₹100'}>
          <Field label="Points earned per ₹100 spent">
            <Input type="number" step="0.1" min="0" value={form.loyaltyRate} onChange={(e) => set('loyaltyRate', e.target.value)} />
          </Field>
          <p className="text-xs text-muted-foreground">
            A ₹10,000 invoice earns <strong>{Math.floor((10000 / 100) * (Number(form.loyaltyRate) || 0))} points</strong>.
          </p>
        </Group>

        <Group
          title="Hardware &amp; channels" hindi="डिवाइस"
          summary={[form.weighingScalePort || 'no scale', form.biometricEnabled ? 'biometric' : null, form.eInvoiceEnabled ? 'e-invoice' : null, form.whatsappEnabled !== false ? 'WhatsApp' : null].filter(Boolean).join(' · ')}
        >
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Weighing scale port"><Input value={form.weighingScalePort || ''} onChange={(e) => set('weighingScalePort', e.target.value)} placeholder="COM3 / /dev/ttyUSB0" /></Field>
            <Field label="Baud rate">
              <Select value={String(form.weighingScaleBaud || 9600)} onValueChange={(v) => set('weighingScaleBaud', v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{['9600', '19200', '38400', '57600', '115200'].map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <FirmToggle id="firm-bio" label="Biometric login" hint="Fingerprint scanner for staff login on this terminal" checked={!!form.biometricEnabled} onChange={(v) => set('biometricEnabled', v)} />
          <FirmToggle id="firm-einv" label="GST e-invoicing" hint="Generate IRN / QR for B2B invoices" checked={!!form.eInvoiceEnabled} onChange={(v) => set('eInvoiceEnabled', v)} />
          <FirmToggle id="firm-wa" label="WhatsApp sharing" hint="Send invoices and receipts on WhatsApp" checked={form.whatsappEnabled !== false} onChange={(v) => set('whatsappEnabled', v)} />
        </Group>

        <Group
          title="Payment gateways" hindi="गेटवे"
          summary={[cred.razorpaySecret ? 'Razorpay' : null, cred.paytmKey ? 'Paytm' : null, cred.phonepeSalt ? 'PhonePe' : null].filter(Boolean).join(' · ') || 'None connected'}
        >
          <p className="text-xs text-muted-foreground">
            A saved credential is never sent back to this screen — it would sit in every counter
            machine&rsquo;s cache. Leave a box blank to keep what is stored; type in it to replace.
          </p>
          <CredField label="Razorpay Key ID" saved={!!cred.razorpayId} value={form.razorpayKeyId} onChange={(v) => set('razorpayKeyId', v)} />
          <CredField label="Razorpay Key Secret" secret saved={!!cred.razorpaySecret} value={form.razorpayKeySecret} onChange={(v) => set('razorpayKeySecret', v)} />
          <CredField label="Paytm Merchant ID" saved={!!cred.paytmId} value={form.paytmMerchantId} onChange={(v) => set('paytmMerchantId', v)} />
          <CredField label="Paytm Merchant Key" secret saved={!!cred.paytmKey} value={form.paytmMerchantKey} onChange={(v) => set('paytmMerchantKey', v)} />
          <CredField label="PhonePe Merchant ID" saved={!!cred.phonepeId} value={form.phonepeMerchantId} onChange={(v) => set('phonepeMerchantId', v)} />
          <CredField label="PhonePe Salt Key" secret saved={!!cred.phonepeSalt} value={form.phonepeSaltKey} onChange={(v) => set('phonepeSaltKey', v)} />
        </Group>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="btn-brand">{saving ? 'Saving…' : 'Save Firm'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** A closed-by-default group. `<details>` rather than an accordion component: keyboard- and
 *  find-in-page-native, and the summary states what is inside so it need not be opened to read. */
function Group({ title, hindi, summary, children }: { title: string; hindi: string; summary: string; children: React.ReactNode }) {
  return (
    <details className="rounded-md border group">
      <summary className="cursor-pointer list-none px-3 py-2.5 flex items-center justify-between gap-3 rounded-md hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2">
        <span className="text-sm font-medium">
          {title} <span className="hindi text-xs font-normal text-muted-foreground">{hindi}</span>
        </span>
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-muted-foreground truncate max-w-[16rem]">{summary}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="px-3 pb-3 pt-3 space-y-3 border-t">{children}</div>
    </details>
  )
}

function FirmToggle({ id, label, hint, checked, onChange }: { id: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div><Label htmlFor={id}>{label}</Label><p className="text-xs text-muted-foreground">{hint}</p></div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

/**
 * A write-only credential. The stored value cannot be read back (GET /api/firms omits it), so the
 * box shows WHETHER one is saved instead of showing it, and blank means "leave it alone" — the
 * same contract the staff password field uses, and the one the route enforces server-side.
 */
export function CredField({ label, saved, secret, value, onChange }: { label: string; saved: boolean; secret?: boolean; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <Input
          type={secret ? 'password' : 'text'} value={value || ''} onChange={(e) => onChange(e.target.value)}
          placeholder={saved ? 'Saved — leave blank to keep' : 'Not set'} autoComplete="off"
        />
        <ToneBadge tone={saved ? 'green' : 'gray'}>{saved ? 'Saved' : 'Not set'}</ToneBadge>
      </div>
    </Field>
  )
}

/**
 * The logo, re-encoded in the browser to a `data:` URL before it is ever sent — same rule and same
 * reasoning as the invoice banners (src/components/app/print/invoice-print.ts): a bill must not
 * fetch an image from the internet mid-print, and an SVG is a scripting surface on a document the
 * shop hands to a customer. PNG first so line-art stays crisp, JPEG steps if it will not fit the
 * TEXT column. The resize itself is src/lib/image.ts (shared with the banner picker); the route
 * re-checks all of this — this half only gets the owner a useful error.
 */
function LogoField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const id = useId()
  const [busy, setBusy] = useState(false)
  const kb = value ? Math.round((value.length * 3) / 4 / 1024) : 0

  async function pick(file: File | undefined) {
    if (!file) return
    setBusy(true)
    try { onChange(await downscaleLogo(file)) } catch (e: any) { toast.error(e.message || 'That image could not be read') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-xs text-muted-foreground">Firm logo — prints on the invoice header</Label>
      {value && (
        <div className="flex items-center gap-3">
          <img src={value} alt="Firm logo preview" className="h-16 w-auto max-w-[12rem] rounded border bg-white object-contain" />
          <span className="text-xs text-muted-foreground">{kb} KB</span>
          <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => onChange('')}><X className="size-3.5" /> Remove</Button>
        </div>
      )}
      <Input
        id={id} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy}
        onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }}
        className="h-9 cursor-pointer text-xs file:mr-2 file:cursor-pointer"
      />
      {busy && <p className="text-xs text-muted-foreground" aria-live="polite">Resizing…</p>}
      <p className="text-xs text-muted-foreground">
        PNG, JPEG or WebP from this machine. Stored on the firm record, so it prints the same from
        every counter and with no internet.
      </p>
    </div>
  )
}

async function downscaleLogo(file: File): Promise<string> {
  const { dataUrl } = await downscaleImage(file, {
    box: LOGO_BOX,
    maxChars: LOGO_MAX_CHARS,
    preferPng: true,
    quality: [0.9, 0.8, 0.7, 0.55, 0.4],
    invalidTypeMessage: 'Use a PNG, JPEG or WebP image',
    tooLargeMessage: 'That image is too detailed to store — try a simpler or smaller one',
  })
  return dataUrl
}
