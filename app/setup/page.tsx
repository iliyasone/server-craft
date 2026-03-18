import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import SetupClient from './SetupClient'

export default async function SetupPage() {
  const session = await getSession()
  if (!session) redirect('/')

  return <SetupClient />
}
