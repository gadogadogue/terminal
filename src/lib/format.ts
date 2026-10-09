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

/** Text color class for a signed number; the sign itself is always printed. */
export function signClass(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) return "text-muted-foreground"
  return value > 0 ? "text-positive" : "text-negative"
}
