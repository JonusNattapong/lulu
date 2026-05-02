import type { MessageParam } from "@anthropic-ai/sdk/resources/index.js";
import { runAgent } from "./agent.js";
import { commandRegistry } from "./commands.js";
import { ConfigResolver } from "./config_resolver.js";
import { identityManager, type BindingType } from "./identity.js";
import { loadPromptBuild } from "./config.js";
import { SessionManager, type SessionChannel, type SessionRecord } from "./session.js";
import type { AgentConfig } from "../types/types.js";

export interface GatewayRoute {
  channel: SessionChannel;
  subjectId: string;
  prompt: string;
  title?: string;
  sessionId?: string;
  context?: MessageParam[];
  metadata?: Record<string, unknown>;
  env?: NodeJS.ProcessEnv;
  sessionOverrides?: Partial<AgentConfig>;
  requestOverrides?: Partial<AgentConfig>;
  onToken?: (text: string) => void;
  queueKey?: string;
}

export interface GatewayResult {
  text: string;
  session: SessionRecord;
  messages: MessageParam[];
  command: boolean;
}

export class Gateway {
  private readonly queues = new Map<string, Promise<GatewayResult>>();

  constructor(readonly sessionManager = new SessionManager()) {}

  route(request: GatewayRoute): Promise<GatewayResult> {
    const key = request.queueKey || `${request.channel}:${request.subjectId}`;
    const previous = this.queues.get(key) || Promise.resolve(undefined as unknown as GatewayResult);
    const next = previous
      .catch(() => undefined as unknown as GatewayResult)
      .then(() => this.execute(request));
    this.queues.set(key, next);
    next.finally(() => {
      if (this.queues.get(key) === next) this.queues.delete(key);
    }).catch(() => undefined);
    return next;
  }

  private async execute(request: GatewayRoute): Promise<GatewayResult> {
    const config = ConfigResolver.resolve({
      env: { ...process.env, ...(request.env || {}), LULU_CHANNEL: request.channel },
      sessionOverrides: request.sessionOverrides,
      requestOverrides: request.requestOverrides,
    });
    config.systemPrompt = loadPromptBuild({
      ...process.env,
      ...(request.env || {}),
      LULU_CHANNEL: request.channel,
      LULU_PROMPT_QUERY: request.prompt,
    }).systemPrompt;

    const session = this.resolveSession(request, config);
    const prompt = request.prompt.trim();

    if (prompt.startsWith("/")) {
      const command = await commandRegistry.handle(prompt, {
        sessionId: session.id,
        channel: request.channel,
        config,
        sessionManager: this.sessionManager,
      });
      if (command) {
        return {
          text: command.text,
          session,
          messages: session.messages,
          command: true,
        };
      }
    }

    if (!config.apiKey) {
      return {
        text: "Lulu API key is missing.",
        session,
        messages: session.messages,
        command: false,
      };
    }

    let streamedText = "";
    const history = request.context?.length ? request.context : session.messages;
    const result = await runAgent(config, prompt, history, (text) => {
      streamedText += text;
      request.onToken?.(text);
    });
    const savedSession = this.sessionManager.saveMessages(session.id, result.messages, config);

    return {
      text: result.finalText || streamedText || "Done.",
      session: savedSession,
      messages: result.messages,
      command: false,
    };
  }

  private resolveSession(request: GatewayRoute, config: AgentConfig): SessionRecord {
    const identityMetadata = this.resolveIdentityMetadata(request);
    const metadata = { ...identityMetadata, ...(request.metadata || {}) };

    if (request.sessionId) {
      const existing = this.sessionManager.get(request.sessionId);
      if (existing) return existing;
      return this.sessionManager.getOrCreate({
        channel: request.channel,
        subjectId: request.sessionId,
        title: request.title,
        config,
        metadata,
      });
    }

    return this.sessionManager.getOrCreate({
      channel: request.channel,
      subjectId: request.subjectId,
      title: request.title,
      config,
      metadata,
    });
  }

  private resolveIdentityMetadata(request: GatewayRoute): Record<string, unknown> {
    const bindingType = channelToBindingType(request.channel);
    if (!bindingType) return {};
    const binding = identityManager.findBinding(bindingType, request.subjectId);
    if (!binding?.enabled) return {};
    const user = identityManager.getUser(binding.userId);
    return {
      identityUserId: user?.id || binding.userId,
      identityRole: user?.role,
      identityBindingId: binding.id,
      identityAgentId: binding.agentId,
      identityProjectId: binding.projectId,
    };
  }
}

export const gateway = new Gateway();

function channelToBindingType(channel: SessionChannel): BindingType | null {
  if (channel === "telegram") return "telegram";
  if (channel === "api") return "api";
  if (channel === "dashboard") return "desktop";
  if (channel === "cli") return "cli";
  return null;
}
