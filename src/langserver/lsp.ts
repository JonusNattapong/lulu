/**
 * Minimal LSP Server Core
 * JSON-RPC 2.0 over stdio for Language Server Protocol.
 */

import { createServer } from "node:net";

export interface LSPRequest {
  jsonrpc: "2.0";
  id: number | string | null;
  method: string;
  params?: unknown;
}

export interface LSPResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

type RequestHandler = (params: unknown) => Promise<unknown>;
type NotificationHandler = (params: unknown) => void;

export abstract class LSPBase {
  protected documents = new Map<string, string>();
  protected rootUri: string | null = null;
  protected workspaceFolders: string[] = [];
  protected initialized = false;

  protected handlers = new Map<string, RequestHandler>();
  protected notificationHandlers = new Map<string, NotificationHandler>();

  constructor() {
    this.register("initialize", async (params) => this.initialize(params));
    this.register("shutdown", async () => null);
    this.registerNotification("initialized", (params) => this.onInitialized(params));
    this.registerNotification("textDocument/didOpen", (params) => this.onDidOpen(params));
    this.registerNotification("textDocument/didChange", (params) => this.onDidChange(params));
    this.registerNotification("textDocument/didClose", (params) => this.onDidClose(params));
    this.registerNotification("workspace/didChangeWorkspaceFolders", (params) => this.onWorkspaceFoldersChanged(params));
    this.register("textDocument/hover", async (params) => this.onHover(params));
    this.register("textDocument/completion", async (params) => this.onCompletion(params));
    this.register("textDocument/codeAction", async (params) => this.onCodeAction(params));
    this.register("textDocument/diagnostic", async (params) => this.onDiagnostic(params));
    this.register("workspace/workspaceFolders", async () => this.workspaceFolders);
    this.register("$/cancelRequest", async () => null);
  }

  protected register(method: string, handler: RequestHandler) {
    this.handlers.set(method, handler);
  }

  protected registerNotification(method: string, handler: NotificationHandler) {
    this.notificationHandlers.set(method, handler);
  }

  // ── Stdio transport ─────────────────────────────────────────────────────────

  startStdio(): void {
    let buffer = "";
    process.stdin.setEncoding("utf-8");

    process.stdin.on("data", (chunk: string) => {
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line) as LSPRequest;
          this.handleMessage(msg);
        } catch {
          // skip malformed
        }
      }
    });

    process.on("SIGINT", () => process.exit(0));
    process.on("SIGTERM", () => process.exit(0));
  }

  // ── TCP transport ───────────────────────────────────────────────────────────

  startTCP(port: number): void {
    createServer((socket) => {
      let buffer = "";
      socket.setEncoding("utf-8");
      socket.on("data", (chunk: string) => {
        buffer += chunk;
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line) as LSPRequest;
            this.handleMessage(msg, (resp) => socket.write(JSON.stringify(resp) + "\n"));
          } catch {
            // skip
          }
        }
      });
    }).listen(port, () => {
      console.error(`[LSP] TCP listening on port ${port}`);
    });
  }

  // ── Message handling ────────────────────────────────────────────────────────

  private handleMessage(msg: LSPRequest, replyFn?: (r: LSPResponse) => void): void {
    const send = (resp: unknown) => {
      if (replyFn) replyFn(resp as LSPResponse);
      else if (msg.id !== null && msg.id !== undefined) console.log(JSON.stringify(resp));
    };

    if (msg.id === null || msg.id === undefined) {
      // Notification
      const h = this.notificationHandlers.get(msg.method);
      if (h) { try { h(msg.params); } catch {} }
      return;
    }

    // Request
    const h = this.handlers.get(msg.method);
    if (!h) {
      send({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } });
      return;
    }

    h(msg.params)
      .then((result) => send({ jsonrpc: "2.0", id: msg.id, result }))
      .catch((err: Error) => send({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: err.message } }));
  }

  // ── Initialize ───────────────────────────────────────────────────────────────

  private async initialize(params: unknown): Promise<Record<string, unknown>> {
    const p = params as any;
    this.rootUri = p.rootUri || p.rootPath || null;
    this.workspaceFolders = p.workspaceFolders || [];
    this.initialized = true;
    return {
      capabilities: {
        textDocumentSync: 2, // Full
        hoverProvider: true,
        completionProvider: { resolveProvider: false, triggerCharacters: [".", ">", "::", "@", "#", "/"] },
        codeActionProvider: { codeActionKinds: ["quickfix", "refactor", "source.organizeImports"] },
        diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false },
        workspace: { workspaceFolders: true },
      },
      serverInfo: { name: "Lulu LSP", version: "0.0.1" },
    };
  }

  private onInitialized(_params: unknown): void {
    // Client ready
  }

  // ── Document management ─────────────────────────────────────────────────────

  protected getDocument(uri: string): string | undefined {
    return this.documents.get(uri);
  }

  protected getLanguage(uri: string): string {
    const ext = uri.split(".").pop()?.toLowerCase() || "";
    const map: Record<string, string> = {
      ts: "typescript", tsx: "typescript",
      js: "javascript", jsx: "javascript",
      py: "python", rs: "rust", go: "go", java: "java",
      c: "c", cpp: "cpp", cs: "csharp", rb: "ruby",
      md: "markdown", json: "json", yaml: "yaml", yml: "yaml",
      html: "html", css: "css", scss: "scss",
      sh: "shell", bash: "shell",
    };
    return map[ext] || ext;
  }

  // ── Override these in subclass ─────────────────────────────────────────────

  protected onDidOpen(_params: unknown): void {}
  protected onDidChange(_params: unknown): void {}
  protected onDidClose(_params: unknown): void {}
  protected onWorkspaceFoldersChanged(_params: unknown): void {}

  protected async onHover(_params: unknown): Promise<unknown> { return null; }
  protected async onCompletion(_params: unknown): Promise<unknown> { return null; }
  protected async onCodeAction(_params: unknown): Promise<unknown> { return null; }
  protected async onDiagnostic(_params: unknown): Promise<unknown> { return null; }
}
