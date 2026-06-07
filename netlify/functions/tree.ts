import { getSession } from './lib/auth'
import { computeChanges } from './lib/diff'
import { badRequest, json, methodNotAllowed, unauthorized } from './lib/http'
import { appendChangelog, loadTree, saveTree } from './lib/store'
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

    // Record who changed what. Never let logging failures break the save.
    try {
      const who = session.name || 'Someone'
      const changes = computeChanges(current, next, who, next.updatedAt as string, () =>
        crypto.randomUUID(),
      )
      await appendChangelog(changes)
    } catch (e) {
      console.error('changelog update failed', e)
    }

    return json({ ok: true, tree: next })
  }

  return methodNotAllowed()
}
