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
  let separate: string[] = []
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

  // Attach "orphaned" children. relatives-tree lays out a single bloodline from a
  // root and won't descend into a married-in spouse's *solo* child, so such a
  // child would otherwise fall into `separate` with no line drawn (you'd only see
  // it once you also added the bloodline co-parent). Here we hang any unplaced
  // member that has a *placed* parent directly below that parent and draw the
  // connector ourselves. Handles chains (an orphan's own children) by iterating.
  attachOrphans(rtNodes, placed, connectors, (separate = [...separate]))

  // Attachment (and centering under an edge parent) can produce negative offsets;
  // shift everything back into the >= 0 canvas space.
  let minLeft = 0
  let minTop = 0
  for (const n of placed) {
    minLeft = Math.min(minLeft, n.left)
    minTop = Math.min(minTop, n.top)
  }
  for (const c of connectors) {
    minLeft = Math.min(minLeft, c[0])
    minTop = Math.min(minTop, c[1])
  }
  if (minLeft < 0 || minTop < 0) {
    const dx = -Math.min(0, minLeft)
    const dy = -Math.min(0, minTop)
    for (const n of placed) {
      n.left += dx
      n.top += dy
    }
    for (let i = 0; i < connectors.length; i++) {
      const c = connectors[i]
      connectors[i] = [c[0] + dx, c[1] + dy, c[2] + dx, c[3] + dy] as Connector
    }
  }

  let width = rowTarget
  let height = 0
  for (const n of placed) {
    width = Math.max(width, n.left + 2)
    height = Math.max(height, n.top + 2)
  }
  for (const c of connectors) {
    width = Math.max(width, c[2])
    height = Math.max(height, c[3])
  }

  return { canvas: { width, height }, nodes: placed, connectors, separate }
}

/** Hang unplaced members that have a placed parent directly below that parent. */
function attachOrphans(
  rtNodes: RTNode[],
  placed: PlacedNode[],
  connectors: Connector[],
  separate: string[],
): void {
  const pos = new Map(placed.map((n) => [n.id, n]))
  const childIds = new Map(rtNodes.map((n) => [n.id, n.children.map((c) => c.id)]))
  const parentIds = new Map(rtNodes.map((n) => [n.id, n.parents.map((p) => p.id)]))

  // Generation gap = a typical placed parent->child vertical delta (fallback 4).
  let genGap = 0
  for (const n of rtNodes) {
    const pp = pos.get(n.id)
    if (!pp) continue
    for (const cid of childIds.get(n.id) || []) {
      const cp = pos.get(cid)
      if (cp && cp.top - pp.top > 0) {
        genGap = cp.top - pp.top
        break
      }
    }
    if (genGap) break
  }
  if (!genGap) genGap = 4

  const overlapsAny = (left: number, top: number) =>
    placed.some((n) => left < n.left + 2 && n.left < left + 2 && top < n.top + 2 && n.top < top + 2)
  const pushSeg = (x1: number, y1: number, x2: number, y2: number) =>
    connectors.push([Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)] as Connector)

  const pending = new Set(separate)
  let progress = true
  while (progress && pending.size) {
    progress = false
    const byParent = new Map<string, string[]>()
    for (const id of pending) {
      const placedParents = (parentIds.get(id) || []).filter((pid) => pos.has(pid))
      if (placedParents.length === 0) continue
      const parent = placedParents[0]
      const list = byParent.get(parent) || []
      list.push(id)
      byParent.set(parent, list)
    }
    for (const [parentId, kidsRaw] of byParent) {
      const P = pos.get(parentId)
      if (!P) continue
      // left-to-right by this parent's child order (already order-sorted in rtNodes)
      const order = childIds.get(parentId) || []
      const kids = kidsRaw.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b))
      const groupW = kids.length * 2
      const startLeft = Math.round(P.left + 1 - groupW / 2)
      let top = P.top + genGap
      for (let attempt = 0; attempt < 60; attempt++) {
        if (!kids.some((_, i) => overlapsAny(startLeft + i * 2, top))) break
        top += genGap
      }
      const centers: number[] = []
      kids.forEach((id, i) => {
        const node = { id, left: startLeft + i * 2, top }
        placed.push(node)
        pos.set(id, node)
        pending.delete(id)
        centers.push(node.left + 1)
        progress = true
      })
      const pcx = P.left + 1
      const pby = P.top + 2
      if (centers.length === 1 && centers[0] === pcx) {
        pushSeg(pcx, pby, pcx, top) // straight drop
      } else {
        const busY = Math.max(pby, top - Math.max(1, Math.floor(genGap / 2)))
        if (busY > pby) pushSeg(pcx, pby, pcx, busY) // parent down to the bus (skip if zero-length)
        pushSeg(Math.min(pcx, ...centers), busY, Math.max(pcx, ...centers), busY) // bus
        for (const cx of centers) pushSeg(cx, busY, cx, top) // drop to each child
      }
    }
  }
  // mutate the caller's array in place to reflect what is still unattached
  separate.length = 0
  for (const id of pending) separate.push(id)
}
