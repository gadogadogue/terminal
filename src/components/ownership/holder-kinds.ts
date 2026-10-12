import { seriesColor, type ChartTheme } from "@/lib/chart-palette"
import type { HolderKind } from "@/lib/providers/types"

export const KIND_LABELS: Record<HolderKind, { one: string; many: string; hint: string }> = {
  institution: { one: "Institution", many: "Institutions", hint: "Asset managers and other companies that report what they hold" },
  fund: { one: "Fund", many: "Funds", hint: "Single funds, each run by an institution" },
  insider: { one: "Insider", many: "Insiders", hint: "Directors, officers and other people tied to the company" },
}

/**
 * Each kind's slot in the chart palette, the same wherever a holder is drawn.
 * In a network any two nodes can end up side by side, so these three were
 * validated against one another, not only as neighbors. The palette carries
 * no more than three that way, so a fourth kind needs another encoding.
 */
const KIND_SLOTS: Record<HolderKind, number> = { institution: 0, fund: 1, insider: 2 }

export function holderColor(kind: HolderKind, theme: ChartTheme): string {
  return seriesColor(KIND_SLOTS[kind], theme)
}

/** A stock's code without its exchange suffix: "BBCA.JK" → "BBCA". */
export const stockCode = (symbol: string) => symbol.split(".")[0]
