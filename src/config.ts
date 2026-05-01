import type { AgentConfig, ModelProvider } from "./types.js";

const DEFAULT_MODEL = "claude-3-5-sonnet-20241022";
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_SYSTEM_PROMPT = `You are Lulu, a careful personal AI assistant.
You help the user inspect and understand local projects.
Prefer reading and searching before making changes.
Explain risky actions before asking the user to enable them.`;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  const providers: Record<ModelProvider, { key?: string; defaultModel: string }> = {
    claude: {
      key: env.ANTHROPIC_API_KEY,
      defaultModel: "claude-3-5-sonnet-20241022",
    },
    openai: { key: env.OPENAI_API_KEY, defaultModel: "gpt-4o" },
    google: { key: env.GOOGLE_API_KEY, defaultModel: "gemini-1.5-pro" },
    kilocode: { key: env.KILOCODE_API_KEY, defaultModel: "kilocode-1" },
    opencode: { key: env.OPENCODE_API_KEY, defaultModel: "opencode-1" },
    openrouter: {
      key: env.OPENROUTER_API_KEY,
      defaultModel: "anthropic/claude-3.5-sonnet",
    },
    cline: { key: env.CLINE_API_KEY, defaultModel: "cline-1" },
    mistral: { key: env.MISTRAL_API_KEY, defaultModel: "mistral-large-latest" },
    copilot: { key: env.COPILOT_API_KEY, defaultModel: "copilot-1" },
    deepseek: { key: env.DEEPSEEK_API_KEY, defaultModel: "deepseek-chat" },
  };

  const selectedProvider = (env.LULU_PROVIDER as ModelProvider) ?? "claude";
  const config = providers[selectedProvider];

  if (!config || !config.key) {
    // If selected provider is not available, try to find the first one that has a key
    const firstAvailable = (Object.keys(providers) as ModelProvider[]).find(
      (p) => providers[p].key,
    );
    if (!firstAvailable) {
      throw new Error(
        "No API keys found. Please set ANTHROPIC_API_KEY or another provider key in your .env file.",
      );
    }
    return {
      provider: firstAvailable,
      model: env.LULU_MODEL ?? providers[firstAvailable].defaultModel,
      apiKey: providers[firstAvailable].key!,
      systemPrompt: env.LULU_SYSTEM_PROMPT ?? DEFAULT_SYSTEM_PROMPT,
      maxTokens: parsePositiveInt(env.LULU_MAX_TOKENS, DEFAULT_MAX_TOKENS),
    };
  }

  return {
    provider: selectedProvider,
    model: env.LULU_MODEL ?? config.defaultModel,
    apiKey: config.key,
    systemPrompt: env.LULU_SYSTEM_PROMPT ?? DEFAULT_SYSTEM_PROMPT,
    maxTokens: parsePositiveInt(env.LULU_MAX_TOKENS, DEFAULT_MAX_TOKENS),
  };
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
