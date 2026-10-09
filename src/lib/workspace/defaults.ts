import { defaultScreen } from "@/lib/analytics/screener"
import type { Workspace } from "./types"

/** First-run sample: Indonesian and US markets against common benchmarks. */
export function defaultWorkspace(): Workspace {
  return {
    name: "My watchlist",
    baseCurrency: "IDR",
    range: "1Y",
    watchlist: [
      { kind: "ticker", symbol: "^JKSE", name: "IDX Composite" },
      { kind: "ticker", symbol: "BBCA.JK", name: "Bank Central Asia" },
      { kind: "ticker", symbol: "BBRI.JK", name: "Bank Rakyat Indonesia" },
      { kind: "ticker", symbol: "TLKM.JK", name: "Telkom Indonesia" },
      { kind: "ticker", symbol: "^GSPC", name: "S&P 500" },
      { kind: "ticker", symbol: "BTC-USD", name: "Bitcoin" },
    ],
    benchmarks: [
      { kind: "fixed", rate: 7 },
      { kind: "ticker", symbol: "GC=F", name: "Gold" },
      { kind: "cash", currency: "USD" },
      { kind: "cash", currency: "IDR" },
    ],
    plotted: {
      "ticker:^JKSE": 0,
      "ticker:BBCA.JK": 1,
      "ticker:^GSPC": 2,
      "fixed:7": 3,
      "ticker:GC=F": 4,
      "cash:USD": 5,
      "cash:IDR": 6,
    },
    screener: defaultScreen(),
  }
}
