# Lulu Desktop

Lulu Desktop is the coworker-style app shell for the local Lulu runtime. It uses the existing dashboard UI and opens it in Electron.

## Fast Dev Mode

Use this while developing Lulu:

```sh
bun run desktop
```

This starts:

- Lulu API on `http://127.0.0.1:19456`
- dashboard dev server on `http://127.0.0.1:5173`
- Electron window pointed at the dashboard

This is the fastest path because it does not package the app.

## Use Existing Servers

If the API or dashboard is already running:

```sh
LULU_DESKTOP_START_API=false bun run desktop
```

```sh
LULU_DESKTOP_START_DASHBOARD=false bun run desktop
```

If the dashboard is at a different URL:

```sh
LULU_DASHBOARD_URL=http://127.0.0.1:5173 bun run desktop
```

## Package Mode

Use this only when you want a desktop artifact:

```sh
npm run desktop:pack
```

Create an installer/package for the current OS:

```sh
npm run desktop:dist
```

Packaging runs TypeScript and Vite production builds, so it is slower than dev mode.

## Generate Icons

If you need to regenerate the app icon:

```sh
npm run desktop:icons
```

This creates `desktop/icon.png` and `desktop/icon.ico`.

## WSL Note

Building from `/mnt/c` or `/mnt/d` can be slow because WSL is crossing the Windows filesystem boundary. For faster packaging, clone the repo under the Linux filesystem, for example:

```sh
~/projects/lulu
```

Dev mode is usually fine from `/mnt/d`; packaging is where the slowdown is most noticeable.

## Desktop Features

The Electron app provides:

- **System Tray** - Click tray icon to show/hide window. Right-click for context menu.
- **Global Shortcuts**:
  - `Ctrl+Shift+L` — Toggle window visibility
  - `Ctrl+Shift+K` — Show window and focus chat input
- **Tray Menu**:
  - Open Dashboard
  - Start/Stop/Restart Daemon
  - Start API Server
  - Quit
- **Auto-daemon** - Automatically starts the personal agent daemon on launch (unless `LULU_DESKTOP_AUTO_DAEMON=false`)
- **Keep-running tray** - Clicking X hides the window instead of quitting; quit via tray menu
- **Native window controls** (minimize, maximize, close)
- **Desktop notification support**
- **Access to the web dashboard with full WebSocket streaming**
- **Personal Agent tab** showing daemon status, skill proposals, suggestions, preferences
- **Sub-agent monitor and observability tabs**
- **Real-time event log for agent activity**
- **Persistent session management across restarts**