// Theme provides color names (compatible with Ink's color prop: 'blue', 'green', 'magenta', etc.)
// Built-ins: dark, light, monokai, dracula, matrix
// Custom: load from JSON file via LULU_THEME_PATH or inline JSON

const BUILTIN: Record<string, Record<string, any>> = {
  dark: { primary: 'blue', secondary: 'green', muted: 'gray', headings: ['yellow','green','cyan','magenta','red','blue'] },
  light: { primary: 'blue', secondary: 'green', muted: 'gray', headings: ['blue','green','cyan','magenta','red','purple'] },
  monokai: { primary: 'yellow', secondary: 'green', muted: 'gray', headings: ['magenta','green','cyan','yellow','red','blue'] },
  dracula: { primary: 'pink', secondary: 'cyan', muted: 'gray', headings: ['pink','cyan','green','yellow','red','blue'] },
  matrix: { primary: 'green', secondary: 'greenBright', muted: 'greenDim', headings: ['greenBright','green','greenYellow','yellow','greenBright','green'] },
};

function readFile(filePath: string): string | null {
  try {
    if (typeof Bun !== "undefined") {
      return (Bun.file(filePath) as any).textSync?.() ?? null;
    }
    const { readFileSync: rfs, existsSync: efs } = require("node:fs");
    return efs(filePath) ? rfs(filePath, "utf-8") : null;
  } catch { return null; }
}

let _cache: Record<string, any> = BUILTIN.dark;

export function resolveTheme(name?: string): Record<string, any> {
  if (!name) return (_cache = BUILTIN.dark);
  if (BUILTIN[name]) return (_cache = BUILTIN[name]);

  const isPath = name.startsWith("/") || name.includes(":\\") || name.includes("/");
  if (isPath) {
    const content = readFile(name);
    if (content) {
      try {
        const parsed = JSON.parse(content);
        return (_cache = { ...BUILTIN.dark, ...parsed, headings: parsed.headings || BUILTIN.dark.headings });
      } catch {}
    }
    return (_cache = BUILTIN.dark);
  }

  try {
    const parsed = JSON.parse(name);
    return (_cache = { ...BUILTIN.dark, ...parsed, headings: parsed.headings || BUILTIN.dark.headings });
  } catch {
    return (_cache = BUILTIN.dark);
  }
}

export default resolveTheme(process.env.LULU_THEME);