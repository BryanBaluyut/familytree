import { isAuthenticated } from './lib/auth'
import { json, unauthorized } from './lib/http'
import { loadChangelog } from './lib/store'

// GET /api/changelog?limit=200 -> recent entries, newest first.
export default async (req: Request): Promise<Response> => {
  if (!(await isAuthenticated(req))) return unauthorized()
  const limitParam = Number(new URL(req.url).searchParams.get('limit'))
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 200
  const log = await loadChangelog()
  return json(log.slice(-limit).reverse())
}
