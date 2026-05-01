/**
 * Morning Test Run Job
 * Runs the test suite at a configured time.
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export async function runMorningTest(projectRoot: string): Promise<string> {
  const pkgPath = join(projectRoot, "package.json");
  if (!existsSync(pkgPath)) return "No package.json found.";

  const pkg = JSON.parse(require("fs").readFileSync(pkgPath, "utf-8"));
  const testCmd = pkg.scripts?.test || pkg.scripts?.["test:watch"];
  if (!testCmd) return "No test script configured.";

  try {
    const out = execSync(testCmd, { encoding: "utf-8", stdio: "pipe", cwd: projectRoot, timeout: 120000 });
    return `✅ Tests passed\n${out.slice(-500)}`;
  } catch (e: any) {
    return `❌ Tests failed\n${(e.stdout || e.stderr || e.message || "").slice(-1000)}`;
  }
}