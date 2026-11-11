# oMunim — Stock Tally Panel

> Reverse-engineered analysis of the **Stock Tally** feature on
> `https://release.omunim.in` (oMunim Jewellery ERP).
>
> Captured by inspecting the live DOM, every sub-panel/card, the JavaScript
> navigation + tally functions, the AJAX endpoints, and the per-card forms +
> tables.

The Stock Tally panel is where the tenant **physically counts stock** using
RFID scanners or barcode scanners, and reconciles the counted stock against
the system's recorded stock. It exposes **5 tally modes** as large clickable
cards, plus a shared filter bar (Start/End range, weight unit, metal, item
category, item name) for narrowing the stock before tallying.

---

## 1. Where it lives & how you get there

The Stock Tally panel is reached from the home dashboard via the **STOCK**
top-nav tile, which loads the Stock panel; the **STOCK TALLY** sub-tab then
loads the tally panel. The sub-tab's onclick is:

```js
navigatationPanelByFileName('mainBigMiddle', 'ogilstdv', 'stockTallyPanel');
```

That helper (defined in `scripts/advanceMetal.js`) does a GET to
`include/php/ogilstdv{default_theme}.php?panelName=stockTallyPanel` and
injects the returned HTML into `#mainBigMiddle`. On `release.omunim.in`
`default_theme` is `""`, so the endpoint is
`include/php/ogilstdv.php?panelName=stockTallyPanel`.

### Sibling sub-tabs (under STOCK)

| Sub-tab          | `panelName` param       | Purpose                          |
|------------------|-------------------------|----------------------------------|
| FINE JEWELLERY   | `FineStockPanel`        | Fine-jewellery stock list         |
| IMITATION JEWELLERY | `ImitationStockPanel` | Imitation-jewellery stock list  |
| RAW METAL STOCK  | `rawStockPanel`         | Raw-metal (gold/silver bars) stock |
| STONE STOCK      | `crystalStockPanel`     | Stone / crystal stock             |
| **STOCK TALLY**  | `stockTallyPanel`       | **This panel**                    |
| RE-ORDER LIST    | (`showReOrderList('boxMovement')`) | Low-stock re-order list  |
| OTHER PANELS     | `otherOptionPanel`      | Miscellaneous stock panels       |

All sub-tabs call `navigatationPanelByFileName('stockPanelDiv', 'ogilstdv', '<panelName>')`
— they re-render only the `#stockPanelDiv` container, not the whole page.

---

## 2. Panel layout (one screen, no sub-routes)

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  Sub-tabs: [FINE JEWELLERY] [IMITATION JEWELLERY] [RAW METAL STOCK]            │
│            [STONE STOCK] [STOCK TALLY*] [RE-ORDER LIST] [OTHER PANELS]         │
├────────────────────────────────────────────────────────────────────────────────┤
│  Title: STOCK PANEL                                                            │
│                                                                                │
│  Filter bar:                                                                   │
│    Start Range [___]  End Range [___]  ☐ WT  [GM▾]  [Gold▾]                  │
│    Item Category [___]  Item Name [___]  [GO]                                  │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│   ┌── Card 1 ──────────┐  ┌── Card 2 ──────────┐  ┌── Card 3 ──────────┐       │
│   │ STOCK TALLY BY     │  │ STOCK TALLY OPTION │  │ RFID TRACKING OPTION│       │
│   │ RFID / BARCODE     │  │ IMITATION STOCK    │  │ RFID TRACKING       │       │
│   │ STOCK TALLY        │  │ TALLY              │  │                     │       │
│   └────────────────────┘  └────────────────────┘  └─────────────────────┘       │
│                                                                                │
│   ┌── Card 4 ──────────┐  ┌── Card 5 ──────────┐                              │
│   │ IMITATION STOCK    │  │ VIEW DUPLICATE     │                              │
│   │ TALLY BY RFID      │  │ RFIDS              │                              │
│   │ RFID IMITATION     │  │ DUPLICATE RFID     │                              │
│   │ STOCK TALLY        │  │ REPORT             │                              │
│   └────────────────────┘  └────────────────────┘                              │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

The whole panel lives inside `#stockPanelDiv`, which is re-rendered by AJAX
on every sub-tab switch. The page itself never reloads.

---

## 3. The shared filter bar (`srch_stock_AmtRange` form)

Above the 5 cards there is a filter form that narrows the stock displayed
inside the cards. It is **not** submitted to a tally endpoint — it filters
the stock list shown when you click a card.

### Form
```html
<form id="srch_stock_AmtRange" name="srch_stock_AmtRange"
      method="post"
      action="javascript:searchStockByAmountRange(document.getElementById('srch_stock_AmtRange'));">
  … 8 inputs …
</form>
```

### All 8 filter fields

| #  | id                          | type     | placeholder/label | Default | Purpose                              |
|----|-----------------------------|----------|--------------------|---------|--------------------------------------|
| 1  | `stockAmtStartRange`        | text     | Start Range        | —       | Filter by amount range (lower bound) |
| 2  | `stockAmtEndRange`          | text     | End Range          | —       | Filter by amount range (upper bound) |
| 3  | `stockListSearchAdjustment` | checkbox | Yes                | Yes     | Include stock-adjustment entries      |
| 4  | `selectMetalWeight`         | select   | WT                 | WT      | Weight unit: `WT` / `GM` / `MG` / `KG` |
| 5  | `stockItemMetal`            | select   | (metal)            | Gold    | Metal: `Gold` / `Silver` / `Crystal` / `Imitation` / `Other` |
| 6  | `stockItemCat`              | text     | Item Category      | —       | Item-category filter (typeahead via `searchItemCatForPanelBlank`) |
| 7  | `stockItemName`             | text     | Item Name          | —       | Item-name filter (typeahead via `searchItemForPanelBlank`) |
| 8  | (submit)                    | submit   | GO                 | —       | Apply the filter                     |

### Filter submit — `searchStockByAmountRange(form)`

The GO button submits the form, which calls `searchStockByAmountRange(form)`.
This function POSTs the filter values and re-renders the stock list inside
the currently active card's stock div.

> The `stockItemCat` and `stockItemName` text fields have `onclick` handlers
> (`searchItemCatForPanelBlank` / `searchItemForPanelBlank`) that open a
> typeahead picker — clicking the field pops a search dialog to pick a
> category or item name rather than typing it freehand.

---

## 4. The 5 tally cards — what each one does

Each card is an `<a>` with an `onclick` that loads a sub-panel into either
`#addStockItemDetails` (for the RFID/multi-barcode tally panels) or
`#mainBigMiddle` (for the imitation + duplicate panels).

| #  | Card heading                     | Card title (h3)            | onclick                                                                                  | Loads into          |
|----|----------------------------------|----------------------------|------------------------------------------------------------------------------------------|---------------------|
| 1  | STOCK TALLY BY RFID / BARCODE    | RFID / Barcode Stock Tally | `navigateToStockPanel(baseUrl, 'StockTallyByRFID')`                                       | `#addStockItemDetails` |
| 2  | STOCK TALLY OPTION               | Imitation Stock Tally     | `navigationMainBigMiddleImageJewelleryList('ImitationTallyPanel', 'stock26.png', …)`    | `#mainBigMiddle`    |
| 3  | RFID TRACKING OPTION             | RFID Tracking              | `navigateToStockPanel(baseUrl, 'rfidTrackingReport')`                                    | `#addStockItemDetails` |
| 4  | IMITATION STOCK TALLY BY RFID    | RFID Imitation Stock Tally| `navigateToStockPanel(baseUrl, 'ImitationStockTallyByRFID')`                             | `#addStockItemDetails` |
| 5  | VIEW DUPLICATE RFIDS              | Duplicate RFID Report     | `navigationMainBigMiddleImageJewelleryList('duplicate_rfid', 'duplicate_rfid')`         | `#mainBigMiddle`    |

### Card loader — `navigateToStockPanel(documentRootPath, panel)`

```js
function navigateToStockPanel(documentRootPath, panel) {
  loadXMLDoc();
  xmlhttp.onreadystatechange = function () {
    if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
      document.getElementById("main_ajax_loading_div").style.visibility = "hidden";
      document.getElementById("addStockItemDetails").innerHTML = xmlhttp.responseText;
      if (panel == 'StockTallyByRFID' || panel == 'ImitationStockTallyByRFID' || panel == 'StockTallyByMultiBarcode') {
        document.getElementById("productCategory").focus();   // auto-focus the counter picker
      }
    } else { /* show spinner */ }
  };

  if (panel == 'StockTallyByRFID')
    xmlhttp.open("POST", documentRootPath + "/include/php/ogstallyRFIDNew.php?stockType=OPEN STOCK", true);
  else if (panel == 'StockTallyByRFIDReport')
    xmlhttp.open("POST", documentRootPath + "/include/php/ogstallyRFIDReport.php", true);
  else if (panel == 'StockTally')
    xmlhttp.open("POST", documentRootPath + "/include/php/ogstally.php", true);
  else if (panel == 'StockTallyByTable')
    xmlhttp.open("POST", documentRootPath + "/include/php/ogstallytable.php", true);
  else if (panel == 'StockTallyByMultiBarcode')
    xmlhttp.open("POST", documentRootPath + "/include/php/ogstallyMutiBarcode.php?stockType=OPEN STOCK", true);
  else if (panel == 'rfidTrackingReport')
    xmlhttp.open("POST", documentRootPath + "/include/php/omrfiddetect.php", true);
  else if (panel == 'StockTallyCycleList')
    xmlhttp.open("POST", documentRootPath + "/include/php/omstocktallycycles.php", true);
  else if (panel == 'ImitationStockTallyByRFID')
    xmlhttp.open("POST", documentRootPath + "/include/php/ogimstallyRFIDNew.php?stockType=OPEN STOCK", true);
  else
    xmlhttp.open("POST", documentRootPath + "/include/php/ogismnlt.php", true);
  xmlhttp.send();
}
```

### Card → PHP endpoint map

| `panel` param                   | PHP file                          | Card |
|---------------------------------|-----------------------------------|------|
| `StockTallyByRFID`              | `ogstallyRFIDNew.php?stockType=OPEN STOCK` | 1 (RFID fine tally) |
| `StockTallyByRFIDReport`        | `ogstallyRFIDReport.php`           | (report variant, opened in new tab) |
| `StockTally`                    | `ogstally.php`                     | (legacy image tally) |
| `StockTallyByTable`             | `ogstallytable.php`                | (table tally) |
| `StockTallyByMultiBarcode`      | `ogstallyMutiBarcode.php?stockType=OPEN STOCK` | (multi-barcode tally) |
| `rfidTrackingReport`            | `omrfiddetect.php`                 | 3 (RFID tracking) |
| `StockTallyCycleList`           | `omstocktallycycles.php`          | (cycle-count list) |
| `ImitationStockTallyByRFID`    | `ogimstallyRFIDNew.php?stockType=OPEN STOCK` | 4 (RFID imitation tally) |
| (default)                       | `ogismnlt.php`                     | (default imitation) |

---

## 5. Card 1 — RFID / Barcode Stock Tally (fine jewellery)

Loaded by `navigateToStockPanel(baseUrl, 'StockTallyByRFID')` → POST
`ogstallyRFIDNew.php?stockType=OPEN STOCK` into `#addStockItemDetails`.

### Panel layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  RFID / BAR-CODE STOCK TALLY PANEL                                            │
│  Sub-tabs: [TALLY WITH IMAGES] [TALLY WITH TABLES] [STOCK TALLY WITH RFID*]  │
│            [STOCK TALLY WITH MULTI BARCODE]                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│  COUNTER NAME [Gold Bangels▾]   LOCATION NAME [NotSelected▾]                 │
│  [Enter RFID Tags ____________________________] (textarea)                    │
│  [RESET]   [REPORT]                                                          │
│  AVAILABLE: 0    SCANNED: 0                                                  │
├───────────────────────────┬──────────────────────────────────────────────────┤
│  AVAILABLE STOCK          │  Scanned Stock                                     │
│  (items not yet scanned)  │  (items scanned + matched)                        │
│  Wt: 0 / 0                │  Wt: 0 / 0                                         │
└───────────────────────────┴──────────────────────────────────────────────────┘
```

### The 4 sub-tabs

| Sub-tab                    | `panel` param             | PHP file                                      |
|---------------------------|---------------------------|-----------------------------------------------|
| TALLY WITH IMAGES         | `StockTallyByImages`      | `ogstally.php?panelName=StockTallyByImages`    |
| TALLY WITH TABLES         | `StockTallyByTable`       | `ogstallytable.php?panelName=StockTallyByTable` |
| STOCK TALLY WITH RFID     | `StockTallyByRFID`        | `ogstallyRFIDNew.php?stockType=OPEN STOCK&panel=StockTallyByRFID` |
| STOCK TALLY WITH MULTI BARCODE | `StockTallyByMultiBarcode` | `ogstallyMutiBarcode.php?stockType=OPEN STOCK&panel=StockTallyByMultiBarcode` |

All sub-tab clicks call `showTallyStockPanel(panel)` → re-render
`#stockTallyPanelDiv`.

### Sub-tab loader — `showTallyStockPanel(panel)`

```js
function showTallyStockPanel(panel) {
  loadXMLDoc();
  xmlhttp.onreadystatechange = function () {
    if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
      document.getElementById("main_ajax_loading_div").style.visibility = "hidden";
      document.getElementById("stockTallyPanelDiv").innerHTML = xmlhttp.responseText;
      if (panel == 'StockTallyByRFID' || panel == 'StockTallyByMultiBarcode') {
        document.getElementById("productCategory").focus();
      }
    } else { /* spinner */ }
  };
  if (panel == 'StockTallyByImages')
    xmlhttp.open("POST", "include/php/ogstally" + default_theme + ".php?panelName=" + panel, true);
  else if (panel == 'StockTallyByTable')
    xmlhttp.open("POST", "include/php/ogstallytable" + default_theme + ".php?panelName=" + panel, true);
  else if (panel == 'StockTallyByRFID')
    xmlhttp.open("POST", "include/php/ogstallyRFIDNew" + default_theme + ".php?stockType=OPEN STOCK&panel=" + panel, true);
  else if (panel == 'StockTallyByMultiBarcode')
    xmlhttp.open("POST", "include/php/ogstallyMutiBarcode" + default_theme + ".php?stockType=OPEN STOCK&panel=" + panel, true);
  xmlhttp.send();
}
```

### All 10 form fields in the RFID tally panel

| #  | id                       | type     | placeholder/label        | Default   | Purpose                                    |
|----|--------------------------|----------|---------------------------|-----------|--------------------------------------------|
| 1  | `productLocation`        | select   | LOCATION NAME             | NotSelected | Filter stock by counter location           |
| 2  | `productCategory`        | select   | COUNTER NAME              | Gold Bangels | Filter stock by counter name (Gold Bangels / Gold Chain / Gold Earring / Gold Ring / Huid / Retail Stock / Wholesale Stock / etc.) |
| 3  | `RFIDScanCounter`        | hidden   | —                         | 1          | Internal scan-counter (increments per scan) |
| 4  | `textareaRFIDTags`       | textarea | Enter RFID Tags            | —          | **The scan input.** RFID scanner types tag + Enter here |
| 5  | `rfidTallyResetButton`   | submit   | RESET                     | —          | Wipe scanned stock + tally report (confirm) |
| 6  | `rfidTallyResultButton`  | submit   | RESULT                    | —          | Open the tally report in a new browser tab |
| 7  | `availTotalWeightLabel`  | text (ro)| Wt: 0 / 0                 | Wt: 0 / 0  | Available stock total weight (count / net wt) |
| 8  | `scannedTotalWeightLabel`| text (ro)| Wt: 0 / 0                 | Wt: 0 / 0  | Scanned stock total weight (count / net wt) |
| 9  | `row`                    | hidden   | —                         | 0          | Pagination row offset for available stock   |
| 10 | `all`                    | hidden   | —                         | 0          | Total count of available stock              |

### The scan input — `textareaRFIDTags`

```html
<textarea id="textareaRFIDTags" placeholder="Enter RFID Tags"
          onkeyup="var code = (event.keyCode ? event.keyCode : event.which);
                   if (code == 13) {
                     tallyStockOneShotByRFIDNew(
                       this.value,
                       '19 OCT 2026', '10:23:11',
                       document.getElementById('stockType').value,
                       document.getElementById('StockTallycheckbox').checked,
                       document.getElementById('productCounterName').value,
                       document.getElementById('productCategory').value,
                       document.getElementById('productLocation').value
                     );
                     this.value = '';
                   }"></textarea>
```

**How RFID scanning works:**
- An RFID scanner acts as a **USB keyboard** — it reads a tag and "types" the tag ID followed by Enter.
- The textarea's `onkeyup` detects Enter (keyCode 13) → calls `tallyStockOneShotByRFIDNew` with the scanned tag + metadata (date, time, stockType, counter, category, location).
- The textarea is cleared (`this.value = ''`) ready for the next scan.
- The function POSTs to `ogstallyRFIDAdd.php`, which matches the scanned RFID against the stock table.

### The main tally function — `tallyStockOneShotByRFIDNew`

```js
function tallyStockOneShotByRFIDNew(textAreaRfidTagsData, rfid_stock_scan_date,
    rfid_stock_scan_time, stockType, StockTallycheckbox, productCounterName,
    productCategory, productLocation, deviceType, divName = '') {

  var RFIDPopup = document.getElementById('RFIDPopup').value;
  loadXMLDoc();
  xmlhttp.onreadystatechange = function () {
    if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
      // re-render both stock tables (available + scanned)
      document.getElementById("rfidScannedResultsDiv").innerHTML = xmlhttp.responseText;
      if (RFIDPopup != 'RFIDPopup') {
        document.getElementById("main_ajax_loading_div").style.visibility = "hidden";
      }
    } else { /* spinner */ }
  };

  // 1. Validate stockType — if empty, alert + reload the panel
  if (stockType == '' && divName != 'imitationTally') {
    alert("Please Select Reporting Period Stock Type!...");
    xmlhttp.open("POST", "include/php/ogstallyRFIDNew" + default_theme + ".php?rfidTagsData=…" , true);
  }
  else if (stockType == '' && divName == 'imitationTally') {
    alert("Please Select Reporting Period Stock Type!...");
    xmlhttp.open("POST", "include/php/ogimstallyRFIDNew" + default_theme + ".php?…", true);
  }
  // 2. If stockType set, ADD the scanned RFID to the tally
  else {
    if (RFIDPopup == 'RFIDPopup') {
      xmlhttp.open("POST", "ogstallyRFIDAdd" + default_theme + ".php?rfidTagsData=" + textAreaRfidTagsData
        + "&rfid_stock_scan_date=" + rfid_stock_scan_date
        + "&rfid_stock_scan_time=" + rfid_stock_scan_time
        + "&stockType=" + stockType
        + "&StockTallycheckbox=" + StockTallycheckbox
        + "&productCounterName=" + productCounterName
        + "&productCategory=" + productCategory
        + "&productLocation=" + productLocation
        + "&deviceType=" + deviceType, true);
    } else {
      xmlhttp.open("POST", "include/php/ogstallyRFIDAdd" + default_theme + ".php?…", true);
    }
  }
  xmlhttp.send();
}
```

### What the backend `ogstallyRFIDAdd.php` does (inferred)

1. Receives the scanned RFID tag(s) + metadata (date, time, stockType, counter, category, location).
2. Looks up each scanned RFID in the **stock table** where `RFID = scanned_value` AND `counter = productCategory` (if set) AND `location = productLocation` (if set).
3. **If matched** → moves the item from "Available Stock" to "Scanned Stock" (marks its tally-status as `SCANNED`, records the scan timestamp).
4. **If not matched** → adds the RFID to "Scanned Stock" as an **unmatched/extra** tag (an RFID that was scanned but doesn't belong to the selected counter/location — it may belong to another counter, or be a foreign tag).
5. Returns the refreshed **Available Stock table** + **Scanned Stock table** HTML + updated weight totals, injected into `#rfidScannedResultsDiv`.

### Reset — `resetStockByRFIDNew`

```js
function resetStockByRFIDNew(stockType, StockTallycheckbox, productCounterName,
                              productCategory, productLocation, isImitation) {
  var confirmReset = confirm("Are you sure you want to reset Scanned stock and Stock tally report ? This action cannot be undone.");
  if (confirmReset) {
    loadXMLDoc();
    xmlhttp.onreadystatechange = function () {
      if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
        document.getElementById("rfidScannedResultsDiv").innerHTML = xmlhttp.responseText;
        document.getElementById("main_ajax_loading_div").style.visibility = "hidden";
      } else { /* spinner */ }
    };
    xmlhttp.open("POST", "include/php/ogtallyRFIDReset" + default_theme + ".php?productCategory=" + productCategory + "&isImitation=" + isImitation, true);
    xmlhttp.send();
  } else { console.log("Reset cancelled by user."); }
}
```

POST `ogtallyRFIDReset.php?productCategory={category}&isImitation={0|1}` →
clears all scanned items + the tally report for the selected product
category. **Destructive (cannot be undone)** — hence the confirm dialog.

### Report — `getStockTallyPanelReport`

```js
function getStockTallyPanelReport(documentRoot, omstocktallyreport, panelName) {
  var url = documentRoot + "/include/php/" + omstocktallyreport + default_theme + ".php?panelName=" + panelName;
  window.open(url, '_blank');   // opens the report in a NEW browser tab
}
```

Called as `getStockTallyPanelReport(baseUrl, 'ogstallyRFIDReport', 'StockTallyByRFIDReport')`
→ opens `ogstallyRFIDReport.php?panelName=StockTallyByRFIDReport` in a new tab.
The report is a printable reconciliation sheet showing matched / unmatched /
missing items, weights, and value.

---

## 6. Card 2 — Imitation Stock Tally (manual, no RFID)

Loaded by `navigationMainBigMiddleImageJewelleryList('ImitationTallyPanel', 'stock26.png', …)`
into `#mainBigMiddle`.

### Panel layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  IMITATION STOCK TALLY PANEL                                       [BACK]     │
│  [RESET]                                                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│  NON TALLY STOCK (0)            │  TALLY STOCK (0)                            │
│  ┌────────────────────────────┐  │  ┌────────────────────────────────────┐  │
│  │ DataTable                   │  │  │ DataTable                             │  │
│  │ PRODUCT ID | CATEGORY |     │  │  │ PRODUCT ID | CATEGORY |             │  │
│  │ PRODUCT NAME | MODEL NO |   │  │  │ PRODUCT NAME | MODEL NO |           │  │
│  │ QTY | SELL PRICE             │  │  │ QTY | SELL PRICE                     │  │
│  └────────────────────────────┘  │  └────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Two DataTables side-by-side

| Table           | Columns                                                                | Shows                                  |
|-----------------|------------------------------------------------------------------------|----------------------------------------|
| NON TALLY STOCK | PRODUCT ID, CATEGORY, PRODUCT NAME, MODEL NO, QTY, SELL PRICE          | Imitation items NOT yet counted         |
| TALLY STOCK     | PRODUCT ID, CATEGORY, PRODUCT NAME, MODEL NO, QTY, SELL PRICE          | Imitation items that HAVE been counted  |

Each DataTable has the full feature set: page-size selector
(10/20/30/40/50/100/All), Copy/CSV/Excel/JSON/PDF/Print/Column-visibility/
Print-selected export buttons, free-text search, and `|` range search.

### How the manual tally works

This is a **manual mark-as-counted** tally (no scanner). The jeweller
visually inspects each imitation-jewellery item, then in the NON TALLY
STOCK table marks items as counted (likely via a row-click or a per-row
"mark counted" button). Marked items move to the TALLY STOCK table. RESET
moves all items back to NON TALLY.

> Imitation jewellery typically doesn't carry RFID tags (they're cheaper
> than fine jewellery), so this card uses a manual count flow instead of
> RFID scanning.

---

## 7. Card 3 — RFID Tracking (audit log)

Loaded by `navigateToStockPanel(baseUrl, 'rfidTrackingReport')` → POST
`omrfiddetect.php` into `#addStockItemDetails`.

### Panel layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  RFID TRACKING LIST                                                [BACK]     │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ DataTable                                                                │  │
│  │ SR.NO | DATE TIME | ITEM CODE | ITEM CATEGORY | ITEM NAME |              │  │
│  │ ITEM TAG NO | ITEM PRICE                                                 │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Single DataTable

| Columns                                                                  | Shows                                       |
|--------------------------------------------------------------------------|---------------------------------------------|
| SR.NO, DATE TIME, ITEM CODE, ITEM CATEGORY, ITEM NAME, ITEM TAG NO, ITEM PRICE | Every RFID read event — when a tag was scanned, what item it belongs to, its price |

This is an **audit log**, not a tally. Every time an RFID tag is read by any
scanner (at the sell counter, during a tally, during stock-in, etc.), a row
is appended here. The jeweller uses it to investigate shrinkage / misplaced
items — "when was this tag last seen, and where?".

---

## 8. Card 4 — RFID Imitation Stock Tally

Loaded by `navigateToStockPanel(baseUrl, 'ImitationStockTallyByRFID')` → POST
`ogimstallyRFIDNew.php?stockType=OPEN STOCK` into `#addStockItemDetails`.

### Panel layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  RFID / BAR-CODE IMITATION STOCK TALLY PANEL                                  │
│  COUNTER NAME [___]   LOCATION NAME [___]                                    │
│  [Enter RFID Tags ____________________________] (textarea)                    │
│  [RESET]                                                                      │
│  AVAILABLE: 0    SCANNED: 0    EXTRA: 0                                      │
├──────────────────┬───────────────────────────┬───────────────────────────────┤
│  AVAILABLE STOCK │  SCANNED STOCK            │  EXTRA STOCK                   │
│  (not scanned)   │  (scanned + matched)      │  (scanned but not in this counter) │
└──────────────────┴───────────────────────────┴───────────────────────────────┘
```

### Three stock tables (vs. two for fine jewellery)

| Table           | Shows                                                                  |
|-----------------|------------------------------------------------------------------------|
| AVAILABLE STOCK | Imitation items in the selected counter that have NOT been scanned      |
| SCANNED STOCK   | Imitation items that WERE scanned and match the selected counter        |
| EXTRA STOCK     | Imitation items that WERE scanned but DON'T belong to the selected counter (misplaced items from another counter) |

The **EXTRA STOCK** table is the key difference from the fine-jewellery tally
(card 1). Imitation jewellery items are smaller and more easily moved between
counters, so when scanning a counter, items from other counters often show up.
The EXTRA table surfaces these immediately so the jeweller can move them back.

The scan input works identically to card 1 (RFID scanner types tag + Enter →
`tallyStockOneShotByRFIDNew` with `divName='imitationTally'`), but POSTs to
`ogimstallyRFIDNew.php` (the imitation variant) instead of `ogstallyRFIDNew.php`.

---

## 9. Card 5 — Duplicate RFID Report (data-integrity check)

Loaded by `navigationMainBigMiddleImageJewelleryList('duplicate_rfid', 'duplicate_rfid')`
into `#mainBigMiddle`.

### Panel content

```
Duplicate RFID Report (Existing Stock Only)
Showing 0 of 0 total groups.

✅ No duplicate RFIDs found in existing stock.
```

### What it does

This is a **data-integrity report**, not a tally. It scans the stock table
for items that share the same `RFID` value. Duplicate RFIDs are a serious
problem because two physical items would scan as the same thing during a
tally — one would be counted, the other missed.

When duplicates exist, the report shows them grouped by RFID, listing each
item that shares the tag (so the jeweller can re-tag the duplicates with new
RFIDs). When no duplicates exist, it shows the green "✅ No duplicate RFIDs
found" message.

---

## 10. Backend endpoint map (full)

| Endpoint                              | Method | Purpose                                                                |
|---------------------------------------|--------|------------------------------------------------------------------------|
| `include/php/ogilstdv.php?panelName=stockTallyPanel` | GET | Render the Stock Tally main panel (sub-tabs + filter + 5 cards). |
| `include/php/ogstallyRFIDNew.php?stockType=OPEN STOCK` | POST | Card 1: render the RFID fine-jewellery tally panel. |
| `include/php/ogstallyRFIDAdd.php?rfidTagsData=…&rfid_stock_scan_date=…&stockType=…&StockTallycheckbox=…&productCounterName=…&productCategory=…&productLocation=…&deviceType=…` | POST | **Add a scanned RFID to the tally** — match against stock, move matched items to SCANNED, unmatched to EXTRA. Returns refreshed Available + Scanned tables. |
| `include/php/ogtallyRFIDReset.php?productCategory=…&isImitation=…` | POST | **Reset** the scanned stock + tally report for a category (destructive). |
| `include/php/ogstallyRFIDReport.php?panelName=StockTallyByRFIDReport` | GET (new tab) | **Report** — printable reconciliation sheet (matched / unmatched / missing / weights / value). |
| `include/php/ogstally.php?panelName=StockTallyByImages` | POST | Sub-tab: TALLY WITH IMAGES (legacy image-based tally). |
| `include/php/ogstallytable.php?panelName=StockTallyByTable` | POST | Sub-tab: TALLY WITH TABLES (table-based manual tally). |
| `include/php/ogstallyMutiBarcode.php?stockType=OPEN STOCK` | POST | Sub-tab: STOCK TALLY WITH MULTI BARCODE (scan multiple barcodes at once). |
| `include/php/ogimstallyRFIDNew.php?stockType=OPEN STOCK` | POST | Card 4: render the RFID imitation-jewellery tally panel. |
| `include/php/omrfiddetect.php`        | POST   | Card 3: RFID tracking audit log.                                      |
| (imitation manual tally endpoint)    | POST   | Card 2: imitation manual tally (loaded via `navigationMainBigMiddleImageJewelleryList`). |
| (duplicate RFID endpoint)            | POST   | Card 5: duplicate-RFID data-integrity report.                         |
| `include/php/omstocktallycycles.php` | POST   | Cycle-count list (hidden, reachable via `StockTallyCycleList`).      |

All endpoints are session-protected and **firm-scoped** — the active firm
comes from the session, so each firm's stock is tallied independently.

---

## 11. Frontend functions used by this feature

| Function                              | Source      | Role                                                          |
|---------------------------------------|-------------|---------------------------------------------------------------|
| `navigatationPanelByFileName(div, file, panel, …)` | `advanceMetal.js` | Generic AJAX loader (GET into `#<div>`). |
| `navigateToStockPanel(documentRootPath, panel)` | inline | Load one of the 5 tally cards (dispatches to the right PHP file). |
| `navigationMainBigMiddleImageJewelleryList(panel, image, content, …)` | `itemRepair.js` | Variant loader for the imitation + duplicate cards. |
| `showTallyStockPanel(panel)`          | inline      | Switch between the 4 sub-tabs inside the RFID tally card.     |
| `tallyStockOneShotByRFIDNew(value, date, time, stockType, checkbox, counter, category, location, deviceType, divName)` | inline | **The core tally function** — POST a scanned RFID to `ogstallyRFIDAdd.php`, re-render both tables. |
| `resetStockByRFIDNew(stockType, checkbox, counter, category, location, isImitation)` | inline | Confirm + POST reset to `ogtallyRFIDReset.php`. |
| `getStockTallyPanelReport(documentRoot, reportFile, panelName)` | inline | `window.open()` the report in a new tab. |
| `searchStockByAmountRange(form)`      | inline      | Submit the shared filter form (Start/End range + metal + category + name). |
| `searchItemCatForPanelBlank(field)`   | inline      | Open the item-category typeahead picker.                      |
| `searchItemForPanelBlank(field)`      | inline      | Open the item-name typeahead picker.                          |
| `showReOrderList('boxMovement')`      | inline      | Load the RE-ORDER LIST sub-tab.                                |
| `loadXMLDoc()`                        | `app.js`    | Create the shared `xmlhttp` XHR.                              |

---

## 12. How stock tally actually works — the full reconciliation flow

```
1. PRE-TALLY (server prepares the "available" set)
   - When the jeweller opens Card 1 (StockTallyByRFID), the server
     queries the stock table for items where:
        firm_id     = active firm
        stock_type  = 'OPEN STOCK'  (not sold, not returned, not loaned)
        counter     = selected productCategory (if set)
        location    = selected productLocation (if set)
     and renders them in the AVAILABLE STOCK table (left side).
     The availTotalWeightLabel shows "Wt: <count> / <net-wt>".

2. SCANNING (RFID scanner acts as a USB keyboard)
   - The jeweller picks up each physical item, scans it with the RFID
     reader. The reader "types" the tag ID + Enter into textareaRFIDTags.
   - onkeyup detects Enter (keyCode 13) → calls
     tallyStockOneShotByRFIDNew(scannedTag, date, time, stockType, …).
   - The function POSTs to ogstallyRFIDAdd.php with the scanned tag.
   - The server:
       a. Looks up the tag in the stock table.
       b. MATCH  → move the item from AVAILABLE to SCANNED.
                   record scan_date + scan_time on the stock row.
       c. NO-MATCH → add the tag to SCANNED as an unmatched/extra item
                     (an RFID that doesn't belong to this counter/location).
   - The response re-renders #rfidScannedResultsDiv with the updated
     AVAILABLE + SCANNED tables + updated weight totals.
   - The textarea is cleared, ready for the next scan.

3. LIVE COUNTERS
   - AVAILABLE count + weight drops as items are scanned.
   - SCANNED count + weight rises as items are matched.
   - (For imitation, EXTRA count + weight rises for unmatched scans.)

4. RESULT / REPORT
   - Clicking REPORT (getStockTallyPanelReport) opens
     ogstallyRFIDReport.php in a new browser tab.
   - The report shows:
        • Matched items (scanned + found in stock) → "Counted"
        • Unmatched scans (scanned but not in stock) → "Extra / Foreign"
        • Missing items (in stock but not scanned) → "Shortage"
        • Weight + value totals for each category
        • Date/time of the tally + the counter/location

5. RESET
   - Clicking RESET (resetStockByRFIDNew) confirms, then POSTs to
     ogtallyRFIDReset.php?productCategory=…&isImitation=…
   - The server clears all scan_date/scan_time + tally-status flags
     for items in the selected category, moving them back to AVAILABLE.
   - The SCANNED + EXTRA tables are emptied.
   - Destructive — cannot be undone.

6. ALTERNATE TALLY MODES
   - Card 2 (Imitation manual tally): no scanner — the jeweller marks
     items as counted via the NON TALLY → TALLY DataTable move.
   - Card 3 (RFID Tracking): audit log of every RFID read event.
   - Card 4 (RFID Imitation tally): like Card 1 but for imitation items,
     with an EXTRA STOCK table for cross-counter items.
   - Card 5 (Duplicate RFID Report): data-integrity check — finds stock
     items sharing the same RFID tag (must re-tag duplicates before
     tallying or counts will be wrong).
```

---

## 13. End-to-end flow (RFID tally — the golden path)

```
1. User clicks STOCK top-nav → STOCK sub-tab loads → STOCK TALLY sub-tab
   → navigatationPanelByFileName('mainBigMiddle','ogilstdv','stockTallyPanel')
   → GET include/php/ogilstdv.php?panelName=stockTallyPanel
   → returns the panel shell (sub-tabs + filter + 5 cards) into #mainBigMiddle

2. (Optional) User filters stock:
   - Start Range / End Range / WT / Gold / Item Category / Item Name → GO
   → searchStockByAmountRange(form) POSTs the filter → re-renders stock list

3. User clicks Card 1 (RFID / Barcode Stock Tally)
   → navigateToStockPanel(baseUrl, 'StockTallyByRFID')
   → POST ogstallyRFIDNew.php?stockType=OPEN STOCK
   → returns the tally panel (4 sub-tabs + counter/location pickers +
     scan textarea + RESET/REPORT buttons + AVAILABLE/SCANNED tables)
     into #addStockItemDetails
   → auto-focuses #productCategory

4. User selects COUNTER NAME = "Gold Bangels", LOCATION NAME = (a location)
   → server re-queries stock filtered by counter + location
   → AVAILABLE STOCK table fills with matching items
   → availTotalWeightLabel = "Wt: 25 / 250.500"

5. User scans an RFID tag (reader types tag + Enter)
   → textareaRFIDTags onkeyup detects Enter
   → tallyStockOneShotByRFIDNew(tagValue, date, time, stockType, …)
   → POST ogstallyRFIDAdd.php?rfidTagsData=<tag>&…&productCategory=Gold Bangels&productLocation=…
   → server matches the tag in stock:
        MATCH → item moves AVAILABLE → SCANNED, scan_date/time recorded
        NO-MATCH → tag added to SCANNED as unmatched (or EXTRA for imitation)
   → response re-renders #rfidScannedResultsDiv (both tables + weight totals)
   → textarea cleared, ready for next scan

6. User scans the next 24 items (repeat step 5 for each)

7. User clicks REPORT
   → getStockTallyPanelReport(baseUrl, 'ogstallyRFIDReport', 'StockTallyByRFIDReport')
   → window.open(ogstallyRFIDReport.php?panelName=StockTallyByRFIDReport, '_blank')
   → new tab shows the printable reconciliation sheet

8. User clicks RESET (start over)
   → resetStockByRFIDNew(stockType, checkbox, counter, category, location, isImitation)
   → confirm("Are you sure you want to reset Scanned stock and Stock tally report?")
   → POST ogtallyRFIDReset.php?productCategory=Gold Bangels&isImitation=0
   → server clears scan flags for Gold Bangels items
   → SCANNED table emptied, AVAILABLE table refilled
```

---

## 14. Hidden behaviour / gotchas observed

1. **RFID scanner = USB keyboard** — the whole tally UX relies on the RFID
   reader acting as a keyboard that types a tag + Enter. No Web Serial API,
   no native driver, no WebSocket. This means any focus-loss (e.g. user
   clicks away from the textarea) breaks scanning silently. A modern
   rebuild should use the Web Serial API or a WebSocket-connected scanner.
2. **Date/time are baked into the JS call** — `tallyStockOneShotByRFIDNew`
   receives `'19 OCT 2026'` and `'10:23:11'` as string literals that were
   server-rendered into the page when the panel loaded. If the panel stays
   open across midnight, the date/time is wrong for later scans. A modern
   rebuild should compute the timestamp at scan time client-side, or let
   the server stamp it.
3. **`stockType` validation is an alert** — if the user hasn't selected a
   "Reporting Period Stock Type", the function alerts and reloads the
   panel (losing any in-progress scans). The hidden `stockType` field is
   server-set to `'OPEN STOCK'` on panel load, so this branch is usually
   not hit — but it's a footgun.
4. **Three AJAX containers** are used together:
   - `#mainBigMiddle` — full panel swaps (Stock Tally main ↔ imitation manual tally ↔ duplicate RFID)
   - `#addStockItemDetails` — RFID tally panel swaps (Card 1 / Card 3 / Card 4)
   - `#stockTallyPanelDiv` — sub-tab swaps inside the RFID tally (Images / Tables / RFID / Multi-barcode)
   - `#rfidScannedResultsDiv` — live scan-result re-renders (the hot path)
   The four never overlap; each function knows which container to target.
5. **`RFIDPopup` hidden field** — controls whether the scan runs in "popup"
   mode (uses a relative URL `ogstallyRFIDAdd.php` instead of
   `include/php/ogstallyRFIDAdd.php`). This is for a separate popup tally
   window used during stock-in. The path difference is a footgun in a
   clean rebuild — use an absolute API path everywhere.
6. **EXTRA STOCK is imitation-only** — the fine-jewellery RFID tally
   (Card 1) has only AVAILABLE + SCANNED. The imitation RFID tally
   (Card 4) adds EXTRA. The difference is because imitation items are
   smaller and more easily moved between counters, so cross-counter
   items are common and need to be surfaced.
7. **Reset is per-category** — `ogtallyRFIDReset.php?productCategory=…`
   only resets the selected category, not all categories. If you tallied
   Gold Bangels + Gold Chain, you need two resets. The confirm dialog
   doesn't tell you which category — a footgun.
8. **Report opens in a new tab** — `window.open(url, '_blank')` bypasses
   any in-page state. The report is a fresh GET, so it re-queries the
   stock table at report-time. If the user scans more items after
   opening the report, the report is stale (it's a snapshot).
9. **No live "missing" counter** — the AVAILABLE table shrinks as items
   are scanned, but there's no live "Missing" count (items that should be
   there but weren't scanned). The missing list only appears in the
   report. A modern rebuild should show a live shortage counter.
10. **Filter bar doesn't apply to the tally** — the Start/End Range +
    Metal + Category + Name filter at the top filters the **stock list
    view** (the FINE JEWELLERY sub-tab), not the tally. The tally uses
    its own COUNTER NAME + LOCATION NAME pickers inside each card. This
    is confusing — users expect the top filter to scope the tally.
11. **Cycle-count list is hidden** — `StockTallyCycleList` →
    `omstocktallycycles.php` exists in the code but isn't surfaced as a
    card. It would list previous tally cycles (date, counter, scanned
    count, shortage). A modern rebuild should surface it.
12. **Multi-barcode tally** — `StockTallyByMultiBarcode` →
    `ogstallyMutiBarcode.php` is surfaced as a sub-tab inside Card 1.
    It lets the jeweller scan multiple barcodes (not RFIDs) at once,
    pasting a batch of barcode numbers. The matching logic is the same
    as RFID but matches on `barcode_no` instead of `RFID`.
13. **Firm-scoped** — every tally query is scoped to the active firm.
    Switching the top-bar `ALL FIRMS` dropdown re-fetches every panel
    with the new firm's stock.
14. **No concurrent tally lock** — two users can tally the same counter
    simultaneously; the server doesn't lock. The last scan wins (the
    `scan_date`/`scan_time` is overwritten). A modern rebuild should add
    an optimistic-lock check (or a per-counter tally session).
15. **Date format is "DD MMM YYYY"** — `'19 OCT 2026'` — parsed
    server-side. Inconsistent with the rest of oMunim (which uses
    `YYYY-MM-DD` in DB and `DD-MM-YYYY` in UI). A modern rebuild should
    use ISO 8601 everywhere.

---

## 15. Naming conventions in the code

- `ogilstdv.php` = **og**unim **i**tem **l**ist **st**ock **d**isplay **v**iew (stock panel shell)
- `ogstally.php` = **og**unim **s**tock **tally** (legacy image tally)
- `ogstallytable.php` = **og**unim **s**tock **tally** **table** (table tally)
- `ogstallyRFIDNew.php` = **og**unim **s**tock **tally** **RFID** **New** (the modern RFID tally panel)
- `ogstallyRFIDAdd.php` = **og**unim **s**tock **tally** **RFID** **Add** (add a scanned RFID to the tally)
- `ogstallyRFIDReport.php` = **og**unim **s**tock **tally** **RFID** **Report** (the reconciliation report)
- `ogstallyMutiBarcode.php` = **og**unim **s**tock **tally** **Muti**-**Barcode** (multi-barcode tally)
- `ogtallyRFIDReset.php` = **og**unim **tally** **RFID** **Reset** (reset scanned stock)
- `ogimstallyRFIDNew.php` = **og**unim **im**itation **s**tock **tally** **RFID** **New**
- `omrfiddetect.php` = **om**unim **rfid** **detect** (RFID tracking audit log)
- `omstocktallycycles.php` = **om**unim **stock** **tally** **cycles** (cycle-count list)

Field-prefix conventions:
- `product*` — stock-item attributes as seen from the tally UI
  (`productCategory` = counter name, `productLocation` = location,
  `productCounterName` = internal counter id).
- `rfid*` — RFID-specific fields (`rfidTagsData`, `RFIDScanCounter`,
  `RFIDPopup`, `rfidScannedResultsDiv`, `rfidTallyResetButton`).
- `avail*` / `scanned*` — the two sides of the tally
  (`availStockDiv`, `availTotalWeightLabel`, `scannedTotalWeightLabel`).

---

## 16. TL;DR

- The **Stock Tally panel** opens via the STOCK top-nav tile → STOCK TALLY
  sub-tab → `navigatationPanelByFileName('mainBigMiddle','ogilstdv','stockTallyPanel')`.
- It shows a **shared filter bar** (8 fields: Start/End range, weight unit,
  metal, item category, item name) + **5 tally cards**.
- **Card 1 — RFID / Barcode Stock Tally (fine)**: scan RFID tags → match
  against available stock → live AVAILABLE / SCANNED tables + weight totals.
  Has 4 sub-tabs (Images / Tables / RFID / Multi-barcode). The core scan
  function `tallyStockOneShotByRFIDNew` POSTs to `ogstallyRFIDAdd.php`.
  RESET (destructive) → `ogtallyRFIDReset.php`. REPORT → new tab via
  `ogstallyRFIDReport.php`.
- **Card 2 — Imitation Stock Tally (manual)**: two DataTables (NON TALLY
  STOCK / TALLY STOCK), columns PRODUCT ID/CATEGORY/NAME/MODEL NO/QTY/SELL
  PRICE. No scanner — mark items as counted manually.
- **Card 3 — RFID Tracking**: single DataTable audit log of every RFID
  read event (SR.NO/DATE TIME/ITEM CODE/CATEGORY/NAME/TAG NO/PRICE).
- **Card 4 — RFID Imitation Stock Tally**: like Card 1 but for imitation
  items, with a third **EXTRA STOCK** table for cross-counter items.
- **Card 5 — Duplicate RFID Report**: data-integrity check — finds stock
  items sharing the same RFID tag.
- **How tally works**: RFID scanner acts as a USB keyboard → types tag +
  Enter into a textarea → `onkeyup` detects Enter → POST to
  `ogstallyRFIDAdd.php` → server matches the tag in stock → matched items
  move AVAILABLE → SCANNED, unmatched → EXTRA → response re-renders both
  tables + weight totals live.
- **15 backend endpoints** documented, all session-protected and
  firm-scoped.
- **11 frontend functions** documented (`navigateToStockPanel`,
  `showTallyStockPanel`, `tallyStockOneShotByRFIDNew`, `resetStockByRFIDNew`,
  `getStockTallyPanelReport`, `searchStockByAmountRange`, etc.).
- Gotchas worth dropping in a clean rebuild: scanner-as-keyboard UX (use
  Web Serial API), baked-in date/time strings, per-category reset,
  no live shortage counter, no concurrent-tally lock, Firefox-only silent
  print for the report, the 4-container AJAX split, and the `RFIDPopup`
  path-difference footgun.
