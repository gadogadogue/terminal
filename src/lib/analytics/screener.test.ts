import { describe, expect, it } from "vitest"
import type { StockSnapshot } from "@/lib/providers/types"
import {
  activeFilterCount,
  applyPreset,
  defaultScreen,
  formatBound,
  matchesPreset,
  parseBound,
  runScreen,
  SCREEN_PRESETS,
  screenRow,
  setBound,
  type Screen,
} from "./screener"

function stock(symbol: string, fields: Partial<StockSnapshot> = {}): StockSnapshot {
  return {
    symbol,
    name: `${symbol} Tbk`,
    sector: "Financial Services",
    currency: "IDR",
    price: 1000,
    change: 0,
    marketCap: 1e12,
    bookValue: 1000,
    eps: 100,
    epsForward: null,
    dividendRate: 50,
    high52w: 1250,
    low52w: 800,
    change52w: 0.1,
    avgVolume: 2_000_000,
    ...fields,
  }
}

const symbols = (rows: { stock: StockSnapshot }[]) => rows.map((r) => r.stock.symbol)
const screen = (patch: Partial<Screen>): Screen => ({ ...defaultScreen(), ...patch })

describe("screenRow", () => {
  it("derives valuation ratios from per-share inputs", () => {
    const { metrics } = screenRow(stock("BBRI.JK", { price: 3090, bookValue: 2136.41, eps: 407, dividendRate: 309 }))
    expect(metrics.pbv).toBeCloseTo(1.446, 3)
    expect(metrics.pe).toBeCloseTo(7.59, 2)
    expect(metrics.roe).toBeCloseTo(0.1905, 4)
    expect(metrics.dividendYield).toBeCloseTo(0.1, 6)
    expect(metrics.forwardPe).toBeNull()
  })

  it("leaves ratios over negative equity or losses empty instead of negative", () => {
    const { metrics } = screenRow(stock("SURE.JK", { bookValue: -214.7, eps: -30 }))
    expect(metrics.pbv).toBeNull()
    expect(metrics.roe).toBeNull()
    expect(metrics.pe).toBeNull()
  })

  it("keeps a negative ROE when equity is positive", () => {
    expect(screenRow(stock("LOSS.JK", { eps: -50 })).metrics.roe).toBeCloseTo(-0.05, 6)
  })

  it("measures liquidity in money and the distance from the 52-week high", () => {
    const { metrics } = screenRow(stock("X.JK"))
    expect(metrics.valueTraded).toBe(2e9)
    expect(metrics.fromHigh).toBeCloseTo(-0.2, 6)
  })
})

describe("runScreen", () => {
  const rows = [
    stock("AAAA.JK", { bookValue: 2000 }), // P/BV 0.5
    stock("BBBB.JK", { bookValue: 800, sector: "Energy" }), // P/BV 1.25
    stock("CCCC.JK", { bookValue: -10 }), // negative equity
    stock("DDDD.JK", { bookValue: 1250, name: "Bank Danamon" }), // P/BV 0.8
  ].map(screenRow)

  it("sorts by P/BV ascending by default, with missing values last", () => {
    expect(symbols(runScreen(rows, defaultScreen()))).toEqual(["AAAA.JK", "DDDD.JK", "BBBB.JK", "CCCC.JK"])
  })

  it("keeps missing values last when sorting descending too", () => {
    const sorted = runScreen(rows, screen({ sort: { key: "pbv", dir: "desc" } }))
    expect(symbols(sorted)).toEqual(["BBBB.JK", "DDDD.JK", "AAAA.JK", "CCCC.JK"])
  })

  it("applies bounds inclusively and drops stocks without the metric", () => {
    const below = runScreen(rows, screen({ filters: { pbv: { max: 0.8 } } }))
    expect(symbols(below)).toEqual(["AAAA.JK", "DDDD.JK"])
    const band = runScreen(rows, screen({ filters: { pbv: { min: 0.6, max: 2 } } }))
    expect(symbols(band)).toEqual(["DDDD.JK", "BBBB.JK"])
  })

  it("filters by sector", () => {
    expect(symbols(runScreen(rows, screen({ sectors: ["Energy"] })))).toEqual(["BBBB.JK"])
  })

  it("matches the start of a code or any part of a name", () => {
    expect(symbols(runScreen(rows, defaultScreen(), "bbb"))).toEqual(["BBBB.JK"])
    expect(symbols(runScreen(rows, defaultScreen(), "danamon"))).toEqual(["DDDD.JK"])
  })

  it("sorts by symbol", () => {
    const sorted = runScreen(rows, screen({ sort: { key: "symbol", dir: "desc" } }))
    expect(symbols(sorted)).toEqual(["DDDD.JK", "CCCC.JK", "BBBB.JK", "AAAA.JK"])
  })
})

describe("screen editing", () => {
  it("sets and clears bounds, dropping metrics with neither side", () => {
    let s = setBound(defaultScreen(), "pbv", "max", 1)
    s = setBound(s, "roe", "min", 0.1)
    expect(s.filters).toEqual({ pbv: { max: 1 }, roe: { min: 0.1 } })
    expect(activeFilterCount({ ...s, sectors: ["Energy"] })).toBe(3)
    s = setBound(s, "pbv", "max", null)
    expect(s.filters).toEqual({ roe: { min: 0.1 } })
  })

  it("applies a preset without touching sectors, and recognizes it afterwards", () => {
    const preset = SCREEN_PRESETS[0]
    const s = applyPreset(screen({ sectors: ["Energy"] }), preset)
    expect(s.sectors).toEqual(["Energy"])
    expect(matchesPreset(s, preset)).toBe(true)
    expect(matchesPreset(setBound(s, "pbv", "max", 0.9), preset)).toBe(false)
    // Editing the result must not edit the preset.
    s.filters.pbv!.max = 2
    expect(preset.filters.pbv?.max).toBe(1)
  })
})

describe("filter bounds as text", () => {
  it("reads percents, ratios and suffixed amounts", () => {
    expect(parseBound("12", "percent")).toBeCloseTo(0.12, 10)
    expect(parseBound("-30%", "percent")).toBeCloseTo(-0.3, 10)
    expect(parseBound("1.5", "ratio")).toBe(1.5)
    expect(parseBound(".5", "ratio")).toBe(0.5)
    expect(parseBound("1.5T", "amount")).toBe(1.5e12)
    expect(parseBound("500b", "amount")).toBe(5e11)
    expect(parseBound("2,000,000", "amount")).toBe(2e6)
  })

  it("tells an empty field from an unreadable one", () => {
    expect(parseBound("  ", "ratio")).toBeNull()
    expect(parseBound("abc", "ratio")).toBeUndefined()
    expect(parseBound("1B", "ratio")).toBeUndefined()
    expect(parseBound("1..2", "percent")).toBeUndefined()
  })

  it("accepts a trailing decimal point while typing", () => {
    expect(parseBound("1.", "ratio")).toBe(1)
  })

  it("formats bounds back into the same units", () => {
    expect(formatBound(0.12, "percent")).toBe("12")
    expect(formatBound(0.07, "percent")).toBe("7")
    expect(formatBound(1.5, "ratio")).toBe("1.5")
    expect(formatBound(1e9, "amount")).toBe("1B")
    expect(formatBound(2.5e12, "amount")).toBe("2.5T")
    expect(formatBound(undefined, "ratio")).toBe("")
    for (const [value, unit] of [
      [0.155, "percent"],
      [2.5e12, "amount"],
      [0.75, "ratio"],
    ] as const) {
      expect(parseBound(formatBound(value, unit), unit)).toBeCloseTo(value, 10)
    }
  })
})
