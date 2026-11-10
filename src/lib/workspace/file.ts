import { z } from "zod"
import {
  defaultFallScreen,
  FALL_CAUSES,
  FALL_PERIODS,
  isFallSortKey,
  type FallScreen,
} from "@/lib/analytics/pbv-fall"
import { defaultScreen, isMetricKey, type Screen } from "@/lib/analytics/screener"
import { instrumentKey, LINE_DASHES, SYMBOL_PATTERN, type Instrument } from "@/lib/instruments"
import { RANGE_KEYS } from "@/lib/ranges"
import { defaultWorkspace } from "./defaults"
import { lowestFreeSlot } from "./state"
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
/** Palette position while plotted: 1–8 in files, slot 0–7 in the app. */
const color = z.number().int().min(1).max(MAX_PLOTTED).optional()
const line = z.enum(LINE_DASHES).optional()
const extras = { name, selected, color, line }
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
    z.object({ kind: z.literal("ticker"), symbol: z.string().regex(SYMBOL_PATTERN, "Not a valid symbol"), ...extras }),
    z.object({ kind: z.literal("fixed"), rate: z.number().min(-100).max(1000), ...extras }),
    z.object({ kind: z.literal("cash"), currency, ...extras }),
  ]),
])

/**
 * Screener filters. Percent metrics are fractions (0.12 is 12%), amounts are
 * plain numbers. Metric names this version doesn't know are skipped, so a
 * file from a newer version still opens.
 */
const sort = z.object({ key: z.string(), dir: z.enum(["asc", "desc"]) })

/**
 * The P/BV fall screen. The mark is a multiple and the fall a fraction (0.1
 * is 10%). A period, cause or sort this version doesn't know gets the default.
 */
const fall = z.object({
  on: z.boolean().optional(),
  period: z.string().optional(),
  mark: z.number().positive().optional(),
  minFall: z.number().min(0).max(1).optional(),
  cause: z.string().optional(),
  sort: sort.optional(),
})

const screener = z.object({
  sectors: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
  filters: z.record(z.string(), z.object({ min: z.number().optional(), max: z.number().optional() })).optional(),
  sort: sort.optional(),
  fall: fall.optional(),
})

const known = <T extends string>(values: readonly T[], value: string | undefined): value is T =>
  (values as readonly string[]).includes(value ?? "")

function readFall(file: z.output<typeof fall> | undefined): FallScreen {
  const screen = defaultFallScreen()
  if (!file) return screen
  if (file.on != null) screen.on = file.on
  if (known(FALL_PERIODS, file.period)) screen.period = file.period
  if (file.mark != null) screen.mark = file.mark
  if (file.minFall != null) screen.minFall = file.minFall
  if (known(FALL_CAUSES, file.cause)) screen.cause = file.cause
  if (file.sort && isFallSortKey(file.sort.key)) screen.sort = { key: file.sort.key, dir: file.sort.dir }
  return screen
}

function readScreen(file: z.output<typeof screener> | undefined): Screen {
  const screen = defaultScreen()
  if (!file) return screen
  screen.fall = readFall(file.fall)
  if (file.sectors) screen.sectors = [...new Set(file.sectors)]
  for (const [key, { min, max }] of Object.entries(file.filters ?? {})) {
    if (!isMetricKey(key) || (min == null && max == null)) continue
    screen.filters[key] = { ...(min != null && { min }), ...(max != null && { max }) }
  }
  const sortKey = file.sort?.key
  if (file.sort && sortKey && (sortKey === "symbol" || isMetricKey(sortKey))) {
    screen.sort = { key: sortKey, dir: file.sort.dir }
  }
  return screen
}

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
  screener: screener.optional(),
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
    screener: readScreen(file.screener),
  }

  const seen = new Set<string>()
  const flagged: string[] = []
  const colors = new Map<string, number>()
  const take = (items: FileItem[], target: Instrument[]) => {
    for (const entry of items) {
      const { selected: isSelected, color, ...inst } = entry as FileItem & { selected?: boolean; color?: number }
      const key = instrumentKey(inst)
      if (seen.has(key)) continue
      seen.add(key)
      target.push(inst)
      if (isSelected) flagged.push(key)
      if (color != null) colors.set(key, color - 1)
    }
  }
  take(file.watchlist, ws.watchlist)
  // Files without a benchmarks list get the defaults.
  if (file.benchmarks) take(file.benchmarks, ws.benchmarks)
  else ws.benchmarks = defaults.benchmarks

  // Nothing marked as selected: plot the first few of each list.
  const toPlot = (
    flagged.length ? flagged : [...ws.watchlist.slice(0, 4), ...ws.benchmarks.slice(0, 4)].map(instrumentKey)
  ).slice(0, MAX_PLOTTED)
  // Colors the file asks for first, then the lowest free ones in list order.
  for (const key of toPlot) {
    const slot = colors.get(key)
    if (slot != null && !Object.values(ws.plotted).includes(slot)) ws.plotted[key] = slot
  }
  for (const key of toPlot) if (!(key in ws.plotted)) ws.plotted[key] = lowestFreeSlot(ws.plotted)!
  return ws
}

export function toWatchlistFile(ws: Workspace): WatchlistFile {
  const mark = (inst: Instrument) => {
    const slot = ws.plotted[instrumentKey(inst)]
    return slot == null ? inst : { ...inst, selected: true, color: slot + 1 }
  }
  return {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    name: ws.name,
    exportedAt: new Date().toISOString(),
    settings: { baseCurrency: ws.baseCurrency, range: ws.range },
    watchlist: ws.watchlist.map(mark),
    benchmarks: ws.benchmarks.map(mark),
    screener: ws.screener,
  }
}

export function watchlistFilename(ws: Workspace, today = new Date()): string {
  const slug = ws.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "watchlist"
  return `${slug}-${today.toISOString().slice(0, 10)}.json`
}
