import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { loadConfig } from "./config.js";
import { runAgent } from "./agent/agent.js";
import { homedir } from "node:os";
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";

import { swagger } from "@elysiajs/swagger";

import { staticPlugin } from "@elysiajs/static";
import { getMCPServersLoaded } from "./agent/mcp.js";
import { getPluginTools } from "./agent/tools.js";

const app = new Elysia()
  .use(cors())
  .use(swagger())
  .use(staticPlugin({ assets: "dashboard/dist", prefix: "/" }))
  .get("/status", () => {
    const config = loadConfig();
    return {
      status: "online",
      provider: config?.provider || "unknown",
      model: config?.model || "unknown",
      projectName: config?.projectName || "unknown",
      version: "0.0.5"
    };
  })
  .get("/memory", () => {
    const config = loadConfig();
    if (!config) return { content: "" };
    const memoryPath = path.join(homedir(), ".lulu", "projects", config.projectName || "default", "memory.json");
    if (!existsSync(memoryPath)) return { content: "No memory found for this project." };
    return { content: readFileSync(memoryPath, "utf-8") };
  })
  .get("/mcp", () => getMCPServersLoaded())
  .get("/plugins", () => getPluginTools())
  .get("/history", () => {
    const logPath = path.join(homedir(), ".lulu", "history.jsonl");
    if (!existsSync(logPath)) return [];
    const content = readFileSync(logPath, "utf-8");
    return content.split("\n").filter(Boolean).map(line => JSON.parse(line));
  })
  .post("/prompt", async ({ body, set }) => {
    const config = loadConfig();
    if (!config) {
      set.status = 401;
      return { error: "API key missing. Please run 'lulu' in a terminal to complete onboarding." };
    }
    const { prompt, context = [] } = body as { prompt: string; context: any[] };
    
    let fullText = "";
    const result = await runAgent(config, prompt, context, (text) => {
      fullText += text;
    });

    return {
      text: fullText,
      messages: result.messages
    };
  }, {
    body: t.Object({
      prompt: t.String(),
      context: t.Optional(t.Array(t.Any()))
    })
  })
  .listen(8080);

console.log(`🦊 Elysia is running at http://localhost:8080`);
