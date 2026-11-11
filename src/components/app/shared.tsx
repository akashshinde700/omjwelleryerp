'use client'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'
import { motion } from 'framer-motion'
import * as React from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { SelectTrigger } from '@/components/ui/select'

/**
 * One figure, one tile. Deliberately the same height and the same reading order as the Home
 * screen's AttentionTile — label row, figure, one line of context — because a shopkeeper should
 * not have to learn two card shapes on one screen. The tone colours the ICON only: the figure
 * itself stays `foreground` so the eye is not asked to decode a hue before reading a number.
 */
export function StatCard({ title, value, icon: Icon, tone = 'amber', hint, delay = 0 }: {
  title: string
  value: string | number
  icon: LucideIcon
  tone?: 'amber' | 'emerald' | 'violet' | 'coral' | 'teal' | 'slate'
  hint?: string
  delay?: number
}) {
  const tones: Record<string, string> = {
    amber: 'text-amber-600 dark:text-amber-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    violet: 'text-violet-600 dark:text-violet-400',
    coral: 'text-rose-600 dark:text-rose-400',
    teal: 'text-teal-600 dark:text-teal-400',
    slate: 'text-muted-foreground',
  }
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay }} className="h-full">
      <Card className="h-full overflow-hidden py-0">
        <CardContent className="p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Icon className={cn('size-3.5 shrink-0', tones[tone])} />
            <span className="truncate">{title}</span>
          </p>
          <p className="mt-1 text-xl font-bold tracking-tight tabular-nums truncate">{value}</p>
          {hint && <p className="text-[11px] text-muted-foreground truncate">{hint}</p>}
        </CardContent>
      </Card>
    </motion.div>
  )
}

/**
 * The one page header in the product. Every module opens with it, so the shape is learnable
 * from any screen: English title, Hindi beside it, one line of context, primary action top-right
 * (and full-width first on a phone, where it is the thing you came to tap).
 */
export function PageHeader({ title, hindi, desc, actions }: { title: string; hindi?: string; desc?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-3 mb-4">
      <div className="min-w-0">
        {/* Hindi stays a SIBLING of the h1, never a child: it is a second label for the same
            screen, not part of the heading's accessible name (which the e2e specs match on). */}
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{title}</h1>
          {hindi && <span className="text-sm text-muted-foreground hindi">{hindi}</span>}
        </div>
        {desc && <p className="text-sm text-muted-foreground mt-0.5">{desc}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

/* ───────────────────────── Charts ─────────────────────────
 * Recharts writes colours as SVG *presentation attributes*, where `var(--border)` is not
 * substituted — which is why every chart in the app shipped with light-theme greys baked in and
 * drew gridlines brighter than the data in dark mode. Two fixes, both theme-aware:
 *   - axis/grid: a Tailwind class (a real CSS declaration beats a presentation attribute) plus
 *     `currentColor`, so the axis follows `text-muted-foreground` in whichever theme is on;
 *   - tooltip: an inline `style`, where `var()` does resolve.
 */
export const chartAxis = {
  className: 'text-muted-foreground',
  stroke: 'currentColor',
  fontSize: 12,
  tick: { fill: 'currentColor' },
} as const

export const chartGrid = { strokeDasharray: '3 3', className: 'stroke-border' } as const

export const chartTooltip = {
  contentStyle: {
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--popover)',
    color: 'var(--popover-foreground)',
    fontSize: 12,
  },
  cursor: { fill: 'var(--muted)', fillOpacity: 0.5 },
} as const

export function EmptyState({ icon: Icon, title, desc, action }: { icon: LucideIcon; title: string; desc?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="size-14 rounded-2xl bg-muted grid place-items-center mb-4">
        <Icon className="size-7 text-muted-foreground" />
      </div>
      <p className="font-medium">{title}</p>
      {desc && <p className="text-sm text-muted-foreground mt-1 max-w-sm">{desc}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// Host tags the HTML spec allows a <label for> to target (gets an accessible name + label-click
// focus for free). shadcn components below forward `id` straight onto one of these.
const LABELABLE_TAGS = new Set(['input', 'textarea', 'select', 'button', 'meter', 'output', 'progress'])
// NumInput is a function DECLARATION further down this file on purpose: this Set is evaluated at
// module-init, above it, and a `const` arrow would be in the temporal dead zone and throw. Any
// future custom control wrapped in <Field> must be added here too — injectFieldId cannot see
// through a function component, so a wrapper missing from this Set silently renders a
// <Label htmlFor> pointing at nothing (the control keeps its visible text and loses its
// accessible name, which no type-check and no green test suite will tell you about).
export const LABELABLE_COMPONENTS = new Set<unknown>([Input, Textarea, Button, SelectTrigger, NumInput])

function isLabelable(type: unknown) {
  return (typeof type === 'string' && LABELABLE_TAGS.has(type)) || LABELABLE_COMPONENTS.has(type)
}

/**
 * Walks a Field's children looking for the first labelable control and clones the field's id
 * onto it. Needed because a shadcn `<Select>` renders no DOM node itself — the id has to land on
 * the nested `<SelectTrigger>` (a real `<button>`) two levels down for `label[for]` to do
 * anything. Everything else (help text, a second action button, later Select items) passes
 * through untouched. Non-element children, fragments and custom pickers that don't expose one of
 * the above fall through unchanged rather than throwing.
 */
/** Re-attach children as varargs. Mapping over static JSX children produces a *new* array, and
 * React then demands keys that statically-written children never needed — that is what produced
 * the "unique key prop ... from SelectContext" console warning. Spreading restores varargs. */
function cloneWithChildren(node: React.ReactElement, children: React.ReactNode): React.ReactElement {
  return Array.isArray(children)
    ? React.cloneElement(node, {}, ...children)
    : React.cloneElement(node, {}, children)
}

export function injectFieldId(node: React.ReactNode, id: string): { node: React.ReactNode; done: boolean } {
  if (Array.isArray(node)) {
    let done = false
    const mapped = node.map((child) => {
      if (done) return child
      const r = injectFieldId(child, id)
      done = r.done
      return r.node
    })
    return { node: mapped, done }
  }
  if (!React.isValidElement(node)) return { node, done: false }
  if (node.type === React.Fragment) {
    const r = injectFieldId((node.props as { children?: React.ReactNode }).children, id)
    return r.done ? { node: cloneWithChildren(node, r.node), done: true } : { node, done: false }
  }
  if (isLabelable(node.type)) {
    return { node: React.cloneElement(node as React.ReactElement<{ id?: string }>, { id }), done: true }
  }
  const children = (node.props as { children?: React.ReactNode } | null)?.children
  if (children !== undefined) {
    const r = injectFieldId(children, id)
    if (r.done) return { node: cloneWithChildren(node, r.node), done: true }
  }
  return { node, done: false }
}

/** Labelled form field wrapper used across every module dialog. Associates the label with
 * whatever control it wraps via `useId()` so screen readers announce it and `getByLabel` finds
 * it in tests — see `tests/e2e/form-reset.spec.ts`. */
export function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  const id = React.useId()
  const { node } = injectFieldId(children, id)
  return (
    <div className={full ? 'sm:col-span-2 space-y-1.5 min-w-0' : 'space-y-1.5 min-w-0'}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      {/* injectFieldId .map()s a multi-child Field into a NEW array; rendered as `{node}` React
          demands keys on statically-written children (the "unique key prop ... passed a child from
          InvoiceForm" warning). Re-spread as varargs through a Fragment, like cloneWithChildren. */}
      {Array.isArray(node) ? React.createElement(React.Fragment, null, ...node) : node}
    </div>
  )
}

/** Every plain numeric input in a money/weight form: right-aligned tabular figures, a decimal
 * keypad on mobile, a mouse-wheel that blurs instead of silently bumping a rupee value, and a
 * paste that strips ₹/comma/space so "₹1,20,000" copied out of a WhatsApp quote lands as a number
 * and not NaN. Spreads `...rest` onto the real <input> so the `id` Field clones in actually lands
 * — see LABELABLE_COMPONENTS above, which this is registered in. */
export function NumInput({ value, onChange, step = '0.01', className, ...rest }: {
  value: number | string; onChange: (v: number) => void; step?: string; className?: string
} & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type' | 'step'>) {
  return (
    <Input
      type="number" inputMode="decimal" step={step} value={value ?? 0}
      onChange={(e) => onChange(Number(e.target.value))}
      onWheel={(e) => (e.target as HTMLInputElement).blur()}
      onPaste={(e) => {
        const text = e.clipboardData.getData('text')
        if (/[,₹\s]/.test(text)) {
          e.preventDefault()
          const n = Number(text.replace(/[,₹\s]/g, ''))
          if (!isNaN(n)) onChange(n)
        }
      }}
      className={cn('text-right tabular-nums', className)}
      {...rest}
    />
  )
}

export function ToneBadge({ tone, children }: { tone: 'green' | 'red' | 'amber' | 'blue' | 'gray' | 'violet'; children: React.ReactNode }) {
  const tones: Record<string, string> = {
    green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    red: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    blue: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
    gray: 'bg-muted text-muted-foreground',
    violet: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  }
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>
}

/* ───────────────────────── Enter as next-field ─────────────────────────
 * oMunim calls this "FORM NEXT FIELD SHORTCUT KEY SETUP: ENTER KEY | TAB KEY". An operator
 * keying hundreds of fields a day reaches for Enter, not Tab, and pressing it in a browser
 * form does nothing (or submits). Off by default, so a firm that never sets it keeps the
 * browser's native behaviour exactly.
 */
const ENTER_SKIP_TYPES = new Set(['submit', 'button', 'reset', 'checkbox', 'radio', 'file', 'image'])
const ENTER_FOCUSABLE = 'input:not([type="hidden"]),select,textarea,button,[tabindex]:not([tabindex="-1"])'

/**
 * Install the Enter-moves-to-next-field behaviour for the firm, if it has asked for it.
 * Mounted once, from the app shell.
 *
 * It listens in the BUBBLE phase on `document`, after React's own handlers, and stands down the
 * moment anything upstream has already claimed the key (`defaultPrevented`) — so a component that
 * gives Enter its own meaning always wins.
 */
export function useEnterAsTab(enabled: boolean) {
  React.useEffect(() => {
    if (!enabled) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing) return
      if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return
      const el = e.target
      // Only plain typing fields. A textarea needs Enter for a newline; a button needs it to click.
      if (!(el instanceof HTMLInputElement) || ENTER_SKIP_TYPES.has(el.type)) return
      // ponytail: a grid row (the sell screen's manual item line) already commits on Enter, and an
      // open combobox uses it to pick the highlighted option — leave both alone. `data-enter-skip`
      // is the escape hatch for anything else that grows its own Enter meaning.
      if (el.closest('table,[data-enter-skip]') || el.getAttribute('aria-expanded') === 'true') return

      const scope = el.closest('form,[role="dialog"]') || document.body
      const fields = Array.from(scope.querySelectorAll<HTMLElement>(ENTER_FOCUSABLE))
        .filter((n) => !(n as HTMLInputElement).disabled && n.tabIndex >= 0 && n.offsetParent !== null)
      const next = fields[fields.indexOf(el) + 1]
      if (!next) return // last control in the form — let Enter do whatever it would have done
      e.preventDefault()
      next.focus()
      // Arriving on a field with its value selected is the point: the operator overtypes it.
      if (next instanceof HTMLInputElement && !ENTER_SKIP_TYPES.has(next.type)) next.select()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
