import { getSession } from './lib/auth'
import { badRequest, json, methodNotAllowed, notFound, unauthorized } from './lib/http'
import { appendChangelog, loadSnapshot, loadTree, saveSnapshot, saveTree } from './lib/store'
import type { ChangeLogEntry, Tree } from '../../shared/types'

// POST /api/restore { version } -> roll the tree back to that snapshot as a new
// version. The restore is itself a logged change (and snapshotted), so it can be
// undone like any other.
export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return methodNotAllowed()
  const session = await getSession(req)
  if (!session.authed) return unauthorized()

  let body: { version?: unknown }
  try {
    body = await req.json()
  } catch {
    return badRequest()
  }
  const version = Number(body.version)
  if (!Number.isFinite(version)) return badRequest('version required')

  const snap = await loadSnapshot(version)
  if (!snap) return notFound('that restore point is no longer available')

  const current = await loadTree()
  const at = new Date().toISOString()
  const next: Tree = {
    members: snap.members,
    partnerships: snap.partnerships,
    parentages: snap.parentages,
    version: current.version + 1,
    updatedAt: at,
  }
  await saveTree(next)

  try {
    const who = session.name || 'Someone'
    const from = snap.updatedAt ? snap.updatedAt.slice(0, 10) : `version ${version}`
    const entry: ChangeLogEntry = {
      id: crypto.randomUUID(),
      at,
      who,
      action: 'restore',
      summary: `Restored the tree to its state from ${from}`,
      version: next.version,
    }
    await appendChangelog([entry])
    await saveSnapshot(next, { version: next.version, at, who })
  } catch (e) {
    console.error('restore log/snapshot failed', e)
  }

  return json({ ok: true, tree: next })
}
