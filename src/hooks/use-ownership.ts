"use client"

import { useQueries, useQuery, type UseQueryResult } from "@tanstack/react-query"
import { useMemo } from "react"
import type { Ownership, RegisterStatus } from "@/lib/providers/types"
import { ownershipQuery, registerQuery } from "./use-history"

export interface OwnershipState {
  /** What has loaded so far, in the order of the symbols asked for. */
  ownerships: Ownership[]
  /** Why a symbol has no ownership, keyed by symbol: mostly that it has no shareholders to report. */
  errors: Record<string, string>
  /** True while any symbol is loading. */
  loading: boolean
  /** The shareholder registers saved for IDX stocks; null until known. */
  register: RegisterStatus | null
}

// Defined once so useQueries can keep the combined result referentially stable.
function combine(results: UseQueryResult<Ownership, Error>[]) {
  return {
    data: results.map((r) => r.data),
    errors: results.map((r) => r.error),
    loading: results.some((r) => r.isPending),
  }
}

/** The shareholders of each symbol, one request per company. */
export function useOwnership(symbols: string[]): OwnershipState {
  const register = useQuery(registerQuery())
  // Shareholders depend on which registers are saved, so that is asked first.
  // If it can't be answered, stocks still load with what the provider has.
  const version = register.data?.version ?? (register.isError ? "" : null)
  const results = useQueries({
    queries: symbols.map((symbol) => ({ ...ownershipQuery(symbol, version ?? ""), enabled: version != null })),
    combine,
  })
  const key = symbols.join(" ")
  const status = register.data ?? null
  return useMemo(() => {
    const asked = key ? key.split(" ") : []
    return {
      ownerships: results.data.flatMap((ownership) => ownership ?? []),
      errors: Object.fromEntries(
        asked.flatMap((symbol, i) => (results.errors[i] ? [[symbol, results.errors[i].message]] : [])),
      ),
      loading: results.loading,
      register: status,
    }
  }, [results, key, status])
}
