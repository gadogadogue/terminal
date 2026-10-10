import type { PricePoint } from "@/lib/providers/types"

const DAY_MS = 86_400_000

export function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS
}

/**
 * Combines each point with the `other` value of the same day, or the most
 * recent earlier one, since two series rarely share every date. Points
 * before `other` begins are dropped.
 */
export function withLatest(
  points: PricePoint[],
  other: PricePoint[],
  combine: (value: number, latest: number) => number,
): PricePoint[] {
  const out: PricePoint[] = []
  let j = -1
  for (const p of points) {
    while (j + 1 < other.length && other[j + 1].time <= p.time) j++
    if (j >= 0) out.push({ time: p.time, value: combine(p.value, other[j].value) })
  }
  return out
}

/**
 * Converts a price series into another currency. `fx` holds the value of one
 * unit of the series currency in the target currency (e.g. USDIDR for a USD
 * asset viewed in IDR). Each point uses the FX rate of the same day, or the
 * most recent earlier one; points before the FX history begins are dropped.
 */
export function convertCurrency(points: PricePoint[], fx: PricePoint[] | null): PricePoint[] {
  if (!fx) return points
  return withLatest(points, fx, (value, rate) => value * rate)
}

export function clipFrom(points: PricePoint[], start: string): PricePoint[] {
  const i = points.findIndex((p) => p.time >= start)
  return i === -1 ? [] : i === 0 ? points : points.slice(i)
}

/** Monday–Friday dates from `start` to `end`, inclusive. */
export function weekdays(start: string, end: string): string[] {
  const out: string[] = []
  const last = Date.parse(`${end}T00:00:00Z`)
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= last; t += DAY_MS) {
    const day = new Date(t).getUTCDay()
    if (day !== 0 && day !== 6) out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

/**
 * Growth of 1 at `ratePct` % per year. Interest is spread evenly across the
 * given dates rather than by calendar day, so weekends don't make Mondays
 * jump: the line is smooth (zero volatility) and ends at the exact
 * compounded value for the calendar span.
 */
export function fixedRateLevels(ratePct: number, dates: string[]): PricePoint[] {
  if (dates.length === 0) return []
  const growth = 1 + ratePct / 100
  const years = daysBetween(dates[0], dates[dates.length - 1]) / 365.25
  const step = dates.length > 1 ? years / (dates.length - 1) : 0
  return dates.map((time, i) => ({ time, value: Math.pow(growth, i * step) }))
}

export function flatLevels(dates: string[]): PricePoint[] {
  return dates.map((time) => ({ time, value: 1 }))
}

/** Percent change from the first point: 0 at the start, 12.5 for +12.5%. */
export function percentChange(levels: PricePoint[]): PricePoint[] {
  if (levels.length === 0) return []
  const base = levels[0].value
  return levels.map((p) => ({ time: p.time, value: (p.value / base - 1) * 100 }))
}

export interface Metrics {
  start: string
  end: string
  /** Fractions, not percents: 0.125 means +12.5%. */
  totalReturn: number
  /** Annualized return; null for spans under ~1 year, where it misleads. */
  cagr: number | null
  /** Annualized standard deviation of log returns. */
  volatility: number | null
  /** Worst peak-to-trough decline, as a negative fraction (or 0). */
  maxDrawdown: number
}

export function computeMetrics(levels: PricePoint[]): Metrics | null {
  if (levels.length < 2) return null
  const first = levels[0]
  const last = levels[levels.length - 1]
  const years = daysBetween(first.time, last.time) / 365.25
  const ratio = last.value / first.value

  let n = 0
  let mean = 0
  let m2 = 0
  let peak = first.value
  let maxDrawdown = 0
  for (let i = 1; i < levels.length; i++) {
    const r = Math.log(levels[i].value / levels[i - 1].value)
    n++
    const delta = r - mean
    mean += delta / n
    m2 += delta * (r - mean)
    peak = Math.max(peak, levels[i].value)
    maxDrawdown = Math.min(maxDrawdown, levels[i].value / peak - 1)
  }
  // Observations per year come from the data itself, so daily (~252) and
  // weekly (~52) series both annualize correctly.
  const perYear = years > 0 ? n / years : 0
  const volatility = n >= 2 && perYear > 0 ? Math.sqrt((m2 / (n - 1)) * perYear) : null

  return {
    start: first.time,
    end: last.time,
    totalReturn: ratio - 1,
    cagr: years >= 0.9 ? Math.pow(ratio, 1 / years) - 1 : null,
    volatility,
    maxDrawdown,
  }
}
