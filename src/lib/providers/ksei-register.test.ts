import { describe, expect, it } from "vitest"
import {
  holderKind,
  parseRegister,
  registerChanges,
  registerHolders,
  registerOwnership,
  type PageText,
  type Register,
  type RegisterRow,
} from "./ksei-register"

/** A page from its lines, top to bottom; each line is its cells as [x, text]. `leading` is the gap between baselines. */
function page(lines: [number, string][][], leading = 6): PageText[] {
  return lines.flatMap((cells, i) => cells.map(([x, text]) => ({ text, x, y: 600 - i * leading })))
}

const HEADINGS: [number, string][] = [
  [28, "DATE"], [48, "SHARE_CODE"], [108, "ISSUER_NAME"], [277, "INVESTOR_NAME"], [422, "INVESTOR_TYPE"],
  [457, "LOCAL_FOREIGN"], [500, "NATIONALITY"], [561, "DOMICILE"], [610, "HOLDINGS_SCRIPLESS"],
  [655, "HOLDINGS_SCRIP"], [693, "TOTAL_HOLDING_SHARES"], [746, "PERCENTAGE"],
]

/** The first list: types as two-letter codes, centered in their column, "A" for foreign. */
const FIRST = page([
  [[72, "Yth. Bapak/Ibu PT Bursa Efek Indonesia (BEI)"]],
  [[72, "laporan total kepemilikan saham Investor di atas 1% per tanggal 27 Februari 2026."]],
  HEADINGS,
  [[22, "27-Feb-2026"], [56, "BBCA"], [75, "BANK CENTRAL ASIA Tbk"], [168, "PT DWIMURIA INVESTAMA ANDALAN"], [435, "CP"], [467, "L"], [560, "INDONESIA"], [686, "0"], [700, "67.729.950.000"], [717, "67.729.950.000"], [761, "54,94"]],
  [[22, "27-Feb-2026"], [56, "BBCA"], [75, "BANK CENTRAL ASIA Tbk"], [168, "ANTHONI SALIM"], [435, "ID"], [467, "L"], [501, "INDONESIAN"], [560, "INDONESIA"], [625, "1.416.306.835"], [686, "0"], [717, "1.416.306.835"], [761, "1,15"]],
  [[22, "27-Feb-2026"], [56, "BBRI"], [75, "BANK RAKYAT INDONESIA Tbk"], [168, "GOVERNMENT OF NORWAY"], [436, "IB"], [471, "A"], [562, "NORWAY"], [625, "1.600.000.000"], [686, "0"], [717, "1.600.000.000"], [761, "1,06"]],
  [[22, "27-Feb-2026"], [56, "BBRI"], [75, "BANK RAKYAT INDONESIA Tbk"], [168, "REKSA DANA SAHAM NUSANTARA"], [434, "MF"], [467, "L"], [560, "INDONESIA"], [625, "1.520.000.000"], [686, "0"], [717, "1.520.000.000"], [761, "1"]],
])

describe("parseRegister", () => {
  it("reads each holder's company, name, type, shares and stake, and the list's date", () => {
    expect(parseRegister([FIRST])).toEqual({
      date: "2026-02-27",
      rows: [
        { code: "BBCA", issuer: "BANK CENTRAL ASIA Tbk", investor: "PT DWIMURIA INVESTAMA ANDALAN", type: "Corporate", foreign: false, shares: 67_729_950_000, percent: 0.5494 },
        { code: "BBCA", issuer: "BANK CENTRAL ASIA Tbk", investor: "ANTHONI SALIM", type: "Individual", foreign: false, shares: 1_416_306_835, percent: 0.0115 },
        { code: "BBRI", issuer: "BANK RAKYAT INDONESIA Tbk", investor: "GOVERNMENT OF NORWAY", type: "Bank", foreign: true, shares: 1_600_000_000, percent: 0.0106 },
        { code: "BBRI", issuer: "BANK RAKYAT INDONESIA Tbk", investor: "REKSA DANA SAHAM NUSANTARA", type: "Mutual Funds", foreign: false, shares: 1_520_000_000, percent: 0.01 },
      ],
    })
  })

  it("reads the later layout: other columns, types in words, blank cells, names in two pieces", () => {
    // Tiny type on a portrait page, three points between lines.
    const later = page(
      [
        [[52, "*Penafian:"]],
        [[56, "29-May-2026"], [70, "AALI"], [92, "ASTRA AGRO LESTARI Tbk"], [146, "PT ASTRA INTERNATIONAL TBK"], [272, "Corporate"], [333, "L"], [381, "INDONESIA"], [459, "0"], [474, "1.533.682.440"], [515, "1.533.682.440"], [545, "79,68"]],
        // Shares held on paper: KSEI knows nothing of the investor but the name.
        [[56, "29-May-2026"], [70, "ABBA"], [92, "MAHAKA MEDIA Tbk"], [146, "YAYASAN ABDI BANGSA"], [459, "0"], [476, "111.372.886"], [517, "111.372.886"], [546, "2,83"]],
        // A nationality and no domicile.
        [[56, "29-May-2026"], [70, "ABBA"], [92, "MAHAKA MEDIA Tbk"], [146, "DRS. WINARTO"], [272, "Individual"], [333, "L"], [360, "INDONESIAN"], [448, "178.745.400"], [487, "0"], [517, "178.745.400"], [546, "4,54"]],
        // A domicile and neither type nor local/foreign.
        [[56, "29-May-2026"], [70, "ABBA"], [92, "MAHAKA MEDIA Tbk"], [146, "MEDIAHUIS IRELAND LIMITED"], [381, "IRELAND"], [459, "0"], [476, "282.886.300"], [517, "282.886.300"], [546, "7,19"]],
        // A type without the local/foreign letter.
        [[56, "29-May-2026"], [70, "ABDA"], [92, "ASURANSI BINA DANA ARTA Tbk"], [146, "OONA INDONESIA PTE LTD"], [272, "Insurance"], [381, "SINGAPORE"], [448, "538.535.404"], [487, "0"], [517, "538.535.404"], [545, "86,75"]],
        // The name comes as two pieces of text, and a zero is left blank.
        [[56, "29-May-2026"], [70, "FLMC"], [92, "FALMACO NONWOVEN INDUSTRI Tbk"], [146, "THERESIA INDRA WIRAWAN,"], [178, "SE"], [272, "Individual"], [333, "L"], [360, "INDONESIAN"], [381, "INDONESIA"], [448, "308.477.875"], [517, "308.477.875"], [545, "39,49"]],
        [[56, "29-May-2026"], [70, "FLMC"], [92, "FALMACO NONWOVEN INDUSTRI Tbk"], [146, "PEARL HILL INVESTMENTS LTD"], [272, "Financial Institutional"], [333, "F"], [381, "VIRGIN ISLANDS, BRITISH"], [449, "39.999.999"], [487, "0"], [518, "39.999.999"], [546, "5,12"]],
      ],
      3,
    )
    const { date, rows } = parseRegister([later])
    expect(date).toBe("2026-05-29")
    expect(rows.map((row) => [row.code, row.investor, row.type, row.foreign, row.shares, row.percent])).toEqual([
      ["AALI", "PT ASTRA INTERNATIONAL TBK", "Corporate", false, 1_533_682_440, 0.7968],
      ["ABBA", "YAYASAN ABDI BANGSA", null, null, 111_372_886, 0.0283],
      ["ABBA", "DRS. WINARTO", "Individual", false, 178_745_400, 0.0454],
      ["ABBA", "MEDIAHUIS IRELAND LIMITED", null, null, 282_886_300, 0.0719],
      ["ABDA", "OONA INDONESIA PTE LTD", "Insurance", null, 538_535_404, 0.8675],
      ["FLMC", "THERESIA INDRA WIRAWAN, SE", "Individual", false, 308_477_875, 0.3949],
      ["FLMC", "PEARL HILL INVESTMENTS LTD", "Financial Institutional", true, 39_999_999, 0.0512],
    ])
    expect(rows[0].issuer).toBe("ASTRA AGRO LESTARI Tbk")
  })

  it("reads a list that runs over several pages", () => {
    const second = page([
      HEADINGS,
      [[22, "27-Feb-2026"], [56, "TLKM"], [75, "TELKOM INDONESIA (PERSERO) Tbk"], [168, "NEGARA REPUBLIK INDONESIA"], [435, "OT"], [467, "L"], [560, "INDONESIA"], [625, "51.602.353.560"], [686, "0"], [717, "51.602.353.560"], [761, "52,09"]],
    ])
    const { rows } = parseRegister([FIRST, second])
    expect(rows).toHaveLength(5)
    expect(rows[4]).toMatchObject({ code: "TLKM", investor: "NEGARA REPUBLIK INDONESIA", type: "Others", percent: 0.5209 })
  })

  it("refuses a document that is not a list of holders", () => {
    const letter = page([[[72, "Dengan hormat,"]], [[72, "Total saham beredar 123.456.789 per 27-Feb-2026"]]])
    expect(() => parseRegister([letter])).toThrow(/No shareholder rows/)
    expect(() => parseRegister([])).toThrow(/No shareholder rows/)
  })
})

describe("holderKind", () => {
  it("sorts KSEI's words for an investor into the kinds of holder", () => {
    const kinds = (types: (string | null)[]) => [...new Set(types.map(holderKind))]
    expect(kinds(["Individual"])).toEqual(["person"])
    expect(kinds(["Mutual Funds", "Exchange Traded Funds", "Hedge Fund"])).toEqual(["fund"])
    // Funds in name, but investors in their own right.
    expect(kinds(["Pension Funds", "Sovereign Wealth Fund", "Investment Fund Selling Agent"])).toEqual(["institution"])
    expect(kinds(["Bank", "Private Bank", "Trustee Bank", "Insurance", "Securities Company", "Brokerage Firms"])).toEqual(["institution"])
    expect(kinds(["Private Equity", "Venture Capital", "Investment Advisors", "Investment Manager", "Financial Institutional"])).toEqual(["institution"])
    expect(kinds(["Corporate", "Firm", "Partnership", "State Owned Enterprises", "Government", "Cooperatives", "Foundation", "Others"])).toEqual(["company"])
    // A word KSEI adds later, or none at all, is a company until it says otherwise.
    expect(kinds(["Diocese", null])).toEqual(["company"])
  })
})

const row = (code: string, investor: string, shares: number, percent: number, type: string | null = "Corporate"): RegisterRow => ({
  code,
  issuer: `${code} Tbk`,
  investor,
  type,
  foreign: false,
  shares,
  percent,
})

const april: Register = {
  date: "2026-04-30",
  rows: [
    row("BBCA", "PT DWIMURIA INVESTAMA ANDALAN", 67_729_950_000, 0.5494),
    row("BBCA", "GOVERNMENT OF NORWAY", 1_267_492_336, 0.0103, "Sovereign Wealth Fund"),
    row("BBCA", "KAIROS EKSPRES INTERNASIONAL PT", 1_300_000_000, 0.0105),
    row("BBCA", "BUDI HARTONO", 1_500_000_000, 0.0122, "Individual"),
    row("BBCA", "A FUND THAT LEAVES", 1_250_000_000, 0.0101, "Mutual Funds"),
    row("BBRI", "NEGARA REPUBLIK INDONESIA", 80_000_000_000, 0.53, "Others"),
  ],
}

const may: Register = {
  date: "2026-05-29",
  rows: [
    row("BBCA", "PT DWIMURIA INVESTAMA ANDALAN", 67_729_950_000, 0.5494),
    row("BBCA", "GOVERNMENT OF NORWAY", 1_242_345_154, 0.0101, "Sovereign Wealth Fund"),
    // The same company under another spelling, with the same shares.
    row("BBCA", "PT. KAIROS EKSPRES INTERNASIONAL", 1_300_000_000, 0.0105),
    row("BBCA", "BUDI HARTONO", 1_800_000_000, 0.0146, "Individual"),
    row("BBCA", "A NEWCOMER", 1_400_000_000, 0.0114, "Private Equity"),
    row("TLKM", "NEGARA REPUBLIK INDONESIA", 51_602_353_560, 0.5209, "Others"),
  ],
}

describe("registerHolders", () => {
  it("adds up an investor listed twice, once for shares on screen and once on paper", () => {
    const register: Register = {
      date: "2026-05-29",
      rows: [
        row("AALI", "PT ASTRA INTERNATIONAL TBK", 1_000_000_000, 0.52, null),
        row("AALI", "ASTRA INTERNATIONAL TBK, PT", 533_682_440, 0.2768),
        row("AALI", "SOMEONE ELSE", 40_000_000, 0.02),
        row("BBCA", "PT ASTRA INTERNATIONAL TBK", 1, 0.01),
      ],
    }
    const holders = [...registerHolders(register, "AALI").values()]
    expect(holders.map((h) => [h.investor, h.shares, h.type])).toEqual([
      ["PT ASTRA INTERNATIONAL TBK", 1_533_682_440, "Corporate"],
      ["SOMEONE ELSE", 40_000_000, "Corporate"],
    ])
    expect(holders[0].percent).toBeCloseTo(0.7968, 10)
  })
})

describe("registerChanges", () => {
  it("tells buying, selling, arriving and leaving apart, largest move first", () => {
    const changes = registerChanges(april, may, "BBCA")
    expect(changes.map((c) => [c.name, c.before?.shares ?? null, c.after?.shares ?? null])).toEqual([
      ["A NEWCOMER", null, 1_400_000_000],
      ["A FUND THAT LEAVES", 1_250_000_000, null],
      ["BUDI HARTONO", 1_500_000_000, 1_800_000_000],
      ["GOVERNMENT OF NORWAY", 1_267_492_336, 1_242_345_154],
    ])
    expect(changes[0]).toMatchObject({ kind: "institution", type: "Private Equity", from: "2026-04-30", to: "2026-05-29" })
    expect(changes[3].before).toEqual({ shares: 1_267_492_336, percent: 0.0103 })
  })

  it("does not take a new spelling for a sale and a purchase", () => {
    expect(registerChanges(april, may, "BBCA").some((c) => c.name.includes("KAIROS"))).toBe(false)
  })

  it("reports nothing for a company that one of the registers leaves out", () => {
    expect(registerChanges(april, may, "BBRI")).toEqual([])
    expect(registerChanges(april, may, "TLKM")).toEqual([])
  })
})

describe("registerOwnership", () => {
  const february: Register = { date: "2026-02-27", rows: [row("BBCA", "PT DWIMURIA INVESTAMA ANDALAN", 67_729_950_000, 0.5494)] }

  it("names the latest register's holders, with how far each moved since the one before", () => {
    // Given out of order: dates decide which register is the latest.
    const owned = registerOwnership([may, february, april], "BBCA", 9000)!
    expect(owned).toMatchObject({ name: "BBCA Tbk", date: "2026-05-29" })
    expect(owned.holders.map((h) => [h.name, h.kind, h.percent])).toEqual([
      ["PT DWIMURIA INVESTAMA ANDALAN", "company", 0.5494],
      ["BUDI HARTONO", "person", 0.0146],
      ["A NEWCOMER", "institution", 0.0114],
      ["PT. KAIROS EKSPRES INTERNASIONAL", "company", 0.0105],
      ["GOVERNMENT OF NORWAY", "institution", 0.0101],
    ])
    const moved = Object.fromEntries(owned.holders.map((h) => [h.name, h.change]))
    expect(moved["PT DWIMURIA INVESTAMA ANDALAN"]).toBe(0)
    expect(moved["BUDI HARTONO"]).toBeCloseTo(0.2, 10)
    expect(moved["GOVERNMENT OF NORWAY"]).toBeCloseTo(-0.01984, 4)
    // Renamed, so unmoved; and nobody knows what a newcomer held before.
    expect(moved["PT. KAIROS EKSPRES INTERNASIONAL"]).toBe(0)
    expect(moved["A NEWCOMER"]).toBeNull()
    expect(owned.holders[0]).toMatchObject({ shares: 67_729_950_000, value: 67_729_950_000 * 9000, reported: "2026-05-29", foreign: false })
  })

  it("lists what changed between each register and the next, newest first", () => {
    const { changes } = registerOwnership([february, april, may], "BBCA", null)!
    expect(changes.map((c) => c.to)).toEqual([...Array(4).fill("2026-05-29"), ...Array(4).fill("2026-04-30")])
    // Everyone but Dwimuria arrived between February and April.
    expect(changes.slice(4).every((c) => c.before === null && c.from === "2026-02-27")).toBe(true)
  })

  it("knows no moves from a single register, and nothing of a company that is on none", () => {
    const owned = registerOwnership([april], "BBRI", null)!
    expect(owned.holders).toEqual([
      { name: "NEGARA REPUBLIK INDONESIA", kind: "company", type: "Others", foreign: false, percent: 0.53, shares: 80_000_000_000, value: null, change: null, reported: "2026-04-30" },
    ])
    expect(owned.changes).toEqual([])
    expect(registerOwnership([april, may], "ZZZZ", null)).toBeNull()
  })
})
