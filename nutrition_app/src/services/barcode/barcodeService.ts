import type { CachedProduct, Food } from '../../core/types/domain';
import { DataError } from '../../core/utils/errors';
import { cacheRepository, foodRepository } from '../../data/repositories';
import { OpenFoodFactsClient, OpenFoodFactsError, type OffErrorCode } from '../../integrations/openFoodFacts/client';
import { normalizeOffProduct } from '../../integrations/openFoodFacts/normalize';
import { createCustomFood, type CustomFoodInput } from '../food/foodService';

export const FOUND_TTL_DAYS = 30;
export const NOT_FOUND_TTL_DAYS = 7;

let client = new OpenFoodFactsClient();

/** Replace the OFF client (tests, custom timeout/base URL). */
export function configureOpenFoodFacts(next: OpenFoodFactsClient): void {
  client = next;
}

/** Strips spaces/dashes; returns null when the input cannot be a GTIN/EAN/UPC. */
export function normalizeBarcode(input: string): string | null {
  const digits = input.replace(/[\s-]/g, '');
  return /^\d{6,14}$/.test(digits) ? digits : null;
}

/** GS1 check-digit validation for EAN-8, UPC-A (12), EAN-13 and GTIN-14. */
export function isValidGtin(code: string): boolean {
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export type BarcodeLookupResult =
  | { status: 'found'; food: Food; origin: 'local' | 'cache' | 'network' | 'stale_cache' }
  | { status: 'not_found'; origin: 'cache' | 'network'; barcode: string }
  | { status: 'invalid'; barcode: string }
  | { status: 'error'; code: OffErrorCode; message: string; barcode: string };

const addDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86_400_000).toISOString();

/**
 * Full barcode lookup with explicit outcome (recommended for UI):
 * 1. foods table (user foods & previously saved products) — works offline
 * 2. fresh cache entry (found or negative)
 * 3. Open Food Facts (deduped, rate-limited, timeout, retries)
 * 4. on network failure, a stale cache entry if one exists
 */
export async function lookupBarcode(input: string, opts: { forceRefresh?: boolean } = {}): Promise<BarcodeLookupResult> {
  const barcode = normalizeBarcode(input);
  if (!barcode) return { status: 'invalid', barcode: input };

  if (!opts.forceRefresh) {
    const local = await foodRepository.findByBarcode(barcode);
    if (local && local.source.type === 'user') return { status: 'found', food: local, origin: 'local' };
  }

  const now = new Date().toISOString();
  const cached = await cacheRepository.get(barcode);
  if (cached && !opts.forceRefresh && cached.expiresAt > now) {
    if (cached.status === 'found' && cached.food) return { status: 'found', food: cached.food, origin: 'cache' };
    if (cached.status === 'not_found') return { status: 'not_found', origin: 'cache', barcode };
  }

  try {
    const res = await client.fetchProduct(barcode);
    if (res.status === 'not_found') {
      await cacheRepository.put({ barcode, status: 'not_found', fetchedAt: now, expiresAt: addDays(now, NOT_FOUND_TTL_DAYS) });
      return { status: 'not_found', origin: 'network', barcode };
    }
    const food = normalizeOffProduct(barcode, res.product, now);
    const saved = await foodRepository.put(food); // available offline & in search afterwards
    const entry: CachedProduct = { barcode, status: 'found', food: saved, fetchedAt: now, expiresAt: addDays(now, FOUND_TTL_DAYS) };
    await cacheRepository.put(entry);
    return { status: 'found', food: saved, origin: 'network' };
  } catch (e) {
    if (e instanceof OpenFoodFactsError) {
      if (cached?.status === 'found' && cached.food) return { status: 'found', food: cached.food, origin: 'stale_cache' };
      const local = await foodRepository.findByBarcode(barcode);
      if (local) return { status: 'found', food: local, origin: 'local' };
      return { status: 'error', code: e.code, message: e.message, barcode };
    }
    throw e;
  }
}

/**
 * Convenience API: resolves a Food, `null` when the product does not exist.
 * Throws DataError('UNAVAILABLE') on network failures with no cached copy, and
 * DataError('VALIDATION') for malformed barcodes — so the UI can offer manual entry.
 */
export async function getFoodByBarcode(barcode: string): Promise<Food | null> {
  const r = await lookupBarcode(barcode);
  switch (r.status) {
    case 'found':
      return r.food;
    case 'not_found':
      return null;
    case 'invalid':
      throw new DataError('VALIDATION', `"${barcode}" no es un código de barras válido`);
    case 'error':
      throw new DataError('UNAVAILABLE', r.message, { code: r.code });
  }
}

/** Manual-entry fallback: saves a user food bound to the barcode (wins over OFF on next scan). */
export async function createFoodForBarcode(barcode: string, input: Omit<CustomFoodInput, 'barcode'>): Promise<Food> {
  const code = normalizeBarcode(barcode);
  if (!code) throw new DataError('VALIDATION', `"${barcode}" no es un código de barras válido`);
  return createCustomFood({ ...input, barcode: code });
}

export const purgeExpiredProductCache = () => cacheRepository.purgeExpired();
