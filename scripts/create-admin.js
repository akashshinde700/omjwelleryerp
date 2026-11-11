// Creates/updates the admin login and links it to every firm as owner.
// Usage: node scripts/create-admin.js [loginId] [password]
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const db = new PrismaClient()

const LOGIN_ID = process.argv[2] || 'admin'
const PASSWORD = process.argv[3] || 'admin123'

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10)

  // The app is firm-scoped, so make sure at least one firm exists.
  let firm = await db.firm.findFirst()
  if (!firm) {
    firm = await db.firm.create({
      data: {
        code: 'JBS',
        name: 'Jai Bhavani Jewellers',
        legalName: 'Jai Bhavani Jewellers Pvt Ltd',
        city: 'Indore',
        state: 'Madhya Pradesh',
      },
    })
    console.log('Created firm:', firm.code, '-', firm.name)
  }

  const admin = await db.user.upsert({
    where: { loginId: LOGIN_ID },
    // passwordChangedAt ends every session issued before this reset (see jwt callback, src/lib/auth.ts).
    update: { passwordHash, passwordChangedAt: new Date(), role: 'admin', active: true },
    create: {
      loginId: LOGIN_ID,
      email: `${LOGIN_ID}@omerp.local`,
      name: 'Administrator',
      phone: '9999999999',
      role: 'admin',
      active: true,
      passwordHash,
      passwordChangedAt: new Date(),
    },
  })

  const firms = await db.firm.findMany()
  for (const f of firms) {
    await db.userFirm.upsert({
      where: { userId_firmId: { userId: admin.id, firmId: f.id } },
      update: { role: 'owner' },
      create: { userId: admin.id, firmId: f.id, role: 'owner' },
    })
  }

  console.log('Admin ready ->', LOGIN_ID, '/', PASSWORD)
  console.log('Linked to firms:', firms.map((f) => f.code).join(', '))
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
