const GMAIL_READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const GMAIL_ACTION_TYPE = "gmail_send";
const GMAIL_DISPATCH_STALE_MINUTES = 2;
const NOTION_VERSION = "2026-03-11";
const MAX_QUERY_LENGTH = 256;

function response(payload, status = 200) {
  return Response.json(payload, { status, headers: { "cache-control": "no-store" } });
}

function actionError(code, status, message) {
  return response({ error: { code, message } }, status);
}

function actionTokenIsValid(request, env) {
  const supplied = request.headers.get("authorization") || "";
  return Boolean(env.GPT_ACTIONS_TOKEN) && supplied === `Bearer ${env.GPT_ACTIONS_TOKEN}`;
}

function readLimit(value, fallback = 5) {
  if (value === null) return fallback;
  const limit = Number(value);
  return Number.isInteger(limit) && limit >= 1 && limit <= 10 ? limit : null;
}

function headerValue(headers, name) {
  return (headers || []).find((header) => header.name?.toLowerCase() === name)?.value || null;
}

function notionTitle(properties) {
  for (const property of Object.values(properties || {})) {
    if (property?.type !== "title") continue;
    return (property.title || []).map((value) => value.plain_text || "").join("") || null;
  }
  return null;
}

async function googleAccessToken(env, requiredScopes = [GMAIL_READ_SCOPE]) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REFRESH_TOKEN) {
    throw Object.assign(new Error("Gmail is not configured"), { status: 503, code: "gmail_not_configured" });
  }
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: env.GOOGLE_REFRESH_TOKEN,
    grant_type: "refresh_token"
  });
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body
  });
  if (!tokenResponse.ok) throw Object.assign(new Error("Gmail authorization failed"), { status: 502, code: "gmail_authorization_failed" });
  const payload = await tokenResponse.json();
  if (!payload.access_token || (payload.scope && requiredScopes.some((scope) => !payload.scope.split(" ").includes(scope)))) {
    throw Object.assign(new Error("Gmail authorization scope is insufficient"), { status: 502, code: "gmail_scope_insufficient" });
  }
  return payload.access_token;
}

function base64Url(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

async function actionBody(request, allowedKeys) {
  let body;
  try { body = await request.json(); } catch { return actionError("invalid_request", 400, "a JSON body is required"); }
  if (!validObject(body) || Object.keys(body).some((key) => !allowedKeys.includes(key))) {
    return actionError("invalid_request", 400, "the request contains unsupported fields");
  }
  return body;
}

function normalizedEmails(value, required) {
  if (value === undefined && !required) return [];
  const raw = Array.isArray(value) ? value : [value];
  if (!raw.length) return required ? null : [];
  if (raw.length > 20 || raw.some((email) => typeof email !== "string")) return null;
  const emails = raw.map((email) => email.trim().toLowerCase());
  if (!emails.every(validEmail)) return null;
  return [...new Set(emails)].sort();
}

function gmailProposal(body) {
  const sourceId = String(body.source_id || "");
  const to = normalizedEmails(body.to, true);
  const cc = normalizedEmails(body.cc, false);
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const text = typeof body.text === "string" ? body.text : "";
  if (!/^[0-9]{1,20}$/.test(sourceId) || !to || !cc || to.length + cc.length > 20 || cc.some((email) => to.includes(email))
    || !subject || subject.length > 200 || /[\r\n]/.test(subject) || !text.trim() || text.length > 15000) return null;
  return { source_id: sourceId, to, cc, subject, text };
}

function externalActionResult(row) {
  const result = { action_id: row.action_id, state: row.state };
  if (row.state === "succeeded") {
    result.sent = true;
    result.id = row.provider_message_id;
    result.thread_id = row.provider_thread_id || null;
  }
  if (["failed", "unknown"].includes(row.state)) {
    result.error_code = row.provider_error_code || null;
    result.provider_http_status = row.provider_http_status || null;
  }
  if (row.state === "claimed" && row.dispatch_started_at) result.dispatch_started_at = row.dispatch_started_at;
  return result;
}

async function externalActionRow(db, actionId) {
  const result = await db.prepare("SELECT * FROM external_actions WHERE action_id = ?").bind(actionId).all();
  return result.results?.[0] || null;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function storedGmailMessage(row) {
  try {
    const target = JSON.parse(row.target_json);
    const payload = JSON.parse(row.payload_json);
    if (!validObject(target) || !validObject(payload)
      || JSON.stringify(Object.keys(target).sort()) !== JSON.stringify(["cc", "gmail_account", "to"])
      || JSON.stringify(Object.keys(payload).sort()) !== JSON.stringify(["rfc822_message_id", "subject", "text"])
      || target.gmail_account !== "primary") return null;
    const to = normalizedEmails(target.to, true);
    const cc = normalizedEmails(target.cc, false);
    if (!to || !cc || to.length + cc.length > 20 || cc.some((email) => to.includes(email))
      || !Array.isArray(target.to) || !Array.isArray(target.cc)
      || JSON.stringify(to) !== JSON.stringify(target.to) || JSON.stringify(cc) !== JSON.stringify(target.cc)
      || typeof payload.subject !== "string" || !payload.subject || payload.subject.length > 200 || /[\r\n]/.test(payload.subject)
      || typeof payload.text !== "string" || !payload.text.trim() || payload.text.length > 15000
      || !/^<belloria-[0-9a-f]{64}@belloria\.invalid>$/.test(payload.rfc822_message_id)) return null;
    return { to, cc, subject: payload.subject, text: payload.text, messageId: payload.rfc822_message_id };
  } catch { return null; }
}

function gmailMime(message) {
  return [
    `To: ${message.to.join(", ")}`,
    message.cc.length ? `Cc: ${message.cc.join(", ")}` : null,
    `Subject: ${message.subject}`,
    `Message-ID: ${message.messageId}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    message.text
  ].filter((line) => line !== null).join("\r\n");
}

async function persistGmailFailure(db, actionId, errorCode, providerHttpStatus, afterDispatch) {
  const result = await db.prepare(
    `UPDATE external_actions SET state = 'failed', finished_at = CURRENT_TIMESTAMP, provider_error_code = ?, provider_http_status = ? WHERE action_id = ? AND state = 'claimed' AND dispatch_started_at IS ${afterDispatch ? "NOT " : ""}NULL`
  ).bind(errorCode, providerHttpStatus, actionId).run();
  return Number(result.meta?.changes || 0) === 1;
}

async function persistGmailUnknown(db, actionId, errorCode, providerHttpStatus) {
  const result = await db.prepare(
    "UPDATE external_actions SET state = 'unknown', finished_at = CURRENT_TIMESTAMP, provider_error_code = ?, provider_http_status = ? WHERE action_id = ? AND state = 'claimed' AND dispatch_started_at IS NOT NULL"
  ).bind(errorCode, providerHttpStatus, actionId).run();
  return Number(result.meta?.changes || 0) === 1;
}

async function persistStaleGmailDispatchUnknown(db, actionId) {
  const result = await db.prepare(
    `UPDATE external_actions SET state = 'unknown', finished_at = CURRENT_TIMESTAMP, provider_error_code = 'gmail_dispatch_abandoned' WHERE action_id = ? AND state = 'claimed' AND dispatch_started_at <= datetime('now', '-${GMAIL_DISPATCH_STALE_MINUTES} minutes')`
  ).bind(actionId).run();
  return Number(result.meta?.changes || 0) === 1;
}

async function reserveGmailDispatch(db, actionId) {
  const result = await db.prepare(
    "UPDATE external_actions SET dispatch_started_at = CURRENT_TIMESTAMP WHERE action_id = ? AND state = 'claimed' AND dispatch_started_at IS NULL"
  ).bind(actionId).run();
  return Number(result.meta?.changes || 0) === 1;
}

async function persistGmailSuccess(db, actionId, sent, providerHttpStatus) {
  const result = await db.prepare(
    "UPDATE external_actions SET state = 'succeeded', finished_at = CURRENT_TIMESTAMP, provider_message_id = ?, provider_thread_id = ?, provider_http_status = ? WHERE action_id = ? AND state = 'claimed' AND dispatch_started_at IS NOT NULL"
  ).bind(sent.id, sent.threadId || null, providerHttpStatus, actionId).run();
  return Number(result.meta?.changes || 0) === 1;
}

function explicitGmailRejection(status, payload) {
  const error = payload?.error;
  const reasons = new Set((error?.errors || []).map((item) => String(item?.reason || "")));
  if (status === 400 && error?.status === "INVALID_ARGUMENT" && reasons.has("invalidArgument")) return "gmail_rejected_invalid_argument";
  if (status === 401 && error?.status === "UNAUTHENTICATED" && (reasons.has("authError") || reasons.has("invalidCredentials"))) return "gmail_rejected_unauthenticated";
  if (status === 403 && error?.status === "PERMISSION_DENIED" && reasons.has("insufficientPermissions")) return "gmail_rejected_insufficient_permissions";
  return null;
}

async function executeGmailAction(request, env, actions) {
  const body = await actionBody(request, ["action_id"]);
  if (body instanceof Response) return body;
  const actionId = String(body.action_id || "").toLowerCase();
  if (!/^[0-9a-f-]{36}$/.test(actionId)) return actionError("invalid_request", 400, "action_id must be a UUID");
  let row = await externalActionRow(env.DB, actionId);
  if (!row) return actionError("not_found", 404, "external action not found");
  if (row.action_type !== GMAIL_ACTION_TYPE) return actionError("action_type_mismatch", 409, "action_id does not identify a Gmail send action");
  if (["succeeded", "failed", "unknown"].includes(row.state)) return response(externalActionResult(row));

  if (row.state === "approved") {
    await actions.claimExternalAction(env.DB, actionId);
    row = await externalActionRow(env.DB, actionId);
  }
  if (row?.state === "pending" || row?.state === "expired") return actionError("action_not_approved", 409, "the external action is not approved");
  if (row?.state !== "claimed") return actionError("invalid_action_state", 409, "the external action cannot be executed");

  if (row.dispatch_started_at) {
    await persistStaleGmailDispatchUnknown(env.DB, actionId);
    return response(externalActionResult(await externalActionRow(env.DB, actionId)));
  }

  const expectedHash = await sha256Hex(`${row.action_type}\n${row.target_json}\n${row.payload_json}`);
  const message = row.content_hash === expectedHash ? storedGmailMessage(row) : null;
  if (!message) {
    await persistGmailFailure(env.DB, actionId, "external_action_integrity_failed", null, false);
    return response(externalActionResult(await externalActionRow(env.DB, actionId)));
  }

  let accessToken;
  try {
    accessToken = await googleAccessToken(env, [GMAIL_SEND_SCOPE]);
  } catch (error) {
    await persistGmailFailure(env.DB, actionId, error.code || "gmail_authorization_failed", null, false);
    return response(externalActionResult(await externalActionRow(env.DB, actionId)));
  }

  if (!await reserveGmailDispatch(env.DB, actionId)) {
    row = await externalActionRow(env.DB, actionId);
    if (row?.state === "claimed" && row.dispatch_started_at) await persistStaleGmailDispatchUnknown(env.DB, actionId);
    return response(externalActionResult(await externalActionRow(env.DB, actionId)));
  }

  let gmailResponse;
  try {
    gmailResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ raw: base64Url(gmailMime(message)) })
    });
  } catch {
    await persistGmailUnknown(env.DB, actionId, "gmail_network_ambiguous", null);
    return response(externalActionResult(await externalActionRow(env.DB, actionId)));
  }

  if (!gmailResponse.ok) {
    let providerPayload = null;
    try { providerPayload = await gmailResponse.json(); } catch { /* Unknown provider body remains ambiguous. */ }
    const rejection = explicitGmailRejection(gmailResponse.status, providerPayload);
    if (rejection) await persistGmailFailure(env.DB, actionId, rejection, gmailResponse.status, true);
    else await persistGmailUnknown(env.DB, actionId, "gmail_response_ambiguous", gmailResponse.status);
    return response(externalActionResult(await externalActionRow(env.DB, actionId)));
  }

  let sent;
  try { sent = await gmailResponse.json(); } catch { sent = null; }
  if (!sent?.id || typeof sent.id !== "string") {
    await persistGmailUnknown(env.DB, actionId, "gmail_response_ambiguous", gmailResponse.status);
    return response(externalActionResult(await externalActionRow(env.DB, actionId)));
  }
  await persistGmailSuccess(env.DB, actionId, sent, gmailResponse.status);
  return response(externalActionResult(await externalActionRow(env.DB, actionId)));
}

async function proposeGmailSend(request, env, actions) {
  const body = await actionBody(request, ["source_id", "to", "cc", "subject", "text"]);
  if (body instanceof Response) return body;
  const proposal = gmailProposal(body);
  if (!proposal) return actionError("invalid_request", 400, "source_id, recipients, a subject up to 200 characters and an email body up to 15000 characters are required");
  try {
    return response(await actions.proposeGmailExternalAction(env, proposal), 201);
  } catch (error) {
    if (error.message === "idempotency_conflict") return actionError("idempotency_conflict", 409, "the persisted source already proposes different Gmail content for this target");
    if (error.message === "source_id must identify an existing telegram command") return actionError("source_not_found", 409, "source_id must identify an existing Telegram command");
    throw error;
  }
}

async function gmailRecent(env, url) {
  const query = url.searchParams.get("query") || "in:inbox";
  const limit = readLimit(url.searchParams.get("limit"));
  if (!limit || query.length > MAX_QUERY_LENGTH) return actionError("invalid_request", 400, "query must contain at most 256 characters and limit must be 1 to 10");
  const accessToken = await googleAccessToken(env);
  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("q", query);
  listUrl.searchParams.set("maxResults", String(limit));
  const list = await fetch(listUrl, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!list.ok) throw Object.assign(new Error("Gmail search failed"), { status: 502, code: "gmail_search_failed" });
  const payload = await list.json();
  const messages = await Promise.all((payload.messages || []).map(async ({ id, threadId }) => {
    const messageUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}`);
    messageUrl.searchParams.set("format", "metadata");
    messageUrl.searchParams.append("metadataHeaders", "From");
    messageUrl.searchParams.append("metadataHeaders", "To");
    messageUrl.searchParams.append("metadataHeaders", "Subject");
    messageUrl.searchParams.append("metadataHeaders", "Date");
    const message = await fetch(messageUrl, { headers: { authorization: `Bearer ${accessToken}` } });
    if (!message.ok) throw Object.assign(new Error("Gmail message read failed"), { status: 502, code: "gmail_message_read_failed" });
    const details = await message.json();
    const headers = details.payload?.headers || [];
    return {
      id, thread_id: threadId,
      from: headerValue(headers, "from"), to: headerValue(headers, "to"), subject: headerValue(headers, "subject"), date: headerValue(headers, "date"),
      snippet: String(details.snippet || "").slice(0, 500)
    };
  }));
  return response({ query, messages, next_page_available: Boolean(payload.nextPageToken) });
}

async function notionRequest(env, path, init = {}) {
  if (!env.NOTION_TOKEN) throw Object.assign(new Error("Notion is not configured"), { status: 503, code: "notion_not_configured" });
  const result = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: { authorization: `Bearer ${env.NOTION_TOKEN}`, "notion-version": NOTION_VERSION, "content-type": "application/json", ...(init.headers || {}) }
  });
  if (!result.ok) throw Object.assign(new Error("Notion request failed"), { status: result.status === 401 || result.status === 403 ? 502 : 502, code: "notion_request_failed" });
  return result.json();
}

async function notionSearch(env, url) {
  const query = url.searchParams.get("query") || "";
  const limit = readLimit(url.searchParams.get("limit"));
  if (!query || query.length > MAX_QUERY_LENGTH || !limit) return actionError("invalid_request", 400, "query is required (at most 256 characters) and limit must be 1 to 10");
  const result = await notionRequest(env, "/search", {
    method: "POST", body: JSON.stringify({ query, page_size: limit, filter: { property: "object", value: "page" } })
  });
  return response({
    query,
    pages: (result.results || []).map((page) => ({ id: page.id, title: notionTitle(page.properties), url: page.url || null, last_edited_time: page.last_edited_time || null })),
    next_page_available: Boolean(result.has_more)
  });
}

async function notionPage(env, url) {
  const pageId = url.searchParams.get("page_id") || "";
  if (!/^[0-9a-f-]{32,36}$/i.test(pageId)) return actionError("invalid_request", 400, "page_id must be a Notion page identifier");
  const page = await notionRequest(env, `/pages/${encodeURIComponent(pageId)}`);
  return response({ id: page.id, title: notionTitle(page.properties), url: page.url || null, last_edited_time: page.last_edited_time || null, properties: page.properties || {} });
}

async function updateNotionPage(request, env) {
  let body;
  try { body = await request.json(); } catch { return actionError("invalid_request", 400, "a JSON body is required"); }
  const pageId = String(body?.page_id || "");
  const properties = body?.properties;
  if (body?.confirmed !== true) return actionError("explicit_confirmation_required", 409, "Set confirmed to true only after the owner has approved the exact CRM update.");
  if (!/^[0-9a-f-]{32,36}$/i.test(pageId) || !properties || typeof properties !== "object" || Array.isArray(properties) || Object.keys(properties).length > 30) {
    return actionError("invalid_request", 400, "page_id and up to 30 Notion properties are required");
  }
  const page = await notionRequest(env, `/pages/${encodeURIComponent(pageId)}`, { method: "PATCH", body: JSON.stringify({ properties }) });
  return response({ updated: true, id: page.id, title: notionTitle(page.properties), last_edited_time: page.last_edited_time || null });
}

async function createNotionPage(request, env) {
  let body;
  try { body = await request.json(); } catch { return actionError("invalid_request", 400, "a JSON body is required"); }
  const properties = body?.properties;
  if (body?.confirmed !== true) return actionError("explicit_confirmation_required", 409, "Set confirmed to true only after the owner has approved the exact CRM page to create.");
  if (!env.NOTION_DATA_SOURCE_ID || !properties || typeof properties !== "object" || Array.isArray(properties) || Object.keys(properties).length > 30) {
    return actionError("invalid_request", 400, "NOTION_DATA_SOURCE_ID and up to 30 Notion properties are required");
  }
  const page = await notionRequest(env, "/pages", { method: "POST", body: JSON.stringify({ parent: { type: "data_source_id", data_source_id: env.NOTION_DATA_SOURCE_ID }, properties }) });
  return response({ created: true, id: page.id, title: notionTitle(page.properties), url: page.url || null });
}

async function archiveNotionPage(request, env) {
  const pageId = new URL(request.url).searchParams.get("page_id") || "";
  if (!/^[0-9a-f-]{32,36}$/i.test(pageId)) return actionError("invalid_request", 400, "page_id must be a Notion page identifier");
  let body;
  try { body = await request.json(); } catch { return actionError("invalid_request", 400, "a JSON body with confirmed true is required"); }
  if (body?.confirmed !== true) return actionError("explicit_confirmation_required", 409, "Set confirmed to true only after the owner has approved archiving this exact CRM page.");
  const page = await notionRequest(env, `/pages/${encodeURIComponent(pageId)}`, { method: "PATCH", body: JSON.stringify({ archived: true }) });
  return response({ archived: true, id: page.id });
}

export const GPT_ACTIONS_OPENAPI = {
  openapi: "3.1.0",
  info: { title: "Belloria commercial actions", version: "1.0.0", description: "Private, read-first Gmail and Notion access. Notion writes require explicit confirmation." },
  servers: [{ url: "https://belloria-assistant.belloria-dvitulin.workers.dev" }],
  paths: {
    "/gpt-actions/status": { get: { operationId: "getIntegrationStatus", summary: "Read which private integrations are configured", responses: { "200": { description: "Integration status" } } } },
    "/gpt-actions/gmail/recent": { get: { operationId: "searchRecentGmail", summary: "Read recent Gmail metadata and snippets; never sends email", parameters: [{ name: "query", in: "query", schema: { type: "string" } }, { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 10 } }], responses: { "200": { description: "Messages" } } } },
    "/gpt-actions/gmail/send": { post: { operationId: "proposeGmailSend", summary: "Create and present an immutable Gmail proposal from a persisted Telegram command; this endpoint never sends email", requestBody: { required: true, content: { "application/json": { schema: { type: "object", additionalProperties: false, required: ["source_id", "to", "subject", "text"], properties: { source_id: { type: "string", pattern: "^[0-9]{1,20}$" }, to: { oneOf: [{ type: "string", format: "email" }, { type: "array", items: { type: "string", format: "email" } }] }, cc: { type: "array", items: { type: "string", format: "email" } }, subject: { type: "string" }, text: { type: "string" } } } } } }, responses: { "201": { description: "Pending external action presented in the private Telegram chat" }, "409": { description: "Unknown source or idempotency conflict" } } } },
    "/gpt-actions/gmail/execute": { post: { operationId: "executeApprovedGmailAction", summary: "Execute one approved Gmail action by action_id only; recipient and content are always reloaded from D1", requestBody: { required: true, content: { "application/json": { schema: { type: "object", additionalProperties: false, required: ["action_id"], properties: { action_id: { type: "string", pattern: "^[0-9a-fA-F-]{36}$" } } } } } }, responses: { "200": { description: "Persisted Gmail action state and, on success, Gmail message identifiers" }, "409": { description: "Action is not approved or is not a Gmail send" } } } },
    "/gpt-actions/notion/search": { get: { operationId: "searchNotionPages", summary: "Search CRM pages in Notion", parameters: [{ name: "query", in: "query", required: true, schema: { type: "string" } }, { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 10 } }], responses: { "200": { description: "Pages" } } } },
    "/gpt-actions/notion/page": {
      get: { operationId: "getNotionPage", summary: "Read a Notion CRM page", parameters: [{ name: "page_id", in: "query", required: true, schema: { type: "string" } }], responses: { "200": { description: "CRM page" } } },
      post: { operationId: "createNotionCrmPageAfterConfirmation", summary: "Create a CRM page only after the owner has approved its exact properties", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["properties", "confirmed"], properties: { properties: { type: "object" }, confirmed: { type: "boolean", const: true } } } } } }, responses: { "200": { description: "Created CRM page" } } },
      patch: { operationId: "updateNotionPageAfterConfirmation", summary: "Update a CRM page only after the owner explicitly confirms the exact properties", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["page_id", "properties", "confirmed"], properties: { page_id: { type: "string" }, properties: { type: "object" }, confirmed: { type: "boolean", const: true } } } } } }, responses: { "200": { description: "Updated CRM page" } } },
      delete: { operationId: "archiveNotionCrmPageAfterConfirmation", summary: "Archive a CRM page only after the owner has approved the exact page", parameters: [{ name: "page_id", in: "query", required: true, schema: { type: "string" } }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["confirmed"], properties: { confirmed: { type: "boolean", const: true } } } } } }, responses: { "200": { description: "Archived CRM page" } } }
    }
  },
  components: {
    schemas: {
      ApiError: {
        type: "object",
        properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" } } } }
      }
    },
    securitySchemes: { BearerAuth: { type: "http", scheme: "bearer" } }
  },
  security: [{ BearerAuth: [] }]
};

export async function gptActions(request, env, actions = {}) {
  const url = new URL(request.url);
  if (url.pathname === "/gpt-actions/openapi.json" && request.method === "GET") return response(GPT_ACTIONS_OPENAPI);
  if (!actionTokenIsValid(request, env)) return actionError("unauthorized", 401, "A valid Bearer token is required");
  try {
    if (url.pathname === "/gpt-actions/status" && request.method === "GET") return response({ gmail_read_send: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN), notion_crm: Boolean(env.NOTION_TOKEN && env.NOTION_DATA_SOURCE_ID), email_sending: true });
    if (url.pathname === "/gpt-actions/gmail/recent" && request.method === "GET") return gmailRecent(env, url);
    if (url.pathname === "/gpt-actions/gmail/send" && request.method === "POST") return proposeGmailSend(request, env, actions);
    if (url.pathname === "/gpt-actions/gmail/execute" && request.method === "POST") return executeGmailAction(request, env, actions);
    if (url.pathname === "/gpt-actions/notion/search" && request.method === "GET") return notionSearch(env, url);
    if (url.pathname === "/gpt-actions/notion/page" && request.method === "GET") return notionPage(env, url);
    if (url.pathname === "/gpt-actions/notion/page" && request.method === "POST") return createNotionPage(request, env);
    if (url.pathname === "/gpt-actions/notion/page" && request.method === "PATCH") return updateNotionPage(request, env);
    if (url.pathname === "/gpt-actions/notion/page" && request.method === "DELETE") return archiveNotionPage(request, env);
    return actionError("not_found", 404, "Action not found");
  } catch (error) {
    return actionError(error.code || "upstream_failed", error.status || 502, error.message || "The integration request failed");
  }
}
