import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import {
  parseRegister,
  REGISTER_THRESHOLD,
  registerOwnership,
  registerPortfolios,
  type PageText,
  type Register,
} from "./ksei-register"
import { ProviderError, type DataProvider, type Ownership } from "./types"

/**
 * The shareholder registers the user has saved: KSEI's monthly lists of
 * every holder above 1% of each IDX company. IDX publishes them as PDFs on a
 * site that turns away servers, so they can't be fetched like other market
 * data. The user downloads each month's file and saves it in this folder,
 * and the app reads whatever is there.
 */
export const REGISTER_FOLDER = "data/ksei"

/**
 * The bundler follows file paths it finds in code to learn what a route
 * depends on. One that starts at the working directory makes it watch the
 * whole project, its own logs included, and every page then reloads without
 * end. These files are the user's, not the app's: each path below is marked
 * to be left alone.
 */
const folder = () => path.join(/* turbopackIgnore: true */ process.cwd(), REGISTER_FOLDER)
/** Parsed lists are kept beside the PDFs, so each file is read once and not on every start. */
const CACHE_FOLDER = ".cache"
/** A month's list is 5 to 8 MB and under 100 pages; anything far beyond that is not one. */
const MAX_BYTES = 40 * 1024 * 1024
const MAX_PAGES = 600

/** The build of pdf.js for Node, where npm puts it. */
const PDFJS = "node_modules/pdfjs-dist/legacy/build/pdf.mjs"

/** IDX symbols are the company's code with the exchange's suffix: "BBCA.JK". */
const HOME_SYMBOL = /^([A-Z0-9]{3,6})\.JK$/
const homeSymbol = (code: string) => `${code}.JK`

/**
 * Counted up whenever the answers built from the files change shape. It is
 * part of the files' fingerprint, which the route's cache, the browser's and
 * an open page's all go by, so every answer in the old shape is left behind.
 */
const ANSWER_FORMAT = 2

interface SavedFile {
  name: string
  /** Changes whenever the file does: its name, size and time of writing. */
  key: string
}

async function savedFiles(): Promise<SavedFile[]> {
  let names: string[]
  try {
    names = await readdir(/* turbopackIgnore: true */ folder())
  } catch {
    // No folder yet is the same as no files.
    return []
  }
  const files = await Promise.all(
    names
      .filter((name) => name.toLowerCase().endsWith(".pdf"))
      .sort()
      .map(async (name) => {
        const { size, mtimeMs } = await stat(/* turbopackIgnore: true */ path.join(folder(), name))
        return { name, key: `${name}:${size}:${Math.round(mtimeMs)}` }
      }),
  )
  return files
}

/** The text of each page, with where each piece starts. */
async function pageTexts(data: Uint8Array): Promise<PageText[][]> {
  // pdf.js is loaded by Node itself, on first use, and kept out of the bundle.
  // Bundled, its own file reading sets off the same endless reloads as above.
  const { getDocument } = (await import(
    /* turbopackIgnore: true */ pathToFileURL(path.join(/* turbopackIgnore: true */ process.cwd(), PDFJS)).href
  )) as typeof import("pdfjs-dist/legacy/build/pdf.mjs")
  const task = getDocument({ data, verbosity: 0, useSystemFonts: false })
  try {
    const pdf = await task.promise
    if (pdf.numPages > MAX_PAGES) throw new Error(`It has ${pdf.numPages} pages, far more than a month's list`)
    const pages: PageText[][] = []
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number)
      const { items } = await page.getTextContent()
      pages.push(items.flatMap((item) => ("str" in item ? [{ text: item.str, x: item.transform[4], y: item.transform[5] }] : [])))
      page.cleanup()
    }
    return pages
  } finally {
    await task.destroy()
  }
}

async function readRegister({ name, key }: SavedFile): Promise<Register> {
  const cached = path.join(folder(), CACHE_FOLDER, `${name}.json`)
  try {
    const saved = JSON.parse(await readFile(/* turbopackIgnore: true */ cached, "utf8")) as { key: string; register: Register }
    if (saved.key === key) return saved.register
  } catch {
    // Not parsed yet, or the PDF changed since.
  }
  const data = await readFile(/* turbopackIgnore: true */ path.join(folder(), name))
  if (data.byteLength > MAX_BYTES) throw new Error("The file is far larger than a month's list")
  const register = parseRegister(await pageTexts(new Uint8Array(data)))
  try {
    await mkdir(/* turbopackIgnore: true */ path.dirname(cached), { recursive: true })
    await writeFile(/* turbopackIgnore: true */ cached, JSON.stringify({ key, register }))
  } catch {
    // A read-only disk only costs the parsing again next time.
  }
  return register
}

/** One parse per file and version, however many requests ask while it runs. */
const parsed = new Map<string, Promise<Register>>()

export interface Registers {
  /** Changes whenever the saved files do, so answers built from them can be told apart. */
  version: string
  /** The lists that could be read, oldest first, one per date. */
  registers: (Register & { file: string })[]
  /** Files that are not a list of holders, with what was wrong. */
  failed: { file: string; message: string }[]
}

export async function loadRegisters(): Promise<Registers> {
  const files = await savedFiles()
  for (const key of parsed.keys()) if (!files.some((file) => file.key === key)) parsed.delete(key)

  const byDate = new Map<string, Register & { file: string }>()
  const failed: Registers["failed"] = []
  await Promise.all(
    files.map(async (file) => {
      let pending = parsed.get(file.key)
      if (!pending) {
        pending = readRegister(file)
        parsed.set(file.key, pending)
      }
      try {
        const register = await pending
        // Two files for one date are the same list twice; the later name wins.
        const listed = byDate.get(register.date)
        if (!listed || listed.file < file.name) byDate.set(register.date, { ...register, file: file.name })
      } catch (err) {
        failed.push({ file: file.name, message: err instanceof Error ? err.message : "Could not be read" })
      }
    }),
  )
  return {
    version: registerVersion(files),
    registers: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    failed: failed.sort((a, b) => a.file.localeCompare(b.file)),
  }
}

/** A short fingerprint of the saved files and of the shape of what is answered from them. */
function registerVersion(files: SavedFile[]): string {
  let hash = 5381
  for (const char of files.map((file) => file.key).join("|")) hash = (hash * 33 + char.charCodeAt(0)) >>> 0
  return `${ANSWER_FORMAT}.${files.length}-${hash.toString(36)}`
}

/** The fingerprint alone, which takes no parsing: for telling whether cached answers still hold. */
export async function currentRegisterVersion(): Promise<string> {
  return registerVersion(await savedFiles())
}

/**
 * A company's shareholders: the provider's, and for an IDX stock on a saved
 * register, everyone the register names. The register is the record from 1%
 * up, so the provider keeps only its smaller holders there, mostly foreign
 * funds. A stock the provider knows nothing of can still be on the register.
 * The register lists every IDX company, so it also tells what else each of
 * its holders owns there.
 */
export async function shareholders(provider: DataProvider, symbol: string): Promise<Ownership> {
  const code = HOME_SYMBOL.exec(symbol.toUpperCase())?.[1]
  const [base, saved] = await Promise.all([
    provider.ownership
      ? provider.ownership(symbol).catch((err: unknown) => (err instanceof Error ? err : new Error("Unknown error")))
      : new ProviderError("This data provider has no shareholder data", 404),
    code ? loadRegisters() : null,
  ])
  const known = base instanceof Error ? null : base
  const listed = code && saved ? registerOwnership(saved.registers, code, known?.price ?? null) : null
  if (!code || !saved || !listed) {
    if (base instanceof Error) throw base
    return base
  }

  const of = (kinds: string[]) => listed.holders.reduce((sum, holder) => sum + (kinds.includes(holder.kind) ? holder.percent : 0), 0)
  // The holders are from one register, and so is what else they own.
  const portfolios = registerPortfolios(saved.registers.find((register) => register.date === listed.date)!, code)
  const registered = listed.holders.map((holder) => {
    const others = portfolios.get(holder.name)
    if (!others) return holder
    const elsewhere = others.map((row) => ({ symbol: homeSymbol(row.code), name: row.issuer, percent: row.percent, shares: row.shares }))
    return { ...holder, elsewhere }
  })
  return {
    symbol,
    name: known?.name ?? listed.name,
    currency: known?.currency ?? "IDR",
    price: known?.price ?? null,
    // Without the provider's totals, the named holders are the least that each side holds.
    insiders: known?.insiders ?? of(["company", "person"]),
    institutions: known?.institutions ?? of(["institution", "fund"]),
    holders: [...registered, ...(known?.holders.filter((holder) => holder.percent < REGISTER_THRESHOLD) ?? [])].sort(
      (a, b) => b.percent - a.percent,
    ),
    register: { date: listed.date, threshold: REGISTER_THRESHOLD, changes: listed.changes },
  }
}
