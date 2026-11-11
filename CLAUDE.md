@AGENTS.md

# Team delegation — automatic, not manual

This project has a standing team of 22 specialists in `.claude/agents/`. The roster, shared
project context and open-issues list are in `.claude/TEAM.md` — read it before your first delegation
in a session.

**Delegate by default. The user should not have to name an agent.** When a request lands, decide
which specialist owns it and dispatch — do not ask "shall I use the team?" and do not do specialist
work yourself just because it looks quick.

## Route every substantial request through `erp-manager`

Anything that changes the product goes to `erp-manager`, which decomposes it and fans out to the
specialists. That includes: a new feature, a bug, a schema change, a UI change, an API change, a
refactor, a parity task against oMunim, or any request that touches more than one file.

Give it the request in the user's own words plus the context it cannot see (it does not have this
conversation): relevant file paths, endpoints, prior decisions, and what "done" means.

## Handle directly, without delegating

- Answering a question about the code, or reading/showing a file
- A single obvious edit — a typo, a constant, one line
- Running a command the user explicitly asked for (`npm run dev`, a git command, a test)
- Anything where dispatching would take longer than doing it

If you are unsure which side a request falls on, delegate.

## Skip the manager and go straight to the specialist when the owner is obvious

Fine for a single-domain task with no cross-cutting impact:

| Work | Agent |
|---|---|
| A web screen in `src/components/app/modules/` | `ux-dataentry` (forms) or `fe-platform` |
| App shell, store, `api-client`, ui primitives, Electron, perf | `fe-platform` |
| The Expo app in `mobile/` | `fe-mobile` |
| Login, roles, firm isolation, staff | `be-auth-tenancy` |
| Stock, transfers, barcode, purity/weight maths | `be-inventory` |
| Invoices, GST, quotations, orders, loyalty | `be-sales-gst` |
| Gold loan (girvi), udhaar, schemes, interest | `be-lending` |
| Ledger, day book, trial balance, P&L, balance sheet | `be-accounting` |
| Prisma schema, migrations, MySQL, search, logs, integrations | `be-platform-data` |
| Design system, IA, navigation, a11y | `ux-design-lead` |
| Data-entry forms, keyboard/scan flows | `ux-dataentry` |
| Dashboards, charts, print, barcode labels | `ux-design-lead` |
| Test strategy, harness, release gates | `qa-lead` |
| API contract/integration tests | `qa-api` |
| Browser end-to-end journeys | `qa-lead` |
| Mobile testing and web/mobile parity | `qa-mobile` |
| Any money, weight, purity, interest or GST figure | `qa-api` |
| Tenant-isolation regression, authz, load | `qa-security-perf` |
| Threat modelling, secure code review, OWASP | `sec-appsec` |
| Headers/CSP, MySQL & Electron hardening, assessment | `sec-infra-pentest` |
| KYC/PII, DPDP Act, masking, retention | `sec-compliance-data` |

## Rules that always apply

1. **Fan out in parallel.** Independent tasks go in ONE message with multiple Agent calls. Serialize
   only genuine dependencies. Never let two agents edit the same file at once — split by file or run
   them in sequence.
2. **Gate the risky work.** Money, weight, purity, interest or GST → also `qa-api`. A route handler
   → also `qa-security-perf`. Auth, roles or `firmId` handling → also `sec-appsec`. Customer KYC/PII →
   also `sec-compliance-data`.
3. **Verify before reporting done.** `npx tsc --noEmit`, `npx eslint .`, dev server health on :3002, and
   exercise the actual endpoint or screen. Report real output. Never claim a pass you did not run.
4. **Report to the user, not the transcript.** Subagent reports are not shown to them — relay what
   matters: what now works, files touched, how it was verified, what is still open.
5. **Record substantial work** in `worklog.md`, matching the existing format (latest is Task ID 46).

## Project quick facts

Single-page SPA — `src/app/page.tsx` runs a `ViewRouter` over `ViewKey` (29 views in `src/store/app.ts`)
rendering `src/components/app/modules/*.tsx`. The only real routes are `src/app/api/**/route.ts`. A new
screen is a ViewKey + `nav-config.ts` entry + module + ViewRouter case — **never** `src/app/<page>/page.tsx`.

Every business row carries `firmId`; every handler calls `getCurrentUser()` then
`verifyFirmAccess(user.id, firmId)` from `src/lib/session.ts`. Mutations append to `SystemLog`.

Dev: `npm run dev` → http://localhost:3002. Logins: `admin`/`admin123`, `sales8`/`india0000`.
DB: MySQL `omerp` — the database name in `DATABASE_URL` must stay lowercase or Prisma goes blind to
every foreign key (see worklog Task 46).
