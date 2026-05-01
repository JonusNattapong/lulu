import { writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { detectCapabilities, formatCapabilities } from "../../core/capabilities.js";
import type { Tool } from "../registry.js";

export const systemTools: Tool[] = [
  {
    name: "get_capabilities",
    category: "system",
    description: "Re-scan and return current system capabilities.",
    risk: "low",
    input_schema: { type: "object", properties: {} },
    execute: async () => formatCapabilities(detectCapabilities())
  },
  {
    name: "project_init",
    category: "system",
    description: "Initialize a .lulu.json file in current directory.",
    risk: "medium",
    permissions: ["write"],
    input_schema: {
      type: "object",
      properties: {
        stack: { type: "array", items: { type: "string" } },
        conventions: { type: "array", items: { type: "string" } }
      }
    },
    execute: async (input) => {
      const projectRoot = process.cwd();
      const configPath = path.join(projectRoot, ".lulu.json");
      const pkgPath = path.join(projectRoot, "package.json");
      let name = path.basename(projectRoot);
      let scripts = {};
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        name = pkg.name || name;
        scripts = pkg.scripts || {};
      }
      const config = {
        name,
        stack: input.stack || [],
        scripts,
        conventions: input.conventions || [],
        dangerousPaths: ["node_modules", "dist", ".env"]
      };
      writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
      return `Project initialized: .lulu.json created.`;
    }
  }
];
