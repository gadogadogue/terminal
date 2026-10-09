/**
 * Anything that can be plotted. Benchmarks and watchlist entries share this
 * shape; only the list they live in differs.
 *
 * - ticker: a market symbol from the data provider (BBCA.JK, GC=F, ^GSPC)
 * - fixed:  a synthetic investment compounding at `rate` % per year
 * - cash:   holding a currency; flat in its own currency, FX-driven otherwise
 */
export type Instrument =
  | { kind: "ticker"; symbol: string; name?: string }
  | { kind: "fixed"; rate: number; name?: string }
  | { kind: "cash"; currency: string; name?: string }

export type InstrumentGroup = "watchlist" | "benchmarks"

/** Symbols are passed straight to upstream URLs, so keep them conservative. */
export const SYMBOL_PATTERN = /^[A-Za-z0-9.\-=^_]{1,24}$/

/** Stable identity, also used to de-duplicate lists. */
export function instrumentKey(inst: Instrument): string {
  switch (inst.kind) {
    case "ticker":
      return `ticker:${inst.symbol.toUpperCase()}`
    case "fixed":
      return `fixed:${inst.rate}`
    case "cash":
      return `cash:${inst.currency.toUpperCase()}`
  }
}

export function formatRate(rate: number): string {
  return `${Number(rate.toFixed(2))}% p.a.`
}

/** Short label: the symbol, rate or currency. */
export function instrumentCode(inst: Instrument): string {
  switch (inst.kind) {
    case "ticker":
      return inst.symbol
    case "fixed":
      return formatRate(inst.rate)
    case "cash":
      return `${inst.currency} cash`
  }
}

/** Human label, preferring a stored or fetched name. */
export function instrumentName(inst: Instrument, fetchedName?: string): string {
  if (inst.name) return inst.name
  switch (inst.kind) {
    case "ticker":
      return fetchedName ?? inst.symbol
    case "fixed":
      return `Fixed ${formatRate(inst.rate)}`
    case "cash":
      return `Hold ${inst.currency}`
  }
}

/** Second line under the code in lists: what the row actually is. */
export function instrumentDescription(inst: Instrument, baseCurrency: string, fetchedName?: string): string {
  if (inst.name) return inst.name
  switch (inst.kind) {
    case "ticker":
      return fetchedName ?? ""
    case "fixed":
      return "Fixed annual return"
    case "cash":
      return inst.currency === baseCurrency ? "Base currency, stays flat" : `1 ${inst.currency} valued in ${baseCurrency}`
  }
}
