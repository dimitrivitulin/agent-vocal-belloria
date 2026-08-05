const TELEGRAM_VOICE_MAX_BYTES = 5 * 1024 * 1024;
const TELEGRAM_TEXT_MAX_CHARS = 4096;
const WHISPER_MODEL = "@cf/openai/whisper-large-v3-turbo";

const TOOLS = [
  {
    name: "belloria_channel_status",
    description: "Read whether the private Belloria Telegram channel is configured.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "belloria_list_commands",
    description: "List pending commands, voice transcripts and quarantined voice errors from the private Belloria Telegram chat.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 20, default: 10 } },
      additionalProperties: false
    }
  },
  {
    name: "belloria_complete_command",
    description: "Mark one command as completed and erase its retained text after explicit approval.",
    inputSchema: {
      type: "object",
      properties: {
        command_id: { type: "string", pattern: "^[0-9]{1,20}$" },
        confirmed: { type: "boolean", const: true }
      },
      required: ["command_id", "confirmed"],
      additionalProperties: false
    }
  },
  {
    name: "belloria_propose_action",
    description: "Persist the exact action proposed to Belloria until a matching Telegram confirmation is received.",
    inputSchema: {
      type: "object",
      properties: {
        command_id: { type: "string", pattern: "^[0-9]{1,20}$" },
        token: { type: "string", pattern: "^[A-Z0-9_-]{6,64}$" },
        prospect: { type: "string", minLength: 1, maxLength: 300 },
        sources: { type: "array", items: { type: "string", minLength: 1, maxLength: 300 }, maxItems: 20 },
        content: { type: "string", minLength: 1, maxLength: TELEGRAM_TEXT_MAX_CHARS },
        consequence: { type: "string", minLength: 1, maxLength: 1000 },
        expires_in_minutes: { type: "integer", minimum: 1, maximum: 15, default: 10 }
      },
      required: ["command_id", "token", "prospect", "sources", "content", "consequence"],
      additionalProperties: false
    }
  },
  {
    name: "belloria_consume_approved_action",
    description: "Atomically consume an action only when a pending Telegram command contains its exact confirmation token.",
    inputSchema: {
      type: "object",
      properties: {
        confirmation_command_id: { type: "string", pattern: "^[0-9]{1,20}$" },
        confirmed: { type: "boolean", const: true }
      },
      required: ["confirmation_command_id", "confirmed"],
      additionalProperties: false
    }
  },
  {
    name: "belloria_send_text",
    description: "Send one text to the fixed private Belloria Telegram chat after explicit approval.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", minLength: 1, maxLength: TELEGRAM_TEXT_MAX_CHARS },
        confirmed: { type: "boolean", const: true }
      },
      required: ["text", "confirmed"],
      additionalProperties: false
    }
  }
];

const encoder = new TextEncoder();

function html(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://chatgpt.com; base-uri 'none'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
      ...headers
    }
  });
}

function json(payload, status = 200) {
  return Response.json(payload, { status, headers: { "cache-control": "no-store" } });
}

function timingSafeEqual(left, right) {
  const a = encoder.encode(left || "");
  const b = encoder.encode(right || "");
  let different = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) different |= (a[index] || 0) ^ (b[index] || 0);
  return different === 0;
}

function cleanErrorCode(error, fallback = "operation_failed") {
  return String(error?.code || fallback).replace(/[^a-z0-9_-]/gi, "_").slice(0, 64);
}

export function extractTelegramCommand(document) {
  if (!Number.isSafeInteger(document?.update_id)) return null;
  const message = document.message;
  if (!message || message.chat?.id === undefined || !Number.isSafeInteger(message.message_id)) return null;

  const base = {
    id: String(document.update_id),
    messageId: String(message.message_id),
    chatId: String(message.chat.id)
  };

  if (typeof message.text === "string" && message.text.trim()) {
    return { ...base, kind: "text", content: message.text.slice(0, TELEGRAM_TEXT_MAX_CHARS), voiceFileId: null, voiceBytes: null };
  }
  if (typeof message.voice?.file_id === "string" && message.voice.file_id) {
    const voiceBytes = Number.isSafeInteger(message.voice.file_size) ? message.voice.file_size : null;
    return { ...base, kind: "voice", content: null, voiceFileId: message.voice.file_id, voiceBytes };
  }
  return null;
}

async function storeTelegramCommand(db, command) {
  const state = command.kind === "voice" ? "transcribing" : "pending";
  const result = await db.prepare(
    "INSERT INTO telegram_commands (command_id, message_id, command_kind, content, voice_file_id, state) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(command_id) DO NOTHING"
  ).bind(command.id, command.messageId, command.kind, command.content, command.voiceFileId, state).run();
  return Number(result.meta?.changes || 0) === 1;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function telegramApi(env, method, payload) {
  if (!env.TELEGRAM_BOT_TOKEN) throw Object.assign(new Error("Telegram is not configured"), { code: "telegram_not_configured" });
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw Object.assign(new Error("Telegram request failed"), { code: `telegram_http_${response.status}` });
  const result = await response.json();
  if (!result.ok) throw Object.assign(new Error("Telegram rejected request"), { code: `telegram_${result.error_code || "rejected"}` });
  return result.result;
}

async function transcribeVoice(env, command) {
  try {
    if (!env.AI) throw Object.assign(new Error("Workers AI is not configured"), { code: "workers_ai_not_configured" });
    if (command.voiceBytes !== null && command.voiceBytes > TELEGRAM_VOICE_MAX_BYTES) {
      throw Object.assign(new Error("Voice message is too large"), { code: "voice_too_large" });
    }

    const file = await telegramApi(env, "getFile", { file_id: command.voiceFileId });
    if (!file?.file_path) throw Object.assign(new Error("Telegram file path is missing"), { code: "telegram_file_missing" });
    const response = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`);
    if (!response.ok) throw Object.assign(new Error("Voice download failed"), { code: `telegram_file_http_${response.status}` });
    const declaredBytes = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredBytes) && declaredBytes > TELEGRAM_VOICE_MAX_BYTES) {
      throw Object.assign(new Error("Voice message is too large"), { code: "voice_too_large" });
    }
    const audio = await response.arrayBuffer();
    if (audio.byteLength > TELEGRAM_VOICE_MAX_BYTES) throw Object.assign(new Error("Voice message is too large"), { code: "voice_too_large" });

    const transcript = await env.AI.run(WHISPER_MODEL, {
      audio: arrayBufferToBase64(audio),
      task: "transcribe",
      language: "fr",
      vad_filter: true
    });
    const text = String(transcript?.text || "").trim().slice(0, 8000);
    if (!text) throw Object.assign(new Error("Voice transcript is empty"), { code: "empty_transcript" });

    await env.DB.prepare(
      "UPDATE telegram_commands SET content = ?, voice_file_id = NULL, state = 'pending', updated_at = CURRENT_TIMESTAMP, last_error_code = NULL WHERE command_id = ? AND state = 'transcribing'"
    ).bind(text, command.id).run();
  } catch (error) {
    const code = cleanErrorCode(error, "voice_transcription_failed");
    await env.DB.prepare(
      "UPDATE telegram_commands SET voice_file_id = NULL, state = 'quarantined', updated_at = CURRENT_TIMESTAMP, last_error_code = ? WHERE command_id = ? AND state = 'transcribing'"
    ).bind(code, command.id).run();
    console.log(JSON.stringify({ event: "telegram_voice_quarantined", code }));
  }
}

async function telegramWebhook(request, env, context) {
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
  const suppliedSecret = request.headers.get("x-telegram-bot-api-secret-token") || "";
  if (!env.TELEGRAM_WEBHOOK_SECRET || !timingSafeEqual(suppliedSecret, env.TELEGRAM_WEBHOOK_SECRET)) return json({ error: "unauthorized" }, 401);

  let document;
  try { document = await request.json(); } catch { return json({ error: "invalid json" }, 400); }
  const command = extractTelegramCommand(document);
  if (!command) return json({ accepted: 0 });
  if (!env.TELEGRAM_ALLOWED_CHAT_ID || !timingSafeEqual(command.chatId, env.TELEGRAM_ALLOWED_CHAT_ID)) {
    console.log(JSON.stringify({ event: "telegram_chat_rejected" }));
    return json({ accepted: 0 });
  }

  const inserted = await storeTelegramCommand(env.DB, command);
  if (inserted && command.kind === "voice") {
    const work = transcribeVoice(env, command);
    if (context?.waitUntil) context.waitUntil(work);
    else await work;
  }
  console.log(JSON.stringify({ event: "telegram_webhook_ingested", accepted: inserted ? 1 : 0, kind: command.kind }));
  return json({ accepted: inserted ? 1 : 0 });
}

function rpcResult(id, result) { return json({ jsonrpc: "2.0", id, result }); }
function rpcError(id, code, message, status = 200) { return json({ jsonrpc: "2.0", id, error: { code, message } }, status); }

async function listCommands(env, limit) {
  const result = await env.DB.prepare(
    "SELECT command_id, command_kind, content, state, created_at, last_error_code FROM telegram_commands WHERE state IN ('pending', 'quarantined') ORDER BY created_at LIMIT ?"
  ).bind(limit).all();
  return (result.results || []).map((row) => ({
    command_id: String(row.command_id),
    type: row.command_kind,
    text: row.content,
    status: row.state,
    received_at: row.created_at,
    error_code: row.last_error_code || undefined
  }));
}

async function completeCommand(env, commandId) {
  if (!/^[0-9]{1,20}$/.test(commandId)) throw new Error("command_id must contain 1 to 20 digits");
  const result = await env.DB.prepare(
    "UPDATE telegram_commands SET state = 'completed', content = NULL, updated_at = CURRENT_TIMESTAMP WHERE command_id = ? AND state IN ('pending', 'quarantined')"
  ).bind(commandId).run();
  return { completed: Number(result.meta?.changes || 0) === 1 };
}

function requiredText(value, name, maximum) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    throw new Error(`${name} must contain 1 to ${maximum} characters`);
  }
  return value.trim();
}

async function proposeAction(env, args) {
  const commandId = String(args.command_id || "");
  const token = String(args.token || "").toUpperCase();
  const minutes = args.expires_in_minutes === undefined ? 10 : args.expires_in_minutes;
  if (!/^[0-9]{1,20}$/.test(commandId)) throw new Error("command_id must contain 1 to 20 digits");
  if (!/^[A-Z0-9_-]{6,64}$/.test(token)) throw new Error("token must contain 6 to 64 safe characters");
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 15) throw new Error("expires_in_minutes must be an integer from 1 to 15");
  if (!Array.isArray(args.sources) || args.sources.length > 20 || args.sources.some((item) => typeof item !== "string" || !item.trim() || item.length > 300)) {
    throw new Error("sources must contain at most 20 non-empty strings");
  }
  const prospect = requiredText(args.prospect, "prospect", 300);
  const content = requiredText(args.content, "content", TELEGRAM_TEXT_MAX_CHARS);
  const consequence = requiredText(args.consequence, "consequence", 1000);
  const result = await env.DB.prepare(
    "INSERT INTO telegram_action_approvals (token, source_command_id, prospect, sources_json, content, consequence, expires_at) SELECT ?, command_id, ?, ?, ?, ?, datetime('now', ?) FROM telegram_commands WHERE command_id = ? AND state = 'pending' ON CONFLICT(token) DO NOTHING"
  ).bind(token, prospect, JSON.stringify(args.sources), content, consequence, `+${minutes} minutes`, commandId).run();
  return { proposed: Number(result.meta?.changes || 0) === 1, token, expires_in_minutes: minutes };
}

async function consumeApprovedAction(env, confirmationCommandId) {
  if (!/^[0-9]{1,20}$/.test(confirmationCommandId)) throw new Error("confirmation_command_id must contain 1 to 20 digits");
  const result = await env.DB.prepare(
    "UPDATE telegram_action_approvals SET state = 'consumed', consumed_at = CURRENT_TIMESTAMP, confirmation_command_id = ? WHERE token = (SELECT upper(trim(substr(content, 10))) FROM telegram_commands WHERE command_id = ? AND state = 'pending' AND upper(content) LIKE 'CONFIRMER %') AND state = 'pending' AND expires_at > CURRENT_TIMESTAMP RETURNING token, source_command_id, prospect, sources_json, content, consequence"
  ).bind(confirmationCommandId, confirmationCommandId).all();
  const row = result.results?.[0];
  if (!row) return { approved: false };
  await env.DB.prepare(
    "UPDATE telegram_commands SET state = 'completed', content = NULL, updated_at = CURRENT_TIMESTAMP WHERE command_id = ? AND state = 'pending'"
  ).bind(confirmationCommandId).run();
  return {
    approved: true,
    action: {
      token: row.token,
      source_command_id: row.source_command_id,
      prospect: row.prospect,
      sources: JSON.parse(row.sources_json),
      content: row.content,
      consequence: row.consequence
    }
  };
}

async function sendText(env, text) {
  if (!env.TELEGRAM_ALLOWED_CHAT_ID) throw new Error("Telegram chat is not configured");
  if (!text || text.length > TELEGRAM_TEXT_MAX_CHARS) throw new Error(`text must contain 1 to ${TELEGRAM_TEXT_MAX_CHARS} characters`);
  const result = await telegramApi(env, "sendMessage", { chat_id: env.TELEGRAM_ALLOWED_CHAT_ID, text });
  return { sent: true, message_id: result?.message_id };
}

async function mcp(request, env) {
  let message;
  try { message = await request.json(); } catch { return json({ error: "invalid request" }, 400); }
  const id = message.id;
  if (message.method === "initialize") return rpcResult(id, { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "belloria-mcp", version: "0.3.0" } });
  if (message.method === "notifications/initialized" || message.method === "notifications/cancelled") return new Response(null, { status: 202 });
  if (message.method === "ping") return rpcResult(id, {});
  if (message.method === "tools/list") return rpcResult(id, { tools: TOOLS });
  if (message.method !== "tools/call") return rpcError(id, -32601, "Method not found");
  const { name, arguments: args = {} } = message.params || {};
  try {
    let value;
    if (name === "belloria_channel_status") {
      value = {
        provider: "telegram",
        configured: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_WEBHOOK_SECRET && env.TELEGRAM_ALLOWED_CHAT_ID),
        voice_transcription: Boolean(env.AI)
      };
    } else if (name === "belloria_list_commands") {
      const limit = args.limit === undefined ? 10 : args.limit;
      if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error("limit must be an integer from 1 to 20");
      value = { commands: await listCommands(env, limit) };
    } else if (name === "belloria_complete_command") {
      if (args.confirmed !== true) throw new Error("explicit confirmation is required");
      value = await completeCommand(env, args.command_id || "");
    } else if (name === "belloria_propose_action") {
      value = await proposeAction(env, args);
    } else if (name === "belloria_consume_approved_action") {
      if (args.confirmed !== true) throw new Error("explicit confirmation is required");
      value = await consumeApprovedAction(env, args.confirmation_command_id || "");
    } else if (name === "belloria_send_text") {
      if (args.confirmed !== true) throw new Error("explicit confirmation is required");
      value = await sendText(env, args.text || "");
    } else throw new Error("unknown tool");
    return rpcResult(id, { content: [{ type: "text", text: JSON.stringify(value) }] });
  } catch (error) { return rpcError(id, -32602, error.message); }
}

export async function handleRequest(request, env, context) {
  const path = new URL(request.url).pathname;
  if (path === "/health" && request.method === "GET") return json({ status: "ok", channel: "telegram" });
  if (path === "/webhooks/telegram") return telegramWebhook(request, env, context);
  return json({ error: "not found" }, 404);
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function csrfSignature(secret, value, search) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(`${value}|${search}`)));
}

async function createCsrfToken(secret, search) {
  const value = `${Date.now()}.${crypto.randomUUID()}`;
  return `${value}.${await csrfSignature(secret, value, search)}`;
}

async function validCsrfToken(token, secret, search) {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [timestamp, nonce, supplied] = parts;
  const age = Date.now() - Number(timestamp);
  if (!nonce || !Number.isFinite(age) || age < 0 || age > 600000) return false;
  const expected = await csrfSignature(secret, `${timestamp}.${nonce}`, search);
  return timingSafeEqual(supplied, expected);
}

function authorizePage(csrfToken) {
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Autoriser Belloria</title><style>body{font:16px system-ui;max-width:34rem;margin:4rem auto;padding:0 1rem;color:#1f2937}label,input,button{display:block;width:100%;box-sizing:border-box}input,button{font:inherit;padding:.75rem;margin-top:.5rem}button{margin-top:1rem;background:#111827;color:white;border:0;border-radius:.4rem}</style><h1>Autoriser ChatGPT</h1><p>Cette connexion donne accès aux commandes du bot Telegram privé Belloria. Continuez uniquement depuis votre espace ChatGPT Belloria.</p><form method="post"><input type="hidden" name="csrf_token" value="${csrfToken}"><label>Secret d'autorisation<input name="password" type="password" required autocomplete="current-password"></label><button type="submit">Autoriser Belloria</button></form></html>`;
}

export const oauthDefaultHandler = {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    if (url.pathname !== "/authorize") return handleRequest(request, env, context);

    if (request.method === "GET") {
      await env.OAUTH_PROVIDER.parseAuthRequest(request);
      if (!env.BELLORIA_MCP_TOKEN) return json({ error: "unauthorized" }, 401);
      const csrfToken = await createCsrfToken(env.BELLORIA_MCP_TOKEN, url.search);
      return html(authorizePage(csrfToken));
    }

    if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
    const form = await request.formData();
    const csrfToken = String(form.get("csrf_token") || "");
    const password = String(form.get("password") || "");
    if (!env.BELLORIA_MCP_TOKEN || !await validCsrfToken(csrfToken, env.BELLORIA_MCP_TOKEN, url.search)) return json({ error: "unauthorized" }, 401);
    if (!timingSafeEqual(password, env.BELLORIA_MCP_TOKEN)) return json({ error: "unauthorized" }, 401);

    const oauthRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request);
    const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
      request: oauthRequest,
      userId: "belloria-owner",
      metadata: { channel: "telegram" },
      scope: ["belloria:mcp"],
      props: { role: "owner" }
    });
    return new Response(null, {
      status: 302,
      headers: {
        location: redirectTo,
        "cache-control": "no-store"
      }
    });
  }
};

export const oauthApiHandler = {
  async fetch(request, env) {
    if (new URL(request.url).pathname === "/mcp" && request.method === "POST") return mcp(request, env);
    return json({ error: "not found" }, 404);
  }
};
