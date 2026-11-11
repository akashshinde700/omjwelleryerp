import { seedTestDb } from './seed'

seedTestDb().then(
  () => console.log('test database seeded'),
  (e) => { console.error(e); process.exit(1) }
)
