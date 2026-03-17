import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import RootTerminalClient from './RootTerminalClient'

export default async function TerminalPage() {
  const session = await getSession()
  if (!session) redirect('/')

  return <RootTerminalClient username={session.username} />
}
