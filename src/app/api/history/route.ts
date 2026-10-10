import { cacheLife } from "next/cache"
import type { NextRequest } from "next/server"
import {
  getProvider,
  PRICE_BASES,
  ProviderError,
  SYMBOL_PATTERN,
  type PriceBasis,
  type PriceHistory,
} from "@/lib/providers"
import { FETCH_RANGES, type FetchRange } from "@/lib/ranges"

type Result = { ok: true; data: PriceHistory } | { ok: false; status: number; message: string }

async function loadHistory(symbol: string, range: FetchRange, basis: PriceBasis): Promise<Result> {
  "use cache"
  try {
    const data = await getProvider().history(symbol, range, basis)
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

/** GET /api/history?symbol=BBCA.JK&range=1y, plus &basis=price for closes without dividends */
export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol") ?? ""
  const range = request.nextUrl.searchParams.get("range") ?? "1y"
  const basis = request.nextUrl.searchParams.get("basis") ?? "total"

  if (!SYMBOL_PATTERN.test(symbol)) {
    return Response.json({ error: "Invalid symbol" }, { status: 400 })
  }
  if (!(FETCH_RANGES as readonly string[]).includes(range)) {
    return Response.json({ error: "Invalid range" }, { status: 400 })
  }
  if (!(PRICE_BASES as readonly string[]).includes(basis)) {
    return Response.json({ error: "Invalid basis" }, { status: 400 })
  }

  const result = await loadHistory(symbol, range as FetchRange, basis as PriceBasis)
  if (!result.ok) {
    return Response.json({ error: result.message }, { status: result.status })
  }
  return Response.json(result.data, {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" },
  })
}
