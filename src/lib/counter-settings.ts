/**
 * Settings that shape how the counter behaves, parsed with defaults so a firm that has never
 * opened the Setup screen behaves exactly as it does today.
 *
 * Keys for cash limits and TCS already existed and are already ENFORCED server-side
 * (src/app/api/invoices/route.ts) — they simply had no UI, so a shop had to have someone edit
 * the database to use them. The numeric fallbacks below mirror that route's arithmetic exactly;
 * if they diverged, the Setup screen would show a limit the server does not apply.
 */
import { CASH_LIMIT_KEYS, TCS_SETTING_KEYS, TCS_DEFAULTS } from './gst'

/** Pure-UI preferences. Namespaced `ui.` so they never collide with a calculation key. */
export const UI_SETTING_KEYS = {
  /** 'true' = Enter moves to the next field on a form, like a DOS-era counter terminal. */
  enterMovesNext: 'ui.enterMovesNext',
} as const

export type CounterSettings = {
  enterMovesNext: boolean
  /** Cash above this on one bill demands a PAN (Rule 114B). 0 = no limit enforced. */
  cashLimitSale: number
  cashLimitPurchase: number
  tcsApplicable: boolean
  tcsThreshold: number
  tcsRate: number
  tcsRateNoPan: number
}

export const DEFAULT_COUNTER_SETTINGS: CounterSettings = {
  enterMovesNext: false,
  cashLimitSale: 0,
  cashLimitPurchase: 0,
  tcsApplicable: false,
  tcsThreshold: TCS_DEFAULTS.threshold,
  tcsRate: TCS_DEFAULTS.rate,
  tcsRateNoPan: TCS_DEFAULTS.rateNoPan,
}

export function parseCounterSettings(rows: { key: string; value: string }[] | undefined | null): CounterSettings {
  const v = new Map((rows || []).map((r) => [r.key, r.value]))
  // `Number(x) || fallback` — deliberately the server's own expression, quirk included: a stored
  // 0 (or blank, or junk) reads back as the fallback, so 0 is not a settable threshold or rate.
  // The Setup screen therefore refuses to save 0 rather than silently storing a no-op.
  const num = (key: string, fallback: number) => Number(v.get(key)) || fallback
  return {
    enterMovesNext: v.get(UI_SETTING_KEYS.enterMovesNext) === 'true',
    cashLimitSale: Math.max(0, num(CASH_LIMIT_KEYS.sale, 0)),
    cashLimitPurchase: Math.max(0, num(CASH_LIMIT_KEYS.purchase, 0)),
    tcsApplicable: v.get(TCS_SETTING_KEYS.applicable) === 'true',
    tcsThreshold: num(TCS_SETTING_KEYS.threshold, TCS_DEFAULTS.threshold),
    tcsRate: num(TCS_SETTING_KEYS.rate, TCS_DEFAULTS.rate),
    tcsRateNoPan: num(TCS_SETTING_KEYS.rateNoPan, TCS_DEFAULTS.rateNoPan),
  }
}
