import { NextRequest, NextResponse } from 'next/server'
import { createSession, COOKIE_NAME } from '@/lib/session'
import { getSSHClient } from '@/lib/ssh'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { host, username, password } = body as {
      host: string
      username: string
      password: string
    }

    if (!host || !username || !password) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 })
    }

    // Validate SSH connection
    await getSSHClient(host, username, password)

    // Create session token
    const token = await createSession({ host, username, password })

    const response = NextResponse.json({ ok: true })
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    })

    return response
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Connection failed'
    return NextResponse.json({ error: message }, { status: 401 })
  }
}
