const TOOLS = [
  { name: "whatsapp_session_status", description: "Read the configured WhatsApp session status.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "whatsapp_send_text", description: "Send one text message only after explicit user approval.", inputSchema: { type: "object", properties: { phone: { type: "string", pattern: "^[1-9][0-9]{7,14}$" }, text: { type: "string", minLength: 1, maxLength: 2000 }, confirmed: { type: "boolean", const: true } }, required: ["phone", "text", "confirmed"], additionalProperties: false } }
];

const encoder = new TextEncoder();

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

async function validSignature(body, supplied, secret) {
  if (!supplied?.startsWith("sha256=") || !secret) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, body);
  const expected = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(supplied.slice(7).toLowerCase(), expected);
}

export function extractEvents(document) {
  if (document?.object !== "whatsapp_business_account") return [];
  const events = [];
  for (const entry of document.entry || []) for (const change of entry.changes || []) {
    if (change.field !== "messages") continue;
    const value = change.value || {};
    const phone = String(value.metadata?.phone_number_id || "");
    for (const message of value.messages || []) if (message.id) events.push({ id: String(message.id), kind: "message", phone });
    for (const status of value.statuses || []) if (status.id && status.status) events.push({ id: `${status.id}:${status.status}`, kind: "status", phone });
  }
  return events;
}

async function ingest(db, events) {
  if (!events.length) return 0;
  const statements = events.map((event) => db.prepare(
    "INSERT INTO webhook_events (event_id, event_kind, phone_number_id) VALUES (?, ?, ?) ON CONFLICT(event_id) DO NOTHING"
  ).bind(event.id, event.kind, event.phone));
  const results = await db.batch(statements);
  return results.reduce((count, result) => count + Number(result.meta?.changes || 0), 0);
}

async function metaWebhook(request, env) {
  if (request.method === "GET") {
    const url = new URL(request.url);
    const valid = url.searchParams.get("hub.mode") === "subscribe" && timingSafeEqual(url.searchParams.get("hub.verify_token"), env.META_VERIFY_TOKEN);
    return valid ? new Response(url.searchParams.get("hub.challenge") || "", { headers: { "content-type": "text/plain" } }) : json({ error: "forbidden" }, 403);
  }
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
  const body = await request.arrayBuffer();
  if (!(await validSignature(body, request.headers.get("x-hub-signature-256"), env.META_APP_SECRET))) return json({ error: "invalid signature" }, 401);
  let document;
  try { document = JSON.parse(new TextDecoder().decode(body)); } catch { return json({ error: "invalid json" }, 400); }
  const accepted = await ingest(env.DB, extractEvents(document));
  console.log(JSON.stringify({ event: "meta_webhook_ingested", accepted }));
  return json({ accepted });
}

function rpcResult(id, result) { return json({ jsonrpc: "2.0", id, result }); }
function rpcError(id, code, message, status = 200) { return json({ jsonrpc: "2.0", id, error: { code, message } }, status); }

async function callMeta(env, phone, text) {
  if (!/^[1-9][0-9]{7,14}$/.test(phone)) throw new Error("phone must contain 8 to 15 digits without '+'");
  if (!text || text.length > 2000) throw new Error("text must contain 1 to 2000 characters");
  const response = await fetch(`https://graph.facebook.com/${env.META_GRAPH_VERSION}/${env.META_PHONE_NUMBER_ID}/messages`, {
    method: "POST", headers: { authorization: `Bearer ${env.META_ACCESS_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: phone, type: "text", text: { body: text } })
  });
  if (!response.ok) throw new Error(`Meta returned HTTP ${response.status}`);
  return response.json();
}

async function mcp(request, env) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  if (!timingSafeEqual(token, env.BELLORIA_MCP_TOKEN)) return json({ error: "unauthorized" }, 401);
  let message;
  try { message = await request.json(); } catch { return json({ error: "invalid request" }, 400); }
  const id = message.id;
  if (message.method === "initialize") return rpcResult(id, { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "belloria-mcp", version: "0.2.0" } });
  if (message.method === "tools/list") return rpcResult(id, { tools: TOOLS });
  if (message.method !== "tools/call") return rpcError(id, -32601, "Method not found");
  const { name, arguments: args = {} } = message.params || {};
  try {
    let value;
    if (name === "whatsapp_session_status") value = { provider: "meta", configured: Boolean(env.META_PHONE_NUMBER_ID && env.META_ACCESS_TOKEN), phone_number_id: env.META_PHONE_NUMBER_ID };
    else if (name === "whatsapp_send_text") {
      if (args.confirmed !== true) throw new Error("explicit confirmation is required");
      value = await callMeta(env, args.phone || "", args.text || "");
    } else throw new Error("unknown tool");
    return rpcResult(id, { content: [{ type: "text", text: JSON.stringify(value) }] });
  } catch (error) { return rpcError(id, -32602, error.message); }
}

export async function handleRequest(request, env) {
  const path = new URL(request.url).pathname;
  if (path === "/health" && request.method === "GET") return json({ status: "ok" });
  if (path === "/webhooks/meta") return metaWebhook(request, env);
  if (path === "/mcp" && request.method === "POST") return mcp(request, env);
  return json({ error: "not found" }, 404);
}

export async function processPending(env, deliver) {
  const due = await env.DB.prepare(
    "SELECT event_id, event_kind, phone_number_id, attempts FROM webhook_events WHERE state IN ('pending', 'retry') AND (next_attempt_at IS NULL OR next_attempt_at <= CURRENT_TIMESTAMP) ORDER BY created_at LIMIT 10"
  ).all();
  for (const event of due.results || []) {
    const claim = await env.DB.prepare("UPDATE webhook_events SET state = 'processing', updated_at = CURRENT_TIMESTAMP WHERE event_id = ? AND state IN ('pending', 'retry')").bind(event.event_id).run();
    if (Number(claim.meta?.changes || 0) !== 1) continue;
    try {
      await deliver({ id: event.event_id, kind: event.event_kind, phone_number_id: event.phone_number_id });
      await env.DB.prepare("UPDATE webhook_events SET state = 'processed', updated_at = CURRENT_TIMESTAMP, last_error_code = NULL WHERE event_id = ?").bind(event.event_id).run();
    } catch (error) {
      const attempts = Number(event.attempts) + 1;
      const quarantined = attempts >= 5;
      const delayMinutes = Math.min(2 ** attempts, 60);
      const code = String(error?.code || "delivery_failed").replace(/[^a-z0-9_-]/gi, "_").slice(0, 64);
      await env.DB.prepare("UPDATE webhook_events SET state = ?, attempts = ?, next_attempt_at = datetime('now', ?), updated_at = CURRENT_TIMESTAMP, last_error_code = ? WHERE event_id = ?")
        .bind(quarantined ? "quarantined" : "retry", attempts, `+${delayMinutes} minutes`, code, event.event_id).run();
      console.log(JSON.stringify({ event: quarantined ? "event_quarantined" : "event_retry_scheduled", event_key: event.event_id.slice(0, 12), attempts, code }));
    }
  }
}

async function deliverToProcessor(env, event) {
  const response = await fetch(env.EVENT_PROCESSOR_URL, { method: "POST", headers: { authorization: `Bearer ${env.EVENT_PROCESSOR_TOKEN}`, "content-type": "application/json" }, body: JSON.stringify(event) });
  if (!response.ok) { const error = new Error("processor rejected event"); error.code = `processor_http_${response.status}`; throw error; }
}

export default {
  fetch: handleRequest,
  scheduled(_controller, env, context) {
    if (!env.EVENT_PROCESSOR_URL || !env.EVENT_PROCESSOR_TOKEN) return;
    context.waitUntil(processPending(env, (event) => deliverToProcessor(env, event)));
  }
};
