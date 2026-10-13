import type { Holder, HolderChange, HolderKind } from "./types"

/**
 * KSEI, Indonesia's securities depository, publishes every holder of more
 * than 1% of each IDX company once a month, as a PDF table on the IDX site.
 * This reads that table from the text of its pages and works out what
 * changed between two months. It is pure: opening the PDF is the caller's job.
 */

/** The smallest stake the list carries, as a fraction of a company. */
export const REGISTER_THRESHOLD = 0.01

/** A piece of text on a page and where it starts. `y` grows up the page, as in a PDF. */
export interface PageText {
  text: string
  x: number
  y: number
}

/** One investor's whole stake in one company. */
export interface RegisterRow {
  /** The company's IDX code, e.g. "BBCA". */
  code: string
  issuer: string
  investor: string
  /** KSEI's word for the sort of investor. Holders of paper share certificates have none. */
  type: string | null
  foreign: boolean | null
  shares: number
  /** Fraction of the company. */
  percent: number
}

export interface Register {
  /** The day the holdings are as of, YYYY-MM-DD. */
  date: string
  rows: RegisterRow[]
}

const DATE = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/
const CODE = /^[A-Z0-9]{3,6}$/
/** Share counts group thousands with dots, and percentages use a decimal comma. */
const COUNT = /^\d{1,3}(?:\.\d{3})*$/
const PERCENT = /^\d{1,3}(?:,\d+)?$/
/** Local, or foreign: "A" for asing in the first lists, "F" since. */
const SIDE = /^[LAF]$/
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7, aug: 8, agu: 8, agt: 8,
  sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, des: 12,
}

/** The first lists gave the sort of investor as a code; later ones spell it out. */
const TYPE_CODES: Record<string, string> = {
  CP: "Corporate",
  ID: "Individual",
  IB: "Bank",
  IS: "Insurance",
  MF: "Mutual Funds",
  PF: "Pension Funds",
  SC: "Securities Company",
  FD: "Foundation",
  OT: "Others",
}

/** Text on one baseline is one line of the table, even in the 3-point type of the later lists. */
const LINE_TOLERANCE = 1
/** How far a cell may start from its column's usual place and still belong to it. */
const COLUMN_TOLERANCE = 3

function isoDate(text: string): string | null {
  const [, day, month, year] = DATE.exec(text) ?? []
  const number = MONTHS[month?.toLowerCase()]
  return number ? `${year}-${String(number).padStart(2, "0")}-${day.padStart(2, "0")}` : null
}

/** The most common of `values`, rounded to whole points. */
function usual(values: number[]): number | null {
  const counts = new Map<number, number>()
  for (const value of values) counts.set(Math.round(value), (counts.get(Math.round(value)) ?? 0) + 1)
  let best: number | null = null
  for (const [value, count] of counts) if (best == null || count > counts.get(best)!) best = value
  return best
}

/** A table line taken apart as far as its own text allows; names still need the columns. */
interface Line {
  date: string
  code: string
  /** Cells between the code and the numbers: names, then what KSEI knows of the investor. */
  cells: PageText[]
  shares: number
  percent: number
}

function tableLines(pages: PageText[][]): Line[] {
  const lines: Line[] = []
  for (const page of pages) {
    const rows: PageText[][] = []
    for (const item of [...page].sort((a, b) => b.y - a.y)) {
      const text = item.text.trim()
      if (!text) continue
      const row = rows.at(-1)
      if (row && Math.abs(row[0].y - item.y) <= LINE_TOLERANCE) row.push({ ...item, text })
      else rows.push([{ ...item, text }])
    }
    for (const row of rows) {
      row.sort((a, b) => a.x - b.x)
      const date = isoDate(row[0].text)
      // Letters, disclaimers and column headings don't start with a date.
      if (!date || row.length < 6 || !CODE.test(row[1].text)) continue
      // The numbers end the line: shares on screen, shares on paper, their total, and the percentage.
      // A zero is sometimes left blank, so only the last two are counted on.
      const percent = row.at(-1)!.text
      const total = row.at(-2)!.text
      if (!PERCENT.test(percent) || !COUNT.test(total)) continue
      let end = row.length - 2
      while (end > 2 && COUNT.test(row[end - 1].text)) end -= 1
      // One division by a power of ten, so "79,68" is exactly the 0.7968 it says.
      const [whole, decimals = ""] = percent.split(",")
      lines.push({
        date,
        code: row[1].text,
        cells: row.slice(2, end),
        shares: Number(total.replaceAll(".", "")),
        percent: Number(whole + decimals) / 10 ** (decimals.length + 2),
      })
    }
  }
  return lines
}

/**
 * Reads the list from the text of a PDF's pages. Page size, type size and
 * column positions have all changed between months, so nothing is assumed
 * about where a column is: the places the investor's name and its type start
 * are taken from the lines themselves.
 */
export function parseRegister(pages: PageText[][]): Register {
  const lines = tableLines(pages).filter((line) => line.cells.length >= 2 && line.shares > 0 && line.percent > 0)
  if (lines.length === 0) throw new Error("No shareholder rows found. Is this KSEI's list of holders above 1%?")

  // Names start flush left in their columns. The type sits just before the local/foreign letter.
  const investorAt = usual(lines.map((line) => line.cells[1].x))!
  const typeAt = usual(
    lines.flatMap(({ cells }) => {
      const side = cells.findLastIndex((cell, i) => i >= 2 && SIDE.test(cell.text))
      return side >= 3 ? [cells[side - 1].x] : []
    }),
  )
  const sideAt = usual(lines.flatMap(({ cells }) => cells.filter((cell, i) => i >= 2 && SIDE.test(cell.text)).map((cell) => cell.x)))
  // Where names end. Without a type column, whatever follows the names starts at the local/foreign letter.
  const namesEnd = (typeAt ?? sideAt ?? Infinity) - COLUMN_TOLERANCE

  const dates = new Map<string, number>()
  const rows = lines.flatMap(({ date, code, cells, shares, percent }): RegisterRow[] => {
    dates.set(date, (dates.get(date) ?? 0) + 1)
    const start = investorAt - COLUMN_TOLERANCE
    const issuer = cells.filter((cell) => cell.x < start)
    const investor = cells.filter((cell) => cell.x >= start && cell.x < namesEnd)
    const rest = cells.filter((cell) => cell.x >= namesEnd)
    if (issuer.length === 0 || investor.length === 0) return []
    const side = rest.findLast((cell) => SIDE.test(cell.text))
    // Nationality and domicile follow the letter; without one, only a cell in the type's own place is a type.
    const type = rest.filter((cell) =>
      side ? cell.x < side.x - COLUMN_TOLERANCE : typeAt != null && Math.abs(cell.x - typeAt) <= COLUMN_TOLERANCE,
    )
    const named = type.map((cell) => cell.text).join(" ")
    return [
      {
        code,
        issuer: issuer.map((cell) => cell.text).join(" "),
        investor: investor.map((cell) => cell.text).join(" "),
        type: named ? (TYPE_CODES[named] ?? named) : null,
        foreign: side ? side.text !== "L" : null,
        shares,
        percent,
      },
    ]
  })
  if (rows.length === 0) throw new Error("No shareholder rows found. Is this KSEI's list of holders above 1%?")
  const date = [...dates].sort((a, b) => b[1] - a[1])[0][0]
  return { date, rows }
}

/**
 * KSEI's words for an investor, sorted into the kinds of holder the app
 * draws. Its list has grown from nine codes to more than thirty words, so
 * this goes by what a word says: anything that isn't a person, a fund or in
 * the business of investing counts as a company.
 */
export function holderKind(type: string | null): HolderKind {
  if (!type) return "company"
  if (/individual/i.test(type)) return "person"
  if (/mutual fund|exchange traded|hedge fund/i.test(type)) return "fund"
  if (/bank|insurance|pension|securities|brokerage|invest|private equity|venture|sovereign|trustee|financial|capital market/i.test(type)) {
    return "institution"
  }
  return "company"
}

/**
 * A holder's name as an identity. The same company is "PT KAIROS EKSPRES"
 * one month and "KAIROS EKSPRES PT" the next, so the words that only say it
 * is a company are dropped, wherever they stand.
 */
const holderKey = (name: string) =>
  name
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((word) => word && word !== "PT" && word !== "TBK")
    .join(" ")

/** A company's rows on one register, one per investor: an investor listed twice has its stakes added up. */
export function registerHolders(register: Register, code: string): Map<string, RegisterRow> {
  const holders = new Map<string, RegisterRow>()
  for (const row of register.rows) {
    if (row.code !== code) continue
    const key = holderKey(row.investor)
    const listed = holders.get(key)
    if (!listed) holders.set(key, { ...row })
    else {
      // Shares held on screen and on paper are listed apart.
      listed.shares += row.shares
      listed.percent += row.percent
      listed.type ??= row.type
      listed.foreign ??= row.foreign
    }
  }
  return holders
}

/** What a company's holders did between an older register and a newer one, largest move first. */
export function registerChanges(older: Register, newer: Register, code: string): HolderChange[] {
  const before = registerHolders(older, code)
  const after = registerHolders(newer, code)
  // A company absent from one of the lists has no changes to speak of, only missing data.
  if (before.size === 0 || after.size === 0) return []

  const stake = (row: RegisterRow | undefined) => (row ? { shares: row.shares, percent: row.percent } : null)
  const moves = [...new Set([...before.keys(), ...after.keys()])].flatMap((key) => {
    const was = before.get(key)
    const is = after.get(key)
    if (was && is && was.shares === is.shares) return []
    const row = (is ?? was)!
    return [{ row, before: stake(was), after: stake(is) }]
  })
  // A holder that left with exactly the shares a newcomer arrived with was only renamed.
  const left = moves.filter((move) => !move.after)
  const renamed = new Set(
    moves.flatMap((move) => {
      if (move.before) return []
      const twin = left.find((other) => other.before!.shares === move.after!.shares)
      return twin ? [move, twin] : []
    }),
  )

  const size = (move: (typeof moves)[number]) => Math.abs((move.after?.percent ?? 0) - (move.before?.percent ?? 0))
  return moves
    .filter((move) => !renamed.has(move))
    .sort((a, b) => size(b) - size(a))
    .map(({ row, before, after }) => ({
      name: row.investor,
      kind: holderKind(row.type),
      ...(row.type && { type: row.type }),
      from: older.date,
      to: newer.date,
      before,
      after,
    }))
}

/**
 * A company's named holders from the latest of `registers`, with what they
 * did between each register and the next. `price` values the stakes.
 */
export function registerOwnership(
  registers: Register[],
  code: string,
  price: number | null,
): { name: string; date: string; holders: Holder[]; changes: HolderChange[] } | null {
  const sorted = [...registers].sort((a, b) => a.date.localeCompare(b.date))
  const latest = sorted.findLast((register) => register.rows.some((row) => row.code === code))
  if (!latest) return null
  // Newest pair of registers first.
  const changes = sorted.flatMap((register, i) => (i === 0 ? [] : [registerChanges(sorted[i - 1], register, code)])).reverse().flat()

  const index = sorted.indexOf(latest)
  const previous = index > 0 ? registerHolders(sorted[index - 1], code) : new Map<string, RegisterRow>()
  const previousShares = new Set([...previous.values()].map((row) => row.shares))
  /** How far a holder's share count moved since the register before, where that is known. */
  const movedBy = (key: string, shares: number) => {
    const was = previous.get(key)
    if (was) return shares / was.shares - 1
    // The same count under another spelling is the same holder, unmoved. A newcomer's earlier stake is unknown.
    return previousShares.has(shares) ? 0 : null
  }

  const rows = [...registerHolders(latest, code)]
  return {
    name: rows[0][1].issuer,
    date: latest.date,
    holders: rows
      .map(([key, row]) => ({
        name: row.investor,
        kind: holderKind(row.type),
        ...(row.type && { type: row.type }),
        ...(row.foreign != null && { foreign: row.foreign }),
        percent: row.percent,
        shares: row.shares,
        value: price == null ? null : row.shares * price,
        change: movedBy(key, row.shares),
        reported: latest.date,
      }))
      .sort((a, b) => b.percent - a.percent),
    changes,
  }
}
