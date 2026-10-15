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
import { EARNINGS_BASES, type EarningsBasis } from "@/lib/analytics/valuation"
import { seriesColor, type ChartTheme } from "@/lib/chart-palette"
import { formatChange, formatDate, formatPrice, formatRatio } from "@/lib/format"
import { SYMBOL_PATTERN, VALUATION_RATIOS, isCompany, valuationHref, type ValuationRatio } from "@/lib/instruments"
import { RANGE_KEYS, type RangeKey } from "@/lib/ranges"
import { cn } from "@/lib/utils"
import { DriversTable, verdict, type DriverRow } from "./drivers-table"

/** Company reports go back about four years, so longer ranges would show nothing more. */
const RANGES = RANGE_KEYS.filter((r) => r !== "10Y" && r !== "MAX")

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** The price line's slot in the chart palette: green, whichever ratio is showing. */
const PRICE_SLOT = 2

/**
 * How each ratio reads and is drawn. A color means one thing in both, so the
 * two lines beside the price have palette slots of their own. Each ratio's
 * three colors were validated against one another, not only as neighbors.
 */
const RATIOS: Record<
  ValuationRatio,
  {
    label: string
    /** What the price is divided by: as a line's name, and mid-sentence. */
    line: string
    fundamental: string
    /** The reports that figure comes from. */
    reports: string
    slots: { fundamental: number; ratio: number }
    /** Why nothing is charted when the latest report leaves nothing positive to divide by. */
    negative: string
    /** Why the period starts late when an earlier report did. */
    sinceNegative: string
    /** How a company brings the ratio down itself. */
    cheaper: string
  }
> = {
  pbv: {
    label: "P/BV",
    line: "Book value per share",
    fundamental: "book value",
    reports: "balance sheets",
    slots: { fundamental: 1, ratio: 0 },
    negative: "The latest balance sheet shows negative equity, so there is no P/BV to chart.",
    sinceNegative: "starts once equity turned positive",
    cheaper: "the company grew its equity",
  },
  pe: {
    label: "P/E",
    line: "Earnings per share",
    fundamental: "earnings",
    reports: "income statements",
    slots: { fundamental: 6, ratio: 3 },
    negative: "The latest earnings are a loss, so there is no P/E to chart.",
    sinceNegative: "starts after the last loss",
    cheaper: "the company earned more",
  },
}

/**
 * The ways to state earnings per share, picked next to the range; P/E is the
 * price over whichever is showing. `suffix` follows the line's name and
 * `note` says in the footnote what was done to the trailing figures.
 */
const BASES: Record<EarningsBasis, { label: string; hint: string; suffix: string; note: string }> = {
  trailing: {
    label: "TTM",
    hint: "The 12 months to each report, updated every quarter",
    suffix: "",
    note: "",
  },
  annual: {
    label: "Annual",
    hint: "Full fiscal years only, one step a year",
    suffix: " (full year)",
    note: "Only full fiscal years are kept here, so the line steps once a year. ",
  },
  average1y: {
    label: "1Y avg",
    hint: "Each 12-month figure averaged with the others reported in the year before it",
    suffix: " (1-year average)",
    note: "Here each figure is averaged with the others reported in the year before it. ",
  },
  average3y: {
    label: "3Y avg",
    hint: "The average of three fiscal years in a row",
    suffix: " (3-year average)",
    note: "Here each figure is the average of three fiscal years in a row, so the line starts at the third year-end the source has. ",
  },
}

export function Valuation() {
  const [workspace, setWorkspace] = useWorkspace()
  const { resolvedTheme } = useTheme()
  const theme: ChartTheme = resolvedTheme === "dark" ? "dark" : "light"
  const router = useRouter()
  const [range, setRange] = useState<RangeKey>("5Y")
  /** Percent change from the start, or the values themselves. */
  const [view, setView] = useState<"change" | "value">("change")
  const [basis, setBasis] = useState<EarningsBasis>("trailing")
  const [viewKey, setViewKey] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)

  const stocks = workspace.watchlist.flatMap((i) => (i.kind === "ticker" && isCompany(i.symbol) ? [i] : []))
  // Stock and ratio live in the URL so the screener can link to them; without a stock, start on the watchlist.
  const params = useSearchParams()
  const requested = params.get("symbol")?.toUpperCase() ?? ""
  const symbol = SYMBOL_PATTERN.test(requested) ? requested : (stocks[0]?.symbol.toUpperCase() ?? null)
  const ratio = VALUATION_RATIOS.find((r) => r === params.get("ratio")) ?? "pbv"
  // A start date from a link, such as the screener's P/BV high; picking a range drops it.
  const from = ISO_DATE.test(params.get("from") ?? "") ? params.get("from") : null
  const copy = RATIOS[ratio]
  // The line under the price, named for how its earnings are stated.
  const line = ratio === "pe" ? copy.line + BASES[basis].suffix : copy.line
  const { valuation, name, currency, reportingCurrency, negative, error, loading } = useValuation(
    symbol,
    ratio,
    range,
    basis,
    from,
  )

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
        {
          key: "price",
          label: "Price",
          slot: PRICE_SLOT,
          data: valuation.price,
          format: money,
          effect: valuation.attribution.price,
        },
        {
          key: "fundamental",
          label: line,
          slot: copy.slots.fundamental,
          data: valuation.fundamental,
          format: money,
          effect: valuation.attribution.fundamentalEffect,
        },
        {
          key: "ratio",
          label: copy.label,
          slot: copy.slots.ratio,
          data: valuation.ratio,
          format: formatRatio,
          effect: valuation.attribution.ratio,
        },
      ]
    : []
  const lines: ChartLine[] = series.map((s) => {
    const line = { key: s.key, label: s.label, color: seriesColor(s.slot, theme), dash: "solid" as const }
    const change = { points: s.data.change, format: formatChange }
    const value = { points: s.data.levels, format: s.format }
    if (view === "change") return { ...line, points: change.points, detail: value }
    // Price and what it is divided by share the currency axis; the ratio is a multiple, so it gets a pane.
    return { ...line, ...value, pane: s.key === "ratio" ? 1 : 0, detail: change }
  })
  const rows: DriverRow[] = series.map((s) => {
    const { levels } = s.data
    const first = levels[0].value
    const last = levels[levels.length - 1].value
    return {
      key: s.key,
      label: s.label,
      color: seriesColor(s.slot, theme),
      first: s.format(first),
      last: s.format(last),
      change: last / first - 1,
      effect: s.effect,
    }
  })

  const message = !symbol
    ? `Find a stock to see what moved its ${copy.label}.`
    : loading
      ? null
      : error
        ? error.message
        : valuation
          ? null
          : negative
            ? copy.negative
            : `Not enough history yet to compare price with ${copy.fundamental}.`
  const measures = `${line.toLowerCase()} and ${copy.label}`

  return (
    <AppShell workspace={workspace} onWorkspaceChange={setWorkspace}>
      <main className="mx-auto grid w-full max-w-[1440px] flex-1 items-start gap-6 px-4 pt-2 pb-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-6">
        <h1 className="sr-only">{copy.label} drivers</h1>
        <section className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                spacing={0}
                value={ratio}
                onValueChange={(value) => {
                  if (!value) return
                  const next = new URLSearchParams(params)
                  next.set("ratio", value)
                  router.replace(`/valuation?${next}`, { scroll: false })
                }}
                aria-label="Ratio"
              >
                {VALUATION_RATIOS.map((r) => (
                  <ToggleGroupItem
                    key={r}
                    value={r}
                    className="px-2.5 text-xs"
                    title={`Price against ${RATIOS[r].fundamental}`}
                  >
                    {RATIOS[r].label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                spacing={0}
                // A start date from a link shows no range as picked.
                value={from ? "" : range}
                // Clicking the active range reports "", which still means "reset to this range".
                onValueChange={(value) => {
                  setViewKey((k) => k + 1)
                  if (value) setRange(value as RangeKey)
                  if (from) {
                    const next = new URLSearchParams(params)
                    next.delete("from")
                    router.replace(`/valuation?${next}`, { scroll: false })
                  }
                }}
                aria-label="Time range"
              >
                {RANGES.map((r) => (
                  <ToggleGroupItem key={r} value={r} className="px-2.5 text-xs tabular-nums">
                    {r}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {ratio === "pe" && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">EPS</span>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    size="sm"
                    spacing={0}
                    value={basis}
                    onValueChange={(value) => value && setBasis(value as EarningsBasis)}
                    aria-label="Earnings per share"
                  >
                    {EARNINGS_BASES.map((b) => (
                      <ToggleGroupItem key={b} value={b} className="px-2.5 text-xs" title={BASES[b].hint}>
                        {BASES[b].label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
              )}
            </div>
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
                  `${copy.label} drivers`
                )}
              </CardTitle>
              <CardDescription className="text-xs">
                {!valuation
                  ? `Price, ${measures} from one start date`
                  : view === "change"
                    ? `Change in price, ${measures} since ${formatDate(valuation.start)}`
                    : `Price and ${line.toLowerCase()} in ${currency}, ${copy.label} below, since ${formatDate(valuation.start)}`}
                {valuation?.limitedBy === "reports" && <> · as far back as the {copy.reports} go</>}
                {valuation?.limitedBy === "negative" && <> · {copy.sinceNegative}</>}
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
                  <ToggleGroupItem value="value" className="px-2.5 text-xs" title={`Price and ${copy.fundamental} in ${currency ?? "the trading currency"}`}>
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
                      <Loader2Icon className="size-4 animate-spin" /> Loading prices and {copy.reports}
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
                  <CardTitle>What moved {copy.label}</CardTitle>
                  <CardDescription className="text-foreground">{verdict(valuation.attribution, copy)}</CardDescription>
                </CardHeader>
                <CardContent className="px-0">
                  <DriversTable rows={rows} start={valuation.start} end={valuation.end} names={copy} />
                </CardContent>
              </Card>
              <p className="px-1 text-xs leading-relaxed text-muted-foreground">
                {ratio === "pbv" ? (
                  <>
                    Book value per share comes from {valuation.reports.length}{" "}
                    {valuation.reports.length === 1 ? "balance sheet" : "balance sheets"} in this period, the latest
                    dated <span className="text-foreground">{formatDate(valuation.reports.at(-1)!)}</span>. It steps
                    on each balance-sheet date, though companies publish weeks later, and the source keeps only about
                    four year-ends and the latest quarters.
                  </>
                ) : (
                  <>
                    Earnings per share is net income for the 12 months to a report date, over the shares outstanding,
                    so it can sit a little off the EPS a company reports. It comes from {valuation.reports.length}{" "}
                    {valuation.reports.length === 1 ? "report date" : "report dates"} in this period, the latest{" "}
                    <span className="text-foreground">{formatDate(valuation.reports.at(-1)!)}</span>, and steps on
                    each, though companies publish weeks later. The source keeps about four year-ends and the
                    quarter-ends of the last three years, fewer for a company where its own figures disagree.
                  </>
                )}{" "}
                {ratio === "pe" && BASES[basis].note}
                {reportingCurrency &&
                  `The accounts are in ${reportingCurrency}, converted at each day's rate, so currency moves change ${copy.fundamental} too. `}
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
                          href={valuationHref(stock.symbol, ratio)}
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
            A low {copy.label} can mean the price fell or {copy.cheaper}. The chart puts both next to the ratio, from
            the same start date, so you can see which one it was.
          </p>
        </aside>
      </main>

      <SymbolSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="Find a stock"
        stocksOnly
        onSelect={(instrument) => {
          if (instrument.kind === "ticker") router.push(valuationHref(instrument.symbol, ratio))
        }}
      />
    </AppShell>
  )
}
