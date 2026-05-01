#!/usr/bin/env node
import { SessionManager, type SessionRecord } from "../core/session.js";
import { ConfigResolver } from "../core/config_resolver.js";
import { commandRegistry } from "../core/commands.js";
import { runAgent } from "../core/agent.js";

interface TelegramUser {
  id: number;
  is_bot?: boolean;
  username?: string;
  first_name?: string;
}

interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
}

interface TelegramMessage {
  message_id: number;
  text?: string;
  caption?: string;
  from?: TelegramUser;
  chat: TelegramChat;
  reply_to_message?: TelegramMessage;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

const TELEGRAM_MAX_MESSAGE_LENGTH = 3900;

function getAllowedChatIds(): Set<number> | null {
  const raw = process.env.LULU_TELEGRAM_ALLOWED_CHAT_IDS?.trim();
  if (!raw) return null;
  return new Set(
    raw
      .split(",")
      .map((part) => Number(part.trim()))
      .filter((id) => Number.isFinite(id)),
  );
}

function getSession(manager: SessionManager, message: TelegramMessage): SessionRecord {
  const config = ConfigResolver.resolve({ env: { ...process.env, LULU_CHANNEL: "telegram" } });
  const userName = message.from?.username ? `@${message.from.username}` : message.from?.first_name || "Telegram chat";
  return manager.getOrCreate({
    channel: "telegram",
    subjectId: String(message.chat.id),
    title: userName,
    config,
    metadata: {
      chatId: message.chat.id,
      chatType: message.chat.type,
      fromUserId: message.from?.id,
      fromUsername: message.from?.username,
    },
  });
}

async function telegramRequest<T>(token: string, method: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json() as { ok: boolean; result?: T; description?: string };
  if (!response.ok || !data.ok) {
    throw new Error(data.description || `Telegram API request failed: ${response.status}`);
  }
  return data.result as T;
}

async function getBotIdentity(token: string): Promise<TelegramUser> {
  return telegramRequest<TelegramUser>(token, "getMe", {});
}

async function sendTelegramMessage(token: string, chatId: number, text: string, replyTo?: number): Promise<void> {
  const chunks = chunkTelegramText(text);
  for (const chunk of chunks) {
    await telegramRequest(token, "sendMessage", {
      chat_id: chatId,
      text: chunk,
      disable_web_page_preview: true,
      reply_parameters: replyTo ? { message_id: replyTo } : undefined,
    });
  }
}

async function sendChatAction(token: string, chatId: number, action = "typing"): Promise<void> {
  await telegramRequest(token, "sendChatAction", { chat_id: chatId, action });
}

function startTypingLoop(token: string, chatId: number): () => void {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      await sendChatAction(token, chatId);
    } catch {
      // Typing indicators are best-effort.
    }
  };
  void tick();
  const timer = setInterval(tick, 4000);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

function chunkTelegramText(text: string): string[] {
  const normalized = text.trim() || "(empty response)";
  const chunks: string[] = [];
  let remaining = normalized;
  while (remaining.length > TELEGRAM_MAX_MESSAGE_LENGTH) {
    const splitAt = Math.max(
      remaining.lastIndexOf("\n", TELEGRAM_MAX_MESSAGE_LENGTH),
      remaining.lastIndexOf(" ", TELEGRAM_MAX_MESSAGE_LENGTH),
    );
    const index = splitAt > 1000 ? splitAt : TELEGRAM_MAX_MESSAGE_LENGTH;
    chunks.push(remaining.slice(0, index).trimEnd());
    remaining = remaining.slice(index).trimStart();
  }
  chunks.push(remaining);
  return chunks;
}

function shouldHandleMessage(message: TelegramMessage, bot: TelegramUser): boolean {
  if (message.chat.type === "private") return true;
  const text = getMessageText(message);
  const mention = bot.username ? `@${bot.username}` : "";
  const repliedToBot = message.reply_to_message?.from?.id === bot.id;
  return repliedToBot || (!!mention && text.includes(mention));
}

function getMessageText(message: TelegramMessage): string {
  return (message.text || message.caption || "").trim();
}

function normalizePrompt(message: TelegramMessage, bot: TelegramUser): string {
  const text = getMessageText(message);
  if (!bot.username) return text;
  return text.replace(new RegExp(`@${escapeRegex(bot.username)}`, "gi"), "").trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function handleCommand(
  token: string,
  manager: SessionManager,
  session: SessionRecord,
  message: TelegramMessage,
  prompt: string,
): Promise<boolean> {
  const config = ConfigResolver.resolve({ env: { ...process.env, LULU_CHANNEL: "telegram" } });
  const cmdResult = await commandRegistry.handle(prompt, { 
    sessionId: session.id, 
    channel: "telegram", 
    config, 
    sessionManager: manager 
  });

  if (cmdResult) {
    await sendTelegramMessage(token, message.chat.id, cmdResult.text, message.message_id);
    return true;
  }
  return false;
}

async function runChatTurn(
  token: string,
  manager: SessionManager,
  session: SessionRecord,
  message: TelegramMessage,
  prompt: string,
): Promise<void> {
  const config = ConfigResolver.resolve({ env: { ...process.env, LULU_CHANNEL: "telegram" } });
  if (!config.apiKey) {
    await sendTelegramMessage(token, message.chat.id, "Lulu API key is missing.", message.message_id);
    return;
  }

  const stopTyping = startTypingLoop(token, message.chat.id);
  try {
    const result = await runAgent(config, prompt, session.messages);
    manager.saveMessages(session.id, result.messages, config);
    await sendTelegramMessage(token, message.chat.id, result.finalText || "Done.", message.message_id);
  } catch (err) {
    await sendTelegramMessage(
      token,
      message.chat.id,
      `Error: ${err instanceof Error ? err.message : String(err)}`,
      message.message_id,
    );
  } finally {
    stopTyping();
  }
}

export async function startTelegramBot(): Promise<void> {
  const token = process.env.LULU_TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("Missing LULU_TELEGRAM_BOT_TOKEN. Create a bot with @BotFather and set the token.");
  }

  const allowedChatIds = getAllowedChatIds();
  const manager = new SessionManager();
  const queues = new Map<number, Promise<void>>();
  const bot = await getBotIdentity(token);
  let offset = 0;

  console.log(`Telegram chat bridge started as @${bot.username || bot.first_name || bot.id}.`);

  while (true) {
    try {
      const updates = await telegramRequest<TelegramUpdate[]>(token, "getUpdates", {
        offset,
        timeout: 30,
        allowed_updates: ["message"],
      });

      for (const update of updates) {
        offset = update.update_id + 1;
        const message = update.message;
        if (!message || !getMessageText(message)) continue;
        if (!shouldHandleMessage(message, bot)) continue;

        if (allowedChatIds && !allowedChatIds.has(message.chat.id)) {
          await sendTelegramMessage(token, message.chat.id, "This chat is not allowed to use this Lulu bot.", message.message_id);
          continue;
        }

        const previous = queues.get(message.chat.id) || Promise.resolve();
        const next = previous
          .catch(() => undefined)
          .then(async () => {
            const session = getSession(manager, message);
            const prompt = normalizePrompt(message, bot);
            if (!prompt) return;
            if (prompt.startsWith("/")) {
              const handled = await handleCommand(token, manager, session, message, prompt);
              if (handled) return;
            }
            await runChatTurn(token, manager, session, message, prompt);
          });
        queues.set(message.chat.id, next);
      }
    } catch (err) {
      console.error("[Telegram]", err instanceof Error ? err.message : err);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startTelegramBot().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
