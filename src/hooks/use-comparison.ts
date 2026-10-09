"use client"

import { useQueries, type UseQueryResult } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { buildComparison, type Comparison, type ComparisonInput } from "@/lib/analytics/comparison"
import { fxSymbol } from "@/lib/currency"
import type { PriceHistory } from "@/lib/providers/types"
import { fetchRangeFor } from "@/lib/ranges"
import { plottedItems, type PlottedItem, type Workspace } from "@/lib/workspace"
import { historyQuery } from "./use-history"

export type SeriesStatus = { state: "loading" } | { state: "error"; message: string } | { state: "ready" }

export interface ComparisonState {
  items: PlottedItem[]
  comparison: Comparison
  /** Names reported by the provider, keyed by instrument key. */
  names: Record<string, string>
  /** Native currency of each ticker, keyed by instrument key. */
  currencies: Record<string, string>
  status: Record<string, SeriesStatus>
  /** True while anything is loading; the previous result stays on screen. */
  updating: boolean
}

// Defined once so useQueries can keep the combined result referentially stable.
function combine(results: UseQueryResult<PriceHistory, Error>[]) {
  return {
    data: results.map((r) => r.data),
    errors: results.map((r) => r.error),
    busy: results.some((r) => r.isPending || r.isPlaceholderData),
  }
}

const unique = <T,>(values: T[]) => [...new Set(values)]

export function useComparison(workspace: Workspace): ComparisonState {
  const { baseCurrency, range } = workspace
  const fetchRange = fetchRangeFor(range)
  const items = useMemo(() => plottedItems(workspace), [workspace])

  const symbols = unique(items.flatMap(({ instrument: i }) => (i.kind === "ticker" ? [i.symbol] : [])))
  const histories = useQueries({ queries: symbols.map((s) => historyQuery(s, fetchRange)), combine })

  // FX needs are only known once each ticker reports its currency.
  const historyOf = (symbol: string) => histories.data[symbols.indexOf(symbol)]
  const currencies = unique(
    items.flatMap(({ instrument: i }) => {
      if (i.kind === "cash") return [i.currency]
      if (i.kind === "ticker") return historyOf(i.symbol)?.currency ?? []
      return []
    }),
  ).filter((c) => c !== baseCurrency)
  const fx = useQueries({
    queries: currencies.map((c) => historyQuery(fxSymbol(c, baseCurrency), fetchRange)),
    combine,
  })

  const derived = useMemo(() => {
    const names: Record<string, string> = {}
    const nativeCurrency: Record<string, string> = {}
    const status: Record<string, SeriesStatus> = {}
    const inputs: ComparisonInput[] = []

    const fxFor = (currency: string) => {
      const i = currencies.indexOf(currency)
      return { points: fx.data[i]?.points, error: fx.errors[i] }
    }

    for (const { key, instrument } of items) {
      if (instrument.kind === "fixed" || (instrument.kind === "cash" && instrument.currency === baseCurrency)) {
        inputs.push({ key, instrument })
        status[key] = { state: "ready" }
        continue
      }
      if (instrument.kind === "cash") {
        const rate = fxFor(instrument.currency)
        status[key] = rate.error ? { state: "error", message: rate.error.message } : rate.points ? { state: "ready" } : { state: "loading" }
        inputs.push({ key, instrument, fx: rate.points })
        continue
      }
      const i = symbols.indexOf(instrument.symbol)
      const history = histories.data[i]
      const error = histories.errors[i]
      if (history) {
        names[key] = history.name
        nativeCurrency[key] = history.currency
      }
      const rate = history && history.currency !== baseCurrency ? fxFor(history.currency) : null
      if (error) status[key] = { state: "error", message: error.message }
      else if (rate?.error) status[key] = { state: "error", message: `No ${history!.currency}/${baseCurrency} rate: ${rate.error.message}` }
      else if (!history || (rate && !rate.points)) status[key] = { state: "loading" }
      else status[key] = { state: "ready" }
      inputs.push({ key, instrument, history, fx: rate ? rate.points : null })
    }

    const comparison = buildComparison(inputs, { baseCurrency, range })
    return { names, currencies: nativeCurrency, status, comparison }
    // `currencies` and `symbols` are derived from the same inputs listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, histories, fx, baseCurrency, range])

  const updating = histories.busy || fx.busy

  // Hold the last settled result while new data loads, so the chart keeps its
  // frame instead of flashing partial series.
  const [settled, setSettled] = useState(derived)
  if (!updating && settled !== derived) setSettled(derived)
  const shown = updating && settled.comparison.series.length > 0 ? settled : derived

  // Never draw a series that was unplotted in the meantime.
  const comparison = useMemo(() => {
    const keys = new Set(items.map((i) => i.key))
    const series = shown.comparison.series.filter((s) => keys.has(s.key))
    return series.length === shown.comparison.series.length ? shown.comparison : { ...shown.comparison, series }
  }, [items, shown])

  return {
    items,
    comparison,
    names: { ...shown.names, ...derived.names },
    currencies: { ...shown.currencies, ...derived.currencies },
    status: derived.status,
    updating,
  }
}
