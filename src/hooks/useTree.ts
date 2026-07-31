// The single source of truth for the loaded tree. Loads from the API, exposes
// mutation helpers, autosaves (debounced + serialized), and keeps an in-session
// undo/redo history of whole-tree snapshots. Server-side snapshots power
// restore-from-history (see restore()).

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ID, Member, PartnerStatus, Tree } from '@shared/types'
import { emptyTree, normalizeTree } from '@shared/types'
import { api, AuthError, ConflictError } from '../api'
import { mergeTrees } from '../lib/merge'
import {
  addParentage,
  addPartnership,
  createMember,
  memberById,
  removeMember,
  removeParentage,
  removePartnership,
  reorderChildren,
  reorderPartners,
  updatePartnership,
  upsertMember,
} from '../lib/relationships'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const HISTORY_CAP = 50
const COALESCE_MS = 700 // collapse rapid edits (e.g. typing a name) into one undo step

export interface TreeStore {
  tree: Tree | null
  loading: boolean
  loadError: string | null
  saveStatus: SaveStatus
  canUndo: boolean
  canRedo: boolean
  reload: () => void
  undo: () => void
  redo: () => void
  restore: (version: number) => Promise<void>
  addMember: (name: string) => Member | null
  updateMember: (member: Member) => void
  deleteMember: (id: ID) => void
  setPhoto: (id: ID, file: File) => Promise<void>
  clearPhoto: (id: ID) => Promise<void>
  linkPartner: (a: ID, b: ID, status?: PartnerStatus) => void
  setPartnerStatus: (partnershipId: ID, status: PartnerStatus) => void
  unlinkPartner: (partnershipId: ID) => void
  linkChild: (parent: ID, child: ID) => void
  linkParent: (child: ID, parent: ID) => void
  unlinkParentage: (parentageId: ID) => void
  reorderPartners: (memberId: ID, orderedPartnerIds: ID[]) => void
  reorderChildren: (parentId: ID, orderedChildIds: ID[]) => void
  replaceTree: (data: Pick<Tree, 'members' | 'partnerships' | 'parentages'>) => void
}

export function useTree(onUnauthorized: () => void): TreeStore {
  const [tree, setTree] = useState<Tree | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  // Refs mirror the latest values so callbacks never read stale state.
  const treeRef = useRef<Tree | null>(null)
  // Last server-acknowledged state: the merge base when a save conflicts.
  const baseRef = useRef<Tree | null>(null)
  const dirty = useRef(false)
  // True once the user has made any local edit; afterwards a late-resolving
  // reload (React StrictMode's second mount, a slow GET) must not overwrite it.
  const edited = useRef(false)
  const saving = useRef(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onUnauth = useRef(onUnauthorized)
  onUnauth.current = onUnauthorized

  const undoStack = useRef<Tree[]>([])
  const redoStack = useRef<Tree[]>([])
  const lastEditAt = useRef(0)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const loaded = await api.getTree()
      if (edited.current) return // never clobber local edits with a stale load
      treeRef.current = loaded
      baseRef.current = loaded
      setTree(loaded)
      setLoadError(null)
    } catch (e) {
      if (e instanceof AuthError) onUnauth.current()
      else setLoadError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  // When the tab regains focus and nothing is unsaved here, quietly adopt any
  // newer tree another editor saved in the meantime, so open tabs don't drift
  // (and don't run their next edit into a conflict).
  useEffect(() => {
    let checking = false
    const check = async () => {
      if (checking || document.visibilityState === 'hidden') return
      if (dirty.current || saving.current) return
      checking = true
      try {
        const latest = await api.getTree()
        const current = treeRef.current
        // re-check: an edit may have started while the request was in flight
        if (!dirty.current && !saving.current && current && latest.version > current.version) {
          baseRef.current = latest
          treeRef.current = latest
          setTree(latest)
        }
      } catch {
        /* offline or logged out — the next save/load surfaces it */
      } finally {
        checking = false
      }
    }
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])

  // Persist the latest snapshot; serialized so saves never overlap.
  const flush = useCallback(async () => {
    if (saving.current) return
    saving.current = true
    let conflictRetries = 0
    try {
      while (dirty.current && treeRef.current) {
        dirty.current = false
        const snapshot = treeRef.current
        setSaveStatus('saving')
        try {
          const saved = await api.saveTree(snapshot)
          baseRef.current = saved
          if (!dirty.current) {
            const merged: Tree = { ...snapshot, version: saved.version, updatedAt: saved.updatedAt }
            treeRef.current = merged
            setTree(merged)
          }
        } catch (e) {
          if (e instanceof AuthError) {
            onUnauth.current()
            return
          }
          if (e instanceof ConflictError && conflictRetries < 3) {
            // Someone else saved first. Rebase our edits onto their tree and
            // retry — their work and ours both survive.
            conflictRetries++
            const merged = mergeTrees(baseRef.current ?? snapshot, snapshot, e.serverTree)
            baseRef.current = e.serverTree
            treeRef.current = merged
            setTree(merged)
            dirty.current = true
            continue
          }
          setSaveStatus('error')
          return
        }
      }
      setSaveStatus('saved')
    } finally {
      saving.current = false
    }
  }, [])

  const syncHistoryFlags = useCallback(() => {
    setCanUndo(undoStack.current.length > 0)
    setCanRedo(redoStack.current.length > 0)
  }, [])

  const scheduleSave = useCallback(() => {
    dirty.current = true
    setSaveStatus('saving')
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => void flush(), 500)
  }, [flush])

  /**
   * Apply a new whole-tree state.
   * - record: push the previous state onto the undo stack (clearing redo).
   * - save:   persist to the server (skip when the server already saved it).
   */
  const applyTree = useCallback(
    (next: Tree, record: boolean, save: boolean) => {
      if (record) {
        const now = Date.now()
        const coalesce = now - lastEditAt.current < COALESCE_MS
        lastEditAt.current = now
        if (!coalesce && treeRef.current) {
          undoStack.current.push(treeRef.current)
          if (undoStack.current.length > HISTORY_CAP) undoStack.current.shift()
        }
        redoStack.current = []
        syncHistoryFlags()
      }
      treeRef.current = next
      setTree(next)
      edited.current = true
      if (save) scheduleSave()
    },
    [scheduleSave, syncHistoryFlags],
  )

  const commit = useCallback((next: Tree) => applyTree(next, true, true), [applyTree])

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return
    const prev = undoStack.current.pop() as Tree
    if (treeRef.current) {
      redoStack.current.push(treeRef.current)
      if (redoStack.current.length > HISTORY_CAP) redoStack.current.shift()
    }
    lastEditAt.current = 0 // break edit-coalescing across an undo
    syncHistoryFlags()
    applyTree(prev, false, true)
  }, [applyTree, syncHistoryFlags])

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return
    const next = redoStack.current.pop() as Tree
    if (treeRef.current) {
      undoStack.current.push(treeRef.current)
      if (undoStack.current.length > HISTORY_CAP) undoStack.current.shift()
    }
    lastEditAt.current = 0
    syncHistoryFlags()
    applyTree(next, false, true)
  }, [applyTree, syncHistoryFlags])

  const restore = useCallback(
    async (version: number) => {
      const restored = await api.restore(version) // already saved server-side
      baseRef.current = restored
      if (treeRef.current) {
        undoStack.current.push(treeRef.current)
        if (undoStack.current.length > HISTORY_CAP) undoStack.current.shift()
      }
      redoStack.current = []
      lastEditAt.current = 0
      syncHistoryFlags()
      applyTree(restored, false, false)
    },
    [applyTree, syncHistoryFlags],
  )

  // --- mutations: read the freshest tree from the ref, apply a pure helper ---

  const addMember = useCallback(
    (name: string): Member | null => {
      const t = treeRef.current
      if (!t) return null
      const member = createMember(name)
      commit(upsertMember(t, member))
      return member
    },
    [commit],
  )

  const updateMember = useCallback(
    (member: Member) => {
      const t = treeRef.current
      if (t) commit(upsertMember(t, member))
    },
    [commit],
  )

  // Note: we intentionally do NOT delete the photo blob here, so undo/restore
  // can bring the picture back. Orphaned photos are harmless.
  const deleteMember = useCallback(
    (id: ID) => {
      const t = treeRef.current
      if (t) commit(removeMember(t, id))
    },
    [commit],
  )

  const setPhoto = useCallback(
    async (id: ID, file: File) => {
      const before = treeRef.current
      if (!before || !memberById(before, id)) return
      const photoId = await api.uploadPhoto(file)
      const after = treeRef.current
      const current = after && memberById(after, id)
      if (after && current) commit(upsertMember(after, { ...current, photoId }))
    },
    [commit],
  )

  const clearPhoto = useCallback(
    async (id: ID) => {
      const t = treeRef.current
      if (!t) return
      const member = memberById(t, id)
      if (member) commit(upsertMember(t, { ...member, photoId: undefined }))
    },
    [commit],
  )

  const linkPartner = useCallback(
    (a: ID, b: ID, status: PartnerStatus = 'married') => {
      const t = treeRef.current
      if (t) commit(addPartnership(t, a, b, status))
    },
    [commit],
  )

  const setPartnerStatus = useCallback(
    (partnershipId: ID, status: PartnerStatus) => {
      const t = treeRef.current
      if (t) commit(updatePartnership(t, partnershipId, { status }))
    },
    [commit],
  )

  const unlinkPartner = useCallback(
    (partnershipId: ID) => {
      const t = treeRef.current
      if (t) commit(removePartnership(t, partnershipId))
    },
    [commit],
  )

  const linkChild = useCallback(
    (parent: ID, child: ID) => {
      const t = treeRef.current
      if (t) commit(addParentage(t, parent, child))
    },
    [commit],
  )

  const linkParent = useCallback(
    (child: ID, parent: ID) => {
      const t = treeRef.current
      if (t) commit(addParentage(t, parent, child))
    },
    [commit],
  )

  const unlinkParentage = useCallback(
    (parentageId: ID) => {
      const t = treeRef.current
      if (t) commit(removeParentage(t, parentageId))
    },
    [commit],
  )

  const reorderPartnersCb = useCallback(
    (memberId: ID, orderedPartnerIds: ID[]) => {
      const t = treeRef.current
      if (t) commit(reorderPartners(t, memberId, orderedPartnerIds))
    },
    [commit],
  )

  const reorderChildrenCb = useCallback(
    (parentId: ID, orderedChildIds: ID[]) => {
      const t = treeRef.current
      if (t) commit(reorderChildren(t, parentId, orderedChildIds))
    },
    [commit],
  )

  const replaceTree = useCallback(
    (data: Pick<Tree, 'members' | 'partnerships' | 'parentages'>) => {
      const base = treeRef.current ?? emptyTree()
      // normalize: an imported backup file may predate the simplified schema
      commit(
        normalizeTree({
          ...base,
          members: data.members,
          partnerships: data.partnerships,
          parentages: data.parentages,
        }),
      )
    },
    [commit],
  )

  return {
    tree,
    loading,
    loadError,
    saveStatus,
    canUndo,
    canRedo,
    reload,
    undo,
    redo,
    restore,
    addMember,
    updateMember,
    deleteMember,
    setPhoto,
    clearPhoto,
    linkPartner,
    setPartnerStatus,
    unlinkPartner,
    linkChild,
    linkParent,
    unlinkParentage,
    reorderPartners: reorderPartnersCb,
    reorderChildren: reorderChildrenCb,
    replaceTree,
  }
}
