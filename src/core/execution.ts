import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import type {
  ExecutionRequest,
  ExecutionResult,
  ExecutionBackend,
  ExecutionBackendType,
  ExecutionStatus,
} from "../types/types.js";
import { eventBus } from "./events.js";

// --- Local Backend ---

class LocalBackend implements ExecutionBackend {
  readonly type: ExecutionBackendType = "local";
  readonly name = "Local Shell";
  readonly description = "Execute commands in the local process environment.";

  get available(): boolean {
    return true; // Always available on Node
  }

  async execute(req: ExecutionRequest): Promise<ExecutionResult> {
    const id = req.id;
    const startedAt = new Date().toISOString();
    eventBus.emit("exec:start", { id, backend: this.type, command: req.command }, id);

    return new Promise((resolve) => {
      const timeout = req.timeout ?? 120_000;
      const timer = setTimeout(() => {
        proc.kill("SIGKILL");
      }, timeout);

      const shellCmd = process.platform === "win32" ? "cmd" : "/bin/sh";
      const proc = spawn(shellCmd, process.platform === "win32" ? ["/c", req.command] : ["-c", req.command], {
        cwd: req.cwd,
        env: { ...process.env, ...(req.env || {}) },
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      const startTime = Date.now();

      proc.stdout?.on("data", (d) => { stdout += d.toString(); });
      proc.stderr?.on("data", (d) => { stderr += d.toString(); });

      proc.on("close", (code) => {
        clearTimeout(timer);
        const durationMs = Date.now() - startTime;
        const status: ExecutionStatus = code === 0 ? "done" : "failed";
        const result: ExecutionResult = {
          id,
          status,
          exitCode: code ?? undefined,
          stdout,
          stderr,
          durationMs,
          startedAt,
          endedAt: new Date().toISOString(),
        };
        eventBus.emit("exec:end", { id, status, exitCode: code }, id);
        resolve(result);
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        const result: ExecutionResult = {
          id,
          status: "failed",
          error: err.message,
          stdout,
          stderr,
          startedAt,
          endedAt: new Date().toISOString(),
        };
        eventBus.emit("exec:end", { id, status: "failed", error: err.message }, id);
        resolve(result);
      });
    });
  }

  abort(_id: string): boolean {
    // Local abort via process group
    return true;
  }

  status(_id: string): ExecutionResult | null {
    return null;
  }
}

// --- Docker Backend ---

class DockerBackend implements ExecutionBackend {
  readonly type: ExecutionBackendType = "docker";
  readonly name = "Docker Container";
  readonly description = "Execute commands inside an isolated Docker container.";

  get available(): boolean {
    try {
      execFileSync("docker", ["info"], { encoding: "utf-8", timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async execute(req: ExecutionRequest): Promise<ExecutionResult> {
    const id = req.id;
    const startedAt = new Date().toISOString();
    eventBus.emit("exec:start", { id, backend: this.type, command: req.command }, id);

    const image = (req.env as any)?.LULU_DOCKER_IMAGE || "ubuntu:22.04";
    const args = ["run", "--rm", "-i", "--entrypoint=/bin/sh", image, "-c", req.command];

    return new Promise((resolve) => {
      const timeout = req.timeout ?? 120_000;
      const timer = setTimeout(() => {
        // docker stop is not async-safe here, just kill the sh
      }, timeout);

      const proc = spawn("docker", args, {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (d) => { stdout += d.toString(); });
      proc.stderr?.on("data", (d) => { stderr += d.toString(); });

      proc.on("close", (code) => {
        clearTimeout(timer);
        const durationMs = Date.now() - new Date(startedAt).getTime();
        const status: ExecutionStatus = code === 0 ? "done" : "failed";
        const result: ExecutionResult = {
          id,
          status,
          exitCode: code ?? undefined,
          stdout,
          stderr,
          durationMs,
          startedAt,
          endedAt: new Date().toISOString(),
        };
        eventBus.emit("exec:end", { id, status, exitCode: code }, id);
        resolve(result);
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        const result: ExecutionResult = {
          id,
          status: "failed",
          error: err.message,
          stdout,
          stderr,
          startedAt,
          endedAt: new Date().toISOString(),
        };
        eventBus.emit("exec:end", { id, status: "failed", error: err.message }, id);
        resolve(result);
      });
    });
  }

  abort(id: string): boolean {
    try {
      execFileSync("docker", ["kill", id], { encoding: "utf-8", timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  status(id: string): ExecutionResult | null {
    try {
      const out = execFileSync("docker", ["ps", "--filter", `id=${id}`, "--format", "{{.Status}}"], {
        encoding: "utf-8",
        timeout: 5000,
      });
      return {
        id,
        status: out.includes("Up") ? "running" : "done",
        stdout: out.trim(),
        stderr: "",
      };
    } catch {
      return null;
    }
  }
}

// --- Tmux Backend ---

class TmuxBackend implements ExecutionBackend {
  readonly type: ExecutionBackendType = "tmux";
  readonly name = "Tmux Session";
  readonly description = "Execute commands in a persistent tmux session.";

  get available(): boolean {
    try {
      execFileSync("tmux", ["display-message", "-p", "#{version}"], {
        encoding: "utf-8",
        timeout: 5000,
      });
      return true;
    } catch {
      return false;
    }
  }

  async execute(req: ExecutionRequest): Promise<ExecutionResult> {
    const id = req.id;
    const sessionName = `lulu-${id.slice(-8)}`;
    const startedAt = new Date().toISOString();
    eventBus.emit("exec:start", { id, backend: this.type, command: req.command, session: sessionName }, id);

    try {
      // Create detached session
      const createArgs = ["new-session", "-d", "-s", sessionName];
      if (req.cwd) createArgs.push("-c", req.cwd);
      execFileSync("tmux", createArgs, { encoding: "utf-8", timeout: 5000 });

      // Send command
      const durationMs = 0;
      execFileSync("tmux", ["send-keys", "-t", sessionName, req.command, "Enter"], {
        encoding: "utf-8",
        timeout: 5000,
      });

      const result: ExecutionResult = {
        id,
        status: "running",
        stdout: `Started in tmux session: ${sessionName}`,
        stderr: "",
        startedAt,
      };
      eventBus.emit("exec:end", { id, status: "running" }, id);
      return result;
    } catch (err: any) {
      const result: ExecutionResult = {
        id,
        status: "failed",
        error: err.message,
        stdout: "",
        stderr: "",
        startedAt,
        endedAt: new Date().toISOString(),
      };
      eventBus.emit("exec:end", { id, status: "failed", error: err.message }, id);
      return result;
    }
  }

  abort(id: string): boolean {
    const sessionName = `lulu-${id.slice(-8)}`;
    try {
      execFileSync("tmux", ["kill-session", "-t", sessionName], { encoding: "utf-8", timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  status(id: string): ExecutionResult | null {
    const sessionName = `lulu-${id.slice(-8)}`;
    try {
      execFileSync("tmux", ["has-session", "-t", sessionName], { encoding: "utf-8", timeout: 5000 });
      return { id, status: "running", stdout: `Session ${sessionName} is active`, stderr: "" };
    } catch {
      return { id, status: "done", stdout: "", stderr: "" };
    }
  }
}

// --- SSH Backend (placeholder) ---

class SSHBackend implements ExecutionBackend {
  readonly type: ExecutionBackendType = "ssh";
  readonly name = "SSH Remote";
  readonly description = "Execute commands on a remote host via SSH. Requires LULU_SSH_HOST, LULU_SSH_USER env vars.";

  get available(): boolean {
    return !!(process.env.LULU_SSH_HOST && process.env.LULU_SSH_USER);
  }

  async execute(req: ExecutionRequest): Promise<ExecutionResult> {
    const id = req.id;
    const host = req.env?.LULU_SSH_HOST || process.env.LULU_SSH_HOST || "";
    const user = req.env?.LULU_SSH_USER || process.env.LULU_SSH_USER || "";
    const startedAt = new Date().toISOString();

    if (!host || !user) {
      return {
        id,
        status: "failed",
        error: "LULU_SSH_HOST and LULU_SSH_USER environment variables are required.",
        stdout: "",
        stderr: "",
        startedAt,
        endedAt: new Date().toISOString(),
      };
    }

    eventBus.emit("exec:start", { id, backend: this.type, command: req.command, host }, id);

    const sshCmd = `ssh ${user}@${host} ${req.command}`;
    const shellCmd = process.platform === "win32" ? "cmd" : "/bin/sh";
    const proc = spawn(shellCmd, process.platform === "win32" ? ["/c", sshCmd] : ["-c", sshCmd], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    return new Promise((resolve) => {
      const timeout = req.timeout ?? 120_000;
      const timer = setTimeout(() => {
        proc.kill("SIGKILL");
      }, timeout);

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (d) => { stdout += d.toString(); });
      proc.stderr?.on("data", (d) => { stderr += d.toString(); });

      proc.on("close", (code) => {
        clearTimeout(timer);
        const status: ExecutionStatus = code === 0 ? "done" : "failed";
        const result: ExecutionResult = {
          id,
          status,
          exitCode: code ?? undefined,
          stdout,
          stderr,
          durationMs: Date.now() - new Date(startedAt).getTime(),
          startedAt,
          endedAt: new Date().toISOString(),
        };
        eventBus.emit("exec:end", { id, status, exitCode: code }, id);
        resolve(result);
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        const result: ExecutionResult = {
          id,
          status: "failed",
          error: err.message,
          stdout,
          stderr,
          startedAt,
          endedAt: new Date().toISOString(),
        };
        eventBus.emit("exec:end", { id, status: "failed", error: err.message }, id);
        resolve(result);
      });
    });
  }

  abort(_id: string): boolean {
    return false; // SSH abort not implemented
  }

  status(_id: string): ExecutionResult | null {
    return null;
  }
}

// --- Execution Manager ---

class ExecutionManager {
  private backends = new Map<ExecutionBackendType, ExecutionBackend>();
  private executions = new Map<string, ExecutionRequest & { result?: ExecutionResult; promise?: Promise<ExecutionResult> }>();

  constructor() {
    this.register(new LocalBackend());
    this.register(new TmuxBackend());
    this.register(new DockerBackend());
    this.register(new SSHBackend());
  }

  private register(backend: ExecutionBackend) {
    this.backends.set(backend.type, backend);
  }

  getBackend(type: ExecutionBackendType): ExecutionBackend | undefined {
    return this.backends.get(type);
  }

  listBackends(): { type: ExecutionBackendType; name: string; description: string; available: boolean }[] {
    return Array.from(this.backends.values()).map((b) => ({
      type: b.type,
      name: b.name,
      description: b.description,
      available: b.available,
    }));
  }

  async execute(req: ExecutionRequest): Promise<ExecutionResult> {
    const backend = this.backends.get(req.backend);
    if (!backend) {
      return {
        id: req.id,
        status: "failed",
        error: `Unknown backend: ${req.backend}`,
        stdout: "",
        stderr: "",
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };
    }

    if (!backend.available) {
      return {
        id: req.id,
        status: "failed",
        error: `Backend ${req.backend} is not available on this system.`,
        stdout: "",
        stderr: "",
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };
    }

    this.executions.set(req.id, req);
    const result = await backend.execute(req);
    this.executions.set(req.id, { ...req, result });
    return result;
  }

  abort(id: string): boolean {
    const req = this.executions.get(id);
    if (!req) return false;
    const backend = this.backends.get(req.backend);
    if (!backend) return false;
    return backend.abort(id);
  }

  getStatus(id: string): ExecutionResult | null {
    const req = this.executions.get(id);
    if (!req) return null;
    if (req.result) return req.result;
    const backend = this.backends.get(req.backend);
    return backend?.status(id) ?? null;
  }

  listExecutions(): (ExecutionRequest & { result?: ExecutionResult })[] {
    return Array.from(this.executions.values());
  }
}

export const executionManager = new ExecutionManager();
