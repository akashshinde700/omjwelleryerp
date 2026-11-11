// Pure stock valuation maths — no React, no Prisma. Shared by the stock form
// (live preview) and POST/PUT /api/stock (server-side truth). Keep every
// formula here; nowhere else should re-derive net/fine weight or making charge.
//
// Formulas (reconciled against STOCK_ADD_PANEL_CALCULATION.md, the reverse-engineered
// spec of oMunim's omStockFormCalculations.js — the oMunim JS itself was NOT present in
// the "raw sources" workspace handed to this task, only an unrelated scaffold project; every
// citation below is to that markdown doc, section numbers as printed there):
//   net weight    = gross − (less + packet + tag)                          [spec §6 STEP 1]
//   final purity  = purity% + wastage%                                     [spec §6 STEP 4]
//   fine weight   = (final purity / 100) × <basis weight>   (basis = wastage-on setting, default net)
//                                                                           [spec §6 STEP 3-4; our single
//                                                                            `fineWeight` IS oMunim's
//                                                                            post-wastage "FINAL FINE WT" —
//                                                                            we never separately track their
//                                                                            pre-wastage "FN WT" intermediate,
//                                                                            nothing downstream reads it]
//   making charge = rate × <basis weight>              (per_gram)          [spec §7 GM]
//                 | rate% × <basis weight> × rate/gram  (percent)          [spec §7 %]
//                 | rate                                (fixed)            [spec §7 FX]
//                 | rate × qty                           (per_piece)       [spec §7 PP]
//                 | rate × caratWeight                   (per_carat)       [spec §7 CT]
//   NB calcCharge()'s 'CT' type is rate × (grams / 0.2) — real carats. Owner decision 2026-09-29, overruling
//   the literal oMunim spec (`value × weight`). Do not restore parity: that was a 5x under-charge.
//   item value    = fine weight × rate/gram + making + labour, rounded once at the end
//   final valuation chain (computeFinalValuationChain) = valuation + making + other + hallmark + tax
//                                                                           [spec §9, primary formula]
//
// §6 STEP 1 divergence, deliberately kept: the spec's own formula is `GROSS − (PKT + STONE_LESS_WEIGHT)`
// — two subtrahends (their "less weight" field IS the stone deduction, same concept as ours) — and never
// mentions their separate `sttr_tag_weight` field in the net-weight formula at all, even though §4.4 lists
// it as a real input. We keep subtracting tagWeight too: when it's 0 (the common case, and the ONLY case
// the spec's own worked examples exercise) our formula is byte-identical to theirs; when a shop actually
// weighs a price/security tag, excluding its weight from the fine-gold figure is simply correct — a tag
// is not gold. Never silently reproduce a documented omission that would overvalue stock.
//
// §6 STEP 2 (karat → %) divergence, deliberately kept: the spec's raw arithmetic, `karat × 100 / 24`,
// gives 22K = 91.67% and 24K = 100.00%. Our constants.ts table (91.6% / 99.9%) instead matches BIS IS
// 1417 hallmarking fineness — the legally stamped standard (916, 875, 750, 585 for 22/21/18/14K) — which
// is NOT simple arithmetic rounding (14K's stamped fineness is 585, not the arithmetic 583.33; 24K's
// practical fineness is 999, never a theoretical 1000). Adopting the raw formula would misprice by
// ~₹70 per ₹1,00,000 of 22K gold in the WRONG direction relative to what a BIS hallmark actually
// certifies. See constants.ts for the full reasoning. The raw formula IS adopted, though, as the
// normalizePurityPercent() fallback for karats outside the standard table (e.g. "17K"), where there is
// no official fineness mark to defer to and returning 0 (the old, silent behaviour) would be worse.
//
// §7 charge types divergence, deliberately partial: oMunim documents KG/GM/MG/PP/CT/%/FX (7 types) plus
// a KG↔GM↔MG cross-conversion table for when a charge's unit differs from the item's weight unit. We are
// grams-only by deliberate decision (no KG/MG weight units anywhere in this schema), so that conversion
// table is not ours to port — say so rather than building dead code for units we never collect. PP and
// CT are genuine gaps we DO close here (hallmarking and most hand-charged making fees are billed per
// piece; stone charges per carat) — see MakingType below.
//
// §8 GST divergence, deliberately kept: oMunim taxes making/product/hallmark as three separately-rated
// components; computeStockGst() below uses ONE composite rate for goods+making+hallmark+other combined,
// because bundled making charges are a COMPOSITE supply taxed at the metal rate (src/lib/gst.ts carries
// the same legal doctrine for invoicing). This is not just a policy choice glossed over: when all three
// of oMunim's components share one rate (the legally correct case, and the only case their own Example 2
// exercises), the two schemes produce IDENTICAL totals — verified in tests/unit/stock-calc.test.ts against
// the spec's own worked Example 2 (₹4,300.24 tax, ₹75,970.87 final, both ways). Do not "fix" this back to
// a three-way split.
//
// §6 STEP 5 (valuation basis) — kept, not a bug: oMunim's `sttr_final_valuation_by` is a per-firm setting
// (byGrossWt|byNetWt|byFineWt|byFFineWt, default byFFineWt). Our `wastageBasis` setting (default 'net')
// computes fine weight the same way byFFineWt does by default (final purity × net weight) — same default,
// same knob, just fewer named variants ('fine' is circular under wastage and folds into 'net', see
// CalcSettings.wastageBasis below). A firm valuing on gross vs net will get different totals for the
// same purity — that is the setting working as designed, not purity being ignored.
//
// Round only once, at the value actually stored/shown: weight to `weightDecimals`
// (2 or 3 dp), money to 2dp half-up. Never round an intermediate and feed it back into
// the NEXT FORMULA — but a weight that IS the stored/shown value (StockItem.finalWeight,
// netWeight, fineWeight; the Calculation Steps panel's own printed numbers) is not an
// intermediate, it is the output, and every formula priced FROM it must use the same
// rounded figure. See computeOmunimStock()'s STEP 1/3/4 rounding for the case this
// distinction exists to prevent: gold rate 30602.76.../g, finalFineWeightGrams
// 10.306259...g rounds to 10.306g for storage/display, but pricing off the unrounded
// 10.306259...g gave finalValuation Rs 31,540.00 while computeItemDetail — which only
// ever sees the stored 10.306g — re-derived Rs 31,539.21 from the SAME item. 79 paise of
// "one pledge priced two ways", found by qa-api, on 99.8% of a 500k-input random sweep.

import { PURITY_PERCENT } from './constants'

/** 'finalFine' added for oMunim's BY FINAL FINE WT option; the older three are unchanged, so every
 *  existing stored setting and every caller keeps its current meaning. */
export type WeightBasis = 'net' | 'gross' | 'fine' | 'finalFine'
// per_kg added for silver (quoted per kg, not per gram/10g — the 100x error spec §5/§6 STEP 6
// warns about) alongside goldRateToPerGram()'s GoldRateUnit, which already had it. This is the
// per-ITEM rate unit (CalcSettings.rateUnit, one firm-wide setting the stock form's "Metal Rate"
// field uses for every item regardless of metal) — settings.tsx's dropdown only offers
// per_gram/per_10g today, so a firm pricing both gold (per 10g) and silver (per kg) on the same
// form has no correct option for silver yet. That UI gap is out of this file's scope (settings.tsx
// is not on be-inventory's file list for this task) — hand back to ux-dataentry/fe-platform to add
// the third radio option; ratePerGram() below is ready for it.
export type RateUnit = 'per_gram' | 'per_10g' | 'per_kg'
export type RoundOff = 'none' | 'nearest1' | 'nearest0.5'
// spec §7: KG · GM · MG · PP · CT · % · FX (7 types). We support fixed(FX) | per_gram(GM) |
// percent(%) | per_piece(PP) | per_carat(CT) — 5 of 7. KG/MG deliberately NOT ported: we are
// grams-only (no KG/MG weight units in this schema), so oMunim's KG↔GM↔MG cross-conversion table
// (spec §7) has nothing to convert between here.
export type MakingType = 'fixed' | 'per_gram' | 'percent' | 'per_piece' | 'per_carat'

/**
 * ── THE SHOP'S CALCULATION POLICY ─────────────────────────────────────────────────────────────
 *
 * oMunim's "ADD STOCK OPTIONS" page, as one firm-scoped object. These are the owner's decisions
 * about HOW an item is costed, not per-item data: two identical bangles must not price differently
 * because a counter picked a different basis on a Tuesday.
 *
 * Stored as flat `Setting` rows keyed `calc.*` (firmId + key), parsed by parseCalcSettings below.
 * There is deliberately NO separate settings Context: this object is already fetched from
 * /api/settings and consumed by computeItemDetail(), the stock route and the Add Stock form, and a
 * second store holding the same policy is how two screens start disagreeing about one shop.
 */
export interface CalcSettings {
  makingBasis: WeightBasis // net | gross | fine | finalFine — which weight making charge is calculated on
  /** Same question for the LABOUR row. oMunim keeps the two separate; shops really do bill making
   *  on net and labour on gross. */
  labourBasis: WeightBasis
  wastageBasis: WeightBasis // net | gross — which weight wastage/fine-weight is calculated on ('fine' is circular, treated as 'net')
  /** Which weight the metal amount is priced from — oMunim's ADD STOCK FINAL VALUATION. */
  valuationBasis: WeightBasis
  /**
   * oMunim's ADD STOCK FINAL FINE WEIGHT BY. In our engine final fine weight is ONE step,
   * `(purity + wastage) × basis / 100`, so this and wastageBasis are the same lever seen from two
   * directions — oMunim splits them because it computes a separate wastage WEIGHT first. Kept as
   * its own setting so the page matches theirs, and it simply defaults from wastageBasis.
   */
  finalFineBasis: WeightBasis
  /**
   * ADD STOCK METAL RATE BY PURITY. On, choosing a purity/carat also moves the metal rate to the
   * matching rate-board entry, so a 22K item cannot sit on a 24K rate. Off, the rate is whatever
   * was last picked or typed.
   */
  metalRateByPurity: boolean
  /**
   * ADD STOCK HALLMARK GST. On (the default, and what the engine has always done), the hallmark
   * charge sits in the taxable base. Off, it is still charged but not taxed — some firms treat it
   * as a reimbursed pass-through of the BIS fee.
   */
  hallmarkGst: boolean
  /** STOCK OPTIONS — whether stock is managed as tagged unique pieces or by category quantity. */
  stockMode: 'category' | 'tagging'
  rateUnit: RateUnit // metal rate quoted per 1g, 10g or kg
  roundOff: RoundOff // round the final item value
  weightDecimals: 2 | 3 // weight storage/display precision
  /**
   * ₹ per piece, applied via MakingType 'per_piece' to totalHallmarkCharges when a client doesn't
   * send one (see applyCalcFallback in src/app/api/stock/route.ts). Default 0 — spec §4.2's
   * `sttr_hallmark_charges` defaults to 100 (type PP) and is silently pre-filled on every item,
   * which is how a real, legitimate per-piece charge read as a "phantom ₹100" in a live demo: it
   * cost money the operator never chose to charge. Hallmarking genuinely isn't free, so the field
   * stays — but nothing is charged until a firm deliberately sets this above 0.
   */
  hallmarkChargePerPiece: number
}

export const DEFAULT_CALC_SETTINGS: CalcSettings = {
  makingBasis: 'net',
  labourBasis: 'net',
  wastageBasis: 'net',
  valuationBasis: 'finalFine', // what computeOmunimStock has always priced metal from
  finalFineBasis: 'net',       // matches the engine's documented byFFineWt default (see STEP 4)
  // ON by default as of the owner's instruction that picking a purity fills that purity's rate "in
  // all forms". It was false, which meant a shop that never found this switch got no fill at all —
  // and a 22K item left sitting on a 24K rate is the single most expensive slip the stock form
  // allows (~₹12,000 per 10 g on today's board). Off is still honoured, for a firm that genuinely
  // quotes one blended rate; the fill was always overridable either way.
  metalRateByPurity: true,
  hallmarkGst: true,           // the engine's existing behaviour — hallmark is in the taxable base
  stockMode: 'tagging',
  rateUnit: 'per_10g', // matches existing "Gold 22K (per 10gm)" convention in settings.tsx / gold-rate route
  roundOff: 'none',
  weightDecimals: 3,
  hallmarkChargePerPiece: 0,
}

/** Setting model keys (firmId + key, per prisma/schema.prisma Setting). */
export const CALC_SETTING_KEYS = {
  makingBasis: 'calc.makingBasis',
  labourBasis: 'calc.labourBasis',
  wastageBasis: 'calc.wastageBasis',
  valuationBasis: 'calc.valuationBasis',
  finalFineBasis: 'calc.finalFineBasis',
  metalRateByPurity: 'calc.metalRateByPurity',
  hallmarkGst: 'calc.hallmarkGst',
  stockMode: 'calc.stockMode',
  rateUnit: 'calc.rateUnit',
  roundOff: 'calc.roundOff',
  weightDecimals: 'calc.weightDecimals',
  hallmarkChargePerPiece: 'calc.hallmarkChargePerPiece',
} as const

/**
 * The shop's policy, translated into the form's own vocabulary.
 *
 * CalcSettings speaks in WeightBasis ('net' | 'gross' | 'fine' | 'finalFine') because that is what
 * computeItemDetail and the stock route already use. The Add Stock form's dropdowns speak ChargeBy
 * ('byNetWt' | …) because that is what computeOmunimStock takes. One translation, here, so the two
 * vocabularies meet in exactly one place instead of a ternary in every component.
 */
export function basisToChargeBy(b: WeightBasis): ChargeBy {
  if (b === 'gross') return 'byGrossWt'
  if (b === 'fine') return 'byFineWt'
  if (b === 'finalFine') return 'byFFineWt'
  return 'byNetWt'
}

export function chargeByToBasis(c: ChargeBy): WeightBasis {
  if (c === 'byGrossWt') return 'gross'
  if (c === 'byFineWt') return 'fine'
  if (c === 'byFFineWt') return 'finalFine'
  return 'net'
}

/** Build CalcSettings from the flat rows /api/settings returns, defaulting anything unset. */
export function parseCalcSettings(rows: { key: string; value: string }[] | undefined | null): CalcSettings {
  const v = new Map((rows || []).map((r) => [r.key, r.value]))
  const pick = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
    const raw = v.get(key)
    return raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback
  }
  const BASES = ['net', 'gross', 'fine', 'finalFine'] as const
  // A stored boolean is whatever the settings form wrote; accept the obvious spellings rather than
  // silently falling back to the default on 'YES'/'1'/'on'.
  const bool = (key: string, fallback: boolean): boolean => {
    const raw = (v.get(key) || '').trim().toLowerCase()
    if (!raw) return fallback
    return ['1', 'true', 'yes', 'on'].includes(raw)
  }
  const decimals = Number(v.get(CALC_SETTING_KEYS.weightDecimals))
  const hallmarkRaw = Number(v.get(CALC_SETTING_KEYS.hallmarkChargePerPiece))
  return {
    makingBasis: pick(CALC_SETTING_KEYS.makingBasis, BASES, DEFAULT_CALC_SETTINGS.makingBasis),
    labourBasis: pick(CALC_SETTING_KEYS.labourBasis, BASES, DEFAULT_CALC_SETTINGS.labourBasis),
    wastageBasis: pick(CALC_SETTING_KEYS.wastageBasis, ['net', 'gross'], DEFAULT_CALC_SETTINGS.wastageBasis),
    // valuationBasis reaches computeOmunimStock's finalFineBy, which is the MONEY lever. 'fine' there
    // applies purity twice (the fine weight already carries purity, and STEP 5 multiplies it in
    // again): 10.000g of 22K at 2% wastage prices at 140535.86 on 'net' but 128735.14 on 'fine' —
    // 8.4% short. Same defect class as commit 59db3e8. Coerced to 'net' so a firm that already
    // stored it (or a hand-edited row) is charged correctly. Do NOT re-add it. finalFineBasis is
    // NOT coerced: it only reaches valuationBy, a display-only figure, where 'fine' is harmless.
    valuationBasis: ((b) => (b === 'fine' ? 'net' : b))(
      pick(CALC_SETTING_KEYS.valuationBasis, BASES, DEFAULT_CALC_SETTINGS.valuationBasis)),
    // Defaults FROM wastageBasis when unset: in a one-step final-fine formula they are the same
    // lever, so an owner who has only answered the wastage question has already answered this one.
    finalFineBasis: pick(CALC_SETTING_KEYS.finalFineBasis, BASES,
      pick(CALC_SETTING_KEYS.wastageBasis, ['net', 'gross'], DEFAULT_CALC_SETTINGS.finalFineBasis as 'net' | 'gross')),
    metalRateByPurity: bool(CALC_SETTING_KEYS.metalRateByPurity, DEFAULT_CALC_SETTINGS.metalRateByPurity),
    hallmarkGst: bool(CALC_SETTING_KEYS.hallmarkGst, DEFAULT_CALC_SETTINGS.hallmarkGst),
    stockMode: pick(CALC_SETTING_KEYS.stockMode, ['category', 'tagging'], DEFAULT_CALC_SETTINGS.stockMode),
    rateUnit: pick(CALC_SETTING_KEYS.rateUnit, ['per_gram', 'per_10g', 'per_kg'], DEFAULT_CALC_SETTINGS.rateUnit),
    roundOff: pick(CALC_SETTING_KEYS.roundOff, ['none', 'nearest1', 'nearest0.5'], DEFAULT_CALC_SETTINGS.roundOff),
    weightDecimals: decimals === 2 || decimals === 3 ? decimals : DEFAULT_CALC_SETTINGS.weightDecimals,
    hallmarkChargePerPiece: Number.isFinite(hallmarkRaw) && hallmarkRaw >= 0 ? hallmarkRaw : DEFAULT_CALC_SETTINGS.hallmarkChargePerPiece,
  }
}

// ═══════════════════ Counter-side calculation settings (Sell / Purchase / Old metal / Rate cut) ═══════════════════

export type MakingSource = 'addStock' | 'lastEntry'
/** What absorbs the difference when the agreed total is BELOW the computed one. */
export type ReverseLessLever = 'discount' | 'making' | 'wastage' | 'metalRate'
/** ...and when it is ABOVE. No 'discount': a negative discount is a false invoice, which is
 *  exactly why oMunim's own "amount MORE" list has no discount option either.
 *  gst.ts declares the same four strings itself (it imports this file, so we cannot import it). */
export type ReverseMoreLever = 'making' | 'wastage' | 'metalRate'
export type OldMetalPricing = 'agreedRate' | 'fineAtPureRate'
export type RateCutMode = 'none' | 'per10g' | 'amount'
/** How old metal is settled against a sale: cash (rupees, bhav cut applies) or metal to metal. */
export type ExchangeMode = 'cash' | 'noRateCut' | 'rateCut'
/** Net or gross only. 'fine' is the 8.4% purity-twice trap (see parseCalcSettings) and
 *  'finalFine' is numerically identical to 'net' here, so neither is offered. */
export type MetalBasis = 'net' | 'gross'

/**
 * The counter's own decisions, beside CalcSettings (which is the Add Stock card). Stored as flat
 * `calc.sell.*` / `calc.purchase.*` / `calc.oldMetal.*` / `calc.rateCut.*` Setting rows.
 *
 * Every default is exactly what the code did before these settings existed, so a firm with none of
 * these rows behaves byte-identically. There is deliberately no valuationBasis/finalFineBasis pair
 * here: on a sale line both oMunim questions land on the same `finalFineBy` lever, so `metalBasis`
 * is the one honest control.
 */
export interface CounterCalcSettings {
  sell: {
    /** Unset inherits calc.metalRateByPurity (what sell.tsx reads today), NOT a literal true. */
    metalRateByPurity: boolean
    /** -> SaleLineInput.finalFineBy. The weight wastage is applied to AND the weight the metal is priced from. */
    metalBasis: MetalBasis
    /** -> default `by` on the sale line's Making/Labour/Other charge rows. */
    chargeBasis: WeightBasis
    makingSource: MakingSource
    /** Lever when the agreed total is below the computed one. */
    reverseLess: ReverseLessLever
    /** Lever when it is above. Parser refuses 'discount' here. */
    reverseMore: ReverseMoreLever
  }
  purchase: {
    metalRateByPurity: boolean
    metalBasis: MetalBasis
    chargeBasis: WeightBasis
  }
  oldMetal: { pricing: OldMetalPricing }
  rateCut: { defaultMode: RateCutMode; basis: MetalBasis }
}

export const COUNTER_CALC_SETTING_KEYS = {
  sellMetalRateByPurity: 'calc.sell.metalRateByPurity',
  sellMetalBasis: 'calc.sell.metalBasis',
  sellChargeBasis: 'calc.sell.chargeBasis',
  sellMakingSource: 'calc.sell.makingSource',
  sellReverseLess: 'calc.sell.reverseLess',
  sellReverseMore: 'calc.sell.reverseMore',
  purchaseMetalRateByPurity: 'calc.purchase.metalRateByPurity',
  purchaseMetalBasis: 'calc.purchase.metalBasis',
  purchaseChargeBasis: 'calc.purchase.chargeBasis',
  oldMetalPricing: 'calc.oldMetal.pricing',
  rateCutDefaultMode: 'calc.rateCut.defaultMode',
  rateCutBasis: 'calc.rateCut.basis',
} as const

export const DEFAULT_COUNTER_CALC_SETTINGS: CounterCalcSettings = {
  sell: {
    metalRateByPurity: DEFAULT_CALC_SETTINGS.metalRateByPurity, // only the fallback of the fallback; see parser
    metalBasis: 'net',        // bill-item-entry emptyDraft's byFFineWt, numerically identical to byNetWt
    chargeBasis: 'net',       // bill-item-entry NO_CHARGE is byNetWt
    makingSource: 'addStock', // draftFromStock takes the stock item's own makingCharge
    reverseLess: 'discount',  // the old 'auto' when rounding down
    reverseMore: 'making',    // the old 'auto' when rounding up; the old key is gone, not migrated
  },
  purchase: {
    metalRateByPurity: DEFAULT_CALC_SETTINGS.metalRateByPurity,
    metalBasis: 'net',
    chargeBasis: 'net',
  },
  oldMetal: { pricing: 'agreedRate' }, // net x rate, tunch recorded but not multiplied (gst.ts)
  rateCut: { defaultMode: 'none', basis: 'net' }, // per-10g cut x old-metal net weight
}

/** Build CounterCalcSettings from the flat rows /api/settings returns, defaulting anything unset. */
export function parseCounterCalcSettings(rows: { key: string; value: string }[] | undefined | null): CounterCalcSettings {
  const v = new Map((rows || []).map((r) => [r.key, r.value]))
  const K = COUNTER_CALC_SETTING_KEYS
  const D = DEFAULT_COUNTER_CALC_SETTINGS
  const pick = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
    const raw = v.get(key)
    return raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback
  }
  const bool = (key: string, fallback: boolean): boolean => {
    const raw = (v.get(key) || '').trim().toLowerCase()
    if (!raw) return fallback
    return ['1', 'true', 'yes', 'on'].includes(raw)
  }
  const METAL = ['net', 'gross'] as const
  // Charge rows take the FULL WeightBasis on purpose. A charge's `by` only feeds calcCharge, which
  // multiplies a weight, so 'fine' is a legitimate (if unusual) basis for making and carries no
  // purity-twice risk. Only the METAL basis is restricted. Do not "tidy" the two lists together.
  const CHARGE = ['net', 'gross', 'fine', 'finalFine'] as const
  // The firm-wide Add Stock switch is the fallback, so a firm that turned it off keeps it off on
  // the counter until it answers the per-flow question.
  const byPurity = bool(CALC_SETTING_KEYS.metalRateByPurity, D.sell.metalRateByPurity)
  return {
    sell: {
      metalRateByPurity: bool(K.sellMetalRateByPurity, byPurity),
      metalBasis: pick(K.sellMetalBasis, METAL, D.sell.metalBasis),
      chargeBasis: pick(K.sellChargeBasis, CHARGE, D.sell.chargeBasis),
      makingSource: pick(K.sellMakingSource, ['addStock', 'lastEntry'], D.sell.makingSource),
      reverseLess: pick(K.sellReverseLess, ['discount', 'making', 'wastage', 'metalRate'], D.sell.reverseLess),
      reverseMore: pick(K.sellReverseMore, ['making', 'wastage', 'metalRate'], D.sell.reverseMore),
    },
    purchase: {
      metalRateByPurity: bool(K.purchaseMetalRateByPurity, byPurity),
      metalBasis: pick(K.purchaseMetalBasis, METAL, D.purchase.metalBasis),
      chargeBasis: pick(K.purchaseChargeBasis, CHARGE, D.purchase.chargeBasis),
    },
    oldMetal: { pricing: pick(K.oldMetalPricing, ['agreedRate', 'fineAtPureRate'], D.oldMetal.pricing) },
    rateCut: {
      defaultMode: pick(K.rateCutDefaultMode, ['none', 'per10g', 'amount'], D.rateCut.defaultMode),
      basis: pick(K.rateCutBasis, METAL, D.rateCut.basis),
    },
  }
}

function roundHalfUp(n: number, dp: number): number {
  const f = 10 ** dp
  return Math.round((n + Number.EPSILON) * f) / f
}

export function roundWeight(n: number, decimals: 2 | 3 = 3): number {
  return roundHalfUp(n || 0, decimals)
}

export function roundMoney(n: number): number {
  return roundHalfUp(n || 0, 2)
}

// "NNK" not in PURITY_PERCENT (e.g. "17K", "23.5K") — no official BIS fineness mark exists for an
// off-standard karat, so fall back to oMunim's own STEP 2 arithmetic (spec §6): karat × 100 / 24.
// Before this fallback existed, Number("17K") was NaN and the whole item silently priced at 0.
const CARAT_RE = /^(\d+(?:\.\d+)?)\s*K$/i

/** Accepts karat string ("22K"), a decimal fraction (0.916) or a percent (91.6) → canonical percent (0-100). */
export function normalizePurityPercent(input: string | number | null | undefined): number {
  if (input == null || input === '') return 0
  if (typeof input === 'string') {
    const key = input.trim().toUpperCase()
    if (PURITY_PERCENT[key] != null) return PURITY_PERCENT[key]
    const carat = key.match(CARAT_RE)
    if (carat) return (Number(carat[1]) * 100) / 24
    const n = Number(key)
    if (isNaN(n)) return 0
    return n > 0 && n <= 1 ? n * 100 : n
  }
  return input > 0 && input <= 1 ? input * 100 : input
}

export function computeNetWeight(grossWeight: number, lessWeight = 0, packetWeight = 0, tagWeight = 0): number {
  return Math.max(0, (grossWeight || 0) - (lessWeight || 0) - (packetWeight || 0) - (tagWeight || 0))
}

export function computeFinalPurity(purityPercent: number, wastagePercent: number): number {
  return (purityPercent || 0) + (wastagePercent || 0)
}

export function computeFineWeight(weights: { gross: number; net: number }, finalPurityPercent: number, basis: WeightBasis = 'net'): number {
  const base = basis === 'gross' ? weights.gross : weights.net
  return ((base || 0) * (finalPurityPercent || 0)) / 100
}

/**
 * A stock item's fine weight for a movement report, when the item itself may predate finalWeight
 * being populated. Deliberately the SAME fallback expression as the SQL FINE_WEIGHT_EXPR in
 * src/app/api/stock/ledger/route.ts (COALESCE(finalWeight, netWeight x purityPercent / 100)) — one
 * formula, asked in JS here (melt assignment, before a batch row exists to query) and in SQL there
 * (aggregate reconciliation). Never invents a third way to estimate fine weight.
 */
export function estimateFineWeight(item: { finalWeight?: number | null; netWeight?: number | null; purityPercent?: number | null }): number {
  if (item.finalWeight != null) return item.finalWeight
  return ((item.netWeight || 0) * (item.purityPercent || 0)) / 100
}

/**
 * Melting/refining (see prisma/schema.prisma MeltBatch): several costed items go in, ONE bullion
 * bar comes out at a re-weighed gross and a re-assayed purity. No new formula — the recovered fine
 * weight is computeFineWeight() on a 'gross' basis (a solid bar has no less/packet/tag to net out,
 * so net weight = gross weight for this one purpose). The loss is the difference, computed on full
 * precision and rounded exactly once; a negative loss (recovered more than went in) is a weighment
 * error the caller must reject, never silently clamped to zero and hidden.
 */
export interface MeltResultInput {
  fineWeightIn: number // sum of source items' fine weight (see estimateFineWeight), unrounded
  recoveredGrossWeight: number // the bar as actually weighed
  recoveredPurity: string | number | null | undefined // karat, decimal or percent — see normalizePurityPercent
  metalRate: number // INR per GRAM (not per 10g) — see the metal-scheme precedent in src/lib/scheme.ts
  weightDecimals?: 2 | 3
}

export interface MeltResultOutput {
  finalPurity: number
  recoveredFineWeight: number
  /** Unrounded — callers that need to reject a negative loss (or value it against a cap) use this,
   *  not the rounded `lossFineWeight`, so the 400 check and the stored figure never disagree by a
   *  rounding hair. */
  lossFineWeightRaw: number
  lossFineWeight: number
  lossValue: number
}

export function computeMeltResult(input: MeltResultInput): MeltResultOutput {
  const decimals = input.weightDecimals ?? 3
  const finalPurity = normalizePurityPercent(input.recoveredPurity)
  const recoveredFineWeightRaw = computeFineWeight(
    { gross: input.recoveredGrossWeight, net: input.recoveredGrossWeight },
    finalPurity,
    'gross'
  )
  const recoveredFineWeight = roundWeight(recoveredFineWeightRaw, decimals)
  const lossFineWeightRaw = (input.fineWeightIn || 0) - recoveredFineWeightRaw
  const lossFineWeight = roundWeight(lossFineWeightRaw, decimals)
  const lossValue = roundMoney(lossFineWeightRaw * (input.metalRate || 0))
  return { finalPurity, recoveredFineWeight, lossFineWeightRaw, lossFineWeight, lossValue }
}

function weightForBasis(basis: WeightBasis, weights: { gross: number; net: number; fine: number }): number {
  return weights[basis]
}

// ═══════════════════ oMunim Add-Stock parity (STOCK_ADD_FORM_SPEC.md) ═══════════════════
// Everything below is a SECOND, ADDITIVE layer used by computeOmunimStock() and the new
// Add Stock form's live preview. It does not replace CalcSettings/computeStockCalc above —
// existing callers (route.ts, settings.tsx, stock-item-detail.tsx) are untouched. Weight
// units (GM/KG/MG) are being adopted here — see STOCK_ADD_FORM_SPEC.md divergence #4 — by
// normalising to grams ONCE at the boundary (toGrams) and doing every formula in grams; a
// stray KG is a 1000x mis-valuation, so this conversion is tested, not just displayed.

/** Weight unit as entered on the Add Stock form. Normalise with toGrams() before any maths. */
export type WeightUnit = 'GM' | 'KG' | 'MG'

/** spec §5 conversion divisors, weight-unit side: KG×1000, GM×1, MG÷1000 → grams. */
export function toGrams(value: number, unit: WeightUnit): number {
  const v = value || 0
  if (unit === 'KG') return v * 1000
  if (unit === 'MG') return v / 1000
  return v
}

/**
 * spec "Charge By" / "Valuation By" dropdown — which weight a charge or the valuation itself
 * is computed on. All four weights are already in GRAMS. Distinct from the legacy WeightBasis
 * above ('net'|'gross'|'fine', no finalFine) — that type is untouched and still serves
 * CalcSettings.makingBasis/wastageBasis; do not merge the two.
 */
export type ChargeBy = 'byNetWt' | 'byGrossWt' | 'byFineWt' | 'byFFineWt'

export function resolveWeightBy(by: ChargeBy, w: { gross: number; net: number; fine: number; finalFine: number }): number {
  if (by === 'byGrossWt') return w.gross
  if (by === 'byFineWt') return w.fine
  if (by === 'byFFineWt') return w.finalFine
  return w.net
}

/** spec §7: the 7 charge-type codes (KG/GM/MG/PP/CT/%/FX) offered on every charge row. */
export type ChargeType = 'KG' | 'GM' | 'MG' | 'PP' | 'CT' | '%' | 'FX'

/** The three metal books this app prices in. 'other' is a REAL option, not a fallback: a shop
 *  sells platinum, palladium, brass and panchdhatu, and quotes every one of them per gram. */
export type MetalKind = 'gold' | 'silver' | 'other'

/**
 * THE ONE PLACE a stored/typed metalType string becomes the engine's union.
 *
 * Every form used to write `x === 'silver' ? 'silver' : 'gold'` inline (the sell line, Add Stock,
 * twice) which silently collapsed 'other' INTO GOLD — so an "Other" metal was divided by 10 as if
 * it were quoted per 10 g, under a field labelled "₹/10gm", and nothing anywhere was per gram.
 * The engine below has always supported 'other'; only these ternaries stopped it being reachable.
 * Never re-open that ternary at a call site: ask this.
 */
export function metalKind(m: string | null | undefined): MetalKind {
  const s = (m || '').trim().toLowerCase()
  return s === 'silver' ? 'silver' : s === 'other' ? 'other' : 'gold'
}

/**
 * GRAMS PER QUOTED UNIT — gold per 10 g, silver per kg, every other metal per gram.
 *
 * metalAmount() divides by exactly this and METAL_RATE_UNIT_LABEL labels exactly this, so a rate
 * FIELD, the heading above it and the engine that prices it cannot be given three different
 * opinions. That divergence is a 10x/100x mispricing and it has already happened on this project
 * twice (the per-gram figure printed under a "₹/10 g" invoice heading; the silver rate saved
 * unconverted and re-read 100x over). Whenever you need one of these two, take BOTH from here.
 */
export const METAL_RATE_PER_GRAMS: Record<MetalKind, number> = { gold: 10, silver: 1000, other: 1 }
export const METAL_RATE_UNIT_LABEL: Record<MetalKind, string> = { gold: '₹/10gm', silver: '₹/kg', other: '₹/gm' }

/** A rate in the METAL'S OWN convention -> ₹ per gram. The inverse is perGramToMetalRate(). */
export function metalRateToPerGram(rate: number, metal: string | null | undefined): number {
  return (rate || 0) / METAL_RATE_PER_GRAMS[metalKind(metal)]
}

/** ₹ per gram -> the metal's own quoting convention. Exact inverse of metalRateToPerGram(). */
export function perGramToMetalRate(perGram: number, metal: string | null | undefined): number {
  return (perGram || 0) * METAL_RATE_PER_GRAMS[metalKind(metal)]
}

/**
 * spec STEP 5 (metal amount) — Gold is quoted per 10g, Silver per kg, everything else per gram.
 * Reused verbatim by calcCharge()'s '%' branch below: a percentage charge is priced as if the
 * resulting percentage figure were itself a fine-weight amount (spec STEP 6 '%' sub-table).
 *
 * The divisor is METAL_RATE_PER_GRAMS, not three branches — same table the UI labels its rate box
 * from, so the two can never disagree. Numerically identical to the branches it replaces.
 */
export function metalAmount(finalFineWeightGrams: number, rate: number, metal: MetalKind): number {
  return ((finalFineWeightGrams || 0) * (rate || 0)) / METAL_RATE_PER_GRAMS[metalKind(metal)]
}

/**
 * spec STEP 6 — one charge row (Lab/Making/Other; Hallmark calls this with type usually 'PP').
 * `weightGrams` must already be resolveWeightBy(...)'s result — GRAMS, never a raw KG/MG value.
 * Because weight is normalised to grams at the boundary, the spec's 3×3 KG/GM/MG cross-conversion
 * table (charge unit × item weight unit) collapses to the three lines below — proven cell-by-cell
 * in tests/unit/stock-calc.test.ts so nobody "restores" a table that was never needed, only hidden
 * by the unit conversion happening earlier.
 */
export function calcCharge(opts: {
  value: number
  type: ChargeType
  weightGrams: number
  qty?: number
  metalRatePerUnit?: number
  metal?: 'gold' | 'silver' | 'other'
}): number {
  const value = opts.value || 0
  const w = opts.weightGrams || 0
  if (opts.type === 'KG') return value * (w / 1000)
  if (opts.type === 'GM') return value * w
  if (opts.type === 'MG') return value * (w * 1000)
  if (opts.type === 'PP') return value * (opts.qty ?? 1)
  // CT: a charge labelled "per carat" is per real carat — grams / 0.2. OWNER DECISION 2026-09-29,
  // overruling oMunim's literal `value * weight` (which billed per GRAM under a per-carat label:
  // Rs 10/ct on 9.5 g gave Rs 95 instead of Rs 475). Add Stock (computeOmunimStock) and the sell
  // line (computeSaleLine -> computeOmunimStock) both land here. Do not "restore parity".
  if (opts.type === 'CT') return value * (w / CARAT_TO_GRAM)
  if (opts.type === 'FX') return value
  // '%': pct = (value × weight) / 100, then that pct figure is priced as a METAL AMOUNT —
  // spec STEP 6 '%' sub-table, identical divisors to metalAmount() above (gold /10, silver /1000).
  const pct = (value * w) / 100
  return metalAmount(pct, opts.metalRatePerUnit || 0, opts.metal || 'gold')
}

// ───────────────────────── stones set into a piece ─────────────────────────

/** Units a stone's WEIGHT can be entered in. Carat is the trade default; the rest exist because a
 *  parcel of small stones is weighed in grams and chips in milligrams. */
export type StoneWeightUnit = 'CT' | 'GM' | 'MG' | 'KG'
/** Units a stone's RATE can be quoted in. PP = per piece, FX = one fixed amount for the lot. */
export type StoneRateUnit = 'CT' | 'GM' | 'MG' | 'KG' | 'PP' | 'FX'

/** One metric carat is 200 mg, exactly, by definition. */
export const CARAT_TO_GRAM = 0.2

/** A stone's entered weight in grams — the one unit everything else is derived from. */
export function stoneWeightGrams(weight: number, unit: StoneWeightUnit = 'CT'): number {
  const w = Number(weight) || 0
  if (unit === 'GM') return w
  if (unit === 'MG') return w / 1000
  if (unit === 'KG') return w * 1000
  return w * CARAT_TO_GRAM // CT
}

/**
 * What one stone row is worth.
 *
 * Separate from calcCharge() because the inputs differ (a stone row has its own weight unit and rate
 * unit; PP uses the stone's qty), not because the carat maths differs: since 2026-09-29 calcCharge's
 * CT branch also converts grams to real carats (owner decision), so both agree 6 CT at ₹200/CT is
 * ₹1,200, not ₹240.
 */
export function stoneValue(opts: {
  weight: number; weightUnit?: StoneWeightUnit
  rate: number; rateUnit?: StoneRateUnit
  qty?: number
}): number {
  const rate = Number(opts.rate) || 0
  const unit = opts.rateUnit || 'CT'
  if (unit === 'FX') return roundMoney(rate)
  if (unit === 'PP') return roundMoney(rate * (Number(opts.qty) || 1))
  const grams = stoneWeightGrams(opts.weight, opts.weightUnit)
  if (unit === 'GM') return roundMoney(rate * grams)
  if (unit === 'MG') return roundMoney(rate * grams * 1000)
  if (unit === 'KG') return roundMoney(rate * (grams / 1000))
  return roundMoney(rate * (grams / CARAT_TO_GRAM)) // CT
}

/**
 * spec STEP 2 — the carat DROPDOWN's raw arithmetic (22K → 91.666...%). DIVERGENCE 1, settled as
 * "both, and they do not conflict": this function answers "what percent is N carat", the explicit
 * question an operator asks by picking a carat from Section C's dropdown. PURITY_PERCENT in
 * constants.ts is a SEPARATE, unrelated table that keeps seeding the DEFAULT purity from BIS IS
 * 1417 stamped fineness (916/875/750/585) — what is physically stamped on the jewellery, not an
 * arithmetic conversion. Neither replaces the other; normalizePurityPercent() above is untouched
 * and still tries the table before falling back to this same formula for off-standard karats.
 */
export function caratToPurityPercent(carat: number): number {
  return ((carat || 0) * 100) / 24
}

export interface OmunimChargeInput {
  value: number
  type: ChargeType
  by: ChargeBy
}

export interface OmunimStockInput {
  /**
   * THE PURITY THE `metalRate` FIELD IS QUOTED AT, as a percent (0-100). Not the item's purity —
   * the RATE's own basis, which is a different question and used to be a convention somebody
   * remembered. 100 (the default) means a PURE/24K rate, the engine's historical assumption, so
   * every existing caller is unchanged. 91.6 means "this is the 22K rate", and then 10 g of 22K
   * prices at exactly the 22K rate — see STEP 5.
   */
  ratePurityPercent?: number
  grossWeight: number
  grossWeightUnit: WeightUnit
  lessWeight: number
  lessWeightUnit: WeightUnit
  packetWeight: number
  packetWeightUnit: WeightUnit
  /** Grams already — the spec never gives this field its own unit selector (§4.4/STEP 1). */
  tagWeight: number
  /**
   * Total grams of the stones SET INTO this piece that are marked "deduct from gross".
   *
   * A diamond ring's gross weight is metal PLUS stones; the metal is only what is left once the
   * stones come out. Without this the shop pays gold rate on the diamond's weight AND adds the
   * diamond's own value on top — it is charged twice. Deducted at STEP 1 so every downstream
   * figure (net, fine, final fine, metal amount) is computed on metal alone.
   */
  stoneDeductGrams?: number
  qty: number
  purityPercent: number
  wastagePercent: number
  /** spec STEP 3's `sttr_final_val_by` — basis for the pre-wastage "FN WT". Default byNetWt. */
  valuationBy: ChargeBy
  /** spec STEP 4's basis for FINAL FINE WT. Default byFFineWt. */
  finalFineBy: ChargeBy
  metal: MetalKind
  metalRate: number
  /** Value of the stone that IS this item — a Diamond/Stone stock row, priced carat × ₹/carat,
   * where there is no metal to price at all. Sits BESIDE metalAmount in the taxable base and the
   * final valuation, exactly as computeItemDetail() does it (`valuation: metalValue + stoneAmount`),
   * so a stone item values the same on this form as it does everywhere it is read back.
   *
   * Defaults to 0, so every existing caller and every metal item is bit-for-bit unchanged. It is
   * NOT the place for stones set into a gold piece: those are recorded against the item and
   * deliberately not priced (see the Stone model in schema.prisma), and passing them here would
   * double-count once that decision is ever revisited. */
  stoneAmount?: number
  /**
   * oMunim's ADD STOCK HALLMARK GST. Default true = the engine's long-standing behaviour, so every
   * existing caller is unchanged. False leaves the hallmark charge in the FINAL VALUATION but out
   * of the TAXABLE BASE — a firm treating the BIS fee as a reimbursed pass-through rather than
   * part of the supply.
   */
  taxHallmark?: boolean
  charges: {
    lab: OmunimChargeInput
    making: OmunimChargeInput
    other: OmunimChargeInput
    hallmark: OmunimChargeInput
  }
  cgstPercent: number
  sgstPercent: number
  igstPercent: number
}

export interface OmunimStockResult {
  netWeightGrams: number
  fineWeightGrams: number
  finalPurity: number
  finalFineWeightGrams: number
  /** The weight the metal was actually priced from: finalFineWeightGrams re-expressed at
   *  ratePurityPercent. Equals finalFineWeightGrams when the rate is pure. Returned so the form's
   *  Calculation Steps panel and the metal-amount tooltip PRINT this figure instead of re-deriving
   *  it — one engine, one number. */
  rateBasisWeightGrams: number
  metalAmount: number
  /** Echo of the input's stoneAmount (0 for a metal item), so the UI can show the line it is
   *  billing rather than re-deriving it. */
  stoneAmount: number
  /**
   * Recorded but NOT billed — displayed as a memo line only. DIVERGENCE 3, settled: the spec's
   * STEP 8 PROSE lists TOTAL_LAB in the final-valuation sum, but the spec's own worked Example 1
   * (STOCK_ADD_PANEL_CALCULATION.md:717-718, "64754.38 + 6816.25 + 0 + 100 + 0 = 71,670.63") and
   * Example 2 (:751-752, "64754.38 + 6816.25 + 100 + 4300.24 = 75,970.87") both OMIT the ₹95 lab
   * charge from their own pinned totals — this is oMunim's real "Variant 2" branch (§9), not a
   * typo. Excluded from both taxableBase and finalValuation below; still computed and returned so
   * the UI can show it without ever silently billing it.
   */
  totalLab: number
  totalMaking: number
  totalOther: number
  totalHallmark: number
  /** metalAmount + stoneAmount + totalMaking + totalOther + totalHallmark — TOTAL_LAB EXCLUDED (spec STEP 7). */
  taxableBase: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  totalTax: number
  /** metalAmount + stoneAmount + totalMaking + totalOther + totalHallmark + totalTax — TOTAL_LAB EXCLUDED (spec STEP 8, see totalLab). */
  finalValuation: number
}

/**
 * spec STEP 1 through STEP 8, run once, full precision, rounded exactly once per output value.
 * The one function the new Add Stock form calls; the Calculation Steps UI panel composes its own
 * sentences from these numbers — this returns numbers only, no formatted strings, no steps[].
 */
export function computeOmunimStock(input: OmunimStockInput): OmunimStockResult {
  // Boundary conversion: every weight becomes grams here, once, before any formula runs (see file
  // section header above). tagWeight has no unit field on the form — already grams.
  const grossG = toGrams(input.grossWeight, input.grossWeightUnit)
  const lessG = toGrams(input.lessWeight, input.lessWeightUnit)
  const packetG = toGrams(input.packetWeight, input.packetWeightUnit)
  const tagG = input.tagWeight || 0
  const stoneDeductG = Math.max(0, Number(input.stoneDeductGrams) || 0)

  // STEP 1 — net weight. Reuses the existing computeNetWeight(), same formula, grams in/out.
  // Rounded IMMEDIATELY: this is the figure stored as StockItem.netWeight and printed on the
  // Calculation Steps panel, so it is what STEP 3-8 below must price FROM (see file-header note
  // on why this is "the output", not a forbidden re-fed intermediate — qa-api P1, ~79 paise/item).
  // Stones marked for deduction leave with the other subtrahends: they are part of what was
  // weighed, and none of them is metal.
  const netWeightGrams = roundWeight(Math.max(0, computeNetWeight(grossG, lessG, packetG, tagG) - stoneDeductG))

  const purityPercent = input.purityPercent || 0
  const wastagePercent = input.wastagePercent || 0

  // STEP 3 — pre-wastage "FN WT". Basis is normally byNetWt/byGrossWt; if a caller nonetheless
  // passes byFineWt/byFFineWt here (neither is meaningful before STEP 3 has run), fall back to
  // net weight rather than resolving to zero — same "avoid the undefined self-reference" spirit
  // as STEP 4's documented fallback just below. Rounded immediately, same reason as netWeightGrams.
  const fineWeightGrams = roundWeight((purityPercent * resolveWeightBy(input.valuationBy, {
    gross: grossG, net: netWeightGrams, fine: netWeightGrams, finalFine: netWeightGrams,
  })) / 100)

  // STEP 4 — final purity and FINAL FINE WT. byFineWt/byFFineWt are self-referential in the spec's
  // own prose ("FINAL FINE WT uses FINAL FINE WT" for the default). Settled ordering, do not
  // "fix" this into an infinite regress: `fine` resolves to the real STEP 3 result above (no
  // longer circular, it already exists); `finalFine` resolves to NET WEIGHT — that is what
  // oMunim's own default byFFineWt actually computes, and is what makes Example 1 land on 9.025
  // (see STOCK_ADD_PANEL_CALCULATION.md §13 Example 1, STEP 4). Rounded immediately: this is
  // StockItem.finalWeight, the exact number computeItemDetail and the ledger SQL re-derive money
  // from later, so STEP 5-8 below must be computed on this same rounded value or the two engines
  // disagree on every item whose true weight doesn't already land on a clean 3dp boundary.
  const finalPurity = purityPercent + wastagePercent
  const finalFineWeightGrams = roundWeight((finalPurity * resolveWeightBy(input.finalFineBy, {
    gross: grossG, net: netWeightGrams, fine: fineWeightGrams, finalFine: netWeightGrams,
  })) / 100)

  // STEP 5 — metal amount, always priced on FINAL FINE WT (the form's two "By" dropdowns already
  // chose what FINAL FINE WT itself means; spec's separate STEP 5 re-selection collapses to this).
  // Priced on the ROUNDED finalFineWeightGrams above — the stored weight — not full precision.
  //
  // DIVERGENCE (owner's live case, 2026-09-30): this used to price the FINE weight straight at
  // `metalRate`, which is only right when that rate is a PURE/24K rate. Once picking a purity
  // filled the KARAT rate from the Daily Rates board, 10.000 g of 22K (9.160 g fine) at the 22K
  // rate 1,37,538/10 g came to 9.160 x 13753.8 = 1,25,984.81 — purity applied TWICE, the sale
  // short by 11,553 (~8.4%). 10 g of 22K at the 22K rate is 1,37,538.00. A rate declares the
  // purity it is quoted at; the fine weight is re-expressed as a weight of THAT metal first:
  //   rateBasisWeight = finalFine x 100 / ratePurityPercent ; metal = rateBasisWeight x rate / 10
  // With the item's own karat rate this collapses to net weight x rate, grossed up for wastage
  // (91.6 + 3 wastage -> 9.460 -> 10.328 g at the 22K rate). Same doctrine as gst.ts old-metal
  // rows (net x rate, tunch recorded not multiplied) and the girvi pledge in loans.tsx. Default
  // 100 = pure rate = the historical behaviour, bit for bit. Do not restore parity.
  // calcCharge()'s '%' branch deliberately keeps the PLAIN rate: a charge is priced on its own
  // basis weight, with no purity conversion.
  const ratePurityPercent = Number(input.ratePurityPercent) > 0 ? Number(input.ratePurityPercent) : 100
  // Derived from the ROUNDED finalFineWeightGrams on purpose, and it does round twice. The
  // alternative (finalPurity x the STEP 4 basis weight / ratePurityPercent, one rounding) was
  // written, measured and REVERTED: it makes the karat case exactly net x rate, but it breaks the
  // thing STEP 4's rounding exists to guarantee — computeItemDetail only ever sees the STORED 3dp
  // fine weight, so the save side and the item-detail screen would price the same row differently.
  // That is the "one pledge priced two ways" defect in this file's header (79 paise, found on
  // 99.8% of a 500k sweep), and one item contradicting itself on two screens is worse than the
  // drift below. Do not "optimise" this back.
  //
  // KNOWN, MEASURED CONSEQUENCE: because the weight is rounded to 3dp before pricing, a karat-rate
  // sale line can differ from what the girvi pledge (loans.tsx) and the old-metal row (gst.ts)
  // compute for the same metal — they do net x rate with no weight rounding. qa-api's 20k-weight
  // sweep: mean Rs 1.09, max Rs 13.76 (Rs 22.15 on non-3dp weights). Clean weights agree exactly.
  // Before this whole change that same comparison was out by the entire purity factor (~8.4%,
  // Rs 11,553 on 10 g), so this is a large improvement, not a new defect — but it is not zero, and
  // closing it needs the pledge path to round the same way, not this line to round less.
  //
  // It is rounded because it is PRINTED in the form's derivation tooltip — the shown output, not a
  // forbidden re-fed intermediate (see the file header).
  const rateBasisWeightGrams = roundWeight((finalFineWeightGrams * 100) / ratePurityPercent)
  const metal = metalAmount(rateBasisWeightGrams, input.metalRate, input.metal)

  const weightsForCharges = { gross: grossG, net: netWeightGrams, fine: fineWeightGrams, finalFine: finalFineWeightGrams }
  const chargeAmount = (c: OmunimChargeInput) => calcCharge({
    value: c.value,
    type: c.type,
    weightGrams: resolveWeightBy(c.by, weightsForCharges),
    qty: input.qty,
    metalRatePerUnit: input.metalRate,
    metal: input.metal,
  })

  // STEP 6 — each charge row. Hallmark is always resolved with qty applied for PP (per spec's own
  // "TOTAL_HALLMARK = calcCharge(hmValue, hmType, 'byNetWt', ...) // usually PP -> value * QTY").
  const totalLab = chargeAmount(input.charges.lab)
  const totalMaking = chargeAmount(input.charges.making)
  const totalOther = chargeAmount(input.charges.other)
  const totalHallmark = chargeAmount(input.charges.hallmark)

  // STEP 7 — tax. TOTAL_LAB EXCLUDED from the taxable base (see totalLab doc above). Each of
  // CGST/SGST/IGST is rounded to 2dp INDIVIDUALLY before being summed into totalTax — load-bearing:
  // full-precision summation gives 75,970.86 on Example 2, the spec's own pinned answer is
  // 75,970.87 (STOCK_ADD_PANEL_CALCULATION.md:751-752).
  // A stone item has no metal to price; a metal item has no stone value here (see the input doc).
  // They are never both non-zero today, but they are summed rather than switched so that the day
  // one item legitimately has both, the base is already right.
  const stone = Number(input.stoneAmount) || 0
  // Hallmark leaves the TAXABLE base when the firm says so, but never leaves the valuation — it is
  // still money the customer pays. Two different questions, and conflating them would either
  // under-collect GST or quietly drop a real charge off the bill.
  const taxHallmark = input.taxHallmark !== false
  const taxableBase = metal + stone + totalMaking + totalOther + (taxHallmark ? totalHallmark : 0)
  const cgstAmount = roundMoney((taxableBase * (input.cgstPercent || 0)) / 100)
  const sgstAmount = roundMoney((taxableBase * (input.sgstPercent || 0)) / 100)
  const igstAmount = roundMoney((taxableBase * (input.igstPercent || 0)) / 100)
  const totalTax = roundMoney(cgstAmount + sgstAmount + igstAmount)

  // STEP 8 — final valuation. TOTAL_LAB EXCLUDED here too (see totalLab doc above).
  const finalValuation = roundMoney(metal + stone + totalMaking + totalOther + totalHallmark + totalTax)

  return {
    // netWeightGrams/fineWeightGrams/finalFineWeightGrams are already rounded above (STEP 1/3/4) —
    // not re-rounded here, so it's visible at a glance that nothing downstream still owes a round.
    netWeightGrams,
    fineWeightGrams,
    finalPurity: roundMoney(finalPurity),
    finalFineWeightGrams,
    rateBasisWeightGrams,
    metalAmount: roundMoney(metal),
    stoneAmount: roundMoney(stone),
    totalLab: roundMoney(totalLab),
    totalMaking: roundMoney(totalMaking),
    totalOther: roundMoney(totalOther),
    totalHallmark: roundMoney(totalHallmark),
    taxableBase: roundMoney(taxableBase),
    cgstAmount,
    sgstAmount,
    igstAmount,
    totalTax,
    finalValuation,
  }
}

export function ratePerGram(metalRate: number, unit: RateUnit): number {
  if (unit === 'per_10g') return (metalRate || 0) / 10
  if (unit === 'per_kg') return (metalRate || 0) / 1000 // silver convention — same /1000 as goldRateToPerGram()
  return metalRate || 0
}

// ───────────────────────── GoldRate.unit ─────────────────────────
// A firm's daily-rate BOARD (prisma/schema.prisma GoldRate), not the per-item CalcSettings.rateUnit
// above. A shop keeps gold quoted per 10g and silver per kg on the SAME table, so each row carries
// its own unit rather than the firm guessing by metal name — that guess is exactly the 10x/1000x
// error the metal-scheme installment route (src/app/api/schemes/entries/[id]/installments/route.ts)
// already refuses to risk by not defaulting its per-gram rate from GoldRate at all. This is the one
// place that conversion happens; nowhere else should divide a GoldRate.rate by 10 or 1000 inline.
export type GoldRateUnit = 'per_gram' | 'per_10_gram' | 'per_kg'

export function goldRateToPerGram(rate: number, unit: GoldRateUnit | string): number {
  const r = rate || 0
  if (unit === 'per_kg') return r / 1000
  if (unit === 'per_10_gram') return r / 10
  return r // per_gram, or an unrecognised unit — never silently scale an unknown unit
}

export const GOLD_RATE_UNIT_LABEL: Record<GoldRateUnit, string> = {
  per_gram: '/gram',
  per_10_gram: '/10gm',
  per_kg: '/kg',
}

/**
 * The exact inverse of goldRateToPerGram(): a per-gram rate re-expressed in a board unit.
 *
 * It lives here, beside its mirror, for the reason the block above gives. Every form that fills a
 * rate field FROM the daily-rate board has to make the return trip — a ₹/10gm box wants ₹/10gm, a
 * ₹/kg box wants ₹/kg — and a `* 10` or `* 1000` written inline at a form is the same 10x/100x
 * error read backwards. useGoldRates() (src/components/app/use-gold-rates.ts) is the only caller,
 * and it is the only place any form converts a board rate.
 *
 * THE METAL'S OWN QUOTING CONVENTION, which is not the row's unit: a shop quotes gold per 10 g and
 * silver per kg whatever unit the board row happens to be stored in, and that is the unit every
 * "Rate ₹/10gm" / "Rate ₹/kg" field in the app is labelled in. GOLD_RATE_UNIT_LABEL above labels
 * the result, so the label and the number can never disagree.
 */
export function perGramToGoldRateUnit(perGram: number, unit: GoldRateUnit | string): number {
  const r = perGram || 0
  if (unit === 'per_kg') return r * 1000
  if (unit === 'per_10_gram') return r * 10
  return r // per_gram, or an unrecognised unit — never silently scale an unknown unit
}

/** How a shop quotes each metal, regardless of how a board row is stored. See above. */
export const METAL_QUOTE_UNIT: Record<'gold' | 'silver', GoldRateUnit> = {
  gold: 'per_10_gram',
  silver: 'per_kg',
}

/**
 * qty/caratWeight are optional and additive to the existing 5-arg call sites (route.ts,
 * settings.tsx's live preview) — per_piece and per_carat are new charge types (spec §7 PP/CT);
 * every existing caller keeps working unchanged since it never asks for either.
 */
export function computeMakingCharge(
  makingType: MakingType,
  makingValue: number,
  weights: { gross: number; net: number; fine: number },
  basis: WeightBasis,
  metalRatePerGram = 0,
  extra?: { qty?: number; caratWeight?: number }
): number {
  const w = weightForBasis(basis, weights)
  if (makingType === 'per_gram') return (makingValue || 0) * w
  if (makingType === 'percent') return ((makingValue || 0) / 100) * w * (metalRatePerGram || 0)
  if (makingType === 'per_piece') return (makingValue || 0) * (extra?.qty ?? 1) // spec §7 PP, §10 hallmark default
  if (makingType === 'per_carat') return (makingValue || 0) * (extra?.caratWeight ?? 0) // spec §7 CT — stone rows
  return makingValue || 0
}

export function applyRoundOff(amount: number, mode: RoundOff): number {
  if (mode === 'nearest1') return Math.round(amount)
  if (mode === 'nearest0.5') return Math.round(amount * 2) / 2
  return roundMoney(amount)
}

/**
 * The purity a form's metal-rate field is quoted at, from the firm's own policy.
 *
 * `CalcSettings.metalRateByPurity` ON (the default) means picking a purity fills THAT purity's
 * rate — so the rate box holds the 22K rate and the basis is the item's purity. OFF means the
 * rate is left as entered, which the engine has always read as a pure/24K rate.
 *
 * ONE function because the pairing is what matters: karat rate must be priced on net weight,
 * pure rate on fine weight. Two independent dropdowns is how a shop loses 8.4% on every sale with
 * nothing telling it. Every caller — the sell line, Add Stock, the item-detail re-derivation —
 * asks this, never its own ternary.
 */
export function resolveRatePurityPercent(
  settings: Pick<CalcSettings, 'metalRateByPurity'>,
  purityPercent: number | null | undefined,
): number {
  const p = Number(purityPercent) || 0
  return settings.metalRateByPurity && p > 0 ? p : 100
}

export interface StockCalcInput {
  /** Purity the metalRate is quoted at, percent; default 100 (pure). See OmunimStockInput. */
  ratePurityPercent?: number
  grossWeight: number
  lessWeight: number
  packetWeight: number
  tagWeight: number
  purity: string | number | null | undefined
  wastagePercent: number
  makingType: MakingType
  makingRate: number // rate/gram, %, or fixed ₹ — meaning depends on makingType
  labourCharge: number
  metalRate: number
  settings: CalcSettings
}

export interface StockCalcResult {
  netWeight: number
  finalPurity: number
  fineWeight: number // stored as StockItem.finalWeight
  makingCharge: number // resolved ₹ amount — stored as StockItem.makingCharge
  itemValue: number // fine weight × rate + making + labour, rounded per settings
  rateBasisWeight: number // fine weight re-expressed at ratePurityPercent — what the rate was applied to
}

/** The one place the whole chain runs, full precision until the final rounds. */
export function computeStockCalc(input: StockCalcInput): StockCalcResult {
  const s = input.settings
  const purityPercent = normalizePurityPercent(input.purity)
  const netWeightRaw = computeNetWeight(input.grossWeight, input.lessWeight, input.packetWeight, input.tagWeight)
  const finalPurity = computeFinalPurity(purityPercent, input.wastagePercent)
  const fineWeightRaw = computeFineWeight({ gross: input.grossWeight, net: netWeightRaw }, finalPurity, s.wastageBasis)

  const netWeight = roundWeight(netWeightRaw, s.weightDecimals)
  const fineWeight = roundWeight(fineWeightRaw, s.weightDecimals)

  const rate = ratePerGram(input.metalRate, s.rateUnit)
  const makingCharge = roundMoney(
    computeMakingCharge(input.makingType, input.makingRate, { gross: input.grossWeight, net: netWeightRaw, fine: fineWeightRaw }, s.makingBasis, rate)
  )
  // No production caller today (tests only) — fixed anyway so a future caller does not inherit the
  // double-purity bug documented at computeOmunimStock() STEP 5.
  const ratePurityPercent = Number(input.ratePurityPercent) > 0 ? Number(input.ratePurityPercent) : 100
  const rateBasisWeightRaw = (fineWeightRaw * 100) / ratePurityPercent
  const rateBasisWeight = roundWeight(rateBasisWeightRaw, s.weightDecimals)
  const itemValueRaw = rateBasisWeightRaw * rate + makingCharge + (input.labourCharge || 0)
  const itemValue = applyRoundOff(itemValueRaw, s.roundOff)

  return { netWeight, finalPurity: roundMoney(finalPurity), fineWeight, makingCharge, itemValue, rateBasisWeight }
}

// ───────────────────────── GST split ─────────────────────────
// Indian jewellery GST: goods (metal + stone) and making/labour/hallmark/other charges are taxed at
// DIFFERENT rates (3% / 5% by default) and each splits CGST+SGST (same state) or IGST (different
// state) depending on supply type. One rate pair, one supply type, six amounts.

export type SupplyType = 'intra' | 'inter'

export const DEFAULT_METAL_GST_PERCENT = 3

export interface StockGstInput {
  supplyType: SupplyType
  /**
   * The ONE composite rate for the whole item — metal, stone and making alike. Default 3.
   *
   * There is deliberately no separate making-charge rate. Making charges bundled with the
   * jewellery are a COMPOSITE supply taxed at the metal rate; the 5% job-work rate applies to a
   * karigar billing labour, not to a shop selling a finished piece. `src/lib/gst.ts` states this
   * with its legal grounding and the invoicing path already obeys it — a second, contradicting
   * doctrine on the stock side would have the shop taxing the same rupee two different ways
   * depending on which screen it passed through.
   */
  gstPercent: number
  goodsBase: number // metal value + stone amount
  makingBase: number // making + labour + hallmark + other charges
}

export interface StockGstResult {
  priceCgstPercent: number
  priceCgstAmount: number
  priceSgstPercent: number
  priceSgstAmount: number
  priceIgstPercent: number
  priceIgstAmount: number
  makingCgstPercent: number
  makingCgstAmount: number
  makingSgstPercent: number
  makingSgstAmount: number
  makingIgstPercent: number
  makingIgstAmount: number
  totalTax: number
}

/**
 * Splits goods and making tax into CGST/SGST (intra-state) or IGST (inter-state) at half/full rate.
 * Named and shaped exactly like the 12 StockItem GST columns so a caller can spread the result
 * straight into a Prisma `data` object.
 *
 * NOT wired into POST/PUT /api/stock — applyCalcFallback() only fills a column the client left
 * blank, and a firm can edit an item's base amounts long after the original tax rates changed, so
 * back-filling tax here on every save would silently rewrite historical hand-entered GST. This stays
 * a pure function the FORM calls for its live preview; the values it produces travel to the server
 * as ordinary client-sent fields, same as any other typed-in amount.
 */
export function computeStockGst(input: StockGstInput): StockGstResult {
  const goodsBase = input.goodsBase || 0
  const makingBase = input.makingBase || 0
  // ONE rate drives both halves — see StockGstInput.gstPercent. The making columns still exist
  // and are still filled, because the 12 StockItem columns are how a bill shows its own split;
  // they simply carry the same rate the goods do.
  const pct = input.gstPercent || 0
  const isIntra = input.supplyType !== 'inter'

  const priceCgstPercent = isIntra ? pct / 2 : 0
  const priceSgstPercent = isIntra ? pct / 2 : 0
  const priceIgstPercent = isIntra ? 0 : pct
  const makingCgstPercent = priceCgstPercent
  const makingSgstPercent = priceSgstPercent
  const makingIgstPercent = priceIgstPercent

  const priceCgstAmount = roundMoney((goodsBase * priceCgstPercent) / 100)
  const priceSgstAmount = roundMoney((goodsBase * priceSgstPercent) / 100)
  const priceIgstAmount = roundMoney((goodsBase * priceIgstPercent) / 100)
  const makingCgstAmount = roundMoney((makingBase * makingCgstPercent) / 100)
  const makingSgstAmount = roundMoney((makingBase * makingSgstPercent) / 100)
  const makingIgstAmount = roundMoney((makingBase * makingIgstPercent) / 100)

  // Presentation value, not an intermediate fed into another formula — roundMoney() here only
  // absorbs float summation drift (e.g. 12.34 + 56.78 not landing on exactly .12 in binary); the six
  // components above are each already rounded once, per the rule.
  const totalTax = roundMoney(priceCgstAmount + priceSgstAmount + priceIgstAmount + makingCgstAmount + makingSgstAmount + makingIgstAmount)

  return {
    priceCgstPercent, priceCgstAmount, priceSgstPercent, priceSgstAmount, priceIgstPercent, priceIgstAmount,
    makingCgstPercent, makingCgstAmount, makingSgstPercent, makingSgstAmount, makingIgstPercent, makingIgstAmount,
    totalTax,
  }
}

/**
 * spec §9's primary formula, named after it and used verbatim (not re-derived) by
 * computeItemDetail()'s computedSubtotal below: FINAL = VALUATION + MAKING + OTHER + HALLMARK + TAX.
 * `valuation` here is metal value (+ stone amount, if any) — oMunim's "VALUATION"/"sttr_metal_amt".
 * `making` folds in labourCharge too (our own extra billable line — see the file header comment on
 * why we sum both instead of treating them as alternatives the way the spec's example does).
 * Worked example: STOCK_ADD_PANEL_CALCULATION.md §13 Example 1/2, pinned in
 * tests/unit/stock-calc.test.ts.
 */
export function computeFinalValuationChain(parts: { valuation: number; making: number; other: number; hallmark: number; tax: number }): number {
  return roundMoney((parts.valuation || 0) + (parts.making || 0) + (parts.other || 0) + (parts.hallmark || 0) + (parts.tax || 0))
}

// ───────────────────── Item detail / price build-up ─────────────────────
// Pure re-derivation of a *stored* StockItem's price build-up for the customer-facing detail
// view (src/components/app/stock-item-detail.tsx). Deliberately reads only what's already on the
// row — never recomputes against today's Calculation settings, because a firm can change those
// after the item was saved and the build-up must explain the number actually on the item, not a
// different one recomputed under today's rules. Money/weight math here reuses the same
// ratePerGram/roundMoney/normalizePurityPercent primitives as the rest of this file — no new maths.

export interface ItemDetailInput {
  /**
   * Purity the metalRate is quoted at, percent; default 100 (pure). An explicit INPUT, never
   * derived from settings here: computeOmunimStock (save time) and computeItemDetail (read time)
   * must be handed the SAME basis (via resolveRatePurityPercent) or they re-create the "one
   * pledge priced two ways" defect the file header describes. A hidden derivation on one side only
   * is how they drift.
   */
  ratePurityPercent?: number
  category?: string | null
  grossWeight?: number | null
  lessWeight?: number | null
  packetWeight?: number | null
  tagWeight?: number | null
  netWeight?: number | null
  purity?: string | null
  purityPercent?: number | null
  wastagePercent?: number | null
  finalPurity?: number | null
  finalWeight?: number | null
  metalRate?: number | null
  makingType?: string | null
  makingCharge?: number | null
  stoneAmount?: number | null
  stoneWeight?: number | null
  labourCharge?: number | null
  totalHallmarkCharges?: number | null
  otherCharges?: number | null
  totalTax?: number | null
  priceCgstPercent?: number | null
  priceCgstAmount?: number | null
  priceSgstPercent?: number | null
  priceSgstAmount?: number | null
  priceIgstPercent?: number | null
  priceIgstAmount?: number | null
  makingCgstPercent?: number | null
  makingCgstAmount?: number | null
  makingSgstPercent?: number | null
  makingSgstAmount?: number | null
  makingIgstPercent?: number | null
  makingIgstAmount?: number | null
  mrp?: number | null
}

export interface GstLine {
  label: string
  pct: number
  amt: number
}

export interface ItemDetailResult {
  isFineLike: boolean
  gross: number
  less: number
  packet: number
  tag: number
  net: number
  purityPercent: number
  wastage: number
  finalPurity: number
  fineWeight: number
  rateBasisWeight: number
  fineBasisWeight: number
  fineBasisLabel: 'Gross Weight' | 'Net Weight'
  rate: number // ₹/gram, whatever unit the firm entered metalRate in
  metalValue: number
  makingBasisWeight: number
  makingCharge: number
  makingEffectiveRate: number | null // exact only for per_gram (makingCharge ÷ basis weight); null otherwise
  stoneAmount: number
  labourCharge: number
  hallmarkCharge: number
  otherCharges: number
  gstLines: GstLine[]
  taxTotal: number
  computedSubtotal: number // sum of every visible line above, rounded once
  mrp: number
  finalPrice: number // the number actually charged: MRP if set, else the computed subtotal
  subtotalDiffers: boolean // true when a listed MRP disagrees with the build-up by more than rounding
}

const FINE_LIKE_CATEGORIES = new Set(['fine', 'sterling', 'raw'])

export function computeItemDetail(item: ItemDetailInput, settings: CalcSettings = DEFAULT_CALC_SETTINGS): ItemDetailResult {
  const isFineLike = FINE_LIKE_CATEGORIES.has(item.category || '')

  const gross = Number(item.grossWeight) || 0
  const less = Number(item.lessWeight) || 0
  const packet = Number(item.packetWeight) || 0
  const tag = Number(item.tagWeight) || 0
  const net = Number(item.netWeight) || 0
  const purityPercent = item.purityPercent != null ? Number(item.purityPercent) : normalizePurityPercent(item.purity)
  const wastage = Number(item.wastagePercent) || 0
  const finalPurity = item.finalPurity != null ? Number(item.finalPurity) : purityPercent + wastage
  const fineWeight = Number(item.finalWeight) || 0
  const fineBasisWeight = settings.wastageBasis === 'gross' ? gross : net
  const fineBasisLabel: 'Gross Weight' | 'Net Weight' = settings.wastageBasis === 'gross' ? 'Gross Weight' : 'Net Weight'

  const rate = ratePerGram(Number(item.metalRate) || 0, settings.rateUnit)
  const ratePurityPercent = Number(item.ratePurityPercent) > 0 ? Number(item.ratePurityPercent) : 100
  const rateBasisWeight = roundWeight((fineWeight * 100) / ratePurityPercent, settings.weightDecimals)
  const metalValue = isFineLike ? roundMoney(rateBasisWeight * rate) : 0

  // 'fine' and 'finalFine' both resolve to fineWeight here: in this function fineWeight IS the
  // stored StockItem.finalWeight, i.e. the post-wastage figure. Without this a firm that picked
  // BY FINAL FINE WT would have had making silently priced on NET.
  const makingBasisWeight = settings.makingBasis === 'gross' ? gross
    : (settings.makingBasis === 'fine' || settings.makingBasis === 'finalFine') ? fineWeight : net
  const makingCharge = Number(item.makingCharge) || 0
  const makingEffectiveRate = item.makingType === 'per_gram' && makingBasisWeight > 0 ? makingCharge / makingBasisWeight : null

  const gstLines: GstLine[] = [
    { label: 'Price CGST', pct: Number(item.priceCgstPercent) || 0, amt: Number(item.priceCgstAmount) || 0 },
    { label: 'Price SGST', pct: Number(item.priceSgstPercent) || 0, amt: Number(item.priceSgstAmount) || 0 },
    { label: 'Price IGST', pct: Number(item.priceIgstPercent) || 0, amt: Number(item.priceIgstAmount) || 0 },
    { label: 'Making CGST', pct: Number(item.makingCgstPercent) || 0, amt: Number(item.makingCgstAmount) || 0 },
    { label: 'Making SGST', pct: Number(item.makingSgstPercent) || 0, amt: Number(item.makingSgstAmount) || 0 },
    { label: 'Making IGST', pct: Number(item.makingIgstPercent) || 0, amt: Number(item.makingIgstAmount) || 0 },
  ].filter((g) => g.amt > 0)
  const gstTotal = gstLines.reduce((sum, g) => sum + g.amt, 0)
  const taxTotal = Number(item.totalTax) > 0 ? Number(item.totalTax) : gstTotal

  const stoneAmount = Number(item.stoneAmount) || 0
  const labourCharge = Number(item.labourCharge) || 0
  const hallmarkCharge = Number(item.totalHallmarkCharges) || 0
  const otherCharges = Number(item.otherCharges) || 0

  // spec §9 chain: valuation(metal+stone) + making(making+labour) + other + hallmark + tax.
  const computedSubtotal = computeFinalValuationChain({
    valuation: metalValue + stoneAmount,
    making: makingCharge + labourCharge,
    other: otherCharges,
    hallmark: hallmarkCharge,
    tax: taxTotal,
  })
  const mrp = Number(item.mrp) || 0
  const finalPrice = mrp > 0 ? mrp : computedSubtotal
  const subtotalDiffers = mrp > 0 && Math.abs(mrp - computedSubtotal) > 1

  return {
    isFineLike, gross, less, packet, tag, net, purityPercent, wastage, finalPurity, fineWeight,
    rateBasisWeight, fineBasisWeight, fineBasisLabel, rate, metalValue, makingBasisWeight, makingCharge, makingEffectiveRate,
    stoneAmount, labourCharge, hallmarkCharge, otherCharges, gstLines, taxTotal,
    computedSubtotal, mrp, finalPrice, subtotalDiffers,
  }
}

// ═══════════════════ Sale-line pricing (Sell form line entry) ═══════════════════
// The SALE-side sibling of computeOmunimStock() — same engine, reused rather than re-derived.
// bill-item-entry.tsx's own computeDraft() hand-rolled net weight / metal amount / value-add /
// discount / tax a second time; that second path priced off full-precision fine weight while the
// stock side stores the ROUNDED figure — see this file's header comment, ~79 paise per item wrong
// on 99.8% of a 500k-input sweep. computeSaleLine() is the one place a sale line is priced; the
// form calls this, not its own formula.

/**
 * One stone on a SALE line. Priced at `sellRate` — a customer pays what the shop is charging, not
 * what the shop paid — with `rate` (the purchase/cost rate) only as the fallback when the counter
 * left sellRate blank.
 */
export interface SaleLineStone {
  weight: number
  weightUnit: StoneWeightUnit
  /** ₹/carat (or per rateUnit) charged TO THE CUSTOMER. */
  sellRate: number
  /** The purchase rate, used only as the fallback when sellRate is blank. */
  rate?: number
  rateUnit: StoneRateUnit
  qty?: number
  /**
   * This stone is SET INTO the piece, so its weight is already inside grossWeight. THE
   * DOUBLE-CHARGE TRAP (see computeSaleLine): without this flag driving stoneDeductGrams, the shop
   * charges gold rate on the stone's own weight AND adds the stone's value on top.
   */
  deductFromGross?: boolean
}

export interface SaleLineInput {
  /** Purity the metalRate is quoted at, percent; default 100 (pure). See OmunimStockInput. */
  ratePurityPercent?: number
  qty: number
  grossWeight: number; grossWeightUnit: WeightUnit
  lessWeight: number; lessWeightUnit: WeightUnit
  /** Same unit as grossWeight — the stock form gives packet/tag no unit selector of their own either. */
  packetWeight: number
  /** Already grams — no unit field, same as OmunimStockInput.tagWeight. */
  tagWeight: number
  purityPercent: number
  /** CUSTOMER wastage on a sale. */
  wastagePercent: number
  valuationBy: ChargeBy
  finalFineBy: ChargeBy
  /** 'other' is a first-class option (platinum, brass, panchdhatu) priced per GRAM — see
   *  metalKind()/METAL_RATE_PER_GRAMS. It was absent here only because the sell line collapsed it
   *  into 'gold' before this type ever saw it. */
  metal: MetalKind
  /** Rate in the metal's own convention (gold per 10g, silver per kg, other per gram) — same as the
   *  stock form's Metal Rate field, so computeOmunimStock's existing per-metal divisor applies
   *  unchanged. METAL_RATE_PER_GRAMS is the divisor AND the label; never re-derive either. */
  metalRate: number
  /** TRUE = price the metal from weight x rate. FALSE = a tagged piece sold at a flat price (MRP),
   *  carried in `flatPrice` — every weight figure is still computed and still returned either way
   *  (rule 4): the invoice prints net/fine weight regardless of how the piece was priced, and a
   *  dispute turns on them. */
  byWeight: boolean
  flatPrice: number
  stones: SaleLineStone[]
  /**
   * FX ON A SALE LINE MEANS PER PIECE, not per line — settled, not implicit. computeOmunimStock's
   * OWN FX (a lot's total gross weight, one lot) is genuinely a line-total fixed amount; a sale line
   * is priced off ONE stock item's weight with `qty` counting how many of that piece are sold (see
   * the file-section header above this type), so a per-piece meaning is the one consistent with that
   * convention — and it is also the one that does NOT change today's real bills: draftFromStock()
   * (bill-item-entry.tsx) defaults every stock item's making charge to `makingType: 'FX'` carrying
   * that ONE item's own making charge, and qty > 1 on such a line has always meant "qty of THIS
   * piece", each with its own making charge. FX is therefore folded into the same qty-scaled bundle
   * as GM/%/PP/CT in beforeDiscount below, not added once after the multiplication. An operator
   * selling qty 3 of a piece with a ₹500 FX making charge is billed 3 x ₹500, same as before this fix.
   */
  charges: { making: OmunimChargeInput; labour: OmunimChargeInput; other: OmunimChargeInput }
  valueAddPct: number
  markUp: number
  discountPct: number
  /** ONE composite rate for the line — metal + making + labour + other + stones + value-add +
   *  markup, per the composite-supply doctrine in src/lib/gst.ts's header. */
  gstRate: number
  taxed: boolean
}

/**
 * PER PIECE vs LINE TOTAL — read this before printing any field below.
 *
 * LOT vs PIECE (StockItem bridge). Every weight/money column on a StockItem row is a LOT TOTAL for
 * that row's `qty` pieces: { qty: 10, grossWeight: 30 } is 30 g for the whole packet (see the comment
 * in prisma/schema.prisma; the partial-sale split in api/invoices/route.ts depends on it). A lot-sourced
 * sale line is therefore priced with `qty` = 1 against the LOT's totals. `qty` > 1 on a sale line means
 * "that many of ONE piece" and is only valid when the stock row holds a single piece's figures.
 * Passing lot.qty with lot.grossWeight prices the lot per piece (10 x 30 g = 300 g).
 *
 * Every field down to and including `markUp` is priced off ONE piece (qty is not applied to them
 * yet) — that is what `qty` itself being a field here is a signpost for: it tells a caller how many
 * of the PER PIECE figures above it to expect the line to represent. `beforeDiscount` is the first
 * field `qty` has actually been multiplied into, and everything from `beforeDiscount` down through
 * `total` is a LINE TOTAL (already × qty). A Calculation Steps panel that prints `totalMaking` next
 * to `beforeDiscount` without saying "per piece" / "line total" on each will read as internally
 * inconsistent to an operator doing the qty x totalMaking arithmetic in their head — say which is
 * which in the UI, don't just rely on this comment.
 */
export interface SaleLineResult {
  qty: number
  /** PER PIECE. */
  netWeightGrams: number
  /** PER PIECE. */
  fineWeightGrams: number
  finalPurity: number // a percentage, not a weight or money figure — qty does not apply to it either way
  /** PER PIECE. */
  finalFineWeightGrams: number
  /** PER PIECE. finalFineWeightGrams re-expressed at ratePurityPercent — what the rate priced. */
  rateBasisWeightGrams: number
  /** PER PIECE. Grams of the deductFromGross stones actually taken off the gross weight. */
  stoneDeductGrams: number
  /** PER PIECE. Every stone's value, customer sell rate, summed — the figure billed for ONE piece's
   *  stones, whether or not that stone's grams were deducted from the metal weight. */
  stoneValue: number
  /** PER PIECE — byWeight: metal priced off this one piece's weight; !byWeight: `flatPrice` for one piece. */
  metalAmount: number
  /** PER PIECE. Already includes qty once via calcCharge's own PP branch (computeOmunimStock is
   *  called with qty: 1 from here — see computeSaleLine — so PP resolves to one piece's charge). */
  totalMaking: number
  /** PER PIECE, same PP caveat as totalMaking. */
  totalLabour: number
  /** PER PIECE, same PP caveat as totalMaking. */
  totalOther: number
  /** PER PIECE. Customer-wastage weight: netWeightGrams x wastagePercent / 100, in grams. */
  cwWeight: number
  /** PER PIECE (metalAmount x valueAddPct / 100, for the one piece). */
  valueAddAmount: number
  /** PER PIECE, as entered — folded into the qty-scaled bundle the same as an FX making charge. */
  markUp: number
  /** LINE TOTAL — the first field qty has been multiplied into. */
  beforeDiscount: number
  /** LINE TOTAL. */
  discountAmount: number
  /** LINE TOTAL. */
  taxable: number
  gstRate: number // a rate, not an amount — same regardless of qty
  /** LINE TOTAL. */
  tax: number
  /** LINE TOTAL. */
  cgst: number
  /** LINE TOTAL. */
  sgst: number
  /** LINE TOTAL — the figure actually charged for the whole line. */
  total: number
}

// A sale line never hallmarks; computeOmunimStock still requires the slot, so a zero, untaxed,
// non-per-piece charge fills it — value 0 makes the charge type/basis moot.
const SALE_NO_HALLMARK: OmunimChargeInput = { value: 0, type: 'FX', by: 'byNetWt' }

/**
 * The one function the Sell form's line entry calls. Every weight, the metal amount and every
 * charge come from computeOmunimStock() — this function does not re-derive net weight, final
 * purity, the gold-per-10g/silver-per-kg divisor, or calcCharge's per-charge-type maths; it only
 * assembles the sale-specific figures (stone value, value-add, markup, discount, composite tax)
 * around that one engine's output.
 */
export function computeSaleLine(input: SaleLineInput): SaleLineResult {
  const qty = Math.max(1, Number(input.qty) || 1)
  const stones = input.stones || []

  // THE DOUBLE-CHARGE TRAP — the whole point of this function. A stone set into the piece sits
  // inside grossWeight. Sum the grams of only the stones marked deductFromGross (via
  // stoneWeightGrams, never a raw caratWeight) and hand that to computeOmunimStock's own
  // stoneDeductGrams, exactly as stock-add.tsx already does — so the metal is priced on metal
  // alone. The stone's own value is added back in below, in beforeDiscount. Removing this wiring
  // makes the piece 1g "heavier" in gold than it is; see the regression test for the exact amount.
  const stoneDeductGrams = stones.reduce(
    (sum, s) => sum + (s.deductFromGross ? stoneWeightGrams(s.weight, s.weightUnit) : 0), 0
  )

  // A sale prices stones at the SELL rate, one row at a time — never a blended rate across the
  // list (a diamond at ₹2,00,000/ct and a ruby at ₹8,000/ct cannot share one number). stoneValue()
  // converts grams to real carats. Since the owner's 2026-09-29 decision calcCharge's CT branch
  // (making/labour/other charges below) converts the same way, so a carat means one thing in Add
  // Stock, on the sell line, and for stones.
  const stoneValueTotal = roundMoney(stones.reduce(
    (sum, s) => sum + stoneValue({ weight: s.weight, weightUnit: s.weightUnit, rate: s.sellRate || s.rate || 0, rateUnit: s.rateUnit, qty: s.qty }), 0
  ))

  // ONE call for net/fine/final-fine weight, the metal amount and every charge. stoneAmount is
  // deliberately 0 and the gst percents are deliberately 0: this call exists only for the
  // weight/metal/charge maths, not for computeOmunimStock's own STOCK-item taxableBase/
  // finalValuation, which this function replaces with the sale's own order of operations below.
  // qty: 1 HERE, on purpose — NOT the line's `qty`. computeOmunimStock's own calcCharge() applies
  // qty a SECOND time inside its 'PP' branch (`value * qty` — see calcCharge's PP line); this call's
  // only job is to price ONE piece's weight/metal/charges, and the single `* qty` below (beforeDiscount)
  // is where the line's quantity is applied — exactly once, uniformly, to every component. Passing the
  // real qty through here double-billed every per-piece making/labour/other charge: qty=3 at a ₹500
  // PP making charge produced beforeDiscount ₹4,500 (500 x 3 here, then x 3 again below) instead of the
  // correct ₹1,500. GM/%/CT/FX branches of calcCharge never read opts.qty, so PP was the only leak —
  // re-verified against calcCharge's source, not assumed.
  const stockCalc = computeOmunimStock({
    grossWeight: input.grossWeight, grossWeightUnit: input.grossWeightUnit,
    lessWeight: input.lessWeight, lessWeightUnit: input.lessWeightUnit,
    packetWeight: input.packetWeight, packetWeightUnit: input.grossWeightUnit,
    tagWeight: input.tagWeight,
    stoneDeductGrams,
    qty: 1,
    purityPercent: input.purityPercent,
    wastagePercent: input.wastagePercent,
    valuationBy: input.valuationBy,
    finalFineBy: input.finalFineBy,
    metal: input.metal,
    metalRate: input.metalRate,
    ratePurityPercent: input.ratePurityPercent,
    stoneAmount: 0,
    taxHallmark: false,
    charges: { lab: input.charges.labour, making: input.charges.making, other: input.charges.other, hallmark: SALE_NO_HALLMARK },
    cgstPercent: 0, sgstPercent: 0, igstPercent: 0,
  })

  // byWeight:false — a tagged piece sold at MRP. metalAmount becomes flatPrice, rounded once; the
  // weight figures above still come from computeOmunimStock unchanged (rule 4) — they print on the
  // bill and a dispute turns on them regardless of how the piece was priced.
  const metalAmt = input.byWeight ? stockCalc.metalAmount : roundMoney(input.flatPrice)

  const cwWeight = roundWeight((stockCalc.netWeightGrams * (input.wastagePercent || 0)) / 100)
  const valueAddAmount = roundMoney((metalAmt * (input.valueAddPct || 0)) / 100)
  const markUp = roundMoney(input.markUp || 0)

  // Order of operations (rule 7) — same shape bill-item-entry.tsx's computeDraft() used, EXCEPT
  // this now folds in totalLabour and stoneValueTotal, which computeDraft's own sum omitted. That
  // is this function's actual fix, not an accidental behaviour change from the old formula.
  const beforeDiscount = roundMoney(
    (metalAmt + stoneValueTotal + stockCalc.totalMaking + stockCalc.totalLab + stockCalc.totalOther + valueAddAmount + markUp) * qty
  )
  const discountAmount = roundMoney((beforeDiscount * (input.discountPct || 0)) / 100)
  const taxable = roundMoney(Math.max(0, beforeDiscount - discountAmount))

  // Composite GST (rule 6): metal + making + labour + other + stones + value-add + markup on the
  // same HSN is one bundled supply taxed at the metal rate — src/lib/gst.ts's header carries the
  // same doctrine for invoicing. This split is a PREVIEW only: computeInvoiceTotals() applies the
  // firm's real cgst:sgst ratio and the intra/inter decision when the invoice is actually saved.
  const gstRate = input.gstRate || 0
  const tax = input.taxed ? roundMoney((taxable * gstRate) / 100) : 0
  const cgst = input.taxed ? roundMoney(tax / 2) : 0
  // The second half is a SUBTRACTION, never a second rounded multiplication — same technique as
  // splitIntra() in src/lib/gst.ts — so cgst + sgst is exactly `tax`, never a stray half-paisa off.
  const sgst = input.taxed ? roundMoney(tax - cgst) : 0
  const total = input.taxed ? roundMoney(taxable + tax) : taxable

  return {
    qty,
    netWeightGrams: stockCalc.netWeightGrams,
    fineWeightGrams: stockCalc.fineWeightGrams,
    finalPurity: stockCalc.finalPurity,
    finalFineWeightGrams: stockCalc.finalFineWeightGrams,
    rateBasisWeightGrams: stockCalc.rateBasisWeightGrams,
    stoneDeductGrams: roundWeight(stoneDeductGrams),
    stoneValue: stoneValueTotal,
    metalAmount: metalAmt,
    totalMaking: stockCalc.totalMaking,
    totalLabour: stockCalc.totalLab,
    totalOther: stockCalc.totalOther,
    cwWeight,
    valueAddAmount,
    markUp,
    beforeDiscount,
    discountAmount,
    taxable,
    gstRate,
    tax,
    cgst,
    sgst,
    total,
  }
}

// ───────────────────────── Old metal: metal-to-metal exchange ─────────────────────────
// The owner's counter has three ways to settle old metal handed over against a sale:
//   CASH         no netting; the old metal is valued in rupees (and Invoice.bhavCut applies).
//   NO RATE CUT  metal to metal, in full: sell 10 g, receive 10 g, the metal cancels.
//   RATE CUT     metal to metal, partial: sell 10 g, receive 5 g, 5 g cancels and the REST is
//                charged at today's rate.
// NO RATE CUT and RATE CUT are the same arithmetic — what is left over after netting is priced at
// the board rate in both. They differ only in what the counter EXPECTS (a full swap vs a part
// swap), which the screen checks; the figures cannot differ, so there is one function.
//
// HOW IT IS BILLED (follows gst.ts, not a new GST position): the sale line is untouched — metal,
// wastage, making and GST are all on the full piece, because old metal is a PAYMENT that never
// reaches taxableValue. Netting only decides what the old metal is CREDITED at: its FINE weight
// at the pure board rate (OldMetalRow.priceOnFine). Wastage is therefore never cancelled (it is
// part of the sold line's final-fine weight, not of its purity), making is never touched, and a
// customer's 18K can only cancel the pure gold it actually contains.
//
// NET ON FINE WEIGHT, NEVER GROSS GRAMS: 10 g of 22K (9.16 g fine) against 10 g of 18K (7.5 g fine)
// leaves 1.66 g of pure gold uncancelled. Netted gram-for-gram that is given away on every bill.
// PER METAL: gold nets against gold, silver against silver. A row whose metal is not sold on the
// bill is REFUSED (never netted across metals) — that is what Cash is for.

export interface ExchangeSoldLine {
  metal: MetalKind
  /** Net grams of ALL pieces on the line (per-piece net x qty). */
  netWeightGrams: number
  purityPercent: number
  /** ₹ per GRAM exactly as the line was priced (metalRateToPerGram of the line's metal rate). */
  ratePerGram: number
  /** The purity that rate is quoted at: resolveRatePurityPercent() — 100 when it is a pure rate. */
  ratePurityPercent: number
}
export interface ExchangeOldRow {
  type: 'gold' | 'silver' | 'alloy' | 'stone'
  netWeightGrams: number
  /** Purity %, 0-100. */
  tunch: number
}
export interface MetalExchangeLeg {
  metal: 'gold' | 'silver'
  soldFineWeight: number
  oldFineWeight: number
  nettedFineWeight: number
  /** Sold fine weight the old metal did NOT cover — charged at today's rate. */
  shortFineWeight: number
  /** Old fine weight beyond what was sold — credited at the same rate, shown so it is not missed. */
  surplusFineWeight: number
  /** shortFineWeight re-expressed as grams of the sold item's own purity (blended if several lines). */
  shortInSoldPurityGrams: number
  /** Pure board rate per GRAM implied by the sold lines (fine-weighted). */
  pureRatePerGram: number
  /** What the shortfall costs, at pureRatePerGram. */
  shortAmount: number
  /** What the old metal is credited at, i.e. the sum of the rows' engine values. */
  creditAmount: number
}
export interface MetalExchangeRow {
  /** Rate to write on the row, in the metal's quoting unit (₹/10g gold, ₹/kg silver); null = not netted. */
  rate: number | null
  /** Why this row cannot take part; null when it can (or when it is alloy/stone, valued flat). */
  refused: string | null
}
export interface MetalExchangeResult { legs: MetalExchangeLeg[]; rows: MetalExchangeRow[] }

export function computeMetalExchange(sold: ExchangeSoldLine[], old: ExchangeOldRow[]): MetalExchangeResult {
  const metals = ['gold', 'silver'] as const
  const soldBy = Object.fromEntries(metals.map((m) => {
    let fine = 0, net = 0, pureValue = 0
    for (const l of sold) {
      if (l.metal !== m) continue
      const f = roundWeight(computeFineWeight({ gross: l.netWeightGrams, net: l.netWeightGrams }, l.purityPercent))
      if (!(f > 0) || !(l.ratePerGram > 0)) continue // MRP / unpriced / purity-less line: nothing to net against
      const rp = l.ratePurityPercent > 0 ? l.ratePurityPercent : 100
      fine += f; net += l.netWeightGrams; pureValue += f * ((l.ratePerGram * 100) / rp)
    }
    return [m, { fine, net, pureRate: fine > 0 ? pureValue / fine : 0 }]
  })) as Record<'gold' | 'silver', { fine: number; net: number; pureRate: number }>

  const rows: MetalExchangeRow[] = old.map((r) => {
    if (r.type !== 'gold' && r.type !== 'silver') return { rate: null, refused: null }
    if (!(normalizePurityPercent(r.tunch) > 0)) return { rate: null, refused: 'Netting is on fine weight - enter the tunch (purity %) of this row.' }
    const s = soldBy[r.type]
    if (!(s.pureRate > 0)) return { rate: null, refused: `No ${r.type} is sold by weight on this bill, so this row cannot net - settle it as Cash.` }
    return { rate: roundHalfUp(perGramToMetalRate(s.pureRate, r.type), 4), refused: null }
  })

  const legs: MetalExchangeLeg[] = []
  for (const m of metals) {
    const s = soldBy[m]
    const mine = old.map((r, i) => ({ r, row: rows[i] })).filter((x) => x.r.type === m && x.row.rate != null)
    if (!(s.fine > 0) && mine.length === 0) continue
    let oldFine = 0, credit = 0
    for (const { r, row } of mine) {
      const t = normalizePurityPercent(r.tunch)
      oldFine += roundWeight(computeFineWeight({ gross: r.netWeightGrams, net: r.netWeightGrams }, t))
      credit += roundMoney((r.netWeightGrams * t / 100) * ((row.rate as number) / METAL_RATE_PER_GRAMS[m]))
    }
    const shortFine = roundWeight(Math.max(0, s.fine - oldFine))
    const soldPurity = s.net > 0 ? (s.fine * 100) / s.net : 0
    legs.push({
      metal: m,
      soldFineWeight: roundWeight(s.fine), oldFineWeight: roundWeight(oldFine),
      nettedFineWeight: roundWeight(Math.min(s.fine, oldFine)),
      shortFineWeight: shortFine,
      surplusFineWeight: roundWeight(Math.max(0, oldFine - s.fine)),
      shortInSoldPurityGrams: soldPurity > 0 ? roundWeight((shortFine * 100) / soldPurity) : 0,
      pureRatePerGram: s.pureRate,
      shortAmount: roundMoney(shortFine * s.pureRate),
      creditAmount: roundMoney(credit),
    })
  }
  return { legs, rows }
}

/**
 * The ONE place "an unset stock type means retail" lives. StockItem.stockType is nullable, and a
 * count that groups on the raw column puts NULL rows in neither card while the list (which called
 * this rule inline) showed them as retail. Anything that is not 'wholesale' is retail, so the two
 * buckets partition every item — they cannot fail to add up to the total.
 */
export type StockType = 'retail' | 'wholesale'
export const stockTypeOf = (v: string | null | undefined): StockType => (v === 'wholesale' ? 'wholesale' : 'retail')

/** Fold raw groupBy(stockType) groups into exactly one entry per StockType (both always present). */
export function foldStockType<G extends { stockType: string | null; count: number; qty: number; net: number; value: number }>(groups: G[]) {
  const acc = {
    retail: { key: 'retail' as StockType, count: 0, qty: 0, net: 0, value: 0 },
    wholesale: { key: 'wholesale' as StockType, count: 0, qty: 0, net: 0, value: 0 },
  }
  for (const g of groups) {
    const a = acc[stockTypeOf(g.stockType)]
    a.count += g.count; a.qty += g.qty; a.net += g.net; a.value += g.value
  }
  return [acc.retail, acc.wholesale]
}
