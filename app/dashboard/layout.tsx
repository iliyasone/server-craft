import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import AppLayout from '@/components/AppLayout'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session) redirect('/')

  return <AppLayout mainOverflow="auto">{children}</AppLayout>
}
