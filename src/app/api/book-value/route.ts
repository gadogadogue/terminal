import { cacheLife } from "next/cache"
import type { NextRequest } from "next/server"
import { getProvider, ProviderError, SYMBOL_PATTERN, type BookValueHistory } from "@/lib/providers"

type Result = { ok: true; data: BookValueHistory } | { ok: false; status: number; message: string }

async function loadBookValue(symbol: string): Promise<Result> {
  "use cache"
  try {
    const data = await getProvider().bookValue!(symbol)
    // Balance sheets change a few times a year.
    cacheLife("days")
    return { ok: true, data }
  } catch (err) {
    const status = err instanceof ProviderError ? err.status : 502
    // A symbol without accounts stays without them; upstream hiccups should retry soon.
    if (status === 404) cacheLife("hours")
    else cacheLife("seconds")
    return { ok: false, status, message: err instanceof Error ? err.message : "Unknown error" }
  }
}

/** GET /api/book-value?symbol=BBCA.JK: book value per share at each balance-sheet date. */
export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol") ?? ""

  if (!SYMBOL_PATTERN.test(symbol)) {
    return Response.json({ error: "Invalid symbol" }, { status: 400 })
  }
  if (!getProvider().bookValue) {
    return Response.json({ error: "This data provider has no balance sheets" }, { status: 501 })
  }

  const result = await loadBookValue(symbol)
  if (!result.ok) {
    return Response.json({ error: result.message }, { status: result.status })
  }
  return Response.json(result.data, {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400" },
  })
}
