import { execSync, execFileSync } from "node:child_process";
import type { Tool } from "../registry.js";

export const gitTools: Tool[] = [
  {
    name: "git_diff",
    category: "git",
    description: "Show git diff.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        staged: { type: "boolean" },
        commit: { type: "string" },
        file: { type: "string" }
      }
    },
    execute: async (input) => {
      const args = ["diff"];
      if (input.staged) args.push("--staged");
      if (input.commit) args.push(input.commit);
      if (input.file) args.push("--", input.file);
      return execFileSync("git", args, { encoding: "utf-8", timeout: 15000 }) || "(no changes)";
    }
  },
  {
    name: "git_log",
    category: "git",
    description: "Show git commit history.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        count: { type: "integer" },
        file: { type: "string" },
        author: { type: "string" }
      }
    },
    execute: async (input) => {
      const count = input.count ?? 10;
      const args = ["log", `-${Math.min(count, 50)}`, "--oneline", "--decorate"];
      if (input.author) args.push("--author", input.author);
      if (input.file) args.push("--", input.file);
      return execFileSync("git", args, { encoding: "utf-8", timeout: 10000 }) || "(no commits)";
    }
  }
];
