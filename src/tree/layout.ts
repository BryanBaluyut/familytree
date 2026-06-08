// Lay out the WHOLE tree (every branch) on one canvas. relatives-tree lays out
// one family from a chosen root (its ancestors, descendants and spouses — but
// NOT a spouse's separate ancestors). So we repeatedly root on a real
// progenitor and peel off the family it covers, until everyone is placed, then
// shelf-pack the clusters. This keeps generations the right way up (ancestors
// on top) regardless of the order people were added.

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

interface Cluster {
  canvas: { width: number; height: number }
  nodes: PlacedNode[]
  connectors: Connector[]
}

const GAP = 3 // half-units of space between separate family clusters

export function layoutForest(rtNodes: RTNode[]): ForestLayout {
  if (rtNodes.length === 0) return { canvas: { width: 0, height: 0 }, nodes: [], connectors: [] }

  const byId = new Map(rtNodes.map((n) => [n.id, n]))

  // Choose the best root among the not-yet-placed people: a progenitor (no
  // parents) who has children is ideal — rooting there keeps ancestors on top
  // and reaches the whole descending family. Fall back gracefully.
  const pickRoot = (remaining: Set<string>): string => {
    let withChildren: string | undefined
    let noParents: string | undefined
    let any: string | undefined
    for (const id of remaining) {
      const n = byId.get(id)
      if (!n) continue
      if (any === undefined) any = id
      const isProgenitor = n.parents.length === 0
      const hasChildren = n.children.length > 0
      if (isProgenitor && hasChildren) return id
      if (hasChildren && withChildren === undefined) withChildren = id
      if (isProgenitor && noParents === undefined) noParents = id
    }
    return withChildren ?? noParents ?? any ?? (remaining.values().next().value as string)
  }

  const clusters: Cluster[] = []
  const remaining = new Set(rtNodes.map((n) => n.id))
  let guard = 0
  while (remaining.size > 0 && guard++ < rtNodes.length + 5) {
    const root = pickRoot(remaining)
    let cluster: Cluster
    try {
      const rel = calcTree(rtNodes as unknown as readonly Node[], { rootId: root })
      cluster = {
        canvas: rel.canvas,
        nodes: rel.nodes.map((n) => ({ id: n.id, left: n.left, top: n.top })),
        connectors: rel.connectors.map((c) => [c[0], c[1], c[2], c[3]] as Connector),
      }
    } catch (e) {
      console.error('calcTree failed', e)
      cluster = { canvas: { width: 2, height: 2 }, nodes: [{ id: root, left: 0, top: 0 }], connectors: [] }
    }
    const fresh = cluster.nodes.filter((n) => remaining.has(n.id))
    if (fresh.length === 0) {
      // Couldn't place the root via calcTree — drop it in as a singleton.
      remaining.delete(root)
      clusters.push({ canvas: { width: 2, height: 2 }, nodes: [{ id: root, left: 0, top: 0 }], connectors: [] })
      continue
    }
    for (const n of cluster.nodes) remaining.delete(n.id)
    clusters.push(cluster)
  }

  clusters.sort((a, b) => b.nodes.length - a.nodes.length) // biggest family first

  const rowTarget = Math.max(1, ...clusters.map((c) => c.canvas.width))
  const placed: PlacedNode[] = []
  const connectors: Connector[] = []
  const seen = new Set<string>()
  let x = 0
  let y = 0
  let rowH = 0
  let maxRight = 0

  for (const c of clusters) {
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

  // Final safety net for anyone still unplaced.
  const tail = rtNodes.filter((n) => !seen.has(n.id))
  if (tail.length) {
    y += rowH + GAP
    tail.forEach((n, i) => {
      placed.push({ id: n.id, left: i * 2, top: y })
      seen.add(n.id)
    })
    rowH = 2
    maxRight = Math.max(maxRight, tail.length * 2)
  }

  return {
    canvas: { width: Math.max(maxRight, rowTarget), height: y + rowH },
    nodes: placed,
    connectors,
  }
}
