import { describe, expect, it } from "vitest"
import type { Holder, HolderKind, Ownership } from "@/lib/providers/types"
import { buildNetwork, holdersOf, ownershipSplit } from "./ownership"

const holder = (name: string, percent: number, kind: HolderKind = "fund", family?: string): Holder => ({
  name,
  kind,
  ...(family && { family }),
  percent,
  shares: percent * 1e9,
  value: null,
  change: null,
  reported: "2026-06-30",
})

const company = (symbol: string, holders: Holder[], insiders: number | null = 0.6): Ownership => ({
  symbol,
  name: `${symbol} Tbk`,
  currency: "IDR",
  price: null,
  insiders,
  institutions: 0.2,
  holders,
})

const ALL = { kinds: ["company", "person", "institution", "fund"], sharedOnly: false } as const

describe("buildNetwork", () => {
  it("makes one node of a holder that owns several stocks", () => {
    const network = buildNetwork(
      [
        company("BBCA.JK", [holder("Vanguard EM", 0.006), holder("EUPAC Fund", 0.004)]),
        company("BBRI.JK", [holder("Vanguard EM", 0.009), holder("Pzena EM Value", 0.003)]),
      ],
      ALL,
    )
    expect(network.stocks.map((s) => s.symbol)).toEqual(["BBCA.JK", "BBRI.JK"])
    // The shared holder leads, sized by its largest stake.
    expect(network.holders.map((h) => [h.name, h.stocks, h.stake])).toEqual([
      ["Vanguard EM", 2, 0.009],
      ["EUPAC Fund", 1, 0.004],
      ["Pzena EM Value", 1, 0.003],
    ])
    expect(network.stakes).toHaveLength(4)
    const shared = network.holders[0].id
    expect(network.stakes.filter((s) => s.holder === shared).map((s) => s.symbol)).toEqual(["BBCA.JK", "BBRI.JK"])
  })

  it("tells holders apart by kind and by the trust they are registered under", () => {
    const network = buildNetwork(
      [
        company("AAPL", [holder("Vanguard", 0.07, "institution"), holder("Growth Fund", 0.01, "fund", "Trust A")]),
        company("MSFT", [holder("vanguard ", 0.08, "institution"), holder("Growth Fund", 0.01, "fund", "Trust B")]),
      ],
      ALL,
    )
    // Spelling differences in case and spacing are the same holder; the two Growth Funds are not.
    expect(network.holders.map((h) => [h.name, h.family, h.stocks])).toEqual([
      ["Vanguard", undefined, 2],
      ["Growth Fund", "Trust A", 1],
      ["Growth Fund", "Trust B", 1],
    ])
  })

  it("leaves out the kinds that are switched off and stakes too small to matter", () => {
    const network = buildNetwork(
      [
        company("TSLA", [
          holder("MUSK ELON", 0.18, "person"),
          holder("Blackrock", 0.05, "institution"),
          holder("A DIRECTOR", 0.0002, "person"),
        ]),
      ],
      { kinds: ["person"], sharedOnly: false },
    )
    expect(network.holders.map((h) => h.name)).toEqual(["MUSK ELON"])
    expect(network.stakes).toHaveLength(1)
  })

  it("keeps only holders of two or more stocks when asked, and every stock either way", () => {
    const network = buildNetwork(
      [
        company("BBCA.JK", [holder("Vanguard EM", 0.006), holder("EUPAC Fund", 0.004)]),
        company("BBRI.JK", [holder("Vanguard EM", 0.009)]),
        company("SMAR.JK", []),
      ],
      { ...ALL, sharedOnly: true },
    )
    expect(network.stocks).toHaveLength(3)
    expect(network.holders.map((h) => h.name)).toEqual(["Vanguard EM"])
    expect(network.stakes.map((s) => s.symbol)).toEqual(["BBCA.JK", "BBRI.JK"])
  })

  it("counts a stock or a holder listed twice once, at the larger stake", () => {
    const network = buildNetwork(
      [
        company("BBCA.JK", [holder("Vanguard EM", 0.006), holder("Vanguard EM", 0.008)]),
        company("BBCA.JK", [holder("Someone Else", 0.5)]),
      ],
      ALL,
    )
    expect(network.stocks).toHaveLength(1)
    expect(network.holders.map((h) => [h.name, h.stocks, h.stake])).toEqual([["Vanguard EM", 1, 0.008]])
    expect(network.stakes.map((s) => s.holding.percent)).toEqual([0.008])
  })
})

describe("holdersOf", () => {
  it("lists a stock's holders largest first, with the other stocks each one owns", () => {
    const network = buildNetwork(
      [
        company("BBCA.JK", [holder("EUPAC Fund", 0.004), holder("Vanguard EM", 0.006)]),
        company("BBRI.JK", [holder("Vanguard EM", 0.009)]),
        company("TLKM.JK", [holder("Vanguard EM", 0.005)]),
      ],
      ALL,
    )
    expect(holdersOf(network, "BBCA.JK").map((row) => [row.holder.name, row.holding.percent, row.alsoHolds])).toEqual([
      ["Vanguard EM", 0.006, ["BBRI.JK", "TLKM.JK"]],
      ["EUPAC Fund", 0.004, []],
    ])
    expect(holdersOf(network, "ZZZZ.JK")).toEqual([])
  })
})

describe("ownershipSplit", () => {
  it("leaves everyone else what insiders and institutions don't hold", () => {
    const split = ownershipSplit({ insiders: 0.6, institutions: 0.25 })!
    expect(split.insiders).toBe(0.6)
    expect(split.institutions).toBe(0.25)
    expect(split.others).toBeCloseTo(0.15, 10)
  })

  it("treats a missing total as nothing held, unless both are missing", () => {
    expect(ownershipSplit({ insiders: null, institutions: 0.3 })).toEqual({ insiders: 0, institutions: 0.3, others: 0.7 })
    expect(ownershipSplit({ insiders: null, institutions: null })).toBeNull()
  })

  it("never adds up to more than the whole company", () => {
    // Totals from different filing dates can overlap.
    const split = ownershipSplit({ insiders: 0.9915, institutions: 0.05 })!
    expect(split.insiders).toBe(0.9915)
    expect(split.institutions).toBeCloseTo(0.0085, 10)
    expect(split.others).toBe(0)
  })
})
