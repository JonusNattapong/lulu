/**
 * Daily Summary Job
 * Generates a summary of yesterday's activity: conversations, tools used, decisions made.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface DailySummaryInput {
  date: string; // YYYY-MM-DD
  sessions: { id: string; turnCount: number; toolCount: number }[];
  projectRoot: string;
}

export async function runDailySummary(_input: DailySummaryInput): Promise<string> {
  const storePath = join(homedir(), ".lulu", "sessions.json");
  if (!existsSync(storePath)) return "No session history found.";

  const sessions = JSON.parse(readFileSync(storePath, "utf-8"));
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toISOString().split("T")[0];

  const yesterdaySessions = Object.values(sessions).filter((s: any) =>
    s.updatedAt?.startsWith(yStr)
  );

  if (yesterdaySessions.length === 0) return `No sessions yesterday (${yStr}).`;

  const totalTurns = yesterdaySessions.reduce((a: number, s: any) => a + (s.turnCount || 0), 0);

  return [
    `📊 Daily Summary — ${yStr}`,
    `Sessions: ${yesterdaySessions.length} | Turns: ${totalTurns}`,
    "",
    ...yesterdaySessions.slice(0, 5).map((s: any) => `- ${s.title || s.id}: ${s.turnCount || 0} turns`),
    "",
    `Full report at ~/.lulu/sessions.json`,
  ].join("\n");
}