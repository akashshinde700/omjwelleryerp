import { describe, it, expect } from 'vitest'
import { assertFixtureFirmIds, assertSafeDatabaseUrl, databaseUrlFor, loadTestEnv } from '../db-guard'

// The single most important test in this repo: it is what stands between a test run
// and the customer's live `omerp` database.
describe('test-database guard', () => {
  it('refuses the live database by name', () => {
    expect(() => assertSafeDatabaseUrl('mysql://root:pw@localhost:3306/omerp')).toThrow(/REFUSING TO RUN/)
  })

  it('refuses any database not suffixed _test', () => {
    for (const name of ['omerp', 'omerp_backup', 'production', 'jewellery_dev_clean', 'omerp_test_old']) {
      expect(() => assertSafeDatabaseUrl(`mysql://root:pw@localhost:3306/${name}`)).toThrow(/REFUSING TO RUN/)
    }
  })

  it('refuses an uppercase database name (worklog Task 46: Prisma goes blind to foreign keys)', () => {
    expect(() => assertSafeDatabaseUrl('mysql://root:pw@localhost:3306/OmErp_test')).toThrow(/lowercase/)
  })

  it('refuses a missing or nameless URL', () => {
    expect(() => assertSafeDatabaseUrl(undefined)).toThrow()
    expect(() => assertSafeDatabaseUrl('mysql://root:pw@localhost:3306/')).toThrow()
  })

  it('accepts omerp_test', () => {
    expect(assertSafeDatabaseUrl('mysql://root:pw@localhost:3306/omerp_test')).toBe('omerp_test')
  })

  it('accepts a numbered per-run slot schema but nothing else that merely starts with it', () => {
    expect(assertSafeDatabaseUrl('mysql://root:pw@localhost:3306/omerp_test_3')).toBe('omerp_test_3')
    for (const bad of ['omerp_testing', 'omerp_test_prod', 'omerp_test2', 'omerp_tests']) {
      expect(() => assertSafeDatabaseUrl(`mysql://root:pw@localhost:3306/${bad}`)).toThrow(/REFUSING TO RUN/)
    }
  })

  it('databaseUrlFor cannot be talked into building a live-database URL', () => {
    const base = 'mysql://root:pw@localhost:3306/omerp_test'
    expect(databaseUrlFor(base, 'omerp_test_2')).toContain('/omerp_test_2')
    expect(() => databaseUrlFor(base, 'omerp')).toThrow(/REFUSING TO RUN/)
    expect(() => databaseUrlFor('mysql://root:pw@localhost:3306/omerp', 'omerp_test_1')).toThrow(/REFUSING TO RUN/)
  })

  it('refuses a server whose data is not the fixture (the live-DB canary)', () => {
    const ok = () => assertFixtureFirmIds(['tst-firm-jbs', 'tst-firm-mad'], 'http://localhost:3111')
    expect(ok).not.toThrow()
    // A real omerp firm id is a cuid; an empty list means the server answered from somewhere else.
    expect(() => assertFixtureFirmIds(['cmc9k2h0v0000abcd'], 'x')).toThrow(/NOT connected to the test database/)
    expect(() => assertFixtureFirmIds(['tst-firm-jbs', 'cmc9k2h0v0000abcd'], 'x')).toThrow(/NOT connected/)
    expect(() => assertFixtureFirmIds([], 'x')).toThrow(/NOT connected/)
  })

  it('the .env.test actually checked into this machine points somewhere safe', () => {
    expect(loadTestEnv().DATABASE_URL).toMatch(/_test(_\d+)?(\?|$)/)
  })
})
