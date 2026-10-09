"use client"

import { useQuery } from "@tanstack/react-query"
import { CircleAlertIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { SeriesStatus } from "@/hooks/use-comparison"
import { historyQuery } from "@/hooks/use-history"
import { fxSymbol } from "@/lib/currency"
import { formatPercent, formatPrice, signClass } from "@/lib/format"
import {
  instrumentCode,
  instrumentDescription,
  instrumentKey,
  instrumentName,
  lineDashOf,
  type Instrument,
  type InstrumentGroup,
  type LineDash,
} from "@/lib/instruments"
import { cn } from "@/lib/utils"
import { LineKey } from "./line-key"
import { LineStylePicker } from "./line-style-picker"

/** Latest price and one-day change, from the shared 1-year history query. */
function useQuote(instrument: Instrument, baseCurrency: string) {
  const symbol =
    instrument.kind === "ticker"
      ? instrument.symbol
      : instrument.kind === "cash" && instrument.currency !== baseCurrency
        ? fxSymbol(instrument.currency, baseCurrency)
        : null
  const { data, error, isPending } = useQuery({ ...historyQuery(symbol ?? "", "1y"), enabled: symbol != null })
  if (!symbol) return null
  const points = data?.points ?? []
  const n = points.length
  return {
    name: data?.name,
    currency: data?.currency,
    price: points[n - 1]?.value ?? null,
    change: n >= 2 ? points[n - 1].value / points[n - 2].value - 1 : null,
    error,
    loading: isPending,
  }
}

function QuoteCell({ instrument, baseCurrency }: { instrument: Instrument; baseCurrency: string }) {
  const quote = useQuote(instrument, baseCurrency)
  if (!quote) {
    return <span className="text-xs text-muted-foreground">{instrument.kind === "fixed" ? "Synthetic" : "Base"}</span>
  }
  if (quote.loading) return <span className="h-3 w-12 animate-pulse rounded bg-muted" aria-label="Loading" />
  if (quote.error) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2">No data</span>
        </TooltipTrigger>
        <TooltipContent>{quote.error.message}</TooltipContent>
      </Tooltip>
    )
  }
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="text-sm tabular-nums">
        {formatPrice(quote.price, quote.currency)}
        <span className="ml-1 text-[11px] text-muted-foreground">{quote.currency}</span>
      </span>
      <span className={cn("text-xs tabular-nums", signClass(quote.change))}>{formatPercent(quote.change)}</span>
    </div>
  )
}

function InstrumentRow({
  instrument,
  baseCurrency,
  slot,
  dash,
  colorOf,
  slotOwner,
  status,
  onToggle,
  onRemove,
  onColorChange,
  onDashChange,
}: {
  instrument: Instrument
  baseCurrency: string
  /** Palette slot while plotted. */
  slot?: number
  dash: LineDash
  colorOf: (slot: number) => string
  slotOwner: (slot: number) => string | undefined
  status?: SeriesStatus
  onToggle: (key: string) => void
  onRemove: (key: string) => void
  onColorChange: (key: string, slot: number) => void
  onDashChange: (key: string, dash: LineDash) => void
}) {
  const key = instrumentKey(instrument)
  const id = `plot-${key.replace(/[^a-zA-Z0-9-]/g, "_")}`
  const name = instrumentName(instrument)
  return (
    <li className="group/row flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/60">
      <Checkbox id={id} checked={slot != null} onCheckedChange={() => onToggle(key)} />
      {slot != null ? (
        <LineStylePicker
          label={instrumentCode(instrument)}
          slot={slot}
          dash={dash}
          colorOf={colorOf}
          slotOwner={slotOwner}
          onColorChange={(s) => onColorChange(key, s)}
          onDashChange={(d) => onDashChange(key, d)}
        />
      ) : (
        <LineKey className="shrink-0" />
      )}
      <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer items-center">
        <span className="min-w-0">
          <span className="flex items-center gap-1 truncate text-sm font-medium">
            {instrumentCode(instrument)}
            {status?.state === "error" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <CircleAlertIcon className="size-3.5 text-negative" aria-label={status.message} />
                </TooltipTrigger>
                <TooltipContent>{status.message}</TooltipContent>
              </Tooltip>
            )}
          </span>
          <RowDescription instrument={instrument} baseCurrency={baseCurrency} />
        </span>
      </label>
      <QuoteCell instrument={instrument} baseCurrency={baseCurrency} />
      <Button
        variant="ghost"
        size="icon-xs"
        className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
        onClick={() => onRemove(key)}
        aria-label={`Remove ${name}`}
      >
        <XIcon />
      </Button>
    </li>
  )
}

function RowDescription({ instrument, baseCurrency }: { instrument: Instrument; baseCurrency: string }) {
  // Reads the same cached query as the quote cell, for the provider name.
  const quote = useQuote(instrument, baseCurrency)
  const text = instrumentDescription(instrument, baseCurrency, quote?.name)
  return <span className="block truncate text-xs text-muted-foreground">{text || "\u00a0"}</span>
}

export function InstrumentPanel({
  title,
  items,
  group,
  plotted,
  colorOf,
  slotOwner,
  baseCurrency,
  status,
  emptyText,
  action,
  onToggle,
  onRemove,
  onColorChange,
  onDashChange,
}: {
  title: string
  items: Instrument[]
  group: InstrumentGroup
  plotted: Record<string, number>
  colorOf: (slot: number) => string
  /** Code of the plotted series using a slot, across both lists. */
  slotOwner: (slot: number) => string | undefined
  baseCurrency: string
  status: Record<string, SeriesStatus>
  emptyText: string
  action: React.ReactNode
  onToggle: (key: string) => void
  onRemove: (key: string) => void
  onColorChange: (key: string, slot: number) => void
  onDashChange: (key: string, dash: LineDash) => void
}) {
  const plottedCount = items.filter((i) => instrumentKey(i) in plotted).length
  return (
    <Card className="gap-0 rounded-2xl py-0">
      <CardHeader className="border-b px-4 py-3">
        <CardTitle>{title}</CardTitle>
        <CardDescription className="text-xs">
          {items.length} {items.length === 1 ? "item" : "items"} · {plottedCount} plotted
        </CardDescription>
        <CardAction>{action}</CardAction>
      </CardHeader>
      <CardContent className="p-2">
        {items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <ul className="flex flex-col">
            {items.map((instrument) => {
              const key = instrumentKey(instrument)
              return (
                <InstrumentRow
                  key={key}
                  instrument={instrument}
                  baseCurrency={baseCurrency}
                  slot={plotted[key]}
                  dash={lineDashOf(instrument, group)}
                  colorOf={colorOf}
                  slotOwner={slotOwner}
                  status={status[key]}
                  onToggle={onToggle}
                  onRemove={onRemove}
                  onColorChange={onColorChange}
                  onDashChange={onDashChange}
                />
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
