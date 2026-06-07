import { getSession } from './lib/auth'
import { computeChanges } from './lib/diff'
import { badRequest, json, methodNotAllowed, unauthorized } from './lib/http'
import { appendChangelog, loadTree, saveSnapshot, saveTree } from './lib/store'
import type { Tree } from '../../shared/types'

export default async (req: Request): Promise<Response> => {
  const session = await getSession(req)
  if (!session.authed) return unauthorized()

  if (req.method === 'GET') {
    return json(await loadTree())
  }

  if (req.method === 'PUT') {
    let body: Tree
    try {
      body = (await req.json()) as Tree
    } catch {
      return badRequest()
    }
    if (
      !body ||
      !Array.isArray(body.members) ||
      !Array.isArray(body.partnerships) ||
      !Array.isArray(body.parentages)
    ) {
      return badRequest('invalid tree shape')
    }

    // Server owns the version number (monotonic) and the save timestamp.
    const current = await loadTree()
    const next: Tree = {
      members: body.members,
      partnerships: body.partnerships,
      parentages: body.parentages,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    }
    await saveTree(next)

    // Record who changed what + keep a restore snapshot. Never let this break the save.
    try {
      const who = session.name || 'Someone'
      const at = next.updatedAt as string
      const changes = computeChanges(current, next, who, at, next.version, () =>
        crypto.randomUUID(),
      )
      await appendChangelog(changes)
      await saveSnapshot(next, { version: next.version, at, who })
    } catch (e) {
      console.error('changelog/snapshot update failed', e)
    }

    return json({ ok: true, tree: next })
  }

  return methodNotAllowed()
}
