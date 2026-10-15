import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { defaultFallScreen } from "@/lib/analytics/pbv-fall"
import { defaultScreen, type Screen } from "@/lib/analytics/screener"
import { defaultWorkspace } from "./defaults"
import { parseWatchlistFile, toWatchlistFile } from "./file"
import { setLineDash, setSeriesColor, togglePlotted } from "./state"

describe("watchlist file", () => {
  it("round-trips a workspace", () => {
    const ws = defaultWorkspace()
    const back = parseWatchlistFile(JSON.parse(JSON.stringify(toWatchlistFile(ws))))
    expect(back.watchlist).toEqual(ws.watchlist)
    expect(back.benchmarks).toEqual(ws.benchmarks)
    expect(Object.keys(back.plotted).sort()).toEqual(Object.keys(ws.plotted).sort())
  })

  it("accepts a bare list of symbols and adds default benchmarks", () => {
    const ws = parseWatchlistFile(["BBCA.JK", "TLKM.JK", "BBCA.JK"])
    expect(ws.watchlist).toEqual([
      { kind: "ticker", symbol: "BBCA.JK" },
      { kind: "ticker", symbol: "TLKM.JK" },
    ])
    expect(ws.benchmarks).toEqual(defaultWorkspace().benchmarks)
    expect(Object.keys(ws.plotted)).toContain("ticker:BBCA.JK")
  })

  it("parses the example file shipped in the repo", () => {
    const example = JSON.parse(readFileSync(new URL("../../../examples/watchlist.example.json", import.meta.url), "utf8"))
    const ws = parseWatchlistFile(example)
    expect(ws.watchlist).toHaveLength(5)
    expect(ws.benchmarks).toHaveLength(5)
    expect(Object.keys(ws.plotted)).toHaveLength(7)
    expect(ws.screener.filters).toEqual({ pbv: { max: 1.5 }, roe: { min: 0.12 }, valueTraded: { min: 1e9 } })
  })

  it("rejects malformed files with a readable message", () => {
    expect(() => parseWatchlistFile({ watchlist: [{ kind: "cash", currency: "rupiah" }] })).toThrow(/3-letter/)
    expect(() => parseWatchlistFile({ version: 99 })).toThrow(/newer version/)
  })
})

describe("screener in the file", () => {
  it("round-trips filters, sectors, sort and the P/BV fall screen", () => {
    const screener: Screen = {
      sectors: ["Financial Services"],
      filters: { pbv: { max: 1 }, roe: { min: 0.12 } },
      sort: { key: "roe", dir: "desc" },
      fall: { on: true, period: "6M", mark: 1.3, minFall: 0.5, cause: "book", sort: { key: "fall", dir: "asc" } },
    }
    const back = parseWatchlistFile(JSON.parse(JSON.stringify(toWatchlistFile({ ...defaultWorkspace(), screener }))))
    expect(back.screener).toEqual(screener)
  })

  it("defaults the parts of the P/BV fall screen it doesn't know", () => {
    const ws = parseWatchlistFile({
      watchlist: [],
      screener: { fall: { on: true, period: "2W", mark: 1.2, cause: "sentiment", sort: { key: "beta", dir: "asc" } } },
    })
    expect(ws.screener.fall).toEqual({ ...defaultFallScreen(), on: true, mark: 1.2 })
  })

  it("rejects a P/BV mark or fall that can't be one", () => {
    expect(() => parseWatchlistFile({ screener: { fall: { mark: 0 } } })).toThrow()
    expect(() => parseWatchlistFile({ screener: { fall: { minFall: 20 } } })).toThrow()
  })

  it("defaults when a file has no screener section", () => {
    expect(parseWatchlistFile(["BBCA.JK"]).screener).toEqual(defaultScreen())
  })

  it("skips metrics and sorts it doesn't know, and empty bounds", () => {
    const ws = parseWatchlistFile({
      watchlist: [],
      screener: {
        sectors: ["Energy", "Energy"],
        filters: { pbv: { max: 1.5 }, futureMetric: { min: 2 }, pe: {} },
        sort: { key: "futureMetric", dir: "desc" },
      },
    })
    expect(ws.screener).toEqual({ ...defaultScreen(), sectors: ["Energy"], filters: { pbv: { max: 1.5 } } })
  })

  it("rejects bounds that aren't numbers", () => {
    expect(() => parseWatchlistFile({ screener: { filters: { pbv: { max: "1" } } } })).toThrow()
  })
})

describe("plot slots", () => {
  it("keeps colors stable when another series is removed", () => {
    let ws = defaultWorkspace()
    const before = ws.plotted["ticker:^GSPC"]
    ws = togglePlotted(ws, "ticker:BBCA.JK").ws
    expect(ws.plotted["ticker:^GSPC"]).toBe(before)
    ws = togglePlotted(ws, "ticker:TLKM.JK").ws
    expect(ws.plotted["ticker:TLKM.JK"]).toBe(1) // reuses the freed slot
  })

  it("refuses a ninth series", () => {
    let ws = defaultWorkspace() // 7 plotted
    ws = togglePlotted(ws, "ticker:TLKM.JK").ws
    expect(togglePlotted(ws, "ticker:BTC-USD").ok).toBe(false)
  })
})

describe("line style", () => {
  it("swaps colors with the series already using one", () => {
    const ws = setSeriesColor(defaultWorkspace(), "ticker:^JKSE", 4)
    expect(ws.plotted["ticker:^JKSE"]).toBe(4)
    expect(ws.plotted["ticker:GC=F"]).toBe(0)
    expect(new Set(Object.values(ws.plotted)).size).toBe(Object.keys(ws.plotted).length)
  })

  it("takes a free color without moving others, and ignores unplotted series", () => {
    const before = defaultWorkspace()
    const ws = setSeriesColor(before, "ticker:^JKSE", 7)
    expect({ ...ws.plotted, "ticker:^JKSE": 0 }).toEqual(before.plotted)
    expect(setSeriesColor(before, "ticker:TLKM.JK", 7)).toBe(before)
  })

  it("stores only dashes that differ from the group default", () => {
    let ws = setLineDash(defaultWorkspace(), "ticker:BBCA.JK", "dotted")
    expect(ws.watchlist[1]).toEqual({ kind: "ticker", symbol: "BBCA.JK", name: "Bank Central Asia", line: "dotted" })
    ws = setLineDash(ws, "ticker:BBCA.JK", "solid")
    expect(ws.watchlist[1]).not.toHaveProperty("line")
    ws = setLineDash(ws, "fixed:7", "solid")
    expect(ws.benchmarks[0]).toEqual({ kind: "fixed", rate: 7, line: "solid" })
  })

  it("keeps colors and dashes through export and import", () => {
    let ws = setSeriesColor(defaultWorkspace(), "ticker:^JKSE", 5)
    ws = setLineDash(ws, "ticker:GC=F", "dotted")
    const back = parseWatchlistFile(JSON.parse(JSON.stringify(toWatchlistFile(ws))))
    expect(back.plotted).toEqual(ws.plotted)
    expect(back.benchmarks).toEqual(ws.benchmarks)
  })

  it("gives the first claim a duplicate color and fills the rest", () => {
    const ws = parseWatchlistFile({
      watchlist: [
        { kind: "ticker", symbol: "BBCA.JK", selected: true, color: 3 },
        { kind: "ticker", symbol: "TLKM.JK", selected: true, color: 3 },
        { kind: "ticker", symbol: "BBRI.JK", selected: true },
      ],
    })
    expect(ws.plotted).toEqual({ "ticker:BBCA.JK": 2, "ticker:TLKM.JK": 0, "ticker:BBRI.JK": 1 })
  })

  it("rejects colors outside the palette and unknown dashes", () => {
    expect(() => parseWatchlistFile({ watchlist: [{ kind: "ticker", symbol: "BBCA.JK", color: 9 }] })).toThrow()
    expect(() => parseWatchlistFile({ watchlist: [{ kind: "ticker", symbol: "BBCA.JK", line: "wavy" }] })).toThrow()
  })
})
