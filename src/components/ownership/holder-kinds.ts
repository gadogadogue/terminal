import { seriesColor, type ChartTheme } from "@/lib/chart-palette"
import type { Holder, HolderKind } from "@/lib/providers/types"

export const KIND_LABELS: Record<HolderKind, { one: string; many: string; hint: string }> = {
  company: {
    one: "Company",
    many: "Companies",
    hint: "Businesses and other organisations that don't invest for a living: holding companies, parents, the state",
  },
  person: {
    one: "Individual",
    many: "Individuals",
    hint: "People: founders and their families, directors and officers, private investors",
  },
  institution: {
    one: "Institution",
    many: "Institutions",
    hint: "Banks, insurers, pension funds, asset managers and other professional investors",
  },
  fund: { one: "Fund", many: "Funds", hint: "Single pooled funds, most of them run by an institution" },
}

/**
 * The slots in the chart palette, the same wherever ownership is drawn. In a
 * network any two nodes can end up side by side, so the three hues were
 * validated against one another, not only as neighbors, and the palette
 * carries no more than three that way. Companies and individuals are both a
 * company's insiders and share a hue; what kind a holder is, its tooltip
 * and its row in the table say.
 */
const SLOTS = { insiders: 2, institutions: 0, funds: 1 }
const KIND_SLOTS: Record<HolderKind, number> = {
  company: SLOTS.insiders,
  person: SLOTS.insiders,
  institution: SLOTS.institutions,
  fund: SLOTS.funds,
}

export function holderColor(kind: HolderKind, theme: ChartTheme): string {
  return seriesColor(KIND_SLOTS[kind], theme)
}

/** The color of a total over all insiders or all institutions, funds included. */
export function totalColor(total: "insiders" | "institutions", theme: ChartTheme): string {
  return seriesColor(SLOTS[total], theme)
}

/** What sort of holder this is, in the source's words where it has them: "Private Bank · Foreign". */
export function holderDetail(kind: HolderKind, holding: Pick<Holder, "type" | "family" | "role" | "foreign">): string {
  return [
    holding.type ?? KIND_LABELS[kind].one,
    holding.family ?? holding.role,
    holding.foreign == null ? null : holding.foreign ? "Foreign" : "Local",
  ]
    .filter(Boolean)
    .join(" · ")
}

/** A stock's code without its exchange suffix: "BBCA.JK" → "BBCA". */
export const stockCode = (symbol: string) => symbol.split(".")[0]
