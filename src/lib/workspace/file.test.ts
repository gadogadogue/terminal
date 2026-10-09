import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { defaultWorkspace } from "./defaults"
import { parseWatchlistFile, toWatchlistFile } from "./file"
import { togglePlotted } from "./state"

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
  })

  it("rejects malformed files with a readable message", () => {
    expect(() => parseWatchlistFile({ watchlist: [{ kind: "cash", currency: "rupiah" }] })).toThrow(/3-letter/)
    expect(() => parseWatchlistFile({ version: 99 })).toThrow(/newer version/)
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
