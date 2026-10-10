"use client"

import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, CheckIcon, PlusIcon } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  SCREEN_METRICS,
  type Screen,
  type ScreenMetric,
  type ScreenRow,
  type SortDir,
  type SortKey,
} from "@/lib/analytics/screener"
import { formatAmount, formatPrice, formatRatio, formatShortPercent, signClass } from "@/lib/format"
import { valuationHref } from "@/lib/instruments"
import type { StockSnapshot } from "@/lib/providers/types"
import { cn } from "@/lib/utils"

const PAGE = 100
const COLUMNS = 4 + SCREEN_METRICS.length

/** Metrics that divide by book value, which may have been converted. */
const BOOK_BASED = new Set<string>(["pbv", "roe"])

const isSigned = (metric: ScreenMetric) => "signed" in metric && metric.signed

function formatMetric(value: number | null, metric: ScreenMetric): string {
  switch (metric.unit) {
    case "ratio":
      return formatRatio(value)
    case "amount":
      return formatAmount(value)
    case "percent":
      return formatShortPercent(value, isSigned(metric))
  }
}

export function ResultsTable({
  rows,
  loading,
  sort,
  onSort,
  isListed,
  onAdd,
  empty,
}: {
  rows: ScreenRow[]
  loading: boolean
  sort: Screen["sort"]
  onSort: (sort: Screen["sort"]) => void
  /** Whether a symbol is already in the watchlist or benchmarks. */
  isListed: (symbol: string) => boolean
  onAdd: (stock: StockSnapshot) => void
  /** Shown when nothing passes the filters. */
  empty: React.ReactNode
}) {
  const [limit, setLimit] = useState(PAGE)
  const shown = rows.slice(0, limit)

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-8 pl-3">
              <span className="sr-only">Add to watchlist</span>
            </TableHead>
            <SortHead label="Stock" hint="Ticker" sortKey="symbol" firstDir="asc" sort={sort} onSort={onSort} />
            <TableHead className="hidden text-muted-foreground 2xl:table-cell">Sector</TableHead>
            <TableHead className="text-right text-muted-foreground">Price</TableHead>
            {SCREEN_METRICS.map((metric) => (
              <SortHead
                key={metric.key}
                label={metric.label}
                hint={metric.hint}
                sortKey={metric.key}
                firstDir={metric.firstSort}
                sort={sort}
                onSort={onSort}
                align="right"
              />
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading &&
            Array.from({ length: 12 }, (_, i) => (
              <TableRow key={i} className="hover:bg-transparent">
                <TableCell colSpan={COLUMNS} className="px-3 py-3">
                  <div className="h-4 animate-pulse rounded bg-muted" />
                </TableCell>
              </TableRow>
            ))}
          {!loading && rows.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={COLUMNS} className="py-10 text-center text-muted-foreground">
                {empty}
              </TableCell>
            </TableRow>
          )}
          {shown.map((row) => (
            <ResultRow key={row.stock.symbol} row={row} listed={isListed(row.stock.symbol)} onAdd={onAdd} />
          ))}
        </TableBody>
      </Table>
      {rows.length > limit && (
        <div className="flex items-center justify-center gap-3 border-t p-3 text-xs text-muted-foreground">
          Showing {limit} of {rows.length}
          <Button variant="outline" size="sm" onClick={() => setLimit((n) => n + PAGE)}>
            Show {Math.min(PAGE, rows.length - limit)} more
          </Button>
        </div>
      )}
    </>
  )
}

function SortHead({
  label,
  hint,
  sortKey,
  firstDir,
  sort,
  onSort,
  align = "left",
}: {
  label: string
  hint: string
  sortKey: SortKey
  firstDir: SortDir
  sort: Screen["sort"]
  onSort: (sort: Screen["sort"]) => void
  align?: "left" | "right"
}) {
  const active = sort.key === sortKey
  const Icon = !active ? ArrowUpDownIcon : sort.dir === "desc" ? ArrowDownIcon : ArrowUpIcon
  return (
    <TableHead
      className={cn(align === "right" && "text-right", "last:pr-4")}
      aria-sort={active ? (sort.dir === "desc" ? "descending" : "ascending") : "none"}
    >
      <button
        type="button"
        title={hint}
        onClick={() =>
          onSort(active ? { key: sortKey, dir: sort.dir === "asc" ? "desc" : "asc" } : { key: sortKey, dir: firstDir })
        }
        className={cn(
          "inline-flex items-center gap-1 rounded-md hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        <Icon className={cn("size-3", !active && "opacity-40")} />
      </button>
    </TableHead>
  )
}

function ResultRow({
  row,
  listed,
  onAdd,
}: {
  row: ScreenRow
  listed: boolean
  onAdd: (stock: StockSnapshot) => void
}) {
  const { stock, metrics } = row
  return (
    <TableRow>
      <TableCell className="pl-3">
        {listed ? (
          <span className="flex size-6 items-center justify-center text-muted-foreground" title="In your lists">
            <CheckIcon className="size-3.5" aria-label="In your lists" />
          </span>
        ) : (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onAdd(stock)}
            title="Add to watchlist"
            aria-label={`Add ${stock.symbol} to watchlist`}
          >
            <PlusIcon />
          </Button>
        )}
      </TableCell>
      <TableCell className="max-w-48">
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="font-medium">{stock.symbol}</span>
          <span className="truncate text-xs text-muted-foreground" title={[stock.name, stock.sector].filter(Boolean).join(" · ")}>
            {stock.name}
          </span>
        </div>
      </TableCell>
      <TableCell className="hidden max-w-40 truncate text-xs text-muted-foreground 2xl:table-cell">
        {stock.sector ?? "—"}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-col items-end leading-tight">
          <span className="tabular-nums">{formatPrice(stock.price, stock.currency)}</span>
          <span className={cn("text-xs tabular-nums", signClass(stock.change))}>
            {formatShortPercent(stock.change, true)}
          </span>
        </div>
      </TableCell>
      {SCREEN_METRICS.map((metric) => {
        const value = metrics[metric.key]
        const converted = stock.reportingCurrency && value != null && BOOK_BASED.has(metric.key)
        const text = converted ? (
          <span
            title={`Book value is reported in ${stock.reportingCurrency} and converted at the latest rate. The source rounds it, so this is approximate.`}
          >
            <span className="text-muted-foreground">≈</span>
            {formatMetric(value, metric)}
          </span>
        ) : (
          formatMetric(value, metric)
        )
        return (
          <TableCell
            key={metric.key}
            className={cn("text-right tabular-nums last:pr-4", isSigned(metric) && signClass(value))}
          >
            {metric.key === "pbv" && value != null ? (
              <Link
                href={valuationHref(stock.symbol)}
                title={converted ? undefined : "See whether the price or book value moved it"}
                aria-label={`What moved ${stock.symbol}'s P/BV`}
                className="rounded-sm underline decoration-muted-foreground/50 decoration-dotted underline-offset-4 hover:decoration-foreground hover:decoration-solid"
              >
                {text}
              </Link>
            ) : (
              text
            )}
          </TableCell>
        )
      })}
    </TableRow>
  )
}
