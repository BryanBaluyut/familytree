// Lay out the WHOLE tree (every branch) on one canvas. relatives-tree can only
// lay out one connected family per call, so we split members into connected
// components, lay each out from a progenitor, then shelf-pack the clusters.

import calcTree from 'relatives-tree'
import type { Connector, Node } from 'relatives-tree/lib/types'
import type { RTNode } from './buildNodes'

export interface PlacedNode {
  id: string
  left: number
  top: number
}

export interface ForestLayout {
  canvas: { width: number; height: number }
  nodes: PlacedNode[]
  connectors: Connector[]
}

const GAP = 3 // half-units of space between separate family clusters

export function layoutForest(rtNodes: RTNode[]): ForestLayout {
  if (rtNodes.length === 0) return { canvas: { width: 0, height: 0 }, nodes: [], connectors: [] }

  const byId = new Map(rtNodes.map((n) => [n.id, n]))

  // --- union-find over spouse + parent/child edges => connected components ---
  const parent = new Map<string, string>()
  rtNodes.forEach((n) => parent.set(n.id, n.id))
  const find = (x: string): string => {
    let root = x
    while (parent.get(root) !== root) root = parent.get(root) as string
    while (parent.get(x) !== root) {
      const next = parent.get(x) as string
      parent.set(x, root)
      x = next
    }
    return root
  }
  const union = (a: string, b: string) => {
    if (!byId.has(a) || !byId.has(b)) return
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }
  for (const n of rtNodes) {
    for (const s of n.spouses) union(n.id, s.id)
    for (const c of n.children) union(n.id, c.id)
    for (const p of n.parents) union(n.id, p.id)
  }
  const groups = new Map<string, string[]>()
  for (const n of rtNodes) {
    const root = find(n.id)
    const g = groups.get(root)
    if (g) g.push(n.id)
    else groups.set(root, [n.id])
  }

  const layoutOne = (ids: string[]): ForestLayout => {
    const root = ids.find((id) => (byId.get(id)?.parents.length ?? 0) === 0) ?? ids[0]
    try {
      const rel = calcTree(rtNodes as unknown as readonly Node[], { rootId: root })
      return {
        canvas: rel.canvas,
        nodes: rel.nodes.map((n) => ({ id: n.id, left: n.left, top: n.top })),
        connectors: rel.connectors.map((c) => [c[0], c[1], c[2], c[3]] as Connector),
      }
    } catch (e) {
      console.error('calcTree failed for a component', e)
      return {
        canvas: { width: Math.max(2, ids.length * 2), height: 2 },
        nodes: ids.map((id, i) => ({ id, left: i * 2, top: 0 })),
        connectors: [],
      }
    }
  }

  const comps = [...groups.values()].map(layoutOne)
  comps.sort((a, b) => b.nodes.length - a.nodes.length) // biggest cluster first

  const rowTarget = Math.max(1, ...comps.map((c) => c.canvas.width))
  const placed: PlacedNode[] = []
  const connectors: Connector[] = []
  const seen = new Set<string>()
  let x = 0
  let y = 0
  let rowH = 0
  let maxRight = 0

  for (const c of comps) {
    if (x > 0 && x + c.canvas.width > rowTarget + 0.001) {
      y += rowH + GAP
      x = 0
      rowH = 0
    }
    for (const n of c.nodes) {
      if (seen.has(n.id)) continue
      seen.add(n.id)
      placed.push({ id: n.id, left: n.left + x, top: n.top + y })
    }
    for (const k of c.connectors) {
      connectors.push([k[0] + x, k[1] + y, k[2] + x, k[3] + y] as Connector)
    }
    x += c.canvas.width + GAP
    rowH = Math.max(rowH, c.canvas.height)
    maxRight = Math.max(maxRight, x - GAP)
  }

  // Safety net: place any member that somehow wasn't laid out, in a final row.
  const tail = rtNodes.filter((n) => !seen.has(n.id))
  if (tail.length) {
    y += rowH + GAP
    tail.forEach((n, i) => placed.push({ id: n.id, left: i * 2, top: y }))
    rowH = 2
    maxRight = Math.max(maxRight, tail.length * 2)
  }

  return {
    canvas: { width: Math.max(maxRight, rowTarget), height: y + rowH },
    nodes: placed,
    connectors,
  }
}
