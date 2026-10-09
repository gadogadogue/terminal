import { afterEach, describe, expect, it, vi } from "vitest"
import { yahooProvider } from "./yahoo"

type Quote = { symbol: string; quoteType: string; exchange: string; exchDisp: string; shortname: string }

const quote = (symbol: string, exchange: string, quoteType = "EQUITY"): Quote => ({
  symbol,
  quoteType,
  exchange,
  exchDisp: exchange === "JKT" ? "Jakarta" : exchange,
  shortname: symbol,
})

/** Stubs Yahoo search with canned answers per query; returns the queries made. */
function stubSearch(answers: Record<string, Quote[]>): string[] {
  const queries: string[] = []
  vi.stubGlobal("fetch", async (url: string) => {
    const q = new URL(url).searchParams.get("q") ?? ""
    queries.push(q)
    return Response.json({ quotes: answers[q] ?? [] })
  })
  return queries
}

afterEach(() => vi.unstubAllGlobals())

describe("yahoo search", () => {
  it("finds an IDX stock from its bare four-letter code", async () => {
    const queries = stubSearch({
      smar: [quote("BIRD", "NMS"), quote("SND", "NMS")],
      "SMAR.JK": [quote("SMAR.JK", "JKT")],
    })
    const results = await yahooProvider.search("smar")
    expect(queries).toEqual(["smar", "SMAR.JK"])
    expect(results.map((r) => r.symbol)).toEqual(["SMAR.JK", "BIRD", "SND"])
    expect(results[0].exchange).toBe("Jakarta")
  })

  it("ranks Jakarta listings first and drops duplicates", async () => {
    stubSearch({
      bbca: [quote("BBCA", "BTS", "ETF"), quote("BBCA.JK", "JKT"), quote("BBCA.BA", "BUE")],
      "BBCA.JK": [quote("BBCA.JK", "JKT")],
    })
    const results = await yahooProvider.search("bbca")
    expect(results.map((r) => r.symbol)).toEqual(["BBCA.JK", "BBCA", "BBCA.BA"])
  })

  it("only probes the home market for code-shaped queries", async () => {
    const queries = stubSearch({ "sinar mas": [quote("SMAR.JK", "JKT")] })
    await yahooProvider.search("sinar mas")
    await yahooProvider.search("smar.jk")
    await yahooProvider.search("aapl1")
    expect(queries).toEqual(["sinar mas", "smar.jk", "aapl1"])
  })
})
