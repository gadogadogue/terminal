import { cacheLife } from "next/cache"
import { connection } from "next/server"
import { getProvider, ProviderError, type MarketSnapshot } from "@/lib/providers"

type Result = { ok: true; data: MarketSnapshot } | { ok: false; status: number; message: string }

async function loadSnapshot(): Promise<Result> {
  "use cache"
  try {
    const data = await getProvider().screen!()
    cacheLife("hours")
    return { ok: true, data }
  } catch (err) {
    cacheLife("seconds")
    const status = err instanceof ProviderError ? err.status : 502
    return { ok: false, status, message: err instanceof Error ? err.message : "Screener failed" }
  }
}

/** GET /api/screener: every stock in the home market with valuation inputs. */
export async function GET() {
  // Live market data: fetch at request time, never while building.
  await connection()
  if (!getProvider().screen) {
    return Response.json({ error: "This data provider has no screener" }, { status: 501 })
  }

  const result = await loadSnapshot()
  if (!result.ok) {
    return Response.json({ error: result.message }, { status: result.status })
  }
  return Response.json(result.data, {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" },
  })
}
