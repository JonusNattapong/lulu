import { readdirSync, readFileSync } from "fs";
import path from "path";

export function wildcardMatch(value: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^${escaped.replaceAll("*", ".*")}$`);
  return regex.test(value);
}

export function searchFiles(
  dir: string,
  regex: RegExp,
  globFilter: string | undefined,
  results: string[],
  visited = new Set<number>(),
): void {
  if (results.length >= 500) return;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= 500) return;
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        searchFiles(fullPath, regex, globFilter, results, visited);
      } else if (entry.isFile()) {
        if (globFilter && !wildcardMatch(entry.name, globFilter)) continue;
        try {
          const content = readFileSync(fullPath, "utf-8");
          const lines = content.split(/\r?\n/);
          for (let i = 0; i < lines.length && results.length < 500; i++) {
            if (regex.test(lines[i])) {
              results.push(`${fullPath}:${i + 1}: ${lines[i].trim()}`);
            }
          }
        } catch { /* Skip unreadable */ }
      }
    }
  } catch { /* Skip unreadable */ }
}

export async function listFilesRecursive(dir: string): Promise<string[]> {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const res = path.resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') return [];
      return listFilesRecursive(res);
    }
    return [path.relative(process.cwd(), res)];
  }));
  return files.flat();
}
