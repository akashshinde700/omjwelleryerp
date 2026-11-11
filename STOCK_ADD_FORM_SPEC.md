# Stock Add Form — build spec (owner-supplied, 2026-09-24)

Handed over verbatim by the shop owner. Companion to `STOCK_ADD_PANEL_CALCULATION.md`
(the reverse-engineered extract of oMunim's `omStockFormCalculations.js`); where the two
agree, they agree. Where this spec and our current code disagree, see "Divergences to
settle" at the bottom — those are judgement calls that must be made explicitly, not by
whichever file was edited last.

---

## Design language

- Professional B2B ERP, not consumer-flashy.
- Page background light gray `#f5f5f5`; white cards for sections.
- Primary deep amber/gold `#b8860b` / `#d4a017`. Secondary dark charcoal `#2c2c2c`.
- Borders subtle gray `#e0e0e0`, 1px. `rounded-lg` cards, `rounded-md` inputs.
- system-ui / Inter. 14px base, 12px labels, 18px section headers, 22px page title.
- `shadow-sm` on cards, `shadow-md` on button hover.
- `max-w-7xl`, centred, `px-4 py-6`.
- 2-column at `lg`, single column on mobile.

## Layout

1. **Sticky header** — logo + "Jewellery ERP"; centre: live rate pills
   `GOLD 24K ₹123,000/10gm | GOLD 22K ₹112,750/10gm | SILVER ₹220,000/kg`;
   right: firm selector, user badge, logout.
2. **Title bar** — `Add Stock — Fine Jewellery`, breadcrumb `Home / Stock / Add Stock / Fine`,
   right: `Reset` (outline) and `Save Stock` (primary amber).
3. **Tab bar** — `Fine Stock · Imitation · Raw Metal · Diamond/Stone`. Active tab amber
   underline + bold. Build **Fine Stock** fully; the rest may be placeholders.
4. **Form body** — white Card, `p-6`, six sections.

### Section A — Item Identification (`grid-cols-3`)
Date (Day/Month/Year selects, default today) · Firm · Metal Type · Metal Rate (readonly,
updates on metal change) · Pre ID (`RG`) · Post ID (`5`) · Brand/Seller · Counter Name ·
Category (`Ring`) · Item Name (`LRing`) · Barcode · Hallmark UID · HSN (`711319`)

### Section B — Weight Details (`grid-cols-4`, amber left border)
Gross Weight **(triggers calc)** · Gross Wt Unit · Less Weight · Less Wt Unit ·
Pkt Weight · Pkt Wt Unit (auto = gross unit, disabled) · **Net Weight (readonly, amber bg)** ·
Net Wt Unit (auto, disabled) · Tag Weight · Quantity (1)

### Section C — Purity Details (`grid-cols-4`)
Tunch / Purity % (92) · Purity in Carat (converts to %) · Wastage % (3) ·
**Final Purity % (readonly, amber)** · **Fine Weight (readonly)** ·
**Final Fine Weight (readonly)** · Calc valuation by (default `byNetWt`) ·
Calc final fine by (default `byFFineWt`)

### Section D — Charges (`grid-cols-3`)
Each row: `[value] [type select] [by select]` → readonly total.

| Row | Default value | Default type | Default by |
|---|---|---|---|
| Labour Charges | 10 | GM | NetWt |
| Making Charges | 10 | % | NetWt |
| Other Charges | — | GM | NetWt |
| Hallmark Charges | 100 | PP | (QTY applies) |

### Section E — Tax / GST (`grid-cols-3`, collapsible)
CGST % → CGST Amt · SGST % → SGST Amt · IGST % → IGST Amt · **Total Tax (bold)**

### Section F — Final Summary (amber gradient card, large numbers)
Metal Amount · Total Lab Charges · Total Making · Total Other · Hallmark Charges ·
Total Tax · ── · **FINAL VALUATION** (28px, bold, amber).
Plus a collapsible **Calculation Steps** panel listing each formula with current values.

## Dropdown options (exact)

```
Metal Type    : Gold, Silver
Metal Rate ID : Gold-24K, Gold-22K, Gold-14K, Silver-999, Silver-925
Firm          : GJ, MAHALAXM, RFID, AVR, TF, AK
Weight Unit   : GM, KG, MG
Purity Carat  : 24K, 22K, 20K, 18K, 14K, 10K
Charge Type   : KG, GM, MG, PP, CT, %, FX
                KG per kilogram · GM per gram · MG per milligram · PP per piece (x qty)
                CT per carat · % percentage of metal value · FX fixed amount
Charge By     : byNetWt, byGrossWt, byFineWt, byFFineWt
Valuation By  : byNetWt, byGrossWt, byFineWt, byFFineWt
```

## Calculation logic — implement exactly

Conversion divisors:
```
Gold   : gmWtInKg=100,   gmWtInGm=10,   gmWtInMg=10000
Silver : srGmWtInKg=1,   srGmWtInGm=1000, srGmWtInMg=1000000
Other  : othGmWtInKg=1000, othGmWtInGm=1, othGmWtInMg=1000
```

**STEP 1 — Net weight**
```
NT_WT = GROSS_WT - PKT_WT
if less weight entered: NT_WT = GROSS_WT - PKT_WT - LESS_WT
Pkt unit and Net unit auto-set to Gross unit.
```

**STEP 2 — Purity conversion (when a carat is picked)**
```
PURITY_PCT = (CARAT * 100) / 24      // 22K -> 91.67, 18K -> 75, 14K -> 58.33
```

**STEP 3 — Fine weight** (round 3 dp)
```
byNetWt   : FINE_WT = (PURITY * NT_WT) / 100
byGrossWt : FINE_WT = (PURITY * GROSS_WT) / 100
```

**STEP 4 — Final purity and final fine weight**
```
FINAL_PURITY  = PURITY + WASTAGE
FINAL_FINE_WT = ((PURITY + WASTAGE) * chosenWeight) / 100
chosenWeight  = NT_WT (byNetWt) | GROSS_WT (byGrossWt) | ...
```

**STEP 5 — Metal amount (VALUATION)**
```
Gold   GM: (FINAL_FINE_WT * RATE) / 10      KG: * 100        MG: / 10000
Silver GM: (FINAL_FINE_WT * RATE) / 1000    KG: * 1          MG: / 1000000
```

**STEP 6 — Charges**
```
resolveWeightBy: byNetWt -> NT_WT | byGrossWt -> GROSS_WT | byFineWt -> FINE_WT
                 byFFineWt -> FINAL_FINE_WT

calcCharge(value, type, weightBy, unit, rate, metal):
  weight = resolveWeightBy(weightBy)
  KG : unit KG -> value * weight | GM -> (value/1000) * weight | MG -> (value/1000000) * weight
  GM : unit KG -> value * 1000 * weight | GM -> value * weight | MG -> (value/1000) * weight
  MG : unit KG -> value * 1000000 * weight | GM -> value * 1000 * weight | MG -> value * weight
  PP : value * QTY
  CT : value * weight
  FX : value
  % : pct = (value * weight) / 100
      Gold   GM: (pct * rate) / 10   KG: (pct * rate) * 100  MG: (pct * rate) / 10000
      Silver GM: (pct * rate) / 1000 KG: (pct * rate) * 1    MG: (pct * rate) / 1000000

TOTAL_LAB / TOTAL_MKG / TOTAL_OTHER = calcCharge(...)
TOTAL_HALLMARK = calcCharge(hmValue, hmType, 'byNetWt', ...)   // usually PP -> value * QTY
```

**STEP 7 — Tax**
```
TAXABLE_BASE = METAL_AMT + TOTAL_MKG + TOTAL_OTHER + TOTAL_HALLMARK
CGST_AMT = TAXABLE_BASE * CGST_PCT / 100   (same for SGST, IGST)
TOTAL_TAX = CGST_AMT + SGST_AMT + IGST_AMT
```

**STEP 8 — Final valuation**
```
FINAL_VALUATION = METAL_AMT + TOTAL_LAB + TOTAL_MKG + TOTAL_OTHER + TOTAL_HALLMARK + TOTAL_TAX
```
Indian number formatting, 2 dp: `71,670.63`.

## Interaction

- Recalculate on every keystroke; debounce 150ms; show a "calculating…" micro-hint.
- Readonly/auto fields get a subtle amber background (`#fffbeb`) and a tooltip showing the
  formula used.
- Number inputs format with Indian separators on blur (`1,23,456.78`).
- Required-field validation: red border + helper text; Save disabled until valid.
- `PP` and `FX` disable the "By" selector — there is no weight basis for them.
- Save → sonner toast "Stock item saved successfully", then reset.
- Calculation Steps panel, e.g.
  `Net Weight = 10 - 0.5 = 9.5 GM` · `Fine Weight = (92 x 9.5) / 100 = 8.74 GM` ·
  `Final Purity = 92 + 3 = 95%` · `Metal Amount = (9.025 x 71750) / 10 = ₹64,754.38`

## Components

shadcn: Card/CardHeader/CardTitle/CardContent · Input (`step=0.001` weights, `0.01` money) ·
Select · Label · Button (amber primary, outline) · Tabs · Badge · Separator · Collapsible ·
Tooltip · sonner Toaster · react-hook-form + zod.

## Defaults

```
Gross Weight ""      Pkt Weight ""     Tunch 92        Wastage 3
Metal Gold           Metal Rate 71750.00               Quantity 1
Lab 10 (GM)          Making 10 (%)     Hallmark 100 (PP)
HSN 711319           Category Ring     Item Name LRing  Pre ID RG   Post ID 5
Rates: Gold 14K 71750 · Gold 22K 112750 · Gold 24K 123000 · Silver 220000
```

## Responsive / accessibility

Mobile single column (header rates wrap) · tablet 2-col · desktop 3-4 col.
Every input has `<Label htmlFor>`; required marked with a red asterisk; selects carry
`aria-label`; colour is never the only error signal; visible focus rings.

---

# Divergences to settle (NOT silently)

This spec is a faithful description of oMunim. Four points conflict with decisions this
codebase already took deliberately, each recorded with its reasoning in
`src/lib/stock-calc.ts` and `src/lib/gst.ts`. Re-decide each one explicitly and write the
outcome down; do not let the last edit win.

1. **Purity 91.67 vs 91.6.** This spec uses `carat * 100 / 24` (22K = 91.67). Our
   `constants.ts` table uses BIS IS 1417 stamped fineness (916/875/750/585 — 14K's stamped
   fineness is 585, not the arithmetic 583.33). Both are defensible; the carat DROPDOWN
   converting by formula and the table seeding the default are not necessarily in conflict.
2. **Hallmark default ₹100.** Spec pre-fills it; we deliberately default to 0 because a
   charge nobody chose is invisible on every item. If the default returns, the Calculation
   Steps panel must show it so it can never be invisible again.
3. **GST.** The spec's `TAXABLE_BASE` is ONE base with three rate fields — which IS the
   composite-supply treatment `src/lib/gst.ts` requires, so there is no conflict. Note that
   `TOTAL_LAB` is excluded from the taxable base yet included in the final valuation; decide
   whether that is intended or an oMunim quirk.
4. **Weight units.** Spec offers GM/KG/MG throughout; we went grams-only because our maths
   had no unit handling and a stray KG is a 1000x mis-valuation. If units come back, the
   conversion table must be implemented and tested, not merely displayed.
