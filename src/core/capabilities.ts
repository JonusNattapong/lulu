import { execSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { platform, arch, release } from 'node:os';

export interface Capabilities {
  os: { platform: string; arch: string; release: string };
  shell: { available: boolean; type: string; path: string };
  git: { available: boolean; version?: string };
  bun: { available: boolean; version?: string };
  node: { available: boolean; version: string };
  browser: { available: boolean; type?: string; path?: string };
  network: { online: boolean; hasProxy: boolean };
  tmux: { available: boolean; version?: string };
  docker: { available: boolean; version?: string };
  python: { available: boolean; version?: string };
}

function tryCommand(cmd: string, args: string[] = []): { ok: boolean; output?: string } {
  try {
    const result = spawnSync(cmd, args, { stdio: ['pipe','pipe','pipe'], timeout: 2000 });
    if (result.status === 0 && result.stdout) {
      return { ok: true, output: result.stdout.toString().trim() };
    }
    // spawnSync didn't succeed — only try shell exec if command was not found at all
    if (result.error?.message?.includes('ENOENT') || !which(cmd)) {
      return { ok: false };
    }
    const shellResult = execSync(`${cmd} ${args.join(' ')}`, { stdio: ['pipe','pipe','pipe'], timeout: 2000 });
    return { ok: true, output: shellResult.toString().trim() };
  } catch {
    return { ok: false };
  }
}

function which(cmd: string): string | null {
  const paths = (process.env.PATH || '').split(path.delimiter);
  const ext = process.platform === 'win32' ? '.exe' : '';
  for (const p of paths) {
    const full = path.join(p, cmd + ext);
    if (existsSync(full)) return full;
  }
  if (process.platform === 'win32') {
    const common = ['C:\Program Files\Git\bin', 'C:\Program Files\nodejs', process.env.APPDATA + '\npm'];
    for (const base of common) {
      if (base) {
        const full = path.join(base, cmd + ext);
        if (existsSync(full)) return full;
      }
    }
  }
  return null;
}

function detectShell(): { available: boolean; type: string; path: string } {
  const shellEnv = process.env.SHELL || process.env.ComSpec;
  if (shellEnv) {
    const name = path.basename(shellEnv).toLowerCase();
    return { available: true, type: name, path: shellEnv };
  }
  if (process.platform === 'win32') {
    return { available: true, type: 'powershell', path: 'powershell.exe' };
  }
  return { available: false, type: 'unknown', path: '' };
}

function detectBrowser(): { available: boolean; type?: string; path?: string } {
  if (process.platform === 'darwin') {
    if (existsSync('/Applications/Google Chrome.app')) return { available: true, type: 'chrome', path: '/Applications/Google Chrome.app' };
    if (existsSync('/Applications/Safari.app')) return { available: true, type: 'safari', path: '/Applications/Safari.app' };
  } else if (process.platform === 'win32') {
    const paths = [
      'C:\Program Files\Google\Chrome\Application\chrome.exe',
      'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
      'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
      'C:\Program Files\Mozilla Firefox\firefox.exe',
    ];
    for (const p of paths) {
      if (existsSync(p)) {
        const name = path.basename(p).toLowerCase();
        const type = name.includes('chrome') ? 'chrome' : name.includes('edge') ? 'edge' : 'firefox';
        return { available: true, type, path: p };
      }
    }
  } else {
    const browsers = [
      { name: 'chromium', path: which('chromium') || which('chromium-browser') },
      { name: 'chrome', path: which('google-chrome') || which('google-chrome-stable') },
      { name: 'firefox', path: which('firefox') },
    ];
    for (const b of browsers) {
      if (b.path) return { available: true, type: b.name, path: b.path };
    }
  }
  return { available: false };
}

function detectNetwork(): { online: boolean; hasProxy: boolean } {
  let online = true;
  try {
    const result = spawnSync('ping', ['-c', '1', '-W', '2', 'api.anthropic.com'], { timeout: 3000 });
    online = result.status === 0;
  } catch {
    online = false;
  }
  const hasProxy = !!(process.env.HTTP_PROXY || process.env.HTTPS_PROXY || process.env.http_proxy);
  return { online, hasProxy };
}

let _cached: Capabilities | null = null;

export function detectCapabilities(): Capabilities {
  if (_cached) return _cached;

  const nodeVersion = process.version;

  const git = tryCommand('git', ['--version']);
  const bun = tryCommand('bun', ['--version']);
  const tmux = tryCommand('tmux', ['-V']);
  const docker = tryCommand('docker', ['--version']);
  const python = tryCommand('python3', ['--version']);

  const shell = detectShell();
  const browser = detectBrowser();
  const network = detectNetwork();

  const caps: Capabilities = {
    os: { platform: platform(), arch: arch(), release: release() },
    shell: { available: shell.available, type: shell.type, path: shell.path },
    git: { available: git.ok, version: git.output?.split(' ')[2] },
    bun: { available: bun.ok, version: bun.output },
    node: { available: true, version: nodeVersion },
    browser: { available: browser.available, type: browser.type, path: browser.path },
    network,
    tmux: { available: tmux.ok, version: tmux.output },
    docker: { available: docker.ok, version: docker.output },
    python: { available: python.ok, version: python.output },
  };

  _cached = caps;
  return caps;
}

export function formatCapabilities(caps: Capabilities): string {
  const lines: string[] = ['🖥️  Host Capabilities'];
  const ok = '✓', no = '✗';

  lines.push(`  OS: ${caps.os.platform} (${caps.os.arch}) ${caps.os.release}`);
  lines.push(`  Shell: ${caps.shell.type} ${caps.shell.available ? ok : no}`);
  lines.push(`  Git: ${caps.git.available ? 'v' + caps.git.version : 'not found'}`);
  lines.push(`  Bun: ${caps.bun.available ? caps.bun.version : 'not found'}`);
  lines.push(`  Node: ${caps.node.version}`);
  if (caps.browser.available) lines.push(`  Browser: ${caps.browser.type} found`);
  else lines.push(`  Browser: not detected`);
  lines.push(`  Network: ${caps.network.online ? 'online' : 'offline'} ${caps.network.hasProxy ? '(proxy)' : ''}`);
  lines.push(`  Tmux: ${caps.tmux.available ? caps.tmux.version : 'not found'}`);
  lines.push(`  Docker: ${caps.docker.available ? caps.docker.version?.split(' ')[2] : 'not found'}`);
  lines.push(`  Python: ${caps.python.available ? caps.python.version : 'not found'}`);

  return lines.join('\n');
}

export function capabilitiesSummary(caps: Capabilities): string {
  const parts: string[] = [];
  parts.push(`OS=${caps.os.platform}`);
  parts.push(`shell=${caps.shell.type}`);
  if (caps.git.available) parts.push('git');
  if (caps.bun.available) parts.push('bun');
  if (caps.browser.available) parts.push(`browser:${caps.browser.type}`);
  if (caps.tmux.available) parts.push('tmux');
  if (caps.docker.available) parts.push('docker');
  return parts.join(', ');
}
