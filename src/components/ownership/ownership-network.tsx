"use client"

import { MaximizeIcon, MinusIcon, PlusIcon } from "lucide-react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  fitView,
  labelPoint,
  layoutNetwork,
  placeLabels,
  type Circle,
  type LabelRequest,
  type LabelSide,
  type NetworkLayout,
  type Point,
  type Size,
  type View,
} from "@/lib/analytics/network-layout"
import { ownershipSplit, type HolderNode, type OwnershipNetwork, type StockNode } from "@/lib/analytics/ownership"
import { CHART_CHROME, type ChartTheme } from "@/lib/chart-palette"
import { formatShare } from "@/lib/format"
import type { HolderKind } from "@/lib/providers/types"
import { cn } from "@/lib/utils"
import { holderColor, holderDetail, KIND_LABELS, stockCode, totalColor } from "./holder-kinds"
import { HolderMark } from "./holder-mark"

/** A stock is the largest dot in the picture, with a ring around it that shows who holds it. */
const STOCK_RADIUS = 18
const RING_RADIUS = STOCK_RADIUS + 4
const RING_WIDTH = 3
/** The room a stock takes up, ring included. */
const STOCK_ROOM = RING_RADIUS + RING_WIDTH / 2 + 1
/** The surface-colored gap between two parts of a ring. */
const RING_GAP = 2

/**
 * A holder's radius and a link's width both grow with the stake, by its
 * square root so a dot's area follows it. A holder is a part of its stock
 * and is drawn as one: the owner of all of a company would be a dot the
 * size of the stock's, and no holder is larger.
 */
const scaled = (stake: number) => Math.sqrt(Math.min(Math.max(stake, 0), 1))
const MIN_HOLDER_RADIUS = 3
const holderRadius = (stake: number) => MIN_HOLDER_RADIUS + (STOCK_RADIUS - MIN_HOLDER_RADIUS) * scaled(stake)
const linkWidth = (stake: number) => 0.75 + 2.25 * scaled(stake)

const LABEL_SIZE = 11
const MAX_LABEL = 30
const shortName = (name: string) => (name.length > MAX_LABEL ? `${name.slice(0, MAX_LABEL - 1).trimEnd()}…` : name)

/** How far the picture zooms out and in, and how far one press of a zoom button takes it. */
const MIN_ZOOM = 0.25
const MAX_ZOOM = 4
const ZOOM_STEP = 1.4
/** How long the view takes to get where a button sends it. */
const GLIDE_MS = 180
/** The forces take sixty steps a second, whatever the screen's refresh rate. */
const STEP_MS = 1000 / 60
/** While nodes move, the labels that fit are picked again only this often, or they would flicker. */
const LABEL_PAUSE_MS = 150
/** A press that moves less than this many pixels is a click, not a drag. */
const DRAG_START = 4

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high)

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

/** The parts of a stock's ring: insiders, then institutions, in the hues those holders are drawn in. */
function ringParts(stock: StockNode, theme: ChartTheme): { path: string; color: string }[] {
  const split = ownershipSplit(stock)
  if (!split) return []
  // Half the gap comes off each end of a part, as a fraction of the ring's length.
  const trim = RING_GAP / 2 / (2 * Math.PI * RING_RADIUS)
  const parts: [from: number, to: number, total: "insiders" | "institutions"][] = [
    [0, split.insiders, "insiders"],
    [split.insiders, split.insiders + split.institutions, "institutions"],
  ]
  return parts.flatMap(([from, to, total]) =>
    // A part too short to show between its gaps is left out.
    to - from > trim * 4 ? [{ path: ringArc(from + trim, to - trim), color: totalColor(total, theme) }] : [],
  )
}

/**
 * The picture as it stands, kept outside React: forces move it many times a
 * second, so nodes are set in place straight on the page and React only
 * draws what they look like.
 */
interface Scene {
  size: Size
  forces: NetworkLayout
  /** Every node, stocks first and then holders, as the forces number them. */
  ids: string[]
  index: Map<string, number>
  /** The room each node takes, and how wide its label is. */
  radius: number[]
  labelWidth: number[]
  view: View
  /** Holds everything the view zooms and moves. */
  camera: SVGGElement
  nodes: SVGGElement[]
  links: { line: SVGLineElement; from: number; to: number }[]
  labels: SVGGElement[]
  /** The labels to show if they fit, the ones to fit first at the front, and the side of its node each is on. */
  wanted: LabelRequest[]
  sides: LabelSide[]
  /** When the labels that fit were last picked. */
  labelled: number
  /** The tooltip and the node it belongs to. */
  tip: { box: HTMLElement; node: number } | null
  /** Forces are still moving nodes. */
  stirred: boolean
  /** The view is on its way somewhere. */
  glide: { from: View; to: View; since: number } | null
  /** The animation frame asked for, when it was asked, and the time the forces have yet to step through. */
  frame: number
  clock: number
  owed: number
}

/** Where every node is drawn in the frame, through the view. */
function drawn({ ids, forces, radius, view }: Scene): Circle[] {
  return ids.map((id, i) => ({
    id,
    x: forces.x[i] * view.zoom + view.x,
    y: forces.y[i] * view.zoom + view.y,
    radius: radius[i] * view.zoom,
  }))
}

/** Sets everything where it is now. Picking the labels that fit again is left out between two steps of a motion. */
function paint(scene: Scene, relabel = true) {
  const { forces, view, size } = scene
  scene.camera.setAttribute("transform", `translate(${view.x} ${view.y}) scale(${view.zoom})`)
  scene.nodes.forEach((node, i) => node.setAttribute("transform", `translate(${forces.x[i]} ${forces.y[i]})`))
  for (const { line, from, to } of scene.links) {
    line.setAttribute("x1", `${forces.x[from]}`)
    line.setAttribute("y1", `${forces.y[from]}`)
    line.setAttribute("x2", `${forces.x[to]}`)
    line.setAttribute("y2", `${forces.y[to]}`)
  }
  // Labels keep their size at any zoom, so zooming in makes room for more of them.
  const circles = drawn(scene)
  if (relabel) {
    const fit = placeLabels(scene.wanted, circles, size)
    scene.labels.forEach((label, i) => {
      const side = fit.get(scene.ids[i])
      label.style.opacity = side ? "" : "0"
      if (side) scene.sides[i] = side
    })
    scene.labelled = performance.now()
  }
  circles.forEach((circle, i) => {
    const { x, y } = labelPoint(circle, scene.sides[i])
    scene.labels[i].setAttribute("transform", `translate(${x} ${y})`)
  })
  if (scene.tip) {
    const { x, y, radius } = circles[scene.tip.node]
    const { style } = scene.tip.box
    // Centered on the node, but never past the frame's edges.
    const half = Math.min(128, size.width / 2)
    style.left = `${clamp(x, half, size.width - half)}px`
    // Above the node unless that would leave the frame.
    const above = y - radius > 132
    style.top = `${clamp(above ? y - radius - 10 : y + radius + 10, 0, size.height)}px`
    style.transform = `translate(-50%, ${above ? "-100%" : "0"})`
  }
}

/** Keeps the picture moving until its forces are at rest and its view has arrived. */
function animate(scene: Scene) {
  if (scene.frame) return
  scene.clock = performance.now()
  scene.owed = STEP_MS
  const frame = (now: number) => {
    scene.frame = 0
    if (scene.glide) {
      const { from, to, since } = scene.glide
      const done = clamp((now - since) / GLIDE_MS, 0, 1)
      const eased = 1 - (1 - done) ** 3
      scene.view = {
        x: from.x + (to.x - from.x) * eased,
        y: from.y + (to.y - from.y) * eased,
        zoom: from.zoom + (to.zoom - from.zoom) * eased,
      }
      if (done === 1) scene.glide = null
    }
    scene.owed = Math.min(scene.owed + now - scene.clock, 3 * STEP_MS)
    scene.clock = now
    for (; scene.stirred && scene.owed >= STEP_MS; scene.owed -= STEP_MS) scene.stirred = scene.forces.step()
    const moving = scene.stirred || scene.glide != null
    paint(scene, !moving || now - scene.labelled >= LABEL_PAUSE_MS)
    if (moving) scene.frame = requestAnimationFrame(frame)
  }
  scene.frame = requestAnimationFrame(frame)
}

/** The view that shows the whole network as it is arranged now. */
function wholeView({ ids, forces, radius, size }: Scene): View {
  return fitView(
    ids.map((id, i) => ({ id, x: forces.x[i], y: forces.y[i], radius: radius[i] })),
    size,
  )
}

/** The view zoomed by a factor, with the point of the frame at `about` staying where it is. */
function zoomedView(scene: Scene, factor: number, about: Point): View {
  // From where the view is headed, so presses of a button add up.
  const from = scene.glide?.to ?? scene.view
  const zoom = clamp(from.zoom * factor, Math.min(MIN_ZOOM, wholeView(scene).zoom), MAX_ZOOM)
  const by = zoom / from.zoom
  return { zoom, x: about.x - (about.x - from.x) * by, y: about.y - (about.y - from.y) * by }
}

/** Sends the view somewhere: in a glide, or at once for a reader who has asked for less motion. */
function look(scene: Scene, to: View) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    scene.glide = null
    scene.view = to
    paint(scene)
  } else {
    scene.glide = { from: scene.view, to, since: performance.now() }
    animate(scene)
  }
}

/** A press of the pointer on the picture: on a node to drag it, anywhere else to move the view. */
interface Press {
  scene: Scene
  pointer: number
  /** The node pressed, or -1 for the background. */
  node: number
  /** Where the pointer last was, and where that has taken the node. */
  x: number
  y: number
  held: Point | null
  /** It has moved far enough to be a drag. */
  moved: boolean
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
  const svgRef = useRef<SVGSVGElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<Scene | null>(null)
  const pressRef = useRef<Press | null>(null)
  /** A drag has just ended: the click that follows it is not one. */
  const draggedRef = useRef(false)
  const [frame, setFrame] = useState<{ width: number; font: string } | null>(null)
  /** The node under the pointer or holding focus, and the holder clicked to keep its links lit. */
  const [hovered, setHovered] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  /** A node or the view is being dragged: the tooltip stays out of the way. */
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const container = containerRef.current!
    const font = getComputedStyle(container).fontFamily
    const observer = new ResizeObserver(([entry]) => setFrame({ width: Math.round(entry.contentRect.width), font }))
    observer.observe(container)
    // The wheel scrolls the page as anywhere else. A pinch, or the wheel with Ctrl or ⌘ held, zooms the picture
    // and not the page, which only a listener that isn't passive can ask for.
    const onWheel = (e: WheelEvent) => {
      const scene = sceneRef.current
      if (!scene || !(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const box = container.getBoundingClientRect()
      // A notch of a wheel is some hundred pixels or three lines, a pinch a few pixels at a time.
      const turns = clamp(-e.deltaY * (e.deltaMode === 1 ? 0.33 : 0.01), -0.25, 0.25)
      scene.view = zoomedView(scene, 2 ** turns, { x: e.clientX - box.left, y: e.clientY - box.top })
      scene.glide = null
      paint(scene)
    }
    container.addEventListener("wheel", onWheel, { passive: false })
    return () => {
      observer.disconnect()
      container.removeEventListener("wheel", onWheel)
    }
  }, [])

  const width = frame?.width ?? 0
  const font = frame?.font
  const height = heightFor(width, network.stocks.length + network.holders.length)
  const chrome = CHART_CHROME[theme]

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

  // Lays the network out and takes hold of what React drew of it.
  useLayoutEffect(() => {
    const svg = svgRef.current!
    if (width === 0 || !font) return
    const size = { width, height }
    const ids = [...network.stocks.map((stock) => stock.symbol), ...network.holders.map((holder) => holder.id)]
    const index = new Map(ids.map((id, i) => [id, i]))
    // One pixel more than drawn, for the ring in the surface color around each holder.
    const radius = [...network.stocks.map(() => STOCK_ROOM), ...network.holders.map((holder) => holderRadius(holder.stake) + 1)]
    const forces = layoutNetwork(
      ids.map((id, i) => ({ id, radius: radius[i], hub: i < network.stocks.length })),
      network.stakes.map((stake) => ({ source: stake.holder, target: stake.symbol })),
      size,
    )

    const context = document.createElement("canvas").getContext("2d")
    const widthOf = (text: string, weight: number) => {
      if (!context) return text.length * 6 + 2
      context.font = `${weight} ${LABEL_SIZE}px ${font}`
      return context.measureText(text).width + 2
    }
    const drawnAs = <E extends SVGElement>(mark: string) => {
      const elements = new Array<E>(ids.length)
      for (const element of svg.querySelectorAll<E>(`[${mark}]`)) elements[index.get(element.getAttribute(mark)!)!] = element
      return elements
    }
    const lines = svg.querySelectorAll<SVGLineElement>("[data-link]")

    const scene: Scene = {
      size,
      forces,
      ids,
      index,
      radius,
      labelWidth: [
        ...network.stocks.map((stock) => widthOf(stockCode(stock.symbol), 600)),
        ...network.holders.map((holder) => widthOf(shortName(holder.name), 400)),
      ],
      view: { x: 0, y: 0, zoom: 1 },
      camera: svg.querySelector<SVGGElement>("[data-camera]")!,
      nodes: drawnAs<SVGGElement>("data-node"),
      links: network.stakes.map((stake, i) => ({
        line: lines[i],
        from: index.get(stake.holder)!,
        to: index.get(stake.symbol)!,
      })),
      labels: drawnAs<SVGGElement>("data-label"),
      wanted: [],
      sides: ids.map(() => "under"),
      labelled: 0,
      tip: null,
      stirred: false,
      glide: null,
      frame: 0,
      clock: 0,
      owed: 0,
    }
    scene.view = wholeView(scene)
    sceneRef.current = scene
    return () => {
      cancelAnimationFrame(scene.frame)
      sceneRef.current = null
    }
  }, [network, width, height, font])

  // After every render: which labels come first and where the tooltip belongs follow what is lit and selected.
  useLayoutEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    // Stocks are always named. Then labels go to what is being looked at, to what ties stocks together, and to
    // the selected stock's holders.
    const rank = (holder: HolderNode) =>
      lit?.has(holder.id) ? 0 : holder.stocks > 1 ? 1 : selected && linked.get(holder.id)?.has(selected) ? 2 : 3
    const request = (id: string) => ({ id, width: scene.labelWidth[scene.index.get(id)!] })
    scene.wanted = [
      ...network.stocks.map((stock) => ({ ...request(stock.symbol), keep: true })),
      ...[...network.holders].sort((a, b) => rank(a) - rank(b)).map((holder) => request(holder.id)),
    ]
    scene.tip = tipRef.current && active ? { box: tipRef.current, node: scene.index.get(active)! } : null
    paint(scene)
  })

  /** Ends the press under way and lets go of the node it held. */
  const release = () => {
    const press = pressRef.current
    if (!press) return
    pressRef.current = null
    if (press.held) press.scene.forces.hold(press.node, null)
    if (press.moved) setDragging(false)
  }

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const scene = sceneRef.current
    if (!scene || e.button !== 0) return
    release()
    draggedRef.current = false
    const target = (e.target as Element).closest<SVGGElement>("[data-node]")
    // The pointer stays with what was pressed, so a drag goes on when it leaves the picture.
    ;(target ?? e.currentTarget).setPointerCapture(e.pointerId)
    pressRef.current = {
      scene,
      pointer: e.pointerId,
      node: target ? scene.nodes.indexOf(target) : -1,
      x: e.clientX,
      y: e.clientY,
      held: null,
      moved: false,
    }
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const press = pressRef.current
    const scene = sceneRef.current
    if (!press || press.scene !== scene || press.pointer !== e.pointerId) return
    const dx = e.clientX - press.x
    const dy = e.clientY - press.y
    if (!press.moved) {
      if (Math.hypot(dx, dy) < DRAG_START) return
      press.moved = true
      setDragging(true)
    }
    press.x = e.clientX
    press.y = e.clientY
    if (press.node < 0) {
      scene.glide = null
      scene.view = { ...scene.view, x: scene.view.x + dx, y: scene.view.y + dy }
      paint(scene)
    } else {
      const from = press.held ?? { x: scene.forces.x[press.node], y: scene.forces.y[press.node] }
      press.held = { x: from.x + dx / scene.view.zoom, y: from.y + dy / scene.view.zoom }
      scene.forces.hold(press.node, press.held)
      scene.stirred = true
      animate(scene)
    }
  }

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const press = pressRef.current
    if (!press || press.pointer !== e.pointerId) return
    draggedRef.current = press.moved
    release()
  }

  const zoom = (factor: number) => {
    const scene = sceneRef.current
    if (scene) look(scene, zoomedView(scene, factor, { x: scene.size.width / 2, y: scene.size.height / 2 }))
  }
  const showAll = () => {
    const scene = sceneRef.current
    if (scene) look(scene, wholeView(scene))
  }

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
  const nodeClass = cn("group outline-none transition-opacity", dragging ? "cursor-grabbing" : "cursor-pointer")

  /** The key shows each color once: kinds that share one, as companies and individuals do, share its entry. */
  const keyed = kinds.reduce<HolderKind[][]>((entries, kind) => {
    const entry = entries.find(([first]) => holderColor(first, theme) === holderColor(kind, theme))
    if (entry) entry.push(kind)
    else entries.push([kind])
    return entries
  }, [])

  const activeStock = network.stocks.find((stock) => stock.symbol === active)
  const activeHolder = network.holders.find((holder) => holder.id === active)

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div
        ref={containerRef}
        className={cn("relative w-full transition-opacity", stale && "opacity-50")}
        style={{ height }}
      >
        {/* Nodes, links and labels carry no place of their own here: `paint` gives them one. */}
        <svg
          ref={svgRef}
          width={width}
          height={height}
          role="group"
          aria-label={`Network of ${network.stocks.length} stocks and ${network.holders.length} holders. Each stock's holders are listed in the table below.`}
          // A swipe up or down still scrolls the page on a touch screen.
          className={cn("block touch-pan-y select-none", dragging ? "cursor-grabbing" : "cursor-grab")}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={release}
          onLostPointerCapture={release}
          onClickCapture={(e) => {
            if (!draggedRef.current) return
            draggedRef.current = false
            e.stopPropagation()
          }}
          onClick={() => setPinned(null)}
        >
          <g data-camera>
            <g strokeLinecap="round">
              {network.stakes.map((stake) => {
                const touched = stake.holder === active || stake.symbol === active
                return (
                  <line
                    key={`${stake.holder} ${stake.symbol}`}
                    data-link
                    // Hairlines at any zoom.
                    vectorEffect="non-scaling-stroke"
                    strokeWidth={linkWidth(stake.holding.percent)}
                    stroke={touched ? "currentColor" : !active && stake.symbol === selected ? chrome.crosshair : chrome.baseline}
                    opacity={active ? (touched ? 0.8 : 0.2) : 0.7}
                    className="transition-opacity"
                  />
                )
              })}
            </g>

            {network.holders.map((holder) => {
              const radius = holderRadius(holder.stake)
              const toggle = () => setPinned((current) => (current === holder.id ? null : holder.id))
              return (
                <g
                  key={holder.id}
                  data-node={holder.id}
                  role="button"
                  tabIndex={0}
                  aria-label={describeHolder(holder)}
                  aria-pressed={pinned === holder.id}
                  opacity={dimmed(holder.id)}
                  className={nodeClass}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggle()
                  }}
                  onKeyDown={onKey(toggle)}
                  {...lights(holder.id)}
                >
                  {/* Small dots are hard to hit, so the target is wider than the mark. */}
                  <circle r={Math.max(radius + 4, 10)} fill="transparent" />
                  <circle r={radius} fill={holderColor(holder.kind, theme)} className="stroke-card" strokeWidth={1.5} />
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
              const isSelected = stock.symbol === selected
              return (
                <g
                  key={stock.symbol}
                  data-node={stock.symbol}
                  role="button"
                  tabIndex={0}
                  aria-label={describeStock(stock)}
                  aria-current={isSelected ? "true" : undefined}
                  opacity={dimmed(stock.symbol)}
                  className={nodeClass}
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
                  <circle
                    r={STOCK_ROOM + 2.5}
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
          </g>

          {/* The outline in the surface color keeps a label readable where a link runs behind it. */}
          <g pointerEvents="none" fontSize={LABEL_SIZE} strokeWidth={3} paintOrder="stroke" strokeLinejoin="round">
            {network.stocks.map((stock) => (
              <g key={stock.symbol} data-label={stock.symbol} className="transition-opacity">
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontWeight={600}
                  opacity={dimmed(stock.symbol)}
                  className="fill-foreground stroke-card transition-opacity"
                >
                  {stockCode(stock.symbol)}
                </text>
              </g>
            ))}
            {network.holders.map((holder) => (
              // The group fades a label in and out as it comes to fit; the text dims with its node.
              <g key={holder.id} data-label={holder.id} className="transition-opacity">
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  opacity={dimmed(holder.id)}
                  className={cn("stroke-card transition-opacity", lit?.has(holder.id) ? "fill-foreground" : "fill-muted-foreground")}
                >
                  {shortName(holder.name)}
                </text>
              </g>
            ))}
          </g>
        </svg>

        {/* Filled with the surface, so a node moved under a button doesn't show through it. */}
        <div className="absolute top-0 right-0 flex gap-1 *:bg-card dark:*:bg-card dark:*:hover:bg-muted">
          <Button variant="outline" size="icon-sm" aria-label="Zoom out" title="Zoom out" onClick={() => zoom(1 / ZOOM_STEP)}>
            <MinusIcon />
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Zoom in" title="Zoom in" onClick={() => zoom(ZOOM_STEP)}>
            <PlusIcon />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Show the whole network"
            title="Show the whole network"
            onClick={showAll}
          >
            <MaximizeIcon />
          </Button>
        </div>

        {(activeHolder || activeStock) && !dragging && (
          <div
            ref={tipRef}
            role="tooltip"
            className="pointer-events-none absolute z-10 w-max max-w-64 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
          >
            {activeHolder && (
              <>
                <div className="font-medium">{activeHolder.name}</div>
                <div className="text-muted-foreground">
                  {holderDetail(activeHolder.kind, stakesOf(activeHolder.id)[0].holding)}
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
        {keyed.map((entry) => (
          <li
            key={entry[0]}
            className="flex items-center gap-1.5"
            title={entry.map((kind) => KIND_LABELS[kind].hint).join("\n")}
          >
            <HolderMark kind={entry[0]} theme={theme} />
            {entry.map((kind, i) => (i === 0 ? KIND_LABELS[kind].one : KIND_LABELS[kind].one.toLowerCase())).join(" or ")}
          </li>
        ))}
        <li>
          Ring around a stock: held by <Swatch color={totalColor("insiders", theme)} /> insiders and{" "}
          <Swatch color={totalColor("institutions", theme)} /> institutions
        </li>
        <li>Larger dots and thicker lines are larger stakes</li>
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
    { label: "Insiders", share: split.insiders, color: totalColor("insiders", theme) },
    { label: "Institutions", share: split.institutions, color: totalColor("institutions", theme) },
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
