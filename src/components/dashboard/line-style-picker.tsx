"use client"

import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { LINE_DASHES, type LineDash } from "@/lib/instruments"
import { cn } from "@/lib/utils"
import { MAX_PLOTTED } from "@/lib/workspace"
import { LineKey } from "./line-key"

const DASH_LABELS: Record<LineDash, string> = { solid: "Solid", dashed: "Dashed", dotted: "Dotted" }

/** A plotted row's line key. Opens the palette and dash choices for that series. */
export function LineStylePicker({
  label,
  slot,
  dash,
  colorOf,
  slotOwner,
  onColorChange,
  onDashChange,
}: {
  label: string
  slot: number
  dash: LineDash
  colorOf: (slot: number) => string
  /** Code of the plotted series using a slot, if any. */
  slotOwner: (slot: number) => string | undefined
  onColorChange: (slot: number) => void
  onDashChange: (dash: LineDash) => void
}) {
  const color = colorOf(slot)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Line style"
          aria-label={`Line style for ${label}`}
          className="-mx-1 flex h-6 shrink-0 items-center rounded-md px-1 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted"
        >
          <LineKey color={color} dash={dash} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto gap-3">
        <PopoverTitle className="text-xs">{label}</PopoverTitle>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Color</span>
          <div className="flex gap-1.5">
            {Array.from({ length: MAX_PLOTTED }, (_, s) => {
              const owner = s === slot ? undefined : slotOwner(s)
              const name = owner ? `Color ${s + 1}, swap with ${owner}` : `Color ${s + 1}`
              return (
                <button
                  key={s}
                  type="button"
                  title={name}
                  aria-label={name}
                  aria-pressed={s === slot}
                  onClick={() => onColorChange(s)}
                  style={{ backgroundColor: colorOf(s) }}
                  className={cn(
                    "size-6 rounded-md outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    s === slot && "ring-2 ring-foreground ring-offset-2 ring-offset-popover",
                  )}
                />
              )
            })}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Line</span>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            value={dash}
            // Clicking the active option reports "": keep it.
            onValueChange={(value) => value && onDashChange(value as LineDash)}
          >
            {LINE_DASHES.map((d) => (
              <ToggleGroupItem key={d} value={d} className="gap-1.5 px-2.5 text-xs">
                <LineKey color={color} dash={d} />
                {DASH_LABELS[d]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </PopoverContent>
    </Popover>
  )
}
