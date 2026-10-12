"use client"

import { LineKey } from "@/components/dashboard/line-key"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Attribution } from "@/lib/analytics/valuation"
import { formatDate, formatPercent, formatShortPercent, signClass } from "@/lib/format"
import { cn } from "@/lib/utils"

/** How a ratio and what its price is divided by read in a sentence: "P/E" and "earnings". */
export interface RatioNames {
  label: string
  fundamental: string
}

export interface DriverRow {
  key: string
  label: string
  color: string
  /** Formatted values on the first and last day. */
  first: string
  last: string
  /** Change over the period, and what it alone did to the ratio; both fractions. */
  change: number
  effect: number
}

const size = (fraction: number) => formatShortPercent(Math.abs(fraction))

const move = (fraction: number, up: string, down: string) =>
  fraction === 0 ? "did not change" : `${fraction > 0 ? up : down} ${size(fraction)}`

const capitalize = (text: string) => text[0].toUpperCase() + text.slice(1)

/** One or two sentences answering "was it the price, or the book value or earnings under it?". */
export function verdict(a: Attribution, { label, fundamental }: RatioNames): string {
  const price = move(a.price, "rose", "fell")
  const under = move(a.fundamental, "grew", "shrank")
  if (a.driver === "none" || a.priceShare == null) {
    return `${label} ended about where it started. The price ${price} and ${fundamental} ${under}.`
  }
  const moved = `${label} ${a.ratio < 0 ? "fell" : "rose"} ${size(a.ratio)}`
  // A driver working against the move would, alone, have sent the ratio the other way.
  const opposite = `which on its own would have ${a.ratio < 0 ? "raised" : "lowered"} ${label}`
  switch (a.driver) {
    case "both": {
      const share = Math.round(a.priceShare * 100)
      return `${moved}. About ${share}% of that came from the price, which ${price}, and ${100 - share}% from ${fundamental}, which ${under}.`
    }
    case "price":
      return a.fundamental === 0
        ? `${moved}, all of it from the price. ${capitalize(fundamental)} did not change in this period.`
        : `${moved} because the price ${price}. ${capitalize(fundamental)} ${under}, ${opposite}.`
    case "fundamental":
      return a.price === 0
        ? `${moved}, all of it from ${fundamental}, which ${under}. The price ended where it started.`
        : `${moved} because ${fundamental} ${under}. The price ${price}, ${opposite}.`
  }
}

export function DriversTable({
  rows,
  start,
  end,
  names: { label, fundamental },
}: {
  rows: DriverRow[]
  start: string
  end: string
  names: RatioNames
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-4">Series</TableHead>
          <TableHead className="text-right text-muted-foreground">{formatDate(start)}</TableHead>
          <TableHead className="text-right text-muted-foreground">{formatDate(end)}</TableHead>
          <TableHead className="text-right text-muted-foreground">Change</TableHead>
          <TableHead className="pr-4 text-right text-muted-foreground">
            <span
              title={`What this change alone did to ${label}. Price moves it one for one, ${fundamental} the opposite way, and the two compound to the total.`}
            >
              Effect on {label}
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
