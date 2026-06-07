// Small helpers for building JSON responses from v2 Netlify Functions.

export function json(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  })
}

export const ok = (data: unknown = { ok: true }) => json(data, 200)
export const unauthorized = () => json({ error: 'unauthorized' }, 401)
export const badRequest = (message = 'bad request') => json({ error: message }, 400)
export const notFound = (message = 'not found') => json({ error: message }, 404)
export const methodNotAllowed = () => json({ error: 'method not allowed' }, 405)
export const serverError = (message = 'server error') => json({ error: message }, 500)

/** Constant-time-ish string comparison to avoid leaking via timing. */
export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  if (ab.length !== bb.length) return false
  let diff = 0
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i]
  return diff === 0
}
