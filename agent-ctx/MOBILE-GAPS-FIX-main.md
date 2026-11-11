# MOBILE-GAPS-FIX — Work record

**Agent**: Main (mobile-gaps-fix)
**Task ID**: MOBILE-GAPS-FIX
**Scope**: Close 8 mobile-app parity gaps with the web app.

## Files created
| Path | Purpose |
|------|---------|
| `mobile/src/utils/csv.ts` | RFC-4180 CSV builder + native share/export. Defensive dynamic `import('expo-file-system')` / `import('expo-sharing')` so the module compiles even when those packages aren't installed; falls back to a Blob+`<a>` download on web. Exposes `buildCSV`, `exportToCSV`, `exportObjectsToCSV`. |
| `mobile/src/utils/print.ts` | Invoice / generic HTML generator with print-friendly CSS. Exposes `buildInvoiceHTML`, `printInvoice`, `printObject`. Auto-triggers `window.print()` on load and provides a manual "Print / Save as PDF" button. Same defensive dynamic-import pattern as `csv.ts`. |
| `mobile/src/screens/BarcodeScannerScreen.tsx` | Lazy-detects `expo-camera` at runtime. If present, mounts `<CameraView>` with barcode-scanner settings (qr, code128, ean13, code39). If absent, falls back to a manual text input using the SAME prefix routing as the web app (`src/lib/barcode.ts`): S/T=loan, P/A/B/H=stock, C/M/L=customer, Q=invoice. Renders a prefix legend, recent-scan history, and a "open in … screen" button for each match. |

## Files modified (8 mobile screens + navigator)
| File | Change |
|------|--------|
| `mobile/src/screens/CustomersScreen.tsx` | Form expanded from 16 → 50+ fields via collapsible `List.Accordion` sections (Family, Personal, Tax/ID, Bank, Address, Shipping, Financial, Business). "Show More Fields" toggle hides/shows the long tail. Sticky "Export" button (top-right) calls `exportObjectsToCSV`. Detail modal and FAB preserved. |
| `mobile/src/screens/StockScreen.tsx` | Form expanded from 12 → 30+ fields via collapsible sections (Metal & Purity, Weight Breakdown, Charges & Wastage, Source & Hallmarking, Pricing, Dates). Numeric fields coerced before POST. "Show More Fields" toggle. Sticky "Export" button. |
| `mobile/src/screens/SellScreen.tsx` | Added "Show More Fields" toggle revealing Gold Rate, Metal Amount, Items Amount, Discount, Previous Amount, full payment breakdown (cash/card/UPI/cheque/gold), live GST auto-calc box (Subtotal / CGST 1.5% / SGST 1.5% / Total), and Total Paid + Balance Due display. Save() computes subtotal/cgst/sgst/totalAmount before POST so the backend ledger entries are correct. Added "Export" button + per-invoice "Print" button that calls `printInvoice`. |
| `mobile/src/screens/LoansScreen.tsx` | Added "Pledged Items" builder: "Add Pledged Item" button appends rows with Item Name, Purity picker (22K/24K/18K/20K chips), Net Weight, Estimated Value, and Remove (trash) button. Item count chip shown next to section header. Save maps UI shape → `{ items: [{name, purity, netWeight, estimatedValue}] }` for the existing `/api/loans` POST. List cards now show "N items" tag when items exist. Added "Export" button. Detail modal + Release Loan button preserved. |
| `mobile/src/screens/MoreScreen.tsx` | Added bell-icon button in the header with a red badge showing `pendingTasks + overdueLoans` count (overdue = active loans older than 90 days). Auto-refreshes every 60s. Tap navigates to `Reminders`. Added a "Scan Barcode" tile as the first module so users can reach the new scanner. Banner above the grid when count > 0. |
| `mobile/src/screens/ExpensesScreen.tsx` | Added "Export" button → `exportObjectsToCSV('expenses', …)`. |
| `mobile/src/screens/SchemesScreen.tsx` | Added "Export" button. |
| `mobile/src/screens/RemindersScreen.tsx` | Added "Export" button. |
| `mobile/src/screens/OrdersScreen.tsx` | Added "Export" button. |
| `mobile/src/screens/UdhaarScreen.tsx` | Added "Export" button (filename includes the active type, e.g. `udhaar_credit`). |
| `mobile/src/screens/FirmsScreen.tsx` | Added "Export" button. |
| `mobile/src/navigation/RootNavigator.tsx` | Registered new `Barcode` route pointing at `BarcodeScannerScreen`. |

## API surface touched
- All forms continue to call the SAME endpoints they did before (`POST /api/customers`, `POST /api/stock`, `POST /api/invoices`, `POST /api/loans`). The backend already accepts the additional fields (Prisma schema has every column needed — see `prisma/schema.prisma` Customer, StockItem, Invoice models).
- New read-only calls in `MoreScreen` for the badge: `GET /api/tasks?status=pending` and `GET /api/loans?status=active`. Both already existed and support `firmId`.

## Verification
- `bun run lint` → exit 0 (mobile is excluded from ESLint, so this just confirms the web app + new utilities didn't break anything in the web project)
- Web app returns HTTP 200 on `/`
- `dev.log` shows clean traffic including the new `GET /api/tasks?status=pending` + `GET /api/loans?status=active` calls from `MoreScreen`'s notification badge refresh
- 0 unused imports (removed `IconButton` from `LoansScreen.tsx` after the rewrite)
- All existing list views, FABs, modals, and detail screens preserved

## Patterns used
- **Defensive dynamic imports** (`await import('expo-file-system')`) inside try/catch — so `csv.ts` and `print.ts` compile cleanly even if `expo-file-system` / `expo-sharing` aren't in the project's `node_modules`, and gracefully fall back to a Blob download on web.
- **Collapsible `List.Accordion`** for long forms (consistent with react-native-paper idioms).
- **`__showMore` form flag** to toggle "Show More Fields" without disrupting the API payload (stripped before POST in screens that need to).
- **Sticky top-right Export button** (absolute-positioned, `zIndex: 5`) so it doesn't overlap with the bottom FAB.
