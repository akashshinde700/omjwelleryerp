import { describe, it, expect } from 'vitest'
import { generateBarcodeSvg, barcodeDataUri } from '@/lib/barcode'

/**
 * The packet tag's only job is to be scanned. A barcode that looks right and does not decode is
 * worse than no barcode, so this checks the encoding itself: module widths, checksum, start/stop.
 * Decodes the SVG back to module counts and re-runs the Code-128 checksum.
 */
const PATTERNS = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
  '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
  '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
  '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
  '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
  '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
  '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
  '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
  '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
  '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
  '114131','311141','411131','211412','211214','211232','2331112',
]

/** Reads the bars back out of the SVG and returns the code values they spell. */
function decode(svg: string, barWidth: number): number[] {
  // rect attribute order is x, y, width, height.
  const all = [...svg.matchAll(/<rect x="([\d.]+)" y="0" width="([\d.]+)"/g)]
    .map((m) => ({ x: Number(m[1]), w: Number(m[2]) }))
  expect(all.length, 'no bars found — attribute order changed?').toBeGreaterThan(0)
  // Rebuild the full bar/space module stream from first bar to last bar.
  const start = all[0].x
  const stream: number[] = []
  let cursor = start
  for (const r of all) {
    const gap = Math.round((r.x - cursor) / barWidth)
    if (gap > 0) stream.push(gap)
    stream.push(Math.round(r.w / barWidth))
    cursor = r.x + r.w
  }
  // Chunk 6 modules per symbol; the final stop symbol is 7.
  const values: number[] = []
  let i = 0
  while (i < stream.length) {
    const len = stream.length - i === 7 ? 7 : 6
    const key = stream.slice(i, i + len).join('')
    const v = PATTERNS.indexOf(key)
    expect(v, `unknown pattern ${key}`).toBeGreaterThanOrEqual(0)
    values.push(v)
    i += len
  }
  return values
}

describe('generateBarcodeSvg — Code 128-B', () => {
  it('encodes start-B, the payload, a valid checksum and stop', () => {
    const value = 'A101'
    const svg = generateBarcodeSvg(value, 40, 2)
    const codes = decode(svg, 2)
    expect(codes[0]).toBe(104)                       // START B
    expect(codes.at(-1)).toBe(106)                   // STOP
    const payload = codes.slice(1, -2)
    expect(payload).toEqual([...value].map((c) => c.charCodeAt(0) - 32))
    let sum = 104
    payload.forEach((v, idx) => { sum += v * (idx + 1) })
    expect(codes.at(-2)).toBe(sum % 103)             // checksum
  })

  it('keeps a 10-module quiet zone on both sides', () => {
    const svg = generateBarcodeSvg('SA01', 40, 2)
    const firstX = Number(/<rect x="([\d.]+)"/.exec(svg)![1])
    const width = Number(/width="(\d+)" height="\d+" viewBox/.exec(svg)![1])
    const lastRect = [...svg.matchAll(/<rect x="([\d.]+)" y="0" width="([\d.]+)"/g)].at(-1)!
    expect(firstX).toBe(20)
    expect(width - (Number(lastRect[1]) + Number(lastRect[2]))).toBe(20)
  })

  it('returns empty for nothing encodable, never a broken symbol', () => {
    expect(generateBarcodeSvg('')).toBe('')
    expect(generateBarcodeSvg('अग')).toBe('')   // Devanagari is outside subset B
    expect(barcodeDataUri('')).toBe('')
  })

  it('drops out-of-range characters rather than encoding them wrong', () => {
    const codes = decode(generateBarcodeSvg('Aग1', 40, 2), 2)
    expect(codes.slice(1, -2)).toEqual(['A', '1'].map((c) => c.charCodeAt(0) - 32))
  })
})
