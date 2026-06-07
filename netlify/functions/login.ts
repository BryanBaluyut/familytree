import { createToken, sessionCookie } from './lib/auth'
import { badRequest, json, methodNotAllowed, safeEqual, serverError } from './lib/http'

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return methodNotAllowed()

  const password = process.env.FAMILYTREE_PASSWORD
  const secret = process.env.FAMILYTREE_SECRET
  if (!password || !secret) {
    return serverError('FAMILYTREE_PASSWORD / FAMILYTREE_SECRET are not configured')
  }

  let body: { password?: unknown }
  try {
    body = await req.json()
  } catch {
    return badRequest()
  }

  if (typeof body.password !== 'string' || !safeEqual(body.password, password)) {
    return json({ ok: false }, 401)
  }

  const token = await createToken(secret)
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie(token) })
}
