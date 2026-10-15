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

/**
 * What a named holder is. A company is any business or organisation that
 * isn't in the business of investing, and a person an individual; together
 * they are a company's insiders. An institution is a bank, insurer, pension
 * fund or asset manager, and a fund is one pooled fund, usually run by an
 * institution.
 */
export const HOLDER_KINDS = ["company", "person", "institution", "fund"] as const
export type HolderKind = (typeof HOLDER_KINDS)[number]

/** A holder's stake in another company than the one it is listed under. */
export interface OtherHolding {
  symbol: string
  name: string
  /** Share of that company held, as a fraction. */
  percent: number
  shares: number | null
}

/** One named owner of a company's shares. */
export interface Holder {
  name: string
  kind: HolderKind
  /** The trust or company a fund is registered under, when the provider names it. */
  family?: string
  /** A person's position at the company. */
  role?: string
  /** What the source itself calls this sort of holder: "Corporate", "Private Bank", "Mutual Funds". */
  type?: string
  /** Set where the source says whether the holder is a foreign investor. */
  foreign?: boolean
  /** Share of the company held, as a fraction. */
  percent: number
  shares: number | null
  /** Market value of the stake, in the stock's trading currency. */
  value: number | null
  /** Change in the share count since the filing before, as a fraction. */
  change: number | null
  /** The date the stake was reported for, YYYY-MM-DD. */
  reported: string | null
  /**
   * What else the holder owns, largest stake first. Only a source that lists
   * a whole market's holders can tell, and only as far as its list goes.
   */
  elsewhere?: OtherHolding[]
}

/** What one holder did between two shareholder registers. */
export interface HolderChange {
  name: string
  kind: HolderKind
  type?: string
  /** The dates of the two registers, YYYY-MM-DD. */
  from: string
  to: string
  /**
   * The stake on each date. Null where the holder was not on that register:
   * under its threshold, not a holder at all, or recorded some other way.
   */
  before: { shares: number; percent: number } | null
  after: { shares: number; percent: number } | null
}

/**
 * Who owns a company. `insiders` and `institutions` are totals over every
 * holder of that sort, named or not, so they say more than `holders` adds up
 * to. Kinds overlap: an institution's stake includes the funds it runs.
 */
export interface Ownership {
  symbol: string
  name: string
  /** ISO 4217 code of `price` and of each holder's `value`. */
  currency: string
  /** The latest share price, which stakes are valued at. */
  price: number | null
  /** Fraction held by insiders: founders, parent companies, the state, directors. */
  insiders: number | null
  /** Fraction held by institutions, their funds included. */
  institutions: number | null
  /** Named holders, largest first. */
  holders: Holder[]
  /**
   * Set when holders come from a shareholder register, a full list of
   * everyone above a threshold: the date it was drawn up, and what holders
   * did between registers, newest first.
   */
  register?: { date: string; threshold: number; changes: HolderChange[] }
}

/** The shareholder registers the user has saved, as far as they could be read. */
export interface RegisterStatus {
  /** Changes whenever the saved files do. */
  version: string
  /** Where the files go, relative to the project folder. */
  folder: string
  /** Oldest first. */
  registers: { date: string; file: string; holders: number; companies: number }[]
  /** Files that are not a register, with what was wrong. */
  failed: { file: string; message: string }[]
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

/** One stock's part of a `MarketHistory`. */
export interface StockHistory {
  symbol: string
  /** Closes without dividends on each of the history's `dates`; null where the stock did not trade. */
  closes: (number | null)[]
  /** Book value per share at each balance-sheet date, oldest first, in the currency of the accounts. */
  bookValue: PricePoint[]
  /** Set when the accounts are in another currency than the market's. */
  reportingCurrency?: string
}

/**
 * Prices and book values for every stock in the home market over the past
 * year, for screens that look back in time. Every series lines up with
 * `dates`, which keeps the whole market small enough to send at once.
 */
export interface MarketHistory {
  market: string
  currency: string
  /** Trading days, oldest first. */
  dates: string[]
  stocks: StockHistory[]
  /** Value of one unit of each reporting currency in `currency` on each of `dates`; null where there is no rate. */
  fx: Record<string, (number | null)[]>
  /** Stocks left out because their history could not be read this time, as opposed to having none. */
  missing: number
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
  /** A company's shareholders. Optional: the ownership network needs it. */
  ownership?(symbol: string): Promise<Ownership>
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
