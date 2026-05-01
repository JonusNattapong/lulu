import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { TaskManager } from "../core/tasks.js";
import { rmSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

describe("TaskManager", () => {
  const projectName = "test-project-" + Date.now();
  const dbPath = path.join(homedir(), ".lulu", "projects", projectName, "brain.db");
  let manager: TaskManager;

  beforeEach(() => {
    manager = new TaskManager(projectName);
  });

  afterEach(() => {
    // Cleanup test database
    try {
      if (existsSync(dbPath)) {
        // We can't easily close the Bun SQLite handle here without adding a close method,
        // but for tests we can just use unique project names.
      }
    } catch {}
  });

  it("should create a task", async () => {
    const id = await manager.createTask({
      title: "Test Task",
      description: "Testing tasks",
      priority: "high"
    });
    expect(id).toBeDefined();
    
    const task = await manager.getTask(id);
    expect(task?.title).toBe("Test Task");
    expect(task?.status).toBe("pending");
    expect(task?.priority).toBe("high");
  });

  it("should update a task", async () => {
    const id = await manager.createTask({ title: "Update Me" });
    await manager.updateTask(id, { status: "running" });
    
    const task = await manager.getTask(id);
    expect(task?.status).toBe("running");
  });

  it("should handle checklist", async () => {
    const id = await manager.createTask({
      title: "Checklist Task",
      checklist: [{ text: "Step 1", completed: false }]
    });
    
    let task = await manager.getTask(id);
    expect(task?.checklist.length).toBe(1);
    
    task!.checklist[0].completed = true;
    await manager.updateTask(id, { checklist: task!.checklist });
    
    task = await manager.getTask(id);
    expect(task?.checklist[0].completed).toBe(true);
  });

  it("should list tasks with filter", async () => {
    await manager.createTask({ title: "Task 1", status: "done" });
    await manager.createTask({ title: "Task 2", status: "pending" });
    
    const all = await manager.listTasks();
    expect(all.length).toBeGreaterThanOrEqual(2);
    
    const pending = await manager.listTasks("pending");
    expect(pending.every(t => t.status === "pending")).toBe(true);
  });
});
