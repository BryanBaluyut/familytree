import { isAuthenticated } from './lib/auth'
import { badRequest, json, methodNotAllowed, unauthorized } from './lib/http'
import { loadTree, saveTree } from './lib/store'
import type { Tree } from '../../shared/types'

export default async (req: Request): Promise<Response> => {
  if (!(await isAuthenticated(req))) return unauthorized()

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
    return json({ ok: true, tree: next })
  }

  return methodNotAllowed()
}
