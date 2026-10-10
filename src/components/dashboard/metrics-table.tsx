"use client"

import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react"
import { useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { SeriesStatus } from "@/hooks/use-comparison"
import type { Metrics } from "@/lib/analytics/series"
import type { LineDash } from "@/lib/instruments"
import { formatPercent, signClass } from "@/lib/format"
import { cn } from "@/lib/utils"
import { LineKey } from "./line-key"

export interface MetricsRow {
  key: string
  label: string
  code: string
  color: string
  dash: LineDash
  metrics: Metrics | null
  status: SeriesStatus
}

type SortKey = "totalReturn" | "cagr" | "volatility" | "maxDrawdown"

const COLUMNS: { key: SortKey; label: string; hint: string; signed: boolean }[] = [
  { key: "totalReturn", label: "Return", hint: "Total return over the period", signed: true },
  { key: "cagr", label: "CAGR", hint: "Compound annual growth rate", signed: true },
  { key: "volatility", label: "Volatility", hint: "Annualized standard deviation of returns", signed: false },
  { key: "maxDrawdown", label: "Max drawdown", hint: "Worst fall from a previous peak", signed: true },
]

export function MetricsTable({ rows, stale }: { rows: MetricsRow[]; stale: boolean }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null)

  const sorted = sort
    ? [...rows].sort((a, b) => {
        const av = a.metrics?.[sort.key]
        const bv = b.metrics?.[sort.key]
        if (av == null) return 1
        if (bv == null) return -1
        return (av - bv) * sort.dir
      })
    : rows

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s?.key !== key ? { key, dir: -1 } : s.dir === -1 ? { key, dir: 1 } : null))

  return (
    <Table className={cn("transition-opacity", stale && "opacity-50")}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-4">Series</TableHead>
          {COLUMNS.map((col) => {
            const active = sort?.key === col.key
            const Icon = !active ? ArrowUpDownIcon : sort.dir === -1 ? ArrowDownIcon : ArrowUpIcon
            return (
              <TableHead
                key={col.key}
                className="text-right last:pr-4"
                aria-sort={active ? (sort.dir === -1 ? "descending" : "ascending") : "none"}
              >
                <button
                  type="button"
                  title={col.hint}
                  onClick={() => toggleSort(col.key)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md hover:text-foreground",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {col.label}
                  <Icon className={cn("size-3", !active && "opacity-40")} />
                </button>
              </TableHead>
            )
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.length === 0 && (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
              Tick items in your watchlist or benchmarks to compare them.
            </TableCell>
          </TableRow>
        )}
        {sorted.map((row) => (
          <TableRow key={row.key}>
            <TableCell className="max-w-64 pl-4">
              <div className="flex items-center gap-2">
                <LineKey color={row.color} dash={row.dash} className="shrink-0" />
                <span className="truncate font-medium">{row.label}</span>
                {row.label !== row.code && (
                  <span className="hidden truncate text-xs text-muted-foreground sm:inline">{row.code}</span>
                )}
              </div>
            </TableCell>
            {row.status.state === "error" ? (
              <TableCell colSpan={4} className="pr-4 text-right text-xs text-negative">
                {row.status.message}
              </TableCell>
            ) : (
              COLUMNS.map((col) => {
                const value = row.metrics?.[col.key]
                return (
                  <TableCell
                    key={col.key}
                    className={cn("text-right tabular-nums last:pr-4", col.signed ? signClass(value) : "")}
                  >
                    {row.status.state === "loading" && !row.metrics ? (
                      <span className="inline-block h-3 w-12 animate-pulse rounded bg-muted align-middle" />
                    ) : col.key === "volatility" ? (
                      formatPercent(value).replace("+", "")
                    ) : (
                      formatPercent(value)
                    )}
                  </TableCell>
                )
              })
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
