"use client"

import dynamic from "next/dynamic"

/**
 * Like the dashboard, the ownership page reads the workspace from browser
 * storage on its first render, so it only renders on the client.
 */
const Ownership = dynamic(() => import("./ownership").then((m) => m.Ownership), {
  ssr: false,
  loading: () => <OwnershipSkeleton />,
})

export function OwnershipLoader() {
  return <Ownership />
}

function OwnershipSkeleton() {
  return (
    <div className="flex min-h-screen flex-col" aria-busy="true" aria-label="Loading">
      <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center gap-2 px-4 lg:px-6">
        <div className="size-7 rounded-lg bg-primary" />
        <div className="h-4 w-20 rounded bg-muted" />
      </div>
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 pt-2 lg:px-6">
        <div className="h-7 w-64 max-w-full rounded-lg bg-muted" />
        <div className="h-[560px] rounded-2xl bg-muted/60" />
      </div>
    </div>
  )
}
