import type { MarketHistory, StockHistory } from "@/lib/providers/types"
import { rangeStart, type RangeKey } from "@/lib/ranges"
import type { ScreenRow, SortDir } from "./screener"
import { attributeChange, type Attribution } from "./valuation"

/**
 * Stocks whose P/BV fell through a mark: above it at some point in a period,
 * at or below it now. The fall is measured from the period's highest P/BV and
 * split, as on the valuation chart, into what the price and book value did
 * between that day and the last. A P/BV can fall because the price dropped,
 * because book value grew, or both.
 */

export const FALL_PERIODS = ["1M", "3M", "6M", "1Y"] as const satisfies readonly RangeKey[]
export type FallPeriod = (typeof FALL_PERIODS)[number]

/** What a fall is put down to; "any" keeps every fall. */
export const FALL_CAUSES = ["any", "price", "book", "both"] as const
export type FallCause = (typeof FALL_CAUSES)[number]

/**
 * The share of a fall one driver needs to be named its cause; under it, the
 * fall is put down to both. `Attribution.driver` says "both" for any split,
 * even 99 to 1, which is no help in telling falls apart.
 */
export const CAUSE_SHARE = 0.8

/** What pushed P/BV down, or null when it barely moved. */
export function fallCause({ priceShare }: Attribution): Exclude<FallCause, "any"> | null {
  if (priceShare == null) return null
  return priceShare >= CAUSE_SHARE ? "price" : priceShare <= 1 - CAUSE_SHARE ? "book" : "both"
}

interface FallColumnDef {
  key: string
  label: string
  hint: string
  /** Direction of the first click on the column: the end worth looking at first. */
  firstSort: SortDir
}

/** Sortable columns of a fall, in table order. */
export const FALL_COLUMNS = [
  { key: "pbv", label: "P/BV", firstSort: "asc", hint: "Price over book value per share on the last trading day" },
  { key: "high", label: "High", firstSort: "desc", hint: "The highest P/BV in the period, and the day it closed there" },
  { key: "fall", label: "Fall", firstSort: "asc", hint: "P/BV now against its high in the period" },
  {
    key: "crossed",
    label: "Crossed",
    firstSort: "desc",
    hint: "The first day at or below the mark after the last day above it",
  },
  { key: "price", label: "Price", firstSort: "asc", hint: "Change in the price since the high" },
  { key: "book", label: "Book value", firstSort: "desc", hint: "Change in book value per share since the high" },
  {
    key: "priceShare",
    label: "Cause",
    firstSort: "desc",
    hint: "How much of the fall came from the price, the rest coming from book value. One of them is named when it gave 80% or more.",
  },
] as const satisfies readonly FallColumnDef[]

export type FallColumn = (typeof FALL_COLUMNS)[number]
export type FallSortKey = FallColumn["key"] | "symbol"

const FALL_SORT_KEYS = new Set<string>(["symbol", ...FALL_COLUMNS.map((c) => c.key)])

export function isFallSortKey(key: string): key is FallSortKey {
  return FALL_SORT_KEYS.has(key)
}

/** The screen's settings. They live in the workspace and the watchlist file, inside the screener's. */
export interface FallScreen {
  /** Off, the screener lists stocks as they stand today. */
  on: boolean
  period: FallPeriod
  /** P/BV was above this in the period and is at or below it now. */
  mark: number
  /** The least fall from the period's high, as a fraction: 0.2 is a 20% fall. */
  minFall: number
  cause: FallCause
  sort: { key: FallSortKey; dir: SortDir }
}

export function defaultFallScreen(): FallScreen {
  return { on: false, period: "3M", mark: 1, minFall: 0.1, cause: "any", sort: { key: "crossed", dir: "desc" } }
}

/** One trading day of a stock: its close, the book value per share in force, both in the trading currency. */
export interface FallDay {
  time: string
  price: number
  book: number
  pbv: number
}

export interface Fall {
  /** The day P/BV closed highest in the period. */
  high: FallDay
  /** The last trading day. */
  now: FallDay
  /** The first day at or below the mark after the last day above it. */
  crossed: string
  /** Price, book value and P/BV from the high to now. `ratio` is the fall itself, a negative fraction. */
  attribution: Attribution
}

/**
 * A stock's P/BV on each day it traded: the close over the book value per
 * share of the latest balance sheet by then, converted at that day's rate
 * when the accounts are in another currency. As on the valuation chart, a
 * balance sheet counts from its own date and days before equity last turned
 * positive are left out, since a ratio over zero or less means nothing.
 */
export function pbvDays(dates: string[], stock: StockHistory, fx: MarketHistory["fx"]): FallDay[] {
  const reports = stock.bookValue.slice(stock.bookValue.findLastIndex((r) => !(r.value > 0)) + 1)
  const rates = stock.reportingCurrency ? fx[stock.reportingCurrency] : null
  if (reports.length === 0 || (stock.reportingCurrency && !rates)) return []

  const days: FallDay[] = []
  let report = -1
  let rate: number | null = rates ? null : 1
  dates.forEach((time, i) => {
    while (report + 1 < reports.length && reports[report + 1].time <= time) report++
    // A missing rate holds the last one, like a missing balance sheet.
    if (rates) rate = rates[i] ?? rate
    const price = stock.closes[i]
    if (price == null || report < 0 || rate == null) return
    const book = reports[report].value * rate
    days.push({ time, price, book, pbv: price / book })
  })
  return days
}

/**
 * The fall through `mark` in the days from `start`, or null when P/BV is
 * above the mark now or never rose above it in that time.
 */
export function findFall(days: FallDay[], start: string, mark: number): Fall | null {
  const from = days.findIndex((d) => d.time >= start)
  if (from === -1 || days.length - from < 2) return null
  const now = days[days.length - 1]
  if (!(now.pbv <= mark)) return null

  let high = from
  let lastAbove = -1
  for (let i = from; i < days.length; i++) {
    if (days[i].pbv > days[high].pbv) high = i
    if (days[i].pbv > mark) lastAbove = i
  }
  if (lastAbove === -1) return null
  const top = days[high]
  return {
    high: top,
    now,
    crossed: days[lastAbove + 1].time,
    attribution: attributeChange(now.price / top.price - 1, now.book / top.book - 1),
  }
}

/** Every stock's days, by symbol. The settings don't change them, so they are worked out once per history. */
export function marketPbvDays(history: MarketHistory): Map<string, FallDay[]> {
  return new Map(history.stocks.map((stock) => [stock.symbol, pbvDays(history.dates, stock, history.fx)]))
}

/** The falls through `mark` in `period`, by symbol. */
export function findFalls(
  days: Map<string, FallDay[]>,
  period: FallPeriod,
  mark: number,
  today?: Date,
): Map<string, Fall> {
  const start = rangeStart(period, today)!
  const falls = new Map<string, Fall>()
  for (const [symbol, stockDays] of days) {
    const fall = findFall(stockDays, start, mark)
    if (fall) falls.set(symbol, fall)
  }
  return falls
}

export interface FallRow extends ScreenRow {
  fall: Fall
}

function sortValue(fall: Fall, key: Exclude<FallSortKey, "symbol">): number | string | null {
  switch (key) {
    case "pbv":
      return fall.now.pbv
    case "high":
      return fall.high.pbv
    case "fall":
      return fall.attribution.ratio
    case "crossed":
      return fall.crossed
    case "price":
      return fall.attribution.price
    case "book":
      return fall.attribution.fundamental
    case "priceShare":
      return fall.attribution.priceShare
  }
}

/**
 * The rows that fell through the mark by at least `minFall`, with the cause
 * asked for, sorted. `rows` have already passed the screener's other filters.
 * Missing values sort last in either direction; ties go by symbol.
 */
export function runFallScreen(rows: ScreenRow[], falls: Map<string, Fall>, screen: FallScreen): FallRow[] {
  const kept = rows.flatMap((row): FallRow[] => {
    const fall = falls.get(row.stock.symbol)
    if (!fall || fall.attribution.ratio > -screen.minFall) return []
    if (screen.cause !== "any" && fallCause(fall.attribution) !== screen.cause) return []
    return [{ ...row, fall }]
  })

  const { key, dir } = screen.sort
  const sign = dir === "asc" ? 1 : -1
  const bySymbol = (a: FallRow, b: FallRow) => a.stock.symbol.localeCompare(b.stock.symbol)
  return kept.sort((a, b) => {
    if (key === "symbol") return bySymbol(a, b) * sign
    const av = sortValue(a.fall, key)
    const bv = sortValue(b.fall, key)
    if (av == null || bv == null) return av == null && bv == null ? bySymbol(a, b) : av == null ? 1 : -1
    const order = typeof av === "string" ? av.localeCompare(bv as string) : av - (bv as number)
    return order * sign || bySymbol(a, b)
  })
}
