# 📦 oMunim — STOCK ADD PANEL: Complete Calculation & Flow Documentation

> **Source**: Live analysis of `https://release.omunim.in/2/omHomePage.php?divPanel=OwnerHome`
> **Firm**: GANESH JEWELLERS (Pune) — Login ID: `release`
> **Panel**: STOCK → ADD STOCK → FINE STOCK (RETAIL_FINE_B2)
> **Extracted from**: `omStockFormCalculations.js` (7415 lines) + `omStockFormValidate.js` (849 lines) + live form HTML (2560 lines)

---

## 📑 Table of Contents

1. [Overview & Architecture](#1-overview--architecture)
2. [STOCK Panel Structure](#2-stock-panel-structure)
3. [Form Load Flow (AJAX)](#3-form-load-flow-ajax)
4. [Complete Field Reference](#4-complete-field-reference)
5. [Hidden Conversion Constants](#5-hidden-conversion-constants)
6. [Calculation Engine — Step by Step](#6-calculation-engine--step-by-step)
7. [Charge Types Explained](#7-charge-types-explained)
8. [Tax (GST) Calculation](#8-tax-gst-calculation)
9. [Final Valuation Formula](#9-final-valuation-formula)
10. [Grand Total (Multi-product)](#10-grand-total-multi-product)
11. [Sell Price Calculation](#11-sell-price-calculation)
12. [Validation Rules](#12-validation-rules)
13. [Worked Examples](#13-worked-examples)
14. [All Functions Reference](#14-all-functions-reference)
15. [Panel Variants](#15-panel-variants)

---

## 1. Overview & Architecture

oMunim is a **Jewellery ERP** (cloud-based). The **STOCK ADD panel** is the core inventory entry form used to add gold/silver jewellery items to stock with full weight, purity, and pricing calculations.

### Tech Stack
| Layer | Technology |
|-------|-----------|
| Frontend | HTML + jQuery + Bootstrap |
| Calculation | Vanilla JavaScript (`omStockFormCalculations.js`) |
| Form Loading | AJAX POST to `ogiamndv.php` |
| Backend | PHP 7.2.34 (Apache) |
| Session | PHPSESSID cookie |
| Database | MySQL (inferred) |

### Key Files
| File | Path | Lines | Purpose |
|------|------|-------|---------|
| Calc Engine | `/2/scripts/stockScripts/omStockFormCalculations.js` | 7415 | All weight/purity/charge/tax formulas |
| Validator | `/2/scripts/stockScripts/omStockFormValidate.js` | 849 | Mandatory field + Master Stock checks |
| Form Loader | `/2/include/php/ogiamndv.php?panelName=RETAIL_FINE_B2` | 2560 | Renders the form HTML via AJAX |

---

## 2. STOCK Panel Structure

Clicking **STOCK** on the top menu opens a sub-menu with **6 categories** + 2 tabs:

```
STOCK PANEL
├── FINE STOCK          → Gold/Silver jewellery (weight + purity based)
├── IMITATION STOCK     → Artificial jewellery (price-based)
├── RAW METAL STOCK     → Old gold/scrap (with GST breakup)
├── DIAMOND/STONE STOCK → Diamonds/stones (carat-based, with GST)
├── STOCK REPORTS       → Reports view
└── OTHER OPTIONS       → Bulk import / GO / SUBMIT

Tabs: [WHOLESALE STOCK] [RETAIL STOCK]

Actions:
├── ADD STOCK »         → Add new item
├── EXISTING ITEM »     → Update existing stock
├── PURCHASE ON CASH »  → Cash purchase entry
└── HALLMARKING »       → Hallmarking charges entry
```

### Panel Names (used in AJAX + JS)
| Button | panelName |
|--------|-----------|
| Fine Stock (Retail) | `RETAIL_FINE_B2` |
| Fine Stock (Wholesale) | `FINE_JEWELLERY_WHOLESALE_PUR_B6` / `B7` |
| Imitation Stock | `IMITATION_RETAIL_PUR_JEWELLERY_B6` |
| Crystal/Diamond | `CRYSTAL` / `CRYSTAL_SELL` |
| New Order | `addNewOrderB2` |

---

## 3. Form Load Flow (AJAX)

When you click **ADD STOCK → FINE STOCK**, the browser fires:

```http
POST /2/include/php/ogiamndv.php
  ?panelName=RETAIL_FINE_B2
  &indicator=
  &stockType=
  &transactionType=
  &operation=
  &type=
  &custId=
  &custType=undefined
  &metType=
  &formName=RETAIL_FINE_B2
  &mainPanel=
  &transCRDR=
  &firmId=
  &divName=mainBigMiddle
  &mainUserPanel=
  &preInvNo=
  &postInvNo=
  &girviId=AddStock
  &firmid=undefined
  &staffid=undefined
```

**Response**: HTML form injected into `#mainBigMiddle` div.

Simultaneously, 2 JS files load:
```
GET /2/scripts/stockScripts/omStockFormCalculations.js
GET /2/scripts/stockScripts/omStockFormValidate.js
```

Plus a user-check call:
```
POST /2/include/php/omusercheck.php
```

---

## 4. Complete Field Reference

### 4.1 Item Identification Fields
| Field Name | Label | Type | Default |
|-----------|-------|------|---------|
| `sttr_firm_id` | Firm | select | GJ |
| `sttr_product_type` | METAL TYPE | text | Gold |
| `sttr_metal_rate` | Metal Rate | text | 71750.00 |
| `sttr_metal_rate_id` | Metal Rate ID | hidden | Gold-14K |
| `sttr_item_pre_id` | PRE ID | text | RG |
| `sttr_item_id` | POST ID | text | 5 |
| `sttr_brand_id` | BRAND / SELLER NAME | text | Test |
| `sttr_counter_name` | COUNTER NAME | text | Test |
| `sttr_gender` | GENDER | select | — |
| `sttr_item_image` | Image | file | — |

### 4.2 Barcode & Hallmark
| Field Name | Label | Type | Default |
|-----------|-------|------|---------|
| `sttr_barcode` | ITEM BARCODE | text | — |
| `sttr_hallmark_uid` | ITEM HALLMARK UID | text | — |
| `sttr_hallmark_charges` | TOT HALLMARK CHRGS | text | 100 |
| `sttr_hallmark_charges_type` | type | hidden | PP |
| `sttr_hallmark_cgst_per/amt` | CGST %/AMT | text | 0 |
| `sttr_hallmark_sgst_per/amt` | SGST %/AMT | text | 0 |
| `sttr_hallmark_igst_per/amt` | IGST %/AMT | text | 0 |
| `sttr_bis_mark` | BIS Mark | checkbox | FALSE/TRUE |

### 4.3 Product Details
| Field Name | Label | Type | Default |
|-----------|-------|------|---------|
| `sttr_item_category` | CATEGORY | text | Ring |
| `sttr_item_name` | ITEM NAME | text | LRing |
| `sttr_quantity` | QTY | text | 1 |
| `sttr_hsn_no` | HSN NO | text | 711319 |
| `sttr_item_model_no` | MODEL NO | text | — |
| `sttr_item_other_info` | OTHER INFO | text | — |
| `sttr_product_desc` | Product Description | textarea | — |
| `sttr_product_hashtags` | Hashtags | text | — |

### 4.4 Weight Fields (Core)
| Field Name | Label | Type | Default | Calc? |
|-----------|-------|------|---------|-------|
| `sttr_gs_weight` | GROSS WEIGHT | text | — | Input |
| `sttr_gs_weight_type` | unit | select | GM | Input |
| `sttr_less_weight` | LESS WT | text | — | Input |
| `sttr_less_weight_type` | unit | select | GM | Input |
| `sttr_pkt_weight` | PKT WT | text | — | Input |
| `sttr_pkt_weight_type` | unit | hidden | GM | Auto |
| `sttr_nt_weight` | NT WT | text | — | **Auto** |
| `sttr_nt_weight_type` | unit | hidden | GM | Auto |
| `sttr_tag_weight` | TAG WT | text | — | Input |

### 4.5 Purity Fields
| Field Name | Label | Type | Default | Calc? |
|-----------|-------|------|---------|-------|
| `sttr_purity` | TUNCH | text | 92 | Input |
| `sttr_purity_ct` | Purity in Carat | hidden | — | Input |
| `sttr_wastage` | WASTAGE | text | 3 | Input |
| `sttr_wastage_by` | Wastage by | hidden | custWastgByN | — |
| `sttr_final_purity` | FN PR% | text | 95.00 | **Auto** |
| `sttr_fine_weight` | FN WT | text | 0.000 | **Auto** |
| `sttr_final_fine_weight` | FINAL FINE WT | text | — | **Auto** |
| `sttr_final_val_by` | Final val by | hidden | byFineWt | — |
| `sttr_final_fine_wt_by` | FFN by | hidden | byFineWt | — |
| `sttr_final_valuation_by` | Final valuation by | hidden | byNetWt | — |

### 4.6 Charge Fields
| Field Name | Label | Type | Default |
|-----------|-------|------|---------|
| `sttr_lab_charges` | CW / Lab Charge | text | 10 |
| `sttr_lab_charges_type` | Lab type | select | GM/%/KG/MG/PP/CT/FX |
| `sttr_lbr_charges_by` | Lab by | hidden | — |
| `sttr_other_charges_by` | Other by | hidden | lbByNetWt |
| `sttr_making_charges` | MKG CH | text | 10 |
| `sttr_making_charges_type` | MKG type | select | GM/%/KG/MG/PP/CT/FX |
| `sttr_mkg_charges_by` | MKG by | hidden | mkgByNetWt |
| `sttr_other_charges` | OTH CH | text | — |
| `sttr_other_charges_type` | Other type | select | GM |
| `sttr_value_added` | Value Added | text | — |
| `sttr_cust_wastage` | Customer Wastage | text | — |
| `sttr_cust_wastage_wt` | Cust Wastage Wt | text | — |
| `sttr_cust_wastg_by` | Cust wastg by | hidden | custWastgByN |
| `sttr_markup` | MARK UP | text | — |

### 4.7 Calculated Output Fields
| Field Name | Label | Type | Calc? |
|-----------|-------|------|-------|
| `sttr_metal_amt` | Metal Amount | text | **Auto** |
| `sttr_valuation` | VALUATION | text | **Auto** |
| `sttr_total_lab_charges` / `sttr_total_lab_amt` | TOT LAB | text | **Auto** |
| `sttr_total_making_charges` / `sttr_total_making_amt` | TOT MKG | text | **Auto** |
| `sttr_total_other_charges` | TOT OTH CH | text | **Auto** |
| `sttr_total_hallmark_charges` | TOT HALLMARK | text | **Auto** |
| `sttr_tot_tax` | TOTAL TAX | text | **Auto** |
| `sttr_final_valuation` | FINAL AMT | text | **Auto** |
| `sttr_final_taxable_amt` | Taxable Amt | text | **Auto** |
| `sttr_cust_price` | Customer Price | text | **Auto** |
| `sttr_metal_discount_per` / `sttr_metal_discount_amt` | Discount | text | Input/Auto |

### 4.8 Tax (GST) Fields
| Field Name | Label |
|-----------|-------|
| `sttr_tot_price_cgst_per` / `sttr_tot_price_cgst_chrg` | Product CGST % / AMT |
| `sttr_tot_price_sgst_per` / `sttr_tot_price_sgst_chrg` | Product SGST % / AMT |
| `sttr_tot_price_igst_per` / `sttr_tot_price_igst_chrg` | Product IGST % / AMT |
| `sttr_mkg_cgst_per` / `sttr_mkg_cgst_chrg` | Making CGST % / AMT |
| `sttr_mkg_sgst_per` / `sttr_mkg_sgst_chrg` | Making SGST % / AMT |
| `sttr_mkg_igst_per` / `sttr_mkg_igst_chrg` | Making IGST % / AMT |
| `sttr_other_tax_amt` | Other Tax Amt |

### 4.9 Meta / Status Fields
| Field Name | Default | Purpose |
|-----------|---------|---------|
| `sttr_indicator` | stock | Entry type |
| `sttr_stock_type` | retail | Retail/wholesale |
| `sttr_transaction_type` | EXISTING | NEW/EXISTING |
| `sttr_panel_name` | RETAIL_FINE_B2 | Panel ID |
| `sttr_type` | stock | — |
| `sttr_sell_status` | No | Sold? |
| `sttr_bc_print_status` | No | Barcode printed? |
| `sttr_jewellers_app_status` | NO/YES | App sync? |
| `sttr_omecom_status` | NO/YES | E-commerce? |
| `sttr_fixed_price_status` | FALSE/TRUE | Fixed price? |
| `sttr_item_ent_type` | — | Entry type |

---

## 5. Hidden Conversion Constants

These hidden inputs define how weight units convert to the metal's rate basis (rate is **per 10 grams** for gold, **per 1 kg** for silver):

### Gold Divisors
| Hidden Field | Value | Meaning |
|--------------|-------|---------|
| `gmWtInKg` | 100 | 1 KG gold = 100 × (10gm units) |
| `gmWtInGm` | **10** | Rate is per 10gm (standard) |
| `gmWtInMg` | 10000 | 1 MG = 1/10000 of 10gm unit |

### Silver Divisors
| Hidden Field | Value | Meaning |
|--------------|-------|---------|
| `srGmWtInKg` | 1 | Rate is per KG (standard) |
| `srGmWtInGm` | **1000** | 1 GM = 1/1000 of KG |
| `srGmWtInMg` | 1000000 | 1 MG = 1/1000000 of KG |

### Other Metals Divisors
| Hidden Field | Value | Meaning |
|--------------|-------|---------|
| `othGmWtInKg` | 1000 | — |
| `othGmWtInGm` | 1 | Rate per gram (standard) |
| `othGmWtInMg` | 1000 | — |

### Other Hidden Values
| Hidden Field | Value | Purpose |
|--------------|-------|---------|
| `metalRateValue` | 24K rate | Used for % making charges |
| `sellMkgByPerInd` | true/false | Use 24K rate for MKG? |
| `orderOperation` | update/new | Order mode |

---

## 6. Calculation Engine — Step by Step

The main function is **`stockTransCalcFunc(prodCount, process, discountCal)`** (lines 163–2694 in calc.js). It runs in this sequence:

### STEP 1: Net Weight Calculation

```javascript
// Basic
NT WT = GROSS_WEIGHT − PKT_WEIGHT

// If stone less weight exists
NT WT = GROSS_WEIGHT − (PKT_WEIGHT + STONE_LESS_WEIGHT)
```

**Auto-sync**: `pkt_weight_type` and `nt_weight_type` always copy from `gs_weight_type`.

### STEP 2: Purity Conversion (Carat → %)

```javascript
// If purity entered in carat (e.g. 22K)
PURITY_PERCENT = (PURITY_CARAT × 100) / 24

// Example: 22K → (22 × 100) / 24 = 91.67%
//          18K → (18 × 100) / 24 = 75.00%
//          14K → (14 × 100) / 24 = 58.33%
```

Function: `calculatePurityAccordingToPurityInCarat(prodCount)`

### STEP 3: Fine Weight Calculation

Depends on `sttr_final_val_by` setting:

```javascript
// byNetWt (default)
FINE_WEIGHT    = (PURITY × NT_WEIGHT) / 100
FINAL_FINE_WT  = (PURITY × NT_WEIGHT) / 100

// byGrossWt
FINE_WEIGHT    = (PURITY × GROSS_WEIGHT) / 100
FINAL_FINE_WT  = (PURITY × GROSS_WEIGHT) / 100

// byFineWt — uses fine weight
// byFFineWt — uses final fine weight (recursive default)
```

### STEP 4: Final Purity & Final Fine Weight (with Wastage)

```javascript
// If wastage is entered
FINAL_PURITY (FN PR%) = PURITY + WASTAGE
FINAL_FINE_WT         = ((PURITY + WASTAGE) × WEIGHT) / 100

// If no wastage
FINAL_PURITY = PURITY
FINAL_FINE_WT = (PURITY × WEIGHT) / 100
```

**Example**: Purity 92 + Wastage 3 = **95.00%** → FN PR% field

### STEP 5: Choose Weight for Valuation (`prodFinalFineWeight`)

Based on `sttr_final_valuation_by`:

```javascript
byGrossWt  → prodFinalFineWeight = GROSS_WEIGHT
byNetWt    → prodFinalFineWeight = NET_WEIGHT
byFineWt   → prodFinalFineWeight = FINE_WEIGHT
byFFineWt  → prodFinalFineWeight = FINAL_FINE_WEIGHT  (default)
```

### STEP 6: Metal Amount Calculation

The metal value is computed using the rate basis (Gold = per 10gm, Silver = per kg):

```javascript
// GOLD
if (prodWtType == 'KG')
    METAL_AMT = (FINAL_FINE_WT × RATE) × gmWtInKg       // × 100
else if (prodWtType == 'GM')
    METAL_AMT = (FINAL_FINE_WT × RATE) / gmWtInGm       // / 10
else if (prodWtType == 'MG')
    METAL_AMT = (FINAL_FINE_WT × RATE) / gmWtInMg       // / 10000

// SILVER (uses srGmWtIn* divisors)
if (prodWtType == 'KG')
    METAL_AMT = (FINAL_FINE_WT × RATE) × srGmWtInKg     // × 1
else if (prodWtType == 'GM')
    METAL_AMT = (FINAL_FINE_WT × RATE) / srGmWtInGm     // / 1000
else if (prodWtType == 'MG')
    METAL_AMT = (FINAL_FINE_WT × RATE) / srGmWtInMg     // / 1000000
```

`sttr_metal_amt` and `sttr_valuation` both get this value.

### STEP 7: Lab Charges Calculation

Choose weight basis (`sttr_other_charges_by`):
```javascript
lbByNetWt   → prodLabChargesBy = NT_WEIGHT
lbByGrossWt → prodLabChargesBy = GROSS_WEIGHT
lbByFFineWt → prodLabChargesBy = FINAL_FINE_WEIGHT  (default)
```

Calculate based on type:
```javascript
// Type KG
if (prodWtType == 'KG')  TOT_LAB = LAB_CHARGE × prodLabChargesBy
if (prodWtType == 'GM')  TOT_LAB = (LAB_CHARGE / 1000) × prodLabChargesBy
if (prodWtType == 'MG')  TOT_LAB = (LAB_CHARGE / 1000000) × prodLabChargesBy

// Type GM
if (prodWtType == 'KG')  TOT_LAB = LAB_CHARGE × 1000 × prodLabChargesBy
if (prodWtType == 'GM')  TOT_LAB = LAB_CHARGE × prodLabChargesBy
if (prodWtType == 'MG')  TOT_LAB = (LAB_CHARGE / 1000) × prodLabChargesBy

// Type MG — similar scaling
// Type PP (per piece)  → TOT_LAB = LAB_CHARGE × QTY
// Type FX (fixed)      → TOT_LAB = LAB_CHARGE
// Type CT (carat)      → TOT_LAB = LAB_CHARGE × prodLabChargesBy
```

### STEP 8: Making Charges (MKG) Calculation

Choose weight basis (`sttr_mkg_charges_by`):
```javascript
mkgByNetWt   → prodMkgChargesBy = NT_WEIGHT
mkgByGrossWt → prodMkgChargesBy = GROSS_WEIGHT
mkgByFFineWt → prodMkgChargesBy = FINAL_FINE_WEIGHT
default       → NT_WEIGHT
```

**Special**: If `sellMkgByPerInd == 'true'` and metal is Gold, the **24K rate** (`metalRateValue`) is used instead of the product rate.

Same scaling as Lab for KG/GM/MG/PP/CT/FX types.

**For % type** (special — uses metal rate):
```javascript
MkgCharges = (MKG_CHARGE × prodMkgChargesBy) / 100

// GOLD
if (prodWtType == 'GM')
    TOT_MKG = (MkgCharges × RATE) / gmWtInGm          // / 10
if (prodWtType == 'KG')
    TOT_MKG = (MkgCharges × RATE) × gmWtInKg          // × 100
if (prodWtType == 'MG')
    TOT_MKG = (MkgCharges × RATE) / gmWtInMg          // / 10000

// SILVER uses srGmWtIn* divisors
// OTHER uses othGmWtIn* divisors
```

### STEP 9: Other Charges Calculation

Same logic as MKG. Weight basis: `sttr_other_charges_by` defaults to `lbByNetWt` (uses NET_WEIGHT).

```javascript
// % type
OtherCharges = (OTHER_CHARGE × NT_WEIGHT) / 100
TOT_OTH = (OtherCharges × RATE) / divisor   // metal-specific
```

### STEP 10: Hallmark Charges

```javascript
// Type PP (per piece, default)
TOT_HALLMARK = HALLMARK_CHARGE × QTY

// Type FX (fixed)
TOT_HALLMARK = HALLMARK_CHARGE
```
Default: 100 × 1 = **₹100**

### STEP 11: Discount Calculation (`discountCalcFunc`)

Based on `sttr_metal_discount_type`:
```javascript
// % type
DISCOUNT_AMT = (DISCOUNT_PER × weight) / scaling    // metal-specific
// or by QTY
DISCOUNT_AMT = DISCOUNT_PER × QTY

// Amount type — direct value
```

Discount reduces `sttr_valuation` before tax is applied.

---

## 7. Charge Types Explained

Every charge field (Lab, Making, Other) supports **8 unit types**:

| Code | Name | Formula (GM weight) | Use Case |
|------|------|---------------------|----------|
| **KG** | Per Kilogram | `charge × weight` (if wt in KG) | Bulk metal |
| **GM** | Per Gram | `charge × weight` | Most common (₹/gm) |
| **MG** | Per Milligram | `charge × weight` (if wt in MG) | Fine items |
| **PP** | Per Piece | `charge × QTY` | Hallmarking, fixed per item |
| **CT** | Per Carat | `charge × weight` | Diamonds/stones |
| **%** (per) | Percentage | `(charge × weight / 100) × rate / divisor` | % making on metal value |
| **FX** | Fixed | `charge` (flat amount) | One-time charges |

### Weight Cross-Conversion Table
When charge type ≠ product weight type, conversion happens:

| Charge Type ↓ / Wt Type → | KG | GM | MG |
|---------------------------|----|----|-----|
| **KG** | `chg × wt` | `(chg/1000) × wt` | `(chg/1M) × wt` |
| **GM** | `chg × 1000 × wt` | `chg × wt` | `(chg/1000) × wt` |
| **MG** | `chg × 1M × wt` | `chg × 1000 × wt` | `chg × wt` |

---

## 8. Tax (GST) Calculation

Function: **`taxCalcFunc(prodCount, discountCal)`** (lines 4573–5114)

GST applies on **3 charge components**, each with CGST + SGST + IGST:

### 8.1 Making/Lab Charges GST
```javascript
MKG_CGST_AMT = (TOT_MAKING_CHARGES × MKG_CGST_PER) / 100
MKG_SGST_AMT = (TOT_MAKING_CHARGES × MKG_SGST_PER) / 100
MKG_IGST_AMT = (TOT_MAKING_CHARGES × MKG_IGST_PER) / 100
```

### 8.2 Product Price GST
```javascript
PROD_CGST_AMT = (VALUATION × PROD_CGST_PER) / 100
PROD_SGST_AMT = (VALUATION × PROD_SGST_PER) / 100
PROD_IGST_AMT = (VALUATION × PROD_IGST_PER) / 100
```

### 8.3 Hallmark Charges GST
```javascript
HM_CGST_AMT = (TOT_HALLMARK × HM_CGST_PER) / 100
HM_SGST_AMT = (TOT_HALLMARK × HM_SGST_PER) / 100
HM_IGST_AMT = (TOT_HALLMARK × HM_IGST_PER) / 100
```

### 8.4 Total Tax
```javascript
TOT_TAX = MKG_CGST + MKG_SGST + MKG_IGST
        + PROD_CGST + PROD_SGST + PROD_IGST
        + HM_CGST + HM_SGST + HM_IGST
        + OTHER_TAX_AMT
```

**Note**: CGST+SGST used for **intra-state** sales; IGST for **inter-state**. Usually only one set is filled.

---

## 9. Final Valuation Formula

### Primary Formula (all charges)
```javascript
FINAL_VALUATION = VALUATION (metal amount)
                + TOTAL_MAKING_CHARGES
                + TOTAL_OTHER_CHARGES
                + HALLMARK_CHARGES
                + TOTAL_TAX
```

### Variant 1 (without other charges)
```javascript
FINAL_VALUATION = VALUATION + TOTAL_MAKING + HALLMARK + TOT_TAX
```

### Variant 2 (without making, simpler)
```javascript
FINAL_VALUATION = VALUATION + TOTAL_LAB + TOT_TAX
```

### Variant 3 (new order B2 special)
```javascript
actualFineWeight = (GROSS_WT × PURITY) / 100
VALUATION = (GROSS_WT × RATE) / 10

if (final_val_by == 'byGrossWt' || 'byNetWt')
    FINAL_FINE_WT = GROSS_WT
else
    FINAL_FINE_WT = actualFineWeight
```

---

## 10. Grand Total (Multi-product)

Function: **`calculateFinalAmt()`** (lines 7230–7341)

When multiple products + sub-stones are added:

```javascript
// Sum of all main products
TOTAL_FINAL_VALUATION = Σ(sttr_final_valuation[p])        for p = 0 to noofprod
TOTAL_SELL_VALUATION  = Σ(sttr_cust_price[p])            for p = 0 to noofprod

// Add sub-stones (diamonds) of each product
+ Σ(sttr_final_valuation[p][s])                           for s = 1 to noofsubprod[p]
+ Σ(sttr_cust_price[p][s])

// Grand totals
sttr_total_final_valuation       = TOTAL_FINAL_VALUATION + SUB_STONE_VALUATION
sttr_total_sell_final_valuation  = TOTAL_SELL_VALUATION + SUB_STONE_SELL
```

---

## 11. Sell Price Calculation

Function: **`calculateSellAmt(prodCount)`** (lines 2695–2934)

Computes the **customer selling price** (different from purchase valuation):

### 11.1 Recompute Making Charges for Sell
```javascript
sellMkgCharges = sameCalcAsPurchaseMKG(prodCount)
```

### 11.2 Value Added (Customer Wastage)
Based on `sttr_value_added_by`:
```javascript
byNetWt   → custWastageWt = (NT_WT × CUST_WASTAGE) / 100
byGrossWt → custWastageWt = (GS_WT × CUST_WASTAGE) / 100
byFineWt  → custWastageWt = (FINE_WT × CUST_WASTAGE) / 100
byFFineWt → custWastageWt = (FINAL_FINE_WT × CUST_WASTAGE) / 100  (default)
```

### 11.3 Customer Price
```javascript
SELL_MKG = sellMkgCharges (in rupees)
VALUE_ADDED = custWastageWt × RATE / divisor

CUST_PRICE = VALUATION + SELL_MKG + VALUE_ADDED + OTHERS
```

---

## 12. Validation Rules

Function: **`stockFormValidate(mainNoOfProd)`** + **`stockTransValidationFunc()`**

### 12.1 Mandatory Fields (submit blocked without these)

| # | Field | Error Message |
|---|-------|---------------|
| 1 | `sttr_firm_id` | "Please select Firm!" |
| 2 | `sttr_product_type` | "Please select Product Type!" |
| 3 | `sttr_item_pre_id` | "Please enter Item Pre Id!" |
| 4 | `sttr_item_id` | "Please enter Item Id!" |
| 5 | `sttr_item_category` | "Please enter Item Category!" |
| 6 | `sttr_item_name` | "Please enter Item Name!" |
| 7 | `sttr_gs_weight` | "Please enter Gross Weight!" |
| 8 | `sttr_nt_weight` | "Please enter Net Weight!" |
| 9 | `sttr_fine_weight` | "Please enter Fine Weight!" |
| 10 | `sttr_final_fine_weight` | "Please enter Final Fine Weight!" |
| 11 | `sttr_price` | "Please enter Purchase Price!" |
| 12 | `sttr_product_purchase_rate` | "Please enter Product Purchase Rate!" |
| 13 | `sttr_metal_amt` | "Please enter Metal Amount!" |
| 14 | `sttr_valuation` | "Please enter Final Metal Amount!" |
| 15 | `sttr_purity` | "Please select Item Tunch or Purity!" |
| 16 | `sttr_final_purity` | "Please select Item Tunch or Purity!" |
| 17 | `sttr_final_valuation` | "Please enter Final Amount!" |

### 12.2 Master Stock Range Alerts

If item is linked to a Master Stock entry, these values must match the master's defined range:

| Field | Alert |
|-------|-------|
| Purity | "Item Purity is set by Master Stock (X)! Please Enter Correct Value!" |
| Wastage | "Item Wastage is set by Master Stock (X)! Please Enter Correct Value!" |
| Making Charges | "Making charges are set by Master Stock (X)! Please Enter Correct Value!" |
| Labour Charges | "Labour charges are set by Master Stock (X)! Please Enter Correct Value!" |

---

## 13. Worked Examples

### Example 1: Standard Gold Ring (Fine Stock)

**Inputs:**
| Field | Value |
|-------|-------|
| Gross Weight | 10 GM |
| Pkt Weight | 0.5 GM |
| Purity (Tunch) | 92% |
| Wastage | 3% |
| Metal Rate (14K) | ₹71,750.00 |
| Making Charges | 10 (%) |
| Lab Charges | 10 (GM) |
| Hallmark Charges | 100 (PP) |
| Quantity | 1 |

**Calculations:**

```
STEP 1: NT WT = 10 − 0.5 = 9.5 GM

STEP 2: Purity already in % → 92%

STEP 3: FN WT = (92 × 9.5) / 100 = 8.74 GM

STEP 4: FN PR% = 92 + 3 = 95%
         FINAL FN WT = (95 × 9.5) / 100 = 9.025 GM

STEP 5: prodFinalFineWeight = 9.025 GM (byFFineWt)

STEP 6: METAL_AMT = (9.025 × 71750) / 10 = ₹64,754.38
        VALUATION = ₹64,754.38

STEP 7: Lab Charges (GM type, byNetWt):
         TOT_LAB = 10 × 9.5 = ₹95.00

STEP 8: Making Charges (10% type, byNetWt):
         MkgCharges = (10 × 9.5) / 100 = 0.95
         TOT_MKG = (0.95 × 71750) / 10 = ₹6,816.25

STEP 9: Other Charges = 0 (not entered)

STEP 10: Hallmark (PP type):
          TOT_HALLMARK = 100 × 1 = ₹100.00

STEP 11: Tax = 0 (no GST % entered)

STEP 12: FINAL_VALUATION = 64754.38 + 6816.25 + 0 + 100 + 0
                           = ₹71,670.63
```

**Result:**
| Output Field | Value |
|-------------|-------|
| NT WT | 9.5 GM |
| FN WT | 8.74 GM |
| FN PR% | 95.00% |
| FINAL FN WT | 9.025 GM |
| METAL AMT | ₹64,754.38 |
| TOT LAB | ₹95.00 |
| TOT MKG | ₹6,816.25 |
| TOT HALLMARK | ₹100.00 |
| **FINAL AMT** | **₹71,670.63** |

---

### Example 2: With GST (3% CGST + 3% SGST)

Using Example 1 values + GST 3% CGST, 3% SGST:

```
MKG_CGST = (6816.25 × 3) / 100 = ₹204.49
MKG_SGST = (6816.25 × 3) / 100 = ₹204.49
PROD_CGST = (64754.38 × 3) / 100 = ₹1,942.63
PROD_SGST = (64754.38 × 3) / 100 = ₹1,942.63
HM_CGST = (100 × 3) / 100 = ₹3.00
HM_SGST = (100 × 3) / 100 = ₹3.00

TOT_TAX = 204.49 + 204.49 + 1942.63 + 1942.63 + 3 + 3
        = ₹4,300.24

FINAL_VALUATION = 64754.38 + 6816.25 + 100 + 4300.24
                = ₹75,970.87
```

---

### Example 3: Imitation Stock (Price-Based)

**Inputs:**
| Field | Value |
|-------|-------|
| Quantity | 14 |
| Calculation Type | M (Multiply) |
| Code | 100 |
| Num | 14 |

```
CALC_TYPE = 'M' → PURCHASE_PRICE = CODE × NUM = 100 × 14 = ₹1,400
SELL_PRICE = ₹150 (manually set)
TOTAL_PRICE = ₹1,400
```

---

### Example 4: Diamond (Carat-Based)

**Inputs:**
| Field | Value |
|-------|-------|
| GS WT | 1 CT |
| Purchase Rate | ₹12,000/CT |
| Sell Rate | — |
| Lab Charges | — |
| MKG Charges | — |
| Valuation | ₹6,00,000 |

```
VALUATION = GS_WT × PUR_RATE = 1 × 12000 ... but displayed 600000 (with markup)
TOT_LAB = 0
TOT_MKG = 0
GST = 0 (no % entered)
FINAL = VALUATION + TOT_TAX = ₹6,00,000
```

---

## 14. All Functions Reference

Complete list of 25 functions in `omStockFormCalculations.js`:

| # | Function | Line | Purpose |
|---|----------|------|---------|
| 1 | `createChildDiv(parentDiv, prodCount)` | 27 | Create sub-product (stone) div |
| 2 | `addFormFunc_2_6_72(...)` | 47 | Add new product row to form |
| 3 | `closeFormFunc_2_6_72(...)` | 92 | Close product row |
| 4 | **`stockTransCalcFunc(prodCount, process, discountCal)`** | 163 | **Master calc — weights, purity, metal amt, charges** |
| 5 | **`calculateSellAmt(prodCount)`** | 2695 | Customer sell price (value-added) |
| 6 | `custWastgValueAddCalcFunc(prodCount)` | 2935 | Customer wastage value-add |
| 7 | `custWastgWeightValueAddCalcFunc(prodCount)` | 3227 | Wastage by weight |
| 8 | **`discountCalcFunc(prodCount, discountCal)`** | 3609 | Discount (% / amt / by weight) |
| 9 | **`taxCalcFunc(prodCount, discountCal)`** | 4573 | CGST/SGST/IGST on all charges |
| 10 | `stockTransValidationFunc(...)` | 5115 | Field validation |
| 11 | `autoLessWeightFunction(prodCount, optionChkdYesNo)` | 5168 | Auto less weight toggle |
| 12 | `stock_transaction_delete_operation(...)` | 5384 | Delete transaction |
| 13 | `stock_transaction_update_operation(...)` | 5408 | Update transaction |
| 14 | **`cryValCalcFunc(cryProdCount, discountCal)`** | 5464 | Crystal/diamond valuation |
| 15 | `cryDiscountCalcFunc(cryProdCount, discountCal)` | 5868 | Crystal discount |
| 16 | `stockFormMergeColumnValueFunc(prodCount)` | 6353 | Merge multi-product values |
| 17 | `resetProductList(prodIndicator)` | 6554 | Reset product list |
| 18 | `stock_transaction_invoice_update_operation(...)` | 6581 | Invoice update |
| 19 | `reloadTheProductList(sttr_id, sttr_user_id)` | 6611 | Reload product list |
| 20 | **`calcLessWeightFunc(prodCount, process, discountCal)`** | 6647 | Auto less weight (QTY × PKT) |
| 21 | `setFieldsDataByMasterData(...)` | 6677 | Auto-fill from master stock |
| 22 | `setFieldsDataByMasterDataDisplay(...)` | 6719 | Display master data |
| 23 | `makeInvoice(userId, prodPreInvNo, prodInvNo, panelName, divName)` | 6850 | Generate invoice |
| 24 | `setFieldsDataByMasterDataToHiddenParameters(...)` | 6882 | Set hidden params from master |
| 25 | **`calculatePurityAccordingToPurityInCarat(prodCount)`** | 7008 | Carat → % conversion |
| 26 | `setFieldsDataByMasterPreIdData(...)` | 7027 | Auto-fill by pre-id |
| 27 | `setFieldsDataByPreId(...)` | 7077 | Set fields by pre-id |
| 28 | `omResetForm()` | 7120 | Reset entire form |
| 29 | `setFieldsDataByPreviousEntry(...)` | 7173 | Copy previous entry settings |
| 30 | **`calculateFinalAmt()`** | 7230 | **Grand total of all products** |
| 31 | `hideAddDivButton()` | 7342 | Hide add button |
| 32 | `showAddDivButton(mainProdCount, prodCount, panelName)` | 7377 | Show add button |

---

## 15. Panel Variants

Different stock panels have slightly different field sets:

### 15.1 FINE STOCK (RETAIL_FINE_B2)
- **Weight-based** + purity-based pricing
- Fields: Gross/Less/Pkt/Net/Fine/FinalFine weights, Tunch, Wastage
- Metal amount = Fine Wt × Rate / 10
- Charges: Lab (GM/%), Making (GM/%), Other, Hallmark
- GST optional

### 15.2 IMITATION STOCK
- **Price-based** (no purity/tunch)
- Fields: S.P. Code, Calculation Type (M/D), Num, Total Price
- Purchase Price = Code × Num (M) or Code / Num (D)
- Sell Price set manually
- MKG charges optional

### 15.3 RAW METAL STOCK (Old Gold/Scrap)
- Weight + purity based
- **GST breakup mandatory**: CGST/SGST/IGST % and Amt
- Fields: FN WT × MT RATE, Total Tax, Final Valuation
- Metal type: OLD GOLD, scrap, etc.

### 15.4 DIAMOND/STONE STOCK (CRYSTAL)
- **Carat-based** (CT unit)
- Fields: Crystal Category, Shape, Clarity, Size, Color
- Purchase Rate per CT, Sell Rate per CT
- Valuation = Wt × Rate
- GST breakup (CGST/SGST/IGST)
- Final = Tax + Valuation

### 15.5 NEW ORDER PANEL (addNewOrderB2)
- Special calculation:
  ```
  actualFineWeight = (GROSS_WT × PURITY) / 100
  VALUATION = (GROSS_WT × RATE) / 10
  If byGrossWt/byNetWt → FinalFineWeight = GrossWt
  Else → FinalFineWeight = actualFineWeight
  ```

---

## 📊 Calculation Flow Diagram

```
                    ┌─────────────────┐
                    │  GROSS WEIGHT   │ ← User input
                    │  (e.g. 10 GM)   │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   PKT WEIGHT    │ ← User input
                    │   (e.g. 0.5)    │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │    NET WEIGHT   │ = GROSS − PKT
                    │    (9.5 GM)     │   (auto)
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │     PURITY      │ ← User input (Tunch)
                    │     (92%)       │   or Carat→% conversion
                    └────────┬────────┘
                             │
              ┌──────────────▼──────────────┐
              │     FINE WEIGHT (FN WT)     │ = (PURITY × NT_WT) / 100
              │     (8.74 GM)               │   (auto)
              └──────────────┬──────────────┘
                             │
                    ┌────────▼────────┐
                    │    WASTAGE      │ ← User input
                    │    (3%)         │
                    └────────┬────────┘
                             │
              ┌──────────────▼──────────────┐
              │  FINAL PURITY (FN PR%)      │ = PURITY + WASTAGE
              │  (95%)                      │   (auto)
              └──────────────┬──────────────┘
                             │
              ┌──────────────▼──────────────┐
              │  FINAL FINE WEIGHT           │ = ((PURITY+WASTAGE) × WT) / 100
              │  (9.025 GM)                  │   (auto)
              └──────────────┬──────────────┘
                             │
              ┌──────────────▼──────────────┐
              │  METAL AMT / VALUATION       │ = (FINAL_FN_WT × RATE) / 10
              │  (₹64,754.38)                │   (auto, Gold divisor)
              └──────────────┬──────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
┌────────▼────────┐ ┌────────▼────────┐ ┌────────▼────────┐
│  TOT LAB        │ │  TOT MKG        │ │  TOT OTHER      │
│  (₹95)          │ │  (₹6,816.25)   │ │  (₹0)           │
│  = Lab × Wt     │ │  = % calc       │ │                 │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                   │
         └───────────────────┼───────────────────┘
                             │
                    ┌────────▼────────┐
                    │  TOT HALLMARK   │ = HM_CHARGE × QTY
                    │  (₹100)         │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   TOTAL TAX     │ = CGST+SGST+IGST on all
                    │   (₹0 / ₹4300)  │
                    └────────┬────────┘
                             │
              ┌──────────────▼──────────────┐
              │   FINAL VALUATION (FINAL AMT)              │
              │   = VALUATION + MKG + OTHER + HALLMARK + TAX│
              │   = ₹71,670.63 (no GST)                    │
              │   = ₹75,970.87 (with 3%+3% GST)           │
              └─────────────────────────────────────────────┘
```

---

## 📝 Summary

The **STOCK ADD panel** is a comprehensive jewellery calculation engine with:

1. **5-level weight hierarchy**: Gross → Pkt → Net → Fine → Final Fine
2. **Dual purity system**: Carat (24K base) ↔ Percentage conversion
3. **3 charge types** (Lab, Making, Other) — each supporting 8 unit types (KG/GM/MG/PP/CT/%/FX)
4. **Percentage charges** use metal rate × conversion divisor (Gold /10, Silver /1000)
5. **GST** applied separately on each charge component (CGST/SGST/IGST)
6. **Final = Metal Value + Making + Other + Hallmark + Tax**
7. **Multi-product** support with sub-stones (diamonds) → grand total
8. **Master Stock validation** ensures entered values match predefined ranges
9. **Sell price** computed separately with customer wastage (value-added)
10. **Panel variants**: Fine, Imitation, Raw Metal, Diamond, New Order — each with tailored calculations

---

*Documentation generated from live analysis of oMunim release environment.*
*Source: `https://release.omunim.in/2/omHomePage.php?divPanel=OwnerHome`*
*Calculation engine: `omStockFormCalculations.js` (7415 lines)*
