"use client"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { ChartTheme } from "@/lib/chart-palette"
import { formatAmount, formatDate, formatShare, signClass } from "@/lib/format"
import type { HolderChange } from "@/lib/providers/types"
import { cn } from "@/lib/utils"
import { holderDetail } from "./holder-kinds"
import { HolderMark } from "./holder-mark"

/** "30 Apr – 29 May 2026": the year is said once when both dates share it. */
function between(from: string, to: string): string {
  const start = formatDate(from)
  const end = formatDate(to)
  return `${from.slice(0, 4) === to.slice(0, 4) ? start.slice(0, -5) : start} – ${end}`
}

/**
 * What holders did between one shareholder register and the next. A register
 * only lists stakes above its threshold, so a holder can also join it or
 * leave it, and then one side of the change is not known: it may have
 * crossed the threshold, or its shares were recorded another way before.
 */
export function ActivityTable({
  changes,
  threshold,
  theme,
}: {
  changes: HolderChange[]
  /** The smallest stake a register lists, as a fraction. */
  threshold: number
  theme: ChartTheme
}) {
  const floor = `${threshold * 100}%`
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-4">Holder</TableHead>
          <TableHead className="text-muted-foreground">
            <span
              title={`A list carries holders above ${floor}. One that joins or leaves it crossed ${floor}, or had its shares recorded another way before.`}
            >
              Action
            </span>
          </TableHead>
          <TableHead className="text-right text-muted-foreground">Shares</TableHead>
          <TableHead className="text-right text-muted-foreground">Holds now</TableHead>
          <TableHead className="text-right text-muted-foreground">Stake</TableHead>
          <TableHead className="pr-4 text-right text-muted-foreground">Between</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {changes.map((change) => {
          const { before, after } = change
          const moved = before && after ? after.shares - before.shares : null
          return (
            <TableRow key={`${change.to} ${change.name}`}>
              <TableCell className="pl-4">
                <div className="flex items-center gap-2.5">
                  <HolderMark kind={change.kind} theme={theme} />
                  <div className="min-w-0">
                    <div className="max-w-72 truncate font-medium" title={change.name}>
                      {change.name}
                    </div>
                    <div className="max-w-72 truncate text-xs text-muted-foreground">{holderDetail(change.kind, change)}</div>
                  </div>
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {moved == null ? (after ? "Joined the list" : "Left the list") : moved > 0 ? "Bought" : "Sold"}
              </TableCell>
              <TableCell className={cn("text-right tabular-nums", signClass(moved))}>
                {moved == null ? "—" : formatAmount(moved, true)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatAmount(after?.shares)}</TableCell>
              <TableCell className="text-right whitespace-nowrap tabular-nums">
                <span className="text-muted-foreground">{before ? formatShare(before.percent) : "not listed"} → </span>
                <span className="font-medium">{after ? formatShare(after.percent) : "not listed"}</span>
              </TableCell>
              <TableCell className="pr-4 text-right whitespace-nowrap tabular-nums text-muted-foreground">
                {between(change.from, change.to)}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
