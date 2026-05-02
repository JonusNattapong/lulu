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
import { globalMemory } from "../core/global-memory.js";
import { taskQueue } from "../core/task-queue.js";
import { autonomousResearcher } from "../core/autonomous-research.js";
import { listSoulFiles, getSoulFile, writeSoulFile, deleteSoulFile, hasSoulVault, readGlobalSoulFiles, initGlobalSoulVault } from "../core/soul.js";

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
  // Daemon (Personal Agent)
  .get("/daemon/status", () => {
    try {
      const { personalAgentDaemon } = require('../core/daemon.js');
      return personalAgentDaemon.getStatus();
    } catch { return { pid: 0, running: false }; }
  })
  .post("/daemon/start", async () => {
    try {
      const { personalAgentDaemon } = await import('../core/daemon.js');
      if (!personalAgentDaemon.isRunning()) personalAgentDaemon.start();
      return personalAgentDaemon.getStatus();
    } catch { return { error: "Daemon not available" }; }
  })
  .post("/daemon/stop", async () => {
    try {
      const { personalAgentDaemon } = await import('../core/daemon.js');
      personalAgentDaemon.stop();
      return { stopped: true };
    } catch { return { error: "Daemon not available" }; }
  })
  // Skill Proposals
  .get("/proposals", async () => {
    try {
      const { skillProposalManager } = await import('../core/skill-proposal.js');
      return { proposals: skillProposalManager.list(), stats: skillProposalManager.getStats() };
    } catch { return { proposals: [], stats: {} }; }
  })
  .post("/proposals/approve/:id", async ({ params }) => {
    try {
      const { skillProposalManager } = await import('../core/skill-proposal.js');
      return skillProposalManager.approve(params.id) ?? { error: "Not found" };
    } catch { return { error: "Not available" }; }
  })
  .post("/proposals/reject/:id", async ({ params }) => {
    try {
      const { skillProposalManager } = await import('../core/skill-proposal.js');
      skillProposalManager.reject(params.id);
      return { rejected: true };
    } catch { return { error: "Not available" }; }
  })
  // Proactive Suggestions
  .get("/suggestions", async () => {
    try {
      const { proactiveEngine } = await import('../core/proactive.js');
      return { suggestions: proactiveEngine.list() };
    } catch { return { suggestions: [] }; }
  })
  .delete("/suggestions/:id", async ({ params }) => {
    try {
      const { proactiveEngine } = await import('../core/proactive.js');
      proactiveEngine.dismiss(params.id);
      return { dismissed: true };
    } catch { return { error: "Not available" }; }
  })
  // Learning Stats
  .get("/learn/stats", async () => {
    try {
      const { userProfile } = await import('../core/user-profile.js');
      return { ...userProfile.getStats(), recentPreferences: userProfile.getProfile().preferences.slice(-20) };
    } catch { return { sessions: 0, turns: 0, preferences: 0, proposals: 0, learnings: 0, activeProjects: 0, recentPreferences: [] }; }
  })
  .post("/learn", async ({ body }) => {
    try {
      const { userProfile } = await import('../core/user-profile.js');
      const b = body as any;
      if (b.key && b.value) userProfile.recordPreference(b.key, b.value, b.context || "api", "explicit", b.confidence || 1.0);
      return { learned: true };
    } catch { return { error: "Not available" }; }
  })
  // Global Memory
  .get("/memory/facts", () => ({ facts: globalMemory.search(""), stats: globalMemory.getStats() }))
  .post("/memory/facts", ({ body }) => {
    const b = body as any;
    if (!b.key || !b.value) return { error: "key and value required" };
    globalMemory.addFact({ key: b.key, value: b.value, source: "user", category: b.category || "fact", confidence: b.confidence || 0.8 });
    return { added: true };
  }, {
    body: t.Object({ key: t.String(), value: t.String(), category: t.Optional(t.String()), confidence: t.Optional(t.Number()) })
  })
  .delete("/memory/facts/:key", ({ params }) => ({ deleted: globalMemory.deleteFact(params.key) }))
  .get("/memory/todos", () => ({ todos: globalMemory.listTodos() }))
  .post("/memory/todos", ({ body }) => {
    const b = body as any;
    globalMemory.addTodo(b.text, b.priority || "medium");
    return { added: true };
  }, {
    body: t.Object({ text: t.String(), priority: t.Optional(t.Union([t.Literal("low"), t.Literal("medium"), t.Literal("high")])) })
  })
  .patch("/memory/todos/:id", ({ params }) => {
    globalMemory.toggleTodo(params.id);
    return { toggled: true };
  })
  // Task Queue
  .get("/queue/tasks", () => ({ tasks: taskQueue.list(), stats: taskQueue.getStats() }))
  .post("/queue/tasks", ({ body }) => {
    const b = body as any;
    const task = taskQueue.enqueue({ name: b.name, description: b.description, type: b.type, priority: b.priority, trigger: b.trigger });
    return { taskId: task.id };
  }, {
    body: t.Object({ name: t.String(), description: t.Optional(t.String()), type: t.Optional(t.String()), priority: t.Optional(t.String()), trigger: t.Optional(t.Any()) })
  })
  .post("/queue/tasks/:id/run", async ({ params }) => {
    try { return { result: await taskQueue.run(params.id) }; }
    catch (err: any) { return { error: err.message }; }
  })
  .delete("/queue/tasks/:id", ({ params }) => { taskQueue.cancel(params.id); return { cancelled: true }; })
  // Autonomous Research
  .get("/research/topics", () => ({ topics: autonomousResearcher.list(), stats: autonomousResearcher.getStats() }))
  .post("/research/topics", ({ body }) => {
    const b = body as any;
    const id = autonomousResearcher.queue(b.query, b.depth || "medium", b.focus);
    return { id };
  }, {
    body: t.Object({ query: t.String(), depth: t.Optional(t.Union([t.Literal("shallow"), t.Literal("medium"), t.Literal("deep")])), focus: t.Optional(t.Array(t.String())) })
  })
  .post("/research/topics/:id/run", async ({ params }) => {
    const topics = autonomousResearcher.list();
    const topic = topics.find(t => t.id === params.id);
    if (!topic) return { error: "Not found" };
    const updated = await autonomousResearcher.runTopic(topic);
    return { summary: updated.result?.summary };
  })
  .post("/research/auto", () => { autonomousResearcher.enableAutoResearch(true); return { autoEnabled: true }; })
  // SOUL
  .get("/soul/check", ({ query }) => {
    const projectRoot = (query as any).projectRoot || process.cwd();
    return { hasVault: hasSoulVault(projectRoot) };
  })
  .get("/soul/files", ({ query }) => {
    const projectRoot = (query as any).projectRoot || process.cwd();
    return { files: listSoulFiles(projectRoot) };
  })
  .get("/soul/files/:name", ({ params, query }) => {
    const projectRoot = (query as any).projectRoot || process.cwd();
    const name = params.name.endsWith(".md") ? params.name : `${params.name}.md`;
    const file = getSoulFile(projectRoot, name);
    return file ?? { error: "Not found" };
  })
  .put("/soul/files/:name", ({ params, query, body }) => {
    const projectRoot = (query as any).projectRoot || process.cwd();
    const name = params.name.endsWith(".md") ? params.name : `${params.name}.md`;
    const b = body as any;
    try {
      const file = writeSoulFile(projectRoot, name, b.content || "");
      return { saved: true, file };
    } catch (err: any) { return { error: err.message }; }
  }, {
    body: t.Object({ content: t.String() })
  })
  .delete("/soul/files/:name", ({ params, query }) => {
    const projectRoot = (query as any).projectRoot || process.cwd();
    const name = params.name.endsWith(".md") ? params.name : `${params.name}.md`;
    try {
      return { deleted: deleteSoulFile(projectRoot, name) };
    } catch (err: any) { return { error: err.message }; }
  })
  // Global SOUL
  .get("/soul/global", () => {
    initGlobalSoulVault();
    return { files: readGlobalSoulFiles() };
  })
  .get("/soul/global/:name", ({ params }) => {
    const name = params.name.endsWith(".md") ? params.name : `${params.name}.md`;
    const file = readGlobalSoulFiles().find(f => f.name === name);
    return file ?? { error: "Not found" };
  })
  .listen(19456);

console.log(`🦊 Elysia is running at http://localhost:19456 (WebSocket: ws://localhost:19456/ws)`);
