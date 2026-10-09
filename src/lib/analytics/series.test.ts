import { describe, expect, it } from "vitest"
import { computeMetrics, convertCurrency, fixedRateLevels, percentChange, weekdays } from "./series"

const p = (time: string, value: number) => ({ time, value })

describe("convertCurrency", () => {
  it("uses the same-day rate, else the latest earlier one", () => {
    const usd = [p("2026-01-02", 10), p("2026-01-05", 11), p("2026-01-06", 12)]
    const usdidr = [p("2026-01-02", 16000), p("2026-01-06", 17000)]
    expect(convertCurrency(usd, usdidr)).toEqual([
      p("2026-01-02", 160000),
      p("2026-01-05", 176000), // forward-filled from Jan 2
      p("2026-01-06", 204000),
    ])
  })

  it("drops points before FX history begins", () => {
    expect(convertCurrency([p("2026-01-01", 1), p("2026-01-03", 1)], [p("2026-01-02", 2)])).toEqual([
      p("2026-01-03", 2),
    ])
  })

  it("passes through when no conversion is needed", () => {
    const pts = [p("2026-01-01", 1)]
    expect(convertCurrency(pts, null)).toBe(pts)
  })
})

describe("weekdays", () => {
  it("skips Saturdays and Sundays", () => {
    // 2026-10-09 is a Friday
    expect(weekdays("2026-10-09", "2026-10-13")).toEqual(["2026-10-09", "2026-10-12", "2026-10-13"])
  })
})

describe("fixed rate benchmark", () => {
  it("compounds to the stated annual rate", () => {
    const levels = fixedRateLevels(7, weekdays("2024-01-01", "2026-01-01"))
    const m = computeMetrics(levels)!
    expect(m.cagr).toBeCloseTo(0.07, 3)
    expect(m.volatility).toBeCloseTo(0, 6)
    expect(m.maxDrawdown).toBe(0)
  })
})

describe("percentChange", () => {
  it("rebases to zero at the first point", () => {
    expect(percentChange([p("a", 200), p("b", 250), p("c", 150)]).map((x) => x.value)).toEqual([0, 25, -25])
  })
})

describe("computeMetrics", () => {
  it("measures return and the worst peak-to-trough decline", () => {
    const m = computeMetrics([p("2026-01-01", 100), p("2026-01-02", 120), p("2026-01-03", 90), p("2026-01-04", 110)])!
    expect(m.totalReturn).toBeCloseTo(0.1)
    expect(m.maxDrawdown).toBeCloseTo(-0.25) // 120 -> 90
    expect(m.cagr).toBeNull() // too short to annualize
  })

  it("annualizes volatility from the observation frequency", () => {
    // Alternating +1%/-1% daily moves on weekdays for a year.
    const dates = weekdays("2025-01-01", "2025-12-31")
    let v = 100
    const levels = dates.map((time, i) => ({ time, value: (v *= i === 0 ? 1 : i % 2 ? 1.01 : 1 / 1.01) }))
    const m = computeMetrics(levels)!
    // Daily stdev ~1%, times sqrt(~261 obs/yr) ~ 16%.
    expect(m.volatility!).toBeGreaterThan(0.15)
    expect(m.volatility!).toBeLessThan(0.17)
  })

  it("needs at least two points", () => {
    expect(computeMetrics([p("2026-01-01", 1)])).toBeNull()
  })
})
