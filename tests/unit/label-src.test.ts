import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parsePrn, moveSrc, addSrc, removeSrc, type ElSrc, type ParsedTag } from '@/lib/label-parse'
import { detectDialect, type Dialect } from '@/lib/label-engine'
import { dotsAt, mmAt } from '@/lib/label-design'

/**
 * MOVING A FIELD IN HIS OWN FILE, by splicing two numbers.
 *
 * The whole point of ElSrc is that we never re-write the file: a parser that re-serialises would
 * reformat his 42-space indentation, lose his BOM, turn CRLF into LF and - the one that destroys a
 * tag - re-encode the BITMAP logo every `_bis` file carries. So the assertions here are about BYTES:
 * exactly two numbers differ, everything either side is identical, and add-then-remove is a no-op.
 */
const fx = (n: string) => readFileSync(resolve(__dirname, 'fixtures/omprn', n)).toString('latin1')
const FILES = ['bom_xpml_100X15.prn', 'indented_bis_80X12.prn', 'twice_sized_81X12.prn', 'barcode_main.prn', 'xpml_barcode_bis.prn']
const crlf = (...l: string[]) => l.join('\r\n') + '\r\n'

// dbdir\barcode\TSC\barcode_81X12.prn - ZPL, one field per line, ^FT = a BASELINE
const ZPL = crlf(
  '^XA', '^MMT', '^PW576', '^LL288', '^LS0', '^CI28', '^PR4,4',
  '^FT35,30^A0N,22,20^FDOPTION1^FS', '^FT35,50^A0N,20,18^FDOPTION2^FS', '^FT35,110^A0N,18,18^FDOPTION4^FS',
  '^BY1,3,21', '^FT35,210^BCN,,N,N', '^FD>:OPTIONZ^FS', '^PQ1,0,1,Y', '^XZ',
)

const read = (t: string): { tag: ParsedTag; dialect: Dialect } => {
  const dialect = detectDialect(t)
  const tag = parsePrn(t, dialect, 203)
  expect(tag).not.toBeNull()
  return { tag: tag!, dialect }
}
const bySlot = (tag: ParsedTag, slot: string) => tag.elements.find((e) => e.slot === slot)!

describe('ElSrc - where each element really lives in his files', () => {
  for (const name of FILES) {
    it(`${name}: every drawn element is locatable and a zero move is a no-op`, () => {
      const t = fx(name)
      const { tag } = read(t)
      expect(tag.elements.length).toBeGreaterThan(0)
      for (const e of tag.elements) {
        expect(e.src, `${e.slot ?? e.kind} has no src`).toBeTruthy()
        expect(moveSrc(t, e.src!, 0, 0)).toBe(t) // the offsets point at the numbers and nothing else
        expect(t.slice(e.src!.xStart, e.src!.xEnd)).toMatch(/^-?\d+$/)
        expect(t.slice(e.src!.yStart, e.src!.yEnd)).toMatch(/^-?\d+$/)
        expect(e.src!.line).toBeGreaterThan(0)
      }
    })
  }

  it('his EPL2 file: a moved field changes exactly two numbers, and the move is the one asked for', () => {
    const t = fx('barcode_main.prn')
    const { tag } = read(t)
    const el = bySlot(tag, 'OPTION3')
    const out = moveSrc(t, el.src!, 10, -20)
    expect(out.length).toBe(t.length) // 270 -> 280 and 40 -> 20: same digits, same bytes
    expect(out.slice(0, el.src!.xStart)).toBe(t.slice(0, el.src!.xStart)) // nothing before it moved
    expect(out.slice(el.src!.yEnd)).toBe(t.slice(el.src!.yEnd)) // nothing after it moved
    expect(t).toContain('A270,40,0,2,1,1,N,"OPTION3"')
    expect(out).toContain('A280,20,0,2,1,1,N,"OPTION3"')
    // and nothing else in the file moved
    expect(out.replace('A280,20,0,2,1,1,N,"OPTION3"', 'A270,40,0,2,1,1,N,"OPTION3"')).toBe(t)
  })

  it('a BITMAP file round-trips byte-identical when an unrelated field moves and comes back', () => {
    for (const name of ['xpml_barcode_bis.prn', 'indented_bis_80X12.prn', 'twice_sized_81X12.prn']) {
      const t = fx(name)
      const { tag } = read(t)
      const logo = tag.elements.find((e) => e.kind === 'image')!
      const blob = t.slice(logo.src!.cmdStart, logo.src!.cmdEnd)
      expect(blob.length).toBeGreaterThan(100) // it really is the logo, bytes and all
      const el = bySlot(tag, 'OPTION1')
      const moved = moveSrc(t, el.src!, 24, 16)
      expect(moved).toContain(blob) // the blob is untouched, byte for byte
      expect(moved).not.toBe(t)
      const back = moveSrc(moved, read(moved).tag.elements.find((e) => e.slot === 'OPTION1')!.src!, -24, -16)
      expect(Buffer.from(back, 'latin1').equals(Buffer.from(t, 'latin1'))).toBe(true)
    }
  })

  it('the logo itself can be moved without disturbing its bytes', () => {
    const t = fx('xpml_barcode_bis.prn')
    const { tag } = read(t)
    const logo = tag.elements.find((e) => e.kind === 'image')!
    expect(t).toContain('BITMAP 300,43,8,40,1,')
    const out = moveSrc(t, logo.src!, -100, 0)
    expect(out).toContain('BITMAP 200,43,8,40,1,')
    expect(out.length).toBe(t.length) // 300 -> 200: one byte rewritten, none added
    expect(read(out).tag.elements.find((e) => e.kind === 'image')!.xMm).toBeCloseTo(logo.xMm - (100 * 25.4) / 203, 6)
  })

  it('add then remove gives back the original bytes, in every dialect', () => {
    for (const name of [...FILES, 'ZPL']) {
      const t = name === 'ZPL' ? ZPL : fx(name)
      const { tag, dialect } = read(t)
      const model = tag.elements.find((e) => e.kind === 'text' && e.src)!
      const added = addSrc(t, dialect, model.src!, 'OPTION17', 0, 24)
      expect(added).not.toBe(t)
      const back = read(added)
      const fresh = bySlot(back.tag, 'OPTION17')
      expect(fresh).toBeTruthy()
      expect(back.tag.elements.length).toBe(tag.elements.length + 1)
      // it kept the model's own font and style arguments
      expect(fresh.kind).toBe('text')
      expect(fresh.rotation).toBe(model.rotation)
      expect(fresh.hMm).toBeCloseTo(model.hMm, 6)
      expect(Buffer.from(removeSrc(added, fresh.src!), 'latin1').equals(Buffer.from(t, 'latin1'))).toBe(true)
    }
  })

  it('removing a field takes its whole command and its line ending, and nothing else', () => {
    const t = fx('bom_xpml_100X15.prn')
    const { tag } = read(t)
    const el = bySlot(tag, 'OPTION5')
    const out = removeSrc(t, el.src!)
    expect(t).toContain('TEXT 622,100,"0",180,8,8,"OPTION5"\r\n')
    expect(out).not.toContain('OPTION5')
    expect(out.length).toBe(t.length - 'TEXT 622,100,"0",180,8,8,"OPTION5"\r\n'.length)
    expect(read(out).tag.elements.length).toBe(tag.elements.length - 1)
  })

  it('ZPL: a ^FT field dragged 10 mm down lands 10 mm down, baseline and all', () => {
    const { tag, dialect } = read(ZPL)
    expect(dialect).toBe('zpl')
    const el = bySlot(tag, 'OPTION2')
    const dots = dotsAt(10, 203) // 80 dots at 203 dpi
    const out = moveSrc(ZPL, el.src!, 0, dots)
    expect(out).toContain('^FT35,130^A0N,20,18^FDOPTION2^FS')
    const after = bySlot(read(out).tag, 'OPTION2')
    expect(after.yMm - el.yMm).toBeCloseTo(mmAt(dots, 203), 6) // not 10 mm plus its own height
    expect(after.hMm).toBeCloseTo(el.hMm, 6)
  })

  it('ZPL: removing a field takes ^FT, the font, ^FD and ^FS - the whole multi-command field', () => {
    const { tag } = read(ZPL)
    const el = bySlot(tag, 'OPTION4')
    const out = removeSrc(ZPL, el.src!)
    expect(ZPL).toContain('^FT35,110^A0N,18,18^FDOPTION4^FS\r\n')
    expect(out).not.toContain('OPTION4')
    expect(out).not.toContain('18,18')
    expect(out.length).toBe(ZPL.length - '^FT35,110^A0N,18,18^FDOPTION4^FS\r\n'.length)
    expect(bySlot(read(out).tag, 'OPTION1')).toBeTruthy() // its neighbours are intact
    expect(read(out).tag.elements.length).toBe(tag.elements.length - 1)
  })
})
