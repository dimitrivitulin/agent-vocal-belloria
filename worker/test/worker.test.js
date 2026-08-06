import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import { createWorkerEntrypoint, extractTallySubmission, extractTelegramCommand, handleRequest, normalizeFrenchMobile, oauthApiHandler, oauthDefaultHandler, tallySmsContent, tallySmsRecipient } from "../src/index.js";

globalThis.crypto ||= webcrypto;

class FakeDb {
  constructor() { this.rows = new Map(); this.actions = new Map(); this.snapshots = new Map(); this.tally = new Map(); }

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

  async batch(statements) {
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }

  run(sql, args) {
    if (sql.startsWith("INSERT INTO tally_submissions")) {
      const [event_id, submission_id, form_id, form_name, submitted_at, payload_json] = args;
      if (this.tally.has(event_id) || [...this.tally.values()].some((row) => row.submission_id === submission_id)) return { meta: { changes: 0 } };
      this.tally.set(event_id, { event_id, submission_id, form_id, form_name, submitted_at, payload_json, state: "pending", sms_status: "pending", created_at: "2026-08-05T10:00:00Z" });
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith("UPDATE tally_submissions SET sms_status")) {
      if (sql.includes("WHERE sms_provider_id")) {
        const [sms_status, sms_error_code, messageId] = args;
        const row = [...this.tally.values()].find((item) => item.sms_provider_id === messageId);
        if (!row) return { meta: { changes: 0 } };
        Object.assign(row, { sms_status, sms_error_code, sms_updated_at: new Date().toISOString() });
        return { meta: { changes: 1 } };
      }
      const [sms_status, sms_provider_id, sms_error_code, eventId] = args;
      const row = this.tally.get(eventId);
      if (!row || row.sms_status !== "pending") return { meta: { changes: 0 } };
      Object.assign(row, { sms_status, sms_provider_id, sms_error_code, sms_updated_at: new Date().toISOString() });
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith("UPDATE tally_submissions")) {
      const [eventId] = args;
      const row = this.tally.get(eventId);
      if (!row || row.state !== "pending") return { meta: { changes: 0 } };
      Object.assign(row, { state: "processed", payload_json: null, processed_at: new Date().toISOString() });
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith("INSERT INTO telegram_commands")) {
      const [command_id, message_id, command_kind, content, voice_file_id, state] = args;
      if (this.rows.has(command_id)) return { meta: { changes: 0 } };
      this.rows.set(command_id, { command_id, message_id, command_kind, content, voice_file_id, state, created_at: "2026-08-03T10:00:00Z", last_error_code: null });
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith("INSERT INTO telegram_action_approvals")) {
      const [token, prospect, sources_json, content, consequence, modifier, source_command_id] = args;
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

    if (sql.startsWith("DELETE FROM telegram_prospect_snapshots")) {
      const changes = this.snapshots.size;
      this.snapshots.clear();
      return { meta: { changes } };
    }

    if (sql.startsWith("INSERT INTO telegram_prospect_snapshots")) {
      const [prospect_id, label, aliases_json, summary, recommendation, actions_json, sources_json, generated_at, expiryBase, modifier] = args;
      const minutes = Number(String(modifier).match(/\d+/)?.[0] || 90);
      this.snapshots.set(prospect_id, {
        prospect_id, label, aliases_json, summary, recommendation, actions_json, sources_json, generated_at,
        expires_at: new Date(Date.parse(expiryBase) + minutes * 60000).toISOString(), updated_at: new Date().toISOString()
      });
      return { meta: { changes: 1 } };
    }

    if (sql.includes("fast_path_state = 'processing'")) {
      const [commandId] = args;
      const row = this.rows.get(commandId);
      if (!row || row.state !== "pending" || row.fast_path_state) return { meta: { changes: 0 } };
      Object.assign(row, { fast_path_state: "processing", fast_path_started_at: new Date().toISOString(), fast_path_error_code: null });
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith("UPDATE telegram_commands SET fast_path_state = ?")) {
      const [fast_path_state, fast_path_error_code, commandId] = args;
      const row = this.rows.get(commandId);
      if (!row || row.state !== "pending") return { meta: { changes: 0 } };
      Object.assign(row, { fast_path_state, fast_path_error_code, fast_path_finished_at: new Date().toISOString() });
      if (sql.includes("state = 'completed'")) Object.assign(row, { state: "completed", content: null });
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
    if (sql.startsWith("SELECT payload_json")) {
      const row = this.tally.get(args[0]);
      return { results: row?.state === "pending" ? [{ payload_json: row.payload_json }] : [] };
    }
    if (sql.startsWith("SELECT event_id")) {
      return { results: [...this.tally.values()].filter((row) => row.state === "pending").slice(0, args[0]) };
    }
    if (sql.startsWith("SELECT prospect_id")) return { results: [...this.snapshots.values()].slice(0, args[0]) };
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
    TALLY_WEBHOOK_SECRET: "tally-test-secret",
    TALLY_FORM_ID: "form-belloria",
    BELLORIA_MCP_TOKEN: "oauth-password",
    AI: { run: async () => ({ text: "Transcription de test" }) },
    ...overrides
  };
}

function tallyEvent(overrides = {}) {
  return {
    eventId: "event-1", eventType: "FORM_RESPONSE", createdAt: "2026-08-05T09:59:00Z",
    data: {
      submissionId: "submission-1", formId: "form-belloria", formName: "Devis express",
      createdAt: "2026-08-05T09:58:00Z",
      fields: [
        { key: "question-name", label: "Nom", type: "INPUT_TEXT", value: "Camille Martin" },
        { key: "question-phone", label: "Téléphone", type: "PHONE_NUMBER", value: "06 12 34 56 78" },
        { key: "question-event", label: "Type d'événement", type: "MULTIPLE_CHOICE", value: "Mariage" },
        { key: "question-date", label: "Date de l'événement", type: "DATE", value: "2026-10-03" }
      ]
    },
    ...overrides
  };
}

async function tallyRequest(payload, secret = "tally-test-secret") {
  const body = JSON.stringify(payload);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))).toString("base64");
  return new Request("https://worker.test/webhooks/tally", {
    method: "POST", headers: { "content-type": "application/json", "tally-signature": signature }, body
  });
}

function telegramRequest(payload, secret = "webhook-secret") {
  return new Request("https://worker.test/webhooks/telegram", {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret },
    body: JSON.stringify(payload)
  });
}

function brevoWebhook(payload, token = "brevo-webhook-token") {
  return new Request("https://worker.test/webhooks/brevo-sms", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
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

test("extracts only complete Tally form response events", () => {
  assert.deepEqual(extractTallySubmission(tallyEvent()), {
    eventId: "event-1", submissionId: "submission-1", formId: "form-belloria",
    formName: "Devis express", createdAt: "2026-08-05T09:58:00Z",
    fields: [
      { key: "question-name", label: "Nom", type: "INPUT_TEXT", value: "Camille Martin" },
      { key: "question-phone", label: "Téléphone", type: "PHONE_NUMBER", value: "06 12 34 56 78" },
      { key: "question-event", label: "Type d'événement", type: "MULTIPLE_CHOICE", value: "Mariage" },
      { key: "question-date", label: "Date de l'événement", type: "DATE", value: "2026-10-03" }
    ]
  });
  assert.equal(extractTallySubmission({ eventType: "FORM_RESPONSE", data: {} }), null);
});

test("normalizes one French mobile and builds one safe GSM-7 acknowledgement", () => {
  assert.equal(normalizeFrenchMobile("06 12 34 56 78"), "33612345678");
  assert.equal(normalizeFrenchMobile("+33 7 12 34 56 78"), "33712345678");
  assert.equal(normalizeFrenchMobile("01 23 45 67 89"), null);
  assert.equal(tallySmsRecipient(tallyEvent().data.fields), "33612345678");
  assert.equal(tallySmsRecipient([
    { label: "Téléphone", value: "0612345678" }, { label: "Mobile", value: "0712345678" }
  ]), null);
  const content = tallySmsContent(tallyEvent().data.fields);
  assert.equal(content, "Bonjour Camille, votre Mariage du 3 octobre 2026 est bien note. Offre adaptee a vos informations. Une question ? Contactez-nous. Chaleureusement, Belloria");
  assert.ok(content.length <= 160);
  assert.match(content, /^[\x20-\x7E]+$/);
  assert.equal(tallySmsContent(tallyEvent().data.fields.filter((field) => field.type !== "DATE")), null);
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
    "belloria_channel_status", "belloria_list_commands", "belloria_list_tally_submissions",
    "belloria_get_tally_submission_fallback", "belloria_complete_tally_submission", "belloria_complete_command",
    "belloria_refresh_fast_snapshots", "belloria_propose_action",
    "belloria_consume_approved_action", "belloria_send_text"
  ]);
  assert.equal(JSON.stringify(response).includes("123456"), false);

  const status = await (await callMcp(toolCall(2, "belloria_channel_status"), env)).json();
  assert.deepEqual(JSON.parse(status.result.content[0].text), { provider: "telegram", configured: true, voice_transcription: true });
});

test("authenticates, filters and deduplicates direct Tally webhooks", async () => {
  const env = environment();
  const request = await tallyRequest(tallyEvent());
  const wrongSignature = new Request(request.url, { method: "POST", headers: { "tally-signature": "wrong" }, body: await request.clone().text() });
  assert.equal((await handleRequest(wrongSignature, env)).status, 401);

  const wrongForm = tallyEvent({ data: { ...tallyEvent().data, formId: "other-form" } });
  assert.equal((await handleRequest(await tallyRequest(wrongForm), env)).status, 403);

  assert.deepEqual(await (await handleRequest(await tallyRequest(tallyEvent()), env)).json(), { accepted: 1 });
  assert.deepEqual(await (await handleRequest(await tallyRequest(tallyEvent()), env)).json(), { accepted: 0 });
  assert.equal(env.DB.tally.size, 1);
});

test("acknowledges a newly persisted Tally submission on Telegram only once", async () => {
  const originalFetch = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://api.telegram.org/bottelegram-test-token/sendMessage");
    sent.push(JSON.parse(init.body));
    return Response.json({ ok: true, result: { message_id: 99 } });
  };
  try {
    const env = environment();
    const firstContext = executionContext();
    assert.deepEqual(await (await handleRequest(await tallyRequest(tallyEvent()), env, firstContext)).json(), { accepted: 1 });
    await firstContext.drain();

    const replayContext = executionContext();
    assert.deepEqual(await (await handleRequest(await tallyRequest(tallyEvent()), env, replayContext)).json(), { accepted: 0 });
    await replayContext.drain();

    assert.deepEqual(sent, [{
      chat_id: "123456",
      text: "Nouvelle demande Tally reçue. Traitement CRM en attente."
    }]);
  } finally { globalThis.fetch = originalFetch; }
});

test("sends one transactional SMS for a new Tally event and records the provider result", async () => {
  const originalFetch = globalThis.fetch;
  const smsCalls = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("api.telegram.org")) return Response.json({ ok: true, result: { message_id: 99 } });
    assert.equal(String(url), "https://api.brevo.com/v3/transactionalSMS/send");
    assert.equal(init.headers["api-key"], "brevo-test-key");
    smsCalls.push(JSON.parse(init.body));
    return Response.json({ messageId: 1511882900176220 });
  };
  try {
    const env = environment({ BREVO_API_KEY: "brevo-test-key", BREVO_SMS_SENDER: "Belloria" });
    const firstContext = executionContext();
    await handleRequest(await tallyRequest(tallyEvent()), env, firstContext);
    await firstContext.drain();
    const replayContext = executionContext();
    await handleRequest(await tallyRequest(tallyEvent()), env, replayContext);
    await replayContext.drain();

    assert.deepEqual(smsCalls, [{
      sender: "Belloria",
      recipient: "33612345678",
      content: "Bonjour Camille, votre Mariage du 3 octobre 2026 est bien note. Offre adaptee a vos informations. Une question ? Contactez-nous. Chaleureusement, Belloria",
      type: "transactional",
      unicodeEnabled: false
    }]);
    assert.equal(env.DB.tally.get("event-1").sms_status, "accepted");
    assert.equal(env.DB.tally.get("event-1").sms_provider_id, "1511882900176220");
    assert.equal(JSON.stringify(env.DB.tally.get("event-1")).includes("33612345678"), false);
  } finally { globalThis.fetch = originalFetch; }
});

test("authenticates Brevo delivery callbacks and updates the matching SMS only", async () => {
  const env = environment({ BREVO_WEBHOOK_TOKEN: "brevo-webhook-token" });
  env.DB.tally.set("event-1", { event_id: "event-1", state: "pending", sms_status: "accepted", sms_provider_id: "1511882900176220" });
  assert.equal((await handleRequest(brevoWebhook({ messageId: 1511882900176220, msg_status: "delivered" }, "wrong"), env)).status, 401);
  assert.deepEqual(await (await handleRequest(brevoWebhook({ messageId: 1511882900176220, msg_status: "delivered" }), env)).json(), { accepted: 1 });
  assert.equal(env.DB.tally.get("event-1").sms_status, "delivered");
  assert.deepEqual(await (await handleRequest(brevoWebhook({ messageId: 999, msg_status: "hard_bounce", to: "33600000000" }), env)).json(), { accepted: 0 });
  assert.equal(JSON.stringify(env.DB.tally.get("event-1")).includes("33600000000"), false);
});

test("keeps the Tally request pending when SMS cannot be sent", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /api\.telegram\.org/);
    return Response.json({ ok: true, result: { message_id: 99 } });
  };
  try {
    const env = environment();
    const context = executionContext();
    await handleRequest(await tallyRequest(tallyEvent()), env, context);
    await context.drain();
    const row = env.DB.tally.get("event-1");
    assert.equal(row.state, "pending");
    assert.equal(row.sms_status, "skipped");
    assert.equal(row.sms_error_code, "sms_not_configured");
  } finally { globalThis.fetch = originalFetch; }
});

test("lists Tally metadata, exposes one fallback payload and erases it after CRM completion", async () => {
  const env = environment();
  await handleRequest(await tallyRequest(tallyEvent()), env);

  const listed = await (await callMcp(toolCall(40, "belloria_list_tally_submissions", { limit: 10 }), env)).json();
  const submissions = JSON.parse(listed.result.content[0].text).submissions;
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].event_id, "event-1");
  assert.equal(submissions[0].sms_status, "pending");
  assert.equal("payload" in submissions[0], false);

  const fallback = await (await callMcp(toolCall(41, "belloria_get_tally_submission_fallback", { event_id: "event-1" }), env)).json();
  assert.equal(JSON.parse(fallback.result.content[0].text).payload.data.fields[0].value, "Camille Martin");

  const absent = await (await callMcp(toolCall(42, "belloria_get_tally_submission_fallback", { event_id: "missing" }), env)).json();
  assert.deepEqual(JSON.parse(absent.result.content[0].text), { found: false, event_id: "missing" });

  const denied = await (await callMcp(toolCall(43, "belloria_complete_tally_submission", { event_id: "event-1", confirmed: false }), env)).json();
  assert.equal(denied.error.message, "explicit confirmation is required");
  assert.notEqual(env.DB.tally.get("event-1").payload_json, null);

  const completed = await (await callMcp(toolCall(44, "belloria_complete_tally_submission", { event_id: "event-1", confirmed: true }), env)).json();
  assert.deepEqual(JSON.parse(completed.result.content[0].text), { completed: true });
  assert.equal(env.DB.tally.get("event-1").payload_json, null);

  const erased = await (await callMcp(toolCall(45, "belloria_get_tally_submission_fallback", { event_id: "event-1" }), env)).json();
  assert.deepEqual(JSON.parse(erased.result.content[0].text), { found: false, event_id: "event-1" });
});

test("refreshes temporary snapshots and completes a fast consultation in waitUntil", async () => {
  const originalFetch = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (_url, options) => {
    sent.push(JSON.parse(options.body));
    return Response.json({ ok: true, result: { message_id: 101 } });
  };
  try {
    const env = environment();
    const refreshed = await (await callMcp(toolCall(30, "belloria_refresh_fast_snapshots", {
      expires_in_minutes: 90,
      snapshots: [{
        prospect_id: "p-1", label: "Élodie — mariage", aliases: ["Élodie", "mariage Élodie"],
        summary: "Élodie : mariage, 80 convives, dossier qualifié.",
        recommendation: "Proposer le Cocktail validé.", actions: {},
        sources: ["crm:p-1", "tally:m-1"], generated_at: new Date().toISOString()
      }]
    }), env)).json();
    assert.deepEqual(JSON.parse(refreshed.result.content[0].text), { refreshed: 1, expires_in_minutes: 90 });

    const context = executionContext();
    const update = textUpdate({ update_id: 7100, message: { message_id: 90, chat: { id: 123456 }, text: "Résume Élodie" } });
    assert.deepEqual(await (await handleRequest(telegramRequest(update), env, context)).json(), { accepted: 1 });
    await context.drain();
    assert.equal(sent[0].text, "Élodie : mariage, 80 convives, dossier qualifié.");
    assert.equal(env.DB.rows.get("7100").state, "completed");
    assert.equal(env.DB.rows.get("7100").content, null);
    assert.equal(env.DB.rows.get("7100").fast_path_state, "replied");
  } finally { globalThis.fetch = originalFetch; }
});

test("entry forwards the execution context required by the deployed fast path", async () => {
  const originalFetch = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (_url, options) => {
    sent.push(JSON.parse(options.body).text);
    return Response.json({ ok: true, result: { message_id: 105 } });
  };
  try {
    const env = environment();
    env.DB.snapshots.set("p-entry", {
      prospect_id: "p-entry", label: "Nina — test", aliases_json: JSON.stringify(["Nina"]),
      summary: "Résumé via entry", recommendation: "Reco", actions_json: "{}", sources_json: "[]",
      expires_at: "2099-01-01T00:00:00Z", updated_at: new Date().toISOString()
    });
    const context = executionContext();
    const update = textUpdate({ update_id: 7150, message: { message_id: 95, chat: { id: 123456 }, text: "Résume Nina" } });
    const entrypoint = createWorkerEntrypoint({ fetch: async () => { throw new Error("OAuth must not handle Telegram"); } });
    const response = await entrypoint.fetch(telegramRequest(update), env, context);
    assert.deepEqual(await response.json(), { accepted: 1 });
    await context.drain();
    assert.deepEqual(sent, ["Résumé via entry"]);
    assert.equal(env.DB.rows.get("7150").fast_path_state, "replied");
  } finally { globalThis.fetch = originalFetch; }
});

test("routes a transcribed voice through the same fast path", async () => {
  const originalFetch = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith("/getFile")) return Response.json({ ok: true, result: { file_path: "voice/file.oga" } });
    if (String(url).includes("/file/bot")) return new Response(new Uint8Array([1, 2, 3]));
    sent.push(JSON.parse(options.body).text);
    return Response.json({ ok: true, result: { message_id: 104 } });
  };
  try {
    const env = environment({ AI: { run: async () => ({ text: "Résume Élodie" }) } });
    env.DB.snapshots.set("p-voice", {
      prospect_id: "p-voice", label: "Élodie — mariage", aliases_json: JSON.stringify(["Élodie"]),
      summary: "Résumé vocal rapide", recommendation: "Reco", actions_json: "{}", sources_json: "[]",
      expires_at: "2099-01-01T00:00:00Z", updated_at: new Date().toISOString()
    });
    const context = executionContext();
    await handleRequest(telegramRequest(voiceUpdate()), env, context);
    await context.drain();
    assert.deepEqual(sent, ["Résumé vocal rapide"]);
    assert.equal(env.DB.rows.get("7002").state, "completed");
    assert.equal(env.DB.rows.get("7002").voice_file_id, null);
  } finally { globalThis.fetch = originalFetch; }
});

test("defers absent, expired and ambiguous fast contexts without completing commands", async () => {
  const originalFetch = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (_url, options) => {
    sent.push(JSON.parse(options.body).text);
    return Response.json({ ok: true, result: { message_id: 102 } });
  };
  try {
    const env = environment();
    const first = executionContext();
    await handleRequest(telegramRequest(textUpdate({ update_id: 7200, message: { message_id: 91, chat: { id: 123456 }, text: "Résume Inconnu" } })), env, first);
    await first.drain();
    assert.equal(env.DB.rows.get("7200").state, "pending");
    assert.equal(env.DB.rows.get("7200").fast_path_error_code, "snapshot_absent");

    const base = { label: "Jean — dîner", aliases_json: JSON.stringify(["Jean"]), summary: "Résumé", recommendation: "Reco", actions_json: "{}", sources_json: "[]", updated_at: new Date().toISOString() };
    env.DB.snapshots.set("old", { prospect_id: "old", ...base, expires_at: "2020-01-01T00:00:00Z" });
    const second = executionContext();
    await handleRequest(telegramRequest(textUpdate({ update_id: 7201, message: { message_id: 92, chat: { id: 123456 }, text: "Résume Jean" } })), env, second);
    await second.drain();
    assert.equal(env.DB.rows.get("7201").fast_path_error_code, "snapshot_expired");

    env.DB.snapshots.set("fresh-1", { prospect_id: "fresh-1", ...base, expires_at: "2099-01-01T00:00:00Z" });
    env.DB.snapshots.set("fresh-2", { prospect_id: "fresh-2", ...base, label: "Jean — cocktail", expires_at: "2099-01-01T00:00:00Z" });
    const third = executionContext();
    await handleRequest(telegramRequest(textUpdate({ update_id: 7202, message: { message_id: 93, chat: { id: 123456 }, text: "Résume Jean" } })), env, third);
    await third.drain();
    assert.equal(env.DB.rows.get("7202").fast_path_error_code, "snapshot_ambiguous");
    assert.equal(sent.length, 3);
  } finally { globalThis.fetch = originalFetch; }
});

test("creates a traceable fast proposal without executing it", async () => {
  const originalFetch = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (_url, options) => {
    sent.push(JSON.parse(options.body).text);
    return Response.json({ ok: true, result: { message_id: 103 } });
  };
  try {
    const env = environment();
    env.DB.snapshots.set("p-2", {
      prospect_id: "p-2", label: "Lina — brunch", aliases_json: JSON.stringify(["Lina"]),
      summary: "Résumé", recommendation: "Reco",
      actions_json: JSON.stringify({ prepare_reply: { content: "Brouillon exact", consequence: "Créer un brouillon sans envoi" } }),
      sources_json: JSON.stringify(["crm:p-2"]), expires_at: "2099-01-01T00:00:00Z", updated_at: new Date().toISOString()
    });
    const context = executionContext();
    const update = textUpdate({ update_id: 7300, message: { message_id: 94, chat: { id: 123456 }, text: "Prépare une réponse Lina" } });
    await handleRequest(telegramRequest(update), env, context);
    await context.drain();
    assert.match(sent[0], /Brouillon exact/);
    assert.match(sent[0], /CONFIRMER [A-Z0-9]+/);
    assert.equal(env.DB.actions.size, 1);
    assert.equal(env.DB.rows.get("7300").state, "completed");
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
