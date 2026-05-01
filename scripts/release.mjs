#!/usr/bin/env node
/**
 * Lulu Release Script
 * Centralized release management.
 *
 * Usage:
 *   bun scripts/release.mjs               # Interactive CLI
 *   bun scripts/release.mjs --bump patch  # Non-interactive
 *   bun scripts/release.mjs --tag v1.2.3  # Tag specific version
 *   bun scripts/release.mjs --dry-run      # Preview changes
 *   bun scripts/release.mjs --skip-build   # Skip build step
 */

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
  return new Promise((resolve) => rl.question(question, (a) => resolve(a.trim())));
}

function cmd(cmdStr, opts = {}) {
  try {
    return execSync(cmdStr, { encoding: "utf-8", stdio: "pipe", cwd: ROOT, ...opts });
  } catch (e) {
    console.error(`  ❌ ${cmdStr}`);
    console.error(`     ${e.stderr || e.message}`);
    process.exit(1);
  }
}

function tagExists(tag) {
  try {
    execSync(`git tag -l "${tag}"`, { encoding: "utf-8", stdio: "pipe", cwd: ROOT });
    return execSync(`git rev-parse --verify "refs/tags/${tag}"`, { encoding: "utf-8", stdio: "pipe", cwd: ROOT, reject: false }).trim().length > 0;
  } catch {
    return false;
  }
}

function lastTag() {
  try {
    const t = execSync("git tag --sort=-v:refname", { encoding: "utf-8", cwd: ROOT }).trim().split("\n").filter(Boolean);
    return t[0] || "none";
  } catch { return "none"; }
}

function bump(version, type) {
  const [a, b, c] = version.split(".").map(Number);
  if (type === "major") return `${a + 1}.0.0`;
  if (type === "minor") return `${a}.${b + 1}.0`;
  return `${a}.${b}.${c + 1}`;
}

function getCurrentVersion() {
  return JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")).version;
}

function getUnreleased(changelog) {
  // Handle both LF and CRLF line endings
  const m = changelog.match(/## \[Unreleased\](?:\r?\n)([\s\S]*?)(?=## \[v\d+\.\d)/);
  return m ? m[1].trim() : "";
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run") || args.includes("-n");
  const skipBuild = args.includes("--skip-build");
  const skipTag = args.includes("--skip-tag");

  // Parse --bump patch|minor|major
  const bumpArg = args.includes("--bump") ? args[args.indexOf("--bump") + 1] : null;
  // Parse --tag v1.2.3
  const tagArg = args.includes("--tag") ? args[args.indexOf("--tag") + 1] : null;

  console.log(`
╔════════════════════════════════════════╗
║         Lulu Release Script            ║
╚════════════════════════════════════════╝`);

  const currentVersion = getCurrentVersion();
  const changelog = readFileSync(join(ROOT, "CHANGELOG.md"), "utf-8");
  const unreleased = getUnreleased(changelog);

  console.log(`  Current version : v${currentVersion}`);
  console.log(`  Last tag        : ${lastTag()}`);
  console.log(`  Has unreleased : ${unreleased ? "yes" : "no"}`);
  if (dryRun) console.log(`  Mode            : DRY RUN\n`);

  // Determine version
  let newVersion, bumpType, displayType;
  if (tagArg) {
    newVersion = tagArg.replace(/^v/, "");
    displayType = "tag";
  } else if (bumpArg && ["patch", "minor", "major"].includes(bumpArg)) {
    bumpType = bumpArg;
    newVersion = bump(currentVersion, bumpType);
    displayType = bumpType;
  } else if (!dryRun) {
    console.log("  Select version bump:");
    const opts = [
      { label: "patch", desc: "bug fixes", code: "patch" },
      { label: "minor", desc: "new features", code: "minor" },
      { label: "major", desc: "breaking changes", code: "major" },
    ];
    opts.forEach((o, i) => console.log(`    [${i + 1}] ${o.label} — ${o.desc}`));
    const a = await ask("  > ");
    const idx = parseInt(a) - 1;
    bumpType = opts[idx >= 0 && idx < opts.length ? idx : 0].code;
    newVersion = bump(currentVersion, bumpType);
    displayType = bumpType;
  } else {
    console.log("  New version     : (need --bump or --tag)\n  No changes made.");
    process.exit(0);
  }

  const fullTag = `v${newVersion}`;

  console.log(`\n  New version     : ${fullTag}`);
  console.log(`  Bump type       : ${displayType}`);

  if (tagExists(fullTag)) {
    console.error(`\n  ❌ Tag ${fullTag} already exists!`);
    process.exit(1);
  }

  if (dryRun) {
    console.log("\n  [DRY RUN] Would:");
    console.log(`    1. Bump version to ${newVersion}`);
    console.log(`    2. Update CHANGELOG.md with ${fullTag}`);
    console.log(`    3. Commit + tag ${fullTag}`);
    if (!skipBuild) console.log(`    4. Run build`);
    console.log(`    5. Generate release notes`);
    console.log("\n  No changes made.");
    rl.close();
    return;
  }

  const ok = await ask(`\n  Proceed? [y/N] `);
  if (ok.toLowerCase() !== "y") {
    console.log("  Aborted.");
    rl.close();
    return;
  }

  // Step 1: package.json
  console.log("\n  [1/5] Bumping version...");
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
  pkg.version = newVersion;
  writeFileSync(join(ROOT, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
  console.log(`         v${currentVersion} → v${newVersion}`);

  // Step 2: CHANGELOG.md
  console.log("\n  [2/5] Updating CHANGELOG.md...");
  const today = new Date().toISOString().split("T")[0];

  const unreleasedIdx = changelog.indexOf("## [Unreleased]");
  let updatedChangelog;

  if (unreleasedIdx !== -1 && unreleased) {
    const nextHeading = changelog.indexOf("\n## ", unreleasedIdx + 15);
    const end = nextHeading === -1 ? changelog.length : nextHeading;
    updatedChangelog =
      changelog.slice(0, unreleasedIdx) +
      `## [Unreleased]\n\n### Added\n- (new changes here)\n\n` +
      `## [${fullTag}] - ${today}\n\n${unreleased}\n\n` +
      changelog.slice(end);
  } else {
    updatedChangelog = `## [${fullTag}] - ${today}\n\n(No changes documented)\n\n` + changelog;
  }

  writeFileSync(join(ROOT, "CHANGELOG.md"), updatedChangelog);
  console.log(`         Added [${fullTag}] - ${today}`);

  // Step 3: Build
  if (!skipBuild) {
    console.log("\n  [3/5] Building...");
    try {
      cmd("bun run build");
      console.log("         Build: OK");
    } catch {
      console.log("         ⚠ Build failed — review before tagging.");
    }
  } else {
    console.log("\n  [3/5] Build: SKIPPED");
  }

  // Step 4: Git
  console.log("\n  [4/5] Git commit + tag...");
  cmd("git add package.json CHANGELOG.md");
  cmd(`git commit -m "chore(release): ${fullTag}"`);
  console.log(`         Commit: "chore(release): ${fullTag}"`);

  if (!skipTag) {
    cmd(`git tag -a ${fullTag} -m "${fullTag}"`);
    console.log(`         Tag: ${fullTag}`);
  }

  // Step 5: Release notes
  console.log("\n  [5/5] Release notes...");
  const notes = `# Release ${fullTag} (${today})

${unreleased || "(see CHANGELOG.md)"}

---
Run: git push && git push ${fullTag}
`;
  writeFileSync(join(ROOT, "RELEASE_NOTES.md"), notes);
  console.log("         Written: RELEASE_NOTES.md");

  console.log(`
╔══════════════════════════════════════════════════════════╗
║  ✅ Release ${fullTag} complete!                           ║
╠══════════════════════════════════════════════════════════╣
║  git push && git push ${fullTag}                            ║
╚══════════════════════════════════════════════════════════╝
`);

  rl.close();
}

main().catch((e) => {
  console.error("Error:", e);
  rl.close();
  process.exit(1);
});