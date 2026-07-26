// Generation assignment and presentation ordering, derived from a Tree.
//
// A member's generation is the LONGEST parentage path down to them, so a
// grandchild still sorts below its grandparent even when one branch records an
// intermediate generation the other leaves out.
//
// Partnerships then pull spouses onto a shared generation. Without that step
// someone who married in with no recorded parents lands in generation 0 and
// opens the presentation ahead of the elders they married into.

import type { ID, Member, Tree } from '@shared/types'
import { childrenOf, parentsOf } from './relationships'

/** Relaxation passes before we accept the current assignment. Generations only
 *  ever increase, so this terminates on its own; the cap is a guard against
 *  malformed data (a parentage cycle) rather than a normal exit. */
const MAX_PASSES = 20

/** Depth of every member, keyed by id. Roots (no recorded parents) are 0. */
export function computeGenerations(tree: Tree): Map<ID, number> {
  const gen = new Map<ID, number>()
  const visiting = new Set<ID>()

  // Longest path from any root, memoized.
  const depth = (id: ID): number => {
    const cached = gen.get(id)
    if (cached !== undefined) return cached
    if (visiting.has(id)) return 0 // defensive: only reachable via a cycle
    visiting.add(id)
    let d = 0
    for (const { parentId } of parentsOf(tree, id)) {
      d = Math.max(d, depth(parentId) + 1)
    }
    visiting.delete(id)
    gen.set(id, d)
    return d
  }

  for (const m of tree.members) depth(m.id)

  // Level spouses with each other, then re-assert that every child sits below
  // its parents (levelling a spouse up can violate that), until it settles.
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false

    for (const p of tree.partnerships) {
      const a = gen.get(p.a)
      const b = gen.get(p.b)
      if (a === undefined || b === undefined || a === b) continue
      const level = Math.max(a, b)
      gen.set(p.a, level)
      gen.set(p.b, level)
      changed = true
    }

    for (const pg of tree.parentages) {
      const parent = gen.get(pg.parent)
      const child = gen.get(pg.child)
      if (parent === undefined || child === undefined) continue
      if (child <= parent) {
        gen.set(pg.child, parent + 1)
        changed = true
      }
    }

    if (!changed) break
  }

  return gen
}

/** One member and the immediate family shown alongside them. */
export interface Slide {
  member: Member
  /** 0 = eldest recorded generation. */
  generation: number
  parents: Member[]
  children: Member[]
}

// Undated members sort after dated ones rather than reading as the eldest.
const UNDATED = '￿'

/**
 * Every member as a slide, ordered eldest generation first and, within a
 * generation, oldest first by birth date (undated last, then by name).
 */
export function buildSlides(tree: Tree): Slide[] {
  const gen = computeGenerations(tree)
  const byId = new Map(tree.members.map((m) => [m.id, m]))
  const resolve = (ids: ID[]): Member[] =>
    ids.map((id) => byId.get(id)).filter((m): m is Member => m !== undefined)

  return tree.members
    .slice()
    .sort((a, b) => {
      const ga = gen.get(a.id) ?? 0
      const gb = gen.get(b.id) ?? 0
      if (ga !== gb) return ga - gb
      const da = a.birthDate || UNDATED
      const db = b.birthDate || UNDATED
      if (da !== db) return da < db ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    .map((member) => ({
      member,
      generation: gen.get(member.id) ?? 0,
      parents: resolve(parentsOf(tree, member.id).map((p) => p.parentId)),
      children: resolve(childrenOf(tree, member.id).map((c) => c.childId)),
    }))
}

/** Count of distinct generations present, for "Generation 2 of 5" labels. */
export function generationCount(slides: Slide[]): number {
  return new Set(slides.map((s) => s.generation)).size
}
