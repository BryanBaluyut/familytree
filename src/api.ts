// Thin client over the Netlify Functions API. All calls send the session
// cookie (same-origin) so the shared-password gate protects everything.

import type { ChangeLogEntry, SnapshotInfo, Tree } from '@shared/types'

/** Thrown when the server rejects a request for lack of a valid session. */
export class AuthError extends Error {
  constructor() {
    super('Not authenticated')
    this.name = 'AuthError'
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', ...init })
  if (res.status === 401) throw new AuthError()
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `${res.status} ${res.statusText}`)
  }
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) return (await res.json()) as T
  return undefined as T
}

export const api = {
  /** Current session: whether authed, and the editor's name (null if unset). */
  async session(): Promise<{ authed: boolean; name: string | null }> {
    return request<{ authed: boolean; name: string | null }>('/api/session')
  },

  /** Set the current editor's display name (stored in the session cookie). */
  async setIdentity(name: string): Promise<boolean> {
    const res = await fetch('/api/identity', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
      credentials: 'same-origin',
    })
    return res.ok
  },

  /** Exchange the shared password for a session cookie. Returns success. */
  async login(password: string): Promise<boolean> {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
      credentials: 'same-origin',
    })
    return res.ok
  },

  async logout(): Promise<void> {
    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' })
  },

  getTree(): Promise<Tree> {
    return request<Tree>('/api/tree')
  },

  async saveTree(tree: Tree): Promise<Tree> {
    const { tree: saved } = await request<{ ok: true; tree: Tree }>('/api/tree', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(tree),
    })
    return saved
  },

  /** Upload a portrait; returns its photoId to store on the member. */
  async uploadPhoto(file: File): Promise<string> {
    const { photoId } = await request<{ photoId: string }>('/api/photo', {
      method: 'POST',
      headers: { 'content-type': file.type || 'application/octet-stream' },
      body: file,
    })
    return photoId
  },

  /** URL to render a stored portrait in an <img>. */
  photoUrl(photoId: string): string {
    return `/api/photo?id=${encodeURIComponent(photoId)}`
  },

  async deletePhoto(photoId: string): Promise<void> {
    await request(`/api/photo?id=${encodeURIComponent(photoId)}`, { method: 'DELETE' })
  },

  getChangelog(): Promise<ChangeLogEntry[]> {
    return request<ChangeLogEntry[]>('/api/changelog')
  },

  getSnapshots(): Promise<SnapshotInfo[]> {
    return request<SnapshotInfo[]>('/api/snapshots')
  },

  /** Roll the tree back to a snapshot version; returns the new saved tree. */
  async restore(version: number): Promise<Tree> {
    const { tree } = await request<{ ok: true; tree: Tree }>('/api/restore', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version }),
    })
    return tree
  },
}
