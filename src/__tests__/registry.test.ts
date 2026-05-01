import { describe, it, expect } from "bun:test";
import { registry } from "../tools/registry.js";
import "../tools/tools.js"; // Trigger registration
import type { AgentConfig } from "../types/types.js";

describe("ToolRegistry", () => {
  const mockConfig: AgentConfig = {
    provider: "claude",
    model: "test",
    apiKey: "key",
    systemPrompt: "",
    maxTokens: 100,
    channel: "cli"
  };

  it("should list registered tools", () => {
    const defs = registry.getToolDefs();
    expect(defs.length).toBeGreaterThan(0);
    expect(defs.some(d => d.name === "read_file")).toBe(true);
  });

  it("should get specific tool", () => {
    const tool = registry.getTool("write_file");
    expect(tool).toBeDefined();
    expect(tool?.category).toBe("filesystem");
  });

  it("should execute a tool successfully", async () => {
    const result = await registry.execute({
      id: "call-1",
      name: "get_capabilities",
      input: {}
    }, mockConfig);

    if (result.is_error) {
      console.error("Tool execution failed:", result.content);
    }
    expect(result.is_error).toBeFalsy();
    expect(result.content).toContain("OS");
  }, 15000);

  it("should handle non-existent tools", async () => {
    const result = await registry.execute({
      id: "call-2",
      name: "ghost_tool",
      input: {}
    }, mockConfig);

    expect(result.is_error).toBe(true);
    expect(result.content).toContain("Tool not found");
  });
});
