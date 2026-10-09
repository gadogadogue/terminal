"use client"

import { useQuery } from "@tanstack/react-query"
import { SearchIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { AppShell } from "@/components/app-shell"
import { Kbd } from "@/components/dashboard/kbd"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { screenerQuery } from "@/hooks/use-history"
import { useWorkspace } from "@/hooks/use-workspace"
import { activeFilterCount, runScreen, screenRow, type Screen, type ScreenRow } from "@/lib/analytics/screener"
import { instrumentKey } from "@/lib/instruments"
import type { StockSnapshot } from "@/lib/providers/types"
import { addInstrument, MAX_PLOTTED } from "@/lib/workspace"
import { ResultsTable } from "./results-table"
import { ScreenFilters, type SectorCount } from "./screen-filters"

const asOfFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

function countSectors(rows: ScreenRow[]): SectorCount[] {
  const counts = new Map<string, number>()
  for (const { stock } of rows) if (stock.sector) counts.set(stock.sector, (counts.get(stock.sector) ?? 0) + 1)
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name))
}

export function Screener() {
  const [workspace, setWorkspace] = useWorkspace()
  const router = useRouter()
  const { data, error, isPending, isFetching, refetch } = useQuery(screenerQuery())
  const [query, setQuery] = useState("")
  const searchInput = useRef<HTMLInputElement>(null)

  const screen = workspace.screener
  const setScreen = (screener: Screen) => setWorkspace({ ...workspace, screener })
  const rows = useMemo(() => data?.stocks.map(screenRow) ?? [], [data])
  const results = useMemo(() => runScreen(rows, screen, query), [rows, screen, query])
  const sectors = useMemo(() => countSectors(rows), [rows])
  const listed = useMemo(
    () => new Set([...workspace.watchlist, ...workspace.benchmarks].map(instrumentKey)),
    [workspace.watchlist, workspace.benchmarks],
  )

  // "/" jumps to the search box, unless focus is already in a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return
      if (e.key === "/") {
        e.preventDefault()
        searchInput.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const add = (stock: StockSnapshot) => {
    const result = addInstrument(workspace, "watchlist", { kind: "ticker", symbol: stock.symbol, name: stock.name })
    if (!result.added) return
    setWorkspace(result.ws)
    toast.success(`Added ${stock.symbol} to your watchlist`, {
      description: result.plotted ? undefined : `The chart is full (${MAX_PLOTTED} series), so it isn't plotted yet.`,
      action: { label: "Compare", onClick: () => router.push("/") },
    })
  }

  const narrowed = activeFilterCount(screen) > 0 || query.trim() !== ""
  const empty = error ? (
    <span className="flex flex-col items-center gap-3">
      {error.message}
      <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
        Try again
      </Button>
    </span>
  ) : (
    <span className="flex flex-col items-center gap-3">
      No stocks pass these filters.
      {narrowed && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setQuery("")
            setScreen({ ...screen, sectors: [], filters: {} })
          }}
        >
          Clear filters
        </Button>
      )}
    </span>
  )

  return (
    <AppShell workspace={workspace} onWorkspaceChange={setWorkspace}>
      <main className="mx-auto grid w-full max-w-[1440px] flex-1 items-start gap-6 px-4 pt-2 pb-10 lg:grid-cols-[288px_minmax(0,1fr)] lg:px-6">
        <h1 className="sr-only">Stock screener</h1>
        <aside className="flex min-w-0 flex-col gap-4">
          <ScreenFilters screen={screen} sectors={sectors} onChange={setScreen} />
          <p className="px-1 text-xs leading-relaxed text-muted-foreground">
            Filters are saved with your watchlist, so <span className="text-foreground">Export</span> keeps them too.
          </p>
        </aside>

        <section className="flex min-w-0 flex-col gap-4">
          <Card className="gap-0 rounded-2xl py-0">
            <CardHeader className="border-b px-4 py-3">
              <CardTitle>Stocks</CardTitle>
              <CardDescription className="col-start-1 text-xs">
                {data
                  ? `${results.length} of ${data.stocks.length} ${data.market} stocks · ${data.currency} · as of ${asOfFormat.format(new Date(data.asOf))}`
                  : error
                    ? "Could not load the market"
                    : "Loading the market…"}
              </CardDescription>
              {/* Its own full-width row on phones, beside the title from sm up. */}
              <CardAction className="col-span-2 col-start-1 row-span-1 row-start-3 mt-2 w-full sm:col-span-1 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:mt-0 sm:w-auto">
                <InputGroup className="w-full sm:w-56">
                  <InputGroupAddon>
                    <SearchIcon />
                  </InputGroupAddon>
                  <InputGroupInput
                    ref={searchInput}
                    type="search"
                    placeholder="Code or name"
                    aria-label="Find a stock by code or name"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Escape") return
                      setQuery("")
                      e.currentTarget.blur()
                    }}
                  />
                  <InputGroupAddon align="inline-end" className="hidden sm:flex">
                    <Kbd>/</Kbd>
                  </InputGroupAddon>
                </InputGroup>
              </CardAction>
            </CardHeader>
            <CardContent className="px-0">
              <ResultsTable
                rows={results}
                loading={isPending}
                sort={screen.sort}
                onSort={(sort) => setScreen({ ...screen, sort })}
                isListed={(symbol) => listed.has(instrumentKey({ kind: "ticker", symbol }))}
                onAdd={add}
                empty={empty}
              />
            </CardContent>
          </Card>
          <p className="px-1 text-xs leading-relaxed text-muted-foreground">
            P/BV and ROE use the latest book value per share; ROE is trailing 12-month earnings over it, so both lag
            the newest filing. <span className="text-foreground">≈</span> marks companies that report in USD: their
            book value is converted at the latest rate. The source gets a few stocks wrong, and a P/E under 1 or an
            ROE in the hundreds usually means a unit mix-up, so check the annual report before acting. Add a stock
            with <span className="text-foreground">+</span> to compare its performance.
          </p>
        </section>
      </main>
    </AppShell>
  )
}
