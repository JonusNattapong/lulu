import path from "node:path";
import { existsSync, readFileSync } from "node:fs";

export function detectProject(): { projectName: string; projectRoot: string } {
  const projectRoot = process.cwd();
  let projectName = path.basename(projectRoot);

  try {
    const pkgPath = path.join(projectRoot, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.name) projectName = pkg.name;
    }
  } catch {
    // Ignore
  }

  return { projectName, projectRoot };
}

export interface ProjectProfile {
  name?: string;
  stack?: string[];
  scripts?: Record<string, string>;
  conventions?: string[];
  dangerousPaths?: string[];
  mcpServers?: any[];
}

export function loadProjectProfile(projectRoot: string): ProjectProfile | null {
  const paths = [
    path.join(projectRoot, "lulu.json"),
    path.join(projectRoot, ".lulu.json"),
    path.join(projectRoot, ".lulu", "config.json"),
  ];

  for (const p of paths) {
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, "utf-8"));
      } catch {
        // Ignore malformed JSON
      }
    }
  }

  // Fallback: Try to infer from package.json
  const pkgPath = path.join(projectRoot, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      return {
        name: pkg.name,
        scripts: pkg.scripts,
      };
    } catch {
      // Ignore
    }
  }

  return null;
}

export function formatProjectProfile(profile: ProjectProfile): string {
  const lines = ["# Project Profile"];
  
  if (profile.name) lines.push(`- Name: ${profile.name}`);
  if (profile.stack && profile.stack.length > 0) lines.push(`- Stack: ${profile.stack.join(", ")}`);
  
  if (profile.scripts) {
    lines.push("\n## Available Scripts");
    for (const [name, cmd] of Object.entries(profile.scripts)) {
      lines.push(`- \`${name}\`: ${cmd}`);
    }
  }

  if (profile.conventions && profile.conventions.length > 0) {
    lines.push("\n## Coding Conventions");
    profile.conventions.forEach(c => lines.push(`- ${c}`));
  }

  if (profile.dangerousPaths && profile.dangerousPaths.length > 0) {
    lines.push("\n## Dangerous Paths (Handle with care)");
    profile.dangerousPaths.forEach(p => lines.push(`- \`${p}\``));
  }

  return lines.join("\n");
}
