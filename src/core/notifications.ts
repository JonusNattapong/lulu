import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { eventBus } from "./events.js";
import type { NotificationPayload } from "../types/types.js";

function loadTelegramCreds(): { botToken?: string; chatId?: string } | null {
  const credPath = path.join(homedir(), ".lulu", "telegram.json");
  if (!existsSync(credPath)) return null;
  try {
    const cred = JSON.parse(readFileSync(credPath, "utf-8"));
    return {
      botToken: cred.botToken,
      chatId: cred.approvedChats?.[0] || cred.bindings?.find((b: any) => b.enabled)?.chatId,
    };
  } catch {
    return null;
  }
}

function loadWebhookUrl(): string | null {
  const cfgPath = path.join(homedir(), ".lulu", "config.json");
  if (!existsSync(cfgPath)) return null;
  try {
    const cfg = JSON.parse(readFileSync(cfgPath, "utf-8"));
    return cfg.webhookUrl || null;
  } catch {
    return null;
  }
}

class NotificationManager {
  private log: NotificationPayload[] = [];
  private maxLog = 100;

  async send(payload: NotificationPayload): Promise<void> {
    eventBus.emit("notification:send", payload);

    const lines: string[] = [`**${payload.title}**`, payload.body];
    const message = lines.join("\n");

    // Telegram
    await this.sendTelegram(message, payload.priority);

    // Webhook
    await this.sendWebhook(payload);

    this.log.unshift(payload);
    if (this.log.length > this.maxLog) this.log = this.log.slice(0, this.maxLog);

    eventBus.emit("notification:sent", payload);
  }

  private async sendTelegram(message: string, priority: string): Promise<void> {
    const cred = loadTelegramCreds();
    if (!cred?.botToken || !cred?.chatId) return;

    const emoji = priority === "high" ? "🚨" : priority === "medium" ? "⚠️" : "🔔";
    const url = `https://api.telegram.org/bot${cred.botToken}/sendMessage`;
    const body = JSON.stringify({
      chat_id: cred.chatId,
      text: `${emoji} ${message}`,
      parse_mode: "Markdown",
    });

    try {
      execSync(
        `curl -s -X POST ${url} -H "Content-Type: application/json" -d '${body.replace(/'/g, "'\"'\"'")}'`,
        { encoding: "utf-8", stdio: "pipe", timeout: 10_000 }
      );
    } catch {
      // Silently fail if Telegram not configured
    }
  }

  private async sendWebhook(payload: NotificationPayload): Promise<void> {
    const webhookUrl = loadWebhookUrl();
    if (!webhookUrl) return;

    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      // Silently fail if webhook unreachable
    }
  }

  history(limit = 20): NotificationPayload[] {
    return this.log.slice(0, limit);
  }

  clear(): void {
    this.log = [];
  }
}

export const notificationManager = new NotificationManager();
