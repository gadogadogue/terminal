import { cacheLife } from "next/cache"
import type { NextRequest } from "next/server"
import {
  currentRegisterVersion,
  getProvider,
  ProviderError,
  shareholders,
  SYMBOL_PATTERN,
  type Ownership,
} from "@/lib/providers"

type Result = { ok: true; data: Ownership } | { ok: false; status: number; message: string }

async function loadShareholders(symbol: string, register: string): Promise<Result> {
  "use cache"
  // Not read, but part of what the answer is cached under: it changes when
  // the saved shareholder lists do, so an answer never outlives its files.
  void register
  try {
    const data = await shareholders(getProvider(), symbol)
    // Holders file monthly or quarterly.
    cacheLife("days")
    return { ok: true, data }
  } catch (err) {
    const status = err instanceof ProviderError ? err.status : 502
    // A symbol without shareholders stays without them; upstream hiccups should retry soon.
    if (status === 404) cacheLife("hours")
    else cacheLife("seconds")
    return { ok: false, status, message: err instanceof Error ? err.message : "Unknown error" }
  }
}

/**
 * GET /api/shareholders?symbol=BBCA.JK: a company's named shareholders, how
 * much insiders and institutions hold, and for IDX stocks on a saved
 * register, what its holders did between registers.
 */
export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol") ?? ""

  if (!SYMBOL_PATTERN.test(symbol)) {
    return Response.json({ error: "Invalid symbol" }, { status: 400 })
  }

  // The client sends the version it knows only to get a URL of its own; the files decide.
  const result = await loadShareholders(symbol, await currentRegisterVersion())
  if (!result.ok) {
    return Response.json({ error: result.message }, { status: result.status })
  }
  return Response.json(result.data, {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400" },
  })
}
