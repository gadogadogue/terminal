import type { PricePoint } from "@/lib/providers/types"
import { rangeStart, type RangeKey } from "@/lib/ranges"
import { clipFrom, convertCurrency, daysBetween, percentChange, withLatest } from "./series"

/**
 * P/BV over time, split into its two drivers. P/BV is price over book value
 * per share, so it falls when the price drops and when book value grows.
 * Putting all three on one start date shows which of the two it was.
 */

export interface ValuationInput {
  /** Closes without dividends folded in, in the trading currency. */
  price: PricePoint[]
  /** Book value per share at each balance-sheet date, in the currency of the accounts. */
  book: PricePoint[]
  /** Value of one unit of the accounts' currency in the trading currency; null when they match. */
  fx: PricePoint[] | null
}

export interface ValuationSeries {
  /** Values in the trading currency (a plain multiple for P/BV). */
  levels: PricePoint[]
  /** Percent change from the start date. */
  change: PricePoint[]
}

/** What moved P/BV. "both" means price and book value pushed it the same way. */
export type Driver = "price" | "book" | "both" | "none"

export interface Attribution {
  /** Changes over the period as fractions: -0.2 is a 20% fall. */
  price: number
  book: number
  pbv: number
  /**
   * What book value alone would have done to P/BV: growth pulls the ratio
   * down. Price moves it one for one, and the two compound to `pbv`.
   */
  bookEffect: number
  /**
   * Share of the P/BV move that came from price, the rest being book value,
   * measured in logs so the two add up. Outside 0–1 when they pulled in
   * opposite directions; null when P/BV barely moved.
   */
  priceShare: number | null
  driver: Driver
}

export interface Valuation {
  start: string
  end: string
  /** What makes the period start later than the range asked for, if anything. */
  limitedBy: "book" | "price" | null
  price: ValuationSeries
  book: ValuationSeries
  pbv: ValuationSeries
  /** Balance-sheet dates the book value line is drawn from, oldest first. */
  reports: string[]
  attribution: Attribution
}

/** Under half a percent, P/BV is where it started and shares of the move are noise. */
const FLAT = 0.005

/** Splits a P/BV move between a price change and a book value change, both fractions. */
export function attributeChange(price: number, book: number): Attribution {
  const pbv = (1 + price) / (1 + book) - 1
  const bookEffect = 1 / (1 + book) - 1
  if (Math.abs(pbv) < FLAT) return { price, book, pbv, bookEffect, priceShare: null, driver: "none" }
  // Summing the two logs, not taking the log of `pbv`, keeps the share at
  // exactly 1 or 0 when one of them did not move.
  const fromPrice = Math.log1p(price)
  const priceShare = fromPrice / (fromPrice - Math.log1p(book))
  const driver = priceShare >= 1 ? "price" : priceShare <= 0 ? "book" : "both"
  return { price, book, pbv, bookEffect, priceShare, driver }
}

const series = (levels: PricePoint[]): ValuationSeries => ({ levels, change: percentChange(levels) })

const totalChange = (levels: PricePoint[]) => levels[levels.length - 1].value / levels[0].value - 1

/**
 * Lines price, book value per share and P/BV up on the trading days of a
 * range. Returns null when there is nothing to compare: no balance sheet
 * with positive equity, or under two trading days since.
 */
export function buildValuation(input: ValuationInput, options: { range: RangeKey; today?: Date }): Valuation | null {
  // A ratio over zero or negative equity means nothing, and neither does a
  // percent change from it, so start after the last such balance sheet.
  const reports = input.book.slice(input.book.findLastIndex((p) => !(p.value > 0)) + 1)
  // Book value holds from one balance sheet to the next; a foreign reporting
  // currency still moves it every day.
  const bookAll = convertCurrency(
    withLatest(input.price, reports, (_, value) => value),
    input.fx,
  )

  const requestedStart = rangeStart(options.range, options.today)
  const book = requestedStart ? clipFrom(bookAll, requestedStart) : bookAll
  if (book.length < 2) return null
  const start = book[0].time
  const end = book[book.length - 1].time
  // Book value only exists on trading days, so the two now share every date.
  const price = clipFrom(input.price, start)
  const pbv = price.map((p, i) => ({ time: p.time, value: p.value / book[i].value }))

  // A few days of slack covers weekends and holidays at the range start.
  const late = requestedStart != null && daysBetween(requestedStart, start) > 7
  const limitedBy = !late ? null : input.price[0].time === start ? "price" : "book"

  const inForce = reports.findLastIndex((r) => r.time <= start)
  return {
    start,
    end,
    limitedBy,
    price: series(price),
    book: series(book),
    pbv: series(pbv),
    reports: reports.slice(Math.max(inForce, 0)).flatMap((r) => (r.time <= end ? [r.time] : [])),
    attribution: attributeChange(totalChange(price), totalChange(book)),
  }
}
