import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import ServerPageClient from './ServerPageClient'

export default async function ServerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/')

  const { id } = await params

  return <ServerPageClient id={id} host={session.host} />
}
