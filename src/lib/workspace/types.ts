import type { Instrument, InstrumentGroup } from "@/lib/instruments"
import type { RangeKey } from "@/lib/ranges"

/** The whole user state. It lives in the browser and in exported files. */
export interface Workspace {
  name: string
  baseCurrency: string
  range: RangeKey
  watchlist: Instrument[]
  benchmarks: Instrument[]
  /**
   * Plotted series: instrument key → categorical color slot. Slots stick to
   * an instrument while it stays plotted, so toggling others never repaints it.
   */
  plotted: Record<string, number>
}

export interface PlottedItem {
  key: string
  instrument: Instrument
  group: InstrumentGroup
  slot: number
}

/** The chart palette has eight validated slots; past that, lines blur. */
export const MAX_PLOTTED = 8
