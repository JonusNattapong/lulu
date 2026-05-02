/**
 * Lulu Desktop - Preload Script
 * Exposes safe IPC methods to renderer via contextBridge.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("luluDesktop", {
  // Daemon management
  daemon: {
    status: () => ipcRenderer.invoke("daemon:status"),
    start: () => ipcRenderer.invoke("daemon:start"),
    stop: () => ipcRenderer.invoke("daemon:stop"),
    restart: () => ipcRenderer.invoke("daemon:restart"),
  },

  // App info
  app: {
    version: () => ipcRenderer.invoke("app:version"),
  },

  // Window controls
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    maximize: () => ipcRenderer.invoke("window:maximize"),
    close: () => ipcRenderer.invoke("window:close"),
  },

  // Platform info
  platform: process.platform,
});
