import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parsePrn } from '@/lib/label-parse'
import { mmAt } from '@/lib/label-design'

/**
 * Read-only import for display. Fixtures are his real files: the EPL2 pair is the byte-exact copy in
 * tests/unit/fixtures/omprn (identical to E:\jewellery_software\OMPRN, checked with cmp); the TSPL and
 * ZPL files are pasted from E:\jewellery_software\dbdir\barcode with their CRLF.
 * NB his folder names lie: dbdir\barcode\TSC\barcode_81X12.prn is ZPL, ZEBRA\barcode.prn is EPL2.
 */
const fx = (n: string) => readFileSync(resolve(__dirname, 'fixtures/omprn', n)).toString('latin1')
const MAIN = fx('barcode_main.prn')
const PRINT = fx('barcode_print.prn')
const crlf = (...l: string[]) => l.join('\r\n') + '\r\n'
const near = (a: number, b: number, tol = 0.01) => expect(Math.abs(a - b)).toBeLessThan(tol)

// dbdir\barcode\TSC\barcode.prn (TSPL, xpml-wrapped as BarTender exports it)
const TSPL = crlf(
  "<xpml><page quantity='0' pitch='15.0 mm'></xpml>SIZE 99.10 mm, 15 mm", 'DIRECTION 0,0', 'REFERENCE 0,0', 'OFFSET 0 mm',
  'SET PEEL OFF', 'SET CUTTER OFF', 'SET PARTIAL_CUTTER OFF',
  "<xpml></page></xpml><xpml><page quantity='1' pitch='15.0 mm'></xpml>SET TEAR ON", 'CLS', 'CODEPAGE 1252',
  'TEXT 780,111,"0",180,8,8,"OPTION1"', 'TEXT 780,90,"0",180,8,8,"OPTION2"', 'TEXT 780,32,"0",180,8,8,"OPTION4"',
  'TEXT 780,60,"0",180,8,8,"OPTION3"', 'TEXT 520,111,"0",180,8,8,"OPTION7"', 'TEXT 620,111,"0",180,8,8,"OPTION5"',
  'BARCODE 520,80,"128M",22,0,180,1,2,"OPTIONZ"', 'TEXT 520,50,"0",180,8,8,"OPTION8"', 'TEXT 520,28,"0",180,8,8,"OPTION6"',
  'PRINT 1,1', '<xpml></page></xpml><xpml><end/></xpml>',
)
// dbdir\barcode\TSC\barcode_81X12.prn (actually ZPL)
const ZPL = crlf(
  '^XA', '^MMT', '^PW576', '^LL288', '^LS0', '^CI28', '^PR4,4', '^RS8', '^RW32,48', '^RFW,H,2,12,5^FDOPTION6^FS',
  '^FT35,30^A0N,22,20^FDOPTION1^FS', '^FT35,50^A0N,20,18^FDOPTION2^FS', '^FT35,70^A0N,18,18^FDOPTION3^FS',
  '^FT35,90^A0N,18,18^FDOPTION8^FS', '^FT35,110^A0N,18,18^FDOPTION4^FS', '^FT35,140^A0N,20,18^FDOPTION5^FS',
  '^FT35,160^A0N,18,18^FDOPTION9^FS', '^FT35,180^A0N,20,18^FDOPTION7^FS', '^BY1,3,21', '^FT35,210^BCN,,N,N',
  '^FD>:OPTIONZ^FS', '^PQ1,0,1,Y', '^XZ',
)

describe('EPL2 - his barcode_main.prn', () => {
  const t = parsePrn(MAIN, 'epl2', 203)!
  it('reads the label and the R96,0 reference (12 mm)', () => {
    near(t.widthMm, mmAt(831, 203)); near(t.heightMm, 12.0, 0.02)
    near(t.offsetXmm, mmAt(96, 203)); expect(t.offsetYmm).toBe(0)
    near(t.offsetXmm, 12.0, 0.02)
  })
  it('draws every command: 13 A (3 blank) + 1 B, nothing unknown', () => {
    expect(t.elements.filter((e) => e.kind === 'text')).toHaveLength(13)
    expect(t.elements.filter((e) => e.kind === 'barcode')).toHaveLength(1)
    expect(t.unknown).toEqual([])
  })
  it('adds the reference to every position: barcode B465,0 sits at (465+96) dots', () => {
    const b = t.elements.find((e) => e.kind === 'barcode')!
    near(b.xMm, mmAt(561, 203)); near(b.yMm, 0); expect(b.slot).toBe('OPTIONZ'); expect(b.humanReadable).toBe(false)
  })
  it('reports OPTION2 and the OPTIONS1 style names as slots, blank text as none', () => {
    const o2 = t.elements.find((e) => e.text === 'OPTION2')!
    expect(o2.slot).toBe('OPTION2'); near(o2.xMm, mmAt(270 + 96, 203)); near(o2.yMm, mmAt(20, 203))
    expect(t.elements.find((e) => e.text === 'OPTIONS1')!.slot).toBe('OPTIONS1')
    expect(t.elements.filter((e) => e.text === '').every((e) => e.slot === undefined)).toBe(true)
  })
  it('the left/right pair differs by exactly 250 dots = 31 mm', () => {
    const p = parsePrn(PRINT, 'epl2', 203)!
    const lpdjMain = t.elements.find((e) => e.text === 'LPDJ')!, lpdjPrint = p.elements.find((e) => e.text === 'LPDJ')!
    near(lpdjMain.xMm - lpdjPrint.xMm, mmAt(250, 203)); near(lpdjMain.xMm - lpdjPrint.xMm, 31.28)
    // print file: R96 added too, so X=20 draws at 116 dots
    near(lpdjPrint.xMm, mmAt(116, 203))
  })
})

describe('TSPL - his TSC barcode.prn', () => {
  const t = parsePrn(TSPL, 'tspl', 203)!
  it('reads SIZE in mm despite the xpml wrapper on the same line', () => {
    near(t.widthMm, 99.1); near(t.heightMm, 15); expect(t.offsetXmm).toBe(0)
  })
  it('draws 8 TEXT and 1 BARCODE with rotation and slots, nothing unknown', () => {
    expect(t.elements).toHaveLength(9); expect(t.unknown).toEqual([])
    const b = t.elements.find((e) => e.kind === 'barcode')!
    near(b.xMm, mmAt(520, 203)); near(b.yMm, mmAt(80, 203)); expect(b.rotation).toBe(180); expect(b.slot).toBe('OPTIONZ')
    const x = t.elements[0]
    expect(x.rotation).toBe(180); expect(x.slot).toBe('OPTION1'); near(x.xMm, mmAt(780, 203))
    near(x.hMm, mmAt((8 * 203) / 72, 203)) // font "0": multiplier is points
  })
  it('SIZE is inches without "mm", mm with it', () => {
    near(parsePrn('SIZE 4,2\r\nCLS\r\n', 'tspl', 203)!.widthMm, 101.6)
    near(parsePrn('SIZE 4,2\r\nCLS\r\n', 'tspl', 203)!.heightMm, 50.8)
    near(parsePrn('SIZE 40 mm,20 mm\r\nCLS\r\n', 'tspl', 203)!.widthMm, 40)
  })
  it('a bitmap whose bytes contain 0x0A and look like commands is skipped by declared length', () => {
    const blob = 'XYZZY 1,1\n' // 10 bytes = 5 per row x 2 rows, includes 0x0A and reads as a command line
    const f = 'SIZE 40 mm,20 mm\r\nCLS\r\nBITMAP 16,24,5,2,0,' + blob + '\r\nTEXT 8,8,"2",0,1,1,"AFTER"\r\nPRINT 1\r\n'
    const t2 = parsePrn(f, 'tspl', 203)!
    expect(t2.unknown).toEqual([])
    expect(t2.elements.map((e) => e.kind)).toEqual(['image', 'text'])
    const im = t2.elements[0]
    near(im.xMm, mmAt(16, 203)); near(im.wMm, mmAt(40, 203)); near(im.hMm, mmAt(2, 203))
    expect(t2.elements[1].text).toBe('AFTER')
  })
  it('reports what it cannot draw, raw', () => {
    expect(parsePrn('SIZE 40 mm,20 mm\r\nCLS\r\nBOX 1,1,50,50,2\r\nPRINT 1\r\n', 'tspl', 203)!.unknown).toEqual(['BOX 1,1,50,50,2'])
  })
})

describe('ZPL - his Zebra files', () => {
  const t = parsePrn(ZPL, 'zpl', 203)!
  it('reads ^PW/^LL', () => { near(t.widthMm, mmAt(576, 203)); near(t.heightMm, mmAt(288, 203)) })
  it('^FT y is the BASELINE: top = y minus font height', () => {
    const o1 = t.elements.find((e) => e.slot === 'OPTION1')!
    near(o1.xMm, mmAt(35, 203)); near(o1.yMm, mmAt(30 - 22, 203)); near(o1.hMm, mmAt(22, 203))
  })
  it('strips the >: subset switch and keeps the barcode on the baseline minus bar height', () => {
    const b = t.elements.find((e) => e.kind === 'barcode')!
    expect(b.text).toBe('OPTIONZ'); expect(b.slot).toBe('OPTIONZ'); expect(b.humanReadable).toBe(false)
    near(b.yMm, mmAt(210 - 21, 203))
  })
  it('does not draw the RFID write; 8 text + 1 barcode; nothing unknown', () => {
    expect(t.elements).toHaveLength(9); expect(t.unknown).toEqual([])
  })
  it('decodes ^FH hex escapes only in the field that turned them on', () => {
    const z = crlf('^XA', '^PW576', '^LL288', '^LH0,0', '^FO20,20^A0N,25,25^FH\\^FDRs\\20\\E2\\82\\B9 5\\5F7^FS', '^FO20,60^A0N,25,25^FDa\\20b^FS', '^XZ')
    const e = parsePrn(z, 'zpl', 203)!.elements
    expect(e[0].text).toBe('Rs \u20B9 5_7'); expect(e[1].text).toBe('a\\20b')
    near(e[0].yMm, mmAt(20, 203)) // ^FO is already top-left
  })
  it('adds ^LH to every position; fractional ^FT and ^GFA graphic fields work', () => {
    const z = crlf('^XA', '^PW648', '^LL96', '^LH16,8', '^FT256,92.4^A@N,18,19,TT0003M_^FH\\^CI28^FDOPTION2^FS^CI27',
      '^FO150,50^GFA,580,580,10,,:::O03C,O07F,^FS', '^FT5,40^A0R,10,10^FDROT^FS', '^XZ')
    const r = parsePrn(z, 'zpl', 203)!
    expect(r.unknown).toEqual([]); near(r.offsetXmm, mmAt(16, 203)); near(r.offsetYmm, mmAt(8, 203))
    near(r.elements[0].xMm, mmAt(256 + 16, 203)); near(r.elements[0].yMm, mmAt(92.4 - 18 + 8, 203))
    const g = r.elements[1]; expect(g.kind).toBe('image'); near(g.wMm, mmAt(80, 203)); near(g.hMm, mmAt(58, 203))
    expect(r.elements[2].rotation).toBe(90); near(r.elements[2].yMm, mmAt(40 + 8, 203)) // rotated: anchor as written
  })
  it('keeps unknown commands raw', () => {
    expect(parsePrn(crlf('^XA', '^PW100', '^LL50', '^FO1,1^GB50,2,2^FS', '^XZ'), 'zpl', 203)!.unknown).toEqual(['^GB50,2,2'])
  })
})

describe('EPL2 binary and edges', () => {
  it('a GW graphic containing 0x0A is skipped by declared length', () => {
    const hdr = 'q831\r\nQ96,024\r\nR0,0\r\nN\r\n'
    const blob = 'A\nB\nC\nD\n' // 2 bytes/row x 4 rows = 8; four 0x0A inside
    const f = hdr + 'GW10,20,2,4,' + blob + '\r\nA5,5,0,2,1,1,N,"AFTER"\r\nP1\r\n'
    const t = parsePrn(f, 'epl2', 203)!
    expect(t.unknown).toEqual([]); expect(t.elements.map((e) => e.kind)).toEqual(['image', 'text'])
    near(t.elements[0].wMm, mmAt(16, 203)); near(t.elements[0].hMm, mmAt(4, 203))
  })
  it('a B with a quoted type, human-readable B, and a font outside the table', () => {
    const t = parsePrn('q400\r\nQ200,024\r\nB10,10,1,"1",1,3,50,B,"X"\r\nA0,0,0,e,2,2,N,"hi"\r\nLE1,2,3,4\r\nP1\r\n', 'epl2', 203)!
    expect(t.elements[0].humanReadable).toBe(true); expect(t.elements[0].rotation).toBe(90)
    near(t.elements[1].hMm, mmAt(16 * 2, 203)) // 'e' sized as font 2
    expect(t.unknown).toEqual(['LE1,2,3,4'])
  })
  it('null when no size is declared, or the dialect is unknown', () => {
    expect(parsePrn('A1,1,0,2,1,1,N,"X"\r\nP1\r\n', 'epl2', 203)).toBeNull()
    expect(parsePrn('hello', 'unknown', 203)).toBeNull()
    expect(parsePrn('^XA^FO1,1^FDx^FS^XZ', 'zpl', 203)).toBeNull()
  })
})
