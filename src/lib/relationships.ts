// Pure helpers over a Tree: derived lookups and immutable mutations.
// Keeping these pure makes them easy to reason about and test, and lets the
// store hook stay thin.

import type {
  ID,
  Member,
  Parentage,
  ParentType,
  Partnership,
  PartnerStatus,
  Tree,
} from '@shared/types'
import { newId } from './id'

// --- lookups -----------------------------------------------------------------

export const memberById = (tree: Tree, id: ID): Member | undefined =>
  tree.members.find((m) => m.id === id)

export interface PartnerLink {
  partnership: Partnership
  otherId: ID
}

export const partnersOf = (tree: Tree, id: ID): PartnerLink[] =>
  tree.partnerships
    .filter((p) => p.a === id || p.b === id)
    .map((p) => ({ partnership: p, otherId: p.a === id ? p.b : p.a }))

export interface ParentLink {
  parentage: Parentage
  parentId: ID
}

export const parentsOf = (tree: Tree, id: ID): ParentLink[] =>
  tree.parentages
    .filter((p) => p.child === id)
    .map((p) => ({ parentage: p, parentId: p.parent }))

export interface ChildLink {
  parentage: Parentage
  childId: ID
}

export const childrenOf = (tree: Tree, id: ID): ChildLink[] =>
  tree.parentages
    .filter((p) => p.parent === id)
    .map((p) => ({ parentage: p, childId: p.child }))

// --- mutations (pure: each returns a new Tree) -------------------------------

export const createMember = (name: string): Member => ({
  id: newId(),
  name: name.trim() || 'Unnamed',
})

export function upsertMember(tree: Tree, member: Member): Tree {
  const exists = tree.members.some((m) => m.id === member.id)
  return {
    ...tree,
    members: exists
      ? tree.members.map((m) => (m.id === member.id ? member : m))
      : [...tree.members, member],
  }
}

/** Remove a member and any partnerships / parentages that referenced it. */
export function removeMember(tree: Tree, id: ID): Tree {
  return {
    ...tree,
    members: tree.members.filter((m) => m.id !== id),
    partnerships: tree.partnerships.filter((p) => p.a !== id && p.b !== id),
    parentages: tree.parentages.filter((p) => p.parent !== id && p.child !== id),
  }
}

export function addPartnership(
  tree: Tree,
  a: ID,
  b: ID,
  status: PartnerStatus = 'married',
): Tree {
  if (a === b) return tree
  const duplicate = tree.partnerships.some(
    (p) => (p.a === a && p.b === b) || (p.a === b && p.b === a),
  )
  if (duplicate) return tree
  const partnership: Partnership = { id: newId(), a, b, status }
  return { ...tree, partnerships: [...tree.partnerships, partnership] }
}

export function updatePartnership(
  tree: Tree,
  id: ID,
  patch: Partial<Omit<Partnership, 'id'>>,
): Tree {
  return {
    ...tree,
    partnerships: tree.partnerships.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  }
}

export function removePartnership(tree: Tree, id: ID): Tree {
  return { ...tree, partnerships: tree.partnerships.filter((p) => p.id !== id) }
}

export function addParentage(
  tree: Tree,
  parent: ID,
  child: ID,
  type: ParentType = 'blood',
): Tree {
  if (parent === child) return tree
  const duplicate = tree.parentages.some((p) => p.parent === parent && p.child === child)
  if (duplicate) return tree
  // Guard against cycles: a child cannot also be an ancestor of its parent.
  if (isAncestor(tree, child, parent)) return tree
  const parentage: Parentage = { id: newId(), parent, child, type }
  return { ...tree, parentages: [...tree.parentages, parentage] }
}

export function updateParentage(
  tree: Tree,
  id: ID,
  patch: Partial<Omit<Parentage, 'id'>>,
): Tree {
  return {
    ...tree,
    parentages: tree.parentages.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  }
}

export function removeParentage(tree: Tree, id: ID): Tree {
  return { ...tree, parentages: tree.parentages.filter((p) => p.id !== id) }
}

/** True when `ancestor` appears above `descendant` in the parentage graph. */
export function isAncestor(tree: Tree, ancestor: ID, descendant: ID): boolean {
  const seen = new Set<ID>()
  const stack: ID[] = [descendant]
  while (stack.length) {
    const current = stack.pop() as ID
    for (const { parentId } of parentsOf(tree, current)) {
      if (parentId === ancestor) return true
      if (!seen.has(parentId)) {
        seen.add(parentId)
        stack.push(parentId)
      }
    }
  }
  return false
}
