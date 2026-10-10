"use client"

import { useQuery } from "@tanstack/react-query"
import { Loader2Icon, PlusIcon } from "lucide-react"
import { useState } from "react"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { searchQuery } from "@/hooks/use-history"
import { SYMBOL_PATTERN, type Instrument } from "@/lib/instruments"

/** Prefer the full name unless it is unwieldy. */
function displayName(name: string): string {
  return name.length > 48 ? `${name.slice(0, 46)}…` : name
}

export function SymbolSearchDialog({
  open,
  onOpenChange,
  title,
  stocksOnly = false,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Leave out funds, indices, FX and crypto, for pages that need a company. */
  stocksOnly?: boolean
  onSelect: (instrument: Instrument) => void
}) {
  const [query, setQuery] = useState("")
  const debounced = useDebouncedValue(query.trim(), 250)
  const { data: found, isFetching, error } = useQuery(searchQuery(debounced))
  const data = stocksOnly ? found?.filter((r) => r.type?.toLowerCase() === "equity") : found
  const typed = query.trim().toUpperCase()
  // Offer the raw symbol only once results have settled, so it never steals
  // the highlighted row (and the Enter key) from a real match.
  const settled = !isFetching && debounced === query.trim()
  const canAddTyped =
    settled && SYMBOL_PATTERN.test(typed) && !data?.some((r) => r.symbol.toUpperCase() === typed)

  const choose = (instrument: Instrument) => {
    onSelect(instrument)
    onOpenChange(false)
    setQuery("")
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title={title} description="Search by name or ticker">
      {/* Results are already ranked by the provider; skip client-side filtering. */}
      <Command shouldFilter={false}>
        <CommandInput
          placeholder={stocksOnly ? "Search stocks…" : "Search stocks, funds, indices, FX, crypto…"}
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {debounced && !isFetching && !error && !data?.length && !canAddTyped && (
            <CommandEmpty>No matches.</CommandEmpty>
          )}
          {error && <div className="px-3 py-6 text-center text-sm text-muted-foreground">{error.message}</div>}
          {!debounced && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              Try “BBCA”, {stocksOnly ? "“Telkom”" : <>“gold”, “S&amp;P 500”</>} or a ticker like{" "}
              <span className="font-medium text-foreground">AAPL</span>. IDX stocks end in{" "}
              <span className="font-medium text-foreground">.JK</span>.
            </div>
          )}
          {data && data.length > 0 && (
            <CommandGroup heading="Results">
              {data.map((r) => (
                <CommandItem
                  key={r.symbol}
                  value={r.symbol}
                  onSelect={() => choose({ kind: "ticker", symbol: r.symbol, name: displayName(r.name) })}
                >
                  <span className="w-24 shrink-0 truncate font-medium">{r.symbol}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {[r.type, r.exchange].filter(Boolean).join(" · ")}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {canAddTyped && (
            <CommandGroup heading="Exact symbol">
              <CommandItem value={`__typed:${typed}`} onSelect={() => choose({ kind: "ticker", symbol: typed })}>
                {!stocksOnly && <PlusIcon />}
                {stocksOnly ? "Use" : "Add"} <span className="font-medium">{typed}</span> as typed
              </CommandItem>
            </CommandGroup>
          )}
          {isFetching && (
            <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
              <Loader2Icon className="size-3.5 animate-spin" /> Searching
            </div>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
