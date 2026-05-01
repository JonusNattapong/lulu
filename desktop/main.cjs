const { app, BrowserWindow, Menu, shell } = require("electron");
const { existsSync } = require("node:fs");
const path = require("node:path");

const APP_NAME = "Lulu Coworker";
const DEFAULT_DASHBOARD_URL = "http://127.0.0.1:5173";

let mainWindow;

function getDashboardUrl() {
  if (process.env.LULU_DASHBOARD_URL) return process.env.LULU_DASHBOARD_URL;
  if (!app.isPackaged) return DEFAULT_DASHBOARD_URL;
  return null;
}

function getPackagedDashboardPath() {
  const candidates = [
    path.join(process.resourcesPath, "dashboard", "dist", "index.html"),
    path.join(__dirname, "..", "dashboard", "dist", "index.html"),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0f172a",
    show: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  const dashboardUrl = getDashboardUrl();
  const dashboardFile = getPackagedDashboardPath();

  if (dashboardUrl) {
    mainWindow.loadURL(dashboardUrl);
  } else if (dashboardFile) {
    mainWindow.loadFile(dashboardFile);
  } else {
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
      <html>
        <body style="font-family: system-ui; background: #0f172a; color: #e2e8f0; padding: 32px;">
          <h1>Lulu dashboard is missing</h1>
          <p>Build the dashboard before packaging the desktop app.</p>
        </body>
      </html>
    `)}`);
  }
}

function createMenu() {
  const template = [
    ...(process.platform === "darwin"
      ? [{
          label: APP_NAME,
          submenu: [
            { role: "about" },
            { type: "separator" },
            { role: "services" },
            { type: "separator" },
            { role: "hide" },
            { role: "hideOthers" },
            { role: "unhide" },
            { type: "separator" },
            { role: "quit" },
          ],
        }]
      : []),
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "close" },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  app.setName(APP_NAME);
  createMenu();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
