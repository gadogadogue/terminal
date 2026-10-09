import { instrumentKey, type Instrument, type InstrumentGroup } from "@/lib/instruments"
import { MAX_PLOTTED, type PlottedItem, type Workspace } from "./types"

/** Pure state transitions. The React hook wraps these. */

export function lowestFreeSlot(plotted: Record<string, number>): number | null {
  const used = new Set(Object.values(plotted))
  for (let slot = 0; slot < MAX_PLOTTED; slot++) if (!used.has(slot)) return slot
  return null
}

export function hasInstrument(ws: Workspace, key: string): boolean {
  return [...ws.watchlist, ...ws.benchmarks].some((i) => instrumentKey(i) === key)
}

export function addInstrument(
  ws: Workspace,
  group: InstrumentGroup,
  inst: Instrument,
): { ws: Workspace; added: boolean; plotted: boolean } {
  const key = instrumentKey(inst)
  if (hasInstrument(ws, key)) return { ws, added: false, plotted: key in ws.plotted }
  const slot = lowestFreeSlot(ws.plotted)
  return {
    ws: {
      ...ws,
      [group]: [...ws[group], inst],
      plotted: slot == null ? ws.plotted : { ...ws.plotted, [key]: slot },
    },
    added: true,
    plotted: slot != null,
  }
}

export function removeInstrument(ws: Workspace, key: string): Workspace {
  const keep = (i: Instrument) => instrumentKey(i) !== key
  const plotted = { ...ws.plotted }
  delete plotted[key]
  return { ...ws, watchlist: ws.watchlist.filter(keep), benchmarks: ws.benchmarks.filter(keep), plotted }
}

/** Returns ok: false when the series limit is reached. */
export function togglePlotted(ws: Workspace, key: string): { ws: Workspace; ok: boolean } {
  if (key in ws.plotted) {
    const plotted = { ...ws.plotted }
    delete plotted[key]
    return { ws: { ...ws, plotted }, ok: true }
  }
  const slot = lowestFreeSlot(ws.plotted)
  if (slot == null) return { ws, ok: false }
  return { ws: { ...ws, plotted: { ...ws.plotted, [key]: slot } }, ok: true }
}

/** Plotted instruments in list order: watchlist first, then benchmarks. */
export function plottedItems(ws: Workspace): PlottedItem[] {
  const items: PlottedItem[] = []
  for (const group of ["watchlist", "benchmarks"] as const) {
    for (const instrument of ws[group]) {
      const key = instrumentKey(instrument)
      if (key in ws.plotted) items.push({ key, instrument, group, slot: ws.plotted[key] })
    }
  }
  return items
}
