"use client"

import { Loader2Icon, SearchIcon } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { AppShell } from "@/components/app-shell"
import { ComparisonChart, type ChartLine } from "@/components/dashboard/comparison-chart"
import { Kbd } from "@/components/dashboard/kbd"
import { SymbolSearchDialog } from "@/components/dashboard/symbol-search-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useValuation } from "@/hooks/use-valuation"
import { useWorkspace } from "@/hooks/use-workspace"
import { seriesColor, type ChartTheme } from "@/lib/chart-palette"
import { formatChange, formatDate, formatPrice, formatRatio } from "@/lib/format"
import { SYMBOL_PATTERN, valuationHref } from "@/lib/instruments"
import { RANGE_KEYS, type RangeKey } from "@/lib/ranges"
import { cn } from "@/lib/utils"
import { DriversTable, verdict, type DriverRow } from "./drivers-table"

/** Balance sheets go back about four years, so longer ranges would show nothing more. */
const RANGES = RANGE_KEYS.filter((r) => r !== "10Y" && r !== "MAX")

/** Indices (^JKSE), currencies (USDIDR=X) and futures (GC=F) have no balance sheet. */
const hasAccounts = (symbol: string) => !/[\^=]/.test(symbol)

export function Valuation() {
  const [workspace, setWorkspace] = useWorkspace()
  const { resolvedTheme } = useTheme()
  const theme: ChartTheme = resolvedTheme === "dark" ? "dark" : "light"
  const router = useRouter()
  const [range, setRange] = useState<RangeKey>("5Y")
  /** Percent change from the start, or the values themselves. */
  const [view, setView] = useState<"change" | "value">("change")
  const [viewKey, setViewKey] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)

  const stocks = workspace.watchlist.flatMap((i) => (i.kind === "ticker" && hasAccounts(i.symbol) ? [i] : []))
  // The stock lives in the URL so the screener can link to it; without one, start on the watchlist.
  const requested = useSearchParams().get("symbol")?.toUpperCase() ?? ""
  const symbol = SYMBOL_PATTERN.test(requested) ? requested : (stocks[0]?.symbol.toUpperCase() ?? null)
  const { valuation, name, currency, reportingCurrency, negativeEquity, error, loading } = useValuation(symbol, range)

  // "/" or Ctrl/Cmd+K opens stock search, unless focus is in a text field.
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

  const money = (value: number | null) => formatPrice(value, currency ?? undefined)
  const series = valuation
    ? [
        { key: "price", label: "Price", data: valuation.price, format: money, effect: valuation.attribution.price },
        {
          key: "book",
          label: "Book value per share",
          data: valuation.book,
          format: money,
          effect: valuation.attribution.bookEffect,
        },
        { key: "pbv", label: "P/BV", data: valuation.pbv, format: formatRatio, effect: valuation.attribution.pbv },
      ]
    : []
  const lines: ChartLine[] = series.map((s, slot) => {
    const line = { key: s.key, label: s.label, color: seriesColor(slot, theme), dash: "solid" as const }
    const change = { points: s.data.change, format: formatChange }
    const value = { points: s.data.levels, format: s.format }
    return view === "change"
      ? { ...line, points: change.points, detail: value }
      : // Price and book value share the currency axis; P/BV is a multiple, so it gets a pane.
        { ...line, ...value, pane: s.key === "pbv" ? 1 : 0, detail: change }
  })
  const rows: DriverRow[] = series.map((s, slot) => {
    const { levels } = s.data
    const first = levels[0].value
    const last = levels[levels.length - 1].value
    return {
      key: s.key,
      label: s.label,
      color: seriesColor(slot, theme),
      first: s.format(first),
      last: s.format(last),
      change: last / first - 1,
      effect: s.effect,
    }
  })

  const message = !symbol
    ? "Find a stock to see what moved its P/BV."
    : loading
      ? null
      : error
        ? error.message
        : valuation
          ? null
          : negativeEquity
            ? "The latest balance sheet shows negative equity, so there is no P/BV to chart."
            : "Not enough history yet to compare price with book value."

  return (
    <AppShell workspace={workspace} onWorkspaceChange={setWorkspace}>
      <main className="mx-auto grid w-full max-w-[1440px] flex-1 items-start gap-6 px-4 pt-2 pb-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-6">
        <h1 className="sr-only">P/BV drivers</h1>
        <section className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              spacing={0}
              value={range}
              // Clicking the active range reports "", which still means "reset to this range".
              onValueChange={(value) => {
                setViewKey((k) => k + 1)
                if (value) setRange(value as RangeKey)
              }}
              aria-label="Time range"
            >
              {RANGES.map((r) => (
                <ToggleGroupItem key={r} value={r} className="px-2.5 text-xs tabular-nums">
                  {r}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Button variant="outline" size="sm" onClick={() => setSearchOpen(true)} title="Find a stock (/)">
              <SearchIcon data-icon="inline-start" /> Find a stock <Kbd>/</Kbd>
            </Button>
          </div>

          <Card className="gap-4 rounded-2xl">
            <CardHeader>
              <CardTitle>
                {symbol ? (
                  <>
                    {name ?? symbol} {name && <span className="font-normal text-muted-foreground">{symbol}</span>}
                  </>
                ) : (
                  "P/BV drivers"
                )}
              </CardTitle>
              <CardDescription className="text-xs">
                {!valuation
                  ? "Price, book value per share and P/BV from one start date"
                  : view === "change"
                    ? `Change in price, book value per share and P/BV since ${formatDate(valuation.start)}`
                    : `Price and book value per share in ${currency}, P/BV below, since ${formatDate(valuation.start)}`}
                {valuation?.limitedBy === "book" && <> · as far back as the balance sheets go</>}
                {valuation?.limitedBy === "price" && <> · starts when the price history begins</>}
              </CardDescription>
              <CardAction>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  spacing={0}
                  value={view}
                  onValueChange={(value) => value && setView(value as typeof view)}
                  aria-label="Show as"
                >
                  <ToggleGroupItem value="change" className="px-2.5 text-xs" title="Percent change from the start date">
                    %
                  </ToggleGroupItem>
                  <ToggleGroupItem value="value" className="px-2.5 text-xs" title={`Price and book value in ${currency ?? "the trading currency"}`}>
                    {currency ?? "Value"}
                  </ToggleGroupItem>
                </ToggleGroup>
              </CardAction>
            </CardHeader>
            <CardContent className="relative">
              <ComparisonChart lines={lines} theme={theme} stale={false} viewKey={viewKey} />
              {(loading || message) && (
                <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2Icon className="size-4 animate-spin" /> Loading prices and balance sheets
                    </span>
                  ) : (
                    message
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {valuation && (
            <>
              <Card className="gap-0 rounded-2xl py-0">
                <CardHeader className="border-b px-4 py-3">
                  <CardTitle>What moved P/BV</CardTitle>
                  <CardDescription className="text-foreground">{verdict(valuation.attribution)}</CardDescription>
                </CardHeader>
                <CardContent className="px-0">
                  <DriversTable rows={rows} start={valuation.start} end={valuation.end} />
                </CardContent>
              </Card>
              <p className="px-1 text-xs leading-relaxed text-muted-foreground">
                Book value per share comes from {valuation.reports.length}{" "}
                {valuation.reports.length === 1 ? "balance sheet" : "balance sheets"} in this period, the latest dated{" "}
                <span className="text-foreground">{formatDate(valuation.reports[valuation.reports.length - 1])}</span>.
                It steps on each balance-sheet date, though companies publish weeks later, and the source keeps only
                about four year-ends and the latest quarters.{" "}
                {reportingCurrency &&
                  `The accounts are in ${reportingCurrency}, converted at each day's rate, so currency moves change book value too. `}
                Prices leave dividends out here, unlike the Compare chart.
              </p>
            </>
          )}
        </section>

        <aside className="flex min-w-0 flex-col gap-4">
          <Card className="gap-0 rounded-2xl py-0">
            <CardHeader className="border-b px-4 py-3">
              <CardTitle>Watchlist</CardTitle>
              <CardDescription className="text-xs">
                {stocks.length} {stocks.length === 1 ? "stock" : "stocks"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-2">
              {stocks.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                  No stocks in your watchlist. Find one above, or add some from the screener.
                </p>
              ) : (
                <ul className="flex flex-col">
                  {stocks.map((stock) => {
                    const active = stock.symbol.toUpperCase() === symbol
                    return (
                      <li key={stock.symbol}>
                        <Link
                          href={valuationHref(stock.symbol)}
                          aria-current={active ? "page" : undefined}
                          className={cn("block rounded-lg px-2 py-1.5 hover:bg-muted/60", active && "bg-muted")}
                        >
                          <span className="block truncate text-sm font-medium">{stock.symbol}</span>
                          <span className="block truncate text-xs text-muted-foreground">{stock.name ?? " "}</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
          <p className="px-1 text-xs leading-relaxed text-muted-foreground">
            A low P/BV can mean the price fell or the company grew its equity. The chart puts both next to the ratio,
            from the same start date, so you can see which one it was.
          </p>
        </aside>
      </main>

      <SymbolSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="Find a stock"
        stocksOnly
        onSelect={(instrument) => {
          if (instrument.kind === "ticker") router.push(valuationHref(instrument.symbol))
        }}
      />
    </AppShell>
  )
}
