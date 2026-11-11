import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  INVOICE_FIELDS, fieldOverrideCss, fieldScopeClass, canHideField, canRenameField,
  RENAMEABLE_COUNTS, FIELD_LABEL_MAX, fieldLabel, fieldLabelHi, invoiceField,
  parseFieldOverrides, serializeFieldOverrides, statutoryWarning, countFieldOverrides, invoiceFieldsKey,
} from '@/components/app/print/invoice-fields'
import { InvoicePagePreview } from '@/components/app/print/invoice-doc'
import {
  DEFAULT_INVOICE_CONFIG, parseInvoiceConfig, INVOICE_LAYOUT_KEY, invoiceLayoutKey,
  type InvoiceConfig,
} from '@/components/app/print/invoice-print'
import { sampleInvoice, SAMPLE_FIRM, SAMPLE_CUSTOMER } from '@/components/app/print/invoice-sample'

/**
 * ── THE SHEET AND THE REGISTRY, HELD TO EACH OTHER ────────────────────────────────────────────────
 *
 * The Invoice Customization studio's promise is "click a label on the bill, change that label". It
 * is kept by exactly two things: every addressable node on the sheet carrying `data-field-count`
 * (fieldAttrs, spread as `fa(n)`), and the override map compiling to ONE scoped stylesheet
 * (fieldOverrideCss). Both are cheap to break silently:
 *
 *  - add a field to invoice-fields.ts, forget invoice-doc.tsx, and the studio ships a slider that
 *    moves nothing. Nobody notices until a shop uses it;
 *  - tag a `flagOnly` field and the studio offers a size for a line that is not there;
 *  - and the failure this whole print path exists to prevent: a SECOND renderer for the preview,
 *    which drifts from the paper. This project has paid for that four times, most recently a
 *    printed rate ten times the rate band two inches above it on the same sheet.
 *
 * So this file reads invoice-doc.tsx as TEXT. That is deliberate: a render test would pass happily
 * while a second copy of the sheet grew next door, and these are facts about the source.
 *
 * Owner: ux-design-lead.
 */

const DOC = join(process.cwd(), 'src/components/app/print/invoice-doc.tsx')
const src = readFileSync(DOC, 'utf8')

/** `fa(215)` — written at the call site precisely so this test can find it. */
const tagged = (count: number) => src.includes(`fa(${count})`)

describe('invoice-doc.tsx tags every field the registry lists', () => {
  it('every non-flagOnly field appears as fa(<count>) at least once', () => {
    const missing = INVOICE_FIELDS
      .filter((f) => !f.flagOnly && !tagged(f.count))
      .map((f) => `${f.count} ${f.name}`)
    expect(
      missing,
      `added to the registry but never tagged on the sheet — the studio would show a control with ` +
      `nothing to move:\n  ${missing.join('\n  ')}`,
    ).toEqual([])
  })

  it('no flagOnly field is tagged — it has no node of its own, so a rule for it is a lie', () => {
    const wrong = INVOICE_FIELDS
      .filter((f) => f.flagOnly && tagged(f.count))
      .map((f) => `${f.count} ${f.name}`)
    expect(wrong, `flagOnly fields tagged anyway: ${wrong.join(', ')}`).toEqual([])
    // The four, pinned by number as well: 23 and 301 render nothing at all, 25 and 26 share the
    // customer contact line, which is count 24 and carries the attribute for all three.
    expect(INVOICE_FIELDS.filter((f) => f.flagOnly).map((f) => f.count)).toEqual([23, 25, 26, 301])
  })

  it('there is ONE renderer: the shared print engine, and no second sheet beside it', () => {
    expect(src).toMatch(/from '\.\/print-sheet'/)
    // ONE InvoicePage. The printer's copies.map and the studio's preview both mount this one.
    expect(src.match(/function InvoicePage\(/g)).toHaveLength(1)
    expect(src).toContain('export function InvoicePagePreview')
    // …and the preview is a wrapper over it, not a sheet of its own: it has no <Page> of its own
    // and no second letterhead.
    // `<Page ` with an attribute after it: the MOUNT, not the word. The prose above that mount
    // names `<Page>` too, and a test that counts a comment is a test that goes red for a comment.
    expect(src.match(/<Page [a-z]/g)).toHaveLength(1)
    // The words are rendered from the grand total and from nothing else — once (defect 2).
    expect(src.match(/amountInWords\(/g)).toHaveLength(1)
    expect(src).toContain('amountInWords(figures.grandTotal)')
  })

  it('the override stylesheet is built in exactly one place', () => {
    expect(src.match(/fieldOverrideCss\(/g)).toHaveLength(1)
    expect(src).toContain('fieldOverrideCss(fieldOverrides || {}, scope)')
    expect(src.match(/fieldScopeClass\(/g)).toHaveLength(1)
  })

  it('the correctness this sheet carries is still single-sourced', () => {
    // itemColumnSpans drives the metal bands AND the Total row's landing column — one call.
    expect(src.match(/itemColumnSpans\(config/g)).toHaveLength(1)
    // The reconcile banner is an alert, not a note.
    expect(src).toMatch(/\{\.\.\.fa\(43\)\} role="alert"/)
    // A PAN we masked ourselves never prints.
    expect(src).toContain('!isMasked(customer.pan)')
  })
})

describe('fieldOverrideCss', () => {
  const scope = fieldScopeClass('sell')

  it('compiles a size and a colour into the scoped rule', () => {
    const css = fieldOverrideCss({ '215': { fontSize: 12, color: '#1e3a8a' } }, scope)
    expect(css).toContain('font-size:12px')
    expect(css).toContain('color:#1e3a8a')
    expect(css).toContain(scope)
    expect(css).toContain('[data-field-count="215"]')
  })

  it('generates nothing at all for a flagOnly field', () => {
    expect(fieldOverrideCss({ '23': { fontSize: 12 } }, scope)).toBe('')
    expect(fieldOverrideCss({ '301': { fontSize: 12, color: '#1e3a8a', show: false } }, scope)).toBe('')
  })

  it('an empty map is an empty stylesheet, so the default sheet is untouched', () => {
    expect(fieldOverrideCss({}, scope)).toBe('')
  })

  it('never hides a column or config-flagged field, however the row was written', () => {
    for (const f of INVOICE_FIELDS.filter((d) => !canHideField(d))) {
      const css = fieldOverrideCss({ [String(f.count)]: { show: false, print: false } }, scope)
      expect(css, `${f.count} ${f.name} was made hideable`).not.toContain('display:none')
    }
  })
})

/**
 * The studio's knobs, rendered through the SAME component the printer uses — InvoicePagePreview is
 * a wrapper over InvoicePage, so what passes here is what comes off the paper.
 *
 * Six skin values and sectionGap each have to land on a real class. The source-reading tests above
 * cannot see that: a constant can be defined, imported, and still never reach a className, which is
 * exactly the state this work found the file in.
 */
describe('the skin and the overrides reach the sheet', () => {
  const html = (config: InvoiceConfig, fieldOverrides?: Record<string, object>) =>
    renderToStaticMarkup(createElement(InvoicePagePreview as never, {
      invoice: sampleInvoice('sale'), firm: SAMPLE_FIRM, customer: SAMPLE_CUSTOMER,
      config, fieldOverrides,
    }))

  it('an empty override map adds no stylesheet at all, so the default sheet is untouched', () => {
    expect(html(DEFAULT_INVOICE_CONFIG)).not.toContain('<style')
  })

  it('one override compiles to ONE scoped style element on the page', () => {
    const out = html(DEFAULT_INVOICE_CONFIG, { '215': { fontSize: 12, color: '#1e3a8a', bold: true } })
    expect(out).toContain('<style>.inv-f-sell [data-field-count="215"]{font-size:12px;color:#1e3a8a;font-weight:700}</style>')
    expect(out.match(/<style>/g)).toHaveLength(1)
  })

  it('density · rules · zebra · heading case land on the item table', () => {
    // &amp; because these are Tailwind arbitrary variants in an HTML attribute.
    const out = html({ ...DEFAULT_INVOICE_CONFIG, density: 'roomy', rules: 'bold', zebra: true, headingCase: 'title' })
    expect(out).toContain('[&amp;_td]:py-1.5')
    expect(out).toContain('[&amp;_tbody_tr]:border-b-2')
    expect(out).toContain('[&amp;_tbody_tr:nth-child(even)]:bg-stone-50')
    expect(out).toContain('normal-case tracking-wide')
  })

  it('sectionGap lands on the band wrappers', () => {
    expect(html({ ...DEFAULT_INVOICE_CONFIG, sectionGap: 'loose' })).toContain('mt-3.5 grid grid-cols-2 gap-3')
    expect(html({ ...DEFAULT_INVOICE_CONFIG, sectionGap: 'tight' })).toContain('mt-1 grid grid-cols-2 gap-3')
    // 'normal' IS today's sheet.
    expect(html(DEFAULT_INVOICE_CONFIG)).toContain('mt-2 grid grid-cols-2 gap-3')
  })

  it('tint:false keeps the neutral stone heading even with an accent saved', () => {
    const out = html({ ...DEFAULT_INVOICE_CONFIG, accent: '#7c2d12', tint: false })
    expect(out).not.toContain('#7c2d12')
    expect(out).toContain('bg-stone-100')
  })

  it('the left and band header skins print the whole identity, and tag it', () => {
    for (const header of ['left', 'band'] as const) {
      const out = html({ ...DEFAULT_INVOICE_CONFIG, header, bisNo: 'BIS-9' })
      // 1·2·3·40·41 have no node on the default centred header — see HEAD_CAVEAT. Here they do.
      for (const c of [1, 2, 3, 5, 40, 41, 42]) {
        expect(out, `${header} header is missing field ${c}`).toContain(`data-field-count="${c}"`)
      }
      expect(out).toContain('Sample Jewellers')
      expect(out).toContain('BIS BIS-9')
      expect(out).toContain('Original for Recipient')
    }
  })

  it('the 80mm roll ignores the saved skin — see ROLL_SKIN', () => {
    const out = html({ ...DEFAULT_INVOICE_CONFIG, paper: 'roll80', header: 'band', zebra: true, accent: '#7c2d12' })
    expect(out).not.toContain('nth-child(even)')
    expect(out).not.toContain('#7c2d12')
  })
})

/**
 * ── EVERY PRINTER PASSES THE OVERRIDES, NOT JUST THE STUDIO ───────────────────────────────────────
 *
 * The studio's whole promise is that what it shows is what prints. It was kept on the studio's own
 * preview and broken on the only path that reaches actual paper: sell.tsx mounted <InvoiceSheet>
 * with `config` and `calc` parsed out of the settings rows and silently without `fieldOverrides`,
 * so a shop could restyle its bill, press Save, print a real invoice and get the unmodified sheet.
 *
 * It is a prop, so forgetting it is legal TypeScript and silent at runtime. This test is the guard:
 * every <InvoiceSheet> mount in the app has to hand over an override map.
 */
describe('every InvoiceSheet call site hands over the saved overrides', () => {
  const MOUNTS = [
    'src/components/app/modules/sell.tsx',
    'src/components/app/modules/print.tsx',
  ]

  it('no <InvoiceSheet> is mounted without fieldOverrides', () => {
    const bad: string[] = []
    for (const file of MOUNTS) {
      const text = readFileSync(join(process.cwd(), file), 'utf8')
      // Each JSX mount, from the tag to its self-closing '/>'.
      for (const m of text.matchAll(/<InvoiceSheet[\s\S]*?\/>/g)) {
        if (!m[0].includes('fieldOverrides=')) bad.push(file)
      }
    }
    expect(bad, `mounts <InvoiceSheet> without fieldOverrides: ${bad.join(', ')}`).toEqual([])
  })

  it('both printers are actually covered — the list above has not gone stale', () => {
    // A new file mounting the sheet must be added to MOUNTS, or this feature regresses in silence.
    const importers = ['src/components/app/modules/sell.tsx', 'src/components/app/modules/print.tsx']
    for (const f of importers) {
      expect(readFileSync(join(process.cwd(), f), 'utf8')).toContain('<InvoiceSheet')
    }
    expect(MOUNTS.sort()).toEqual(importers.sort())
  })

  it('sell.tsx picks the override map by the bill’s own document type', () => {
    const text = readFileSync(join(process.cwd(), 'src/components/app/modules/sell.tsx'), 'utf8')
    // Same settings rows `config` is parsed from — not a second fetch that could disagree.
    expect(text).toContain('parseFieldOverrides(settingsData?.settings, docTypeOfInvoiceType(invoice.type))')
  })
})

/**
 * A LAYOUT PER DOCUMENT TYPE, AND NOBODY LOSES THE ONE THEY HAD
 *
 * The owner: "my sell invoice has a different template and purchase has different - it is totally
 * my choice what I want, same or different." The field overrides were already per type; the layout
 * was a single global `invoice.layout` row, so choosing a design for the sale invoice silently
 * re-skinned the purchase bill, both return notes and the URD voucher.
 *
 * The risk in fixing that is the upgrade: every firm already has exactly one global row, and it is
 * their sale invoice's layout. It is read THROUGH rather than migrated - nothing has to be run
 * against the owner's live database - so the precedence below is the whole guarantee and is worth
 * pinning in a place that cannot be disturbed by a browser fixture.
 */
describe('parseInvoiceConfig: per-document-type layout, legacy row still honoured', () => {
  const rows = (o: Record<string, string>) => Object.entries(o).map(([key, value]) => ({ key, value }))

  it('a firm with ONLY the legacy global row keeps it, for every document type', () => {
    const legacy = rows({ [INVOICE_LAYOUT_KEY]: JSON.stringify({ paper: 'a5', accent: '#7f1d1d' }) })
    for (const docType of ['sell', 'purchase', 'sellReturn', 'purchaseReturn', 'rawMetalPurchase']) {
      const c = parseInvoiceConfig(legacy, docType)
      expect(c.paper, `${docType} lost the firm's saved paper`).toBe('a5')
      expect(c.accent, `${docType} lost the firm's saved colour`).toBe('#7f1d1d')
    }
  })

  it('a per-type row wins over the legacy row, and only for its own type', () => {
    const both = rows({
      [INVOICE_LAYOUT_KEY]: JSON.stringify({ paper: 'a5', accent: '#7f1d1d' }),
      [invoiceLayoutKey('purchase')]: JSON.stringify({ paper: 'a4', accent: '#1e3a8a' }),
    })
    expect(parseInvoiceConfig(both, 'purchase').accent).toBe('#1e3a8a')
    expect(parseInvoiceConfig(both, 'purchase').paper).toBe('a4')
    // Untouched types still read the global row - this is the upgrade path, not a default.
    expect(parseInvoiceConfig(both, 'sell').accent).toBe('#7f1d1d')
    expect(parseInvoiceConfig(both, 'sell').paper).toBe('a5')
  })

  it('no rows at all is the default sheet, not a throw', () => {
    expect(parseInvoiceConfig([], 'sell')).toEqual(DEFAULT_INVOICE_CONFIG)
    expect(parseInvoiceConfig(undefined, 'sell')).toEqual(DEFAULT_INVOICE_CONFIG)
  })

  it('a junk or truncated row degrades to the default instead of throwing at the printer', () => {
    for (const bad of ['{"paper":', 'null', '[]', '', 'not json at all']) {
      expect(() => parseInvoiceConfig(rows({ [invoiceLayoutKey('sell')]: bad }), 'sell')).not.toThrow()
      expect(parseInvoiceConfig(rows({ [invoiceLayoutKey('sell')]: bad }), 'sell').paper).toBe(DEFAULT_INVOICE_CONFIG.paper)
    }
  })
})

/**
 * ── RENAMING A LABEL ──────────────────────────────────────────────────────────────────────────────
 *
 * The owner: "i want edit option for each and every option such change the tital … if he want to
 * change the title from purity to tuch then he can". Much of the Indian jewellery trade says TOUCH
 * where this sheet says Purity, so until now the studio could restyle that heading and not reword
 * it — the single biggest gap in it.
 *
 * `text` / `textHi` are free text out of a MySQL TEXT column, which makes them the one override
 * that is not range-checkable. So they are cleaned, bounded, and — the part worth a test of its own
 * — kept OUT of the generated stylesheet entirely: fieldOverrideCss builds a raw CSS string, and a
 * `content:` escape hatch for an attacker-influenced label would be stylesheet injection by another
 * door (and unreadable to a screen reader besides).
 */
describe('a shop renames a label', () => {
  const rows = (o: Record<string, unknown>) =>
    [{ key: invoiceFieldsKey('sell'), value: JSON.stringify(o) }]
  const parsed = (o: Record<string, unknown>) => parseFieldOverrides(rows(o), 'sell')

  it('Purity becomes Touch, in both languages, through a save and a reload', () => {
    const saved = serializeFieldOverrides({ '111': { text: 'Touch', textHi: 'टच' } })
    const back = parseFieldOverrides([{ key: invoiceFieldsKey('sell'), value: saved }], 'sell')
    expect(back['111']).toEqual({ text: 'Touch', textHi: 'टच' })
    expect(fieldLabel(back, 111, 'Purity')).toBe('Touch')
    expect(fieldLabelHi(back, 111, 'शुद्धता')).toBe('टच')
  })

  it('the two halves are independent: renaming English leaves the registry Hindi alone', () => {
    const ov = parsed({ '44': { text: 'Bill No' } })
    expect(fieldLabel(ov, 44, 'Invoice No')).toBe('Bill No')
    expect(fieldLabelHi(ov, 44, 'बिल नं')).toBe('बिल नं')
  })

  it('an EMPTY label is stored, survives the round trip, and means "print nothing"', () => {
    // A Hindi-only shop blanks the English half. '' must not be mistaken for "never set".
    const saved = serializeFieldOverrides({ '111': { text: '', textHi: 'टच' } })
    expect(saved).toContain('"text":""')
    const back = parseFieldOverrides([{ key: invoiceFieldsKey('sell'), value: saved }], 'sell')
    expect(back['111']).toEqual({ text: '', textHi: 'टच' })
    expect(fieldLabel(back, 111, 'Purity')).toBe('')
    // The mirror case: an emptied Hindi half becomes undefined, which is how the renderers spell
    // "draw no second span" — an empty one would still cost the Devanagari line-height.
    const hi = parsed({ '111': { textHi: '' } })
    expect(hi['111']).toEqual({ textHi: '' })
    expect(fieldLabelHi(hi, 111, 'शुद्धता')).toBeUndefined()
    // ABSENT is the other thing entirely: fall back to the sheet's own word.
    expect(fieldLabel(parsed({ '111': { bold: true } }), 111, 'Purity')).toBe('Purity')
    expect(fieldLabelHi(parsed({ '111': { bold: true } }), 111, 'शुद्धता')).toBe('शुद्धता')
  })

  it('an entry holding nothing but a blanked label is not dropped as empty', () => {
    expect(serializeFieldOverrides({ '111': { text: '' } })).toBe('{"111":{"text":""}}')
    expect(countFieldOverrides(parsed({ '111': { text: '' } }))).toBe(1)
  })

  it('a long label is truncated at the bound, without splitting a character', () => {
    const long = 'x'.repeat(400)
    expect(parsed({ '111': { text: long } })['111'].text).toHaveLength(FIELD_LABEL_MAX)
    // Truncation is by CODE POINT: 44 rings, not 44 UTF-16 units ending in half a surrogate pair.
    const rings = parsed({ '111': { text: '💍'.repeat(60) } })['111'].text as string
    expect([...rings]).toHaveLength(FIELD_LABEL_MAX)
    expect(rings.endsWith('💍')).toBe(true)
    // Devanagari counts the same way, so a Hindi caption is not cut shorter than an English one.
    expect([...(parsed({ '111': { textHi: 'टच '.repeat(50) } })['111'].textHi as string)].length)
      .toBeLessThanOrEqual(FIELD_LABEL_MAX)
  })

  it('newlines, control characters and bidi overrides never reach the sheet', () => {
    // A newline inside a <th> breaks the column heading's single line.
    expect(parsed({ '111': { text: 'Touch\nकैरेट' } })['111'].text).toBe('Touch कैरेट')
    expect(parsed({ '111': { text: '  Touch\t\t(916)  ' } })['111'].text).toBe('Touch (916)')
    expect(parsed({ '111': { text: 'To\u0000u\u0007c\u009fh' } })['111'].text).toBe('To u c h')
    // U+202E can reverse the characters either side of it on the printed bill — a forgery tool.
    expect(parsed({ '111': { text: 'Touch‮gnithton' } })['111'].text).toBe('Touch gnithton')
    expect(parsed({ '111': { text: '   ' } })['111'].text).toBe('')
  })

  it('a label that is not a string is rejected outright', () => {
    for (const bad of [5, 0, true, null, {}, [], ['Touch']]) {
      expect(parsed({ '111': { text: bad, textHi: bad, bold: true } })['111']).toEqual({ bold: true })
    }
  })

  it('an unknown count is ignored, stored or resolved', () => {
    expect(parsed({ '999': { text: 'Touch' } })).toEqual({})
    expect(serializeFieldOverrides({ '999': { text: 'Touch' } })).toBe('{}')
    expect(fieldLabel({ '999': { text: 'Touch' } }, 999, 'Fallback')).toBe('Fallback')
  })

  it('the resolvers are total — the renderer calls them where there is no field at all', () => {
    const junk = [undefined, {}, { '111': null }, { '111': 'junk' }, { '111': [] }, { '111': { text: 7 } }]
    for (const ov of junk as never[]) {
      expect(fieldLabel(ov, 111, 'Purity')).toBe('Purity')
      expect(fieldLabelHi(ov, 111, 'शुद्धता')).toBe('शुद्धता')
      expect(fieldLabelHi(ov, 111)).toBeUndefined()
    }
    const ov = { '111': { text: 'Touch' } }
    for (const count of [undefined, -1, 0, 1.5, NaN, Infinity, 99999] as never[]) {
      expect(fieldLabel(ov, count, 'Purity')).toBe('Purity')
      expect(fieldLabelHi(ov, count, 'शुद्धता')).toBe('शुद्धता')
    }
  })
})

/**
 * WHICH fields may be renamed — encoded, so the studio can grey out the rest rather than offer a
 * box that does nothing. `locked` deliberately does NOT block a rename: it exists to stop a
 * required VALUE being hidden, not to freeze its caption, and "Bill No" for "Invoice No" is
 * ordinary trade practice.
 */
describe('canRenameField', () => {
  it('a locked field is still renameable — the number stays on the paper either way', () => {
    for (const c of [44, 45, 101, 200, 211]) {
      expect(canRenameField(invoiceField(c)!), `${c} should be renameable`).toBe(true)
      expect(RENAMEABLE_COUNTS.has(c)).toBe(true)
    }
  })

  it('a flagOnly or noLabel field is not — there is no caption to rewrite', () => {
    // 23/301 render nothing; 1 is the shop's own name, 40 the document title, 214 the statutory
    // inclusive-GST sentence. Renaming those is overwriting the content, not labelling it.
    for (const c of [1, 2, 23, 40, 41, 42, 214, 301, 306]) {
      expect(canRenameField(invoiceField(c)!), `${c} should NOT be renameable`).toBe(false)
      expect(RENAMEABLE_COUNTS.has(c)).toBe(false)
    }
  })

  it('a stored label on a field that may not be renamed is ignored at the point of use', () => {
    const ov = { '214': { text: 'No tax here' }, '301': { textHi: 'कुछ' } }
    expect(fieldLabel(ov, 214, 'Item amounts include GST')).toBe('Item amounts include GST')
    expect(fieldLabelHi(ov, 301, undefined)).toBeUndefined()
  })

  it('every renameable field is a real node, and the set is not empty', () => {
    expect(RENAMEABLE_COUNTS.size).toBeGreaterThan(30)
    for (const c of RENAMEABLE_COUNTS) expect(invoiceField(c)!.flagOnly).not.toBe(true)
  })
})

/**
 * THE LABEL NEVER REACHES THE STYLESHEET. fieldOverrideCss builds a raw CSS string out of stored
 * data; a label is the only stored value that is free text, so the one rule that keeps that string
 * safe is that no part of a label is ever interpolated into it.
 */
describe('fieldOverrideCss leaks no label text', () => {
  const scope = fieldScopeClass('sell')
  const HOSTILE = [
    '"} body{display:none} .x{"',
    '</style>',
    '<img src=x onerror=alert(1)>',
    'back\\slash',
    "it's quoted",
    'Touch 💍',
    '‮dnalsi',
    'url(javascript:alert(1))',
    'expression(alert(1))',
  ]

  it('a hostile label compiles to exactly the styling rule and nothing else', () => {
    for (const text of HOSTILE) {
      const css = fieldOverrideCss({ '111': { text, textHi: text, fontSize: 10 } }, scope)
      expect(css).toBe(`.${scope} [data-field-count="111"]{font-size:10px}`)
    }
  })

  it('no fragment of a label survives into the output, for any field in the registry', () => {
    for (const f of INVOICE_FIELDS) {
      const css = fieldOverrideCss(
        { [String(f.count)]: { text: HOSTILE.join(' '), textHi: 'टच', fontSize: 11, color: '#1e3a8a' } },
        scope,
      )
      for (const token of ['display:none', 'style', 'img', 'onerror', 'url(', 'expression(', 'टच', 'content:', '\\']) {
        expect(css, `${f.count} ${f.name} leaked ${token}`).not.toContain(token)
      }
    }
  })

  it('and the sheet is unchanged when a label is the only thing saved', () => {
    expect(fieldOverrideCss({ '111': { text: 'Touch' } }, scope)).toBe('')
  })
})

/**
 * THE THREE NEW TRADE COLUMNS. All three default OFF: a column of dashes on a plain-gold bill is a
 * defect on this sheet (see field 113), and A4 already carries up to 13 columns.
 */
/**
 * THE OLD-METAL BLOCK, AS FIVE FIELDS. The owner asked twice, the first time as "some customer dont
 * want to show old metal prity hide the he can". 216 was ONE field over the whole block, so the
 * shop could hide the exchange or none of it and could rename nothing in it. 230–235 are plain
 * nodes — no config flag, no column, not locked — so each takes a visibility rule AND a caption,
 * and 216 still switches the block as a whole.
 */
describe('the old-metal block splits into addressable parts', () => {
  const PARTS = [230, 231, 232, 233, 234, 235] as const

  it('each part can be hidden and renamed on its own', () => {
    const scope = fieldScopeClass('sell')
    for (const count of PARTS) {
      const def = invoiceField(count)!
      expect(def.group).toBe('totals')
      expect(def.defaultCheck, `${count} must print by default — it prints today`).toBe(true)
      expect(canHideField(def), `${count} is not hideable`).toBe(true)
      expect(canRenameField(def), `${count} is not renameable`).toBe(true)
      expect(def.note, `${count} needs a note the owner can read`).toBeTruthy()
      expect(fieldOverrideCss({ [String(count)]: { show: false } }, scope))
        .toContain(`[data-field-count="${count}"]{display:none !important}`)
    }
  })

  it('216 still switches the whole block, and is still renameable', () => {
    const block = invoiceField(216)!
    expect(canHideField(block)).toBe(true)
    expect(canRenameField(block)).toBe(true)
    expect(fieldOverrideCss({ '216': { show: false } }, fieldScopeClass('sell')))
      .toContain('[data-field-count="216"]{display:none !important}')
    // The note has to name the parts, or a shop hunting for "purity" never finds 231.
    expect(block.note).toMatch(/230 to 235/)
  })
})

describe('fine weight · value addition · other charges', () => {
  it('are registered as off-by-default columns driven by a config flag', () => {
    const want = [[121, 'showFineWeight'], [122, 'showValueAdd'], [123, 'showLineOtherCharges']] as const
    for (const [count, flag] of want) {
      const def = invoiceField(count)!
      expect(def.group).toBe('items')
      expect(def.column).toBe(true)
      expect(def.defaultCheck).toBe(false)
      expect(def.configFlag).toBe(flag)
      expect(def.note, `${count} needs a note the owner can read`).toBeTruthy()
      // A column is never hideable by CSS — the <th>/<td> pair goes together, via the flag.
      expect(canHideField(def)).toBe(false)
      expect(fieldOverrideCss({ [String(count)]: { show: false } }, fieldScopeClass('sell'))).toBe('')
      // Its heading is a caption, so it can be reworded.
      expect(canRenameField(def)).toBe(true)
    }
  })
})

/**
 * THE OWNER OVERRULED THE FIELD LOCKS. Every field may be switched off; the law only earns a
 * warning. What the switches write is unchanged: `show` / `print` in the override map.
 */
describe('no field is locked; statutory ones carry a warning instead', () => {
  const scope = fieldScopeClass('sell')
  const FORMER_LOCKS = [21, 27, 43, 44, 45, 101, 103, 130, 200, 201, 204, 205, 206, 207, 211, 214, 220, 302]
  const STATUTORY = [21, 27, 44, 45, 204, 205, 206, 207, 211, 214, 220, 302]

  it('the registry has no `locked` flag any more', () => {
    for (const f of INVOICE_FIELDS) expect('locked' in f, `${f.count} still locked`).toBe(false)
  })

  it('all 18 former locks are hideable, and the rule is generated for each', () => {
    for (const c of FORMER_LOCKS) {
      expect(canHideField(invoiceField(c)!), `${c} not hideable`).toBe(true)
      expect(fieldOverrideCss({ [String(c)]: { show: false } }, scope)).toContain(`[data-field-count="${c}"]{display:none !important}`)
      expect(fieldOverrideCss({ [String(c)]: { print: false } }, scope)).toContain('@media print')
    }
  })

  it('the 12 statutory fields carry a sentence naming the rule and the consequence', () => {
    for (const c of STATUTORY) {
      const w = statutoryWarning(invoiceField(c)!, 'sell')
      expect(w, `${c}`).toMatch(/Rule 4[68]/)
      expect(w, `${c}`).toMatch(/not (a )?valid/)
    }
  })

  it('the six non-statutory ones carry no legal language at all', () => {
    for (const c of FORMER_LOCKS.filter((x) => !STATUTORY.includes(x))) {
      const f = invoiceField(c)!
      expect(statutoryWarning(f, 'sell'), `${c}`).toBeUndefined()
      expect(f.note ?? '', `${c}`).not.toMatch(/Rule|GST|statutory|valid/)
    }
  })

  it('no warning on a document that is not the shop’s tax invoice', () => {
    expect(statutoryWarning(invoiceField(44)!, 'purchase')).toBeUndefined()
  })

  it('the does-not-add-up warning’s note says what hiding it hides', () => {
    expect(invoiceField(43)!.note).toMatch(/arithmetic fault/)
  })
})

describe('hiding the Description column takes the whole column out, spans included', () => {
  const html = (fieldOverrides?: Record<string, object>) =>
    renderToStaticMarkup(createElement(InvoicePagePreview as never, {
      invoice: sampleInvoice('sale'), firm: SAMPLE_FIRM, customer: SAMPLE_CUSTOMER,
      config: DEFAULT_INVOICE_CONFIG, fieldOverrides,
    }))
  const spanSum = (h: string) => [...h.matchAll(/colSpan="(\d+)"|colspan="(\d+)"/g)].map((m) => Number(m[1] || m[2]))

  it('no description cell remains, and every colspan that counted it counts one fewer', () => {
    const on = html(), off = html({ '101': { show: false } })
    expect(on).toMatch(/<t[dh] [^>]*data-field-count="101"/)
    expect(off).not.toMatch(/<t[dh] [^>]*data-field-count="101"/)
    const a = spanSum(on), b = spanSum(off)
    expect(b.length).toBe(a.length)
    expect(b.reduce((x, y) => x + y, 0)).toBeLessThan(a.reduce((x, y) => x + y, 0))
  })

  it('an untouched sheet is byte-identical to one with an empty override map', () => {
    expect(html({})).toBe(html(undefined))
  })
})
