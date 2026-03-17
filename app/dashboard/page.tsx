import { getSession } from '@/lib/session'
import { getSSHClient } from '@/lib/ssh'
import { listServers } from '@/lib/servers'
import { redirect } from 'next/navigation'
import DashboardEmpty from '@/components/DashboardEmpty'

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/')

  const client = await getSSHClient(session.host, session.username, session.password)
  const servers = await listServers(client)

  if (servers.length > 0) {
    redirect(`/servers/${servers[0].id}`)
  }

  return <DashboardEmpty />
}
