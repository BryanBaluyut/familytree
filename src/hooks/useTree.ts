// The single source of truth for the loaded tree. Loads from the API, exposes
// mutation helpers, and autosaves (debounced + serialized) after every change.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ID, Member, ParentType, PartnerStatus, Tree } from '@shared/types'
import { emptyTree } from '@shared/types'
import { api, AuthError } from '../api'
import {
  addParentage,
  addPartnership,
  createMember,
  memberById,
  removeMember,
  removeParentage,
  removePartnership,
  updateParentage,
  updatePartnership,
  upsertMember,
} from '../lib/relationships'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export interface TreeStore {
  tree: Tree | null
  loading: boolean
  loadError: string | null
  saveStatus: SaveStatus
  reload: () => void
  addMember: (name: string) => Member | null
  updateMember: (member: Member) => void
  deleteMember: (id: ID) => void
  setPhoto: (id: ID, file: File) => Promise<void>
  clearPhoto: (id: ID) => Promise<void>
  linkPartner: (a: ID, b: ID, status?: PartnerStatus) => void
  setPartnerStatus: (partnershipId: ID, status: PartnerStatus) => void
  unlinkPartner: (partnershipId: ID) => void
  linkChild: (parent: ID, child: ID, type?: ParentType) => void
  linkParent: (child: ID, parent: ID, type?: ParentType) => void
  setParentageType: (parentageId: ID, type: ParentType) => void
  unlinkParentage: (parentageId: ID) => void
  replaceTree: (data: Pick<Tree, 'members' | 'partnerships' | 'parentages'>) => void
}

export function useTree(onUnauthorized: () => void): TreeStore {
  const [tree, setTree] = useState<Tree | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')

  // Refs mirror the latest values so callbacks never read stale state.
  const treeRef = useRef<Tree | null>(null)
  const dirty = useRef(false)
  // True once the user has made any local edit. After that, a late-resolving
  // reload (e.g. React StrictMode's second mount, or a slow initial GET) must
  // never overwrite local state.
  const edited = useRef(false)
  const saving = useRef(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onUnauth = useRef(onUnauthorized)
  onUnauth.current = onUnauthorized

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const loaded = await api.getTree()
      if (edited.current) return // never clobber local edits with a stale load
      treeRef.current = loaded
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

  // Persist the latest snapshot; serialized so saves never overlap.
  const flush = useCallback(async () => {
    if (saving.current) return
    saving.current = true
    try {
      while (dirty.current && treeRef.current) {
        dirty.current = false
        const snapshot = treeRef.current
        setSaveStatus('saving')
        try {
          const saved = await api.saveTree(snapshot)
          if (!dirty.current) {
            // No newer edit arrived while saving: adopt the server version.
            const merged: Tree = {
              ...snapshot,
              version: saved.version,
              updatedAt: saved.updatedAt,
            }
            treeRef.current = merged
            setTree(merged)
          }
        } catch (e) {
          if (e instanceof AuthError) {
            onUnauth.current()
            return
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

  const commit = useCallback(
    (next: Tree) => {
      treeRef.current = next
      setTree(next)
      dirty.current = true
      edited.current = true
      setSaveStatus('saving')
      if (debounce.current) clearTimeout(debounce.current)
      debounce.current = setTimeout(() => void flush(), 500)
    },
    [flush],
  )

  // Each mutation reads the freshest tree from the ref, applies a pure helper.
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

  const deleteMember = useCallback(
    (id: ID) => {
      const t = treeRef.current
      if (!t) return
      const member = memberById(t, id)
      if (member?.photoId) void api.deletePhoto(member.photoId).catch(() => {})
      commit(removeMember(t, id))
    },
    [commit],
  )

  const setPhoto = useCallback(
    async (id: ID, file: File) => {
      const before = treeRef.current
      if (!before) return
      const existing = memberById(before, id)
      if (!existing) return
      const photoId = await api.uploadPhoto(file)
      if (existing.photoId) void api.deletePhoto(existing.photoId).catch(() => {})
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
      if (!member) return
      if (member.photoId) void api.deletePhoto(member.photoId).catch(() => {})
      commit(upsertMember(t, { ...member, photoId: undefined }))
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
    (parent: ID, child: ID, type: ParentType = 'blood') => {
      const t = treeRef.current
      if (t) commit(addParentage(t, parent, child, type))
    },
    [commit],
  )

  const linkParent = useCallback(
    (child: ID, parent: ID, type: ParentType = 'blood') => {
      const t = treeRef.current
      if (t) commit(addParentage(t, parent, child, type))
    },
    [commit],
  )

  const setParentageType = useCallback(
    (parentageId: ID, type: ParentType) => {
      const t = treeRef.current
      if (t) commit(updateParentage(t, parentageId, { type }))
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

  const replaceTree = useCallback(
    (data: Pick<Tree, 'members' | 'partnerships' | 'parentages'>) => {
      const base = treeRef.current ?? emptyTree()
      commit({
        ...base,
        members: data.members,
        partnerships: data.partnerships,
        parentages: data.parentages,
      })
    },
    [commit],
  )

  return {
    tree,
    loading,
    loadError,
    saveStatus,
    reload,
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
    setParentageType,
    unlinkParentage,
    replaceTree,
  }
}
