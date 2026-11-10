"use client"

import { queryOptions } from "@tanstack/react-query"
import type {
  BookValueHistory,
  EarningsHistory,
  MarketHistory,
  MarketSnapshot,
  Ownership,
  PriceBasis,
  PriceHistory,
  RegisterStatus,
  SearchResult,
} from "@/lib/providers/types"
import type { FetchRange } from "@/lib/ranges"

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`)
  return body as T
}

export function historyQuery(symbol: string, range: FetchRange, basis: PriceBasis = "total") {
  return queryOptions({
    queryKey: ["history", symbol, range, basis] as const,
    queryFn: () => getJson<PriceHistory>(`/api/history?${new URLSearchParams({ symbol, range, basis })}`),
    // While a longer range loads, keep showing this symbol's previous data.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === symbol && previousQuery.queryKey[3] === basis ? previous : undefined,
  })
}

export function bookValueQuery(symbol: string) {
  return queryOptions({
    queryKey: ["book-value", symbol] as const,
    queryFn: () => getJson<BookValueHistory>(`/api/book-value?${new URLSearchParams({ symbol })}`),
  })
}

export function earningsQuery(symbol: string) {
  return queryOptions({
    queryKey: ["earnings-per-share", symbol] as const,
    queryFn: () => getJson<EarningsHistory>(`/api/earnings-per-share?${new URLSearchParams({ symbol })}`),
  })
}

/** The saved shareholder registers. Asked again on every visit: the user adds files while the app is open. */
export function registerQuery() {
  return queryOptions({
    queryKey: ["register"] as const,
    queryFn: () => getJson<RegisterStatus>("/api/register"),
    staleTime: 0,
    refetchOnWindowFocus: true,
  })
}

/** `register` is the version of the saved registers, so a new file means a new question and never a cached answer. */
export function ownershipQuery(symbol: string, register: string) {
  return queryOptions({
    queryKey: ["shareholders", symbol, register] as const,
    queryFn: () => getJson<Ownership>(`/api/shareholders?${new URLSearchParams({ symbol, register })}`),
  })
}

export function searchQuery(q: string) {
  return queryOptions({
    queryKey: ["search", q.toLowerCase()] as const,
    queryFn: () => getJson<SearchResult[]>(`/api/search?${new URLSearchParams({ q })}`),
    enabled: q.trim().length > 0,
    staleTime: 24 * 60 * 60_000,
  })
}

export function screenerQuery() {
  return queryOptions({
    queryKey: ["screener"] as const,
    queryFn: () => getJson<MarketSnapshot>("/api/screener"),
  })
}

/** A year of every stock's prices and book values: one large answer, so it is fetched only when a screen needs it. */
export function marketHistoryQuery() {
  return queryOptions({
    queryKey: ["screener-history"] as const,
    queryFn: () => getJson<MarketHistory>("/api/screener/history"),
  })
}
