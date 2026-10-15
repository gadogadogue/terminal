"use client"

import { ChevronDownIcon } from "lucide-react"
import { Fragment, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  activeFilterCount,
  applyPreset,
  formatBound,
  matchesPreset,
  parseBound,
  SCREEN_METRICS,
  SCREEN_PRESETS,
  setBound,
  type Bounds,
  type MetricUnit,
  type Screen,
  type ScreenMetric,
} from "@/lib/analytics/screener"

export interface SectorCount {
  name: string
  count: number
}

const UNIT_SUFFIX: Record<MetricUnit, string | null> = { ratio: "×", percent: "%", amount: null }

export function ScreenFilters({
  screen,
  sectors,
  onChange,
}: {
  screen: Screen
  sectors: SectorCount[]
  onChange: (screen: Screen) => void
}) {
  const active = activeFilterCount(screen)
  return (
    <Card className="gap-0 rounded-2xl py-0">
      <CardHeader className="border-b px-4 py-3">
        <CardTitle>Filters</CardTitle>
        <CardDescription className="text-xs">{active === 0 ? "None active" : `${active} active`}</CardDescription>
        <CardAction>
          <Button
            variant="ghost"
            size="sm"
            disabled={active === 0}
            onClick={() => onChange({ ...screen, sectors: [], filters: {} })}
          >
            Clear
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 p-4">
        <FilterSection title="Presets">
          <div className="flex flex-wrap gap-1.5">
            {SCREEN_PRESETS.map((preset) => {
              const on = matchesPreset(screen, preset)
              return (
                <Tooltip key={preset.id}>
                  <TooltipTrigger asChild>
                    <Button
                      variant={on ? "secondary" : "outline"}
                      size="sm"
                      aria-pressed={on}
                      onClick={() => onChange(applyPreset(screen, preset))}
                    >
                      {preset.label}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{preset.description}</TooltipContent>
                </Tooltip>
              )
            })}
          </div>
        </FilterSection>

        <FilterSection title="Sector">
          <SectorPicker
            selected={screen.sectors}
            sectors={sectors}
            onChange={(selected) => onChange({ ...screen, sectors: selected })}
          />
        </FilterSection>

        <FilterSection title="Metrics">
          <div className="grid grid-cols-[minmax(0,1fr)_5rem_5rem] items-center gap-1.5">
            <span />
            <span className="px-1 text-[11px] text-muted-foreground">Min</span>
            <span className="px-1 text-[11px] text-muted-foreground">Max</span>
            {SCREEN_METRICS.map((metric) => (
              <MetricRow
                key={metric.key}
                metric={metric}
                bounds={screen.filters[metric.key]}
                onChange={(side, value) => onChange(setBound(screen, metric.key, side, value))}
              />
            ))}
          </div>
        </FilterSection>
      </CardContent>
    </Card>
  )
}

export function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

function MetricRow({
  metric,
  bounds,
  onChange,
}: {
  metric: ScreenMetric
  bounds: Bounds | undefined
  onChange: (side: keyof Bounds, value: number | null) => void
}) {
  const id = `filter-${metric.key}`
  const hint = metric.unit === "amount" ? `${metric.hint}. Type amounts like 500B or 2T.` : metric.hint
  return (
    <Fragment>
      <Tooltip>
        <TooltipTrigger asChild>
          <label
            htmlFor={`${id}-min`}
            className="w-fit max-w-full truncate text-sm underline decoration-muted-foreground/40 decoration-dotted underline-offset-4"
          >
            {metric.label}
          </label>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-60">
          {hint}
        </TooltipContent>
      </Tooltip>
      {(["min", "max"] as const).map((side) => (
        <BoundInput
          key={side}
          id={`${id}-${side}`}
          label={`${metric.label} ${side === "min" ? "minimum" : "maximum"}`}
          unit={metric.unit}
          value={bounds?.[side]}
          onChange={(value) => onChange(side, value)}
        />
      ))}
    </Fragment>
  )
}

/** Text the user is midway through typing, like "-" or ".", isn't an error yet. */
const INCOMPLETE = /^[+-]?\.?$/

const anyNumber = () => true

export function BoundInput({
  id,
  label,
  unit,
  value,
  onChange,
  required = false,
  accept = anyNumber,
}: {
  id: string
  label: string
  unit: MetricUnit
  value: number | undefined
  onChange: (value: number | null) => void
  /** The field can't stay empty: leaving it empty, or invalid, puts the value back. */
  required?: boolean
  /** The numbers it takes. Others show as invalid and aren't passed on. */
  accept?: (value: number) => boolean
}) {
  const [text, setText] = useState(() => formatBound(value, unit))
  const [shown, setShown] = useState(value)
  // The value changed from outside (a preset, Clear, an import). Show it,
  // unless the text being typed already means it, like "1." on the way to 1.5.
  if (value !== shown) {
    setShown(value)
    if (parseBound(text, unit) !== (value ?? null)) setText(formatBound(value, unit))
  }

  const usable = (parsed: number | null | undefined) =>
    parsed === null ? !required : parsed !== undefined && accept(parsed)
  const parsed = parseBound(text, unit)
  const invalid = parsed === undefined ? !INCOMPLETE.test(text.trim()) : parsed !== null && !accept(parsed)
  const suffix = UNIT_SUFFIX[unit]
  return (
    <InputGroup className="h-7">
      <InputGroupInput
        id={id}
        aria-label={label}
        aria-invalid={invalid || undefined}
        inputMode={unit === "amount" ? "text" : "decimal"}
        autoComplete="off"
        className="tabular-nums"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          const next = parseBound(e.target.value, unit)
          if (usable(next)) onChange(next ?? null)
        }}
        // Tidy what was typed: "1." becomes "1", "1000000000" becomes "1B".
        onBlur={() => {
          if (usable(parsed)) setText(formatBound(parsed ?? undefined, unit))
          else if (required) setText(formatBound(value, unit))
        }}
      />
      {suffix && (
        <InputGroupAddon align="inline-end">
          <InputGroupText className="text-xs">{suffix}</InputGroupText>
        </InputGroupAddon>
      )}
    </InputGroup>
  )
}

function SectorPicker({
  selected,
  sectors,
  onChange,
}: {
  selected: string[]
  sectors: SectorCount[]
  onChange: (selected: string[]) => void
}) {
  // A sector saved in the file but missing from today's data stays visible, so it can be unticked.
  const options = [
    ...sectors,
    ...selected.filter((name) => !sectors.some((s) => s.name === name)).map((name) => ({ name, count: 0 })),
  ]
  const label = selected.length === 0 ? "All sectors" : selected.length === 1 ? selected[0] : `${selected.length} sectors`
  const toggle = (name: string) =>
    onChange(selected.includes(name) ? selected.filter((s) => s !== name) : [...selected, name])

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-between font-normal">
          <span className="truncate">{label}</span>
          <ChevronDownIcon className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
        <DropdownMenuCheckboxItem
          checked={selected.length === 0}
          onSelect={(e) => e.preventDefault()}
          onCheckedChange={() => onChange([])}
        >
          All sectors
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {options.map(({ name, count }) => (
          <DropdownMenuCheckboxItem
            key={name}
            checked={selected.includes(name)}
            // Keep the menu open to tick several.
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => toggle(name)}
          >
            <span className="min-w-0 flex-1 truncate">{name}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
