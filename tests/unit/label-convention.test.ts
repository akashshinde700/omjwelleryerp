import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { applyConventionDefaults, defaultTagConfig, renderTag, DEFAULT_FIELDS, type TagItem } from '@/lib/label-tags'

/**
 * THE SLOT CONVENTION - why the owner can paste a printer file into oMunim and it prints with no
 * setup at all, and why ours made him map every slot by hand first.
 *
 * The proof is his own pair of files: barcode_main.prn is the template he pastes, barcode_print.prn
 * is the same tag as the printer actually produced it. Fourteen of fourteen commands pair exactly,
 * so the meaning of each slot name is READ OFF HIS PRINTER, not guessed.
 */
const MAIN = readFileSync('tests/unit/fixtures/omprn/barcode_main.prn', 'latin1')
const PRINTED = readFileSync('tests/unit/fixtures/omprn/barcode_print.prn', 'latin1')

/** The quoted operand of each A (text) / B (barcode) command, in file order. */
const operands = (t: string) => [...t.matchAll(/^[AB][^"]*"([^"]*)"/gm)].map((m) => m[1])

const stone = (name: string, g: number) => ({ name, qty: 1, weightGrams: g })
/** The item his printed tag was made from: pd192, 2.020 g, 18KTS, barcode 17200. */
const HIS_ITEM: TagItem = {
  id: 'i1', name: 'RING', itemCode: 'pd192', grossWeight: 2.02, netWeight: 2.02,
  purity: '18kts', barcode: '17200', stones: [],
}
const cfgWith = (fields: Record<string, any>) => ({ ...defaultTagConfig(), fields })

describe('applyConventionDefaults: paste a printer file, print with no configuration', () => {
  it('fills every known slot his real template has, from an empty map', () => {
    const f = applyConventionDefaults({}, MAIN)
    expect(Object.keys(f).sort()).toEqual(['OPTION2', 'OPTION3', 'OPTION4', 'OPTION5', 'OPTION6', 'OPTION8', 'OPTIONZ'])
  })

  it('never overwrites a slot the shop has already set', () => {
    const mine = { OPTION2: { source: 'name' as const }, OPTION3: { source: 'blank' as const } }
    const f = applyConventionDefaults(mine, MAIN)
    expect(f.OPTION2.source).toBe('name')
    expect(f.OPTION3.source).toBe('blank')
    expect(f.OPTION4.source).toBe('netWeight') // the untouched ones still get the convention
  })

  it('returns the SAME object when there is nothing to add, so a caller can skip a re-render', () => {
    const once = applyConventionDefaults({}, MAIN)
    expect(applyConventionDefaults(once, MAIN)).toBe(once)
  })

  it('LPDJ is a literal in his file, not a slot - it is never mapped and prints unchanged', () => {
    expect(DEFAULT_FIELDS.LPDJ).toBeUndefined()
    expect(operands(PRINTED)).toContain('LPDJ')
    expect(operands(renderTag(cfgWith(applyConventionDefaults({}, MAIN)), MAIN, HIS_ITEM).text)).toContain('LPDJ')
  })

  /**
   * THE WHOLE POINT, asserted against the bytes his printer produced. Only the three values his
   * item differs on are allowed to differ; every other command must pair exactly.
   */
  it('his own template, pasted with zero configuration, reproduces his own printed tag', () => {
    const out = renderTag(cfgWith(applyConventionDefaults({}, MAIN)), MAIN, HIS_ITEM)
    expect(operands(out.text)).toEqual(operands(PRINTED))
  })

  it('OPTION5 prints NOTHING - his own file does, so the default no longer guesses the price into it', () => {
    expect(DEFAULT_FIELDS.OPTION5.source).toBe('blank')
    const out = renderTag(cfgWith(applyConventionDefaults({}, MAIN)), MAIN, { ...HIS_ITEM, mrp: 61250 })
    expect(out.text).not.toContain('61250')
  })
})

describe('OPTIONS1..3 are stones 2, 3, 4 - not every stone in each position', () => {
  const three = { ...HIS_ITEM, stones: [stone('Ruby', 0.1), stone('Emerald', 0.2), stone('Pearl', 0.3)] }

  it('one stone per position, in his file\'s own spelling', () => {
    const out = renderTag(cfgWith(applyConventionDefaults({}, MAIN)), MAIN, three)
    const got = operands(out.text)
    expect(got).toContain('0.50 ct Ruby')
    expect(got).toContain('1.00 ct Emerald')
    expect(got).toContain('1.50 ct Pearl')
  })

  /**
   * THE DEFECT THIS LOCKS DOWN: OPTIONS1 did not match /^s[1-9]$/, scored ordinal -1, and so was
   * given EVERY stone joined with ' + '. All four stone positions printed the same full list.
   */
  it('no position carries the joined list of all of them', () => {
    const out = renderTag(cfgWith(applyConventionDefaults({}, MAIN)), MAIN, three)
    expect(out.text).not.toContain(' + ')
  })

  it('a position with no stone prints nothing, and drops its prefix with it', () => {
    const cfg = cfgWith({ ...applyConventionDefaults({}, MAIN), OPTION8: { source: 'stoneWtName', prefix: 'St:' } })
    const out = renderTag(cfg, MAIN, { ...HIS_ITEM, stones: [stone('Ruby', 0.1)] })
    expect(out.text.match(/St:/g)).toHaveLength(1)
  })
})
