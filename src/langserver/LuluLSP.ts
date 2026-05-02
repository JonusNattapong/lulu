/**
 * Lulu LSP with Agent Integration
 * Connects LSP commands to Lulu agent for real AI assistance via Gateway API.
 * Supports both online (Gateway) and offline modes.
 */
import { LSPBase } from './lsp.js'
import net from 'net'
import fs from 'fs'

type Position = { line: number; character: number }
type Range = { start: Position; end: Position }

export class LuluLSP extends LSPBase {
  private port = 18790
  private gatewayUrl = 'http://localhost:19456'
  private gatewayAvailable = false
  private sessionId: string | null = null
  private offlineMode = false
  private offlineCachePath = '.lulu/lsp-cache.json'

  constructor(options?: { offline?: boolean }) {
    super()
    this.offlineMode = options?.offline || false
    this.checkGateway()
  }

  /**
   * Check if Gateway API is available
   */
  private async checkGateway(): Promise<void> {
    // Skip gateway check if offline mode forced
    if (this.offlineMode) {
      console.error('[LSP] Running in offline mode')
      return
    }

    try {
      const resp = await fetch(`${this.gatewayUrl}/status`)
      if (resp.ok) {
        this.gatewayAvailable = true
        console.error('[LSP] Connected to Lulu Gateway at', this.gatewayUrl)
      }
    } catch {
      console.error('[LSP] Gateway not available, running in offline mode')
    }
  }

  /**
   * Query Gateway or return offline mock response
   */
  private async queryGateway(prompt: string, code?: string): Promise<{ text: string; sessionId?: string }> {
    if (this.gatewayAvailable && !this.offlineMode) {
      const body: any = { prompt }
      if (this.sessionId) body.sessionId = this.sessionId
      if (code) body.context = [{ role: 'user', content: code }]

      const resp = await fetch(`${this.gatewayUrl}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!resp.ok) throw new Error(`Gateway error: ${resp.status}`)

      const result = await resp.json()
      if (result.sessionId) this.sessionId = result.sessionId
      return result
    }

    // Offline mode - return cached or mock response
    return this.getOfflineResponse(prompt)
  }

  /**
   * Get response from cache or generate mock response
   */
  private async getOfflineResponse(prompt: string): Promise<{ text: string }> {
    // Try cache first
    try {
      if (fs.existsSync(this.offlineCachePath)) {
        const cache = JSON.parse(fs.readFileSync(this.offlineCachePath, 'utf-8'))
        const cached = cache[prompt]
        if (cached) return { text: cached }
      }
    } catch {
      // Ignore cache errors
    }

    // Mock responses based on prompt type
    if (prompt.startsWith('/explain')) {
      return { text: 'This code appears to be correct. Make sure all variables are properly defined and consider adding type annotations for better clarity.' }
    }
    if (prompt.startsWith('/fix')) {
      return { text: 'Suggested fix: Add error handling. Consider edge cases like null/undefined values. Add try-catch blocks where appropriate.' }
    }
    if (prompt.startsWith('/refactor')) {
      return { text: 'Refactoring suggestions: Extract small functions, use meaningful variable names, remove code duplication.' }
    }
    if (prompt.startsWith('/review')) {
      return { text: 'Code review: Overall structure looks good. Check for potential bugs around undefined values. Consider adding unit tests.' }
    }

    return { text: 'Lulu offline mode: Enable Gateway for AI responses.' }
  }

  /**
   * Start LSP in TCP mode (WebSocket-style for IDE connection)
   */
  startTCP(port?: number): void {
    this.port = port || this.port
    super.startTCP(this.port)
    console.error(`[LSP] TCP mode listening on port ${this.port}`)
  }

  /**
   * Start LSP with auto-detection: TCP if port available, else stdio
   */
  startAuto(): void {
    const testServer = net.createServer()
    testServer.once('error', () => {
      console.error('[LSP] Port in use, using stdio mode')
      this.startStdio()
    })
    testServer.once('listening', () => {
      testServer.close()
      this.startTCP()
    })
    testServer.listen(this.port)
  }

  protected onDidOpen(params: unknown): void {
    const p = params as any
    this.documents.set(p.textDocument.uri, p.textDocument.text)
  }

  protected onDidChange(params: unknown): void {
    const p = params as any
    for (const change of p.contentChanges) {
      if (change.text !== undefined) {
        this.documents.set(p.textDocument.uri, change.text)
      }
    }
  }

  protected onDidClose(params: unknown): void {
    const p = params as any
    this.documents.delete(p.textDocument.uri)
  }

  /**
   * Handle hover - query Gateway for AI documentation
   */
  protected async onHover(params: unknown): Promise<unknown> {
    const p = params as { textDocument: { uri: string }; position: Position }
    const doc = this.getDocument(p.textDocument.uri)

    if (!doc) return null

    // Get word at position
    const lines = doc.split('\n')
    const line = lines[p.position.line] || ''
    const wordMatch = line.slice(p.position.character).match(/[\w.]+/)

    if (!wordMatch) return null

    // Query gateway for definition/docs
    if (this.gatewayAvailable) {
      try {
        const result = await this.queryGateway(`/explain ${wordMatch[0]}`)
        return {
          contents: {
            kind: 'markdown',
            value: result.text || `**${wordMatch[0]}**\n\n_Click to ask Lulu for details_`,
          },
        }
      } catch {
        // Fall through to default
      }
    }

    return {
      contents: {
        kind: 'markdown',
        value: `**${wordMatch[0]}**\n\n_Ask Lulu for details_`,
      },
    }
  }

  /**
   * Handle completion - AI-powered code completion
   */
  protected async onCompletion(params: unknown): Promise<unknown> {
    const p = params as { textDocument: { uri: string }; position: Position }
    const doc = this.getDocument(p.textDocument.uri)

    if (!doc) return { isIncomplete: false, items: [] }

    const prefix = this.getBeforePrefix(doc, p.position)

    // AI-powered completions
    const suggestions = await this.getAgentCompletions(prefix, doc)

    return {
      isIncomplete: false,
      items: suggestions.map((s) => ({
        label: s,
        kind: 3,
        insertText: s,
      })),
    }
  }

  /**
   * Handle code action - query Gateway for AI actions
   */
  protected async onCodeAction(params: unknown): Promise<unknown> {
    const p = params as {
      textDocument: { uri: string }
      range: Range
      context: { diagnostics: any[] }
    }

    const doc = this.getDocument(p.textDocument.uri)
    if (!doc) return { actions: [] }

    const selected = doc.split('\n').slice(p.range.start.line, p.range.end.line + 1).join('\n')

    return {
      actions: [
        {
          title: 'Lulu: Ask about selection',
          kind: 'refactor.extract',
          command: { title: 'Ask Lulu', command: 'lulu.ask', arguments: [selected] },
        },
        {
          title: 'Lulu: Explain',
          kind: 'refactor.extract',
          command: { title: 'Explain', command: 'lulu.explain', arguments: [selected] },
        },
        {
          title: 'Lulu: Fix',
          kind: 'quickfix',
          command: { title: 'Fix', command: 'lulu.fix', arguments: [selected] },
        },
        {
          title: 'Lulu: Refactor',
          kind: 'refactor',
          command: { title: 'Refactor', command: 'lulu.refactor', arguments: [selected] },
        },
      ],
    }
  }

  /**
   * Handle diagnostic - AI code analysis via Gateway
   */
  protected async onDiagnostic(params: unknown): Promise<unknown> {
    const p = params as { textDocument: { uri: string } }
    const doc = this.getDocument(p.textDocument.uri)

    if (!doc) return { kind: 'full', items: [] }

    if (this.gatewayAvailable) {
      try {
        const result = await this.queryGateway(`/review ${doc}`)
        // Parse result into diagnostics
        const diagnostics = this.parseDiagnostics(result.text || '', doc)
        return { kind: 'full', items: diagnostics }
      } catch {
        return { kind: 'full', items: [] }
      }
    }

    return { kind: 'full', items: [] }
  }

  /**
   * Execute Lulu command via Gateway
   */
  async executeCommand(command: string, selection: string): Promise<string | null> {
    if (!this.gatewayAvailable) {
      console.error('[LSP] Gateway not available')
      return null
    }

    let prompt = ''
    switch (command) {
      case 'lulu.ask':
        prompt = `/explain ${selection}`
        break
      case 'lulu.explain':
        prompt = `/explain ${selection}`
        break
      case 'lulu.fix':
        prompt = `/fix ${selection}`
        break
      case 'lulu.refactor':
        prompt = `/refactor ${selection}`
        break
      case 'lulu.generate':
        prompt = `/generate ${selection}`
        break
      default:
        return null
    }

    try {
      const result = await this.queryGateway(prompt, selection)
      return result.text
    } catch (err) {
      console.error('[LSP] Command failed:', err)
      return null
    }
  }

  // ── Helper Methods ───────────────────────────────────────────────────────

  private getBeforePrefix(doc: string, position: Position): string {
    const lines = doc.split('\n')
    const line = lines[position.line] || ''
    return line.slice(0, position.character)
  }

  private async getAgentCompletions(prefix: string, doc: string): Promise<string[]> {
    // Basic completions for triggers
    const triggers = ['/', '@', ':']
    if (triggers.some((t) => prefix.endsWith(t))) {
      return ['/ask', '/explain', '/fix', '/refactor', '/generate']
    }
    return []
  }

  private parseDiagnostics(text: string, doc: string): any[] {
    // Simple parsing - in real implementation, parse AI output into proper diagnostics
    const lines = doc.split('\n')
    const diagnostics: any[] = []

    // Extract issues from AI response
    const issueRegex = /(?:error|warning|fix):?\s*(?:line\s*)?(\d+)?[:\s]+(.+)/gi
    let match
    while ((match = issueRegex.exec(text)) !== null) {
      const lineNum = parseInt(match[1], 10) - 1 || 0
      diagnostics.push({
        range: {
          start: { line: lineNum, character: 0 },
          end: { line: lineNum, character: (lines[lineNum] || '').length },
        },
        message: match[2],
        severity: text.toLowerCase().includes('error') ? 1 : 2,
      })
    }

    return diagnostics
  }
}

// ── Entry Point ───────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const lsp = new LuluLSP()

if (args.includes('--tcp')) {
  const port = parseInt(args.find((a) => a.startsWith('--port='))?.split('=')[1] || '18790', 10)
  lsp.startTCP(port)
} else if (args.includes('--auto')) {
  lsp.startAuto()
} else {
  lsp.startStdio()
}