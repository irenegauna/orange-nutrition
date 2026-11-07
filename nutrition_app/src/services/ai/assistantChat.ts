import { z } from 'zod';
import type { MealType, Recommendation } from '../../core/types/domain';
import { NUTRIENT_IDS, type NutrientId } from '../../core/types/nutrients';
import { NUTRIENTS } from '../../core/constants/nutrients';
import { allowedFoodPool, computeBudget, evaluateExternalCandidate, type RecommendationContext } from '../../core/recommendations/engine';
import { entriesTotals } from '../../core/nutrition/calculations';
import { amountOrNull } from '../../core/nutrition/values';
import { buildPeriodSummary } from '../../core/nutrition/summaries';
import { roundTo } from '../../core/utils/format';
import { addDays, today } from '../../core/utils/dates';
import { DataError } from '../../core/utils/errors';
import { foodRepository, goalsRepository, mealEntryRepository, preferencesRepository } from '../../data/repositories';
import { GeminiError, type GeminiSchema } from '../../integrations/gemini/client';
import { getFoodUsageStats } from '../food/foodService';
import { getDailySummaries } from '../history/historyService';
import { mealTypeForHour } from '../recommendations/recommendationService';
import { getAiClient } from './settings';

/**
 * Conversational nutrition assistant backed by Gemini (opt-in, uses the AI suggestions switch).
 *
 * The model answers in natural language and may attach meal suggestions. Meal suggestions can only
 * reference foods from an allergy/diet-filtered catalog; each one is re-validated locally and its
 * nutrition is calculated from the database. The user's intake figures given to the model are
 * computed locally (with data-coverage), so the model never has to guess them.
 */

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface AssistantChatInput {
  message: string;
  /** Previous turns, oldest first (only the last few are sent). */
  history?: ChatTurn[];
  date?: string;
  now?: Date;
}

export interface AssistantChatResult {
  source: 'ai';
  text: string;
  recommendations: Recommendation[];
  followUps: string[];
  /** AI meal proposals discarded by local validation. */
  rejected: { name: string; reason: string }[];
  model: string;
}

const SYSTEM = `You are the friendly nutrition assistant inside "Orange Nutrition", a private food-tracking app for one person.
You receive JSON context with the user's goals, what they ate today, recent averages and a catalog of foods they can eat.

How to answer:
- Reply conversationally in the same language as the user's message (the app is in Spanish, so default to Spanish from Spain), in at most ~120 words. Be warm, concrete and practical.
- When talking about the user's own intake, use ONLY the numbers in the context. If coverage for a nutrient is below 0.8, say the data is incomplete instead of calling it low.
- You may share general, well-established nutrition knowledge. Do not invent precise nutrient amounts for specific foods; the app calculates those.
- Never diagnose deficiencies or medical conditions and never give medical advice. Suggest a professional for medical questions.
- Respect the user's diets, allergies and dislikes at all times.

Meal suggestions ("suggestions"):
- Include 1-3 when the user asks what to eat or when it clearly helps; otherwise return an empty array.
- Use ONLY foods from "catalog", by exact id. grams = weight of that food in the listed form (raw/dry/cooked).
- Fit the calorie budget and remaining targets. Give each a short name and a reason (max 20 words). Never state calories in "reason".

Also return 0-3 short follow-up questions the user might tap next ("followUps"), in the same language as your reply. Write suggestion names and reasons in that language too.`;

const SCHEMA: GeminiSchema = {
  type: 'OBJECT',
  properties: {
    reply: { type: 'STRING' },
    suggestions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          reason: { type: 'STRING' },
          mealType: { type: 'STRING', enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
          prepTimeMinutes: { type: 'INTEGER' },
          ingredients: { type: 'ARRAY', items: { type: 'OBJECT', properties: { foodId: { type: 'STRING' }, grams: { type: 'NUMBER' } }, required: ['foodId', 'grams'] } },
        },
        required: ['name', 'reason', 'ingredients'],
      },
    },
    followUps: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['reply', 'suggestions', 'followUps'],
};

const responseSchema = z.object({
  reply: z.string().trim().min(1).max(2000),
  suggestions: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        reason: z.string().max(300).catch(''),
        mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).optional().catch(undefined),
        prepTimeMinutes: z.number().int().min(0).max(600).optional().catch(undefined),
        ingredients: z.array(z.object({ foodId: z.string(), grams: z.number().finite() })).min(1).max(8),
      }),
    )
    .max(5)
    .catch([]),
  followUps: z.array(z.string().trim().min(1).max(120)).max(4).catch([]),
});

const MAX_CATALOG = 250;
const MAX_HISTORY_TURNS = 8;

/**
 * Sends one chat message to Gemini. Throws DataError('UNAVAILABLE', …, { code }) when AI is off or
 * the provider fails, so the caller can fall back to the rule-based assistant.
 */
export async function chatWithAssistant(input: AssistantChatInput): Promise<AssistantChatResult> {
  const message = input.message.trim();
  if (!message) throw new DataError('VALIDATION', 'El mensaje está vacío');
  const client = await getAiClient('suggestions');
  const now = input.now ?? new Date();
  const date = input.date ?? today();
  const mealType: MealType = mealTypeForHour(now.getHours());

  const [foods, prefs, goals, entries, usage, week] = await Promise.all([
    foodRepository.list(),
    preferencesRepository.get(),
    goalsRepository.forDate(date),
    mealEntryRepository.byDate(date),
    getFoodUsageStats(90),
    getDailySummaries(addDays(date, -6), date),
  ]);
  const todayTotals = entriesTotals(entries);
  const ctx: RecommendationContext = {
    request: { intent: 'meal', date, mealType },
    foods,
    recipes: [],
    preferences: prefs,
    goals,
    todayTotals,
    eatenTodayFoodIds: new Set(entries.map((e) => e.foodId).filter((x): x is string => !!x)),
  };
  const favorites = new Set(prefs.favoriteFoodIds);
  const available = new Set(prefs.availableIngredientIds);
  const pool = allowedFoodPool(ctx)
    .filter((f) => f.role !== 'condiment' || available.has(f.id))
    .sort((a, b) => Number(available.has(b.id)) - Number(available.has(a.id)) || Number(favorites.has(b.id)) - Number(favorites.has(a.id)) || (usage.get(b.id)?.count ?? 0) - (usage.get(a.id)?.count ?? 0) || a.name.localeCompare(b.name))
    .slice(0, MAX_CATALOG);
  const poolById = new Map(pool.map((f) => [f.id, f]));

  const period = buildPeriodSummary(week);
  const nutrientLine = (id: NutrientId, amount: number, coverage: number) => {
    const t = goals?.targets[id];
    return { amount: roundTo(amount, NUTRIENTS[id].displayDecimals + 1), unit: NUTRIENTS[id].unit === 'ug' ? 'µg' : NUTRIENTS[id].unit, coverage: roundTo(coverage, 2), ...(t ? { target: t.amount, targetType: t.direction } : {}) };
  };
  const budget = computeBudget(ctx.request, goals, todayTotals);
  const context = {
    date,
    localTime: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    likelyNextMeal: mealType,
    nextMealCalorieBudgetKcal: roundTo(budget.kcal, 0),
    diets: prefs.diets,
    allergies: prefs.allergies,
    dislikes: prefs.dislikedKeywords,
    today: {
      entries: entries.map((e) => ({ meal: e.mealType, food: e.snapshot.name, grams: roundTo(e.grams, 0) })),
      nutrients: Object.fromEntries(NUTRIENT_IDS.filter((id) => todayTotals[id].coverage.contributors > 0 || goals?.targets[id]).map((id) => [id, nutrientLine(id, todayTotals[id].amount, todayTotals[id].coverage.ratio)])),
    },
    last7Days: {
      loggedDays: period.loggedDays,
      dailyAverages: period.loggedDays ? Object.fromEntries(NUTRIENT_IDS.filter((id) => goals?.targets[id]).map((id) => [id, nutrientLine(id, period.averages[id].amount, period.averages[id].coverage.ratio)])) : {},
    },
    catalogColumns: ['id', 'name', 'form', 'kcal/100g', 'protein/100g', 'carbs/100g', 'fat/100g', 'fiber/100g', 'prepMin'],
    catalog: pool.map((f) => [f.id, f.name, f.form, ...(['energy', 'protein', 'carbohydrate', 'fat', 'fiber'] as const).map((id) => {
      const v = amountOrNull(f.nutrientsPer100g, id);
      return v === null ? null : roundTo(v, 1);
    }), f.prepTimeMinutes ?? null]),
  };

  const history = (input.history ?? []).filter((t) => t.text.trim()).slice(-MAX_HISTORY_TURNS);
  const transcript = history.map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.text.slice(0, 600)}`).join('\n');

  let raw: unknown;
  try {
    raw = await client.generateJson({
      system: SYSTEM,
      parts: [{ text: `CONTEXT (JSON):\n${JSON.stringify(context)}` }, ...(transcript ? [{ text: `CONVERSATION SO FAR:\n${transcript}` }] : []), { text: `USER MESSAGE:\n${message.slice(0, 1000)}` }],
      schema: SCHEMA,
      temperature: 0.5,
    });
  } catch (e) {
    if (e instanceof GeminiError) throw new DataError('UNAVAILABLE', e.message, { code: e.code }, { cause: e });
    throw e;
  }
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) throw new DataError('UNAVAILABLE', 'No se ha podido entender la respuesta de la IA', { code: 'INVALID_RESPONSE' });

  const recommendations: Recommendation[] = [];
  const rejected: AssistantChatResult['rejected'] = [];
  parsed.data.suggestions.forEach((s, i) => {
    const unknown = s.ingredients.filter((ing) => !poolById.has(ing.foodId));
    if (unknown.length) {
      rejected.push({ name: s.name, reason: 'uses foods outside the allowed list' });
      return;
    }
    const grams = new Map<string, number>();
    for (const ing of s.ingredients) grams.set(ing.foodId, (grams.get(ing.foodId) ?? 0) + ing.grams);
    const parts = [...grams].map(([id, g]) => ({ food: poolById.get(id)!, grams: g }));
    const preps = parts.map((p) => p.food.prepTimeMinutes);
    const evaluation = evaluateExternalCandidate(
      { ...ctx, request: { ...ctx.request, mealType: s.mealType ?? mealType } },
      { id: `ai:${Date.now()}:${i}`, name: s.name, parts, prepTimeMinutes: s.prepTimeMinutes ?? (preps.some((p) => p === undefined) ? null : Math.max(...(preps as number[]))), notes: s.reason ? [s.reason] : [] },
    );
    if (evaluation.ok) recommendations.push(evaluation.recommendation);
    else rejected.push({ name: s.name, reason: evaluation.reason });
  });

  return { source: 'ai', text: parsed.data.reply, recommendations, followUps: parsed.data.followUps, rejected, model: client.lastModel ?? '' };
}
