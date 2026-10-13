import { describe, expect, it } from "vitest"
import {
  fitView,
  labelPoint,
  layoutNetwork,
  placeLabels,
  type Circle,
  type LayoutLink,
  type LayoutNode,
  type NetworkLayout,
  type Point,
} from "./network-layout"

const SIZE = { width: 900, height: 480 }

/** `hubs` hubs with `leaves` nodes of their own each, and `shared` nodes linked to every hub. */
function star(hubs: number, leaves: number, shared = 0): { nodes: LayoutNode[]; links: LayoutLink[] } {
  const nodes: LayoutNode[] = []
  const links: LayoutLink[] = []
  for (let h = 0; h < hubs; h++) {
    nodes.push({ id: `hub${h}`, radius: 30, hub: true })
    for (let l = 0; l < leaves; l++) {
      nodes.push({ id: `leaf${h}-${l}`, radius: 7 })
      links.push({ source: `leaf${h}-${l}`, target: `hub${h}` })
    }
  }
  for (let s = 0; s < shared; s++) {
    nodes.push({ id: `shared${s}`, radius: 9 })
    for (let h = 0; h < hubs; h++) links.push({ source: `shared${s}`, target: `hub${h}` })
  }
  return { nodes, links }
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

/** Where a layout has each node now, by the node's id. */
const places = (nodes: LayoutNode[], layout: NetworkLayout) =>
  new Map(nodes.map((node, i) => [node.id, { x: layout.x[i], y: layout.y[i] }]))

/** How far the node that moved most is from where it was. */
const moved = (from: Map<string, Point>, to: Map<string, Point>) =>
  Math.max(...[...from].map(([id, point]) => distance(point, to.get(id)!)))

const extent = (values: readonly number[]) => Math.max(...values) - Math.min(...values)

describe("layoutNetwork", () => {
  it("puts no two nodes on top of each other", () => {
    for (const [hubs, leaves, shared] of [[1, 10, 0], [3, 7, 3], [4, 5, 20], [12, 4, 6]]) {
      const { nodes, links } = star(hubs, leaves, shared)
      const at = places(nodes, layoutNetwork(nodes, links, SIZE))
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const gap = distance(at.get(nodes[i].id)!, at.get(nodes[j].id)!) - nodes[i].radius - nodes[j].radius
          expect(gap, `${nodes[i].id} and ${nodes[j].id} of ${hubs}/${leaves}/${shared}`).toBeGreaterThan(0)
        }
      }
    }
  })

  it("draws the same picture for the same input", () => {
    const { nodes, links } = star(3, 7, 3)
    expect([...places(nodes, layoutNetwork(nodes, links, SIZE))]).toEqual([
      ...places(nodes, layoutNetwork(nodes, links, SIZE)),
    ])
  })

  it("puts a node by the hub it is linked to, and a shared one between its hubs", () => {
    const { nodes, links } = star(2, 6, 1)
    const at = places(nodes, layoutNetwork(nodes, links, SIZE))
    const [a, b] = [at.get("hub0")!, at.get("hub1")!]
    for (let l = 0; l < 6; l++) {
      const leaf = at.get(`leaf0-${l}`)!
      expect(distance(leaf, a)).toBeLessThan(distance(leaf, b))
    }
    const shared = at.get("shared0")!
    expect(Math.max(distance(shared, a), distance(shared, b))).toBeLessThan(distance(a, b))
  })

  it("centers a lone node, ignores links to nodes it wasn't given, and handles nothing at all", () => {
    const layout = layoutNetwork([{ id: "only", radius: 30, hub: true }], [{ source: "ghost", target: "only" }], SIZE)
    expect([layout.x[0], layout.y[0]]).toEqual([450, 240])
    const none = layoutNetwork([], [], SIZE)
    expect(none.x).toHaveLength(0)
    expect(none.step()).toBe(false)
  })

  it("gives the picture its frame's proportions", () => {
    const { nodes, links } = star(3, 7, 3)
    const wide = layoutNetwork(nodes, links, SIZE)
    expect(extent(wide.x)).toBeGreaterThan(extent(wide.y))
    const tall = layoutNetwork(nodes, links, { width: 340, height: 520 })
    expect(extent(tall.y)).toBeGreaterThan(extent(tall.x))
  })

  it("stays as it is at rest, however long a node is held where it lies", () => {
    for (const [hubs, leaves, shared] of [[3, 7, 3], [12, 18, 10]]) {
      const { nodes, links } = star(hubs, leaves, shared)
      const layout = layoutNetwork(nodes, links, SIZE)
      const settled = places(nodes, layout)
      expect(layout.step()).toBe(false)
      layout.hold(0, { ...settled.get("hub0")! })
      for (let n = 0; n < 200; n++) expect(layout.step()).toBe(true)
      expect(moved(settled, places(nodes, layout)), `${hubs}/${leaves}/${shared}`).toBeLessThan(2)
    }
  })

  it("moves a held node's neighbors with it, and rests where they end up once it is let go", () => {
    const { nodes, links } = star(2, 6)
    const layout = layoutNetwork(nodes, links, SIZE)
    const settled = places(nodes, layout)
    const hub = settled.get("hub0")!
    const gap = (at: Map<string, Point>) => distance(at.get("hub0")!, at.get("leaf0-0")!)

    const to = { x: hub.x - 150, y: hub.y + 200 }
    layout.hold(0, to)
    for (let n = 0; n < 120; n++) layout.step()
    const dragged = places(nodes, layout)
    expect(dragged.get("hub0")).toEqual(to)
    // The leaf came along: it is as far from its hub as it was, give or take.
    expect(Math.abs(gap(dragged) - gap(settled))).toBeLessThan(gap(settled) * 0.25)

    layout.hold(0, null)
    let steps = 0
    while (layout.step()) steps += 1
    expect(steps).toBeLessThan(600)
    const rested = places(nodes, layout)
    layout.hold(1, { ...rested.get("leaf0-0")! })
    for (let n = 0; n < 100; n++) layout.step()
    expect(moved(rested, places(nodes, layout))).toBeLessThan(2)
  })
})

describe("fitView", () => {
  const drawn = (nodes: LayoutNode[], layout: NetworkLayout): Circle[] =>
    nodes.map((node, i) => ({ id: node.id, radius: node.radius, x: layout.x[i], y: layout.y[i] }))

  it("shows every node inside the frame, whatever the frame's shape", () => {
    for (const size of [SIZE, { width: 340, height: 520 }]) {
      for (const [hubs, leaves, shared] of [[1, 10, 0], [3, 7, 3], [12, 18, 10]]) {
        const { nodes, links } = star(hubs, leaves, shared)
        const circles = drawn(nodes, layoutNetwork(nodes, links, size))
        const view = fitView(circles, size)
        for (const circle of circles) {
          const x = circle.x * view.zoom + view.x
          const y = circle.y * view.zoom + view.y
          const radius = circle.radius * view.zoom
          expect(x - radius).toBeGreaterThanOrEqual(0)
          expect(x + radius).toBeLessThanOrEqual(size.width)
          expect(y - radius).toBeGreaterThanOrEqual(0)
          // The lowest node's label has to fit under it.
          expect(labelPoint({ ...circle, x, y, radius }).y + 7).toBeLessThanOrEqual(size.height)
        }
      }
    }
  })

  it("centers a small picture and enlarges it only so far", () => {
    const view = fitView([{ id: "a", x: 100, y: 100, radius: 10 }, { id: "b", x: 160, y: 100, radius: 10 }], SIZE)
    expect(view.zoom).toBe(1.25)
    expect(130 * view.zoom + view.x).toBe(450)
    expect(fitView([], SIZE)).toEqual({ x: 0, y: 0, zoom: 1 })
  })
})

describe("placeLabels", () => {
  const circle = (id: string, x: number, y: number, radius = 8): Circle => ({ id, x, y, radius })

  it("sets a label centered under its node", () => {
    const node = circle("a", 300, 240)
    expect(labelPoint(node)).toEqual({ x: 300, y: 240 + 8 + 4 + 7 })
    expect(labelPoint(node, "over")).toEqual({ x: 300, y: 240 - 8 - 4 - 7 })
    expect([...placeLabels([{ id: "a", width: 80 }], [node], SIZE)]).toEqual([["a", "under"]])
  })

  it("sets a label over its node where it has no room under it, and leaves out one that fits on neither side", () => {
    // Too close to the bottom edge for a label under it.
    expect(placeLabels([{ id: "a", width: 100 }], [circle("a", 450, 470)], SIZE).get("a")).toBe("over")
    // A node sits where the label would go.
    const blocked = [circle("a", 450, 240), circle("b", 470, 262)]
    expect(placeLabels([{ id: "a", width: 60 }], blocked, SIZE).get("a")).toBe("over")
    expect(placeLabels([{ id: "a", width: 60 }], [...blocked, circle("c", 430, 218)], SIZE).has("a")).toBe(false)
    // Too close to the right edge for a label 100 wide, on either side.
    expect(placeLabels([{ id: "a", width: 100 }], [circle("a", 860, 240)], SIZE).has("a")).toBe(false)
  })

  it("gives the space to the labels asked for first", () => {
    const circles = [circle("first", 450, 240), circle("second", 500, 240)]
    const requests = [
      { id: "first", width: 120 },
      { id: "second", width: 120 },
    ]
    expect([...placeLabels(requests, circles, SIZE)]).toEqual([["first", "under"], ["second", "over"]])
    expect([...placeLabels([...requests].reverse(), circles, SIZE)]).toEqual([["second", "under"], ["first", "over"]])
    // A third node between two labels has both of its sides taken.
    const between = [circle("first", 450, 240), circle("second", 450, 290), circle("third", 470, 265, 2)]
    expect(placeLabels([...requests, { id: "third", width: 120 }], between, SIZE).has("third")).toBe(false)
  })

  it("keeps a label it is told to, and makes the ones after it give way", () => {
    const circles = [circle("kept", 450, 240), circle("near", 450, 262, 6), circle("above", 450, 218, 6), circle("other", 520, 240)]
    const labels = placeLabels(
      [
        { id: "kept", width: 60, keep: true },
        { id: "other", width: 120 },
      ],
      circles,
      SIZE,
    )
    // It covers a node on either side and is shown under its own all the same; the label beside it moves over.
    expect([...labels]).toEqual([["kept", "under"], ["other", "over"]])
  })
})
