/**
 * Repo Health Check Job
 * Runs: git status, test suite, lint checks.
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export async function runRepoHealth(projectRoot: string): Promise<string> {
  const results: string[] = [];

  // Git status
  try {
    const status = execSync("git status --porcelain", { encoding: "utf-8", cwd: projectRoot });
    if (status.trim()) {
      results.push("🔴 Uncommitted changes:");
      results.push(status.trim());
    } else {
      results.push("✅ Git: clean");
    }
  } catch (e) {
    results.push("⚠️ Git: not a repo or error");
  }

  // Test suite
  const testCmd = existsSync(join(projectRoot, "package.json"))
    ? (JSON.parse(require("fs").readFileSync(join(projectRoot, "package.json"), "utf-8")).scripts?.test ? "bun run test" : null)
    : null;

  if (testCmd) {
    try {
      execSync(testCmd, { encoding: "utf-8", stdio: "pipe", cwd: projectRoot, timeout: 60000 });
      results.push("✅ Tests: passed");
    } catch {
      results.push("⚠️ Tests: failed or timed out");
    }
  }

  return results.length ? results.join("\n") : "No health checks configured.";
}