import { describe, it, expect } from "bun:test";
import { policyEngine } from "../core/policy.js";

describe("PolicyEngine", () => {
  it("should block filesystem_delete on non-cli channels", () => {
    const res = policyEngine.checkPermission({
      toolName: "filesystem_delete",
      risk: "high",
      channel: "telegram",
      input: { path: "/important" }
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain("not allowed via telegram");
  });

  it("should require approval for high risk actions in CLI", () => {
    const res = policyEngine.checkPermission({
      toolName: "run_command",
      risk: "high",
      channel: "cli",
      input: { command: "rm -rf /" }
    });
    expect(res.allowed).toBe(true);
    expect(res.needsApproval).toBe(true);
  });

  it("should block high risk actions on API", () => {
    const res = policyEngine.checkPermission({
      toolName: "run_command",
      risk: "high",
      channel: "api",
      input: { command: "whoami" }
    });
    expect(res.allowed).toBe(false);
    expect(res.needsApproval).toBe(false);
  });

  it("should allow low risk actions everywhere", () => {
    const res = policyEngine.checkPermission({
      toolName: "read_file",
      risk: "low",
      channel: "dashboard",
      input: { file_path: "README.md" }
    });
    expect(res.allowed).toBe(true);
    expect(res.needsApproval).toBe(false);
  });
});
