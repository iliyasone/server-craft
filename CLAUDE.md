# craft-panel

Minecraft server management panel built with Next.js 14 + TypeScript. Connects to remote Linux servers via SSH to manage Minecraft servers (Forge, Vanilla).

## Architecture

- **Frontend**: Next.js App Router, xterm.js terminal, inline styles (no CSS framework)
- **Backend**: Next.js API routes, SSH2 library for remote execution, tmux for terminal persistence
- **Auth**: JWT session cookie with host/username/password
- **Remote servers dir**: `/home/server-craft/` — each subdirectory is a Minecraft server

## Critical Rules

### Server Responsibility
This panel is responsible for the FULL lifecycle of a Minecraft server — from package installation to running. If a server doesn't start, it's a craft-panel bug. Never blame the remote server environment; instead, fix the setup code (`app/api/setup/route.ts`) to install what's needed.

### Java Version
Modern Minecraft (1.17+) and Forge require **Java 17 or higher**. The setup route MUST install `openjdk-17-jre-headless`, NOT `default-jre-headless` (which gives Java 11 on most distros). Always check the Java major version number, not just whether `java` exists.

### Server Types and Start Logic
- **Forge**: Detected by jar name containing "forge". Installation: `java -jar <forge-jar> --installServer` (creates `run.sh`). Start: `bash run.sh nogui`.
- **Vanilla**: Any non-forge jar. No install step needed. Start: `java -jar <jar> nogui`.
- **Start command priority**: If `run.sh` exists, use it (`bash run.sh nogui`). Otherwise, run the jar directly.

### Terminal (xterm.js)
- Uses one WebSocket per terminal tab, and one SSH PTY channel behind it
- React strict mode in dev causes double-mount. The `init()` is async (dynamic imports), so a `disposed` flag is required to prevent stale instances.
- xterm.js responds to DA (Device Attributes) queries from tmux with escape sequences via `onData`. These MUST be filtered out before sending as input, or they appear as garbage text (`0;276;0c`) on the command line.
- Before sending commands to the terminal (start, stop, install), always prepend `\x15` (Ctrl+U) to clear any existing text on the command line.

### SSH / tmux
- Terminal sessions use tmux: `craft-<serverId>` session names
- SSH connection pool is global (survives HMR in dev)
- Term type: `xterm-256color` for interactive terminal PTY channels

## Key Files

- `lib/servers.ts` — Server detection, start/install command generation, type detection
- `lib/ssh.ts` — SSH connection pool with channel exhaustion handling
- `app/api/setup/route.ts` — Remote server provisioning (tmux, Java 17)
- `components/ServerTerminal.tsx` — xterm.js terminal component
- `server.ts` — custom Next.js server with terminal WebSocket upgrade handling
- `app/servers/[id]/ServerPageClient.tsx` — Main server page with Install/Start/Stop

## Dev

```bash
npm run dev     # Start dev server on :3000
```

## Color Scheme
- Background: `#20141f`, Sidebar: `#300a2e`, Accent: `#fd87f6`
- Terminal bg: `#0d0d0d`, Success: `#22c55e`, Error: `#dc2626`
