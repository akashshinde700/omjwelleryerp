import { describe, it, expect } from 'vitest'
import { parseCounterSettings, DEFAULT_COUNTER_SETTINGS, UI_SETTING_KEYS } from '@/lib/counter-settings'
import { TCS_DEFAULTS } from '@/lib/gst'

const rows = (o: Record<string, string>) => Object.entries(o).map(([key, value]) => ({ key, value }))

describe('parseCounterSettings', () => {
  it('a firm that never opened Setup gets todays behaviour', () => {
    expect(parseCounterSettings(undefined)).toEqual(DEFAULT_COUNTER_SETTINGS)
    expect(parseCounterSettings([])).toEqual(DEFAULT_COUNTER_SETTINGS)
    expect(DEFAULT_COUNTER_SETTINGS.enterMovesNext).toBe(false)
    expect(DEFAULT_COUNTER_SETTINGS.cashLimitSale).toBe(0)
    expect(DEFAULT_COUNTER_SETTINGS.tcsApplicable).toBe(false)
  })

  it('only the exact string "true" turns a flag on', () => {
    expect(parseCounterSettings(rows({ [UI_SETTING_KEYS.enterMovesNext]: 'true' })).enterMovesNext).toBe(true)
    for (const v of ['TRUE', '1', 'yes', 'false', '']) {
      expect(parseCounterSettings(rows({ [UI_SETTING_KEYS.enterMovesNext]: v })).enterMovesNext).toBe(false)
    }
  })

  it('reads the cash limits the sell screen already enforces', () => {
    const s = parseCounterSettings(rows({ cashLimitSale: '200000', cashLimitPurchase: '50000' }))
    expect(s.cashLimitSale).toBe(200000)
    expect(s.cashLimitPurchase).toBe(50000)
  })

  it('junk and negatives never become a limit that blocks every bill', () => {
    const s = parseCounterSettings(rows({ cashLimitSale: '-5', cashLimitPurchase: 'abc' }))
    expect(s.cashLimitSale).toBe(0)
    expect(s.cashLimitPurchase).toBe(0)
  })

  it('TCS numbers fall back to the same defaults the invoice route uses', () => {
    const s = parseCounterSettings(rows({ tcsApplicable: 'true', tcsThreshold: '0', tcsRate: '', tcsRateNoPan: 'x' }))
    expect(s.tcsApplicable).toBe(true)
    expect(s.tcsThreshold).toBe(TCS_DEFAULTS.threshold)
    expect(s.tcsRate).toBe(TCS_DEFAULTS.rate)
    expect(s.tcsRateNoPan).toBe(TCS_DEFAULTS.rateNoPan)
  })

  it('carries explicit TCS values through', () => {
    const s = parseCounterSettings(rows({ tcsThreshold: '50000', tcsRate: '0.075', tcsRateNoPan: '5' }))
    expect(s).toMatchObject({ tcsThreshold: 50000, tcsRate: 0.075, tcsRateNoPan: 5 })
  })
})
