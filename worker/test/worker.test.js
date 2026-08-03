import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import { extractTelegramCommand, handleRequest } from "../src/index.js";

globalThis.crypto ||= webcrypto;

class FakeDb {
  constructor() { this.rows = new Map(); }

  prepare(sql) {
    const db = this;
    return {
      bind(...args) {
        return {
          run: async () => db.run(sql, args),
          all: async () => db.all(sql, args)
        };
      },
      all: async () => db.all(sql, [])
    };
  }

  run(sql, args) {
    if (sql.startsWith("INSERT INTO telegram_commands")) {
      const [command_id, message_id, command_kind, content, voice_file_id, state] = args;
      if (this.rows.has(command_id)) return { meta: { changes: 0 } };
      this.rows.set(command_id, { command_id, message_id, command_kind, content, voice_file_id, state, created_at: "2026-08-03T10:00:00Z", last_error_code: null });
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
    if (!sql.startsWith("SELECT command_id")) throw new Error(`Unsupported fake SQL: ${sql}`);
    const limit = args[0];
    const results = [...this.rows.values()].filter((row) => ["pending", "quarantined"].includes(row.state)).slice(0, limit);
    return { results };
  }
}

function environment(overrides = {}) {
  return {
    DB: new FakeDb(),
    TELEGRAM_BOT_TOKEN: "telegram-test-token",
    TELEGRAM_WEBHOOK_SECRET: "webhook-secret",
    TELEGRAM_ALLOWED_CHAT_ID: "123456",
    BELLORIA_MCP_TOKEN: "mcp-token",
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

test("protects MCP and exposes provider-neutral Belloria tools", async () => {
  const env = environment();
  const list = { jsonrpc: "2.0", id: 1, method: "tools/list" };
  assert.equal((await handleRequest(mcpRequest(list, false), env)).status, 401);
  assert.equal((await handleRequest(mcpRequest(list, false), environment({ BELLORIA_MCP_TOKEN: undefined }))).status, 401);
  const response = await (await handleRequest(mcpRequest(list), env)).json();
  assert.deepEqual(response.result.tools.map((tool) => tool.name), [
    "belloria_channel_status", "belloria_list_commands", "belloria_complete_command", "belloria_send_text"
  ]);
  assert.equal(JSON.stringify(response).includes("123456"), false);

  const status = await (await handleRequest(mcpRequest(toolCall(2, "belloria_channel_status")), env)).json();
  assert.deepEqual(JSON.parse(status.result.content[0].text), { provider: "telegram", configured: true, voice_transcription: true });
});

test("lists commands and erases their text only after explicit completion", async () => {
  const env = environment();
  await handleRequest(telegramRequest(textUpdate()), env);

  const listed = await (await handleRequest(mcpRequest(toolCall(3, "belloria_list_commands", { limit: 5 })), env)).json();
  const commands = JSON.parse(listed.result.content[0].text).commands;
  assert.equal(commands[0].text, "Montre les devis à revoir");
  assert.equal(commands[0].status, "pending");

  const denied = await (await handleRequest(mcpRequest(toolCall(4, "belloria_complete_command", { command_id: "7001", confirmed: false })), env)).json();
  assert.equal(denied.error.message, "explicit confirmation is required");
  assert.equal(env.DB.rows.get("7001").content, "Montre les devis à revoir");

  const completed = await (await handleRequest(mcpRequest(toolCall(5, "belloria_complete_command", { command_id: "7001", confirmed: true })), env)).json();
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
    const denied = await (await handleRequest(mcpRequest(toolCall(6, "belloria_send_text", { text: "Rapport", confirmed: false })), env)).json();
    assert.equal(denied.error.message, "explicit confirmation is required");
    assert.equal(payloads.length, 0);

    const sent = await (await handleRequest(mcpRequest(toolCall(7, "belloria_send_text", { text: "Rapport", confirmed: true, chat_id: "attacker" })), env)).json();
    assert.deepEqual(JSON.parse(sent.result.content[0].text), { sent: true, message_id: 99 });
    assert.equal(payloads.length, 1);
    assert.equal(payloads[0].body.chat_id, "123456");
    assert.equal(payloads[0].body.text, "Rapport");
    assert.equal(payloads[0].url.includes("telegram-test-token"), true);
  } finally { globalThis.fetch = originalFetch; }
});

test("reports a minimal health response", async () => {
  const response = await handleRequest(new Request("https://worker.test/health"), environment());
  assert.deepEqual(await response.json(), { status: "ok", channel: "telegram" });
});
