import { existsSync, writeFileSync, mkdirSync, readFileSync, readdirSync, lstatSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const DATA_DIR = path.join(homedir(), '.lulu');
const DB_PATH = path.join(DATA_DIR, 'workspace_index.db');
const SCHEMA_VERSION = 1;

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

export interface IndexedFile {
  path: string;
  hash: string;
  size: number;
  mtime: number;
  language: string;
  gitStatus: string;
  lastIndexed: number;
}

function md5(str: string): string {
  return crypto.createHash('md5').update(str).digest('hex');
}

function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'tsx', '.js': 'javascript', '.jsx': 'jsx',
    '.json': 'json', '.md': 'markdown', '.py': 'python', '.go': 'go',
    '.rs': 'rust', '.java': 'java', '.rb': 'ruby', '.php': 'php',
    '.c': 'c', '.cpp': 'cpp', '.h': 'c', '.hpp': 'cpp',
    '.css': 'css', '.scss': 'scss', '.less': 'less',
    '.html': 'html', '.htm': 'html', '.xml': 'xml', '.yaml': 'yaml', '.yml': 'yaml',
    '.sh': 'bash', '.bash': 'bash', '.zsh': 'bash', '.fish': 'fish',
    '.sql': 'sql', '.gitignore': 'ignore', '.env': 'dotenv',
    '.txt': 'text', '.pdf': 'pdf', '.png': 'image', '.jpg': 'image', '.jpeg': 'image',
    '.gif': 'image', '.svg': 'svg', '.ico': 'image',
  };
  return map[ext] || 'unknown';
}

export function getGitStatus(filePath: string): string {
  try {
    const { execSync } = require('node:child_process');
    const cwd = process.cwd();
    const result = execSync(`git status --porcelain "${filePath}"`, { cwd, stdio: ['pipe','pipe','pipe'] });
    const line = result.toString().trim();
    if (!line) return 'clean';
    return line.slice(0, 2).trim();
  } catch { return 'unknown'; }
}

export function initDatabase() {
  ensureDataDir();
  const db = require('better-sqlite3')(DB_PATH, { verbose: console.log });

  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      path TEXT PRIMARY KEY,
      hash TEXT,
      size INTEGER,
      mtime REAL,
      language TEXT,
      gitStatus TEXT,
      lastIndexed INTEGER
    );
    CREATE TABLE IF NOT EXISTS symbols (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      file TEXT,
      type TEXT,
      line INTEGER,
      exported INTEGER,
      signature TEXT,
      UNIQUE(file, name, type)
    );
    CREATE TABLE IF NOT EXISTS imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_file TEXT,
      to_file TEXT,
      type TEXT,
      symbols TEXT,
      UNIQUE(from_file, to_file, type)
    );
    CREATE TABLE IF NOT EXISTS recent (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT,
      timestamp INTEGER,
      change_type TEXT,
      commit_hash TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
    CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file);
    CREATE INDEX IF NOT EXISTS idx_imports_from ON imports(from_file);
    CREATE INDEX IF NOT EXISTS idx_imports_to ON imports(to_file);
    CREATE INDEX IF NOT EXISTS idx_recent_time ON recent(timestamp);
  `);

  return db;
}

// Regex-based symbol extraction for TypeScript/JavaScript files
function extractSymbols(content: string, filePath: string): Array<{ name: string; type: string; line: number; exported: boolean; signature: string }> {
  const symbols: Array<{ name: string; type: string; line: number; exported: boolean; signature: string }> = [];
  const lines = content.split('\n');

  // Track line position in code blocks for precise line numbers
  let lineNumber = 0;

  for (let i = 0; i < lines.length; i++) {
    lineNumber = i + 1;
    const line = lines[i].trim();

    // Skip comments and strings (crude check)
    if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) continue;

    // Function declaration: function name(...)
    const fnMatch = line.match(/^function\s+([A-Za-z_$][\w$]*)\s*\(/);
    if (fnMatch) {
      symbols.push({ name: fnMatch[1], type: 'function', line: lineNumber, exported: line.startsWith('export'), signature: fnMatch[0] });
      continue;
    }

    // Arrow function assignment: const name = (args) =>
    const arrowMatch = line.match(/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\([^)]*\)|[^=]+)\s*=>/);
    if (arrowMatch) {
      symbols.push({ name: arrowMatch[1], type: 'arrowFunction', line: lineNumber, exported: line.startsWith('export'), signature: line.slice(0, 80) });
      continue;
    }

    // Class declaration: class Name
    const classMatch = line.match(/^(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/);
    if (classMatch) {
      symbols.push({ name: classMatch[1], type: 'class', line: lineNumber, exported: line.startsWith('export'), signature: classMatch[0] });
      continue;
    }

    // Interface declaration: interface Name
    const ifaceMatch = line.match(/^(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/);
    if (ifaceMatch) {
      symbols.push({ name: ifaceMatch[1], type: 'interface', line: lineNumber, exported: line.startsWith('export'), signature: ifaceMatch[0] });
      continue;
    }

    // Type alias: type Name =
    const typeMatch = line.match(/^(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/);
    if (typeMatch) {
      symbols.push({ name: typeMatch[1], type: 'type', line: lineNumber, exported: line.startsWith('export'), signature: line.slice(0, 60) });
      continue;
    }

    // Constant/variable: export const/let/var NAME
    const constMatch = line.match(/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/);
    if (constMatch && !line.includes('=')) {
      // Probably a re-export forward declaration, skip for now
      const name = constMatch[1];
      if (!['function','class','interface','type'].includes(name)) {
        symbols.push({ name, type: 'variable', line: lineNumber, exported: line.startsWith('export'), signature: line });
      }
    }
  }

  return symbols;
}

export function extractImports(content: string): Array<{ from: string; to: string; type: string; symbols: string[] }> {
  const imports: Array<{ from: string; to: string; type: string; symbols: string[] }> = [];

  // Match ES6 imports: import { a, b as c } from 'module'
  // and import default + named
  const importRegex = /import\s+(?:(\*)\s+as\s+(\w+)\s+from|(\{[^}]*\})\s+from|([^;]+?)\s+from|)\s+['"]([^'"]+)['"]/g;
  let match;

  while ((match = importRegex.exec(content)) !== null) {
    const all = match[0];
    const modulePath = match[5];
    const imported = match[3]; // { a, b as c }

    let type = 'esm';
    if (all.includes('require')) type = 'cjs';
    if (modulePath.startsWith('.')) type = 'relative';

    const symbols: string[] = [];
    if (imported) {
      const parts = imported.split(',').map(s => s.trim());
      for (const p of parts) {
        const rename = p.split(/\s+as\s+/);
        symbols.push(rename[rename.length - 1].trim());
      }
    }

    imports.push({ from: '', to: modulePath, type, symbols });
  }

  // Also match require() calls
  const requireRegex = /(?:const|let|var)\s+(\w+)\s*=\s*require\(['"]([^'"]+)['"]\)/g;
  while ((match = requireRegex.exec(content)) !== null) {
    imports.push({ from: '', to: match[2], type: 'cjs', symbols: [match[1]] });
  }

  return imports;
}

// Index all files in a project
export function indexProject(rootDir: string, db: any) {
  const files: string[] = [];
  let indexedCount = 0;

  function walk(dir: string) {
    const entries = existsSync(dir) ? readdirSync(dir) : [];
    for (const e of entries) {
      const full = path.join(dir, e);
      const stats = existsSync(full) ? lstatSync(full) : null;
      if (!stats) continue;

      if (stats.isDirectory()) {
        // Skip common excludes
        if (['node_modules', 'dist', 'build', '.git', '__tests__', 'coverage', '.next', '.nuxt'].includes(e)) continue;
        walk(full);
      } else if (stats.isFile()) {
        files.push(full);
      }
    }
  }

  walk(rootDir);

  const insertFile = db.prepare(`
    INSERT OR REPLACE INTO files (path, hash, size, mtime, language, gitStatus, lastIndexed)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertSymbol = db.prepare(`
    INSERT OR REPLACE INTO symbols (name, file, type, line, exported, signature)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertImport = db.prepare(`
    INSERT OR REPLACE INTO imports (from_file, to_file, type, symbols)
    VALUES (?, ?, ?, ?)
  `);

  // Track already-indexed files to skip unchanged ones
  const alreadyIndexed = new Set(db.prepare('SELECT path FROM files').raw().flat());

  for (const file of files) {
    try {
      const rel = path.relative(rootDir, file).replace(/\\/g, '/');
      const content = readFileSync(file, 'utf-8');
      const hash = md5(content);
      const stats = lstatSync(file);
      const size = stats.size;
      const mtime = stats.mtimeMs;
      const language = detectLanguage(rel);

      // Skip if unchanged
      if (alreadyIndexed.has(rel)) {
        const existing = db.prepare('SELECT hash FROM files WHERE path = ?').get(rel);
        // @ts-ignore - row exists
        if (existing && (existing as any).hash === hash) continue;
      }

      insertFile.run(rel, hash, size, mtime, language, getGitStatus(rel), Date.now() / 1000);

      // Clear old symbols/imports for this file
      db.prepare('DELETE FROM symbols WHERE file = ?').run(rel);
      db.prepare('DELETE FROM imports WHERE from_file = ?').run(rel);

      // Extract symbols
      const symbols = extractSymbols(content, rel);
      for (const s of symbols) {
        insertSymbol.run(s.name, rel, s.type, s.line, s.exported ? 1 : 0, s.signature);
      }

      // Extract imports
      const imports = extractImports(content);
      for (const imp of imports) {
        insertImport.run(rel, imp.to, imp.type, JSON.stringify(imp.symbols));
      }

      indexedCount++;
    } catch (err) {
      console.error(`Index error for ${file}:`, err);
    }
  }

  return indexedCount;
}

export function rebuildIndex(rootDir: string = process.cwd()) {
  const db = initDatabase();
  const start = Date.now();
  const count = indexProject(rootDir, db);
  const elapsed = Date.now() - start;
  return { indexed: count, elapsed, db };
}
