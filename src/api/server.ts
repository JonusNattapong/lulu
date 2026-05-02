import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { loadConfig, loadPromptBuild } from "../core/config.js";
import { homedir } from "node:os";
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";

import { swagger } from "@elysiajs/swagger";

import { staticPlugin } from "@elysiajs/static";
import { getMCPServersLoaded } from "../core/mcp.js";
import { getPlugins } from "../tools/tools.js";
import { describePrompt } from "../core/prompt.js";
import { eventBus } from "../core/events.js";
import { redactObject } from "../core/secrets.js";
import { gateway } from "../core/gateway.js";
import { exportTrajectory, saveExportToFile, listExportedTrajectories, loadTrajectoryFile } from "../core/trajectory.js";
import { coordinatorManager } from "../core/coordinator.js";
import { alwaysOnService } from "../core/alwayson.js";
import { notificationManager } from "../core/notifications.js";

const subscribers = new Set<any>();

function broadcast(type: string, payload: any, sessionId?: string) {
  const redactedPayload = redactObject(payload);
  const msg = JSON.stringify({ type, sessionId, data: redactedPayload });
  for (const ws of subscribers) {
    try { ws.send(msg); } catch {}
  }
}

eventBus.onAny((event) => {
  broadcast(event.type, event.payload, event.sessionId);
});

const app = new Elysia()
  .use(cors())
  .use(swagger())
  .onBeforeHandle(({ request, set }) => {
    const apiKey = process.env.LULU_API_KEY;
    if (apiKey) {
      const auth = request.headers.get("Authorization");
      if (!auth || auth !== `Bearer ${apiKey}`) {
        set.status = 401;
        return { error: "Unauthorized: Invalid or missing API Key" };
      }
    }
  })
  .use(staticPlugin({ assets: "dashboard/dist", prefix: "/" }))
  .get("/capabilities", async () => {
    try {
      const { detectCapabilities } = await import('../utils/capabilities.js')
      return await detectCapabilities()
    } catch (err: any) {
      return { error: 'Capabilities detection unavailable: ' + err.message }
    }
  })
  .get("/status", () => {
    const config = loadConfig({ ...process.env, LULU_CHANNEL: "api" });
    return {
      status: "online",
      provider: config?.provider || "unknown",
      model: config?.model || "unknown",
      projectName: config?.projectName || "unknown",
      version: "0.0.5"
    };
  })
  .get("/memory", () => {
    const config = loadConfig({ ...process.env, LULU_CHANNEL: "api" });
    if (!config) return { content: "" };
    const memoryPath = path.join(homedir(), ".lulu", "projects", config.projectName || "default", "memory.json");
    if (!existsSync(memoryPath)) return { content: "No memory found for this project." };
    return { content: readFileSync(memoryPath, "utf-8") };
  })
  .get("/mcp", () => getMCPServersLoaded())
  .get("/prompt", () => {
    const prompt = loadPromptBuild();
    return {
      profile: prompt.profile,
      length: prompt.systemPrompt.length,
      description: describePrompt(prompt),
      layers: prompt.layers.map((layer) => ({
        name: layer.name,
        source: layer.source,
        length: layer.content.length,
      })),
    };
  })
  .get("/plugins", () => {
    const plugins = getPlugins();
    return plugins.map((p: any) => ({
      name: p.name,
      description: p.description,
      version: p.version || "0.0.0",
      permissions: p.permissions || [],
    }));
  })
  .get("/history", () => {
    const logPath = path.join(homedir(), ".lulu", "history.jsonl");
    if (!existsSync(logPath)) return [];
    const content = readFileSync(logPath, "utf-8");
    return content.split("\n").filter(Boolean).map(line => JSON.parse(line));
  })
  .get("/sessions", () => gateway.sessionManager.list().map((session) => ({
    id: session.id,
    channel: session.channel,
    title: session.title,
    projectName: session.projectName,
    provider: session.provider,
    model: session.model,
    messages: session.messages.length,
    turnCount: session.turnCount,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  })))
  .post("/sessions/reset", ({ body }) => {
    const { sessionId } = body as { sessionId: string };
    return gateway.sessionManager.reset(sessionId) ?? { error: `Session not found: ${sessionId}` };
  }, {
    body: t.Object({ sessionId: t.String() })
  })
  .post("/prompt", async ({ body, set }) => {
    const { prompt, context = [], sessionId } = body as { prompt: string; context: any[]; sessionId?: string };
    const result = await gateway.route({
      channel: "api",
      subjectId: sessionId || "default",
      sessionId,
      title: "API session",
      prompt,
      context,
      env: { ...process.env, LULU_CHANNEL: "api" },
    });
    return { text: result.text, messages: result.messages, sessionId: result.session.id };
  }, {
    body: t.Object({
      prompt: t.String(),
      context: t.Optional(t.Array(t.Any())),
      sessionId: t.Optional(t.String())
    })
  })
  .ws("/ws", {
    open(ws) {
      subscribers.add(ws);
      ws.send(JSON.stringify({ type: "connected", data: { message: "Lulu WebSocket connected" } }));
    },
    async message(ws, raw) {
      try {
        const { type, data } = JSON.parse(raw as string);
        if (type === "prompt") {
          gateway.route({
            channel: "dashboard",
            subjectId: data.sessionId || "default",
            sessionId: data.sessionId,
            title: "Dashboard session",
            prompt: data.prompt,
            context: data.context || [],
            env: { ...process.env, LULU_CHANNEL: "dashboard" },
            onToken: (text) => broadcast("text_delta", { text }, data.sessionId),
          })
            .then((result) => broadcast("text_end", { text: result.text }, result.session.id))
            .catch((err) => broadcast("error", { message: err instanceof Error ? err.message : String(err) }, data.sessionId));
        }
      } catch {}
    },
    close(ws) { subscribers.delete(ws); },
  })
  .get("/trajectories", () => {
    return listExportedTrajectories().map(f => ({ path: f.path, size: f.size, createdAt: f.createdAt }));
  })
  .post("/trajectories/export", ({ body }) => {
    const { sessionId, channel, projectName, format, saveToFile } = body as any;
    const exports = exportTrajectory(sessionId, { channel, projectName });
    if (saveToFile) {
      const paths = saveExportToFile(exports, format || "json");
      return { count: exports.length, paths };
    }
    return { count: exports.length, trajectories: exports };
  }, {
    body: t.Object({
      sessionId: t.Optional(t.String()),
      channel: t.Optional(t.String()),
      projectName: t.Optional(t.String()),
      format: t.Optional(t.Union([t.Literal("json"), t.Literal("jsonl")])),
      saveToFile: t.Optional(t.Boolean()),
    })
  })
  .get("/trajectories/file", ({ query }) => {
    const { path: filePath } = query as any;
    if (!filePath) return { error: "path query param required" };
    try { return loadTrajectoryFile(filePath); }
    catch (err) { return { error: (err as Error).message }; }
  })
  // Coordinator
  .get("/coordinator/tasks", () => {
    return coordinatorManager.listTasks().map(t => ({
      id: t.id, title: t.title, status: t.status,
      subTaskCount: t.subTasks.length, createdAt: t.createdAt,
      startedAt: t.startedAt, endedAt: t.endedAt,
    }));
  })
  .post("/coordinator/tasks", ({ body }) => {
    const { title, subTasks } = body as any;
    const id = coordinatorManager.createTask(title, subTasks);
    return { taskId: id };
  }, {
    body: t.Object({ title: t.String(), subTasks: t.Array(t.Any()) })
  })
  .get("/coordinator/tasks/:id", ({ params }) => {
    const task = coordinatorManager.getTask(params.id);
    return task ?? { error: "Task not found" };
  })
  .post("/coordinator/tasks/:id/run", async ({ params, set }) => {
    const task = coordinatorManager.getTask(params.id);
    if (!task) { set.status = 404; return { error: "Task not found" }; }
    const config = loadConfig({ ...process.env, LULU_CHANNEL: "api" });
    if (!config) { set.status = 400; return { error: "No config available" }; }
    try {
      const result = await coordinatorManager.orchestrate(params.id, config);
      return { taskId: params.id, status: "done", result };
    } catch (err: any) { return { taskId: params.id, status: "failed", error: err.message }; }
  })
  .post("/coordinator/tasks/:id/abort", ({ params }) => ({ aborted: coordinatorManager.abort(params.id) }))
  // Always-On
  .get("/always-on/status", () => alwaysOnService.getStatus())
  .post("/always-on/start", () => { alwaysOnService.start(); return alwaysOnService.getStatus(); })
  .post("/always-on/stop", () => { alwaysOnService.stop(); return alwaysOnService.getStatus(); })
  .post("/always-on/configure", ({ body }) => { alwaysOnService.updateConfig(body as any); return alwaysOnService.getStatus(); })
  // Notifications
  .get("/notifications/history", ({ query }) => notificationManager.history(parseInt((query as any).limit || "20", 10)))
  .listen(19456);

console.log(`🦊 Elysia is running at http://localhost:19456 (WebSocket: ws://localhost:19456/ws)`);
