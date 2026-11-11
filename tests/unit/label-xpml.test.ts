import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { detectDialect, applyDimensions, stripXpml } from '@/lib/label-engine'
import { declaredSizeMm, declaredOffsetMm } from '@/lib/label-design'

// The owner's two real BarTender exports, committed copies (never an absolute E:\ path).
const fx = (n: string) => readFileSync(resolve(__dirname, 'fixtures/omprn', n)).toString('latin1')
const FILES = { 'xpml_barcode.prn': fx('xpml_barcode.prn'), 'xpml_barcode_bis.prn': fx('xpml_barcode_bis.prn') }
const D = { widthMm: 50, heightMm: 25, gapMm: 3, offsetXmm: 2, offsetYmm: 1, dpi: 203 }

describe.each(Object.entries(FILES))('BarTender xpml TSPL: %s', (_n, T) => {
  it('first line really has SIZE on the closing </xpml> line', () => {
    expect(T.startsWith("<xpml><page quantity='0' pitch='15.0 mm'></xpml>SIZE 99.10 mm, 15 mm\r\n")).toBe(true)
  })
  it('is tspl, size 99.1 x 15, reference 0,0', () => {
    expect(detectDialect(T)).toBe('tspl')
    const s = declaredSizeMm(T, 'tspl', 203)!
    expect(s.widthMm).toBeCloseTo(99.1, 6)
    expect(s.heightMm).toBe(15)
    expect(declaredOffsetMm(T, 'tspl', 203)).toEqual({ offsetXmm: 0, offsetYmm: 0 })
  })
  it('rewrite keeps every <xpml> tag byte for byte and changes only the SIZE/REFERENCE commands', () => {
    const r = applyDimensions(T, 'tspl', D)
    expect(r.changed).toContain('SIZE')
    expect(r.text.startsWith("<xpml><page quantity='0' pitch='15.0 mm'></xpml>SIZE 50 mm, 25 mm\r\n")).toBe(true)
    const tags = (s: string) => s.match(/<xpml>.*?<\/xpml>/g)
    expect(tags(r.text)).toEqual(tags(T))
    // Everything except the rewritten commands is identical: undo them and compare bytes.
    const undone = r.text.replace('SIZE 50 mm, 25 mm', 'SIZE 99.10 mm, 15 mm').replace(/^REFERENCE .*/m, 'REFERENCE 0,0').replace(/^GAP .*/m, T.match(/^GAP .*/m)?.[0] ?? '')
    expect(undone).toBe(T)
    expect(detectDialect(r.text)).toBe('tspl')
    expect(declaredSizeMm(r.text, 'tspl', 203)).toEqual({ widthMm: 50, heightMm: 25 })
  })
})

describe('xpml tolerance changes nothing else', () => {
  const TSPL = fx('barcode.prn'), MAIN = fx('barcode_main.prn')
  const ZPL = '^XA\r\n^PW400\r\n^LL200\r\n^LH0,0\r\n^FDOPTION2^FS\r\n^XZ\r\n'
  it('plain TSPL / EPL2 / ZPL are untouched by stripXpml and still detect', () => {
    for (const t of [TSPL, MAIN, ZPL]) expect(stripXpml(t)).toBe(t)
    expect(detectDialect(TSPL)).toBe('tspl')
    expect(detectDialect(MAIN)).toBe('epl2')
    expect(detectDialect(ZPL)).toBe('zpl')
    expect(declaredSizeMm(ZPL, 'zpl', 203)).not.toBeNull()
  })
  it('a quoted SIZE inside a TEXT payload is never a SIZE command', () => {
    const t = 'DIRECTION 0,0\r\nCLS\r\nTEXT 10,10,"0",0,8,8,"SIZE 18 mm, 9 mm"\r\nTEXT 10,30,"0",0,8,8,"SIZE-18"\r\nPRINT 1,1\r\n'
    expect(detectDialect(t)).toBe('unknown')
    expect(declaredSizeMm(t, 'tspl', 203)).toBeNull()
    expect(applyDimensions(t, 'tspl', D)).toEqual({ text: t, changed: [] })
    // and an xpml tag on a TEXT line does not make it one either
    const t2 = '<xpml><page quantity=\'0\'></xpml>TEXT 1,1,"0",0,8,8,"SIZE 18 mm, 9 mm"\r\nCLS\r\n'
    expect(detectDialect(t2)).toBe('unknown')
    expect(applyDimensions(t2, 'tspl', D).changed).toEqual([])
  })
})
