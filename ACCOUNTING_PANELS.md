# oMunim — Accounting Panels (Ledger / Day Book / Bank Rec / Trial Balance / Balance Sheet)

> Reverse-engineered analysis of the **five interconnected accounting panels**
> on `https://release.omunim.in` (oMunim Jewellery ERP):
> **LEDGER**, **DAY BOOK (Daily Diary)**, **BANK REC**, **TRIAL B/L**,
> **B/L SHEET** — plus the **BOOKS (Journal Book)** source panel.
>
> Captured by inspecting the live DOM, the navigation onclick handlers, the
> JS loader functions, the AJAX endpoints, and the per-panel form fields +
> tables.

These five panels form the **core double-entry bookkeeping chain** of oMunim.
Transactions are created in the operational panels (SELL / PURCHASE / LOAN /
EXPENSE / UDHAAR etc.) and in the Journal Book — they then flow through
**Day Book → Ledger → Trial Balance → Balance Sheet**, with **Bank Rec**
reconciling the bank-account ledger against the bank's actual statement.

---

## 1. Where these panels live & how to reach them

All five panels are reached from the home dashboard's **left vertical
icon-rail** (the brown sidebar). Each tile's onclick calls
`navigationMainBigMiddleImageMouseOver(divName, image, imageContent, panelName)`
which loads the panel via AJAX into `#mainBigMiddle`.

| Tile        | divName        | panelName (tooltip)         | Shortcut |
|-------------|----------------|-----------------------------|----------|
| FIRM        | `FirmList`     | Firm or Company Panel        | F9       |
| SETTINGS    | `Settings`     | Control Panel                | F10      |
| ACCOUNTS    | `OmAccounts`   | Accounts Panel               | F12      |
| SMS         | (sms panel)    | Customer SMS Panel           | —        |
| **DAY BOOK**| `DailyDiary`   | **Daily Diary Panel**         | —        |
| **BANK REC**| `bankRec`      | **Bank Reconciliation Panel**| —        |
| **BOOKS**   | `JournalBook`  | **Journal Book Panel**       | —        |
| **LEDGER**  | `LedgerBook`   | **Ledger Book Panel**        | —        |
| **TRIAL B/L**| `TrialBalance`| **Trial Balance Panel**      | —        |
| P/L REP.    | `ProfitNLoss`  | Profit & Loss Panel          | —        |
| **B/L SHEET**| `BalanceSheet`| **Balance Sheet Panel**      | —        |
| LOGS        | `SystemLog`    | System Logs Panel            | —        |

> The five panels you asked about are: **LEDGER, DAY BOOK, BANK REC,
> TRIAL B/L, B/L SHEET**. The BOOKS (Journal Book) panel is included here
> as the sixth because it's the **source of manual journal entries** that
> flow into the other five.

---

## 2. The accounting flow — how the five panels connect

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  TRANSACTION SOURCES (where double-entry rows are created)                 │
│                                                                              │
│  SELL panel ─┐                  EXPENSE panel ─┐                            │
│  PURCHASE ──┼─→ auto-generates  UDHAAR (CR/DR) ┼─→ auto-generates          │
│  LOAN panel ─┘   journal entries              LOAN interest ─┘   entries  │
│  SCHEME ───────→                              STOCK transfer ───→           │
│                                                              ┌────────────┐ │
│  BOOKS (Journal Book) ──→ manual journal entries ──────────►│  JOURNAL   │ │
│  (capital intro, adjustment, depreciation, etc.)             │  ENTRIES   │ │
│                                                              └─────┬──────┘ │
└────────────────────────────────────────────────────────────────────┼────────┘
                                                                     │
                    ┌────────────────────────────────────────────────┘
                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  1. DAY BOOK (Daily Diary) — the raw chronological log                       │
│     • Shows EVERY transaction for a date range, in date order                 │
│     • Columns: TRANSACTION DETAILS, AMOUNT CR, AMOUNT DR, BALANCE             │
│     • Plus a payment-mode summary (CASH / BANK / CARD / ONLINE / DISC. /      │
│       EXTRA AMT.) showing AMOUNT IN / AMOUNT OUT / TODAY TOTAL                │
│     • Starts from OPENING BALANCE, ends at the running closing balance        │
│     • Endpoint: omddddandv.php (daily-diary display-and-view)                │
│     • Function: searchDailyDiaryDetails(firmId, fromDate, toDate, …)         │
└──────────────────────────────────────────────────────────────────────────────┘
                    │
                    │  same transactions, grouped by category
                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  2. LEDGER BOOK — the categorized view                                       │
│     • Sub-tabs: STOCK SUMMARY / INVOICE SUMMARY / STOCK LEDGER / PURCHASE /  │
│       SELL / GOLD / SILVER / RAW GOLD / RAW SILVER / STONE / TAX / LOAN /    │
│       INTEREST / TRANS LOAN / UDHAAR / USER TRANSACTION / COMPLETE LOAN       │
│     • Plus nested report panels:                                              │
│         GST SELL REPORT (BY INV / BY PROD / BY INV+WT / BY PROD+WT /         │
│           IMITATION BY INV / IMITATION BY PROD)                              │
│         SELL REPORT (STAFF / BY PRODUCT / BY INV / BY INV+MAKING /            │
│           IMITATION BY INV / IMITATION BY PROD / TALLY IMPORT)               │
│         PRODUCT P/L REPORT (PROFIT/LOSS LIST / BY AVG RATE / IMITATION)      │
│         DAILY SELL REPORT (DAILY GOLD / DAILY SILVER)                        │
│     • Each sub-tab is a DataTable with export buttons (Copy/CSV/Excel/JSON/  │
│       PDF/Print/Column-vis/Print-selected) + range search using `|`          │
│     • sell/purchase switch via getSellPurchasePanel(value) → ogbbsrbs.php    │
│     • Endpoint: ogbbsrbs.php (panel=…), plus per-sub-tab endpoints            │
└──────────────────────────────────────────────────────────────────────────────┘
                    │
                    │  same categories, aggregated per account
                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  3. TRIAL BALANCE — per-account aggregation + double-entry verification      │
│     • Date range (from / to) + firm selector                                 │
│     • Columns: ACCOUNTS DETAILS, OPENING BAL., DEBIT AMT, CREDIT AMT,        │
│       CLOSING (BAL.)                                                        │
│     • Each row groups one or more ledger account ids (e.g. BANK ACCOUNT =    │
│       ids 1138,1730,2535,3102 grouped across firms)                          │
│     • Shows the financial year (e.g. 01 APR 2026 To 31 MAR 2027) + firm name │
│     • Total Debit must == Total Credit (else the books don't balance)        │
│     • Click a row → drills into per-account month-wise ledger via            │
│       navigateToMonthAccountLedgerPanel → omalacdt.php                       │
│     • Endpoint: omactrbl.php (accounting trial balance)                      │
│     • Function: getTrialBalance(firmId, fromDD/MM/YY, toDD/MM/YY)           │
└──────────────────────────────────────────────────────────────────────────────┘
                    │
                    │  same closing balances, classified into L/A
                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  4. BALANCE SHEET — as-of-snapshot (Liabilities vs Assets)                   │
│     • Financial-year selector (e.g. "2026 - 2027") + firm selector            │
│     • Two-column layout: LIABILITIES | ASSETS                                │
│     • LIABILITIES: OPENING CAPITAL, BANK OD, CGST/SGST/IGST/GST/PST,          │
│       DUTIES & TAXES, MAKING CHARGES, SAVING SCHEME, SECURED LOANS,          │
│       UNSECURED LOANS, SUNDRY CREDITORS, Net Profit, Diff. in Balances       │
│     • ASSETS: BANK ACCOUNT, CARD PAYMENT, CASH IN HAND, ONLINE PAYMENT,      │
│       RAW GOLD, RAW SILVER, Closing STOCK GOLD/SILVER/STONE/RAW GOLD/         │
│       RAW SILVER, SUNDRY DEBTORS                                             │
│     • Both totals must match (the "Diff. in Balances" plug figure forces     │
│       equality when the books aren't fully reconciled)                       │
│     • Endpoint: omacbsdv.php (accounting balance-sheet display view)        │
│     • Function: getBalanceSheetByDate(firmId, yyyy)                          │
└──────────────────────────────────────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────────────────────────────┐
│  5. BANK REC — reconciles the bank-account ledger against the bank's         │
│     statement (parallel to the chain above)                                 │
│     • Bank selector (ICICI / AXIS) + date range + format selector            │
│       (BANK VIEW / NORMAL VIEW / CR WISE LIST / DR WISE LIST)                │
│     • GET omBankUtil.php?bank=…&apiType=BANK_STATEMENT&fromDate=…&toDate=…   │
│     • The server calls the bank's BBELS API (ICICI) or equivalent (AXIS),    │
│       fetches the actual statement, stores it in the local                  │
│       bank_statement table, then displays it in the chosen format            │
│     • Surfaces unmatched transactions:                                       │
│         - bank-only entries (in the bank statement but not in oMunim's      │
│           bank-account ledger — e.g. bank charges, interest)                 │
│         - system-only entries (in oMunim's bank-account ledger but not in  │
│           the bank statement — e.g. undeposited cheques)                     │
│     • Function: bankStatementDetails(…) → omBankUtil.php                    │
│     • Wrapper: changeBankRecFormat(format, documentRoot)                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

### The connection in one sentence

**Transactions** created in SELL/PURCHASE/LOAN/EXPENSE/UDHAAR/BOOKS → flow
into the **Day Book** (raw chronological log with CR/DR) → are categorized
in the **Ledger** (per stock/sell/purchase/loan/tax sub-ledgers) → get
aggregated per account in the **Trial Balance** (opening + debit + credit +
closing, verifies debits = credits) → are classified into Liabilities vs
Assets in the **Balance Sheet** (as-of a financial year). **Bank Rec** runs
in parallel — it reconciles the bank-account ledger (a single account inside
the Trial Balance) against the bank's actual statement, surfacing
unmatched entries on either side.

---

## 3. Panel 1 — LEDGER BOOK

Loaded by `navigationMainBigMiddleImageMouseOver('LedgerBook', 'ledger01.png', …)`.
Re-renders `#mainBigMiddle`.

### Panel layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  📒 LEDGER BOOK                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  Sub-tab strip (yellow background):                                          │
│  [STOCK SUMMARY] [INVOICE SUMMARY] [STOCK LEDGER] [PURCHASE] [SELL]         │
│  [GOLD] [SILVER] [RAW GOLD] [RAW SILVER] [STONE] [TAX] [LOAN] [INTEREST]    │
│  [TRANS LOAN] [UDHAAR] [USER TRANSACTION] [COMPLETE LOAN]                    │
├──────────────────────────────────────────────────────────────────────────────┤
│  Nested report panels (indented sub-menus):                                  │
│   GST SELL REPORT PANEL                                                       │
│     GST SELL REPORT / BY INV / BY PROD / BY INV WITH WT / BY PROD+INV WT /  │
│     IMITATION BY INV / IMITATION BY PROD                                     │
│   SELL REPORT PANEL                                                          │
│     STAFF SELL / BY PRODUCT / BY INV / BY INV+MAKING / IMITATION BY INV /    │
│     IMITATION BY PROD / BY INVOICE (TALLY IMPORT)                           │
│   PRODUCT P/L REPORT PANEL                                                  │
│     PRODUCT PROFIT/LOSS LIST / PROFIT/LOSS LIST / BY AVG RATE / IMITATION  │
│   DAILY SELL REPORT PANEL                                                   │
│     DAILY GOLD SELL / DAILY SILVER SELL                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│  Filter: [sellPurchasePanelShow: all ▾]  (onchange=getSellPurchasePanel)     │
├──────────────────────────────────────────────────────────────────────────────┤
│  DataTable (default = SELL REPORT BY PRODUCT):                                │
│  INV | NO | YEAR | DATE | FIRM | PRODUCT | METAL | QTY | GSWT | GSWT UNIT | │
│  NTWT | NTWT UNIT | ST WT (CT) | PURITY | RATE | AMOUNT                      │
│  … export buttons: Copy/CSV/Excel/JSON/PDF/Print/Col-vis/Print-selected …   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Sub-tab functions (one per category)

| Sub-tab          | Function called                          |
|------------------|------------------------------------------|
| TAX              | `getTaxLedgerBook()`                     |
| LOAN             | `getOmrevoLedgerBook("loan")`             |
| INTEREST         | `getOmrevoLedgerBook("loanInt")`          |
| TRANS LOAN       | `getTransLedgerBook()`                   |
| UDHAAR           | `getUdhaarLedgerBook()`                  |
| USER TRANSACTION | `getOmrevoLedgerBook("userTransaction")` |
| COMPLETE LOAN    | `getOmrevoLedgerBook("completeLedger")`  |
| (sell/purchase reports) | `getSellPurchasePanel(value)` → `ogbbsrbs.php?panel={value}` |

### The sell/purchase switch — `getSellPurchasePanel(panel)`

```js
function getSellPurchasePanel(panel) {
  loadXMLDoc();
  xmlhttp.onreadystatechange = function () {
    if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
      document.getElementById("main_ajax_loading_div").style.visibility = "hidden";
      document.getElementById("ledgerBook").innerHTML = xmlhttp.responseText;
    } else { /* spinner */ }
  };
  xmlhttp.open("GET", "include/php/ogbbsrbs.php?panel=" + panel, true);
  xmlhttp.send();
}
```

GET `ogbbsrbs.php?panel={all|sell|purchase|gstSellByInv|gstSellByProd|…}` →
re-renders `#ledgerBook` with the matching report DataTable.

### Invoice-row drill-down — `getSellPanel(invoiceId, …)`

Each row in the SELL REPORT BY PRODUCT table is clickable:
```js
onclick="getSellPanel('10517', '', 'sellMainDiv');"
```
This opens the invoice's full detail panel (the same one used in the Sell
panel) inside `#sellMainDiv`.

### What the Ledger shows

The Ledger is the **categorized view** of all transactions. Each sub-tab
is a different categorization:
- **STOCK LEDGER** — stock-in / stock-out / stock-transfer entries
- **SELL** — all sell invoices with per-product breakdown (INV / NO / DATE /
  FIRM / PRODUCT / METAL / QTY / GSWT / NTWT / PURITY / RATE / AMOUNT)
- **PURCHASE** — all purchase invoices
- **GOLD / SILVER / RAW GOLD / RAW SILVER / STONE** — metal-wise stock
  movement ledgers
- **TAX** — CGST / SGST / IGST / GST tax-ledger (output tax liability)
- **LOAN / INTEREST / TRANS LOAN / COMPLETE LOAN** — gold-loan ledgers
  (principal / interest / transferred loans / closed loans)
- **UDHAAR** — credit-debit (Udhaar) ledger
- **USER TRANSACTION** — per-user staff transactions
- **INVOICE SUMMARY** — invoice-level summary (totals per invoice)
- **STOCK SUMMARY** — stock-on-hand summary

### Backend endpoint map

| Endpoint              | Method | Purpose                                                  |
|-----------------------|--------|----------------------------------------------------------|
| (Ledger shell)        | GET    | Rendered by the navigation helper into `#mainBigMiddle`. |
| `ogbbsrbs.php?panel=`| GET    | Sell/purchase report DataTable (the default view).       |
| (per-sub-tab endpoints)| POST/GET | Each sub-tab has its own PHP file (e.g. tax ledger, loan ledger, etc.). |
| (invoice drill-down) | GET    | `getSellPanel(invoiceId)` loads the invoice detail.       |

---

## 4. Panel 2 — DAY BOOK (Daily Diary)

Loaded by `navigationMainBigMiddleImageMouseOver('DailyDiary', 'daybook01.png', …)`.
Re-renders `#mainBigMiddle`.

### Panel layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  📔 DAILY DIARY                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  Firm: [ALL FIRMS ▾]  (Shubham / TF / Mahalaxm / GJ)                        │
│  From: [DAY▾] [MON▾] [YEAR▾]   To: [DAY▾] [MON▾] [YEAR▾]                    │
│  SELECT PANELS: [TRANSACTION DETAILS ▾]   [SUBMIT]                          │
├──────────────────────────────────────────────────────────────────────────────┤
│  TRANSACTION DETAILS   |  AMOUNT CR  |  AMOUNT DR  |  BALANCE               │
│  ───────────────────────────────────────────────────────────                │
│  OPENING BALANCE       |            |             |  -14,357,678.00         │
│  … (each transaction as a row) …                                            │
│  … (running balance column) …                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  Payment-mode summary:                                                       │
│              CASH    BANK    CARD    ONLINE    DISC.    EXTRA AMT.   TOTAL  │
│  AMOUNT IN:  0.00    0.00    0.00    0.00      0.00     0.00        0.00   │
│  AMOUNT OUT: 0.00    0.00    0.00    0.00      0.00     0.00        0.00   │
│  TODAY TOTAL:0.00    0.00    0.00    0.00      0.00     0.00        0.00   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Form fields

| id                    | type   | label             | Purpose                                |
|-----------------------|--------|-------------------|----------------------------------------|
| `dailyDiaryFirmName`  | select | ALL FIRMS         | Firm scope (ALL / Shubham / TF / Mahalaxm / GJ) |
| `dailyDiaryFromDay`   | select | DAY (01-31)       | From-date day                          |
| `dailyDiaryFromMonth` | select | MON (JAN-DEC)     | From-date month                       |
| `dailyDiaryFromYear`  | select | YEAR (1900-2026)  | From-date year                         |
| `dailyDiaryToDay`     | select | DAY (01-31)       | To-date day                            |
| `dailyDiaryToMonth`   | select | MON (JAN-DEC)     | To-date month                          |
| `dailyDiaryToYear`    | select | YEAR (1900-2026)  | To-date year                           |
| `ddPanelToShow`       | hidden | (panel filter)    | Which sub-panel to show (default `all*`)|
| `ddDetExpand`         | hidden | (expand toggle)   | Expand/collapse transaction rows      |
| `gbMonthId`           | hidden | —                 | Gold-book month id (legacy)            |

### The table — 4 columns + payment-mode summary

The main table has **4 columns**:
1. **TRANSACTION DETAILS** — the narrative (e.g., "Sell Invoice IS15-376",
   "Purchase PG1-12", "Loan L45-interest", "Udhaar CR 5000", etc.)
2. **AMOUNT CR** — credit amount (money in)
3. **AMOUNT DR** — debit amount (money out)
4. **BALANCE** — running balance (opening + sum of CR − sum of DR up to this row)

The first row is always **OPENING BALANCE** — the closing balance of the
previous date range. The last row's BALANCE is the closing balance for the
selected range.

Below the main table, the **payment-mode summary** breaks the same
transactions down by payment mode:
- Columns: **CASH / BANK / CARD / ONLINE / DISC. / EXTRA AMT. / TOTAL**
- Rows: **AMOUNT IN / AMOUNT OUT / TODAY TOTAL**
- This lets the jeweller see "today I received ₹X cash, ₹Y bank, ₹Z card,
  ₹W online" — useful for end-of-day cash reconciliation.

### Submit — `searchDailyDiaryDetails`

```js
function searchDailyDiaryDetails(ddDetVal, firmId, fromDay, fromMonth, fromYear,
                                  toDay, toMonth, toYear, ddPanelToShow, ddMainPanel) {
  if (valDailyDiaryInputs()) {                  // validate the date selects
    loadXMLDoc();
    xmlhttp.onreadystatechange = function () {
      if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
        document.getElementById("main_ajax_loading_div").style.visibility = "hidden";
        if (ddMainPanel == 'custAccLedger') {
          document.getElementById("cust_middle_body").innerHTML = xmlhttp.responseText;
        } else {
          document.getElementById("dailyDiaryDiv").innerHTML = xmlhttp.responseText;
        }
      } else { /* spinner */ }
    };
    if (ddMainPanel == 'custAccLedger') {
      var custId = document.getElementById("custAccLedgerCustId").value;
    }
    var dailyDiaryFromDate = fromDay.value + '-' + fromMonth.value + '-' + fromYear.value;
    var dailyDiaryToDate = toDay.value + '-' + toMonth.value + '-' + toYear.value;
    if (ddMainPanel == 'custAccLedger') {
      xmlhttp.open("POST", "include/php/omddddandv" + default_theme + ".php?ddDetVal=" + ddDetVal
        + "&custId=" + custId + "&firmId=" + firmId
        + "&dailyDiaryFromDate=" + dailyDiaryFromDate
        + "&dailyDiaryToDate=" + dailyDiaryToDate
        + "&ddPanelToShow=" + ddPanelToShow + "&ddMainPanel=" + ddMainPanel, true);
    } else {
      xmlhttp.open("POST", "include/php/omddddandv" + default_theme + ".php?ddDetVal=" + ddDetVal
        + "&firmId=" + firmId
        + "&dailyDiaryFromDate=" + dailyDiaryFromDate
        + "&dailyDiaryToDate=" + dailyDiaryToDate
        + "&ddPanelToShow=" + ddPanelToShow + "&ddMainPanel=" + ddMainPanel, true);
    }
    xmlhttp.send();
  }
}
```

POST `omddddandv.php?ddDetVal=…&firmId=…&dailyDiaryFromDate=DD-MMM-YYYY&dailyDiaryToDate=DD-MMM-YYYY&ddPanelToShow=…&ddMainPanel=…`
→ re-renders `#dailyDiaryDiv`.

> Note: `ddMainPanel == 'custAccLedger'` is a special mode where the Day Book
> is scoped to a single customer (opened from the customer-home panel). It
> adds `custId` to the URL and renders into `#cust_middle_body` instead.

### What the Day Book shows

The Day Book is the **raw chronological transaction log** — every journal
entry (auto-generated from SELL/PURCHASE/LOAN/etc. + manual from BOOKS)
for the selected firm + date range, in date+time order, with a running
balance. It's the jeweller's "everything that happened today/this week/this
month" view, and it's the source data for the Ledger, Trial Balance, and
Balance Sheet.

---

## 5. Panel 3 — BANK REC (Bank Reconciliation)

Loaded by `navigationMainBigMiddleImageMouseOver('bankRec', 'bankRec24.png', 'bankRec48.png', 'Bank Reconciliation Panel')`.
Re-renders `#mainBigMiddle`.

### Panel layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  🏦 BANK RECONCILIATION                                                      │
│  START DATE: [DAY▾] [MON▾] [YEAR▾]   END DATE: [DAY▾] [MON▾] [YEAR▾]       │
│  Select Bank: [ICICI Bank ▾]  (ICICI Bank / AXIS Bank)                      │
│  Select Format: [BANK VIEW ▾]  (BANK VIEW / NORMAL VIEW / CR WISE LIST /   │
│                                  DR WISE LIST)                              │
│  [GO]                                                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│  (reconciliation table — fetched live from the bank's API)                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Form fields

| id            | type   | label          | Options                              |
|---------------|--------|----------------|--------------------------------------|
| `FromDay/Month/Year` | select | START DATE | Day 01-31 / Month JAN-DEC / Year 1900-2026 |
| `ToDateDay/Month/Year` | select | END DATE | Day 01-31 / Month JAN-DEC / Year 1900-2027 |
| `bank`        | select | Select Bank    | `icici` / `axis` (the firm's configured bank) |
| `list`        | select | Select Format  | `BANKLIST` (Bank View) / `format2` (Normal View) / CR-wise / DR-wise |
| `goButton`    | button | GO             | onclick → `changeBankRecFormat(…)` |
| `gbMonthId`   | hidden | —              | Gold-book month id (legacy)          |

### Submit — `changeBankRecFormat(format, documentRoot)`

```js
function changeBankRecFormat(format, documentRoot) {
  var fromDay = document.getElementById('FromDay');
  var fromMonth = document.getElementById('FromMonth');
  var fromYear = document.getElementById('FromYear');
  var toDay = document.getElementById('ToDateDay');
  var toMonth = document.getElementById('ToDateMonth');
  var toYear = document.getElementById('ToDateYear');
  var bankEl = document.getElementById('bank');
  var bank = bankEl ? bankEl.value : 'icici';
  if (!fromDay || !fromMonth || !fromYear || !toDay || !toMonth || !toYear) return false;
  if (!format) format = document.getElementById('list') ? document.getElementById('list').value : 'BANKLIST';
  // Always fetch from bank API via omBankUtil first.
  // Display-only helpers (omdisplaybankstmt*) only read local bank_statement
  // and show an empty table when nothing was fetched yet.
  bankStatementDetails(fromDay, fromMonth, fromYear, toDay, toMonth, toYear,
                        documentRoot, bank, 'BANK_STATEMENT', format);
  return false;
}

function bankStatementDetails(fromDay, fromMonth, fromYear, toDay, toMonth, toYear,
                               documentRoot, bank, apiType, format) {
  loadXMLDoc();
  xmlhttp.onreadystatechange = function () {
    if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
      var host = document.getElementById("getbankstatement1");
      if (!host) return;
      // Destroy any existing DataTable before replacing DOM
      try {
        if (window.jQuery && jQuery.fn && jQuery.fn.DataTable &&
            jQuery.fn.DataTable.isDataTable('#dtTableDivId')) {
          jQuery('#dtTableDivId').DataTable().clear().destroy(true);
        }
      } catch (e) {}
      host.innerHTML = xmlhttp.responseText;
    }
  };
  var fromDate = fromDay.value + '-' + fromMonth.value + '-' + fromYear.value;
  var toDate = toDay.value + '-' + toMonth.value + '-' + toYear.value;
  xmlhttp.open("GET", documentRoot + "/include/php/omBankUtil.php?bank=" + bank
    + "&apiType=" + apiType + "&fromDate=" + fromDate + "&toDate=" + toDate
    + "&format=" + format, true);
  xmlhttp.send();
}
```

GET `omBankUtil.php?bank={icici|axis}&apiType=BANK_STATEMENT&fromDate=DD-MMM-YYYY&toDate=DD-MMM-YYYY&format={BANKLIST|format2|CR|DR}`
→ re-renders `#getbankstatement1` (after destroying any existing DataTable).

### What Bank Rec does (the reconciliation logic)

1. **Server calls the bank's API** — `omBankUtil.php` connects to the
   configured bank (ICICI BBELS, AXIS equivalent) using the credentials
   stored on the Firm panel (`firmIciciAggrId`, `firmIciciCorpId`,
   `firmIciciUserId`, `firmIciciUrn`, `firmIciciAliasId`, `firmIciciApiKey`
   — see `ADD_FIRM_PANEL.md`).
2. **Fetches the actual bank statement** for the date range — every credit
   (deposit) and debit (withdrawal) on the real bank account.
3. **Stores it locally** in the `bank_statement` table.
4. **Displays it in the chosen format**:
   - **BANK VIEW** — replicates the bank's own statement format (date /
     narrative / CR / DR / balance as the bank shows it)
   - **NORMAL VIEW** — a normal DataTable with export buttons
   - **CR WISE LIST** — only credits (deposits), grouped
   - **DR WISE LIST** — only debits (withdrawals), grouped
5. **Implicit reconciliation** — by comparing the bank's statement against
   oMunim's bank-account ledger (visible in the Trial Balance / Ledger),
   the jeweller can spot:
   - **bank-only entries** — in the bank statement but not in oMunim (e.g.
     bank charges, GST on bank charges, interest credited) → need to be
     journaled into oMunim via the Journal Book
   - **system-only entries** — in oMunim's bank-account ledger but not in
     the bank statement (e.g. undeposited cheques, unpresented cheques) →
     timing differences, will clear when the cheque clears

> The reconciliation here is **implicit** (the jeweller eyeballs the two
> lists) rather than an explicit match-and-tick interface. A modern rebuild
> should add an explicit unmatched-transactions view with auto-matching on
> amount+date.

---

## 6. Panel 4 — TRIAL BALANCE

Loaded by `navigationMainBigMiddleImageMouseOver('TrialBalance', 'trial01.png', …)`.
Re-renders `#mainBigMiddle`.

### Panel layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ⚖️ TRIAL BALANCE PANEL                                                      │
│  DATE: [DAY▾][MON▾][YEAR▾]  TO: [DAY▾][MON▾][YEAR▾]  [GO]                   │
│  Firm: [ALL FIRMS ▾]  (ALL / Shubham / TF / Mahalaxm / GJ)                  │
├──────────────────────────────────────────────────────────────────────────────┤
│  FINANCIAL YEAR - 01 APR 2026 To 31 MAR 2027                                 │
│  GANESH JEWELLERS, PUNE                                                      │
├──────────────────────────────────────────────────────────────────────────────┤
│  ACCOUNTS DETAILS  |  OPENING BAL.  |  DEBIT AMT  |  CREDIT AMT  |  CLOSING │
│  ─────────────────────────────────────────────────────────────────────────── │
│  PURCHASE RAW GOLD |  …             |  …         |  …          |  …        │
│  PURCHASE SILVER   |  …             |  …         |  …          |  …        │
│  STOCK GOLD        |  …             |  …         |  …          |  …        │
│  BANK ACCOUNT      |  …             |  …         |  …          |  …        │
│  BANK OD ACC       |  …             |  …         |  …          |  …        │
│  CARD PAYMENT      |  …             |  …         |  …          |  …        │
│  CASH IN HAND      |  …             |  …         |  …          |  …        │
│  … (every ledger account) …                                                 │
│  ─────────────────────────────────────────────────────────────────────────── │
│  TOTAL              |  Σ opening     |  Σ debit   |  Σ credit   |  Σ closing│
└──────────────────────────────────────────────────────────────────────────────┘
```

### Form fields

| id                       | type   | label     | Purpose                        |
|--------------------------|--------|-----------|--------------------------------|
| `trialBalanceFirmName`   | select | ALL FIRMS | Firm scope                     |
| `trialBalanceFromDD/MM/YY` | select | DATE    | From-date day/month/year        |
| `trialBalanceToDD/MM/YY`   | select | TO      | To-date day/month/year          |
| `trialBalanceGoButt`     | submit | GO        | onclick → `getTrialBalance(…)` |

### The table — 5 columns

1. **ACCOUNTS DETAILS** — the account name (e.g., PURCHASE RAW GOLD, STOCK
   GOLD, BANK ACCOUNT, CASH IN HAND, CGST, SGST, SUNDRY CREDITORS, etc.)
2. **OPENING BAL.** — the account's opening balance at the start of the
   date range
3. **DEBIT AMT** — total debits to the account during the range
4. **CREDIT AMT** — total credits to the account during the range
5. **CLOSING (BAL.)** — opening + debits − credits = closing balance

A final **TOTAL** row sums each column. **Total Debit must equal Total
Credit** — this is the double-entry bookkeeping verification. If they
don't match, the books have an error.

### Account rows are clickable (drill-down)

Each account row is a button:
```js
onclick="navigateToMonthAccountLedgerPanel('TrialBalance', 'All Firms',
  '1138,1730,2535,3102', sdd, smm, syyyy, edd, emm, eyyyy, 'BANK ACCOUNT');"
```
The `acntIdString` (`1138,1730,2535,3102`) is a **comma-separated list of
ledger account ids** — one account per firm (when "ALL FIRMS" is selected,
the row groups the same account across all 4 firms).

### Drill-down — `navigateToMonthAccountLedgerPanel`

```js
function navigateToMonthAccountLedgerPanel(panelName, firmId, acntIdString,
    sdd, smm, syyyy, edd, emm, eyyyy, userAccount) {
  userAccount = encodeURIComponent(userAccount);
  loadXMLDoc();
  xmlhttp.onreadystatechange = function () {
    if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
      document.getElementById("main_ajax_loading_div").style.visibility = "hidden";
      document.getElementById("mainMiddle").innerHTML = xmlhttp.responseText;
    } else { /* spinner */ }
  };
  if (firmId == 'All Firms' || firmId == '') {
    xmlhttp.open("POST", "include/php/omalacdt" + default_theme + ".php?panelName=" + panelName
      + "&acntName=" + acntIdString + "&sdd=" + sdd + "&smm=" + smm + "&syyyy=" + syyyy
      + "&edd=" + edd + "&emm=" + emm + "&eyyyy=" + eyyyy + "&userAccount=" + userAccount
      + "&accountPanel=monthWiseReport", true);
  } else {
    xmlhttp.open("POST", "include/php/omalacdt" + default_theme + ".php?panelName=" + panelName
      + "&firmId=" + firmId + "&acntName=" + acntIdString + "&sdd=" + sdd + "&smm=" + smm
      + "&syyyy=" + syyyy + "&edd=" + edd + "&emm=" + emm + "&eyyyy=" + eyyyy
      + "&userAccount=" + userAccount + "&accountPanel=monthWiseReport", true);
  }
  xmlhttp.send();
}
```

POST `omalacdt.php?panelName=TrialBalance&acntName={ids}&sdd=…&smm=…&syyyy=…&edd=…&emm=…&eyyyy=…&userAccount=…&accountPanel=monthWiseReport`
→ re-renders `#mainMiddle` with the per-account month-wise ledger.

### Submit — `getTrialBalance`

```js
function getTrialBalance(firmId, fromDD, fromMM, fromYY, toDD, toMM, toYY) {
  loadXMLDoc();
  xmlhttp.onreadystatechange = function () {
    if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
      document.getElementById("main_ajax_loading_div").style.visibility = "hidden";
      document.getElementById("trialBalanceDiv").innerHTML = xmlhttp.responseText;
    } else { /* spinner */ }
  };
  xmlhttp.open("POST", "include/php/omactrbl" + default_theme + ".php?firmId=" + firmId
    + "&trialBalanceFromDD=" + fromDD + "&trialBalanceFromMM=" + fromMM + "&trialBalanceFromYY=" + fromYY
    + "&trialBalanceToDD=" + toDD + "&trialBalanceToMM=" + toMM + "&trialBalanceToYY=" + toYY, true);
  xmlhttp.send();
}
```

POST `omactrbl.php?firmId=…&trialBalanceFromDD/MM/YY=…&trialBalanceToDD/MM/YY=…`
→ re-renders `#trialBalanceDiv`.

### What the Trial Balance shows

The Trial Balance is the **per-account aggregation** of all transactions
for the date range. For each ledger account, it shows opening + debit +
credit + closing. The total debits must equal total credits (double-entry
verification). Clicking a row drills down into the per-account month-wise
ledger (which is itself a specialized view of the Ledger Book).

---

## 7. Panel 5 — BALANCE SHEET

Loaded by `navigationMainBigMiddleImageMouseOver('BalanceSheet', 'balance01.png', …)`.
Re-renders `#mainBigMiddle`.

### Panel layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  📊 BALANCE SHEET PANEL                                                      │
│  SELECT FINANCIAL YEAR: [2026 - 2027 ▾]  (1900-1980 … 2026-2027)   [GO]    │
│  Firm: [ALL FIRMS ▾]  (ALL / Shubham / TF / Mahalaxm / GJ)                  │
├──────────────────────────────────────────────────────────────────────────────┤
│  FINANCIAL YEAR - 2026 To 2027                                              │
├───────────────────────────────────┬──────────────────────────────────────────┤
│  Liabilities                      │  Assets                                  │
│  ──────────────────────────────── │  ─────────────────────────────────────── │
│  OPENING CAPITAL ACCOUNT  1.15M   │  BANK ACCOUNT              59.60M        │
│  BANK OD ACC              2.00     │  CARD PAYMENT              356           │
│  CGST                    1.02M    │  CASH IN HAND               18.29M       │
│  DUTIES & TAXES          -15.69K  │  ONLINE PAYMENT             453K         │
│  GST                     617.50K  │  RAW GOLD                   937.93K      │
│  IGST                    3.38K    │  RAW SILVER                 2.59K         │
│  MAKING CHARGES          489.55K  │  Closing STOCK GOLD         178.41M      │
│  PST                     613.50K  │  Closing STOCK RAW GOLD     10.46M        │
│  SAVING SCHEME           476.86K  │  Closing STOCK RAW SILVER   12.00K        │
│  SECURED LOANS          -1.06M    │  Closing STOCK SILVER       -118.84K      │
│  SGST                    1.02M    │  Closing STOCK STONE        2.78M         │
│  SUNDRY CREDITORS        1.79M    │  SUNDRY DEBTORS             2.55M         │
│  UNSECURED LOANS        -499.77K  │                                          │
│  Net Profit              16.13M   │                                          │
│  Diff. in Balances      251.65M   │                                          │
│  ──────────────────────────────── │  ─────────────────────────────────────── │
│  Total                  273.38M   │  Total                     273.38M       │
└───────────────────────────────────┴──────────────────────────────────────────┘
```

### Form fields

| id                       | type   | label                | Purpose                          |
|--------------------------|--------|----------------------|----------------------------------|
| `balanceSheetFirmName`   | select | ALL FIRMS            | Firm scope                       |
| `balanceSheetYear`       | select | SELECT FINANCIAL YEAR| FY (e.g. `2026` = FY 2026-2027)  |
| (GO button)              | submit | GO                   | onclick → `getBalanceSheetByDate`|

### Submit — `getBalanceSheetByDate`

```js
function getBalanceSheetByDate(firmId, yyyy) {
  loadXMLDoc();
  xmlhttp.onreadystatechange = function () {
    if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
      document.getElementById("main_ajax_loading_div").style.visibility = "hidden";
      document.getElementById("balanceSheetSubDiv").innerHTML = xmlhttp.responseText;
    } else { /* spinner */ }
  };
  xmlhttp.open("POST", "include/php/omacbsdv" + default_theme + ".php?firmId=" + firmId
    + "&balanceSheetYear=" + yyyy, true);
  xmlhttp.send();
}
```

POST `omacbsdv.php?firmId=…&balanceSheetYear=YYYY` → re-renders
`#balanceSheetSubDiv`.

### The two-column Liabilities / Assets layout

**LIABILITIES (left column):**
- **OPENING CAPITAL ACCOUNT** — owner's capital at FY start
- **BANK OD ACC** — bank overdraft (secured, with interest)
- **CGST / SGST / IGST / GST / PST** — tax liabilities (output tax payable
  to the government)
- **DUTIES & TAXES** — other duties payable
- **MAKING CHARGES** — making-charges liability (advance collected)
- **SAVING SCHEME** — gold-savings-scheme liability (customer deposits to
  be redeemed)
- **SECURED LOANS** — long-term secured loans
- **UNSECURED LOANS** — unsecured loans
- **SUNDRY CREDITORS** — payables to suppliers
- **Net Profit** — current-year net profit (from the P/L report)
- **Diff. in Balances** — the **plug figure** to force L = A (the books
  aren't fully reconciled; the diff represents unaccounted transactions)

**ASSETS (right column):**
- **BANK ACCOUNT** — bank balance
- **CARD PAYMENT** — card-payment receivables (unsettled card batches)
- **CASH IN HAND** — cash on hand
- **ONLINE PAYMENT** — online/UPI receivables (unsettled)
- **RAW GOLD / RAW SILVER** — raw metal stock value
- **Closing STOCK GOLD / SILVER / STONE / RAW GOLD / RAW SILVER** —
  closing stock valuation per metal/type
- **SUNDRY DEBTORS** — receivables from customers (Udhaar)

### Both totals must match

The **Total Liabilities** and **Total Assets** must be equal. The
"Diff. in Balances" line on the liabilities side is a **plug figure** —
it's added when the natural liabilities don't equal the natural assets,
forcing the sheet to balance. A diff of zero means the books are fully
reconciled; a large diff means the jeweller needs to journal missing
entries (via the Journal Book) to close the gap.

### What the Balance Sheet shows

The Balance Sheet is the **as-of snapshot** of the firm's financial
position at the end of a financial year. It takes the Trial Balance's
closing balances (for the FY) and classifies each account as a Liability
or an Asset. It's the final output of the accounting chain.

---

## 8. Panel 6 (source) — BOOKS (Journal Book)

Loaded by `navigationMainBigMiddleImageMouseOver('JournalBook', 'book01.png', …)`.
Re-renders `#mainBigMiddle`.

### Panel layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  📕 JOURNAL BOOK PANEL                                                       │
│  Date: [DAY▾] [MONTH▾] [YEAR▾]   Firm: [ALL FIRMS ▾]                        │
├──────────────────────────────────────────────────────────────────────────────┤
│  S.No. | Date | Transaction Details (22 OCT 2026) | DEBIT | CREDIT          │
│  ──────────────────────────────────────────────────────────────────────────  │
│  1     | …   | (narrative)                    | 1000  |                       │
│  2     | …   | (narrative)                    |       | 1000                  │
│  …                                                                          │
│  ── Total ───────────────────────────────────── 0.00 ── 0.00               │
└──────────────────────────────────────────────────────────────────────────────┘
```

### What the Journal Book is

The Journal Book is the **source of manual journal entries** — capital
introductions, expense bookings, depreciation, adjustment entries,
transfer entries, etc. Each entry is a debit/credit pair (double-entry).

Combined with the **auto-generated** entries from SELL / PURCHASE / LOAN /
EXPENSE / UDHAAR / SCHEME panels, these are the rows that appear in the
Day Book, get categorized in the Ledger, aggregated in the Trial Balance,
and classified in the Balance Sheet.

---

## 9. Backend endpoint map (full)

| Endpoint              | Method | Panel        | Purpose                                                      |
|-----------------------|--------|--------------|--------------------------------------------------------------|
| (navigation helper)   | GET    | all 6        | `navigationMainBigMiddleImageMouseOver(divName, …)` renders the panel shell into `#mainBigMiddle`. |
| `ogbbsrbs.php?panel=` | GET    | LEDGER       | Sell/purchase report DataTable (the default Ledger view).    |
| (per-Ledger-sub-tab)  | POST/GET | LEDGER     | `getTaxLedgerBook`, `getOmrevoLedgerBook`, `getTransLedgerBook`, `getUdhaarLedgerBook` — each loads a categorized sub-ledger. |
| `omddddandv.php?ddDetVal=…&firmId=…&dailyDiaryFromDate=…&dailyDiaryToDate=…&ddPanelToShow=…&ddMainPanel=…` | POST | DAY BOOK | The raw transaction log + payment-mode summary. |
| `omBankUtil.php?bank={icici\|axis}&apiType=BANK_STATEMENT&fromDate=…&toDate=…&format=…` | GET | BANK REC | Fetch the bank statement from the bank's API + store locally + return display HTML. |
| `omactrbl.php?firmId=…&trialBalanceFromDD/MM/YY=…&trialBalanceToDD/MM/YY=…` | POST | TRIAL BALANCE | Per-account opening/debit/credit/closing aggregation. |
| `omalacdt.php?panelName=TrialBalance&acntName={ids}&sdd=…&smm=…&syyyy=…&edd=…&emm=…&eyyyy=…&userAccount=…&accountPanel=monthWiseReport` | POST | TRIAL BALANCE (drill-down) | Per-account month-wise ledger. |
| `omacbsdv.php?firmId=…&balanceSheetYear=YYYY` | POST | BALANCE SHEET | Liabilities vs Assets as-of FY end. |
| (Journal Book)        | POST/GET | BOOKS       | The manual journal-entry list + create/update endpoints.   |

All endpoints are session-protected and **firm-scoped** — every query is
scoped to the active firm (or "ALL FIRMS" which aggregates across the
tenant's firms).

---

## 10. Frontend functions used by these panels

| Function                              | Source      | Role                                                          |
|---------------------------------------|-------------|---------------------------------------------------------------|
| `navigationMainBigMiddleImageMouseOver(divName, image, imageContent, panelName, stockType)` | `emNavigation.js` | The main panel loader — fetches the panel shell by `divName` into `#mainBigMiddle`. |
| `getSellPurchasePanel(panel)`         | inline      | Ledger: switch sell/purchase report variant → `ogbbsrbs.php`. |
| `getTaxLedgerBook()`                  | inline      | Ledger: load the TAX sub-ledger.                              |
| `getOmrevoLedgerBook(category)`      | inline      | Ledger: load LOAN / INTEREST / USER TRANSACTION / COMPLETE LOAN sub-ledgers. |
| `getTransLedgerBook()`                | inline      | Ledger: load TRANS LOAN sub-ledger.                           |
| `getUdhaarLedgerBook()`               | inline      | Ledger: load UDHAAR (CR/DR) sub-ledger.                        |
| `getSellPanel(invoiceId, …, 'sellMainDiv')` | inline | Ledger: drill into an invoice's full detail.                  |
| `searchDailyDiaryDetails(ddDetVal, firmId, fromDay, …, ddPanelToShow, ddMainPanel)` | inline | Day Book: submit the date range + firm → `omddddandv.php`. |
| `valDailyDiaryInputs()`               | inline      | Day Book: validate the date selects.                          |
| `changeBankRecFormat(format, documentRoot)` | inline | Bank Rec: format-selector onchange → calls `bankStatementDetails`. |
| `bankStatementDetails(fromDay, …, documentRoot, bank, apiType, format)` | inline | Bank Rec: GET `omBankUtil.php` → re-render `#getbankstatement1`. |
| `getTrialBalance(firmId, fromDD, fromMM, fromYY, toDD, toMM, toYY)` | inline | Trial Balance: submit → `omactrbl.php`. |
| `navigateToMonthAccountLedgerPanel(panelName, firmId, acntIdString, sdd, smm, syyyy, edd, emm, eyyyy, userAccount)` | inline | Trial Balance: drill-down into per-account month-wise ledger → `omalacdt.php`. |
| `getBalanceSheetByDate(firmId, yyyy)` | inline      | Balance Sheet: submit FY → `omacbsdv.php`.                    |
| `loadXMLDoc()`                        | `app.js`    | Create the shared `xmlhttp` XHR.                              |

---

## 11. How it all works — the full reconciliation flow

```
A. TRANSACTION CREATION (the source of all journal entries)
   1. SELL panel creates a sell invoice → auto-generates:
        DR Bank/Cash           (amount received)
        DR SUNDRY DEBTORS       (if credit sale)
        CR Sales (income)       (invoice amount)
        CR CGST/SGST/IGST       (tax liability)
        DR Cost of Goods Sold   (stock value)
        CR Stock Gold           (stock reduced)
   2. PURCHASE panel → auto-generates the inverse (stock in, bank out, input tax)
   3. LOAN panel → DR Stock Gold (pledged), CR Cash/Bank (loan disbursed)
   4. EXPENSE panel → DR Expense, CR Cash/Bank
   5. UDHAAR (CR/DR) → DR SUNDRY DEBTORS, CR Cash (or inverse)
   6. BOOKS (Journal Book) → manual entries (capital, depreciation, adjustments)

B. DAY BOOK (raw chronological log)
   - All entries from step A land here in date+time order.
   - searchDailyDiaryDetails(firmId, fromDate, toDate) → omddddandv.php
   - Shows: TRANSACTION DETAILS | AMOUNT CR | AMOUNT DR | BALANCE (running)
   - Plus payment-mode summary (CASH/BANK/CARD/ONLINE/DISC./EXTRA × IN/OUT/TOTAL)

C. LEDGER (categorized view)
   - Same entries, grouped by category.
   - Sub-tabs: STOCK LEDGER / SELL / PURCHASE / GOLD / SILVER / TAX / LOAN /
     INTEREST / UDHAAR / etc.
   - Each sub-tab has its own loader function (getTaxLedgerBook, etc.)
   - The default view (SELL REPORT BY PRODUCT) is a DataTable loaded via
     getSellPurchasePanel(panel) → ogbbsrbs.php

D. TRIAL BALANCE (per-account aggregation + verification)
   - Same entries, aggregated per ledger account.
   - getTrialBalance(firmId, fromDate, toDate) → omactrbl.php
   - Shows: ACCOUNTS DETAILS | OPENING | DEBIT | CREDIT | CLOSING
   - Total Debit must == Total Credit (else books have an error)
   - Click an account → navigateToMonthAccountLedgerPanel → omalacdt.php
     (per-account month-wise ledger, drilled-down view of the Ledger)

E. BALANCE SHEET (as-of snapshot, L vs A)
   - Takes the Trial Balance's closing balances for the FY.
   - getBalanceSheetByDate(firmId, yyyy) → omacbsdv.php
   - Classifies each account as Liability or Asset.
   - Both totals must match; "Diff. in Balances" is the plug figure.

F. BANK REC (parallel reconciliation)
   - changeBankRecFormat(format, documentRoot) → bankStatementDetails(…)
     → omBankUtil.php?bank=…&apiType=BANK_STATEMENT&fromDate=…&toDate=…&format=…
   - Server calls the bank's API (ICICI BBELS / AXIS), fetches the statement,
     stores in local bank_statement table, returns display HTML.
   - The jeweller compares the bank's statement against oMunim's
     bank-account ledger (visible in Trial Balance → BANK ACCOUNT row →
     drill-down) to spot:
        • bank-only entries (bank charges, interest) → journal into oMunim
        • system-only entries (unpresented cheques) → timing differences
```

---

## 12. Information each panel shows (summary)

| Panel          | Input fields                                  | Output columns / layout                | Granularity           | Time scope        |
|----------------|-----------------------------------------------|----------------------------------------|------------------------|--------------------|
| **DAY BOOK**   | firm, from-date, to-date, panel-to-show       | TRANSACTION DETAILS, CR, DR, BALANCE + payment-mode summary (CASH/BANK/CARD/ONLINE/DISC./EXTRA × IN/OUT/TOTAL) | Every transaction     | Date range          |
| **LEDGER**     | sellPurchasePanelShow (all/sell/purchase)      | Sub-tabs: STOCK/Sell/Purchase/Gold/Silver/Tax/Loan/Interest/Udhaar + nested GST/P&L/Daily reports | Per category           | Default = current FY |
| **TRIAL BALANCE** | firm, from-date, to-date                  | ACCOUNTS DETAILS, OPENING, DEBIT, CREDIT, CLOSING (TOTAL row sums each) | Per ledger account     | Date range          |
| **BALANCE SHEET** | firm, financial-year (yyyy)              | Two columns: Liabilities (Capital/Taxes/Loans/Creditors/Net Profit/Diff) vs Assets (Cash/Bank/Stock/Debtors) | As-of FY end           | Financial year      |
| **BANK REC**   | bank, from-date, to-date, format (Bank/Normal/CR/DR) | Bank-statement format (date/narrative/CR/DR/balance) in 4 views | Per bank transaction  | Date range          |
| **BOOKS** (source) | date, firm                                | S.No., Date, Transaction Details, DEBIT, CREDIT (TOTAL row) | Per journal entry     | Single date         |

---

## 13. The connection between the 5 panels — one sentence each

1. **BOOKS → Day Book**: every manual journal entry in the BOOKS panel
   becomes a row in the Day Book (alongside auto-generated entries from
   SELL/PURCHASE/LOAN/etc.).
2. **Day Book → Ledger**: the Ledger is the same Day Book transactions
   grouped by category (Stock / Sell / Purchase / Gold / Silver / Tax /
   Loan / Udhaar / etc.) instead of chronologically.
3. **Ledger → Trial Balance**: the Trial Balance aggregates each Ledger
   account's opening + debit + credit + closing for the date range,
   verifying total debits = total credits.
4. **Trial Balance → Balance Sheet**: the Balance Sheet takes the Trial
   Balance's closing balances and classifies each account as a Liability
   or an Asset, producing the as-of-FY-end snapshot (L = A).
5. **Bank Rec ↔ Trial Balance**: Bank Rec fetches the bank's actual
   statement for the date range and the jeweller compares it against the
   BANK ACCOUNT row in the Trial Balance (which aggregates oMunim's
   bank-ledger entries) to spot unmatched transactions on either side.

---

## 14. Hidden behaviour / gotchas observed

1. **Date selects are 3 dropdowns each** (Day/Month/Year) — months use
   3-letter uppercase abbreviations (JAN/FEB/…/DEC), parsed server-side.
   No native `<input type="date">`. A clean rebuild should use a real
   date picker.
2. **Year dropdown goes back to 1900** — 127 options per year-select. Slow
   to render and hard to navigate. A clean rebuild should use a
   typeahead or a finite recent-years range.
3. **"ALL FIRMS" aggregates across firms** — the Trial Balance and Balance
   Sheet group the same account across firms (e.g. BANK ACCOUNT = ids
   1138,1730,2535,3102 — one per firm). The Day Book and Ledger also
   support ALL FIRMS but show a single combined running balance. A clean
   rebuild should add a per-firm breakdown toggle.
4. **"Diff. in Balances" is a plug figure** — the Balance Sheet forces L = A
   by adding the diff to liabilities. A large diff means the books aren't
   reconciled (missing journal entries). A clean rebuild should show the
   diff prominently with a "Reconcile now" action.
5. **Bank Rec is implicit** — there's no explicit match-and-tick interface;
   the jeweller eyeballs the bank statement against the bank-account
   ledger. A modern rebuild should auto-match on amount+date and show
   unmatched-only.
6. **`omBankUtil.php` calls the bank live** — every Bank Rec GO hits the
   bank's API (ICICI BBELS / AXIS). No caching. A modern rebuild should
   cache the statement for the date range and only re-fetch on demand.
7. **DataTable destroy-before-reinit** — `bankStatementDetails` explicitly
   destroys any existing DataTable on `#dtTableDivId` before replacing
   the HTML, otherwise DataTable throws "Cannot read properties of null
   (reading 'parentNode')". A clean rebuild using TanStack Table or AG
   Grid wouldn't need this.
8. **`ddMainPanel == 'custAccLedger'`** is a hidden mode — the Day Book can
   be scoped to a single customer (opened from the customer-home panel),
   adding `custId` to the URL and rendering into `#cust_middle_body`
   instead of `#dailyDiaryDiv`. A clean rebuild should unify these two
   modes via a `scope: firm | customer` parameter.
9. **Ledger sub-tab functions are inconsistent** — some take a category
   string (`getOmrevoLedgerBook("loan")`), others take no args
   (`getTaxLedgerBook()`, `getUdhaarLedgerBook()`). A clean rebuild
   should unify on `getLedgerSubTab(category)`.
10. **Trial Balance drill-down re-renders `#mainMiddle`** (not
    `#trialBalanceDiv`) — clicking a Trial Balance row navigates away
    from the Trial Balance into the per-account ledger. There's no
    "back" button in the per-account view; the user must re-click the
    TRIAL B/L tile to return. A clean rebuild should drill-down in-place
    with a breadcrumb back.
11. **Firm-scoped** — every query is scoped to the active firm (or ALL
    FIRMS). Switching the top-bar `ALL FIRMS` dropdown re-fetches every
    panel with the new firm's data.
12. **No closing-period lock** — the books can be edited even after the
    FY ends (e.g. you can create a back-dated sell invoice in March after
    generating the March Balance Sheet). The Balance Sheet won't
    auto-refresh. A clean rebuild should add a "FY closed" lock.
13. **The Ledger's default view is "SELL REPORT BY PRODUCT"** — not a
    true general ledger. The categorized sub-tabs (STOCK/Sell/Purchase/
    Gold/Silver/Tax/Loan/…) are the actual ledgers. This is confusing —
    users expect the default view to be the general ledger.
14. **`gbMonthId` hidden field = 0** — appears on Day Book, Bank Rec, and
    others. It's the gold-book month id (legacy from the gold-rate
    averaging module). Unused in these accounting panels but carried
    through. A clean rebuild should drop it.
15. **P/L REP. (Profit & Loss) is the sixth accounting panel** — it feeds
    "Net Profit" into the Balance Sheet's liabilities side. The P/L isn't
    in scope here but the connection is: Trial Balance → P/L (income vs
    expense accounts) → Net Profit → Balance Sheet.

---

## 15. Naming conventions in the code

- `omddddandv.php` = **om**unim **d**aily **d**iary **d**isplay **and** **v**iew (Day Book)
- `omactrbl.php` = **om**unim **ac**counting **tr**ial **bl**alance (Trial Balance)
- `omalacdt.php` = **om**unim **ac**counting **l**edger **ac**count **d**e**t**ails (TB drill-down)
- `omacbsdv.php` = **om**unim **ac**counting **b**alance **s**heet **d**isplay **v**iew (Balance Sheet)
- `omBankUtil.php` = **om**unim **Bank** **Util** (Bank Rec — bank API wrapper)
- `ogbbsrbs.php` = **og**unim **b**usiness **b**ook **s**ell **r**eport **b**y **s**omething (Ledger sell/purchase report)

Function-prefix conventions:
- `get*Ledger*` / `get*Book*` — loaders for ledger sub-tabs and the journal book.
- `getOmrevo*` — loaders for OMREVO (loan module) ledgers (loan, interest, user transaction, complete loan).
- `search*Details` — submit handlers (e.g. `searchDailyDiaryDetails`).
- `navigateToMonth*` — drill-down handlers that open a month-wise view.
- `change*Format` — format-selector handlers (e.g. `changeBankRecFormat`).
- `*ByDate` — FY/date-scoped loaders (e.g. `getBalanceSheetByDate`).

---

## 16. TL;DR

- **Six accounting panels** live in the home-dashboard left icon-rail:
  DAY BOOK, BANK REC, BOOKS, LEDGER, TRIAL B/L, B/L SHEET (plus P/L REP.
  and LOGS).
- **The flow**: transactions (from SELL/PURCHASE/LOAN/EXPENSE/UDHAAR +
  manual Journal Book) → **Day Book** (raw chronological CR/DR log with
  running balance + payment-mode summary) → **Ledger** (categorized by
  Stock/Sell/Purchase/Gold/Silver/Tax/Loan/Interest/Udhaar sub-ledgers) →
  **Trial Balance** (per-account opening+debit+credit+closing, verifies
  debits = credits, each row drills into the per-account month-wise
  ledger) → **Balance Sheet** (Liabilities vs Assets as-of FY end, with a
  "Diff. in Balances" plug figure to force L = A).
- **Bank Rec runs in parallel** — fetches the bank's actual statement
  (ICICI BBELS / AXIS) via `omBankUtil.php`, displays it in 4 formats
  (Bank View / Normal / CR-wise / DR-wise), and the jeweller reconciles
  it against the BANK ACCOUNT row in the Trial Balance.
- **8 backend endpoints** documented: `ogbbsrbs.php` (ledger sell/purchase),
  `omddddandv.php` (day book), `omBankUtil.php` (bank rec),
  `omactrbl.php` (trial balance), `omalacdt.php` (TB drill-down),
  `omacbsdv.php` (balance sheet), plus per-Ledger-sub-tab endpoints and
  the Journal Book endpoints.
- **14 frontend functions** documented: `getSellPurchasePanel`,
  `getTaxLedgerBook`, `getOmrevoLedgerBook`, `getTransLedgerBook`,
  `getUdhaarLedgerBook`, `searchDailyDiaryDetails`, `changeBankRecFormat`,
  `bankStatementDetails`, `getTrialBalance`,
  `navigateToMonthAccountLedgerPanel`, `getBalanceSheetByDate`, etc.
- Gotchas worth dropping in a clean rebuild: 3-select date pickers (use a
  real date picker), 1900-year dropdowns (use a typeahead), implicit bank
  reconciliation (auto-match on amount+date), no FY-closing lock, the
  "Diff. in Balances" plug figure, inconsistent Ledger sub-tab function
  signatures, TB drill-down re-renders the whole `#mainMiddle` (no back
  button), DataTable destroy-before-reinit, live bank API hits on every
  GO (cache), and the `gbMonthId` legacy hidden field.
