"use client"

import { queryOptions } from "@tanstack/react-query"
import type { MarketSnapshot, PriceHistory, SearchResult } from "@/lib/providers/types"
import type { FetchRange } from "@/lib/ranges"

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`)
  return body as T
}

export function historyQuery(symbol: string, range: FetchRange) {
  return queryOptions({
    queryKey: ["history", symbol, range] as const,
    queryFn: () => getJson<PriceHistory>(`/api/history?${new URLSearchParams({ symbol, range })}`),
    // While a longer range loads, keep showing this symbol's previous data.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === symbol ? previous : undefined,
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
