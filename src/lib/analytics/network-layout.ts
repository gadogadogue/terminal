/**
 * Where to draw a network's nodes and which of them to label. Plain
 * geometry: nothing here knows what the nodes stand for, and the same input
 * always gives the same picture.
 */

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface LayoutNode {
  id: string
  /** The room the node takes in pixels, with anything drawn around it. */
  radius: number
  /** Hubs are what the picture is arranged around: spread out first, the rest gathers by them. */
  hub?: boolean
}

export interface LayoutLink {
  source: string
  target: string
}

/** Empty space kept between two nodes, and between a node and the frame. */
const NODE_GAP = 8
const FRAME_MARGIN = 12

/** A tick moves nodes by their forces times `alpha`, which cools from 1 to nearly 0 so the picture settles. */
const TICKS = 300
const ALPHA_END = 0.001
/** The share of its speed a node keeps from one tick to the next. */
const VELOCITY_KEPT = 0.6
/** Successive turns by this angle never line up, so nodes that start together fan out evenly. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

/** How far a wide or tall frame may stretch the picture from the round shape forces settle into. */
const MAX_STRETCH = 1.5
/** A small network is enlarged to use the frame, but not so far that its links turn into spokes. */
const MAX_ZOOM = 1.25

/**
 * A force-directed layout: linked nodes pull together, all nodes push apart,
 * and none overlap. Hubs start on a ring and every other node next to the
 * hubs it is linked to, so the result is settled by the input alone.
 */
export function layoutNetwork(nodes: LayoutNode[], links: LayoutLink[], size: Size): Map<string, Point> {
  const count = nodes.length
  if (count === 0) return new Map()
  const index = new Map(nodes.map((node, i) => [node.id, i]))
  const pairs = links.flatMap(({ source, target }) => {
    const s = index.get(source)
    const t = index.get(target)
    return s == null || t == null || s === t ? [] : [[s, t] as const]
  })
  const degree = new Array<number>(count).fill(0)
  const neighbors = nodes.map(() => [] as number[])
  for (const [s, t] of pairs) {
    degree[s] += 1
    degree[t] += 1
    neighbors[s].push(t)
    neighbors[t].push(s)
  }

  const cx = size.width / 2
  const cy = size.height / 2
  const radius = nodes.map((node) => node.radius)
  // The usual yardstick for a force layout: the spacing that would spread the nodes evenly over the frame.
  const spacing = Math.sqrt((size.width * size.height) / count)
  const linkLength = Math.min(Math.max(spacing * 0.5, 24), 84)
  const charge = nodes.map((node) => linkLength * (node.hub ? 16 : 3))

  const x = new Array<number>(count).fill(cx)
  const y = new Array<number>(count).fill(cy)
  const hubs = nodes.flatMap((node, i) => (node.hub ? [i] : []))
  const ring = hubs.length > 1 ? Math.min(size.width, size.height) * 0.3 : 0
  hubs.forEach((i, n) => {
    // Two hubs start side by side, the way frames are usually wider than tall.
    const angle = Math.PI + (2 * Math.PI * n) / hubs.length
    x[i] = cx + ring * Math.cos(angle)
    y[i] = cy + ring * Math.sin(angle)
  })
  nodes.forEach((node, i) => {
    if (node.hub) return
    const anchors = neighbors[i].filter((j) => nodes[j].hub)
    const ax = anchors.length ? anchors.reduce((sum, j) => sum + x[j], 0) / anchors.length : cx
    const ay = anchors.length ? anchors.reduce((sum, j) => sum + y[j], 0) / anchors.length : cy
    // Beside its one hub, or between the several it links.
    const reach = anchors.length === 1 ? radius[anchors[0]] + radius[i] + linkLength : radius[i] + NODE_GAP
    x[i] = ax + reach * Math.cos(i * GOLDEN_ANGLE)
    y[i] = ay + reach * Math.sin(i * GOLDEN_ANGLE)
  })

  /** Pushes overlapping nodes apart, the smaller one further. */
  const separate = () => {
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        let dx = x[j] - x[i]
        let dy = y[j] - y[i]
        let distance = Math.hypot(dx, dy)
        const apart = radius[i] + radius[j] + NODE_GAP
        if (distance >= apart) continue
        if (distance < 1e-6) {
          // Nodes on one spot have no direction to part in; give them one.
          dx = Math.cos((i + j) * GOLDEN_ANGLE)
          dy = Math.sin((i + j) * GOLDEN_ANGLE)
          distance = 1
        }
        const push = (apart - distance) / distance
        const share = radius[j] ** 2 / (radius[i] ** 2 + radius[j] ** 2)
        x[i] -= dx * push * share
        y[i] -= dy * push * share
        x[j] += dx * push * (1 - share)
        y[j] += dy * push * (1 - share)
      }
    }
  }

  const vx = new Array<number>(count).fill(0)
  const vy = new Array<number>(count).fill(0)
  const cooling = 1 - ALPHA_END ** (1 / TICKS)
  let alpha = 1
  for (let tick = 0; tick < TICKS; tick++) {
    alpha -= alpha * cooling
    for (const [s, t] of pairs) {
      const dx = x[t] + vx[t] - x[s] - vx[s]
      const dy = y[t] + vy[t] - y[s] - vy[s]
      const distance = Math.hypot(dx, dy) || 1
      const rest = radius[s] + radius[t] + linkLength
      // A node with many links is held by all of them, so each pulls it less and its lighter end more.
      const pull = ((distance - rest) / distance) * alpha * (1 / Math.min(degree[s], degree[t]))
      const bias = degree[s] / (degree[s] + degree[t])
      vx[t] -= dx * pull * bias
      vy[t] -= dy * pull * bias
      vx[s] += dx * pull * (1 - bias)
      vy[s] += dy * pull * (1 - bias)
    }
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        const dx = x[j] - x[i]
        const dy = y[j] - y[i]
        const push = alpha / Math.max(dx * dx + dy * dy, 1)
        vx[i] -= dx * push * charge[j]
        vy[i] -= dy * push * charge[j]
        vx[j] += dx * push * charge[i]
        vy[j] += dy * push * charge[i]
      }
      // A weak pull to the middle keeps unlinked groups from drifting off.
      vx[i] += (cx - x[i]) * 0.06 * alpha
      vy[i] += (cy - y[i]) * 0.06 * alpha
    }
    for (let i = 0; i < count; i++) {
      x[i] += vx[i] *= VELOCITY_KEPT
      y[i] += vy[i] *= VELOCITY_KEPT
    }
    separate()
  }

  // Forces settle into a round shape. Stretch it toward the frame's, then zoom to fit.
  const stretch = Math.min(Math.max(Math.sqrt(size.width / size.height), 1 / MAX_STRETCH), MAX_STRETCH)
  for (let i = 0; i < count; i++) {
    x[i] = cx + (x[i] - cx) * stretch
    y[i] = cy + (y[i] - cy) / stretch
  }
  for (let pass = 0; pass < 8; pass++) separate()

  const edge = (sign: 1 | -1, at: number[]) => Math.max(...at.map((v, i) => sign * v + radius[i]))
  const left = -edge(-1, x)
  const right = edge(1, x)
  const top = -edge(-1, y)
  const bottom = edge(1, y)
  const zoom = Math.min(
    (size.width - 2 * FRAME_MARGIN) / Math.max(right - left, 1),
    (size.height - 2 * FRAME_MARGIN) / Math.max(bottom - top, 1),
    MAX_ZOOM,
  )
  for (let i = 0; i < count; i++) {
    x[i] = cx + (x[i] - (left + right) / 2) * zoom
    y[i] = cy + (y[i] - (top + bottom) / 2) * zoom
  }
  // Zooming out to fit brings nodes closer than their sizes allow.
  if (zoom < 1) for (let pass = 0; pass < 8; pass++) separate()

  const within = (value: number, room: number, span: number) =>
    Math.min(Math.max(value, FRAME_MARGIN + room), Math.max(span - FRAME_MARGIN - room, FRAME_MARGIN + room))
  return new Map(
    nodes.map((node, i) => [node.id, { x: within(x[i], radius[i], size.width), y: within(y[i], radius[i], size.height) }]),
  )
}

/** A drawn node: where its label must stay clear of. */
export interface Circle extends Point {
  id: string
  radius: number
}

export interface LabelRequest {
  /** The node to label. */
  id: string
  /** The label's width in pixels, as measured for its text. */
  width: number
  /** What the node is drawn next to, if anything: the label goes on its far side when it can. */
  away?: Point
}

/** A label's place: `x` is where the text starts, ends or centers, per `anchor`; `y` is its middle. */
export interface LabelPlace extends Point {
  anchor: "start" | "middle" | "end"
}

const LABEL_HEIGHT = 14
const LABEL_GAP = 4

/**
 * Labels as many nodes as fit, in the order asked. A label sits beside its
 * node, or under or over it, wherever it stays inside the frame and clear of
 * other nodes and of labels placed before it. One that fits nowhere is left
 * out, never clipped or moved off its node.
 */
export function placeLabels(requests: LabelRequest[], circles: Circle[], size: Size): Map<string, LabelPlace> {
  const byId = new Map(circles.map((circle) => [circle.id, circle]))
  const placed = new Map<string, LabelPlace>()
  const taken: { left: number; top: number; right: number; bottom: number }[] = []

  for (const { id, width, away } of requests) {
    const node = byId.get(id)
    if (!node || placed.has(id)) continue
    const reach = node.radius + LABEL_GAP
    const beside = (side: 1 | -1) => ({
      place: { x: node.x + side * reach, y: node.y, anchor: side === 1 ? ("start" as const) : ("end" as const) },
      left: side === 1 ? node.x + reach : node.x - reach - width,
      top: node.y - LABEL_HEIGHT / 2,
    })
    const stacked = (side: 1 | -1) => ({
      place: { x: node.x, y: node.y + side * (reach + LABEL_HEIGHT / 2), anchor: "middle" as const },
      left: node.x - width / 2,
      top: side === 1 ? node.y + reach : node.y - reach - LABEL_HEIGHT,
    })
    const from = away ?? { x: size.width / 2, y: size.height / 2 }
    const sideways = node.x >= from.x ? 1 : -1
    const upright = node.y >= from.y ? 1 : -1
    const options = [beside(sideways), beside(-sideways as 1 | -1), stacked(upright), stacked(-upright as 1 | -1)]

    for (const { place, left, top } of options) {
      const box = { left, top, right: left + width, bottom: top + LABEL_HEIGHT }
      if (box.left < 0 || box.top < 0 || box.right > size.width || box.bottom > size.height) continue
      if (taken.some((other) => box.left < other.right && other.left < box.right && box.top < other.bottom && other.top < box.bottom)) {
        continue
      }
      const covers = circles.some((circle) => {
        if (circle.id === id) return false
        const dx = circle.x - Math.min(Math.max(circle.x, box.left), box.right)
        const dy = circle.y - Math.min(Math.max(circle.y, box.top), box.bottom)
        return dx * dx + dy * dy < circle.radius ** 2
      })
      if (covers) continue
      placed.set(id, place)
      taken.push(box)
      break
    }
  }
  return placed
}
