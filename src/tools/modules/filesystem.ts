import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, cpSync, rmSync } from "node:fs";
import path from "node:path";
import type { Tool } from "../registry.js";
import { wildcardMatch, searchFiles } from "../utils.js";
import { SecurityManager } from "../../core/security.js";

export const filesystemTools: Tool[] = [
  {
    name: "read_file",
    category: "filesystem",
    description: "Read the contents of a file. Returns the file content with line numbers.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Absolute path to the file to read" },
        offset: { type: "integer", description: "Line number to start reading from (optional)" },
        limit: { type: "integer", description: "Maximum number of lines to read (optional)" }
      },
      required: ["file_path"]
    },
    execute: async (input, config) => {
      const allowedRoots = [config.projectRoot || process.cwd()];
      const fp = SecurityManager.sanitizePath(input.file_path as string, allowedRoots);
      if (!existsSync(fp)) return `File not found: ${fp}`;
      const content = readFileSync(fp, "utf-8");
      const lines = content.split(/\r?\n/);
      const offset = (input.offset as number) ?? 1;
      let limit = (input.limit as number) ?? lines.length;
      limit = Math.min(limit, lines.length - offset + 1);
      const sliced = lines.slice(offset - 1, offset - 1 + limit);
      return sliced.map((l, i) => `${offset + i}\t${l}`).join("\n");
    }
  },
  {
    name: "write_file",
    category: "filesystem",
    description: "Write content to a file. Creates or overwrites the file.",
    risk: "medium",
    permissions: ["write"],
    input_schema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Absolute path to the file to write" },
        content: { type: "string", description: "Content to write to the file" }
      },
      required: ["file_path", "content"]
    },
    execute: async (input, config) => {
      const allowedRoots = [config.projectRoot || process.cwd()];
      const fp = SecurityManager.sanitizePath(input.file_path as string, allowedRoots);
      const dir = path.dirname(fp);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(fp, input.content as string, "utf-8");
      return `File written: ${fp}`;
    }
  },
  {
    name: "list_files",
    category: "filesystem",
    description: "List files in a directory.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        dir_path: { type: "string", description: "Absolute path to the directory to list" },
        pattern: { type: "string", description: "Optional glob pattern to filter files (e.g., '*.ts')" }
      },
      required: ["dir_path"]
    },
    execute: async (input, config) => {
      const allowedRoots = [config.projectRoot || process.cwd()];
      const dir = SecurityManager.sanitizePath(input.dir_path as string, allowedRoots);
      if (!existsSync(dir)) return `Directory not found: ${dir}`;
      const pattern = input.pattern as string | undefined;
      const files = readdirSync(dir).filter((file) =>
        pattern ? wildcardMatch(file, pattern) : true,
      );
      return files.length > 0 ? files.join("\n") : "(empty)";
    }
  },
  {
    name: "search_content",
    category: "filesystem",
    description: "Search for a regex pattern in files within a directory.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regular expression pattern to search for" },
        path: { type: "string", description: "Directory or file to search in" },
        glob: { type: "string", description: "Optional file glob filter (e.g., '*.ts')" }
      },
      required: ["pattern", "path"]
    },
    execute: async (input, config) => {
      const allowedRoots = [config.projectRoot || process.cwd()];
      const pattern = input.pattern as string;
      const searchPath = SecurityManager.sanitizePath(input.path as string, allowedRoots);
      const globFilter = input.glob as string | undefined;
      const regex = new RegExp(pattern);
      const results: string[] = [];
      searchFiles(searchPath, regex, globFilter, results);
      return results.length > 0 ? results.join("\n") : "No matches found";
    }
  },
  {
    name: "filesystem_move",
    category: "filesystem",
    description: "Move a file or directory from source to destination.",
    risk: "medium",
    permissions: ["command"],
    input_schema: {
      type: "object",
      properties: {
        source: { type: "string", description: "Source path" },
        destination: { type: "string", description: "Destination path" }
      },
      required: ["source", "destination"]
    },
    execute: async (input, config) => {
      const allowedRoots = [config.projectRoot || process.cwd()];
      const src = SecurityManager.sanitizePath(input.source as string, allowedRoots);
      const dest = SecurityManager.sanitizePath(input.destination as string, allowedRoots);
      renameSync(src, dest);
      return `Moved: ${src} → ${dest}`;
    }
  },
  {
    name: "filesystem_copy",
    category: "filesystem",
    description: "Copy a file or directory from source to destination.",
    risk: "medium",
    permissions: ["command"],
    input_schema: {
      type: "object",
      properties: {
        source: { type: "string", description: "Source path" },
        destination: { type: "string", description: "Destination path" },
        recursive: { type: "boolean", description: "Copy directories recursively (default true)" }
      },
      required: ["source", "destination"]
    },
    execute: async (input, config) => {
      const allowedRoots = [config.projectRoot || process.cwd()];
      const src = SecurityManager.sanitizePath(input.source as string, allowedRoots);
      const dest = SecurityManager.sanitizePath(input.destination as string, allowedRoots);
      cpSync(src, dest, { recursive: input.recursive !== false });
      return `Copied: ${src} → ${dest}`;
    }
  },
  {
    name: "filesystem_delete",
    category: "filesystem",
    description: "Delete a file or directory. Use with caution.",
    risk: "high",
    permissions: ["delete"],
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to delete" },
        recursive: { type: "boolean", description: "Delete directories recursively (default false)" }
      },
      required: ["path"]
    },
    execute: async (input, config) => {
      const allowedRoots = [config.projectRoot || process.cwd()];
      const target = SecurityManager.sanitizePath(input.path as string, allowedRoots);
      rmSync(target, { recursive: input.recursive === true, force: true });
      return `Deleted: ${target}`;
    }
  }
];
