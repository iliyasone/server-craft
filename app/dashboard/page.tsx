import { getSession } from '@/lib/session'
import { getSSHClient } from '@/lib/ssh'
import { listServers } from '@/lib/servers'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/')

  try {
    const client = await getSSHClient(session.host, session.username, session.password)
    const servers = await listServers(client)

    if (servers.length > 0) {
      redirect(`/servers/${servers[0].id}`)
    }

    // Show empty state
    return (
      <div
        className="flex flex-col items-center justify-center min-h-screen"
        style={{ color: 'white' }}
      >
        <div
          style={{
            background: '#300a2e',
            border: '1px solid #fd87f6',
            borderRadius: '24px',
            padding: '48px',
            textAlign: 'center',
            maxWidth: '480px',
          }}
        >
          <div style={{ fontSize: '64px', marginBottom: '16px' }}>⛏️</div>
          <h2 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '12px' }}>
            No servers yet
          </h2>
          <p style={{ color: '#876f86', marginBottom: '32px', lineHeight: 1.6 }}>
            Create your first Minecraft server to get started. You can upload a JAR file
            and start managing it right here.
          </p>
          <Link
            href="/dashboard"
            style={{
              background: '#22c55e',
              color: 'white',
              padding: '12px 32px',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: '700',
              fontSize: '16px',
            }}
          >
            + Create your first server
          </Link>
        </div>
      </div>
    )
  } catch {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-screen"
        style={{ color: 'white' }}
      >
        <div
          style={{
            background: '#300a2e',
            border: '1px solid #f87171',
            borderRadius: '24px',
            padding: '48px',
            textAlign: 'center',
          }}
        >
          <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '12px' }}>
            Connection Error
          </h2>
          <p style={{ color: '#876f86' }}>
            Could not connect to your server. Please check your SSH credentials.
          </p>
          <Link
            href="/"
            style={{
              display: 'inline-block',
              marginTop: '24px',
              color: '#fd87f6',
              textDecoration: 'underline',
            }}
          >
            Back to Login
          </Link>
        </div>
      </div>
    )
  }
}
