import { TaskManager } from "../../core/tasks.js";
import type { Tool } from "../registry.js";

export const taskTools: Tool[] = [
  {
    name: "task_create",
    category: "tasks",
    description: "Create a new task in the Task Engine. Supports checklist, owner, and priority.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        title: { "type": "string", "description": "Short summary of the task" },
        description: { "type": "string", "description": "Detailed goal of the task" },
        priority: { "type": "string", "enum": ["low", "medium", "high"], "default": "medium" },
        checklist: { "type": "array", "items": { "type": "string" } },
        owner: { "type": "string" }
      },
      required: ["title"]
    },
    execute: async (input, config) => {
      const taskManager = new TaskManager(config.projectName || "default");
      const id = await taskManager.createTask({
        title: input.title,
        description: input.description,
        priority: input.priority,
        checklist: (input.checklist || []).map((text: string) => ({ text, completed: false })),
        owner: input.owner || "Lulu"
      });
      return `Task created: ${id}`;
    }
  },
  {
    name: "task_update",
    category: "tasks",
    description: "Update an existing task's status, checklist, or description.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        id: { "type": "string", "description": "Task ID" },
        status: { "type": "string", "enum": ["pending", "running", "blocked", "done"] },
        description: { "type": "string" },
        priority: { "type": "string", "enum": ["low", "medium", "high"] },
        owner: { "type": "string" }
      },
      required: ["id"]
    },
    execute: async (input, config) => {
      const taskManager = new TaskManager(config.projectName || "default");
      const { id, ...updates } = input as any;
      await taskManager.updateTask(id, updates);
      return `Task ${id} updated.`;
    }
  },
  {
    name: "task_list",
    category: "tasks",
    description: "List tasks from the engine with optional status filter.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        status: { "type": "string", "enum": ["pending", "running", "blocked", "done", "all"], "default": "all" }
      }
    },
    execute: async (input, config) => {
      const taskManager = new TaskManager(config.projectName || "default");
      const status = input.status === "all" ? undefined : input.status;
      const tasks = await taskManager.listTasks(status);
      if (tasks.length === 0) return "No tasks found.";
      return tasks.map(t => {
        const checkDone = t.checklist.filter(c => c.completed).length;
        const checkTotal = t.checklist.length;
        const progress = checkTotal > 0 ? ` (${checkDone}/${checkTotal})` : "";
        return `[${t.id}] ${t.status.toUpperCase()} | ${t.priority.toUpperCase()} | ${t.title}${progress}${t.owner ? ` (@${t.owner})` : ""}`;
      }).join("\n");
    }
  },
  {
    name: "task_add_log",
    category: "tasks",
    description: "Add a progress log entry to a task.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        id: { "type": "string" },
        message: { "type": "string" }
      },
      required: ["id", "message"]
    },
    execute: async (input, config) => {
      const taskManager = new TaskManager(config.projectName || "default");
      await taskManager.addLog(input.id, input.message);
      return `Log added to task ${input.id}.`;
    }
  },
  {
    name: "task_checklist_toggle",
    category: "tasks",
    description: "Toggle completion status of a checklist item.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        id: { "type": "string" },
        item_index: { "type": "integer" },
        completed: { "type": "boolean" }
      },
      required: ["id", "item_index", "completed"]
    },
    execute: async (input, config) => {
      const taskManager = new TaskManager(config.projectName || "default");
      const task = await taskManager.getTask(input.id);
      if (!task) return `Task ${input.id} not found.`;
      if (input.item_index < 0 || input.item_index >= task.checklist.length) return "Invalid index.";
      task.checklist[input.item_index].completed = input.completed;
      await taskManager.updateTask(input.id, { checklist: task.checklist });
      return `Task ${input.id} checklist updated.`;
    }
  }
];
