import type { Metadata } from "next"
import { Geist } from "next/font/google"
import { Providers } from "@/components/providers"
import "./globals.css"

const geist = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Terminal",
  description: "Compare investments against benchmarks like a fixed 7% return, gold and cash.",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
