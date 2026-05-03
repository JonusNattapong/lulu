import type { AgentConfig } from "../types/types.js";
import { getBaseUrl } from "./providers.js";

export async function fetchAvailableModels(config: AgentConfig): Promise<string[]> {
  const provider = config.provider || "claude";

  let apiKey = config.apiKey || "";
  let defaultModel = config.model || "default";

  try {
    const { loadClaudeConfigKeys, PROVIDERS_DATA } = await import("../core/config.js");
    const claudeKeys = loadClaudeConfigKeys();
    const mergedEnv: Record<string, string | undefined> = { ...claudeKeys, ...process.env };
    const envKeyName = PROVIDERS_DATA.config_map[provider];
    if (mergedEnv[envKeyName]) {
      apiKey = mergedEnv[envKeyName]!;
    }
    
    if (PROVIDERS_DATA.defaults[provider]) {
      defaultModel = PROVIDERS_DATA.defaults[provider].defaultModel;
    }
  } catch {
    // Ignore import errors, fallback to passed config
  }

  const defaultModels: Record<string, string[]> = {
    claude: ["claude-3-5-sonnet-20241022", "claude-3-opus-20240229", "claude-3-haiku-20240307"],
    openai: ["gpt-4o", "gpt-4-turbo", "gpt-4o-mini", "o1-preview", "o1-mini"],
    google: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.5-pro", "gemini-2.5-flash"],
    deepseek: ["deepseek-chat", "deepseek-coder", "deepseek-reasoner"],
    mistral: ["mistral-large-latest", "open-mistral-nemo"],
    openrouter: ["anthropic/claude-3.5-sonnet", "openai/gpt-4o", "google/gemini-pro-1.5", "meta-llama/llama-3-70b-instruct", "mistralai/mixtral-8x7b-instruct"],
    kilocode: ["kilocode-1", "kilocode-1-turbo", "kilocode-pro"],
    opencode: ["opencode-1", "opencode-1-turbo", "opencode-pro"],
    cline: ["cline-1", "cline-1-turbo"],
    copilot: ["copilot-1", "gpt-4"]
  };

  const getDefaults = () => defaultModels[provider] || [defaultModel];

  const fetchGeneric = async () => {
    try {
      const baseUrl = getBaseUrl(provider as any);
      if (!baseUrl) return getDefaults();
      
      const headers: Record<string, string> = {};
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
      
      const res = await fetch(`${baseUrl}/models`, { headers });
      if (!res.ok) {
        return [`API_ERROR: HTTP ${res.status}`, ...getDefaults()];
      }
      const data = await res.json() as any;
      const list = data.data || data.models || [];
      if (!Array.isArray(list)) {
        return [`API_ERROR: Invalid JSON Format`, ...getDefaults()];
      }
      const models = list.map((m: any) => m.id).filter(Boolean);
      return models.length > 0 ? models : getDefaults();
    } catch (err: any) {
      return [`API_ERROR: ${err.message}`, ...getDefaults()];
    }
  };

  try {
    switch (provider) {
      case "claude": {
        const headers: Record<string, string> = { "anthropic-version": "2023-06-01" };
        if (apiKey) headers["x-api-key"] = apiKey;
        
        const res = await fetch("https://api.anthropic.com/v1/models", { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as any;
        return data.data?.map((m: any) => m.id) || getDefaults();
      }
      case "google": {
        const url = apiKey 
          ? `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
          : `https://generativelanguage.googleapis.com/v1beta/models`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as any;
        return data.models?.map((m: any) => m.name.replace('models/', '')) || getDefaults();
      }
      default:
        return await fetchGeneric();
    }
  } catch (err: any) {
    return [`API_ERROR: ${err.message}`, ...getDefaults()];
  }
}
