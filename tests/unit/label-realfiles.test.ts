import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { detectDialect, applyDimensions } from '@/lib/label-engine'
import { declaredSizeMm, declaredOffsetMm } from '@/lib/label-design'

/**
 * HIS OWN SHOP FILES, the ones we used to refuse.
 *
 * He handed over 34 real .prn files (tag/BARCODE FILE_jaydeep). TWELVE of them read as 'unknown
 * dialect' - a third of his library, dead in our app - for two reasons that have nothing to do with
 * the printer language:
 *
 *   1. The command is INDENTED. His BarTender exports put 42 spaces before SIZE, and our anchors
 *      were `^SIZE` / `^REFERENCE`.
 *   2. The file starts with a UTF-8 BOM. Templates are held as LATIN-1 end to end (`fromBytes`),
 *      so the BOM arrives as the three characters ï»¿, NOT as U+FEFF - both spellings are tolerated.
 *
 * And one file states SIZE twice; TSPL is sequential, so the printer obeys the LAST one.
 *
 * The anchors are still anchors: a line must still START with the command, so a quoted "SIZE-18"
 * inside a TEXT payload can never be read as a size. That case is asserted below.
 */
const fx = (n: string) => readFileSync(resolve(__dirname, 'fixtures/omprn', n)).toString('latin1')

describe("his own files, which we used to call 'unknown dialect'", () => {
  it('a BOM + 42 spaces + <xpml> in front of SIZE still reads as TSPL at its true size', () => {
    const t = fx('bom_xpml_100X15.prn')
    expect(t.startsWith('ï»¿')).toBe(true) // the BOM, as latin-1
    expect(detectDialect(t)).toBe('tspl')
    const s = declaredSizeMm(t, 'tspl', 203)!
    expect([+s.widthMm.toFixed(1), +s.heightMm.toFixed(1)]).toEqual([97.5, 15])
  })

  it('a plainly indented TSPL file reads, and its REFERENCE is read too', () => {
    const t = fx('indented_bis_80X12.prn')
    expect(/^ {10,}SIZE /m.test(t)).toBe(true) // genuinely indented, not a tidy fixture
    expect(detectDialect(t)).toBe('tspl')
    expect(+declaredSizeMm(t, 'tspl', 203)!.widthMm.toFixed(1)).toBe(80.1)
    expect(declaredOffsetMm(t, 'tspl', 203)).toEqual({ offsetXmm: 0, offsetYmm: 0 })
  })

  it('a file that states SIZE twice is read at the LAST one, because that is what prints', () => {
    const t = fx('twice_sized_81X12.prn')
    const sizes = [...t.matchAll(/^[^\S\r\n]*SIZE[^\r\n]*/gm)].map((m) => m[0].trim())
    expect(sizes.length).toBeGreaterThan(1)
    expect(sizes[0]).toContain('81 mm')
    expect(+declaredSizeMm(t, 'tspl', 203)!.widthMm.toFixed(1)).toBe(80.1) // the second, not the first
  })

  it('the rewrite keeps the BOM, the indentation and the <xpml> tags byte for byte', () => {
    const t = fx('bom_xpml_100X15.prn')
    const out = applyDimensions(t, 'tspl', { widthMm: 50, heightMm: 25, gapMm: 0, offsetXmm: 0, offsetYmm: 0, dpi: 203 })
    expect(out.changed).toContain('SIZE')
    expect(out.text.startsWith('ï»¿')).toBe(true)
    expect(out.text).toContain("</xpml>SIZE 50 mm, 25 mm")
    expect(/^[ï»¿ ]+<xpml>/m.test(out.text)).toBe(true)
    // every line that is not the SIZE line survives unchanged
    const was = t.split('\r\n').filter((l) => !/SIZE/.test(l))
    const now = out.text.split('\r\n').filter((l) => !/SIZE/.test(l))
    expect(now).toEqual(was)
  })

  it('STILL ANCHORED: a quoted "SIZE-18" in a TEXT payload is not a size command', () => {
    const t = 'SIZE 100 mm, 15 mm\r\nCLS\r\nTEXT 10,10,"3",0,1,1,"SIZE-18"\r\nPRINT 1,1\r\n'
    expect(+declaredSizeMm(t, 'tspl', 203)!.widthMm.toFixed(1)).toBe(100)
    const only = 'CLS\r\nTEXT 10,10,"3",0,1,1,"SIZE 18 mm, 9 mm"\r\nPRINT 1,1\r\n'
    expect(detectDialect(only)).toBe('unknown')
    expect(declaredSizeMm(only, 'tspl', 203)).toBeNull()
  })
})
