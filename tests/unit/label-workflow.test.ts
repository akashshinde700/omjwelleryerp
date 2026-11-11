import { describe, it, expect } from 'vitest'
import {
  defaultTagConfig, renderTag, parseTagConfig, parseTemplateFilename, pickTemplate, isMrpPriced, isBisItem, factsOf,
  applyPriceCode, parseFirmTagSettings, DEFAULT_PRICE_CODE, type TagItem, type PickableTemplate,
} from '@/lib/label-tags'

const EPL = (...slots: string[]) => ['N', ...slots.map((s, i) => `A10,${i * 20},0,2,1,1,N,"${s}"`), 'P1', ''].join('\r\n')
const lines = (t: string) => t.split('\r\n').filter((l) => l.startsWith('A'))
const stone = (name: string, g: number) => ({ name, qty: 1, weightGrams: g })
const base: TagItem = { id: 'i1', name: 'RING', itemCode: 'P1', stones: [] }
const cfgWith = (fields: Record<string, any>, over: Record<string, unknown> = {}) => ({ ...defaultTagConfig(), fields, ...over })

describe('THE STONE RULE: OPTION8 = 1st stone, s1 = 2nd, s2 = 3rd, one format', () => {
  const cfg = cfgWith({ OPTION8: { source: 'stoneWtName', prefix: 'St:' } })
  const tpl = EPL('OPTION8', 's1', 's2')
  it('three stones fill the three positions in the chosen format', () => {
    const out = renderTag(cfg, tpl, { ...base, stones: [stone('Ruby', 0.1), stone('Emerald', 0.2), stone('Pearl', 0.3)] })
    expect(lines(out.text)).toEqual([
      'A10,0,0,2,1,1,N,"St:0.50 ct Ruby"',
      'A10,20,0,2,1,1,N,"St:1.00 ct Emerald"',
      'A10,40,0,2,1,1,N,"St:1.50 ct Pearl"',
    ])
  })
  it('two stones leave s2 empty, and its prefix goes with it', () => {
    const out = renderTag(cfg, tpl, { ...base, stones: [stone('Ruby', 0.1), stone('Emerald', 0.2)] })
    expect(lines(out.text)).toEqual(['A10,0,0,2,1,1,N,"St:0.50 ct Ruby"', 'A10,20,0,2,1,1,N,"St:1.00 ct Emerald"', 'A10,40,0,2,1,1,N,""'])
  })
  it('a file with no s1 prints one stone; a stone-less item prints none', () => {
    const three = { ...base, stones: [stone('Ruby', 0.1), stone('Emerald', 0.2), stone('Pearl', 0.3)] }
    expect(lines(renderTag(cfg, EPL('OPTION8'), three).text)).toEqual(['A10,0,0,2,1,1,N,"St:0.50 ct Ruby"'])
    expect(lines(renderTag(cfg, tpl, base).text).every((l) => l.endsWith('""'))).toBe(true)
  })
  it('an explicit rule for s1 beats the inherited format', () => {
    const c = cfgWith({ OPTION8: { source: 'stoneWtName' }, s1: { source: 'stoneName', case: 'upper' } })
    const out = renderTag(c, EPL('OPTION8', 's1'), { ...base, stones: [stone('Ruby', 0.1), stone('Emerald', 0.2)] })
    expect(lines(out.text)).toEqual(['A10,0,0,2,1,1,N,"0.50 ct Ruby"', 'A10,20,0,2,1,1,N,"EMERALD"'])
  })
  it('s1 matches only inside a quoted position, never raw bytes', () => {
    const raw = 'N\r\nGW10,10,2,2,\x00 s1 \x00\r\nA10,0,0,2,1,1,N,"s1"\r\nP1\r\n'
    const out = renderTag(cfg, raw, { ...base, stones: [stone('Ruby', 0.1), stone('Emerald', 0.2)] })
    expect(out.text).toContain('\x00 s1 \x00')
    expect(out.text).toContain('"St:1.00 ct Emerald"')
  })
  it('a hostile stone name cannot become a command at any stone position', () => {
    const evil = 'x"\r\nP99\r\nA0,0,0,2,1,1,N,"pwn'
    const out = renderTag(cfg, tpl, { ...base, stones: [stone(evil, 0.1), stone(evil, 0.1), stone(evil, 0.1)] })
    expect(out.text.split('\r\n').filter((l) => l.startsWith('P'))).toEqual(['P1'])
    expect(lines(out.text)).toHaveLength(3)
  })
})

describe('price code, weight unit, RFID', () => {
  it('61250 is DOYLG with the default cipher; a custom one applies; non-digits survive', () => {
    expect(applyPriceCode('61250')).toBe('DOYLG')
    expect(applyPriceCode('61250', 'ABCDEFGHIJ')).toBe('GBCFA')
    expect(applyPriceCode('12.5')).toBe('OY.L')
    expect(DEFAULT_PRICE_CODE).toBe('GOYPNLDEMR')
  })
  it('only money fields with the option on are ciphered', () => {
    const c = cfgWith({ OPTION5: { source: 'mrp', priceCode: true }, OPTION2: { source: 'itemCode' } })
    const out = renderTag(c, EPL('OPTION5', 'OPTION2'), { ...base, mrp: 61250, itemCode: 'P1250' })
    expect(lines(out.text)).toEqual(['A10,0,0,2,1,1,N,"DOYLG"', 'A10,20,0,2,1,1,N,"P1250"'])
  })
  it('an invalid stored cipher falls back to the default; duplicates are refused', () => {
    expect(parseFirmTagSettings('{"priceCode":"AAAAAAAAAA","autoPrint":true}')).toEqual({ autoPrint: true, priceCode: DEFAULT_PRICE_CODE })
    expect(parseFirmTagSettings('{"priceCode":"qwertyuiop"}').priceCode).toBe('QWERTYUIOP')
    expect(parseFirmTagSettings('not json')).toEqual({ autoPrint: false, priceCode: DEFAULT_PRICE_CODE })
  })
  it('a cipher string cannot carry a command: it is letters only by construction', () => {
    expect(parseFirmTagSettings('{"priceCode":"G\\"\\r\\nP99OYPNLDE"}').priceCode).toBe(DEFAULT_PRICE_CODE)
  })
  it('GW:10 vs GW:10 GM - weight fields only, per template', () => {
    const f = { OPTION3: { source: 'grossWeight', prefix: 'GW:', decimals: 0 }, OPTION2: { source: 'mrp' } }
    const it = { ...base, grossWeight: 10, mrp: 500 }
    expect(lines(renderTag(cfgWith(f), EPL('OPTION3', 'OPTION2'), it).text)[0]).toBe('A10,0,0,2,1,1,N,"GW:10"')
    expect(lines(renderTag(cfgWith(f, { showUnit: true }), EPL('OPTION3', 'OPTION2'), it).text)).toEqual(['A10,0,0,2,1,1,N,"GW:10 GM"', 'A10,20,0,2,1,1,N,"500"'])
  })
  it('a slot bound to RFID NO prints empty while the number stays in the config', () => {
    const c = parseTagConfig(JSON.stringify({ ...cfgWith({ OPTION6: { source: 'rfidNo', prefix: 'R:' } }), isRfid: true, rfidNo: 'RF-77' }))
    expect(c.rfidNo).toBe('RF-77')
    expect(lines(renderTag(c, EPL('OPTION6'), base).text)).toEqual(['A10,0,0,2,1,1,N,""'])
  })
  it('host device and RFID NO are stored only if they are plain names', () => {
    const c = parseTagConfig(JSON.stringify({ hostDevice: 'LAPTOP-EG3CLS8Q', rfidNo: 'x"&calc' }))
    expect(c.hostDevice).toBe('LAPTOP-EG3CLS8Q')
    expect(c.rfidNo).toBe('')
    expect(parseTagConfig(JSON.stringify({ hostDevice: 'PC & del *' })).hostDevice).toBe('')
  })
})

describe('which template prints', () => {
  it('reads the identity out of his filenames', () => {
    expect(parseTemplateFilename('barcode_bis_81X12.prn')).toEqual({ variant: 'bis', size: '81X12' })
    expect(parseTemplateFilename('barcode_81X12.prn')).toEqual({ variant: 'normal', size: '81X12' })
    expect(parseTemplateFilename('barcode_bis_fp_100x15.prn')).toEqual({ variant: 'bis_fp', size: '100x15' })
    expect(parseTemplateFilename('barcode_fp_81X12.prn')).toEqual({ variant: 'fp', size: '81X12' })
    expect(parseTemplateFilename('barcode_bis.prn')).toEqual({ variant: 'bis', size: '' })
    expect(parseTemplateFilename('barcode.prn')).toEqual({ variant: 'normal', size: '' })
    expect(parseTemplateFilename('barcode - TVS 100x15 Main File.prn')).toEqual({ variant: 'normal', size: '' })
  })
  const T = (id: string, brand: string, size: string, variant: PickableTemplate['variant']): PickableTemplate => ({ id, brand, size, variant })
  const lib = [T('zn', 'zebra', '81X12', 'normal'), T('zb', 'zebra', '81X12', 'bis'), T('zf', 'zebra', '81X12', 'fp'), T('tn', 'tsc', '81X12', 'normal'), T('z100', 'zebra', '100x15', 'normal')]
  it('BIS tick and MRP pricing pick the variant inside the default\'s printer + size', () => {
    expect(pickTemplate(lib, 'zn', { bis: false, fp: false })).toEqual({ id: 'zn', exact: true })
    expect(pickTemplate(lib, 'zn', { bis: true, fp: false })).toEqual({ id: 'zb', exact: true })
    expect(pickTemplate(lib, 'zn', { bis: false, fp: true })).toEqual({ id: 'zf', exact: true })
  })
  it('never crosses printer or size; a missing variant falls back to the normal one and says so', () => {
    expect(pickTemplate(lib, 'zn', { bis: true, fp: true })).toEqual({ id: 'zn', exact: false })
    expect(pickTemplate(lib, 'tn', { bis: true, fp: false })).toEqual({ id: 'tn', exact: false })
    expect(pickTemplate([], null, { bis: false, fp: false })).toBeNull()
  })
  it('with no variants recorded, automatic is exactly the default', () => {
    const legacy = [T('a', 'other', '', 'normal'), T('b', 'other', '', 'normal')]
    expect(pickTemplate(legacy, 'b', { bis: false, fp: false })?.id).toBe('b')
    expect(pickTemplate(legacy, 'b', { bis: true, fp: true })?.id).toBe('b')
  })
  it('the item facts: BIS column, and MRP pricing without mistaking every priced ring for MRP', () => {
    expect(isBisItem({ bis: 'Yes' })).toBe(true)
    expect(isBisItem({ bis: 'no' })).toBe(false)
    expect(isBisItem({})).toBe(false)
    expect(isMrpPriced({ category: 'fine', netWeight: 10, mrp: 61250 })).toBe(false) // an MRP is saved on every item
    expect(isMrpPriced({ category: 'fine', netWeight: 0, mrp: 900 })).toBe(false) // weight and MRP do not decide it
    expect(isMrpPriced({ category: 'sterling', mrp: 900 })).toBe(false)
    expect(isMrpPriced({ category: 'raw', mrp: 900 })).toBe(false)
    expect(isMrpPriced({ category: 'imitation', netWeight: 10, mrp: 250 })).toBe(true)
    expect(isMrpPriced({ category: 'Crystal ', netWeight: 0, mrp: 0 })).toBe(true) // category alone, trimmed + case-folded like specFor
    expect(isMrpPriced({ category: 'fine', mrp: 900, fixedPriceStatus: 'yes' })).toBe(false) // that column is not read
    expect(isMrpPriced({ category: 'nonsense', mrp: 900 })).toBe(false) // unknown reads as fine, like the rest of the app
    expect(isMrpPriced({ mrp: 900 })).toBe(false)
    expect(factsOf({ bis: 'yes', category: 'fine', netWeight: 3, mrp: 1 }, false)).toEqual({ bis: false, fp: false })
  })
})
