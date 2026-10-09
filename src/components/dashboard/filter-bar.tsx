"use client"

import { Loader2Icon } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { BASE_CURRENCIES } from "@/lib/currency"
import { RANGE_KEYS, type RangeKey } from "@/lib/ranges"

/** Filters that scope everything below them: the chart and the table. */
export function FilterBar({
  range,
  baseCurrency,
  updating,
  onRangeChange,
  onBaseCurrencyChange,
}: {
  range: RangeKey
  baseCurrency: string
  updating: boolean
  onRangeChange: (range: RangeKey) => void
  onBaseCurrencyChange: (currency: string) => void
}) {
  const currencies: string[] = [...BASE_CURRENCIES]
  if (!currencies.includes(baseCurrency)) currencies.push(baseCurrency)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={0}
        value={range}
        // Clicking the active range reports "", which still means "reset to this range".
        onValueChange={(value) => onRangeChange((value || range) as RangeKey)}
        aria-label="Time range"
      >
        {RANGE_KEYS.map((r) => (
          <ToggleGroupItem key={r} value={r} className="px-2.5 text-xs tabular-nums">
            {r}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="flex items-center gap-2">
        {updating && <Loader2Icon className="size-4 animate-spin text-muted-foreground" aria-label="Loading prices" />}
        <Label htmlFor="base-currency" className="text-xs font-normal text-muted-foreground">
          Measured in
        </Label>
        <Select value={baseCurrency} onValueChange={onBaseCurrencyChange}>
          <SelectTrigger id="base-currency" size="sm" className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {currencies.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
