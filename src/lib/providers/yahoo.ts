import { normalizeCurrency } from "@/lib/currency"
import { intervalFor, type FetchRange } from "@/lib/ranges"
import {
  ProviderError,
  type DataProvider,
  type PriceHistory,
  type PricePoint,
  type SearchResult,
} from "./types"

/**
 * Yahoo Finance's public chart & search endpoints. No API key, global
 * coverage (IDX via `.JK`, FX via `USDIDR=X`, futures via `GC=F`, crypto via
 * `BTC-USD`). It is unofficial and can change without notice, which is why it
 * sits behind the DataProvider interface.
 */

const CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/"
const SEARCH_URL = "https://query2.finance.yahoo.com/v1/finance/search"
const HEADERS = { "User-Agent": "Mozilla/5.0", Accept: "application/json" }

/**
 * IDX is the home market. Its codes are four letters, and Yahoo search only
 * finds them with the suffix: "SMAR" returns US names, "SMAR.JK" the stock.
 */
const HOME_SUFFIX = ".JK"
const HOME_EXCHANGE = "JKT"
const HOME_CODE = /^[A-Za-z]{4}$/

const SEARCHABLE_TYPES = new Set([
  "EQUITY",
  "ETF",
  "MUTUALFUND",
  "INDEX",
  "CURRENCY",
  "CRYPTOCURRENCY",
  "FUTURE",
])

interface ChartResponse {
  chart: {
    result: Array<{
      meta: {
        symbol: string
        currency?: string
        longName?: string
        shortName?: string
        fullExchangeName?: string
        exchangeName?: string
        instrumentType?: string
        exchangeTimezoneName?: string
      }
      timestamp?: number[]
      indicators: {
        quote: Array<{ close?: Array<number | null> }>
        adjclose?: Array<{ adjclose?: Array<number | null> }>
      }
    }> | null
    error: { code: string; description: string } | null
  }
}

interface SearchResponse {
  quotes?: Array<{
    symbol: string
    shortname?: string
    longname?: string
    exchange?: string
    exchDisp?: string
    typeDisp?: string
    quoteType?: string
    isYahooFinance?: boolean
  }>
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>()

/** Formats a unix timestamp as the calendar date in the exchange's timezone. */
function localDate(timestampSec: number, timeZone: string): string {
  let fmt = dateFormatters.get(timeZone)
  if (!fmt) {
    try {
      fmt = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    } catch {
      fmt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" })
    }
    dateFormatters.set(timeZone, fmt)
  }
  const parts = Object.fromEntries(fmt.formatToParts(new Date(timestampSec * 1000)).map((p) => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

async function getJson<T>(url: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, { headers: HEADERS })
  } catch {
    throw new ProviderError("Could not reach Yahoo Finance")
  }
  if (res.status === 429) throw new ProviderError("Yahoo Finance rate limit reached, try again shortly", 429)
  // The chart endpoint answers unknown symbols with 404 and a JSON body.
  if (!res.ok && res.status !== 404) throw new ProviderError(`Yahoo Finance responded ${res.status}`)
  return (await res.json()) as T
}

async function history(symbol: string, range: FetchRange): Promise<PriceHistory> {
  const params = new URLSearchParams({ range, interval: intervalFor(range), events: "div,split" })
  const data = await getJson<ChartResponse>(`${CHART_URL}${encodeURIComponent(symbol)}?${params}`)

  const result = data.chart.result?.[0]
  if (!result) {
    throw new ProviderError(data.chart.error?.description ?? `No data for ${symbol}`, 404)
  }

  const { meta } = result
  const { currency, divisor } = normalizeCurrency(meta.currency)
  const timeZone = meta.exchangeTimezoneName ?? "UTC"
  const timestamps = result.timestamp ?? []
  const closes = result.indicators.quote[0]?.close ?? []
  const adjCloses = result.indicators.adjclose?.[0]?.adjclose ?? []

  const points: PricePoint[] = []
  for (let i = 0; i < timestamps.length; i++) {
    const raw = adjCloses[i] ?? closes[i]
    if (raw == null || !Number.isFinite(raw) || raw <= 0) continue
    const point = { time: localDate(timestamps[i], timeZone), value: raw / divisor }
    // Yahoo repeats the live session as an extra row; keep the latest.
    if (points.length && points[points.length - 1].time === point.time) points[points.length - 1] = point
    else points.push(point)
  }

  if (points.length === 0) throw new ProviderError(`No price history for ${symbol}`, 404)

  return {
    symbol: meta.symbol,
    name: meta.longName ?? meta.shortName ?? meta.symbol,
    currency,
    exchange: meta.fullExchangeName ?? meta.exchangeName ?? null,
    instrumentType: meta.instrumentType ?? null,
    points,
  }
}

async function searchQuotes(query: string): Promise<NonNullable<SearchResponse["quotes"]>> {
  const params = new URLSearchParams({
    q: query,
    quotesCount: "12",
    newsCount: "0",
    listsCount: "0",
    enableFuzzyQuery: "false",
  })
  const data = await getJson<SearchResponse>(`${SEARCH_URL}?${params}`)
  return data.quotes ?? []
}

async function search(query: string): Promise<SearchResult[]> {
  const queries = HOME_CODE.test(query) ? [query, `${query.toUpperCase()}${HOME_SUFFIX}`] : [query]
  const quotes = (await Promise.all(queries.map(searchQuotes))).flat()
  const seen = new Set<string>()
  return quotes
    .filter((q) => {
      if (!q.symbol || seen.has(q.symbol)) return false
      seen.add(q.symbol)
      return q.isYahooFinance !== false && SEARCHABLE_TYPES.has(q.quoteType ?? "")
    })
    // Stable sort: home-market listings first, otherwise Yahoo's ranking.
    .sort((a, b) => Number(b.exchange === HOME_EXCHANGE) - Number(a.exchange === HOME_EXCHANGE))
    .map((q) => ({
      symbol: q.symbol,
      name: q.longname ?? q.shortname ?? q.symbol,
      exchange: q.exchDisp ?? null,
      type: q.typeDisp ?? null,
    }))
}

export const yahooProvider: DataProvider = {
  id: "yahoo",
  name: "Yahoo Finance",
  history,
  search,
}
