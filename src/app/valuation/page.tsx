import type { Metadata } from "next"
import { ValuationLoader } from "@/components/valuation/valuation-loader"

export const metadata: Metadata = {
  title: "Valuation",
  description: "See whether a stock's P/BV or P/E moved because of its price, or its book value or earnings.",
}

export default function ValuationPage() {
  return <ValuationLoader />
}
