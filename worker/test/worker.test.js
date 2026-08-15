import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import { createWorkerEntrypoint, extractTallySubmission, extractTelegramCommand, handleRequest, normalizeFrenchMobile, oauthApiHandler, oauthDefaultHandler, tallySmsContent, tallySmsRecipient, tallyTelegramContent } from "../src/index.js";

globalThis.crypto ||= webcrypto;

class FakeDb {
  constructor() { this.rows = new Map(); this.actions = new Map(); this.externalActions = new Map(); this.codexSmsActions = new Map(); this.snapshots = new Map(); this.tally = new Map(); }

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
    if (sql.startsWith("INSERT INTO codex_sms_actions")) {
      const [action_id, idempotency_key, recipient, content, consent_reference, content_hash, modifier] = args;
      if (this.codexSmsActions.has(idempotency_key)) return { meta: { changes: 0 } };
      const minutes = Number(String(modifier).match(/\d+/)?.[0] || 30);
      const row = {
        action_id, idempotency_key, recipient, content, consent_reference, content_hash,
        state: "pending", created_at: new Date().toISOString(), expires_at: new Date(Date.now() + minutes * 60000).toISOString(),
        confirmed_at: null, claimed_at: null, dispatch_started_at: null, finished_at: null,
        provider_message_id: null, provider_http_status: null, provider_error_code: null
      };
      this.codexSmsActions.set(idempotency_key, row);
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith("UPDATE codex_sms_actions SET state = 'expired'")) {
      const row = [...this.codexSmsActions.values()].find((item) => item.action_id === args[0]);
      if (!row || row.state !== "pending" || new Date(row.expires_at) > new Date()) return { meta: { changes: 0 } };
      row.state = "expired";
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith("UPDATE codex_sms_actions SET state = 'claimed'")) {
      const row = [...this.codexSmsActions.values()].find((item) => item.action_id === args[0]);
      if (!row || row.state !== "pending" || new Date(row.expires_at) <= new Date()) return { meta: { changes: 0 } };
      Object.assign(row, { state: "claimed", confirmed_at: new Date().toISOString(), claimed_at: new Date().toISOString() });
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith("UPDATE codex_sms_actions SET dispatch_started_at")) {
      const row = [...this.codexSmsActions.values()].find((item) => item.action_id === args[0]);
      if (!row || row.state !== "claimed" || row.dispatch_started_at) return { meta: { changes: 0 } };
      row.dispatch_started_at = new Date().toISOString();
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith("UPDATE codex_sms_actions SET state = ?")) {
      const [state, messageId, httpStatus, errorCode, actionId] = args;
      const row = [...this.codexSmsActions.values()].find((item) => item.action_id === actionId);
      if (!row || row.state !== "claimed") return { meta: { changes: 0 } };
      Object.assign(row, {
        state, finished_at: new Date().toISOString(), provider_message_id: messageId,
        provider_http_status: httpStatus, provider_error_code: errorCode
      });
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith("INSERT INTO tally_submissions")) {
      const [event_id, submission_id, form_id, form_name, submitted_at, payload_json] = args;
      if (this.tally.has(event_id) || [...this.tally.values()].some((row) => row.submission_id === submission_id)) return { meta: { changes: 0 } };
      this.tally.set(event_id, { event_id, submission_id, form_id, form_name, submitted_at, payload_json, state: "pending", sms_status: "pending", created_at: "2026-08-05T10:00:00Z" });
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith("UPDATE tally_submissions SET sms_status")) {
      if (sql.includes("OR (event_id")) {
        const [sms_status, messageId, sms_error_code, providerMessageId, eventId] = args;
        const row = [...this.tally.values()].find((item) => item.sms_provider_id === providerMessageId)
          || (this.tally.get(eventId)?.sms_status === "pending" ? this.tally.get(eventId) : null);
        if (!row
          || (sms_status === "accepted" && row.sms_status !== "pending")
          || (sms_status === "failed" && !["pending", "accepted"].includes(row.sms_status))
          || (sms_status === "delivered" && !["pending", "accepted", "failed"].includes(row.sms_status))) return { meta: { changes: 0 } };
        Object.assign(row, { sms_status, sms_provider_id: row.sms_provider_id || messageId, sms_error_code, sms_updated_at: new Date().toISOString() });
        return { meta: { changes: 1 } };
      }
      if (sql.includes("WHERE sms_provider_id")) {
        const [sms_status, sms_error_code, messageId] = args;
        const row = [...this.tally.values()].find((item) => item.sms_provider_id === messageId);
        if (!row
          || (sms_status === "accepted" && row.sms_status !== "pending")
          || (sms_status === "failed" && !["pending", "accepted"].includes(row.sms_status))
          || (sms_status === "delivered" && !["pending", "accepted", "failed"].includes(row.sms_status))) return { meta: { changes: 0 } };
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

    if (sql.startsWith("INSERT INTO external_actions")) {
      const [action_id, creation_key, source_type, source_id, action_type, target_json, payload_json, content_hash, confirmation_token, approval_text, modifier] = args;
      if (!this.rows.has(source_id) || [...this.externalActions.values()].some((row) => row.creation_key === creation_key)) return { meta: { changes: 0 } };
      const minutes = Number(String(modifier).match(/\d+/)?.[0] || 10);
      this.externalActions.set(action_id, {
        action_id, creation_key, source_type, source_id, action_type, target_json, payload_json, content_hash, confirmation_token, approval_text,
        state: "pending", created_at: new Date().toISOString(), expires_at: new Date(Date.now() + minutes * 60000).toISOString(),
        presented_at: null, presentation_message_id: null, presentation_chat_id: null,
        approved_at: null, approval_command_id: null, approval_message_id: null, approval_chat_id: null, claimed_at: null,
        dispatch_started_at: null, finished_at: null, provider_message_id: null, provider_thread_id: null, provider_resource_id: null, provider_http_status: null, provider_error_code: null
      });
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith("UPDATE external_actions SET state = 'expired'")) {
      const byToken = sql.includes("confirmation_token");
      const value = args[0];
      let changes = 0;
      for (const row of this.externalActions.values()) {
        if ((byToken ? row.confirmation_token : row.action_id) !== value || row.state !== "pending" || new Date(row.expires_at) > new Date()) continue;
        row.state = "expired";
        changes += 1;
      }
      return { meta: { changes } };
    }

    if (sql.startsWith("UPDATE external_actions SET presented_at")) {
      const [messageId, chatId, actionId] = args;
      const row = this.externalActions.get(actionId);
      if (!row || row.state !== "pending" || row.presentation_message_id !== null) return { meta: { changes: 0 } };
      Object.assign(row, { presented_at: new Date().toISOString(), presentation_message_id: messageId, presentation_chat_id: chatId });
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith("UPDATE external_actions SET dispatch_started_at")) {
      const [actionId] = args;
      const row = this.externalActions.get(actionId);
      if (!row || row.state !== "claimed" || row.dispatch_started_at !== null) return { meta: { changes: 0 } };
      row.dispatch_started_at = new Date().toISOString();
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith("UPDATE external_actions SET state = 'succeeded'")) {
      if (sql.includes("provider_resource_id")) {
        const [resourceId, httpStatus, actionId] = args;
        const row = this.externalActions.get(actionId);
        if (!row || row.state !== "claimed" || !row.dispatch_started_at) return { meta: { changes: 0 } };
        Object.assign(row, { state: "succeeded", finished_at: new Date().toISOString(), provider_resource_id: resourceId, provider_http_status: httpStatus });
        return { meta: { changes: 1 } };
      }
      const [messageId, threadId, httpStatus, actionId] = args;
      const row = this.externalActions.get(actionId);
      if (!row || row.state !== "claimed" || !row.dispatch_started_at) return { meta: { changes: 0 } };
      Object.assign(row, { state: "succeeded", finished_at: new Date().toISOString(), provider_message_id: messageId, provider_thread_id: threadId, provider_http_status: httpStatus });
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith("UPDATE external_actions SET state = 'failed'")) {
      const [errorCode, httpStatus, actionId] = args;
      const row = this.externalActions.get(actionId);
      const afterDispatch = sql.includes("dispatch_started_at IS NOT NULL");
      if (!row || row.state !== "claimed" || Boolean(row.dispatch_started_at) !== afterDispatch) return { meta: { changes: 0 } };
      Object.assign(row, { state: "failed", finished_at: new Date().toISOString(), provider_error_code: errorCode, provider_http_status: httpStatus });
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith("UPDATE external_actions SET state = 'unknown'")) {
      const staleCode = /provider_error_code = '([^']+_dispatch_abandoned)'/.exec(sql)?.[1] || null;
      const staleOnly = Boolean(staleCode);
      const actionId = staleOnly ? args[0] : args[2];
      const row = this.externalActions.get(actionId);
      if (!row || row.state !== "claimed" || !row.dispatch_started_at) return { meta: { changes: 0 } };
      if (staleOnly && Date.parse(row.dispatch_started_at) > Date.now() - 2 * 60000) return { meta: { changes: 0 } };
      Object.assign(row, {
        state: "unknown", finished_at: new Date().toISOString(),
        provider_error_code: staleOnly ? staleCode : args[0],
        provider_http_status: staleOnly ? null : args[1]
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
    if (sql.startsWith("SELECT * FROM codex_sms_actions WHERE idempotency_key")) {
      const row = this.codexSmsActions.get(args[0]);
      return { results: row ? [{ ...row }] : [] };
    }
    if (sql.startsWith("SELECT * FROM codex_sms_actions WHERE action_id")) {
      const row = [...this.codexSmsActions.values()].find((item) => item.action_id === args[0]);
      return { results: row ? [{ ...row }] : [] };
    }
    if (sql.startsWith("SELECT * FROM external_actions WHERE creation_key")) {
      const row = [...this.externalActions.values()].find((item) => item.creation_key === args[0]);
      return { results: row ? [{ ...row }] : [] };
    }
    if (sql.startsWith("SELECT * FROM external_actions WHERE action_id")) {
      const row = this.externalActions.get(args[0]);
      return { results: row ? [{ ...row }] : [] };
    }
    if (sql.startsWith("UPDATE external_actions SET state = 'approved'")) {
      const [commandId, messageId, chatId, token] = args;
      const row = [...this.externalActions.values()].find((item) => item.confirmation_token === token);
      if (!row || row.state !== "pending" || new Date(row.expires_at) <= new Date() || !row.presentation_message_id) return { results: [] };
      Object.assign(row, { state: "approved", approved_at: new Date().toISOString(), approval_command_id: commandId, approval_message_id: messageId, approval_chat_id: chatId });
      return { results: [{ action_id: row.action_id }] };
    }
    if (sql.startsWith("UPDATE external_actions SET state = 'claimed'")) {
      const [actionId] = args;
      const row = this.externalActions.get(actionId);
      if (!row || row.state !== "approved") return { results: [] };
      Object.assign(row, { state: "claimed", claimed_at: new Date().toISOString() });
      return { results: [{ action_id: row.action_id, state: row.state, claimed_at: row.claimed_at }] };
    }
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

function codexSmsProposalRequest(body, token = "codex-sms-token") {
  return new Request("https://worker.test/internal/codex-sms/proposals", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

function codexSmsExecuteRequest(body, token = "codex-sms-token") {
  return new Request("https://worker.test/internal/codex-sms/execute", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body)
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

async function mcpValue(env, id, name, args) {
  const response = await (await callMcp(toolCall(id, name, args), env)).json();
  if (response.error) throw new Error(response.error.message);
  return JSON.parse(response.result.content[0].text);
}

async function createRegistryAction(env, overrides = {}) {
  return mcpValue(env, 100, "belloria_create_external_action", {
    source_type: "telegram_command",
    source_id: "7001",
    action_type: "gmail.send",
    target: { recipients: ["camille@example.test"], account: "belloria" },
    payload: { text: "Bonjour Camille", subject: "Votre demande" },
    expires_in_minutes: 10,
    ...overrides
  });
}

function gmailActionRequest(path, body) {
  return new Request(`https://worker.test/gpt-actions/gmail/${path}`, {
    method: "POST",
    headers: { authorization: "Bearer action-secret", "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

function notionActionRequest(method, body) {
  return new Request("https://worker.test/gpt-actions/notion/page", {
    method,
    headers: { authorization: "Bearer action-secret", "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

function notionExecuteRequest(body) {
  return new Request("https://worker.test/gpt-actions/notion/execute", {
    method: "POST",
    headers: { authorization: "Bearer action-secret", "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function createApprovedGmailAction(env, overrides = {}) {
  await handleRequest(telegramRequest(textUpdate()), env);
  const proposed = await handleRequest(gmailActionRequest("send", {
    source_id: "7001", to: "camille@example.test", subject: "Votre demande", text: "Bonjour Camille", ...overrides
  }), env);
  assert.equal(proposed.status, 201);
  const action = await proposed.json();
  const token = env.DB.externalActions.get(action.action_id).confirmation_token;
  await handleRequest(telegramRequest(textUpdate({
    update_id: 7002,
    message: { message_id: 82, chat: { id: 123456 }, text: `CONFIRMER ${token}` }
  })), env);
  assert.equal(env.DB.externalActions.get(action.action_id).state, "approved");
  return action;
}

async function createApprovedNotionAction(env, overrides = {}) {
  const sourceId = String(overrides.source_id || "7001");
  const method = overrides.method || "POST";
  const pageId = overrides.page_id || "b55c9c91-384d-452b-81db-d1ef79372b75";
  const properties = overrides.properties || { Nom: { title: [{ text: { content: "Camille Martin" } }] } };
  await handleRequest(telegramRequest(textUpdate({
    update_id: Number(sourceId), message: { message_id: Number(sourceId) - 6920, chat: { id: 123456 }, text: "Prépare la mutation CRM" }
  })), env);
  const body = method === "POST" ? { source_id: sourceId, properties }
    : method === "PATCH" ? { source_id: sourceId, page_id: pageId, properties }
      : { source_id: sourceId, page_id: pageId };
  const proposed = await handleRequest(notionActionRequest(method, body), env);
  assert.equal(proposed.status, 201);
  const action = await proposed.json();
  const token = env.DB.externalActions.get(action.action_id).confirmation_token;
  const confirmationId = Number(sourceId) + 100;
  await handleRequest(telegramRequest(textUpdate({
    update_id: confirmationId,
    message: { message_id: confirmationId - 6920, chat: { id: 123456 }, text: `CONFIRMER ${token}` }
  })), env);
  assert.equal(env.DB.externalActions.get(action.action_id).state, "approved");
  return action;
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
  assert.equal(content, "Bonjour Camille, merci pour votre demande. Votre mariage du 3 octobre 2026 est enregistre. Nous vous recontacterons rapidement. Cyndy & Dimitri, Belloria");
  assert.ok(content.length <= 160);
  assert.match(content, /^[\x20-\x7E]+$/);
  assert.equal(tallySmsContent(tallyEvent().data.fields.filter((field) => field.type !== "DATE")), null);
});

test("builds a Telegram Tally summary without contact details", () => {
  const fields = [
    ...tallyEvent().data.fields,
    { label: "Email", type: "EMAIL", value: "camille@example.test" },
    { label: "Nombre d'invités", type: "NUMBER", value: "80" },
    { label: "Votre budget", type: "INPUT_TEXT", value: "3 000 €" }
  ];
  const content = tallyTelegramContent({ formName: "Devis express", fields });
  assert.equal(content, "Nouvelle demande Tally — Devis express\nNom : Camille Martin\nType d'événement : Mariage\nDate de l'événement : 2026-10-03\nNombre d'invités : 80\nVotre budget : 3 000 €");
  assert.equal(content.includes("06 12 34 56 78"), false);
  assert.equal(content.includes("camille@example.test"), false);
});

test("builds the acknowledgement from the current production Tally labels", () => {
  const fields = [
    { label: "Votre nom et prénom", type: "INPUT_TEXT", value: "Cyndy Hernandez" },
    { label: "Télephone", type: "INPUT_PHONE_NUMBER", value: "+33612345678" },
    {
      label: "Quel type d'évènement envisagez-vous?",
      type: "MULTIPLE_CHOICE",
      value: ["anniversaire-option-id"],
      options: [{ id: "anniversaire-option-id", text: "Anniversaire🎂" }]
    },
    { label: "Date de votre évènement", type: "INPUT_DATE", value: "2027-03-16" }
  ];

  assert.equal(tallySmsRecipient(fields), "33612345678");
  assert.equal(tallySmsContent(fields), "Bonjour Cyndy, merci pour votre demande. Votre anniversaire du 16 mars 2027 est enregistre. Nous vous recontacterons rapidement. Cyndy & Dimitri, Belloria");
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
    "belloria_refresh_fast_snapshots", "belloria_create_external_action", "belloria_present_external_action",
    "belloria_get_external_action", "belloria_claim_external_action", "belloria_propose_action",
    "belloria_consume_approved_action", "belloria_send_text"
  ]);
  assert.equal(JSON.stringify(response).includes("123456"), false);

  const status = await (await callMcp(toolCall(2, "belloria_channel_status"), env)).json();
  assert.deepEqual(JSON.parse(status.result.content[0].text), { provider: "telegram", configured: true, voice_transcription: true });
});

test("creates an immutable external action from one persisted source and rejects altered replays", async () => {
  const env = environment();
  await handleRequest(telegramRequest(textUpdate()), env);

  const created = await createRegistryAction(env);
  assert.equal(created.created, true);
  assert.match(created.action_id, /^[0-9a-f-]{36}$/);
  assert.equal(env.DB.externalActions.size, 1);
  const row = env.DB.externalActions.get(created.action_id);
  assert.equal(row.source_type, "telegram_command");
  assert.equal(row.source_id, "7001");
  assert.equal(row.target_json, '{"account":"belloria","recipients":["camille@example.test"]}');
  assert.equal(row.payload_json, '{"subject":"Votre demande","text":"Bonjour Camille"}');
  assert.match(row.content_hash, /^[0-9a-f]{64}$/);

  const replay = await createRegistryAction(env, {
    target: { account: "belloria", recipients: ["camille@example.test"] },
    payload: { subject: "Votre demande", text: "Bonjour Camille" }
  });
  assert.deepEqual(replay, { created: false, action_id: created.action_id, state: "pending", expires_at: row.expires_at });
  assert.equal(env.DB.externalActions.size, 1);

  const conflict = await (await callMcp(toolCall(101, "belloria_create_external_action", {
    source_type: "telegram_command", source_id: "7001", action_type: "gmail.send",
    target: { account: "belloria", recipients: ["camille@example.test"] },
    payload: { subject: "Votre demande", text: "Texte différent" }
  }), env)).json();
  assert.equal(conflict.error.message, "idempotency_conflict");
  assert.equal(env.DB.externalActions.size, 1);
  assert.equal(env.DB.externalActions.get(created.action_id).payload_json, row.payload_json);

  const missing = await (await callMcp(toolCall(102, "belloria_create_external_action", {
    source_type: "telegram_command", source_id: "9999", action_type: "gmail.send", target: {}, payload: {}
  }), env)).json();
  assert.equal(missing.error.message, "source_id must identify an existing telegram command");
});

test("presents the persisted external action and approves it only from an allowlisted exact Telegram token", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), body: JSON.parse(options.body) });
    return Response.json({ ok: true, result: { message_id: 501 } });
  };
  try {
    const env = environment();
    await handleRequest(telegramRequest(textUpdate()), env);
    const created = await createRegistryAction(env);
    const row = env.DB.externalActions.get(created.action_id);

    const pendingClaim = await mcpValue(env, 103, "belloria_claim_external_action", { action_id: created.action_id });
    assert.deepEqual(pendingClaim, { claimed: false, action_id: created.action_id });

    const presented = await mcpValue(env, 104, "belloria_present_external_action", { action_id: created.action_id });
    assert.deepEqual(presented, { found: true, presented: true, action_id: created.action_id, state: "pending", message_id: 501 });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.telegram.org/bottelegram-test-token/sendMessage");
    assert.equal(calls[0].body.chat_id, "123456");
    assert.match(calls[0].body.text, /Cible exacte : {"account":"belloria","recipients":\["camille@example\.test"\]}/);
    assert.match(calls[0].body.text, new RegExp(`CONFIRMER ${row.confirmation_token}`));
    assert.equal(calls.some((call) => /gmail\.googleapis\.com|api\.notion\.com/.test(call.url)), false);

    const wrong = textUpdate({ update_id: 7003, message: { message_id: 83, chat: { id: 123456 }, text: "CONFIRMER ABCDEF123456" } });
    await handleRequest(telegramRequest(wrong), env);
    assert.equal(row.state, "pending");

    const confirmation = textUpdate({ update_id: 7004, message: { message_id: 84, chat: { id: 123456 }, text: `CONFIRMER ${row.confirmation_token}` } });
    await handleRequest(telegramRequest(confirmation), env);
    assert.equal(row.state, "approved");
    assert.equal(row.approval_command_id, "7004");
    assert.equal(row.approval_message_id, "84");
    assert.equal(row.approval_chat_id, "123456");
    assert.equal(env.DB.rows.get("7004").state, "completed");
    assert.equal(env.DB.rows.get("7004").content, null);

    const duplicate = textUpdate({ update_id: 7005, message: { message_id: 85, chat: { id: 123456 }, text: `CONFIRMER ${row.confirmation_token}` } });
    await handleRequest(telegramRequest(duplicate), env);
    assert.equal(row.state, "approved");
    assert.equal(row.approval_command_id, "7004");
  } finally { globalThis.fetch = originalFetch; }
});

test("expires a pending external action and allows exactly one concurrent claim after approval", async () => {
  const env = environment();
  await handleRequest(telegramRequest(textUpdate()), env);
  const expired = await createRegistryAction(env);
  const expiredRow = env.DB.externalActions.get(expired.action_id);
  expiredRow.expires_at = "2020-01-01T00:00:00Z";
  const expiredConfirmation = textUpdate({ update_id: 7006, message: { message_id: 86, chat: { id: 123456 }, text: `CONFIRMER ${expiredRow.confirmation_token}` } });
  await handleRequest(telegramRequest(expiredConfirmation), env);
  assert.equal(expiredRow.state, "expired");
  assert.equal(expiredRow.approved_at, null);

  const nextSource = textUpdate({ update_id: 7007, message: { message_id: 87, chat: { id: 123456 }, text: "Prépare une nouvelle action" } });
  await handleRequest(telegramRequest(nextSource), env);
  const action = await createRegistryAction(env, { source_id: "7007", target: { account: "belloria", recipients: ["louise@example.test"] } });
  const row = env.DB.externalActions.get(action.action_id);
  Object.assign(row, {
    presentation_message_id: "502", presentation_chat_id: "123456", presented_at: new Date().toISOString()
  });
  const confirmation = textUpdate({ update_id: 7008, message: { message_id: 88, chat: { id: 123456 }, text: `CONFIRMER ${row.confirmation_token}` } });
  await handleRequest(telegramRequest(confirmation), env);
  assert.equal(row.state, "approved");

  const claims = await Promise.all([
    mcpValue(env, 105, "belloria_claim_external_action", { action_id: action.action_id }),
    mcpValue(env, 106, "belloria_claim_external_action", { action_id: action.action_id })
  ]);
  assert.equal(claims.filter((claim) => claim.claimed).length, 1);
  assert.equal(row.state, "claimed");
  const replay = await mcpValue(env, 107, "belloria_claim_external_action", { action_id: action.action_id });
  assert.deepEqual(replay, { claimed: false, action_id: action.action_id });

  const read = await mcpValue(env, 108, "belloria_get_external_action", { action_id: action.action_id });
  assert.deepEqual(read.action.payload, { subject: "Votre demande", text: "Bonjour Camille" });
  assert.deepEqual(read.action.source, { type: "telegram_command", id: "7007" });
  assert.match(read.action.approval_text, /Contenu exact : {"subject":"Votre demande","text":"Bonjour Camille"}/);
  assert.equal(read.action.state, "claimed");
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
      text: "Nouvelle demande Tally — Devis express\nNom : Camille Martin\nType d'événement : Mariage\nDate de l'événement : 2026-10-03"
    }]);
  } finally { globalThis.fetch = originalFetch; }
});

test("sends Tally notifications to the configured group without changing the private command chat", async () => {
  const originalFetch = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (_url, init) => {
    sent.push(JSON.parse(init.body));
    return Response.json({ ok: true, result: { message_id: 99 } });
  };
  try {
    const env = environment({ TELEGRAM_NOTIFICATION_CHAT_ID: "-1001234567890" });
    const context = executionContext();
    await handleRequest(await tallyRequest(tallyEvent()), env, context);
    await context.drain();
    assert.equal(sent[0].chat_id, "-1001234567890");
    assert.equal(env.TELEGRAM_ALLOWED_CHAT_ID, "123456");
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
      content: "Bonjour Camille, merci pour votre demande. Votre mariage du 3 octobre 2026 est enregistre. Nous vous recontacterons rapidement. Cyndy & Dimitri, Belloria",
      type: "transactional",
      tag: "event-1",
      unicodeEnabled: false
    }]);
    assert.equal(env.DB.tally.get("event-1").sms_status, "accepted");
    assert.equal(env.DB.tally.get("event-1").sms_provider_id, "1511882900176220");
    assert.equal(JSON.stringify(env.DB.tally.get("event-1")).includes("33612345678"), false);
  } finally { globalThis.fetch = originalFetch; }
});

test("proposes and sends one confirmed Codex marketing SMS without touching the Tally flow", async () => {
  const originalFetch = globalThis.fetch;
  const smsCalls = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://api.brevo.com/v3/transactionalSMS/send");
    smsCalls.push(JSON.parse(init.body));
    return Response.json({ messageId: 1511882900176221 }, { status: 201 });
  };
  try {
    const env = environment({ CODEX_SMS_TOKEN: "codex-sms-token", BREVO_API_KEY: "brevo-test-key", BREVO_SMS_SENDER: "Belloria" });
    const body = {
      recipient: "06 12 34 56 78",
      content: "Bonjour Damien, Belloria vous accompagne pour votre evenement. Repondez OUI pour recevoir notre proposition. STOP au [STOP_CODE]",
      consent_reference: "tally-sms-opt-in-2026-08-15",
      idempotency_key: "damien-follow-up-20260815"
    };
    assert.equal((await handleRequest(codexSmsProposalRequest(body, "wrong"), env)).status, 401);
    assert.equal((await handleRequest(codexSmsProposalRequest({ ...body, content: "Bonjour Damien" }), env)).status, 400);

    const proposed = await handleRequest(codexSmsProposalRequest(body), env);
    assert.equal(proposed.status, 201);
    const proposal = await proposed.json();
    assert.equal(proposal.action.state, "pending");
    assert.equal(smsCalls.length, 0);

    const replayProposal = await handleRequest(codexSmsProposalRequest(body), env);
    assert.equal(replayProposal.status, 200);
    assert.equal((await replayProposal.json()).action.action_id, proposal.action.action_id);
    assert.equal((await handleRequest(codexSmsProposalRequest({ ...body, content: "Bonjour Damien STOP au [STOP_CODE]" }), env)).status, 409);
    assert.equal((await handleRequest(codexSmsExecuteRequest({ action_id: proposal.action.action_id, recipient: "33600000000" }), env)).status, 400);

    const [first, second] = await Promise.all([
      handleRequest(codexSmsExecuteRequest({ action_id: proposal.action.action_id }), env),
      handleRequest(codexSmsExecuteRequest({ action_id: proposal.action.action_id }), env)
    ]);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(smsCalls.length, 1);
    assert.deepEqual(smsCalls[0], {
      sender: "Belloria",
      recipient: "33612345678",
      content: body.content,
      type: "marketing",
      tag: `codex-sms:${proposal.action.action_id}`,
      unicodeEnabled: false
    });
    const row = env.DB.codexSmsActions.get(body.idempotency_key);
    assert.equal(row.state, "succeeded");
    assert.equal(row.provider_message_id, "1511882900176221");
    assert.equal(env.DB.tally.size, 0);

    const replay = await handleRequest(codexSmsExecuteRequest({ action_id: proposal.action.action_id }), env);
    assert.equal((await replay.json()).sent, true);
    assert.equal(smsCalls.length, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("marks an uncertain Codex SMS dispatch unknown and never retries it automatically", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("temporary provider failure");
  };
  try {
    const env = environment({ CODEX_SMS_TOKEN: "codex-sms-token", BREVO_API_KEY: "brevo-test-key", BREVO_SMS_SENDER: "Belloria" });
    const proposed = await handleRequest(codexSmsProposalRequest({
      recipient: "+33612345678",
      content: "Bonjour Damien, votre demande est bien recue. STOP au [STOP_CODE]",
      consent_reference: "tally-sms-opt-in-2026-08-15",
      idempotency_key: "damien-uncertain-20260815"
    }), env);
    const { action } = await proposed.json();
    const first = await handleRequest(codexSmsExecuteRequest({ action_id: action.action_id }), env);
    assert.equal((await first.json()).action.state, "unknown");
    const replay = await handleRequest(codexSmsExecuteRequest({ action_id: action.action_id }), env);
    assert.equal((await replay.json()).action.state, "unknown");
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("records a sanitized Brevo HTTP failure without losing the Tally request", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => String(url).includes("api.telegram.org")
    ? Response.json({ ok: true, result: { message_id: 99 } })
    : Response.json({ code: "not_enough_credits", message: "sensitive provider detail" }, { status: 402 });
  try {
    const env = environment({ BREVO_API_KEY: "brevo-test-key", BREVO_SMS_SENDER: "Belloria" });
    const context = executionContext();
    await handleRequest(await tallyRequest(tallyEvent()), env, context);
    await context.drain();

    const row = env.DB.tally.get("event-1");
    assert.equal(row.state, "pending");
    assert.equal(row.sms_status, "failed");
    assert.equal(row.sms_error_code, "brevo_http_402");
    assert.equal(JSON.stringify(row).includes("sensitive provider detail"), false);
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

test("applies monotone Brevo callback transitions and leaves rejected replays untouched", async () => {
  const env = environment({ BREVO_WEBHOOK_TOKEN: "brevo-webhook-token" });
  const row = { event_id: "event-1", state: "pending", sms_status: "pending", sms_provider_id: "1511882900176220", sms_updated_at: "2026-08-09T10:00:00.000Z" };
  env.DB.tally.set("event-1", row);

  assert.deepEqual(await (await handleRequest(brevoWebhook({ messageId: 1511882900176220, msg_status: "accepted" }), env)).json(), { accepted: 1 });
  assert.equal(row.sms_status, "accepted");
  const acceptedAt = row.sms_updated_at;
  assert.deepEqual(await (await handleRequest(brevoWebhook({ messageId: 1511882900176220, msg_status: "accepted" }), env)).json(), { accepted: 0 });
  assert.equal(row.sms_updated_at, acceptedAt);

  assert.deepEqual(await (await handleRequest(brevoWebhook({ messageId: 1511882900176220, msg_status: "hard_bounce" }), env)).json(), { accepted: 1 });
  assert.equal(row.sms_status, "failed");
  const failedAt = row.sms_updated_at;
  assert.deepEqual(await (await handleRequest(brevoWebhook({ messageId: 1511882900176220, msg_status: "hard_bounce" }), env)).json(), { accepted: 0 });
  assert.deepEqual(await (await handleRequest(brevoWebhook({ messageId: 1511882900176220, msg_status: "accepted" }), env)).json(), { accepted: 0 });
  assert.equal(row.sms_status, "failed");
  assert.equal(row.sms_updated_at, failedAt);

  assert.deepEqual(await (await handleRequest(brevoWebhook({ messageId: 1511882900176220, msg_status: "delivered" }), env)).json(), { accepted: 1 });
  assert.equal(row.sms_status, "delivered");
  const deliveredAt = row.sms_updated_at;
  assert.deepEqual(await (await handleRequest(brevoWebhook({ messageId: 1511882900176220, msg_status: "delivered" }), env)).json(), { accepted: 0 });
  assert.deepEqual(await (await handleRequest(brevoWebhook({ messageId: 1511882900176220, msg_status: "accepted" }), env)).json(), { accepted: 0 });
  assert.deepEqual(await (await handleRequest(brevoWebhook({ messageId: 1511882900176220, msg_status: "hard_bounce" }), env)).json(), { accepted: 0 });
  assert.equal(row.sms_status, "delivered");
  assert.equal(row.sms_updated_at, deliveredAt);
});

test("matches an early Brevo callback through the Tally event tag", async () => {
  const env = environment({ BREVO_WEBHOOK_TOKEN: "brevo-webhook-token" });
  env.DB.tally.set("event-1", { event_id: "event-1", state: "pending", sms_status: "pending", sms_provider_id: null });

  assert.deepEqual(await (await handleRequest(brevoWebhook({
    messageId: 1511882900176220,
    msg_status: "delivered",
    tag: ["event-1"]
  }), env)).json(), { accepted: 1 });
  assert.equal(env.DB.tally.get("event-1").sms_status, "delivered");
  assert.equal(env.DB.tally.get("event-1").sms_provider_id, "1511882900176220");
  const deliveredAt = env.DB.tally.get("event-1").sms_updated_at;
  assert.deepEqual(await (await handleRequest(brevoWebhook({
    messageId: 999,
    msg_status: "hard_bounce",
    tag: ["event-1"]
  }), env)).json(), { accepted: 0 });
  assert.equal(env.DB.tally.get("event-1").sms_status, "delivered");
  assert.equal(env.DB.tally.get("event-1").sms_updated_at, deliveredAt);
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

test("entry routes the protected Codex SMS API before OAuth", async () => {
  let oauthCalls = 0;
  const entrypoint = createWorkerEntrypoint({ fetch: async () => {
    oauthCalls += 1;
    return new Response("oauth");
  } });
  const response = await entrypoint.fetch(codexSmsProposalRequest({
    recipient: "+33612345678",
    content: "Bonjour Damien",
    consent_reference: "tally-sms-opt-in",
    idempotency_key: "entrypoint-probe-20260815"
  }), environment({ CODEX_SMS_TOKEN: "codex-sms-token" }));
  assert.equal(response.status, 400);
  assert.equal(oauthCalls, 0);
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

test("exposes a public action schema and protects every private GPT action", async () => {
  const schema = await handleRequest(new Request("https://worker.test/gpt-actions/openapi.json"), environment());
  assert.equal(schema.status, 200);
  assert.equal((await schema.json()).openapi, "3.1.0");

  const denied = await handleRequest(new Request("https://worker.test/gpt-actions/status"), environment({ GPT_ACTIONS_TOKEN: "action-secret" }));
  assert.equal(denied.status, 401);

  const granted = await handleRequest(new Request("https://worker.test/gpt-actions/status", { headers: { authorization: "Bearer action-secret" } }), environment({ GPT_ACTIONS_TOKEN: "action-secret", NOTION_TOKEN: "notion-secret" }));
  assert.deepEqual(await granted.json(), { gmail_read_send: false, notion_crm: false, email_sending: true });
});

test("reads Gmail metadata through the private Action without sending mail", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url) === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "access-token", scope: "https://www.googleapis.com/auth/gmail.readonly" });
    if (String(url).includes("/messages?") && !String(url).includes("/messages/message-1")) return Response.json({ messages: [{ id: "message-1", threadId: "thread-1" }] });
    if (String(url).includes("/messages/message-1")) return Response.json({ snippet: "Bonjour Belloria", payload: { headers: [{ name: "From", value: "Camille <camille@example.test>" }, { name: "Subject", value: "Demande mariage" }] } });
    throw new Error(`Unexpected fetch ${url}`);
  };
  try {
    const env = environment({ GPT_ACTIONS_TOKEN: "action-secret", GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "secret", GOOGLE_REFRESH_TOKEN: "refresh" });
    const request = new Request("https://worker.test/gpt-actions/gmail/recent?query=from%3Acamille&limit=1", { headers: { authorization: "Bearer action-secret" } });
    const result = await handleRequest(request, env);
    assert.equal(result.status, 200);
    assert.deepEqual((await result.json()).messages, [{ id: "message-1", thread_id: "thread-1", from: "Camille <camille@example.test>", to: null, subject: "Demande mariage", date: null, snippet: "Bonjour Belloria" }]);
    assert.equal(calls.some((call) => call.options.method === "POST" && String(call.url).includes("gmail.googleapis.com")), false);
  } finally { globalThis.fetch = originalFetch; }
});

test("creates and presents an immutable Gmail proposal without any confirmed direct-send path", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url) === "https://api.telegram.org/bottelegram-test-token/sendMessage") return Response.json({ ok: true, result: { message_id: 501 } });
    throw new Error(`Unexpected fetch ${url}`);
  };
  try {
    const env = environment({ GPT_ACTIONS_TOKEN: "action-secret" });
    await handleRequest(telegramRequest(textUpdate()), env);

    const legacy = await handleRequest(gmailActionRequest("send", {
      to: "camille@example.test", subject: "Votre demande", text: "Bonjour Camille", confirmed: true
    }), env);
    assert.equal(legacy.status, 400);

    const proposed = await handleRequest(gmailActionRequest("send", {
      source_id: "7001", to: ["Camille@example.test"], cc: [], subject: "Votre demande", text: "Bonjour Camille"
    }), env);
    assert.equal(proposed.status, 201);
    const action = await proposed.json();
    const row = env.DB.externalActions.get(action.action_id);
    assert.equal(row.action_type, "gmail_send");
    assert.equal(row.state, "pending");
    assert.match(row.payload_json, /"rfc822_message_id":"<belloria-[0-9a-f]{64}@belloria\.invalid>"/);
    assert.match(row.approval_text, /"gmail_account":"primary"/);

    const replay = await handleRequest(gmailActionRequest("send", {
      source_id: "7001", to: "camille@example.test", subject: "Votre demande", text: "Bonjour Camille"
    }), env);
    assert.equal(replay.status, 201);
    const conflict = await handleRequest(gmailActionRequest("send", {
      source_id: "7001", to: "camille@example.test", subject: "Votre demande", text: "Texte différent"
    }), env);
    assert.equal(conflict.status, 409);

    const injected = await handleRequest(gmailActionRequest("execute", { action_id: action.action_id, to: "attacker@example.test" }), env);
    assert.equal(injected.status, 400);
    const unapproved = await handleRequest(gmailActionRequest("execute", { action_id: action.action_id }), env);
    assert.equal(unapproved.status, 409);
    assert.equal(calls.filter((call) => String(call.url).endsWith("/messages/send")).length, 0);
    assert.equal(calls.filter((call) => String(call.url).endsWith("/sendMessage")).length, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("claims concurrent approved Gmail executions once and replays the persisted success", async () => {
  const originalFetch = globalThis.fetch;
  const gmailCalls = [];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url) === "https://api.telegram.org/bottelegram-test-token/sendMessage") return Response.json({ ok: true, result: { message_id: 502 } });
    if (String(url) === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "access-token", scope: "https://www.googleapis.com/auth/gmail.send" });
    if (String(url).endsWith("/messages/send")) {
      gmailCalls.push(JSON.parse(options.body));
      return Response.json({ id: "sent-1", threadId: "thread-1" });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };
  try {
    const env = environment({ GPT_ACTIONS_TOKEN: "action-secret", GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "secret", GOOGLE_REFRESH_TOKEN: "refresh" });
    const action = await createApprovedGmailAction(env);
    const [first, second] = await Promise.all([
      handleRequest(gmailActionRequest("execute", { action_id: action.action_id }), env),
      handleRequest(gmailActionRequest("execute", { action_id: action.action_id }), env)
    ]);
    await first.json();
    await second.json();
    assert.equal(gmailCalls.length, 1);
    const mime = Buffer.from(gmailCalls[0].raw.replaceAll("-", "+").replaceAll("_", "/"), "base64").toString("utf8");
    const row = env.DB.externalActions.get(action.action_id);
    assert.match(mime, new RegExp(`Message-ID: ${JSON.parse(row.payload_json).rfc822_message_id.replace(/[<>]/g, "\\$&")}`));
    assert.match(mime, /To: camille@example\.test/);
    assert.equal(row.state, "succeeded");
    assert.equal(row.provider_message_id, "sent-1");

    const replay = await handleRequest(gmailActionRequest("execute", { action_id: action.action_id }), env);
    assert.deepEqual(await replay.json(), { action_id: action.action_id, state: "succeeded", sent: true, id: "sent-1", thread_id: "thread-1" });
    assert.equal(gmailCalls.length, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("persists an explicit Gmail rejection as failed without a retry", async () => {
  const originalFetch = globalThis.fetch;
  let gmailCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url) === "https://api.telegram.org/bottelegram-test-token/sendMessage") return Response.json({ ok: true, result: { message_id: 503 } });
    if (String(url) === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "access-token", scope: "https://www.googleapis.com/auth/gmail.send" });
    if (String(url).endsWith("/messages/send")) {
      gmailCalls += 1;
      return Response.json({ error: { status: "INVALID_ARGUMENT", errors: [{ reason: "invalidArgument" }] } }, { status: 400 });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };
  try {
    const env = environment({ GPT_ACTIONS_TOKEN: "action-secret", GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "secret", GOOGLE_REFRESH_TOKEN: "refresh" });
    const action = await createApprovedGmailAction(env);
    const failed = await handleRequest(gmailActionRequest("execute", { action_id: action.action_id }), env);
    assert.deepEqual(await failed.json(), { action_id: action.action_id, state: "failed", error_code: "gmail_rejected_invalid_argument", provider_http_status: 400 });
    const replay = await handleRequest(gmailActionRequest("execute", { action_id: action.action_id }), env);
    assert.equal((await replay.json()).state, "failed");
    assert.equal(gmailCalls, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("persists pre-dispatch failures and ambiguous Gmail outcomes without a retry", async () => {
  const originalFetch = globalThis.fetch;
  let gmailCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url) === "https://api.telegram.org/bottelegram-test-token/sendMessage") return Response.json({ ok: true, result: { message_id: 504 } });
    if (String(url).endsWith("/messages/send")) {
      gmailCalls += 1;
      throw new Error("connection lost after dispatch");
    }
    if (String(url) === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "access-token", scope: "https://www.googleapis.com/auth/gmail.send" });
    throw new Error(`Unexpected fetch ${url}`);
  };
  try {
    const missingConfig = environment({ GPT_ACTIONS_TOKEN: "action-secret" });
    const failedAction = await createApprovedGmailAction(missingConfig);
    const failed = await handleRequest(gmailActionRequest("execute", { action_id: failedAction.action_id }), missingConfig);
    assert.deepEqual(await failed.json(), { action_id: failedAction.action_id, state: "failed", error_code: "gmail_not_configured", provider_http_status: null });

    const env = environment({ GPT_ACTIONS_TOKEN: "action-secret", GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "secret", GOOGLE_REFRESH_TOKEN: "refresh" });
    const action = await createApprovedGmailAction(env);
    const unknown = await handleRequest(gmailActionRequest("execute", { action_id: action.action_id }), env);
    assert.deepEqual(await unknown.json(), { action_id: action.action_id, state: "unknown", error_code: "gmail_network_ambiguous", provider_http_status: null });
    const replay = await handleRequest(gmailActionRequest("execute", { action_id: action.action_id }), env);
    assert.equal((await replay.json()).state, "unknown");
    assert.equal(gmailCalls, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("resumes only a claimed Gmail action that has no dispatch marker", async () => {
  const originalFetch = globalThis.fetch;
  let gmailCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url) === "https://api.telegram.org/bottelegram-test-token/sendMessage") return Response.json({ ok: true, result: { message_id: 505 } });
    if (String(url) === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "access-token", scope: "https://www.googleapis.com/auth/gmail.send" });
    if (String(url).endsWith("/messages/send")) {
      gmailCalls += 1;
      return Response.json({ id: "sent-after-claim" });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };
  try {
    const resumable = environment({ GPT_ACTIONS_TOKEN: "action-secret", GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "secret", GOOGLE_REFRESH_TOKEN: "refresh" });
    const action = await createApprovedGmailAction(resumable);
    Object.assign(resumable.DB.externalActions.get(action.action_id), { state: "claimed", claimed_at: new Date().toISOString() });
    const resumed = await handleRequest(gmailActionRequest("execute", { action_id: action.action_id }), resumable);
    assert.equal((await resumed.json()).state, "succeeded");
    assert.equal(gmailCalls, 1);

    const stale = environment({ GPT_ACTIONS_TOKEN: "action-secret", GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "secret", GOOGLE_REFRESH_TOKEN: "refresh" });
    const staleAction = await createApprovedGmailAction(stale);
    Object.assign(stale.DB.externalActions.get(staleAction.action_id), {
      state: "claimed", claimed_at: "2020-01-01T00:00:00.000Z", dispatch_started_at: "2020-01-01T00:00:00.000Z"
    });
    const abandoned = await handleRequest(gmailActionRequest("execute", { action_id: staleAction.action_id }), stale);
    assert.deepEqual(await abandoned.json(), { action_id: staleAction.action_id, state: "unknown", error_code: "gmail_dispatch_abandoned", provider_http_status: null });
    assert.equal(gmailCalls, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("creates and presents immutable Notion proposals without a direct-write path", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url) === "https://api.telegram.org/bottelegram-test-token/sendMessage") return Response.json({ ok: true, result: { message_id: 601 } });
    throw new Error(`Unexpected fetch ${url}`);
  };
  try {
    const env = environment({ GPT_ACTIONS_TOKEN: "action-secret", NOTION_DATA_SOURCE_ID: "9a7d3f64-50e3-4db3-9c97-14d5f8c0a1b2" });
    await handleRequest(telegramRequest(textUpdate()), env);
    const legacy = await handleRequest(notionActionRequest("POST", {
      properties: { Nom: { title: [{ text: { content: "Camille Martin" } }] } }, confirmed: true
    }), env);
    assert.equal(legacy.status, 400);

    const created = await handleRequest(notionActionRequest("POST", {
      source_id: "7001", properties: { Nom: { title: [{ text: { content: "Camille Martin" } }] } }
    }), env);
    assert.equal(created.status, 201);
    const createAction = await created.json();
    const createRow = env.DB.externalActions.get(createAction.action_id);
    assert.equal(createRow.action_type, "notion_page_create");
    assert.equal(createRow.state, "pending");
    assert.match(createRow.approval_text, /"notion_data_source_id":"9a7d3f64-50e3-4db3-9c97-14d5f8c0a1b2"/);

    await handleRequest(telegramRequest(textUpdate({ update_id: 7002, message: { message_id: 82, chat: { id: 123456 }, text: "Actualise Camille" } })), env);
    const updated = await handleRequest(notionActionRequest("PATCH", {
      source_id: "7002", page_id: "b55c9c91-384d-452b-81db-d1ef79372b75", properties: { Pipeline: { status: { name: "À qualifier" } } }
    }), env);
    assert.equal(updated.status, 201);
    assert.equal(env.DB.externalActions.get((await updated.json()).action_id).action_type, "notion_page_update");

    await handleRequest(telegramRequest(textUpdate({ update_id: 7003, message: { message_id: 83, chat: { id: 123456 }, text: "Archive Camille" } })), env);
    const archived = await handleRequest(notionActionRequest("DELETE", {
      source_id: "7003", page_id: "b55c9c91-384d-452b-81db-d1ef79372b75"
    }), env);
    assert.equal(archived.status, 201);
    assert.equal(env.DB.externalActions.get((await archived.json()).action_id).action_type, "notion_page_archive");
    assert.equal(calls.some((call) => call.url.startsWith("https://api.notion.com/")), false);
  } finally { globalThis.fetch = originalFetch; }
});

test("claims concurrent approved Notion executions once and replays the persisted success", async () => {
  const originalFetch = globalThis.fetch;
  const notionCalls = [];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url) === "https://api.telegram.org/bottelegram-test-token/sendMessage") return Response.json({ ok: true, result: { message_id: 602 } });
    if (String(url) === "https://api.notion.com/v1/pages") {
      notionCalls.push(JSON.parse(options.body));
      return Response.json({ id: "b55c9c91-384d-452b-81db-d1ef79372b75" });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };
  try {
    const env = environment({
      GPT_ACTIONS_TOKEN: "action-secret", NOTION_TOKEN: "notion-secret", NOTION_DATA_SOURCE_ID: "9a7d3f64-50e3-4db3-9c97-14d5f8c0a1b2"
    });
    const action = await createApprovedNotionAction(env);
    const [first, second] = await Promise.all([
      handleRequest(notionExecuteRequest({ action_id: action.action_id }), env),
      handleRequest(notionExecuteRequest({ action_id: action.action_id }), env)
    ]);
    await first.json();
    await second.json();
    assert.equal(notionCalls.length, 1);
    assert.deepEqual(notionCalls[0].parent, { type: "data_source_id", data_source_id: "9a7d3f64-50e3-4db3-9c97-14d5f8c0a1b2" });
    const row = env.DB.externalActions.get(action.action_id);
    assert.equal(row.state, "succeeded");
    assert.equal(row.provider_resource_id, "b55c9c91-384d-452b-81db-d1ef79372b75");
    const replay = await handleRequest(notionExecuteRequest({ action_id: action.action_id }), env);
    assert.deepEqual(await replay.json(), { action_id: action.action_id, state: "succeeded", completed: true, resource_id: "b55c9c91-384d-452b-81db-d1ef79372b75" });
    assert.equal(notionCalls.length, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("replays the exact approved Notion update and archive content from D1", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url) === "https://api.telegram.org/bottelegram-test-token/sendMessage") return Response.json({ ok: true, result: { message_id: 604 } });
    if (String(url).startsWith("https://api.notion.com/v1/pages/")) {
      calls.push({ url: String(url), method: options.method, body: JSON.parse(options.body) });
      return Response.json({ id: "b55c9c91-384d-452b-81db-d1ef79372b75" });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };
  try {
    const env = environment({ GPT_ACTIONS_TOKEN: "action-secret", NOTION_TOKEN: "notion-secret" });
    const pageId = "b55c9c91-384d-452b-81db-d1ef79372b75";
    const updated = await createApprovedNotionAction(env, {
      source_id: "7002", method: "PATCH", page_id: pageId, properties: { Pipeline: { status: { name: "À qualifier" } } }
    });
    const archived = await createApprovedNotionAction(env, { source_id: "7003", method: "DELETE", page_id: pageId });
    assert.equal((await (await handleRequest(notionExecuteRequest({ action_id: updated.action_id }), env)).json()).state, "succeeded");
    assert.equal((await (await handleRequest(notionExecuteRequest({ action_id: archived.action_id }), env)).json()).state, "succeeded");
    assert.deepEqual(calls, [
      { url: `https://api.notion.com/v1/pages/${pageId}`, method: "PATCH", body: { properties: { Pipeline: { status: { name: "À qualifier" } } } } },
      { url: `https://api.notion.com/v1/pages/${pageId}`, method: "PATCH", body: { archived: true } }
    ]);
  } finally { globalThis.fetch = originalFetch; }
});

test("marks only a stale Notion dispatch unknown", async () => {
  const originalFetch = globalThis.fetch;
  let notionCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url) === "https://api.telegram.org/bottelegram-test-token/sendMessage") return Response.json({ ok: true, result: { message_id: 605 } });
    if (String(url).startsWith("https://api.notion.com/")) notionCalls += 1;
    throw new Error(`Unexpected fetch ${url}`);
  };
  try {
    const env = environment({ GPT_ACTIONS_TOKEN: "action-secret", NOTION_TOKEN: "notion-secret", NOTION_DATA_SOURCE_ID: "9a7d3f64-50e3-4db3-9c97-14d5f8c0a1b2" });
    const action = await createApprovedNotionAction(env);
    Object.assign(env.DB.externalActions.get(action.action_id), { state: "claimed", claimed_at: new Date().toISOString(), dispatch_started_at: new Date().toISOString() });
    const inFlight = await handleRequest(notionExecuteRequest({ action_id: action.action_id }), env);
    assert.equal((await inFlight.json()).state, "claimed");
    assert.equal(notionCalls, 0);

    env.DB.externalActions.get(action.action_id).dispatch_started_at = "2020-01-01T00:00:00.000Z";
    const stale = await handleRequest(notionExecuteRequest({ action_id: action.action_id }), env);
    assert.deepEqual(await stale.json(), { action_id: action.action_id, state: "unknown", error_code: "notion_dispatch_abandoned", provider_http_status: null });
    assert.equal(notionCalls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("persists failed and ambiguous Notion mutations without a retry", async () => {
  const originalFetch = globalThis.fetch;
  let mode = "rejected";
  let notionCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url) === "https://api.telegram.org/bottelegram-test-token/sendMessage") return Response.json({ ok: true, result: { message_id: 603 } });
    if (String(url).startsWith("https://api.notion.com/")) {
      notionCalls += 1;
      if (mode === "rejected") return Response.json({ object: "error" }, { status: 400 });
      throw new Error("connection lost after dispatch");
    }
    throw new Error(`Unexpected fetch ${url}`);
  };
  try {
    const missingConfig = environment({ GPT_ACTIONS_TOKEN: "action-secret", NOTION_DATA_SOURCE_ID: "9a7d3f64-50e3-4db3-9c97-14d5f8c0a1b2" });
    const missingAction = await createApprovedNotionAction(missingConfig);
    const missing = await handleRequest(notionExecuteRequest({ action_id: missingAction.action_id }), missingConfig);
    assert.deepEqual(await missing.json(), { action_id: missingAction.action_id, state: "failed", error_code: "notion_not_configured", provider_http_status: null });

    const rejectedEnv = environment({ GPT_ACTIONS_TOKEN: "action-secret", NOTION_TOKEN: "notion-secret", NOTION_DATA_SOURCE_ID: "9a7d3f64-50e3-4db3-9c97-14d5f8c0a1b2" });
    const rejectedAction = await createApprovedNotionAction(rejectedEnv);
    const rejected = await handleRequest(notionExecuteRequest({ action_id: rejectedAction.action_id }), rejectedEnv);
    assert.deepEqual(await rejected.json(), { action_id: rejectedAction.action_id, state: "failed", error_code: "notion_rejected_http_400", provider_http_status: 400 });
    await handleRequest(notionExecuteRequest({ action_id: rejectedAction.action_id }), rejectedEnv);
    assert.equal(notionCalls, 1);

    mode = "network";
    const unknownEnv = environment({ GPT_ACTIONS_TOKEN: "action-secret", NOTION_TOKEN: "notion-secret", NOTION_DATA_SOURCE_ID: "9a7d3f64-50e3-4db3-9c97-14d5f8c0a1b2" });
    const unknownAction = await createApprovedNotionAction(unknownEnv);
    const unknown = await handleRequest(notionExecuteRequest({ action_id: unknownAction.action_id }), unknownEnv);
    assert.deepEqual(await unknown.json(), { action_id: unknownAction.action_id, state: "unknown", error_code: "notion_network_ambiguous", provider_http_status: null });
    await handleRequest(notionExecuteRequest({ action_id: unknownAction.action_id }), unknownEnv);
    assert.equal(notionCalls, 2);
  } finally { globalThis.fetch = originalFetch; }
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
