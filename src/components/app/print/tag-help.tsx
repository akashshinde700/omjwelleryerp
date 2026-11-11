'use client'
import { ExternalLink } from 'lucide-react'

/**
 * HELP for the tag panel - oMunim's HELP tab in our shape.
 *
 * His three parts are all here: the Printer Setup Panel table, the Firefox silent-print
 * guide (kept, but labelled Firefox-only because it is), and the thermal roll profiles.
 * Dropped: his five near-identical "How To Install & Setup" rows of the same stock photo
 * (one shared procedure replaces them), his "Watch Video" links to oMunim's own tutorials,
 * and the A4 labels-per-sheet profiles - this app prints on the thermal roll.
 *
 * Pure reference text: no props, no fetch, no store. It can never break the panel.
 * Native <details> for the collapsibles - no state, no a11y bug to write.
 */

const TOUCH = 'pointer-coarse:min-h-11'
const th = 'whitespace-nowrap bg-muted/30 px-2 py-1 text-left font-medium'
const td = 'px-2 py-1 align-top pointer-coarse:py-2.5'

/** A table that survives a 400px screen: it scrolls inside its own box, it does not reflow the page. */
function Scroll({ children }: { children: React.ReactNode }) {
  return <div className="mt-1.5 min-w-0 overflow-x-auto rounded-md border">{children}</div>
}

/** One collapsed section. Heading level stays h3 under the panel's h2. */
function Sec({ title, hindi, open, children }: { title: string; hindi: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="min-w-0 rounded-md border px-2 py-1">
      <summary className={`flex cursor-pointer items-center gap-2 py-1 text-xs font-medium ${TOUCH}`}>
        <h3 className="inline text-xs font-medium">{title}</h3>
        <span className="text-xs font-normal text-muted-foreground">{hindi}</span>
      </summary>
      <div className="min-w-0 py-1 text-[11px] text-muted-foreground">{children}</div>
    </details>
  )
}

function Dl({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 text-amber-700 underline underline-offset-2 hover:text-amber-600 dark:text-amber-500 ${TOUCH}`}>
      {children} <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
    </a>
  )
}

/** The slot convention - proved by pairing his own barcode_main.prn against barcode_print.prn. */
const SLOTS: [string, string][] = [
  ['OPTION2', 'Item code'],
  ['OPTION3', 'Gross weight, as Gwt-2.020G'],
  ['OPTION4', 'Net weight, as Nwt-2.020G'],
  ['OPTION6', 'Purity, as 18KTS'],
  ['OPTION8', 'First stone'],
  ['OPTIONS1 / OPTIONS2 / OPTIONS3', 'Second, third, fourth stone'],
  ['OPTIONZ', 'Barcode number'],
  ['OPTION5', 'Left blank - your own file prints nothing here'],
  ['anything else (LPDJ...)', 'Printed exactly as written in your file'],
]

const SIZES: [string, string, string, string][] = [
  ['81 x 12 mm', '26', '55', '12'],
  ['100 x 15 mm', '35', '65', '15'],
  ['40 x 30 mm', '0', '40', '30'],
  ['25 x 25 mm', '0', '25', '25'],
  ['RFID', '0', '26', '27'],
]

/**
 * Language per brand only where we actually read it; the file's own bytes always decide.
 * oMunim listed TVS, TVS LP46 Neo and TVS LP46 Trio as three rows pointing at the same
 * place - one row, both model names still searchable.
 */
const PRINTERS: { name: string; lang: string; href?: string; link?: string; note?: string }[] = [
  { name: 'Zebra', lang: 'EPL2 or ZPL', href: 'https://support.zebra.com/', link: 'Zebra support and downloads' },
  { name: 'TSC', lang: 'TSPL', href: 'https://in.tscprinters.com/en/downloads', link: 'TSC India downloads' },
  { name: 'TVS Electronics (LP46 Neo, LP46 Trio)', lang: 'EPL2', href: 'https://www.tvselectronics.in/', link: 'TVS Electronics (India)' },
  { name: 'SNBC', lang: 'TSPL', note: 'No official download page we could verify - ask your dealer or use the CD that came with it.' },
  { name: 'Citizen', lang: 'Model-dependent - let the file decide', href: 'https://www.citizen-systems.com/en/support', link: 'Citizen Systems support' },
  { name: 'Argox', lang: 'PPLA / PPLB - not read; slots still fill', href: 'https://www.argox.com/', link: 'Argox website' },
]

/** His third column was the same stock photo five times. This is what it was supposed to say. */
const INSTALL: React.ReactNode[] = [
  <>Plug the printer in by USB and switch it on. Load the roll and close the head properly - a half-closed head prints nothing and reports no error.</>,
  <>Install the driver from the link in the table, picking your exact model and the USB port.</>,
  <>Windows <b>Settings &rarr; Printers &amp; scanners &rarr; your printer &rarr; Printing preferences</b>: set the label size to the roll you actually bought, and the sensor to <b>gap</b> or <b>black mark</b> to match the roll.</>,
  <>Print the driver&apos;s own <b>test label</b>. Get that right before you come back here - if the test label is wrong, nothing on this panel can correct it.</>,
  <>If you will send <b>tags.prn</b> to the printer by hand, share it: <b>Printer properties &rarr; Sharing</b>.</>,
]

const TROUBLE: [string, React.ReactNode][] = [
  ['Nothing prints and the panel says no template', <>This firm has not been given a printer file yet. Paste or upload one on the size tab you are printing from, then Save.</>],
  ['The file line says UNKNOWN', <>We do not read that printer language. Everything still prints - the slots are filled by name. Only the size rewrite is unavailable; put <b>LABEL_WIDTH</b>, <b>LABEL_HEIGHT</b>, <b>OFFSET_X</b>, <b>OFFSET_Y</b> in the file if you need it, or leave the file&apos;s own numbers alone.</>],
  ['The tag comes out the wrong size', <>&quot;Rewrite the size lines in my file&quot; is ON while the file&apos;s own size is different, so the file is being resized to the numbers on screen. The amber warning on the panel says so. Turn the switch off - the file keeps its own size.</>],
  ['Printing starts at the wrong end of the strip', <>Look at the drawing: his own two files start at <b>14 mm</b> and <b>46 mm</b> across. That is a coordinate inside the file, not a setting - fix it in the file, or move the whole tag with the X / Y offset boxes.</>],
  ['Garbled characters on the tag', <>A file sent in the wrong language. The brand name proves nothing - see Printer setup above.</>],
  ['BIS SIZE, QR SIZE, LOGO and FIXED are not on the panel', <>They are on oMunim&apos;s row and are <b>not built here yet</b>: we emit no QR element, and oMunim&apos;s own code is encrypted, so what its BIS / LOGO / FIXED boxes do to a .prn cannot be read. Four boxes that quietly change nothing would be worse. A drawn tag can already carry a logo image in the designer, and the BIS tick on the item already picks the <b>_bis</b> file.</>],
  ['The printer never receives anything', <>Today PRINT gives you a downloaded <b>tags.prn</b>. Sending it straight to the shop printer needs the small print helper on the shop PC, which is the next phase. Until then copy <b>tags.prn</b> to the printer share. oMunim did this with a Firefox-only silent-print setting; we will not ask you to run Firefox - the print helper replaces it.</>],
]

export function TagHelpPanel() {
  return (
    <div className="min-w-0 space-y-2 text-xs">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        Help <span className="text-xs font-normal text-muted-foreground">मदद</span>
      </h2>

      {/* ── 1. The one thing he says he cannot understand. Not collapsible. ── */}
      <section className="min-w-0 rounded-md border bg-muted/30 p-2">
        <h3 className="flex items-center gap-2 text-xs font-medium">
          Paste your printer file and print
          <span className="text-xs font-normal text-muted-foreground">फ़ाइल चिपकाएँ और प्रिंट करें</span>
        </h3>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-[11px]">
          <li>Pick the tab you print on. A tab does one of two jobs: <b>LABELS, TAIL LABELS, TAIL LOAN, 24L LOAN</b> are tag SETUP screens - no list, you find the one piece with SEARCH PRODUCT BY ID. <b>IMI TAIL LABELS, DIAMOND LOOSE STONE, LOAN TAG</b> are LISTS - recently added stock, with a printer on every row. Each tab keeps its own setup, its own 1..18 options and its own printer file.</li>
          <li>With no printer file the tab says so and offers one button. Press <b>Upload .prn</b>, or <b>or paste / draw it</b> to open <b>Printer file and the rest of this tab&apos;s setup</b>.</li>
          <li>Paste the printer file text, or upload the .prn.</li>
          <li>The usual slots fill themselves - there is no setup to do.</li>
          <li>On a list tab, tick the items you want tags for, or use the printer icon on one row. On a setup tab, search the piece by its id.</li>
          <li>Press <b>PRN -&gt; SAVE</b> for the printer file, or <b>PRN -&gt; PRINT</b> for the command to send it to your own printer.</li>
        </ol>
        <Scroll>
          <table className="w-full text-[11px]">
            <caption className="sr-only">Which slot name in your printer file prints which value</caption>
            <thead><tr><th scope="col" className={th}>Slot in your file</th><th scope="col" className={th}>What prints there</th></tr></thead>
            <tbody>
              {SLOTS.map(([slot, what]) => (
                <tr key={slot} className="border-t">
                  <td className={`${td} whitespace-nowrap font-mono`}>{slot}</td>
                  <td className={`${td} text-muted-foreground`}>{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scroll>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          This list is not ours - it came from your own two files. <b>barcode_main.prn</b> (the template) paired against
          <b> barcode_print.prn</b> (the same tag as printed): 14 of 14 commands pair exactly. Every row above is editable
          on the panel if you want a different value in a slot.
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          One caveat, plainly: in a screenshot OPTION6 was called RFID, but your file prints the <b>purity</b> there. We
          follow the file. Change it on the panel if the file ever changes.
        </p>
      </section>

      {/* ── 2. Printer setup. His HELP opens with this table, so ours does too - open, not folded.
             The warning comes before the table on purpose. ── */}
      <Sec title="Printer setup" hindi="प्रिंटर सेटअप" open>
        <p className="rounded-md border border-amber-600 bg-amber-50 p-2 text-[11px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          The printer language is detected from your file&apos;s own bytes, never from the brand name - in this shop&apos;s
          library <b>TSCarcode_81X12.prn</b> is really ZPL and <b>ZEBRAarcode.prn</b> is really EPL2, so a shop that
          trusts the brand prints garbage.
        </p>
        <Scroll>
          <table className="w-full">
            <caption className="sr-only">Printers a jewellery shop here buys, the language we read for each, and where to get drivers</caption>
            <thead><tr>
              <th scope="col" className={th}>Printer</th>
              <th scope="col" className={th}>Language we read</th>
              <th scope="col" className={th}>Driver download</th>
            </tr></thead>
            <tbody>
              {PRINTERS.map((p) => (
                <tr key={p.name} className="border-t">
                  <td className={`${td} font-medium text-foreground`}>{p.name}</td>
                  <td className={td}>{p.lang}</td>
                  <td className={td}>
                    {p.href ? <><Dl href={p.href}>{p.link}</Dl> <span className="block">search for your model there</span></> : p.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scroll>
        <p className="mt-1.5">
          Every link goes to the manufacturer&apos;s own site - we link where we could verify the page and say so plainly
          where we could not, because a dead link here costs you a phone call. We do not carry oMunim&apos;s tutorial
          videos; they are not ours to hand out.
        </p>

        <h4 className="mt-2 flex items-center gap-2 text-xs font-medium text-foreground">
          Installing it <span className="text-xs font-normal text-muted-foreground">प्रिंटर लगाना</span>
        </h4>
        <p className="mt-0.5">The same five steps for every one of them - that is why there is one list here and not one per brand.</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5">
          {INSTALL.map((step, i) => <li key={i}>{step}</li>)}
        </ol>
      </Sec>

      {/* ── 3. His Firefox page, kept - with the sentence his page never had. ── */}
      <Sec title="Printing without the save dialog" hindi="बिना डायलॉग के प्रिंट">
        <p className="rounded-md border border-amber-600 bg-amber-50 p-2 text-[11px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <b>Firefox only.</b> oMunim&apos;s silent-print setting works in Firefox and nowhere else - not in Chrome, not
          in Edge. If you are reading this in Chrome it will do nothing for you, so we would rather say so here than let
          you spend an afternoon on it.
        </p>
        <p className="mt-1.5">On this software the two paths that do work are:</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          <li>The small <b>print helper</b> on the shop PC, which sends the tag straight to the printer. It is not installed yet - that is the next phase.</li>
          <li>Until then, your browser&apos;s own print dialog, or copying the downloaded <b>tags.prn</b> to the printer share.</li>
        </ul>
        <h4 className="mt-2 text-xs font-medium text-foreground">If you do run Firefox</h4>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5">
          <li>Address bar: <code className="font-mono">about:config</code>, then accept the warning.</li>
          <li>Search <code className="font-mono">print.always_print_silent</code> and set it to <b>true</b>. It prints to the default printer with no dialog - make sure the default printer is the tag printer.</li>
          <li>In Page Setup: <b>Portrait</b>, all four margins <b>0</b>, and every header and footer set to <b>blank</b> - otherwise the page URL and date land on your tag.</li>
        </ol>
        <p className="mt-1.5">Set that and Firefox stops asking - including for pages you did not mean to print silently. Undo it the same way.</p>
      </Sec>

      {/* ── 4. Sizes. A tab is a named holder, nothing more. ── */}
      <Sec title="Tag sizes" hindi="टैग के नाप">
        <Scroll>
          <table className="w-full">
            <caption className="sr-only">Tag sizes, with the tail, printable width and height in millimetres</caption>
            <thead><tr>
              <th scope="col" className={th}>Label size</th>
              <th scope="col" className={th}>Tail (mm)</th>
              <th scope="col" className={th}>Width (mm)</th>
              <th scope="col" className={th}>Height (mm)</th>
            </tr></thead>
            <tbody>
              {SIZES.map(([size, tail, w, h]) => (
                <tr key={size} className="border-t">
                  <td className={`${td} whitespace-nowrap font-medium text-foreground`}>{size}</td>
                  <td className={`${td} font-mono`}>{tail}</td>
                  <td className={`${td} font-mono`}>{w}</td>
                  <td className={`${td} font-mono`}>{h}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scroll>
        <p className="mt-1.5">
          <b>Tail</b> is the blank strip that folds round the ring or the chain - nothing is printed on it.
        </p>
        <p className="mt-1">
          A size tab is only a <b>named holder</b>. Whatever file you paste into it is what prints - if you paste an
          81x12 file into the 100x15 tab, an 81x12 tag comes out. The name never changes the tag, and it never picks a
          template for you.
        </p>
        <p className="mt-1">Size is not chosen by metal. Gold or silver makes no difference here - pick the size of the tag on the roll.</p>
        <p className="mt-1">oMunim&apos;s 1-to-7-labels-per-sheet profiles are not here: that is A4 sticker-sheet geometry and this app prints on the thermal roll.</p>
        <p className="mt-1">His slip-roll profiles - the 2 inch and 3 inch receipt widths - are not here either. That is the bill printer, set up with the invoice, not with the tag.</p>
      </Sec>

      {/* ── 5. The unhappy path, which is most of the screen-time. ── */}
      <Sec title="Nothing comes out of the printer" hindi="प्रिंटर से कुछ नहीं निकला">
        <Scroll>
          <table className="w-full">
            <caption className="sr-only">Reasons a tag does not print, and the fix for each</caption>
            <thead><tr><th scope="col" className={th}>What you see</th><th scope="col" className={th}>What to do</th></tr></thead>
            <tbody>
              {TROUBLE.map(([cause, fix]) => (
                <tr key={cause} className="border-t">
                  <td className={`${td} font-medium text-foreground`}>{cause}</td>
                  <td className={td}>{fix}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scroll>
      </Sec>
    </div>
  )
}
