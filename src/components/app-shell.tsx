"use client"

import { useRef } from "react"
import { toast } from "sonner"
import { TopBar } from "@/components/top-bar"
import { downloadJson } from "@/lib/download"
import { defaultWorkspace, parseWatchlistFile, toWatchlistFile, watchlistFilename, type Workspace } from "@/lib/workspace"

/**
 * Page chrome shared by every section: the top bar with the workspace file
 * actions, dropping a file anywhere to import it, and the footer.
 */
export function AppShell({
  workspace,
  onWorkspaceChange,
  children,
}: {
  workspace: Workspace
  onWorkspaceChange: (workspace: Workspace) => void
  children: React.ReactNode
}) {
  const fileInput = useRef<HTMLInputElement>(null)

  const importFile = async (file: File) => {
    try {
      const next = parseWatchlistFile(JSON.parse(await file.text()))
      const previous = workspace
      onWorkspaceChange(next)
      toast.success(`Imported ${next.name}`, {
        description: `${next.watchlist.length} watchlist items, ${next.benchmarks.length} benchmarks`,
        action: { label: "Undo", onClick: () => onWorkspaceChange(previous) },
      })
    } catch (err) {
      toast.error("Could not import that file", {
        description: err instanceof SyntaxError ? "It is not valid JSON." : (err as Error).message,
      })
    }
  }

  const exportFile = () => {
    const filename = watchlistFilename(workspace)
    downloadJson(filename, toWatchlistFile(workspace))
    toast.success(`Saved ${filename}`, { description: "Import it any time to restore this watchlist." })
  }

  const reset = () => {
    const previous = workspace
    onWorkspaceChange(defaultWorkspace())
    toast("Reset to the sample watchlist", { action: { label: "Undo", onClick: () => onWorkspaceChange(previous) } })
  }

  return (
    <div
      className="flex min-h-screen flex-col"
      onDragOver={(e) => e.dataTransfer.types.includes("Files") && e.preventDefault()}
      onDrop={(e) => {
        const file = e.dataTransfer.files[0]
        if (!file) return
        e.preventDefault()
        void importFile(file)
      }}
    >
      <TopBar
        name={workspace.name}
        onImport={() => fileInput.current?.click()}
        onExport={exportFile}
        onRename={(name) => onWorkspaceChange({ ...workspace, name })}
        onReset={reset}
      />
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void importFile(file)
          e.target.value = ""
        }}
      />

      {children}

      <footer className="mx-auto w-full max-w-[1440px] px-4 pb-6 text-xs text-muted-foreground lg:px-6">
        Market data from Yahoo Finance through unofficial endpoints; it may be delayed, incomplete or wrong. For
        research, not investment advice. Charts by{" "}
        <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer" className="underline underline-offset-2">
          TradingView
        </a>
        .
      </footer>
    </div>
  )
}
