/**
 * Minimal Google Gemini client for browser use, built on the **Interactions API**
 * (`POST /v1beta/interactions`). Google retired `generateContent` access to older models for new
 * users (e.g. gemini-2.5-flash, gemini-flash-latest), and new-style keys (`AQ.…`) only work here.
 *
 * - The API key is the USER'S OWN free key (Google AI Studio), stored on-device and sent only to
 *   generativelanguage.googleapis.com in the `x-goog-api-key` header. Never bundle a key in the app.
 * - The endpoint supports CORS for browser origins (e.g. https://<user>.github.io).
 * - Free-tier requests may be used by Google to improve its products; the app shows AI_PRIVACY_NOTICE
 *   and requires consent before any request.
 * - Responses are requested as JSON constrained by a JSON schema (`response_format`), then validated with Zod.
 * - Free-tier quotas are PER MODEL (Flash-Lite ≈ 15 RPM / 500 RPD, Flash ≈ 5 RPM / 20 RPD, Nov 2026).
 *   A per-model client-side limiter fails fast instead of wasting quota, and a rate-limited model
 *   falls back to the next one; temporary "high demand" (503) errors are retried, then the next model.
 */

export type GeminiErrorCode =
  | 'NO_KEY'
  | 'INVALID_KEY'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'OVERLOADED'
  | 'MODEL_NOT_FOUND'
  | 'BLOCKED'
  | 'OFFLINE'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'HTTP'
  | 'INVALID_RESPONSE';

export class GeminiError extends Error {
  constructor(
    readonly code: GeminiErrorCode,
    message: string,
    readonly status?: number,
    /** Seconds to wait before retrying (rate limits). */
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'GeminiError';
  }
}

/** OpenAPI-subset schema accepted by Gemini `responseSchema`. */
export interface GeminiSchema {
  type: 'OBJECT' | 'ARRAY' | 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN';
  properties?: Record<string, GeminiSchema>;
  required?: string[];
  items?: GeminiSchema;
  enum?: string[];
  description?: string;
  nullable?: boolean;
}

export type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };

/** Interactions API input content. */
type InteractionContent = { type: 'text'; text: string } | { type: 'image'; data: string; mime_type: string };

export interface GenerateJsonOptions {
  system: string;
  parts: GeminiPart[];
  schema: GeminiSchema;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface GeminiClientOptions {
  apiKey: string;
  model: string;
  /** Tried in order when the configured model is not found (free model names change over time). */
  fallbackModels?: string[];
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Client-side cap per model. Default: FREE_TIER_RPM for the model (5 if unknown). */
  maxRequestsPerMinute?: number;
  /** For tests. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/**
 * Flash-Lite has the most generous free tier (≈ 15 requests/min, 500/day vs ≈ 5/min, 20/day for
 * Flash) and handles images, so it is the default; Flash is the first fallback (separate quota).
 * Pro models have a free-tier limit of 0. gemini-3.8-flash is newer but was frequently slow/timing out.
 */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
export const GEMINI_FALLBACK_MODELS = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];
/** Former defaults: stored settings still using them move to the current default. */
export const PREVIOUS_DEFAULT_GEMINI_MODELS = ['gemini-3.5-flash'];
/** Total time budget across fallbacks for one request. */
const TOTAL_BUDGET_MS = 40_000;
/** Models Google no longer serves to new users; stored settings using them are migrated. */
export const RETIRED_GEMINI_MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
export const FREE_TIER_REQUESTS_PER_MINUTE = 5;
/** Free-tier requests per minute by model (Google AI Studio, Nov 2026). Unknown models: 5. */
export const FREE_TIER_RPM: Readonly<Record<string, number>> = {
  'gemini-3.5-flash-lite': 15,
  'gemini-3.1-flash-lite': 15,
  'gemini-3.5-flash': 5,
  'gemini-3.8-flash': 5,
};

/** Shared across client instances: quotas are per key AND per model, not per object. */
const requestLogs = new Map<string, number[]>();
/** Clears the limiter (tests). */
export function resetGeminiRateLimiter(): void {
  requestLogs.clear();
}

interface GeminiErrorBody {
  error?: { code?: number; message?: string; status?: string; details?: { reason?: string }[] };
}

export class GeminiClient {
  private readonly opts: Required<Omit<GeminiClientOptions, 'fetchImpl' | 'sleep' | 'now' | 'maxRequestsPerMinute'>> & {
    maxRequestsPerMinute: number | undefined;
    fetchImpl: typeof fetch;
    sleep: (ms: number) => Promise<void>;
    now: () => number;
  };

  constructor(opts: GeminiClientOptions) {
    if (!opts.apiKey) throw new GeminiError('NO_KEY', 'No Gemini API key configured');
    this.opts = {
      apiKey: opts.apiKey,
      model: opts.model || DEFAULT_GEMINI_MODEL,
      fallbackModels: opts.fallbackModels ?? GEMINI_FALLBACK_MODELS,
      baseUrl: (opts.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, ''),
      timeoutMs: opts.timeoutMs ?? 25_000,
      fetchImpl: opts.fetchImpl ?? ((...a) => globalThis.fetch(...a)),
      maxRequestsPerMinute: opts.maxRequestsPerMinute,
      sleep: opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
      now: opts.now ?? Date.now,
    };
  }

  /** Model that actually answered the last successful request. */
  lastModel: string | null = null;

  /** Sends one interaction and returns the parsed JSON object (unvalidated: callers validate). */
  async generateJson(options: GenerateJsonOptions): Promise<unknown> {
    const models = [this.opts.model, ...this.opts.fallbackModels.filter((m) => m !== this.opts.model)];
    const started = this.opts.now();
    let lastErr: GeminiError | null = null;
    let rateLimited: GeminiError | null = null;
    for (const model of models) {
      try {
        const out = await this.callWithRetry(model, options);
        this.lastModel = model;
        return out;
      } catch (e) {
        // Rate-limited (quotas are per model), retired/unknown model, sustained overload or a hung
        // model → try the next one (within budget).
        const code = e instanceof GeminiError ? e.code : null;
        const retryable = code === 'RATE_LIMITED' || code === 'MODEL_NOT_FOUND' || code === 'OVERLOADED' || code === 'TIMEOUT';
        if (!retryable) throw e;
        lastErr = e as GeminiError;
        if (code === 'RATE_LIMITED') {
          const err = e as GeminiError;
          // Keep the soonest retry time across models.
          if (!rateLimited || (err.retryAfterSeconds ?? Infinity) < (rateLimited.retryAfterSeconds ?? Infinity)) rateLimited = err;
        }
        if (code === 'TIMEOUT' && this.opts.now() - started > TOTAL_BUDGET_MS - this.opts.timeoutMs) break;
      }
    }
    // Every model was limited → report the limit (with the shortest wait) rather than e.g. a 404.
    if (rateLimited && lastErr?.code !== 'TIMEOUT' && lastErr?.code !== 'OVERLOADED') throw rateLimited;
    throw lastErr ?? new GeminiError('MODEL_NOT_FOUND', 'No available Gemini model');
  }

  private async callWithRetry(model: string, o: GenerateJsonOptions): Promise<unknown> {
    try {
      return await this.callModel(model, o);
    } catch (e) {
      if (e instanceof GeminiError && e.code === 'OVERLOADED') {
        await this.opts.sleep(1500);
        return this.callModel(model, o);
      }
      throw e;
    }
  }

  private takeRateToken(model: string) {
    const t = this.opts.now();
    const max = this.opts.maxRequestsPerMinute ?? FREE_TIER_RPM[model] ?? FREE_TIER_REQUESTS_PER_MINUTE;
    const log = requestLogs.get(model) ?? [];
    requestLogs.set(model, log);
    while (log.length && t - log[0]! >= 60_000) log.shift();
    if (log.length >= max) {
      const wait = Math.ceil((60_000 - (t - log[0]!)) / 1000);
      throw new GeminiError('RATE_LIMITED', `Free Gemini limit for ${model} is ${max} requests per minute; try again in ${wait}s`, 429, wait);
    }
    log.push(t);
  }

  private async callModel(model: string, o: GenerateJsonOptions): Promise<unknown> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new GeminiError('OFFLINE', 'Device is offline');
    this.takeRateToken(model);
    const input: InteractionContent[] = o.parts.map((p) =>
      'text' in p ? { type: 'text', text: p.text } : { type: 'image', data: p.inline_data.data, mime_type: p.inline_data.mime_type },
    );
    const body = {
      model,
      system_instruction: o.system,
      input,
      response_format: toJsonSchema(o.schema),
      generation_config: {
        temperature: o.temperature ?? 0.2,
        max_output_tokens: o.maxOutputTokens ?? 4096,
        // Keeps latency low on the free tier; answers here don't need deep reasoning.
        thinking_level: 'low',
      },
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
    let res: Response;
    try {
      res = await this.opts.fetchImpl(`${this.opts.baseUrl}/interactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.opts.apiKey },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      if (controller.signal.aborted) throw new GeminiError('TIMEOUT', 'The AI service did not respond in time');
      throw new GeminiError('NETWORK', `Network error: ${(e as Error)?.message ?? e}`);
    }
    clearTimeout(timer);

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      // Google answers some unknown/retired model routes with an empty 404.
      if (res.status === 404) throw new GeminiError('MODEL_NOT_FOUND', `Model ${model} is not available`, 404);
      throw new GeminiError(res.ok ? 'INVALID_RESPONSE' : 'HTTP', `AI service returned a non-JSON response (${res.status})`, res.status);
    }

    if (!res.ok) throw mapError(res.status, json as GeminiErrorBody);

    const data = json as {
      status?: string;
      steps?: { type?: string; content?: { type?: string; text?: string }[] }[];
      outputs?: { type?: string; text?: string }[];
    };
    // 'incomplete' = output token limit reached; the partial text is still tried below.
    if (data.status && data.status !== 'completed' && data.status !== 'incomplete') {
      throw new GeminiError(/block|safety/i.test(data.status) ? 'BLOCKED' : 'INVALID_RESPONSE', `AI interaction ended with status "${data.status}"`);
    }
    const fromSteps = (data.steps ?? []).filter((st) => st.type === 'model_output').flatMap((st) => st.content ?? []);
    const text = [...fromSteps, ...(data.outputs ?? [])]
      .filter((c) => !c.type || c.type === 'text')
      .map((c) => c.text ?? '')
      .join('');
    if (!text.trim()) throw new GeminiError('INVALID_RESPONSE', data.status === 'incomplete' ? 'AI answer was cut off (output limit)' : 'AI service returned an empty answer');
    try {
      return JSON.parse(stripFences(text));
    } catch {
      throw new GeminiError('INVALID_RESPONSE', 'AI answer was not valid JSON');
    }
  }
}

/** Converts the OpenAPI-style schema (uppercase types) to standard JSON Schema for `response_format`. */
export function toJsonSchema(s: GeminiSchema): Record<string, unknown> {
  const out: Record<string, unknown> = { type: s.type.toLowerCase() };
  if (s.description) out.description = s.description;
  if (s.enum) out.enum = s.enum;
  if (s.properties) out.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, toJsonSchema(v)]));
  if (s.required) out.required = s.required;
  if (s.items) out.items = toJsonSchema(s.items);
  return out;
}

function stripFences(text: string): string {
  const t = text.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(t);
  return m ? m[1]! : t;
}

function mapError(status: number, body: GeminiErrorBody): GeminiError {
  const msg = body.error?.message ?? `HTTP ${status}`;
  const reason = body.error?.details?.map((d) => d.reason).find(Boolean);
  const st = body.error?.status;
  if (reason === 'API_KEY_INVALID' || (status === 400 && /api key/i.test(msg))) return new GeminiError('INVALID_KEY', 'The Gemini API key is not valid', status);
  if (status === 429 || st === 'RESOURCE_EXHAUSTED') {
    const m = /retry in (\d+(?:\.\d+)?)\s*s/i.exec(msg);
    const wait = m ? Math.ceil(Number(m[1])) : undefined;
    return new GeminiError('RATE_LIMITED', wait ? `Free Gemini limit reached; try again in ${wait}s` : 'Free Gemini quota reached; try again later', status, wait);
  }
  if (status === 503 || st === 'UNAVAILABLE') return new GeminiError('OVERLOADED', 'Gemini is busy right now; try again in a moment', status);
  if (status === 404 || st === 'NOT_FOUND') return new GeminiError('MODEL_NOT_FOUND', msg, status);
  if (status === 401 || status === 403 || st === 'PERMISSION_DENIED' || st === 'UNAUTHENTICATED') return new GeminiError('PERMISSION_DENIED', msg, status);
  return new GeminiError('HTTP', msg, status);
}

/** Base64-encodes binary data (chunked; works in browsers and Node). */
export function bytesToBase64(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}
