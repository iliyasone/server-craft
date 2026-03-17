import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

export default async function ServersLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session) redirect('/')

  return (
    <div className="flex min-h-screen" style={{ background: '#20141f' }}>
      <Sidebar />
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  )
}
