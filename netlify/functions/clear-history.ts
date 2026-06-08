import { getSession } from './lib/auth'
import {
  badRequest,
  json,
  methodNotAllowed,
  safeEqual,
  serverError,
  unauthorized,
} from './lib/http'
import { clearHistory } from './lib/store'

// POST /api/clear-history { password } — wipes the change log + restore points.
// Requires a valid session AND the admin password, set via the
// FAMILYTREE_ADMIN_PASSWORD environment variable (no default; never in the repo).
export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return methodNotAllowed()
  if (!(await getSession(req)).authed) return unauthorized()

  let body: { password?: unknown }
  try {
    body = await req.json()
  } catch {
    return badRequest()
  }

  const admin = process.env.FAMILYTREE_ADMIN_PASSWORD
  if (!admin) return serverError('FAMILYTREE_ADMIN_PASSWORD is not configured')
  if (typeof body.password !== 'string' || !safeEqual(body.password, admin)) {
    return json({ error: 'forbidden' }, 403)
  }

  await clearHistory()
  return json({ ok: true })
}
