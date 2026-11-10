import { describe, expect, it } from "vitest"
import type { StockHistory, StockSnapshot } from "@/lib/providers/types"
import {
  defaultFallScreen,
  fallCause,
  findFall,
  findFalls,
  pbvDays,
  runFallScreen,
  type Fall,
  type FallDay,
  type FallScreen,
} from "./pbv-fall"
import { screenRow } from "./screener"
import { attributeChange } from "./valuation"

const p = (time: string, value: number) => ({ time, value })

/** Days with a book value of 100, so P/BV is the price over 100. */
const days = (start: string, pbvs: number[]): FallDay[] =>
  pbvs.map((pbv, i) => {
    const time = new Date(Date.parse(`${start}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10)
    return { time, price: pbv * 100, book: 100, pbv }
  })

const stock = (symbol: string, closes: (number | null)[], bookValue = [p("2025-12-31", 100)]): StockHistory => ({
  symbol,
  closes,
  bookValue,
})

describe("pbvDays", () => {
  const dates = ["2026-06-29", "2026-06-30", "2026-07-01", "2026-07-02"]

  it("divides each close by the book value of the latest balance sheet by then", () => {
    const out = pbvDays(dates, stock("A.JK", [120, 120, 120, 150], [p("2025-12-31", 100), p("2026-06-30", 120)]), {})
    expect(out.map((d) => d.pbv)).toEqual([1.2, 1, 1, 1.25])
    expect(out[3]).toEqual({ time: "2026-07-02", price: 150, book: 120, pbv: 1.25 })
  })

  it("skips days without a close and days before the first balance sheet", () => {
    const out = pbvDays(dates, stock("A.JK", [100, null, 100, 100], [p("2026-06-30", 50)]), {})
    expect(out.map((d) => d.time)).toEqual(["2026-07-01", "2026-07-02"])
  })

  it("starts after the last balance sheet without positive equity", () => {
    const books = [p("2025-12-31", -10), p("2026-06-30", 50)]
    expect(pbvDays(dates, stock("A.JK", [100, 100, 100, 100], books), {}).map((d) => d.time)).toEqual([
      "2026-06-30",
      "2026-07-01",
      "2026-07-02",
    ])
    const negative = [p("2025-12-31", 50), p("2026-06-30", -10)]
    expect(pbvDays(dates, stock("A.JK", [100, 100, 100, 100], negative), {})).toEqual([])
  })

  it("converts accounts in another currency at each day's rate, holding the last one over gaps", () => {
    const usd: StockHistory = { ...stock("U.JK", [16000, 16000, 16000, 16000], [p("2025-12-31", 1)]), reportingCurrency: "USD" }
    const out = pbvDays(dates, usd, { USD: [16000, null, 20000, null] })
    expect(out.map((d) => d.book)).toEqual([16000, 16000, 20000, 20000])
    expect(out.map((d) => d.pbv)).toEqual([1, 1, 0.8, 0.8])
    // Without the rate there is nothing to compare.
    expect(pbvDays(dates, usd, {})).toEqual([])
  })
})

describe("findFall", () => {
  it("measures the fall from the period's high and dates the cross", () => {
    const fall = findFall(days("2026-07-01", [1.1, 1.4, 1.2, 0.95, 0.9]), "2026-07-01", 1)!
    expect(fall.high.pbv).toBe(1.4)
    expect(fall.high.time).toBe("2026-07-02")
    expect(fall.now.pbv).toBe(0.9)
    expect(fall.crossed).toBe("2026-07-04")
    expect(fall.attribution.ratio).toBeCloseTo(0.9 / 1.4 - 1)
    expect(fall.attribution.driver).toBe("price")
  })

  it("dates the cross from the last time P/BV was above the mark", () => {
    const fall = findFall(days("2026-07-01", [1.3, 0.9, 1.05, 0.98, 0.97]), "2026-07-01", 1)!
    expect(fall.high.pbv).toBe(1.3)
    expect(fall.crossed).toBe("2026-07-04")
  })

  it("ignores days before the period", () => {
    const series = days("2026-07-01", [3, 1.2, 1.1, 0.9])
    expect(findFall(series, "2026-07-02", 1)!.high.pbv).toBe(1.2)
    // Above the mark only before the period: no fall in it.
    expect(findFall(days("2026-07-01", [1.5, 0.9, 0.8, 0.7]), "2026-07-02", 1)).toBeNull()
  })

  it("needs P/BV at or below the mark on the last day", () => {
    expect(findFall(days("2026-07-01", [1.4, 0.9, 1.01]), "2026-07-01", 1)).toBeNull()
    expect(findFall(days("2026-07-01", [1.4, 1]), "2026-07-01", 1)!.crossed).toBe("2026-07-02")
  })

  it("needs two days in the period", () => {
    expect(findFall(days("2026-07-01", [1.4, 0.9]), "2026-07-02", 1)).toBeNull()
  })

  it("splits the fall between a lower price and a higher book value", () => {
    const series: FallDay[] = [
      { time: "2026-07-01", price: 1500, book: 1000, pbv: 1.5 },
      { time: "2026-07-02", price: 1200, book: 1250, pbv: 0.96 },
    ]
    const { attribution } = findFall(series, "2026-07-01", 1)!
    expect(attribution.price).toBeCloseTo(-0.2)
    expect(attribution.fundamental).toBeCloseTo(0.25)
    expect(attribution.ratio).toBeCloseTo(-0.36)
    expect(attribution.priceShare).toBeCloseTo(0.5)
  })
})

describe("fallCause", () => {
  it("names a cause that gave four fifths of the fall or more", () => {
    expect(fallCause(attributeChange(-0.3, 0))).toBe("price")
    expect(fallCause(attributeChange(-0.3, 0.003))).toBe("price")
    // Book value shrank, working against the fall: still the price's.
    expect(fallCause(attributeChange(-0.4, -0.05))).toBe("price")
    expect(fallCause(attributeChange(0, 0.3))).toBe("book")
    expect(fallCause(attributeChange(0.05, 0.5))).toBe("book")
    expect(fallCause(attributeChange(-0.2, 0.25))).toBe("both")
    expect(fallCause(attributeChange(0.1, 0.1))).toBeNull()
  })
})

describe("findFalls", () => {
  it("looks back over the period from today", () => {
    const series = new Map([
      ["A.JK", days("2026-09-01", [1.5, ...Array(30).fill(1.2), 0.9])],
      ["B.JK", days("2026-09-01", [0.9, 0.8])],
    ])
    const today = new Date(2026, 9, 2)
    expect([...findFalls(series, "1M", 1, today).keys()]).toEqual(["A.JK"])
    expect(findFalls(series, "1M", 1, today).get("A.JK")!.high.pbv).toBe(1.2)
    expect(findFalls(series, "3M", 1, today).get("A.JK")!.high.pbv).toBe(1.5)
  })
})

describe("runFallScreen", () => {
  const snapshot = (symbol: string): StockSnapshot => ({
    symbol,
    name: symbol,
    sector: null,
    currency: "IDR",
    price: 100,
    change: 0,
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
  const fall = (high: number, crossed: string, price: number, book: number): Fall => ({
    high: { time: "2026-07-01", price: 100, book: 100, pbv: high },
    now: { time: "2026-10-09", price: 100, book: 100, pbv: 1 },
    crossed,
    attribution: attributeChange(price, book),
  })
  const rows = ["A.JK", "B.JK", "C.JK", "D.JK"].map((s) => screenRow(snapshot(s)))
  const falls = new Map([
    ["A.JK", fall(1.5, "2026-10-01", -0.4, 0)], // price, -40%
    ["B.JK", fall(1.2, "2026-10-08", 0, 0.25)], // book, -20%
    ["C.JK", fall(1.1, "2026-09-15", -0.08, 0.005)], // price, -8.5%
  ])
  const run = (patch: Partial<FallScreen>) =>
    runFallScreen(rows, falls, { ...defaultFallScreen(), on: true, ...patch }).map((r) => r.stock.symbol)

  it("lists the latest crosses first, leaving out stocks that did not fall through", () => {
    expect(run({ minFall: 0 })).toEqual(["B.JK", "A.JK", "C.JK"])
  })

  it("keeps falls at least as deep as asked", () => {
    expect(run({ minFall: 0.1 })).toEqual(["B.JK", "A.JK"])
    expect(run({ minFall: 0.3 })).toEqual(["A.JK"])
  })

  it("filters by cause", () => {
    expect(run({ minFall: 0, cause: "price" })).toEqual(["A.JK", "C.JK"])
    expect(run({ minFall: 0, cause: "book" })).toEqual(["B.JK"])
    expect(run({ minFall: 0, cause: "both" })).toEqual([])
  })

  it("sorts by the size of the fall and by symbol", () => {
    expect(run({ minFall: 0, sort: { key: "fall", dir: "asc" } })).toEqual(["A.JK", "B.JK", "C.JK"])
    expect(run({ minFall: 0, sort: { key: "symbol", dir: "desc" } })).toEqual(["C.JK", "B.JK", "A.JK"])
    expect(run({ minFall: 0, sort: { key: "book", dir: "desc" } })).toEqual(["B.JK", "C.JK", "A.JK"])
  })
})
