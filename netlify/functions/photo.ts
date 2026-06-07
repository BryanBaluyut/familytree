import { isAuthenticated } from './lib/auth'
import { badRequest, json, methodNotAllowed, notFound, unauthorized } from './lib/http'
import { deletePhoto, loadPhoto, savePhoto } from './lib/store'

const MAX_BYTES = 8 * 1024 * 1024 // 8 MB per portrait

export default async (req: Request): Promise<Response> => {
  if (!(await isAuthenticated(req))) return unauthorized()

  // POST /api/photo  (raw image bytes as the body) -> { photoId }
  if (req.method === 'POST') {
    const contentType = req.headers.get('content-type') || 'application/octet-stream'
    if (!contentType.startsWith('image/')) return badRequest('expected an image')
    const data = await req.arrayBuffer()
    if (data.byteLength === 0) return badRequest('empty body')
    if (data.byteLength > MAX_BYTES) return json({ error: 'image too large' }, 413)
    const id = crypto.randomUUID()
    await savePhoto(id, data, contentType)
    return json({ photoId: id })
  }

  // GET /api/photo?id=...  -> the image bytes
  if (req.method === 'GET') {
    const id = new URL(req.url).searchParams.get('id')
    if (!id) return badRequest('missing id')
    const photo = await loadPhoto(id)
    if (!photo) return notFound()
    return new Response(photo.data, {
      status: 200,
      headers: {
        'content-type': photo.contentType,
        'cache-control': 'private, max-age=3600',
      },
    })
  }

  // DELETE /api/photo?id=...
  if (req.method === 'DELETE') {
    const id = new URL(req.url).searchParams.get('id')
    if (!id) return badRequest('missing id')
    await deletePhoto(id)
    return json({ ok: true })
  }

  return methodNotAllowed()
}
