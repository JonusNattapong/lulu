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
const bunPath = findBun();

function findBun() {
  const candidates = [
    process.env.BUN,
    path.join(homedir(), ".bun", "bin", bin("bun")),
    bin("bun"),
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate)) || bin("bun");
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || root,
      stdio: "inherit",
      shell: false,
      env: { ...process.env, ...options.env },
    });

    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
    child.on("error", reject);
  });
}

async function runDashboardBuild() {
  try {
    await run(bunPath, ["run", "build"], { cwd: dashboardDir });
  } catch (error) {
    console.log("[desktop] dashboard build failed; refreshing dashboard dependencies once");
    await run(bunPath, ["install"], { cwd: dashboardDir });
    await run(bunPath, ["run", "build"], { cwd: dashboardDir });
  }
}

async function main() {
  console.log("[desktop] building core TypeScript");
  await run(bunPath, ["run", "build"]);

  const viteBin = path.join(dashboardDir, "node_modules", ".bin", bin("vite"));
  if (!existsSync(viteBin)) {
    console.log("[desktop] installing dashboard dependencies");
    await run(bunPath, ["install"], { cwd: dashboardDir });
  }

  console.log("[desktop] building dashboard");
  await runDashboardBuild();

  console.log("[desktop] build artifacts ready");
}

main().catch((error) => {
  console.error(`[desktop] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
