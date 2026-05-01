import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import AppLayout from '@/components/AppLayout'

export default async function ServersLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session) redirect('/')

  return <AppLayout>{children}</AppLayout>
}
