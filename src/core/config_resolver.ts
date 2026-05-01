import { homedir } from "node:os";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { loadClaudeConfigKeys } from "./config.js";
import { detectProject } from "./project.js";
import type { AgentConfig } from "../types/types.js";

export interface ConfigResolutionOptions {
  env?: NodeJS.ProcessEnv;
  sessionOverrides?: Partial<AgentConfig>;
  requestOverrides?: Partial<AgentConfig>;
}

export class ConfigResolver {
  /**
   * Resolves the final configuration by merging multiple sources.
   * Priority (Low to High):
   * 1. Global Defaults (built-in)
   * 2. Global Config (~/.lulu/config.json)
   * 3. Environment Variables
   * 4. Project Config (.lulu.json)
   * 5. Session Overrides
   * 6. Request Overrides
   */
  static resolve(options: ConfigResolutionOptions = {}): AgentConfig {
    const env = options.env || process.env;
    
    // 1. Global Defaults
    let config: AgentConfig = {
      provider: "claude",
      model: "claude-3-5-sonnet-20241022",
      apiKey: "",
      systemPrompt: "",
      maxTokens: 4096,
      channel: "cli"
    };

    // 2. Global Config (~/.lulu/config.json)
    const globalConfigPath = path.join(homedir(), ".lulu", "config.json");
    if (existsSync(globalConfigPath)) {
      try {
        const globalData = JSON.parse(readFileSync(globalConfigPath, "utf-8"));
        config = { ...config, ...globalData };
      } catch {}
    }

    // 3. Environment Variables & Claude Config
    const claudeKeys = loadClaudeConfigKeys();
    const mergedEnv = { ...claudeKeys, ...env };
    
    if (mergedEnv.LULU_PROVIDER) config.provider = mergedEnv.LULU_PROVIDER as any;
    if (mergedEnv.LULU_MODEL) config.model = mergedEnv.LULU_MODEL;
    if (mergedEnv.LULU_MAX_TOKENS) config.maxTokens = parseInt(mergedEnv.LULU_MAX_TOKENS, 10);
    if (mergedEnv.LULU_CHANNEL) config.channel = mergedEnv.LULU_CHANNEL as any;

    // Use provider-specific key if available
    const keyMap: Record<string, string> = {
      claude: "ANTHROPIC_API_KEY",
      openai: "OPENAI_API_KEY",
      google: "GOOGLE_API_KEY",
      deepseek: "DEEPSEEK_API_KEY"
    };
    const envKeyName = keyMap[config.provider];
    if (envKeyName && mergedEnv[envKeyName]) {
      config.apiKey = mergedEnv[envKeyName]!;
    } else if (mergedEnv.LULU_API_KEY) {
      config.apiKey = mergedEnv.LULU_API_KEY;
    }

    // 4. Project Config (.lulu.json)
    const { projectName, projectRoot } = detectProject();
    config.projectName = projectName;
    config.projectRoot = projectRoot;

    const projectConfigPath = path.join(projectRoot, ".lulu.json");
    if (existsSync(projectConfigPath)) {
      try {
        const projectData = JSON.parse(readFileSync(projectConfigPath, "utf-8"));
        config = { ...config, ...projectData };
      } catch {}
    }

    // 5. Session Overrides
    if (options.sessionOverrides) {
      config = { ...config, ...options.sessionOverrides };
    }

    // 6. Request Overrides
    if (options.requestOverrides) {
      config = { ...config, ...options.requestOverrides };
    }

    return config;
  }
}
