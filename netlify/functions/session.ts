import { getSession } from './lib/auth'
import { json } from './lib/http'

// Lightweight check the app calls on load: is there a session, and who is it?
// Always 200; the body reports auth state and the editor's name (if set).
export default async (req: Request): Promise<Response> => {
  const session = await getSession(req)
  return json({ authed: session.authed, name: session.name ?? null })
}
