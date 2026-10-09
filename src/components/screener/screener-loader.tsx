"use client"

import dynamic from "next/dynamic"

/**
 * Like the dashboard, the screener reads the workspace from browser storage
 * on its first render, so it only renders on the client.
 */
const Screener = dynamic(() => import("./screener").then((m) => m.Screener), {
  ssr: false,
  loading: () => <ScreenerSkeleton />,
})

export function ScreenerLoader() {
  return <Screener />
}

function ScreenerSkeleton() {
  return (
    <div className="flex min-h-screen flex-col" aria-busy="true" aria-label="Loading">
      <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center gap-2 px-4 lg:px-6">
        <div className="size-7 rounded-lg bg-primary" />
        <div className="h-4 w-20 rounded bg-muted" />
      </div>
      <div className="mx-auto grid w-full max-w-[1440px] gap-6 px-4 pt-2 lg:grid-cols-[288px_minmax(0,1fr)] lg:px-6">
        <div className="h-[560px] rounded-2xl bg-muted/60" />
        <div className="h-[640px] rounded-2xl bg-muted/60" />
      </div>
    </div>
  )
}
