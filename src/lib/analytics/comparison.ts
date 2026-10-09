import type { Instrument } from "@/lib/instruments"
import type { PriceHistory, PricePoint } from "@/lib/providers/types"
import { rangeStart, todayISO, type RangeKey } from "@/lib/ranges"
import {
  clipFrom,
  computeMetrics,
  convertCurrency,
  daysBetween,
  fixedRateLevels,
  flatLevels,
  percentChange,
  weekdays,
  type Metrics,
} from "./series"

export interface ComparisonInput {
  key: string
  instrument: Instrument
  /** Native-currency history, for ticker instruments. */
  history?: PriceHistory
  /**
   * Value of one unit of the native currency in the base currency. Null when
   * no conversion is needed; undefined while it is still loading.
   */
  fx?: PricePoint[] | null
}

export interface ComparisonSeries {
  key: string
  /** Values in the base currency, from the common start date. */
  levels: PricePoint[]
  /** Percent change from the common start date. */
  change: PricePoint[]
  metrics: Metrics | null
}

export interface Comparison {
  start: string
  end: string
  /** Key of the series whose history is shorter than the range, if any. */
  limitedBy: string | null
  series: ComparisonSeries[]
}

/**
 * Puts every series on the same footing: one currency, one start date, and
 * percent change from that date. Series whose inputs are not ready yet are
 * left out rather than shown wrong.
 */
export function buildComparison(
  inputs: ComparisonInput[],
  options: { baseCurrency: string; range: RangeKey; today?: Date },
): Comparison {
  const { baseCurrency, range, today = new Date() } = options
  const requestedStart = rangeStart(range, today)
  const end = todayISO(today)

  // 1. Market-driven series, converted to the base currency.
  const market = new Map<string, PricePoint[]>()
  for (const { key, instrument, history, fx } of inputs) {
    let points: PricePoint[] | null = null
    if (instrument.kind === "ticker" && history) {
      if (history.currency === baseCurrency) points = history.points
      else if (fx) points = convertCurrency(history.points, fx)
    } else if (instrument.kind === "cash" && instrument.currency !== baseCurrency && fx) {
      points = fx
    }
    if (!points) continue
    const clipped = requestedStart ? clipFrom(points, requestedStart) : points
    if (clipped.length) market.set(key, clipped)
  }

  // 2. Common start: the range start, or later if some series begins later.
  let start = requestedStart ?? ""
  let latest: string | null = null
  for (const [key, points] of market) {
    if (points[0].time > start) {
      start = points[0].time
      latest = key
    }
  }
  if (!start) {
    // MAX with only synthetic series: show ten years.
    const d = new Date(`${end}T00:00:00Z`)
    d.setUTCFullYear(d.getUTCFullYear() - 10)
    start = d.toISOString().slice(0, 10)
  }
  // A few days of slack covers weekends and holidays at the range start.
  const limitedBy = latest && (!requestedStart || daysBetween(requestedStart, start) > 7) ? latest : null

  // 3. Align everything to the common start and derive change and metrics.
  const dates = weekdays(start, end)
  const series: ComparisonSeries[] = []
  for (const { key, instrument } of inputs) {
    let levels: PricePoint[] | null = null
    const points = market.get(key)
    if (points) levels = clipFrom(points, start)
    else if (instrument.kind === "fixed") levels = fixedRateLevels(instrument.rate, dates)
    else if (instrument.kind === "cash" && instrument.currency === baseCurrency) levels = flatLevels(dates)
    if (!levels) continue
    series.push({ key, levels, change: percentChange(levels), metrics: computeMetrics(levels) })
  }

  return { start, end, limitedBy, series }
}
