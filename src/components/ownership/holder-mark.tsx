import type { ChartTheme } from "@/lib/chart-palette"
import type { HolderKind } from "@/lib/providers/types"
import { cn } from "@/lib/utils"
import { holderColor, isSquare } from "./holder-kinds"

/** A holder's mark beside its name, in the shape and color its node has in the diagram. */
export function HolderMark({ kind, theme, className }: { kind: HolderKind; theme: ChartTheme; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0", isSquare(kind) ? "rounded-[2px]" : "rounded-full", className)}
      style={{ background: holderColor(kind, theme) }}
    />
  )
}
