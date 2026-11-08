import { z } from 'zod';
import type { DetectedFood, Food, FoodSearchResult, LocalDate, MealEntry, MealType, PhotoRecognitionItem, PhotoRecognitionResult, Quantity } from '../../core/types/domain';
import { nutrientsForGrams, nutrientsForQuantity, sumNutrients } from '../../core/nutrition/calculations';
import { assertLocalDate, nowIso } from '../../core/utils/dates';
import { createId } from '../../core/utils/ids';
import { DataError } from '../../core/utils/errors';
import { getDb, guard } from '../../data/db';
import { foodRepository, mealEntryRepository } from '../../data/repositories';
import { bytesToBase64, GeminiError, type GeminiSchema } from '../../integrations/gemini/client';
import { searchFoods } from '../food/foodService';
import { tokenize } from '../../core/utils/text';
import { snapshotOf } from '../meals/snapshot';
import { getAiClient, getAiSettings } from './settings';
import { MAX_PHOTO_BYTES, prepareImage, savePhoto, type PreparedImage } from './photos';

const SYSTEM = `You identify foods in meal photos for a personal nutrition tracking app used in Spain. The app's food database is in Spanish (Spain).
For each distinct food or drink visible:
- "name": a short generic SPANISH (Spain) name as it would appear in a food composition database, including the preparation when visible (e.g. "arroz blanco, cocido", "pechuga de pollo, a la plancha", "plátano", "leche entera", "patata, asada").
- "searchTerms": 1-3 simpler Spanish alternatives (e.g. ["arroz", "arroz blanco"]).
- "description": one short sentence in Spanish describing the meal.
- "estimatedGrams": your best visual estimate of the edible weight in grams, using cues like plate size (~26 cm), cutlery and hands.
- "confidence": 0 to 1.
- "preparation": raw, cooked, grilled, fried, baked, boiled, roasted, steamed, dried, or unknown (keep these English keywords).
- "portion" (optional): when the amount is naturally a number or fraction of a standard unit, give it as {"count": number, "unit": short Spanish unit}, e.g. {"count": 0.5, "unit": "tortilla entera"}, {"count": 2, "unit": "croqueta"}, {"count": 1, "unit": "pincho"}, {"count": 1, "unit": "caña"}, {"count": 3, "unit": "loncha"}, {"count": 1, "unit": "ración"}. The app converts it to grams with its own standard portion weights; still give "estimatedGrams" as a fallback.
For a mixed dish that cannot be separated (e.g. lasaña), list it as one item and add its main components as Spanish searchTerms.
NEVER output calories or nutrient values. If the photo contains no food, set "isFood" to false and return an empty "items" array.`;

const SCHEMA: GeminiSchema = {
  type: 'OBJECT',
  properties: {
    isFood: { type: 'BOOLEAN' },
    description: { type: 'STRING' },
    reply: { type: 'STRING' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          searchTerms: { type: 'ARRAY', items: { type: 'STRING' } },
          estimatedGrams: { type: 'NUMBER' },
          confidence: { type: 'NUMBER' },
          preparation: { type: 'STRING' },
          portion: { type: 'OBJECT', properties: { count: { type: 'NUMBER' }, unit: { type: 'STRING' } }, required: ['count', 'unit'] },
        },
        required: ['name', 'searchTerms', 'estimatedGrams', 'confidence'],
      },
    },
  },
  required: ['isFood', 'description', 'items'],
};

const itemSchema = z.object({
  name: z.string().trim().min(1).transform((v) => v.slice(0, 120)),
  searchTerms: z.array(z.string()).catch([]).transform((a) => a.map((t) => t.trim().slice(0, 80)).filter(Boolean).slice(0, 5)),
  estimatedGrams: z.number().finite().catch(100),
  confidence: z.number().finite().catch(0.5),
  preparation: z.string().optional().catch(undefined).transform((v) => v?.slice(0, 40)),
  portion: z
    .object({ count: z.number().finite().positive().max(50), unit: z.string().trim().min(1).max(60) })
    .optional()
    .catch(undefined),
});

/** Words that say "a serving" without naming the unit → use the food's default serving. */
const GENERIC_PORTION = new Set(['racion', 'raciones', 'porcion', 'porciones', 'plato', 'platos', 'unidad', 'unidades', 'pieza', 'piezas', 'serving', 'portion']);
const PORTION_NOISE = new Set(['aprox', 'g', 'ml', 'de', 'del', 'la', 'el', 'un', 'una', 'cm', 'diametro', 'largo', 'grosor']);

/**
 * Converts "0.5 × tortilla entera" into grams using the FOOD'S OWN standard servings (database data,
 * not the AI's guess). Returns null when no serving matches the unit.
 */
export function resolvePortion(
  food: Pick<Food, 'servings'>,
  portion: { count: number; unit: string },
): { grams: number; servingLabel: string; count: number } | null {
  if (!(portion.count > 0) || !food.servings.length) return null;
  const unitTokens = tokenize(portion.unit).filter((t) => !PORTION_NOISE.has(t) && !/^\d/.test(t));
  if (!unitTokens.length) return null;
  let best: { s: Food['servings'][number]; score: number } | null = null;
  for (const s of food.servings) {
    const labelTokens = new Set(tokenize(s.label).filter((t) => !PORTION_NOISE.has(t) && !/^\d/.test(t)));
    const hits = unitTokens.filter((t) => labelTokens.has(t)).length;
    const score = hits / unitTokens.length;
    if (hits > 0 && (!best || score > best.score)) best = { s, score };
  }
  if (!best && unitTokens.every((t) => GENERIC_PORTION.has(t))) {
    const def = food.servings.find((s) => s.isDefault) ?? food.servings[0]!;
    best = { s: def, score: 1 };
  }
  if (!best || !(best.s.grams > 0)) return null;
  return { grams: Math.round(portion.count * best.s.grams), servingLabel: best.s.label, count: portion.count };
}

/** Lenient: invalid items are dropped individually, long fields are truncated, at most 20 items kept. */
const responseSchema = z.object({
  isFood: z.boolean(),
  description: z.string().catch('').transform((v) => v.slice(0, 500)),
  reply: z.string().optional().catch(undefined).transform((v) => v?.slice(0, 400)),
  items: z
    .array(z.unknown())
    .catch([])
    .transform((arr) => arr.flatMap((i) => {
      const r = itemSchema.safeParse(i);
      return r.success ? [r.data] : [];
    }).slice(0, 20)),
});

const COOKED = /\b(cooked|grilled|fried|baked|boiled|roasted|steamed|scrambled|broiled|sauteed|stewed)\b|(cocid|cocinad|plancha|frit|hornead|al horno|hervid|asad|al vapor|revuelt|guisad|saltead|estofad)/;
const RAW = /\b(raw|crud[oa]s?)\b/;
const DRY = /\b(dry|dried|sec[oa]s?|deshidratad[oa]s?)\b/;

/** Words that describe a food but never identify it (a match on these alone is meaningless). */
const GENERIC = new Set([
  'whole', 'raw', 'cooked', 'fresh', 'sliced', 'slice', 'dried', 'dry', 'roasted', 'roast', 'grilled', 'boiled', 'fried', 'baked', 'steamed',
  'plain', 'mixed', 'mix', 'red', 'green', 'yellow', 'white', 'black', 'large', 'small', 'medium', 'chopped', 'diced', 'piece', 'pieces',
  'homemade', 'organic', 'low', 'fat', 'free', 'style', 'serving', 'portion', 'bowl', 'plate', 'cup', 'sweet', 'hot', 'cold',
  // Spanish (accents removed by tokenize)
  'entero', 'entera', 'enteros', 'enteras', 'cocido', 'cocida', 'cocinado', 'cocinada', 'fresco', 'fresca', 'rodaja', 'rodajas', 'loncha', 'lonchas',
  'seco', 'seca', 'asado', 'asada', 'plancha', 'hervido', 'hervida', 'frito', 'frita', 'horneado', 'horneada', 'horno', 'vapor', 'natural', 'mezcla',
  'rojo', 'roja', 'verde', 'amarillo', 'amarilla', 'blanco', 'blanca', 'negro', 'negra', 'grande', 'pequeno', 'pequena', 'mediano', 'mediana',
  'picado', 'picada', 'troceado', 'trozo', 'trozos', 'casero', 'casera', 'ecologico', 'bajo', 'baja', 'grasa', 'estilo', 'racion', 'porcion',
  'bol', 'plato', 'taza', 'dulce', 'caliente', 'frio', 'fria',
]);

/** Ranks local foods for one detected item. Prefers forms matching the visible preparation. */
export async function matchDetectedFood(d: DetectedFood, limit = 5): Promise<FoodSearchResult[]> {
  const merged = new Map<string, FoodSearchResult>();
  const queries = [d.name, ...d.searchTerms].filter((q, i, a) => a.indexOf(q) === i);
  for (const [qi, q] of queries.entries()) {
    for (const r of await searchFoods(q, { limit: 8 })) {
      const prep = `${d.preparation ?? ''} ${d.name}`.toLowerCase();
      let score = r.score - qi * 400; // matches on the primary name always beat fallback terms
      if (COOKED.test(prep)) score += r.food.form === 'cooked' ? 40 : r.food.form === 'raw' || r.food.form === 'dry' ? -60 : 0;
      else if (RAW.test(prep)) score += r.food.form === 'raw' || r.food.form === 'ready' ? 20 : -20;
      else if (r.food.form === 'dry' && !DRY.test(prep)) score -= 60;
      const prev = merged.get(r.food.id);
      if (!prev || prev.score < score) merged.set(r.food.id, { ...r, score });
    }
  }
  // Require at least one identifying word ("fish", "bread", "squash") to appear in the food; score by how many do.
  const keyTerms = [...new Set(queries.flatMap((q) => tokenize(q)).filter((t) => !GENERIC.has(t) && t.length > 2))];
  let list = [...merged.values()]
    .map((r) => {
      const foodTokens = new Set(tokenize([r.food.name, ...r.food.aliases].join(' ')));
      const hits = keyTerms.filter((t) => foodTokens.has(t)).length;
      return { r: { ...r, score: r.score + hits * 60 }, hits };
    })
    .filter((x) => keyTerms.length === 0 || x.hits > 0)
    .map((x) => x.r);
  if (list.some((r) => r.matchType !== 'partial')) list = list.filter((r) => r.matchType !== 'partial');
  return list.sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name)).slice(0, limit);
}

export interface RecognizeOptions {
  /** Optional user hint, e.g. "homemade, no sauce". */
  hint?: string;
  mealType?: MealType;
  /** Store the photo locally to attach to the logged entries (default true). */
  savePhoto?: boolean;
}

/**
 * Sends the photo to the AI provider, then maps every detected item to LOCAL foods.
 * Nothing is logged: show the result for confirmation, then call `logPhotoMeal`.
 * Errors: DataError('UNAVAILABLE') when AI is off/unconfigured or the provider fails
 * (details.code = GeminiErrorCode) — fall back to manual search.
 */
export async function recognizeMealPhoto(image: Blob | ArrayBuffer | PreparedImage, opts: RecognizeOptions = {}): Promise<PhotoRecognitionResult> {
  const client = await getAiClient('photo');
  const settings = await getAiSettings();
  const prepared = 'data' in (image as PreparedImage) && (image as PreparedImage).data instanceof ArrayBuffer ? (image as PreparedImage) : await prepareImage(image as Blob | ArrayBuffer);
  if (prepared.data.byteLength === 0) throw new DataError('VALIDATION', 'La imagen está vacía');
  if (prepared.data.byteLength > MAX_PHOTO_BYTES) throw new DataError('VALIDATION', 'La foto es demasiado grande');

  let raw: unknown;
  try {
    raw = await client.generateJson({
      system: SYSTEM,
      parts: [
        { text: `Identify the foods in this ${opts.mealType ?? 'meal'} photo.${opts.hint ? ` User note: ${opts.hint.slice(0, 300)}` : ''}` },
        { inline_data: { mime_type: prepared.mimeType, data: bytesToBase64(prepared.data) } },
      ],
      schema: SCHEMA,
      temperature: 0.1,
    });
  } catch (e) {
    if (e instanceof GeminiError) throw new DataError('UNAVAILABLE', e.message, { code: e.code }, { cause: e });
    throw e;
  }
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) throw new DataError('UNAVAILABLE', 'No se ha podido entender la respuesta de la IA', { code: 'INVALID_RESPONSE' });

  const photo = opts.savePhoto === false ? null : await savePhoto(prepared);
  return buildResult(parsed.data, photo?.id, client.lastModel ?? settings.model);
}

/** Matches every detected item to local foods and assembles the result. */
async function buildResult(data: z.infer<typeof responseSchema>, photoId: string | undefined, model: string): Promise<PhotoRecognitionResult> {
  const items: PhotoRecognitionItem[] = [];
  for (const it of data.isFood ? data.items : []) {
    const detected: DetectedFood = {
      name: it.name,
      searchTerms: it.searchTerms,
      estimatedGrams: Math.min(2000, Math.max(1, it.estimatedGrams)),
      confidence: Math.min(1, Math.max(0, it.confidence)),
      ...(it.preparation ? { preparation: it.preparation } : {}),
    };
    const matches = await matchDetectedFood(detected);
    const best = matches[0] ?? null;
    // Prefer the database's standard portion ("½ tortilla entera" → 0.5 × its weight) over the visual guess.
    const portion = best && it.portion ? resolvePortion(best.food, it.portion) : null;
    const grams = portion ? portion.grams : Math.round(detected.estimatedGrams);
    items.push({
      id: createId('det'),
      detected,
      matches,
      selectedFoodId: best?.food.id ?? null,
      grams,
      nutrients: best ? nutrientsForGrams(best.food, grams) : {},
      ...(portion ? { portion } : it.portion ? { requestedPortion: it.portion } : {}),
    });
  }
  const matched = items.filter((i) => i.selectedFoodId);
  return {
    id: createId('rec_photo'),
    isFood: data.isFood,
    description: data.description,
    ...(data.reply ? { reply: data.reply } : {}),
    items,
    totals: sumNutrients(matched.map((i) => ({ grams: i.grams, nutrients: i.nutrients }))),
    unmatchedCount: items.length - matched.length,
    ...(photoId ? { photoId } : {}),
    provider: 'gemini',
    model,
    createdAt: nowIso(),
  };
}

export interface RefinePhotoInput {
  /** The stored photo from `recognizeMealPhoto`. */
  photoId: string;
  /** What the user says, e.g. "te has dejado el huevo" or "el arroz eran unos 100 g". */
  feedback: string;
  /** The list as the user currently sees it (after any manual edits). */
  current: { name: string; grams: number; foodId?: string | null }[];
  /** Earlier corrections in this conversation, oldest first. */
  previousFeedback?: string[];
  mealType?: MealType;
}

/**
 * Lets the user correct the AI ("you missed the egg"). Sends the same photo, the current list and the
 * correction; returns the full corrected list, re-matched to LOCAL foods (nutrition never from the AI).
 * Nothing is logged. Errors as in `recognizeMealPhoto`; NOT_FOUND if the photo was deleted.
 */
export async function refineMealPhoto(input: RefinePhotoInput): Promise<PhotoRecognitionResult> {
  const feedback = input.feedback.trim().slice(0, 500);
  if (!feedback) throw new DataError('VALIDATION', 'Escribe qué hay que corregir');
  const client = await getAiClient('photo');
  const settings = await getAiSettings();
  const photo = await getDb().photos.get(input.photoId);
  if (!photo) throw new DataError('NOT_FOUND', 'La foto ya no está disponible; haz otra');
  // Send each item's standard portions so "solo me comí la mitad" / "eran dos" can be expressed as a portion.
  const currentFoods = await foodRepository.getMany(input.current.flatMap((c) => (c.foodId ? [c.foodId] : [])));
  const current = input.current.slice(0, 20).map((c) => {
    const food = c.foodId ? currentFoods.get(c.foodId) : undefined;
    return {
      name: c.name.slice(0, 120),
      grams: Math.round(c.grams),
      ...(food ? { databaseFood: food.name, standardPortions: food.servings.slice(0, 6).map((s) => `${s.label} = ${Math.round(s.grams)} g`) } : {}),
    };
  });
  const earlier = (input.previousFeedback ?? []).slice(-5).map((f) => f.slice(0, 300));

  let raw: unknown;
  try {
    raw = await client.generateJson({
      system: `${SYSTEM}

The user is reviewing your previous answer and sends a correction. Return the FULL corrected list:
- keep the items the user did not mention, with their current grams;
- add foods the user says you missed, remove the ones they say are wrong, and apply any name, preparation or quantity changes they give;
- the user knows what they ate: trust their correction over your visual impression;
- when the user gives an amount as a fraction or count ("solo me comí la mitad", "media tortilla", "eran dos croquetas", "una caña"), return it as "portion" using a unit from that item's "standardPortions" when listed (e.g. {"count": 0.5, "unit": "tortilla entera"}); otherwise use a natural Spanish unit;
- also return "reply": one short, friendly sentence in Spanish (Spain) saying what you changed.`,
      parts: [
        { inline_data: { mime_type: photo.mimeType, data: bytesToBase64(photo.data) } },
        {
          text: [
            `Meal: ${input.mealType ?? 'meal'}.`,
            `Current list (name, grams, database food and its standard portions): ${JSON.stringify(current)}`,
            ...(earlier.length ? [`Earlier corrections: ${JSON.stringify(earlier)}`] : []),
            `User correction: ${JSON.stringify(feedback)}`,
          ].join('\n'),
        },
      ],
      schema: SCHEMA,
      temperature: 0.1,
    });
  } catch (e) {
    if (e instanceof GeminiError) throw new DataError('UNAVAILABLE', e.message, { code: e.code }, { cause: e });
    throw e;
  }
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) throw new DataError('UNAVAILABLE', 'No se ha podido entender la respuesta de la IA', { code: 'INVALID_RESPONSE' });
  return buildResult(parsed.data, input.photoId, client.lastModel ?? settings.model);
}

export interface PhotoMealItemInput {
  foodId: string;
  /** Either grams or a full quantity (servings, oz, ...). */
  grams?: number;
  quantity?: Quantity;
}

export interface LogPhotoMealInput {
  date: LocalDate;
  mealType: MealType;
  items: PhotoMealItemInput[];
  photoId?: string;
  note?: string;
}

/** Logs the user-confirmed items atomically (origin 'photo_ai', photo attached). */
export async function logPhotoMeal(input: LogPhotoMealInput): Promise<MealEntry[]> {
  assertLocalDate(input.date);
  if (input.items.length === 0) throw new DataError('VALIDATION', 'Elige al menos un alimento');
  const foods = await foodRepository.getMany(input.items.map((i) => i.foodId));
  const base = Date.now();
  const entries: MealEntry[] = input.items.map((item, i) => {
    const food = foods.get(item.foodId);
    if (!food) throw new DataError('NOT_FOUND', `No se ha encontrado el alimento ${item.foodId}`);
    const quantity: Quantity = item.quantity ?? { amount: item.grams ?? 0, unit: 'g' };
    if (!(quantity.amount > 0)) throw new DataError('VALIDATION', `La cantidad de ${food.name} debe ser mayor que 0`);
    const snapshot = snapshotOf(food);
    let r: { grams: number; nutrients: MealEntry['nutrients'] };
    try {
      r = nutrientsForQuantity(snapshot, quantity);
    } catch (e) {
      throw new DataError('CONVERSION', `${food.name}: ${(e as Error).message}`);
    }
    const ts = new Date(base + i).toISOString();
    return {
      id: createId('meal'),
      date: input.date,
      mealType: input.mealType,
      kind: 'food',
      foodId: food.id,
      snapshot,
      quantity,
      grams: r.grams,
      nutrients: r.nutrients,
      ...(input.note ? { note: input.note } : {}),
      origin: 'photo_ai',
      ...(input.photoId ? { photoId: input.photoId } : {}),
      loggedAt: ts,
      createdAt: ts,
      updatedAt: ts,
    };
  });
  const db = getDb();
  if (input.photoId && !(await db.photos.get(input.photoId))) throw new DataError('NOT_FOUND', 'No se ha encontrado la foto');
  return guard('Log photo meal', () => db.transaction('rw', db.mealEntries, () => mealEntryRepository.bulkAdd(entries)));
}
