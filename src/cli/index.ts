#!/usr/bin/env node
import { stdin as input, stdout as output } from "node:process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { loadConfig } from "../core/config.js";
import { runAgent } from "../core/agent.js";
import { describePrompt } from "../core/prompt.js";
import { SessionManager } from "../core/session.js";
import pc from "picocolors";
import { runOnboarding } from "../core/onboarding.js";

const HISTORY_FILE = path.join(homedir(), ".lulu", "history");
const HISTORY_LIMIT = 100;

function loadHistory(): string[] {
  try {
    if (!existsSync(HISTORY_FILE)) return [];
    const content = readFileSync(HISTORY_FILE, "utf-8");
    return content.split("\n").filter(Boolean).slice(-HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function saveHistory(history: string[]): void {
  try {
    const dir = path.dirname(HISTORY_FILE);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(HISTORY_FILE, history.slice(-HISTORY_LIMIT).join("\n") + "\n", "utf-8");
  } catch {
    // Ignore
  }
}

function formatOutput(text: string): string {
  // Simple syntax highlighting for code blocks
  return text.replace(/```([\s\S]*?)```/g, (match, code) => {
    return pc.bgBlack(pc.white(match));
  }).replace(/\*\*(.*?)\*\*/g, (match, bold) => {
    return pc.bold(pc.yellow(match));
  });
}

async function checkCuration(config: any) {
  const skillsPath = path.join(homedir(), ".lulu", "skills.json");
  if (!existsSync(skillsPath)) return;
  
  try {
    const stats = readFileSync(skillsPath, "utf-8");
    const skillsCount = Object.keys(JSON.parse(stats)).length;
    
    if (skillsCount > 10) {
      console.log(pc.yellow(`\n[Curator] You have ${skillsCount} skills. Consider running '/curate' to optimize your library.`));
    }
  } catch {
    // Ignore
  }
}

function printHelp(): void {
  console.log(pc.cyan(pc.bold("\n--- LULU AI v0.0.4 HELP ---")));
  console.log(`
Usage:
  lulu "summarize this project"   One-shot execution
  lulu                            Start interactive session

Interactive Commands:
  /curate       Trigger the Curator to optimize your skill library
  /prompt       Show active prompt layers
  /session      Show active session metadata
  /new, /reset  Start a fresh session
  /skills       Manage skills: list, search, show, create
  /skillify     Capture workflow as skill
  /brain        Query knowledge brain: query, stats, ingest
  /resolver     Manage skill resolver rules
  /exit, /quit  End the interactive session
  /help         Show this help message

Environment:
  LULU_PROVIDER          claude (default), openai, google, deepseek, etc.
  LULU_MODEL             Override default model
  LULU_PROMPT_PROFILE    Load ~/.lulu/prompts/<profile>.md as a prompt profile
  LULU_ALLOW_WRITE=true  Enable file modifications
  LULU_ALLOW_COMMAND=true Enable shell commands
  LULU_ALLOW_TMUX=true   Enable built-in tmux tools
  LULU_TELEGRAM_BOT_TOKEN Telegram bot token for 'bun run telegram'
  LULU_TELEGRAM_ALLOWED_CHAT_IDS Comma-separated allowed chat IDs

Global Configuration:
  Stored in ~/.lulu/config.json
  Project Memory in ~/.lulu/projects/
  Global Skills in ~/.lulu/skills.json
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  console.log(pc.cyan(pc.bold("\n--- LULU AI v0.0.4 ---")));
  console.log(pc.dim("Autonomous Coding Assistant\n"));

  let config = loadConfig();
  if (!config) {
    await runOnboarding();
    config = loadConfig();
    if (!config) {
      console.error(pc.red("Error: Failed to load configuration after onboarding."));
      process.exit(1);
    }
  }

  await checkCuration(config);

  const firstPrompt = args.join(" ").trim();

  if (firstPrompt) {
    const result = await runAgent(config, firstPrompt, [], (t) => process.stdout.write(formatOutput(t)));
    return;
  }

  const history = loadHistory();
  const rl = readline.createInterface({ input, output, history });
  const sessionManager = new SessionManager();
  let session = sessionManager.getOrCreate({ channel: "cli", subjectId: "default", title: "Interactive CLI", config });

  console.log(pc.green("Ready. Type /exit to quit."));

  try {
    while (true) {
      const prompt = pc.bold(pc.blue("> "));
      const inputLine = (await rl.question(prompt)).trim();
      if (!inputLine) continue;
      if (inputLine === "/exit" || inputLine === "/quit") break;

      if (inputLine === "/help") {
        printHelp();
        continue;
      }

      if (inputLine === "/session") {
        console.log(pc.cyan("\n" + sessionManager.describe(session.id)));
        continue;
      }

      if (inputLine === "/new" || inputLine === "/reset") {
        const reset = sessionManager.reset(session.id);
        if (reset) session = reset;
        console.log(pc.green("\nStarted a fresh CLI session."));
        continue;
      }

      if (inputLine === "/prompt") {
        const { loadPromptBuild } = await import("../core/config.js");
        console.log(pc.cyan("\n" + describePrompt(loadPromptBuild(process.env))));
        continue;
      }

      if (inputLine.startsWith("/provider")) {
        const parts = inputLine.split(" ");
        const { getAvailableProviders } = await import("../core/config.js");
        const available = getAvailableProviders();
        
        if (parts.length === 1) {
          console.log(pc.cyan(`\nAvailable providers: ${available.join(", ")}`));
          console.log(pc.cyan(`Current provider: ${config.provider}`));
        } else {
          const newProvider = parts[1] as any;
          if (available.includes(newProvider)) {
            const newConfig = loadConfig({ ...process.env, LULU_PROVIDER: newProvider });
            if (newConfig) {
              config = newConfig;
              console.log(pc.green(`\nSwitched to provider: ${newProvider}. Default model: ${newConfig.model}`));
            }
          } else {
            console.log(pc.red(`\nError: Provider '${newProvider}' is not available. Available: ${available.join(", ")}`));
          }
        }
        continue;
      }

      if (inputLine.startsWith("/model")) {
        const parts = inputLine.split(" ");
        if (parts.length === 1) {
          console.log(pc.cyan(`\nCurrent model: ${config.model}`));
        } else {
          const newModel = parts[1];
          config = { ...config, model: newModel };
          console.log(pc.green(`\nSwitched to model: ${newModel}`));
        }
        continue;
      }

      if (inputLine === "/curate") {
        console.log(pc.yellow("\n[Curator] Analyzing and optimizing your skill library..."));
        const result = await runAgent(config, "Please curate my skills library now using curate_skills tool.", session.messages, (t) => process.stdout.write(formatOutput(t)));
        session = sessionManager.saveMessages(session.id, result.messages, config);
        continue;
      }

      const result = await runAgent(config, inputLine, session.messages, (t) => process.stdout.write(formatOutput(t)));
      session = sessionManager.saveMessages(session.id, result.messages, config);
    }
  } finally {
    saveHistory((rl as any).history ?? []);
    rl.close();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`lulu: ${message}`);
  process.exitCode = 1;
});
