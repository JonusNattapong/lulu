import { type Tool } from "../registry.js";
import { coordinatorManager } from "../../core/coordinator.js";
import { alwaysOnService } from "../../core/alwayson.js";
import { notificationManager } from "../../core/notifications.js";
import { loadConfig } from "../../core/config.js";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export const coordinatorTools: Tool[] = [
  {
    name: "orchestrate_task",
    category: "agent",
    description: "Break a large task into sub-tasks, spawn sub-agents, and coordinate their execution respecting dependencies.",
    risk: "medium",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Overall task title." },
        sub_tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              prompt: { type: "string" },
              depends_on: { type: "array", items: { type: "string" }, description: "IDs of tasks this depends on." }
            },
            required: ["title", "prompt"]
          },
          description: "Array of sub-tasks. Each task has a title, prompt, and optional dependencies."
        }
      },
      required: ["title", "sub_tasks"]
    },
    execute: async (input, config) => {
      const subTasks = input.sub_tasks.map((st: any) => ({
        title: st.title,
        prompt: st.prompt,
        dependsOn: st.depends_on || [],
      }));

      const taskId = coordinatorManager.createTask(input.title, subTasks);
      const lines = [`Coordination task created: ${taskId}`, `Title: ${input.title}`, `Sub-tasks: ${subTasks.length}`, ""];
      lines.push("Starting orchestration...");

      try {
        const result = await coordinatorManager.orchestrate(taskId, config, (msg) => {
          lines.push(`  ${msg}`);
        });
        lines.push("", "--- Results ---");
        lines.push(result);
      } catch (err: any) {
        lines.push(`\nError: ${err.message}`);
      }

      return lines.join("\n");
    }
  },
  {
    name: "list_coordination_tasks",
    category: "agent",
    description: "List all coordination tasks.",
    risk: "low",
    input_schema: { type: "object", properties: {} },
    execute: async () => {
      const tasks = coordinatorManager.listTasks();
      if (tasks.length === 0) return "No coordination tasks.";

      const lines = ["Coordination Tasks:"];
      for (const t of tasks) {
        lines.push(`  ${t.id} | ${t.title} | ${t.status} | ${t.subTasks.length} sub-tasks | ${t.createdAt}`);
      }
      return lines.join("\n");
    }
  },
  {
    name: "always_on_status",
    category: "agent",
    description: "Show status of the always-on agent service.",
    risk: "low",
    input_schema: { type: "object", properties: {} },
    execute: async () => {
      const status = alwaysOnService.getStatus();
      const cfgPath = path.join(homedir(), ".lulu", "alwayson.json");
      let configDetail = "";
      if (existsSync(cfgPath)) {
        const cfg = JSON.parse(readFileSync(cfgPath, "utf-8"));
        configDetail = `Interval: ${cfg.intervalMs}ms | Telegram: ${cfg.notifications.telegram} | Memory review: ${cfg.memoryGrowthReview}`;
      }

      return [
        `Always-On Service:`,
        `  Enabled: ${status.enabled} | Running: ${status.running}`,
        `  Interval: ${status.intervalMs}ms`,
        configDetail,
        `  Tasks run: ${status.tasksRun} | Notifications: ${status.notificationsSent}`,
        status.lastTick ? `  Last tick: ${status.lastTick}` : "",
        status.nextTick ? `  Next tick: ${status.nextTick}` : "",
      ].filter(Boolean).join("\n");
    }
  },
  {
    name: "configure_always_on",
    category: "agent",
    description: "Enable or disable always-on mode and configure notification channels.",
    risk: "medium",
    input_schema: {
      type: "object",
      properties: {
        enabled: { type: "boolean", description: "Enable or disable the always-on service." },
        interval_ms: { type: "number", description: "Tick interval in milliseconds. Default: 60000." },
        telegram_notifications: { type: "boolean", description: "Send Telegram notifications. Default: true." },
        memory_growth_review: { type: "boolean", description: "Enable daily memory growth review. Default: true." }
      }
    },
    execute: async (input) => {
      if (input.enabled === true) {
        alwaysOnService.updateConfig({
          enabled: true,
          intervalMs: input.interval_ms || 60_000,
          notifications: {
            telegram: input.telegram_notifications ?? true,
            desktop: false,
          },
          memoryGrowthReview: input.memory_growth_review ?? true,
        });
        alwaysOnService.start();
        return "Always-on service started.";
      } else if (input.enabled === false) {
        alwaysOnService.stop();
        return "Always-on service stopped.";
      }
      return "No change. Provide enabled: true or false.";
    }
  },
  {
    name: "send_notification",
    category: "agent",
    description: "Send a notification to configured channels (Telegram, webhook).",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Notification title." },
        body: { type: "string", description: "Notification body text." },
        priority: { type: "string", enum: ["low", "medium", "high"], description: "Priority level. Default: low." }
      },
      required: ["title", "body"]
    },
    execute: async (input) => {
      await notificationManager.send({
        title: input.title,
        body: input.body,
        source: "agent",
        priority: input.priority || "low",
        timestamp: new Date().toISOString(),
      });
      return `Notification sent: ${input.title}`;
    }
  },
  {
    name: "notification_history",
    category: "agent",
    description: "Show recent notification history.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max notifications to show. Default: 20." }
      }
    },
    execute: async (input) => {
      const history = notificationManager.history(input.limit || 20);
      if (history.length === 0) return "No notification history.";

      const lines = ["Recent Notifications:"];
      for (const n of history) {
        lines.push(`  [${n.timestamp}] ${n.priority.toUpperCase()} | ${n.source} | ${n.title}`);
        lines.push(`    ${n.body.slice(0, 100)}${n.body.length > 100 ? "..." : ""}`);
      }
      return lines.join("\n");
    }
  },
];
