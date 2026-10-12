"use client"

import { queryOptions } from "@tanstack/react-query"
import type {
  BookValueHistory,
  EarningsHistory,
  MarketSnapshot,
  Ownership,
  PriceBasis,
  PriceHistory,
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

export function ownershipQuery(symbol: string) {
  return queryOptions({
    queryKey: ["ownership", symbol] as const,
    queryFn: () => getJson<Ownership>(`/api/ownership?${new URLSearchParams({ symbol })}`),
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
