import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { detectDialect, renderTemplate, applyDimensions } from '@/lib/label-engine'
import { defaultTagConfig, parseTagConfig, compileDesign, renderTag, type TagConfig } from '@/lib/label-tags'
import {
  emitEpl2, parseDesign, declaredSizeMm, declaredOffsetMm, designWarnings, tailPreset, defaultElement, dotsAt,
  type TagDesign, type TagElement,
} from '@/lib/label-design'

/**
 * GOLDEN FILE. A known design must emit known bytes, and those bytes must then go through the
 * existing engine (label-engine.ts) untouched except for its slots. The fixture is deliberately
 * shaped like the shop's own barcode_main.prn - same Q/q header, same A line, same B line - because
 * that file is the only proof we have of what a real shop printer accepts.
 */
const fx = (n: string) => readFileSync(resolve(__dirname, 'fixtures/omprn', n)).toString('latin1')
const GOLDEN = fx('designed-tail-epl2.prn')
const MAIN = fx('barcode_main.prn')
const TSPL = fx('barcode.prn')
const ZPL = '^XA\r\n^PW400\r\n^LL200\r\n^LH0,0\r\n^FO20,20^A0N,25,25^FDSLOT_1^FS\r\n^XZ\r\n'

const LOGO_8x8 = 'qlWqVapVqlU=' // 8 rows of 1 byte: 0xAA 0x55 repeating
const GEOM = { widthMm: 104, heightMm: 12, gapMm: 3, offsetXmm: 0, offsetYmm: 0, dpi: 203 }

const el = (over: Partial<TagElement> & { slot: string }): TagElement => ({ ...defaultElement('text', over.slot), ...over })

const DESIGN: TagDesign = {
  dialect: 'epl2', speed: 4, density: 15,
  zones: [
    { name: 'Tail', xMm: 2.5, yMm: 0, widthMm: 36.3, heightMm: 12 },
    { name: 'Body', xMm: 33.8, yMm: 0, widthMm: 41.3, heightMm: 12 },
  ],
  elements: [
    el({ slot: 'SLOT_1', xMm: 33.8, yMm: 0 }),
    el({ slot: 'SLOT_2', xMm: 33.8, yMm: 2.5 }),
    el({ slot: 'SLOT_3', kind: 'barcode', xMm: 58.2, yMm: 0, heightMm: 2, narrow: 1, wide: 3 }),
    el({ slot: 'SLOT_4', kind: 'image', xMm: 2.5, yMm: 0, image: { wDots: 8, hDots: 8, bitsB64: LOGO_8x8, invert: false } }),
  ],
}

const item = { id: 'cm1234567890', itemCode: 'PD192', name: 'Sada Necklace', grossWeight: 2.02, netWeight: 2.02, mrp: 15250, purity: '22K', barcode: '17200' }

describe('EPL2 emitter: a known design produces known bytes', () => {
  it('matches the golden file byte for byte, mm converted at the template dpi', () => {
    expect(emitEpl2(DESIGN, GEOM)).toBe(GOLDEN)
  })
  it('the header is the one the shop\'s own printer already accepts', () => {
    // 104 x 12 mm at 203 dpi IS his q831 / Q96, and 33.8 mm IS his x=270. Same numbers, drawn.
    expect(GOLDEN).toContain('q831\r\n')
    expect(GOLDEN).toContain('Q96,024\r\n')
    expect(MAIN).toContain('q831\r\n')
    expect(MAIN).toContain('Q96,024\r\n')
    expect(GOLDEN).toContain('A270,0,0,2,1,1,N,"SLOT_1"')
    expect(GOLDEN).toContain('B465,0,0,1,1,3,16,N,"SLOT_3"')
    expect(GOLDEN.endsWith('P1\r\n')).toBe(true)
  })
  it('size, speed, darkness and offset come from the setup, not from a constant', () => {
    const t = emitEpl2({ ...DESIGN, speed: 2, density: 8 }, { ...GEOM, widthMm: 50, heightMm: 25, gapMm: 2, offsetXmm: 1, offsetYmm: 0.5, dpi: 300 })
    expect(t).toContain('q591\r\n') // 50 mm at 300 dpi
    expect(t).toContain('Q295,024\r\n')
    expect(t).toContain('S2\r\n')
    expect(t).toContain('D8\r\n')
    expect(t).toContain('R12,6\r\n')
  })
  it('rotation, font scale, reverse, human-readable and Code 128 reach the file', () => {
    const t = emitEpl2({
      ...DESIGN,
      elements: [
        el({ slot: 'A1', xMm: 0, yMm: 0, rotation: 270, font: 4, scaleX: 2, scaleY: 3, reverse: true }),
        el({ slot: 'B1', kind: 'barcode', xMm: 0, yMm: 5, barcode: 'code128', humanReadable: true, heightMm: 4 }),
      ],
    }, GEOM)
    expect(t).toContain('A0,0,3,4,2,3,R,"A1"')
    expect(t).toContain('B0,40,0,1E,1,3,32,B,"B1"')
  })
})

describe('the emitted bytes survive the existing engine unchanged', () => {
  it('reads as EPL2 and only the slots change', () => {
    expect(detectDialect(GOLDEN)).toBe('epl2')
    const cfg: TagConfig = {
      ...defaultTagConfig(), widthMm: 104, heightMm: 12, gapMm: 3, design: DESIGN,
      fields: { SLOT_1: { source: 'itemCode' }, SLOT_2: { source: 'netWeight', prefix: 'Nwt-', suffix: 'G' }, SLOT_3: { source: 'barcodeValue' } },
    }
    expect(compileDesign(cfg)).toBe(GOLDEN)
    const out = renderTag(cfg, GOLDEN, item)
    expect(out.text).toBe(GOLDEN
      .replace('"SLOT_1"', '"PD192"')
      .replace('"SLOT_2"', '"Nwt-2.020G"')
      .replace('"SLOT_3"', '"17200"'))
    expect(out.warnings).toEqual([])
    // the logo's bytes are not touched, and the file is still the same number of lines
    expect(out.text).toContain('GW20,0,1,8,\xaa\x55\xaa\x55\xaa\x55\xaa\x55')
    expect(out.text.match(/\r\n/g)!.length).toBe(GOLDEN.match(/\r\n/g)!.length)
  })
  it('a hostile item value cannot add a command to a GENERATED template either', () => {
    const cfg: TagConfig = { ...defaultTagConfig(), design: DESIGN, fields: { SLOT_1: { source: 'name' } } }
    const nasty = { ...item, name: 'AB"\r\nP99\r\nA0,0,0,5,9,9,N,"OWNED\\^XA~JA' }
    const out = renderTag(cfg, GOLDEN, nasty)
    expect(out.text.match(/\r\n/g)!.length).toBe(GOLDEN.match(/\r\n/g)!.length)
    expect(out.text.split('\r\n').some((l) => l.startsWith('P99') || l.startsWith('A0,0'))).toBe(false)
    // the field is still ONE quoted operand: the value's own quote became an apostrophe
    const line = out.text.split(/\r\n/).find((l) => l.startsWith('A270,0'))!
    expect(line.match(/"/g)!.length).toBe(2)
    expect(line).toContain("'OWNED/")
    expect(out.text).not.toMatch(/\^XA/)
    // a value is never re-scanned, so a value that names a slot does not substitute again
    const self = renderTag(cfg, GOLDEN, { ...item, name: 'SLOT_2' })
    expect(self.text).toContain('"SLOT_2"')
  })
})

describe('parseDesign is the gate - a Setting row can hold anything', () => {
  const ok = JSON.parse(JSON.stringify(DESIGN))
  it('accepts a sane design and clamps the numbers', () => {
    const d = parseDesign({ ...ok, speed: 99, density: -5, elements: [{ ...ok.elements[0], xMm: 9999, font: 12, scaleX: 0, narrow: 0, rotation: 45 }] })!
    expect(d.speed).toBe(6)
    expect(d.density).toBe(0)
    expect(d.elements[0]).toMatchObject({ xMm: 400, font: 5, scaleX: 1, narrow: 1, rotation: 0 })
  })
  it('refuses anything that is not the one dialect we emit, or has no zone', () => {
    expect(parseDesign({ ...ok, dialect: 'zpl' })).toBeUndefined()
    expect(parseDesign({ ...ok, zones: [] })).toBeUndefined()
    expect(parseDesign(null)).toBeUndefined()
    expect(parseDesign('<design>')).toBeUndefined()
  })
  it('drops an element whose slot name is not a legal slot name', () => {
    const d = parseDesign({ ...ok, elements: [{ ...ok.elements[0], slot: 'A"; P9' }, { ...ok.elements[0], slot: '9bad' }, ok.elements[1]] })!
    expect(d.elements.map((e) => e.slot)).toEqual(['SLOT_2'])
  })
  it('THE INJECTION VECTOR: an image whose byte count does not match its declared size is dropped', () => {
    // GW tells the printer to read bytesPerRow x rows bytes and then resume reading commands. A
    // short image would hand it the rest of our own file to execute.
    const img = (over: Record<string, unknown>) => parseDesign({ ...ok, elements: [{ ...ok.elements[3], image: { wDots: 8, hDots: 8, bitsB64: LOGO_8x8, ...over } }] })!.elements
    expect(img({}).length).toBe(1)
    expect(img({ hDots: 9 })).toEqual([])      // 9 bytes needed, 8 given
    expect(img({ wDots: 16 })).toEqual([])     // 16 bytes needed, 8 given
    expect(img({ bitsB64: 'qlWqVapVqlUAAAA=' })).toEqual([]) // too many bytes
    expect(img({ bitsB64: 'not base64 !!' })).toEqual([])
    expect(img({ hDots: 2000, wDots: 2000, bitsB64: LOGO_8x8 })).toEqual([]) // over the byte cap
  })
  it('caps the number of elements and zones', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ ...ok.elements[0], slot: `S_${i}` }))
    expect(parseDesign({ ...ok, elements: many })!.elements.length).toBe(40)
    expect(parseDesign({ ...ok, zones: Array.from({ length: 9 }, () => ok.zones[0]) })!.zones.length).toBe(3)
  })
  it('survives a round trip through the stored config shape', () => {
    const cfg = parseTagConfig(JSON.stringify({ ...defaultTagConfig(), ...GEOM, design: DESIGN }))
    expect(cfg.design).toBeTruthy()
    expect(compileDesign(cfg)).toBe(GOLDEN)
    expect(parseTagConfig(JSON.stringify({ ...defaultTagConfig(), design: 'nope' })).design).toBeUndefined()
  })
})

describe('an image is sent as the dots the printer will burn', () => {
  it('invert flips every byte and never changes the byte count', () => {
    const one = { ...DESIGN, elements: [DESIGN.elements[3]] }
    const plain = emitEpl2(one, GEOM)
    const flipped = emitEpl2({ ...one, elements: [{ ...DESIGN.elements[3], image: { wDots: 8, hDots: 8, bitsB64: LOGO_8x8, invert: true } }] }, GEOM)
    expect(plain).toContain('GW20,0,1,8,\xaa\x55\xaa\x55\xaa\x55\xaa\x55')
    expect(flipped).toContain('GW20,0,1,8,\x55\xaa\x55\xaa\x55\xaa\x55\xaa')
    expect(flipped.length).toBe(plain.length)
  })
})

describe('what the FILE says its size is - the trap behind the shop\'s naming habit', () => {
  it('reads the declared size of all three real files', () => {
    expect(declaredSizeMm(TSPL, 'tspl', 203)).toEqual({ widthMm: 99.1, heightMm: 15 })
    const epl = declaredSizeMm(MAIN, 'epl2', 203)!
    expect(epl.widthMm).toBeCloseTo(103.98, 1)
    expect(epl.heightMm).toBeCloseTo(12.01, 1)
    const zpl = declaredSizeMm(ZPL, 'zpl', 203)!
    expect(zpl.widthMm).toBeCloseTo(50.05, 1)
    expect(zpl.heightMm).toBeCloseTo(25.02, 1)
  })
  it('an 81x12 design sitting in a slot named 100x15 is DETECTED, not silently resized', () => {
    const inEightyOne = emitEpl2(DESIGN, { ...GEOM, widthMm: 81, heightMm: 12 })
    const says = declaredSizeMm(inEightyOne, 'epl2', 203)!
    expect(says.widthMm).toBeCloseTo(81, 0)
    expect(Math.abs(says.widthMm - 100) > 1).toBe(true) // what the panel's warning tests
  })
  it('TSPL SIZE in inches is not read as millimetres, and an unreadable file says nothing', () => {
    expect(declaredSizeMm('SIZE 4,2\r\nCLS\r\n', 'tspl', 203)).toEqual({ widthMm: 101.6, heightMm: 50.8 })
    expect(declaredSizeMm('anything at all', 'unknown', 203)).toBeNull()
    expect(declaredSizeMm('I8,A,001\r\nN\r\nP1\r\n', 'epl2', 203)).toBeNull()
  })
})

describe('the honest warning list', () => {
  const fields = { SLOT_1: { source: 'itemCode' }, SLOT_3: { source: 'barcodeValue' }, SLOT_2: { source: 'blank' } }
  it('names a field off the label, one on the fold, and one with nothing in it', () => {
    const w = designWarnings(DESIGN, GEOM, fields)
    expect(w.some((m) => m.includes('set to blank'))).toBe(true)
    expect(w.some((m) => m.includes('logo is a bitmap'))).toBe(true)
    const off = designWarnings({ ...DESIGN, elements: [el({ slot: 'X1', xMm: 300, yMm: 0 })] }, GEOM, { X1: { source: 'name' } })
    expect(off.some((m) => m.includes('outside the label'))).toBe(true)
    const gapped = { ...DESIGN, zones: [{ name: 'A', xMm: 0, yMm: 0, widthMm: 20, heightMm: 12 }, { name: 'B', xMm: 60, yMm: 0, widthMm: 40, heightMm: 12 }] }
    const fold = designWarnings({ ...gapped, elements: [el({ slot: 'X1', xMm: 40, yMm: 0 })] }, GEOM, { X1: { source: 'name' } })
    expect(fold.some((m) => m.includes('between the printable zones'))).toBe(true)
  })
  it('an empty design says so instead of printing a blank label in silence', () => {
    expect(designWarnings({ ...DESIGN, elements: [] }, GEOM, {})).toContain('Nothing is placed on the tag yet.')
  })
})

describe('the two presets', () => {
  it('the tail preset is his real strip: 831 x 96 dots, printing at x=20 and x=270', () => {
    const d = tailPreset(203)
    expect(d.zones.length).toBe(2)
    expect(dotsAt(d.zones[0].xMm, 203)).toBeCloseTo(20, 0)
    expect(dotsAt(d.zones[1].xMm, 203)).toBeCloseTo(270, 0)
    expect(parseDesign(JSON.parse(JSON.stringify(d)))).toBeTruthy()
  })
  it('a template with no design still renders by pure substitution, exactly as before', () => {
    const cfg = defaultTagConfig()
    expect(cfg.design).toBeUndefined()
    expect(compileDesign(cfg)).toBeNull()
    expect(renderTemplate(MAIN, {}).text).toBe(MAIN)
  })
})

describe('declaredOffsetMm - the file own X/Y reference survives the rewrite', () => {
  const same = (t: string, dialect: 'tspl' | 'epl2' | 'zpl', dpi: number) => {
    const o = declaredOffsetMm(t, dialect, dpi)!
    const s = declaredSizeMm(t, dialect, dpi)!
    return { o, out: applyDimensions(t, dialect, { ...s, gapMm: 0, ...o, dpi }) }
  }
  // His own file, from the committed fixture rather than E:\jewellery_software - he runs this on
  // several PCs and an absolute path would fail on all but one.
  it('owner real EPL2 file: R96,0 at 203 dpi reads 12.0 mm and re-emits byte-identical', () => {
    const epl = fx('barcode_main.prn')
    const o = declaredOffsetMm(epl, detectDialect(epl), 203)!
    expect(+o.offsetXmm.toFixed(1)).toBe(12)
    expect(o.offsetYmm).toBe(0)
    const out = applyDimensions(epl, 'epl2', { widthMm: 0, heightMm: 0, gapMm: 0, ...o, dpi: 203 })
    expect(out.text.match(/^R\d+,\d+/m)![0]).toBe('R96,0')
  })
  it('self-contained EPL2 shape (no disk) round-trips', () => {
    const t = 'I8,A,001\r\n\r\nQ96,024\r\nq831\r\nrN\r\nZT\r\nO\r\nR96,0\r\nN\r\nP1\r\n'
    const { o, out } = same(t, 'epl2', 203)
    expect(+o.offsetXmm.toFixed(1)).toBe(12)
    expect(out.text).toContain('R96,0\r\n')
    expect(out.text.match(/^R\d+,\d+/m)![0]).toBe('R96,0')
  })
  it('does not mistake rN, ZT or a slot for R', () => {
    expect(declaredOffsetMm('rN\r\nZT\r\nA1,1,0,2,1,1,N,"R1,2"\r\nRIGHT5,5\r\n', 'epl2', 203)).toBeNull()
  })
  it('TSPL REFERENCE and ZPL ^LH round-trip', () => {
    const tspl = 'SIZE 100 mm, 15 mm\r\nGAP 3 mm, 0 mm\r\nREFERENCE 96,8\r\nCLS\r\n'
    const a = same(tspl, 'tspl', 203)
    expect(a.out.text).toContain('REFERENCE 96,8')
    const zpl = '^XA^PW831^LL120^LH96,8^FO10,10^FDx^FS^XZ'
    const b = same(zpl, 'zpl', 203)
    expect(b.out.text).toContain('^LH96,8')
  })
  it('dpi conversion and no-offset files', () => {
    expect(declaredOffsetMm('^XA^LH96,0^XZ', 'zpl', 300)!.offsetXmm).toBeCloseTo(8.128, 3)
    expect(declaredOffsetMm('SIZE 100 mm, 15 mm\r\nCLS\r\n', 'tspl', 203)).toBeNull()
    expect(declaredOffsetMm('^XA^XZ', 'zpl', 203)).toBeNull()
    expect(declaredOffsetMm('R96,0', 'unknown', 203)).toBeNull()
  })
})
