import { SignJWT, jwtVerify } from 'jose'

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'servercraft-secret-key-change-in-production'
)

export const COOKIE_NAME = 'session'

export interface SessionData {
  host: string
  username: string
  password: string
}

export async function createSessionToken(data: SessionData): Promise<string> {
  return new SignJWT({ ...data })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET)
}

export async function verifySessionToken(token: string | null | undefined): Promise<SessionData | null> {
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, SECRET)
    const { host, username, password } = payload as SessionData & Record<string, unknown>

    if (!host || !username || !password) return null

    return {
      host: host as string,
      username: username as string,
      password: password as string,
    }
  } catch {
    return null
  }
}

export function getCookieValue(cookieHeader: string | undefined, cookieName: string): string | null {
  if (!cookieHeader) return null

  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim()
    if (!trimmed.startsWith(`${cookieName}=`)) continue
    return decodeURIComponent(trimmed.slice(cookieName.length + 1))
  }

  return null
}

export async function getSessionFromCookieHeader(cookieHeader: string | undefined): Promise<SessionData | null> {
  return verifySessionToken(getCookieValue(cookieHeader, COOKIE_NAME))
}
