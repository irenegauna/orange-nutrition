import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeminiClient, resetGeminiRateLimiter, toJsonSchema } from '../integrations/gemini';
import {
  acceptAiPrivacyNotice,
  configureAiFetch,
  getAiSettings,
  getAiSettingsPublic,
  getPhotoBlob,
  getSmartSuggestions,
  logPhotoMeal,
  recognizeMealPhoto,
  revokeAiConsent,
  setAiApiKey,
  testAiConnection,
  updateAiSettings,
  purgeOrphanPhotos,
} from '../services/ai';
import { deleteMealEntry } from '../services/meals';
import { setAllergies, setMacroGoals } from '../services/goals';
import { getDailySummary } from '../services/history';
import { exportBackupJson } from '../services/backup';
import { seedDatabase } from '../data/seed';
import { getDb } from '../data/db';
import { freshDb } from './helpers';

const KEY = 'AIzaTestKey1234567890';
const gemini = (obj: unknown) => new Response(JSON.stringify({ status: 'completed', steps: [{ type: 'thought', signature: 'x' }, { type: 'model_output', content: [{ type: 'text', text: JSON.stringify(obj) }] }] }), { status: 200 });
const geminiErr = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]).buffer;

async function enableAi(fetchImpl: (...a: unknown[]) => Promise<Response>) {
  configureAiFetch(fetchImpl as unknown as typeof fetch);
  await setAiApiKey(KEY);
  await acceptAiPrivacyNotice();
  await updateAiSettings({ photoRecognitionEnabled: true, aiSuggestionsEnabled: true });
}

beforeEach(() => resetGeminiRateLimiter());
afterEach(() => configureAiFetch(undefined));

describe('Gemini client', () => {
  it('sends key in header, schema-constrained JSON, and parses the answer', async () => {
    const fetchImpl = vi.fn(async () => gemini({ ok: true }));
    const c = new GeminiClient({ apiKey: KEY, model: 'm1', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await c.generateJson({ system: 's', parts: [{ text: 'hi' }], schema: { type: 'OBJECT' } })).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(KEY);
    expect(url).not.toContain(KEY);
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ model: 'm1', system_instruction: 's', input: [{ type: 'text', text: 'hi' }], response_format: { type: 'object' } });
    expect(body.generation_config.thinking_level).toBe('low');
  });

  it('maps errors from the real API shape', async () => {
    const bad = new GeminiClient({ apiKey: KEY, model: 'm', fetchImpl: (async () => geminiErr(400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } })) as unknown as typeof fetch });
    await expect(bad.generateJson({ system: '', parts: [], schema: { type: 'OBJECT' } })).rejects.toMatchObject({ code: 'INVALID_KEY' });
    const limited = new GeminiClient({ apiKey: KEY, model: 'm', fetchImpl: (async () => geminiErr(429, { error: { status: 'RESOURCE_EXHAUSTED', message: 'quota' } })) as unknown as typeof fetch });
    await expect(limited.generateJson({ system: '', parts: [], schema: { type: 'OBJECT' } })).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    const empty = new GeminiClient({ apiKey: KEY, model: 'm', fetchImpl: (async () => new Response(JSON.stringify({ status: 'completed', steps: [] }))) as unknown as typeof fetch });
    await expect(empty.generateJson({ system: '', parts: [], schema: { type: 'OBJECT' } })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    const limitedWithWait = new GeminiClient({ apiKey: KEY, model: 'm', fetchImpl: (async () => geminiErr(429, { error: { message: 'Rate limit exceeded (limit: 5 requests per minute on Free Tier). Please retry in 50s.' } })) as unknown as typeof fetch });
    await expect(limitedWithWait.generateJson({ system: '', parts: [], schema: { type: 'OBJECT' } })).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfterSeconds: 50 });
  });

  it('falls back to another model when the configured one is gone (incl. Google\'s empty 404)', async () => {
    const modelOf = (init: RequestInit) => JSON.parse(init.body as string).model as string;
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => (modelOf(init) === 'old-model' ? new Response('', { status: 404 }) : gemini({ ok: 1 })));
    const c = new GeminiClient({ apiKey: KEY, model: 'old-model', fallbackModels: ['new-model'], fetchImpl: fetchImpl as unknown as typeof fetch });
    await c.generateJson({ system: '', parts: [], schema: { type: 'OBJECT' } });
    expect(c.lastModel).toBe('new-model');
  });

  it('retries "high demand" 503s, then moves to the next model', async () => {
    const calls: string[] = [];
    const fetchImpl = async (_url: string, init: RequestInit) => {
      const m = JSON.parse(init.body as string).model as string;
      calls.push(m);
      return m === 'busy' ? geminiErr(503, { error: { code: 503, status: 'UNAVAILABLE', message: 'high demand' } }) : gemini({ ok: 1 });
    };
    const c = new GeminiClient({ apiKey: KEY, model: 'busy', fallbackModels: ['calm'], fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => {} });
    expect(await c.generateJson({ system: '', parts: [], schema: { type: 'OBJECT' } })).toEqual({ ok: 1 });
    expect(calls).toEqual(['busy', 'busy', 'calm']);
  });

  it('enforces the free-tier limit client-side without spending quota', async () => {
    const fetchImpl = vi.fn(async () => gemini({ ok: 1 }));
    let t = 1_000_000;
    const c = new GeminiClient({ apiKey: KEY, model: 'm', fetchImpl: fetchImpl as unknown as typeof fetch, maxRequestsPerMinute: 2, now: () => t });
    await c.generateJson({ system: '', parts: [], schema: { type: 'OBJECT' } });
    await c.generateJson({ system: '', parts: [], schema: { type: 'OBJECT' } });
    await expect(c.generateJson({ system: '', parts: [], schema: { type: 'OBJECT' } })).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfterSeconds: 60 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    t += 61_000;
    await c.generateJson({ system: '', parts: [], schema: { type: 'OBJECT' } });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('converts schemas to JSON Schema and sends images as interaction content', async () => {
    expect(toJsonSchema({ type: 'OBJECT', properties: { a: { type: 'ARRAY', items: { type: 'STRING', enum: ['x'] } } }, required: ['a'] })).toEqual({
      type: 'object',
      properties: { a: { type: 'array', items: { type: 'string', enum: ['x'] } } },
      required: ['a'],
    });
    const fetchImpl = vi.fn(async () => gemini({ ok: 1 }));
    const c = new GeminiClient({ apiKey: KEY, model: 'm', fetchImpl: fetchImpl as unknown as typeof fetch });
    await c.generateJson({ system: '', parts: [{ text: 'what is it' }, { inline_data: { mime_type: 'image/jpeg', data: 'AAAA' } }], schema: { type: 'OBJECT' } });
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.input[1]).toEqual({ type: 'image', data: 'AAAA', mime_type: 'image/jpeg' });
  });

  it('moves on to the next model when one hangs', async () => {
    const fetchImpl = (_: unknown, init?: RequestInit) => {
      const m = JSON.parse(init!.body as string).model;
      if (m === 'slow') return new Promise<Response>((_, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))));
      return Promise.resolve(gemini({ ok: 2 }));
    };
    const c = new GeminiClient({ apiKey: KEY, model: 'slow', fallbackModels: ['fast'], timeoutMs: 10, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await c.generateJson({ system: '', parts: [], schema: { type: 'OBJECT' } })).toEqual({ ok: 2 });
    expect(c.lastModel).toBe('fast');
  });

  it('times out', async () => {
    const fetchImpl = (_: unknown, init?: RequestInit) => new Promise<Response>((_, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))));
    const c = new GeminiClient({ apiKey: KEY, model: 'm', timeoutMs: 10, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(c.generateJson({ system: '', parts: [], schema: { type: 'OBJECT' } })).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
});

describe('AI settings & consent', () => {
  beforeEach(async () => {
    await freshDb();
  });

  it('AI is off by default and cannot be enabled without key and consent', async () => {
    const s = await getAiSettingsPublic();
    expect(s).toMatchObject({ hasApiKey: false, photoRecognitionAvailable: false, aiSuggestionsAvailable: false });
    await expect(updateAiSettings({ photoRecognitionEnabled: true })).rejects.toMatchObject({ code: 'VALIDATION' });
    await setAiApiKey(KEY);
    await expect(updateAiSettings({ photoRecognitionEnabled: true })).rejects.toThrow(/privacidad/);
    await acceptAiPrivacyNotice();
    const on = await updateAiSettings({ photoRecognitionEnabled: true });
    expect(on).toMatchObject({ photoRecognitionAvailable: true, aiSuggestionsAvailable: false, apiKeyHint: '…7890' });
    expect(JSON.stringify(on)).not.toContain(KEY);
    const off = await revokeAiConsent();
    expect(off.photoRecognitionAvailable).toBe(false);
    expect((await getAiSettings()).apiKey).toBe(KEY);
    expect((await revokeAiConsent(true)).hasApiKey).toBe(false);
  });

  it('testAiConnection reports success and failure', async () => {
    configureAiFetch((async () => gemini({ ok: true })) as unknown as typeof fetch);
    await setAiApiKey(KEY);
    expect(await testAiConnection()).toMatchObject({ ok: false, code: 'NO_CONSENT' });
    await acceptAiPrivacyNotice();
    expect(await testAiConnection()).toMatchObject({ ok: true });
    configureAiFetch((async () => geminiErr(400, { error: { message: 'API key not valid', details: [{ reason: 'API_KEY_INVALID' }] } })) as unknown as typeof fetch);
    expect(await testAiConnection()).toMatchObject({ ok: false, code: 'INVALID_KEY' });
  });

  it('the API key is never included in backups', async () => {
    await setAiApiKey(KEY);
    const { json } = await exportBackupJson({ includeSeedFoods: true });
    expect(json).not.toContain(KEY);
  });
});

describe('photo recognition', () => {
  beforeEach(async () => {
    await freshDb();
    await seedDatabase();
  });

  const detection = {
    isFood: true,
    description: 'Grilled chicken with rice and broccoli',
    items: [
      { name: 'chicken breast, grilled', searchTerms: ['chicken breast', 'chicken'], estimatedGrams: 150, confidence: 0.9, preparation: 'grilled', calories: 9999 },
      { name: 'white rice, cooked', searchTerms: ['rice'], estimatedGrams: 180, confidence: 0.85, preparation: 'cooked' },
      { name: 'broccoli, steamed', searchTerms: ['broccoli'], estimatedGrams: 80, confidence: 0.8, preparation: 'steamed' },
      { name: 'dragonfruit sorbet', searchTerms: ['pitaya'], estimatedGrams: 60, confidence: 0.4 },
    ],
  };

  it('throws UNAVAILABLE when AI photo recognition is off', async () => {
    await expect(recognizeMealPhoto(JPEG)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });

  it('maps detections to database foods, computing nutrition locally (never from the AI)', async () => {
    const fetchImpl = vi.fn(async () => gemini(detection));
    await enableAi(fetchImpl);
    const r = await recognizeMealPhoto(JPEG, { mealType: 'dinner' });
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.input[1]).toMatchObject({ type: 'image', mime_type: 'image/jpeg' });
    expect(r.items).toHaveLength(4);
    const [chicken, rice, broccoli, sorbet] = r.items;
    expect(chicken!.selectedFoodId).toBe('usda_171477'); // roasted (cooked) breast, not raw
    expect(rice!.selectedFoodId).toBe('usda_168878'); // cooked, not dry
    expect(broccoli!.selectedFoodId).toBe('usda_169967'); // boiled (cooked)
    expect(sorbet!.selectedFoodId).toBeNull();
    expect(r.unmatchedCount).toBe(1);
    // chicken: 150 g of USDA roasted breast (165 kcal/100 g)
    expect(chicken!.nutrients.energy?.amount).toBeCloseTo(247.5, 6);
    expect(r.totals.energy.amount).toBeLessThan(1000); // the fake "calories: 9999" is ignored
    expect(r.photoId).toBeDefined();
    expect((await getPhotoBlob(r.photoId!))?.size).toBe(JPEG.byteLength);
  });

  it('logs only user-confirmed items with the photo attached; deleting entries removes the photo', async () => {
    await enableAi(async () => gemini(detection));
    const r = await recognizeMealPhoto(JPEG);
    const confirmed = r.items.filter((i) => i.selectedFoodId).map((i) => ({ foodId: i.selectedFoodId!, grams: i.id === r.items[1]!.id ? 200 : i.grams }));
    const entries = await logPhotoMeal({ date: '2026-11-07', mealType: 'dinner', items: confirmed, photoId: r.photoId! });
    expect(entries).toHaveLength(3);
    expect(entries.every((e) => e.origin === 'photo_ai' && e.photoId === r.photoId)).toBe(true);
    expect(entries[1]!.grams).toBe(200); // user-edited grams win
    expect((await getDailySummary('2026-11-07')).entryCount).toBe(3);
    for (const e of entries.slice(0, 2)) await deleteMealEntry(e.id);
    expect(await getDb().photos.count()).toBe(1); // still used by the third entry
    await deleteMealEntry(entries[2]!.id);
    expect(await getDb().photos.count()).toBe(0);
  });

  it('rejects empty confirmations and unknown foods atomically', async () => {
    await expect(logPhotoMeal({ date: '2026-11-07', mealType: 'lunch', items: [] })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(logPhotoMeal({ date: '2026-11-07', mealType: 'lunch', items: [{ foodId: 'usda_173944', grams: 100 }, { foodId: 'nope', grams: 50 }] })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await getDailySummary('2026-11-07')).entryCount).toBe(0);
  });

  it('handles non-food photos, provider errors and garbage answers', async () => {
    await enableAi(async () => gemini({ isFood: false, description: 'a cat', items: [] }));
    const r = await recognizeMealPhoto(JPEG, { savePhoto: false });
    expect(r.isFood).toBe(false);
    expect(r.items).toEqual([]);
    expect(r.photoId).toBeUndefined();
    configureAiFetch((async () => geminiErr(429, { error: { status: 'RESOURCE_EXHAUSTED', message: 'quota' } })) as unknown as typeof fetch);
    await expect(recognizeMealPhoto(JPEG)).rejects.toMatchObject({ code: 'UNAVAILABLE', details: { code: 'RATE_LIMITED' } });
    configureAiFetch((async () => gemini({ nonsense: true })) as unknown as typeof fetch);
    await expect(recognizeMealPhoto(JPEG)).rejects.toMatchObject({ code: 'UNAVAILABLE', details: { code: 'INVALID_RESPONSE' } });
  });

  it('purges discarded (unreferenced) photos', async () => {
    await enableAi(async () => gemini(detection));
    await recognizeMealPhoto(JPEG);
    expect(await purgeOrphanPhotos(24)).toBe(0); // fresh photos are kept (user may still confirm)
    const p = (await getDb().photos.toArray())[0]!;
    await getDb().photos.put({ ...p, createdAt: '2000-01-01T00:00:00.000Z' });
    expect(await purgeOrphanPhotos(1)).toBe(1);
  });
});

describe('AI suggestions', () => {
  beforeEach(async () => {
    await freshDb();
    await seedDatabase();
    await setMacroGoals({ calories: 2000, protein: 140, carbohydrate: 220, fat: 65 }, '2026-01-01');
  });

  it('falls back to rules when AI is disabled', async () => {
    const r = await getSmartSuggestions({ text: 'high protein dinner', request: undefined }, new Date(2026, 10, 7, 19));
    expect(r.source).toBe('rules');
    expect(r.fallbackReason).toBeDefined();
    expect(r.recommendations.length).toBeGreaterThan(0);
  });

  it('validates AI proposals: computes nutrition locally, rejects unknown ids and allergens', async () => {
    let sentContext: Record<string, unknown> = {};
    await setAllergies(['fish']);
    await enableAi(async (_url: unknown, init: unknown) => {
      sentContext = JSON.parse(JSON.parse((init as RequestInit).body as string).input[0].text);
      return gemini({
        suggestions: [
          { name: 'Chicken, quinoa & greens', reason: 'Lean protein to close your protein gap.', prepTimeMinutes: 25, ingredients: [{ foodId: 'usda_171477', grams: 170 }, { foodId: 'usda_168917', grams: 185 }, { foodId: 'usda_169967', grams: 120 }], calories: 1 },
          { name: 'Made-up superfood bowl', reason: 'x', ingredients: [{ foodId: 'usda_000000', grams: 200 }] },
          { name: 'Salmon plate', reason: 'omega-3', ingredients: [{ foodId: 'usda_175168', grams: 150 }] },
        ],
      });
    });
    const r = await getSmartSuggestions({ request: { intent: 'meal', mealType: 'dinner', date: '2026-11-07' } });
    expect(r.source).toBe('ai');
    expect(r.recommendations).toHaveLength(1);
    const rec = r.recommendations[0]!;
    expect(rec.source).toBe('ai');
    expect(rec.explanation[0]).toBe('Lean protein to close your protein gap.');
    // 170 g roasted chicken (165) + 185 g quinoa (120) + 120 g broccoli (35) = 280.5 + 222 + 42
    expect(rec.nutrition.energy.amount).toBeCloseTo(280.5 + 222 + 42, 6);
    expect(r.rejected.map((x) => x.name)).toEqual(['Made-up superfood bowl', 'Salmon plate']);
    // the allergen-filtered catalog never offered fish to the AI
    const catalogIds = (sentContext.catalog as unknown[][]).map((row) => row[0]);
    expect(catalogIds).not.toContain('usda_175168');
    expect(catalogIds).toContain('usda_171477');
    expect(sentContext).not.toHaveProperty('mealHistory');
  });

  it('falls back to rules on provider errors or when nothing passes validation', async () => {
    await enableAi(async () => geminiErr(429, { error: { status: 'RESOURCE_EXHAUSTED', message: 'quota' } }));
    const r1 = await getSmartSuggestions({ request: { intent: 'high_protein', mealType: 'lunch', date: '2026-11-07' } });
    expect(r1.source).toBe('rules');
    expect(r1.fallbackReason).toMatch(/RATE_LIMITED/);
    configureAiFetch((async () => gemini({ suggestions: [{ name: 'Bad', reason: '', ingredients: [{ foodId: 'nope', grams: 100 }] }] })) as unknown as typeof fetch);
    const r2 = await getSmartSuggestions({ request: { intent: 'meal', mealType: 'lunch', date: '2026-11-07' } });
    expect(r2.source).toBe('rules');
    expect(r2.rejected).toHaveLength(1);
    expect(r2.recommendations.length).toBeGreaterThan(0);
  });
});

describe('photo matching quality', () => {
  beforeEach(async () => {
    await freshDb();
    await seedDatabase();
  });
  it('requires an identifying word, so generic words ("whole", "yellow") never match on their own', async () => {
    const { matchDetectedFood } = await import('../services/ai');
    // Gemini is asked for Spanish names (the catalog is Spanish).
    const fish = await matchDetectedFood({ name: 'pescado entero, crudo', searchTerms: ['pescado'], estimatedGrams: 600, confidence: 0.6, preparation: 'raw' });
    expect(fish.some((m) => m.food.name.startsWith('Huevo'))).toBe(false);
    const squash = await matchDetectedFood({ name: 'calabaza amarilla, cruda', searchTerms: ['calabaza'], estimatedGrams: 200, confidence: 0.6 });
    expect(squash.some((m) => /Atún/.test(m.food.name))).toBe(false);
    const bread = await matchDetectedFood({ name: 'pan integral, en rebanadas', searchTerms: ['pan'], estimatedGrams: 60, confidence: 0.8 });
    expect(bread[0]?.food.name).toBe('Pan integral');
    const beef = await matchDetectedFood({ name: 'ternera asada, cruda', searchTerms: ['ternera'], estimatedGrams: 300, confidence: 0.7, preparation: 'raw' });
    expect(beef[0]?.food.name).toMatch(/ternera/i);
  });
});
