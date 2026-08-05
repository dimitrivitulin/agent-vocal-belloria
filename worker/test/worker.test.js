import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import { extractTelegramCommand, handleRequest, oauthApiHandler, oauthDefaultHandler, parseFastIntent } from "../src/index.js";

globalThis.crypto ||= webcrypto;

class FakeDb {
  constructor() { this.rows = new Map(); this.actions = new Map(); this.snapshots = new Map(); this.aliases = []; }

  prepare(sql) {
    const db = this;
    return {
      sql, args: [],
      bind(...args) {
        return {
          sql, args,
          run: async () => db.run(sql, args),
          all: async () => db.all(sql, args)
        };
      },
      all: async () => db.all(sql, [])
    };
  }

  async batch(statements) {
    return Promise.all(statements.map((statement) => this.run(statement.sql, statement.args)));
  }

  run(sql, args) {
    if (sql.startsWith("INSERT INTO telegram_commands")) {
      const [command_id, message_id, command_kind, content, voice_file_id, state] = args;
      if (this.rows.has(command_id)) return { meta: { changes: 0 } };
      this.rows.set(command_id, { command_id, message_id, command_kind, content, voice_file_id, state, created_at: "2026-08-03T10:00:00Z", last_error_code: null });
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith("INSERT INTO telegram_action_approvals")) {
      const [token, prospect, sources_json, content, consequence] = args;
      const modifier = args.length === 7 ? args[5] : "+10 minutes";
      const source_command_id = args.length === 7 ? args[6] : args[5];
      if (this.actions.has(token)) return { meta: { changes: 0 } };
      if (this.rows.get(source_command_id)?.state !== "pending") return { meta: { changes: 0 } };
      const minutes = Number(String(modifier).match(/\d+/)?.[0] || 10);
      this.actions.set(token, {
        token, source_command_id, prospect, sources_json, content, consequence,
        state: "pending", expires_at: new Date(Date.now() + minutes * 60000).toISOString(),
        consumed_at: null, confirmation_command_id: null
      });
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith("UPDATE telegram_commands SET started_at")) {
      const row = this.rows.get(args[0]);
      if (!row || row.state !== "pending" || row.replied_at) return { meta: { changes: 0 } };
      row.started_at ||= new Date().toISOString();
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith("UPDATE telegram_commands SET state = 'completed', content = NULL, replied_at")) {
      const row = this.rows.get(args[0]);
      if (!row || row.state !== "pending") return { meta: { changes: 0 } };
      Object.assign(row, { state: "completed", content: null, replied_at: new Date().toISOString(), latency_ms: 20 });
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith("UPDATE telegram_commands SET last_error_code")) {
      const [code, commandId] = args;
      const row = this.rows.get(commandId);
      if (row?.state === "pending") row.last_error_code = code;
      return { meta: { changes: row?.state === "pending" ? 1 : 0 } };
    }

    if (sql.startsWith("UPDATE telegram_commands SET replied_at")) {
      const row = this.rows.get(args[0]);
      if (!row || row.state !== "pending") return { meta: { changes: 0 } };
      Object.assign(row, { replied_at: new Date().toISOString(), latency_ms: 20, last_error_code: "fast_path_deferred" });
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith("INSERT INTO telegram_prospect_snapshots")) {
      const [prospect_id, label, sources_json, summary, recommendation, reply_draft, quote_draft, follow_up_draft, contradictory, source_updated_at] = args;
      this.snapshots.set(prospect_id, { prospect_id, label, sources_json, summary, recommendation, reply_draft, quote_draft, follow_up_draft, contradictory, source_updated_at, refreshed_at: new Date().toISOString(), expires_at: new Date(Date.now() + 90 * 60000).toISOString() });
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith("DELETE FROM telegram_prospect_aliases")) {
      this.aliases = args.length ? this.aliases.filter((row) => row.prospect_id !== args[0]) : [];
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith("DELETE FROM telegram_prospect_snapshots")) {
      this.snapshots.clear();
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith("INSERT INTO telegram_prospect_aliases")) {
      this.aliases.push({ prospect_id: args[0], alias: args[1] });
      return { meta: { changes: 1 } };
    }

    if (sql.includes("SET content = ?") && sql.includes("state = 'pending'")) {
      const [content, commandId] = args;
      const row = this.rows.get(commandId);
      if (!row || row.state !== "transcribing") return { meta: { changes: 0 } };
      Object.assign(row, { content, voice_file_id: null, state: "pending", last_error_code: null });
      return { meta: { changes: 1 } };
    }

    if (sql.includes("state = 'quarantined'")) {
      const [last_error_code, commandId] = args;
      const row = this.rows.get(commandId);
      if (!row || row.state !== "transcribing") return { meta: { changes: 0 } };
      Object.assign(row, { voice_file_id: null, state: "quarantined", last_error_code });
      return { meta: { changes: 1 } };
    }

    if (sql.includes("state = 'completed'")) {
      const [commandId] = args;
      const row = this.rows.get(commandId);
      if (!row || !["pending", "quarantined"].includes(row.state)) return { meta: { changes: 0 } };
      Object.assign(row, { content: null, state: "completed" });
      return { meta: { changes: 1 } };
    }

    throw new Error(`Unsupported fake SQL: ${sql}`);
  }

  all(sql, args) {
    if (sql.startsWith("SELECT s.* FROM telegram_prospect_snapshots")) {
      const ids = this.aliases.filter((row) => row.alias === args[0]).map((row) => row.prospect_id);
      const cutoff = Date.now() - 90 * 60000;
      return { results: ids.map((id) => this.snapshots.get(id)).filter((row) => row && new Date(row.expires_at) > new Date() && new Date(row.refreshed_at).getTime() >= cutoff).slice(0, 2) };
    }
    if (sql.startsWith("SELECT command_id")) {
      const limit = args[0];
      const results = [...this.rows.values()].filter((row) => ["pending", "quarantined"].includes(row.state)).slice(0, limit);
      return { results };
    }
    if (sql.startsWith("UPDATE telegram_action_approvals")) {
      const [confirmationCommandId] = args;
      const command = this.rows.get(confirmationCommandId);
      const token = command?.state === "pending" && /^CONFIRMER\s+/i.test(command.content || "")
        ? command.content.replace(/^CONFIRMER\s+/i, "").trim().toUpperCase() : "";
      const action = this.actions.get(token);
      if (!action || action.state !== "pending" || new Date(action.expires_at) <= new Date()) return { results: [] };
      Object.assign(action, { state: "consumed", consumed_at: new Date().toISOString(), confirmation_command_id: confirmationCommandId });
      return { results: [{ ...action }] };
    }
    throw new Error(`Unsupported fake SQL: ${sql}`);
  }
}

function environment(overrides = {}) {
  return {
    DB: new FakeDb(),
    TELEGRAM_BOT_TOKEN: "telegram-test-token",
    TELEGRAM_WEBHOOK_SECRET: "webhook-secret",
    TELEGRAM_ALLOWED_CHAT_ID: "123456",
    BELLORIA_MCP_TOKEN: "oauth-password",
    AI: { run: async () => ({ text: "Transcription de test" }) },
    ...overrides
  };
}

function telegramRequest(payload, secret = "webhook-secret") {
  return new Request("https://worker.test/webhooks/telegram", {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret },
    body: JSON.stringify(payload)
  });
}

function callMcp(payload, env) {
  return oauthApiHandler.fetch(mcpRequest(payload), env);
}

function textUpdate(overrides = {}) {
  return { update_id: 7001, message: { message_id: 81, chat: { id: 123456 }, text: "Montre les devis à revoir" }, ...overrides };
}

function voiceUpdate(fileSize = 1024) {
  return { update_id: 7002, message: { message_id: 82, chat: { id: 123456 }, voice: { file_id: "voice-file-private", file_size: fileSize } } };
}

function executionContext() {
  const promises = [];
  return { waitUntil(promise) { promises.push(promise); }, drain() { return Promise.all(promises); } };
}

function mcpRequest(body, authenticated = true) {
  return new Request("https://worker.test/mcp", {
    method: "POST",
    headers: authenticated ? { authorization: "Bearer mcp-token" } : {},
    body: JSON.stringify(body)
  });
}

function toolCall(id, name, args = {}) {
  return { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } };
}

test("extracts only supported private command shapes", () => {
  assert.deepEqual(extractTelegramCommand(textUpdate()), {
    id: "7001", messageId: "81", chatId: "123456", kind: "text",
    content: "Montre les devis à revoir", voiceFileId: null, voiceBytes: null
  });
  assert.deepEqual(extractTelegramCommand(voiceUpdate()), {
    id: "7002", messageId: "82", chatId: "123456", kind: "voice",
    content: null, voiceFileId: "voice-file-private", voiceBytes: 1024
  });
  assert.equal(extractTelegramCommand({ update_id: 1, message: { message_id: 1, chat: { id: 1 }, photo: [] } }), null);
});

test("authenticates webhook, allowlists one chat and deduplicates updates", async () => {
  const env = environment();
  assert.equal((await handleRequest(telegramRequest(textUpdate(), "wrong"), env)).status, 401);
  assert.equal((await handleRequest(telegramRequest(textUpdate(), ""), environment({ TELEGRAM_WEBHOOK_SECRET: undefined }))).status, 401);

  const rejected = textUpdate({ message: { message_id: 81, chat: { id: 999999 }, text: "intrusion" } });
  assert.deepEqual(await (await handleRequest(telegramRequest(rejected), env)).json(), { accepted: 0 });
  assert.equal(env.DB.rows.size, 0);

  assert.deepEqual(await (await handleRequest(telegramRequest(textUpdate()), env)).json(), { accepted: 1 });
  assert.deepEqual(await (await handleRequest(telegramRequest(textUpdate()), env)).json(), { accepted: 0 });
  assert.equal(env.DB.rows.size, 1);
  assert.equal(env.DB.rows.get("7001").chat_id, undefined);
});

test("transcribes a bounded voice without retaining audio or Telegram file id", async () => {
  const originalFetch = globalThis.fetch;
  let aiInput;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/getFile")) return Response.json({ ok: true, result: { file_path: "voice/file.oga" } });
    if (String(url).includes("/file/bot")) return new Response(new Uint8Array([1, 2, 3, 4]), { headers: { "content-length": "4" } });
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const env = environment({ AI: { run: async (_model, input) => { aiInput = input; return { text: "  Quel est le prochain devis ?  " }; } } });
    const context = executionContext();
    assert.deepEqual(await (await handleRequest(telegramRequest(voiceUpdate()), env, context)).json(), { accepted: 1 });
    await context.drain();
    const row = env.DB.rows.get("7002");
    assert.equal(row.state, "pending");
    assert.equal(row.content, "Quel est le prochain devis ?");
    assert.equal(row.voice_file_id, null);
    assert.equal(aiInput.language, "fr");
    assert.equal(aiInput.audio, "AQIDBA==");
    assert.equal(JSON.stringify(row).includes("AQIDBA=="), false);
  } finally { globalThis.fetch = originalFetch; }
});

test("quarantines an oversized voice before downloading it", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error("must not download"); };
  try {
    const env = environment();
    const context = executionContext();
    await handleRequest(telegramRequest(voiceUpdate(6 * 1024 * 1024)), env, context);
    await context.drain();
    const row = env.DB.rows.get("7002");
    assert.equal(row.state, "quarantined");
    assert.equal(row.voice_file_id, null);
    assert.equal(row.last_error_code, "voice_too_large");
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("exposes provider-neutral Belloria tools after OAuth validation", async () => {
  const env = environment();
  const list = { jsonrpc: "2.0", id: 1, method: "tools/list" };
  assert.equal((await handleRequest(mcpRequest(list), env)).status, 404);
  const response = await (await callMcp(list, env)).json();
  assert.deepEqual(response.result.tools.map((tool) => tool.name), [
    "belloria_channel_status", "belloria_refresh_prospect_snapshots", "belloria_list_commands", "belloria_complete_command",
    "belloria_propose_action", "belloria_consume_approved_action", "belloria_send_text"
  ]);
  assert.equal(JSON.stringify(response).includes("123456"), false);

  const status = await (await callMcp(toolCall(2, "belloria_channel_status"), env)).json();
  assert.deepEqual(JSON.parse(status.result.content[0].text), { provider: "telegram", configured: true, voice_transcription: true });
});

test("recognizes only the deterministic BELL-030 fast-path intents", () => {
  assert.deepEqual(parseFastIntent("Résume Élodie"), { intent: "summary", query: "elodie" });
  assert.deepEqual(parseFastIntent("Prépare une réponse Élodie"), { intent: "prepare_reply", query: "elodie" });
  assert.deepEqual(parseFastIntent("CONFIRMER fast-123"), { intent: "confirm", query: null });
  assert.equal(parseFastIntent("invente une offre"), null);
});

async function refreshSnapshot(env, overrides = {}) {
  const snapshot = {
    prospect_id: "p-1", label: "Élodie — mariage", aliases: ["Élodie", "elodie@example.test"],
    sources: ["notion:p-1", "gmail:m-1"], summary: "Mariage de 80 personnes.",
    recommendation: "Proposer le menu validé.", reply_draft: "Bonjour Élodie, voici la suite.",
    quote_draft: "Préparer le devis Menu.", follow_up_draft: "Bonjour Élodie, avez-vous pu avancer ?",
    source_updated_at: new Date().toISOString(), contradictory: false, ...overrides
  };
  const response = await (await callMcp(toolCall(40, "belloria_refresh_prospect_snapshots", { snapshots: [snapshot] }), env)).json();
  return JSON.parse(response.result.content[0].text);
}

test("refreshes minimal snapshots and replies to a text command through waitUntil", async () => {
  const originalFetch = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (_url, options) => { sent.push(JSON.parse(options.body)); return Response.json({ ok: true, result: { message_id: 501 } }); };
  try {
    const env = environment();
    assert.deepEqual(await refreshSnapshot(env), { refreshed: 1, expires_in_minutes: 90 });
    const context = executionContext();
    const update = textUpdate({ message: { message_id: 91, chat: { id: 123456 }, text: "Résume Élodie" } });
    assert.deepEqual(await (await handleRequest(telegramRequest(update), env, context)).json(), { accepted: 1 });
    await context.drain();
    assert.match(sent[0].text, /Mariage de 80 personnes/);
    const row = env.DB.rows.get("7001");
    assert.equal(row.state, "completed");
    assert.equal(row.content, null);
    assert.ok(row.started_at && row.replied_at);
    assert.equal(typeof row.latency_ms, "number");
  } finally { globalThis.fetch = originalFetch; }
});

test("runs the same fast path after a voice transcription", async () => {
  const originalFetch = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith("/getFile")) return Response.json({ ok: true, result: { file_path: "voice/file.oga" } });
    if (String(url).includes("/file/bot")) return new Response(new Uint8Array([1, 2, 3]));
    if (String(url).endsWith("/sendMessage")) { sent.push(JSON.parse(options.body).text); return Response.json({ ok: true, result: { message_id: 504 } }); }
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const env = environment({ AI: { run: async () => ({ text: "Résume Élodie" }) } });
    await refreshSnapshot(env);
    const context = executionContext();
    await handleRequest(telegramRequest(voiceUpdate()), env, context);
    await context.drain();
    assert.match(sent[0], /Mariage de 80 personnes/);
    assert.equal(env.DB.rows.get("7002").state, "completed");
    assert.equal(env.DB.rows.get("7002").voice_file_id, null);
  } finally { globalThis.fetch = originalFetch; }
});

test("creates one traceable proposal and keeps replay idempotent", async () => {
  const originalFetch = globalThis.fetch;
  let sends = 0;
  globalThis.fetch = async () => { sends += 1; return Response.json({ ok: true, result: { message_id: 502 } }); };
  try {
    const env = environment();
    await refreshSnapshot(env);
    const context = executionContext();
    const update = textUpdate({ message: { message_id: 92, chat: { id: 123456 }, text: "Prépare une réponse Élodie" } });
    await handleRequest(telegramRequest(update), env, context);
    await context.drain();
    const token = [...env.DB.actions.keys()][0];
    assert.match(token, /^FAST-[A-F0-9]{12}$/);
    assert.equal(env.DB.actions.get(token).content, "Bonjour Élodie, voici la suite.");
    assert.equal(sends, 1);
    assert.deepEqual(await (await handleRequest(telegramRequest(update), env, executionContext())).json(), { accepted: 0 });
    assert.equal(sends, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("refuses stale, ambiguous and contradictory snapshots safely", async () => {
  const originalFetch = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (_url, options) => { sent.push(JSON.parse(options.body).text); return Response.json({ ok: true, result: { message_id: 503 } }); };
  try {
    for (const scenario of ["stale", "ambiguous", "contradictory"]) {
      const env = environment();
      await refreshSnapshot(env, scenario === "contradictory" ? { contradictory: true } : {});
      if (scenario === "stale") env.DB.snapshots.get("p-1").expires_at = "2020-01-01T00:00:00Z";
      if (scenario === "ambiguous") {
        const base = {
          sources: ["notion:p"], summary: "Résumé", recommendation: "Action",
          source_updated_at: new Date().toISOString(), contradictory: false
        };
        await callMcp(toolCall(42, "belloria_refresh_prospect_snapshots", { snapshots: [
          { ...base, prospect_id: "p-1", label: "Élodie A", aliases: ["Élodie"] },
          { ...base, prospect_id: "p-2", label: "Élodie B", aliases: ["Élodie"] }
        ] }), env);
      }
      const context = executionContext();
      const update = textUpdate({ update_id: 7100 + sent.length, message: { message_id: 100 + sent.length, chat: { id: 123456 }, text: "Résume Élodie" } });
      await handleRequest(telegramRequest(update), env, context);
      await context.drain();
    }
    assert.match(sent[0], /absent ou périmé/);
    assert.match(sent[1], /ambigu/);
    assert.match(sent[2], /contradictoire/);
  } finally { globalThis.fetch = originalFetch; }
});

test("keeps a command pending for hourly recovery when Telegram fails", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("down", { status: 503 });
  try {
    const env = environment();
    await refreshSnapshot(env);
    const context = executionContext();
    const update = textUpdate({ update_id: 7200, message: { message_id: 120, chat: { id: 123456 }, text: "Résume Élodie" } });
    await handleRequest(telegramRequest(update), env, context);
    await context.drain();
    assert.equal(env.DB.rows.get("7200").state, "pending");
    assert.equal(env.DB.rows.get("7200").last_error_code, "telegram_http_503");
    const listed = await (await callMcp(toolCall(41, "belloria_list_commands", { limit: 5 }), env)).json();
    assert.equal(JSON.parse(listed.result.content[0].text).commands[0].command_id, "7200");
  } finally { globalThis.fetch = originalFetch; }
});

test("completes the stateless MCP initialization handshake", async () => {
  const env = environment();
  const initialized = await callMcp({ jsonrpc: "2.0", method: "notifications/initialized" }, env);
  assert.equal(initialized.status, 202);
  assert.equal(await initialized.text(), "");

  const ping = await (await callMcp({ jsonrpc: "2.0", id: 8, method: "ping" }, env)).json();
  assert.deepEqual(ping, { jsonrpc: "2.0", id: 8, result: {} });
});

test("lists commands and erases their text only after explicit completion", async () => {
  const env = environment();
  await handleRequest(telegramRequest(textUpdate()), env);

  const listed = await (await callMcp(toolCall(3, "belloria_list_commands", { limit: 5 }), env)).json();
  const commands = JSON.parse(listed.result.content[0].text).commands;
  assert.equal(commands[0].text, "Montre les devis à revoir");
  assert.equal(commands[0].status, "pending");

  const denied = await (await callMcp(toolCall(4, "belloria_complete_command", { command_id: "7001", confirmed: false }), env)).json();
  assert.equal(denied.error.message, "explicit confirmation is required");
  assert.equal(env.DB.rows.get("7001").content, "Montre les devis à revoir");

  const completed = await (await callMcp(toolCall(5, "belloria_complete_command", { command_id: "7001", confirmed: true }), env)).json();
  assert.deepEqual(JSON.parse(completed.result.content[0].text), { completed: true });
  assert.equal(env.DB.rows.get("7001").content, null);
});

test("sends only to the fixed chat and requires exact confirmation", async () => {
  const originalFetch = globalThis.fetch;
  const payloads = [];
  globalThis.fetch = async (url, options) => {
    payloads.push({ url: String(url), body: JSON.parse(options.body) });
    return Response.json({ ok: true, result: { message_id: 99, chat: { id: 123456 } } });
  };
  try {
    const env = environment();
    const denied = await (await callMcp(toolCall(6, "belloria_send_text", { text: "Rapport", confirmed: false }), env)).json();
    assert.equal(denied.error.message, "explicit confirmation is required");
    assert.equal(payloads.length, 0);

    const sent = await (await callMcp(toolCall(7, "belloria_send_text", { text: "Rapport", confirmed: true, chat_id: "attacker" }), env)).json();
    assert.deepEqual(JSON.parse(sent.result.content[0].text), { sent: true, message_id: 99 });
    assert.equal(payloads.length, 1);
    assert.equal(payloads[0].body.chat_id, "123456");
    assert.equal(payloads[0].body.text, "Rapport");
    assert.equal(payloads[0].url.includes("telegram-test-token"), true);
  } finally { globalThis.fetch = originalFetch; }
});

test("persists and atomically consumes only an exact Telegram approval", async () => {
  const env = environment();
  await handleRequest(telegramRequest(textUpdate()), env);
  const proposal = await (await callMcp(toolCall(20, "belloria_propose_action", {
    command_id: "7001", token: "ABC123", prospect: "Élodie — mariage",
    sources: ["crm:p-1", "gmail:m-1"], content: "Créer le brouillon exact",
    consequence: "Créer un brouillon sans envoi", expires_in_minutes: 10
  }), env)).json();
  assert.deepEqual(JSON.parse(proposal.result.content[0].text), { proposed: true, token: "ABC123", expires_in_minutes: 10 });

  const wrongUpdate = textUpdate({ update_id: 7003, message: { message_id: 83, chat: { id: 123456 }, text: "CONFIRMER AUTRE1" } });
  await handleRequest(telegramRequest(wrongUpdate), env);
  const wrong = await (await callMcp(toolCall(21, "belloria_consume_approved_action", { confirmation_command_id: "7003", confirmed: true }), env)).json();
  assert.deepEqual(JSON.parse(wrong.result.content[0].text), { approved: false });
  assert.equal(env.DB.rows.get("7003").content, "CONFIRMER AUTRE1");

  const confirmUpdate = textUpdate({ update_id: 7004, message: { message_id: 84, chat: { id: 123456 }, text: "CONFIRMER abc123" } });
  await handleRequest(telegramRequest(confirmUpdate), env);
  const approved = await (await callMcp(toolCall(22, "belloria_consume_approved_action", { confirmation_command_id: "7004", confirmed: true }), env)).json();
  assert.deepEqual(JSON.parse(approved.result.content[0].text), {
    approved: true,
    action: {
      token: "ABC123", source_command_id: "7001", prospect: "Élodie — mariage",
      sources: ["crm:p-1", "gmail:m-1"], content: "Créer le brouillon exact",
      consequence: "Créer un brouillon sans envoi"
    }
  });
  assert.equal(env.DB.rows.get("7004").content, null);

  const replay = await (await callMcp(toolCall(23, "belloria_consume_approved_action", { confirmation_command_id: "7004", confirmed: true }), env)).json();
  assert.deepEqual(JSON.parse(replay.result.content[0].text), { approved: false });
});

test("rejects expired approvals without erasing the confirmation", async () => {
  const env = environment();
  await handleRequest(telegramRequest(textUpdate()), env);
  await (await callMcp(toolCall(24, "belloria_propose_action", {
    command_id: "7001", token: "EXPIRE1", prospect: "Prospect", sources: [],
    content: "Action", consequence: "Conséquence"
  }), env)).json();
  env.DB.actions.get("EXPIRE1").expires_at = "2020-01-01T00:00:00Z";
  const confirmUpdate = textUpdate({ update_id: 7005, message: { message_id: 85, chat: { id: 123456 }, text: "CONFIRMER EXPIRE1" } });
  await handleRequest(telegramRequest(confirmUpdate), env);
  const response = await (await callMcp(toolCall(25, "belloria_consume_approved_action", { confirmation_command_id: "7005", confirmed: true }), env)).json();
  assert.deepEqual(JSON.parse(response.result.content[0].text), { approved: false });
  assert.equal(env.DB.rows.get("7005").content, "CONFIRMER EXPIRE1");
});

test("reports a minimal health response", async () => {
  const response = await handleRequest(new Request("https://worker.test/health"), environment());
  assert.deepEqual(await response.json(), { status: "ok", channel: "telegram" });
});

test("serves a hardened OAuth authorization form", async () => {
  const env = environment({
    OAUTH_PROVIDER: { parseAuthRequest: async () => ({ clientId: "chatgpt" }) }
  });
  const response = await oauthDefaultHandler.fetch(new Request("https://worker.test/authorize?client_id=chatgpt"), env);
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-security-policy"), /form-action 'self' https:\/\/chatgpt\.com/);
  assert.match(body, /type="password"/);
  assert.match(body, /name="csrf_token" value="\d+\.[0-9a-f-]+\.[0-9a-f]+"/);
  assert.equal(body.includes("oauth-password"), false);
});

test("requires the Belloria password and CSRF token before granting OAuth", async () => {
  let completed;
  const env = environment({
    OAUTH_PROVIDER: {
      parseAuthRequest: async () => ({ clientId: "chatgpt", scope: ["belloria:commands"] }),
      completeAuthorization: async (options) => {
        completed = options;
        return { redirectTo: "https://chatgpt.com/aip/callback?code=test" };
      }
    }
  });
  const authorizationUrl = "https://worker.test/authorize?client_id=chatgpt";
  const formResponse = await oauthDefaultHandler.fetch(new Request(authorizationUrl), env);
  const formBody = await formResponse.text();
  const csrfToken = formBody.match(/name="csrf_token" value="([^"]+)"/)[1];
  const request = new Request(authorizationUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrf_token: csrfToken, password: "oauth-password" })
  });
  const response = await oauthDefaultHandler.fetch(request, env);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://chatgpt.com/aip/callback?code=test");
  assert.equal(completed.userId, "belloria-owner");
  assert.deepEqual(completed.scope, ["belloria:mcp"]);
  assert.deepEqual(completed.props, { role: "owner" });

  const rejected = new Request(authorizationUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrf_token: csrfToken, password: "wrong" })
  });
  assert.equal((await oauthDefaultHandler.fetch(rejected, env)).status, 401);

  const tampered = new Request(`${authorizationUrl}&scope=extra`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrf_token: csrfToken, password: "oauth-password" })
  });
  assert.equal((await oauthDefaultHandler.fetch(tampered, env)).status, 401);
});
