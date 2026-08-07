const GMAIL_READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
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

async function sendGmail(request, env) {
  let body;
  try { body = await request.json(); } catch { return actionError("invalid_request", 400, "a JSON body is required"); }
  const to = Array.isArray(body?.to) ? body.to : [body?.to];
  const cc = body?.cc === undefined ? [] : (Array.isArray(body.cc) ? body.cc : [body.cc]);
  const subject = String(body?.subject || "").trim();
  const text = String(body?.text || "").trim();
  if (body?.confirmed !== true) return actionError("explicit_confirmation_required", 409, "Set confirmed to true only after the owner has approved the exact recipients, subject and email body.");
  if (!to.length || to.length > 20 || ![...to, ...cc].every((email) => validEmail(String(email))) || !subject || subject.length > 200 || !text || text.length > 15000) {
    return actionError("invalid_request", 400, "valid recipients, a subject up to 200 characters and an email body up to 15000 characters are required");
  }
  const accessToken = await googleAccessToken(env, [GMAIL_SEND_SCOPE]);
  const mime = [
    `To: ${to.join(", ")}`,
    cc.length ? `Cc: ${cc.join(", ")}` : null,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    text
  ].filter((line) => line !== null).join("\r\n");
  const result = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST", headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" }, body: JSON.stringify({ raw: base64Url(mime) })
  });
  if (!result.ok) throw Object.assign(new Error("Gmail send failed"), { status: 502, code: "gmail_send_failed" });
  const sent = await result.json();
  return response({ sent: true, id: sent.id || null, thread_id: sent.threadId || null, recipients: to, subject });
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
    "/gpt-actions/gmail/send": { post: { operationId: "sendGmailAfterConfirmation", summary: "Send an email from Gmail only after the owner has approved the exact recipients, subject and body", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["to", "subject", "text", "confirmed"], properties: { to: { oneOf: [{ type: "string", format: "email" }, { type: "array", items: { type: "string", format: "email" } }] }, cc: { type: "array", items: { type: "string", format: "email" } }, subject: { type: "string" }, text: { type: "string" }, confirmed: { type: "boolean", const: true } } } } } }, responses: { "200": { description: "Sent Gmail message" } } } },
    "/gpt-actions/notion/search": { get: { operationId: "searchNotionPages", summary: "Search CRM pages in Notion", parameters: [{ name: "query", in: "query", required: true, schema: { type: "string" } }, { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 10 } }], responses: { "200": { description: "Pages" } } } },
    "/gpt-actions/notion/page": {
      get: { operationId: "getNotionPage", summary: "Read a Notion CRM page", parameters: [{ name: "page_id", in: "query", required: true, schema: { type: "string" } }], responses: { "200": { description: "CRM page" } } },
      post: { operationId: "createNotionCrmPageAfterConfirmation", summary: "Create a CRM page only after the owner has approved its exact properties", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["properties", "confirmed"], properties: { properties: { type: "object" }, confirmed: { type: "boolean", const: true } } } } } }, responses: { "200": { description: "Created CRM page" } } },
      patch: { operationId: "updateNotionPageAfterConfirmation", summary: "Update a CRM page only after the owner explicitly confirms the exact properties", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["page_id", "properties", "confirmed"], properties: { page_id: { type: "string" }, properties: { type: "object" }, confirmed: { type: "boolean", const: true } } } } } }, responses: { "200": { description: "Updated CRM page" } } },
      delete: { operationId: "archiveNotionCrmPageAfterConfirmation", summary: "Archive a CRM page only after the owner has approved the exact page", parameters: [{ name: "page_id", in: "query", required: true, schema: { type: "string" } }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["confirmed"], properties: { confirmed: { type: "boolean", const: true } } } } } }, responses: { "200": { description: "Archived CRM page" } } }
    }
  },
  components: { securitySchemes: { BearerAuth: { type: "http", scheme: "bearer" } } }, security: [{ BearerAuth: [] }]
};

export async function gptActions(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/gpt-actions/openapi.json" && request.method === "GET") return response(GPT_ACTIONS_OPENAPI);
  if (!actionTokenIsValid(request, env)) return actionError("unauthorized", 401, "A valid Bearer token is required");
  try {
    if (url.pathname === "/gpt-actions/status" && request.method === "GET") return response({ gmail_read_send: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN), notion_crm: Boolean(env.NOTION_TOKEN && env.NOTION_DATA_SOURCE_ID), email_sending: true });
    if (url.pathname === "/gpt-actions/gmail/recent" && request.method === "GET") return gmailRecent(env, url);
    if (url.pathname === "/gpt-actions/gmail/send" && request.method === "POST") return sendGmail(request, env);
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
