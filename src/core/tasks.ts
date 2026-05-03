import { Database } from "bun:sqlite";
import path from "node:path";
import { homedir } from "node:os";
import { existsSync, mkdirSync } from "node:fs";

export type TaskStatus = "pending" | "running" | "blocked" | "done";
export type TaskPriority = "low" | "medium" | "high";

export interface ChecklistItem {
  text: string;
  completed: boolean;
}

export interface TaskLog {
  timestamp: string;
  message: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  checklist: ChecklistItem[];
  owner?: string;
  logs: TaskLog[];
  priority: TaskPriority;
  createdAt: string;
  updatedAt: string;
}

export class TaskManager {
  private db: Database;

  constructor(projectName: string) {
    const projectDir = path.join(homedir(), ".lulu", "projects", projectName);
    if (!existsSync(projectDir)) mkdirSync(projectDir, { recursive: true });

    // Use separate DB for tasks to avoid conflict with brain.db (used by Brain) and memory.db (used by MemoryManager)
    const dbPath = path.join(projectDir, "tasks.db");
    this.db = new Database(dbPath);
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'pending',
        checklist TEXT,
        owner TEXT,
        logs TEXT,
        priority TEXT DEFAULT 'medium',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  async createTask(task: Partial<Task>): Promise<string> {
    const id = task.id || `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const stmt = this.db.prepare(`
      INSERT INTO tasks (id, title, description, status, checklist, owner, logs, priority)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id,
      task.title || "Untitled Task",
      task.description || "",
      task.status || "pending",
      JSON.stringify(task.checklist || []),
      task.owner || "Lulu",
      JSON.stringify(task.logs || [{ timestamp: new Date().toISOString(), message: "Task created" }]),
      task.priority || "medium"
    );
    
    return id;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<void> {
    const task = await this.getTask(id);
    if (!task) throw new Error(`Task ${id} not found`);

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.title) { fields.push("title = ?"); values.push(updates.title); }
    if (updates.description !== undefined) { fields.push("description = ?"); values.push(updates.description); }
    if (updates.status) { fields.push("status = ?"); values.push(updates.status); }
    if (updates.checklist) { fields.push("checklist = ?"); values.push(JSON.stringify(updates.checklist)); }
    if (updates.owner) { fields.push("owner = ?"); values.push(updates.owner); }
    if (updates.priority) { fields.push("priority = ?"); values.push(updates.priority); }
    
    if (updates.logs) {
      const mergedLogs = [...task.logs, ...updates.logs];
      fields.push("logs = ?");
      values.push(JSON.stringify(mergedLogs));
    }

    fields.push("updated_at = ?");
    values.push(new Date().toISOString());

    const query = `UPDATE tasks SET ${fields.join(", ")} WHERE id = ?`;
    this.db.prepare(query).run(...values, id);
  }

  async addLog(id: string, message: string): Promise<void> {
    const task = await this.getTask(id);
    if (!task) throw new Error(`Task ${id} not found`);
    
    const logs = [...task.logs, { timestamp: new Date().toISOString(), message }];
    this.db.prepare("UPDATE tasks SET logs = ?, updated_at = ? WHERE id = ?").run(
      JSON.stringify(logs),
      new Date().toISOString(),
      id
    );
  }

  async getTask(id: string): Promise<Task | null> {
    const row = this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as any;
    if (!row) return null;
    
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      checklist: JSON.parse(row.checklist || "[]"),
      owner: row.owner,
      logs: JSON.parse(row.logs || "[]"),
      priority: row.priority,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async listTasks(status?: TaskStatus): Promise<Task[]> {
    let query = "SELECT * FROM tasks";
    const values: any[] = [];
    
    if (status) {
      query += " WHERE status = ?";
      values.push(status);
    }
    
    query += " ORDER BY created_at DESC";
    
    const rows = this.db.prepare(query).all(...values) as any[];
    return rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      checklist: JSON.parse(row.checklist || "[]"),
      owner: row.owner,
      logs: JSON.parse(row.logs || "[]"),
      priority: row.priority,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  listActiveTasks(): Task[] {
    const rows = this.db.prepare("SELECT * FROM tasks WHERE status != 'done' ORDER BY created_at DESC").all() as any[];
    return rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      checklist: JSON.parse(row.checklist || "[]"),
      owner: row.owner,
      logs: JSON.parse(row.logs || "[]"),
      priority: row.priority,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  async deleteTask(id: string): Promise<void> {
    this.db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
  }

  close() {
    this.db.close();
  }
}
