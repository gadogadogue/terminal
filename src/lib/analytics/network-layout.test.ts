import { describe, expect, it } from "vitest"
import { layoutNetwork, placeLabels, type Circle, type LayoutLink, type LayoutNode } from "./network-layout"

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

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

describe("layoutNetwork", () => {
  it("keeps every node inside the frame and no two on top of each other", () => {
    for (const [hubs, leaves, shared] of [[1, 10, 0], [3, 7, 3], [4, 5, 20], [12, 4, 6]]) {
      const { nodes, links } = star(hubs, leaves, shared)
      const at = layoutNetwork(nodes, links, SIZE)
      expect(at.size).toBe(nodes.length)
      for (const node of nodes) {
        const p = at.get(node.id)!
        expect(p.x - node.radius).toBeGreaterThanOrEqual(0)
        expect(p.x + node.radius).toBeLessThanOrEqual(SIZE.width)
        expect(p.y - node.radius).toBeGreaterThanOrEqual(0)
        expect(p.y + node.radius).toBeLessThanOrEqual(SIZE.height)
      }
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
    expect([...layoutNetwork(nodes, links, SIZE)]).toEqual([...layoutNetwork(nodes, links, SIZE)])
  })

  it("puts a node by the hub it is linked to, and a shared one between its hubs", () => {
    const { nodes, links } = star(2, 6, 1)
    const at = layoutNetwork(nodes, links, SIZE)
    const [a, b] = [at.get("hub0")!, at.get("hub1")!]
    for (let l = 0; l < 6; l++) {
      const leaf = at.get(`leaf0-${l}`)!
      expect(distance(leaf, a)).toBeLessThan(distance(leaf, b))
    }
    const shared = at.get("shared0")!
    expect(Math.max(distance(shared, a), distance(shared, b))).toBeLessThan(distance(a, b))
  })

  it("centers a lone node, ignores links to nodes it wasn't given, and handles nothing at all", () => {
    const at = layoutNetwork([{ id: "only", radius: 30, hub: true }], [{ source: "ghost", target: "only" }], SIZE)
    expect(at.get("only")).toEqual({ x: 450, y: 240 })
    expect(layoutNetwork([], [], SIZE).size).toBe(0)
  })

  it("fits a frame that is taller than wide", () => {
    const { nodes, links } = star(3, 7, 3)
    const tall = { width: 340, height: 520 }
    const at = layoutNetwork(nodes, links, tall)
    const xs = [...at.values()].map((p) => p.x)
    const ys = [...at.values()].map((p) => p.y)
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...xs)).toBeLessThanOrEqual(tall.width)
    // The picture stands up with the frame.
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(Math.max(...xs) - Math.min(...xs))
  })
})

describe("placeLabels", () => {
  const circle = (id: string, x: number, y: number, radius = 8): Circle => ({ id, x, y, radius })

  it("sets a label beside its node, on the side away from what the node is drawn next to", () => {
    const circles = [circle("left", 300, 240), circle("right", 600, 240)]
    const labels = placeLabels(
      [
        { id: "left", width: 80, away: { x: 450, y: 240 } },
        { id: "right", width: 80, away: { x: 450, y: 240 } },
      ],
      circles,
      SIZE,
    )
    expect(labels.get("left")).toEqual({ x: 300 - 12, y: 240, anchor: "end" })
    expect(labels.get("right")).toEqual({ x: 600 + 12, y: 240, anchor: "start" })
  })

  it("moves a label that would leave the frame or cover a node, and drops one that fits nowhere", () => {
    // Too close to the right edge for a label on that side.
    const edge = placeLabels([{ id: "a", width: 100 }], [circle("a", 860, 240)], SIZE)
    expect(edge.get("a")?.anchor).toBe("end")

    // A node sits where the label would go on the left; the far side from `away` is taken first.
    const blocked = placeLabels(
      [{ id: "a", width: 60, away: { x: 900, y: 240 } }],
      [circle("a", 450, 240), circle("b", 410, 240)],
      SIZE,
    )
    expect(blocked.get("a")?.anchor).toBe("start")

    const cramped = placeLabels([{ id: "a", width: 200 }], [circle("a", 60, 20)], { width: 120, height: 40 })
    expect(cramped.has("a")).toBe(false)
  })

  it("gives the space to the labels asked for first", () => {
    const circles = [circle("first", 450, 240), circle("second", 450, 250, 2)]
    const labels = placeLabels(
      [
        { id: "first", width: 120 },
        { id: "second", width: 120 },
      ],
      circles,
      SIZE,
    )
    const first = labels.get("first")!
    const second = labels.get("second")
    expect(first.anchor).toBe("start")
    // The second label can't share the first one's spot; it lands elsewhere or nowhere.
    expect(second).not.toEqual(first)
    if (second?.anchor === "start") expect(Math.abs(second.y - first.y)).toBeGreaterThanOrEqual(14)
  })
})
