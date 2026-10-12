import type { FetchRange } from "@/lib/ranges"

/** One observation. `time` is the exchange-local trading date, YYYY-MM-DD. */
export interface PricePoint {
  time: string
  value: number
}

/**
 * What a history's closes stand for. "total" folds dividends back in, which
 * is right for returns; "price" is what the stock traded at, which is right
 * for a ratio such as P/BV or P/E. Both are on today's share count.
 */
export const PRICE_BASES = ["total", "price"] as const
export type PriceBasis = (typeof PRICE_BASES)[number]

export interface PriceHistory {
  symbol: string
  name: string
  /** ISO 4217 code of `points`. Minor units (e.g. GBp) are already scaled. */
  currency: string
  exchange: string | null
  instrumentType: string | null
  /**
   * Dividend/split-adjusted closes where the provider has them, so returns
   * are total returns and comparable with a fixed-rate benchmark. The last
   * point is the latest price (adjustments only rewrite the past). With the
   * "price" basis, dividends are left out.
   */
  points: PricePoint[]
}

/**
 * Book value per share at each balance-sheet date the provider has, oldest
 * first, on today's share count so it lines up with split-adjusted prices.
 * Negative when liabilities exceed assets.
 */
export interface BookValueHistory {
  symbol: string
  /** ISO 4217 code of `points`: the currency of the accounts, not always the trading currency. */
  currency: string
  points: PricePoint[]
}

/**
 * Earnings per share over the 12 months to each period end the provider has,
 * oldest first: net income over shares outstanding, on today's share count
 * like book value. Negative when the company lost money.
 */
export interface EarningsHistory {
  symbol: string
  /** ISO 4217 code of `points`: the currency of the accounts, not always the trading currency. */
  currency: string
  points: PricePoint[]
  /** The dates in `points` that close a fiscal year, where the 12 months are that year. */
  yearEnds: string[]
}

export interface SearchResult {
  symbol: string
  name: string
  exchange: string | null
  type: string | null
}

/**
 * One listed stock, as raw inputs for the screener. Every money value is in
 * `currency`, including book value for companies that report in another
 * currency (those carry `reportingCurrency`). Ratios are derived in
 * `@/lib/analytics/screener`, not here.
 */
export interface StockSnapshot {
  symbol: string
  name: string
  sector: string | null
  currency: string
  /** Set when the accounts are in another currency and book value was converted. */
  reportingCurrency?: string
  price: number
  /** One-day change as a fraction. */
  change: number | null
  marketCap: number | null
  /** Book value per share. Negative when liabilities exceed assets. */
  bookValue: number | null
  /** Trailing 12-month earnings per share. */
  eps: number | null
  /** Analysts' earnings per share estimate for the next fiscal year. */
  epsForward: number | null
  /** Expected annual dividend per share (the latest dividend annualized). */
  dividendRate: number | null
  high52w: number | null
  low52w: number | null
  /** Price change over the last 52 weeks as a fraction. */
  change52w: number | null
  /** Average shares traded per day over 3 months. */
  avgVolume: number | null
}

export interface MarketSnapshot {
  /** Display name of the market, e.g. "IDX". */
  market: string
  currency: string
  /** ISO time of the most recent quote. */
  asOf: string
  stocks: StockSnapshot[]
}

/**
 * A market-data source. Add one by implementing this interface and
 * registering it in `./index.ts`. Providers only run on the server.
 */
export interface DataProvider {
  id: string
  name: string
  history(symbol: string, range: FetchRange, basis?: PriceBasis): Promise<PriceHistory>
  search(query: string): Promise<SearchResult[]>
  /** Every listed stock in the home market. Optional: the screener needs it. */
  screen?(): Promise<MarketSnapshot>
  /** A company's book value over time. Optional: the valuation chart needs it for P/BV. */
  bookValue?(symbol: string): Promise<BookValueHistory>
  /** A company's earnings over time. Optional: the valuation chart needs it for P/E. */
  earnings?(symbol: string): Promise<EarningsHistory>
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 429 | 502 = 502,
  ) {
    super(message)
    this.name = "ProviderError"
  }
}
