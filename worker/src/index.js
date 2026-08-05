const TELEGRAM_VOICE_MAX_BYTES = 5 * 1024 * 1024;
const TELEGRAM_TEXT_MAX_CHARS = 4096;
const WHISPER_MODEL = "@cf/openai/whisper-large-v3-turbo";
const SNAPSHOT_MAX_AGE_MINUTES = 90;
const SNAPSHOT_MAX_ITEMS = 100;

const TOOLS = [
  {
    name: "belloria_channel_status",
    description: "Read whether the private Belloria Telegram channel is configured.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "belloria_refresh_prospect_snapshots",
    description: "Replace the short-lived D1 snapshots used by the Telegram fast path after the hourly sourced CRM pass.",
    inputSchema: {
      type: "object",
      properties: {
        snapshots: {
          type: "array", maxItems: SNAPSHOT_MAX_ITEMS,
          items: {
            type: "object",
            properties: {
              prospect_id: { type: "string", minLength: 1, maxLength: 100 },
              label: { type: "string", minLength: 1, maxLength: 200 },
              aliases: { type: "array", minItems: 1, maxItems: 10, items: { type: "string", minLength: 1, maxLength: 100 } },
              sources: { type: "array", minItems: 1, maxItems: 20, items: { type: "string", minLength: 1, maxLength: 300 } },
              summary: { type: "string", minLength: 1, maxLength: 1500 },
              recommendation: { type: "string", minLength: 1, maxLength: 1500 },
              reply_draft: { type: "string", maxLength: 2000 },
              quote_draft: { type: "string", maxLength: 2000 },
              follow_up_draft: { type: "string", maxLength: 2000 },
              contradictory: { type: "boolean" },
              source_updated_at: { type: "string", format: "date-time" }
            },
            required: ["prospect_id", "label", "aliases", "sources", "summary", "recommendation", "source_updated_at"],
            additionalProperties: false
          }
        }
      },
      required: ["snapshots"], additionalProperties: false
    }
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
    await runFastPath(env, command.id, text);
  } catch (error) {
    const code = cleanErrorCode(error, "voice_transcription_failed");
    await env.DB.prepare(
      "UPDATE telegram_commands SET voice_file_id = NULL, state = 'quarantined', updated_at = CURRENT_TIMESTAMP, last_error_code = ? WHERE command_id = ? AND state = 'transcribing'"
    ).bind(code, command.id).run();
    console.log(JSON.stringify({ event: "telegram_voice_quarantined", code }));
  }
}

function normalizeQuery(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9@+]+/g, " ").trim();
}

export function parseFastIntent(text) {
  const normalized = normalizeQuery(text);
  if (normalized.startsWith("confirmer ")) return { intent: "confirm", query: null };
  if (normalized.includes("priorit")) return { intent: "priorities", query: null };
  if (normalized.includes("planning")) return { intent: "planning", query: null };
  if (/\bca\b/.test(normalized) || normalized.includes("chiffre d affaire")) return { intent: "revenue", query: null };
  const patterns = [
    ["prepare_quote", ["prepare le devis"]], ["prepare_reply", ["prepare une reponse"]],
    ["follow_up", ["relance"]], ["summary", ["resume"]],
    ["recommendation", ["proposer", "recommande", "que lui"]]
  ];
  for (const [intent, markers] of patterns) {
    for (const marker of markers) {
      const index = normalized.indexOf(marker);
      if (index >= 0) return { intent, query: normalized.slice(index + marker.length).trim() || null };
    }
  }
  return null;
}

async function markFastStarted(env, commandId) {
  const result = await env.DB.prepare(
    "UPDATE telegram_commands SET started_at = COALESCE(started_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE command_id = ? AND state = 'pending' AND replied_at IS NULL"
  ).bind(commandId).run();
  return Number(result.meta?.changes || 0) === 1;
}

async function loadFreshSnapshot(env, query) {
  const result = await env.DB.prepare(
    "SELECT s.* FROM telegram_prospect_snapshots s JOIN telegram_prospect_aliases a ON a.prospect_id = s.prospect_id WHERE a.alias = ? AND s.expires_at > CURRENT_TIMESTAMP AND s.refreshed_at >= datetime('now', ?) ORDER BY s.prospect_id LIMIT 2"
  ).bind(normalizeQuery(query), `-${SNAPSHOT_MAX_AGE_MINUTES} minutes`).all();
  return result.results || [];
}

async function fastToken(commandId) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`belloria-fast:${commandId}`));
  return `FAST-${toHex(digest).slice(0, 12).toUpperCase()}`;
}

function safeRefusal(reason) {
  return { text: `Je ne peux pas traiter cette demande par la voie rapide (${reason}). Elle reste disponible pour la reprise horaire.`, completed: false };
}

async function buildFastReply(env, commandId, text) {
  const parsed = parseFastIntent(text);
  if (!parsed) return safeRefusal("intention non reconnue");
  if (parsed.intent === "confirm") return null;
  if (["priorities", "planning", "revenue"].includes(parsed.intent)) return safeRefusal("contexte global non présent dans l'instantané prospect");
  if (!parsed.query) return safeRefusal("prospect manquant");
  const matches = await loadFreshSnapshot(env, parsed.query);
  if (matches.length !== 1) return safeRefusal(matches.length ? "prospect ambigu" : "contexte absent ou périmé");
  const snapshot = matches[0];
  if (snapshot.contradictory) return safeRefusal("contexte contradictoire");
  if (parsed.intent === "summary") return { text: `${snapshot.label}\n${snapshot.summary}\nSources : ${JSON.parse(snapshot.sources_json).join(", ")}`, completed: true };
  if (parsed.intent === "recommendation") return { text: `${snapshot.label}\n${snapshot.recommendation}\nSources : ${JSON.parse(snapshot.sources_json).join(", ")}`, completed: true };
  const field = { prepare_reply: "reply_draft", prepare_quote: "quote_draft", follow_up: "follow_up_draft" }[parsed.intent];
  const content = snapshot[field];
  if (!content) return safeRefusal("proposition non disponible");
  const consequence = {
    prepare_reply: "Créer un brouillon de réponse, sans l’envoyer.",
    prepare_quote: "Passer le dossier en devis à préparer, sans envoyer de devis.",
    follow_up: "Créer un brouillon de relance, sans l’envoyer."
  }[parsed.intent];
  const token = await fastToken(commandId);
  await env.DB.prepare(
    "INSERT INTO telegram_action_approvals (token, source_command_id, prospect, sources_json, content, consequence, expires_at) SELECT ?, command_id, ?, ?, ?, ?, datetime('now', '+10 minutes') FROM telegram_commands WHERE command_id = ? AND state = 'pending' ON CONFLICT(token) DO NOTHING"
  ).bind(token, snapshot.label, snapshot.sources_json, content, consequence, commandId).run();
  return { text: `Action proposée pour ${snapshot.label}\nSources : ${JSON.parse(snapshot.sources_json).join(", ")}\nContenu exact : ${content}\nConséquence : ${consequence}\nPour approuver : CONFIRMER ${token}`, completed: true };
}

async function runFastPath(env, commandId, text) {
  if (!await markFastStarted(env, commandId)) return;
  try {
    const reply = await buildFastReply(env, commandId, text);
    if (!reply) return;
    await sendText(env, reply.text);
    const sql = reply.completed
      ? "UPDATE telegram_commands SET state = 'completed', content = NULL, replied_at = CURRENT_TIMESTAMP, latency_ms = CAST((julianday(CURRENT_TIMESTAMP) - julianday(created_at)) * 86400000 AS INTEGER), updated_at = CURRENT_TIMESTAMP WHERE command_id = ? AND state = 'pending'"
      : "UPDATE telegram_commands SET replied_at = CURRENT_TIMESTAMP, latency_ms = CAST((julianday(CURRENT_TIMESTAMP) - julianday(created_at)) * 86400000 AS INTEGER), last_error_code = 'fast_path_deferred', updated_at = CURRENT_TIMESTAMP WHERE command_id = ? AND state = 'pending'";
    await env.DB.prepare(sql).bind(commandId).run();
    console.log(JSON.stringify({ event: "telegram_fast_path_replied", command_id: commandId, latency_recorded: true }));
  } catch (error) {
    const code = cleanErrorCode(error, "fast_path_failed");
    await env.DB.prepare(
      "UPDATE telegram_commands SET last_error_code = ?, updated_at = CURRENT_TIMESTAMP WHERE command_id = ? AND state = 'pending'"
    ).bind(code, commandId).run();
    console.log(JSON.stringify({ event: "telegram_fast_path_failed", command_id: commandId, code }));
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
  if (inserted) {
    if (command.kind === "voice") {
      const work = transcribeVoice(env, command);
      if (context?.waitUntil) context.waitUntil(work);
      else await work;
    } else if (context?.waitUntil) {
      context.waitUntil(runFastPath(env, command.id, command.content));
    }
  }
  console.log(JSON.stringify({ event: "telegram_webhook_ingested", accepted: inserted ? 1 : 0, kind: command.kind }));
  return json({ accepted: inserted ? 1 : 0 });
}

function validateSnapshot(item) {
  const limits = { prospect_id: 100, label: 200, summary: 1500, recommendation: 1500, reply_draft: 2000, quote_draft: 2000, follow_up_draft: 2000 };
  const allowed = new Set([...Object.keys(limits), "aliases", "sources", "contradictory", "source_updated_at"]);
  if (!item || typeof item !== "object" || Object.keys(item).some((key) => !allowed.has(key))) throw new Error("snapshot contains unsupported fields");
  for (const [key, maximum] of Object.entries(limits)) {
    const value = item[key];
    const optional = key.endsWith("_draft");
    if ((!optional && (typeof value !== "string" || !value.trim())) || (value !== undefined && (typeof value !== "string" || value.length > maximum))) throw new Error(`${key} is invalid`);
  }
  if (!Array.isArray(item.aliases) || !item.aliases.length || item.aliases.length > 10 || item.aliases.some((value) => typeof value !== "string" || !value.trim() || value.length > 100)) throw new Error("snapshot aliases are invalid");
  if (!Array.isArray(item.sources) || !item.sources.length || item.sources.length > 20 || item.sources.some((value) => typeof value !== "string" || !value.trim() || value.length > 300)) throw new Error("snapshot sources are invalid");
  if (item.contradictory !== undefined && typeof item.contradictory !== "boolean") throw new Error("contradictory must be a boolean");
  const sourceDate = new Date(item.source_updated_at);
  if (Number.isNaN(sourceDate.getTime())) throw new Error("source_updated_at must be an ISO date-time");
}

async function refreshSnapshots(env, snapshots) {
  if (!Array.isArray(snapshots) || snapshots.length > SNAPSHOT_MAX_ITEMS) throw new Error(`snapshots must contain at most ${SNAPSHOT_MAX_ITEMS} items`);
  for (const item of snapshots) validateSnapshot(item);
  const batch = [
    env.DB.prepare("DELETE FROM telegram_prospect_aliases"),
    env.DB.prepare("DELETE FROM telegram_prospect_snapshots")
  ];
  for (const item of snapshots) {
    batch.push(env.DB.prepare(
      "INSERT INTO telegram_prospect_snapshots (prospect_id, label, sources_json, summary, recommendation, reply_draft, quote_draft, follow_up_draft, contradictory, source_updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+90 minutes')) ON CONFLICT(prospect_id) DO UPDATE SET label=excluded.label, sources_json=excluded.sources_json, summary=excluded.summary, recommendation=excluded.recommendation, reply_draft=excluded.reply_draft, quote_draft=excluded.quote_draft, follow_up_draft=excluded.follow_up_draft, contradictory=excluded.contradictory, source_updated_at=excluded.source_updated_at, refreshed_at=CURRENT_TIMESTAMP, expires_at=excluded.expires_at"
    ).bind(item.prospect_id, item.label.trim(), JSON.stringify(item.sources), item.summary.trim(), item.recommendation.trim(), item.reply_draft?.trim() || null, item.quote_draft?.trim() || null, item.follow_up_draft?.trim() || null, item.contradictory ? 1 : 0, item.source_updated_at));
    for (const alias of new Set(item.aliases.map(normalizeQuery).filter(Boolean))) {
      batch.push(env.DB.prepare("INSERT INTO telegram_prospect_aliases (prospect_id, alias) VALUES (?, ?)").bind(item.prospect_id, alias));
    }
  }
  if (batch.length) await env.DB.batch(batch);
  return { refreshed: snapshots.length, expires_in_minutes: SNAPSHOT_MAX_AGE_MINUTES };
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
    } else if (name === "belloria_refresh_prospect_snapshots") {
      value = await refreshSnapshots(env, args.snapshots);
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
