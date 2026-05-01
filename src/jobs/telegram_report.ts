/**
 * Telegram Report Job
 * Sends a daily summary to the configured Telegram chat.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { runDailySummary } from "./daily_summary.js";

export async function runTelegramReport(projectRoot: string): Promise<string> {
  const credPath = join(homedir(), ".lulu", "telegram.json");
  if (!existsSync(credPath)) return "Telegram not configured. Run /telegram:setup first.";

  const cred = JSON.parse(readFileSync(credPath, "utf-8"));
  const botToken = cred.botToken;
  const chatId = cred.approvedChats?.[0] || cred.bindings?.find((binding: any) => binding.enabled)?.chatId;

  if (!botToken || !chatId) return "Telegram: missing bot token or approved chat.";

  // Generate summary
  const summary = await runDailySummary({ date: new Date().toISOString().split("T")[0], sessions: [], projectRoot });

  // Send via Telegram API
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body = JSON.stringify({ chat_id: chatId, text: summary, parse_mode: "Markdown" });

  try {
    const { execSync } = require("node:child_process");
    execSync(
      `curl -s -X POST ${url} -H "Content-Type: application/json" -d '${body}'`,
      { encoding: "utf-8", stdio: "pipe" }
    );
    return `📱 Telegram report sent to chat ${chatId}`;
  } catch (e: any) {
    return `❌ Telegram send failed: ${(e.stderr || e.message || "").slice(-200)}`;
  }
}
