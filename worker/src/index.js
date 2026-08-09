import { gptActions } from "./gpt-actions.js";

const TELEGRAM_VOICE_MAX_BYTES = 5 * 1024 * 1024;
const TELEGRAM_TEXT_MAX_CHARS = 4096;
const WHISPER_MODEL = "@cf/openai/whisper-large-v3-turbo";
const FAST_SNAPSHOT_MAX_AGE_MINUTES = 120;
const FAST_SNAPSHOT_LIMIT = 100;
const SMS_TEXT_MAX_CHARS = 160;

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
    name: "belloria_list_tally_submissions",
    description: "List technical metadata for pending Tally submissions without exposing form answers.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 20, default: 10 } },
      additionalProperties: false
    }
  },
  {
    name: "belloria_get_tally_submission_fallback",
    description: "Read one pending raw Tally payload by event ID only when the Tally connector is unavailable or cannot find the expected submission.",
    inputSchema: {
      type: "object",
      properties: { event_id: { type: "string", minLength: 1, maxLength: 100 } },
      required: ["event_id"],
      additionalProperties: false
    }
  },
  {
    name: "belloria_complete_tally_submission",
    description: "Mark one direct Tally submission as processed after its CRM synchronization succeeded.",
    inputSchema: {
      type: "object",
      properties: {
        event_id: { type: "string", minLength: 1, maxLength: 100 },
        confirmed: { type: "boolean", const: true }
      },
      required: ["event_id", "confirmed"],
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
    name: "belloria_refresh_fast_snapshots",
    description: "Replace temporary minimal prospect snapshots used by the Telegram fast path. Never include email bodies or conversation transcripts.",
    inputSchema: {
      type: "object",
      properties: {
        expires_in_minutes: { type: "integer", minimum: 5, maximum: FAST_SNAPSHOT_MAX_AGE_MINUTES, default: 90 },
        snapshots: {
          type: "array", maxItems: FAST_SNAPSHOT_LIMIT,
          items: {
            type: "object",
            properties: {
              prospect_id: { type: "string", minLength: 1, maxLength: 100 },
              label: { type: "string", minLength: 1, maxLength: 200 },
              aliases: { type: "array", maxItems: 10, items: { type: "string", minLength: 2, maxLength: 200 } },
              summary: { type: "string", minLength: 1, maxLength: 1500 },
              recommendation: { type: "string", minLength: 1, maxLength: 1500 },
              actions: {
                type: "object",
                properties: {
                  prepare_reply: { $ref: "#/$defs/action" },
                  prepare_quote: { $ref: "#/$defs/action" },
                  follow_up: { $ref: "#/$defs/action" }
                },
                additionalProperties: false
              },
              sources: { type: "array", maxItems: 20, items: { type: "string", minLength: 1, maxLength: 300 } },
              generated_at: { type: "string", format: "date-time" }
            },
            required: ["prospect_id", "label", "aliases", "summary", "recommendation", "actions", "sources", "generated_at"],
            additionalProperties: false
          }
        }
      },
      required: ["snapshots"],
      additionalProperties: false,
      $defs: {
        action: {
          type: "object",
          properties: {
            content: { type: "string", minLength: 1, maxLength: TELEGRAM_TEXT_MAX_CHARS },
            consequence: { type: "string", minLength: 1, maxLength: 1000 }
          },
          required: ["content", "consequence"], additionalProperties: false
        }
      }
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
    await processFastCommand(env, { ...command, content: text });
  } catch (error) {
    const code = cleanErrorCode(error, "voice_transcription_failed");
    await env.DB.prepare(
      "UPDATE telegram_commands SET voice_file_id = NULL, state = 'quarantined', updated_at = CURRENT_TIMESTAMP, last_error_code = ? WHERE command_id = ? AND state = 'transcribing'"
    ).bind(code, command.id).run();
    console.log(JSON.stringify({ event: "telegram_voice_quarantined", code }));
  }
}

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9@]+/g, " ").trim();
}

function parseFastCommand(text) {
  const value = normalize(text);
  if (value.startsWith("confirmer ")) return null;
  const patterns = [
    ["prepare_quote", ["prepare le devis"]],
    ["prepare_reply", ["prepare une reponse"]],
    ["follow_up", ["relance"]],
    ["summary", ["resume"]],
    ["recommendation", ["que lui proposer", "recommande", "proposer"]]
  ];
  for (const [intent, markers] of patterns) {
    for (const marker of markers) {
      const index = value.indexOf(marker);
      if (index >= 0) return { intent, query: value.slice(index + marker.length).trim() };
    }
  }
  return null;
}

function safeJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

async function setFastState(env, commandId, state, code = null, completed = false) {
  await env.DB.prepare(
    `UPDATE telegram_commands SET fast_path_state = ?, fast_path_finished_at = CURRENT_TIMESTAMP, fast_path_error_code = ?, updated_at = CURRENT_TIMESTAMP${completed ? ", state = 'completed', content = NULL" : ""} WHERE command_id = ? AND state = 'pending'`
  ).bind(state, code, commandId).run();
}

async function fastRefusal(env, commandId, code, text) {
  await sendText(env, text);
  await setFastState(env, commandId, "deferred", code, false);
}

function fastToken() {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(36).padStart(2, "0")).join("").toUpperCase();
}

async function processFastCommand(env, command) {
  const parsed = parseFastCommand(command.content);
  if (!parsed) return;
  try {
    const claimed = await env.DB.prepare(
      "UPDATE telegram_commands SET fast_path_state = 'processing', fast_path_started_at = CURRENT_TIMESTAMP, fast_path_error_code = NULL WHERE command_id = ? AND state = 'pending' AND fast_path_state IS NULL"
    ).bind(command.id).run();
    if (Number(claimed.meta?.changes || 0) !== 1) return;
    if (!parsed.query) {
      await fastRefusal(env, command.id, "prospect_missing", "Voie rapide : précisez le prospect. La demande reste disponible pour le passage de reprise.");
      return;
    }
    const result = await env.DB.prepare(
      "SELECT prospect_id, label, aliases_json, summary, recommendation, actions_json, sources_json, expires_at FROM telegram_prospect_snapshots ORDER BY updated_at DESC LIMIT ?"
    ).bind(FAST_SNAPSHOT_LIMIT).all();
    const now = Date.now();
    const candidates = (result.results || []).filter((row) => {
      const terms = [row.label, ...safeJson(row.aliases_json, [])].map(normalize);
      return terms.some((term) => term && (term.includes(parsed.query) || parsed.query.includes(term)));
    });
    const fresh = candidates.filter((row) => Date.parse(row.expires_at) > now);
    if (!candidates.length) {
      await fastRefusal(env, command.id, "snapshot_absent", "Voie rapide indisponible : aucun contexte temporaire ne correspond. La demande reste disponible pour le passage de reprise.");
      return;
    }
    if (!fresh.length) {
      await fastRefusal(env, command.id, "snapshot_expired", "Voie rapide indisponible : le contexte temporaire est périmé. La demande reste disponible pour le passage de reprise.");
      return;
    }
    if (fresh.length !== 1) {
      await fastRefusal(env, command.id, "snapshot_ambiguous", "Voie rapide indisponible : plusieurs prospects correspondent. Précisez le prospect ; la demande reste disponible pour la reprise.");
      return;
    }
    const snapshot = fresh[0];
    let reply;
    if (parsed.intent === "summary") reply = snapshot.summary;
    else if (parsed.intent === "recommendation") reply = snapshot.recommendation;
    else {
      const action = safeJson(snapshot.actions_json, {})[parsed.intent];
      if (!action?.content || !action?.consequence) {
        await fastRefusal(env, command.id, "action_unavailable", "Voie rapide indisponible : cette action n’est pas validée dans l’instantané. La demande reste disponible pour la reprise.");
        return;
      }
      const token = fastToken();
      const proposal = await proposeAction(env, {
        command_id: command.id, token, prospect: snapshot.label,
        sources: safeJson(snapshot.sources_json, []), content: action.content,
        consequence: action.consequence, expires_in_minutes: 10
      });
      if (!proposal.proposed) throw Object.assign(new Error("proposal rejected"), { code: "proposal_rejected" });
      reply = `Action proposée pour ${snapshot.label}\nContenu exact : ${action.content}\nConséquence : ${action.consequence}\nPour approuver : CONFIRMER ${token}`;
    }
    await sendText(env, reply);
    await setFastState(env, command.id, "replied", null, true);
    console.log(JSON.stringify({ event: "telegram_fast_path_replied", command_id: command.id }));
  } catch (error) {
    const code = cleanErrorCode(error, "fast_path_failed");
    await setFastState(env, command.id, "failed", code, false);
    console.log(JSON.stringify({ event: "telegram_fast_path_failed", code }));
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
    const work = command.kind === "voice" ? transcribeVoice(env, command) : processFastCommand(env, command);
    if (context?.waitUntil) context.waitUntil(work);
    else await work;
  }
  console.log(JSON.stringify({ event: "telegram_webhook_ingested", accepted: inserted ? 1 : 0, kind: command.kind }));
  return json({ accepted: inserted ? 1 : 0 });
}

function arrayBufferToBase64Signature(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

async function tallySignature(secret, rawBody) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return arrayBufferToBase64Signature(await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody)));
}

export function extractTallySubmission(document) {
  if (document?.eventType !== "FORM_RESPONSE" || typeof document.eventId !== "string" || !document.eventId) return null;
  const data = document.data;
  if (!data || typeof data.submissionId !== "string" || !data.submissionId || typeof data.formId !== "string" || !data.formId) return null;
  if (!Array.isArray(data.fields)) return null;
  return {
    eventId: document.eventId.slice(0, 100),
    submissionId: data.submissionId.slice(0, 100),
    formId: data.formId.slice(0, 100),
    formName: typeof data.formName === "string" ? data.formName.slice(0, 200) : null,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : (typeof document.createdAt === "string" ? document.createdAt : null),
    fields: data.fields
  };
}

function normalizedFieldLabel(field) {
  return String(field?.label || field?.key || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function normalizeFrenchMobile(value) {
  const compact = String(value || "").trim().replace(/[\s().-]/g, "");
  let digits = compact.startsWith("+") ? compact.slice(1) : compact;
  if (digits.startsWith("0033")) digits = digits.slice(2);
  if (/^0[67]\d{8}$/.test(digits)) digits = `33${digits.slice(1)}`;
  return /^33[67]\d{8}$/.test(digits) ? digits : null;
}

export function tallySmsRecipient(fields) {
  const candidates = (fields || [])
    .filter((field) => ["PHONE_NUMBER", "INPUT_PHONE_NUMBER"].includes(field?.type) || /(?:telephone|mobile|portable)/.test(normalizedFieldLabel(field)))
    .map((field) => normalizeFrenchMobile(field.value))
    .filter(Boolean);
  return new Set(candidates).size === 1 ? candidates[0] : null;
}

function tallyFieldStringValues(field) {
  const values = Array.isArray(field?.value) ? field.value : [field?.value];
  const options = new Map((field?.options || []).map((option) => [option?.id, option?.text]));
  return values
    .map((value) => options.get(value) || value)
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => value.trim());
}

function isSensitiveTallyField(field) {
  const label = normalizedFieldLabel(field);
  return ["PHONE_NUMBER", "INPUT_PHONE_NUMBER", "EMAIL", "INPUT_EMAIL"].includes(field?.type)
    || /(?:e-?mail|courriel|telephone|tel\b|mobile|portable|phone|adresse)/.test(label);
}

function telegramTallyText(value, maxLength = 300) {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, maxLength) : null;
}

export function tallyTelegramContent(submission) {
  const details = (submission?.fields || [])
    .filter((field) => !isSensitiveTallyField(field))
    .map((field) => {
      const label = telegramTallyText(String(field?.label || field?.key || ""), 80);
      const values = tallyFieldStringValues(field).map((value) => telegramTallyText(value)).filter(Boolean);
      return label && values.length ? `${label} : ${[...new Set(values)].join(", ")}` : null;
    })
    .filter(Boolean);
  const header = `Nouvelle demande Tally${submission?.formName ? ` — ${telegramTallyText(submission.formName, 120)}` : ""}`;
  const content = [header, ...details].join("\n");
  return content.length <= TELEGRAM_TEXT_MAX_CHARS ? content : content.slice(0, TELEGRAM_TEXT_MAX_CHARS - 1).trimEnd() + "…";
}

function tallyFieldValue(fields, labelPattern) {
  const values = (fields || [])
    .filter((field) => labelPattern.test(normalizedFieldLabel(field)))
    .flatMap(tallyFieldStringValues);
  return new Set(values).size === 1 ? values[0] : null;
}

function safeSmsText(value, maxLength) {
  if (!value || value.length > 100) return null;
  const ascii = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9' -]/g, "").replace(/\s+/g, " ").trim();
  return ascii && ascii.length <= maxLength ? ascii : null;
}

function frenchSmsDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  const months = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];
  return `${day} ${months[month - 1]} ${year}`;
}

export function tallySmsContent(fields) {
  const fullName = safeSmsText(tallyFieldValue(fields, /^(?:prenom|nom|nom et prenom|prenom et nom|nom complet|votre nom et prenom)$/), 50);
  const name = fullName?.split(/\s+/)[0] || null;
  const safeEventName = safeSmsText(tallyFieldValue(fields, /^(?:type d'evenement|evenement|type de prestation|nom de l'evenement|quel type d'evenement envisagez-vous\?)$/), 40);
  const eventName = safeEventName ? `${safeEventName[0].toLowerCase()}${safeEventName.slice(1)}` : null;
  const eventDate = frenchSmsDate(tallyFieldValue(fields, /^(?:date|date de l'evenement|date de votre evenement|quand)$/));
  if (!name || !eventName || !eventDate) return null;
  const content = `Bonjour ${name}, merci pour votre demande. Votre ${eventName} du ${eventDate} est enregistre. Nous vous recontacterons rapidement. Cyndy & Dimitri, Belloria`;
  return content.length <= SMS_TEXT_MAX_CHARS ? content : null;
}

async function recordSmsResult(env, eventId, status, messageId = null, errorCode = null) {
  await env.DB.prepare(
    "UPDATE tally_submissions SET sms_status = ?, sms_provider_id = ?, sms_error_code = ?, sms_updated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE event_id = ? AND sms_status = 'pending'"
  ).bind(status, messageId, errorCode, eventId).run();
}

async function sendTallySms(env, submission) {
  const recipient = tallySmsRecipient(submission.fields);
  if (!recipient) return recordSmsResult(env, submission.eventId, "skipped", null, "invalid_or_ambiguous_phone");
  const content = tallySmsContent(submission.fields);
  if (!content) return recordSmsResult(env, submission.eventId, "skipped", null, "missing_or_invalid_sms_personalization");
  if (!env.BREVO_API_KEY || !env.BREVO_SMS_SENDER) return recordSmsResult(env, submission.eventId, "skipped", null, "sms_not_configured");

  try {
    const response = await fetch("https://api.brevo.com/v3/transactionalSMS/send", {
      method: "POST",
      headers: { accept: "application/json", "api-key": env.BREVO_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        sender: env.BREVO_SMS_SENDER,
        recipient,
        content,
        type: "transactional",
        tag: submission.eventId,
        unicodeEnabled: false
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.messageId) {
      const error = new Error("Brevo rejected the transactional SMS");
      error.code = `brevo_http_${response.status}`;
      throw error;
    }
    await recordSmsResult(env, submission.eventId, "accepted", String(payload.messageId));
    console.log(JSON.stringify({ event: "tally_sms_accepted" }));
  } catch (error) {
    await recordSmsResult(env, submission.eventId, "failed", null, cleanErrorCode(error, "sms_send_failed"));
    console.log(JSON.stringify({ event: "tally_sms_failed", code: cleanErrorCode(error, "sms_send_failed") }));
  }
}

async function brevoSmsWebhook(request, env) {
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
  const authorization = request.headers.get("authorization") || "";
  if (!env.BREVO_WEBHOOK_TOKEN || !timingSafeEqual(authorization, `Bearer ${env.BREVO_WEBHOOK_TOKEN}`)) return json({ error: "unauthorized" }, 401);
  let payload;
  try { payload = await request.json(); } catch { return json({ error: "invalid json" }, 400); }
  const messageId = String(payload?.messageId || "");
  const providerStatus = String(payload?.msg_status || "").toLowerCase();
  if (!messageId || !providerStatus) {
    const nested = payload && typeof payload.data === "object" && payload.data ? payload.data : null;
    const shape = {
      event: "brevo_sms_invalid_event",
      root_keys: payload && typeof payload === "object" ? Object.keys(payload).sort() : [],
      data_keys: nested ? Object.keys(nested).sort() : []
    };
    console.log(JSON.stringify(shape));
    return json({ error: "invalid event" }, 400);
  }
  const tags = Array.isArray(payload.tag) ? payload.tag : [payload.tag];
  const eventId = tags.map((value) => String(value || "")).find((value) => value && value.length <= 128) || "";
  const status = providerStatus === "delivered" ? "delivered"
    : ["soft_bounce", "hard_bounce", "rejected", "blocked", "skip", "blacklisted"].includes(providerStatus) ? "failed"
      : "accepted";
  const errorCode = status === "failed" ? `brevo_${providerStatus}` : null;
  const result = eventId
    ? await env.DB.prepare(
      "UPDATE tally_submissions SET sms_status = ?, sms_provider_id = COALESCE(sms_provider_id, ?), sms_error_code = ?, sms_updated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE (sms_provider_id = ? OR (event_id = ? AND sms_status = 'pending')) AND ((? = 'accepted' AND sms_status = 'pending') OR (? = 'failed' AND sms_status IN ('pending', 'accepted')) OR (? = 'delivered' AND sms_status IN ('pending', 'accepted', 'failed')))"
    ).bind(status, messageId, errorCode, messageId, eventId, status, status, status).run()
    : await env.DB.prepare(
      "UPDATE tally_submissions SET sms_status = ?, sms_error_code = ?, sms_updated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE sms_provider_id = ? AND ((? = 'accepted' AND sms_status = 'pending') OR (? = 'failed' AND sms_status IN ('pending', 'accepted')) OR (? = 'delivered' AND sms_status IN ('pending', 'accepted', 'failed')))"
    ).bind(status, errorCode, messageId, status, status, status).run();
  console.log(JSON.stringify({ event: "tally_sms_status", status, matched: Number(result.meta?.changes || 0) }));
  return json({ accepted: Number(result.meta?.changes || 0) > 0 ? 1 : 0 });
}

async function notifyTallyIngestion(env, submission) {
  try {
    await sendTextToChat(env, tallyTelegramContent(submission), env.TELEGRAM_NOTIFICATION_CHAT_ID || env.TELEGRAM_ALLOWED_CHAT_ID);
    console.log(JSON.stringify({ event: "tally_telegram_ack_sent" }));
  } catch (error) {
    console.log(JSON.stringify({ event: "tally_telegram_ack_failed", code: cleanErrorCode(error, "telegram_ack_failed") }));
  }
}

async function tallyWebhook(request, env, context) {
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!env.TALLY_WEBHOOK_SECRET || !env.TALLY_FORM_ID) return json({ error: "unauthorized" }, 401);
  const rawBody = await request.text();
  const suppliedSignature = request.headers.get("tally-signature") || "";
  const expectedSignature = await tallySignature(env.TALLY_WEBHOOK_SECRET, rawBody);
  if (!timingSafeEqual(suppliedSignature, expectedSignature)) return json({ error: "unauthorized" }, 401);

  let document;
  try { document = JSON.parse(rawBody); } catch { return json({ error: "invalid json" }, 400); }
  const submission = extractTallySubmission(document);
  if (!submission) return json({ error: "invalid event" }, 400);
  if (!timingSafeEqual(submission.formId, env.TALLY_FORM_ID)) return json({ error: "form not allowed" }, 403);

  const result = await env.DB.prepare(
    "INSERT INTO tally_submissions (event_id, submission_id, form_id, form_name, submitted_at, payload_json) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING"
  ).bind(submission.eventId, submission.submissionId, submission.formId, submission.formName, submission.createdAt, JSON.stringify(document)).run();
  const inserted = Number(result.meta?.changes || 0) === 1;
  if (inserted && context?.waitUntil) {
    context.waitUntil(Promise.all([notifyTallyIngestion(env, submission), sendTallySms(env, submission)]));
  }
  console.log(JSON.stringify({ event: "tally_webhook_ingested", accepted: inserted ? 1 : 0, form_id: submission.formId }));
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

async function listTallySubmissions(env, limit) {
  const result = await env.DB.prepare(
    "SELECT event_id, submission_id, form_id, form_name, submitted_at, created_at, sms_status, sms_provider_id, sms_error_code, sms_updated_at FROM tally_submissions WHERE state = 'pending' ORDER BY created_at LIMIT ?"
  ).bind(limit).all();
  return (result.results || []).map((row) => ({
    event_id: row.event_id,
    submission_id: row.submission_id,
    form_id: row.form_id,
    form_name: row.form_name,
    submitted_at: row.submitted_at,
    received_at: row.created_at,
    sms_status: row.sms_status,
    sms_provider_id: row.sms_provider_id || undefined,
    sms_error_code: row.sms_error_code || undefined,
    sms_updated_at: row.sms_updated_at || undefined
  }));
}

async function getTallySubmissionFallback(env, eventId) {
  const id = requiredText(eventId, "event_id", 100);
  const result = await env.DB.prepare(
    "SELECT payload_json FROM tally_submissions WHERE event_id = ? AND state = 'pending' LIMIT 1"
  ).bind(id).all();
  const row = result.results?.[0];
  return row ? { found: true, event_id: id, payload: safeJson(row.payload_json, {}) } : { found: false, event_id: id };
}

async function completeTallySubmission(env, eventId) {
  const id = requiredText(eventId, "event_id", 100);
  const result = await env.DB.prepare(
    "UPDATE tally_submissions SET state = 'processed', payload_json = NULL, processed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE event_id = ? AND state = 'pending'"
  ).bind(id).run();
  return { completed: Number(result.meta?.changes || 0) === 1 };
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

function validateSnapshot(snapshot) {
  const text = (value, maximum) => typeof value === "string" && value.trim() && value.length <= maximum;
  if (!snapshot || !text(snapshot.prospect_id, 100) || !text(snapshot.label, 200) || !text(snapshot.summary, 1500) || !text(snapshot.recommendation, 1500)) return false;
  if (!Array.isArray(snapshot.aliases) || snapshot.aliases.length > 10 || snapshot.aliases.some((item) => !text(item, 200))) return false;
  if (!Array.isArray(snapshot.sources) || snapshot.sources.length > 20 || snapshot.sources.some((item) => !text(item, 300))) return false;
  if (!snapshot.actions || typeof snapshot.actions !== "object" || Array.isArray(snapshot.actions)) return false;
  if (Object.keys(snapshot.actions).some((key) => !["prepare_reply", "prepare_quote", "follow_up"].includes(key))) return false;
  if (Object.values(snapshot.actions).some((action) => !action || !text(action.content, TELEGRAM_TEXT_MAX_CHARS) || !text(action.consequence, 1000))) return false;
  return Number.isFinite(Date.parse(snapshot.generated_at));
}

async function refreshFastSnapshots(env, args) {
  const minutes = args.expires_in_minutes === undefined ? 90 : args.expires_in_minutes;
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > FAST_SNAPSHOT_MAX_AGE_MINUTES) throw new Error("expires_in_minutes must be an integer from 5 to 120");
  if (!Array.isArray(args.snapshots) || args.snapshots.length > FAST_SNAPSHOT_LIMIT || args.snapshots.some((item) => !validateSnapshot(item))) throw new Error("snapshots contain invalid or excessive data");
  const statements = [env.DB.prepare("DELETE FROM telegram_prospect_snapshots").bind()];
  for (const snapshot of args.snapshots) {
    statements.push(env.DB.prepare(
      "INSERT INTO telegram_prospect_snapshots (prospect_id, label, aliases_json, summary, recommendation, actions_json, sources_json, generated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime(?, ?))"
    ).bind(snapshot.prospect_id, snapshot.label, JSON.stringify(snapshot.aliases), snapshot.summary, snapshot.recommendation,
      JSON.stringify(snapshot.actions), JSON.stringify(snapshot.sources), snapshot.generated_at, snapshot.generated_at, `+${minutes} minutes`));
  }
  await env.DB.batch(statements);
  return { refreshed: args.snapshots.length, expires_in_minutes: minutes };
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
  return sendTextToChat(env, text, env.TELEGRAM_ALLOWED_CHAT_ID);
}

async function sendTextToChat(env, text, chatId) {
  if (!chatId) throw new Error("Telegram chat is not configured");
  if (!text || text.length > TELEGRAM_TEXT_MAX_CHARS) throw new Error(`text must contain 1 to ${TELEGRAM_TEXT_MAX_CHARS} characters`);
  const result = await telegramApi(env, "sendMessage", { chat_id: chatId, text });
  return { sent: true, message_id: result?.message_id };
}

async function mcp(request, env) {
  let message;
  try { message = await request.json(); } catch { return json({ error: "invalid request" }, 400); }
  const id = message.id;
  if (message.method === "initialize") return rpcResult(id, { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "belloria-mcp", version: "0.4.0" } });
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
    } else if (name === "belloria_list_tally_submissions") {
      const limit = args.limit === undefined ? 10 : args.limit;
      if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error("limit must be an integer from 1 to 20");
      value = { submissions: await listTallySubmissions(env, limit) };
    } else if (name === "belloria_get_tally_submission_fallback") {
      value = await getTallySubmissionFallback(env, args.event_id || "");
    } else if (name === "belloria_complete_tally_submission") {
      if (args.confirmed !== true) throw new Error("explicit confirmation is required");
      value = await completeTallySubmission(env, args.event_id || "");
    } else if (name === "belloria_refresh_fast_snapshots") {
      value = await refreshFastSnapshots(env, args);
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
  if (path.startsWith("/gpt-actions/")) return gptActions(request, env);
  if (path === "/health" && request.method === "GET") return json({ status: "ok", channel: "telegram" });
  if (path === "/webhooks/telegram") return telegramWebhook(request, env, context);
  if (path === "/webhooks/tally") return tallyWebhook(request, env, context);
  if (path === "/webhooks/brevo-sms") return brevoSmsWebhook(request, env);
  return json({ error: "not found" }, 404);
}

export function createWorkerEntrypoint(oauthProvider) {
  return {
    fetch(request, env, context) {
      const path = new URL(request.url).pathname;
      if (path.startsWith("/gpt-actions/") || path === "/health" || path === "/webhooks/telegram" || path === "/webhooks/tally" || path === "/webhooks/brevo-sms") {
        return handleRequest(request, env, context);
      }
      return oauthProvider.fetch(request, env, context);
    }
  };
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
