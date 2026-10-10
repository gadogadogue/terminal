import { describe, expect, it } from "vitest"
import type { PricePoint } from "@/lib/providers/types"
import { attributeChange, buildValuation } from "./valuation"

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
    expect(a.pbv).toBeCloseTo(-0.36) // 0.8 / 1.25
    expect(a.bookEffect).toBeCloseTo(-0.2)
    expect(a.driver).toBe("both")
    expect(a.priceShare).toBeCloseTo(0.5) // ln 0.8 = -ln 1.25
  })

  it("gives the price all of it when book value did not move", () => {
    const a = attributeChange(-0.1, 0)
    expect(a.pbv).toBeCloseTo(-0.1)
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
    expect(book.pbv).toBeCloseTo(-0.3)
    expect(book.driver).toBe("book")
    expect(book.priceShare!).toBeLessThan(0)
  })

  it("calls P/BV unchanged when price and book value moved together", () => {
    expect(attributeChange(0.1, 0.1)).toMatchObject({ driver: "none", priceShare: null })
  })
})

describe("buildValuation", () => {
  it("holds book value from one balance sheet to the next", () => {
    const v = buildValuation(
      {
        price: daily("2025-09-01", "2026-10-09", () => 2000),
        book: [p("2025-06-30", 1000), p("2025-12-31", 1250)],
        fx: null,
      },
      { range: "1Y", today: TODAY },
    )!
    expect(v.start).toBe("2025-10-09")
    expect(v.end).toBe("2026-10-09")
    expect(v.limitedBy).toBeNull()
    expect(v.reports).toEqual(["2025-06-30", "2025-12-31"])
    const at = (time: string) => v.pbv.levels.find((x) => x.time === time)!.value
    expect(at("2025-12-30")).toBe(2)
    expect(at("2025-12-31")).toBe(1.6)
    expect(v.book.change.at(-1)!.value).toBeCloseTo(25)
    expect(v.pbv.change.at(-1)!.value).toBeCloseTo(-20)
    expect(v.attribution).toMatchObject({ price: 0, driver: "book" })
  })

  it("starts at the first balance sheet when the range reaches further back", () => {
    const v = buildValuation(
      { price: daily("2020-01-01", "2026-10-09", () => 500), book: [p("2022-12-31", 400), p("2025-12-31", 450)], fx: null },
      { range: "5Y", today: TODAY },
    )!
    expect(v.start).toBe("2022-12-31")
    expect(v.limitedBy).toBe("book")
    expect(v.price.levels).toHaveLength(v.book.levels.length)
  })

  it("says so when a recent listing is what shortens the period", () => {
    const v = buildValuation(
      { price: daily("2026-03-02", "2026-10-09", () => 500), book: [p("2022-12-31", 400)], fx: null },
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
        book: [p("2025-06-30", 0.075)],
        fx: daily("2025-09-01", "2026-10-09", (time) => (time < "2026-01-01" ? 16000 : 20000)),
      },
      { range: "1Y", today: TODAY },
    )!
    expect(v.book.levels[0].value).toBeCloseTo(1200)
    expect(v.book.levels.at(-1)!.value).toBeCloseTo(1500)
    expect(v.pbv.levels.at(-1)!.value).toBeCloseTo(8)
    // A weaker home currency grew book value, so P/BV fell at a flat price.
    expect(v.attribution.driver).toBe("book")
  })

  it("skips the years a company had no positive equity", () => {
    const price = daily("2024-01-01", "2026-10-09", () => 100)
    const recovered = buildValuation(
      { price, book: [p("2023-12-31", 50), p("2024-12-31", -5), p("2025-12-31", 10)], fx: null },
      { range: "5Y", today: TODAY },
    )!
    expect(recovered.start).toBe("2025-12-31")
    expect(recovered.reports).toEqual(["2025-12-31"])

    const stillNegative = buildValuation(
      { price, book: [p("2024-12-31", 50), p("2025-12-31", -5)], fx: null },
      { range: "5Y", today: TODAY },
    )
    expect(stillNegative).toBeNull()
  })
})
