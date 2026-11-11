import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

/**
 * GUARD FOR THE GUARDS. The label tests (label-engine / -design / -src / -xpml / -realfiles) assert
 * printer bytes exactly, CRLF included. If a copy, a zip round trip, an editor or git's eol
 * normalisation strips the CRs from these fixtures, those tests fail with messages that look like
 * engine bugs. This file fails first and says what actually happened.
 *
 * It happened once already: the repo arrived without git and five fixtures had lost every CR
 * (barcode_main, barcode_print, xpml_barcode, bom_xpml_100X15, designed-tail-epl2) -> 14 failures.
 * barcode_main/barcode_print were restored byte-identical from tag/BARCODE FILE_jaydeep/OMPRN.rar;
 * the other three by LF -> CRLF, which their own tests and the EPL2 emitter confirm.
 *
 * If you change a fixture ON PURPOSE, update its hash here in the same change.
 */
const DIR = resolve(__dirname, 'fixtures/omprn')
const SHA256: Record<string, string> = {
  'barcode.prn': '8b34323601b6490d893422e090f3b60a907f9964a4a3b4a2658cd23a1d93e591',
  'barcode_main.prn': 'b6737bd0e810240bf757fcdc111931a3144599a5c7d8de89d8a8df1f9618c231',
  'barcode_print.prn': 'c7612ecfb67b6470d63821932311e38f5e9130d561344e0064c390a6666d65f4',
  'bom_xpml_100X15.prn': '45fb7ba821b3d4374c5fdcd1b863e164e79c2356373f9747f32840b43304a934',
  'designed-tail-epl2.prn': 'e9a04057e47c76b6cbee7c01341c8b3617e39922bc8ee552ad25eeb610ef363c',
  'indented_bis_80X12.prn': 'f571073388bb7c40b260374ab123729e4ee15c960ef6323ea807047943860b58',
  'twice_sized_81X12.prn': '38c9dd70f2bd5950ad1c1fd6058cd32118db3c7012e24815eca29fa7ac0c2809',
  'xpml_barcode.prn': '5c5b4122242a88ea4a989a37cbce91ff6af7b03cb47de9fc8b29a42508d7c431',
  'xpml_barcode_bis.prn': '845fec40743c247778e537cb6304d8b0af51c7520d72fde99fedce1e598b55f6',
}

describe('printer fixtures arrived byte-exact', () => {
  it('every fixture on disk is pinned, and every pinned fixture is on disk', () => {
    expect(readdirSync(DIR).filter((n) => n.toLowerCase().endsWith('.prn')).sort()).toEqual(Object.keys(SHA256).sort())
  })
  it.each(Object.keys(SHA256))('%s: no bare LF (line endings were not normalised)', (n) => {
    const b = readFileSync(resolve(DIR, n))
    let bare = 0
    for (let i = 0; i < b.length; i++) if (b[i] === 0x0a && b[i - 1] !== 0x0d) bare++
    expect(bare, `${n} has ${bare} LF bytes without a CR - CRLF was stripped in transit; restore it, do not edit the tests`).toBe(0)
  })
  it.each(Object.entries(SHA256))('%s: sha256 matches', (n, sha) => {
    expect(createHash('sha256').update(readFileSync(resolve(DIR, n))).digest('hex')).toBe(sha)
  })
})
