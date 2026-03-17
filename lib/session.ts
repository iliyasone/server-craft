import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'servercraft-secret-key-change-in-production'
)

const COOKIE_NAME = 'session'

export interface SessionData {
  host: string
  username: string
  password: string
}

export async function createSession(data: SessionData): Promise<string> {
  const token = await new SignJWT({ ...data })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET)
  return token
}

export async function getSession(): Promise<SessionData | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return null

    const { payload } = await jwtVerify(token, SECRET)
    const { host, username, password } = payload as SessionData & Record<string, unknown>

    if (!host || !username || !password) return null

    return { host: host as string, username: username as string, password: password as string }
  } catch {
    return null
  }
}

export { COOKIE_NAME }
