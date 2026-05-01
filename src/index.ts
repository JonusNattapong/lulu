#!/usr/bin/env node
import { stdin as input, stdout as output } from "node:process";
import readline from "node:readline/promises";
import { loadConfig } from "./config.js";
import { runAgent } from "./agent/agent.js";
import type { MessageParam } from "@anthropic-ai/sdk/resources/index.js";

function printHelp(): void {
  console.log(`lulu v0.0.1

Usage:
  lulu "summarize this project"
  lulu

Environment:
  LULU_PROVIDER          Optional provider: claude (default), openai, deepseek, openrouter, mistral, etc.
  ANTHROPIC_API_KEY      Required for claude
  OPENAI_API_KEY         Required for openai
  DEEPSEEK_API_KEY       Required for deepseek
  OPENROUTER_API_KEY     Required for openrouter
  MISTRAL_API_KEY        Required for mistral
  LULU_MODEL             Optional model override
  LULU_MAX_TOKENS        Optional max tokens, default 4096
  LULU_ALLOW_WRITE=true  Allow write_file tool
  LULU_ALLOW_COMMAND=true Allow run_command tool
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  const config = loadConfig();
  const firstPrompt = args.join(" ").trim();

  if (firstPrompt) {
    const result = await runAgent(config, firstPrompt);
    if (result.finalText) console.log(result.finalText);
    return;
  }

  const rl = readline.createInterface({ input, output });
  const context: MessageParam[] = [];

  console.log("Lulu v0.0.1. Type /exit to quit.");

  try {
    while (true) {
      const prompt = (await rl.question("> ")).trim();
      if (!prompt) continue;
      if (prompt === "/exit" || prompt === "/quit") break;

      const result = await runAgent(config, prompt, context);
      context.splice(0, context.length, ...result.messages);
      if (result.finalText) console.log(result.finalText);
    }
  } finally {
    rl.close();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`lulu: ${message}`);
  process.exitCode = 1;
});
