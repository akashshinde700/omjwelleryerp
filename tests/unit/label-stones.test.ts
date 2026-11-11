import { describe, it, expect } from 'vitest'
import { defaultTagConfig, renderTag, formatField, inCodeRange, TAG_SOURCES, type TagItem } from '@/lib/label-tags'
import { stoneDetail, stoneLines, DEFAULT_INVOICE_CONFIG } from '@/components/app/print/invoice-print'

const on = { ...DEFAULT_INVOICE_CONFIG, showStoneCert: true }
// A row exactly as Prisma returns it for StockItem.stones, and as the invoice snapshots it.
const dia = { name: 'dia', qty: 1, weightGrams: 1, clarity: 'FL', colorGrade: 'E', shape: 'Round', size: '4.1 mm', certNo: '2185471', certLab: 'GIA', rateCt: 1000, rateUnit: 'PP', sellRateCt: 1000 }
const ruby = { name: 'Ruby', qty: 2, weightGrams: 0.06 }
const item = (over: Record<string, unknown> = {}): TagItem => ({ id: 'i1', name: 'RING', stones: [dia], stoneWeight: 1, stoneAmount: 1000, ...over })
const f = (source: string, it: TagItem) => formatField(it, { source })

describe('stone fields on a tag', () => {
  it('the tag describes a stone with the SAME words as the invoice (side by side)', () => {
    const it = item()
    const invoice = stoneDetail({ stones: JSON.stringify(it.stones) }, on)
    expect(invoice).toBe('Stones: dia 5.00 ct FL E Round · GIA 2185471 · ₹1,000/pc')
    // The one permitted difference: thermal fonts have no rupee sign, so the tag says Rs.
    expect(`Stones: ${f('stoneLineCert', it)}`).toBe(invoice.replace('₹', 'Rs '))
    expect(f('stoneLine', it)).toBe(stoneLines({ stones: JSON.stringify(it.stones) }, on)[0].text)
  })
  it('several stones: still identical to the invoice, joined', () => {
    const it = item({ stones: [dia, ruby] })
    const inv = stoneDetail({ stones: JSON.stringify(it.stones) }, on).replace('Stones: ', '').split('; ').join(' + ')
    expect(f('stoneLineCert', it)).toBe(inv.replace('₹', 'Rs '))
  })
  it('composites, in carats (1 g = 5 ct), never mixing grams in', () => {
    const it = item()
    expect(f('stoneWtName', it)).toBe('5.00 ct dia')
    expect(f('stoneWtNameClarity', it)).toBe('5.00 ct dia FL')
    expect(f('stoneColorClarity', it)).toBe('E FL')
    expect(f('stoneSizeShape', it)).toBe('4.1 mm Round')
    expect(f('stoneTotalCt', it)).toBe('5.00 ct')
    expect(f('stoneAmount', it)).toBe('1000')
    expect(f('stoneCertNo', it)).toBe('2185471')
    expect(f('stoneLab', it)).toBe('GIA')
    expect(f('stoneQtyNameWt', item({ stones: [{ ...dia, qty: 2 }] }))).toBe('2 dia 5.00 ct')
  })
  it('falls back to the superseded scalars when there are no rows; carats column is converted, not mislabelled', () => {
    const it: TagItem = { id: 'x', name: 'R', stoneName: 'Diamond', stoneClarity: 'VS1', stoneColorGrade: 'G', stoneShape: 'Round', stoneGrossWeightCt: 0.5, diamondCertNo: '99', diamondCertLab: 'IGI' }
    expect(f('stoneWtName', it)).toBe('0.50 ct Diamond')
    expect(f('stoneLineCert', it)).toBe('Diamond 0.50 ct VS1 G Round · IGI 99')
    expect(f('stoneLine', { id: 'y', name: 'plain' })).toBe('')
  })
  it('every new source is a known source key, and a stone-less item prints blanks, not "undefined"', () => {
    for (const s of TAG_SOURCES.filter((s) => s.key.startsWith('stone'))) expect(f(s.key, { id: 'z', name: 'n' })).toBe('')
  })
  it('a hostile stone name or certificate cannot add a printer command', () => {
    const cfg = { ...defaultTagConfig(), fields: { OPTION2: { source: 'stoneLineCert' } } }
    const evil = item({ stones: [{ ...dia, name: 'x"\r\nP99\r\nA0,0,0,2,1,1,N,"pwn', certNo: '1"\r\nN' }] })
    const out = renderTag(cfg, 'N\r\nA10,0,0,2,1,1,N,"OPTION2"\r\nP1\r\n', evil)
    expect(out.text.split('\r\n')).toEqual(['N', expect.stringMatching(/^A10,0,0,2,1,1,N,"[^"\r\n]*"$/), 'P1', ''])
  })
})

describe('barcode number range', () => {
  it('matches the trailing number, inclusive, with optional prefix', () => {
    expect(inCodeRange('P1001', 1001, 1005)).toBe(true)
    expect(inCodeRange('P1005', 1001, 1005)).toBe(true)
    expect(inCodeRange('P1006', 1001, 1005)).toBe(false)
    expect(inCodeRange('P1003', 1001, 1005, 'a')).toBe(false)
    expect(inCodeRange('a1003', 1001, 1005, 'A')).toBe(true)
    expect(inCodeRange('AB12CD', 0, 99999)).toBe(false)
    expect(inCodeRange(null, 0, 9)).toBe(false)
  })
})
