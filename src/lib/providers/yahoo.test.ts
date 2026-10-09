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

/** A stock in the fake market. Yahoo's quotes don't carry the sector; only its filter knows it. */
type Listed = { sector: string | null; quote: Record<string, unknown> }

const listed = (symbol: string, sector: string | null, fields: Record<string, unknown> = {}): Listed => ({
  sector,
  quote: {
    symbol,
    shortName: `${symbol} Tbk`,
    currency: "IDR",
    financialCurrency: "IDR",
    regularMarketPrice: 1000,
    regularMarketTime: 1791535383,
    bookValue: 500,
    epsTrailingTwelveMonths: 100,
    fiftyTwoWeekChangePercent: -18.9,
    ...fields,
  },
})

/**
 * Stubs Yahoo's session, screener and FX chart endpoints over a fake market.
 * Crumbs are issued from `crumbs` in order; only `validCrumb` is accepted.
 */
function stubScreener({
  stocks,
  crumbs = ["crumb-1"],
  validCrumb = crumbs[crumbs.length - 1],
  usdidr = 16000 as number | null,
}: {
  stocks: Listed[]
  crumbs?: string[]
  validCrumb?: string
  usdidr?: number | null
}) {
  const calls = { crumbs: 0, pages: [] as { sector: string | undefined; offset: number }[] }
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const u = new URL(url)
    if (u.hostname === "fc.yahoo.com") {
      return new Response("", { status: 404, headers: { "set-cookie": "A3=session; Domain=.yahoo.com; Path=/" } })
    }
    if (u.pathname.endsWith("/getcrumb")) {
      return new Response(crumbs[Math.min(calls.crumbs++, crumbs.length - 1)])
    }
    if (u.pathname.endsWith("/screener")) {
      if (u.searchParams.get("crumb") !== validCrumb) {
        return Response.json({ finance: { result: null, error: { description: "Invalid Crumb" } } }, { status: 401 })
      }
      const body = JSON.parse(String(init?.body))
      const sector = body.query.operands.find((o: { operands: string[] }) => o.operands[0] === "sector")?.operands[1]
      const matching = stocks.filter((s) => sector === undefined || s.sector === sector)
      if (body.size > 1) calls.pages.push({ sector, offset: body.offset })
      const quotes = matching.slice(body.offset, body.offset + body.size).map((s) => s.quote)
      return Response.json({ finance: { result: [{ total: matching.length, quotes }], error: null } })
    }
    if (u.pathname.includes("/chart/USDIDR")) {
      if (usdidr == null) return Response.json({ chart: { result: null, error: { description: "No data" } } }, { status: 404 })
      return Response.json({
        chart: {
          result: [
            {
              meta: { symbol: "USDIDR=X", currency: "IDR", exchangeTimezoneName: "UTC" },
              timestamp: [1791417600, 1791504000],
              indicators: { quote: [{ close: [15900, usdidr] }] },
            },
          ],
          error: null,
        },
      })
    }
    throw new Error(`Unexpected request to ${url}`)
  })
  return calls
}

/** A fresh module, so each test starts without a cached screener session. */
async function freshProvider() {
  vi.resetModules()
  return (await import("./yahoo")).yahooProvider
}

describe("yahoo screener", () => {
  it("tags each stock with its sector and fixes book values reported in USD", async () => {
    stubScreener({
      stocks: [
        listed("BBCA.JK", "Financial Services", { dividendRate: 381 }),
        // Book value per share arrives in USD while the price is in IDR.
        listed("BYAN.JK", "Energy", { financialCurrency: "USD", regularMarketPrice: 11850, bookValue: 0.074, dividendYield: 0 }),
      ],
    })
    const snapshot = await (await freshProvider()).screen!()
    expect(snapshot.market).toBe("IDX")
    expect(snapshot.currency).toBe("IDR")
    expect(snapshot.asOf).toBe(new Date(1791535383 * 1000).toISOString())

    const bySymbol = Object.fromEntries(snapshot.stocks.map((s) => [s.symbol, s]))
    expect(bySymbol["BBCA.JK"]).toMatchObject({
      name: "BBCA.JK",
      sector: "Financial Services",
      bookValue: 500,
      dividendRate: 381,
    })
    expect(bySymbol["BBCA.JK"].reportingCurrency).toBeUndefined()
    expect(bySymbol["BBCA.JK"].change52w).toBeCloseTo(-0.189, 6)
    expect(bySymbol["BYAN.JK"]).toMatchObject({ sector: "Energy", reportingCurrency: "USD", dividendRate: 0 })
    expect(bySymbol["BYAN.JK"].bookValue).toBeCloseTo(0.074 * 16000, 6)
  })

  it("leaves a converted book value empty when the FX rate is unavailable", async () => {
    stubScreener({ stocks: [listed("ADRO.JK", "Energy", { financialCurrency: "USD", bookValue: 0.16 })], usdidr: null })
    const [stock] = (await (await freshProvider()).screen!()).stocks
    expect(stock.bookValue).toBeNull()
    expect(stock.reportingCurrency).toBe("USD")
  })

  it("picks up listings that have no sector", async () => {
    stubScreener({ stocks: [listed("TLKM.JK", "Communication Services"), listed("NEWW.JK", null)] })
    const { stocks } = await (await freshProvider()).screen!()
    expect(stocks.map((s) => [s.symbol, s.sector])).toEqual([
      ["TLKM.JK", "Communication Services"],
      ["NEWW.JK", null],
    ])
  })

  it("pages through sectors larger than one response", async () => {
    const industrials = Array.from({ length: 260 }, (_, i) => listed(`I${String(i).padStart(3, "0")}.JK`, "Industrials"))
    const calls = stubScreener({ stocks: industrials })
    const { stocks } = await (await freshProvider()).screen!()
    expect(stocks).toHaveLength(260)
    expect(calls.pages.filter((p) => p.sector === "Industrials").map((p) => p.offset)).toEqual([0, 250])
  })

  it("renews an expired session once, however many requests saw it fail", async () => {
    const calls = stubScreener({ stocks: [listed("BBRI.JK", "Financial Services")], crumbs: ["stale", "fresh"] })
    const { stocks } = await (await freshProvider()).screen!()
    expect(stocks.map((s) => s.symbol)).toEqual(["BBRI.JK"])
    expect(calls.crumbs).toBe(2)
  })
})
