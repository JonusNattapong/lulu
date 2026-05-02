import type { MessageParam } from "@anthropic-ai/sdk/resources/index.js";

export interface ToolDef {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ModelProvider =
  | "claude"
  | "openai"
  | "google"
  | "kilocode"
  | "opencode"
  | "openrouter"
  | "cline"
  | "mistral"
  | "copilot"
  | "deepseek";

export type SubAgentStatus = "pending" | "running" | "done" | "failed" | "aborted";

export interface SubAgent {
  id: string;
  name: string;
  status: SubAgentStatus;
  parentId: string;
  prompt: string;
  config: AgentConfig;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  error?: string;
}

export interface SubAgentResult {
  id: string;
  text: string;
  messages: MessageParam[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costEstimate: number;
  };
}

export interface MCPServer {
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  transport?: "stdio" | "http";
  url?: string;
}

export interface AgentConfig {
  provider: ModelProvider;
  model: string;
  apiKey: string;
  systemPrompt: string;
  maxTokens: number;
  projectName?: string;
  projectRoot?: string;
  mcpServers?: MCPServer[];
  channel?: "cli" | "api" | "telegram" | "dashboard" | "subagent" | "system";
}

export interface ToolTraceEntry {
  tool: string;
  input: Record<string, unknown>;
  output: string;
  isError: boolean;
  durationMs?: number;
  timestamp: string;
}

export interface TrajectoryTurn {
  turnIndex: number;
  prompt: string;
  responseText: string;
  toolCalls: ToolTraceEntry[];
  tokensUsed: number;
  costEstimate: number;
}

export interface TrajectoryExport {
  id: string;
  exportedAt: string;
  sessionId: string;
  channel: string;
  projectName?: string;
  provider: string;
  model: string;
  turns: TrajectoryTurn[];
  totalTokens: number;
  totalCost: number;
  metadata?: Record<string, unknown>;
}

export interface TrajectoryFilter {
  sessionId?: string;
  channel?: string;
  projectName?: string;
  fromDate?: string;
  toDate?: string;
  minTurns?: number;
  maxTurns?: number;
}

// --- Execution Backends ---

export type ExecutionBackendType = "local" | "tmux" | "docker" | "ssh";

export type ExecutionStatus = "pending" | "running" | "done" | "failed" | "cancelled";

export interface ExecutionRequest {
  id: string;
  backend: ExecutionBackendType;
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  userId?: string;
  projectId?: string;
}

export interface ExecutionResult {
  id: string;
  status: ExecutionStatus;
  exitCode?: number;
  stdout: string;
  stderr: string;
  durationMs?: number;
  startedAt?: string;
  endedAt?: string;
  error?: string;
}

export interface ExecutionBackend {
  type: ExecutionBackendType;
  name: string;
  description: string;
  available: boolean;
  execute(req: ExecutionRequest): Promise<ExecutionResult>;
  abort(id: string): boolean;
  status(id: string): ExecutionResult | null;
}

// --- Phase 6: Autonomous Agent ---

export type CoordinationTaskStatus = "pending" | "running" | "done" | "failed" | "cancelled";
export type SubAgentTaskStatus = "pending" | "running" | "done" | "failed";

export interface SubAgentTask {
  id: string;
  title: string;
  prompt: string;
  dependsOn: string[]; // task IDs this task depends on
  status: SubAgentTaskStatus;
  agentId?: string;
  result?: SubAgentResult;
  createdAt: string;
  endedAt?: string;
  error?: string;
}

export interface CoordinatorTask {
  id: string;
  title: string;
  description?: string;
  subTasks: SubAgentTask[];
  status: CoordinationTaskStatus;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  aggregatedResult?: string;
}

export interface NotificationPayload {
  title: string;
  body: string;
  source: "agent" | "scheduler" | "coordinator" | "daemon" | "proactive";
  priority: "low" | "medium" | "high";
  timestamp: string;
}

export interface AlwaysOnConfig {
  enabled: boolean;
  intervalMs: number;
  autoTasks: string[]; // task IDs from scheduler to run automatically
  notifications: {
    telegram: boolean;
    desktop: boolean;
  };
  memoryGrowthReview: boolean;
}

export interface AlwaysOnStatus {
  enabled: boolean;
  running: boolean;
  intervalMs: number;
  lastTick?: string;
  nextTick?: string;
  tasksRun: number;
  notificationsSent: number;
}
