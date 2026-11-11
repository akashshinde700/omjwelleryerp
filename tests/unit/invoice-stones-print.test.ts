import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stoneDetail, DEFAULT_INVOICE_CONFIG, type InvoiceConfig } from '@/components/app/print/invoice-print'

/**
 * ── TASK 90 SECURITY GATE: the PRINT side of InvoiceItem.stones ────────────────────────────────
 *
 * stoneDetail() is the only reader of a TEXT column that a client's array was JSON.stringify'd
 * into. The existing suite (tests/unit/invoice-print.test.ts, "several stones on one invoice line")
 * already pins the happy path and ten malformed-JSON shapes. This file covers what that block does
 * NOT: hostile content rather than malformed syntax, prototype pollution, pathological size and
 * depth, and non-string field types — every one of which is a shape the column can actually hold
 * once a row is hand-edited, restored from an older build, or written by a future looser writer.
 *
 * The rule being defended: a bill that white-screens at the printer is worse than a bill missing a
 * detail line. stoneDetail() must ALWAYS return a string and NEVER throw.
 *
 * Owner: qa-security-perf.
 */

const on: InvoiceConfig = { ...DEFAULT_INVOICE_CONFIG, showStoneCert: true }
const json = (...rows: unknown[]) => JSON.stringify(rows)
const ruby = { name: 'Ruby', qty: 1, weightGrams: 0.06 }

describe('stones print path — hostile stored values', () => {
  it('never throws and always returns a string, whatever the column holds', () => {
    const shapes: (string | null | undefined)[] = [
      null, undefined, '', '   ', '\u0000', 'undefined', 'NaN', '{not json', '[',
      '[}', '{"a":1}', '"a string"', '3', 'true', '[1,2,3]', '[null,null]', '[[],[]]',
      '[{},{}]', json({}, {}), json([ruby], [ruby]), json('x', 'y'), json(1, 2),
      '[{"name":{"$ne":null}},{"name":["a"]}]',
      json({ name: 'A', weightGrams: 'lots' }, { name: 'B', weightGrams: null }),
      json({ name: 'A', weightGrams: 'Infinity' }, ruby),
      json({ name: 'A', qty: 'many' }, ruby),
      json({ name: 'A', qty: Number.MAX_SAFE_INTEGER }, ruby),
      '[{"name":"A","weightGrams":1e999},{"name":"B"}]', // JSON.parse -> Infinity
      '[{"name":"A","weightGrams":-5},{"name":"B"}]',
    ]
    for (const stones of shapes) {
      const out = (() => { try { return stoneDetail({ stones }, on) } catch (e) { return e } })()
      expect(typeof out, `threw or returned non-string for ${JSON.stringify(stones)}`).toBe('string')
    }
  })

  it('an injected script/HTML payload comes back as inert TEXT, never markup', () => {
    // The route accepts free-form stone names (grading vocabulary differs per stone family), so
    // `<script>` CAN legitimately be stored. Safety is that this returns a plain string which
    // invoice-doc.tsx renders as a JSX text child — asserted at source below.
    const payload = '</script><img src=x onerror=alert(1)>'
    const run = stoneDetail({ stones: json({ name: payload, weightGrams: 0.1 }, ruby) }, on)
    expect(typeof run).toBe('string')
    expect(run).toContain(payload)       // not silently dropped, so the operator sees what was typed
    expect(run.split('\n')).toHaveLength(1)
  })

  it('the print sheet renders every stone string as a JSX text child, never as HTML', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/app/print/invoice-doc.tsx'), 'utf8')
    // Every stone string must reach the DOM through React's escaping. If ANY of this ever becomes
    // dangerouslySetInnerHTML, every stone name on every bill becomes stored XSS — so the sheet is
    // held to carrying none of it anywhere, which is stronger than the old slice-around-the-run.
    expect(src).not.toContain('dangerouslySetInnerHTML')
    // A4/A5: the stone's own ROW (oMunim's layout) prints its identity, its certificate and its
    // rate as plain children of a <span>/<Td>.
    expect(src).toMatch(/<span>\{stone\.text\}<\/span>/)
    expect(src).toMatch(/>\{stone\.cert\}<\/span>/)
    expect(src).toMatch(/\{stone\.rate \|\| '—'\}/)
    // The 80mm roll has no columns at all, so there the run survives — also a plain text child.
    expect(src).toMatch(/<span \{\.\.\.fa\(105\)\} className="basis-full">\{stones\}<\/span>/)
  })

  it('a __proto__ / constructor row pollutes nothing', () => {
    const before = ({} as Record<string, unknown>).polluted
    const run = stoneDetail({ stones: '[{"__proto__":{"polluted":"yes"},"name":"A","weightGrams":0.1},{"constructor":{"prototype":{"polluted":"yes"}},"name":"B"}]' }, on)
    expect(typeof run).toBe('string')
    expect(({} as Record<string, unknown>).polluted).toBe(before)
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')).toBe(false)
  })

  it('a pathologically DEEP snapshot is refused by the parse, not by a crash', () => {
    const deep = `${'['.repeat(200_000)}${']'.repeat(200_000)}`
    expect(() => stoneDetail({ stones: deep }, on)).not.toThrow()
    expect(stoneDetail({ stones: deep }, on)).toBe('')
  })

  it('a pathologically LARGE snapshot still completes promptly', () => {
    // The route caps a line at 40 stones; a hand-edited or legacy row is not capped by anything.
    const many = JSON.stringify(Array.from({ length: 20_000 }, (_, i) => ({ name: `S${i}`, weightGrams: 0.01, certNo: `C${i}` })))
    const t0 = Date.now()
    const run = stoneDetail({ stones: many }, on)
    const ms = Date.now() - t0
    expect(typeof run).toBe('string')
    expect(run.startsWith('Stones: ')).toBe(true)
    expect(ms, `20k stone rows took ${ms} ms to format`).toBeLessThan(2000)
  })

  it('a non-string field type degrades to nothing, never to "[object Object]"', () => {
    const run = stoneDetail({ stones: json(
      { name: { evil: 1 }, clarity: ['a'], colorGrade: 7, shape: true, certLab: null, certNo: 12345, weightGrams: 0.1 },
      ruby,
    ) }, on)
    expect(run).not.toContain('[object Object]')
    expect(run).not.toContain('12345')   // a numeric certNo is not a certificate string
    expect(run).toBe('Stones: Stone 0.50 ct; Ruby 0.30 ct')
  })

  it('a huge unicode name survives the run without breaking it into two lines', () => {
    const name = `${'💎'.repeat(40)}  `
    const run = stoneDetail({ stones: json({ name, weightGrams: 0.1 }, ruby) }, on)
    expect(run.split('\n')).toHaveLength(1)
    expect(run).toContain('💎')
  })
})

describe('stone RATE in the per-stone run', () => {
  const dia = { name: 'Diamond', certLab: 'GIA', certNo: '2185471', weightGrams: 0.1, rateUnit: 'CT' }
  const run = (...rows: unknown[]) => stoneDetail({ stones: json(...rows) }, on)

  it('appends the SELL rate, never the purchase rate, with the unit from rateUnit', () => {
    expect(run({ ...dia, rateCt: 62000, sellRateCt: 85000 })).toBe('Stones: Diamond 0.50 ct · GIA 2185471 · ₹85,000/ct')
    // sell rate blank -> falls back to rateCt, exactly as deriveLineStones does
    expect(run({ ...dia, rateCt: 62000, sellRateCt: null })).toContain('· ₹62,000/ct')
    const unit = (rateUnit: string) => run({ name: 'X', weightGrams: 1, sellRateCt: 5, rateUnit })
    expect(unit('GM')).toContain('₹5/g')
    expect(unit('MG')).toContain('₹5/mg')
    expect(unit('KG')).toContain('₹5/kg')
    expect(unit('PP')).toContain('₹5/pc')
  })

  it('FX is one amount for the lot: no per-unit suffix', () => {
    expect(run({ name: 'Lot', weightGrams: 1, sellRateCt: 1200, rateUnit: 'FX' })).toBe('Stones: Lot 5.00 ct · ₹1,200')
  })

  it('a priced stone speaks even with nothing else to say; an FX-priced bare stone does not', () => {
    expect(run({ weightGrams: 0.1, sellRateCt: 85000, rateUnit: 'CT' })).toBe('Stones: Stone 0.50 ct · ₹85,000/ct')
    expect(run({ weightGrams: 0.1, sellRateCt: 1200, rateUnit: 'FX' })).toBe('')
    expect(run({ weightGrams: 0.1 })).toBe('')
  })

  it('an unknown unit, or a non-numeric / zero / negative rate, prints no rate and never throws', () => {
    for (const bad of [
      { rateUnit: 'LAKH', sellRateCt: 5 }, { rateUnit: {}, sellRateCt: 5 }, { rateUnit: 'constructor', sellRateCt: 5 },
      { sellRateCt: '85000' }, { sellRateCt: 0 }, { sellRateCt: -5 }, { sellRateCt: {} }, { sellRateCt: [1] },
      { sellRateCt: 1e999 }, { sellRateCt: true },
    ]) {
      const out = run({ ...dia, ...bad })
      expect(out, JSON.stringify(bad)).toBe('Stones: Diamond 0.50 ct · GIA 2185471')
    }
  })
})
