"use client"

import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { buildValuation, type Valuation } from "@/lib/analytics/valuation"
import { fxSymbol } from "@/lib/currency"
import type { FetchRange, RangeKey } from "@/lib/ranges"
import { bookValueQuery, historyQuery } from "./use-history"

/**
 * Balance sheets go back about four years, so one five-year daily history
 * covers every range and switching between them never refetches.
 */
const FETCH_RANGE: FetchRange = "5y"

export interface ValuationState {
  valuation: Valuation | null
  /** Name reported by the provider. */
  name: string | null
  /** The trading currency, which price and book value are shown in. */
  currency: string | null
  /** Set when the accounts are in another currency and book value was converted. */
  reportingCurrency: string | null
  /** The latest balance sheet shows no positive equity, so there is no P/BV. */
  negativeEquity: boolean
  error: Error | null
  loading: boolean
}

export function useValuation(symbol: string | null, range: RangeKey): ValuationState {
  const enabled = symbol != null
  const price = useQuery({ ...historyQuery(symbol ?? "", FETCH_RANGE, "price"), enabled })
  const book = useQuery({ ...bookValueQuery(symbol ?? ""), enabled })

  // The FX need is only known once both report their currency.
  const currency = price.data?.currency ?? null
  const accounts = book.data?.currency ?? null
  const reportingCurrency = currency && accounts && accounts !== currency ? accounts : null
  const fx = useQuery({
    ...historyQuery(reportingCurrency && currency ? fxSymbol(reportingCurrency, currency) : "", FETCH_RANGE),
    enabled: reportingCurrency != null,
  })

  const valuation = useMemo(() => {
    if (!price.data || !book.data || (reportingCurrency && !fx.data)) return null
    return buildValuation(
      { price: price.data.points, book: book.data.points, fx: reportingCurrency ? fx.data!.points : null },
      { range },
    )
  }, [price.data, book.data, fx.data, reportingCurrency, range])

  const fxError =
    reportingCurrency && fx.error ? new Error(`No ${reportingCurrency}/${currency} rate: ${fx.error.message}`) : null
  return {
    valuation,
    name: price.data?.name ?? null,
    currency,
    reportingCurrency,
    negativeEquity: book.data != null && !((book.data.points.at(-1)?.value ?? 0) > 0),
    error: price.error ?? book.error ?? fxError,
    loading: enabled && (price.isPending || book.isPending || (reportingCurrency != null && fx.isPending)),
  }
}
