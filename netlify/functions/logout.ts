import { clearSessionCookie } from './lib/auth'
import { json, methodNotAllowed } from './lib/http'

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return methodNotAllowed()
  return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie() })
}
