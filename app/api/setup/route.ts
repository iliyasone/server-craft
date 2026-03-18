import { NextRequest } from 'next/server'
import { getSession } from '@/lib/session'
import { getSSHClient, execCommand } from '@/lib/ssh'

export async function GET(_request: NextRequest) {
  const session = await getSession()
  if (!session) return new Response('Unauthorized', { status: 401 })

  const encoder = new TextEncoder()

  function send(controller: ReadableStreamDefaultController, step: string, status: 'checking' | 'installing' | 'done' | 'skip', detail?: string) {
    const msg = `data: ${JSON.stringify({ step, status, detail })}\n\n`
    controller.enqueue(encoder.encode(msg))
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const client = await getSSHClient(session.host, session.username, session.password)

        // Step 1: Create servers directory
        send(controller, 'directory', 'checking', 'Checking /home/server-craft...')
        await execCommand(client, 'mkdir -p /home/server-craft')
        send(controller, 'directory', 'done', '/home/server-craft ready')

        // Step 2: Check & install tmux
        send(controller, 'tmux', 'checking', 'Checking tmux...')
        const { code: tmuxCode } = await execCommand(client, 'which tmux >/dev/null 2>&1 && echo ok')
        if (tmuxCode !== 0) {
          send(controller, 'tmux', 'installing', 'Installing tmux...')
          await execCommand(client,
            '(apt-get update -qq && apt-get install -y -qq tmux 2>/dev/null || ' +
            'yum install -y tmux 2>/dev/null || ' +
            'apk add tmux 2>/dev/null) 2>&1'
          )
          const { stdout: verify } = await execCommand(client, 'which tmux 2>/dev/null')
          if (verify.trim()) {
            send(controller, 'tmux', 'done', 'tmux installed')
          } else {
            send(controller, 'tmux', 'done', 'tmux installation failed — terminal persistence may not work')
          }
        } else {
          send(controller, 'tmux', 'skip', 'tmux already installed')
        }

        // Step 3: Check & install Java
        send(controller, 'java', 'checking', 'Checking Java...')
        const { stdout: javaCheck } = await execCommand(client, 'java -version 2>&1 | head -1')
        if (javaCheck.includes('version') || javaCheck.includes('openjdk')) {
          send(controller, 'java', 'skip', `Java found: ${javaCheck.trim()}`)
        } else {
          send(controller, 'java', 'installing', 'Installing Java (this may take a minute)...')
          // Detect distro and install
          const { stdout: distro } = await execCommand(client, 'cat /etc/os-release 2>/dev/null | head -5')
          let installCmd: string
          if (distro.includes('debian') || distro.includes('ubuntu') || distro.includes('Ubuntu') || distro.includes('Debian')) {
            installCmd = 'apt-get update -qq && apt-get install -y -qq default-jre-headless 2>&1 | tail -5'
          } else if (distro.includes('alpine') || distro.includes('Alpine')) {
            installCmd = 'apk add --no-cache openjdk17-jre-headless 2>&1 | tail -5'
          } else {
            // RHEL / CentOS / Fedora / generic
            installCmd = 'yum install -y java-17-openjdk-headless 2>&1 | tail -5 || dnf install -y java-17-openjdk-headless 2>&1 | tail -5'
          }
          const { stdout: installOut } = await execCommand(client, installCmd)
          send(controller, 'java', 'installing', installOut.trim().split('\n').pop() || 'Installing...')

          // Verify
          const { stdout: verifyJava } = await execCommand(client, 'java -version 2>&1 | head -1')
          if (verifyJava.includes('version') || verifyJava.includes('openjdk')) {
            send(controller, 'java', 'done', `Java installed: ${verifyJava.trim()}`)
          } else {
            send(controller, 'java', 'done', 'Java installation failed — server start requires Java')
          }
        }

        // Done
        send(controller, 'complete', 'done', 'Setup complete')
        controller.close()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Setup failed'
        send(controller, 'error', 'done', msg)
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
