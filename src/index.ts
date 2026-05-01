#!/usr/bin/env node
import { stdin as input, stdout as output } from "node:process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { loadConfig } from "./config.js";
import { runAgent } from "./agent/agent.js";
import type { MessageParam } from "@anthropic-ai/sdk/resources/index.js";
import pc from "picocolors";

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

async function runOnboarding(): Promise<void> {
  const rl = readline.createInterface({ input, output });
  
  console.log(pc.cyan(pc.bold("\n--- LULU ONBOARDING ---")));
  console.log(pc.white("Welcome! Let's set up your Lulu environment.\n"));

  console.log("To use Lulu, you need at least one AI Provider API Key.");
  console.log("Common providers: anthropic, openai, google, deepseek.\n");

  const provider = (await rl.question(pc.bold("Select provider (default: anthropic): "))).trim() || "anthropic";
  const apiKey = (await rl.question(pc.bold(`Enter your ${provider} API key: `))).trim();

  if (!apiKey) {
    console.log(pc.red("\nError: API key is required to proceed."));
    process.exit(1);
  }

  const configDir = path.join(homedir(), ".lulu");
  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });
  
  const configPath = path.join(configDir, "config.json");
  const configData = {
    apiKeys: {
      [provider]: apiKey
    }
  };

  writeFileSync(configPath, JSON.stringify(configData, null, 2), "utf-8");
  console.log(pc.green(`\nConfig saved to ${configPath}!`));
  console.log(pc.cyan("Onboarding complete. Restarting Lulu...\n"));
  
  rl.close();
}

function printHelp(): void {
  console.log(pc.cyan(pc.bold("\n--- LULU AI v0.0.3 HELP ---")));
  console.log(`
Usage:
  lulu "summarize this project"   One-shot execution
  lulu                            Start interactive session

Interactive Commands:
  /curate       Trigger the Curator to optimize your skill library
  /exit, /quit  End the interactive session
  /help         Show this help message

Environment:
  LULU_PROVIDER          claude (default), openai, google, deepseek, etc.
  LULU_MODEL             Override default model
  LULU_ALLOW_WRITE=true  Enable file modifications
  LULU_ALLOW_COMMAND=true Enable shell commands

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

  console.log(pc.cyan(pc.bold("\n--- LULU AI v0.0.3 ---")));
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
    const result = await runAgent(config, firstPrompt, [], (t) => process.stdout.write(t));
    return;
  }

  const history = loadHistory();
  const rl = readline.createInterface({ input, output, history });
  const context: MessageParam[] = [];

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

      if (inputLine === "/curate") {
        console.log(pc.yellow("\n[Curator] Analyzing and optimizing your skill library..."));
        await runAgent(config, "Please curate my skills library now using curate_skills tool.", context, (t) => process.stdout.write(t));
        continue;
      }

      const result = await runAgent(config, inputLine, context, (t) => process.stdout.write(t));
      context.splice(0, context.length, ...result.messages);
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
