'use client'
import { useEffect } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ViewKey =
  | 'dashboard'
  | 'customers'
  | 'stock'
  | 'insights'
  | 'stocktally'
  | 'sell'
  | 'orders'
  | 'loans'
  | 'udhaar'
  | 'schemes'
  | 'expenses'
  | 'girvicalc'
  | 'reminders'
  | 'search'
  | 'reports'
  | 'sms'
  | 'ecommerce'
  | 'stocktransfer'
  | 'hallmark'
  | 'melting'
  | 'daybook'
  | 'journal'
  | 'ledger'
  | 'bankrec'
  | 'gst'
  | 'trial'
  | 'pl'
  | 'balance'
  | 'firms'
  | 'settings'
  | 'logs'
  | 'print'
  | 'quotations'
  | 'repairs'
  | 'stockadd'

type FirmLite = { id: string; code: string; name: string }

/**
 * Context handed to a view by setView(). Consumed once by the target module on mount,
 * then cleared — so revisiting the view later opens it cold.
 * Not persisted: a page reload must not re-fire a stale action.
 */
export type ViewContext = {
  /** DOM id the target module should scroll to on arrival — used by cross-screen shortcuts that
   *  land on a long page (Add Stock's Options button -> Setup's stock settings section). */
  scrollTo?: string
  /** Party to prefill the target module's "new" form with. */
  customer?: {
    id: string
    /** Full display name — the caller composes firstName + lastName. */
    name: string
    mobile?: string
    village?: string
    city?: string
  }
  /** Which sub-form/tab to open. sell: sale|purchase|urd · udhaar: credit|debit|advance */
  mode?: 'sale' | 'purchase' | 'urd' | 'credit' | 'debit' | 'advance'
  /** Stock item to prefill onto a new sale line — from the item detail view's "Add to Bill".
   *  Consumed by sell.tsx exactly like a picked/scanned stock line. */
  stockItem?: { id: string; name: string; itemCode?: string; mrp?: number; netWeight?: number }
  /** A whole quotation to bill — from Quotations' "Convert to Invoice". sell.tsx consumes it once and
   *  builds EVERY line through the same draft -> computeDraft -> lineFromDraft path a manual or scanned
   *  line uses (nothing is re-totalled from these figures). After the bill saves it marks the quote
   *  converted. Mirrors QuotationItem (prisma/schema.prisma). */
  quote?: {
    id: string
    quoteNo: string
    goldRate?: number
    discount?: number
    items: {
      stockItemId?: string | null
      name: string
      purity?: string | null
      netWeight?: number
      rate?: number
      makingCharge?: number
      amount?: number
      total?: number
    }[]
  }
  /** Open the module's "New" form on arrival even when no party is attached — the Home screen's
   *  one-tap starts (New Bill / New Loan / New Order / Money In) with the counter filling the
   *  party in the form itself. */
  open?: boolean
  /** Stock item to load into the Add Stock view for editing — set by the Stock list's Edit
   *  pencil. stockadd.tsx consumes this once (see useViewContext) and looks the item up itself;
   *  no by-id API route exists so it re-fetches the firm's list and finds it, same as the list
   *  screen already does. */
  stockEditId?: string
}

type AppState = {
  activeView: ViewKey
  activeFirmId: string | null
  firms: FirmLite[]
  viewContext: ViewContext | null
  setView: (v: ViewKey, ctx?: ViewContext) => void
  clearViewContext: () => void
  setFirms: (f: FirmLite[]) => void
  setActiveFirm: (id: string) => void
}

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      activeView: 'dashboard',
      activeFirmId: null,
      firms: [],
      viewContext: null,
      // Any plain navigation clears a leftover context, so it can only ever reach the view it was aimed at.
      setView: (v, ctx) => set({ activeView: v, viewContext: ctx ?? null }),
      clearViewContext: () => set({ viewContext: null }),
      // Keep the operator's persisted firm choice if it is still one of theirs; only fall back to the
      // first firm (GET /api/firms is ordered createdAt asc, code asc) when it is unset or revoked.
      setFirms: (f) => {
        const cur = get().activeFirmId
        set({ firms: f, activeFirmId: cur && f.some((x) => x.id === cur) ? cur : f[0]?.id || null })
      },
      setActiveFirm: (id) => set({ activeFirmId: id }),
    }),
    {
      name: 'omunim-app',
      partialize: (s) => ({ activeView: s.activeView, activeFirmId: s.activeFirmId, firms: s.firms }),
    }
  )
)

/**
 * Consume the ViewContext aimed at this view, exactly once.
 * Call at the top of a module component; `onContext` fires on the render after
 * setView(view, ctx) lands, then the context is cleared so it never re-fires.
 */
export function useViewContext(onContext: (ctx: ViewContext) => void) {
  const ctx = useApp((s) => s.viewContext)
  useEffect(() => {
    if (!ctx) return
    onContext(ctx)
    useApp.getState().clearViewContext()
  }, [ctx])
}

