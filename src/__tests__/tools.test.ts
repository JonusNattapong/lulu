import { describe, it, expect, beforeEach } from "bun:test";
import { wildcardMatch, searchFiles } from "../agent/tools.js";
import { mkdtemp, mkdir, writeFile } from "fs/promises";
import { join } from "path";

describe("wildcardMatch", () => {
  it("matches exact strings", () => {
    expect(wildcardMatch("hello.ts", "hello.ts")).toBe(true);
  });

  it("matches with * wildcard", () => {
    expect(wildcardMatch("hello.world.ts", "hello.*.ts")).toBe(true);
    expect(wildcardMatch("test.js", "*.js")).toBe(true);
    expect(wildcardMatch("src/index.ts", "src/*.ts")).toBe(true);
    expect(wildcardMatch("src/main.js", "src/*.ts")).toBe(false);
  });

  it("escapes regex special chars in pattern", () => {
    expect(wildcardMatch("file[1].txt", "file[1].txt")).toBe(true);
    expect(wildcardMatch("file(1).txt", "file(1).txt")).toBe(true);
  });

  it("does not match when pattern has no wildcard and text differs", () => {
    expect(wildcardMatch("hello.ts", "goodbye.ts")).toBe(false);
  });
});

describe("searchFiles", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join("/tmp", "lulu-test-"));
    await mkdir(join(tempDir, "subdir"));
    await writeFile(join(tempDir, "file1.txt"), "Hello world\nTest line 2\nThird line");
    await writeFile(join(tempDir, "file2.js"), "const x = 1;\nconsole.log('test');");
    await writeFile(join(tempDir, "subdir", "nested.ts"), "export const foo = 'bar';");
  });

  it("finds matches across directory tree", async () => {
    const results: string[] = [];
    searchFiles(tempDir, /Hello/, undefined, results);
    expect(results.some(r => r.includes("file1.txt"))).toBe(true);
  });

  it("respects glob filter", async () => {
    const results: string[] = [];
    searchFiles(tempDir, /console/, "*.js", results);
    expect(results.length).toBeGreaterThan(0);
    // Result format: "fullPath:lineno: content"
    expect(results.every(r => r.split(":")[0].endsWith(".js"))).toBe(true);
  });

  // Note: searchFiles has built-in result limit of 500, tested manually

  it("skips dotfiles and node_modules", async () => {
    await mkdir(join(tempDir, "node_modules"));
    await writeFile(join(tempDir, "node_modules", "pkg.js"), "should skip");
    await writeFile(join(tempDir, ".hidden"), "also skip");
    const results: string[] = [];
    searchFiles(tempDir, /skip|hidden/, undefined, results);
    expect(results.length).toBe(0);
  });
});
