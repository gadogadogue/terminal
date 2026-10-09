/** A short stroke in the series color; dashed marks a benchmark. */
export function LineKey({ color, dashed, className }: { color?: string; dashed?: boolean; className?: string }) {
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
          strokeDasharray={dashed ? "3 3" : undefined}
        />
      )}
    </svg>
  )
}
