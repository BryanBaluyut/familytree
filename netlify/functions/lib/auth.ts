// Shared-password session auth using a signed, HttpOnly cookie.
//
// The user posts the shared password to /api/login. If it matches
// FAMILYTREE_PASSWORD, we issue a cookie holding `<payload>.<hmac>` where the
// HMAC is signed with FAMILYTREE_SECRET. The payload also carries the editor's
// display name (set later via /api/identity) so changes can be attributed.
// Because it's a cookie (not a header), <img src="/api/photo?id=..">
// is authenticated automatically.

import { safeEqual } from './http'

const COOKIE_NAME = 'ft_session'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 days

const encoder = new TextEncoder()
const decoder = new TextDecoder()

interface Payload {
  exp: number
  name?: string
}

function bytesToB64url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const strToB64url = (value: string) => bytesToB64url(encoder.encode(value))
const b64urlToStr = (value: string) => decoder.decode(b64urlToBytes(value))

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  return bytesToB64url(new Uint8Array(signature))
}

export async function createToken(secret: string, name?: string): Promise<string> {
  const body: Payload = { exp: Date.now() + MAX_AGE_SECONDS * 1000 }
  if (name) body.name = name
  const payload = strToB64url(JSON.stringify(body))
  const signature = await hmac(secret, payload)
  return `${payload}.${signature}`
}

async function verify(token: string, secret: string): Promise<Payload | null> {
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return null
  const expected = await hmac(secret, payload)
  if (!safeEqual(signature, expected)) return null
  try {
    const data = JSON.parse(b64urlToStr(payload)) as Payload
    if (typeof data.exp !== 'number' || data.exp <= Date.now()) return null
    return data
  } catch {
    return null
  }
}

function readCookie(req: Request): string | null {
  const header = req.headers.get('cookie') ?? ''
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === COOKIE_NAME) return rest.join('=')
  }
  return null
}

/** Cookie attributes. Omit Secure under `netlify dev` so http://localhost works. */
function cookieAttrs(maxAge: number): string {
  const secure = process.env.NETLIFY_DEV ? '' : ' Secure;'
  return ` HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=${maxAge}`
}

export function sessionCookie(token: string): string {
  return `${COOKIE_NAME}=${token};${cookieAttrs(MAX_AGE_SECONDS)}`
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=;${cookieAttrs(0)}`
}

export interface Session {
  authed: boolean
  name?: string
}

/** Parse and verify the session cookie, returning auth state and editor name. */
export async function getSession(req: Request): Promise<Session> {
  const secret = process.env.FAMILYTREE_SECRET
  if (!secret) return { authed: false }
  const token = readCookie(req)
  if (!token) return { authed: false }
  const payload = await verify(token, secret)
  if (!payload) return { authed: false }
  return { authed: true, name: payload.name }
}

/** Convenience: true when the request carries a valid, unexpired session. */
export async function isAuthenticated(req: Request): Promise<boolean> {
  return (await getSession(req)).authed
}
