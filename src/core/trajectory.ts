import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "fs";
import { homedir } from "os";
import path from "path";
import { SessionManager } from "./session.js";
import type { TrajectoryExport, TrajectoryFilter, TrajectoryTurn, ToolTraceEntry } from "../types/types.js";

const EXPORT_DIR = path.join(homedir(), ".lulu", "trajectories");

function ensureDir() {
  if (!existsSync(EXPORT_DIR)) mkdirSync(EXPORT_DIR, { recursive: true });
}

function loadHistoryLog(): any[] {
  const logPath = path.join(homedir(), ".lulu", "history.jsonl");
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line); }
      catch { return null; }
    })
    .filter(Boolean);
}

export function exportTrajectory(
  sessionId?: string,
  filter?: TrajectoryFilter,
): TrajectoryExport[] {
  const sessionManager = new SessionManager();
  const history = loadHistoryLog();
  ensureDir();

  const exports: TrajectoryExport[] = [];

  if (sessionId) {
    // Export specific session
    const session = sessionManager.get(sessionId);
    if (session) {
      exports.push(buildExport(session, history, filter));
    }
  } else {
    // Export filtered sessions
    const sessions = sessionManager.list();
    for (const session of sessions) {
      if (filterChannel(session, filter) && filterProject(session, filter)) {
        exports.push(buildExport(session, history, filter));
      }
    }
  }

  return exports;
}

function buildExport(
  session: ReturnType<SessionManager["get"]> & { id: string },
  history: any[],
  filter?: TrajectoryFilter,
): TrajectoryExport {
  // Find matching history entries
  const historyEntries = history.filter(h =>
    (h.sessionId === session.id || h.projectName === session.projectName) &&
    filterMinMax(h, filter)
  );

  const turns: TrajectoryTurn[] = [];
  let totalTokens = 0;
  let totalCost = 0;

  // Build turns from session messages (assistant/user pairs)
  const messages = session.messages || [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === "user") {
      const turnIndex = Math.floor(i / 2);
      const toolCalls: ToolTraceEntry[] = [];

      // Look for tool results following this user message
      let j = i + 1;
      let responseText = "";
      while (j < messages.length) {
        const next = messages[j];
        if (next.role === "assistant") {
          const content = next.content;
          if (typeof content === "string") {
            responseText = content;
          } else if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === "text") responseText = block.text;
            }
          }
        } else if ((next as any).role === "tool_result") {
          const content = (next as any).content;
          const toolEntry: ToolTraceEntry = {
            tool: "tool_result",
            input: {},
            output: typeof content === "string" ? content : JSON.stringify(content),
            isError: (content as any)?.is_error ?? false,
            timestamp: new Date().toISOString(),
          };
          toolCalls.push(toolEntry);
        }
        j++;
      }

      const histEntry = historyEntries[turnIndex];
      const tokensUsed = histEntry?.usage?.totalTokens || 0;
      const costEstimate = histEntry?.usage?.costEstimate || 0;
      totalTokens += tokensUsed;
      totalCost += costEstimate;

      turns.push({
        turnIndex,
        prompt: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
        responseText,
        toolCalls,
        tokensUsed,
        costEstimate,
      });
    }
  }

  return {
    id: `traj-${Date.now()}-${session.id.replace(/[^a-z0-9]/gi, "-")}`,
    exportedAt: new Date().toISOString(),
    sessionId: session.id,
    channel: session.channel,
    projectName: session.projectName,
    provider: session.provider || "unknown",
    model: session.model || "unknown",
    turns,
    totalTokens,
    totalCost,
    metadata: {
      turnCount: session.turnCount,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    },
  };
}

function filterChannel(session: any, filter?: TrajectoryFilter): boolean {
  if (!filter?.channel) return true;
  return session.channel === filter.channel;
}

function filterProject(session: any, filter?: TrajectoryFilter): boolean {
  if (!filter?.projectName) return true;
  return session.projectName === filter.projectName;
}

function filterMinMax(entry: any, filter?: TrajectoryFilter): boolean {
  const turns = entry.usage?.totalTurns || 0;
  if (filter?.minTurns && turns < filter.minTurns) return false;
  if (filter?.maxTurns && turns > filter.maxTurns) return false;
  return true;
}

export function saveExportToFile(
  exports: TrajectoryExport[],
  format: "json" | "jsonl" = "json",
): string[] {
  ensureDir();
  const paths: string[] = [];

  for (const exp of exports) {
    const filename = `${exp.sessionId.replace(/[^a-z0-9]/gi, "-")}-${Date.now()}.${format === "jsonl" ? "jsonl" : "json"}`;
    const filePath = path.join(EXPORT_DIR, filename);

    if (format === "jsonl") {
      writeFileSync(filePath, JSON.stringify(exp) + "\n", "utf-8");
    } else {
      writeFileSync(filePath, JSON.stringify(exp, null, 2), "utf-8");
    }
    paths.push(filePath);
  }

  return paths;
}

export function listExportedTrajectories(): { path: string; size: number; createdAt: string }[] {
  ensureDir();
  return readdirSync(EXPORT_DIR)
    .filter((f: string) => f.endsWith(".json") || f.endsWith(".jsonl"))
    .map((f: string) => {
      const s = statSync(path.join(EXPORT_DIR, f));
      return { path: path.join(EXPORT_DIR, f), size: s.size, createdAt: s.mtime.toISOString() };
    })
    .sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt));
}

export function loadTrajectoryFile(filePath: string): TrajectoryExport[] {
  const content = readFileSync(filePath, "utf-8");
  if (filePath.endsWith(".jsonl")) {
    return content.split("\n").filter(Boolean).map(line => JSON.parse(line));
  }
  return [JSON.parse(content)];
}
