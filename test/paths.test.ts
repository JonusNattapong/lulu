import { expect, test, describe } from "bun:test";
import { LULU_DIR, CONFIG_FILE, getProjectDir } from "../src/core/paths.js";
import path from "node:path";
import { homedir } from "node:os";

describe("Paths", () => {
  test("LULU_DIR should be in home directory", () => {
    expect(LULU_DIR).toBe(path.join(homedir(), ".lulu"));
  });

  test("CONFIG_FILE should be in LULU_DIR", () => {
    expect(CONFIG_FILE).toBe(path.join(LULU_DIR, "config.json"));
  });

  test("getProjectDir should return project path", () => {
    const projectName = "test-project";
    const projectDir = getProjectDir(projectName);
    expect(projectDir).toBe(path.join(LULU_DIR, "projects", projectName));
  });
});
