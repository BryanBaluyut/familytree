import { isAuthenticated } from './lib/auth'
import { json } from './lib/http'

// Lightweight check the app calls on load to decide whether to show the
// password gate. Always 200; the body reports the auth state.
export default async (req: Request): Promise<Response> => {
  return json({ authed: await isAuthenticated(req) })
}
