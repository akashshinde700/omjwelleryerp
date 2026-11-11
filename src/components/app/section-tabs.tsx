'use client'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { sectionFor } from './nav-config'
import type { ViewKey } from '@/store/app'

/**
 * The tab strip that replaced 16 sidebar entries. It is real navigation, not local state:
 * the active tab IS the active ViewKey, so a deep link (setView('ledger')) opens The Books on
 * the Ledger tab, a reload restores it, and nothing needs a second source of truth.
 *
 * Each tab's screen keeps its own PageHeader — that is where the Hindi label and the screen's
 * primary action live, and it names the tab you are on in both languages one line below the strip.
 */
export function Section({ view, setView, children }: { view: ViewKey; setView: (v: ViewKey) => void; children: React.ReactNode }) {
  const tabs = sectionFor(view)
  if (!tabs) return <>{children}</>
  return (
    <Tabs value={view} onValueChange={(v) => setView(v as ViewKey)}>
      {/* Underlined, transparent — so it reads as navigation and never competes with the pill
          filters (Received / Assigned / …) that several screens render just below it. */}
      <TabsList className="mb-1 h-auto w-full justify-start gap-1 rounded-none border-b bg-transparent p-0 overflow-x-auto nice-scroll">
        {tabs.map((t) => (
          <TabsTrigger
            key={t.key}
            value={t.key}
            className="flex-none rounded-none border-0 border-b-2 border-transparent px-3 py-2 text-muted-foreground shadow-none data-[state=active]:border-amber-500 data-[state=active]:bg-transparent data-[state=active]:text-amber-700 data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent dark:data-[state=active]:text-amber-300 hover:text-foreground"
          >
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value={view}>{children}</TabsContent>
    </Tabs>
  )
}
