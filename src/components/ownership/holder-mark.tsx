import type { ChartTheme } from "@/lib/chart-palette"
import type { HolderKind } from "@/lib/providers/types"
import { cn } from "@/lib/utils"
import { holderColor } from "./holder-kinds"

/** A holder's mark beside its name: a dot in the color its node has in the diagram. */
export function HolderMark({ kind, theme, className }: { kind: HolderKind; theme: ChartTheme; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-full", className)}
      style={{ background: holderColor(kind, theme) }}
    />
  )
}
