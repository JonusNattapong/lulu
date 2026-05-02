/**
 * Cross-Session Global Memory
 * Persists across all projects, not project-scoped.
 * Stores facts, preferences, and context that accumulate over time.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { eventBus } from "./events.js";

const GLOBAL_MEMORY_PATH = path.join(homedir(), ".lulu", "global-memory.json");

export interface GlobalFact {
  id: string;
  key: string;
  value: string;
  category: "fact" | "preference" | "context" | "todo" | "reminder" | "research";
  source: "user" | "agent" | "auto" | "learned";
  tags: string[];
  createdAt: string;
  updatedAt: string;
  accessedAt?: string;
  accessCount: number;
  confidence: number;
}

interface GlobalMemoryStore {
  facts: GlobalFact[];
  todoList: Array<{ id: string; text: string; done: boolean; priority: "low" | "medium" | "high"; createdAt: string }>;
  researchQueue: Array<{ id: string; query: string; status: "pending" | "in_progress" | "done"; result?: string; createdAt: string }>;
  lastSync: string;
}

const DEFAULT_STORE: GlobalMemoryStore = {
  facts: [],
  todoList: [],
  researchQueue: [],
  lastSync: new Date().toISOString(),
};

class GlobalMemory {
  private store: GlobalMemoryStore;

  constructor() {
    mkdirSync(path.dirname(GLOBAL_MEMORY_PATH), { recursive: true });
    this.store = this.load();
  }

  private load(): GlobalMemoryStore {
    if (!existsSync(GLOBAL_MEMORY_PATH)) {
      writeFileSync(GLOBAL_MEMORY_PATH, JSON.stringify(DEFAULT_STORE, null, 2));
      return { ...DEFAULT_STORE };
    }
    try {
      return { ...DEFAULT_STORE, ...JSON.parse(readFileSync(GLOBAL_MEMORY_PATH, "utf-8")) };
    } catch {
      return { ...DEFAULT_STORE };
    }
  }

  private save(): void {
    this.store.lastSync = new Date().toISOString();
    writeFileSync(GLOBAL_MEMORY_PATH, JSON.stringify(this.store, null, 2));
  }

  /** Add a fact */
  addFact(params: {
    key: string;
    value: string;
    category?: GlobalFact["category"];
    source?: GlobalFact["source"];
    tags?: string[];
    confidence?: number;
  }): GlobalFact {
    // Update existing if key matches
    const existing = this.store.facts.find(f => f.key === params.key);
    if (existing) {
      existing.value = params.value;
      existing.confidence = params.confidence ?? existing.confidence;
      existing.updatedAt = new Date().toISOString();
      existing.accessCount = 0;
      this.save();
      eventBus.emit("global-memory:fact:updated", { key: params.key });
      return existing;
    }

    const fact: GlobalFact = {
      id: `fact-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      key: params.key,
      value: params.value,
      category: params.category || "fact",
      source: params.source || "auto",
      tags: params.tags || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      accessCount: 0,
      confidence: params.confidence ?? 0.7,
    };

    this.store.facts.push(fact);
    if (this.store.facts.length > 500) {
      this.store.facts = this.store.facts.slice(-500);
    }
    this.save();
    eventBus.emit("global-memory:fact:created", { key: params.key, category: fact.category });
    return fact;
  }

  /** Get a fact by key */
  getFact(key: string): GlobalFact | null {
    const fact = this.store.facts.find(f => f.key === key);
    if (fact) {
      fact.accessedAt = new Date().toISOString();
      fact.accessCount++;
      this.save();
      return fact;
    }
    return null;
  }

  /** Search facts by query */
  search(query: string, limit = 10): GlobalFact[] {
    const q = query.toLowerCase();
    return this.store.facts
      .filter(f => f.key.toLowerCase().includes(q) || f.value.toLowerCase().includes(q) || f.tags.some(t => t.toLowerCase().includes(q)))
      .sort((a, b) => {
        // Boost by confidence and recency
        const aScore = (a.confidence * 0.6) + (a.accessCount * 0.1) + (new Date(a.updatedAt).getTime() / 1e12);
        const bScore = (b.confidence * 0.6) + (b.accessCount * 0.1) + (new Date(b.updatedAt).getTime() / 1e12);
        return bScore - aScore;
      })
      .slice(0, limit);
  }

  /** Delete a fact */
  deleteFact(key: string): void {
    this.store.facts = this.store.facts.filter(f => f.key !== key);
    this.save();
    eventBus.emit("global-memory:fact:deleted", { key });
  }

  /** List all facts */
  list(category?: GlobalFact["category"]): GlobalFact[] {
    if (category) return this.store.facts.filter(f => f.category === category);
    return [...this.store.facts].sort((a, b) => b.accessCount - a.accessCount);
  }

  /** Todo list management */
  addTodo(text: string, priority: "low" | "medium" | "high" = "medium"): { id: string; text: string; done: boolean; priority: "low" | "medium" | "high" } {
    const todo = { id: `todo-${Date.now()}`, text, done: false, priority, createdAt: new Date().toISOString() };
    this.store.todoList.unshift(todo);
    this.save();
    return todo;
  }

  toggleTodo(id: string): void {
    const todo = this.store.todoList.find(t => t.id === id);
    if (todo) { todo.done = !todo.done; this.save(); }
  }

  listTodos(includeDone = false): Array<{ id: string; text: string; done: boolean; priority: "low" | "medium" | "high" }> {
    if (includeDone) return [...this.store.todoList];
    return this.store.todoList.filter(t => !t.done);
  }

  /** Research queue */
  queueResearch(query: string): string {
    const id = `research-${Date.now()}`;
    this.store.researchQueue.push({ id, query, status: "pending", createdAt: new Date().toISOString() });
    this.save();
    eventBus.emit("global-memory:research:queued", { id, query });
    return id;
  }

  getPendingResearch(): Array<{ id: string; query: string; status: string }> {
    return this.store.researchQueue.filter(r => r.status === "pending");
  }

  markResearchDone(id: string, result: string): void {
    const r = this.store.researchQueue.find(r => r.id === id);
    if (r) { r.status = "done"; r.result = result; this.save(); }
  }

  /** Build global context for system prompt */
  buildContext(): string {
    const parts: string[] = [];

    // High-confidence facts
    const importantFacts = this.store.facts
      .filter(f => f.confidence >= 0.7)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 20);

    if (importantFacts.length > 0) {
      parts.push("=== Global Memory ===");
      for (const f of importantFacts) {
        parts.push(`- [${f.category}] ${f.key}: ${f.value}`);
      }
    }

    // Active todos
    const todos = this.listTodos();
    if (todos.length > 0) {
      parts.push("\n=== Todo List ===");
      for (const t of todos.slice(0, 10)) {
        parts.push(`- ${t.priority === "high" ? "🔴" : t.priority === "medium" ? "🟡" : "🟢"} ${t.text}`);
      }
    }

    // Pending research
    const pending = this.getPendingResearch();
    if (pending.length > 0) {
      parts.push(`\n=== Pending Research (${pending.length}) ===`);
      for (const r of pending.slice(0, 5)) {
        parts.push(`- ? ${r.query}`);
      }
    }

    return parts.join("\n");
  }

  /** Get stats */
  getStats(): { totalFacts: number; byCategory: Record<string, number>; todoCount: number; pendingResearch: number } {
    const byCategory: Record<string, number> = {};
    for (const f of this.store.facts) {
      byCategory[f.category] = (byCategory[f.category] || 0) + 1;
    }
    return {
      totalFacts: this.store.facts.length,
      byCategory,
      todoCount: this.store.todoList.filter(t => !t.done).length,
      pendingResearch: this.getPendingResearch().length,
    };
  }
}

export const globalMemory = new GlobalMemory();