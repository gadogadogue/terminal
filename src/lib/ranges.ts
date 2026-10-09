/**
 * Time ranges shown in the UI, and the (coarser) ranges we actually fetch.
 *
 * Several UI ranges share one fetch range so switching between them is
 * instant: 1M…1Y all slice the same 1-year daily series on the client.
 */

export const RANGE_KEYS = ["1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y", "10Y", "MAX"] as const
export type RangeKey = (typeof RANGE_KEYS)[number]

export const FETCH_RANGES = ["1y", "5y", "10y", "max"] as const
export type FetchRange = (typeof FETCH_RANGES)[number]

export function fetchRangeFor(range: RangeKey): FetchRange {
  switch (range) {
    case "1M":
    case "3M":
    case "6M":
    case "YTD":
    case "1Y":
      return "1y"
    case "3Y":
    case "5Y":
      return "5y"
    case "10Y":
      return "10y"
    case "MAX":
      return "max"
  }
}

/** Interval used for a fetch range. MAX is weekly to keep payloads small. */
export function intervalFor(fetchRange: FetchRange): "1d" | "1wk" {
  return fetchRange === "max" ? "1wk" : "1d"
}

function utcDate(today: Date): Date {
  return new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))
}

/**
 * First calendar day (YYYY-MM-DD) included in a range, relative to `today`.
 * Returns null for MAX, meaning "as far back as the data goes".
 */
export function rangeStart(range: RangeKey, today: Date = new Date()): string | null {
  const d = utcDate(today)
  switch (range) {
    case "1M":
      d.setUTCMonth(d.getUTCMonth() - 1)
      break
    case "3M":
      d.setUTCMonth(d.getUTCMonth() - 3)
      break
    case "6M":
      d.setUTCMonth(d.getUTCMonth() - 6)
      break
    case "YTD":
      d.setUTCMonth(0, 1)
      break
    case "1Y":
      d.setUTCFullYear(d.getUTCFullYear() - 1)
      break
    case "3Y":
      d.setUTCFullYear(d.getUTCFullYear() - 3)
      break
    case "5Y":
      d.setUTCFullYear(d.getUTCFullYear() - 5)
      break
    case "10Y":
      d.setUTCFullYear(d.getUTCFullYear() - 10)
      break
    case "MAX":
      return null
  }
  return d.toISOString().slice(0, 10)
}

export function todayISO(today: Date = new Date()): string {
  return utcDate(today).toISOString().slice(0, 10)
}
