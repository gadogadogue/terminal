import { cacheLife } from "next/cache"
import { connection } from "next/server"
import { getProvider, marketHistory, ProviderError, type MarketHistory } from "@/lib/providers"

type Result = { ok: true; data: MarketHistory } | { ok: false; status: number; message: string }

async function loadMarketHistory(): Promise<Result> {
  "use cache"
  try {
    // Two requests per stock, for the whole market: worth keeping for hours.
    const data = await marketHistory(getProvider())
    cacheLife("hours")
    return { ok: true, data }
  } catch (err) {
    cacheLife("seconds")
    const status = err instanceof ProviderError ? err.status : 502
    return { ok: false, status, message: err instanceof Error ? err.message : "Could not read the market's history" }
  }
}

/** GET /api/screener/history: a year of prices and book values for every stock in the home market. */
export async function GET() {
  // Live market data: fetch at request time, never while building.
  await connection()
  const provider = getProvider()
  if (!provider.screen || !provider.bookValue) {
    return Response.json({ error: "This data provider has no market history" }, { status: 501 })
  }

  const result = await loadMarketHistory()
  if (!result.ok) {
    return Response.json({ error: result.message }, { status: result.status })
  }
  return Response.json(result.data, {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" },
  })
}
