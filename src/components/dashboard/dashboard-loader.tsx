"use client"

import dynamic from "next/dynamic"

/**
 * The dashboard reads the watchlist from browser storage on its first render,
 * so it only renders on the client. The server sends this skeleton.
 */
const Dashboard = dynamic(() => import("./dashboard").then((m) => m.Dashboard), {
  ssr: false,
  loading: () => <DashboardSkeleton />,
})

export function DashboardLoader() {
  return <Dashboard />
}

function DashboardSkeleton() {
  return (
    <div className="flex min-h-screen flex-col" aria-busy="true" aria-label="Loading">
      <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center gap-2 px-4 lg:px-6">
        <div className="size-7 rounded-lg bg-primary" />
        <div className="h-4 w-20 rounded bg-muted" />
      </div>
      <div className="mx-auto grid w-full max-w-[1440px] gap-6 px-4 pt-2 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-6">
        <div className="flex flex-col gap-4">
          <div className="h-7 w-80 max-w-full rounded-lg bg-muted" />
          <div className="h-[480px] rounded-2xl bg-muted/60" />
        </div>
        <div className="h-[420px] rounded-2xl bg-muted/60" />
      </div>
    </div>
  )
}
