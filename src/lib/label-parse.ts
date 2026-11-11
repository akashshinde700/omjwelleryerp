/**
 * READ-ONLY IMPORT, FOR DISPLAY. Turns an uploaded printer file (EPL2 / TSPL / ZPL) into a flat list
 * of what it draws, in mm, so the owner can SEE his tag to scale and adjust against it.
 *
 * THIS MUST NEVER BECOME `cfg.design`. `cfg.design` means "the owner drew this here and we emit the
 * bytes"; assigning a parsed file to it would make us emit our own EPL2 and throw his file away. The
 * result is a separate value that is drawn and then dropped; the uploaded file stays the source of truth.
 *
 * The output is shaped for the drawing model in tag-designer.tsx: each element has an ANCHOR (xMm,yMm)
 * and an UNROTATED box (wMm,hMm); the caller rotates the box about the anchor, exactly as the designer
 * does. Not a printer simulator.
 *
 *   EXACT:       label size, reference offset, element positions, rotations (ZPL ^FT baseline excepted
 *                for rotated fields, where the anchor is left as written).
 *   APPROXIMATE: glyph shapes and text/barcode WIDTHS (built-in printer fonts differ by model and
 *                firmware; scalable TSPL font "0" size is read as points). Do not use for measuring.
 *
 * Input is expected as Latin-1 (one char per byte), which is how the app holds templates; binary
 * blobs (EPL2 GW, TSPL BITMAP) are skipped by their DECLARED byte count, never by looking for a newline.
 *
 * EDITING (moveSrc / addSrc / removeSrc, at the bottom): still not a serialiser. Each element carries
 * `src` - the offsets of its own coordinate numbers and of its whole command - and an edit SPLICES the
 * text at those offsets. The file the shop uploaded comes back byte for byte apart from what moved.
 */
import { EPL2_FONT, declaredOffsetMm, declaredSizeMm, mmAt } from './label-design'
import { findCandidateSlots, type Dialect } from './label-engine'

/**
 * WHERE THIS ELEMENT LIVES IN THE FILE. Offsets into the exact text handed to parsePrn, so the panel
 * can rewrite the two coordinate numbers (and only those bytes) instead of re-serialising the file -
 * which is the one thing that would corrupt a BITMAP/GW blob. An element whose command we cannot
 * locate has NO src and must be shown as un-draggable rather than silently refusing to move.
 */
export type ElSrc = {
  line: number // 1-based line the command starts on, so the panel can point at it in the textarea
  xStart: number; xEnd: number // the x number, as written
  yStart: number; yEnd: number // the y number, as written (always after x in all three dialects)
  cmdStart: number; cmdEnd: number // the WHOLE command: one line, or ZPL's ^FT..^FS, or a blob header + its bytes
}
export type ParsedEl = {
  kind: 'text' | 'barcode' | 'image'
  xMm: number; yMm: number; wMm: number; hMm: number
  rotation: 0 | 90 | 180 | 270
  text?: string // as drawn: ZPL >: prefix removed, ^FH escapes decoded. A slot name stays literal here.
  slot?: string // set when the data is a slot name, by the engine's own rule (findCandidateSlots)
  humanReadable?: boolean
  src?: ElSrc
}
export type ParsedTag = {
  widthMm: number; heightMm: number; offsetXmm: number; offsetYmm: number
  dpi: number
  elements: ParsedEl[]
  unknown: string[] // raw commands we could not interpret: the drawing is incomplete, not wrong
}

type Rot = ParsedEl['rotation']
const rotOf = (quarter: number): Rot => ((((Math.round(quarter) % 4) + 4) % 4) * 90) as Rot
const degOf = (d: number): Rot => (([0, 90, 180, 270].includes(d) ? d : 0) as Rot)
const ZPL_ORIENT: Record<string, Rot> = { N: 0, R: 90, I: 180, B: 270 }
// Built-in TSPL bitmap fonts, dots at 203 dpi (EPL2_FONT is the other dialect's table).
const TSPL_FONT: Record<string, { w: number; h: number }> = {
  1: { w: 8, h: 12 }, 2: { w: 12, h: 20 }, 3: { w: 16, h: 24 }, 4: { w: 24, h: 32 }, 5: { w: 32, h: 48 },
  6: { w: 14, h: 19 }, 7: { w: 21, h: 27 }, 8: { w: 14, h: 25 },
}
// The engine's own slot rule, applied to the data exactly as the engine would meet it in the file.
const slotOf = (data: string, zpl: boolean) => findCandidateSlots(zpl ? `^FD${data}^FS` : `"${data}"`)[0]
// Human-readable line under a barcode: same allowance the designer makes.
const HUMAN_MM = mmAt(EPL2_FONT[2].h, 203)
const cut = (s: string) => (s.length > 90 ? s.slice(0, 90) + '...' : s)

/** Barcode width in dots: (chars + start/stop) x per-char modules. Code 39 is 6 narrow + 3 wide + a gap. */
const barDots = (len: number, code39: boolean, narrow: number, wide: number) =>
  (Math.max(len, 1) + 2) * (code39 ? 7 * narrow + 3 * wide : 11 * narrow)

// ── line dialects (EPL2, TSPL) ───────────────────────────────────────────────────────────────────
// Commands that draw nothing (header, geometry already read by declaredSizeMm/declaredOffsetMm, motion).
const SKIP_EPL2 = /^(I\d|q\d|Q\d|R\d|r[A-Z]|S\d|D\d|Z[TB]\b|J[A-Z]|O\b|f\d|N\b|P\d|;)/
const SKIP_TSPL = /^(CLS|PRINT|SET|CODEPAGE|SPEED|DENSITY|SIZE|GAP|BLINE|REFERENCE|OFFSET|DIRECTION|FEED|BACKFEED|HOME|SHIFT|COUNTER|LIMITFEED|INITIALPRINTER|SOUND|CUT|EOP)\b/

/** Reads one binary header (GW / BITMAP) at the start of `s` and says how many bytes follow it. */
function blobAt(s: string, tspl: boolean) {
  const m = tspl ? /^BITMAP[ \t]+(-?\d+)[ \t]*,[ \t]*(-?\d+)[ \t]*,[ \t]*(\d+)[ \t]*,[ \t]*(\d+)[ \t]*,[ \t]*\d+[ \t]*,/.exec(s)
    : /^GW(-?\d+),(-?\d+),(\d+),(\d+),/.exec(s)
  return m ? { len: m[0].length, x: +m[1], y: +m[2], bytesPerRow: +m[3], rows: +m[4] } : null
}

// ── locating the two coordinate numbers in the RAW bytes ─────────────────────────────────────────
// Deliberately separate from the element regexes above: those read a cleaned-up line (trimmed, xpml
// stripped), these are run on the file's own bytes so the offsets are the file's own offsets.
const BOM = '[ \\t\\uFEFF\\u00EF\\u00BB\\u00BF]*'
const XY_EPL2 = new RegExp(`^${BOM}[AB](-?\\d+)(,)(-?\\d+)`)
const XY_GW = new RegExp(`^${BOM}GW(-?\\d+)(,)(-?\\d+)`)
const XY_TSPL = /(TEXT|BARCODE)[ \t]+(-?\d+)([ \t]*,[ \t]*)(-?\d+)/
const XY_BITMAP = /(BITMAP)[ \t]+(-?\d+)([ \t]*,[ \t]*)(-?\d+)/
const XY_ZPL = /^F[OT](-?\d+)(,)(-?\d+)/

/** `re`'s LAST THREE groups must be x, the separator, y. `at` is where `raw` starts in the file. */
function xyAt(raw: string, at: number, re: RegExp): Omit<ElSrc, 'line' | 'cmdStart' | 'cmdEnd'> | null {
  const m = re.exec(raw)
  if (!m) return null
  const [x, sep, y] = m.slice(-3)
  const yEnd = at + m.index + m[0].length
  const yStart = yEnd - y.length, xEnd = yStart - sep.length
  return { xStart: xEnd - x.length, xEnd, yStart, yEnd }
}

function readLines(text: string, dialect: 'epl2' | 'tspl', dpi: number, els: ParsedEl[], unknown: string[]) {
  const tspl = dialect === 'tspl'
  const mm = (d: number) => mmAt(d, dpi)
  let i = 0
  while (i < text.length) {
    const head = text.slice(i, i + 80)
    const blob = blobAt(head, tspl)
    if (blob) {
      const bytes = blob.bytesPerRow * blob.rows
      const end = Math.min(text.length, i + blob.len + bytes)
      const xy = xyAt(head, i, tspl ? XY_BITMAP : XY_GW)
      els.push({ kind: 'image', xMm: mm(blob.x), yMm: mm(blob.y), wMm: mm(blob.bytesPerRow * 8), hMm: mm(blob.rows), rotation: 0,
        ...(xy ? { src: { line: 0, ...xy, cmdStart: i, cmdEnd: end } } : {}) })
      i = end // by DECLARED length: the bytes may contain 0x0A
      continue
    }
    let e = text.indexOf('\n', i)
    if (e < 0) e = text.length
    const raw = text.slice(i, e)
    // Some exporters wrap lines in <xpml>/<page> tags; they are not part of the command.
    const line = raw.replace(/<\/?(?:xpml|page|end)[^>]*>/g, '').trim()
    const cmdEnd = e > i && text[e - 1] === '\r' ? e - 1 : e // the CR belongs to the line ending, not the command
    const at = i
    i = e + 1
    if (!line || (tspl ? SKIP_TSPL : SKIP_EPL2).test(line)) continue
    const t = tspl ? tsplEl(line, dpi) : epl2El(line, dpi)
    if (!t) { unknown.push(cut(line)); continue }
    const xy = xyAt(raw, at, tspl ? XY_TSPL : XY_EPL2)
    if (xy) t.src = { line: 0, ...xy, cmdStart: at, cmdEnd }
    els.push(t)
  }
}

function epl2El(line: string, dpi: number): ParsedEl | null {
  let m = /^A(-?\d+),(-?\d+),([0-3]),(\w+),(\d+),(\d+),\w,"(.*)"$/.exec(line)
  if (m) {
    const f = EPL2_FONT[+m[4]] ?? EPL2_FONT[2] // non-numeric fonts (his 'e') are not in the table: size as font 2
    const text = m[7]
    // font cells are 203 dpi values on purpose, as in tag-designer.tsx
    return { kind: 'text', xMm: mmAt(+m[1], dpi), yMm: mmAt(+m[2], dpi), rotation: rotOf(+m[3]), text, slot: slotOf(text, false),
      wMm: mmAt(f.w * +m[5] * Math.max(text.length, 1), 203), hMm: mmAt(f.h * +m[6], 203) }
  }
  m = /^B(-?\d+),(-?\d+),([0-3]),"?(\w+)"?,(\d+),(\d+),(\d+),(\w),"(.*)"$/.exec(line)
  if (m) {
    const human = m[8] !== 'N'
    const text = m[9]
    return { kind: 'barcode', xMm: mmAt(+m[1], dpi), yMm: mmAt(+m[2], dpi), rotation: rotOf(+m[3]), text, slot: slotOf(text, false), humanReadable: human,
      wMm: mmAt(barDots(text.length, m[4] === '3' || m[4] === '1', +m[5], +m[6]), dpi), hMm: mmAt(+m[7], dpi) + (human ? HUMAN_MM : 0) }
  }
  return null
}

function tsplEl(line: string, dpi: number): ParsedEl | null {
  const S = '[ \\t]*,[ \\t]*'
  let m = new RegExp(`^TEXT[ \\t]+(-?\\d+)${S}(-?\\d+)${S}"([^"]*)"${S}(\\d+)${S}(\\d+)${S}(\\d+)${S}"(.*)"$`).exec(line)
  if (m) {
    const text = m[7], xm = +m[5], ym = +m[6]
    const cell = TSPL_FONT[m[3]]
    // bitmap fonts: cell x multiplier. Anything else ("0", "ROMAN.TTF") is scalable and its multipliers are points.
    const h = cell ? cell.h * ym : (ym * dpi) / 72, w = cell ? cell.w * xm : ((xm * dpi) / 72) * 0.55
    return { kind: 'text', xMm: mmAt(+m[1], dpi), yMm: mmAt(+m[2], dpi), rotation: degOf(+m[4]), text, slot: slotOf(text, false),
      wMm: mmAt(w * Math.max(text.length, 1), dpi), hMm: mmAt(h, dpi) }
  }
  m = new RegExp(`^BARCODE[ \\t]+(-?\\d+)${S}(-?\\d+)${S}"([^"]*)"${S}(\\d+)${S}(\\d)${S}(\\d+)${S}(\\d+)${S}(\\d+)${S}"(.*)"$`).exec(line)
  if (m) {
    const human = m[5] !== '0', text = m[9]
    return { kind: 'barcode', xMm: mmAt(+m[1], dpi), yMm: mmAt(+m[2], dpi), rotation: degOf(+m[6]), text, slot: slotOf(text, false), humanReadable: human,
      wMm: mmAt(barDots(text.length, m[3].startsWith('39'), +m[7], +m[8]), dpi), hMm: mmAt(+m[4], dpi) + (human ? HUMAN_MM : 0) }
  }
  return null
}

// ── ZPL ──────────────────────────────────────────────────────────────────────────────────────────
// Format/geometry/motion commands that draw nothing (^LH/^PW/^LL are read by the declared* helpers).
// ^RF is RFID, ^FX a comment. XA/XZ wrap the label.
const SKIP_ZPL = /^(XA|XZ|MM|MN|MT|PW|LL|LH|LS|LT|CI|CF|FH|FS|FX|FR|PQ|PR|RS|RW|RF|PO|PM|JM|JU|JS|LR|PA|SD|TA|CC|CT|CD)$/

/** `^FH\` turns on hex escapes (`\7E`) for the field; they are UTF-8 bytes under ^CI28. */
function unhex(d: string, esc: string) {
  let out = '', run: number[] = []
  const flush = () => { if (run.length) out += new TextDecoder().decode(Uint8Array.from(run)); run = [] }
  for (let i = 0; i < d.length; i++) {
    if (d[i] === esc && /^[0-9A-Fa-f]{2}$/.test(d.slice(i + 1, i + 3))) { run.push(parseInt(d.slice(i + 1, i + 3), 16)); i += 2 } else { flush(); out += d[i] }
  }
  flush()
  return out
}

function readZpl(text: string, dpi: number, els: ParsedEl[], unknown: string[]) {
  const mm = (d: number) => mmAt(d, dpi)
  let by = { w: 2, h: 10 }, font = { h: 10, w: 0 }
  let f = fresh()
  function fresh() {
    return { x: NaN, y: NaN, baseline: false, rot: 0 as Rot, hex: '', bc: null as null | { h: number; human: boolean }, gf: null as null | { w: number; h: number },
      src: null as null | ElSrc, el: null as null | ParsedEl }
  }
  const parts = text.split('^')
  let at = parts[0].length // where the next '^' sits in `text`
  for (const tok of parts.slice(1)) {
    const caret = at
    at += 1 + tok.length
    const cmd = tok.slice(0, 2), arg = tok.slice(2), a = arg.split(',')
    const num = (k: number, d: number) => (a[k] !== undefined && a[k].trim() !== '' && !isNaN(+a[k]) ? +a[k] : d)
    if (cmd === 'FO' || cmd === 'FT') {
      f.x = num(0, 0); f.y = num(1, 0); f.baseline = cmd === 'FT'
      // The command starts at this caret and runs to its ^FS; cmdEnd is corrected there.
      const xy = xyAt(tok, caret + 1, XY_ZPL)
      f.src = xy ? { line: 0, ...xy, cmdStart: caret, cmdEnd: at } : null
    }
    else if (cmd === 'BY') by = { w: num(0, by.w), h: num(2, by.h) }
    else if (cmd[0] === 'A' && /^A[A-Z0-9@]/.test(tok)) {
      // ^A<font><orientation>,h,w - the font letter sits in the command, so re-read from the raw token
      const m = /^A(.)([NRIB])?,?([\d.]*),?([\d.]*)/.exec(tok)!
      f.rot = ZPL_ORIENT[m[2] ?? 'N']
      font = { h: +m[3] || font.h, w: +m[4] || 0 }
    }
    else if (cmd === 'BC') { f.bc = { h: num(1, by.h), human: (a[2] ?? 'Y').trim() !== 'N' }; f.rot = ZPL_ORIENT[(a[0] || 'N').trim()] ?? 0 }
    else if (cmd === 'GF') {
      const m = /^[ABC],(\d+),(\d+),(\d+),/.exec(arg)
      if (m && +m[3]) f.gf = { w: +m[3] * 8, h: +m[2] / +m[3] }
      else unknown.push(cut('^' + tok))
    }
    else if (cmd === 'FH') f.hex = arg[0] || '_'
    else if (cmd === 'FD' || cmd === 'FV') {
      if (f.gf || isNaN(f.x)) continue // graphic payload, or an unpositioned field (RFID): nothing to draw
      const raw = arg.replace(/[\r\n]+\s*$/, '')
      const data = (f.hex ? unhex(raw, f.hex) : raw).replace(/^>[:;0-9]/, '') // >: = Code128 subset switch, not data
      const slot = slotOf(data, true)
      if (f.bc) {
        const wDots = (Math.max(data.length, 1) + 3) * 11 * by.w + 2 * by.w * 10
        const h = f.bc.h
        f.el = { kind: 'barcode', xMm: mm(f.x), yMm: mm(f.baseline ? f.y - h : f.y), wMm: mm(wDots), hMm: mm(h) + (f.bc.human ? HUMAN_MM : 0),
          rotation: f.rot, text: data, slot, humanReadable: f.bc.human, ...(f.src ? { src: f.src } : {}) }
      } else {
        // ^FT y is the text BASELINE: top-left = y minus the font height (rotation 0 only; rotated anchors left as written)
        const h = font.h, w = font.w || font.h * 0.6
        f.el = { kind: 'text', xMm: mm(f.x), yMm: mm(f.baseline && f.rot === 0 ? f.y - h : f.y), wMm: mm(w * Math.max(data.length, 1)), hMm: mm(h),
          rotation: f.rot, text: data, slot, ...(f.src ? { src: f.src } : {}) }
      }
      els.push(f.el)
    }
    else if (cmd === 'XA' || cmd === 'XZ' || SKIP_ZPL.test(cmd) || tok.startsWith('~')) { /* draws nothing */ }
    else unknown.push(cut('^' + tok.replace(/[\r\n]+\s*$/, '')))
    if (cmd === 'FS') {
      // ^FS closes the field, so the command the panel must rewrite or delete ends just past it.
      if (f.src) f.src.cmdEnd = caret + 3
      if (f.gf && !isNaN(f.x)) els.push({ kind: 'image', xMm: mm(f.x), yMm: mm(f.baseline ? f.y - f.gf.h : f.y), wMm: mm(f.gf.w), hMm: mm(f.gf.h), rotation: 0,
        ...(f.src ? { src: f.src } : {}) })
      f = fresh()
    }
  }
}

/**
 * Null when the file declares no size at all (or the dialect is unknown). The reference offset
 * (EPL2 R, TSPL REFERENCE, ZPL ^LH) is ADDED to every element, because that is what the printer does.
 */
export function parsePrn(text: string, dialect: Dialect, dpi: number): ParsedTag | null {
  if (dialect === 'unknown') return null
  // xpml export wrappers sit on the same line as SIZE and would hide it from declaredSizeMm's ^SIZE anchor
  const size = declaredSizeMm(text.replace(/<\/?(?:xpml|page|end)[^>]*>/g, ''), dialect, dpi)
  if (!size) return null
  const o = declaredOffsetMm(text, dialect, dpi) ?? { offsetXmm: 0, offsetYmm: 0 }
  const off = { x: o.offsetXmm, y: o.offsetYmm }
  const elements: ParsedEl[] = [], unknown: string[] = []
  if (dialect === 'zpl') readZpl(text, dpi, elements, unknown)
  else readLines(text, dialect, dpi, elements, unknown)
  // Line numbers in one pass: elements come out in file order, so the scan never goes back.
  let line = 1, k = 0
  for (const e of elements) {
    e.xMm += off.x; e.yMm += off.y
    if (!e.src) continue
    while (k < e.src.cmdStart) { if (text[k] === '\n') line++; k++ }
    e.src.line = line
  }
  return { widthMm: size.widthMm, heightMm: size.heightMm, offsetXmm: off.x, offsetYmm: off.y, dpi, elements, unknown }
}

// ── EDITING THE FILE, BY SPLICING ────────────────────────────────────────────────────────────────
// Every helper here returns the SAME TEXT with one small cut or one small insertion. Nothing is
// re-serialised: line endings, indentation, BOMs, <xpml> wrappers and binary BITMAP/GW blobs are
// carried over byte for byte, because a printer file that round-trips through a pretty-printer is a
// corrupted printer file.

const setXY = (t: string, s: ElSrc, x: number, y: number) =>
  t.slice(0, s.xStart) + x + t.slice(s.xEnd, s.yStart) + y + t.slice(s.yEnd)

/** Move by whole DOTS - the printer's own unit. Relative, so a ZPL ^FT baseline stays a baseline. */
export function moveSrc(text: string, s: ElSrc, dxDots: number, dyDots: number): string {
  return setXY(text, s, Math.round(+text.slice(s.xStart, s.xEnd) + dxDots), Math.round(+text.slice(s.yStart, s.yEnd) + dyDots))
}

/** The whole command goes, and the line ending it sat on - nothing else, however long the command. */
export function removeSrc(text: string, s: ElSrc): string {
  let end = s.cmdEnd
  const ownLine = s.cmdStart === 0 || text[s.cmdStart - 1] === '\n' || text[s.cmdStart - 1] === '\r'
  if (ownLine) { if (text.startsWith('\r\n', end)) end += 2; else if (text[end] === '\n' || text[end] === '\r') end += 1 }
  return text.slice(0, s.cmdStart) + text.slice(end)
}

/**
 * A NEW FIELD, in the file's own handwriting: the model command is copied whole - its font, its
 * style arguments, its quoting - and only the two coordinates and the data are changed. It is
 * inserted at a command boundary (just after the model), so no blob can ever be split.
 */
export function addSrc(text: string, dialect: Dialect, model: ElSrc, slot: string, dxDots: number, dyDots: number): string {
  const off = model.cmdStart
  const rel: ElSrc = { ...model, xStart: model.xStart - off, xEnd: model.xEnd - off, yStart: model.yStart - off, yEnd: model.yEnd - off, cmdStart: 0, cmdEnd: model.cmdEnd - off }
  let cmd = moveSrc(text.slice(model.cmdStart, model.cmdEnd), rel, dxDots, dyDots)
  if (dialect === 'zpl') cmd = cmd.replace(/\^FD[\s\S]*?\^FS/, `^FD${slot}^FS`)
  else {
    const q = cmd.lastIndexOf('"'), p = cmd.lastIndexOf('"', q - 1) // the data is the last quoted operand
    if (q < 0 || p < 0) return text
    cmd = cmd.slice(0, p + 1) + slot + cmd.slice(q)
  }
  const at = model.cmdEnd
  const eol = text.startsWith('\r\n', at) ? '\r\n' : text[at] === '\n' ? '\n' : ''
  if (eol) return text.slice(0, at + eol.length) + cmd + eol + text.slice(at + eol.length)
  if (dialect === 'zpl') return text.slice(0, at) + cmd + text.slice(at) // ZPL needs no line of its own
  const nl = text.includes('\r\n') ? '\r\n' : '\n'
  return text.slice(0, at) + nl + cmd + text.slice(at)
}
