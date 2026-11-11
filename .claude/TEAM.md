# OmGold ERP — Agent Team Charter

22 specialists. You give one task to **`erp-manager`**; it decomposes and routes to the rest.

## Roster

| # | Agent | Role | Owns |
|---|-------|------|------|
| 0 | `erp-manager` | Delivery Manager | Intake, decomposition, routing, acceptance, worklog |
| 1 | `ux-design-lead` | UI/UX (15y) | IA, design system, amber/gold theme, shadcn tokens, a11y |
| 2 | `ux-dataentry` | UI/UX (15y) | High-density counter forms, keyboard-first entry, scan flows |
| 3 | `ux-design-lead` | UI/UX (15y) | Dashboards, charts, print/PDF, barcode labels, invoice templates |
| 4 | `ux-dataentry` | Frontend (15y) | `src/components/app/modules/*`, ViewRouter, module UX |
| 5 | `fe-platform` | Frontend (15y) | App shell, zustand store, api-client, shared/ui, perf, Electron |
| 6 | `fe-mobile` | Frontend (15y) | `mobile/` Expo React Native app |
| 7 | `be-auth-tenancy` | Backend (15y) | NextAuth, multi-firm isolation, RBAC, staff, permissions |
| 8 | `be-inventory` | Backend (15y) | Stock, transfers, barcode/HUID/tagging, purity & weight maths |
| 9 | `be-sales-gst` | Backend (15y) | Invoices, quotations, orders, GST, e-invoice, loyalty |
| 10 | `be-lending` | Backend (15y) | Gold loan (girvi), udhaar, schemes, interest & repayment |
| 11 | `be-accounting` | Backend (15y) | Ledger, day book, journal, trial balance, P&L, balance sheet |
| 12 | `be-platform-data` | Backend (15y) | Prisma schema, MySQL, migrations, search, logs, SMS/integrations |
| 13 | `qa-lead` | QA (15y) | Test strategy, coverage, release gates, defect triage |
| 14 | `qa-api` | QA (15y) | API contract + integration tests on route handlers |
| 15 | `qa-lead` | QA (15y) | End-to-end web journeys |
| 16 | `qa-mobile` | QA (15y) | Expo/React Native app testing |
| 17 | `qa-api` | QA (15y) | Financial correctness: GST, interest, weight/purity, rounding |
| 18 | `qa-security-perf` | QA (15y) | Tenant isolation, authz, injection, load & performance |
| 19 | `sec-appsec` | Security (15y) | Threat modelling, secure code review, OWASP, remediation |
| 20 | `sec-infra-pentest` | Security (15y) | Authorized assessment, headers/CSP, MySQL & Electron hardening |
| 21 | `sec-compliance-data` | Security (15y) | KYC/PII, DPDP Act, masking, encryption, retention, audit trail |

**QA vs Security** — `qa-security-perf` owns the *repeatable regression gate* (isolation tests that run on every change, load measurements). The `sec-*` engineers own *threat modelling, assessment, hardening and compliance*. Vulnerabilities found by QA escalate to `sec-appsec`; fixes from Security get regression tests from QA.

## Shared project context

**OmGold ERP** — a clone of oMunim: multi-firm Jewellery ERP + Gold Loan (Girvi) + money lending + e-commerce, bilingual Hindi/English, for Indian jewellery retailers.

**Stack** — Next.js 16.3 (App Router, Turbopack) · React 19 · TypeScript · Tailwind v4 + shadcn/ui · Prisma 6 → **MySQL** (`omerp`) · NextAuth v4 (JWT, credentials) · Zustand (persisted) · TanStack Query/Table · Recharts · sonner · framer-motion.

**Run it** — `npm run dev` → http://localhost:3002. Logins: `admin`/`admin123`, `sales8`/`india0000`, `staff1`.

**Architecture — read this before writing code**
- It is a **single-page SPA**, not a multi-route app. `src/app/page.tsx` holds a `ViewRouter` switch over `ViewKey` (29 views, defined in `src/store/app.ts`) which renders `src/components/app/modules/*.tsx`. Adding a screen = add a `ViewKey`, a `NAV_ITEMS` entry in `src/components/app/nav-config.ts`, a module component, and a `ViewRouter` case. **Do not create `src/app/<page>/page.tsx`.**
- The only real Next routes are `src/app/api/**/route.ts` handlers.
- **Multi-tenancy is the core invariant**: every business row carries `firmId`. Every handler must `getCurrentUser()` then `verifyFirmAccess(user.id, firmId)` (`src/lib/session.ts`) before reading or writing. A missing check is a cross-tenant data leak.
- Mutations should append to `SystemLog` (`db.systemLog.create`) — the audit trail the Logs module reads.
- Platforms: web (`src/`), mobile Expo RN (`mobile/`), desktop Electron (`electron/` — a thin wrapper that loads the web app and inherits its features).

**Domain vocabulary** — *girvi* = gold loan against pledged ornaments · *udhaar* = credit/debit money lending · *bhav cut* = fixing a gold rate ahead of billing · *karigar* = goldsmith · *HUID* = 6-char BIS hallmark ID · *fine weight* = net weight × final purity · *wastage* = % added to weight for making loss.

## Known issues (open work, verified 2026-09-08)

1. `.env` has `NEXTAUTH_URL=http://localhost:32000` but the app serves on **3002** — mismatch.
2. `next.config.ts` sets `typescript.ignoreBuildErrors: true` — type errors never fail the build.
3. `npx eslint .` reports **22 errors**, all `react-hooks/set-state-in-effect` (shadcn `ui/carousel.tsx`, `ui/sidebar.tsx`, `hooks/use-mobile.ts`).
4. **No automated tests exist anywhere** in the repo.
5. `zod` is a dependency but is used in **zero** API routes — request bodies are unvalidated.
6. Several handlers spread `...body` straight into `db.*.create({ data })` (e.g. `src/app/api/stock/route.ts`), which is mass-assignment.
7. `POST /api/seed` is **unauthenticated** and writes to the database; `src/app/page.tsx` calls it on every page load.
8. `src/components/app/modules/*` uses `any` widely; API responses are untyped.

## Working protocol

- Every agent reports back in the shape: **Files touched → What changed → How it was verified → Risks left open.**
- Verify before claiming done: `npm run dev` health, `npx eslint .`, `npx tsc --noEmit`, and the actual endpoint/flow.
- Preserve the multi-tenant check and the amber/gold visual language.
- Append a dated entry to `worklog.md` for anything substantial — it is the project's running history (44 tasks so far).
