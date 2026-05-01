export interface Capabilities {
  git: { available: boolean; path?: string }
  tmux: boolean
  bun: { available: boolean; version?: string }
  node: { available: boolean; version?: string; path?: string }
  browser: { available: boolean; type?: string }
  network: { available: boolean }
  os: {
    platform: string
    isWindows: boolean
    isMacOS: boolean
    isLinux: boolean
    arch: string
  }
  shell: {
    bash: boolean
    zsh: boolean
    powershell: boolean
    cmd: boolean
  }
}

function exeExists(name: string): boolean {
  try {
    const { sync } = require('which')
    return Boolean(sync(name))
  } catch {
    return false
  }
}

function findExe(name: string): string | undefined {
  try {
    const { sync } = require('which')
    return sync(name)
  } catch {
    return undefined
  }
}

function getPlatform(): 'windows' | 'macos' | 'linux' | 'wsl' | 'unknown' {
  const p = process.platform
  if (p === 'win32') return 'windows'
  if (p === 'darwin') return 'macos'
  if (p === 'linux') {
    try {
      const { readFileSync } = require('node:fs')
      const version = readFileSync('/proc/version', 'utf8')
      if (version.toLowerCase().includes('microsoft') || version.toLowerCase().includes('wsl')) {
        return 'wsl'
      }
    } catch {}
    return 'linux'
  }
  return 'unknown'
}

function runCommand(cmd: string, args: string[], timeout = 3000): { code: number; stdout: string } {
  try {
    const { spawnSync } = require('node:child_process')
    const res = spawnSync(cmd, args, { timeout, encoding: 'utf8' })
    return { code: res.status ?? 1, stdout: (res.stdout || '') + (res.stderr || '') }
  } catch {
    return { code: 1, stdout: '' }
  }
}

export async function detectCapabilities(): Promise<Capabilities> {
  const platform = getPlatform()
  const arch = process.arch

  // Git
  const gitPath = findExe('git')
  const git = { available: Boolean(gitPath), ...(gitPath && { path: gitPath }) }

  // Tmux
  const tmux = exeExists('tmux')

  // Bun
  let bun: Capabilities['bun'] = { available: false }
  if (exeExists('bun')) {
    const { stdout } = runCommand('bun', ['--version'])
    bun = { available: true, version: stdout.trim() || undefined }
  }

  // Node
  let node: Capabilities['node'] = { available: true, version: process.versions?.node }
  try {
    const nodePath = findExe('node')
    node.path = nodePath
  } catch {}

  // Browser
  let browser: Capabilities['browser'] = { available: false }
  const browserCandidates = platform === 'windows'
    ? ['chrome', 'chromium', 'msedge', 'google-chrome']
    : ['google-chrome', 'chromium', 'chromium-browser', 'firefox']

  for (const b of browserCandidates) {
    if (exeExists(b)) {
      browser = { available: true, type: b }
      break
    }
  }
  if (!browser.available && platform === 'macos') {
    browser = { available: true, type: 'macos_system' }
  }

  // Network
  let network: Capabilities['network'] = { available: false }
  if (platform === 'windows') {
    const { stdout } = runCommand('powershell', ['-Command', 'Test-Connection -ComputerName 8.8.8.8 -Count 1 -Quiet'], 3000)
    network = { available: stdout.trim() === 'True' }
  } else {
    const { code, stdout } = runCommand('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', 'https://www.google.com', '-m', '3'], 3000)
    network = { available: code === 0 && stdout.includes('200') }
  }
  if (!network.available) {
    const { code } = runCommand('nslookup', ['8.8.8.8'], 2000)
    network = { available: code === 0 }
  }

  // Shells
  const shell = {
    bash: exeExists('bash'),
    zsh: exeExists('zsh'),
    powershell: exeExists('powershell'),
    cmd: platform === 'windows' ? exeExists('cmd') : false,
  }

  return {
    git,
    tmux,
    bun,
    node,
    browser,
    network,
    os: {
      platform,
      isWindows: platform === 'windows',
      isMacOS: platform === 'macos',
      isLinux: platform === 'linux' || platform === 'wsl',
      arch,
    },
    shell,
  }
}

export function formatCapabilitiesForContext(caps: Capabilities): string {
  const lines: string[] = []
  lines.push('=== System Capabilities ===')
  lines.push('Machine capabilities detected:')

  const gitInfo = caps.git
  lines.push(`  ${gitInfo.available ? '✓' : '✗'} git${gitInfo.path ? ` at ${gitInfo.path}` : ''}`)
  lines.push(`  ${caps.tmux ? '✓' : '✗'} tmux`)
  lines.push(`  ${caps.bun.available ? '✓' : '✗'} bun${caps.bun.version ? ` (${caps.bun.version})` : ''}`)
  lines.push(`  ${caps.node.available ? '✓' : '✗'} node${caps.node.version ? ` ${caps.node.version}` : ''}`)
  lines.push(`  ${caps.browser.available ? '✓' : '✗'} browser${caps.browser.type ? ` (${caps.browser.type})` : ''}`)
  lines.push(`  ${caps.network.available ? '✓' : '✗'} network`)
  lines.push(`  OS: ${caps.os.platform} (${caps.os.arch})`)
  lines.push(`  Shells: bash=${caps.shell.bash}, zsh=${caps.shell.zsh}` + (caps.os.isWindows ? `, powershell=${caps.shell.powershell}, cmd=${caps.shell.cmd}` : ''))

  return lines.join('\n')
}
