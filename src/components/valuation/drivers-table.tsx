"use client"

import { LineKey } from "@/components/dashboard/line-key"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Attribution } from "@/lib/analytics/valuation"
import { formatDate, formatPercent, formatShortPercent, signClass } from "@/lib/format"
import { cn } from "@/lib/utils"

export interface DriverRow {
  key: string
  label: string
  color: string
  /** Formatted values on the first and last day. */
  first: string
  last: string
  /** Change over the period, and what it alone did to P/BV; both fractions. */
  change: number
  effect: number
}

const size = (fraction: number) => formatShortPercent(Math.abs(fraction))

const move = (fraction: number, up: string, down: string) =>
  fraction === 0 ? "did not change" : `${fraction > 0 ? up : down} ${size(fraction)}`

/** One or two sentences answering "was it the price or the book value?". */
export function verdict(a: Attribution): string {
  const price = move(a.price, "rose", "fell")
  const book = move(a.book, "grew", "shrank")
  if (a.driver === "none" || a.priceShare == null) {
    return `P/BV ended about where it started. The price ${price} and book value ${book}.`
  }
  const moved = `P/BV ${a.pbv < 0 ? "fell" : "rose"} ${size(a.pbv)}`
  // A driver working against the move would, alone, have sent P/BV the other way.
  const opposite = `which on its own would have ${a.pbv < 0 ? "raised" : "lowered"} P/BV`
  switch (a.driver) {
    case "both": {
      const share = Math.round(a.priceShare * 100)
      return `${moved}. About ${share}% of that came from the price, which ${price}, and ${100 - share}% from book value, which ${book}.`
    }
    case "price":
      return a.book === 0
        ? `${moved}, all of it from the price. Book value did not change in this period.`
        : `${moved} because the price ${price}. Book value ${book}, ${opposite}.`
    case "book":
      return a.price === 0
        ? `${moved}, all of it from book value, which ${book}. The price ended where it started.`
        : `${moved} because book value ${book}. The price ${price}, ${opposite}.`
  }
}

export function DriversTable({ rows, start, end }: { rows: DriverRow[]; start: string; end: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-4">Series</TableHead>
          <TableHead className="text-right text-muted-foreground">{formatDate(start)}</TableHead>
          <TableHead className="text-right text-muted-foreground">{formatDate(end)}</TableHead>
          <TableHead className="text-right text-muted-foreground">Change</TableHead>
          <TableHead className="pr-4 text-right text-muted-foreground">
            <span title="What this change alone did to P/BV. Price moves it one for one, book value the opposite way, and the two compound to the total.">
              Effect on P/BV
            </span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key}>
            <TableCell className="pl-4">
              <div className="flex items-center gap-2">
                <LineKey color={row.color} className="shrink-0" />
                <span className="font-medium">{row.label}</span>
              </div>
            </TableCell>
            <TableCell className="text-right tabular-nums">{row.first}</TableCell>
            <TableCell className="text-right tabular-nums">{row.last}</TableCell>
            <TableCell className={cn("text-right tabular-nums", signClass(row.change))}>
              {formatPercent(row.change)}
            </TableCell>
            <TableCell className={cn("pr-4 text-right tabular-nums", signClass(row.effect))}>
              {formatPercent(row.effect)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
