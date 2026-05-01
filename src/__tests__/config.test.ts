import { describe, it, expect } from "bun:test";
import { parsePositiveInt } from "../core/config.js";

describe("parsePositiveInt", () => {
  it("returns fallback for undefined value", () => {
    expect(parsePositiveInt(undefined, 4096)).toBe(4096);
    expect(parsePositiveInt("", 4096)).toBe(4096);
  });

  it("parses valid positive integers", () => {
    expect(parsePositiveInt("100", 0)).toBe(100);
    expect(parsePositiveInt("4096", 0)).toBe(4096);
    expect(parsePositiveInt("1", 0)).toBe(1);
  });

  it("handles edge cases", () => {
    expect(parsePositiveInt("0", 100)).toBe(100);          // zero -> fallback
    expect(parsePositiveInt("-1", 100)).toBe(100);        // negative -> fallback
    expect(parsePositiveInt("abc", 100)).toBe(100);       // non-numeric -> fallback
    expect(parsePositiveInt("12.5", 100)).toBe(12);       // parseInt truncates, 12 is valid positive
    expect(parsePositiveInt("   42   ", 0)).toBe(42);     // whitespace trimmed by parseInt
    expect(parsePositiveInt("99999999999999999", 0)).toBe(99999999999999999); // large number OK
  });
});
