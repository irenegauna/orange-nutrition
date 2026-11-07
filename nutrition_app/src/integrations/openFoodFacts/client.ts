import { APP_CONTACT, APP_NAME, APP_VERSION } from '../../core/constants/app';
import { offResponseSchema, type OffProduct } from './schema';

/**
 * Minimal Open Food Facts read client (no API key, free).
 *
 * Etiquette / limits (https://openfoodfacts.github.io/openfoodfacts-server/api/):
 * - Product reads are limited to ~100 requests/minute per IP. We enforce a stricter client-side limit.
 * - Apps should identify themselves with a User-Agent "AppName/Version (contact)". Browsers do NOT allow
 *   scripts to set the User-Agent header (it is silently dropped / forbidden in Safari), so in browsers we
 *   send `app_name` / `app_version` query parameters instead and only set the header outside browsers.
 * - Data is ODbL: attribute "Open Food Facts" wherever product data is shown.
 */

export type OffErrorCode = 'OFFLINE' | 'TIMEOUT' | 'NETWORK' | 'RATE_LIMITED' | 'HTTP' | 'INVALID_RESPONSE';

export class OpenFoodFactsError extends Error {
  constructor(
    readonly code: OffErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'OpenFoodFactsError';
  }
}

export type OffFetchResult = { status: 'found'; product: OffProduct } | { status: 'not_found' };

export interface OffClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  /** Max requests per rolling minute (client-side). */
  maxRequestsPerMinute?: number;
  fetchImpl?: typeof fetch;
  /** For tests. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const FIELDS = [
  'code',
  'product_name_es',
  'generic_name_es',
  'product_name',
  'product_name_en',
  'generic_name',
  'brands',
  'quantity',
  'serving_size',
  'serving_quantity',
  'nutrition_data_per',
  'nutriments',
  'allergens_tags',
  'traces_tags',
  'ingredients_analysis_tags',
  'categories_tags',
  'image_front_small_url',
].join(',');

const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined';

export class OpenFoodFactsClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly maxPerMinute: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly inFlight = new Map<string, Promise<OffFetchResult>>();
  private requestTimes: number[] = [];

  constructor(opts: OffClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? 'https://world.openfoodfacts.org').replace(/\/$/, '');
    this.timeoutMs = opts.timeoutMs ?? 8000;
    this.maxRetries = opts.maxRetries ?? 2;
    this.maxPerMinute = opts.maxRequestsPerMinute ?? 30;
    this.fetchImpl = opts.fetchImpl ?? ((...a) => globalThis.fetch(...a));
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** Fetches a product. Concurrent calls for the same barcode share one request. */
  fetchProduct(barcode: string): Promise<OffFetchResult> {
    const existing = this.inFlight.get(barcode);
    if (existing) return existing;
    const p = this.doFetch(barcode).finally(() => this.inFlight.delete(barcode));
    this.inFlight.set(barcode, p);
    return p;
  }

  private takeRateToken() {
    const t = this.now();
    this.requestTimes = this.requestTimes.filter((x) => t - x < 60_000);
    if (this.requestTimes.length >= this.maxPerMinute) throw new OpenFoodFactsError('RATE_LIMITED', 'Too many barcode lookups; try again in a minute');
    this.requestTimes.push(t);
  }

  private async doFetch(barcode: string): Promise<OffFetchResult> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new OpenFoodFactsError('OFFLINE', 'Device is offline');
    const url = `${this.baseUrl}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}&lc=es&app_name=${encodeURIComponent(APP_NAME)}&app_version=${APP_VERSION}`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (!isBrowser()) headers['User-Agent'] = `${APP_NAME}/${APP_VERSION} (${APP_CONTACT})`;

    let attempt = 0;
    for (;;) {
      this.takeRateToken();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let res: Response;
      try {
        res = await this.fetchImpl(url, { headers, signal: controller.signal });
      } catch (e) {
        clearTimeout(timer);
        const timedOut = controller.signal.aborted;
        if (attempt < this.maxRetries) {
          await this.sleep(400 * 2 ** attempt++);
          continue;
        }
        throw new OpenFoodFactsError(timedOut ? 'TIMEOUT' : 'NETWORK', timedOut ? 'Open Food Facts did not respond in time' : `Network error: ${(e as Error)?.message ?? e}`);
      }
      clearTimeout(timer);

      if (res.status === 429) throw new OpenFoodFactsError('RATE_LIMITED', 'Open Food Facts rate limit reached', 429);
      if (res.status >= 500) {
        if (attempt < this.maxRetries) {
          await this.sleep(400 * 2 ** attempt++);
          continue;
        }
        throw new OpenFoodFactsError('HTTP', `Open Food Facts error ${res.status}`, res.status);
      }

      let body: unknown;
      try {
        body = await res.json();
      } catch {
        if (res.status === 404) return { status: 'not_found' };
        throw new OpenFoodFactsError('INVALID_RESPONSE', 'Response was not JSON', res.status);
      }
      const parsed = offResponseSchema.safeParse(body);
      if (!parsed.success) throw new OpenFoodFactsError('INVALID_RESPONSE', 'Unexpected response shape', res.status);
      const statusNum = Number(parsed.data.status);
      if (res.status === 404 || statusNum === 0 || !parsed.data.product) return { status: 'not_found' };
      if (!res.ok) throw new OpenFoodFactsError('HTTP', `Open Food Facts error ${res.status}`, res.status);
      return { status: 'found', product: parsed.data.product };
    }
  }
}
