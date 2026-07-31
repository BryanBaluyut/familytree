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

// Our data model has no parent-link types and no gender; relatives-tree wants
// both, so every parent/child link is 'blood' and every node 'male' (gender
// only influences which side a spouse lands on, which our relatives-tree patch
// and partner order already control).
export function buildNodes(tree: Tree): RTNode[] {
  // A multi-partner person's partnerships are ALL passed as 'divorced': that
  // stops the engine electing one "real" spouse by marriage and lets our
  // relatives-tree patch (see patches/) draw every partner to the RIGHT of the
  // person in input order — earliest first, exactly like a normal couple, just
  // continued. Both endpoints of a partnership must agree on the type.
  const partnerCount = new Map<ID, number>()
  for (const p of tree.partnerships) {
    partnerCount.set(p.a, (partnerCount.get(p.a) ?? 0) + 1)
    partnerCount.set(p.b, (partnerCount.get(p.b) ?? 0) + 1)
  }
  const multi = (id: ID) => (partnerCount.get(id) ?? 0) >= 2
  const rtSpouseType = (a: ID, b: ID): RTRelType => (multi(a) || multi(b) ? 'divorced' : 'married')

  return tree.members.map((m) => ({
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
    // partnersOf is ordered earliest-first = the left-to-right drawing order.
    spouses: partnersOf(tree, m.id).map(({ otherId, partnership }) => ({
      id: otherId,
      type: rtSpouseType(partnership.a, partnership.b),
    })),
    siblings: siblingsOf(tree, m.id),
  }))
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
