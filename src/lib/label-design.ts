import { stripXpml } from './label-engine'
/**
 * A DESIGNED tag: fields placed in real millimetres, stored as DATA, turned into printer commands
 * by an emitter. The other half of the feature - bring-your-own-template - is untouched and stays
 * the fallback for any printer we do not speak. A TagConfig with a `design` compiles that design to
 * `templateB64` when it is saved, so from there on BOTH kinds travel the same render path and the
 * same security boundary (label-engine.ts) fills their slots.
 *
 * ONE DIALECT FIRST: EPL2. It is what the shop's own barcode_main.prn is written in, what his TVS
 * printer takes, and the only dialect whose real byte layout we can check against his files. TSPL
 * and ZPL emitters are the same shape with a different header and three different commands.
 *
 * REAL UNITS. Everything the shop types is mm; dots exist only inside the emitter, converted at the
 * template's dpi, because a printer counts dots and a tag is measured with a ruler.
 *
 * TWO PRINTABLE ZONES. A tail tag is a long strip whose two ends carry print and whose middle is
 * folded over the piece. Zones are declared rectangles, and an element outside every one of them is
 * reported - the coordinate space stays single and honest (that is what the printer has); the zones
 * are what stops a field being placed on the fold.
 *
 * THE EMITTER IS INSIDE THE SECURITY BOUNDARY. A design arrives from a Setting row, which
 * PUT /api/settings can write freely, so parseDesign() is the gate: slot names must be legal slot
 * names, every number is clamped, the barcode type is an allow-list, and an image's byte count must
 * match its declared width x height EXACTLY - a short count would let the trailing bytes be read as
 * commands. Nothing from a StockItem is in here at all: the emitter writes SLOT NAMES, and
 * renderTemplate() fills them afterwards exactly as it does for an uploaded file.
 */

export type TagZone = { name: string; xMm: number; yMm: number; widthMm: number; heightMm: number }
export type TagImage = { wDots: number; hDots: number; bitsB64: string; invert: boolean }
export type TagElement = {
  kind: 'text' | 'barcode' | 'image'
  slot: string // which slot in cfg.fields decides the value; images ignore it
  xMm: number; yMm: number
  rotation: 0 | 90 | 180 | 270
  font: 1 | 2 | 3 | 4 | 5 // EPL2 internal font - a real printer font, not a point size we cannot keep
  scaleX: number; scaleY: number
  reverse: boolean
  barcode: BarcodeKind
  heightMm: number // barcode bar height
  narrow: number; wide: number // barcode module widths, in dots (EPL2 counts dots here)
  humanReadable: boolean
  image?: TagImage
}
export type TagDesign = { dialect: 'epl2'; speed: number; density: number; zones: TagZone[]; elements: TagElement[] }

export const BARCODE_KINDS = ['code39', 'code128'] as const
export type BarcodeKind = (typeof BARCODE_KINDS)[number]
/** EPL2 barcode selection codes. Code 39 is what his own file uses (B...,1,...); verify 128 on paper. */
const EPL2_BARCODE: Record<BarcodeKind, string> = { code39: '1', code128: '1E' }
export const BARCODE_LABEL: Record<BarcodeKind, string> = { code39: 'Code 39', code128: 'Code 128' }

export const MAX_ELEMENTS = 40
export const MAX_ZONES = 3
export const MAX_IMAGE_BYTES = 8_000 // packed 1-bit rows; a 15x15mm mark at 203dpi is ~240 bytes

/** EPL2 internal font cell, in dots at 203 dpi, before the scale multipliers. */
export const EPL2_FONT: Record<number, { w: number; h: number }> = {
  1: { w: 8, h: 12 }, 2: { w: 10, h: 16 }, 3: { w: 12, h: 20 }, 4: { w: 14, h: 24 }, 5: { w: 32, h: 48 },
}

export const SLOT_RE = /^[A-Za-z][A-Za-z0-9_]{1,31}$/
/** Long enough that it cannot plausibly occur inside an embedded image's bytes and be substituted. */
export const designSlot = (n: number) => `SLOT_${n}`

export const dotsAt = (mm: number, dpi: number) => Math.round((mm * dpi) / 25.4)
export const mmAt = (dots: number, dpi: number) => (dots * 25.4) / dpi

const clamp = (v: unknown, d: number, lo: number, hi: number) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : d
  return Math.min(hi, Math.max(lo, n))
}
const int = (v: unknown, d: number, lo: number, hi: number) => Math.round(clamp(v, d, lo, hi))

export function defaultElement(kind: TagElement['kind'], slot: string, xMm = 2, yMm = 2): TagElement {
  return {
    kind, slot, xMm, yMm, rotation: 0, font: 2, scaleX: 1, scaleY: 1, reverse: false,
    barcode: 'code39', heightMm: 6, narrow: 1, wide: 3, humanReadable: false,
  }
}

/** His 81x12 tail strip, read off barcode_main.prn / barcode_print.prn: 831 dots = 104 mm wide,
 *  96 dots = 12 mm high, print at x=20..330 and x=270..600 dots. The two ends of one strip. */
export function tailPreset(dpi = 203): TagDesign {
  const m = (d: number) => +mmAt(d, dpi).toFixed(1)
  return {
    dialect: 'epl2', speed: 4, density: 15,
    zones: [
      { name: 'Tail', xMm: m(20), yMm: 0, widthMm: m(290), heightMm: m(96) },
      { name: 'Body', xMm: m(270), yMm: 0, widthMm: m(330), heightMm: m(96) },
    ],
    elements: [],
  }
}

export function singleZonePreset(widthMm: number, heightMm: number): TagDesign {
  return {
    dialect: 'epl2', speed: 4, density: 15,
    zones: [{ name: 'Label', xMm: 0, yMm: 0, widthMm, heightMm }],
    elements: [],
  }
}

const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/
const b64Len = (b64: string) => {
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return (b64.length / 4) * 3 - pad
}

function parseImage(v: any): TagImage | undefined {
  if (!v || typeof v !== 'object') return undefined
  const wDots = int(v.wDots, 0, 1, 2000)
  const hDots = int(v.hDots, 0, 1, 2000)
  const bitsB64 = typeof v.bitsB64 === 'string' && B64_RE.test(v.bitsB64) ? v.bitsB64 : ''
  if (!bitsB64 || bitsB64.length % 4) return undefined
  // EXACT byte count or nothing: the printer reads bytesPerRow x rows bytes and then resumes reading
  // commands, so a short image would hand it the next bytes of our own file as a command.
  const need = Math.ceil(wDots / 8) * hDots
  if (need > MAX_IMAGE_BYTES || b64Len(bitsB64) !== need) return undefined
  return { wDots, hDots, bitsB64, invert: v.invert === true }
}

const ROTATIONS = [0, 90, 180, 270] as const

export function parseDesign(v: any): TagDesign | undefined {
  if (!v || typeof v !== 'object' || v.dialect !== 'epl2') return undefined
  const zones: TagZone[] = (Array.isArray(v.zones) ? v.zones : []).slice(0, MAX_ZONES)
    .filter((z: any) => z && typeof z === 'object')
    .map((z: any, i: number) => ({
      name: (typeof z.name === 'string' ? z.name : '').slice(0, 20) || `Zone ${i + 1}`,
      xMm: clamp(z.xMm, 0, 0, 400), yMm: clamp(z.yMm, 0, 0, 400),
      widthMm: clamp(z.widthMm, 10, 1, 400), heightMm: clamp(z.heightMm, 10, 1, 400),
    }))
  const elements: TagElement[] = (Array.isArray(v.elements) ? v.elements : []).slice(0, MAX_ELEMENTS)
    .filter((e: any) => e && typeof e === 'object' && SLOT_RE.test(e.slot ?? ''))
    .map((e: any) => ({
      kind: e.kind === 'barcode' || e.kind === 'image' ? e.kind : 'text',
      slot: e.slot as string,
      xMm: clamp(e.xMm, 0, 0, 400), yMm: clamp(e.yMm, 0, 0, 400),
      rotation: (ROTATIONS.includes(e.rotation) ? e.rotation : 0) as TagElement['rotation'],
      font: int(e.font, 2, 1, 5) as TagElement['font'],
      scaleX: int(e.scaleX, 1, 1, 6), scaleY: int(e.scaleY, 1, 1, 9),
      reverse: e.reverse === true,
      barcode: BARCODE_KINDS.includes(e.barcode) ? e.barcode : 'code39',
      heightMm: clamp(e.heightMm, 6, 0.5, 100),
      narrow: int(e.narrow, 1, 1, 10), wide: int(e.wide, 3, 2, 30),
      humanReadable: e.humanReadable === true,
      image: parseImage(e.image),
    }))
    .filter((e: TagElement) => e.kind !== 'image' || !!e.image)
  if (!zones.length) return undefined
  return { dialect: 'epl2', speed: int(v.speed, 4, 1, 6), density: int(v.density, 15, 0, 15), zones, elements }
}

export type Geom = { widthMm: number; heightMm: number; gapMm: number; offsetXmm: number; offsetYmm: number; dpi: number }

const b64ToLatin1 = (b64: string) =>
  typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('latin1')

/**
 * Design -> an EPL2 template whose field data is SLOT NAMES. The header is byte for byte the one in
 * his barcode_main.prn (the only header we know a real shop printer accepts) with only the size,
 * speed, density and reference lines coming from the setup.
 */
export function emitEpl2(d: TagDesign, g: Geom): string {
  const D = (mm: number) => dotsAt(mm, g.dpi)
  const rot = (r: number) => r / 90
  const lines: string[] = [
    'I8,A,001', '', '',
    `Q${D(g.heightMm)},${String(D(g.gapMm)).padStart(3, '0')}`,
    `q${D(g.widthMm)}`,
    'rN', `S${d.speed}`, `D${d.density}`, 'ZT', 'JF', 'O',
    `R${D(g.offsetXmm)},${D(g.offsetYmm)}`, 'f100', 'N',
  ]
  for (const e of d.elements) {
    const x = D(e.xMm), y = D(e.yMm)
    if (e.kind === 'text') {
      lines.push(`A${x},${y},${rot(e.rotation)},${e.font},${e.scaleX},${e.scaleY},${e.reverse ? 'R' : 'N'},"${e.slot}"`)
    } else if (e.kind === 'barcode') {
      lines.push(`B${x},${y},${rot(e.rotation)},${EPL2_BARCODE[e.barcode]},${e.narrow},${e.wide},${D(e.heightMm)},${e.humanReadable ? 'B' : 'N'},"${e.slot}"`)
    } else if (e.image) {
      const bytesPerRow = Math.ceil(e.image.wDots / 8)
      let bits = b64ToLatin1(e.image.bitsB64)
      // EPL2 GW takes the bitmap as it will be burned. Which bit value is black differs between
      // printer families, so `invert` is the calibration knob, not a guess baked into the file.
      if (e.image.invert) bits = bits.replace(/[\s\S]/g, (c) => String.fromCharCode(~c.charCodeAt(0) & 0xff))
      lines.push(`GW${x},${y},${bytesPerRow},${e.image.hDots},${bits}`)
    }
  }
  lines.push('P1', '')
  return lines.join('\r\n')
}

/** The honest list of what will go wrong on paper, computed from the design alone. */
export function designWarnings(d: TagDesign, g: Geom, fields: Record<string, { source: string }>): string[] {
  const w: string[] = []
  if (!d.elements.length) w.push('Nothing is placed on the tag yet.')
  const inZone = (e: TagElement) => d.zones.some((z) => e.xMm >= z.xMm - 0.2 && e.yMm >= z.yMm - 0.2 && e.xMm <= z.xMm + z.widthMm && e.yMm <= z.yMm + z.heightMm)
  for (const e of d.elements) {
    const what = e.kind === 'image' ? 'The logo' : `"${e.slot}"`
    if (e.xMm > g.widthMm || e.yMm > g.heightMm) w.push(`${what} starts outside the label (${e.xMm} x ${e.yMm} mm on a ${g.widthMm} x ${g.heightMm} mm tag) and will not print.`)
    else if (d.zones.length > 1 && !inZone(e)) w.push(`${what} is between the printable zones - on a tail tag that is the fold.`)
    if (e.kind !== 'image' && !fields[e.slot]) w.push(`${what} has nothing chosen to fill it, so it prints blank.`)
    if (e.kind !== 'image' && fields[e.slot]?.source === 'blank') w.push(`${what} is set to blank and prints nothing.`)
  }
  if (d.elements.some((e) => e.kind === 'image')) w.push('A logo is a bitmap burned into the file. Check the first print: some printer families treat a set bit as white - if the mark comes out inverted, tick Invert.')
  return w
}

/** What the FILE itself says its label size is, in mm - so a slot's mm can be checked against it. */
export function declaredSizeMm(text: string, dialect: string, dpi: number): { widthMm: number; heightMm: number } | null {
  text = stripXpml(text)
  if (dialect === 'tspl') {
    // The LAST SIZE wins: TSPL is sequential, so a file stating SIZE twice (his
    // MSHADMIN/barcode_bis_81X12.prn says 81 mm, then 80.10 mm) prints at the second one.
    // Leading whitespace allowed - 12 of his 33 files indent the command by 42 spaces.
    const all = [...text.matchAll(/^[ \t\uFEFF\u00EF\u00BB\u00BF]*SIZE[ \t]+([\d.]+)[ \t]*(mm)?[ \t]*,[ \t]*([\d.]+)[ \t]*(mm)?/gm)]
    const m = all.length ? all[all.length - 1] : null
    if (!m) return null
    const unit = m[2] || m[4] ? 1 : 25.4 // TSPL SIZE is inches unless it says mm
    return { widthMm: +m[1] * unit, heightMm: +m[3] * unit }
  }
  if (dialect === 'epl2') {
    const q = text.match(/^q(\d+)/m), Q = text.match(/^Q(\d+),/m)
    if (!q || !Q) return null
    return { widthMm: mmAt(+q[1], dpi), heightMm: mmAt(+Q[1], dpi) }
  }
  if (dialect === 'zpl') {
    const pw = text.match(/\^PW(\d+)/), ll = text.match(/\^LL(\d+)/)
    if (!pw || !ll) return null
    return { widthMm: mmAt(+pw[1], dpi), heightMm: mmAt(+ll[1], dpi) }
  }
  return null
}

/** What the FILE itself says its X/Y reference offset is, in mm. The engine's rewrite overwrites this line, so it must be read first. */
export function declaredOffsetMm(text: string, dialect: string, dpi: number): { offsetXmm: number; offsetYmm: number } | null {
  text = stripXpml(text)
  const re = dialect === 'tspl' ? /^[ 	\uFEFF\u00EF\u00BB\u00BF]*REFERENCE[ 	]+(\d+)[ 	]*,[ 	]*(\d+)/m
    : dialect === 'epl2' ? /^R(\d+),(\d+)/m
    : dialect === 'zpl' ? /\^LH(\d+),(\d+)/
    : null
  const m = re && text.match(re)
  return m ? { offsetXmm: mmAt(+m[1], dpi), offsetYmm: mmAt(+m[2], dpi) } : null
}
