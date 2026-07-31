// Convert our normalized Tree into the node format relatives-tree expects.
// relatives-tree needs every node to declare its parents, children, siblings
// and spouses explicitly, with relation types limited to:
//   parents/children/siblings: 'blood' | 'adopted' | 'half'
//   spouses:                   'married' | 'divorced'
// gender is limited to 'male' | 'female'.

import type { ID, Tree } from '@shared/types'
import { childrenOf, parentsOf, partnersOf } from '../lib/relationships'

export type RTRelType = 'blood' | 'married' | 'divorced' | 'adopted' | 'half'

export interface RTRelation {
  id: string
  type: RTRelType
}

export interface RTNode {
  id: string
  gender: 'male' | 'female'
  parents: RTRelation[]
  children: RTRelation[]
  siblings: RTRelation[]
  spouses: RTRelation[]
}

/**
 * Phantom "ghost spouse" nodes. relatives-tree flanks a multi-partner person
 * (partners on both sides). To draw ALL partners on ONE side — earliest to
 * latest, left to right — every real partnership of such a person is passed as
 * 'divorced' (the type the engine stacks LEFT of the person in array order)
 * and an invisible ghost 'married' spouse is appended to claim the right-hand
 * slot, which forces the stack. layoutForest strips ghost cards and their
 * connector from the result; ghosts never reach the screen.
 */
export const GHOST_MARK = '__ghost'
export const isGhostId = (id: string): boolean => id.endsWith(GHOST_MARK)

// Our data model has no parent-link types and no gender; relatives-tree wants
// both, so every parent/child link is 'blood' and every node 'male' (gender
// only influences which side a spouse lands on, which the ghost-spouse trick
// and partner order already control).
export function buildNodes(tree: Tree): RTNode[] {
  // Members with 2+ partners get the one-sided partner stack (see GHOST_MARK).
  const partnerCount = new Map<ID, number>()
  for (const p of tree.partnerships) {
    partnerCount.set(p.a, (partnerCount.get(p.a) ?? 0) + 1)
    partnerCount.set(p.b, (partnerCount.get(p.b) ?? 0) + 1)
  }
  const multi = (id: ID) => (partnerCount.get(id) ?? 0) >= 2
  // A partnership renders as the stacking type when it is dissolved OR either
  // endpoint is multi-partner (both endpoints must agree on the type).
  const rtSpouseType = (a: ID, b: ID, status: string): RTRelType =>
    status === 'separated' || multi(a) || multi(b) ? 'divorced' : 'married'

  const nodes: RTNode[] = tree.members.map((m) => ({
    id: m.id,
    gender: 'male' as const,
    parents: parentsOf(tree, m.id).map(({ parentId }) => ({
      id: parentId,
      type: 'blood' as const,
    })),
    children: childrenOf(tree, m.id).map(({ childId }) => ({
      id: childId,
      type: 'blood' as const,
    })),
    // partnersOf is ordered earliest-first, which is exactly the left-to-right
    // order the engine gives 'divorced'-typed spouses (array[0] leftmost). The
    // ghost spouse (appended below) keeps a multi-partner person to the RIGHT
    // of the stack, so their relationships read chronologically left -> right.
    spouses: partnersOf(tree, m.id).map(({ otherId, partnership }) => ({
      id: otherId,
      type: rtSpouseType(partnership.a, partnership.b, partnership.status),
    })),
    siblings: siblingsOf(tree, m.id),
  }))

  const byId = new Map(nodes.map((n) => [n.id, n]))
  for (const m of tree.members) {
    if (!multi(m.id)) continue
    const ghostId = `${m.id}${GHOST_MARK}`
    byId.get(m.id)?.spouses.push({ id: ghostId, type: 'married' })
    nodes.push({
      id: ghostId,
      gender: 'male',
      parents: [],
      children: [],
      siblings: [],
      spouses: [{ id: m.id, type: 'married' }],
    })
  }
  return nodes
}

/** Siblings = members sharing at least one parent. Full if parent sets match. */
function siblingsOf(tree: Tree, id: ID): RTRelation[] {
  const mine = new Set(parentsOf(tree, id).map((p) => p.parentId))
  if (mine.size === 0) return []
  const result: RTRelation[] = []
  for (const other of tree.members) {
    if (other.id === id) continue
    const theirs = parentsOf(tree, other.id).map((p) => p.parentId)
    if (theirs.length === 0) continue
    const shared = theirs.filter((p) => mine.has(p)).length
    if (shared === 0) continue
    const full = shared === mine.size && shared === theirs.length
    result.push({ id: other.id, type: full ? 'blood' : 'half' })
  }
  return result
}
