/** Base currencies offered in the UI. Any ISO code works in a watchlist file. */
export const BASE_CURRENCIES = ["IDR", "USD", "EUR", "GBP", "JPY", "SGD", "AUD", "CNY", "HKD", "MYR"] as const

/** Currencies offered as "hold this currency" benchmarks. */
export const CASH_CURRENCIES = [
  ...BASE_CURRENCIES,
  "CHF",
  "CAD",
  "KRW",
  "THB",
  "INR",
  "SAR",
] as const

/**
 * Some exchanges quote in a minor unit (London in pence, Johannesburg in
 * cents). Map them to the ISO currency and the factor to divide by.
 */
const MINOR_UNITS: Record<string, { currency: string; divisor: number }> = {
  GBp: { currency: "GBP", divisor: 100 },
  GBX: { currency: "GBP", divisor: 100 },
  ZAc: { currency: "ZAR", divisor: 100 },
  ILA: { currency: "ILS", divisor: 100 },
}

export function normalizeCurrency(code: string | null | undefined): { currency: string; divisor: number } {
  if (!code) return { currency: "USD", divisor: 1 }
  return MINOR_UNITS[code] ?? { currency: code.toUpperCase(), divisor: 1 }
}

/** Ticker for the FX rate that converts 1 unit of `from` into `to`. */
export function fxSymbol(from: string, to: string): string {
  return `${from}${to}=X`
}
