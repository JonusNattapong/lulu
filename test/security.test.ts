import { expect, test, describe } from "bun:test";
import { SecurityManager } from "../src/core/security.js";
import path from "node:path";
import { homedir } from "node:os";

describe("SecurityManager", () => {
  test("should redact sensitive keys", () => {
    process.env.LULU_API_TOKEN = "my-secret-token-12345";
    const input = "Connecting with token my-secret-token-12345 to the server";
    const redacted = SecurityManager.redact(input);
    expect(redacted).toContain("[REDACTED_LULU_API_TOKEN]");
    expect(redacted).not.toContain("my-secret-token-12345");
  });

  test("should detect dangerous commands", () => {
    const dangerous = "rm -rf /";
    expect(() => SecurityManager.validateCommand(dangerous)).toThrow();
    
    const obfuscated = "python -c 'import os; os.system(\"rm -rf /\")'";
    expect(() => SecurityManager.validateCommand(obfuscated)).toThrow();
    
    const safe = "ls -la";
    expect(() => SecurityManager.validateCommand(safe)).not.toThrow();
  });

  test("should prevent path traversal", () => {
    const projectRoot = process.cwd();
    const outsidePath = path.join(projectRoot, "../../etc/passwd");
    
    expect(() => {
      SecurityManager.sanitizePath(outsidePath, [projectRoot]);
    }).toThrow(/Security Violation/);
  });

  test("should allow paths within project root", () => {
    const projectRoot = process.cwd();
    const insidePath = path.join(projectRoot, "src/index.ts");
    
    const sanitized = SecurityManager.sanitizePath(insidePath, [projectRoot]);
    expect(sanitized).toBe(path.resolve(insidePath));
  });

  test("should allow paths within ~/.lulu", () => {
    const projectRoot = process.cwd();
    const luluPath = path.join(homedir(), ".lulu", "config.json");
    
    const sanitized = SecurityManager.sanitizePath(luluPath, [projectRoot]);
    expect(sanitized).toBe(path.resolve(luluPath));
  });
});
