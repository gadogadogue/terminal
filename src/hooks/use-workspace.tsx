"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { defaultWorkspace, parseWatchlistFile, toWatchlistFile, type Workspace } from "@/lib/workspace"

/**
 * The browser keeps a working copy so a refresh doesn't lose anything. It is
 * a convenience cache, stored in the same format as an exported file; the
 * exported file is what users keep and share.
 */
const STORAGE_KEY = "finance-terminal.workspace"

function loadStored(): Workspace {
  // The provider also renders on the server, where only the default exists.
  if (typeof window === "undefined") return defaultWorkspace()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) return parseWatchlistFile(JSON.parse(raw))
  } catch {
    // Unreadable or blocked storage: start from the sample.
  }
  return defaultWorkspace()
}

type WorkspaceState = readonly [Workspace, (workspace: Workspace) => void]

const WorkspaceContext = createContext<WorkspaceState | null>(null)

/**
 * Holds the one workspace every page shares, from the root layout. Next keeps
 * recently visited pages mounted but hidden, so a copy per page would go
 * stale and, when its page came back, save over newer changes.
 */
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspace, setWorkspace] = useState<Workspace>(loadStored)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toWatchlistFile(workspace)))
    } catch {
      // Private mode or quota: the session still works, it just won't persist.
    }
  }, [workspace])

  const state = useMemo(() => [workspace, setWorkspace] as const, [workspace])
  return <WorkspaceContext value={state}>{children}</WorkspaceContext>
}

/**
 * The shared workspace. Read it only in components loaded with `ssr: false`:
 * the server renders with the default, not what this browser has stored.
 */
export function useWorkspace(): WorkspaceState {
  const state = useContext(WorkspaceContext)
  if (!state) throw new Error("useWorkspace must be used inside WorkspaceProvider")
  return state
}
