import type { SessionData } from './session-core'

export interface TerminalSize {
  cols: number
  rows: number
}

export type TerminalTarget =
  | { kind: 'root' }
  | { kind: 'server'; serverId: string }

export interface TerminalActorState {
  session: SessionData
  target: TerminalTarget
}

export interface TerminalBootstrap extends TerminalActorState {
  actorKey: string
}

export function clampTerminalDimension(
  value: number | null | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number.isFinite(value) ? Number(value) : fallback
  return Math.max(min, Math.min(max, parsed))
}

export function normalizeTerminalSize(size?: Partial<TerminalSize> | null): TerminalSize {
  return {
    cols: clampTerminalDimension(size?.cols, 80, 40, 400),
    rows: clampTerminalDimension(size?.rows, 24, 10, 200),
  }
}

export function formatTerminalError(message: string): string {
  return `\r\n\x1b[31m[${message}]\x1b[0m\r\n`
}
