/**
 * Unit tests for Lulu LSP
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { LuluLSP } from './LuluLSP.js'

// Mock fetch globally
global.fetch = vi.fn()

describe('LuluLSP', () => {
  let lsp: LuluLSP

  beforeEach(() => {
    lsp = new LuluLSP()
    vi.clearAllMocks()
  })

  describe('getBeforePrefix', () => {
    it('returns text before cursor position', () => {
      const doc = 'const x = 1\nconst y = 2'
      const pos = { line: 0, character: 5 }
      // Using reflection to test private method
      const result = (lsp as any).getBeforePrefix(doc, pos)
      expect(result).toBe('const ')
    })

    it('returns empty string if character is 0', () => {
      const doc = 'hello'
      const pos = { line: 0, character: 0 }
      const result = (lsp as any).getBeforePrefix(doc, pos)
      expect(result).toBe('')
    })
  })

  describe('parseDiagnostics', () => {
    it('parses errors from text', () => {
      const text = 'error: line 5 undefined variable'
      const doc = 'line1\nline2\nline3\nline4\nline5\nline6'
      const result = (lsp as any).parseDiagnostics(text, doc)
      expect(result).toHaveLength(1)
      expect(result[0].message).toContain('undefined variable')
      expect(result[0].severity).toBe(1) // Error
    })

    it('parses warnings from text', () => {
      const text = 'warning: line 3 unused variable'
      const doc = 'line1\nline2\nline3\nline4'
      const result = (lsp as any).parseDiagnostics(text, doc)
      expect(result).toHaveLength(1)
      expect(result[0].severity).toBe(2) // Warning
    })

    it('returns empty array for no issues', () => {
      const text = 'No issues found'
      const doc = 'code here'
      const result = (lsp as any).parseDiagnostics(text, doc)
      expect(result).toEqual([])
    })
  })

  describe('getAgentCompletions', () => {
    it('returns Lulu commands for trigger characters', async () => {
      const result = await (lsp as any).getAgentCompletions('/ ', '')
      expect(result).toContain('/ask')
      expect(result).toContain('/explain')
      expect(result).toContain('/fix')
      expect(result).toContain('/refactor')
    })

    it('returns empty array without trigger', async () => {
      const result = await (lsp as any).getAgentCompletions('console.', '')
      expect(result).toEqual([])
    })
  })

  describe('document management', () => {
    it('stores document on didOpen', () => {
      const params = {
        textDocument: {
          uri: 'file:///test.js',
          languageId: 'javascript',
          version: 1,
          text: 'const x = 1',
        },
      }
      ;(lsp as any).onDidOpen(params)
      expect((lsp as any).documents.get('file:///test.js')).toBe('const x = 1')
    })

    it('updates document on didChange', () => {
      ;(lsp as any).documents.set('file:///test.js', 'old')
      const params = {
        textDocument: { uri: 'file:///test.js', version: 2 },
        contentChanges: [{ text: 'new' }],
      }
      ;(lsp as any).onDidChange(params)
      expect((lsp as any).documents.get('file:///test.js')).toBe('new')
    })

    it('removes document on didClose', () => {
      ;(lsp as any).documents.set('file:///test.js', 'content')
      const params = { textDocument: { uri: 'file:///test.js' } }
      ;(lsp as any).onDidClose(params)
      expect((lsp as any).documents.has('file:///test.js')).toBe(false)
    })
  })

  describe('getLanguage', () => {
    it('extracts language from file extension', () => {
      expect((lsp as any).getLanguage('file:///test.ts')).toBe('typescript')
      expect((lsp as any).getLanguage('file:///test.py')).toBe('python')
      expect((lsp as any).getLanguage('file:///test.go')).toBe('go')
      expect((lsp as any).getLanguage('file:///test.rs')).toBe('rust')
    })
  })

  describe('onCompletion', () => {
    it('returns Lulu commands for slash trigger', async () => {
      const params = {
        textDocument: { uri: 'file:///test.js' },
        position: { line: 0, character: 0 },
      }
      ;(lsp as any).documents.set('file:///test.js', '/ ')
      const result = await (lsp as any).onCompletion(params)
      expect(result.isIncomplete).toBe(false)
      expect(result.items).toContainEqual(expect.objectContaining({ label: '/ask' }))
    })
  })

  describe('onCodeAction', () => {
    it('returns Lulu actions for selected code', async () => {
      const params = {
        textDocument: { uri: 'file:///test.js' },
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
        context: { diagnostics: [] },
      }
      ;(lsp as any).documents.set('file:///test.js', 'selected code here')
      const result = await (lsp as any).onCodeAction(params)
      expect(result.actions).toContainEqual(
        expect.objectContaining({ title: 'Lulu: Ask about selection' }),
      )
      expect(result.actions).toContainEqual(
        expect.objectContaining({ title: 'Lulu: Fix' }),
      )
    })
  })

  describe('queryGateway', () => {
    it('calls gateway API with correct payload', async () => {
      const mockResponse = { text: 'response', sessionId: 'abc123' }
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })

      const result = await (lsp as any).queryGateway('test prompt')
      expect(result).toEqual(mockResponse)
      expect((lsp as any).sessionId).toBe('abc123')
    })

    it('includes sessionId if already set', async () => {
      ;(lsp as any).sessionId = 'existing'
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ text: 'ok' }),
      })

      await (lsp as any).queryGateway('prompt')
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/prompt'),
        expect.objectContaining({
          body: expect.stringContaining('"sessionId":"existing"'),
        }),
      )
    })

    it('throws on gateway error', async () => {
      ;(global.fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
      })

      await expect((lsp as any).queryGateway('test')).rejects.toThrow('Gateway error')
    })
  })
})