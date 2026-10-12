import { fxSymbol, normalizeCurrency } from "@/lib/currency"
import { intervalFor, type FetchRange } from "@/lib/ranges"
import {
  ProviderError,
  type BookValueHistory,
  type DataProvider,
  type EarningsHistory,
  type MarketSnapshot,
  type PriceBasis,
  type PriceHistory,
  type PricePoint,
  type SearchResult,
  type StockSnapshot,
} from "./types"

/**
 * Yahoo Finance's public chart & search endpoints. No API key, global
 * coverage (IDX via `.JK`, FX via `USDIDR=X`, futures via `GC=F`, crypto via
 * `BTC-USD`). It is unofficial and can change without notice, which is why it
 * sits behind the DataProvider interface.
 */

const CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/"
const TIMESERIES_URL = "https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/"
const SEARCH_URL = "https://query2.finance.yahoo.com/v1/finance/search"
const SCREENER_URL = "https://query2.finance.yahoo.com/v1/finance/screener"
const CRUMB_URL = "https://query2.finance.yahoo.com/v1/test/getcrumb"
/** Answers 404, but sets the cookie that the screener's crumb is tied to. */
const COOKIE_URL = "https://fc.yahoo.com/"
const USER_AGENT = "Mozilla/5.0"
const HEADERS = { "User-Agent": USER_AGENT, Accept: "application/json" }

/**
 * IDX is the home market. Its codes are four letters, and Yahoo search only
 * finds them with the suffix: "SMAR" returns US names, "SMAR.JK" the stock.
 */
const HOME_SUFFIX = ".JK"
const HOME_EXCHANGE = "JKT"
const HOME_CODE = /^[A-Za-z]{4}$/
const HOME_REGION = "id"
const HOME_MARKET = "IDX"

/**
 * Screener quotes don't say which sector a stock is in, so the screener
 * fetches the market one sector at a time.
 */
const SECTORS = [
  "Basic Materials",
  "Communication Services",
  "Consumer Cyclical",
  "Consumer Defensive",
  "Energy",
  "Financial Services",
  "Healthcare",
  "Industrials",
  "Real Estate",
  "Technology",
  "Utilities",
]
/** The largest page the screener serves. */
const SCREEN_PAGE = 250

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

/** One reported figure. Yahoo leaves holes in the list as nulls. */
type ReportedValue = { asOfDate?: string; currencyCode?: string; reportedValue?: { raw?: number } } | null

interface TimeseriesResponse {
  timeseries: {
    /** One entry per requested type; the values sit under a key named after the type. */
    result: Array<{ meta: { type: string[] } } & Record<string, unknown>> | null
    error: { code: string; description: string } | null
  }
}

/**
 * Balance-sheet fields to try in order: equity that belongs to ordinary
 * shareholders, and shares outstanding. Yahoo restates share counts for
 * later splits, so the two divide into a per-share value on today's count.
 */
const EQUITY_FIELDS = ["CommonStockEquity", "StockholdersEquity"]
const SHARE_FIELDS = ["OrdinarySharesNumber", "ShareIssued"]
/** Yahoo serves about four year-ends and the latest five quarters. */
const REPORT_PERIODS = ["annual", "quarterly"]

/**
 * Income-statement fields to try in order. An "annual" figure covers the
 * year to a year-end and a "trailing" one the 12 months to a quarter-end, so
 * the two are one measure. Yahoo has net income for about four year-ends but
 * only two quarter-ends. For the other quarters of the last three years it
 * has EPS and the average share count behind it. Those two are often left
 * on the share count of their day, so EPS before a split is many times too
 * high as it stands, but they multiply back into net income either way.
 */
const INCOME_FIELDS = ["NetIncomeCommonStockholders", "NetIncome"]
const EPS_FIELDS = ["DilutedEPS", "BasicEPS"]
const AVERAGE_SHARE_FIELDS = ["DilutedAverageShares", "BasicAverageShares"]
const TRAILING_PERIODS = ["annual", "trailing"]
/**
 * How far EPS times shares may stray from net income on the dates Yahoo has
 * both. Its EPS is sometimes rounded to a cent and sometimes plain wrong, so
 * a company that misses on any such date gets no quarters from EPS at all.
 */
const EPS_TOLERANCE = 0.05

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

interface ScreenerQuote {
  symbol: string
  shortName?: string
  longName?: string
  currency?: string
  /** The currency of the accounts, which `bookValue` is in. */
  financialCurrency?: string
  regularMarketPrice?: number
  regularMarketChangePercent?: number
  regularMarketTime?: number
  marketCap?: number
  bookValue?: number
  epsTrailingTwelveMonths?: number
  epsForward?: number
  dividendRate?: number
  dividendYield?: number
  fiftyTwoWeekHigh?: number
  fiftyTwoWeekLow?: number
  /** In percent, unlike the fractions in the other `…ChangePercent` fields. */
  fiftyTwoWeekChangePercent?: number
  averageDailyVolume3Month?: number
}

interface ScreenerResponse {
  finance: {
    result: Array<{ total: number; quotes: ScreenerQuote[] }> | null
    error: { code: string; description: string } | null
  }
}

type Operand = { operator: string; operands: unknown[] }

const eq = (field: string, value: string): Operand => ({ operator: "eq", operands: [field, value] })

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

async function reach(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch {
    throw new ProviderError("Could not reach Yahoo Finance")
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await reach(url, { headers: HEADERS })
  if (res.status === 429) throw new ProviderError("Yahoo Finance rate limit reached, try again shortly", 429)
  // The chart endpoint answers unknown symbols with 404 and a JSON body.
  if (!res.ok && res.status !== 404) throw new ProviderError(`Yahoo Finance responded ${res.status}`)
  return (await res.json()) as T
}

async function history(symbol: string, range: FetchRange, basis: PriceBasis = "total"): Promise<PriceHistory> {
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
    // Plain closes are already split-adjusted; only dividends set the two apart.
    const raw = basis === "price" ? closes[i] : (adjCloses[i] ?? closes[i])
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

/** Field → period-end date → value, the currency the field is stated in, and the dates annual reports gave. */
type Reported = Map<string, { currency?: string; on: Map<string, number>; yearEnds: Set<string> }>

const PERIOD_PREFIX = /^(annual|quarterly|trailing)/

const reportTypes = (periods: string[], fields: string[]) =>
  periods.flatMap((period) => fields.map((field) => period + field))

/**
 * Reported figures by type, which is a period followed by a field. The
 * periods of a field are merged, so ask only for periods that agree where
 * they share a date, as annual and quarterly balance sheets do.
 */
async function reported(symbol: string, types: string[]): Promise<Reported> {
  const params = new URLSearchParams({
    type: types.join(","),
    period1: "0",
    period2: String(Math.floor(Date.now() / 1000)),
  })
  const data = await getJson<TimeseriesResponse>(`${TIMESERIES_URL}${encodeURIComponent(symbol)}?${params}`)

  const figures: Reported = new Map()
  for (const entry of data.timeseries?.result ?? []) {
    const type = entry.meta.type[0]
    const field = type.replace(PERIOD_PREFIX, "")
    const figure = figures.get(field) ?? { on: new Map<string, number>(), yearEnds: new Set<string>() }
    figures.set(field, figure)
    for (const item of (entry[type] as ReportedValue[] | undefined) ?? []) {
      const value = finite(item?.reportedValue?.raw)
      if (!item?.asOfDate || value == null) continue
      figure.on.set(item.asOfDate, value)
      figure.currency ??= item.currencyCode
      if (type.startsWith("annual")) figure.yearEnds.add(item.asOfDate)
    }
  }
  return figures
}

/** The first of `fields` with a figure on `date`. */
const figureOn = (figures: Reported, fields: string[], date: string) =>
  fields.map((field) => figures.get(field)?.on.get(date)).find((value) => value != null)

/** Every date one of `fields` has a figure on, oldest first. */
const datesOf = (figures: Reported, fields: string[]) =>
  [...new Set(fields.flatMap((field) => [...(figures.get(field)?.on.keys() ?? [])]))].sort()

/** Only money fields say something here: share counts carry a currency code too, but it means nothing. */
const currencyOf = (figures: Reported, fields: string[]) =>
  normalizeCurrency(fields.map((field) => figures.get(field)?.currency).find((code) => code != null))

async function bookValue(symbol: string): Promise<BookValueHistory> {
  const figures = await reported(symbol, reportTypes(REPORT_PERIODS, [...EQUITY_FIELDS, ...SHARE_FIELDS]))

  const { currency, divisor } = currencyOf(figures, EQUITY_FIELDS)
  const points: PricePoint[] = []
  for (const time of datesOf(figures, EQUITY_FIELDS)) {
    const equity = figureOn(figures, EQUITY_FIELDS, time)
    const shares = figureOn(figures, SHARE_FIELDS, time)
    if (equity != null && shares != null && shares > 0) points.push({ time, value: equity / shares / divisor })
  }

  // Indices, funds, currencies and unknown symbols answer with empty series.
  if (points.length === 0) throw new ProviderError(`No balance sheets for ${symbol}`, 404)
  return { symbol, currency, points }
}

async function earnings(symbol: string): Promise<EarningsHistory> {
  const figures = await reported(symbol, [
    ...reportTypes(TRAILING_PERIODS, INCOME_FIELDS),
    ...reportTypes(["trailing"], [...EPS_FIELDS, ...AVERAGE_SHARE_FIELDS]),
    ...reportTypes(REPORT_PERIODS, SHARE_FIELDS),
  ])

  const fromEps = (date: string) => {
    const eps = figureOn(figures, EPS_FIELDS, date)
    const shares = figureOn(figures, AVERAGE_SHARE_FIELDS, date)
    return eps != null && shares != null ? eps * shares : undefined
  }
  const incomeDates = datesOf(figures, INCOME_FIELDS)
  const checks = incomeDates.flatMap((date) => {
    const implied = fromEps(date)
    return implied == null ? [] : [{ income: figureOn(figures, INCOME_FIELDS, date)!, implied }]
  })
  const epsHolds =
    checks.length > 0 &&
    checks.every(({ income, implied }) => Math.abs(implied - income) <= EPS_TOLERANCE * Math.abs(income))

  const { currency, divisor } = currencyOf(figures, INCOME_FIELDS)
  const counts = datesOf(figures, SHARE_FIELDS)
  const points: PricePoint[] = []
  for (const time of epsHolds ? datesOf(figures, [...INCOME_FIELDS, ...EPS_FIELDS]) : incomeDates) {
    const income = figureOn(figures, INCOME_FIELDS, time) ?? fromEps(time)
    // Older quarter-ends have no share count of their own; the last one before still holds.
    const counted = counts.findLast((date) => date <= time)
    const shares = counted == null ? undefined : figureOn(figures, SHARE_FIELDS, counted)
    if (income != null && shares != null && shares > 0) points.push({ time, value: income / shares / divisor })
  }

  if (points.length === 0) throw new ProviderError(`No income statements for ${symbol}`, 404)
  const yearEnds = points.flatMap(({ time }) =>
    INCOME_FIELDS.some((field) => figures.get(field)?.yearEnds.has(time)) ? [time] : [],
  )
  return { symbol, currency, points, yearEnds }
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

type Session = { cookie: string; crumb: string }

let session: Promise<Session> | null = null

async function openSession(): Promise<Session> {
  const res = await reach(COOKIE_URL, { headers: { "User-Agent": USER_AGENT }, redirect: "manual" })
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ")
  // No Accept header: the crumb endpoint answers application/json with 406.
  const crumbRes = await reach(CRUMB_URL, { headers: { "User-Agent": USER_AGENT, Cookie: cookie } })
  const crumb = (await crumbRes.text()).trim()
  if (!cookie || !crumbRes.ok || !crumb || crumb.startsWith("{")) {
    throw new ProviderError("Yahoo Finance did not open a screener session")
  }
  return { cookie, crumb }
}

/**
 * The screener wants a cookie plus a matching "crumb". They last for hours,
 * so one session is shared; passing the session that failed replaces it,
 * once, however many requests saw it fail.
 */
function yahooSession(failed?: Promise<Session>): Promise<Session> {
  if (!session || session === failed) {
    const pending = openSession()
    session = pending
    pending.catch(() => {
      if (session === pending) session = null
    })
  }
  return session
}

async function screenPage(
  operands: Operand[],
  offset: number,
  size = SCREEN_PAGE,
  retried = false,
): Promise<{ total: number; quotes: ScreenerQuote[] }> {
  const current = yahooSession()
  const { cookie, crumb } = await current
  const res = await reach(`${SCREENER_URL}?${new URLSearchParams({ crumb, formatted: "false" })}`, {
    method: "POST",
    headers: { ...HEADERS, Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      offset,
      size,
      // A stable order, so pages fetched in parallel never overlap.
      sortField: "ticker",
      sortType: "ASC",
      quoteType: "EQUITY",
      query: { operator: "AND", operands },
    }),
  })
  if (res.status === 401 && !retried) {
    yahooSession(current)
    return screenPage(operands, offset, size, true)
  }
  if (res.status === 429) throw new ProviderError("Yahoo Finance rate limit reached, try again shortly", 429)
  if (!res.ok) throw new ProviderError(`Yahoo Finance screener responded ${res.status}`)
  const data = (await res.json()) as ScreenerResponse
  const result = data.finance.result?.[0]
  if (!result) throw new ProviderError(data.finance.error?.description ?? "Yahoo Finance screener returned nothing")
  return { total: result.total, quotes: result.quotes }
}

async function screenAll(operands: Operand[]): Promise<ScreenerQuote[]> {
  const first = await screenPage(operands, 0)
  const offsets: number[] = []
  for (let offset = SCREEN_PAGE; offset < first.total; offset += SCREEN_PAGE) offsets.push(offset)
  const rest = await Promise.all(offsets.map((offset) => screenPage(operands, offset)))
  return [first, ...rest].flatMap((page) => page.quotes)
}

/** Latest close of each FX pair; pairs that fail to load are left out. */
async function latestRates(symbols: string[]): Promise<Map<string, number>> {
  const rates = new Map<string, number>()
  await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const { points } = await history(symbol, "1y")
        rates.set(symbol, points[points.length - 1].value)
      } catch {
        // Book values in that currency stay unknown rather than wrong.
      }
    }),
  )
  return rates
}

const finite = (value: number | undefined) => (value != null && Number.isFinite(value) ? value : null)

/** Every IDX company is a "Tbk" (publicly listed), so the suffix says nothing. */
const LISTED_SUFFIX = /[\s,]+Tbk\.?$/i

function toStock(quote: ScreenerQuote, sector: string | null, rates: Map<string, number>): StockSnapshot {
  const { currency, divisor } = normalizeCurrency(quote.currency)
  const reporting = normalizeCurrency(quote.financialCurrency ?? quote.currency)
  const perShare = (value: number | undefined) => {
    const v = finite(value)
    return v == null ? null : v / divisor
  }
  // Yahoo states book value in the reporting currency and everything else
  // in the trading currency, so its own priceToBook is off by the FX rate
  // for companies that report in USD.
  const converted = reporting.currency !== currency
  const rate = converted ? rates.get(fxSymbol(reporting.currency, currency)) : 1
  const book = finite(quote.bookValue)
  const changePct = finite(quote.regularMarketChangePercent)
  const change52wPct = finite(quote.fiftyTwoWeekChangePercent)
  return {
    symbol: quote.symbol,
    name: (quote.shortName ?? quote.longName ?? quote.symbol).replace(LISTED_SUFFIX, ""),
    sector,
    currency,
    ...(converted && { reportingCurrency: reporting.currency }),
    price: quote.regularMarketPrice! / divisor,
    change: changePct == null ? null : changePct / 100,
    marketCap: finite(quote.marketCap),
    bookValue: book == null || rate == null ? null : (book / reporting.divisor) * rate,
    eps: perShare(quote.epsTrailingTwelveMonths),
    epsForward: perShare(quote.epsForward),
    // Non-payers have no rate, only a zero yield.
    dividendRate: perShare(quote.dividendRate) ?? (quote.dividendYield === 0 ? 0 : null),
    high52w: perShare(quote.fiftyTwoWeekHigh),
    low52w: perShare(quote.fiftyTwoWeekLow),
    change52w: change52wPct == null ? null : change52wPct / 100,
    avgVolume: finite(quote.averageDailyVolume3Month),
  }
}

async function screen(): Promise<MarketSnapshot> {
  const region = eq("region", HOME_REGION)
  const [everything, ...bySector] = await Promise.all([
    screenPage([region], 0, 1),
    ...SECTORS.map((sector) => screenAll([region, eq("sector", sector)])),
  ])

  const found = new Map<string, { quote: ScreenerQuote; sector: string | null }>()
  bySector.forEach((quotes, i) => {
    for (const quote of quotes) found.set(quote.symbol, { quote, sector: SECTORS[i] })
  })
  // New listings can lack a sector; pick up whatever the sector pass missed.
  if (found.size < everything.total) {
    for (const quote of await screenAll([region])) {
      if (!found.has(quote.symbol)) found.set(quote.symbol, { quote, sector: null })
    }
  }

  const listed = [...found.values()].filter(({ quote }) => (finite(quote.regularMarketPrice) ?? 0) > 0)
  if (listed.length === 0) throw new ProviderError("Yahoo Finance returned no stocks for the screener")

  const pairs = new Set<string>()
  for (const { quote } of listed) {
    const trading = normalizeCurrency(quote.currency).currency
    const reporting = normalizeCurrency(quote.financialCurrency ?? quote.currency).currency
    if (reporting !== trading) pairs.add(fxSymbol(reporting, trading))
  }
  const rates = await latestRates([...pairs])

  const stocks = listed.map(({ quote, sector }) => toStock(quote, sector, rates))
  const latest = Math.max(...listed.map(({ quote }) => quote.regularMarketTime ?? 0))
  return {
    market: HOME_MARKET,
    currency: stocks[0].currency,
    asOf: new Date((latest || Date.now() / 1000) * 1000).toISOString(),
    stocks,
  }
}

export const yahooProvider: DataProvider = {
  id: "yahoo",
  name: "Yahoo Finance",
  history,
  search,
  screen,
  bookValue,
  earnings,
}
