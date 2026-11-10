import { describe, expect, it } from "vitest"
import { alignTo, marketHistory } from "./market-history"
import { ProviderError, type DataProvider, type PricePoint, type StockSnapshot } from "./types"

const p = (time: string, value: number) => ({ time, value })

const snapshot = (symbol: string): StockSnapshot => ({
  symbol,
  name: symbol,
  sector: null,
  currency: "IDR",
  price: 100,
  change: null,
  marketCap: null,
  bookValue: 100,
  eps: null,
  epsForward: null,
  dividendRate: null,
  high52w: null,
  low52w: null,
  change52w: null,
  avgVolume: null,
})

interface FakeStock {
  closes?: PricePoint[]
  /** Balance sheets, or an error to throw for them. */
  books?: PricePoint[] | ProviderError
  bookCurrency?: string
}

/** A provider serving `stocks`; `fail` decides, per call, whether a stock's price request throws. */
function fake(stocks: Record<string, FakeStock>, fail: (symbol: string) => ProviderError | null = () => null) {
  const calls: string[] = []
  const provider: DataProvider = {
    id: "fake",
    name: "Fake",
    search: async () => [],
    screen: async () => ({ market: "IDX", currency: "IDR", asOf: "2026-10-09T09:00:00Z", stocks: Object.keys(stocks).map(snapshot) }),
    history: async (symbol) => {
      calls.push(symbol)
      if (symbol === "USDIDR=X") {
        return { symbol, name: symbol, currency: "IDR", exchange: null, instrumentType: null, points: [p("2026-10-06", 16000), p("2026-10-07", 16500)] }
      }
      const error = fail(symbol)
      if (error) throw error
      const points = stocks[symbol].closes ?? [p("2026-10-07", 100), p("2026-10-08", 110)]
      return { symbol, name: symbol, currency: "IDR", exchange: null, instrumentType: null, points }
    },
    bookValue: async (symbol) => {
      const { books = [p("2025-12-31", 100)], bookCurrency = "IDR" } = stocks[symbol]
      if (books instanceof ProviderError) throw books
      return { symbol, currency: bookCurrency, points: books }
    },
  }
  return { provider, calls }
}

describe("alignTo", () => {
  const dates = ["2026-10-06", "2026-10-07", "2026-10-08"]

  it("puts each point on its own date, leaving the others empty", () => {
    expect(alignTo(dates, [p("2026-10-07", 5)])).toEqual([null, 5, null])
  })

  it("holds the latest value on or before each date when asked", () => {
    expect(alignTo(dates, [p("2026-10-05", 4), p("2026-10-07", 5)], true)).toEqual([4, 5, 5])
    expect(alignTo(dates, [p("2026-10-07", 5)], true)).toEqual([null, 5, 5])
  })
})

describe("marketHistory", () => {
  it("lines every stock's closes up with the trading days of all of them", async () => {
    const { provider } = fake({
      "A.JK": { closes: [p("2026-10-06", 50), p("2026-10-08", 55)] },
      "B.JK": { closes: [p("2026-10-07", 70), p("2026-10-08", 71)] },
    })
    const h = await marketHistory(provider)
    expect(h.dates).toEqual(["2026-10-06", "2026-10-07", "2026-10-08"])
    expect(h.stocks.map((s) => [s.symbol, s.closes])).toEqual([
      ["A.JK", [50, null, 55]],
      ["B.JK", [null, 70, 71]],
    ])
    expect(h.stocks[0].bookValue).toEqual([p("2025-12-31", 100)])
    expect(h).toMatchObject({ market: "IDX", currency: "IDR", fx: {}, missing: 0 })
  })

  it("leaves out stocks without balance sheets without counting them as missing", async () => {
    const { provider } = fake({ "A.JK": {}, "B.JK": { books: new ProviderError("No balance sheets", 404) } })
    const h = await marketHistory(provider)
    expect(h.stocks.map((s) => s.symbol)).toEqual(["A.JK"])
    expect(h.missing).toBe(0)
  })

  it("tries a failed stock once more, then counts it as missing", async () => {
    const stocks = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`S${i}.JK`, {}]))
    let blips = 0
    const { provider, calls } = fake(stocks, (symbol) => {
      if (symbol === "S1.JK" && blips++ === 0) return new ProviderError("Yahoo Finance responded 500")
      return symbol === "S2.JK" ? new ProviderError("Yahoo Finance responded 500") : null
    })
    const h = await marketHistory(provider)
    expect(h.stocks).toHaveLength(19)
    expect(h.stocks.some((s) => s.symbol === "S1.JK")).toBe(true)
    expect(h.missing).toBe(1)
    expect(calls.filter((s) => s === "S2.JK")).toHaveLength(2)
  })

  it("gives up when too many stocks fail, as under a rate limit", async () => {
    const limited = new ProviderError("Yahoo Finance rate limit reached, try again shortly", 429)
    const { provider } = fake({ "A.JK": {}, "B.JK": {} }, (symbol) => (symbol === "B.JK" ? limited : null))
    await expect(marketHistory(provider)).rejects.toBe(limited)
  })

  it("adds the exchange rate accounts in another currency need", async () => {
    const { provider } = fake({ "A.JK": { bookCurrency: "USD", books: [p("2025-12-31", 0.01)] }, "B.JK": {} })
    const h = await marketHistory(provider)
    expect(h.stocks.find((s) => s.symbol === "A.JK")!.reportingCurrency).toBe("USD")
    expect(h.stocks.find((s) => s.symbol === "B.JK")).not.toHaveProperty("reportingCurrency")
    // The rate of the 7th holds on the 8th.
    expect(h.fx).toEqual({ USD: [16500, 16500] })
  })
})
