import { describe, expect, it } from "vitest"
import type { PricePoint } from "@/lib/providers/types"
import { attributeChange, buildValuation, earningsOn } from "./valuation"

const TODAY = new Date(2026, 9, 9) // Fri 9 Oct 2026, local time

const p = (time: string, value: number) => ({ time, value })

function daily(start: string, end: string, value: (time: string) => number): PricePoint[] {
  const out: PricePoint[] = []
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += 86_400_000) {
    const time = new Date(t).toISOString().slice(0, 10)
    out.push({ time, value: value(time) })
  }
  return out
}

describe("attributeChange", () => {
  it("splits a fall between a lower price and a higher book value", () => {
    const a = attributeChange(-0.2, 0.25)
    expect(a.ratio).toBeCloseTo(-0.36) // 0.8 / 1.25
    expect(a.fundamentalEffect).toBeCloseTo(-0.2)
    expect(a.driver).toBe("both")
    expect(a.priceShare).toBeCloseTo(0.5) // ln 0.8 = -ln 1.25
  })

  it("gives the price all of it when book value did not move", () => {
    const a = attributeChange(-0.1, 0)
    expect(a.ratio).toBeCloseTo(-0.1)
    expect(a.priceShare).toBe(1)
    expect(a.driver).toBe("price")
  })

  it("names one driver when the other pulled the opposite way", () => {
    // Book value shrank, which lifts P/BV, yet the price fell further.
    const price = attributeChange(-0.3, -0.1)
    expect(price.driver).toBe("price")
    expect(price.priceShare!).toBeGreaterThan(1)
    // The price rose, yet book value grew far faster.
    const book = attributeChange(0.05, 0.5)
    expect(book.ratio).toBeCloseTo(-0.3)
    expect(book.driver).toBe("fundamental")
    expect(book.priceShare!).toBeLessThan(0)
  })

  it("calls P/BV unchanged when price and book value moved together", () => {
    expect(attributeChange(0.1, 0.1)).toMatchObject({ driver: "none", priceShare: null })
  })
})

describe("earningsOn", () => {
  const points = [
    p("2022-12-31", 100),
    p("2023-12-31", 120),
    p("2024-06-30", 130),
    p("2024-09-30", 140),
    p("2024-12-31", 170),
    p("2025-06-30", 180),
  ]
  const yearEnds = ["2022-12-31", "2023-12-31", "2024-12-31"]
  const values = (out: PricePoint[]) => out.map((x) => [x.time, Math.round(x.value * 100) / 100])

  it("leaves the trailing figures as they are", () => {
    expect(earningsOn("trailing", points, yearEnds)).toBe(points)
  })

  it("keeps full fiscal years only", () => {
    expect(values(earningsOn("annual", points, yearEnds))).toEqual([
      ["2022-12-31", 100],
      ["2023-12-31", 120],
      ["2024-12-31", 170],
    ])
  })

  it("averages each figure with the others reported in the year before it", () => {
    const out = values(earningsOn("average1y", points, yearEnds))
    expect(out).toHaveLength(points.length)
    // A year-end alone in its year stays as it is.
    expect(out[1]).toEqual(["2023-12-31", 120])
    // The same quarter a year earlier is left out: 130, 140, 170 and then 140, 170, 180.
    expect(out[4]).toEqual(["2024-12-31", 146.67])
    expect(out[5]).toEqual(["2025-06-30", 163.33])
  })

  it("averages three fiscal years in a row, and none across a missing year", () => {
    expect(values(earningsOn("average3y", points, yearEnds))).toEqual([["2024-12-31", 130]])
    const gap = [p("2021-12-31", 90), p("2023-12-31", 120), p("2024-12-31", 170)]
    expect(earningsOn("average3y", gap, gap.map((x) => x.time))).toEqual([])
  })
})

describe("buildValuation", () => {
  it("holds book value from one balance sheet to the next", () => {
    const v = buildValuation(
      {
        price: daily("2025-09-01", "2026-10-09", () => 2000),
        fundamental: [p("2025-06-30", 1000), p("2025-12-31", 1250)],
        fx: null,
      },
      { range: "1Y", today: TODAY },
    )!
    expect(v.start).toBe("2025-10-09")
    expect(v.end).toBe("2026-10-09")
    expect(v.limitedBy).toBeNull()
    expect(v.reports).toEqual(["2025-06-30", "2025-12-31"])
    const at = (time: string) => v.ratio.levels.find((x) => x.time === time)!.value
    expect(at("2025-12-30")).toBe(2)
    expect(at("2025-12-31")).toBe(1.6)
    expect(v.fundamental.change.at(-1)!.value).toBeCloseTo(25)
    expect(v.ratio.change.at(-1)!.value).toBeCloseTo(-20)
    expect(v.attribution).toMatchObject({ price: 0, driver: "fundamental" })
  })

  it("starts on a given date instead of the range's start", () => {
    const v = buildValuation(
      {
        price: daily("2025-09-01", "2026-10-09", (time) => (time < "2026-07-01" ? 2000 : 1500)),
        fundamental: [p("2025-06-30", 1000)],
        fx: null,
      },
      { range: "5Y", start: "2026-06-15", today: TODAY },
    )!
    expect(v.start).toBe("2026-06-15")
    expect(v.limitedBy).toBeNull()
    expect(v.attribution).toMatchObject({ price: -0.25, fundamental: 0, driver: "price" })
  })

  it("starts at the first balance sheet when the range reaches further back", () => {
    const v = buildValuation(
      { price: daily("2020-01-01", "2026-10-09", () => 500), fundamental: [p("2022-12-31", 400), p("2025-12-31", 450)], fx: null },
      { range: "5Y", today: TODAY },
    )!
    expect(v.start).toBe("2022-12-31")
    expect(v.limitedBy).toBe("reports")
    expect(v.price.levels).toHaveLength(v.fundamental.levels.length)
  })

  it("says so when a recent listing is what shortens the period", () => {
    const v = buildValuation(
      { price: daily("2026-03-02", "2026-10-09", () => 500), fundamental: [p("2022-12-31", 400)], fx: null },
      { range: "5Y", today: TODAY },
    )!
    expect(v.start).toBe("2026-03-02")
    expect(v.limitedBy).toBe("price")
    expect(v.reports).toEqual(["2022-12-31"])
  })

  it("converts book value reported in another currency at each day's rate", () => {
    const v = buildValuation(
      {
        price: daily("2025-09-01", "2026-10-09", () => 12000),
        fundamental: [p("2025-06-30", 0.075)],
        fx: daily("2025-09-01", "2026-10-09", (time) => (time < "2026-01-01" ? 16000 : 20000)),
      },
      { range: "1Y", today: TODAY },
    )!
    expect(v.fundamental.levels[0].value).toBeCloseTo(1200)
    expect(v.fundamental.levels.at(-1)!.value).toBeCloseTo(1500)
    expect(v.ratio.levels.at(-1)!.value).toBeCloseTo(8)
    // A weaker home currency grew book value, so P/BV fell at a flat price.
    expect(v.attribution.driver).toBe("fundamental")
  })

  it("skips the years a company had no positive equity", () => {
    const price = daily("2024-01-01", "2026-10-09", () => 100)
    const recovered = buildValuation(
      { price, fundamental: [p("2023-12-31", 50), p("2024-12-31", -5), p("2025-12-31", 10)], fx: null },
      { range: "5Y", today: TODAY },
    )!
    expect(recovered.start).toBe("2025-12-31")
    expect(recovered.limitedBy).toBe("negative")
    expect(recovered.reports).toEqual(["2025-12-31"])

    const stillNegative = buildValuation(
      { price, fundamental: [p("2024-12-31", 50), p("2025-12-31", -5)], fx: null },
      { range: "5Y", today: TODAY },
    )
    expect(stillNegative).toBeNull()
  })
})
