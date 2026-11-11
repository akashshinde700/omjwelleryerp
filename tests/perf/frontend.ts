/**
 * Front-end numbers against the volume seed: what the counter actually waits for.
 *
 *  - first paint / DOM-interactive / load on Home and on the billing screen
 *  - every API call the app makes in the first seconds after login, with its payload size
 *  - how many DOM nodes the biggest lists render
 *  - the one that matters: Enter on a mobile number -> that customer visible
 *
 *   npx vite-node tests/perf/frontend.ts
 */
import { chromium, type Page } from '@playwright/test'
import { PERF, PERF_BASE } from './env'

type Call = { url: string; ms: number; kb: number; status: number }

const calls: Call[] = []

async function track(page: Page) {
  const started = new Map<string, number>()
  page.on('request', (r) => started.set(r.url(), performance.now()))
  page.on('response', async (r) => {
    const u = r.url()
    if (!u.includes('/api/')) return
    let kb = 0
    try { kb = (await r.body()).byteLength / 1024 } catch { /* redirect / no body */ }
    calls.push({ url: u.replace(PERF_BASE, ''), ms: Math.round(performance.now() - (started.get(u) ?? performance.now())), kb: Math.round(kb * 10) / 10, status: r.status() })
  })
}

const timings = (page: Page) =>
  page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
    const fp = performance.getEntriesByType('paint').find((p) => p.name === 'first-contentful-paint')
    return {
      fcp: Math.round(fp?.startTime ?? -1),
      domInteractive: Math.round(n.domInteractive),
      domContentLoaded: Math.round(n.domContentLoadedEventEnd),
      load: Math.round(n.loadEventEnd),
      transferredKB: Math.round((performance.getEntriesByType('resource') as PerformanceResourceTiming[]).reduce((s, r) => s + r.transferSize, 0) / 1024),
    }
  })

const domNodes = (page: Page) => page.evaluate(() => ({ nodes: document.getElementsByTagName('*').length, rows: document.querySelectorAll('tr').length }))

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ baseURL: PERF_BASE, viewport: { width: 1440, height: 900 } })
  await track(page)

  // ── cold load of the login screen ──
  const t0 = performance.now()
  await page.goto('/', { waitUntil: 'load' })
  console.log('login screen:', JSON.stringify(await timings(page)), `wall ${Math.round(performance.now() - t0)}ms`)

  // ── login -> Home ──
  calls.length = 0
  const tLogin = performance.now()
  await page.locator('#loginId').fill(PERF.admin.loginId)
  await page.locator('#password').fill(PERF.admin.password)
  await page.getByRole('button', { name: /sign in|login/i }).click()
  await page.waitForSelector('#loginId', { state: 'detached', timeout: 60_000 })
  await page.waitForLoadState('networkidle')
  console.log(`\nlogin -> Home interactive: ${Math.round(performance.now() - tLogin)}ms`)
  console.log('Home DOM:', JSON.stringify(await domNodes(page)))
  console.log('\nAPI calls after login (in order):')
  let total = 0
  for (const c of calls) { total += c.kb; console.log(`  ${String(c.status)} ${String(c.ms).padStart(5)}ms ${String(c.kb).padStart(8)}KB  ${c.url}`) }
  console.log(`  TOTAL ${total.toFixed(1)}KB over ${calls.length} calls`)

  // ── the counter's number: Enter on a mobile -> the customer on screen ──
  calls.length = 0
  const search = page.locator('input[placeholder*="obile" i], input[placeholder*="earch" i]').first()
  if (await search.count()) {
    const t = performance.now()
    await search.click()
    await search.fill('9800004321')
    await search.press('Enter')
    try {
      await page.getByText(/9800004321/).first().waitFor({ timeout: 15_000 })
      console.log(`\nmobile lookup (type + Enter -> customer visible): ${Math.round(performance.now() - t)}ms`)
    } catch {
      console.log(`\nmobile lookup: no row matched within 15s (calls: ${calls.map((c) => c.url).join(', ')})`)
    }
    for (const c of calls) console.log(`  ${c.status} ${c.ms}ms ${c.kb}KB ${c.url}`)
  } else {
    console.log('\nmobile lookup: no search box found on Home')
  }

  // ── the heaviest screens ──
  for (const [label, name] of [['Billing', /^Billing/], ['Stock', /^Stock/], ['Customers', /^Customers/], ['Gold Loan', /^Gold Loan/], ['The Books', /^The Books/]] as const) {
    calls.length = 0
    const link = page.locator('nav button, nav a').filter({ hasText: name }).first()
    if (!(await link.count())) { console.log(`\n${label}: no nav item matched`); continue }
    const t = performance.now()
    await link.click()
    await link.click()
    await page.waitForTimeout(2500)
    const ms = Math.round(performance.now() - t)
    const dom = await domNodes(page)
    console.log(`\n${label}: ${ms}ms to idle, DOM ${dom.nodes} nodes / ${dom.rows} <tr>, ${calls.reduce((s, c) => s + c.kb, 0).toFixed(1)}KB over ${calls.length} calls`)
    for (const c of calls) console.log(`  ${c.status} ${String(c.ms).padStart(5)}ms ${String(c.kb).padStart(8)}KB  ${c.url}`)
  }

  await browser.close()
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
