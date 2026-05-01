import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "path";
import type { AgentConfig, ModelProvider, MCPServer } from "./types.js";

const PROVIDERS_DATA = JSON.parse(
  readFileSync(new URL("./providers.json", import.meta.url), "utf-8"),
);

const CLAUDE_CONFIG_MAP: Record<string, string> = PROVIDERS_DATA.config_map;

function loadClaudeConfigKeys(): Record<string, string> {
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
  const globalPath = path.join(homedir(), ".lulu", "mcp-servers.json");
  const localPath = path.join(process.cwd(), ".lulu-mcp.json");
  
  const servers: MCPServer[] = [];
  
  for (const p of [globalPath, localPath]) {
    if (existsSync(p)) {
      try {
        const raw = readFileSync(p, "utf-8");
        const parsed = JSON.parse(raw);
        const arr = Array.isArray(parsed) ? parsed : parsed?.servers ?? [];
        servers.push(...arr);
      } catch {
        // Ignore
      }
    }
  }
  
  return servers;
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig | null {
  const claudeKeys = loadClaudeConfigKeys();
  const mergedEnv: Record<string, string | undefined> = { ...claudeKeys, ...env };

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

  let systemPrompt = env.LULU_SYSTEM_PROMPT ?? DEFAULT_SYSTEM_PROMPT;
  
  // Inject Project Memory
  const memoryPath = path.join(homedir(), ".lulu", "projects", projectName, "memory.json");
  if (existsSync(memoryPath)) {
    try {
      const memoryRaw = readFileSync(memoryPath, "utf-8");
      if (memoryRaw.trim()) {
        const memory = JSON.parse(memoryRaw);
        systemPrompt += `\n\n# Project Memory (${projectName}):\n${JSON.stringify(memory, null, 2)}`;
      }
    } catch {
      // Ignore
    }
  }

  // Inject Global Skills
  const skillsPath = path.join(homedir(), ".lulu", "skills.json");
  if (existsSync(skillsPath)) {
    try {
      const skillsRaw = readFileSync(skillsPath, "utf-8");
      if (skillsRaw.trim()) {
        const skills = JSON.parse(skillsRaw);
        systemPrompt += `\n\n# Global Skills (Learned Patterns):\n${JSON.stringify(skills, null, 2)}`;
      }
    } catch {
      // Ignore
    }
  }

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
  };
}

// Internal helper, also exported for tests
export function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
