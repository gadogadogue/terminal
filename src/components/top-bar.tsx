"use client"

import { ChartSplineIcon, DownloadIcon, EllipsisIcon, PencilIcon, RotateCcwIcon, UploadIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
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
import { cn } from "@/lib/utils"

const SECTIONS = [
  { href: "/", label: "Compare" },
  { href: "/screener", label: "Screener" },
  { href: "/valuation", label: "Valuation" },
  { href: "/ownership", label: "Ownership" },
] as const

function SectionNav() {
  const pathname = usePathname()
  const current = useRef<HTMLAnchorElement>(null)

  // On a phone the sections don't all fit and the row scrolls sideways; keep the current one in sight.
  useEffect(() => {
    current.current?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [pathname])

  return (
    <nav
      className="flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] md:ml-3"
      aria-label="Sections"
    >
      {SECTIONS.map(({ href, label }) => {
        const active = pathname === href
        return (
          <Button
            key={href}
            asChild
            variant="ghost"
            size="sm"
            className={cn("shrink-0", active ? "bg-muted text-foreground" : "text-muted-foreground")}
          >
            <Link href={href} ref={active ? current : undefined} aria-current={active ? "page" : undefined}>
              {label}
            </Link>
          </Button>
        )
      })}
    </nav>
  )
}

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
        <span className="hidden font-semibold tracking-tight sm:inline">Terminal</span>
      </div>
      <span className="hidden text-muted-foreground/50 md:inline" aria-hidden>
        /
      </span>
      <button
        type="button"
        onClick={() => setRenaming(true)}
        className="hidden min-w-0 truncate rounded-md text-sm text-muted-foreground hover:text-foreground md:block"
        title="Rename watchlist"
      >
        {name}
      </button>
      <SectionNav />

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
