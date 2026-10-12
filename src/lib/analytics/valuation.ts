import type { PricePoint } from "@/lib/providers/types"
import { rangeStart, type RangeKey } from "@/lib/ranges"
import { clipFrom, convertCurrency, daysBetween, percentChange, withLatest } from "./series"

/**
 * A price ratio over time, split into its two drivers. P/BV is price over
 * book value per share and P/E is price over earnings per share, so either
 * falls when the price drops and when the figure under it grows. Putting all
 * three on one start date shows which of the two it was.
 */

export interface ValuationInput {
  /** Closes without dividends folded in, in the trading currency. */
  price: PricePoint[]
  /** What the price is divided by, per share at each report date, in the currency of the accounts. */
  fundamental: PricePoint[]
  /** Value of one unit of the accounts' currency in the trading currency; null when they match. */
  fx: PricePoint[] | null
}

export interface ValuationSeries {
  /** Values in the trading currency (a plain multiple for the ratio). */
  levels: PricePoint[]
  /** Percent change from the start date. */
  change: PricePoint[]
}

/** What moved the ratio. "both" means price and the fundamental pushed it the same way. */
export type Driver = "price" | "fundamental" | "both" | "none"

export interface Attribution {
  /** Changes over the period as fractions: -0.2 is a 20% fall. */
  price: number
  fundamental: number
  ratio: number
  /**
   * What the fundamental alone would have done to the ratio: growth pulls it
   * down. Price moves it one for one, and the two compound to `ratio`.
   */
  fundamentalEffect: number
  /**
   * Share of the ratio's move that came from price, the rest being the
   * fundamental, measured in logs so the two add up. Outside 0–1 when they
   * pulled in opposite directions; null when the ratio barely moved.
   */
  priceShare: number | null
  driver: Driver
}

export interface Valuation {
  start: string
  end: string
  /**
   * What makes the period start later than the range asked for, if anything:
   * the price history, the reports, or a report with nothing positive to
   * divide the price by (negative equity, a loss).
   */
  limitedBy: "price" | "reports" | "negative" | null
  price: ValuationSeries
  fundamental: ValuationSeries
  ratio: ValuationSeries
  /** Report dates the fundamental line is drawn from, oldest first. */
  reports: string[]
  attribution: Attribution
}

/**
 * Ways to state the earnings per share under a P/E. "trailing" is the 12
 * months to each report and "annual" keeps full fiscal years only. The
 * averages smooth those: "average1y" the trailing figures reported over the
 * past year, "average3y" three fiscal years in a row.
 */
export const EARNINGS_BASES = ["trailing", "annual", "average1y", "average3y"] as const
export type EarningsBasis = (typeof EARNINGS_BASES)[number]

const mean = (points: PricePoint[]) => points.reduce((sum, p) => sum + p.value, 0) / points.length

/**
 * Restates trailing 12-month earnings per share on another basis. `yearEnds`
 * are the dates in `points` that close a fiscal year.
 */
export function earningsOn(basis: EarningsBasis, points: PricePoint[], yearEnds: string[]): PricePoint[] {
  if (basis === "trailing") return points
  if (basis === "average1y") {
    // The same quarter a year earlier is 365 or 366 days back, and stays out.
    return points.map((p, i) => ({
      time: p.time,
      value: mean(points.slice(0, i + 1).filter((earlier) => daysBetween(earlier.time, p.time) < 365)),
    }))
  }
  const years = points.filter((p) => yearEnds.includes(p.time))
  if (basis === "annual") return years
  return years.flatMap((p, i) => {
    const last3 = years.slice(Math.max(i - 2, 0), i + 1)
    // Three years in a row end two years apart; a gap in the reports makes it more.
    return last3.length === 3 && daysBetween(last3[0].time, p.time) < 800 ? [{ time: p.time, value: mean(last3) }] : []
  })
}

/** Under half a percent, the ratio is where it started and shares of the move are noise. */
const FLAT = 0.005

/** Splits a ratio's move between a price change and a change in the fundamental, both fractions. */
export function attributeChange(price: number, fundamental: number): Attribution {
  const ratio = (1 + price) / (1 + fundamental) - 1
  const fundamentalEffect = 1 / (1 + fundamental) - 1
  if (Math.abs(ratio) < FLAT) {
    return { price, fundamental, ratio, fundamentalEffect, priceShare: null, driver: "none" }
  }
  // Summing the two logs, not taking the log of `ratio`, keeps the share at
  // exactly 1 or 0 when one of them did not move.
  const fromPrice = Math.log1p(price)
  const priceShare = fromPrice / (fromPrice - Math.log1p(fundamental))
  const driver = priceShare >= 1 ? "price" : priceShare <= 0 ? "fundamental" : "both"
  return { price, fundamental, ratio, fundamentalEffect, priceShare, driver }
}

const series = (levels: PricePoint[]): ValuationSeries => ({ levels, change: percentChange(levels) })

const totalChange = (levels: PricePoint[]) => levels[levels.length - 1].value / levels[0].value - 1

/**
 * Lines price, the fundamental and their ratio up on the trading days of a
 * range. Returns null when there is nothing to compare: no report with a
 * positive figure, or under two trading days since.
 */
export function buildValuation(input: ValuationInput, options: { range: RangeKey; today?: Date }): Valuation | null {
  // A ratio over zero or less means nothing, and neither does a percent
  // change from it, so start after the last such report.
  const firstPositive = input.fundamental.findLastIndex((p) => !(p.value > 0)) + 1
  const reports = input.fundamental.slice(firstPositive)
  // A figure holds from one report to the next; a foreign reporting currency
  // still moves it every day.
  const fundamentalAll = convertCurrency(
    withLatest(input.price, reports, (_, value) => value),
    input.fx,
  )

  const requestedStart = rangeStart(options.range, options.today)
  const fundamental = requestedStart ? clipFrom(fundamentalAll, requestedStart) : fundamentalAll
  if (fundamental.length < 2) return null
  const start = fundamental[0].time
  const end = fundamental[fundamental.length - 1].time
  // The fundamental only exists on trading days, so the two now share every date.
  const price = clipFrom(input.price, start)
  const ratio = price.map((p, i) => ({ time: p.time, value: p.value / fundamental[i].value }))

  // A few days of slack covers weekends and holidays at the range start.
  const late = requestedStart != null && daysBetween(requestedStart, start) > 7
  const limitedBy = !late
    ? null
    : input.price[0].time === start
      ? "price"
      : firstPositive > 0
        ? "negative"
        : "reports"

  const inForce = reports.findLastIndex((r) => r.time <= start)
  return {
    start,
    end,
    limitedBy,
    price: series(price),
    fundamental: series(fundamental),
    ratio: series(ratio),
    reports: reports.slice(Math.max(inForce, 0)).flatMap((r) => (r.time <= end ? [r.time] : [])),
    attribution: attributeChange(totalChange(price), totalChange(fundamental)),
  }
}
