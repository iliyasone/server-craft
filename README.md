# Server Craft

ServerCraft is a web panel for managing Minecraft servers on a remote Linux host over SSH.

It wraps the workflows you would normally do by hand in a terminal: connect to the machine, provision the server workspace, upload a server JAR, edit config files, open a persistent terminal, and start or stop the server.

Try it now: https://server-craft.vercel.app/

## What it does

- Connects to a remote host with `user@host` + password
- Prepares the host automatically by creating `/home/server-craft`, checking `tmux`, and installing Java 17 when needed
- Creates one folder per Minecraft server under `/home/server-craft/<server-id>`
- Supports persistent tmux-backed terminals for each server
- Lets you upload files and folders directly from the browser
- Includes a file explorer with drag-and-drop moves, rename, delete, download, and inline text editing
- Detects Forge installs and runs the installer flow when `run.sh` is still missing
- Starts vanilla-style JAR servers directly when no Forge wrapper is present
- Exposes a root terminal page for `root` sessions

## Supported server types

The panel is built around Minecraft server folders and JAR files.

- Forge: detected from the JAR name and installed with `java -jar <forge-jar> --installServer`
- Vanilla and other direct-run JARs: started with `java -jar <jar> nogui`

If a server ships as a runnable JAR and does not need extra launcher logic, it generally fits the second path.

## Stack

- Next.js App Router
- React 19
- TypeScript
- `ssh2` for remote execution
- `ws` for terminal transport
- xterm.js for the in-browser terminal

## Local development

```bash
npm install
npm run dev
```

The app runs on `http://localhost:3000`.

## How the app works

1. Log in with SSH credentials in `user@host` format.
2. The setup flow prepares the remote host.
3. Create a server, uploading a JAR during creation.
4. Open the server page to manage files, edit configs, and use the terminal.
5. Start, stop, or install the server from the header controls.

## Terminal behavior

- Each terminal is backed by a dedicated SSH PTY and a tmux session
- Server terminals attach to `craft-<server-id>`
- Terminal selection now copies automatically
- Paste uses `Ctrl/Cmd+Shift+V`

## Project scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run test
```

## Notes

- The project currently uses password-based SSH login stored in a signed session cookie.
- The managed server root is fixed to `/home/server-craft`.
- Java 17+ is required for modern Minecraft and Forge; the setup route tries to install it automatically.
