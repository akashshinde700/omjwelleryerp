import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { assertSafeDatabaseUrl, databaseUrlFor, loadTestEnv } from './db-guard'

/**
 * Deterministic fixture for the test database. Wipes every table and rebuilds a
 * known-shaped tenant, so a spec can assert on exact figures instead of whatever
 * happens to be in the developer's data.
 *
 * Two firms exist on purpose: JBS is the subject of the suite, MAD is the other
 * tenant that must never be reachable from a JBS session.
 */
export const FIX = {
  firmJBS: { id: 'tst-firm-jbs', code: 'JBS', name: 'Jai Bhavani Jewellers' },
  firmMAD: { id: 'tst-firm-mad', code: 'MAD', name: 'Madaan Jewellers' },
  admin: { id: 'tst-user-admin', loginId: 'admin', password: 'admin123' },
  sales8: { id: 'tst-user-sales8', loginId: 'sales8', password: 'india0000' },
  /** Belongs to MAD only - used to prove a JBS firmId is refused. */
  outsider: { id: 'tst-user-outsider', loginId: 'outsider', password: 'outsider123' },
  /** Regression pair: loans must not leak between these two. */
  anika: { id: 'tst-cust-anika', code: 'C5497', firstName: 'Anika', lastName: 'Sharma' },
  pooja: { id: 'tst-cust-pooja', code: 'C1673', firstName: 'Pooja', lastName: 'Sharma' },
  /** A party with no details and no activity - the empty-state path. */
  blank: { id: 'tst-cust-blank', code: 'C7000', firstName: 'Rohit', lastName: 'Blank' },
  supplier: { id: 'tst-cust-supplier', code: 'C8000', firstName: 'Kailash', lastName: 'Traders' },
  /** Every invoice the API specs create is billed here, so the regression pair stays pristine. */
  billTo: { id: 'tst-cust-billto', code: 'C9001', firstName: 'Testbill', lastName: 'Buyer', loyaltyPoints: 50 },
  /** Registered in Maharashtra while the firm is in Madhya Pradesh -> inter-state supply (IGST). */
  outOfState: { id: 'tst-cust-oos', code: 'C9002', firstName: 'Mumbai', lastName: 'Buyer', state: 'Maharashtra' },
  madCustomer: { id: 'tst-cust-mad', code: 'M1001', firstName: 'Vikram', lastName: 'Madaan' },
  loanA102: { id: 'tst-loan-a102', loanNo: 'A102', principalAmount: 50000 },
  loanA105: { id: 'tst-loan-a105', loanNo: 'A105', principalAmount: 25000 },
  /** Available stock in JBS, priced so GST maths comes out on round numbers. */
  stock: [
    { id: 'tst-stock-1', itemCode: 'P1', name: 'Gold Ring 22K', mrp: 30000 },
    { id: 'tst-stock-2', itemCode: 'P2', name: 'Gold Chain 22K', mrp: 50000 },
    { id: 'tst-stock-3', itemCode: 'P3', name: 'Gold Bangle 22K', mrp: 80000 },
    { id: 'tst-stock-4', itemCode: 'P4', name: 'Gold Pendant 22K', mrp: 20000 },
  ],
  /** Reserved for the browser specs — the API specs must never sell these out from under them. */
  e2eStock: [
    { id: 'tst-stock-e1', itemCode: 'P91', name: 'Showroom Ring 22K', mrp: 30000 },
    { id: 'tst-stock-e2', itemCode: 'P92', name: 'Showroom Chain 22K', mrp: 45000 },
    { id: 'tst-stock-e3', itemCode: 'P93', name: 'Showroom Necklace 22K', mrp: 100000 },
  ],
} as const

export function testPrisma() {
  return new PrismaClient({ datasourceUrl: loadTestEnv().DATABASE_URL })
}

/**
 * Create this run's own schema if it is not there yet (slot schemas are made on first use).
 * Only ever CREATE — nothing in the harness drops a database — and only against a name
 * db-guard has already vetted as a lowercase *_test[_n].
 */
export async function ensureTestSchema(url = loadTestEnv().DATABASE_URL) {
  const name = assertSafeDatabaseUrl(url)
  const parent = databaseUrlFor(url, name.replace(/_\d+$/, ''))
  const db = new PrismaClient({ datasourceUrl: parent })
  try {
    await db.$executeRawUnsafe(
      `CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    )
  } catch (e) {
    throw new Error(
      `Could not create the per-run schema "${name}" via ${assertSafeDatabaseUrl(parent)}. ` +
        `Run \`npm run test:db:setup\` once to create the base test database.
${e}`
    )
  } finally {
    await db.$disconnect()
  }
}

/** TRUNCATE every table in the test schema. Safe only because db-guard vetted the URL. */
async function wipe(db: PrismaClient) {
  const rows = await db.$queryRaw<{ TABLE_NAME: string }[]>`
    SELECT TABLE_NAME FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`
  const tables = rows.map((r) => r.TABLE_NAME).filter((t) => t !== '_prisma_migrations')
  await db.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0')
  for (const t of tables) await db.$executeRawUnsafe('TRUNCATE TABLE `' + t + '`')
  await db.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1')
}

export async function seedTestDb() {
  await ensureTestSchema()
  const db = testPrisma()
  try {
    await wipe(db)
    const hash = (pw: string) => bcrypt.hashSync(pw, 10)

    await db.firm.createMany({
      data: [
        { id: FIX.firmJBS.id, code: FIX.firmJBS.code, name: FIX.firmJBS.name, gstin: '23AABCJ1234F1Z5', state: 'Madhya Pradesh', cgstRate: 1.5, sgstRate: 1.5, igstRate: 3.0, loyaltyRate: 1.0 },
        { id: FIX.firmMAD.id, code: FIX.firmMAD.code, name: FIX.firmMAD.name, gstin: '23AABCM9876F1Z5', state: 'Madhya Pradesh', loyaltyRate: 1.0 },
      ],
    })

    await db.user.createMany({
      data: [
        { id: FIX.admin.id, loginId: 'admin', name: 'Admin', role: 'admin', passwordHash: hash(FIX.admin.password) },
        { id: FIX.sales8.id, loginId: 'sales8', name: 'Sales Owner', role: 'owner', passwordHash: hash(FIX.sales8.password) },
        { id: FIX.outsider.id, loginId: 'outsider', name: 'Other Tenant', role: 'owner', passwordHash: hash(FIX.outsider.password) },
      ],
    })
    await db.userFirm.createMany({
      data: [
        { userId: FIX.admin.id, firmId: FIX.firmJBS.id, role: 'owner' },
        { userId: FIX.sales8.id, firmId: FIX.firmJBS.id, role: 'owner' },
        { userId: FIX.outsider.id, firmId: FIX.firmMAD.id, role: 'owner' },
      ],
    })

    await db.customer.createMany({
      data: [
        {
          id: FIX.anika.id, firmId: FIX.firmJBS.id, code: FIX.anika.code, type: 'customer',
          title: 'Ms.', firstName: FIX.anika.firstName, lastName: FIX.anika.lastName, mobile: '9876500001',
          city: 'Indore', state: 'Madhya Pradesh', village: 'Rau',
          pan: 'ABCDE1234F', aadhaar: '123456789012', bankAccName: 'Anika Sharma', bankAccNumber: '50100123456789',
          kycDocType: 'aadhaar', kycDocNo: '123456789012',
          loyaltyPoints: 120, openingBalance: 0, balanceType: 'debit',
        },
        {
          id: FIX.pooja.id, firmId: FIX.firmJBS.id, code: FIX.pooja.code, type: 'customer',
          title: 'Ms.', firstName: FIX.pooja.firstName, lastName: FIX.pooja.lastName, mobile: '9876500002',
          city: 'Indore', state: 'Madhya Pradesh',
          loyaltyPoints: 0, openingBalance: 0, balanceType: 'debit',
        },
        {
          // Nothing beyond a name: drives the "Nothing else recorded" details empty state.
          id: FIX.blank.id, firmId: FIX.firmJBS.id, code: FIX.blank.code, type: 'customer',
          firstName: FIX.blank.firstName, lastName: FIX.blank.lastName,
        },
        {
          id: FIX.supplier.id, firmId: FIX.firmJBS.id, code: FIX.supplier.code, type: 'supplier',
          firstName: FIX.supplier.firstName, lastName: FIX.supplier.lastName, mobile: '9876500003',
        },
        {
          id: FIX.billTo.id, firmId: FIX.firmJBS.id, code: FIX.billTo.code, type: 'customer',
          firstName: FIX.billTo.firstName, lastName: FIX.billTo.lastName, mobile: '9876500009',
          state: 'Madhya Pradesh', city: 'Indore', loyaltyPoints: FIX.billTo.loyaltyPoints,
        },
        {
          id: FIX.outOfState.id, firmId: FIX.firmJBS.id, code: FIX.outOfState.code, type: 'customer',
          firstName: FIX.outOfState.firstName, lastName: FIX.outOfState.lastName, mobile: '9876500010',
          state: FIX.outOfState.state, city: 'Mumbai',
        },
        {
          id: FIX.madCustomer.id, firmId: FIX.firmMAD.id, code: FIX.madCustomer.code, type: 'customer',
          firstName: FIX.madCustomer.firstName, lastName: FIX.madCustomer.lastName, mobile: '9876500004',
        },
      ],
    })

    await db.loan.createMany({
      data: [
        {
          id: FIX.loanA102.id, firmId: FIX.firmJBS.id, loanNo: FIX.loanA102.loanNo,
          customerId: FIX.pooja.id, customerName: 'Pooja Sharma', customerMobile: '9876500002',
          principalAmount: FIX.loanA102.principalAmount, interestRate: 2, interestType: 'monthly',
          timePeriod: 12, status: 'active', loanDate: new Date('2026-01-10T00:00:00Z'),
        },
        {
          id: FIX.loanA105.id, firmId: FIX.firmJBS.id, loanNo: FIX.loanA105.loanNo,
          customerId: FIX.anika.id, customerName: 'Anika Sharma', customerMobile: '9876500001',
          principalAmount: FIX.loanA105.principalAmount, interestRate: 2, interestType: 'monthly',
          timePeriod: 6, status: 'active', loanDate: new Date('2026-02-14T00:00:00Z'),
        },
      ],
    })

    await db.stockItem.createMany({
      data: [...FIX.stock, ...FIX.e2eStock].map((s) => ({
        id: s.id, firmId: FIX.firmJBS.id, itemCode: s.itemCode, name: s.name,
        category: 'fine', purity: '22K', purityPercent: 91.6, hsnCode: '7113',
        grossWeight: 10, netWeight: 10, makingCharge: 0, qty: 1,
        mrp: s.mrp, costPrice: s.mrp, status: 'available',
      })),
    })

    return FIX
  } finally {
    await db.$disconnect()
  }
}
