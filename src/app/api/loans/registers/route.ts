import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { db } from '@/lib/db'
import { namuna9, namuna15, REGISTER_CUSTOMER_SELECT, type RegisterLoan } from '@/lib/registers'
import { resolveReveal } from '@/lib/pii'

/**
 * GET /api/loans/registers — the Money Lenders Act statutory registers, as DATA.
 *
 *   ?form=namuna9   Namuna No. 9  — the loan register an inspector opens first (date range + firm)
 *   ?form=namuna15  Namuna No. 15 — the annual return, one numbered block per customer
 *
 * ADHAAR NO. comes back MASKED (`XXXX XXXX 7777`). The one caller entitled to the full number is
 * an inspector reading the register — so `?reveal=aadhaar` returns it, but only for a firm
 * owner/manager or an admin, and it writes a SystemLog row naming who, which firm, which form and
 * the reason given. An access nobody recorded cannot be audited, which is the whole point.
 *
 * Read-only otherwise: no mutation, therefore no db.$transaction. Every money figure is
 * replayed from LoanTransaction by src/lib/registers.ts, which calls src/lib/interest.ts — the same
 * derivation the loan list, the release quote and the payments route use, so a register and a
 * release quote taken on the same date agree to the paisa.
 *
 * The PRINT LAYOUT is not built here. src/components/app/print/girvi-docs.tsx (owner: ux-reports-
 * print) already holds Form 7 / Form 8; this endpoint hands it `rows`, `totals`, `firm` and
 * `warnings` ready to lay out, and the shape is the exported Namuna9Row / Namuna15Row types.
 *
 * `warnings` is not decoration. A non-empty `warnings` array means a figure on this return is
 * suspect (a clamped negative, or a loan closed before the payments endpoint existed whose real
 * recovery is unknowable). The print layer MUST show it rather than filing a clean-looking return
 * over the top of it.
 */

const query = z.object({
  firmId: z.string().min(1),
  form: z.enum(['namuna9', 'namuna15']),
  // Defaults: namuna9 → the current month, namuna15 → the Indian financial year to date. Both are
  // overridden by explicit from/to, which is what the screen's date-range filter sends.
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
})

/** 1 April → 31 March, the year the given date falls in. */
function financialYear(on: Date): [Date, Date] {
  const y = on.getUTCMonth() >= 3 ? on.getUTCFullYear() : on.getUTCFullYear() - 1
  return [new Date(Date.UTC(y, 3, 1, 0, 0, 0, 0)), new Date(Date.UTC(y + 1, 2, 31, 23, 59, 59, 999))]
}

function currentMonth(on: Date): [Date, Date] {
  const y = on.getUTCFullYear()
  const m = on.getUTCMonth()
  return [new Date(Date.UTC(y, m, 1, 0, 0, 0, 0)), new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999))]
}

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const parsed = query.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: z.treeifyError(parsed.error) }, { status: 400 })
  }
  const { firmId, form } = parsed.data
  if (!(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // The reveal decision (and its audit row) is taken before any data is read, so a refusal costs
  // nothing and a grant is recorded even if the register itself later fails to build.
  const reveal = await resolveReveal(searchParams, user, firmId, {
    entity: 'register',
    entityId: firmId,
    label: `${form} statutory register`,
  })
  if (!reveal) {
    return NextResponse.json(
      { error: 'Your role may not view full identity numbers on the register. Ask a firm owner or manager.' },
      { status: 403 },
    )
  }

  const now = new Date()
  const [defFrom, defTo] = form === 'namuna15' ? financialYear(now) : currentMonth(now)
  const from = parsed.data.from ?? defFrom
  const to = parsed.data.to ?? defTo
  if (to < from) {
    return NextResponse.json({ error: '`to` is before `from`' }, { status: 400 })
  }

  // Everything taken on or before `to`, whatever its status. The register functions decide which
  // of those rows belongs on which form; filtering by loanDate >= from here would drop exactly the
  // accounts an inspector cares about — the ones opened earlier and still running.
  const loans = (await db.loan.findMany({
    where: { firmId, loanDate: { lte: to } },
    orderBy: { loanDate: 'asc' },
    include: {
      items: true,
      transactions: { orderBy: { date: 'asc' } },
      customer: { select: REGISTER_CUSTOMER_SELECT },
    },
  })) as unknown as RegisterLoan[]

  const [firm, license] = await Promise.all([
    db.firm.findUnique({ where: { id: firmId } }),
    // "Lic. NO." on the Namuna 15 header. Lives as a firm Setting rather than a new Firm column:
    // one string, per firm, that only these two forms read. Set it with
    // PUT /api/settings {firmId, key:'moneyLenderLicenseNo', value:'...'}.
    db.setting.findUnique({ where: { firmId_key: { firmId, key: 'moneyLenderLicenseNo' } } }),
  ])

  const result = form === 'namuna9' ? namuna9(loans, from, to, reveal.has('aadhaar')) : namuna15(loans, from, to)

  return NextResponse.json({
    form,
    from: from.toISOString(),
    to: to.toISOString(),
    firm: firm && {
      id: firm.id, name: firm.name, legalName: firm.legalName, address: firm.address,
      city: firm.city, state: firm.state, pincode: firm.pincode, phone: firm.phone, gstin: firm.gstin,
      licenseNo: license?.value ?? null,
    },
    ...result,
  })
}
