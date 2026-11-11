import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderTemplate, detectDialect, applyDimensions, findCandidateSlots } from '@/lib/label-engine'
import { defaultTagConfig, renderTag, parseTagConfig } from '@/lib/label-tags'

// Real files from the shop's OMPRN folder, copied here. Latin-1 = byte-exact round trip.
const fx = (n: string) => readFileSync(resolve(__dirname, 'fixtures/omprn', n)).toString('latin1')
const MAIN = fx('barcode_main.prn'), TSPL = fx('barcode.prn'), PRINT = fx('barcode_print.prn')

// A genuine Zebra template: field data is UNQUOTED and the slot touches its ^FD.
const ZPL = '^XA\r\n^PW400\r\n^LL200\r\n^LH0,0\r\n^FO20,20^A0N,25,25^FDOPTION2^FS\r\n^FO20,50^A0N,25,25^FDOPTION3^FS\r\n^FO220,20^BCN,60,N,N,N^FDOPTIONZ^FS\r\n^XZ\r\n'
const item = { id: 'cm1234567890', itemCode: 'PD192', name: 'Sada Necklace', grossWeight: 2.02, netWeight: 2.02, mrp: 15250, purity: '18kts', barcode: '17200' }

describe('dialect detection on the three real files', () => {
  it('TSPL / EPL2 / EPL2 - and ZPL detection does not claim any of the three real files', () => {
    expect(detectDialect(TSPL)).toBe('tspl')
    expect(detectDialect(MAIN)).toBe('epl2')
    expect(detectDialect(PRINT)).toBe('epl2')
    for (const f of [TSPL, MAIN, PRINT]) expect(detectDialect(f)).not.toBe('zpl')
  })
  it('a ZPL file is recognised; anything else is unknown and still renders by pure substitution', () => {
    expect(detectDialect(ZPL)).toBe('zpl')
    expect(detectDialect('^XA^XZ')).toBe('zpl')
    expect(detectDialect('^XA only half a file')).toBe('unknown')
    const odd = 'SOMETHING "OPTION2" ELSE'
    expect(detectDialect(odd)).toBe('unknown')
    expect(renderTemplate(odd, { OPTION2: 'A' }).text).toBe('SOMETHING "A" ELSE')
  })
})

describe('barcode_main.prn rendered with real stock data, byte for byte', () => {
  const out = renderTag(defaultTagConfig(), MAIN, item)
  const expected = MAIN
    .replace('"OPTION2"', '"PD192"').replace('"OPTION3"', '"Gwt-2.020G"').replace('"OPTION4"', '"Nwt-2.020G"')
    // OPTION5 prints EMPTY, matching his own barcode_print.prn. The default map used to guess the
    // MRP into it - the shop's price in plain digits where his own software prints nothing.
    .replace('"OPTION5"', '""').replace('"OPTION6"', '"18KTS"').replace('"OPTION8"', '""')
    .replace('"OPTIONS1"', '""').replace('"OPTIONS2"', '""').replace('"OPTIONS3"', '""').replace('"OPTIONZ"', '"17200"')
  it('matches exactly, CR endings kept, literal LPDJ untouched', () => {
    expect(out.text).toBe(expected)
    expect(out.text).toContain('"LPDJ"')
    // CRLF, exactly as the file has it: every LF still preceded by its CR, same count.
    expect(out.text.match(/\n/g)!.length).toBe(MAIN.match(/\n/g)!.length)
    expect(out.text.match(/\r\n/g)!.length).toBe(MAIN.match(/\r\n/g)!.length)
    expect(out.text.split('\r').length).toBe(MAIN.split('\r').length)
    expect(out.warnings).toEqual([])
  })
  it('segments rebuild the text and flag only slots', () => {
    expect(out.segments.map((s) => s.text).join('')).toBe(out.text)
    expect(out.segments.filter((s) => s.slot).map((s) => s.slot)).toEqual(['OPTION2', 'OPTION3', 'OPTION4', 'OPTION6', 'OPTION8', 'OPTIONS1', 'OPTIONS2', 'OPTIONS3', 'OPTION5', 'OPTIONZ'])
  })
  it('finished files with no slots pass through untouched (incl. binary BITMAP)', () => {
    expect(renderTag(defaultTagConfig(), TSPL, item).text).toBe(TSPL)
    expect(renderTag(defaultTagConfig(), PRINT, item).text).toBe(PRINT)
  })
  it('finds the slots of the real template', () => {
    expect(findCandidateSlots(MAIN)).toEqual(['LPDJ', 'OPTION2', 'OPTION3', 'OPTION4', 'OPTION6', 'OPTION8', 'OPTIONS1', 'OPTIONS2', 'OPTIONS3', 'OPTION5', 'OPTIONZ'])
  })
})

describe('slot matching is exact', () => {
  it('OPTION2 does not match inside OPTION23, XOPTION2 or OPTION2_B', () => {
    const r = renderTemplate('"OPTION23" "XOPTION2" "OPTION2_B" "OPTION2"', { OPTION2: 'v' })
    expect(r.text).toBe('"OPTION23" "XOPTION2" "OPTION2_B" "v"')
  })
  it('longest name wins: OPTIONS1 is not OPTION + S1', () => {
    expect(renderTemplate('"OPTIONS1"', { OPTION: 'x', OPTIONS1: 'y' }).text).toBe('"y"')
  })
})

describe('hostile item names', () => {
  const run = (name: string) => renderTag({ ...defaultTagConfig(), fields: { OPTION2: { source: 'name' }, OPTIONZ: { source: 'barcodeValue' } } }, MAIN, { ...item, name })
  const lines = (t: string) => t.split('\r\n')
  const base = lines(MAIN).length

  it('CR / LF cannot start a new command line', () => {
    const r = run('X"\rP9\r\nA0,0,0,2,1,1,N,"pwn')
    expect(lines(r.text).length).toBe(base)
    expect(r.text.match(/\n/g)!.length).toBe(MAIN.match(/\n/g)!.length)
    expect(r.text.match(/\r/g)!.length).toBe(MAIN.match(/\r/g)!.length)
    expect(r.text).not.toMatch(/^P9/m)
  })
  it('a double quote or backslash cannot close or escape the operand', () => {
    const r = run('a"b\\"c')
    expect(lines(r.text)[15]).toBe(`A270,20,0,2,1,1,N,"a'b/'c"`)
  })
  it('the slot name itself inside a value is not re-substituted', () => {
    const r = run('OPTIONZ')
    expect(lines(r.text)[15]).toBe('A270,20,0,2,1,1,N,"OPTIONZ"')
    expect(r.text).toContain('B465,0,0,1,1,3,16,N,"17200"')
  })
  it('500 characters are cut, line count unchanged', () => {
    const r = run('N'.repeat(500))
    expect(lines(r.text).length).toBe(base)
    expect(lines(r.text)[15].length).toBeLessThan(160)
    expect(r.warnings.join()).toMatch(/cut to/)
  })
  it('Devanagari becomes ? with a warning; every output char is one byte', () => {
    const r = run('सोने की चेन')
    expect(r.text).toMatch(/^A270,20,0,2,1,1,N,"\?+ \?+ \?+"$/m)
    expect(r.warnings.join()).toMatch(/Latin-1/)
    expect([...r.text].every((c) => c.charCodeAt(0) <= 0xff)).toBe(true)
  })
  it('ZPL introducers ^ and ~ and NUL/ESC are neutralised', () => {
    const r = renderTemplate('^FD"OPTION2"^FS', { OPTION2: 'a^FO0,0~DG\x00\x1b' })
    expect(r.text).toBe('^FD"a FO0,0 DG"^FS')
  })
  it('an unquoted slot admits no operands or commas', () => {
    expect(renderTemplate('SIZE LABEL_WIDTH mm', { LABEL_WIDTH: '50, 99\r' }).text).toBe('SIZE 5099 mm')
  })
})

describe('size rewrite (opt-in, detected dialects only)', () => {
  const d = { widthMm: 50, heightMm: 15, gapMm: 3, offsetXmm: 0, offsetYmm: 0, dpi: 203 }
  it('TSPL: rewrites only the lines present, bitmap bytes untouched', () => {
    const r = applyDimensions(TSPL, 'tspl', d)
    expect(r.changed).toEqual(['SIZE', 'REFERENCE'])
    expect(r.text).toBe(TSPL.replace('SIZE 99.10 mm, 15 mm', 'SIZE 50 mm, 15 mm'))
  })
  it('EPL2: Q, q, R in dots', () => {
    const r = applyDimensions(MAIN, 'epl2', d)
    expect(r.text).toContain('\nQ120,024\r')
    expect(r.text).toContain('\nq400\r')
    expect(r.text).toContain('\nR0,0\r')
  })
  it('unknown dialect is never rewritten', () => {
    expect(applyDimensions('^XA^XZ', 'unknown', d).changed).toEqual([])
  })
})

describe('ZPL: a genuine template works, a hostile value cannot inject', () => {
  const cfg = { ...defaultTagConfig(), fields: { OPTION2: { source: 'name' }, OPTION3: { source: 'grossWeight', prefix: 'Gwt-', suffix: 'G' }, OPTIONZ: { source: 'barcodeValue' } } } as any
  it('fills unquoted ^FD fields, keeps spaces in the name, CRLF intact', () => {
    const r = renderTag(cfg, ZPL, item)
    expect(r.dialect).toBe('zpl')
    expect(r.text).toBe(ZPL.replace('OPTION2', 'Sada Necklace').replace('OPTION3', 'Gwt-2.020G').replace('OPTIONZ', '17200'))
    expect(r.warnings).toEqual([])
  })
  it('^ ~ and control characters in a value cannot end the field or start a command', () => {
    const r = renderTag(cfg, ZPL, { ...item, name: 'a^FS^XZ^XA^FO0,0^FDpwn~DGR:X\r\n\x00' })
    expect(r.text.match(/\^/g)!.length).toBe(ZPL.match(/\^/g)!.length)
    expect(r.text.match(/~/g)).toBeNull()
    expect(r.text.split('\r\n').length).toBe(ZPL.split('\r\n').length)
  })
  it('with ^FH hex escapes on, "_5E" (a caret) cannot be smuggled in', () => {
    const r = renderTag(cfg, ZPL.replace('^FDOPTION2', '^FH^FDOPTION2'), { ...item, name: 'x_5Ey_21' })
    expect(r.text).toContain('^FDx-5Ey-21^FS')
    const custom = renderTag(cfg, ZPL.replace('^FDOPTION2', '^FH\\^FDOPTION2'), { ...item, name: 'x\\5Ey' })
    expect(custom.text).toContain('^FDx/5Ey^FS')
  })
  it('a slot that does not touch ^FD still needs word boundaries', () => {
    expect(renderTemplate('^FDXOPTION2^FS', { OPTION2: 'v' }).text).toBe('^FDXOPTION2^FS')
  })
  it('finds ZPL slots', () => {
    expect(findCandidateSlots(ZPL)).toEqual(['OPTION2', 'OPTION3', 'OPTIONZ'])
  })
  it('size rewrite: ^PW ^LL ^LH in dots, other bytes untouched; no-op where the file lacks them', () => {
    const d = { widthMm: 100, heightMm: 15, gapMm: 3, offsetXmm: 2, offsetYmm: 1, dpi: 203 }
    const r = applyDimensions(ZPL, 'zpl', d)
    expect(r.changed).toEqual(['^PW', '^LL', '^LH'])
    expect(r.text).toBe(ZPL.replace('^PW400', '^PW799').replace('^LL200', '^LL120').replace('^LH0,0', '^LH16,8'))
    expect(applyDimensions('^XA^FDx^FS^XZ', 'zpl', d)).toEqual({ text: '^XA^FDx^FS^XZ', changed: [] })
  })
})

describe('stored config is never trusted', () => {
  it('garbage falls back to defaults; bad slot names and sources are dropped', () => {
    expect(parseTagConfig('not json').widthMm).toBe(50)
    const c = parseTagConfig(JSON.stringify({ widthMm: 1e9, templateB64: '<script>', fields: { 'bad name': { source: 'name' }, OK1X: { source: 'password' }, GOOD: { source: 'name' } } }))
    expect(c.widthMm).toBe(300)
    expect(c.templateB64).toBe('')
    expect(Object.keys(c.fields)).toEqual(['GOOD'])
  })
})
