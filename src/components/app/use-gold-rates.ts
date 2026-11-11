'use client'
/**
 * THE FIRM'S DAILY RATE BOARD, for any form with a purity field.
 *
 * The board (prisma GoldRate, edited on Settings → Daily Rates, shown on the app header's rate
 * pills) carries a real rate per karat since the 24K derivation landed. This hook is how that rate
 * reaches a FORM, so a counter never keys ₹1,37,538 from memory while the header shows it.
 *
 * ONE hook, the same shape as use-calc-settings.ts beside it: ONE React Query key
 * (`['gold-rate', firmId]` — the same one the header ticker, the Daily Rates card and the invoice
 * rate bar already use, so a rate saved on Settings shows up in a form without a reload) and ONE
 * matcher. Four hand-rolled fetches is how two screens end up disagreeing about today's rate.
 *
 * THE UNITS ARE THE WHOLE POINT. A GoldRate row carries its OWN unit (per_gram | per_10_gram |
 * per_kg); a form field is labelled in the METAL's convention (gold ₹/10gm, silver ₹/kg) or in
 * ₹/gram. Both conversions happen HERE, through goldRateToPerGram() / perGramToGoldRateUnit() in
 * stock-calc.ts, and nowhere else: re-deriving a /10 or /1000 inline at a form is exactly the 10x
 * and 100x mispricing this project has already been bitten by twice, once 100x in each direction on
 * silver. A consumer picks the field it is filling — `perGram` or `perMetalUnit` — and gets the
 * matching `unitLabel` with it, so the label and the number cannot drift apart.
 *
 * MATCHING IS ON METAL **AND** PURITY, and misses return null rather than something close:
 *   - metal must be gold or silver ('other' has no board)
 *   - purity is compared as a normalised PERCENT, so '22K', 91.6 and 91.60 are one another and a
 *     silver 925 line can never pick up a gold rate
 *   - no row for that purity -> null, and the caller must leave its field ALONE. Never substitute
 *     the nearest karat: a blank a shopkeeper notices beats a wrong number he does not.
 */
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import {
  goldRateToPerGram, perGramToGoldRateUnit, normalizePurityPercent, roundMoney,
  GOLD_RATE_UNIT_LABEL, METAL_QUOTE_UNIT, type GoldRateUnit,
} from '@/lib/stock-calc'

/** A row as GET /api/gold-rate returns it. */
export type GoldRateRow = {
  id: string
  metal: string
  purity: string
  rate: number
  unit: GoldRateUnit | string
  rateDate?: string
}

/** One matched board row, in every unit a form might be labelled in. */
export type BoardRate = {
  /** The board's own label for the purity it matched — '22K', '925'. Show this, not the input. */
  purity: string
  metal: 'gold' | 'silver'
  /** ₹ per gram. */
  perGram: number
  /** ₹ in the metal's own quoting convention — gold per 10 g, silver per kg. */
  perMetalUnit: number
  /** Label for perMetalUnit: '/10gm' or '/kg'. */
  unitLabel: string
  /** Ready-to-show derivation, for the amber cell's hover title. */
  note: string
}

export type RateBoard = {
  /** False until the firm's own rows have arrived — nothing should be auto-filled before then. */
  loaded: boolean
  /** The CURRENT row per metal+purity (the board's history is not a form's business). */
  rows: GoldRateRow[]
  /** The board rate for this metal+purity, or null when the board does not carry one. */
  find: (metal: string | null | undefined, purity: string | number | null | undefined) => BoardRate | null
}

const EPSILON = 0.05 // 91.6 vs 91.60 vs 91.666… — the same karat, quoted three ways.

export function useGoldRates(firmId: string | null | undefined): RateBoard {
  const { data, isSuccess } = useQuery({
    queryKey: ['gold-rate', firmId],
    queryFn: () => api<{ rates: GoldRateRow[] }>('/api/gold-rate', { search: { firmId: firmId! } }),
    enabled: !!firmId,
  })

  // GET orders newest-first, so the first row seen per metal+purity is the one in force. Same fold
  // the Daily Rates card does — a form must price off today's rate, never a row from last month
  // that happens to sort later.
  const rows: GoldRateRow[] = []
  const seen = new Set<string>()
  for (const r of data?.rates || []) {
    const k = `${String(r.metal).toLowerCase()}|${r.purity.trim().toUpperCase()}`
    if (seen.has(k)) continue
    seen.add(k)
    rows.push(r)
  }

  function find(metalIn: string | null | undefined, purityIn: string | number | null | undefined): BoardRate | null {
    const metal = String(metalIn || '').trim().toLowerCase()
    if (metal !== 'gold' && metal !== 'silver') return null
    const want = normalizePurityPercent(purityIn ?? '')
    if (!(want > 0)) return null
    const row = rows.find(
      (r) => String(r.metal).toLowerCase() === metal
        && Math.abs(normalizePurityPercent(r.purity) - want) < EPSILON,
    )
    if (!row || !(Number(row.rate) > 0)) return null
    const perGram = goldRateToPerGram(Number(row.rate), row.unit)
    const quoteUnit = METAL_QUOTE_UNIT[metal]
    const perMetalUnit = roundMoney(perGramToGoldRateUnit(perGram, quoteUnit))
    const unitLabel = GOLD_RATE_UNIT_LABEL[quoteUnit]
    return {
      purity: row.purity.trim().toUpperCase(),
      metal,
      perGram,
      perMetalUnit,
      unitLabel,
      note: `Today's ${metal} ${row.purity.trim().toUpperCase()} rate from the Daily Rates board`
        + ` (₹${Number(row.rate).toLocaleString('en-IN')}${GOLD_RATE_UNIT_LABEL[(row.unit as GoldRateUnit)] ?? ''}`
        + ` = ₹${perMetalUnit.toLocaleString('en-IN')}${unitLabel}). Type over it to use your own rate.`,
    }
  }

  return { loaded: isSuccess, rows, find }
}
