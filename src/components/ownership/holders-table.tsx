"use client"

import Link from "next/link"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { HolderRow } from "@/lib/analytics/ownership"
import type { ChartTheme } from "@/lib/chart-palette"
import { formatAmount, formatDate, formatShare, formatShortPercent, signClass } from "@/lib/format"
import { ownershipHref } from "@/lib/instruments"
import { cn } from "@/lib/utils"
import { holderDetail, stockCode } from "./holder-kinds"
import { HolderMark } from "./holder-mark"

/** One stock's named holders: every link the diagram draws to it, as numbers. */
export function HoldersTable({ rows, currency, theme }: { rows: HolderRow[]; currency: string; theme: ChartTheme }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-4">Holder</TableHead>
          <TableHead className="text-right text-muted-foreground">Held</TableHead>
          <TableHead className="text-right text-muted-foreground">Shares</TableHead>
          <TableHead className="text-right text-muted-foreground">Value ({currency})</TableHead>
          <TableHead className="text-right text-muted-foreground">
            <span title="How much the share count changed since the holder's filing, or the list, before this one">
              Change
            </span>
          </TableHead>
          <TableHead className="text-right text-muted-foreground">Reported</TableHead>
          <TableHead className="pr-4 text-muted-foreground">
            <span title="The other stocks in the diagram that this holder owns">Also holds</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ holder, holding, alsoHolds }) => (
          <TableRow key={holder.id}>
            <TableCell className="pl-4">
              <div className="flex items-center gap-2.5">
                <HolderMark kind={holder.kind} theme={theme} />
                <div className="min-w-0">
                  <div className="max-w-72 truncate font-medium" title={holder.name}>
                    {holder.name}
                  </div>
                  <div className="max-w-72 truncate text-xs text-muted-foreground">
                    {holderDetail(holder.kind, holding)}
                  </div>
                </div>
              </div>
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums">{formatShare(holding.percent)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatAmount(holding.shares)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatAmount(holding.value)}</TableCell>
            <TableCell className={cn("text-right tabular-nums", signClass(holding.change))}>
              {formatShortPercent(holding.change, true)}
            </TableCell>
            <TableCell className="text-right whitespace-nowrap tabular-nums text-muted-foreground">
              {holding.reported ? formatDate(holding.reported) : "—"}
            </TableCell>
            <TableCell className="pr-4">
              {alsoHolds.length === 0 ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <span className="flex flex-wrap gap-x-2">
                  {alsoHolds.map((symbol) => (
                    <Link
                      key={symbol}
                      href={ownershipHref(symbol)}
                      scroll={false}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {stockCode(symbol)}
                    </Link>
                  ))}
                </span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
