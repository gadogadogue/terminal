"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { layoutNetwork, placeLabels, type Circle, type LabelRequest } from "@/lib/analytics/network-layout"
import { ownershipSplit, type HolderNode, type OwnershipNetwork, type StockNode } from "@/lib/analytics/ownership"
import { CHART_CHROME, type ChartTheme } from "@/lib/chart-palette"
import { formatShare } from "@/lib/format"
import type { HolderKind } from "@/lib/providers/types"
import { cn } from "@/lib/utils"
import { holderColor, KIND_LABELS, stockCode } from "./holder-kinds"

/** A stock is a disc with a ring around it that shows who holds it. */
const STOCK_RADIUS = 22
const RING_RADIUS = STOCK_RADIUS + 5
const RING_WIDTH = 4
/** The room a stock takes up, ring included. */
const STOCK_ROOM = RING_RADIUS + RING_WIDTH / 2 + 1
/** The surface-colored gap between two parts of a ring. */
const RING_GAP = 2

/**
 * A holder's radius and a link's width both grow with the stake, by its
 * square root so a circle's area follows it. Half a company is as large as
 * either gets.
 */
const scaled = (stake: number) => Math.sqrt(Math.min(stake, 0.5) / 0.5)
const holderRadius = (stake: number) => 5 + 13 * scaled(stake)
const linkWidth = (stake: number) => 1 + 4 * scaled(stake)

const LABEL_SIZE = 11
const MAX_LABEL = 30
const shortName = (name: string) => (name.length > MAX_LABEL ? `${name.slice(0, MAX_LABEL - 1).trimEnd()}…` : name)

/** Taller with more to draw, and taller still where a narrow screen leaves less width for it. */
function heightFor(width: number, nodes: number): number {
  const height = Math.min(Math.max(320 + nodes * 5, 380), 620)
  return width > 0 && width < 560 ? Math.max(height, Math.min(Math.round(width * 1.4), 560)) : height
}

/** An arc of a stock's ring between two fractions of a turn, clockwise from the top. */
function ringArc(from: number, to: number): string {
  const point = (turn: number) =>
    `${(RING_RADIUS * Math.sin(turn * 2 * Math.PI)).toFixed(2)},${(-RING_RADIUS * Math.cos(turn * 2 * Math.PI)).toFixed(2)}`
  return `M${point(from)}A${RING_RADIUS},${RING_RADIUS} 0 ${to - from > 0.5 ? 1 : 0} 1 ${point(to)}`
}

/** The parts of a stock's ring: insiders, then institutions, in the colors those holders are drawn in. */
function ringParts(stock: StockNode, theme: ChartTheme): { path: string; color: string }[] {
  const split = ownershipSplit(stock)
  if (!split) return []
  // Half the gap comes off each end of a part, as a fraction of the ring's length.
  const trim = RING_GAP / 2 / (2 * Math.PI * RING_RADIUS)
  const parts: [from: number, to: number, kind: HolderKind][] = [
    [0, split.insiders, "insider"],
    [split.insiders, split.insiders + split.institutions, "institution"],
  ]
  return parts.flatMap(([from, to, kind]) =>
    // A part too short to show between its gaps is left out.
    to - from > trim * 4 ? [{ path: ringArc(from + trim, to - trim), color: holderColor(kind, theme) }] : [],
  )
}

export function OwnershipNetwork({
  network,
  kinds,
  theme,
  selected,
  onSelect,
  stale,
  className,
}: {
  network: OwnershipNetwork
  /** The kinds of holder in the network, for the key under it. */
  kinds: readonly HolderKind[]
  theme: ChartTheme
  /** The stock whose holders are listed under the diagram. */
  selected: string | null
  onSelect: (symbol: string) => void
  /** Data is reloading: keep the current picture and dim it. */
  stale: boolean
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [frame, setFrame] = useState<{ width: number; font: string } | null>(null)
  /** The node under the pointer or holding focus, and the holder clicked to keep its links lit. */
  const [hovered, setHovered] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)

  useEffect(() => {
    const container = containerRef.current!
    const font = getComputedStyle(container).fontFamily
    const observer = new ResizeObserver(([entry]) => setFrame({ width: Math.round(entry.contentRect.width), font }))
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const width = frame?.width ?? 0
  const height = heightFor(width, network.stocks.length + network.holders.length)
  const chrome = CHART_CHROME[theme]

  const layout = useMemo(() => {
    if (width === 0) return null
    const nodes = [
      ...network.stocks.map((stock) => ({ id: stock.symbol, radius: STOCK_ROOM, hub: true })),
      // One pixel more than drawn, for the ring in the surface color around each holder.
      ...network.holders.map((holder) => ({ id: holder.id, radius: holderRadius(holder.stake) + 1 })),
    ]
    const links = network.stakes.map((stake) => ({ source: stake.holder, target: stake.symbol }))
    const at = layoutNetwork(nodes, links, { width, height })
    const circles: Circle[] = nodes.map((node) => ({ id: node.id, radius: node.radius, ...at.get(node.id)! }))
    return { at, circles }
  }, [network, width, height])

  /** What each node is linked to, both ways. */
  const linked = useMemo(() => {
    const map = new Map<string, Set<string>>()
    const join = (a: string, b: string) => map.set(a, (map.get(a) ?? new Set()).add(b))
    for (const { holder, symbol } of network.stakes) {
      join(holder, symbol)
      join(symbol, holder)
    }
    return map
  }, [network])

  const known = (id: string | null) =>
    id != null && (network.stocks.some((s) => s.symbol === id) || network.holders.some((h) => h.id === id)) ? id : null
  const active = known(hovered) ?? known(pinned)
  const lit = active ? new Set([active, ...(linked.get(active) ?? [])]) : null

  const font = frame?.font
  const labels = useMemo(() => {
    if (!layout || !font) return new Map()
    const context = document.createElement("canvas").getContext("2d")
    if (context) context.font = `${LABEL_SIZE}px ${font}`
    const widthOf = (text: string) => (context ? context.measureText(text).width : text.length * 6) + 2
    // Labels go first to what is being looked at, then to what ties stocks together, then to the selected stock's holders.
    const rank = (holder: HolderNode) =>
      lit?.has(holder.id) ? 0 : holder.stocks > 1 ? 1 : selected && linked.get(holder.id)?.has(selected) ? 2 : 3
    const requests: LabelRequest[] = [...network.holders]
      .sort((a, b) => rank(a) - rank(b))
      .map((holder) => {
        const stocks = [...(linked.get(holder.id) ?? [])].map((symbol) => layout.at.get(symbol)!)
        const away = {
          x: stocks.reduce((sum, p) => sum + p.x, 0) / stocks.length,
          y: stocks.reduce((sum, p) => sum + p.y, 0) / stocks.length,
        }
        return { id: holder.id, width: widthOf(shortName(holder.name)), away }
      })
    return placeLabels(requests, layout.circles, { width, height })
    // `lit` is derived from `active`, and `linked` from `network`, which `layout` follows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, font, active, selected])

  const stakesOf = (id: string) => network.stakes.filter((stake) => stake.holder === id || stake.symbol === id)
  const describeHolder = (holder: HolderNode) =>
    `${holder.name}, ${KIND_LABELS[holder.kind].one.toLowerCase()}. Holds ${stakesOf(holder.id)
      .map((stake) => `${formatShare(stake.holding.percent)} of ${stockCode(stake.symbol)}`)
      .join(", ")}.`
  const describeStock = (stock: StockNode) => {
    const split = ownershipSplit(stock)
    const held = split
      ? ` Insiders hold ${formatShare(split.insiders)}, institutions ${formatShare(split.institutions)}.`
      : ""
    return `${stockCode(stock.symbol)}, ${stock.name}.${held} Show its holders.`
  }

  /** Hovering and keyboard focus light a node up the same way. */
  const lights = (id: string) => ({
    onPointerEnter: () => setHovered(id),
    onPointerLeave: () => setHovered((current) => (current === id ? null : current)),
    onFocus: () => setHovered(id),
    onBlur: () => setHovered((current) => (current === id ? null : current)),
  })
  const onKey = (act: () => void) => (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return
    e.preventDefault()
    act()
  }
  const dimmed = (id: string) => (lit && !lit.has(id) ? 0.25 : 1)

  const activeStock = network.stocks.find((stock) => stock.symbol === active)
  const activeHolder = network.holders.find((holder) => holder.id === active)
  const activeCircle = layout?.circles.find((circle) => circle.id === active)

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div
        ref={containerRef}
        className={cn("relative w-full transition-opacity", stale && "opacity-50")}
        style={{ height }}
      >
        {layout && (
          <svg
            width={width}
            height={height}
            role="group"
            aria-label={`Network of ${network.stocks.length} stocks and ${network.holders.length} holders. Each stock's holders are listed in the table below.`}
            className="block select-none"
            onClick={() => setPinned(null)}
          >
            <g strokeLinecap="round">
              {network.stakes.map((stake) => {
                const from = layout.at.get(stake.holder)!
                const to = layout.at.get(stake.symbol)!
                const touched = stake.holder === active || stake.symbol === active
                return (
                  <line
                    key={`${stake.holder} ${stake.symbol}`}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    strokeWidth={linkWidth(stake.holding.percent)}
                    stroke={touched ? "currentColor" : !active && stake.symbol === selected ? chrome.crosshair : chrome.baseline}
                    opacity={active ? (touched ? 0.8 : 0.2) : 0.7}
                    className="transition-opacity"
                  />
                )
              })}
            </g>

            {network.holders.map((holder) => {
              const { x, y } = layout.at.get(holder.id)!
              const radius = holderRadius(holder.stake)
              const toggle = () => setPinned((current) => (current === holder.id ? null : holder.id))
              return (
                <g
                  key={holder.id}
                  transform={`translate(${x} ${y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={describeHolder(holder)}
                  aria-pressed={pinned === holder.id}
                  opacity={dimmed(holder.id)}
                  className="group cursor-pointer outline-none transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggle()
                  }}
                  onKeyDown={onKey(toggle)}
                  {...lights(holder.id)}
                >
                  {/* Small circles are hard to hit, so the target is wider than the mark. */}
                  <circle r={Math.max(radius + 4, 12)} fill="transparent" />
                  <circle r={radius} fill={holderColor(holder.kind, theme)} className="stroke-card" strokeWidth={2} />
                  <circle
                    r={radius + 3}
                    fill="none"
                    strokeWidth={1.5}
                    className={cn(
                      "stroke-transparent group-focus-visible:stroke-ring",
                      (active === holder.id || pinned === holder.id) && "stroke-foreground",
                    )}
                  />
                </g>
              )
            })}

            {network.stocks.map((stock) => {
              const { x, y } = layout.at.get(stock.symbol)!
              const code = stockCode(stock.symbol)
              const isSelected = stock.symbol === selected
              return (
                <g
                  key={stock.symbol}
                  transform={`translate(${x} ${y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={describeStock(stock)}
                  aria-current={isSelected ? "true" : undefined}
                  opacity={dimmed(stock.symbol)}
                  className="group cursor-pointer outline-none transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelect(stock.symbol)
                  }}
                  onKeyDown={onKey(() => onSelect(stock.symbol))}
                  {...lights(stock.symbol)}
                >
                  {/* Keeps links from running under the ring. */}
                  <circle r={STOCK_ROOM} className="fill-card" />
                  <circle r={RING_RADIUS} fill="none" stroke={chrome.grid} strokeWidth={RING_WIDTH} />
                  {ringParts(stock, theme).map((part) => (
                    <path key={part.path} d={part.path} fill="none" stroke={part.color} strokeWidth={RING_WIDTH} />
                  ))}
                  <circle r={STOCK_RADIUS} className="fill-foreground" />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={code.length > 5 ? 9 : LABEL_SIZE}
                    fontWeight={600}
                    className="fill-background"
                  >
                    {code.slice(0, 7)}
                  </text>
                  <circle
                    r={STOCK_ROOM + 3}
                    fill="none"
                    strokeWidth={1.5}
                    className={cn(
                      "stroke-transparent group-focus-visible:stroke-ring",
                      active === stock.symbol && "stroke-muted-foreground",
                      isSelected && "stroke-foreground",
                    )}
                  />
                </g>
              )
            })}

            <g pointerEvents="none" fontSize={LABEL_SIZE} strokeWidth={3} paintOrder="stroke" strokeLinejoin="round">
              {network.holders.map((holder) => {
                const place = labels.get(holder.id)
                if (!place) return null
                return (
                  <text
                    key={holder.id}
                    x={place.x}
                    y={place.y}
                    textAnchor={place.anchor}
                    dominantBaseline="central"
                    opacity={dimmed(holder.id)}
                    // The outline in the surface color keeps a label readable where a link runs behind it.
                    className={cn("stroke-card transition-opacity", lit?.has(holder.id) ? "fill-foreground" : "fill-muted-foreground")}
                  >
                    {shortName(holder.name)}
                  </text>
                )
              })}
            </g>
          </svg>
        )}

        {activeCircle && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-10 w-max max-w-64 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
            style={{
              // Centered on the node, but never past the frame's edges.
              left: Math.min(Math.max(activeCircle.x, Math.min(128, width / 2)), width - Math.min(128, width / 2)),
              // Above the node unless that would leave the frame.
              ...(activeCircle.y - activeCircle.radius > 132
                ? { top: activeCircle.y - activeCircle.radius - 10, transform: "translate(-50%, -100%)" }
                : { top: activeCircle.y + activeCircle.radius + 10, transform: "translate(-50%, 0)" }),
            }}
          >
            {activeHolder && (
              <>
                <div className="font-medium">{activeHolder.name}</div>
                <div className="text-muted-foreground">
                  {[KIND_LABELS[activeHolder.kind].one, activeHolder.family ?? stakesOf(activeHolder.id)[0]?.holding.role]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                <ul className="mt-1.5 flex flex-col gap-0.5">
                  {stakesOf(activeHolder.id).map((stake) => (
                    <li key={stake.symbol} className="flex items-baseline gap-2">
                      <span className="font-medium tabular-nums">{formatShare(stake.holding.percent)}</span>
                      <span className="text-muted-foreground">of {stockCode(stake.symbol)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {activeStock && <StockTip stock={activeStock} holders={stakesOf(activeStock.symbol).length} theme={theme} />}
          </div>
        )}
      </div>

      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-foreground" aria-hidden /> Stock
        </li>
        {kinds.map((kind) => (
          <li key={kind} className="flex items-center gap-1.5" title={KIND_LABELS[kind].hint}>
            <span className="size-2.5 rounded-full" style={{ background: holderColor(kind, theme) }} aria-hidden />
            {KIND_LABELS[kind].one}
          </li>
        ))}
        <li>
          Ring around a stock: held by <Swatch color={holderColor("insider", theme)} /> insiders and{" "}
          <Swatch color={holderColor("institution", theme)} /> institutions
        </li>
        <li>Larger circles and thicker lines are larger stakes</li>
      </ul>
    </div>
  )
}

/** A short stroke in a ring part's color, set in a line of text. */
function Swatch({ color }: { color: string }) {
  return <span className="inline-block h-1 w-3 rounded-full align-middle" style={{ background: color }} aria-hidden />
}

function StockTip({ stock, holders, theme }: { stock: StockNode; holders: number; theme: ChartTheme }) {
  const split = ownershipSplit(stock)
  const rows = split && [
    { label: "Insiders", share: split.insiders, color: holderColor("insider", theme) },
    { label: "Institutions", share: split.institutions, color: holderColor("institution", theme) },
    { label: "Everyone else", share: split.others, color: CHART_CHROME[theme].baseline },
  ]
  return (
    <>
      <div className="font-medium">{stock.name}</div>
      <div className="text-muted-foreground">{stock.symbol}</div>
      {rows && (
        <ul className="mt-1.5 flex flex-col gap-0.5">
          {rows.map((row) => (
            <li key={row.label} className="flex items-center gap-2">
              <Swatch color={row.color} />
              <span className="font-medium tabular-nums">{formatShare(row.share)}</span>
              <span className="text-muted-foreground">{row.label}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1.5 text-muted-foreground">
        {holders === 0 ? "No named holders shown" : `${holders} named ${holders === 1 ? "holder" : "holders"} shown`}
      </div>
    </>
  )
}
