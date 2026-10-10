"use client"

import { Loader2Icon, PlusIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useComparison } from "@/hooks/use-comparison"
import { useWorkspace } from "@/hooks/use-workspace"
import { seriesColor, type ChartTheme } from "@/lib/chart-palette"
import { formatDate } from "@/lib/format"
import {
  instrumentCode,
  instrumentKey,
  instrumentName,
  lineDashOf,
  type Instrument,
  type InstrumentGroup,
  type LineDash,
} from "@/lib/instruments"
import {
  addInstrument,
  MAX_PLOTTED,
  removeInstrument,
  setLineDash,
  setSeriesColor,
  togglePlotted,
} from "@/lib/workspace"
import { AddBenchmarkMenu } from "./add-benchmark-menu"
import { ComparisonChart, type ChartLine } from "./comparison-chart"
import { FilterBar } from "./filter-bar"
import { InstrumentPanel } from "./instrument-panel"
import { Kbd } from "./kbd"
import { MetricsTable, type MetricsRow } from "./metrics-table"
import { SymbolSearchDialog } from "./symbol-search-dialog"

export function Dashboard() {
  const [workspace, setWorkspace] = useWorkspace()
  const { resolvedTheme } = useTheme()
  const theme: ChartTheme = resolvedTheme === "dark" ? "dark" : "light"
  const { items, comparison, names, status, updating } = useComparison(workspace)
  const [searchOpen, setSearchOpen] = useState(false)
  const [viewKey, setViewKey] = useState(0)

  const colorOf = (slot: number) => seriesColor(slot, theme)
  const slotOwner = (slot: number) => {
    const item = items.find((i) => i.slot === slot)
    return item && instrumentCode(item.instrument)
  }
  const existing = useMemo(
    () => new Set([...workspace.watchlist, ...workspace.benchmarks].map(instrumentKey)),
    [workspace],
  )

  // "/" or Ctrl/Cmd+K opens symbol search, unless focus is in a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return
      if (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const add = (group: InstrumentGroup, instrument: Instrument) => {
    const result = addInstrument(workspace, group, instrument)
    if (!result.added) {
      toast.info(`${instrumentCode(instrument)} is already in your lists`)
      return
    }
    setWorkspace(result.ws)
    if (!result.plotted) {
      toast(`Added ${instrumentCode(instrument)}`, {
        description: `The chart is full (${MAX_PLOTTED} series). Untick one to plot it.`,
      })
    }
  }

  const toggle = (key: string) => {
    const result = togglePlotted(workspace, key)
    if (result.ok) setWorkspace(result.ws)
    else
      toast.warning(`Up to ${MAX_PLOTTED} series at once`, {
        description: "Untick one to make room. More lines than that become hard to tell apart.",
      })
  }

  const setColor = (key: string, slot: number) => setWorkspace(setSeriesColor(workspace, key, slot))
  const setDash = (key: string, dash: LineDash) => setWorkspace(setLineDash(workspace, key, dash))

  const remove = (key: string) => {
    const previous = workspace
    const instrument = [...workspace.watchlist, ...workspace.benchmarks].find((i) => instrumentKey(i) === key)
    setWorkspace(removeInstrument(workspace, key))
    toast(`Removed ${instrument ? instrumentCode(instrument) : "item"}`, {
      action: { label: "Undo", onClick: () => setWorkspace(previous) },
    })
  }

  const labelOf = (key: string, instrument: Instrument) => instrumentName(instrument, names[key])

  const lines: ChartLine[] = comparison.series.flatMap((s) => {
    const item = items.find((i) => i.key === s.key)
    if (!item) return []
    return [
      {
        key: s.key,
        label: labelOf(s.key, item.instrument),
        color: colorOf(item.slot),
        dash: lineDashOf(item.instrument, item.group),
        points: s.change,
      },
    ]
  })

  const rows: MetricsRow[] = items.map((item) => ({
    key: item.key,
    label: labelOf(item.key, item.instrument),
    code: instrumentCode(item.instrument),
    color: colorOf(item.slot),
    dash: lineDashOf(item.instrument, item.group),
    metrics: comparison.series.find((s) => s.key === item.key)?.metrics ?? null,
    status: status[item.key] ?? { state: "loading" },
  }))

  const limitedItem = comparison.limitedBy ? items.find((i) => i.key === comparison.limitedBy) : null
  const initialLoad = updating && lines.length === 0 && items.length > 0
  const stale = updating && lines.length > 0

  return (
    <AppShell workspace={workspace} onWorkspaceChange={setWorkspace}>
      <main className="mx-auto grid w-full max-w-[1440px] flex-1 gap-6 px-4 pt-2 pb-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-6">
        <section className="flex min-w-0 flex-col gap-4">
          <FilterBar
            range={workspace.range}
            baseCurrency={workspace.baseCurrency}
            updating={updating}
            onRangeChange={(range) => {
              setViewKey((k) => k + 1)
              if (range !== workspace.range) setWorkspace({ ...workspace, range })
            }}
            onBaseCurrencyChange={(baseCurrency) => setWorkspace({ ...workspace, baseCurrency })}
          />

          <Card className="gap-4 rounded-2xl">
            <CardHeader>
              <CardTitle>Performance</CardTitle>
              <CardDescription className="text-xs">
                {items.length === 0
                  ? "Nothing selected"
                  : `Total return in ${workspace.baseCurrency} since ${formatDate(comparison.start)}`}
                {limitedItem && <> · starts when {labelOf(limitedItem.key, limitedItem.instrument)} data begins</>}
              </CardDescription>
            </CardHeader>
            <CardContent className="relative">
              <ComparisonChart lines={lines} theme={theme} stale={stale} viewKey={viewKey} />
              {(items.length === 0 || initialLoad) && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                  {initialLoad ? (
                    <span className="flex items-center gap-2">
                      <Loader2Icon className="size-4 animate-spin" /> Loading prices
                    </span>
                  ) : (
                    "Tick items in your watchlist or benchmarks to compare them."
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="gap-0 rounded-2xl py-0">
            <CardHeader className="border-b px-4 py-3">
              <CardTitle>Metrics</CardTitle>
              <CardDescription className="text-xs">
                Same period and currency as the chart. Prices include dividends where the source provides them.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <MetricsTable rows={rows} stale={stale} />
            </CardContent>
          </Card>
        </section>

        <aside className="flex min-w-0 flex-col gap-4">
          <InstrumentPanel
            title="Watchlist"
            items={workspace.watchlist}
            group="watchlist"
            plotted={workspace.plotted}
            colorOf={colorOf}
            slotOwner={slotOwner}
            baseCurrency={workspace.baseCurrency}
            status={status}
            emptyText="No symbols yet. Add one to start comparing."
            onToggle={toggle}
            onRemove={remove}
            onColorChange={setColor}
            onDashChange={setDash}
            action={
              <Button variant="outline" size="sm" onClick={() => setSearchOpen(true)} title="Add a symbol (/)">
                <PlusIcon data-icon="inline-start" /> Add <Kbd>/</Kbd>
              </Button>
            }
          />
          <InstrumentPanel
            title="Benchmarks"
            items={workspace.benchmarks}
            group="benchmarks"
            plotted={workspace.plotted}
            colorOf={colorOf}
            slotOwner={slotOwner}
            baseCurrency={workspace.baseCurrency}
            status={status}
            emptyText="No benchmarks. Add a fixed return, gold or a currency."
            onToggle={toggle}
            onRemove={remove}
            onColorChange={setColor}
            onDashChange={setDash}
            action={
              <AddBenchmarkMenu
                existing={existing}
                baseCurrency={workspace.baseCurrency}
                onAdd={(instrument) => add("benchmarks", instrument)}
              />
            }
          />
          <p className="px-1 text-xs leading-relaxed text-muted-foreground">
            Your lists are kept in this browser. Use <span className="text-foreground">Export</span> to save them as a
            file, then <span className="text-foreground">Import</span> it or drop it on this page to load it anywhere.
          </p>
        </aside>
      </main>

      <SymbolSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="Add to watchlist"
        onSelect={(instrument) => add("watchlist", instrument)}
      />
    </AppShell>
  )
}
