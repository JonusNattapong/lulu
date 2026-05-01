import { describe, it, expect } from "bun:test";
import type {
  ToolDef,
  ToolCall,
  ToolResult,
  AgentConfig,
  Usage,
  StreamEvent,
} from "../types.js";

describe("Type definitions", () => {
  it("ToolDef shape is correct", () => {
    const tool: ToolDef = {
      name: "read_file",
      description: "Read a file",
      input_schema: {
        type: "object",
        properties: {
          file_path: { type: "string" },
        },
        required: ["file_path"],
      },
    };
    expect(tool.name).toBe("read_file");
    expect(tool.description).toBe("Read a file");
    expect(tool.input_schema.type).toBe("object");
  });

  it("ToolCall shape is correct", () => {
    const call: ToolCall = {
      id: "call_123",
      name: "write_file",
      input: { file_path: "/tmp/test.txt", content: "hello" },
    };
    expect(call.id).toBe("call_123");
    expect(call.name).toBe("write_file");
    expect(call.input.file_path).toBe("/tmp/test.txt");
  });

  it("ToolResult shape is correct", () => {
    const result: ToolResult = {
      tool_use_id: "call_123",
      content: "File written",
      is_error: false,
    };
    expect(result.tool_use_id).toBe("call_123");
    expect(result.content).toBe("File written");
    expect(result.is_error).toBe(false);
  });

  it("AgentConfig has expected fields", () => {
    const config: AgentConfig = {
      provider: "claude",
      apiKey: "test-key",
      model: "claude-3-5-sonnet-20241022",
      maxTokens: 4096,
      systemPrompt: "You are Lulu.",
      projectName: "test-project",
    };
    expect(config.provider).toBe("claude");
    expect(config.model).toBe("claude-3-5-sonnet-20241022");
    expect(config.maxTokens).toBe(4096);
  });

  it("Usage shape is correct", () => {
    const usage: Usage = {
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      costEstimate: 0.0075,
    };
    expect(usage.totalTokens).toBe(1500);
    expect(usage.costEstimate).toBeGreaterThan(0);
  });

  it("StreamEvent type discriminator works", () => {
    const events: StreamEvent[] = [
      { type: "text_delta", text: "hello" },
      { type: "text_end", text: "world" },
      { type: "tool_use", toolCalls: [] },
      { type: "usage", usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costEstimate: 0 } },
    ];

    expect(events[0].type).toBe("text_delta");
    expect(events[1].type).toBe("text_end");
    expect(events[2].type).toBe("tool_use");
    expect(events[3].type).toBe("usage");
  });
});
