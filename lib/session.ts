import { cookies } from 'next/headers'
import {
  COOKIE_NAME,
  type SessionData,
  createSessionToken,
  verifySessionToken,
} from './session-core'

export type { SessionData } from './session-core'

export async function createSession(data: SessionData): Promise<string> {
  return createSessionToken(data)
}

export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies()
  return verifySessionToken(cookieStore.get(COOKIE_NAME)?.value)
}

export { COOKIE_NAME }
