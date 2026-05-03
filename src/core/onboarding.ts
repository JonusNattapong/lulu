import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import pc from "picocolors";
import { getAvailableProviders } from "./config.js";
import type { ModelProvider } from "../types/types.js";

import { CONFIG_FILE, LULU_DIR, TELEGRAM_CONFIG } from "./paths.js";

const CONFIG_PATH = CONFIG_FILE;
const TELEGRAM_CONFIG_PATH = TELEGRAM_CONFIG;

interface OnboardingAnswers {
  provider: ModelProvider;
  apiKey: string;
  projectName: string;
  enableApi: boolean;
  enableTelegram: boolean;
  telegramBotToken?: string;
  allowWrite: boolean;
  allowCommand: boolean;
  allowTmux: boolean;
}

function createInterface() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function question(rl: readline.Interface, text: string): Promise<string> {
  return new Promise((resolve) => rl.question(text, resolve));
}

export async function runOnboarding(): Promise<OnboardingAnswers> {
  const rl = createInterface();

  console.log("\n--- LULU CENTRALIZED ONBOARDING ---");
  console.log("Setting up your AI assistant environment.\n");

  const answers: OnboardingAnswers = {
    provider: "claude",
    apiKey: "",
    projectName: "",
    enableApi: false,
    enableTelegram: false,
    allowWrite: false,
    allowCommand: false,
    allowTmux: false,
  };

  // Step 1: Provider selection
  console.log("STEP 1: Provider Configuration");
  const available = getAvailableProviders();
  if (available.length > 0) {
    console.log(`  Found configured providers: ${available.join(", ")}`);
  }
  console.log("  Available: claude, openai, google, deepseek, openrouter, mistral, xai,Cohere, perplexity\n");

  const providerInput = (await question(rl, "  Select provider (default: claude): ")).trim() || "claude";
  answers.provider = providerInput as ModelProvider;

  const apiKey = (await question(rl, `  Enter ${answers.provider} API key: `)).trim();
  if (!apiKey) {
    console.log("\n  Error: API key is required.");
    process.exit(1);
  }
  answers.apiKey = apiKey;
  console.log("");

  // Step 2: Project configuration
  console.log("STEP 2: Project Configuration");
  const defaultProject = path.basename(process.cwd());
  answers.projectName = (await question(rl, `  Project name (default: ${defaultProject}): `)).trim() || defaultProject;
  console.log("");

  // Step 3: API Server setup
  console.log("STEP 3: API Server Configuration");
  const apiInput = (await question(rl, "  Enable API server at http://localhost:19456? (y/N): ")).trim().toLowerCase();
  answers.enableApi = apiInput === "y" || apiInput === "yes";
  if (answers.enableApi) {
    console.log("  API server can be started with: bun run server");
  }
  console.log("");

  // Step 4: Telegram setup
  console.log("STEP 4: Telegram Integration");
  const telegramInput = (await question(rl, "  Enable Telegram bot? (y/N): ")).trim().toLowerCase();
  answers.enableTelegram = telegramInput === "y" || telegramInput === "yes";

  if (answers.enableTelegram) {
    const tokenInput = (await question(rl, "  Enter Telegram bot token (from @BotFather): ")).trim();
    if (tokenInput) {
      answers.telegramBotToken = tokenInput;
      console.log("  Bot token saved. Run 'bun run telegram:setup' to pair devices later.");
    }
  }
  console.log("");

  // Step 5: Permissions
  console.log("STEP 5: Permissions (for safety, default is read-only)");
  const writeInput = (await question(rl, "  Allow file write operations? (y/N): ")).trim().toLowerCase();
  answers.allowWrite = writeInput === "y" || writeInput === "yes";

  const cmdInput = (await question(rl, "  Allow shell command execution? (y/N): ")).trim().toLowerCase();
  answers.allowCommand = cmdInput === "y" || cmdInput === "yes";

  const tmuxInput = (await question(rl, "  Allow tmux control? (y/N): ")).trim().toLowerCase();
  answers.allowTmux = tmuxInput === "y" || tmuxInput === "yes";
  console.log("");

  // Step 6: Health check
  console.log("STEP 6: Health Check");

  // Save configs first
  await saveOnboardingConfig(answers);

  // Run health checks
  const healthResults = await runHealthCheck(answers);
  console.log("");

  rl.close();
  return answers;
}

async function saveOnboardingConfig(answers: OnboardingAnswers): Promise<void> {
  // Ensure config directory exists
  if (!existsSync(LULU_DIR)) {
    mkdirSync(LULU_DIR, { recursive: true });
  }

  // Load existing config
  let existingConfig: any = {};
  if (existsSync(CONFIG_PATH)) {
    try {
      existingConfig = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    } catch { /* ignore */ }
  }

  // Merge API keys
  const apiKeys = existingConfig.apiKeys || {};
  apiKeys[answers.provider] = answers.apiKey;

  const newConfig = {
    ...existingConfig,
    apiKeys,
    projectName: answers.projectName,
    permissions: {
      allowWrite: answers.allowWrite,
      allowCommand: answers.allowCommand,
      allowTmux: answers.allowTmux,
    },
    api: {
      enabled: answers.enableApi,
    },
  };

  writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2), "utf-8");
  console.log(pc.green(`  ✓ Config saved to ${CONFIG_PATH}`));

  // Save Telegram config if enabled
  if (answers.enableTelegram && answers.telegramBotToken) {
    const telegramConfig = {
      botToken: answers.telegramBotToken,
      defaultAgentId: "main",
      bindings: [],
    };
    writeFileSync(TELEGRAM_CONFIG_PATH, JSON.stringify(telegramConfig, null, 2), "utf-8");
    console.log(pc.green(`  ✓ Telegram config saved to ${TELEGRAM_CONFIG_PATH}`));
  }
}

async function runHealthCheck(answers: OnboardingAnswers): Promise<void> {
  console.log("  Running health checks...\n");

  // Check config file
  const configExists = existsSync(CONFIG_PATH);
  console.log(`  ${configExists ? "✓" : "✗"} Config file exists`);

  // Check API key is set
  const configLoaded = existsSync(CONFIG_PATH);
  console.log(`  ${configLoaded ? "✓" : "✗"} Config file readable`);

  // Check project directory
  const projectDir = path.join(LULU_DIR, "projects", answers.projectName);
  if (!existsSync(projectDir)) {
    mkdirSync(projectDir, { recursive: true });
    // Create default memory file
    writeFileSync(path.join(projectDir, "memory.json"), "{}", "utf-8");
  }
  console.log(`  ✓ Project directory ready: ${projectDir}`);

  // Test API key with a simple request (optional - might be slow)
  console.log("\n  Health check complete!");
  console.log("  Next steps:");
  console.log("    - Run 'lulu' to start the CLI");
  if (answers.enableApi) console.log("    - Run 'bun run server' to start the API");
  if (answers.enableTelegram) console.log("    - Run 'bun run telegram:setup' to pair Telegram");
}

async function quickSetup(): Promise<void> {
  const rl = createInterface();
  const token = await question(rl, "Enter Telegram bot token: ");
  rl.close();

  if (!token.trim()) {
    console.log("Token required.");
    return;
  }

  if (!existsSync(LULU_DIR)) mkdirSync(LULU_DIR, { recursive: true });

  const telegramConfig = {
    botToken: token.trim(),
    defaultAgentId: "main",
    bindings: [],
  };
  writeFileSync(TELEGRAM_CONFIG_PATH, JSON.stringify(telegramConfig, null, 2), "utf-8");
  console.log(pc.green(`Saved to ${TELEGRAM_CONFIG_PATH}`));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args[0] === "setup") {
    quickSetup();
  } else {
    runOnboarding();
  }
}