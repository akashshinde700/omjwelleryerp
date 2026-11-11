'use client'
import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Gem, Search, Bell, HelpCircle, ChevronDown, LogOut, Menu, Moon, Sun, Plus, X, Building2, AlertCircle, Clock, ArrowRight, Barcode, KeyRound, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Field, useEnterAsTab } from './shared'
import { useApp } from '@/store/app'
import type { ViewKey, ViewContext } from '@/store/app'
import { NAV_ITEMS, NAV_GROUPS, VIEW_PARENT } from './nav-config'
import { api } from '@/lib/api-client'
import { TITLES, INDIAN_STATES } from '@/lib/constants'
import { signIn, signOut } from 'next-auth/react'
import { useTheme } from 'next-themes'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useBarcodeScanner } from '@/lib/barcode'
import { parseCounterSettings } from '@/lib/counter-settings'
import { useGoldRates } from './use-gold-rates'
import { ScanModal } from '@/components/app/scan-modal'
import { daysSince } from '@/lib/attention'
import { passwordProblem } from '@/lib/password-policy'

type Firm = { id: string; code: string; name: string; state?: string }

export function AppShell({ children, userName, userEmail }: { children: React.ReactNode; userName?: string | null; userEmail?: string | null }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showScan, setShowScan] = useState(false)
  // Narrow selectors, not a whole-store destructure: AppShell wraps every view, so a bare
  // useApp() here re-rendered the sidebar/topbar/rate-ticker on every store write (e.g. the
  // per-view clearViewContext() that fires on navigation) even when none of these fields changed.
  const activeView = useApp((s) => s.activeView)
  const setView = useApp((s) => s.setView)
  const firms = useApp((s) => s.firms)
  const setFirms = useApp((s) => s.setFirms)
  const activeFirmId = useApp((s) => s.activeFirmId)
  const setActiveFirm = useApp((s) => s.setActiveFirm)

  // Hardware barcode scanner detection — opens scan modal when scanner input detected
  useBarcodeScanner((code) => {
    setShowScan(true)
    // The scanned code will be available; the ScanModal handles routing
  })

  const { data: firmsData } = useQuery({
    queryKey: ['firms'],
    queryFn: () => api<{ firms: Firm[] }>('/api/firms'),
  })

  useEffect(() => {
    if (firmsData?.firms?.length && firms.length === 0) {
      setFirms(firmsData.firms.map((f) => ({ id: f.id, code: f.code, name: f.name })))
    }
  }, [firmsData, firms.length, setFirms])

  const activeFirm = firms.find((f) => f.id === activeFirmId) || firms[0]

  // Per-firm counter preferences. Mounted here because Enter-as-next-field has to be live on every
  // screen, not just the one that happens to read settings. staleTime is long on purpose: this
  // response carries the invoice banners (~120KB) and the flag inside it changes once a year.
  const { data: settingsData } = useQuery({
    // The FILTER IS PART OF THE KEY, and has to be. This request asks for one row; the stock form,
    // the item detail and the item panel ask for the whole set under ['settings', firmId]. Keyed
    // the same, React Query served them this one-row response instead — so parseCalcSettings saw
    // no `calc.*` rows and silently returned DEFAULTS on every one of those screens. A firm that
    // had set its making basis, wastage basis or metal rate unit was quietly ignored, including in
    // the save-time rate conversion. A key must identify its response, not just its endpoint.
    queryKey: ['settings', activeFirmId, 'ui.enterMovesNext'],
    // keys=: the shell reads ONE boolean, and the full settings row set is ~121KB once a shop
    // uploads invoice banners. Filtered, this is ~0.2KB.
    queryFn: () => api<{ settings: { key: string; value: string }[] }>('/api/settings', { search: { firmId: activeFirmId!, keys: 'ui.enterMovesNext' } }),
    enabled: !!activeFirmId,
    staleTime: 10 * 60_000,
  })
  useEnterAsTab(parseCounterSettings(settingsData?.settings).enterMovesNext)

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <Sidebar activeView={activeView} setView={(v) => { setView(v); setMobileOpen(false) }} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        <TopBar
          onMenu={() => setMobileOpen(true)}
          userName={userName}
          userEmail={userEmail}
          firms={firmsData?.firms || []}
          activeFirm={activeFirm}
          onFirmChange={setActiveFirm}
          setView={setView}
          onScan={() => setShowScan(true)}
        />
        <main className="flex-1 overflow-x-hidden">
          <div className="p-4 sm:p-6 max-w-[1600px] mx-auto">{children}</div>
        </main>
        <footer className="mt-auto border-t bg-card/50 py-3 px-6 text-center text-xs text-muted-foreground">
          OmGold ERP — Jewellery & Gold Loan Software · Built with Next.js, Prisma & React Native
        </footer>
      </div>

      {/* Barcode Scanner Modal */}
      <ScanModal open={showScan} onOpenChange={setShowScan} onResult={() => {}} />
    </div>
  )
}

function Sidebar({ activeView, setView, mobileOpen, onClose }: { activeView: string; setView: (v: any) => void; mobileOpen: boolean; onClose: () => void }) {
  // Animate only while the user is toggling; any viewport resize switches it off (see aside comment).
  const [animate, setAnimate] = useState(false)
  useEffect(() => {
    const off = () => setAnimate(false)
    window.addEventListener('resize', off)
    return () => window.removeEventListener('resize', off)
  }, [])
  const [prevOpen, setPrevOpen] = useState(mobileOpen)
  if (prevOpen !== mobileOpen) { setPrevOpen(mobileOpen); setAnimate(true) }
  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onClose} />
        )}
      </AnimatePresence>

      {/* Off-canvas drawer below lg, fixed rail at lg+. Closed = translated away AND invisible, so a
          half-finished slide (or a tab key) can never leave it over the form. The slide only animates
          for a user open/close: crossing the lg breakpoint (rotate, resize) snaps, because a 150ms
          slide-out there is what a screenshot / a rotating tablet caught covering the content. */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-sidebar text-sidebar-foreground flex flex-col lg:translate-x-0 lg:visible",
          animate && "transition-[transform,visibility] duration-200",
          mobileOpen ? "translate-x-0 visible" : "-translate-x-full invisible"
        )}>
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="size-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-700 grid place-items-center text-white shadow-lg">
              <Gem className="size-5" />
            </div>
            <div>
              <p className="font-bold leading-none">OmGold<span className="text-amber-400"> ERP</span></p>
              <p className="text-[10px] text-sidebar-foreground/60">Jewellery Suite</p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden text-sidebar-foreground/60 hover:text-sidebar-foreground">
            <X className="size-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto nice-scroll px-2 py-3 space-y-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.id}>
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                {group.label} <span className="hindi normal-case tracking-normal opacity-70">{group.hindi}</span>
              </p>
              <div className="space-y-0.5">
                {NAV_ITEMS.filter((n) => n.group === group.id).map((item) => {
                  // A tab inside a section lights up its parent entry, so the sidebar never goes blank
                  // while you are three tabs deep in The Books.
                  const active = activeView === item.key || VIEW_PARENT[activeView as ViewKey] === item.key
                  const Icon = item.icon
                  return (
                    <button
                      key={item.key}
                      onClick={() => setView(item.key)}
                      title={item.desc}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400",
                        active ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm" : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className="flex-1 text-left font-medium">{item.label}</span>
                      {item.hindi && <span className={cn("hindi text-[11px]", active ? "text-sidebar-primary-foreground/70" : "text-sidebar-foreground/40")}>{item.hindi}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-sidebar-border">
          <p className="text-[11px] leading-5 text-sidebar-foreground/60">
            Press <kbd className="rounded border border-sidebar-border px-1">/</kbd> to search ·{' '}
            <kbd className="rounded border border-sidebar-border px-1">d</kbd> home ·{' '}
            <kbd className="rounded border border-sidebar-border px-1">c</kbd> customers
          </p>
        </div>
      </aside>
    </>
  )
}

function TopBar({ onMenu, userName, userEmail, firms, activeFirm, onFirmChange, setView, onScan }: { onMenu: () => void; userName?: string | null; userEmail?: string | null; firms: Firm[]; activeFirm?: Firm; onFirmChange: (id: string) => void; setView: (v: ViewKey, ctx?: ViewContext) => void; onScan: () => void }) {
  const { theme, setTheme } = useTheme()
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [showChangePw, setShowChangePw] = useState(false)
  const firmId = activeFirm?.id

  const { data: rateData } = useQuery({
    queryKey: ['gold-rate', firmId],
    queryFn: () => api<{ rates: any[] }>('/api/gold-rate', { search: { firmId } }),
    enabled: !!firmId,
    refetchInterval: 30000,
  })

  // Derived from query data during render (no setState-in-effect) — and derived through the SAME
  // useGoldRates() matcher every form now fills its rate field from, so the number on this pill and
  // the number a purity pick drops into a bill are the same number by construction, not by
  // coincidence. It shares this component's query key, so it costs no extra request.
  //
  // WHY NOT `.rate` DIRECTLY, as this did before: a GoldRate row carries its OWN unit. These pills
  // are labelled "/10gm" and "/kg" unconditionally, so a firm that had entered 22K per_gram saw
  // "₹7,500/10gm" — a tenth of the real rate, on the header, all day. find() converts into the
  // metal's own quoting convention, which is exactly what these labels claim.
  const board = useGoldRates(firmId)
  // null = the firm has not entered this rate. NEVER substitute a made-up number here: a wrong rate
  // on the header all day is worse than a visible "Rate not set".
  const gold22 = board.find('gold', '22K')?.perMetalUnit ?? null
  const gold24 = board.find('gold', '24K')?.perMetalUnit ?? null
  // Silver has no one canonical purity on a shop board (999 or 925), so the first silver row the
  // board carries still wins here — but it now arrives converted to ₹/kg like the label says.
  const silverRow = rateData?.rates.find((r: any) => r.metal === 'silver')
  const silver = (silverRow && board.find('silver', silverRow.purity)?.perMetalUnit) || null
  const goSetRates = () => setView('settings', { scrollTo: 'daily-rates' })

  return (
    <header className="sticky top-0 z-30 h-16 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="h-full flex items-center gap-2 px-3 sm:px-6">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu} aria-label="Open menu / मेनू खोलें">
          <Menu className="size-5" />
        </Button>

        {/* Search — functional, navigates to search module */}
        <button onClick={() => setView('search')} className="relative hidden md:block w-56 xl:w-72 shrink-0 group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <div className="pl-9 pr-2 h-9 bg-muted/50 rounded-md border border-transparent group-hover:border-amber-300 transition-colors flex items-center gap-2 text-sm text-muted-foreground whitespace-nowrap overflow-hidden">
            <span className="truncate">Search customers, stock, loans…</span>
            <kbd className="ml-auto text-[10px] bg-background px-1.5 py-0.5 rounded border">/</kbd>
          </div>
        </button>

        {/* Scan button — opens barcode scanner modal */}
        <Button variant="outline" size="icon" className="hidden md:flex" onClick={onScan} title="Scan Barcode (hardware scanner ready)">
          <Barcode className="size-4 text-amber-600" />
        </Button>

        {/* Gold rate ticker — 22K always, the rest as the window allows. A missing rate shows "Rate not set"
            and links to Daily Rates. There is no market/MCX figure here: GET /api/gold-rate's `live` value is
            simulated, so it is not shown. */}
        <div className="hidden lg:flex items-center gap-1.5 ml-2 min-w-0 overflow-hidden">
          <RateBadge label="22K" value={gold22} unit="/10gm" tone="gold" onSet={goSetRates} />
          <RateBadge label="24K" value={gold24} unit="/10gm" tone="gold" onSet={goSetRates} className="hidden 2xl:flex" />
          <RateBadge label="SILVER" value={silver} unit="/kg" tone="silver" onSet={goSetRates} className="hidden xl:flex" />
        </div>

        <div className="flex-1" />

        {/* Quick add */}
        <Button size="sm" className="hidden sm:flex shrink-0 btn-brand" onClick={() => setShowAddCustomer(true)}>
          <Plus className="size-4" /> <span className="hidden xl:inline">Add Customer</span>
        </Button>

        {/* Firm selector */}
        {firms.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 max-w-[180px] shrink-0">
                <Building2 className="size-4 text-amber-600" />
                <span className="truncate font-semibold">{activeFirm?.code || 'FIRM'}</span>
                <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs text-muted-foreground">All Firms</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {firms.map((f) => (
                <DropdownMenuItem key={f.id} onClick={() => onFirmChange(f.id)} className="gap-2">
                  <Building2 className="size-4 text-amber-600" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{f.code}</p>
                    <p className="text-xs text-muted-foreground truncate">{f.name}</p>
                  </div>
                  {f.id === activeFirm?.id && <span className="ml-auto size-2 rounded-full bg-emerald-500" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Theme */}
        <Button variant="ghost" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>

        {/* Notifications bell — shows overdue loans + pending tasks */}
        <NotificationsButton firmId={firmId} onViewReminders={() => setView('reminders')} onViewLoans={() => setView('loans')} />
        <Button variant="ghost" size="icon" onClick={() => toast.info('Help: Use the sidebar to navigate. Press / to search.')}><HelpCircle className="size-4" /></Button>

        {/* User */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full pl-1 pr-2 py-1 hover:bg-muted">
              <div className="size-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-700 grid place-items-center text-white text-xs font-bold">
                {(userName || 'U').slice(0, 1).toUpperCase()}
              </div>
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <p className="font-medium">{userName}</p>
              <p className="text-xs text-muted-foreground font-normal">{userEmail}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setShowChangePw(true)}>
              <KeyRound className="size-4 mr-2" /> Change password
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => signOut({ callbackUrl: '/' })}>
              <LogOut className="size-4 mr-2" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AddCustomerDialog open={showAddCustomer} onOpenChange={setShowAddCustomer} firmId={firmId} />
      <ChangePasswordDialog open={showChangePw} onOpenChange={setShowChangePw} />
    </header>
  )
}

function RateBadge({ label, value, unit, tone, onSet, className }: { label: string; value: number | null; unit: string; tone: 'gold' | 'silver'; onSet: () => void; className?: string }) {
  const cls = cn(
    "flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium ring-1 whitespace-nowrap",
    tone === 'gold' ? "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 ring-amber-200 dark:ring-amber-800"
    : "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 ring-stone-200 dark:ring-stone-700",
    className,
  )
  if (value == null) {
    return (
      <button type="button" onClick={onSet} title={`${label} rate is not set - click to enter it in Daily Rates`}
        aria-label={`${label} rate not set. Open Daily Rates`}
        className={cn(cls, "hover:ring-amber-400 focus-visible:outline-none focus-visible:ring-2")}>
        <span className="opacity-70">{label}</span>
        <span className="font-semibold italic">Rate not set</span>
      </button>
    )
  }
  return (
    <div title={`${label} ${unit}`} className={cls}>
      <span className="opacity-70">{label}</span>
      <span className="font-bold">₹{new Intl.NumberFormat('en-IN').format(value)}</span>
      <span className="opacity-60 text-[10px]">{unit}</span>
    </div>
  )
}

/** Self-service password change. Contract: POST /api/account/password { currentPassword, newPassword }
 *  -> 200 { ok: true, loginId } | 400 { error } (wrong current / weak new) | 429 (too many wrong).
 *  A change ends EVERY session of the user, this one included, so on success the dialog signs
 *  straight back in with the new password; if that fails it signs out cleanly instead. */
function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [prevOpen, setPrevOpen] = useState(open)
  const qc = useQueryClient()

  // Render-time reset (never an effect): a reopened dialog must not still hold the last passwords.
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) { setCurrent(''); setNext(''); setConfirmPw(''); setShow(false); setSaving(false) }
  }

  async function save() {
    if (!current) return toast.error('Enter your current password')
    const weak = passwordProblem(next, 'New password')
    if (weak) return toast.error(weak)
    if (next !== confirmPw) return toast.error('New password and confirmation do not match')
    if (next === current) return toast.error('New password must be different from the current one')
    setSaving(true)
    try {
      const r = await api<{ ok: true; loginId: string }>('/api/account/password', { method: 'POST', body: { currentPassword: current, newPassword: next } })
      // The old session is revoked from this moment. A background poll that lands in this gap gets
      // a 401 — api() only marks the hash then, it does not end the session — and the re-login
      // below replaces the cookie; the queries are refetched once it has.
      const back = await signIn('credentials', { loginId: r.loginId, password: next, redirect: false })
      if (!back || back.error || !back.ok) {
        toast.success('Password changed. Please sign in again with your new password.')
        await signOut({ callbackUrl: '/' })
        return
      }
      if (window.location.hash === '#login') history.replaceState(null, '', window.location.pathname + window.location.search)
      void qc.invalidateQueries()
      toast.success('Password changed')
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e?.message || 'Could not change password')
    } finally {
      setSaving(false)
    }
  }

  const type = show ? 'text' : 'password'
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Change password</DialogTitle></DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void save() }}>
          <Field label="Current password">
            <Input type={type} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
          <Field label="New password (min 8 characters)">
            <Input type={type} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field label="Confirm new password">
            <Input type={type} autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
          </Field>
          <button type="button" onClick={() => setShow((v) => !v)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground w-fit">
            {show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />} {show ? 'Hide' : 'Show'} passwords
          </button>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving} className="btn-brand">{saving ? 'Saving…' : 'Change password'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Exported so the Home screen's mobile-first lookup can hand a dialled number straight to it:
 *  type a mobile, find nobody, add that person without retyping the number. */
export function AddCustomerDialog({ open, onOpenChange, firmId, defaultMobile, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; firmId?: string; defaultMobile?: string; onSaved?: (c: any) => void }) {
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [prevOpen, setPrevOpen] = useState(open)
  const qc = useQueryClient()

  // Render-time reset (never an effect) — see worklog Task 59.
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setForm({ type: 'customer', country: 'India', state: 'Madhya Pradesh', mobile: defaultMobile || '' })
  }

  async function save() {
    if (!firmId) return toast.error('No firm selected')
    if (!form.firstName) return toast.error('Enter first name')
    if (!form.mobile) return toast.error('Enter mobile number')
    setSaving(true)
    try {
      const res = await api<{ customer: any }>('/api/customers', { method: 'POST', body: { ...form, firmId } })
      toast.success('Customer added')
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['counter-lookup'] })
      onSaved?.(res.customer)
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Add New Customer</DialogTitle>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Mobile Number *">
            <Input placeholder="9876543210" value={form.mobile || ''} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
          </Field>
          <Field label="First Name *">
            <Input placeholder="First name" value={form.firstName || ''} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          </Field>
          <Field label="City / Village">
            <Input placeholder="City" value={form.city || ''} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </Field>
          <Field label="User Type">
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">Customer</SelectItem>
                <SelectItem value="supplier">Supplier</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
                <SelectItem value="karigar">Karigar</SelectItem>
                <SelectItem value="moneyLender">Money Lender</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="w-full justify-between px-0 text-muted-foreground hover:bg-transparent">
              <span>More details · और जानकारी</span>
              <ChevronDown className="size-4" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="grid sm:grid-cols-2 gap-3 pt-3">
            <Field label="Title">
              <Select value={form.title} onValueChange={(v) => setForm({ ...form, title: v })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{TITLES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Email">
              <Input placeholder="email@example.com" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Last Name">
              <Input placeholder="Last name" value={form.lastName || ''} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </Field>
            <Field label="Address" full>
              <Input placeholder="Full address" value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </Field>
            <Field label="State">
              <Select value={form.state} onValueChange={(v) => setForm({ ...form, state: v })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{INDIAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </CollapsibleContent>
        </Collapsible>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="btn-brand">{saving ? 'Saving…' : 'Save Customer'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NotificationsButton({ firmId, onViewReminders, onViewLoans }: { firmId?: string; onViewReminders: () => void; onViewLoans: () => void }) {
  const { data: tasks } = useQuery({
    queryKey: ['notif-tasks', firmId],
    queryFn: () => api<{ tasks: any[] }>('/api/tasks', { search: { firmId: firmId!, status: 'pending' } }),
    enabled: !!firmId,
    refetchInterval: 60000,
  })
  const { data: loans } = useQuery({
    queryKey: ['notif-loans', firmId],
    // overdue=true filters in MySQL and limit=5 caps the payload: the menu shows three. This used
    // to fetch every active loan with items and transactions (~792KB) to display a badge count.
    queryFn: () => api<{ loans: any[] }>('/api/loans', { search: { firmId: firmId!, status: 'active', overdue: 'true', limit: '5' } }),
    enabled: !!firmId,
    refetchInterval: 60000,
  })

  const pendingTasks = tasks?.tasks || []
  const overdueLoans = loans?.loans || []
  const totalNotifs = pendingTasks.length + overdueLoans.length

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="size-4" />
          {totalNotifs > 0 && (
            <span className="absolute top-1 right-1 size-4 rounded-full bg-rose-500 text-white text-[9px] font-bold grid place-items-center">
              {totalNotifs > 9 ? '9+' : totalNotifs}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {totalNotifs > 0 && <Badge className="bg-rose-500 text-white">{totalNotifs}</Badge>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {totalNotifs === 0 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            <Bell className="size-8 mx-auto mb-2 opacity-30" />
            All caught up! No pending notifications.
          </div>
        )}
        {overdueLoans.length > 0 && (
          <>
            <DropdownMenuLabel className="text-xs text-rose-600 flex items-center gap-1.5">
              <AlertCircle className="size-3.5" /> Overdue Loans ({overdueLoans.length})
            </DropdownMenuLabel>
            {overdueLoans.slice(0, 3).map((l: any) => {
              const days = daysSince(l.loanDate)
              return (
                <DropdownMenuItem key={l.id} onClick={onViewLoans} className="flex-col items-start gap-0 py-2">
                  <div className="flex items-center gap-2 w-full">
                    <span className="font-mono text-xs text-amber-600">{l.loanNo}</span>
                    <span className="text-sm font-medium truncate flex-1">{l.customerName}</span>
                    <span className="text-xs text-rose-600 font-medium">{days}d</span>
                  </div>
                  <span className="text-xs text-muted-foreground">₹{l.principalAmount?.toLocaleString('en-IN')} · overdue</span>
                </DropdownMenuItem>
              )
            })}
          </>
        )}
        {pendingTasks.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-amber-600 flex items-center gap-1.5">
              <Clock className="size-3.5" /> Pending Tasks ({pendingTasks.length})
            </DropdownMenuLabel>
            {pendingTasks.slice(0, 3).map((t: any) => (
              <DropdownMenuItem key={t.id} onClick={onViewReminders} className="flex-col items-start gap-0 py-2">
                <div className="flex items-center gap-2 w-full">
                  <span className="text-sm font-medium truncate flex-1">{t.subject}</span>
                </div>
                <span className="text-xs text-muted-foreground capitalize">{t.category.replace('_', ' ')} · {t.priority}</span>
              </DropdownMenuItem>
            ))}
          </>
        )}
        {totalNotifs > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onViewReminders} className="justify-center text-amber-600 font-medium">
              View all <ArrowRight className="size-3.5 ml-1" />
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
