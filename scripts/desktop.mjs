#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dashboardDir = path.join(root, "dashboard");
const isWindows = process.platform === "win32";
const bin = (cmd) => isWindows ? `${cmd}.cmd` : cmd;
const children = new Set();
const bunPath = findBun();

function findBun() {
  const candidates = [
    process.env.BUN,
    path.join(homedir(), ".bun", "bin", bin("bun")),
    bin("bun"),
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate)) || bin("bun");
}

function log(message) {
  console.log(`[desktop] ${message}`);
}

function spawnChild(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd || root,
    stdio: options.stdio || "inherit",
    env: { ...process.env, ...options.env },
    shell: false,
  });
  children.add(child);
  child.on("exit", () => children.delete(child));
  return child;
}

function cleanup() {
  for (const child of children) {
    try {
      if (!child.killed) child.kill();
    } catch {
      // Ignore shutdown races.
    }
  }
}

async function waitForUrl(url, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) return;
    } catch {
      // Server is still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function commandExists(command) {
  const lookup = isWindows ? "where" : "command";
  const args = isWindows ? [command] : ["-v", command];
  const child = spawn(lookup, args, { stdio: "ignore", shell: !isWindows });
  return new Promise((resolve) => {
    child.on("exit", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

async function main() {
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });
  process.on("exit", cleanup);

  const hasBun = existsSync(bunPath) || await commandExists("bun");
  if (!hasBun) {
    throw new Error("Bun is required to launch Lulu Desktop. Install it from https://bun.sh first.");
  }

  const apiUrl = process.env.LULU_API_URL || "http://127.0.0.1:19456/status";
  const dashboardUrl = process.env.LULU_DASHBOARD_URL || "http://127.0.0.1:5173";
  const startApi = process.env.LULU_DESKTOP_START_API !== "false";
  const startDashboard = process.env.LULU_DESKTOP_START_DASHBOARD !== "false";

  if (startApi) {
    log("starting local API on :19456");
    spawnChild(bunPath, ["src/api/server.ts"], {
      env: { LULU_CHANNEL: "dashboard" },
    });
  }

  if (startDashboard) {
    log("starting dashboard dev server on :5173");
    spawnChild(bunPath, ["run", "dev", "--", "--host", "127.0.0.1", "--port", "5173"], {
      cwd: dashboardDir,
    });
  }

  await waitForUrl(apiUrl);
  await waitForUrl(dashboardUrl);

  const electronBin = path.join(root, "node_modules", ".bin", bin("electron"));
  const electronCommand = existsSync(electronBin) ? electronBin : bin("npx");
  const electronArgs = existsSync(electronBin)
    ? [path.join(root, "desktop", "main.cjs")]
    : ["electron", path.join(root, "desktop", "main.cjs")];

  log("opening Lulu Coworker");
  const electron = spawnChild(electronCommand, electronArgs, {
    env: {
      LULU_DASHBOARD_URL: dashboardUrl,
    },
  });

  electron.on("exit", (code) => {
    cleanup();
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  cleanup();
  console.error(`[desktop] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
