import { fxSymbol } from "@/lib/currency"
import {
  ProviderError,
  type BookValueHistory,
  type DataProvider,
  type MarketHistory,
  type PriceHistory,
  type PricePoint,
  type StockHistory,
} from "./types"

/**
 * Stocks read at once, each with two requests. Yahoo served the whole IDX,
 * 836 stocks, at ten in flight without a rate limit, in about nine seconds.
 */
const CONCURRENCY = 8

/** Past this share of stocks failing, the market isn't worth showing: most likely a rate limit. */
const MAX_MISSING = 0.1

/** Runs `task` over `items` with at most `size` running at once, keeping the order. */
async function inPool<T, R>(items: T[], size: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await task(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker))
  return out
}

/**
 * `points` on each of `dates`: the value of that very day, or with `hold`
 * the latest one on or before it. Null where there is none.
 */
export function alignTo(dates: string[], points: PricePoint[], hold = false): (number | null)[] {
  const out: (number | null)[] = []
  let j = -1
  for (const date of dates) {
    while (j + 1 < points.length && points[j + 1].time <= date) j++
    out.push(j >= 0 && (hold || points[j].time === date) ? points[j].value : null)
  }
  return out
}

type Read = { symbol: string; price: PriceHistory; book: BookValueHistory } | "none" | { error: unknown }

async function readStock(provider: DataProvider, symbol: string): Promise<Read> {
  try {
    const [price, book] = await Promise.all([provider.history(symbol, "1y", "price"), provider.bookValue!(symbol)])
    return { symbol, price, book }
  } catch (error) {
    // A stock without prices or balance sheets has nothing to screen; anything else may work next time.
    return error instanceof ProviderError && error.status === 404 ? "none" : { error }
  }
}

const failed = (read: Read): read is { error: unknown } => typeof read === "object" && "error" in read

/**
 * A year of closes and every balance sheet for each stock in the home
 * market, with the exchange rates their accounts need. Stocks that fail are
 * tried once more, then left out and counted.
 */
export async function marketHistory(provider: DataProvider): Promise<MarketHistory> {
  if (!provider.screen || !provider.bookValue) throw new ProviderError("This data provider has no balance sheets")
  const { market, currency, stocks } = await provider.screen()
  const symbols = stocks.map((s) => s.symbol)

  const reads = await inPool(symbols, CONCURRENCY, (symbol) => readStock(provider, symbol))
  const retry = reads.flatMap((r, i) => (failed(r) ? [i] : []))
  const retried = await inPool(retry, CONCURRENCY, (i) => readStock(provider, symbols[i]))
  retry.forEach((i, k) => (reads[i] = retried[k]))

  const errors = reads.filter(failed)
  if (errors.length > MAX_MISSING * symbols.length) {
    const { error } = errors[0]
    throw error instanceof ProviderError ? error : new ProviderError("Could not read the market's history")
  }

  const read = reads.flatMap((r) => (r === "none" || failed(r) || r.price.currency !== currency ? [] : [r]))
  const dates = [...new Set(read.flatMap((r) => r.price.points.map((p) => p.time)))].sort()

  // Accounts in another currency need its rate on every day; without one, those stocks wait for next time.
  const foreign = [...new Set(read.map((r) => r.book.currency).filter((c) => c !== currency))]
  const fx: MarketHistory["fx"] = {}
  await Promise.all(
    foreign.map(async (code) => {
      try {
        const { points } = await provider.history(fxSymbol(code, currency), "1y")
        fx[code] = alignTo(dates, points, true)
      } catch {
        // Left out of `fx`, so the stocks below are counted as missing.
      }
    }),
  )

  const histories: StockHistory[] = []
  let missing = errors.length
  for (const { symbol, price, book } of read) {
    const foreignBook = book.currency !== currency
    if (foreignBook && !fx[book.currency]) {
      missing++
      continue
    }
    histories.push({
      symbol,
      closes: alignTo(dates, price.points),
      bookValue: book.points,
      ...(foreignBook && { reportingCurrency: book.currency }),
    })
  }
  return { market, currency, dates, stocks: histories, fx, missing }
}
