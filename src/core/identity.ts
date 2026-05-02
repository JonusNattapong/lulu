import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export type IdentityRole = "admin" | "operator" | "viewer";
export type BindingType = "telegram" | "api" | "desktop" | "cli";

export interface LuluUser {
  id: string;
  displayName: string;
  role: IdentityRole;
  projectIds: string[];
  agentIds: string[];
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface IdentityBinding {
  id: string;
  userId: string;
  type: BindingType;
  externalId: string;
  label?: string;
  projectId?: string;
  agentId?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

interface IdentityStore {
  users: Record<string, LuluUser>;
  bindings: Record<string, IdentityBinding>;
}

export interface BindIdentityOptions {
  type: BindingType;
  externalId: string;
  displayName: string;
  role?: IdentityRole;
  projectId?: string;
  agentId?: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

const IDENTITY_FILE = path.join(homedir(), ".lulu", "identity.json");

export class IdentityManager {
  private store: IdentityStore;

  constructor(private readonly filePath = IDENTITY_FILE) {
    this.store = this.load();
  }

  listUsers(): LuluUser[] {
    return Object.values(this.store.users).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  listBindings(): IdentityBinding[] {
    return Object.values(this.store.bindings).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getUser(id: string): LuluUser | null {
    return this.store.users[id] ?? null;
  }

  findBinding(type: BindingType, externalId: string): IdentityBinding | null {
    return this.store.bindings[createBindingId(type, externalId)] ?? null;
  }

  bind(options: BindIdentityOptions): { user: LuluUser; binding: IdentityBinding } {
    const now = new Date().toISOString();
    const bindingId = createBindingId(options.type, options.externalId);
    const existingBinding = this.store.bindings[bindingId];
    const userId = existingBinding?.userId || createUserId(options.type, options.externalId);
    const existingUser = this.store.users[userId];

    const projectIds = mergeUnique(existingUser?.projectIds || [], options.projectId);
    const agentIds = mergeUnique(existingUser?.agentIds || [], options.agentId);

    const user: LuluUser = {
      id: userId,
      displayName: options.displayName,
      role: options.role || existingUser?.role || "operator",
      projectIds,
      agentIds,
      createdAt: existingUser?.createdAt || now,
      updatedAt: now,
      metadata: { ...(existingUser?.metadata || {}), ...(options.metadata || {}) },
    };

    const binding: IdentityBinding = {
      id: bindingId,
      userId,
      type: options.type,
      externalId: options.externalId,
      label: options.label || options.displayName,
      projectId: options.projectId,
      agentId: options.agentId,
      enabled: true,
      createdAt: existingBinding?.createdAt || now,
      updatedAt: now,
      metadata: { ...(existingBinding?.metadata || {}), ...(options.metadata || {}) },
    };

    this.store.users[user.id] = user;
    this.store.bindings[binding.id] = binding;
    this.save();
    return { user, binding };
  }

  describeBinding(type: BindingType, externalId: string): string {
    const binding = this.findBinding(type, externalId);
    if (!binding) return `No binding for ${type}:${externalId}`;
    const user = this.getUser(binding.userId);
    return [
      `Binding: ${binding.id}`,
      `User: ${user?.displayName || binding.userId}`,
      `Role: ${user?.role || "unknown"}`,
      `Project: ${binding.projectId || "any"}`,
      `Agent: ${binding.agentId || "default"}`,
      `Enabled: ${binding.enabled}`,
    ].join("\n");
  }

  private load(): IdentityStore {
    try {
      if (!existsSync(this.filePath)) return { users: {}, bindings: {} };
      const parsed = JSON.parse(readFileSync(this.filePath, "utf-8")) as Partial<IdentityStore>;
      return {
        users: parsed.users || {},
        bindings: parsed.bindings || {},
      };
    } catch {
      return { users: {}, bindings: {} };
    }
  }

  private save(): void {
    const dir = path.dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.store, null, 2), "utf-8");
  }
}

export function createBindingId(type: BindingType, externalId: string): string {
  return `${type}:${sanitizeIdentityPart(externalId)}`;
}

function createUserId(type: BindingType, externalId: string): string {
  return `user:${type}:${sanitizeIdentityPart(externalId)}`;
}

function sanitizeIdentityPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_.:-]+/g, "-").replace(/^-+|-+$/g, "") || "default";
}

function mergeUnique(values: string[], value?: string): string[] {
  if (!value) return values;
  return Array.from(new Set([...values, value]));
}

export const identityManager = new IdentityManager();
