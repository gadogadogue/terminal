import type { LineDash } from "@/lib/instruments"

const DASH_ARRAY: Record<LineDash, string | undefined> = { solid: undefined, dashed: "3 3", dotted: "0 3" }

/** A short stroke in the series color and dash style. */
export function LineKey({ color, dash = "solid", className }: { color?: string; dash?: LineDash; className?: string }) {
  return (
    <svg width="16" height="8" viewBox="0 0 16 8" aria-hidden className={className}>
      {color && (
        <line
          x1="1"
          y1="4"
          x2="15"
          y2="4"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray={DASH_ARRAY[dash]}
        />
      )}
    </svg>
  )
}
