import {
  LayoutDashboard, Users, Package, Receipt, HandCoins,
  Wallet, TrendingDown, PiggyBank, BookOpen, Bell,
  Settings, ShoppingBag, Printer,
} from 'lucide-react'
import type { ViewKey } from '@/store/app'

export type NavItem = {
  key: ViewKey
  label: string
  hindi?: string
  icon: any
  group: 'counter' | 'money' | 'setup'
  desc?: string
}

/**
 * 13 destinations, not 29. The old list was one entry per database table — eight separate doors
 * onto "the books", four onto one counter conversation. Each entry below is one thing a shop
 * actually does; everything that used to be its own screen is now a tab inside one of these
 * (see SECTIONS). No ViewKey was removed, so every deep link and every setView() call still lands.
 */
export const NAV_ITEMS: NavItem[] = [
  // At the counter — what the shop touches with a customer standing in front of it.
  { key: 'dashboard', label: 'Home', hindi: 'होम', icon: LayoutDashboard, group: 'counter', desc: "Rates, customer lookup and today's work" },
  { key: 'customers', label: 'Customers', hindi: 'कस्टमर', icon: Users, group: 'counter', desc: 'Customers, suppliers, karigar, money lenders' },
  { key: 'stock', label: 'Stock', hindi: 'स्टॉक', icon: Package, group: 'counter', desc: 'Items, tagging and transfers between counters' },
  { key: 'sell', label: 'Billing', hindi: 'बिलिंग', icon: Receipt, group: 'counter', desc: 'Bills, quotations, orders and repairs' },
  { key: 'loans', label: 'Gold Loan', hindi: 'गिरवी', icon: HandCoins, group: 'counter', desc: 'Girvi loans and the loan calculator' },

  // Money and books — what is owed, what was spent, what the accountant reads.
  { key: 'udhaar', label: 'Udhaar', hindi: 'उधार', icon: Wallet, group: 'money', desc: 'Money to receive and money to pay' },
  { key: 'schemes', label: 'Schemes', hindi: 'स्कीम', icon: PiggyBank, group: 'money', desc: 'Gold savings kitty' },
  { key: 'expenses', label: 'Expenses', hindi: 'खर्च', icon: TrendingDown, group: 'money', desc: 'Shop expenses' },
  { key: 'reminders', label: 'Follow-ups', hindi: 'फॉलो-अप', icon: Bell, group: 'money', desc: 'Tasks, reminders and SMS to customers' },
  { key: 'daybook', label: 'The Books', hindi: 'बही-खाता', icon: BookOpen, group: 'money', desc: 'Day book, ledger, GST, trial balance, P&L, balance sheet, reports' },

  // Setup — touched once a month, not once an hour.
  { key: 'ecommerce', label: 'Online Store', hindi: 'ऑनलाइन', icon: ShoppingBag, group: 'setup', desc: 'Online store admin' },
  { key: 'print', label: 'Print', hindi: 'प्रिंट', icon: Printer, group: 'setup', desc: 'Barcode labels and invoice templates' },
  { key: 'settings', label: 'Setup', hindi: 'सेटअप', icon: Settings, group: 'setup', desc: 'Preferences, firms and the activity log' },
]

export const NAV_GROUPS: { id: NavItem['group']; label: string; hindi: string }[] = [
  { id: 'counter', label: 'At the counter', hindi: 'काउंटर' },
  { id: 'money', label: 'Money & books', hindi: 'पैसा और बही' },
  { id: 'setup', label: 'Setup', hindi: 'सेटअप' },
]

/**
 * Screens that used to be sidebar entries of their own, now tabs under the nav item they belong to.
 * The tab strip *is* the navigation: selecting a tab calls setView(key), so the active ViewKey is
 * the single source of truth — a deep link from the customer action launcher (setView('orders', ctx))
 * opens the Billing section already on the Orders tab, and a reload comes back to the same tab.
 */
export const SECTIONS: Partial<Record<ViewKey, { key: ViewKey; label: string }[]>> = {
  sell: [
    { key: 'sell', label: 'Sell & Purchase' },
    { key: 'quotations', label: 'Quotations' },
    { key: 'orders', label: 'Orders' },
    { key: 'repairs', label: 'Repairs' },
  ],
  stock: [
    { key: 'stock', label: 'Stock' },
    { key: 'stockadd', label: 'Add Stock' },
    { key: 'insights', label: 'Insights' },
    { key: 'stocktally', label: 'Stock Tally' },
    { key: 'stocktransfer', label: 'Stock Transfer' },
    { key: 'hallmark', label: 'Hallmarking' },
    { key: 'melting', label: 'Melting' },
  ],
  loans: [
    { key: 'loans', label: 'Gold Loan' },
    { key: 'girvicalc', label: 'Girvi Calculator' },
  ],
  reminders: [
    { key: 'reminders', label: 'Reminders' },
    { key: 'sms', label: 'SMS' },
  ],
  daybook: [
    { key: 'daybook', label: 'Day Book' },
    { key: 'journal', label: 'Journal Book' },
    { key: 'ledger', label: 'Ledger' },
    { key: 'bankrec', label: 'Bank Rec' },
    { key: 'trial', label: 'Trial Balance' },
    { key: 'pl', label: 'Profit & Loss' },
    { key: 'balance', label: 'Balance Sheet' },
    { key: 'gst', label: 'GST' },
    { key: 'reports', label: 'Reports' },
  ],
  settings: [
    { key: 'settings', label: 'Settings' },
    { key: 'firms', label: 'Firms' },
    { key: 'logs', label: 'System Logs' },
  ],
}

/** Child ViewKey -> the nav item that should light up for it. Derived, so SECTIONS stays the one list. */
export const VIEW_PARENT: Partial<Record<ViewKey, ViewKey>> = Object.fromEntries(
  Object.entries(SECTIONS).flatMap(([parent, tabs]) => tabs.map((t) => [t.key, parent as ViewKey])),
)

/** The tab strip to render above a view, or undefined for a view that stands alone. */
export function sectionFor(view: ViewKey) {
  const parent = VIEW_PARENT[view]
  return parent ? SECTIONS[parent] : undefined
}
