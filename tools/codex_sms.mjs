import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_URL = "https://belloria-assistant.belloria-dvitulin.workers.dev";

function usage() {
  return `Usage:
  npm run sms:codex -- propose --to +33612345678 --text "... STOP au [STOP_CODE]" --consent "source du consentement" --key intent-unique [--expires 30]
  npm run sms:codex -- send --action <uuid> --confirm
  npm run sms:codex -- status --action <uuid>`;
}

function localConfig() {
  try {
    return Object.fromEntries(readFileSync(resolve(".env.codex-sms"), "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

function parseArguments(values) {
  const options = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) throw new Error(`unexpected argument: ${value}`);
    const name = value.slice(2);
    if (name === "confirm") {
      options.confirm = true;
      continue;
    }
    const next = values[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`missing value for --${name}`);
    options[name] = next;
    index += 1;
  }
  return options;
}

async function callApi(baseUrl, token, path, method, body) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json().catch(() => ({ error: "invalid_response" }));
  if (!response.ok) throw new Error(`SMS request failed (${response.status}): ${payload.error || "unknown_error"}`);
  return payload;
}

async function main() {
  const [command, ...rawArguments] = process.argv.slice(2);
  if (!command || command === "--help" || command === "help") {
    console.log(usage());
    return;
  }
  const options = parseArguments(rawArguments);
  const config = localConfig();
  const token = process.env.BELLORIA_CODEX_SMS_TOKEN || config.BELLORIA_CODEX_SMS_TOKEN;
  const baseUrl = process.env.BELLORIA_CODEX_SMS_URL || config.BELLORIA_CODEX_SMS_URL || DEFAULT_URL;
  if (!token) throw new Error("BELLORIA_CODEX_SMS_TOKEN is required in .env.codex-sms or the environment");

  let result;
  if (command === "propose") {
    if (!options.to || !options.text || !options.consent || !options.key) throw new Error("propose requires --to, --text, --consent and --key");
    const expiry = options.expires === undefined ? undefined : Number(options.expires);
    if (options.expires !== undefined && !Number.isInteger(expiry)) throw new Error("--expires must be an integer");
    result = await callApi(baseUrl, token, "/internal/codex-sms/proposals", "POST", {
      recipient: options.to,
      content: options.text,
      consent_reference: options.consent,
      idempotency_key: options.key,
      ...(expiry === undefined ? {} : { expires_in_minutes: expiry })
    });
  } else if (command === "send") {
    if (!options.action || !options.confirm) throw new Error("send requires --action and --confirm after the user approved the exact SMS");
    result = await callApi(baseUrl, token, "/internal/codex-sms/execute", "POST", { action_id: options.action });
  } else if (command === "status") {
    if (!options.action) throw new Error("status requires --action");
    result = await callApi(baseUrl, token, `/internal/codex-sms/actions/${encodeURIComponent(options.action)}`, "GET");
  } else {
    throw new Error(`unknown command: ${command}`);
  }
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
