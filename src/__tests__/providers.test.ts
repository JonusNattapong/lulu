import { describe, it, expect } from "bun:test";
import { calculateCost, getBaseUrl } from "../agent/providers.js";

describe("calculateCost", () => {
  it("should calculate Claude Sonnet cost correctly", () => {
    const cost = calculateCost("claude-3-5-sonnet-20241022", 1000, 500);
    expect(cost).toBe((1000 * 3 + 500 * 15) / 1_000_000);
  });

  it("should calculate Haiku cost correctly", () => {
    const cost = calculateCost("claude-3-5-haiku-20241022", 1000, 500);
    expect(cost).toBe((1000 * 0.25 + 500 * 1.25) / 1_000_000);
  });

  it("should calculate GPT-4o cost correctly", () => {
    const cost = calculateCost("gpt-4o", 1000, 500);
    expect(cost).toBe((1000 * 2.5 + 500 * 10) / 1_000_000);
  });

  it("should return 0 for unknown model", () => {
    const cost = calculateCost("unknown-model", 1000, 500);
    expect(cost).toBe(0);
  });

  it("should handle zero tokens", () => {
    const cost = calculateCost("claude-3-5-sonnet-20241022", 0, 0);
    expect(cost).toBe(0);
  });
});

describe("getBaseUrl", () => {
  it("should return correct base URL for openrouter", () => {
    expect(getBaseUrl("openrouter")).toBe("https://openrouter.ai/api/v1");
  });

  it("should return correct base URL for deepseek", () => {
    expect(getBaseUrl("deepseek")).toBe("https://api.deepseek.com");
  });

  it("should return correct base URL for mistral", () => {
    expect(getBaseUrl("mistral")).toBe("https://api.mistral.ai/v1");
  });

  it("should return correct base URL for openai", () => {
    expect(getBaseUrl("openai")).toBe("https://api.openai.com/v1");
  });

  it("should return correct base URL for kilocode", () => {
    expect(getBaseUrl("kilocode")).toBe("https://api.kilocode.com/v1");
  });

  it("should return correct base URL for opencode", () => {
    expect(getBaseUrl("opencode")).toBe("https://api.opencode.com/v1");
  });

  it("should return empty string for unknown provider", () => {
    expect(getBaseUrl("unknown" as any)).toBe("");
  });
});
