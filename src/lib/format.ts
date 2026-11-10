const percent = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
})

/** 0.1234 → "+12.34%". */
export function formatPercent(fraction: number | null | undefined): string {
  return fraction == null || !Number.isFinite(fraction) ? "—" : percent.format(fraction)
}

const shortPercent = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})
const signedShortPercent = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
})

/** One decimal, for dense tables: 0.1534 → "15.3%", or "+15.3%" when signed. */
export function formatShortPercent(fraction: number | null | undefined, signed = false): string {
  if (fraction == null || !Number.isFinite(fraction)) return "—"
  return (signed ? signedShortPercent : shortPercent).format(fraction)
}

const share = new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** A part of a whole, which has no sign: 0.0059 → "0.59%". */
export function formatShare(fraction: number | null | undefined): string {
  return fraction == null || !Number.isFinite(fraction) ? "—" : share.format(fraction)
}

/** A multiple like P/E: two decimals while small, fewer as it grows. */
export function formatRatio(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  const digits = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })
const signedCompact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
})

/** 743_192_618_074_112 → "743.2T", or "+743.2T" when signed. */
export function formatAmount(value: number | null | undefined, signed = false): string {
  return value == null || !Number.isFinite(value) ? "—" : (signed ? signedCompact : compact).format(value)
}

/** A value already in percent units: 12.34 → "+12.34%". */
export function formatChange(pct: number | null | undefined): string {
  return pct == null || !Number.isFinite(pct) ? "—" : percent.format(pct / 100)
}

const ZERO_DECIMAL = new Set(["IDR", "JPY", "KRW", "VND"])

export function formatPrice(value: number | null | undefined, currency?: string): string {
  if (value == null || !Number.isFinite(value)) return "—"
  // Sub-unit prices (1 IDR in USD, small coins) need significant digits, not decimals.
  if (Math.abs(value) < 1) return value.toLocaleString("en-US", { maximumSignificantDigits: 4 })
  const digits = currency && ZERO_DECIMAL.has(currency) && value >= 100 ? 0 : 2
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

/** "2026-10-09" → "9 Oct 2026". */
export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })

/** "2026-10-09" → "9 Oct", keeping the year when it isn't the year of `reference`. */
export function formatShortDate(iso: string, reference: string): string {
  return iso.slice(0, 4) === reference.slice(0, 4) ? dayMonth.format(new Date(`${iso}T00:00:00Z`)) : formatDate(iso)
}

/** Text color class for a signed number; the sign itself is always printed. */
export function signClass(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) return "text-muted-foreground"
  return value > 0 ? "text-positive" : "text-negative"
}
