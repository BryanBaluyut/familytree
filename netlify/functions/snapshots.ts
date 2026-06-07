import { isAuthenticated } from './lib/auth'
import { json, unauthorized } from './lib/http'
import { loadSnapshotIndex } from './lib/store'

// GET /api/snapshots -> available restore points, newest first.
export default async (req: Request): Promise<Response> => {
  if (!(await isAuthenticated(req))) return unauthorized()
  const index = await loadSnapshotIndex()
  return json([...index].reverse())
}
