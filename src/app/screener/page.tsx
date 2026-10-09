import type { Metadata } from "next"
import { ScreenerLoader } from "@/components/screener/screener-loader"

export const metadata: Metadata = {
  title: "Screener",
  description: "Filter IDX stocks by P/BV, ROE, P/E, dividend yield, size and liquidity.",
}

export default function ScreenerPage() {
  return <ScreenerLoader />
}
