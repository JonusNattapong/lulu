/**
 * Lulu Desktop - Electron Main Process
 * System tray, dashboard window, daemon management, global shortcuts.
 */
const { app, BrowserWindow, Tray, Menu, ipcMain, shell, globalShortcut, nativeImage, dialog } = require("electron");
const path = require("node:path");
const { spawn } = require("node:child_process");
const fs = require("node:fs");

const isDev = process.env.NODE_ENV === "development";
const isWindows = process.platform === "win32";
const TRAY_ICON_SIZE = 16;

// ── Paths ──────────────────────────────────────────────────────────────────

function getIconPath() {
  if (isWindows) {
    return path.join(__dirname, "icon.ico");
  }
  // macOS/Linux: look for PNG or use fallback
  const candidates = [
    path.join(__dirname, "icon.png"),
    path.join(__dirname, "..", "public", "icon.png"),
    path.join(__dirname, "..", "..", "dashboard", "public", "icon.png"),
  ];
  return candidates.find(p => fs.existsSync(p)) || candidates[0];
}

const DASHBOARD_URL = process.env.LULU_DASHBOARD_URL || (isDev ? "http://127.0.0.1:5173" : null);
const DAEMON_SCRIPT = path.join(__dirname, "..", "src", "core", "daemon.js");

// ── State ──────────────────────────────────────────────────────────────────

let mainWindow = null;
let tray = null;
let daemonProcess = null;
let daemonPid = null;

// Read stored daemon PID
function readDaemonPid() {
  const os = require("node:os");
  const pidPath = path.join(os.homedir(), ".lulu", "daemon.pid");
  if (fs.existsSync(pidPath)) {
    try {
      return parseInt(fs.readFileSync(pidPath, "utf-8").trim(), 10);
    } catch {}
  }
  return null;
}

function isDaemonRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getTrayIcon() {
  const iconPath = getIconPath();
  try {
    if (fs.existsSync(iconPath)) {
      return nativeImage.createFromPath(iconPath).resize({ width: TRAY_ICON_SIZE, height: TRAY_ICON_SIZE });
    }
  } catch {}

  // Fallback: create a simple colored square icon
  const size = 32;
  const canvas = Buffer.alloc(size * size * 4);
  // Fill with #A855F7 (purple)
  for (let i = 0; i < size * size; i++) {
    canvas[i * 4 + 0] = 168;  // R
    canvas[i * 4 + 1] = 85;   // G
    canvas[i * 4 + 2] = 247;  // B
    canvas[i * 4 + 3] = 255;  // A
  }
  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

// ── Window ──────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    backgroundColor: "#0a0a0a",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: "Lulu",
  });

  // Load dashboard
  if (DASHBOARD_URL) {
    mainWindow.loadURL(DASHBOARD_URL);
  } else {
    // Production: load from built dist
    const distPath = path.join(__dirname, "..", "dashboard", "dist", "index.html");
    if (fs.existsSync(distPath)) {
      mainWindow.loadFile(distPath);
    } else {
      mainWindow.loadURL("http://localhost:19456");
    }
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Hide instead of close when clicking X
  mainWindow.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
}

// ── System Tray ─────────────────────────────────────────────────────────────

function createTray() {
  const icon = getTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip("Lulu Personal AI Agent");

  updateTrayMenu();

  tray.on("click", () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

function updateTrayMenu() {
  const pid = readDaemonPid();
  const running = isDaemonRunning(pid);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Lulu",
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Open Dashboard",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: "separator" },
    {
      label: running ? "Daemon Running" : "Daemon Stopped",
      enabled: false,
    },
    {
      label: "Start Daemon",
      enabled: !running,
      click: () => startDaemon(),
    },
    {
      label: "Stop Daemon",
      enabled: running,
      click: () => stopDaemon(pid),
    },
    {
      label: "Restart Daemon",
      enabled: running,
      click: () => {
        stopDaemon(pid);
        setTimeout(() => startDaemon(), 1500);
      },
    },
    { type: "separator" },
    {
      label: "Start API Server",
      click: () => {
        const api = spawnDaemonProcess("api");
        if (api) console.log("[lulu-desktop] API server started (PID:", api.pid, ")");
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.isQuitting = true;
        stopDaemon(pid);
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

// ── Daemon Management ────────────────────────────────────────────────────────

function spawnDaemonProcess(mode = "start") {
  const isBun = (() => {
    try {
      const bunCmd = isWindows ? "bun.cmd" : "bun";
      const bunPath = require("node:child_process").spawnSync(bunCmd, ["--version"], { shell: true });
      return bunPath.status === 0;
    } catch {
      return false;
    }
  })();

  const exe = isBun ? (isWindows ? "bun.cmd" : "bun") : "node";
  const args = isBun
    ? [DAEMON_SCRIPT, mode]
    : [DAEMON_SCRIPT, mode];

  try {
    const child = spawn(exe, args, {
      cwd: path.join(__dirname, ".."),
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return child;
  } catch (err) {
    console.error("[lulu-desktop] Failed to spawn daemon:", err.message);
    return null;
  }
}

function startDaemon() {
  if (daemonProcess) return;
  daemonProcess = spawnDaemonProcess("start");
  setTimeout(() => updateTrayMenu(), 2000);
}

function stopDaemon(pid) {
  if (pid) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }
  setTimeout(() => updateTrayMenu(), 500);
}

// ── IPC Handlers ────────────────────────────────────────────────────────────

function setupIPC() {
  ipcMain.handle("daemon:status", () => {
    const pid = readDaemonPid();
    return { running: isDaemonRunning(pid), pid };
  });

  ipcMain.handle("daemon:start", () => {
    startDaemon();
    return { started: true };
  });

  ipcMain.handle("daemon:stop", () => {
    const pid = readDaemonPid();
    stopDaemon(pid);
    return { stopped: true };
  });

  ipcMain.handle("daemon:restart", () => {
    const pid = readDaemonPid();
    stopDaemon(pid);
    setTimeout(() => startDaemon(), 1500);
    return { restarted: true };
  });

  ipcMain.handle("app:version", () => {
    const pkgPath = path.join(__dirname, "..", "..", "package.json");
    if (fs.existsSync(pkgPath)) {
      return JSON.parse(fs.readFileSync(pkgPath, "utf-8")).version;
    }
    return "0.0.0";
  });

  ipcMain.handle("window:minimize", () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.handle("window:maximize", () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.handle("window:close", () => {
    if (mainWindow) mainWindow.hide();
  });
}

// ── Global Shortcuts ─────────────────────────────────────────────────────────

function registerShortcuts() {
  // Show/hide window: Ctrl+Shift+L
  globalShortcut.register("CommandOrControl+Shift+L", () => {
    if (mainWindow) {
      if (mainWindow.isVisible() && mainWindow.isFocused()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });

  // Quick chat: Ctrl+Shift+K
  globalShortcut.register("CommandOrControl+Shift+K", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
      // Focus the chat input
      mainWindow.webContents.executeJavaScript(`
        document.querySelector('input[type="text"], textarea')?.focus();
      `).catch(() => {});
    }
  });
}

// ── App Lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  createTray();
  setupIPC();
  registerShortcuts();

  // Auto-start daemon if configured
  if (process.env.LULU_DESKTOP_AUTO_DAEMON !== "false") {
    const pid = readDaemonPid();
    if (!isDaemonRunning(pid)) {
      startDaemon();
    }
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on("window-all-closed", () => {
  // Keep running in tray on all platforms
});

app.on("before-quit", () => {
  app.isQuitting = true;
  const pid = readDaemonPid();
  if (process.env.LULU_DESKTOP_KEEP_DAEMON !== "false") {
    // Keep daemon running, only stop if asked
  }
  globalShortcut.unregisterAll();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
