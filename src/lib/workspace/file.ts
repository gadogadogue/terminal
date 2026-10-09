import { z } from "zod"
import { instrumentKey, SYMBOL_PATTERN, type Instrument } from "@/lib/instruments"
import { RANGE_KEYS } from "@/lib/ranges"
import { defaultWorkspace } from "./defaults"
import { MAX_PLOTTED, type Workspace } from "./types"

/**
 * The watchlist file is the only persistence format: there is no database.
 * Users export it, keep it wherever they like, and import it back.
 *
 * Hand-written files are welcome. The minimal valid file is
 *   { "watchlist": ["BBCA.JK", "TLKM.JK"] }
 * or even just ["BBCA.JK", "TLKM.JK"].
 */

export const FILE_FORMAT = "finance-terminal/watchlist"
export const FILE_VERSION = 1

const name = z.string().trim().min(1).max(120).optional()
const selected = z.boolean().optional()
const currency = z
  .string()
  .regex(/^[A-Za-z]{3}$/, "Currency must be a 3-letter code like IDR")
  .transform((s) => s.toUpperCase())

const item = z.union([
  z
    .string()
    .regex(SYMBOL_PATTERN, "Not a valid symbol")
    .transform((symbol) => ({ kind: "ticker" as const, symbol })),
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("ticker"), symbol: z.string().regex(SYMBOL_PATTERN, "Not a valid symbol"), name, selected }),
    z.object({ kind: z.literal("fixed"), rate: z.number().min(-100).max(1000), name, selected }),
    z.object({ kind: z.literal("cash"), currency, name, selected }),
  ]),
])

const fileSchema = z.object({
  format: z.literal(FILE_FORMAT).optional(),
  version: z.number().int().min(1).max(FILE_VERSION, "This file was made by a newer version of the app").optional(),
  name: z.string().trim().max(120).optional(),
  exportedAt: z.string().optional(),
  settings: z
    .object({
      baseCurrency: currency.optional(),
      range: z.enum(RANGE_KEYS).optional(),
    })
    .optional(),
  watchlist: z.array(item).max(500).default([]),
  benchmarks: z.array(item).max(100).optional(),
})

type FileItem = z.output<typeof item>
export type WatchlistFile = z.input<typeof fileSchema>

/** Parses any supported file shape into a Workspace. Throws a readable Error. */
export function parseWatchlistFile(input: unknown): Workspace {
  const parsed = fileSchema.safeParse(Array.isArray(input) ? { watchlist: input } : input)
  if (!parsed.success) throw new Error(z.prettifyError(parsed.error))
  const file = parsed.data
  const defaults = defaultWorkspace()

  const ws: Workspace = {
    name: file.name || defaults.name,
    baseCurrency: file.settings?.baseCurrency ?? defaults.baseCurrency,
    range: file.settings?.range ?? defaults.range,
    watchlist: [],
    benchmarks: [],
    plotted: {},
  }

  const seen = new Set<string>()
  const flagged: string[] = []
  const take = (items: FileItem[], target: Instrument[]) => {
    for (const entry of items) {
      const { selected: isSelected, ...inst } = entry as FileItem & { selected?: boolean }
      const key = instrumentKey(inst)
      if (seen.has(key)) continue
      seen.add(key)
      target.push(inst)
      if (isSelected) flagged.push(key)
    }
  }
  take(file.watchlist, ws.watchlist)
  // Files without a benchmarks list get the defaults.
  if (file.benchmarks) take(file.benchmarks, ws.benchmarks)
  else ws.benchmarks = defaults.benchmarks

  // Nothing marked as selected: plot the first few of each list.
  const toPlot = flagged.length
    ? flagged
    : [...ws.watchlist.slice(0, 4), ...ws.benchmarks.slice(0, 4)].map(instrumentKey)
  toPlot.slice(0, MAX_PLOTTED).forEach((key, slot) => (ws.plotted[key] = slot))
  return ws
}

export function toWatchlistFile(ws: Workspace): WatchlistFile {
  const mark = (inst: Instrument) => (instrumentKey(inst) in ws.plotted ? { ...inst, selected: true } : inst)
  return {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    name: ws.name,
    exportedAt: new Date().toISOString(),
    settings: { baseCurrency: ws.baseCurrency, range: ws.range },
    watchlist: ws.watchlist.map(mark),
    benchmarks: ws.benchmarks.map(mark),
  }
}

export function watchlistFilename(ws: Workspace, today = new Date()): string {
  const slug = ws.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "watchlist"
  return `${slug}-${today.toISOString().slice(0, 10)}.json`
}
