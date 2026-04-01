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
    expect(parseServerRuntimeStatus('bash', 'Done (63.149s)! For help, type "help"')).toBe('stopped')
  })
})

describe('buildEnsureServerSessionCommand', () => {
  it('boots new tmux sessions with bash when available', () => {
    expect(buildEnsureServerSessionCommand('alpha')).toContain(
      "tmux new-session -d -s 'craft-alpha' -c '/home/server-craft/alpha' /bin/bash -il"
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
