#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { stdin as input, stdout as output } from "node:process";
import readline from "node:readline/promises";
import { ConfigResolver } from "../core/config_resolver.js";
import { gateway } from "../core/gateway.js";
import { identityManager, type IdentityRole } from "../core/identity.js";

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

interface TelegramBinding {
  chatId: number;
  chatType: TelegramChat["type"];
  userId?: number;
  username?: string;
  title: string;
  agentId: string;
  enabled: boolean;
  createdAt: string;
}

interface TelegramConfig {
  botToken?: string;
  defaultAgentId: string;
  bindings: TelegramBinding[];
}

const TELEGRAM_MAX_MESSAGE_LENGTH = 3900;
const TELEGRAM_CONFIG_PATH = path.join(homedir(), ".lulu", "telegram.json");

function loadTelegramConfig(): TelegramConfig {
  if (!existsSync(TELEGRAM_CONFIG_PATH)) {
    return { defaultAgentId: "main", bindings: [] };
  }
  try {
    const parsed = JSON.parse(readFileSync(TELEGRAM_CONFIG_PATH, "utf-8")) as Partial<TelegramConfig>;
    return {
      botToken: parsed.botToken,
      defaultAgentId: parsed.defaultAgentId || "main",
      bindings: Array.isArray(parsed.bindings) ? parsed.bindings : [],
    };
  } catch {
    return { defaultAgentId: "main", bindings: [] };
  }
}

function saveTelegramConfig(config: TelegramConfig): void {
  const dir = path.dirname(TELEGRAM_CONFIG_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(TELEGRAM_CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

function getTelegramToken(config = loadTelegramConfig()): string | undefined {
  return process.env.LULU_TELEGRAM_BOT_TOKEN || config.botToken;
}

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

function findBinding(config: TelegramConfig, message: TelegramMessage): TelegramBinding | undefined {
  return config.bindings.find((binding) => binding.enabled && binding.chatId === message.chat.id);
}

function hasAccess(config: TelegramConfig, allowedChatIds: Set<number> | null, message: TelegramMessage): boolean {
  if (allowedChatIds?.has(message.chat.id)) return true;
  const identityBinding = identityManager.findBinding("telegram", String(message.chat.id));
  if (identityBinding?.enabled) return true;
  const hasConfiguredAccess = !!allowedChatIds || config.bindings.some((binding) => binding.enabled);
  if (!hasConfiguredAccess) return true;
  return !!findBinding(config, message);
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
  telegramConfig: TelegramConfig,
  message: TelegramMessage,
  prompt: string,
): Promise<boolean> {
  const commandName = prompt.split(/\s+/)[0].replace(/^\/+/, "").split("@")[0].toLowerCase();
  if (commandName === "start" || commandName === "help") {
    await sendTelegramMessage(token, message.chat.id, formatTelegramHelp(), message.message_id);
    return true;
  }
  if (commandName === "whoami") {
    await sendTelegramMessage(token, message.chat.id, formatWhoAmI(message), message.message_id);
    return true;
  }
  if (commandName === "setup") {
    await sendTelegramMessage(token, message.chat.id, formatSetupStatus(telegramConfig, message), message.message_id);
    return true;
  }

  return false;
}

function formatTelegramHelp(): string {
  return [
    "Lulu Telegram",
    "",
    "Commands:",
    "/help - Show this message",
    "/whoami - Show chat and user ids for pairing",
    "/setup - Show pairing and runtime status",
    "/status - Show Lulu status",
    "/prompt - Inspect prompt layers",
    "/project - Show project profile",
    "/task list - List tasks",
    "/new or /reset - Start a fresh session",
  ].join("\n");
}

function formatWhoAmI(message: TelegramMessage): string {
  return [
    "Telegram identity",
    `Chat ID: ${message.chat.id}`,
    `Chat type: ${message.chat.type}`,
    `User ID: ${message.from?.id ?? "unknown"}`,
    `Username: ${message.from?.username ? `@${message.from.username}` : "unknown"}`,
  ].join("\n");
}

function formatSetupStatus(config: TelegramConfig, message: TelegramMessage): string {
  const binding = findBinding(config, message);
  const identityBinding = identityManager.findBinding("telegram", String(message.chat.id));
  const identityUser = identityBinding ? identityManager.getUser(identityBinding.userId) : null;
  const runtime = ConfigResolver.resolve({ env: { ...process.env, LULU_CHANNEL: "telegram" } });
  return [
    "Lulu Telegram setup",
    `Pairing: ${binding ? `paired to agent '${binding.agentId}'` : "not paired"}`,
    `Identity: ${identityUser ? `${identityUser.displayName} (${identityUser.role})` : "not bound"}`,
    `Chat ID: ${message.chat.id}`,
    `Bot token: ${getTelegramToken(config) ? "configured" : "missing"}`,
    `Provider: ${runtime.provider}`,
    `Model: ${runtime.model}`,
    `API key: ${runtime.apiKey ? "configured" : "missing"}`,
    `Project: ${runtime.projectName || "unknown"}`,
  ].join("\n");
}

async function runChatTurn(
  token: string,
  message: TelegramMessage,
  prompt: string,
): Promise<void> {
  const stopTyping = startTypingLoop(token, message.chat.id);
  try {
    const title = message.from?.username ? `@${message.from.username}` : message.from?.first_name || "Telegram chat";
    const identityBinding = identityManager.findBinding("telegram", String(message.chat.id));
    const identityUser = identityBinding ? identityManager.getUser(identityBinding.userId) : null;
    const result = await gateway.route({
      channel: "telegram",
      subjectId: String(message.chat.id),
      title,
      prompt,
      env: { ...process.env, LULU_CHANNEL: "telegram" },
      queueKey: `telegram:${message.chat.id}`,
      metadata: {
        chatId: message.chat.id,
        chatType: message.chat.type,
        fromUserId: message.from?.id,
        fromUsername: message.from?.username,
        identityUserId: identityUser?.id,
        identityRole: identityUser?.role,
        agentId: identityBinding?.agentId,
        projectId: identityBinding?.projectId,
      },
    });
    await sendTelegramMessage(token, message.chat.id, result.text, message.message_id);
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
  const telegramConfig = loadTelegramConfig();
  const token = getTelegramToken(telegramConfig);
  if (!token) {
    throw new Error("Missing Telegram bot token. Run `bun run telegram:setup` or set LULU_TELEGRAM_BOT_TOKEN.");
  }

  const allowedChatIds = getAllowedChatIds();
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

        if (!hasAccess(telegramConfig, allowedChatIds, message)) {
          await sendTelegramMessage(token, message.chat.id, "This chat is not paired with this Lulu bot. Run `bun run telegram:setup` on the host to approve it.", message.message_id);
          continue;
        }

        const prompt = normalizePrompt(message, bot);
        if (!prompt) continue;
        if (prompt.startsWith("/")) {
          const handled = await handleCommand(token, telegramConfig, message, prompt);
          if (handled) continue;
        }
        void runChatTurn(token, message, prompt);
      }
    } catch (err) {
      console.error("[Telegram]", err instanceof Error ? err.message : err);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

export async function setupTelegramBot(): Promise<void> {
  const rl = readline.createInterface({ input, output });
  const config = loadTelegramConfig();

  console.log("Lulu Telegram setup");
  console.log(`Config: ${TELEGRAM_CONFIG_PATH}`);
  console.log("");

  const existingToken = getTelegramToken(config);
  const tokenInput = await rl.question(`Bot token${existingToken ? " [configured]" : ""}: `);
  const token = tokenInput.trim() || existingToken;
  if (!token) {
    rl.close();
    throw new Error("Telegram bot token is required. Create one with @BotFather.");
  }

  const bot = await getBotIdentity(token);
  config.botToken = token;
  config.defaultAgentId ||= "main";
  saveTelegramConfig(config);

  console.log(`Connected to bot: @${bot.username || bot.first_name || bot.id}`);
  console.log("Open Telegram and send any message to this bot. Waiting for pairing request...");

  let offset = 0;
  while (true) {
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

      console.log("");
      console.log("Pairing request");
      console.log(`Chat ID: ${message.chat.id}`);
      console.log(`Chat type: ${message.chat.type}`);
      console.log(`User ID: ${message.from?.id ?? "unknown"}`);
      console.log(`Username: ${message.from?.username ? `@${message.from.username}` : "unknown"}`);
      console.log(`Message: ${getMessageText(message)}`);

      const answer = (await rl.question("Approve this Telegram chat? [y/N]: ")).trim().toLowerCase();
      if (answer !== "y" && answer !== "yes") {
        await sendTelegramMessage(token, message.chat.id, "Pairing was not approved on the Lulu host.", message.message_id);
        continue;
      }

      const agentInput = await rl.question(`Agent id [${config.defaultAgentId || "main"}]: `);
      const agentId = agentInput.trim() || config.defaultAgentId || "main";
      const runtime = ConfigResolver.resolve({ env: { ...process.env, LULU_CHANNEL: "telegram" } });
      const roleInput = (await rl.question("Role [admin/operator/viewer, default: admin]: ")).trim().toLowerCase();
      const role = parseIdentityRole(roleInput) || "admin";
      const title = message.from?.username ? `@${message.from.username}` : message.from?.first_name || `Telegram ${message.chat.id}`;
      const binding: TelegramBinding = {
        chatId: message.chat.id,
        chatType: message.chat.type,
        userId: message.from?.id,
        username: message.from?.username,
        title,
        agentId,
        enabled: true,
        createdAt: new Date().toISOString(),
      };

      const existingIndex = config.bindings.findIndex((item) => item.chatId === binding.chatId);
      if (existingIndex >= 0) config.bindings[existingIndex] = binding;
      else config.bindings.push(binding);
      config.defaultAgentId = agentId;
      saveTelegramConfig(config);
      const identity = identityManager.bind({
        type: "telegram",
        externalId: String(message.chat.id),
        displayName: title,
        role,
        projectId: runtime.projectName,
        agentId,
        label: title,
        metadata: {
          chatId: message.chat.id,
          chatType: message.chat.type,
          telegramUserId: message.from?.id,
          telegramUsername: message.from?.username,
        },
      });

      await sendTelegramMessage(token, message.chat.id, `Lulu pairing approved. Bound to agent '${agentId}' as ${identity.user.role}. Send /help to get started.`, message.message_id);
      console.log(`Saved binding to ${TELEGRAM_CONFIG_PATH}`);
      console.log(`Identity binding: ${identity.binding.id} -> ${identity.user.id}`);
      rl.close();
      return;
    }
  }
}

function parseIdentityRole(value: string): IdentityRole | null {
  if (value === "admin" || value === "operator" || value === "viewer") return value;
  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2];
  const action = mode === "setup" ? setupTelegramBot : startTelegramBot;
  action().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
