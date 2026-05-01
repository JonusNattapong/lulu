import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "path";
import type { AgentConfig, ModelProvider, MCPServer } from "../types/types.js";
import { buildSystemPrompt, type PromptBuildResult } from "./prompt.js";
import { initSecrets, registerSecret } from "./secrets.js";

export const PROVIDERS_DATA = JSON.parse(
  readFileSync(new URL("../providers/providers.json", import.meta.url), "utf-8"),
);

const CLAUDE_CONFIG_MAP: Record<string, string> = PROVIDERS_DATA.config_map;

export function getAvailableProviders(): ModelProvider[] {
  const claudeKeys = loadClaudeConfigKeys();
  const mergedEnv: Record<string, string | undefined> = { ...claudeKeys, ...process.env };
  
  return (Object.keys(PROVIDERS_DATA.defaults) as ModelProvider[]).filter(p => {
    const envKeyName = CLAUDE_CONFIG_MAP[p];
    return !!mergedEnv[envKeyName];
  });
}

export function loadClaudeConfigKeys(): Record<string, string> {
  const configPath = path.join(homedir(), ".lulu", "config.json");
  try {
    if (!existsSync(configPath)) return {};
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    const apiKeys: Record<string, string> = parsed?.apiKeys ?? {};
    const result: Record<string, string> = {};
    for (const [claudeKey, envName] of Object.entries(CLAUDE_CONFIG_MAP)) {
      if (apiKeys[claudeKey]) {
        result[envName] = apiKeys[claudeKey];
      }
    }
    return result;
  } catch {
    return {};
  }
}

function loadMCPServers(): MCPServer[] {
  const paths = [
    path.join(process.cwd(), ".lulu-mcp.json"),
    path.join(process.cwd(), "mcp-servers.json"),
    path.join(homedir(), ".lulu", "mcp-servers.json"),
  ];

  // Add Claude Desktop config path
  if (process.platform === "win32") {
    paths.push(path.join(process.env.APPDATA || "", "Claude", "claude_desktop_config.json"));
  } else {
    paths.push(path.join(homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json"));
  }
  
  const serverMap: Map<string, MCPServer> = new Map();
  
  for (const p of paths) {
    if (existsSync(p)) {
      try {
        const raw = readFileSync(p, "utf-8");
        const parsed = JSON.parse(raw);
        let serversArr: any[] = [];
        
        if (Array.isArray(parsed)) {
          serversArr = parsed;
        } else if (parsed.mcpServers) { // Claude style
          serversArr = Object.entries(parsed.mcpServers).map(([name, conf]: [string, any]) => ({
            name,
            command: conf.command,
            args: conf.args,
            env: conf.env,
          }));
        } else if (parsed.servers) { // Lulu style
          serversArr = parsed.servers;
        }

        for (const s of serversArr) {
          if (s.name && !serverMap.has(s.name)) {
            serverMap.set(s.name, s);
          }
        }
      } catch { /* Ignore */ }
    }
  }
  
  return Array.from(serverMap.values());
}

const DEFAULT_MODEL = "claude-3-5-sonnet-20241022";
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_SYSTEM_PROMPT = PROVIDERS_DATA.system_prompt;

// Exported for testing only
export function _parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
export function _loadClaudeConfigKeys(): Record<string, string> { return loadClaudeConfigKeys(); }
export function _loadMCPServers(): MCPServer[] { return loadMCPServers(); }

export function detectProject(): { projectName: string; projectRoot: string } {
  const projectRoot = process.cwd();
  let projectName = path.basename(projectRoot);

  try {
    const pkgPath = path.join(projectRoot, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.name) projectName = pkg.name;
    }
  } catch {
    // Ignore
  }

  return { projectName, projectRoot };
}

export function loadPromptBuild(env: NodeJS.ProcessEnv = process.env): PromptBuildResult {
  const { projectName, projectRoot } = detectProject();
  return buildSystemPrompt({
    basePrompt: DEFAULT_SYSTEM_PROMPT,
    env,
    projectName,
    projectRoot,
  });
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig | null {
  const claudeKeys = loadClaudeConfigKeys();
  const mergedEnv: Record<string, string | undefined> = { ...claudeKeys, ...env };

  // Register all known secrets for automatic redaction
  initSecrets();
  for (const val of Object.values(mergedEnv)) {
    if (val) registerSecret(val);
  }
  for (const val of Object.values(claudeKeys)) {
    if (val) registerSecret(val);
  }

  const { projectName, projectRoot } = detectProject();

  const providers = {} as Record<ModelProvider, { key?: string; defaultModel: string }>;
  for (const [p, data] of Object.entries(PROVIDERS_DATA.defaults)) {
    const provider = p as ModelProvider;
    const envKeyName = CLAUDE_CONFIG_MAP[provider];
    providers[provider] = {
      key: mergedEnv[envKeyName],
      defaultModel: (data as any).defaultModel,
    };
  }

  const selectedProvider = (env.LULU_PROVIDER as ModelProvider) ?? "claude";
  const config = providers[selectedProvider];

  // Load MCP servers
  const mcpServers = loadMCPServers();

  const { systemPrompt } = loadPromptBuild(env);

  if (!config || !config.key) {
    // If selected provider is not available, try to find the first one that has a key
    const firstAvailable = (Object.keys(providers) as ModelProvider[]).find(
      (p) => providers[p].key,
    );
    if (!firstAvailable) {
      return null; // Signals missing config for onboarding
    }
    return {
      provider: firstAvailable,
      model: env.LULU_MODEL ?? providers[firstAvailable].defaultModel,
      apiKey: providers[firstAvailable].key!,
      systemPrompt,
      maxTokens: parsePositiveInt(env.LULU_MAX_TOKENS, DEFAULT_MAX_TOKENS),
      projectName,
      projectRoot,
      mcpServers,
      channel: (env.LULU_CHANNEL as any) || "cli",
    };
  }

  return {
    provider: selectedProvider,
    model: env.LULU_MODEL ?? config.defaultModel,
    apiKey: config.key,
    systemPrompt,
    maxTokens: _parsePositiveInt(env.LULU_MAX_TOKENS, DEFAULT_MAX_TOKENS),
    projectName,
    projectRoot,
    mcpServers,
    channel: (env.LULU_CHANNEL as any) || "cli",
  };
}

// Internal helper, also exported for tests
export function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
