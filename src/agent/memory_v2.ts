import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import path from "node:path";
import { homedir } from "node:os";
import { existsSync, mkdirSync } from "node:fs";
import { getEmbedding } from "./providers.js";
import type { AgentConfig } from "../types.js";

export interface MemoryEntry {
  content: string;
  metadata: string;
}

export class MemoryManager {
  private db: Database.Database;

  constructor(projectName: string) {
    const projectDir = path.join(homedir(), ".lulu", "projects", projectName);
    if (!existsSync(projectDir)) mkdirSync(projectDir, { recursive: true });
    
    const dbPath = path.join(projectDir, "brain.db");
    this.db = new Database(dbPath);
    
    // Load sqlite-vec extension
    sqliteVec.load(this.db);
    
    this.init();
  }

  private init() {
    // Create regular table for content
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        metadata TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      -- Create virtual table for vector search
      -- 384 is the dimension for all-MiniLM-L6-v2
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_memories_local USING vec0(
        embedding float[384]
      );
    `);
  }

  async addMemory(config: AgentConfig, content: string, metadata: any = {}) {
    try {
      const { embedding } = await getEmbedding(config, content);
      
      const insert = this.db.prepare('INSERT INTO memories (content, metadata) VALUES (?, ?)');
      const result = insert.run(content, JSON.stringify(metadata));
      const rowid = result.lastInsertRowid;

      const insertVec = this.db.prepare('INSERT INTO vec_memories_local (rowid, embedding) VALUES (?, ?)');
      insertVec.run(rowid, new Float32Array(embedding));
      
      return rowid;
    } catch (err) {
      console.error("[Memory] Failed to add memory:", err);
    }
  }

  async search(config: AgentConfig, query: string, limit: number = 5): Promise<MemoryEntry[]> {
    try {
      const { embedding } = await getEmbedding(config, query);
      
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
    } catch (err) {
      console.error("[Memory] Search failed:", err);
      return [];
    }
  }

  close() {
    this.db.close();
  }
}
