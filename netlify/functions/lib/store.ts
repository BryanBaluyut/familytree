// Netlify Blobs access. The whole tree lives in one JSON blob; portrait images
// live in a separate store keyed by a generated photo id.

import { getStore } from '@netlify/blobs'
import type { ChangeLogEntry, SnapshotInfo, Tree } from '../../../shared/types'
import { emptyTree } from '../../../shared/types'

const TREE_KEY = 'tree'
const LOG_KEY = 'changelog'
const LOG_CAP = 500
const COALESCE_MS = 5 * 60 * 1000 // merge repeated edits to the same target within 5 min
const SNAP_INDEX_KEY = 'snapshots'
const SNAP_PREFIX = 'snapshot:'
const SNAP_CAP = 30 // keep the last N tree snapshots for restore

// Strong consistency so a read right after a write returns the new data
// (important when the same person edits from two devices).
const treeStore = () => getStore({ name: 'familytree', consistency: 'strong' })
const photoStore = () => getStore({ name: 'familytree-photos', consistency: 'strong' })

export async function loadTree(): Promise<Tree> {
  const data = (await treeStore().get(TREE_KEY, { type: 'json' })) as Tree | null
  return data ?? emptyTree()
}

export async function saveTree(tree: Tree): Promise<void> {
  await treeStore().setJSON(TREE_KEY, tree)
}

export async function savePhoto(id: string, data: ArrayBuffer, contentType: string): Promise<void> {
  await photoStore().set(id, data, { metadata: { contentType } })
}

export interface StoredPhoto {
  data: ArrayBuffer
  contentType: string
}

export async function loadPhoto(id: string): Promise<StoredPhoto | null> {
  const result = await photoStore().getWithMetadata(id, { type: 'arrayBuffer' })
  if (!result) return null
  const contentType = (result.metadata?.contentType as string) || 'application/octet-stream'
  return { data: result.data, contentType }
}

export async function deletePhoto(id: string): Promise<void> {
  await photoStore().delete(id)
}

export async function loadChangelog(): Promise<ChangeLogEntry[]> {
  const data = (await treeStore().get(LOG_KEY, { type: 'json' })) as ChangeLogEntry[] | null
  return Array.isArray(data) ? data : []
}

/** Append entries (oldest-first storage), coalescing rapid repeat edits, capped. */
export async function appendChangelog(entries: ChangeLogEntry[]): Promise<void> {
  if (entries.length === 0) return
  const log = await loadChangelog()
  for (const entry of entries) {
    const last = log[log.length - 1]
    const coalesce =
      last &&
      entry.action === 'edit' &&
      last.action === 'edit' &&
      last.who === entry.who &&
      last.targetId === entry.targetId &&
      Date.parse(entry.at) - Date.parse(last.at) < COALESCE_MS
    if (coalesce) {
      last.at = entry.at
      last.summary = entry.summary
    } else {
      log.push(entry)
    }
  }
  const trimmed = log.length > LOG_CAP ? log.slice(log.length - LOG_CAP) : log
  await treeStore().setJSON(LOG_KEY, trimmed)
}

export async function loadSnapshotIndex(): Promise<SnapshotInfo[]> {
  const data = (await treeStore().get(SNAP_INDEX_KEY, { type: 'json' })) as SnapshotInfo[] | null
  return Array.isArray(data) ? data : []
}

export async function loadSnapshot(version: number): Promise<Tree | null> {
  return (await treeStore().get(`${SNAP_PREFIX}${version}`, { type: 'json' })) as Tree | null
}

/** Persist a snapshot and update the index, pruning the oldest beyond the cap. */
export async function saveSnapshot(tree: Tree, info: SnapshotInfo): Promise<void> {
  await treeStore().setJSON(`${SNAP_PREFIX}${info.version}`, tree)
  const index = await loadSnapshotIndex()
  index.push(info)
  while (index.length > SNAP_CAP) {
    const oldest = index.shift()
    if (oldest) await treeStore().delete(`${SNAP_PREFIX}${oldest.version}`).catch(() => {})
  }
  await treeStore().setJSON(SNAP_INDEX_KEY, index)
}
