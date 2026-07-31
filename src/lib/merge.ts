// Three-way, entity-level merge for concurrent edits.
//
// The whole tree is saved as one blob, so when two people edit at the same
// time the server rejects the later save (409) and hands back its current
// tree. This merge rebases the local edits onto that server state:
//
//   base   = the last state this client and the server agreed on
//   local  = base + this client's unsaved edits
//   server = what someone else saved in the meantime
//
// Members, partnerships and parentages all carry stable ids, so the merge is
// per-entity: start from the server's lists, then apply the local diff
// (adds/edits/removals relative to base) on top. Non-overlapping edits — the
// common case — combine losslessly; if both sides touched the SAME entity,
// the local version wins (entity-level last-writer, scoped to that one item).

import type { Tree } from '@shared/types'

interface Entity {
  id: string
}

function mergeLists<T extends Entity>(base: T[], local: T[], server: T[]): T[] {
  const baseById = new Map(base.map((x) => [x.id, x]))
  const localById = new Map(local.map((x) => [x.id, x]))
  const merged = new Map(server.map((x) => [x.id, x]))
  // Local removals: present in base, gone locally.
  for (const id of baseById.keys()) if (!localById.has(id)) merged.delete(id)
  // Local additions and edits: absent from base, or different from it.
  for (const [id, localItem] of localById) {
    const baseItem = baseById.get(id)
    if (!baseItem || JSON.stringify(baseItem) !== JSON.stringify(localItem)) {
      merged.set(id, localItem)
    }
  }
  return [...merged.values()]
}

/** Rebase local edits onto a newer server tree (see module comment). */
export function mergeTrees(base: Tree, local: Tree, server: Tree): Tree {
  return {
    members: mergeLists(base.members, local.members, server.members),
    partnerships: mergeLists(base.partnerships, local.partnerships, server.partnerships),
    parentages: mergeLists(base.parentages, local.parentages, server.parentages),
    // Carry the server's version so the retried save passes the version check.
    version: server.version,
    updatedAt: server.updatedAt,
  }
}
