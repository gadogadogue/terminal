"use client"

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { FALL_CAUSES, FALL_PERIODS, type FallCause, type FallPeriod, type FallScreen } from "@/lib/analytics/pbv-fall"
import { BoundInput, FilterSection } from "./screen-filters"

export const CAUSE_LABELS: Record<FallCause, string> = { any: "Any", price: "Price", book: "Book value", both: "Both" }

const CAUSE_HINTS: Record<FallCause, string> = {
  any: "Every fall, whatever pushed it",
  price: "The price gave 80% of the fall or more",
  book: "Growth in book value gave 80% of the fall or more",
  both: "The price and book value each gave at least a fifth of the fall",
}

export function FallFilters({ fall, onChange }: { fall: FallScreen; onChange: (fall: FallScreen) => void }) {
  return (
    <Card className="gap-0 rounded-2xl py-0">
      <CardHeader className={fall.on ? "border-b px-4 py-3" : "px-4 py-3"}>
        <CardTitle>
          <label htmlFor="fall-on">P/BV fall</label>
        </CardTitle>
        <CardDescription className="text-xs">
          {fall.on ? "Fell through a mark, and what pushed it" : "Find stocks whose P/BV just fell below a mark"}
        </CardDescription>
        <CardAction>
          <Switch id="fall-on" checked={fall.on} onCheckedChange={(on) => onChange({ ...fall, on })} />
        </CardAction>
      </CardHeader>
      {fall.on && (
        <CardContent className="flex flex-col gap-5 p-4">
          <FilterSection title="Period">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              spacing={0}
              value={fall.period}
              onValueChange={(value) => value && onChange({ ...fall, period: value as FallPeriod })}
              aria-label="Period to look back over"
            >
              {FALL_PERIODS.map((period) => (
                <ToggleGroupItem key={period} value={period} className="px-2.5 text-xs tabular-nums">
                  {period}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </FilterSection>

          <FilterSection title="P/BV">
            <div className="grid grid-cols-[minmax(0,1fr)_5rem] items-center gap-1.5">
              <FieldLabel htmlFor="fall-mark" hint="P/BV was above this at some point in the period and is at or below it now.">
                Fell below
              </FieldLabel>
              <BoundInput
                id="fall-mark"
                label="P/BV mark it fell below"
                unit="ratio"
                value={fall.mark}
                required
                accept={(mark) => mark > 0}
                onChange={(mark) => mark != null && onChange({ ...fall, mark })}
              />
              <FieldLabel
                htmlFor="fall-min"
                hint="How far P/BV is now under its highest close in the period. Raise it to skip stocks that only dipped under the mark."
              >
                By at least
              </FieldLabel>
              <BoundInput
                id="fall-min"
                label="Least fall from the period's high"
                unit="percent"
                value={fall.minFall}
                required
                accept={(minFall) => minFall >= 0 && minFall <= 1}
                onChange={(minFall) => minFall != null && onChange({ ...fall, minFall })}
              />
            </div>
          </FilterSection>

          <FilterSection title="Cause">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              spacing={0}
              value={fall.cause}
              onValueChange={(value) => value && onChange({ ...fall, cause: value as FallCause })}
              aria-label="What pushed P/BV down"
            >
              {FALL_CAUSES.map((cause) => (
                <ToggleGroupItem key={cause} value={cause} className="px-2.5 text-xs" title={CAUSE_HINTS[cause]}>
                  {CAUSE_LABELS[cause]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </FilterSection>
        </CardContent>
      )}
    </Card>
  )
}

function FieldLabel({ htmlFor, hint, children }: { htmlFor: string; hint: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <label
          htmlFor={htmlFor}
          className="w-fit max-w-full truncate text-sm underline decoration-muted-foreground/40 decoration-dotted underline-offset-4"
        >
          {children}
        </label>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-60">
        {hint}
      </TooltipContent>
    </Tooltip>
  )
}
