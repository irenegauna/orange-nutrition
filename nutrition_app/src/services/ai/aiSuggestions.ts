import { z } from 'zod';
import type { Food, MealType, ParsedIntent, Recommendation, RecommendationRequest } from '../../core/types/domain';
import { allowedFoodPool, computeBudget, evaluateExternalCandidate, type RecommendationContext } from '../../core/recommendations/engine';
import { parseIntent } from '../../core/recommendations/intentParser';
import { entriesTotals } from '../../core/nutrition/calculations';
import { amountOrNull } from '../../core/nutrition/values';
import { roundTo } from '../../core/utils/format';
import { today } from '../../core/utils/dates';
import { DataError } from '../../core/utils/errors';
import { foodRepository, goalsRepository, mealEntryRepository, preferencesRepository } from '../../data/repositories';
import { GeminiError, type GeminiSchema } from '../../integrations/gemini/client';
import { getFoodUsageStats } from '../food/foodService';
import { mealTypeForHour, recommend, recommendFromText } from '../recommendations/recommendationService';
import { getAiClient } from './settings';

const SYSTEM = `You suggest meals inside a personal nutrition tracking app.
Rules:
- Use ONLY foods from the provided catalog, referenced by their exact "id". Never invent foods or ids.
- "grams" is the weight of the food in the form listed (raw/dry weights for raw/dry foods, cooked weight for cooked foods).
- Do NOT state calories or nutrient values: the app computes them from its database.
- Respect the user's request, the calorie budget and remaining targets. The catalog is already filtered for allergies and diets.
- Prefer realistic, simple combinations a person would actually eat, with sensible portions.
- Give 3 to 5 varied suggestions with a short reason (max 25 words) each.
- The app is in Spanish (Spain): write every suggestion name and reason in Spanish.`;

const SCHEMA: GeminiSchema = {
  type: 'OBJECT',
  properties: {
    suggestions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          reason: { type: 'STRING' },
          prepTimeMinutes: { type: 'INTEGER' },
          ingredients: {
            type: 'ARRAY',
            items: { type: 'OBJECT', properties: { foodId: { type: 'STRING' }, grams: { type: 'NUMBER' } }, required: ['foodId', 'grams'] },
          },
        },
        required: ['name', 'reason', 'ingredients'],
      },
    },
  },
  required: ['suggestions'],
};

const responseSchema = z.object({
  suggestions: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        reason: z.string().max(300).catch(''),
        prepTimeMinutes: z.number().int().min(0).max(600).optional().catch(undefined),
        ingredients: z.array(z.object({ foodId: z.string(), grams: z.number().finite() })).min(1).max(8),
      }),
    )
    .max(8),
});

const MAX_CATALOG = 250;

export interface SmartSuggestionsInput {
  /** Free text, e.g. "something warm with lots of protein for dinner". */
  text?: string;
  /** Structured request (used as-is, or derived from `text`). */
  request?: RecommendationRequest;
}

export interface SmartSuggestionsResult {
  source: 'ai' | 'rules';
  recommendations: Recommendation[];
  parsed?: ParsedIntent;
  /** Why the AI wasn't used / failed (when source = 'rules'). */
  fallbackReason?: string;
  /** AI proposals discarded by local validation (unknown foods, allergens, limits...). */
  rejected: { name: string; reason: string }[];
}

const macro = (f: Food, id: 'energy' | 'protein' | 'carbohydrate' | 'fat' | 'fiber') => {
  const v = amountOrNull(f.nutrientsPer100g, id);
  return v === null ? null : roundTo(v, 1);
};

/**
 * Main entry point for suggestions. Uses Gemini when AI suggestions are enabled, otherwise (or on
 * any AI failure) the local rule-based engine. AI proposals are validated locally: unknown food ids
 * and restricted foods are rejected and nutrition is always computed from the database.
 */
export async function getSmartSuggestions(input: SmartSuggestionsInput, now: Date = new Date()): Promise<SmartSuggestionsResult> {
  const parsed = input.text ? parseIntent(input.text) : undefined;
  const request: RecommendationRequest = input.request ?? parsed?.request ?? { intent: 'meal' };

  const rules = async (fallbackReason?: string): Promise<SmartSuggestionsResult> => {
    const recommendations = input.text && !input.request ? (await recommendFromText(input.text, { ...(request.date ? { date: request.date } : {}), now })).recommendations : await recommend(request, now);
    return { source: 'rules', recommendations: recommendations.map((r) => ({ ...r, source: 'rules' as const })), ...(parsed ? { parsed } : {}), ...(fallbackReason ? { fallbackReason } : {}), rejected: [] };
  };

  let client;
  try {
    client = await getAiClient('suggestions');
  } catch (e) {
    return rules(e instanceof DataError ? e.message : 'AI unavailable');
  }

  const date = request.date ?? today();
  const mealType: MealType = request.mealType ?? mealTypeForHour(now.getHours());
  const [foods, prefs, goals, entries, usage] = await Promise.all([foodRepository.list(), preferencesRepository.get(), goalsRepository.forDate(date), mealEntryRepository.byDate(date), getFoodUsageStats(90)]);
  const ctx: RecommendationContext = {
    request: { ...request, date, mealType },
    foods,
    recipes: [],
    preferences: prefs,
    goals,
    todayTotals: entriesTotals(entries),
    eatenTodayFoodIds: new Set(entries.map((e) => e.foodId).filter((x): x is string => !!x)),
  };
  const available = new Set(request.ingredientIds ?? prefs.availableIngredientIds);
  const favorites = new Set(prefs.favoriteFoodIds);
  const pool = allowedFoodPool(ctx)
    .filter((f) => f.role !== 'condiment' || available.has(f.id))
    .sort((a, b) => Number(available.has(b.id)) - Number(available.has(a.id)) || Number(favorites.has(b.id)) - Number(favorites.has(a.id)) || (usage.get(b.id)?.count ?? 0) - (usage.get(a.id)?.count ?? 0) || a.name.localeCompare(b.name))
    .slice(0, MAX_CATALOG);
  if (pool.length === 0) return rules('No foods match your restrictions');
  const poolById = new Map(pool.map((f) => [f.id, f]));

  const budget = computeBudget(ctx.request, goals, ctx.todayTotals);
  const remaining: Record<string, number> = {};
  for (const [id, t] of Object.entries(goals?.targets ?? {})) remaining[id] = roundTo(t.amount - ctx.todayTotals[id as keyof typeof ctx.todayTotals].amount, 1);
  const context = {
    userRequest: input.text?.slice(0, 500) ?? null,
    intent: request.intent,
    nutrientFocus: request.nutrientId ?? null,
    mealType,
    calorieBudgetKcal: roundTo(budget.kcal, 0),
    maxCaloriesKcal: request.maxCalories ?? null,
    maxPrepTimeMinutes: request.maxPrepTimeMinutes ?? prefs.maxPrepTimeMinutes ?? null,
    consumedToday: Object.fromEntries((['energy', 'protein', 'carbohydrate', 'fat', 'fiber'] as const).map((id) => [id, roundTo(ctx.todayTotals[id].amount, 1)])),
    remainingTargets: remaining,
    diets: prefs.diets,
    availableIngredientIds: [...available].filter((id) => poolById.has(id)),
    favoriteFoodIds: [...favorites].filter((id) => poolById.has(id)),
    alreadyEatenTodayIds: [...ctx.eatenTodayFoodIds].filter((id) => poolById.has(id)),
    catalogColumns: ['id', 'name', 'form', 'kcal/100g', 'protein/100g', 'carbs/100g', 'fat/100g', 'fiber/100g', 'prepMin'],
    catalog: pool.map((f) => [f.id, f.name, f.form, macro(f, 'energy'), macro(f, 'protein'), macro(f, 'carbohydrate'), macro(f, 'fat'), macro(f, 'fiber'), f.prepTimeMinutes ?? null]),
  };

  let raw: unknown;
  try {
    raw = await client.generateJson({ system: SYSTEM, parts: [{ text: JSON.stringify(context) }], schema: SCHEMA, temperature: 0.4 });
  } catch (e) {
    return rules(e instanceof GeminiError ? `AI error (${e.code}): ${e.message}` : 'AI error');
  }
  const res = responseSchema.safeParse(raw);
  if (!res.success) return rules('AI answer could not be understood');

  const rejected: SmartSuggestionsResult['rejected'] = [];
  const recommendations: Recommendation[] = [];
  res.data.suggestions.forEach((s, i) => {
    const unknown = s.ingredients.filter((ing) => !poolById.has(ing.foodId));
    if (unknown.length) {
      rejected.push({ name: s.name, reason: `uses foods outside the allowed list (${unknown.map((u) => u.foodId).join(', ')})` });
      return;
    }
    // merge duplicate ingredients
    const grams = new Map<string, number>();
    for (const ing of s.ingredients) grams.set(ing.foodId, (grams.get(ing.foodId) ?? 0) + ing.grams);
    const parts = [...grams].map(([id, g]) => ({ food: poolById.get(id)!, grams: g }));
    const preps = parts.map((p) => p.food.prepTimeMinutes);
    const localPrep = preps.some((p) => p === undefined) ? null : Math.max(...(preps as number[]));
    const evaluation = evaluateExternalCandidate(ctx, {
      id: `ai:${i}:${parts.map((p) => p.food.id).join('+')}`,
      name: s.name,
      parts,
      prepTimeMinutes: s.prepTimeMinutes ?? localPrep,
      notes: s.reason ? [s.reason] : [],
    });
    if (evaluation.ok) recommendations.push(evaluation.recommendation);
    else rejected.push({ name: s.name, reason: evaluation.reason });
  });

  if (recommendations.length === 0) return { ...(await rules('No AI suggestion passed validation')), rejected };
  const limit = request.limit ?? 5;
  return { source: 'ai', recommendations: recommendations.slice(0, limit), ...(parsed ? { parsed } : {}), rejected };
}
