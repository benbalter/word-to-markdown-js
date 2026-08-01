// Minimal Azure OpenAI (AI Foundry) chat-completions client.
//
// Deliberately dependency-free: a raw `fetch` against the REST endpoint so the
// credit-funded generator scripts don't pull an SDK into the repo. Reads config
// from the environment (see scripts/README.md):
//
//   AZURE_OPENAI_ENDPOINT      https://<resource>.openai.azure.com
//   AZURE_OPENAI_API_KEY       resource key
//   AZURE_OPENAI_DEPLOYMENT    chat model deployment name, e.g. gpt-4o
//   AZURE_OPENAI_API_VERSION   e.g. 2024-08-01-preview  (optional; sensible default)
//
// Every raw model response is written to disk *before* parsing (dumpRaw) so a
// downstream bug can never waste the one night of credits — the JSON can be
// re-processed offline afterwards.
import fs from 'fs';
import path from 'path';

const DEFAULT_API_VERSION = '2024-08-01-preview';

export function azureConfig() {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  const apiVersion =
    process.env.AZURE_OPENAI_API_VERSION || DEFAULT_API_VERSION;
  const missing = [
    ['AZURE_OPENAI_ENDPOINT', endpoint],
    ['AZURE_OPENAI_API_KEY', apiKey],
    ['AZURE_OPENAI_DEPLOYMENT', deployment],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    throw new Error(
      `Missing Azure env var(s): ${missing.join(', ')}. See scripts/README.md.`,
    );
  }
  return {
    endpoint: endpoint.replace(/\/$/, ''),
    apiKey,
    deployment,
    apiVersion,
  };
}

/** Persist a raw value to disk (pretty JSON), creating parent dirs. */
export function dumpRaw(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body =
    typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  fs.writeFileSync(file, body);
}

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

// Some deployments (notably the GPT-5 / o-series family) reject the classic
// Chat Completions parameters: they require `max_completion_tokens` instead of
// `max_tokens`, only accept the default temperature, and may not support
// `response_format`. Rather than hard-code per-model rules, we send the classic
// payload first and, on a 400 that names an unsupported parameter, drop/rename
// it and retry. Adaptations are sticky within a process so we only pay the
// probe cost once.
const compat = {
  maxTokensKey: 'max_tokens',
  temperature: true,
  jsonMode: true,
};

function buildPayload({ messages, json, temperature, maxTokens }) {
  // Reasoning-family deployments (which use max_completion_tokens) spend part of
  // the budget on hidden reasoning tokens, so give the visible answer headroom.
  const budget =
    compat.maxTokensKey === 'max_completion_tokens'
      ? Math.max(maxTokens, 8000)
      : maxTokens;
  const payload = { messages, [compat.maxTokensKey]: budget };
  if (compat.temperature) payload.temperature = temperature;
  if (json && compat.jsonMode)
    payload.response_format = { type: 'json_object' };
  return payload;
}

// Returns true if it adapted `compat` (so the caller should retry), false if the
// 400 is not a known parameter issue.
function adaptFrom400(text) {
  const t = text.toLowerCase();
  let adapted = false;
  if (
    compat.maxTokensKey === 'max_tokens' &&
    t.includes('max_completion_tokens')
  ) {
    compat.maxTokensKey = 'max_completion_tokens';
    adapted = true;
  }
  if (compat.temperature && t.includes('temperature')) {
    compat.temperature = false;
    adapted = true;
  }
  if (compat.jsonMode && t.includes('response_format')) {
    compat.jsonMode = false;
    adapted = true;
  }
  return adapted;
}

/**
 * One chat completion. Returns { content, raw } where `content` is the assistant
 * message text and `raw` is the full API response object. Retries transient
 * failures (429 / 5xx / network) with exponential backoff, and self-heals from
 * 400s caused by unsupported parameters (see `compat` above).
 *
 * @param {object} opts
 * @param {Array<{role:string,content:string}>} opts.messages
 * @param {boolean} [opts.json]         request response_format json_object
 * @param {number}  [opts.temperature]
 * @param {number}  [opts.maxTokens]
 * @param {number}  [opts.retries]
 */
export async function chat({
  messages,
  json = false,
  temperature = 0.4,
  maxTokens = 4096,
  retries = 5,
}) {
  const { endpoint, apiKey, deployment, apiVersion } = azureConfig();
  const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(Math.min(1000 * 2 ** attempt, 30_000));
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
        body: JSON.stringify(
          buildPayload({ messages, json, temperature, maxTokens }),
        ),
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`Azure ${res.status}: ${await res.text()}`);
        continue;
      }
      if (!res.ok) {
        const text = await res.text();
        // A 400 from an unsupported parameter is fixable — adapt and retry
        // (without consuming an attempt, since the payload was the problem).
        if (res.status === 400 && adaptFrom400(text)) {
          attempt--;
          continue;
        }
        throw new Error(`Azure ${res.status}: ${text}`);
      }
      const raw = await res.json();
      const content = raw.choices?.[0]?.message?.content ?? '';
      return { content, raw };
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(
    `chat() failed after ${retries} retries: ${lastErr?.message}`,
  );
}

/** Best-effort extraction of a JSON object/array from a model reply. Tolerates
 * ```json fences and leading/trailing prose (needed when a deployment doesn't
 * support response_format and the compat layer drops JSON mode). */
function extractJson(content) {
  try {
    return JSON.parse(content);
  } catch {
    // fall through
  }
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      // fall through
    }
  }
  const start = content.search(/[{[]/);
  const end = Math.max(content.lastIndexOf('}'), content.lastIndexOf(']'));
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(content.slice(start, end + 1));
    } catch {
      // fall through
    }
  }
  return null;
}

/** chat() that parses the assistant content as JSON (with json mode on). */
export async function chatJson(opts) {
  const { content, raw } = await chat({ ...opts, json: true });
  const parsed = extractJson(content);
  if (parsed == null) {
    throw new Error(
      `Model did not return valid JSON:\n${content.slice(0, 500)}`,
    );
  }
  return { parsed, content, raw };
}
