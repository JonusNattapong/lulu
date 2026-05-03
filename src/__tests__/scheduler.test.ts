import { describe, expect, it } from "bun:test";
import { getNextCronRun, getNextRun } from "../core/scheduler.js";

describe("Scheduler cron expressions", () => {
  it("computes the next run for a 5-field cron expression", () => {
    const next = getNextCronRun("*/15 9-10 * * 1-5", new Date(2026, 4, 4, 9, 7, 0));
    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(4);
    expect(next.getDate()).toBe(4);
    expect(next.getHours()).toBe(9);
    expect(next.getMinutes()).toBe(15);
  });

  it("keeps HH:MM custom schedules backwards compatible", () => {
    const next = getNextRun("custom", "7:00");
    expect(Number.isNaN(new Date(next).getTime())).toBe(false);
  });

  it("rejects invalid cron expressions", () => {
    expect(() => getNextCronRun("70 * * * *", new Date(2026, 4, 4, 9, 0, 0))).toThrow();
  });
});
