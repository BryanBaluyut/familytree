// Lay out the family on one canvas. relatives-tree lays out ONE family from a
// chosen root (its ancestors, descendants and spouses — but NOT a married-in
// spouse's separate ancestors). For densely intermarried trees, rooting at
// different people yields heavily OVERLAPPING layouts that can't be stitched
// cleanly (they produce inverted/dangling links).
//
// So: render only NON-overlapping ("clean") clusters in the canvas — the main
// tree plus any genuinely separate families — and send the handful of people a
// clean cluster can't reach (e.g. a married-in spouse's own ancestors) to a
// "shown separately" list. This keeps the drawn tree always correct.

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
  /** Member ids that belong to the family but aren't drawn in the canvas tree. */
  separate: string[]
}

interface Candidate {
  ids: Set<string>
  canvas: { width: number; height: number }
  nodes: PlacedNode[]
  connectors: Connector[]
}

const GAP = 3 // half-units between separate family clusters

export function layoutForest(rtNodes: RTNode[]): ForestLayout {
  if (rtNodes.length === 0) {
    return { canvas: { width: 0, height: 0 }, nodes: [], connectors: [], separate: [] }
  }

  const calcCluster = (root: string): Candidate => {
    try {
      const rel = calcTree(rtNodes as unknown as readonly Node[], { rootId: root })
      return {
        ids: new Set(rel.nodes.map((n) => n.id)),
        canvas: rel.canvas,
        nodes: rel.nodes.map((n) => ({ id: n.id, left: n.left, top: n.top })),
        connectors: rel.connectors.map((c) => [c[0], c[1], c[2], c[3]] as Connector),
      }
    } catch (e) {
      console.error('calcTree failed', e)
      return {
        ids: new Set([root]),
        canvas: { width: 2, height: 2 },
        nodes: [{ id: root, left: 0, top: 0 }],
        connectors: [],
      }
    }
  }

  // Candidate roots: progenitors (no parents, has children); fall back gracefully.
  let roots = rtNodes.filter((n) => n.parents.length === 0 && n.children.length > 0).map((n) => n.id)
  if (roots.length === 0) roots = rtNodes.filter((n) => n.parents.length === 0).map((n) => n.id)
  if (roots.length === 0) roots = rtNodes.map((n) => n.id)

  // Cheap descendant count to process the biggest family first (so it becomes
  // the clean main tree and smaller intermarried fragments fall out as separate).
  const childrenById = new Map(rtNodes.map((n) => [n.id, n.children.map((c) => c.id)]))
  const descCache = new Map<string, number>()
  const countDesc = (id: string): number => {
    const cached = descCache.get(id)
    if (cached !== undefined) return cached
    const seen = new Set([id])
    const stack = [id]
    let count = 0
    while (stack.length) {
      const x = stack.pop() as string
      for (const c of childrenById.get(x) || []) {
        if (!seen.has(c)) {
          seen.add(c)
          count++
          stack.push(c)
        }
      }
    }
    descCache.set(id, count)
    return count
  }
  roots.sort((a, b) => countDesc(b) - countDesc(a))

  const placedIds = new Set<string>()
  const treeClusters: Candidate[] = []
  const separate: string[] = []
  for (const root of roots) {
    if (placedIds.has(root)) continue // already covered by a bigger cluster
    const c = calcCluster(root)
    let gain = 0
    let overlaps = false
    for (const id of c.ids) {
      if (placedIds.has(id)) overlaps = true
      else gain++
    }
    if (gain === 0) continue
    if (!overlaps) {
      treeClusters.push(c) // fully disjoint -> draw it as a tree
      for (const id of c.ids) placedIds.add(id)
    } else {
      for (const id of c.ids) {
        if (!placedIds.has(id)) separate.push(id) // unreachable extras -> separate list
        placedIds.add(id)
      }
    }
  }
  for (const n of rtNodes) if (!placedIds.has(n.id)) separate.push(n.id)

  // Shelf-pack the clean (mutually disjoint) clusters.
  treeClusters.sort((a, b) => b.nodes.length - a.nodes.length)
  const rowTarget = Math.max(1, ...treeClusters.map((c) => c.canvas.width))
  const placed: PlacedNode[] = []
  const connectors: Connector[] = []
  let x = 0
  let y = 0
  let rowH = 0
  let maxRight = 0
  for (const c of treeClusters) {
    if (x > 0 && x + c.canvas.width > rowTarget + 0.001) {
      y += rowH + GAP
      x = 0
      rowH = 0
    }
    for (const n of c.nodes) placed.push({ id: n.id, left: n.left + x, top: n.top + y })
    for (const k of c.connectors) connectors.push([k[0] + x, k[1] + y, k[2] + x, k[3] + y] as Connector)
    x += c.canvas.width + GAP
    rowH = Math.max(rowH, c.canvas.height)
    maxRight = Math.max(maxRight, x - GAP)
  }

  return {
    canvas: { width: Math.max(maxRight, rowTarget), height: y + rowH },
    nodes: placed,
    connectors,
    separate,
  }
}
