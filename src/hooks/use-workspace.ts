"use client"

import { useEffect, useState } from "react"
import { defaultWorkspace, parseWatchlistFile, toWatchlistFile, type Workspace } from "@/lib/workspace"

/**
 * The browser keeps a working copy so a refresh doesn't lose anything. It is
 * a convenience cache, stored in the same format as an exported file; the
 * exported file is what users keep and share.
 */
const STORAGE_KEY = "finance-terminal.workspace"

function loadStored(): Workspace {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) return parseWatchlistFile(JSON.parse(raw))
  } catch {
    // Unreadable or blocked storage: start from the sample.
  }
  return defaultWorkspace()
}

/** Client-only: render under a component loaded with `ssr: false`. */
export function useWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace>(loadStored)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toWatchlistFile(workspace)))
    } catch {
      // Private mode or quota: the session still works, it just won't persist.
    }
  }, [workspace])

  return [workspace, setWorkspace] as const
}
