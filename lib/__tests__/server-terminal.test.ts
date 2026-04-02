import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildEnsureServerSessionCommand,
  buildTmuxSendKeysCommand,
  formatServerUptime,
  parseServerRuntimeStatus,
} from '@/lib/server-terminal'

describe('buildTmuxSendKeysCommand', () => {
  it('sends literal text and enter to tmux', () => {
    expect(buildTmuxSendKeysCommand('alpha', 'say hello\r')).toBe(
      "tmux send-keys -t 'craft-alpha' -l -- 'say hello'; tmux send-keys -t 'craft-alpha' C-m"
    )
  })

  it('maps arrows, backspace, and control keys', () => {
    expect(buildTmuxSendKeysCommand('alpha', '\x15say test\x7f\x1b[A\r')).toBe(
      "tmux send-keys -t 'craft-alpha' C-u; tmux send-keys -t 'craft-alpha' -l -- 'say test'; tmux send-keys -t 'craft-alpha' BSpace; tmux send-keys -t 'craft-alpha' Up; tmux send-keys -t 'craft-alpha' C-m"
    )
  })

  it('preserves unicode text', () => {
    expect(buildTmuxSendKeysCommand('alpha', 'say привет\r')).toContain("'say привет'")
  })
})

describe('parseServerRuntimeStatus', () => {
  it('treats ready minecraft output as running', () => {
    expect(
      parseServerRuntimeStatus(
        'java',
        '[17:57:51] [Server thread/INFO] [minecraft/DedicatedServer]: Done (63.149s)! For help, type "help"'
      )
    ).toBe('running')
  })

  it('treats active non-shell output without ready marker as starting', () => {
    expect(parseServerRuntimeStatus('java', '[17:48:59] Launching target forgeserver')).toBe('starting')
  })

  it('treats shell prompt as stopped even if old logs remain in history', () => {
    expect(
      parseServerRuntimeStatus(
        'bash',
        '[21:44:16] [Server thread/INFO] [minecraft/MinecraftServer]: Done (63.149s)! For help, type "help"\nroot@ru-vmmini:/home/server-craft/forge-1_20_1#'
      )
    ).toBe('stopped')
  })

  it('treats live minecraft logs through a shell wrapper as starting', () => {
    expect(
      parseServerRuntimeStatus(
        'bash',
        '[21:44:16] [Server thread/INFO] [ne.mi.se.pe.PermissionAPI/]: Successfully initialized permission handler forge:default_handler'
      )
    ).toBe('starting')
  })

  it('treats minecraft console prompt as running even through a shell wrapper', () => {
    expect(
      parseServerRuntimeStatus(
        'bash',
        '[21:44:16] [Server thread/INFO] [minecraft/MinecraftServer]: [Not Secure] [Server] 152\n>'
      )
    ).toBe('running')
  })

  it('treats a shell prompt as stopped', () => {
    expect(
      parseServerRuntimeStatus(
        'run.sh',
        'root@ru-vmmini:/home/server-craft/forge-1_20_1#'
      )
    ).toBe('stopped')
  })
})

describe('buildEnsureServerSessionCommand', () => {
  it('boots new tmux sessions with bash and enables tmux mouse mode', () => {
    const command = buildEnsureServerSessionCommand('alpha')
    expect(command).toContain(
      "tmux new-session -d -s 'craft-alpha' -c '/home/server-craft/alpha' /bin/bash -il"
    )
    expect(command).toContain(
      "tmux set-option -t 'craft-alpha' mouse on >/dev/null 2>&1 || true"
    )
  })
})

describe('formatServerUptime', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats elapsed seconds and minutes', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-18T17:00:00Z'))

    expect(formatServerUptime(String(1773853190))).toBe('10s')
    expect(formatServerUptime(String(1773853080))).toBe('2m 0s')
    expect(formatServerUptime(String(1773849600))).toBe('1h 0m')
  })
})
