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

/** A network held in place by forces: they settled it when it was laid out, and move it again while a node is dragged. */
export interface NetworkLayout {
  /** Where each node's center is, in the order the nodes were given. */
  readonly x: readonly number[]
  readonly y: readonly number[]
  /** Holds a node at a point, as while it is dragged; `null` lets it go. */
  hold(node: number, at: Point | null): void
  /** Moves every node one step. False once the picture is at rest again. */
  step(): boolean
}

/** Empty space kept between two nodes, and between the picture and the frame it is fitted to. */
const NODE_GAP = 8
const FRAME_MARGIN = 12

/** A tick moves nodes by their forces times `alpha`, which cools from 1 to nearly 0 so the picture settles. */
const TICKS = 300
const ALPHA_END = 0.001
/** The share of its speed a node keeps from one tick to the next. */
const VELOCITY_KEPT = 0.6
/** Successive turns by this angle never line up, so nodes that start together fan out evenly. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
/** A held node warms the picture to this `alpha` so the rest gives way to it, by this share of the gap a step. */
const HELD_ALPHA = 0.3
const WARMING = 0.2
/** The weakest push that moves a node of a picture at rest: what a link pulls with when it is this many pixels off its length. */
const GRIP = 0.5

/** A weak pull to the middle keeps unlinked groups from drifting off. */
const GRAVITY = 0.06
/** How far a wide or tall frame may stretch the picture from the round shape even forces settle into. */
const MAX_STRETCH = 1.5
/** A small network is enlarged to use the frame, but not so far that its links turn into spokes. */
const MAX_ZOOM = 1.25

/**
 * A force-directed layout: linked nodes pull together, all nodes push apart,
 * and none overlap. Hubs start on a ring and every other node next to the
 * hubs it is linked to, so the result is settled by the input alone. The
 * frame gives the picture its proportions, not its place: `fitView` shows
 * it in the frame.
 */
export function layoutNetwork(nodes: LayoutNode[], links: LayoutLink[], size: Size): NetworkLayout {
  const count = nodes.length
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
  const spacing = Math.sqrt((size.width * size.height) / Math.max(count, 1))
  const linkLength = Math.min(Math.max(spacing * 0.5, 24), 84)
  const charge = nodes.map((node) => linkLength * (node.hub ? 16 : 3))
  // The middle pulls harder across a frame's short side than along its long one, so the picture takes the frame's shape.
  const stretch = Math.min(Math.max(Math.sqrt(size.width / size.height), 1 / MAX_STRETCH), MAX_STRETCH)
  const gravityX = GRAVITY / stretch
  const gravityY = GRAVITY * stretch

  const x = new Array<number>(count).fill(cx)
  const y = new Array<number>(count).fill(cy)
  const hubs = nodes.flatMap((node, i) => (node.hub ? [i] : []))
  const ring = hubs.length > 1 ? Math.min(size.width, size.height) * 0.3 : 0
  hubs.forEach((i, n) => {
    // Two hubs start side by side in a wide frame, and one above the other in a tall one.
    const angle = (stretch < 1 ? -Math.PI / 2 : Math.PI) + (2 * Math.PI * n) / hubs.length
    x[i] = cx + ring * stretch * Math.cos(angle)
    y[i] = cy + (ring / stretch) * Math.sin(angle)
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

  const held = new Map<number, Point>()

  /** Pushes overlapping nodes apart, the smaller one further and a held one not at all. */
  const separate = () => {
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        let dx = x[j] - x[i]
        let dy = y[j] - y[i]
        const apart = radius[i] + radius[j] + NODE_GAP
        if (dx * dx + dy * dy >= apart * apart) continue
        let distance = Math.sqrt(dx * dx + dy * dy)
        if (distance < 1e-6) {
          // Nodes on one spot have no direction to part in; give them one.
          dx = Math.cos((i + j) * GOLDEN_ANGLE)
          dy = Math.sin((i + j) * GOLDEN_ANGLE)
          distance = 1
        }
        const push = (apart - distance) / distance
        const share = held.has(i) ? 0 : held.has(j) ? 1 : radius[j] ** 2 / (radius[i] ** 2 + radius[j] ** 2)
        x[i] -= dx * push * share
        y[i] -= dy * push * share
        x[j] += dx * push * (1 - share)
        y[j] += dy * push * (1 - share)
      }
    }
  }

  const vx = new Array<number>(count).fill(0)
  const vy = new Array<number>(count).fill(0)
  /** Adds to each node's speed what the forces ask of it. */
  const accelerate = (alpha: number) => {
    for (const [s, t] of pairs) {
      const dx = x[t] + vx[t] - x[s] - vx[s]
      const dy = y[t] + vy[t] - y[s] - vy[s]
      const distance = Math.sqrt(dx * dx + dy * dy) || 1
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
      vx[i] += (cx - x[i]) * gravityX * alpha
      vy[i] += (cy - y[i]) * gravityY * alpha
    }
  }

  /**
   * Cooling stops a picture before its forces are done with it, the more so
   * the larger it is, and warming it again for a drag would set all of it
   * adrift. So where a picture comes to rest, what the forces still ask of
   * each node is taken off from then on, and a push weaker than `GRIP` moves
   * nothing. The picture at rest stays as it is: a dragged node moves what
   * it is tied to and what it runs into, and nothing else.
   */
  const askedX = new Array<number>(count).fill(0)
  const askedY = new Array<number>(count).fill(0)
  let rested = false
  const rest = () => {
    vx.fill(0)
    vy.fill(0)
    accelerate(HELD_ALPHA)
    for (let i = 0; i < count; i++) {
      askedX[i] = vx[i] / HELD_ALPHA
      askedY[i] = vy[i] / HELD_ALPHA
    }
    vx.fill(0)
    vy.fill(0)
    rested = true
  }

  const fromX = new Array<number>(count).fill(0)
  const fromY = new Array<number>(count).fill(0)
  const tick = (alpha: number) => {
    for (let i = 0; rested && i < count; i++) {
      fromX[i] = vx[i]
      fromY[i] = vy[i]
    }
    accelerate(alpha)
    for (let i = 0; i < count; i++) {
      if (rested) {
        const pushX = vx[i] - fromX[i] - askedX[i] * alpha
        const pushY = vy[i] - fromY[i] - askedY[i] * alpha
        const push = Math.sqrt(pushX * pushX + pushY * pushY)
        const kept = push > GRIP * alpha ? 1 - (GRIP * alpha) / push : 0
        vx[i] = fromX[i] + pushX * kept
        vy[i] = fromY[i] + pushY * kept
      }
      x[i] += vx[i] *= VELOCITY_KEPT
      y[i] += vy[i] *= VELOCITY_KEPT
    }
    for (const [i, at] of held) {
      x[i] = at.x
      y[i] = at.y
      vx[i] = vy[i] = 0
    }
    separate()
  }

  const cooling = 1 - ALPHA_END ** (1 / TICKS)
  let alpha = 1
  for (let n = 0; n < TICKS; n++) {
    alpha -= alpha * cooling
    tick(alpha)
  }
  rest()

  return {
    x,
    y,
    hold(node, at) {
      if (at) held.set(node, at)
      else held.delete(node)
    },
    step() {
      const target = held.size > 0 ? HELD_ALPHA : 0
      alpha += (target - alpha) * (target > alpha ? WARMING : cooling)
      tick(alpha)
      if (held.size > 0 || alpha > ALPHA_END) return true
      rest()
      return false
    },
  }
}

/** A drawn node: where a label must stay clear of. */
export interface Circle extends Point {
  id: string
  radius: number
}

/** How a picture is looked at: everything in it is drawn `zoom` times its size, then moved by `x` and `y`. */
export interface View extends Point {
  zoom: number
}

const LABEL_HEIGHT = 14
const LABEL_GAP = 4

/** The view that shows a whole picture in the middle of a frame, with room under it for the lowest node's label. */
export function fitView(circles: Circle[], size: Size): View {
  if (circles.length === 0) return { x: 0, y: 0, zoom: 1 }
  const left = Math.min(...circles.map((c) => c.x - c.radius))
  const right = Math.max(...circles.map((c) => c.x + c.radius))
  const top = Math.min(...circles.map((c) => c.y - c.radius))
  const bottom = Math.max(...circles.map((c) => c.y + c.radius))
  const height = size.height - LABEL_GAP - LABEL_HEIGHT
  const zoom = Math.min(
    (size.width - 2 * FRAME_MARGIN) / Math.max(right - left, 1),
    (height - 2 * FRAME_MARGIN) / Math.max(bottom - top, 1),
    MAX_ZOOM,
  )
  return { x: size.width / 2 - (zoom * (left + right)) / 2, y: height / 2 - (zoom * (top + bottom)) / 2, zoom }
}

export interface LabelRequest {
  /** The node to label. */
  id: string
  /** The label's width in pixels, as measured for its text. */
  width: number
  /** Show the label whatever it runs into: it names something the picture can't do without. */
  keep?: boolean
}

export type LabelSide = "under" | "over"

/** Where a node's label goes: centered under it, or over it. The point is the label's middle. */
export function labelPoint(node: Circle, side: LabelSide = "under"): Point {
  const reach = node.radius + LABEL_GAP + LABEL_HEIGHT / 2
  return { x: node.x, y: side === "under" ? node.y + reach : node.y - reach }
}

/**
 * The nodes to label and the side of each its label goes on: as many as
 * fit, in the order asked. A label sits under its node, or over it where
 * there is no room under. It has to be inside the frame and clear of other
 * nodes and of the labels before it; one that isn't is left out, never
 * clipped or moved off its node.
 */
export function placeLabels(requests: LabelRequest[], circles: Circle[], size: Size): Map<string, LabelSide> {
  const byId = new Map(circles.map((circle) => [circle.id, circle]))
  const placed = new Map<string, LabelSide>()
  const taken: { left: number; top: number; right: number; bottom: number }[] = []

  for (const { id, width, keep } of requests) {
    const node = byId.get(id)
    if (!node || placed.has(id)) continue
    const boxOn = (side: LabelSide) => {
      const middle = labelPoint(node, side)
      const left = middle.x - width / 2
      const top = middle.y - LABEL_HEIGHT / 2
      return { left, top, right: left + width, bottom: top + LABEL_HEIGHT }
    }
    const sides: LabelSide[] = ["under", "over"]
    const side = sides.find((side) => {
      const box = boxOn(side)
      if (box.left < 0 || box.top < 0 || box.right > size.width || box.bottom > size.height) return false
      if (taken.some((other) => box.left < other.right && other.left < box.right && box.top < other.bottom && other.top < box.bottom)) {
        return false
      }
      return !circles.some((circle) => {
        if (circle.id === id) return false
        const dx = circle.x - Math.min(Math.max(circle.x, box.left), box.right)
        const dy = circle.y - Math.min(Math.max(circle.y, box.top), box.bottom)
        return dx * dx + dy * dy < circle.radius ** 2
      })
    })
    if (!side && !keep) continue
    placed.set(id, side ?? "under")
    taken.push(boxOn(side ?? "under"))
  }
  return placed
}
