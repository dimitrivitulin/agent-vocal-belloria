import { readFileSync } from "node:fs";

function readDevVars(path = ".dev.vars") {
  const values = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[key] = value;
  }
  return values;
}

async function telegram(token, method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, body ? {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  } : undefined);
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(`Telegram ${method} failed with code ${result.error_code || response.status}`);
  return result.result;
}

const command = process.argv[2];
const vars = readDevVars();
const token = vars.TELEGRAM_BOT_TOKEN;
if (!token || token.startsWith("change-me")) throw new Error("Set TELEGRAM_BOT_TOKEN in .dev.vars first");

if (command === "chats") {
  const updates = await telegram(token, "getUpdates");
  const chats = new Map();
  for (const update of updates) {
    const chat = update.message?.chat;
    if (chat?.id !== undefined) chats.set(String(chat.id), chat.type || "unknown");
  }
  if (!chats.size) throw new Error("No chat found. Send /start to the bot, then retry.");
  for (const [id, type] of chats) console.log(`${id}\t${type}`);
} else if (command === "webhook") {
  const url = process.argv[3];
  const secret = vars.TELEGRAM_WEBHOOK_SECRET;
  if (!url?.startsWith("https://")) throw new Error("Usage: node tools/telegram_setup.mjs webhook https://<worker>/webhooks/telegram");
  if (!secret || secret.startsWith("change-me")) throw new Error("Set TELEGRAM_WEBHOOK_SECRET in .dev.vars first");
  await telegram(token, "setWebhook", { url, secret_token: secret, allowed_updates: ["message"], drop_pending_updates: false });
  console.log("Telegram webhook registered.");
} else if (command === "remove-webhook") {
  await telegram(token, "deleteWebhook", { drop_pending_updates: false });
  console.log("Telegram webhook removed.");
} else {
  throw new Error("Usage: node tools/telegram_setup.mjs chats | webhook <https-url> | remove-webhook");
}
