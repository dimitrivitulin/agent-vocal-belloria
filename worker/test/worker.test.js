import assert from "node:assert/strict";
import { createHmac, webcrypto } from "node:crypto";
import test from "node:test";
import { extractEvents, handleRequest, processPending } from "../src/index.js";

globalThis.crypto ||= webcrypto;

class FakeDb {
  constructor() { this.rows = new Map(); }
  prepare() { return { bind: (id, kind, phone) => ({ id, kind, phone }) }; }
  async batch(statements) {
    return statements.map((event) => {
      if (this.rows.has(event.id)) return { meta: { changes: 0 } };
      this.rows.set(event.id, event); return { meta: { changes: 1 } };
    });
  }
}

function environment(overrides = {}) {
  return { DB: new FakeDb(), META_VERIFY_TOKEN: "verify-token", META_APP_SECRET: "app-secret", META_PHONE_NUMBER_ID: "phone-id", META_ACCESS_TOKEN: "access-token", META_GRAPH_VERSION: "v99.0", BELLORIA_MCP_TOKEN: "mcp-token", ...overrides };
}

function signedRequest(payload, secret = "app-secret") {
  const body = JSON.stringify(payload);
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  return new Request("https://worker.test/webhooks/meta", { method: "POST", body, headers: { "x-hub-signature-256": `sha256=${signature}` } });
}

const payload = { object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "100200300" }, messages: [{ id: "wamid.in", from: "336", type: "text", text: { body: "secret text" } }], statuses: [{ id: "wamid.out", status: "delivered", recipient_id: "336" }] } }] }] };

test("extracts stable minimized event identities", () => {
  assert.deepEqual(extractEvents(payload), [
    { id: "wamid.in", kind: "message", phone: "100200300" },
    { id: "wamid.out:delivered", kind: "status", phone: "100200300" }
  ]);
});

test("verifies challenge token", async () => {
  const ok = await handleRequest(new Request("https://worker.test/webhooks/meta?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=123"), environment());
  assert.equal(ok.status, 200); assert.equal(await ok.text(), "123");
  const denied = await handleRequest(new Request("https://worker.test/webhooks/meta?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123"), environment());
  assert.equal(denied.status, 403);
});

test("authenticates raw webhook and inserts each identity once", async () => {
  const env = environment();
  const first = await handleRequest(signedRequest(payload), env);
  const second = await handleRequest(signedRequest(payload), env);
  assert.deepEqual(await first.json(), { accepted: 2 });
  assert.deepEqual(await second.json(), { accepted: 0 });
  assert.equal(env.DB.rows.size, 2);
  assert.equal(JSON.stringify([...env.DB.rows.values()]).includes("secret text"), false);
  const denied = await handleRequest(signedRequest(payload, "wrong"), env);
  assert.equal(denied.status, 401);
});

test("protects MCP and preserves its two tools", async () => {
  const env = environment();
  const message = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  const denied = await handleRequest(new Request("https://worker.test/mcp", { method: "POST", body: message }), env);
  assert.equal(denied.status, 401);
  const allowed = await handleRequest(new Request("https://worker.test/mcp", { method: "POST", body: message, headers: { authorization: "Bearer mcp-token" } }), env);
  assert.deepEqual((await allowed.json()).result.tools.map((tool) => tool.name), ["whatsapp_session_status", "whatsapp_send_text"]);
});

test("requires exact send confirmation before any Meta call", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return Response.json({ messages: [{ id: "wamid.sent" }] }); };
  try {
    const env = environment();
    const invoke = (confirmed) => handleRequest(new Request("https://worker.test/mcp", { method: "POST", headers: { authorization: "Bearer mcp-token" }, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "whatsapp_send_text", arguments: { phone: "33612345678", text: "Bonjour", confirmed } } }) }), env);
    assert.equal((await (await invoke(false)).json()).error.message, "explicit confirmation is required");
    assert.equal(calls, 0);
    assert.equal((await (await invoke(true)).json()).result.content[0].type, "text");
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("retries transient failures and quarantines the fifth failure", async () => {
  const updates = [];
  const db = {
    prepare(sql) {
      return {
        all: async () => ({ results: [{ event_id: "wamid.private-long-id", event_kind: "message", phone_number_id: "phone-id", attempts: 4 }] }),
        bind: (...args) => ({ run: async () => { updates.push({ sql, args }); return { meta: { changes: 1 } }; } })
      };
    }
  };
  const error = new Error("must not be persisted"); error.code = "processor_http_503";
  await processPending({ DB: db }, async () => { throw error; });
  const final = updates.at(-1).args;
  assert.deepEqual(final.slice(0, 2), ["quarantined", 5]);
  assert.equal(final[3], "processor_http_503");
  assert.equal(JSON.stringify(updates).includes("must not be persisted"), false);
});
