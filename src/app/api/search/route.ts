import { cacheLife } from "next/cache"
import type { NextRequest } from "next/server"
import { getProvider, type SearchResult } from "@/lib/providers"

type Result = { ok: true; data: SearchResult[] } | { ok: false; message: string }

async function runSearch(query: string): Promise<Result> {
  "use cache"
  try {
    const data = await getProvider().search(query)
    cacheLife("days")
    return { ok: true, data }
  } catch (err) {
    cacheLife("seconds")
    return { ok: false, message: err instanceof Error ? err.message : "Search failed" }
  }
}

/** GET /api/search?q=telkom */
export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 64)
  if (!query) return Response.json([])

  const result = await runSearch(query.toLowerCase())
  if (!result.ok) return Response.json({ error: result.message }, { status: 502 })
  return Response.json(result.data, {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
  })
}
