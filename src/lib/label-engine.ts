/**
 * Thermal tag engine. PURE: template text + values in, text out. No I/O, no dialect parsing.
 *
 * THE TEMPLATE OWNS THE PRINTER LANGUAGE. This file only (1) fills named slots, (2) says which
 * dialect a file looks like so the panel can OFFER a size rewrite, and (3) performs that rewrite
 * when asked. Text is a Latin-1 string: one char = one byte, so a binary BITMAP block and CR line
 * endings round-trip exactly.
 *
 * SLOT SYNTAX: a slot is a bare word (e.g. OPTION2, OPTIONZ) wherever it appears in the file,
 * matched whole - it must not touch [A-Za-z0-9_] on either side, so OPTION2 never matches inside
 * OPTION23 or MY_OPTION2. This is the shape the shop's real file already has; nothing to rewrite.
 *
 * SECURITY BOUNDARY: values are untrusted (an item name typed by anyone with stock access).
 * - Substitution is ONE pass over the template; a value is never re-scanned, so a value that
 *   contains a slot name cannot trigger another substitution.
 * - Every control character (CR, LF, NUL, ESC...) becomes a space: a value can never start a
 *   new command line.
 * - " becomes ' and \ becomes /, so a value cannot close or escape a quoted operand in any
 *   dialect; ^ and ~ become spaces (ZPL command / escape introducers).
 * - Outside quotes (a bare numeric slot like LABEL_WIDTH) only [A-Za-z0-9._+-] survives, so a
 *   value cannot add operands.
 * - ZPL: field data is NOT quoted (^FDtext^FS), so a slot straight after ^FD / ^FV is treated like a
 *   quoted one (spaces survive) and may touch the ^FD it follows. ^ and ~ are already gone from every
 *   value, so it cannot end the field or start a command. If the template turns on ^FH hex escapes,
 *   the escape character (default _) is also removed from values, or "_5E" would decode to a caret.
 * - Characters above U+00FF (Devanagari...) cannot exist in a Latin-1 code page; they become '?'
 *   and are reported as a warning rather than silently corrupting the stream.
 */

export type Segment = { text: string; slot?: string }
export type RenderResult = { text: string; segments: Segment[]; warnings: string[] }
export type Dialect = 'tspl' | 'epl2' | 'zpl' | 'unknown'

const SLOT_NAME = /^[A-Za-z][A-Za-z0-9_]{1,31}$/
const HARD_MAX = 120

function clean(value: string, quoted: boolean, maxLen: number, warn: (m: string) => void, hexEsc?: string): string {
  let v = String(value ?? '')
  if (v.length > maxLen) { v = v.slice(0, maxLen); warn(`value cut to ${maxLen} characters`) }
  let out = ''
  let lost = false
  for (const ch of v) {
    const c = ch.codePointAt(0)!
    if (c < 0x20 || c === 0x7f) out += ' '
    else if (c > 0xff || (c >= 0x80 && c < 0xa0)) { out += '?'; lost = true }
    else if (ch === '"') out += "'"
    else if (ch === '\\') out += '/'
    else if (ch === '^' || ch === '~') out += ' '
    else if (ch === hexEsc) out += '-'
    else out += ch
  }
  if (lost) warn('characters outside Latin-1 (e.g. Devanagari) replaced by ? - a thermal code page cannot print them')
  out = out.trim()
  return quoted ? out : out.replace(/[^A-Za-z0-9._+-]/g, '')
}

export function renderTemplate(template: string, values: Record<string, string>, opts: { maxLen?: Record<string, number>; quotedOnly?: string[] } = {}): RenderResult {
  const warnings: string[] = []
  const names = Object.keys(values).filter((n) => {
    if (SLOT_NAME.test(n)) return true
    warnings.push(`"${n}" is not a valid slot name and was ignored`)
    return false
  }).sort((a, b) => b.length - a.length)
  if (!names.length) return { text: template, segments: [{ text: template }], warnings }
  // A slot is a whole word, or a word that directly follows ZPL's ^FD / ^FV (no space allowed there).
  const re = new RegExp(`(?:(?<![A-Za-z0-9_])|(?<=\\^F[DV]))(?:${names.join('|')})(?![A-Za-z0-9_])`, 'g')
  const fh = template.match(/\^FH([^^\r\n]?)/)
  const hexEsc = fh ? (fh[1] || '_') : undefined
  const segments: Segment[] = []
  let text = ''
  let last = 0
  for (const m of template.matchAll(re)) {
    const idx = m.index!
    const lineStart = Math.max(template.lastIndexOf('\r', idx - 1), template.lastIndexOf('\n', idx - 1)) + 1
    const caret = template.lastIndexOf('^', idx - 1)
    const zplData = caret >= 0 && /^\^F[DV]/.test(template.slice(caret, caret + 3)) && !/[\r\n]/.test(template.slice(caret, idx))
    const quoted = zplData || (template.slice(lineStart, idx).match(/(?<!\\)"/g) || []).length % 2 === 1
    // A short slot (s1..s9) could match two bytes of a binary BITMAP; only a quoted / ZPL-data position counts.
    if (opts.quotedOnly?.includes(m[0]) && !quoted) continue
    const cap = Math.min(opts.maxLen?.[m[0]] ?? HARD_MAX, HARD_MAX)
    const v = clean(values[m[0]], quoted, cap, (w) => { if (!warnings.includes(`${m[0]}: ${w}`)) warnings.push(`${m[0]}: ${w}`) }, hexEsc)
    if (idx > last) segments.push({ text: template.slice(last, idx) })
    segments.push({ text: v, slot: m[0] })
    text += template.slice(last, idx) + v
    last = idx + m[0].length
  }
  if (last < template.length) segments.push({ text: template.slice(last) })
  text += template.slice(last)
  return { text, segments, warnings }
}

/** Quoted ALL-CAPS words in the file - the shape the shop's own slots take (OPTION2, LPDJ...). */
export function findCandidateSlots(template: string): string[] {
  return [...new Set([...template.matchAll(/"([A-Z][A-Z0-9_]{3,31})"|\^F[DV]([A-Z][A-Z0-9_]{3,31})\^FS/g)].map((m) => m[1] || m[2]))]
}

/** DETECT, never assume. Anything not positively identified is 'unknown' = slots only. */
/** BarTender wraps TSPL in <xpml>..</xpml> tags, sometimes on the same line as SIZE. Line-anchored readers should see a COPY without them. */
export const stripXpml = (t: string): string => t.replace(/<xpml>.*?<\/xpml>|<page\b[^>]*\/>/g, '')

export function detectDialect(t: string): Dialect {
  t = stripXpml(t)
  if (/^[ \t\uFEFF\u00EF\u00BB\u00BF]*SIZE[ \t]+[\d.]+[ \t]*(mm)?[ \t]*,[ \t]*[\d.]+/m.test(t) && /^[ \t]*CLS[ \t]*$/m.test(t)) return 'tspl'
  if (/^Q\d+,\d+/m.test(t) && /^q\d+/m.test(t) && /^P\d+/m.test(t)) return 'epl2'
  if (/\^XA/.test(t) && /\^XZ/.test(t)) return 'zpl'
  return 'unknown'
}

export type Dims = { widthMm: number; heightMm: number; gapMm: number; offsetXmm: number; offsetYmm: number; dpi: number }
const mmStr = (n: number) => String(+n.toFixed(2))

/** Rewrites ONLY lines that already exist, only for a positively identified dialect. */
export function applyDimensions(t: string, dialect: Dialect, d: Dims): { text: string; changed: string[] } {
  const changed: string[] = []
  const dots = (mm: number) => Math.round((mm * d.dpi) / 25.4)
  const sub = (re: RegExp, repl: string, label: string) => { if (re.test(t)) { t = t.replace(re, repl); changed.push(label) } }
  if (dialect === 'tspl') {
    // $1 = any leading <xpml> tags, kept byte for byte; only the command after them is replaced.
    // $1 = indentation plus any leading <xpml> tags, kept byte for byte; only the command after
    // them is replaced. 12 of his 33 real files indent SIZE by 42 spaces.
    const X = '^([ \t\uFEFF\u00EF\u00BB\u00BF]*(?:<xpml>.*?</xpml>)*)'
    sub(new RegExp(X + 'SIZE[ \\t].*', 'm'), `$1SIZE ${mmStr(d.widthMm)} mm, ${mmStr(d.heightMm)} mm`, 'SIZE')
    sub(new RegExp(X + 'GAP[ \\t].*', 'm'), `$1GAP ${mmStr(d.gapMm)} mm, 0 mm`, 'GAP')
    sub(new RegExp(X + 'REFERENCE[ \\t].*', 'm'), `$1REFERENCE ${dots(d.offsetXmm)},${dots(d.offsetYmm)}`, 'REFERENCE')
  } else if (dialect === 'epl2') {
    sub(/^Q\d+,\d+/m, `Q${dots(d.heightMm)},${String(dots(d.gapMm)).padStart(3, '0')}`, 'Q')
    sub(/^q\d+/m, `q${dots(d.widthMm)}`, 'q')
    sub(/^R\d+,\d+/m, `R${dots(d.offsetXmm)},${dots(d.offsetYmm)}`, 'R')
  } else if (dialect === 'zpl') {
    // Width / length / home only. ZPL has no gap command of its own (media tracking is a printer setting).
    sub(/\^PW\d+/, `^PW${dots(d.widthMm)}`, '^PW')
    sub(/\^LL\d+/, `^LL${dots(d.heightMm)}`, '^LL')
    sub(/\^LH\d+,\d+/, `^LH${dots(d.offsetXmm)},${dots(d.offsetYmm)}`, '^LH')
  }
  return { text: t, changed }
}

export const toBytes = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff)
export const fromBytes = (b: Uint8Array): string => { let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192)); return s }
