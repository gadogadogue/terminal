"use client"

import Link from "next/link"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { verdict } from "@/components/valuation/drivers-table"
import { FALL_COLUMNS, fallCause, type Fall, type FallColumn, type FallRow, type FallScreen } from "@/lib/analytics/pbv-fall"
import { formatAmount, formatDate, formatRatio, formatShortDate, formatShortPercent, signClass } from "@/lib/format"
import { valuationHref } from "@/lib/instruments"
import type { StockSnapshot } from "@/lib/providers/types"
import { cn } from "@/lib/utils"
import { CAUSE_LABELS } from "./fall-filters"
import { AddCell, SortHead, StockCell } from "./results-table"

/** Add, stock, the fall's columns, and value traded. */
const COLUMNS = 3 + FALL_COLUMNS.length

const NAMES = { label: "P/BV", fundamental: "book value" }

/** The bar in the cause column needs saying in its header. */
const hintFor = (column: FallColumn) =>
  column.key === "priceShare" ? `${column.hint} The bar shows the price's part dark and book value's light.` : column.hint

export function FallsTable({
  rows,
  loading,
  sort,
  onSort,
  isListed,
  onAdd,
  empty,
}: {
  rows: FallRow[]
  loading: boolean
  sort: FallScreen["sort"]
  onSort: (sort: FallScreen["sort"]) => void
  /** Whether a symbol is already in the watchlist or benchmarks. */
  isListed: (symbol: string) => boolean
  onAdd: (stock: StockSnapshot) => void
  /** Shown when nothing fell through the mark. */
  empty: React.ReactNode
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-8 pl-3">
            <span className="sr-only">Add to watchlist</span>
          </TableHead>
          <SortHead label="Stock" hint="Ticker" sortKey="symbol" firstDir="asc" sort={sort} onSort={onSort} />
          {FALL_COLUMNS.map((column) => (
            <SortHead
              key={column.key}
              label={column.label}
              hint={hintFor(column)}
              sortKey={column.key}
              firstDir={column.firstSort}
              sort={sort}
              onSort={onSort}
              align={column.key === "priceShare" ? "left" : "right"}
            />
          ))}
          <TableHead className="pr-4 text-right text-muted-foreground">
            <span title="Average value traded per day over 3 months, a liquidity check">Value/day</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading &&
          Array.from({ length: 8 }, (_, i) => (
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
        {!loading &&
          rows.map((row) => (
            <FallRowView key={row.stock.symbol} row={row} listed={isListed(row.stock.symbol)} onAdd={onAdd} />
          ))}
      </TableBody>
    </Table>
  )
}

function FallRowView({
  row,
  listed,
  onAdd,
}: {
  row: FallRow
  listed: boolean
  onAdd: (stock: StockSnapshot) => void
}) {
  const { stock, fall, metrics } = row
  const { high, now, attribution } = fall
  const pbv = formatRatio(now.pbv)
  return (
    <TableRow>
      <AddCell stock={stock} listed={listed} onAdd={onAdd} />
      <StockCell stock={stock} />
      <TableCell className="text-right tabular-nums">
        <Link
          href={valuationHref(stock.symbol, "pbv", high.time)}
          title={`P/BV on ${formatDate(now.time)}. See the price and book value from the high.`}
          aria-label={`What moved ${stock.symbol}'s P/BV since ${formatDate(high.time)}`}
          className="rounded-sm underline decoration-muted-foreground/50 decoration-dotted underline-offset-4 hover:decoration-foreground hover:decoration-solid"
        >
          {stock.reportingCurrency ? (
            <span title={`Book value is reported in ${stock.reportingCurrency} and converted at each day's rate.`}>
              <span className="text-muted-foreground">≈</span>
              {pbv}
            </span>
          ) : (
            pbv
          )}
        </Link>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-col items-end leading-tight">
          <span className="tabular-nums">{formatRatio(high.pbv)}</span>
          <span className="text-xs text-muted-foreground tabular-nums">{formatShortDate(high.time, now.time)}</span>
        </div>
      </TableCell>
      <TableCell className={cn("text-right tabular-nums", signClass(attribution.ratio))}>
        {formatShortPercent(attribution.ratio, true)}
      </TableCell>
      <TableCell className="text-right tabular-nums">{formatShortDate(fall.crossed, now.time)}</TableCell>
      <TableCell className={cn("text-right tabular-nums", signClass(attribution.price))}>
        {formatShortPercent(attribution.price, true)}
      </TableCell>
      <TableCell className={cn("text-right tabular-nums", signClass(attribution.fundamental))}>
        {formatShortPercent(attribution.fundamental, true)}
      </TableCell>
      <CauseCell fall={fall} />
      <TableCell className="pr-4 text-right text-muted-foreground tabular-nums">
        {formatAmount(metrics.valueTraded)}
      </TableCell>
    </TableRow>
  )
}

/** What pushed P/BV down, with a bar of the price's share against book value's. */
function CauseCell({ fall: { attribution } }: { fall: Fall }) {
  const cause = fallCause(attribution)
  // Past 0 or 1 one driver worked against the fall; the bar shows the other as all of it.
  const share = attribution.priceShare == null ? null : Math.min(Math.max(attribution.priceShare, 0), 1)
  return (
    <TableCell title={verdict(attribution, NAMES)}>
      <div className="flex items-center gap-2">
        {share != null && (
          <span className="flex h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-muted-foreground/25" aria-hidden>
            <span className="bg-foreground/80" style={{ width: `${share * 100}%` }} />
          </span>
        )}
        <span className="whitespace-nowrap">{cause ? CAUSE_LABELS[cause] : "—"}</span>
      </div>
    </TableCell>
  )
}
