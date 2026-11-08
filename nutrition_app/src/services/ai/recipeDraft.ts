import { z } from 'zod';
import type { DetectedFood, FoodSearchResult } from '../../core/types/domain';
import { DataError } from '../../core/utils/errors';
import { GeminiError, type GeminiSchema } from '../../integrations/gemini/client';
import { matchDetectedFood } from './photoRecognition';
import { getAiClient, getAiSettings } from './settings';

const SYSTEM = `You write traditional Spanish home recipes for a nutrition-tracking app used in Spain.
Answer in Spanish (Spain). Use the usual home version of the dish, not a restaurant or "light" variant, unless the user asks.
For each ingredient give:
- "name": a short Spanish food name as it would appear in a food composition table, e.g. "patata", "huevo", "cebolla", "aceite de oliva", "garbanzos secos", "chorizo".
- "searchTerms": 1–3 Spanish alternatives, from specific to general.
- "grams": the RAW weight as bought, for the whole recipe. Dried legumes, rice and pasta are DRY weights. For frying oil give only the oil that stays in the food (about 10–15 % of the oil used), and say so in "note".
- "preparation": "raw" or "dry" (dried legumes, rice, pasta, flour).
- "note" (optional): very short, e.g. "para freír, solo lo que absorbe".
Also give "servings" (how many people it feeds), 3–8 short Spanish "instructions", and "prepTimeMinutes"/"cookTimeMinutes".
Leave out salt and water. NEVER output calories or nutrient values: the app calculates them from its own food database.
If the request is not a dish or a drink you can describe, set "isDish" to false and return empty lists.`;

const SCHEMA: GeminiSchema = {
  type: 'OBJECT',
  properties: {
    isDish: { type: 'BOOLEAN' },
    name: { type: 'STRING' },
    servings: { type: 'NUMBER' },
    ingredients: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          searchTerms: { type: 'ARRAY', items: { type: 'STRING' } },
          grams: { type: 'NUMBER' },
          preparation: { type: 'STRING' },
          note: { type: 'STRING' },
        },
        required: ['name', 'searchTerms', 'grams'],
      },
    },
    instructions: { type: 'ARRAY', items: { type: 'STRING' } },
    prepTimeMinutes: { type: 'NUMBER' },
    cookTimeMinutes: { type: 'NUMBER' },
  },
  required: ['isDish', 'name', 'servings', 'ingredients', 'instructions'],
};

const responseSchema = z.object({
  isDish: z.boolean(),
  name: z.string().trim().min(1).max(120),
  servings: z.number().positive().max(40).catch(4),
  ingredients: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        searchTerms: z.array(z.string().trim().min(1).max(80)).max(5).catch([]),
        grams: z.number().positive().max(10_000),
        preparation: z.string().max(20).optional().catch(undefined),
        note: z.string().max(120).optional().catch(undefined),
      }),
    )
    .max(30),
  instructions: z.array(z.string().trim().min(1).max(400)).max(15).catch([]),
  prepTimeMinutes: z.number().min(0).max(1440).optional().catch(undefined),
  cookTimeMinutes: z.number().min(0).max(2880).optional().catch(undefined),
});

export interface RecipeDraftIngredient {
  /** Gemini's name for the ingredient. */
  name: string;
  /** Raw grams for the whole recipe — Gemini's estimate, editable. */
  grams: number;
  note?: string;
  /** Local catalog candidates, best first. Nutrition always comes from these, never from the AI. */
  matches: FoodSearchResult[];
  selectedFoodId: string | null;
}

export interface AiRecipeDraft {
  name: string;
  servings: number;
  ingredients: RecipeDraftIngredient[];
  instructions: string[];
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  unmatchedCount: number;
  model: string;
}

/**
 * Asks Gemini for a typical home recipe ("cocido madrileño", "pisto sin pimiento") and maps every
 * ingredient to local foods. Nothing is saved: show it for review, then `createRecipe`.
 * Needs only an API key + accepted privacy notice (no photo). Errors: DataError('UNAVAILABLE', …, { code }).
 */
export async function draftRecipeWithAI(input: { dish: string; servings?: number; notes?: string }): Promise<AiRecipeDraft> {
  const dish = input.dish.trim();
  if (!dish) throw new DataError('VALIDATION', 'Escribe el nombre del plato');
  const client = await getAiClient('recipe');
  const settings = await getAiSettings();
  let raw: unknown;
  try {
    raw = await client.generateJson({
      system: SYSTEM,
      parts: [
        {
          text: `Plato: ${dish.slice(0, 120)}${input.servings ? `\nRaciones: ${input.servings}` : ''}${input.notes ? `\nNota del usuario: ${input.notes.slice(0, 300)}` : ''}`,
        },
      ],
      schema: SCHEMA,
      temperature: 0.2,
    });
  } catch (e) {
    if (e instanceof GeminiError) throw new DataError('UNAVAILABLE', e.message, { code: e.code }, { cause: e });
    throw e;
  }
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) throw new DataError('UNAVAILABLE', 'No se ha podido entender la respuesta de la IA', { code: 'INVALID_RESPONSE' });
  const d = parsed.data;
  if (!d.isDish || d.ingredients.length === 0) throw new DataError('VALIDATION', `No he reconocido «${dish}» como un plato. Prueba con otro nombre.`);

  const ingredients: RecipeDraftIngredient[] = [];
  for (const it of d.ingredients) {
    const detected: DetectedFood = {
      name: it.name,
      searchTerms: it.searchTerms,
      estimatedGrams: it.grams,
      confidence: 1,
      preparation: it.preparation === 'dry' ? 'dried' : 'raw',
    };
    const matches = await matchDetectedFood(detected);
    ingredients.push({
      name: it.name,
      grams: Math.round(it.grams),
      ...(it.note ? { note: it.note } : {}),
      matches,
      selectedFoodId: matches[0]?.food.id ?? null,
    });
  }
  return {
    name: d.name,
    servings: input.servings ?? Math.round(d.servings),
    ingredients,
    instructions: d.instructions,
    ...(d.prepTimeMinutes !== undefined ? { prepTimeMinutes: Math.round(d.prepTimeMinutes) } : {}),
    ...(d.cookTimeMinutes !== undefined ? { cookTimeMinutes: Math.round(d.cookTimeMinutes) } : {}),
    unmatchedCount: ingredients.filter((i) => !i.selectedFoodId).length,
    model: client.lastModel ?? settings.model,
  };
}
