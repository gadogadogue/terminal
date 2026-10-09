import type { StockSnapshot } from "@/lib/providers/types"

/**
 * Screener math: ratios from each stock's raw inputs, then filtering and
 * sorting. A ratio over a zero or negative denominator is null, never
 * negative, so "P/BV ≤ 1" can't match a company with negative equity and
 * "P/E ≤ 15" can't match a loss-maker.
 */

export type MetricUnit = "ratio" | "percent" | "amount"
export type SortDir = "asc" | "desc"

interface MetricDef {
  key: string
  label: string
  hint: string
  unit: MetricUnit
  /** Direction of the first click on the column: the end worth looking at first. */
  firstSort: SortDir
  /** Signed values are changes, printed with a sign and colored. */
  signed?: boolean
}

/** Filterable, sortable metrics in column order. P/BV leads; ROE says whether it's earned. */
export const SCREEN_METRICS = [
  { key: "pbv", label: "P/BV", unit: "ratio", firstSort: "asc", hint: "Price over book value per share" },
  {
    key: "roe",
    label: "ROE",
    unit: "percent",
    firstSort: "desc",
    hint: "Return on equity: trailing 12-month earnings over book value",
  },
  { key: "pe", label: "P/E", unit: "ratio", firstSort: "asc", hint: "Price over trailing 12-month earnings" },
  {
    key: "forwardPe",
    label: "Fwd P/E",
    unit: "ratio",
    firstSort: "asc",
    hint: "Price over analysts' earnings estimate for next year",
  },
  {
    key: "dividendYield",
    label: "Div yield",
    unit: "percent",
    firstSort: "desc",
    hint: "Expected annual dividend over price. The latest payment is annualized, so it can overstate.",
  },
  { key: "marketCap", label: "Mkt cap", unit: "amount", firstSort: "desc", hint: "Market capitalization" },
  {
    key: "valueTraded",
    label: "Value/day",
    unit: "amount",
    firstSort: "desc",
    hint: "Average value traded per day over 3 months, a liquidity check",
  },
  { key: "change52w", label: "1Y", unit: "percent", firstSort: "desc", signed: true, hint: "Price change over 52 weeks" },
  {
    key: "fromHigh",
    label: "From high",
    unit: "percent",
    firstSort: "asc",
    signed: true,
    hint: "Distance below the 52-week high",
  },
] as const satisfies readonly MetricDef[]

export type ScreenMetric = (typeof SCREEN_METRICS)[number]
export type MetricKey = ScreenMetric["key"]
export type SortKey = MetricKey | "symbol"

const METRIC_KEYS = new Set<string>(SCREEN_METRICS.map((m) => m.key))

export function isMetricKey(key: string): key is MetricKey {
  return METRIC_KEYS.has(key)
}

export interface ScreenRow {
  stock: StockSnapshot
  metrics: Record<MetricKey, number | null>
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  return numerator == null || denominator == null || denominator <= 0 ? null : numerator / denominator
}

export function screenRow(stock: StockSnapshot): ScreenRow {
  const { price, bookValue, high52w, avgVolume } = stock
  const toHigh = ratio(price, high52w)
  return {
    stock,
    metrics: {
      pbv: ratio(price, bookValue),
      // Negative earnings over positive equity is a real (negative) ROE.
      roe: ratio(stock.eps, bookValue),
      pe: ratio(price, stock.eps),
      forwardPe: ratio(price, stock.epsForward),
      dividendYield: ratio(stock.dividendRate, price),
      marketCap: stock.marketCap,
      valueTraded: avgVolume == null ? null : avgVolume * price,
      change52w: stock.change52w,
      fromHigh: toHigh == null ? null : toHigh - 1,
    },
  }
}

export interface Bounds {
  min?: number
  max?: number
}

export type Filters = Partial<Record<MetricKey, Bounds>>

/** A saved set of filters. It lives in the workspace and the watchlist file. */
export interface Screen {
  /** Sectors to keep; empty keeps every sector. */
  sectors: string[]
  filters: Filters
  sort: { key: SortKey; dir: SortDir }
}

export function defaultScreen(): Screen {
  return { sectors: [], filters: {}, sort: { key: "pbv", dir: "asc" } }
}

/** Sets or clears one side of a metric's bounds. A metric with neither side is dropped. */
export function setBound(screen: Screen, key: MetricKey, side: keyof Bounds, value: number | null): Screen {
  const bounds: Bounds = { ...screen.filters[key] }
  if (value == null) delete bounds[side]
  else bounds[side] = value
  const filters = { ...screen.filters }
  if (bounds.min == null && bounds.max == null) delete filters[key]
  else filters[key] = bounds
  return { ...screen, filters }
}

/** Number of active conditions: each bounded metric, plus the sector choice. */
export function activeFilterCount(screen: Screen): number {
  return Object.keys(screen.filters).length + (screen.sectors.length > 0 ? 1 : 0)
}

function matchesQuery(stock: StockSnapshot, query: string): boolean {
  return stock.symbol.toUpperCase().startsWith(query) || stock.name.toUpperCase().includes(query)
}

/**
 * Rows that pass every filter, sorted. A bounded metric with no value fails
 * its filter. Missing values sort last in either direction; ties go by symbol.
 */
export function runScreen(rows: ScreenRow[], screen: Screen, query = ""): ScreenRow[] {
  const q = query.trim().toUpperCase()
  const sectors = new Set(screen.sectors)
  const bounds = Object.entries(screen.filters) as [MetricKey, Bounds][]
  const kept = rows.filter((row) => {
    if (sectors.size > 0 && !sectors.has(row.stock.sector ?? "")) return false
    if (q && !matchesQuery(row.stock, q)) return false
    return bounds.every(([key, { min, max }]) => {
      const value = row.metrics[key]
      return value != null && (min == null || value >= min) && (max == null || value <= max)
    })
  })

  const { key, dir } = screen.sort
  const sign = dir === "asc" ? 1 : -1
  const bySymbol = (a: ScreenRow, b: ScreenRow) => a.stock.symbol.localeCompare(b.stock.symbol)
  return kept.sort((a, b) => {
    if (key === "symbol") return bySymbol(a, b) * sign
    const av = a.metrics[key]
    const bv = b.metrics[key]
    if (av == null || bv == null) return av == null && bv == null ? bySymbol(a, b) : av == null ? 1 : -1
    return (av - bv) * sign || bySymbol(a, b)
  })
}

export interface ScreenPreset {
  id: string
  label: string
  description: string
  filters: Filters
  sort: Screen["sort"]
}

/**
 * At least 1B traded a day; below that a position is hard to build or exit.
 * The screener covers IDX, so amounts are in IDR.
 */
const LIQUID: Filters = { valueTraded: { min: 1e9 } }

/** Starting points. Applying one replaces the metric filters and sort, and keeps the sectors. */
export const SCREEN_PRESETS: ScreenPreset[] = [
  {
    id: "below-book",
    label: "Below book",
    description: "Priced under book value (P/BV ≤ 1)",
    filters: { pbv: { max: 1 }, ...LIQUID },
    sort: { key: "pbv", dir: "asc" },
  },
  {
    id: "cheap-and-profitable",
    label: "Cheap & profitable",
    description: "P/BV ≤ 1.5 while earning ROE ≥ 12%",
    filters: { pbv: { max: 1.5 }, roe: { min: 0.12 }, ...LIQUID },
    sort: { key: "pbv", dir: "asc" },
  },
  {
    id: "graham",
    label: "Graham",
    description: "Graham's defensive limits: P/E ≤ 15 and P/BV ≤ 1.5",
    filters: { pe: { max: 15 }, pbv: { max: 1.5 }, ...LIQUID },
    sort: { key: "pbv", dir: "asc" },
  },
  {
    id: "high-yield",
    label: "High yield",
    description: "Dividend yield ≥ 6% from profitable companies",
    filters: { dividendYield: { min: 0.06 }, roe: { min: 0 }, ...LIQUID },
    sort: { key: "dividendYield", dir: "desc" },
  },
]

export function applyPreset(screen: Screen, preset: ScreenPreset): Screen {
  return { ...screen, filters: structuredClone(preset.filters), sort: { ...preset.sort } }
}

export function matchesPreset(screen: Screen, preset: ScreenPreset): boolean {
  const keys = Object.keys(preset.filters) as MetricKey[]
  return (
    screen.sort.key === preset.sort.key &&
    screen.sort.dir === preset.sort.dir &&
    Object.keys(screen.filters).length === keys.length &&
    keys.every((k) => screen.filters[k]?.min === preset.filters[k]?.min && screen.filters[k]?.max === preset.filters[k]?.max)
  )
}

const AMOUNT_SUFFIX: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 }
const BOUND_PATTERN = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))([kmbt])?$/i

/**
 * Reads a typed filter bound. Percent metrics are typed in percent ("12"
 * is 12%), amounts take K/M/B/T suffixes ("1.5T"). Returns null for an empty
 * field and undefined when the text isn't a number.
 */
export function parseBound(text: string, unit: MetricUnit): number | null | undefined {
  let t = text.replace(/[\s,]/g, "")
  if (unit === "percent") t = t.replace(/%$/, "")
  if (t === "") return null
  const match = BOUND_PATTERN.exec(t)
  if (!match || (match[2] && unit !== "amount")) return undefined
  const value = Number(match[1]) * (match[2] ? AMOUNT_SUFFIX[match[2].toLowerCase()] : 1)
  return unit === "percent" ? value / 100 : value
}

const compactAmount = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 3 })

/** The text a bound is shown as, in the units `parseBound` reads. */
export function formatBound(value: number | undefined, unit: MetricUnit): string {
  if (value == null) return ""
  if (unit === "amount") return compactAmount.format(value).replace(/,/g, "")
  return String(Number((unit === "percent" ? value * 100 : value).toFixed(4)))
}
