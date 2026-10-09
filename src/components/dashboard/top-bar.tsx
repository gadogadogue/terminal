"use client"

import { ChartSplineIcon, DownloadIcon, EllipsisIcon, PencilIcon, RotateCcwIcon, UploadIcon } from "lucide-react"
import { useState } from "react"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function TopBar({
  name,
  onImport,
  onExport,
  onRename,
  onReset,
}: {
  name: string
  onImport: () => void
  onExport: () => void
  onRename: (name: string) => void
  onReset: () => void
}) {
  const [renaming, setRenaming] = useState(false)

  return (
    <header className="mx-auto flex h-14 w-full max-w-[1440px] items-center gap-3 px-4 lg:px-6">
      <div className="flex shrink-0 items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <ChartSplineIcon className="size-4" />
        </span>
        <span className="font-semibold tracking-tight">Terminal</span>
      </div>
      <span className="text-muted-foreground/50" aria-hidden>
        /
      </span>
      <button
        type="button"
        onClick={() => setRenaming(true)}
        className="min-w-0 truncate rounded-md text-sm text-muted-foreground hover:text-foreground"
        title="Rename watchlist"
      >
        {name}
      </button>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <Button variant="outline" size="sm" onClick={onImport} title="Open a watchlist file">
          <UploadIcon data-icon="inline-start" />
          <span className="hidden sm:inline">Import</span>
        </Button>
        <Button size="sm" onClick={onExport} title="Download this watchlist as a file">
          <DownloadIcon data-icon="inline-start" />
          <span className="hidden sm:inline">Export</span>
        </Button>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="More">
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setRenaming(true)}>
              <PencilIcon /> Rename watchlist…
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onReset}>
              <RotateCcwIcon /> Reset to sample
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <ThemeToggle />
      </div>

      <RenameDialog open={renaming} onOpenChange={setRenaming} name={name} onRename={onRename} />
    </header>
  )
}

function RenameDialog({
  open,
  onOpenChange,
  name,
  onRename,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  name: string
  onRename: (name: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault()
            const value = String(new FormData(e.currentTarget).get("name") ?? "").trim()
            if (value) onRename(value.slice(0, 120))
            onOpenChange(false)
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename watchlist</DialogTitle>
            <DialogDescription>The name is saved in the file and used for its filename.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="watchlist-name">Name</Label>
            <Input id="watchlist-name" name="name" defaultValue={name} maxLength={120} autoFocus />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
