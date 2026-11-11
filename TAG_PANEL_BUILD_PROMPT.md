# Build Prompt: BarCode / Tag Print Panel (single-page, multi-tab)

> Paste this whole block into Claude Code in the target project folder.
> Reuses the existing stack, auth, firm-scoping, DB layer, UI component
> library, and API conventions — does NOT impose a new framework.

---

Add a new "Tag" feature to the existing app on a single page. Reuse the existing stack, auth, firm-scoping, DB layer, UI component library, and API conventions — do NOT introduce a new framework, ORM, or styling system. The feature mirrors oMunim's BAR-CODE PRINT PANEL: a tabbed panel for designing and printing barcode labels/tags for stock items, loans, and diamonds.

## Persistence tables (add to existing schema, firm-scoped)
- `FirmLayoutSetting(firmId, fieldName, fieldValue)` unique on `(firmId, fieldName)` — every per-firm toggle: selected tab defaults, printer brand, label size, sample format, RFID printer, price-code cipher, show-unit, barcode template, auto-print, host printer, metal type, etc.
- `FirmTagLayoutSetting(firmId, tabId, settingKey, settingValue)` unique on `(firmId, tabId, settingKey)` — per-tab layout geometry: topMargin, leftMargin, fontSize, blockWidth, blockHeight, noOfRows, slipWidth, slipHeight, showBorders, blockSizePreset.
- `FirmTagLabelSlot(firmId, tabId, slotNumber, fieldName, fieldValue, fontSize, fontColor, fieldCheck, noPrintCheck, topMargin, leftMargin)` unique on `(firmId, tabId, slotNumber)` — the label designer: which field prints in which position.
- `BarcodePrnTemplate(name, content, sizeKey, variant)` — the .prn template library (read-only seed + admin-editable raw content).

Seed firm id=1 with sensible defaults (auto-print=YES, printer=TVS, label size=100×15, sample format=none, RFID printer=NO, price-code 0–9 = G/O/Y/P/N/L/D/E/M/R, show-unit=YES, template=temp2).

## Registries (add to existing lib/constants folder)
- `tag-tabs.ts` — the 10 visible tabs + their backend file id:
  ```ts
  export const TAG_TABS = [
    { id: "label",                    label: "LABELS",              designerSlots: 18 },
    { id: "Items55x13BarCodePanel",   label: "TAIL LABELS",         isList: true },
    { id: "DiamondLooseStonePanel",   label: "DIAMOND LOOSE STONE", isList: true },
    { id: "Items55x13IMBarCodePanel", label: "IMI TAIL LABELS",     isList: true },
    { id: "Items65LBarCodePanel",     label: "65L STOCK",           isList: true, subOptions: ["fine","imitation"] },
    { id: "Items84LBarCodePanel",     label: "84L STOCK",          isList: true },
    { id: "Items55x13LoanBarCodePanel",label: "TAIL LOAN",          designerSlots: 13 },
    { id: "GirviBarCodePanel",        label: "24L LOAN",           designerSlots: 11 },
    { id: "GirviAllBarCodePanel",     label: "LOAN TAG",           isReport: true },
    { id: "BarCodePrintHelp",         label: "HELP",               isHelp: true },
  ] as const;
  ```
- `prn-setup.ts` — the 13-section PRN-setup registry (see "PRN Print Setup" below).
- `tag-specs.ts` — the label-size → (tail, width, height) reference table.
- `prn-templates.ts` — the ~45 .prn filename catalogue, grouped by size/variant.

## API endpoints (use the project's existing API conventions)
- `GET  /api/tag/tab?tabId=…&subOption=…` — render a tab's content (list HTML OR label-designer HTML OR help HTML) into the main content area.
- `GET  /api/tag/settings?tabId=…` — render the layout-controls row for a tab (parallel call).
- `POST /api/tag/layout` body `{ tabId, topMargin, leftMargin, fontSize, blockWidth, blockHeight, noOfRows, slipWidth, slipHeight, showBorders, blockSizePreset }` → upsert `FirmTagLayoutSetting`, return refreshed tab content.
- `PATCH /api/tag/setting` body `{ fieldName, value }` → upsert `FirmLayoutSetting` (the shared per-firm toggle saver, used by every PRN-setup radio/checkbox).
- `GET  /api/tag/setting?fieldName=…` → returns one layout value.
- `GET  /api/tag/settings` → all `{fieldName: value}` (to mark active radio per section).
- `POST /api/tag/slot` body `{ tabId, slotNumber, fieldName, fieldValue, fontSize, fontColor, fieldCheck, noPrintCheck, topMargin, leftMargin }` → upsert `FirmTagLabelSlot`, return refreshed label-designer preview.
- `GET  /api/tag/preview?tabId=…&sttrId=…` — render ONE printable barcode tag HTML for a given stock-transaction id (used by per-row PRINT).
- `POST /api/tag/delete-all?tabId=…` — wipe all queued print slips for a tab (with confirm).
- `GET  /api/tag/prn-templates` — list the .prn template catalogue.
- `GET  /api/tag/prn-template?name=…` — fetch raw .prn content for the editor.
- `POST /api/tag/prn-template` body `{ name, content, operation }` — update the raw .prn content (admin-restricted, session-protected).
- `POST /api/tag/print` body `{ sttrIds: number[] }` — server-side batch print queue (the modern equivalent of the .bat file loop).

## Single-page UI (`<TagPrintPanel/>` on one route)

Layout (lg: `grid-cols-[280px_1fr]`):
- **Header**: breadcrumb `Settings › Tag Print` + theme toggle.
- **Left rail** (icon list, existing component): FIRM / SETTINGS / ACCOUNTS / SMS / DAY BOOK / BANK REC / BOOKS / LEDGER / TRIAL B/L / P/L REP. / B/L SHEET / LOGS — these are SIBLING panels, not sub-tabs of Tag (reuse the existing left-rail component; clicking one navigates away from Tag via the existing `navigationMainBigMiddleImageMouseOver` equivalent).
- **Main area**:
  1. Title: `BAR-CODE PRINT PANEL` + HELP button.
  2. **Tab strip** (10 tabs from `TAG_TABS`); 65L STOCK is a dropdown with FINE STOCK / IMITATION STOCK sub-options. Active tab highlighted. Clicking a tab fires two parallel requests: `/api/tag/settings?tabId=…` (settings row) + `/api/tag/tab?tabId=…` (content).
  3. **Settings row** (`<TagLayoutControls/>`) — 12 inputs (see below).
  4. **Content area** — DataTable (for `isList` tabs), Label Designer (for `designerSlots` tabs), report (for `isReport`), or help (for `isHelp`).
  5. **Hidden print container** `<div id="allLabelsDivs" hidden/>` where printable barcode HTML is injected before being sent to the printer.
- **Sticky footer** (mt-auto) at the bottom.

## The 12 layout controls (`<TagLayoutControls/>`)
Render as a horizontal form row; SUBMIT button POSTs to `/api/tag/layout`; the BORDERS / SIZE / DELETE-ALL act immediately (borders and size POST on change; delete-all needs a confirm dialog).

| id | label | kind | default |
|----|-------|------|---------|
| topMargin | TOP MARGIN | text (mm) | 14 |
| leftMargin | LEFT MARGIN | text (mm) | 3 |
| fontSize | FONT SIZE | text (px) | 10 |
| blockWidth | BLOCK WIDTH | text | — |
| blockHeight | BLOCK HEIGHT | text | — |
| noOfRows | NO OF ROWS | text | — |
| slipWidth | LABEL WIDTH | text | — |
| slipHeight | LABEL HEIGHT | text | — |
| showBorders | BARCODE BORDERS | checkbox | false |
| deleteAll | DELETE ALL TAGS | checkbox (with confirm) | false |
| blockSizePreset | SIZE | select large/medium/small | large |
| submit | SUBMIT | submit | — |

## The DataTable content (for `isList` tabs)
Columns (TAIL LABELS / IMI TAIL LABELS / 65L / 84L):
```
PROD CODE | BARCODE NO | MODEL NO | DATE | PROD NAME | PROD WT | QTY | SIZE |
PROD NT WT | PURITY | MKG CHARG | CRYSTAL VAL | FIRM | CRYSTAL WT | PRINT
```
- Page-size selector (10/20/30/40/50/100/All), Copy/CSV/Excel/JSON/PDF/Print/Column-visibility/Print-selected export buttons, free-text search, column range search using `|` (e.g. `1000|5000`).
- Each row's PRINT cell is an icon button with `onclick="printOne(sttrId)"`.
- DIAMOND LOOSE STONE tab uses diamond-specific columns (Dia WT, Dia.Color-Clarity, St.Wt, etc.).

## Per-row PRINT flow — `printOne(sttrId)`
```
1. GET /api/tag/preview?tabId=<active>&sttrId=<id>  → returns printable barcode HTML
2. inject into #allLabelsDivs
3. if RFID-write-missing → confirm("RFID not written. Proceed?") → on yes, re-GET with &confirmMissingRfid=1
4. trigger the local print daemon:
   - modern: POST /api/tag/print with { sttrIds: [id] } → server sends to printer
   - legacy fallback: window.location = "localexplorer:C:/OMPRN/omprn.bat"
5. show "Printing…" spinner for 1.5s, then clear
```

## Print-all flow — `printAll(sttrIds[])`
```
- POST /api/tag/print with { sttrIds } → server queues them
- OR client-side loop with a 2-second gap between each (configurable) calling printOne(id)
- show progress: "Printing 3 of 439…"
```

## Label Designer (for `designerSlots` tabs)
A grid of N slots (18 for stock labels, 11 for 24L loan, 13 for tail loan). Each slot is a dropdown + an inline editor.

### Stock-label fields (~80 available, grouped for the dropdown)
```
Identity: ProductId, ItemName, Item Category, Itmcode, ItmMfgDate, Itmdate, Itmmodel, Itmsize, itmImage, itmColor, itmShape
Weight:   ItemWt, ItemNwt, ItemQty, Itm.FNWt, Itm.FFNWt, ItmLessWt, Itmpkwt, ItmpkwtAdd, ItmpkwtLess, NW + VA WT
Charges:  MkgChrg, Total Mkg Chrg, Val.Add, Val.Ad.Wt, Val.Ad.Amt, Wastage, Other Chrg, ST.OTHR.INFO
Purity:   Purity, PurityCT, Ret Purity, Whole Purity, Ret Wastage, Whol Wastage, Ret Mkg, Whol Mkg
Pricing:  Unit Price, U.Price.Tax, Final Price, F.Price.Tax, UnitPriceCode, UnitPrice * 2, Sell Rate, Item Rate, Final Amt, Dealer Amt, Franchise Amt, Price Code
Stone:    St.Wt-Name, St.Wt-Name-Clarity, St.Val, St.Info, St.Clarity, St. Weight, St. Sell Rate, St.Qty-Name, St.Color-Clarity, St.Qty-Name-Weight, St. Pur Rate, St.Color, St.Qty, St.Name, St.Shape, St. Certificate No, St.Tot Wt(CT), St.Tot Amt, Stone.Color-Clarity, st.Size-Shape, St.Wt-Name-Sell Rate, St.Qty-Shape-Wt
Diamond:  Dia WT, Dia.Color-Clarity, Dia.Size-Shape, Dia.Tot QTY, Dia.Tot Wt(CT), Dia.Tot Wt(GM), Dia.Qty-Shape-Wt
Firm:     Firm, SupplierName, Caption, CounterName, Stock Year
Barcode:  Barc.Num, Barcode, Hallmark UId, RFID No, Otr.Info
```
(Each slot's dropdown is filterable by these groups; irrelevant groups hidden when the firm doesn't deal in diamonds/stones.)

### Loan-label fields (13)
```
sno, date, principal, firm, custname, city, custFather, custMob, itemname, Item Location, OtherInfo, datetime, pouchno
```

### Slot editor (popover on click)
- fieldValue (text — what prints; defaults to the field name)
- fontSize (px number)
- fontColor (named select — reuse the existing palette)
- fieldCheck (show on screen checkbox)
- noPrintCheck (show in print checkbox)
- topMargin / leftMargin (px numbers)
- POST `/api/tag/slot` on Enter → invalidate preview → "UPDATED" toast 1.5s

## PRN Print Setup panel (`<PrnPrintSetup/>` — the screenshot you uploaded)
Loaded when the user picks the "PRN Print Setup" option from a dropdown on the bar-code panel header. Renders 13 sections, ~52 fields. Every radio/checkbox `onchange` → `PATCH /api/tag/setting { fieldName, value }`.

```ts
// prn-setup.ts — 13 sections
export const PRN_SETUP_SECTIONS = [
  // 1. AUTO BARCODE PRINT
  { id:"autoBarcodePrint",     label:"AUTO BARCODE PRINT",     kind:"radio", options:["YES","NO"] },
  // 2. PRINT OPTIONS
  { id:"printOption",           label:"PRINT OPTIONS",          kind:"radio", options:["directPRNPrint","directPrint"] },
  // 3. HOST PRINTER
  { id:"hostPrinter",           label:"HOST PRINTER",            kind:"text",  placeholder:"Host Printer" },
  { id:"rfidText",              label:"RFID NO",                 kind:"text",  placeholder:"RFID No" },
  // 4. BARCODE PRINTER
  { id:"setBarcodePrinter",     label:"BARCODE PRINTER",         kind:"radio", options:["ZEBRA","TVS","TSC","ARGOS","CITIZEN"] },
  // 5. SELECT METAL TYPE
  { id:"setGoldMetalType",      label:"SELECT METAL TYPE",       kind:"checkbox", subLabel:"GOLD" },
  { id:"setSilverMetalType",    label:"",                         kind:"checkbox", subLabel:"SILVER" },
  // 6. BARCODE LABEL SIZE
  { id:"barcodeLblSize",        label:"BARCODE LABEL SIZE",      kind:"radio", options:[
    "lbl_81X12","lbl_100X15","lbl_50X25","lbl_35X15","lbl_24X12","lbl_25X25","lbl_40X30","lbl_RFID","CUSTOM"
  ], extraFields:[
    { id:"custom_bc_w", label:"W", kind:"text" },
    { id:"custom_bc_h", label:"H", kind:"text" }
  ], onChangeExtra:"filterTemplatesBySize(value)" },
  // 7. BARCODE SAMPLE FORMAT
  { id:"barcodeSampleFormat",   label:"BARCODE SAMPLE FORMAT",   kind:"radio", options:[
    "barcodeNormalTag","barcodeStoneDet","barcodeFixedMrp","none"
  ]},
  // 8. RFID PRINTER
  { id:"rfidPrinter",           label:"RFID PRINTER",            kind:"radio", options:["YES","NO"] },
  // 9. SELECT PRN PRINT
  { id:"barcodePrnFiles",       label:"Select PRN Print",         kind:"select",
    options:"<from /api/tag/prn-templates>" },
  // 10. RESET
  { id:"resetBarcodeSetting",   label:"",                          kind:"submit", value:"RESET BARCODE SETTING" },
  // 11. PRICE CODE MAPPING (cipher)
  { id:"priceCode",              label:"PRICE CODE MAPPING",       kind:"cipher",
    digits:[0,1,2,3,4,5,6,7,8,9],
    defaults:["G","O","Y","P","N","L","D","E","M","R"] }, // 0→G, 1→O, 2→Y, 3→P, 4→N, 5→L, 6→D, 7→E, 8→M, 9→R
  // 12. ON TAG SHOW WEIGHT UNIT
  { id:"showUnit",               label:"ON TAG SHOW WEIGHT UNIT", kind:"radio", options:["YES","NO"] },
  // 13. SELECT BARCODE TEMPLATE
  { id:"barcodeTemplate",        label:"SELECT BARCODE TEMPLATE", kind:"radio", options:["temp1","temp2","temp3","temp4","temp5","temp6"],
    preview:true, // shows a live tag preview image
    rawEditor:true // textarea + UPDATE button to edit the raw .prn content
  },
] as const;
```

### Tag specifications reference table (section 9 sub-table)
| Label size | Tail | Width | Height |
|------------|------|--------|--------|
| 81×12 mm   | 26   | 55     | 12     |
| 100×15 mm  | 35   | 65     | 15     |
| 40×30 mm   | 0    | 40     | 30     |
| 25×25 mm   | 0    | 25     | 25     |
| RFID       | 0    | 26     | 27     |

### Price-code cipher behaviour
The 10 text fields (`priceCodeZero` … `priceCodeNine`) define a digit→letter substitution. When printing a price on a tag, the price `1050` renders as `GOLD` (1→O, 0→G, 5→L, 0→G) — jeweller knows the cipher, customer doesn't. Default cipher = `GOLDYEPNMR`.

### .prn raw editor
The `barcodePrnTextUpdate` textarea + UPDATE button → `POST /api/tag/prn-template { name, content, operation:"update" }`. Server writes the new content back to the .prn file (admin-restricted). Show a "Saved" toast.

## HELP tab content (`<TagHelpPanel/>`)
Three sub-sections:
1. **Printer setup table** — Zebra / TSC / TVS / TVS LP46 Neo / TVS LP46 Trio, each row with a "Download drivers" link + "Watch Video" link (external URLs).
2. **Silent-print setup guide** — step-by-step: open `about:config`, set `print.always_print_silent = true` (create the boolean if missing). (Note in the UI: "Modern browsers: use the Web Serial API or the local print daemon — silent print via about:config is Firefox-only.")
3. **Thermal-printer profile guides** — for 80×100 mm slips and 85×12 mm / 55×13 mm bar-code rolls: create profiles for 1, 2, 3, 4, 5, 6, 7 labels per sheet.

## UX rules
- Sticky footer (min-h-screen flex flex-col, footer mt-auto). Responsive mobile-first, 44px touch targets. No indigo/blue unless requested.
- Two parallel requests on tab switch (settings row + content) — use two `fetch()` Promises, not a single XHR.
- Live re-render after every layout-control save and every slot save.
- Confirm-before-save on: DELETE ALL TAGS, RESET BARCODE SETTING, .prn raw-content UPDATE.
- Per-firm isolation — every setting/slot is scoped to the active firm. Switching the top-bar firm dropdown re-fetches everything.
- Breadcrumb `Settings › Tag Print › {activeTab}` always visible.
- Toast feedback: 1s for setting toggles, 1.5s for layout/slot saves, "Printing…" progress for print jobs.
- Print loop: configurable gap (default 2 s, was hard-coded 5 s in oMunim) between tags.

## Build order
1. Add the four tables to the existing schema + migrate + seed firm id=1 with defaults.
2. Add registries: `tag-tabs.ts`, `prn-setup.ts`, `tag-specs.ts`, `prn-templates.ts`.
3. API endpoints using the project's existing API conventions.
4. `<TagPrintPanel/>` shell + header + tab strip + left rail + sticky footer.
5. `<TagLayoutControls/>` (12 inputs) → POST `/api/tag/layout`.
6. `<TagDataTable/>` (for `isList` tabs) with export buttons + per-row PRINT.
7. `<TagLabelDesigner/>` (for `designerSlots` tabs) + `<TagSlotEditor/>` popover.
8. `<PrnPrintSetup/>` (13 sections, 52 fields) → PATCH `/api/tag/setting` per change + raw `.prn` editor.
9. `<TagHelpPanel/>` (printer-driver links + silent-print guide + profile guides).
10. Print flow: `printOne(sttrId)` + `printAll(sttrIds[])` + the hidden `#allLabelsDivs` container + local print daemon.
11. Lint clean, dev server on port 3000, verify with the browser: open the page; switch tabs (LABELS / TAIL LABELS / DIAMOND LOOSE STONE / 65L STOCK FINE / 84L / 24L LOAN / HELP); adjust TOP MARGIN to 14 + SIZE to medium + check BARCODE BORDERS → preview updates; open PRN Print Setup → pick BARCODE PRINTER = TVS, LABEL SIZE = 100×15, SAMPLE FORMAT = Default, set price-code 0→G/1→O/2→Y/3→P/4→N/5→L/6→D/7→E/8→M/9→R, template = T2 → "Updated Successfully" toast on each; in TAIL LABELS, click a row's PRINT icon → "Printing…" spinner → local daemon sends to printer; click A4 Sheets Print → loops with 2-second gap; sticky footer never floats; responsive on mobile.

Use the existing UI components, not custom CSS. Do not write tests. Build only the cleaned option set above — do NOT re-add the oMunim cruft (id-collision bugs, dead AJAX code, hard-coded 5-second gaps, Firefox-only silent print, commented-out duplicate tabs).
