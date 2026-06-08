import { getSession } from './lib/auth'
import { badRequest, json, methodNotAllowed, safeEqual, unauthorized } from './lib/http'
import { clearHistory } from './lib/store'

// POST /api/clear-history { password } — wipes the change log + restore points.
// Requires a valid session AND the admin password. Set FAMILYTREE_ADMIN_PASSWORD
// in Netlify to override the default (the default is visible in the repo).
export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return methodNotAllowed()
  if (!(await getSession(req)).authed) return unauthorized()

  let body: { password?: unknown }
  try {
    body = await req.json()
  } catch {
    return badRequest()
  }

  const admin = process.env.FAMILYTREE_ADMIN_PASSWORD || 'admin123'
  if (typeof body.password !== 'string' || !safeEqual(body.password, admin)) {
    return json({ error: 'forbidden' }, 403)
  }

  await clearHistory()
  return json({ ok: true })
}
