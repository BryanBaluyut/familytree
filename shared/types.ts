// Domain types shared by the React app (via the "@shared" alias) and the
// Netlify Functions (via a relative import). Keep this dependency-free.

export type ID = string

/** Status of a partnership between two adults. `separated` models an ex-spouse. */
export type PartnerStatus = 'married' | 'partner' | 'separated'

export interface Member {
  id: ID
  name: string
  /** Key into the photos blob store; resolve to a URL with api.photoUrl(). */
  photoId?: string
  /**
   * Manual left-to-right order of this member's partners, by partner id (index 0
   * = earliest = drawn furthest left). Stored per-person (not on the shared
   * partnership) so each person orders their own partners independently. Partners
   * not listed keep insertion order and sort after listed ones.
   */
  partnerOrder?: ID[]
}

/** A relationship between two adults. The two are interchangeable (a/b). */
export interface Partnership {
  id: ID
  a: ID
  b: ID
  status: PartnerStatus
}

/** A directed parent -> child link, deliberately separate from partnerships. */
export interface Parentage {
  id: ID
  parent: ID
  child: ID
  /**
   * Manual display order among a parent's children (lower = earlier/firstborn
   * = drawn further left). Set by drag-reordering; mirrored onto the co-parent's
   * matching parentages so both parents agree on sibling order.
   */
  order?: number
}

export interface Tree {
  members: Member[]
  partnerships: Partnership[]
  parentages: Parentage[]
  /** Bumped on every server-side save; used to adopt the latest state. */
  version: number
  /** ISO timestamp of the last save. */
  updatedAt?: string
}

export const emptyTree = (): Tree => ({
  members: [],
  partnerships: [],
  parentages: [],
  version: 0,
})

export const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  married: 'Married',
  partner: 'Partner',
  separated: 'Separated',
}

/** Statuses removed in the schema simplification, mapped to their closest survivor. */
const LEGACY_STATUS: Record<string, PartnerStatus> = {
  engaged: 'partner',
  divorced: 'separated',
  widowed: 'married',
}

/**
 * Upgrade a tree that may predate the simplified schema (stored blob, snapshot
 * restore, or an imported backup): collapse legacy partner statuses and drop
 * removed member/parentage fields (gender, birth/death dates, notes, parentage
 * type). Pure and idempotent; ids, photoIds and ordering fields pass through
 * untouched.
 */
export function normalizeTree(tree: Tree): Tree {
  return {
    ...tree,
    members: tree.members.map((m) => {
      const member: Member = { id: m.id, name: m.name }
      if (m.photoId) member.photoId = m.photoId
      if (m.partnerOrder) member.partnerOrder = m.partnerOrder
      return member
    }),
    partnerships: tree.partnerships.map((p) => ({
      id: p.id,
      a: p.a,
      b: p.b,
      status: LEGACY_STATUS[p.status] ?? p.status,
    })),
    parentages: tree.parentages.map((p) => {
      const parentage: Parentage = { id: p.id, parent: p.parent, child: p.child }
      if (p.order != null) parentage.order = p.order
      return parentage
    }),
  }
}

/** A single entry in the family-tree change log. */
export type ChangeAction =
  | 'add'
  | 'remove'
  | 'edit'
  | 'link'
  | 'unlink'
  | 'relink'
  | 'bulk'
  | 'restore'

export interface ChangeLogEntry {
  id: string
  /** ISO timestamp of the change. */
  at: string
  /** Display name of the person who made the change. */
  who: string
  action: ChangeAction
  /** Human-readable description, e.g. 'Added Maria Cruz'. */
  summary: string
  /** Member/relationship id this concerns (used to coalesce repeated edits). */
  targetId?: string
  /** Tree version produced by the save this entry belongs to (a restore point). */
  version?: number
}

/** Lightweight descriptor of a stored tree snapshot the user can restore. */
export interface SnapshotInfo {
  version: number
  at: string
  who: string
}
