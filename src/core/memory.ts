import { Database } from "bun:sqlite";
import * as sqliteVec from "sqlite-vec";
import path from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { getProjectDir, getProjectMemoryDb } from "./paths.js";
import { getEmbedding } from "../providers/providers.js";
import type { AgentConfig } from "../types/types.js";

export interface MemoryEntry {
  content: string;
  metadata: string;
}

export class MemoryManager {
  private db: Database;

  constructor(projectName: string) {
    const projectDir = getProjectDir(projectName);
    if (!existsSync(projectDir)) mkdirSync(projectDir, { recursive: true });

    // Use separate DB for memory to avoid conflict with brain.db (used by TaskManager)
    const dbPath = getProjectMemoryDb(projectName);
    this.db = new Database(dbPath);

    // Try loading sqlite-vec extension but continue without it if unavailable
    try {
      const vecPath = sqliteVec.getLoadablePath();
      this.db.loadExtension(vecPath);
    } catch (err) {
      console.log("[Memory] Vector search unavailable, using keyword fallback");
    }

    this.init();
  }

  private init() {
    // Create regular table for content
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        metadata TEXT,
        is_compacted INTEGER DEFAULT 0,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Try to create virtual table for vector search
    // 384 is the dimension for all-MiniLM-L6-v2
    try {
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS vec_memories_local USING vec0(
          embedding float[384]
        );
      `);
    } catch {
      console.log("[Memory] Vector search unavailable, using keyword fallback");
    }
  }

  async addMemory(config: AgentConfig, content: string, metadata: any = {}) {
    try {
      const { embedding } = await getEmbedding(config, content);

      const insert = this.db.prepare('INSERT INTO memories (content, metadata) VALUES (?, ?)');
      insert.run(content, JSON.stringify(metadata));
      const rowid = (this.db as any).lastInsertRowid;

      // Try vector insert, skip if vec not available
      try {
        const insertVec = this.db.prepare('INSERT INTO vec_memories_local (rowid, embedding) VALUES (?, ?)');
        insertVec.run(rowid, new Float32Array(embedding));
      } catch {
        // Vector table not available — skip
      }

      return rowid;
    } catch (err) {
      console.error("[Memory] Failed to add memory:", err);
    }
  }

  async search(config: AgentConfig, query: string, limit: number = 5): Promise<MemoryEntry[]> {
    try {
      // Try vector search first
      const { embedding } = await getEmbedding(config, query);

      try {
        const stmt = this.db.prepare(`
          SELECT
            m.content,
            m.metadata,
            v.distance
          FROM vec_memories_local v
          JOIN memories m ON m.id = v.rowid
          WHERE embedding MATCH ?
            AND k = ?
          ORDER BY distance
        `);

        const rows = stmt.all(new Float32Array(embedding), limit) as any[];
        return rows.map(r => ({
          content: r.content,
          metadata: r.metadata
        }));
      } catch {
        // Fallback to keyword search
        return this.keywordSearch(query, limit);
      }
    } catch (err) {
      console.error("[Memory] Search failed:", err);
      return this.keywordSearch(query, limit);
    }
  }

  private keywordSearch(query: string, limit: number): MemoryEntry[] {
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
    if (words.length === 0) return [];

    const rows = this.db.prepare(
      "SELECT * FROM memories ORDER BY timestamp DESC"
    ).all() as any[];

    const scored = rows
      .map(r => {
        const content = r.content.toLowerCase();
        const score = words.reduce((s, w) => s + (content.includes(w) ? 1 : 0), 0);
        return { row: r, score };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored.map(r => ({
      content: r.row.content,
      metadata: r.row.metadata
    }));
  }

  getUncompactedMemories(limit: number = 50): any[] {
    return this.db.prepare(
      "SELECT * FROM memories WHERE is_compacted = 0 ORDER BY timestamp ASC LIMIT ?"
    ).all(limit);
  }

  markAsCompacted(ids: number[]) {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => "?").join(",");
    this.db.prepare(
      `UPDATE memories SET is_compacted = 1 WHERE id IN (${placeholders})`
    ).run(...ids);
  }

  close() {
    this.db.close();
  }
}
