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

const parentTypeToRT = (type: string): RTRelType => (type === 'blood' ? 'blood' : 'adopted')

const spouseStatusToRT = (status: string): RTRelType =>
  status === 'divorced' || status === 'separated' ? 'divorced' : 'married'

export function buildNodes(tree: Tree): RTNode[] {
  return tree.members.map((m) => ({
    id: m.id,
    gender: m.gender === 'female' ? 'female' : 'male',
    parents: parentsOf(tree, m.id).map(({ parentId, parentage }) => ({
      id: parentId,
      type: parentTypeToRT(parentage.type),
    })),
    children: childrenOf(tree, m.id).map(({ childId, parentage }) => ({
      id: childId,
      type: parentTypeToRT(parentage.type),
    })),
    spouses: partnersOf(tree, m.id).map(({ otherId, partnership }) => ({
      id: otherId,
      type: spouseStatusToRT(partnership.status),
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
