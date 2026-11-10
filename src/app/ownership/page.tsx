import type { Metadata } from "next"
import { OwnershipLoader } from "@/components/ownership/ownership-loader"

export const metadata: Metadata = {
  title: "Ownership",
  description: "See who holds your stocks, and which holders they have in common, as a network.",
}

export default function OwnershipPage() {
  return <OwnershipLoader />
}
