import { createToken, getSession, sessionCookie } from './lib/auth'
import { badRequest, json, methodNotAllowed, serverError, unauthorized } from './lib/http'

// Sets the current editor's display name by re-issuing the session cookie with
// the name embedded. Requires an already-valid (password) session.
export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return methodNotAllowed()
  if (!(await getSession(req)).authed) return unauthorized()

  const secret = process.env.FAMILYTREE_SECRET
  if (!secret) return serverError('FAMILYTREE_SECRET is not configured')

  let body: { name?: unknown }
  try {
    body = await req.json()
  } catch {
    return badRequest()
  }
  if (typeof body.name !== 'string' || !body.name.trim()) {
    return badRequest('a name is required')
  }
  const name = body.name.trim().slice(0, 80)
  const token = await createToken(secret, name)
  return json({ ok: true, name }, 200, { 'set-cookie': sessionCookie(token) })
}
