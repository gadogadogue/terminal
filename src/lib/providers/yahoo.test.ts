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

describe("yahoo history", () => {
  it("keeps dividends out of closes on the price basis", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({
        chart: {
          result: [
            {
              meta: { symbol: "BBCA.JK", currency: "IDR", exchangeTimezoneName: "Asia/Jakarta" },
              timestamp: [1791417600, 1791504000],
              indicators: { quote: [{ close: [9000, 9100] }], adjclose: [{ adjclose: [8800, 9100] }] },
            },
          ],
          error: null,
        },
      }),
    )
    const values = async (...basis: ["price"] | []) =>
      (await yahooProvider.history("BBCA.JK", "1y", ...basis)).points.map((p) => p.value)
    expect(await values()).toEqual([8800, 9100])
    expect(await values("price")).toEqual([9000, 9100])
  })
})

type Reported = [date: string, value: number] | null

/** Stubs Yahoo's fundamentals endpoint: each requested type answers with its series, or with none. */
function stubTimeseries(series: Record<string, Reported[]>, currencyCode = "IDR") {
  vi.stubGlobal("fetch", async (url: string) => {
    const types = (new URL(url).searchParams.get("type") ?? "").split(",")
    const result = types.map((type) => ({
      meta: { symbol: ["TEST.JK"], type: [type] },
      ...(series[type] && {
        [type]: series[type].map((item) => item && { asOfDate: item[0], currencyCode, reportedValue: { raw: item[1] } }),
      }),
    }))
    return Response.json({ timeseries: { result, error: null } })
  })
}

describe("yahoo book value", () => {
  it("divides equity by shares at each balance-sheet date, across annual and quarterly reports", async () => {
    stubTimeseries({
      annualCommonStockEquity: [["2024-12-31", 1000], ["2025-12-31", 1200]],
      annualOrdinarySharesNumber: [["2024-12-31", 10], ["2025-12-31", 10]],
      // Yahoo leaves a hole where it has no filing for a quarter.
      quarterlyCommonStockEquity: [["2025-12-31", 1200], null, ["2026-06-30", 1100]],
      quarterlyOrdinarySharesNumber: [["2025-12-31", 10], null, ["2026-06-30", 11]],
    })
    expect(await yahooProvider.bookValue!("TEST.JK")).toEqual({
      symbol: "TEST.JK",
      currency: "IDR",
      points: [
        { time: "2024-12-31", value: 100 },
        { time: "2025-12-31", value: 120 },
        { time: "2026-06-30", value: 100 },
      ],
    })
  })

  it("reports the currency of the accounts and falls back to broader fields", async () => {
    stubTimeseries({ annualStockholdersEquity: [["2025-12-31", -50]], annualShareIssued: [["2025-12-31", 1000]] }, "USD")
    const book = await yahooProvider.bookValue!("TEST.JK")
    expect(book.currency).toBe("USD")
    expect(book.points).toEqual([{ time: "2025-12-31", value: -0.05 }])
  })

  it("answers 404 for symbols without balance sheets", async () => {
    stubTimeseries({})
    await expect(yahooProvider.bookValue!("^JKSE")).rejects.toMatchObject({ status: 404 })
  })
})

describe("yahoo earnings", () => {
  it("divides 12-month net income by shares outstanding at year-ends and quarter-ends", async () => {
    stubTimeseries(
      {
        annualNetIncomeCommonStockholders: [["2024-12-31", 400], ["2025-12-31", 500]],
        trailingNetIncomeCommonStockholders: [["2026-06-30", 660]],
        annualOrdinarySharesNumber: [["2024-12-31", 100], ["2025-12-31", 100]],
        quarterlyOrdinarySharesNumber: [["2025-12-31", 100], ["2026-06-30", 110]],
      },
      "USD",
    )
    expect(await yahooProvider.earnings!("TEST.JK")).toEqual({
      symbol: "TEST.JK",
      currency: "USD",
      points: [
        { time: "2024-12-31", value: 4 },
        { time: "2025-12-31", value: 5 },
        { time: "2026-06-30", value: 6 },
      ],
      // The trailing 12 months to June are not a fiscal year.
      yearEnds: ["2024-12-31", "2025-12-31"],
    })
  })

  it("fills the quarters in between from EPS, on today's share count", async () => {
    stubTimeseries({
      annualNetIncome: [["2024-12-31", 400], ["2025-12-31", 500]],
      // Reported before a 10-for-1 split and never restated, unlike the share counts below.
      trailingDilutedEPS: [["2024-12-31", 40], ["2025-06-30", 45], ["2025-12-31", 5]],
      trailingDilutedAverageShares: [["2024-12-31", 10], ["2025-06-30", 10], ["2025-12-31", 100]],
      annualOrdinarySharesNumber: [["2024-12-31", 100], ["2025-12-31", 100]],
    })
    const { points } = await yahooProvider.earnings!("TEST.JK")
    expect(points).toEqual([
      { time: "2024-12-31", value: 4 },
      { time: "2025-06-30", value: 4.5 },
      { time: "2025-12-31", value: 5 },
    ])
  })

  it("leaves EPS out when it disagrees with net income", async () => {
    stubTimeseries({
      annualNetIncome: [["2024-12-31", 400], ["2025-12-31", 500]],
      trailingDilutedEPS: [["2024-12-31", 4], ["2025-06-30", 4.5], ["2025-12-31", 208]],
      trailingDilutedAverageShares: [["2024-12-31", 100], ["2025-06-30", 100], ["2025-12-31", 100]],
      annualOrdinarySharesNumber: [["2024-12-31", 100], ["2025-12-31", 100]],
    })
    const { points } = await yahooProvider.earnings!("TEST.JK")
    expect(points.map((p) => p.time)).toEqual(["2024-12-31", "2025-12-31"])
  })

  it("keeps losses, and answers 404 for symbols without income statements", async () => {
    stubTimeseries({ annualNetIncome: [["2025-12-31", -300]], annualShareIssued: [["2025-12-31", 100]] })
    expect((await yahooProvider.earnings!("TEST.JK")).points).toEqual([{ time: "2025-12-31", value: -3 }])
    stubTimeseries({})
    await expect(yahooProvider.earnings!("^JKSE")).rejects.toMatchObject({ status: 404 })
  })
})
