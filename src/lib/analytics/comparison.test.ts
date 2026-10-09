import { describe, expect, it } from "vitest"
import type { PriceHistory, PricePoint } from "@/lib/providers/types"
import { buildComparison } from "./comparison"

const TODAY = new Date(2026, 9, 9) // Fri 9 Oct 2026, local time

function history(symbol: string, currency: string, points: PricePoint[]): PriceHistory {
  return { symbol, name: symbol, currency, exchange: null, instrumentType: null, points }
}

function daily(start: string, end: string, value: (i: number) => number): PricePoint[] {
  const out: PricePoint[] = []
  for (let t = Date.parse(`${start}T00:00:00Z`), i = 0; t <= Date.parse(`${end}T00:00:00Z`); t += 86_400_000, i++) {
    out.push({ time: new Date(t).toISOString().slice(0, 10), value: value(i) })
  }
  return out
}

describe("buildComparison", () => {
  it("converts foreign assets and plots holding the base currency as flat", () => {
    const usdidr = daily("2025-10-01", "2026-10-09", () => 16000)
    const spx = history("^GSPC", "USD", daily("2025-10-01", "2026-10-09", (i) => 100 + i))
    const c = buildComparison(
      [
        { key: "spx", instrument: { kind: "ticker", symbol: "^GSPC" }, history: spx, fx: usdidr },
        { key: "usd", instrument: { kind: "cash", currency: "USD" }, fx: usdidr },
        { key: "idr", instrument: { kind: "cash", currency: "IDR" } },
      ],
      { baseCurrency: "IDR", range: "1Y", today: TODAY },
    )
    expect(c.start).toBe("2025-10-09")
    expect(c.limitedBy).toBeNull()
    const [s, usd, idr] = c.series
    expect(s.levels[0].value).toBe((100 + 8) * 16000)
    expect(usd.metrics!.totalReturn).toBe(0)
    expect(idr.change.every((x) => x.value === 0)).toBe(true)
  })

  it("starts every series when the youngest one begins", () => {
    const c = buildComparison(
      [
        { key: "old", instrument: { kind: "ticker", symbol: "OLD" }, history: history("OLD", "IDR", daily("2020-01-01", "2026-10-09", () => 5)) },
        { key: "new", instrument: { kind: "ticker", symbol: "NEW" }, history: history("NEW", "IDR", daily("2026-03-02", "2026-10-09", () => 5)) },
        { key: "7%", instrument: { kind: "fixed", rate: 7 } },
      ],
      { baseCurrency: "IDR", range: "5Y", today: TODAY },
    )
    expect(c.start).toBe("2026-03-02")
    expect(c.limitedBy).toBe("new")
    for (const s of c.series) expect(s.levels[0].time).toBe("2026-03-02")
  })

  it("leaves out series whose FX rate has not loaded", () => {
    const spx = history("^GSPC", "USD", daily("2026-01-01", "2026-10-09", () => 1))
    const c = buildComparison([{ key: "spx", instrument: { kind: "ticker", symbol: "^GSPC" }, history: spx }], {
      baseCurrency: "IDR",
      range: "1Y",
      today: TODAY,
    })
    expect(c.series).toEqual([])
  })
})
