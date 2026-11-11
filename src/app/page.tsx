'use client'
import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useSession } from 'next-auth/react'
import { LoginScreen } from '@/components/app/login-screen'
import { AppShell } from '@/components/app/app-shell'
import { useApp } from '@/store/app'
import type { ViewKey } from '@/store/app'
import { api } from '@/lib/api-client'
import { Section } from '@/components/app/section-tabs'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

// Dashboard is what the operator sees first — keep it in the main bundle so it paints with no
// extra round trip. Every other view is a separate chunk fetched only when its nav item is
// clicked: 29 modules statically imported here used to ship ~2MB of JS (554KB gzip) before the
// operator could type anything, most of it for screens they may never open this session.
import { Dashboard } from '@/components/app/modules/dashboard'

function ViewLoading() {
  return (
    <div className="grid place-items-center py-24">
      <Loader2 className="size-8 animate-spin text-amber-500" />
    </div>
  )
}

/** dynamic() + a spinner fallback so a first visit to a view never flashes empty content. */
function lazyView<P extends object = Record<string, never>>(loader: () => Promise<Record<string, any>>, key: string) {
  return dynamic<P>(() => loader().then((m) => m[key] as React.ComponentType<P>), { loading: ViewLoading })
}

const CustomersModule = lazyView(() => import('@/components/app/modules/customers'), 'CustomersModule')
const StockModule = lazyView(() => import('@/components/app/modules/stock'), 'StockModule')
const StockAddModule = lazyView(() => import('@/components/app/modules/stock-add'), 'StockAddModule')
const StockInsightsModule = lazyView(() => import('@/components/app/modules/stock-insights'), 'StockInsightsModule')
const SellModule = lazyView(() => import('@/components/app/modules/sell'), 'SellModule')
const LoansModule = lazyView(() => import('@/components/app/modules/loans'), 'LoansModule')
const UdhaarModule = lazyView(() => import('@/components/app/modules/udhaar'), 'UdhaarModule')
const SchemesModule = lazyView(() => import('@/components/app/modules/schemes'), 'SchemesModule')
const ExpensesModule = lazyView(() => import('@/components/app/modules/expenses'), 'ExpensesModule')
const ReportsModule = lazyView(() => import('@/components/app/modules/reports'), 'ReportsModule')
const DayBookModule = lazyView(() => import('@/components/app/modules/accounting'), 'DayBookModule')
const JournalBookModule = lazyView(() => import('@/components/app/modules/accounting'), 'JournalBookModule')
const LedgerModule = lazyView(() => import('@/components/app/modules/accounting'), 'LedgerModule')
const GstModule = lazyView(() => import('@/components/app/modules/accounting'), 'GstModule')
const TrialBalanceModule = lazyView(() => import('@/components/app/modules/accounting'), 'TrialBalanceModule')
const PLModule = lazyView(() => import('@/components/app/modules/accounting'), 'PLModule')
const BalanceSheetModule = lazyView(() => import('@/components/app/modules/accounting'), 'BalanceSheetModule')
const FirmsModule = lazyView(() => import('@/components/app/modules/firms'), 'FirmsModule')
const SettingsModule = lazyView(() => import('@/components/app/modules/settings'), 'SettingsModule')
const LogsModule = lazyView(() => import('@/components/app/modules/logs'), 'LogsModule')
const GirviCalcModule = lazyView(() => import('@/components/app/modules/girvicalc'), 'GirviCalcModule')
const RemindersModule = lazyView(() => import('@/components/app/modules/reminders'), 'RemindersModule')
const OrdersModule = lazyView(() => import('@/components/app/modules/orders'), 'OrdersModule')
const SearchModule = lazyView<{ onNavigate: (v: any) => void }>(() => import('@/components/app/modules/search'), 'SearchModule')
const SmsModule = lazyView(() => import('@/components/app/modules/sms'), 'SmsModule')
const EcommerceModule = lazyView(() => import('@/components/app/modules/ecommerce'), 'EcommerceModule')
const StockTransferModule = lazyView(() => import('@/components/app/modules/stocktransfer'), 'StockTransferModule')
const StockTallyModule = lazyView(() => import('@/components/app/modules/stock-tally'), 'StockTallyModule')
const HallmarkModule = lazyView(() => import('@/components/app/modules/hallmark'), 'HallmarkModule')
const MeltingModule = lazyView(() => import('@/components/app/modules/melting'), 'MeltingModule')
const PrintModule = lazyView(() => import('@/components/app/modules/print'), 'PrintModule')
const QuotationsModule = lazyView(() => import('@/components/app/modules/quotations'), 'QuotationsModule')
const BankRecModule = lazyView(() => import('@/components/app/modules/bank'), 'BankRecModule')
const RepairsModule = lazyView(() => import('@/components/app/modules/repairs'), 'RepairsModule')

export default function Home() {
  const { data: session, status } = useSession()
  // Narrow selectors: this component re-rendering on every store write (e.g. the per-view
  // clearViewContext() a module's useViewContext fires after consuming a handoff) is cheap by
  // itself, but it was also holding the whole-store reference alive as a render dependency.
  const activeView = useApp((s) => s.activeView)
  const setView = useApp((s) => s.setView)
  const setFirms = useApp((s) => s.setFirms)
  // Seeding is not a thing the browser asks for. This used to POST /api/seed on every page load,
  // and that route was unauthenticated: the first HTTP request to a fresh install created a firm and
  // logins whose passwords are printed in the README. Demo data now comes from `npx prisma db seed`.

  // Load firms once per signed-in user. Keyed on the user id, not the session object: NextAuth
  // re-creates the session object on window refocus, which would otherwise refetch needlessly.
  const userId = (session?.user as { id?: string } | undefined)?.id ?? session?.user?.email ?? null
  useEffect(() => {
    if (userId) {
      api<{ firms: any[] }>('/api/firms').then((r) => {
        if (r.firms.length) {
          setFirms(r.firms.map((f) => ({ id: f.id, code: f.code, name: f.name })))
        }
      }).catch(() => {})
    }
  }, [userId, setFirms])

  // Keyboard shortcuts: / = search, d = dashboard, c = customers, etc.
  // Also listens for Electron menu navigation events
  useEffect(() => {
    if (!session?.user) return
    function handler(e: KeyboardEvent) {
      // Don't trigger if typing in an input
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === '/') {
        e.preventDefault()
        setView('search')
      } else if (e.key === 'd' && !e.ctrlKey && !e.metaKey) {
        setView('dashboard')
      } else if (e.key === 'c' && !e.ctrlKey && !e.metaKey) {
        setView('customers')
      } else if (e.key === 'l' && !e.ctrlKey && !e.metaKey) {
        setView('loans')
      } else if (e.key === 's' && !e.ctrlKey && !e.metaKey) {
        setView('stock')
      }
    }
    window.addEventListener('keydown', handler)

    // Electron integration — listen for menu navigation
    const electronAPI = (window as any).electronAPI
    if (electronAPI?.onNavigate) {
      electronAPI.onNavigate((view: string) => setView(view as ViewKey))
    }

    return () => window.removeEventListener('keydown', handler)
  }, [session, setView])

  if (status === 'loading') {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <div className="text-center">
          <Loader2 className="size-10 animate-spin text-amber-500 mx-auto" />
          <p className="mt-3 text-sm text-muted-foreground">Loading OmGold ERP…</p>
        </div>
      </div>
    )
  }

  if (!session?.user) {
    return <LoginScreen />
  }

  return (
    <AppShell userName={session.user.name} userEmail={session.user.email}>
      <ViewRouter view={activeView} setView={setView} />
    </AppShell>
  )
}

function ViewRouter({ view, setView }: { view: string; setView: (v: any) => void }) {
  return (
    <Section view={view as ViewKey} setView={setView}>
      {renderView(view, setView)}
    </Section>
  )
}

function renderView(view: string, setView: (v: any) => void) {
  switch (view) {
    case 'dashboard': return <Dashboard onNavigate={setView} />
    case 'customers': return <CustomersModule />
    case 'stock': return <StockModule />
    case 'stockadd': return <StockAddModule />
    case 'insights': return <StockInsightsModule />
    case 'sell': return <SellModule />
    case 'orders': return <OrdersModule />
    case 'loans': return <LoansModule />
    case 'udhaar': return <UdhaarModule />
    case 'schemes': return <SchemesModule />
    case 'expenses': return <ExpensesModule />
    case 'girvicalc': return <GirviCalcModule />
    case 'reminders': return <RemindersModule />
    case 'search': return <SearchModule onNavigate={setView} />
    case 'reports': return <ReportsModule />
    case 'sms': return <SmsModule />
    case 'ecommerce': return <EcommerceModule />
    case 'stocktransfer': return <StockTransferModule />
    case 'stocktally': return <StockTallyModule />
    case 'hallmark': return <HallmarkModule />
    case 'melting': return <MeltingModule />
    case 'daybook': return <DayBookModule />
    case 'journal': return <JournalBookModule />
    case 'ledger': return <LedgerModule />
    case 'bankrec': return <BankRecModule />
    case 'gst': return <GstModule />
    case 'trial': return <TrialBalanceModule />
    case 'pl': return <PLModule />
    case 'balance': return <BalanceSheetModule />
    case 'firms': return <FirmsModule />
    case 'settings': return <SettingsModule />
    case 'logs': return <LogsModule />
    case 'print': return <PrintModule />
    case 'quotations': return <QuotationsModule />
    case 'repairs': return <RepairsModule />
    default: return <Dashboard onNavigate={setView} />
  }
}
