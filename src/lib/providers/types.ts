import type { FetchRange } from "@/lib/ranges"

/** One observation. `time` is the exchange-local trading date, YYYY-MM-DD. */
export interface PricePoint {
  time: string
  value: number
}

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
   * point is the latest price (adjustments only rewrite the past).
   */
  points: PricePoint[]
}

export interface SearchResult {
  symbol: string
  name: string
  exchange: string | null
  type: string | null
}

/**
 * A market-data source. Add one by implementing this interface and
 * registering it in `./index.ts`. Providers only run on the server.
 */
export interface DataProvider {
  id: string
  name: string
  history(symbol: string, range: FetchRange): Promise<PriceHistory>
  search(query: string): Promise<SearchResult[]>
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
