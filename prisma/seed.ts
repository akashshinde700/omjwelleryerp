import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'

// The same bcrypt cost the login path uses. This used to write a reversible `demo$<base64>` string,
// which is a stored password, not a hash — and login accepted it, so the demo format outlived the demo.
function hashPassword(pw: string): string {
  return bcrypt.hashSync(pw, 10)
}

export async function seed() {
  // Firm
  const firm = await db.firm.upsert({
    where: { code: 'JBS' },
    update: {},
    create: {
      code: 'JBS',
      name: 'Jai Bhavani Jewellers',
      legalName: 'Jai Bhavani Jewellers Pvt Ltd',
      gstin: '23ABCDE1234F1Z5',
      pan: 'ABCDE1234F',
      phone: '9876543210',
      email: 'info@jbsonline.in',
      address: 'Main Road, Sarafa Bazaar',
      city: 'Indore',
      state: 'Madhya Pradesh',
      pincode: '452002',
      cgstRate: 1.5,
      sgstRate: 1.5,
      igstRate: 3.0,
    },
  })

  const firm2 = await db.firm.upsert({
    where: { code: 'MADAAN' },
    update: {},
    create: {
      code: 'MADAAN',
      name: 'Madaan Gold Palace',
      gstin: '23XYZAB5678C1Z2',
      pan: 'XYZAB5678C',
      phone: '9123456780',
      email: 'contact@madaangold.in',
      address: 'Sapna Sangeeta Road',
      city: 'Indore',
      state: 'Madhya Pradesh',
      pincode: '452001',
    },
  })

  // User
  const admin = await db.user.upsert({
    where: { loginId: 'sales8' },
    update: {},
    create: {
      loginId: 'sales8',
      email: 'sales8@omunim.in',
      name: 'Sales Admin',
      phone: '9876543210',
      role: 'owner',
      passwordHash: hashPassword('india0000'),
    },
  })

  const staff = await db.user.upsert({
    where: { loginId: 'staff1' },
    update: {},
    create: {
      loginId: 'staff1',
      email: 'staff1@omunim.in',
      name: 'Rahul Verma',
      phone: '9000000001',
      role: 'staff',
      passwordHash: hashPassword('india0000'),
    },
  })

  await db.userFirm.upsert({
    where: { userId_firmId: { userId: admin.id, firmId: firm.id } },
    update: {},
    create: { userId: admin.id, firmId: firm.id, role: 'owner' },
  })
  await db.userFirm.upsert({
    where: { userId_firmId: { userId: admin.id, firmId: firm2.id } },
    update: {},
    create: { userId: admin.id, firmId: firm2.id, role: 'owner' },
  })
  await db.userFirm.upsert({
    where: { userId_firmId: { userId: staff.id, firmId: firm.id } },
    update: {},
    create: { userId: staff.id, firmId: firm.id, role: 'staff' },
  })

  // Gold rate
  await db.goldRate.create({
    data: { firmId: firm.id, metal: 'gold', purity: '22K', rate: 108750 },
  })
  await db.goldRate.create({
    data: { firmId: firm.id, metal: 'gold', purity: '24K', rate: 118750 },
  })
  await db.goldRate.create({
    data: { firmId: firm.id, metal: 'silver', purity: '999', rate: 9850 },
  })

  // Customers
  const customers = [
    { type: 'customer', title: 'Mr', firstName: 'Parth', lastName: 'Soni', mobile: '9620537098', city: 'Indore', village: 'Vijay Nagar', state: 'Madhya Pradesh' },
    { type: 'customer', title: 'Ms', firstName: 'Pooja', lastName: 'Sharma', mobile: '9826012345', city: 'Indore', village: 'Palasia', state: 'Madhya Pradesh' },
    { type: 'customer', title: 'Mr', firstName: 'Gaurav', lastName: 'Verma', mobile: '9009112233', city: 'Bhopal', state: 'Madhya Pradesh' },
    { type: 'customer', title: 'Mr', firstName: 'Pravin', lastName: 'S', mobile: '9977001122', city: 'Indore', village: 'Bhawarkua', state: 'Madhya Pradesh' },
    { type: 'supplier', title: 'M/S', firstName: 'Shri', lastName: 'Bullion', mobile: '9425000001', city: 'Mumbai', state: 'Maharashtra' },
    { type: 'karigar', title: 'Mr', firstName: 'Ramesh', lastName: 'Aher', mobile: '9300000002', city: 'Indore', state: 'Madhya Pradesh', occupation: 'Goldsmith' },
    { type: 'moneyLender', title: 'Mr', firstName: 'Suresh', lastName: 'Joshi', mobile: '9400000003', city: 'Indore', state: 'Madhya Pradesh' },
  ]
  for (const c of customers) {
    await db.customer.create({
      data: { firmId: firm.id, code: 'C' + Math.floor(1000 + Math.random() * 9000), ...c },
    })
  }

  // Stock items
  const stockDefs = [
    { itemCode: 'PG1', category: 'fine', name: 'Gold Necklace Set', gender: 'female', purity: '22K', purityPercent: 91.6, grossWeight: 25.5, netWeight: 24.8, makingCharge: 8500, mrp: 285000 },
    { itemCode: 'PG2', category: 'fine', name: 'Gold Bangles Pair', gender: 'female', purity: '22K', purityPercent: 91.6, grossWeight: 38.2, netWeight: 37.5, makingCharge: 9200, mrp: 420000 },
    { itemCode: 'PS1', category: 'fine', name: 'Gold Ring', gender: 'male', purity: '22K', purityPercent: 91.6, grossWeight: 6.8, netWeight: 6.5, makingCharge: 1200, mrp: 78000 },
    { itemCode: 'AX1', category: 'imitation', name: 'Kundan Set', gender: 'female', grossWeight: 0, netWeight: 0, mrp: 4500 },
    { itemCode: 'BX1', category: 'sterling', name: 'Silver Chain', gender: 'unisex', purity: '925', purityPercent: 92.5, grossWeight: 22.0, netWeight: 21.8, makingCharge: 350, mrp: 3200 },
    { itemCode: 'PG3', category: 'fine', name: 'Gold Earrings', gender: 'female', purity: '18K', purityPercent: 75.0, grossWeight: 4.2, netWeight: 4.0, makingCharge: 950, mrp: 32000 },
    { itemCode: 'PG4', category: 'fine', name: 'Gold Chain', gender: 'male', purity: '22K', purityPercent: 91.6, grossWeight: 18.0, netWeight: 17.6, makingCharge: 5400, mrp: 215000 },
    { itemCode: 'CR1', category: 'crystal', name: 'Diamond Pendant', gender: 'female', grossWeight: 2.1, netWeight: 1.9, stoneWeight: 0.45, stoneAmount: 45000, mrp: 95000 },
  ]
  for (const s of stockDefs) {
    await db.stockItem.create({ data: { firmId: firm.id, ...s, status: 'available' } })
  }

  // Loans (Girvi)
  const cust = await db.customer.findFirst({ where: { firmId: firm.id, firstName: 'Parth' } })
  if (cust) {
    await db.loan.create({
      data: {
        firmId: firm.id, loanNo: 'A101', customerId: cust.id, customerName: 'Parth Soni',
        customerMobile: cust.mobile, loanDate: new Date('2026-08-07'), loanType: 'secured',
        principalAmount: 50000, interestRate: 2, timePeriod: 12, dueDate: new Date('2027-08-07'),
        status: 'active', items: { create: [{ name: 'Gold Bangle', purity: '22K', grossWeight: 15.2, netWeight: 15.0, estimatedValue: 60000 }] },
      },
    })
  }
  const cust2 = await db.customer.findFirst({ where: { firmId: firm.id, firstName: 'Pooja' } })
  if (cust2) {
    await db.loan.create({
      data: {
        firmId: firm.id, loanNo: 'A102', customerId: cust2.id, customerName: 'Pooja Sharma',
        customerMobile: cust2.mobile, loanDate: new Date('2026-08-08'), loanType: 'secured',
        principalAmount: 50000, interestRate: 2.5, timePeriod: 6, dueDate: new Date('2027-02-08'),
        status: 'active', items: { create: [{ name: 'Gold Necklace', purity: '22K', grossWeight: 22.0, netWeight: 21.5, estimatedValue: 65000 }] },
      },
    })
  }
  await db.loan.create({
    data: {
      firmId: firm.id, loanNo: 'A104', customerName: 'Anika', loanDate: new Date('2026-08-08'),
      loanType: 'unsecured', principalAmount: 50000, interestRate: 2, status: 'active',
    },
  })

  // Invoice
  const cust3 = await db.customer.findFirst({ where: { firmId: firm.id, firstName: 'Gaurav' } })
  const stock1 = await db.stockItem.findFirst({ where: { firmId: firm.id, itemCode: 'PG1' } })
  if (cust3 && stock1) {
    await db.invoice.create({
      data: {
        firmId: firm.id, invoiceNo: 'INV-1001', customerId: cust3.id, customerName: 'Gaurav Verma',
        customerMobile: cust3.mobile, invoiceDate: new Date('2026-08-09'), goldRate: 108750,
        // 285000 − 5000 discount = 280000 taxable, + 3% GST (4200 + 4200) = 288400. This row
        // used to read 289900, which reconciled to nothing: it predates the server-side tax
        // recompute, so no code ever checked it. The print guard flags it on sight — keep the
        // total equal to its own components or the demo bill refuses to print.
        subtotal: 285000, discount: 5000, cgst: 4200, sgst: 4200, totalAmount: 288400,
        amountByCash: 288400, paymentMode: 'cash', status: 'completed',
        items: { create: [{ name: stock1.name, purity: stock1.purity, grossWeight: stock1.grossWeight, netWeight: stock1.netWeight, makingCharge: stock1.makingCharge, rate: stock1.mrp ?? undefined, amount: 285000, total: 285000 }] },
      },
    })
  }

  // Scheme
  await db.scheme.create({
    data: {
      firmId: firm.id, name: 'Suvarna 11+1', groupName: 'Gold Savings', emiAmount: 5000,
      durationMonths: 11, totalInstallments: 11, bonusMonths: 1, description: 'Pay 11 months, get 1 month bonus on maturity.',
    },
  })

  // Udhaar
  await db.udhaar.create({
    data: { firmId: firm.id, customerName: 'Vinod Sir', type: 'credit', amount: 20000, description: 'Short term credit', status: 'active' },
  })

  // Expenses
  await db.expense.createMany({
    data: [
      { firmId: firm.id, category: 'rent', amount: 25000, description: 'Shop rent August', expenseDate: new Date('2026-08-01') },
      { firmId: firm.id, category: 'salary', amount: 45000, description: 'Staff salary', expenseDate: new Date('2026-08-05') },
      { firmId: firm.id, category: 'utility', amount: 4200, description: 'Electricity bill', expenseDate: new Date('2026-08-06') },
    ],
  })

  // Accounts
  const accDefs = [
    { code: '1001', name: 'Cash in Hand', type: 'asset', openingBalance: 500000 },
    { code: '1002', name: 'Bank Account', type: 'asset', openingBalance: 1200000 },
    { code: '1003', name: 'Gold Stock', type: 'asset', openingBalance: 2500000 },
    { code: '2001', name: 'Loans Given', type: 'asset', openingBalance: 800000 },
    { code: '3001', name: 'Capital Account', type: 'equity', openingBalance: 5000000, balanceType: 'credit' },
    { code: '4001', name: 'Sales Revenue', type: 'income', openingBalance: 0, balanceType: 'credit' },
    { code: '5001', name: 'Purchase', type: 'expense', openingBalance: 0 },
    { code: '5002', name: 'Rent Expense', type: 'expense', openingBalance: 0 },
    { code: '5003', name: 'Salary Expense', type: 'expense', openingBalance: 0 },
  ]
  for (const a of accDefs) {
    await db.account.create({ data: { firmId: firm.id, ...a } })
  }

  console.log('Seed complete. Firms:', firm.code, firm2.code, '| User: sales8 / india0000')
}

seed().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
