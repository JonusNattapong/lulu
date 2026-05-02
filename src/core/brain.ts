import { Database } from "bun:sqlite";
import * as sqliteVec from "sqlite-vec";
import path from "node:path";
import { homedir } from "node:os";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { getEmbedding } from "../providers/providers.js";
import type { AgentConfig } from "../types/types.js";

export interface Entity {
  id: string;
  type: "person" | "company" | "concept" | "project" | "location";
  name: string;
  summary?: string;
  metadata?: Record<string, any>;
  mentionCount: number;
  firstSeen: string;
  lastSeen: string;
}

export interface Relationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: string; // e.g., "works_at", "founded", "invested_in", "uses"
  context?: string;
  confidence: number;
}

export interface BrainPage {
  id: string;
  slug: string; // URL-safe identifier
  title: string;
  content: string;
  entities: string[]; // Entity IDs
  outgoingLinks: string[]; // Other page slugs
  incomingLinks: string[]; // Other page slugs
  citations: string[]; // Source URLs or references
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface BrainQueryResult {
  page: BrainPage;
  score: number;
  highlights: string[];
}

export class Brain {
  private db: Database;
  private projectName: string;

  constructor(projectName: string) {
    this.projectName = projectName;
    const projectDir = path.join(homedir(), ".lulu", "projects", projectName);
    if (!existsSync(projectDir)) mkdirSync(projectDir, { recursive: true });

    const dbPath = path.join(projectDir, "brain.db");
    this.db = new Database(dbPath);
    this.init();
  }

  private init(): void {
    this.db.exec(`
      -- Pages (brain content)
      CREATE TABLE IF NOT EXISTS pages (
        id TEXT PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT,
        citations TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Entities (people, companies, concepts)
      CREATE TABLE IF NOT EXISTS entities (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        summary TEXT,
        metadata TEXT,
        mention_count INTEGER DEFAULT 1,
        first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Relationships between entities
      CREATE TABLE IF NOT EXISTS relationships (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        type TEXT NOT NULL,
        context TEXT,
        confidence REAL DEFAULT 1.0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Links between pages
      CREATE TABLE IF NOT EXISTS page_links (
        id TEXT PRIMARY KEY,
        source_slug TEXT NOT NULL,
        target_slug TEXT NOT NULL,
        context TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Page-Entity linking
      CREATE TABLE IF NOT EXISTS page_entities (
        page_slug TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        PRIMARY KEY (page_slug, entity_id)
      );

      -- Page embeddings (fallback - JSON storage when vec not available)
      CREATE TABLE IF NOT EXISTS page_embeddings (
        page_id TEXT PRIMARY KEY,
        embedding TEXT,
        FOREIGN KEY (page_id) REFERENCES pages(id)
      );

      -- Entity embeddings
      CREATE TABLE IF NOT EXISTS entity_embeddings (
        entity_id TEXT PRIMARY KEY,
        embedding TEXT,
        FOREIGN KEY (entity_id) REFERENCES entities(id)
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
      CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
      CREATE INDEX IF NOT EXISTS idx_pages_slug ON pages(slug);
      CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships(source_id);
      CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships(target_id);
      CREATE INDEX IF NOT EXISTS idx_relationships_type ON relationships(type);
    `);

    // Try to load vec0 extension, but continue without it
    let vecAvailable = false;
    try {
      const vecPath = sqliteVec.getLoadablePath();
      this.db.loadExtension(vecPath);
      // Create virtual tables if extension loaded
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS vec_pages USING vec0(embedding float[384]);
        CREATE VIRTUAL TABLE IF NOT EXISTS vec_entities USING vec0(embedding float[384]);
      `);
      vecAvailable = true;
    } catch {
      console.log("[Brain] Vector search unavailable, using keyword fallback");
    }
    (this as any)._vecAvailable = vecAvailable;
  }

  // Page operations
  async createPage(params: {
    title: string;
    content: string;
    tags?: string[];
    citations?: string[];
    entities?: string[];
  }): Promise<BrainPage> {
    const id = `page-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const slug = this.toSlug(params.title);

    const insert = this.db.prepare(`
      INSERT INTO pages (id, slug, title, content, tags, citations)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    insert.run(
      id,
      slug,
      params.title,
      params.content,
      JSON.stringify(params.tags || []),
      JSON.stringify(params.citations || [])
    );

    // Generate and store embedding (fallback to JSON)
    try {
      const { embedding } = await this.embedText(params.content);
      const embedInsert = this.db.prepare(`
        INSERT INTO page_embeddings (page_id, embedding) VALUES (?, ?)
      `);
      embedInsert.run(id, JSON.stringify(embedding));
    } catch (err) {
      console.error("[Brain] Embedding failed:", err);
    }

    // Link entities if provided
    if (params.entities?.length) {
      await this.linkPageToEntities(slug, params.entities);
    }

    return this.getPage(slug)!;
  }

  async updatePage(slug: string, updates: Partial<BrainPage>): Promise<BrainPage | null> {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.content !== undefined) {
      fields.push("content = ?");
      values.push(updates.content);
    }
    if (updates.title) {
      fields.push("title = ?");
      values.push(updates.title);
    }
    if (updates.tags) {
      fields.push("tags = ?");
      values.push(JSON.stringify(updates.tags));
    }
    if (updates.citations) {
      fields.push("citations = ?");
      values.push(JSON.stringify(updates.citations));
    }

    if (fields.length === 0) return this.getPage(slug);

    fields.push("updated_at = ?");
    values.push(new Date().toISOString());
    values.push(slug);

    this.db.prepare(`UPDATE pages SET ${fields.join(", ")} WHERE slug = ?`).run(...values);
    return this.getPage(slug);
  }

  getPage(slug: string): BrainPage | null {
    const row = this.db.prepare("SELECT * FROM pages WHERE slug = ?").get(slug) as any;
    if (!row) return null;

    const incomingLinks = this.db
      .prepare("SELECT source_slug FROM page_links WHERE target_slug = ?")
      .all(slug)
      .map((r: any) => r.source_slug);

    const outgoingLinks = this.db
      .prepare("SELECT target_slug FROM page_links WHERE source_slug = ?")
      .all(slug)
      .map((r: any) => r.target_slug);

    const entityRows = this.db
      .prepare(
        `SELECT e.id FROM entities e
         JOIN page_entities pe ON e.id = pe.entity_id
         WHERE pe.page_slug = ?`
      )
      .all(slug)
      .map((r: any) => r.id);

    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      content: row.content,
      entities: entityRows,
      outgoingLinks,
      incomingLinks,
      citations: JSON.parse(row.citations || "[]"),
      tags: JSON.parse(row.tags || "[]"),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async query(config: AgentConfig, query: string, limit = 5): Promise<BrainQueryResult[]> {
    try {
      // Try vector search first
      const { embedding } = await this.embedText(query);

      try {
        const rows = this.db.prepare(`
          SELECT
            p.*,
            v.distance
          FROM vec_pages v
          JOIN pages p ON p.rowid = v.rowid
          WHERE embedding MATCH ?
            AND k = ?
          ORDER BY distance
        `).all(new Float32Array(embedding), limit) as any[];

        return rows.map((row) => ({
          page: this.getPage(row.slug)!,
          score: 1 - (row.distance || 0),
          highlights: this.extractHighlights(row.content, query),
        }));
      } catch {
        // Fallback to keyword search
        return this.keywordSearch(query, limit);
      }
    } catch (err) {
      console.error("[Brain] Query failed:", err);
      return this.keywordSearch(query, limit);
    }
  }

  private extractHighlights(content: string, query: string): string[] {
    const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const highlights: string[] = [];

    for (const word of words) {
      const idx = content.toLowerCase().indexOf(word);
      if (idx !== -1) {
        const start = Math.max(0, idx - 50);
        const end = Math.min(content.length, idx + word.length + 100);
        highlights.push("..." + content.slice(start, end) + "...");
      }
    }

    return highlights.slice(0, 3);
  }

  // Entity operations
  async createEntity(params: {
    name: string;
    type: Entity["type"];
    summary?: string;
    metadata?: Record<string, any>;
  }): Promise<Entity> {
    const id = `entity-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    this.db.prepare(`
      INSERT INTO entities (id, type, name, summary, metadata)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, params.type, params.name, params.summary, JSON.stringify(params.metadata || {}));

    return this.getEntity(id)!;
  }

  getEntity(id: string): Entity | null {
    const row = this.db.prepare("SELECT * FROM entities WHERE id = ?").get(id) as any;
    if (!row) return null;

    return {
      id: row.id,
      type: row.type,
      name: row.name,
      summary: row.summary,
      metadata: JSON.parse(row.metadata || "{}"),
      mentionCount: row.mention_count,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
    };
  }

  async getOrCreateEntity(name: string, type: Entity["type"]): Promise<Entity> {
    const existing = this.db
      .prepare("SELECT * FROM entities WHERE LOWER(name) = LOWER(?)")
      .get(name) as any;

    if (existing) {
      // Increment mention count
      this.db.prepare(`
        UPDATE entities SET
          mention_count = mention_count + 1,
          last_seen = ?
        WHERE id = ?
      `).run(new Date().toISOString(), existing.id);
      return this.getEntity(existing.id)!;
    }

    return await this.createEntity({ name, type });
  }

  // Relationship operations
  async createRelationship(params: {
    sourceId: string;
    targetId: string;
    type: string;
    context?: string;
    confidence?: number;
  }): Promise<Relationship> {
    const id = `rel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Check if relationship exists
    const existing = this.db
      .prepare(
        `SELECT * FROM relationships WHERE source_id = ? AND target_id = ? AND type = ?`
      )
      .get(params.sourceId, params.targetId, params.type);

    if (existing) return this.getRelationship((existing as any).id)!;

    this.db.prepare(`
      INSERT INTO relationships (id, source_id, target_id, type, context, confidence)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.sourceId,
      params.targetId,
      params.type,
      params.context,
      params.confidence || 1.0
    );

    return this.getRelationship(id)!;
  }

  getRelationship(id: string): Relationship | null {
    const row = this.db.prepare("SELECT * FROM relationships WHERE id = ?").get(id) as any;
    if (!row) return null;

    return {
      id: row.id,
      sourceId: row.source_id,
      targetId: row.target_id,
      type: row.type,
      context: row.context,
      confidence: row.confidence,
    };
  }

  getRelationshipsForEntity(entityId: string): Relationship[] {
    return this.db
      .prepare(
        `SELECT * FROM relationships WHERE source_id = ? OR target_id = ? ORDER BY created_at DESC`
      )
      .all(entityId, entityId)
      .map((r: any) => this.getRelationship(r.id)!);
  }

  // Page-Entity linking
  async linkPageToEntities(pageSlug: string, entityIds: string[]): Promise<void> {
    for (const entityId of entityIds) {
      try {
        this.db.prepare(`
          INSERT OR IGNORE INTO page_entities (page_slug, entity_id) VALUES (?, ?)
        `).run(pageSlug, entityId);
      } catch {
        // Table might not exist yet, create it
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS page_entities (
            page_slug TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            PRIMARY KEY (page_slug, entity_id)
          )
        `);
        this.db.prepare(`
          INSERT OR IGNORE INTO page_entities (page_slug, entity_id) VALUES (?, ?)
        `).run(pageSlug, entityId);
      }
    }
  }

  // Hybrid search: combine vector + keyword + graph
  async hybridSearch(
    config: AgentConfig,
    query: string,
    options: {
      vectorWeight?: number;
      keywordWeight?: number;
      graphWeight?: number;
      limit?: number;
    } = {}
  ): Promise<BrainQueryResult[]> {
    const { vectorWeight = 0.5, keywordWeight = 0.3, graphWeight = 0.2, limit = 5 } = options;

    // 1. Vector search
    const vectorResults = await this.query(config, query, limit * 2);

    // 2. Keyword search
    const keywordResults = this.keywordSearch(query, limit * 2);

    // 3. Graph traversal (find connected pages)
    const graphResults = await this.graphSearch(query, limit * 2);

    // Combine scores
    const scoreMap = new Map<string, { page: BrainPage; score: number; sources: string[] }>();

    for (const r of vectorResults) {
      const existing = scoreMap.get(r.page.slug) || { page: r.page, score: 0, sources: [] };
      existing.score += r.score * vectorWeight;
      existing.sources.push("vector");
      scoreMap.set(r.page.slug, existing);
    }

    for (const r of keywordResults) {
      const existing = scoreMap.get(r.page.slug) || { page: r.page, score: 0, sources: [] };
      existing.score += r.score * keywordWeight;
      existing.sources.push("keyword");
      scoreMap.set(r.page.slug, existing);
    }

    for (const r of graphResults) {
      const existing = scoreMap.get(r.page.slug) || { page: r.page, score: 0, sources: [] };
      existing.score += r.score * graphWeight;
      existing.sources.push("graph");
      scoreMap.set(r.page.slug, existing);
    }

    return Array.from(scoreMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((r) => ({ ...r, highlights: [] }));
  }

  private keywordSearch(query: string, limit: number): BrainQueryResult[] {
    const words = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);

    if (words.length === 0) return [];

    const rows = this.db
      .prepare(
        `SELECT * FROM pages WHERE LOWER(content) LIKE ? OR LOWER(title) LIKE ? LIMIT ?`
      )
      .all(`%${words.join("%")}%`, `%${words.join("%")}%`, limit) as any[];

    return rows.map((row) => ({
      page: this.getPage(row.slug)!,
      score: 0.5,
      highlights: this.extractHighlights(row.content, query),
    }));
  }

  private async graphSearch(query: string, limit: number): Promise<BrainQueryResult[]> {
    // Find entities mentioned in query
    const words = query.split(/\s+/).filter((w) => w.length > 3);
    const results: BrainQueryResult[] = [];

    for (const word of words) {
      const entities = this.db
        .prepare("SELECT id FROM entities WHERE LOWER(name) LIKE ?")
        .all(`%${word.toLowerCase()}%`) as any[];

      for (const entity of entities) {
        // Get pages linked to this entity
        const pages = this.db
          .prepare(
            `SELECT p.* FROM pages p
             JOIN page_entities pe ON p.slug = pe.page_slug
             WHERE pe.entity_id = ?`
          )
          .all(entity.id) as any[];

        for (const page of pages) {
          results.push({
            page: this.getPage(page.slug)!,
            score: 0.3,
            highlights: [],
          });
        }

        // Get related entities
        const rels = this.getRelationshipsForEntity(entity.id);
        for (const rel of rels) {
          const relatedEntity = this.getEntity(rel.targetId);
          if (relatedEntity && relatedEntity.name.toLowerCase().includes(word.toLowerCase())) {
            results.push({
              page: { id: "", slug: "", title: relatedEntity.name, content: relatedEntity.summary || "", entities: [], outgoingLinks: [], incomingLinks: [], citations: [], tags: [], createdAt: "", updatedAt: "" },
              score: 0.2,
              highlights: [],
            });
          }
        }
      }
    }

    return results.slice(0, limit);
  }

  // Signal detector: extract entities from text
  async detectEntities(text: string): Promise<Entity[]> {
    const entities: Entity[] = [];
    const words = text.split(/\s+/);

    // Simple extraction heuristics (can be enhanced with NER)
    for (const word of words) {
      // Capitalized words are likely entities
      if (word[0] === word[0]?.toUpperCase() && word.length > 2) {
        const cleanWord = word.replace(/[^a-zA-Z0-9\s]/g, "");
        if (cleanWord.length > 2) {
          // Determine type by context (simplified)
          const type: Entity["type"] = this.guessEntityType(cleanWord, text);
          const entity = await this.getOrCreateEntity(cleanWord, type);
          entities.push(entity);
        }
      }
    }

    return entities;
  }

  private guessEntityType(name: string, context: string): Entity["type"] {
    const lowerContext = context.toLowerCase();

    if (["inc", "corp", "llc", "ltd", "gmbh", "co.", "company"].some((s) => lowerContext.includes(s))) {
      return "company";
    }
    if (lowerContext.includes("founded") || lowerContext.includes("ceo") || lowerContext.includes("cto")) {
      return "person";
    }
    if (lowerContext.includes("project") || lowerContext.includes("repo")) {
      return "project";
    }
    if (lowerContext.includes("concept") || lowerContext.includes("idea")) {
      return "concept";
    }

    return "person"; // Default to person
  }

  // Utility methods
  private toSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);
  }

  private async embedText(text: string): Promise<{ embedding: number[] }> {
    try {
      const config = { provider: "claude" as const, model: "claude-3-5-sonnet-20241022", apiKey: "", systemPrompt: "", maxTokens: 4096, projectName: this.projectName, projectRoot: "", mcpServers: [], channel: "cli" as const };
      const result = await getEmbedding(config, text);
      return result;
    } catch (err) {
      console.error("[Brain] Embedding failed:", err);
      return { embedding: new Array(384).fill(0) };
    }
  }

  // Statistics
  getStats(): { pages: number; entities: number; relationships: number } {
    const pages = (this.db.prepare("SELECT COUNT(*) as count").get() as any).count;
    const entities = (this.db.prepare("SELECT COUNT(*) as count").get() as any).count;
    const relationships = (this.db.prepare("SELECT COUNT(*) as count").get() as any).count;

    return { pages, entities, relationships };
  }

  close(): void {
    this.db.close();
  }
}

// Singleton for quick access
let brainInstance: Brain | null = null;

export function getBrain(projectName?: string): Brain {
  if (!brainInstance) {
    const projectDir = path.join(process.cwd(), "package.json");
    const name = projectName || (existsSync(projectDir) ? JSON.parse(readFileSync(projectDir, "utf-8")).name || "default" : "default");
    brainInstance = new Brain(name);
  }
  return brainInstance;
}