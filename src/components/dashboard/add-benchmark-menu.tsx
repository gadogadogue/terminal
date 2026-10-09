"use client"

import { CheckIcon, PlusIcon } from "lucide-react"
import { useState } from "react"
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CASH_CURRENCIES } from "@/lib/currency"
import { instrumentKey, type Instrument } from "@/lib/instruments"
import { SymbolSearchDialog } from "./symbol-search-dialog"

const PRESETS: Instrument[] = [
  { kind: "ticker", symbol: "GC=F", name: "Gold" },
  { kind: "ticker", symbol: "SI=F", name: "Silver" },
  { kind: "ticker", symbol: "BTC-USD", name: "Bitcoin" },
  { kind: "ticker", symbol: "^GSPC", name: "S&P 500" },
  { kind: "ticker", symbol: "^NDX", name: "Nasdaq 100" },
  { kind: "ticker", symbol: "^JKSE", name: "IDX Composite" },
]

export function AddBenchmarkMenu({
  existing,
  baseCurrency,
  onAdd,
}: {
  existing: Set<string>
  baseCurrency: string
  onAdd: (instrument: Instrument) => void
}) {
  const [dialog, setDialog] = useState<"fixed" | "cash" | "search" | null>(null)
  const close = (open: boolean) => !open && setDialog(null)

  return (
    <>
      {/* Non-modal so focus returns cleanly when a menu item opens a dialog. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <PlusIcon data-icon="inline-start" /> Add
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Markets</DropdownMenuLabel>
          {PRESETS.map((preset) => {
            const added = existing.has(instrumentKey(preset))
            return (
              <DropdownMenuItem key={instrumentKey(preset)} disabled={added} onSelect={() => onAdd(preset)}>
                {preset.name}
                <span className="ml-auto text-xs text-muted-foreground">
                  {added ? <CheckIcon className="size-3.5" /> : preset.kind === "ticker" && preset.symbol}
                </span>
              </DropdownMenuItem>
            )
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setDialog("fixed")}>Fixed annual return…</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("cash")}>Hold a currency…</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("search")}>Search any symbol…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <FixedRateDialog open={dialog === "fixed"} onOpenChange={close} onAdd={onAdd} />
      <CashDialog open={dialog === "cash"} onOpenChange={close} onAdd={onAdd} baseCurrency={baseCurrency} />
      <SymbolSearchDialog open={dialog === "search"} onOpenChange={close} title="Add a benchmark" onSelect={onAdd} />
    </>
  )
}

function FixedRateDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (instrument: Instrument) => void
}) {
  const [value, setValue] = useState("7")
  const rate = Number(value)
  const valid = value.trim() !== "" && Number.isFinite(rate) && rate > -50 && rate <= 100

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault()
            if (!valid) return
            onAdd({ kind: "fixed", rate: Math.round(rate * 100) / 100 })
            onOpenChange(false)
          }}
        >
          <DialogHeader>
            <DialogTitle>Fixed annual return</DialogTitle>
            <DialogDescription>
              A steady line compounding at this rate, e.g. a deposit or a target return.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="fixed-rate">Rate per year (%)</Label>
            <Input
              id="fixed-rate"
              type="number"
              inputMode="decimal"
              step="0.1"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={!valid}
              autoFocus
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!valid}>
              Add benchmark
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CashDialog({
  open,
  onOpenChange,
  onAdd,
  baseCurrency,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (instrument: Instrument) => void
  baseCurrency: string
}) {
  const [currency, setCurrency] = useState("USD")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Hold a currency</DialogTitle>
          <DialogDescription>
            Shows what simply holding this currency did, measured in your base currency ({baseCurrency}).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="cash-currency">Currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger id="cash-currency" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CASH_CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            onClick={() => {
              onAdd({ kind: "cash", currency })
              onOpenChange(false)
            }}
          >
            Add benchmark
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
