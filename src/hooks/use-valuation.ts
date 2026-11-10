"use client"

import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { buildValuation, earningsOn, type EarningsBasis, type Valuation } from "@/lib/analytics/valuation"
import { fxSymbol } from "@/lib/currency"
import type { ValuationRatio } from "@/lib/instruments"
import type { FetchRange, RangeKey } from "@/lib/ranges"
import { bookValueQuery, earningsQuery, historyQuery } from "./use-history"

/**
 * Company reports go back about four years, so one five-year daily history
 * covers every range and switching between them never refetches.
 */
const FETCH_RANGE: FetchRange = "5y"

export interface ValuationState {
  valuation: Valuation | null
  /** Name reported by the provider. */
  name: string | null
  /** The trading currency, which price and the fundamental are shown in. */
  currency: string | null
  /** Set when the accounts are in another currency and the fundamental was converted. */
  reportingCurrency: string | null
  /** The latest figure is negative equity (P/BV) or a loss (P/E), so there is no ratio. */
  negative: boolean
  error: Error | null
  loading: boolean
}

export function useValuation(
  symbol: string | null,
  ratio: ValuationRatio,
  range: RangeKey,
  /** How earnings per share are stated; only P/E uses it. */
  basis: EarningsBasis,
  /** A date to start on instead of the range's start. */
  start: string | null = null,
): ValuationState {
  const enabled = symbol != null
  const price = useQuery({ ...historyQuery(symbol ?? "", FETCH_RANGE, "price"), enabled })
  // P/BV divides the price by book value, P/E by earnings; only the one shown is fetched.
  const book = useQuery({ ...bookValueQuery(symbol ?? ""), enabled: enabled && ratio === "pbv" })
  const earnings = useQuery({ ...earningsQuery(symbol ?? ""), enabled: enabled && ratio === "pe" })
  const reports = ratio === "pbv" ? book : earnings
  const fundamental = useMemo(
    () =>
      ratio === "pbv"
        ? book.data?.points
        : earnings.data && earningsOn(basis, earnings.data.points, earnings.data.yearEnds),
    [ratio, basis, book.data, earnings.data],
  )

  // The FX need is only known once both report their currency.
  const currency = price.data?.currency ?? null
  const accounts = reports.data?.currency ?? null
  const reportingCurrency = currency && accounts && accounts !== currency ? accounts : null
  const fx = useQuery({
    ...historyQuery(reportingCurrency && currency ? fxSymbol(reportingCurrency, currency) : "", FETCH_RANGE),
    enabled: reportingCurrency != null,
  })

  const valuation = useMemo(() => {
    if (!price.data || !fundamental || (reportingCurrency && !fx.data)) return null
    return buildValuation(
      { price: price.data.points, fundamental, fx: reportingCurrency ? fx.data!.points : null },
      { range, start: start ?? undefined },
    )
  }, [price.data, fundamental, fx.data, reportingCurrency, range, start])

  const fxError =
    reportingCurrency && fx.error ? new Error(`No ${reportingCurrency}/${currency} rate: ${fx.error.message}`) : null
  return {
    valuation,
    name: price.data?.name ?? null,
    currency,
    reportingCurrency,
    negative: fundamental != null && fundamental.length > 0 && !(fundamental[fundamental.length - 1].value > 0),
    error: price.error ?? reports.error ?? fxError,
    loading: enabled && (price.isPending || reports.isPending || (reportingCurrency != null && fx.isPending)),
  }
}
