"use client"

import { Loader2Icon, SearchIcon } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useTheme } from "next-themes"
import { useEffect, useMemo, useState } from "react"
import { AppShell } from "@/components/app-shell"
import { Kbd } from "@/components/dashboard/kbd"
import { SymbolSearchDialog } from "@/components/dashboard/symbol-search-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useOwnership } from "@/hooks/use-ownership"
import { useWorkspace } from "@/hooks/use-workspace"
import {
  MIN_STAKE,
  buildNetwork,
  holdersOf,
  ownershipSplit,
  type OwnershipNetwork as Network,
  type Split,
} from "@/lib/analytics/ownership"
import { CHART_CHROME, type ChartTheme } from "@/lib/chart-palette"
import { formatDate, formatShare } from "@/lib/format"
import { SYMBOL_PATTERN, isCompany, ownershipHref } from "@/lib/instruments"
import { HOLDER_KINDS, type HolderKind, type Ownership as Owned, type RegisterStatus } from "@/lib/providers/types"
import { cn } from "@/lib/utils"
import { ActivityTable } from "./activity-table"
import { KIND_LABELS, stockCode, totalColor } from "./holder-kinds"
import { HoldersTable } from "./holders-table"
import { OwnershipNetwork } from "./ownership-network"

/** Where IDX posts KSEI's monthly lists. */
const IDX_ANNOUNCEMENTS = "https://www.idx.co.id/id/berita/pengumuman"
const REGISTER_TITLE = "Pemegang Saham di atas 1% (KSEI)"

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
/** A threshold as it is said: 0.01 → "1%". */
const plain = (fraction: number) => `${Number((fraction * 100).toFixed(2))}%`

/** What the diagram holds, in a line under its title. */
function summary(network: Network, sharedOnly: boolean): string {
  const stocks = count(network.stocks.length, "stock", "stocks")
  const holders = network.holders.length
  if (network.stocks.length === 0) return "Stocks and the holders they have in common"
  if (sharedOnly) {
    return holders === 0
      ? `${stocks}; no named holder owns more than one of them`
      : `${stocks} and the ${count(holders, "named holder that owns", "named holders that own")} more than one of them`
  }
  if (holders === 0) return `${stocks}; the source names no holders for ${network.stocks.length === 1 ? "it" : "them"}`
  const shared = network.holders.filter((holder) => holder.stocks > 1).length
  const common = network.stocks.length > 1 ? `, ${shared === 0 ? "none" : shared} of them in more than one stock` : ""
  return `${stocks} and ${count(holders, "named holder", "named holders")}${common}`
}

export function Ownership() {
  const [workspace, setWorkspace] = useWorkspace()
  const { resolvedTheme } = useTheme()
  const theme: ChartTheme = resolvedTheme === "dark" ? "dark" : "light"
  const router = useRouter()
  const [kinds, setKinds] = useState<HolderKind[]>([...HOLDER_KINDS])
  const [sharedOnly, setSharedOnly] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  const stocks = workspace.watchlist.flatMap((i) => (i.kind === "ticker" && isCompany(i.symbol) ? [i] : []))
  const listed = stocks.map((stock) => stock.symbol.toUpperCase())
  // The stock whose holders are listed lives in the URL so other pages can link to it.
  const requested = useSearchParams().get("symbol")?.toUpperCase() ?? ""
  const asked = SYMBOL_PATTERN.test(requested) && isCompany(requested) ? requested : null
  // A stock from outside the watchlist joins the diagram for as long as it is being looked at.
  const symbols = asked && !listed.includes(asked) ? [...listed, asked] : listed
  const { ownerships, errors, loading, register } = useOwnership(symbols)

  const network = useMemo(() => buildNetwork(ownerships, { kinds, sharedOnly }), [ownerships, kinds, sharedOnly])
  // Hold the last settled network while stocks load, so the diagram is laid out once and not once per answer.
  const [settled, setSettled] = useState(network)
  if (!loading && settled !== network) setSettled(network)
  const shown = loading ? settled : network

  const selected = asked ?? shown.stocks[0]?.symbol ?? null
  const stock = shown.stocks.find((s) => s.symbol === selected) ?? null
  const ownership = ownerships.find((o) => o.symbol === selected) ?? null
  const rows = selected ? holdersOf(shown, selected) : []
  const split = stock && ownershipSplit(stock)
  const select = (symbol: string) => router.replace(ownershipHref(symbol), { scroll: false })

  // "/" or Ctrl/Cmd+K opens stock search, unless focus is in a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return
      if (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const message =
    symbols.length === 0
      ? "Find a stock, or add some to your watchlist, to see who owns them."
      : !loading && shown.stocks.length === 0
        ? "The source has no shareholders for these stocks."
        : null
  const waiting = loading && shown.stocks.length === 0
  const insidersNamed = ownership?.holders.some((holder) => holder.kind === "company" || holder.kind === "person")

  return (
    <AppShell workspace={workspace} onWorkspaceChange={setWorkspace}>
      <main className="mx-auto grid w-full max-w-[1440px] flex-1 items-start gap-6 px-4 pt-2 pb-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-6">
        <h1 className="sr-only">Shareholder network</h1>
        <section className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <ToggleGroup
                type="multiple"
                variant="outline"
                size="sm"
                spacing={0}
                value={kinds}
                // Something has to stay on, and the kinds keep one order whatever was clicked last.
                onValueChange={(value) => value.length > 0 && setKinds(HOLDER_KINDS.filter((k) => value.includes(k)))}
                aria-label="Kinds of holder"
              >
                {HOLDER_KINDS.map((kind) => (
                  <ToggleGroupItem key={kind} value={kind} className="px-2.5 text-xs" title={KIND_LABELS[kind].hint}>
                    {KIND_LABELS[kind].many}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                spacing={0}
                value={sharedOnly ? "shared" : "all"}
                onValueChange={(value) => value && setSharedOnly(value === "shared")}
                aria-label="Holders to show"
              >
                <ToggleGroupItem value="all" className="px-2.5 text-xs" title="Every named holder of each stock">
                  All holders
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="shared"
                  className="px-2.5 text-xs"
                  title="Only holders that own two or more of the stocks"
                >
                  Shared
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <Button variant="outline" size="sm" onClick={() => setSearchOpen(true)} title="Find a stock (/)">
              <SearchIcon data-icon="inline-start" /> Find a stock <Kbd>/</Kbd>
            </Button>
          </div>

          <Card className="gap-4 rounded-2xl">
            <CardHeader>
              <CardTitle>Shareholder network</CardTitle>
              <CardDescription className="text-xs">{summary(shown, sharedOnly)}</CardDescription>
            </CardHeader>
            <CardContent className="relative">
              <OwnershipNetwork
                network={shown}
                kinds={kinds}
                theme={theme}
                selected={selected}
                onSelect={select}
                stale={loading && shown.stocks.length > 0}
              />
              {(waiting || message) && (
                <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
                  {waiting ? (
                    <span className="flex items-center gap-2">
                      <Loader2Icon className="size-4 animate-spin" /> Loading shareholders
                    </span>
                  ) : (
                    message
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {selected && (
            <>
              <Card className="gap-0 rounded-2xl py-0">
                <CardHeader className="border-b px-4 py-3">
                  <CardTitle>
                    {ownership?.name ?? selected}{" "}
                    {ownership && <span className="font-normal text-muted-foreground">{selected}</span>}
                  </CardTitle>
                  <CardDescription className={cn(split && "text-foreground")}>
                    {split ? (
                      <>
                        Insiders hold {formatShare(split.insiders)}, institutions {formatShare(split.institutions)} and
                        everyone else {formatShare(split.others)}.
                        {split.insiders >= 0.05 &&
                          !insidersNamed &&
                          " The source does not say who the insiders are, so the largest owners are missing from the names below."}
                      </>
                    ) : (
                      (errors[selected] ?? (loading ? "Loading shareholders" : "The source has no totals for this stock."))
                    )}
                  </CardDescription>
                </CardHeader>
                {stock && (
                  <CardContent className="px-0">
                    {split && <SplitBar split={split} theme={theme} />}
                    {rows.length > 0 ? (
                      <HoldersTable rows={rows} currency={ownership?.currency ?? ""} theme={theme} />
                    ) : (
                      <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                        {ownership?.holders.some((holder) => holder.percent >= MIN_STAKE)
                          ? `None of ${stockCode(selected)}'s named holders match the filters above.`
                          : `The source names no holders of ${stockCode(selected)}; only the totals are known.`}
                      </p>
                    )}
                  </CardContent>
                )}
              </Card>

              {ownership?.register && <Activity ownership={ownership} status={register} theme={theme} />}

              <p className="px-1 text-xs leading-relaxed text-muted-foreground">
                {ownership?.register ? (
                  <>
                    Holders of {plain(ownership.register.threshold)} and more are from KSEI&apos;s list of{" "}
                    <span className="text-foreground">{formatDate(ownership.register.date)}</span>, which counts each
                    investor&apos;s whole stake and says what sort of investor it is. Smaller holders are from Yahoo
                    Finance: funds that publish their portfolios, most of them in the US. The totals at the top are
                    Yahoo&apos;s too and count every insider and institution, named or not, so they can sit a little off
                    what the names add up to.{" "}
                  </>
                ) : (
                  <>
                    Names come from Yahoo Finance: up to ten institutions and ten funds that publish their portfolios,
                    most of them in the US, and directors and officers where they report their shares. An
                    institution&apos;s stake includes the funds it runs, so stakes overlap and don&apos;t add up to
                    the totals. Insiders here means anyone tied to the company: founders, a parent company, the
                    state. They are counted in the total but mostly not named, and for most IDX stocks they are the
                    largest owners.{" "}
                  </>
                )}
                Stakes under {formatShare(MIN_STAKE)} are left out.
              </p>
            </>
          )}
        </section>

        <aside className="flex min-w-0 flex-col gap-4">
          <Card className="gap-0 rounded-2xl py-0">
            <CardHeader className="border-b px-4 py-3">
              <CardTitle>Watchlist</CardTitle>
              <CardDescription className="text-xs">{count(stocks.length, "stock", "stocks")}</CardDescription>
            </CardHeader>
            <CardContent className="p-2">
              {stocks.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                  No stocks in your watchlist. Find one above, or add some from the screener.
                </p>
              ) : (
                <ul className="flex flex-col">
                  {stocks.map((item) => {
                    const symbol = item.symbol.toUpperCase()
                    const active = symbol === selected
                    return (
                      <li key={item.symbol}>
                        <Link
                          href={ownershipHref(item.symbol)}
                          replace
                          scroll={false}
                          aria-current={active ? "page" : undefined}
                          className={cn("block rounded-lg px-2 py-1.5 hover:bg-muted/60", active && "bg-muted")}
                        >
                          <span className="block truncate text-sm font-medium">{item.symbol}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {errors[symbol] ? "No shareholders reported" : (item.name ?? " ")}
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
          <p className="px-1 text-xs leading-relaxed text-muted-foreground">
            A line joins a holder to each stock it owns, so a holder with several lines is one your stocks have in
            common. Click a stock to list its holders, or a holder to keep its lines lit. Drag a node to move it and
            the background to move the view; pinch, or scroll with Ctrl held, to zoom in on more names.
          </p>
          {register && <Registers status={register} />}
        </aside>
      </main>

      <SymbolSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="Find a stock"
        stocksOnly
        onSelect={(instrument) => {
          if (instrument.kind === "ticker") router.push(ownershipHref(instrument.symbol))
        }}
      />
    </AppShell>
  )
}

/** Who holds the company, as one bar: the same three shares the ring around its node shows. */
function SplitBar({ split, theme }: { split: Split; theme: ChartTheme }) {
  const parts = [
    { label: "Insiders", share: split.insiders, color: totalColor("insiders", theme) },
    { label: "Institutions", share: split.institutions, color: totalColor("institutions", theme) },
    { label: "Everyone else", share: split.others, color: CHART_CHROME[theme].baseline },
  ]
  return (
    <div className="flex flex-col gap-2 border-b px-4 py-3">
      <div
        role="img"
        aria-label={parts.map((part) => `${part.label} ${formatShare(part.share)}`).join(", ")}
        className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full"
      >
        {parts.map(
          (part) =>
            part.share > 0 && (
              <span key={part.label} className="min-w-0.5 basis-0" style={{ flexGrow: part.share, background: part.color }} />
            ),
        )}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
        {parts.map((part) => (
          <li key={part.label} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: part.color }} aria-hidden />
            <span className="font-medium tabular-nums">{formatShare(part.share)}</span>
            <span className="text-muted-foreground">{part.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** What the stock's larger holders bought and sold, from one saved register to the next. */
function Activity({ ownership, status, theme }: { ownership: Owned; status: RegisterStatus | null; theme: ChartTheme }) {
  const { changes, threshold } = ownership.register!
  const dates = status?.registers.map((saved) => saved.date) ?? []
  const code = stockCode(ownership.symbol)
  return (
    <Card className="gap-0 rounded-2xl py-0">
      <CardHeader className="border-b px-4 py-3">
        <CardTitle>Insider activity</CardTitle>
        <CardDescription className="text-xs">
          What holders of {plain(threshold)} and more of {code} bought and sold between KSEI&apos;s monthly lists
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {changes.length > 0 ? (
          <ActivityTable changes={changes} threshold={threshold} theme={theme} />
        ) : (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            {dates.length < 2
              ? "One list is saved. Save another month's to see what holders bought and sold in between."
              : `No holder of ${plain(threshold)} or more of ${code} changed its stake between ${formatDate(dates[0])} and ${formatDate(dates.at(-1)!)}.`}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/** Which of KSEI's lists are saved, and how to add one. */
function Registers({ status }: { status: RegisterStatus }) {
  const latest = status.registers.at(-1)
  const earlier = status.registers.slice(0, -1)
  return (
    <Card className="gap-0 rounded-2xl py-0">
      <CardHeader className="border-b px-4 py-3">
        <CardTitle>IDX shareholder lists</CardTitle>
        <CardDescription className="text-xs">
          {latest ? `${count(status.registers.length, "month", "months")} saved` : "None saved yet"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        {latest && (
          <p>
            <span className="font-medium text-foreground">{formatDate(latest.date)}</span> is the latest:{" "}
            {latest.holders.toLocaleString("en-US")} holders in {latest.companies.toLocaleString("en-US")} companies.
            {earlier.length > 0 && <> Before it: {earlier.map((saved) => formatDate(saved.date)).join(", ")}.</>}
          </p>
        )}
        <p>
          Once a month KSEI lists every holder of more than 1% of each IDX company. To {latest ? "add a month" : "use it"},
          download <span className="text-foreground">{REGISTER_TITLE}</span> from the{" "}
          <a href={IDX_ANNOUNCEMENTS} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            IDX announcements
          </a>{" "}
          and save the PDF in this project&apos;s <span className="font-medium text-foreground">{status.folder}</span>{" "}
          folder. {latest ? "Each month saved shows" : "It names the owners of IDX stocks, and each further month shows"} what
          holders bought and sold since the one before.
        </p>
        {status.failed.map((file) => (
          <p key={file.file}>
            <span className="font-medium text-foreground">{file.file}</span> could not be read. {file.message}
          </p>
        ))}
      </CardContent>
    </Card>
  )
}
