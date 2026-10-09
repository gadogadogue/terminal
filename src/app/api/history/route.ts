import { cacheLife } from "next/cache"
import type { NextRequest } from "next/server"
import { getProvider, ProviderError, SYMBOL_PATTERN, type PriceHistory } from "@/lib/providers"
import { FETCH_RANGES, type FetchRange } from "@/lib/ranges"

type Result = { ok: true; data: PriceHistory } | { ok: false; status: number; message: string }

async function loadHistory(symbol: string, range: FetchRange): Promise<Result> {
  "use cache"
  try {
    const data = await getProvider().history(symbol, range)
    cacheLife("hours")
    return { ok: true, data }
  } catch (err) {
    const status = err instanceof ProviderError ? err.status : 502
    // Unknown symbols stay unknown; upstream hiccups should retry soon.
    if (status === 404) cacheLife("hours")
    else cacheLife("seconds")
    return { ok: false, status, message: err instanceof Error ? err.message : "Unknown error" }
  }
}

/** GET /api/history?symbol=BBCA.JK&range=1y */
export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol") ?? ""
  const range = request.nextUrl.searchParams.get("range") ?? "1y"

  if (!SYMBOL_PATTERN.test(symbol)) {
    return Response.json({ error: "Invalid symbol" }, { status: 400 })
  }
  if (!(FETCH_RANGES as readonly string[]).includes(range)) {
    return Response.json({ error: "Invalid range" }, { status: 400 })
  }

  const result = await loadHistory(symbol, range as FetchRange)
  if (!result.ok) {
    return Response.json({ error: result.message }, { status: result.status })
  }
  return Response.json(result.data, {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" },
  })
}
