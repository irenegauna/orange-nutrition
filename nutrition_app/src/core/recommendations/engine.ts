import { REFERENCE_DAILY_VALUES } from '../constants/referenceIntakes';
import { NUTRIENTS } from '../constants/nutrients';
import { nutrientsForGrams, sumNutrients } from '../nutrition/calculations';
import { scaleTotals } from '../nutrition/values';
import type {
  DailyGoals,
  Food,
  FoodRole,
  MealType,
  Recipe,
  RecipeNutrition,
  Recommendation,
  RecommendationIngredient,
  RecommendationIntent,
  RecommendationRequest,
  UserPreferences,
} from '../types/domain';
import type { NutrientTotals } from '../types/nutrients';
import { roundTo } from '../utils/format';
import { checkAllRestrictions, checkFoodRestrictions } from './filters';

/**
 * Deterministic, rule-based recommendation engine (pure; no I/O, no randomness).
 *
 * Pipeline: candidate generation (single foods, saved recipes, protein+carb+vegetable plates)
 *   → HARD filters (allergies, diets, dislikes, max prep time, missing energy data)
 *   → deterministic portion sizing against a calorie budget
 *   → nutrition computed from food data
 *   → weighted scoring (0–100) with per-component breakdown and explanations.
 */

export interface RecipeCandidateInput {
  recipe: Recipe;
  nutrition: RecipeNutrition;
  /** Live foods for each ingredient (null when deleted). */
  ingredientFoods: (Food | null)[];
}

export interface RecommendationContext {
  request: RecommendationRequest & { mealType: MealType };
  foods: readonly Food[];
  recipes: readonly RecipeCandidateInput[];
  preferences: UserPreferences;
  goals: DailyGoals | null;
  todayTotals: NutrientTotals;
  eatenTodayFoodIds: ReadonlySet<string>;
}

export type ScoreComponent =
  | 'calorieFit'
  | 'macroFit'
  | 'proteinDensity'
  | 'fiberDensity'
  | 'lowEnergyDensity'
  | 'micronutrient'
  | 'ingredientUsage'
  | 'favorite'
  | 'dataCompleteness'
  | 'variety'
  | 'prepFit'
  | 'mealTypeFit';

export const INTENT_WEIGHTS: Readonly<Record<RecommendationIntent, Partial<Record<ScoreComponent, number>>>> = {
  meal: { calorieFit: 3, macroFit: 2.5, proteinDensity: 1, fiberDensity: 0.5, ingredientUsage: 1, favorite: 0.5, dataCompleteness: 0.5, variety: 0.5, prepFit: 0.5, mealTypeFit: 1 },
  high_protein: { proteinDensity: 4, calorieFit: 1.5, macroFit: 1, ingredientUsage: 0.5, favorite: 0.5, dataCompleteness: 0.5, variety: 0.5, prepFit: 0.5 },
  low_calorie: { lowEnergyDensity: 3, calorieFit: 2, proteinDensity: 1, fiberDensity: 1, favorite: 0.5, dataCompleteness: 0.5, variety: 0.5, prepFit: 0.5 },
  high_fiber: { fiberDensity: 4, calorieFit: 1.5, macroFit: 1, favorite: 0.5, dataCompleteness: 0.5, variety: 0.5, prepFit: 0.5 },
  use_ingredients: { ingredientUsage: 4, calorieFit: 2, macroFit: 1.5, proteinDensity: 0.5, favorite: 0.5, dataCompleteness: 0.5, prepFit: 0.5, mealTypeFit: 0.5 },
  micronutrient: { micronutrient: 4, calorieFit: 1.5, dataCompleteness: 1, favorite: 0.5, variety: 0.5, prepFit: 0.5 },
  fit_remaining: { macroFit: 4, calorieFit: 3, proteinDensity: 0.5, favorite: 0.5, dataCompleteness: 0.5, variety: 0.5, prepFit: 0.5 },
};

const MEAL_SHARE: Record<MealType, number> = { breakfast: 0.25, lunch: 0.35, dinner: 0.4, snack: 0.12 };
const DEFAULT_DAILY_KCAL = 2000;

/** Gram bounds per role for a single portion. */
export const ROLE_BOUNDS: Readonly<Record<FoodRole, [number, number]>> = {
  protein: [50, 200],
  carb: [40, 350],
  vegetable: [50, 300],
  fruit: [80, 300],
  fat: [5, 40],
  dairy: [100, 350],
  snack: [15, 60],
  condiment: [1, 30],
  beverage: [150, 350],
  other: [30, 300],
};

export interface CalorieBudget {
  kcal: number;
  goalKcal: number;
  remainingKcal: number;
  usingReference: boolean;
  overTarget: boolean;
}

/** Calorie budget for the suggestion, from goals and today's intake. */
export function computeBudget(req: RecommendationContext['request'], goals: DailyGoals | null, totals: NutrientTotals): CalorieBudget {
  const goalKcal = goals?.targets.energy?.amount ?? DEFAULT_DAILY_KCAL;
  const usingReference = !goals?.targets.energy;
  const remainingKcal = goalKcal - totals.energy.amount;
  const overTarget = remainingKcal <= 0;
  let kcal: number;
  if (overTarget) kcal = 150;
  else if (req.intent === 'fit_remaining') kcal = Math.min(remainingKcal, goalKcal * 0.5);
  else kcal = Math.min(remainingKcal, goalKcal * MEAL_SHARE[req.mealType]);
  if (req.intent === 'low_calorie') kcal *= 0.6;
  if (req.maxCalories !== undefined) kcal = Math.min(kcal, req.maxCalories);
  return { kcal: Math.max(80, kcal), goalKcal, remainingKcal, usingReference, overTarget };
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const kcalPer100 = (f: Food) => {
  const v = f.nutrientsPer100g.energy;
  return v && v.status !== 'missing' ? v.amount : null;
};
/** Practical portion rounding (an input choice; nutrients are then computed exactly for this weight). */
const practicalGrams = (g: number) => (g < 20 ? Math.max(1, Math.round(g)) : Math.round(g / 5) * 5);

export function portionForBudget(food: Food, kcalBudget: number, role: FoodRole = food.role): number {
  const [lo, roleHi] = ROLE_BOUNDS[role];
  // Never suggest more than 4 of the food's default serving (e.g. 4 slices of bread).
  const serving = food.servings.find((s) => s.isDefault);
  const hi = serving && serving.grams * 4 >= lo ? Math.min(roleHi, serving.grams * 4) : roleHi;
  const density = kcalPer100(food);
  if (density === null) return lo;
  const grams = density > 0 ? (kcalBudget / density) * 100 : hi;
  return practicalGrams(clamp(grams, lo, hi));
}

function quantityLabel(food: Food, grams: number): string {
  const formNote = food.form === 'raw' ? ' (peso en crudo)' : food.form === 'dry' ? ' (peso en seco)' : '';
  const serving = food.servings.find((s) => s.isDefault);
  if (serving && serving.grams > 0) {
    const n = grams / serving.grams;
    if (n >= 0.75 && n <= 4 && Math.abs(n * 2 - Math.round(n * 2)) < 0.15) return `${grams} g (≈ ${roundTo(n * 2, 0) / 2} × ${serving.label})${formNote}`;
  }
  return `${grams} g${formNote}`;
}

interface Candidate {
  id: string;
  kind: Recommendation['kind'];
  name: string;
  parts: { food: Food | null; grams: number; foodId: string; name: string }[];
  nutrition: NutrientTotals;
  totalGrams: number;
  prepTimeMinutes: number | null;
  recipe?: Recipe;
}

function buildFoodCandidate(food: Food, grams: number): Candidate {
  const nutrition = sumNutrients([{ grams, nutrients: nutrientsForGrams(food, grams) }]);
  return { id: `food:${food.id}`, kind: 'food', name: food.name, parts: [{ food, grams, foodId: food.id, name: food.name }], nutrition, totalGrams: grams, prepTimeMinutes: food.prepTimeMinutes ?? null };
}

/** "Pechuga de pollo con arroz blanco y espinacas" (Spanish: lower-case the following items). */
function comboName(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  const [first, ...rest] = names;
  const lower = rest.map((n) => n.charAt(0).toLocaleLowerCase('es') + n.slice(1));
  const last = lower[lower.length - 1]!;
  // "y" becomes "e" before words starting with an i-sound (e.g. "e hinojo").
  const and = /^h?i(?![aeiou])/i.test(last.normalize('NFD').replace(/[\u0300-\u036f]/g, '')) ? 'e' : 'y';
  return `${first} con ${lower.length === 1 ? last : `${lower.slice(0, -1).join(', ')} ${and} ${last}`}`;
}

const MEAL_ES: Record<string, string> = { breakfast: 'desayuno', lunch: 'comida', dinner: 'cena', snack: 'snack' };
const MEAL_ARTICLE_ES: Record<string, string> = { breakfast: 'el', lunch: 'la', dinner: 'la', snack: 'el' };

function buildCombo(parts: { food: Food; grams: number }[]): Candidate {
  const nutrition = sumNutrients(parts.map((p) => ({ grams: p.grams, nutrients: nutrientsForGrams(p.food, p.grams) })));
  const preps = parts.map((p) => p.food.prepTimeMinutes);
  const prep = preps.some((p) => p === undefined) ? null : Math.max(...(preps as number[])) + (parts.length > 1 ? 5 : 0);
  return {
    id: `combo:${parts.map((p) => p.food.id).join('+')}`,
    kind: 'combo',
    name: comboName(parts.map((p) => p.food.name.split(',')[0]!.trim())),
    parts: parts.map((p) => ({ food: p.food, grams: p.grams, foodId: p.food.id, name: p.food.name })),
    nutrition,
    totalGrams: parts.reduce((s, p) => s + p.grams, 0),
    prepTimeMinutes: prep,
  };
}

function buildRecipeCandidate(input: RecipeCandidateInput, kcalBudget: number): Candidate | null {
  const perServingKcal = input.nutrition.perServing.energy.amount;
  if (input.nutrition.perServing.energy.coverage.withData === 0 || !(perServingKcal > 0)) return null;
  const options = [0.5, 1, 1.5, 2];
  const servings = options.reduce((best, s) => (Math.abs(s * perServingKcal - kcalBudget) < Math.abs(best * perServingKcal - kcalBudget) ? s : best), 1);
  const factor = servings;
  const r = input.recipe;
  const prep = r.prepTimeMinutes === undefined && r.cookTimeMinutes === undefined ? null : (r.prepTimeMinutes ?? 0) + (r.cookTimeMinutes ?? 0);
  return {
    id: `recipe:${r.id}`,
    kind: 'recipe',
    name: servings === 1 ? r.name : `${r.name} (${servings} servings)`,
    parts: r.ingredients.map((ing, i) => ({
      food: input.ingredientFoods[i] ?? null,
      grams: (ing.grams / r.servings) * factor,
      foodId: ing.foodId,
      name: input.ingredientFoods[i]?.name ?? ing.snapshot.name,
    })),
    nutrition: scaleTotals(input.nutrition.perServing, factor),
    totalGrams: input.nutrition.gramsPerServing * factor,
    prepTimeMinutes: prep,
    recipe: r,
  };
}

interface Scored {
  candidate: Candidate;
  score: number;
  breakdown: Record<string, number>;
  explanation: string[];
}

function scoreCandidate(c: Candidate, ctx: RecommendationContext, budget: CalorieBudget): Scored | null {
  const req = ctx.request;
  const n = c.nutrition;
  const kcal = n.energy.amount;
  if (n.energy.coverage.withData === 0) return null; // cannot evaluate without energy data
  const comp: Partial<Record<ScoreComponent, number>> = {};
  const explanation: string[] = [];

  comp.calorieFit = clamp(1 - Math.abs(kcal - budget.kcal) / budget.kcal, 0, 1);
  const proteinShare = kcal > 0 ? (n.protein.amount * 4) / kcal : 0;
  comp.proteinDensity = clamp(proteinShare / 0.4, 0, 1);
  const fiberPer100kcal = kcal > 0 ? (n.fiber.amount / kcal) * 100 : 0;
  comp.fiberDensity = clamp(fiberPer100kcal / 4, 0, 1);
  const energyDensity = c.totalGrams > 0 ? (kcal / c.totalGrams) * 100 : 0;
  comp.lowEnergyDensity = clamp((400 - energyDensity) / 350, 0, 1);

  // Macro fit vs remaining targets
  const t = ctx.goals?.targets;
  const fRemaining = budget.remainingKcal > 0 ? kcal / budget.remainingKcal : 1;
  const diffs: number[] = [];
  for (const id of ['protein', 'carbohydrate', 'fat'] as const) {
    const target = t?.[id]?.amount;
    if (!target) continue;
    const remaining = target - ctx.todayTotals[id].amount;
    if (remaining <= 0) {
      diffs.push(clamp(n[id].amount / Math.max(1, target * 0.1), 0, 1)); // already met: less is better
      continue;
    }
    const used = Math.min(n[id].amount / remaining, 2);
    diffs.push(Math.abs(used - fRemaining) / Math.max(fRemaining, 0.1));
  }
  comp.macroFit = diffs.length ? clamp(1 - diffs.reduce((s, d) => s + d, 0) / diffs.length, 0, 1) : 0.5;

  // Micronutrient
  if (req.intent === 'micronutrient' && req.nutrientId) {
    const total = n[req.nutrientId];
    if (total.coverage.withData === 0) return null; // never claim richness without data
    const ref = REFERENCE_DAILY_VALUES[req.nutrientId]?.amount ?? ctx.goals?.targets[req.nutrientId]?.amount;
    const target = ctx.goals?.targets[req.nutrientId]?.amount ?? ref ?? 1;
    comp.micronutrient = clamp(total.amount / (0.3 * target), 0, 1) * total.coverage.ratio;
    const def = NUTRIENTS[req.nutrientId];
    explanation.push(
      `${def.name}: ${roundTo(total.amount, def.displayDecimals)} ${def.unit === 'ug' ? 'µg' : def.unit} (${roundTo((total.amount / target) * 100, 0)} % de ${ctx.goals?.targets[req.nutrientId] ? 'tu objetivo' : 'la referencia diaria'})${total.isLowerBound ? ', faltan algunos datos' : ''}`,
    );
  }

  const available = new Set(req.ingredientIds ?? ctx.preferences.availableIngredientIds);
  const usedAvailable = c.parts.filter((p) => available.has(p.foodId)).length;
  comp.ingredientUsage = c.parts.length ? usedAvailable / c.parts.length : 0;
  const favFoods = new Set(ctx.preferences.favoriteFoodIds);
  comp.favorite = c.recipe && ctx.preferences.favoriteRecipeIds.includes(c.recipe.id) ? 1 : c.parts.length ? c.parts.filter((p) => favFoods.has(p.foodId)).length / c.parts.length : 0;
  comp.dataCompleteness = c.parts.length ? c.parts.reduce((s, p) => s + (p.food?.completeness.score ?? 0.5), 0) / c.parts.length : 0;
  comp.variety = c.parts.length ? 1 - c.parts.filter((p) => ctx.eatenTodayFoodIds.has(p.foodId)).length / c.parts.length : 1;
  const maxPrep = req.maxPrepTimeMinutes ?? ctx.preferences.maxPrepTimeMinutes;
  comp.prepFit = c.prepTimeMinutes === null ? 0.5 : maxPrep !== undefined ? 1 : clamp(1 - c.prepTimeMinutes / 90, 0, 1);
  comp.mealTypeFit = c.recipe ? (c.recipe.mealTypes.length === 0 || c.recipe.mealTypes.includes(req.mealType) ? 1 : 0.3) : c.kind === 'combo' ? (req.mealType === 'snack' ? 0.3 : 1) : req.mealType === 'snack' || req.intent !== 'meal' ? 1 : 0.5;

  const weights = INTENT_WEIGHTS[req.intent];
  let sum = 0;
  let wsum = 0;
  const breakdown: Record<string, number> = {};
  for (const [k, w] of Object.entries(weights) as [ScoreComponent, number][]) {
    const v = comp[k] ?? 0;
    breakdown[k] = roundTo(v, 3);
    sum += v * w;
    wsum += w;
  }
  const score = wsum ? (sum / wsum) * 100 : 0;

  // Explanations
  const rk = roundTo(kcal, 0);
  const es = (v: number, d = 0) => roundTo(v, d).toLocaleString('es-ES');
  if (budget.overTarget) explanation.unshift(`Ya has llegado a tu objetivo de calorías de hoy; esta es una opción ligera (${es(rk)} kcal).`);
  else explanation.unshift(`≈ ${es(rk)} kcal para un presupuesto de ${es(budget.kcal)} kcal en ${MEAL_ARTICLE_ES[req.mealType] ?? 'la'} ${MEAL_ES[req.mealType] ?? req.mealType} (te quedan ${es(Math.max(0, budget.remainingKcal))} kcal hoy${budget.usingReference ? '; se usa un día de referencia de 2.000 kcal porque no hay objetivo de calorías' : ''}).`);
  explanation.push(`${es(n.protein.amount, 1)} g de proteína (${es(proteinShare * 100)} % de la energía), ${es(n.carbohydrate.amount, 1)} g de hidratos, ${es(n.fat.amount, 1)} g de grasa, ${es(n.fiber.amount, 1)} g de fibra${n.fiber.isLowerBound ? ' (faltan algunos datos de fibra)' : ''}.`);
  if (usedAvailable > 0) explanation.push(`Usa ${usedAvailable} de los ingredientes que tienes.`);
  if (comp.favorite && comp.favorite > 0) explanation.push('Incluye tus favoritos.');
  if (c.prepTimeMinutes !== null) explanation.push(`Preparación ≈ ${c.prepTimeMinutes} min (estimación).`);
  else explanation.push('Tiempo de preparación desconocido.');
  if (c.parts.some((p) => !p.food)) explanation.push('Algunos datos de ingredientes vienen de copias guardadas.');

  return { candidate: c, score, breakdown, explanation };
}

const PLATE_ROLES: FoodRole[] = ['protein', 'carb', 'vegetable'];

/** Main entry point. Returns recommendations sorted by score (desc), deterministic for equal input. */
export function generateRecommendations(ctx: RecommendationContext): Recommendation[] {
  const req = ctx.request;
  const limit = req.limit ?? 5;
  const budget = computeBudget(req, ctx.goals, ctx.todayTotals);
  const maxPrep = req.maxPrepTimeMinutes ?? ctx.preferences.maxPrepTimeMinutes;
  const prepOk = (p: number | null | undefined) => maxPrep === undefined || p === null || p === undefined || p <= maxPrep;
  const availableIds = new Set(req.ingredientIds ?? ctx.preferences.availableIngredientIds);
  const useOnlyAvailable = req.intent === 'use_ingredients';

  // 1. HARD filters on the food pool
  const pool = ctx.foods
    .filter((f) => !f.isArchived && kcalPer100(f) !== null)
    .filter((f) => checkFoodRestrictions(f, ctx.preferences).allowed)
    .filter((f) => prepOk(f.prepTimeMinutes))
    .filter((f) => (useOnlyAvailable ? availableIds.has(f.id) : true));
  const eatable = (f: Food) => f.form === 'ready' || f.form === 'cooked' || (useOnlyAvailable && (f.form === 'raw' || f.form === 'dry'));

  const candidates: Candidate[] = [];

  // 2a. Single foods (for nutrient-focused intents and snacks)
  // Single foods suit snacks, breakfast and "foods rich in X"; main meals get plates and recipes.
  const singleRoles: FoodRole[] = ['protein', 'carb', 'vegetable', 'fruit', 'dairy', 'snack', 'fat'];
  const offerSingles = req.mealType === 'snack' || req.mealType === 'breakfast' || req.intent === 'micronutrient';
  if (offerSingles && (req.intent !== 'use_ingredients' || req.mealType === 'snack')) {
    for (const f of pool) {
      if (!eatable(f) || !singleRoles.includes(f.role)) continue;
      candidates.push(buildFoodCandidate(f, portionForBudget(f, budget.kcal)));
    }
  }

  // 2b. Plates: protein + carb + vegetable
  if (req.mealType !== 'snack' || req.intent === 'use_ingredients') {
    const byRole = new Map<FoodRole, Food[]>();
    for (const role of PLATE_ROLES) {
      const list = pool.filter((f) => f.role === role && eatable(f));
      const pre = (f: Food) => {
        const d = kcalPer100(f) ?? 1;
        const v = (id: 'protein' | 'fiber') => {
          const x = f.nutrientsPer100g[id];
          return x && x.status !== 'missing' ? x.amount : 0;
        };
        const fav = ctx.preferences.favoriteFoodIds.includes(f.id) ? 0.5 : 0;
        const avail = availableIds.has(f.id) ? 1 : 0;
        const intentBoost =
          req.intent === 'high_protein' || role === 'protein' ? v('protein') / Math.max(d, 1) : req.intent === 'high_fiber' || role === 'vegetable' ? v('fiber') / Math.max(d, 1) : req.intent === 'low_calorie' ? 1 / Math.max(d, 1) : 0;
        return avail * 2 + fav + intentBoost * 10 + f.completeness.score;
      };
      list.sort((a, b) => pre(b) - pre(a) || a.id.localeCompare(b.id));
      byRole.set(role, list.slice(0, 4));
    }
    const proteins = byRole.get('protein')!;
    const carbs = byRole.get('carb')!;
    const vegs = byRole.get('vegetable')!;
    const shares = req.intent === 'high_protein' ? { protein: 0.6, carb: 0.25 } : req.intent === 'low_calorie' ? { protein: 0.5, carb: 0.25 } : { protein: 0.45, carb: 0.4 };
    const opt = <T,>(list: T[]) => (useOnlyAvailable && list.length === 0 ? [null] : list);
    for (const p of opt(proteins))
      for (const cb of opt(carbs))
        for (const v of opt(vegs)) {
          const parts: { food: Food; grams: number }[] = [];
          if (v) parts.push({ food: v, grams: practicalGrams(clamp(150, ...ROLE_BOUNDS.vegetable)) });
          const vegKcal = v ? ((kcalPer100(v) ?? 0) * parts[0]!.grams) / 100 : 0;
          if (p) parts.unshift({ food: p, grams: portionForBudget(p, budget.kcal * shares.protein) });
          const protKcal = p ? ((kcalPer100(p) ?? 0) * parts[0]!.grams) / 100 : 0;
          if (cb) parts.splice(p ? 1 : 0, 0, { food: cb, grams: portionForBudget(cb, Math.max(0, budget.kcal - protKcal - vegKcal)) });
          if (parts.length >= 2 || (useOnlyAvailable && parts.length >= 1)) candidates.push(buildCombo(parts));
        }
  }

  // 2c. Saved recipes
  for (const rc of ctx.recipes) {
    if (rc.recipe.ingredients.length === 0) continue;
    if (!checkAllRestrictions(rc.ingredientFoods, ctx.preferences).allowed) continue;
    const c = buildRecipeCandidate(rc, budget.kcal);
    if (!c || !prepOk(c.prepTimeMinutes)) continue;
    if (useOnlyAvailable && !c.parts.some((p) => availableIds.has(p.foodId))) continue;
    candidates.push(c);
  }

  // 3. Score, threshold hard calorie cap, sort, dedupe
  const scored: Scored[] = [];
  for (const c of candidates) {
    if (req.maxCalories !== undefined && c.nutrition.energy.amount > req.maxCalories * 1.05) continue;
    const s = scoreCandidate(c, ctx, budget);
    if (s) scored.push(s);
  }
  scored.sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id));

  const out: Recommendation[] = [];
  const usedMain = new Map<string, number>();
  const usedNames = new Set<string>();
  for (const s of scored) {
    if (usedNames.has(s.candidate.name)) continue;
    usedNames.add(s.candidate.name);
    // Diversity: at most 2 results sharing the same main component
    const main = s.candidate.parts[0]?.foodId ?? s.candidate.id;
    if ((usedMain.get(main) ?? 0) >= 2) continue;
    usedMain.set(main, (usedMain.get(main) ?? 0) + 1);
    out.push(toRecommendation(s, req.mealType));
    if (out.length >= limit) break;
  }
  return out;
}

function toRecommendation(s: Scored, mealType: MealType, source: 'rules' | 'ai' = 'rules'): Recommendation {
  const ingredients: RecommendationIngredient[] = s.candidate.parts.map((p) => ({
    foodId: p.foodId,
    name: p.name,
    grams: p.grams,
    quantityLabel: p.food ? quantityLabel(p.food, roundTo(p.grams, 0)) : `${roundTo(p.grams, 0)} g`,
  }));
  return {
    id: s.candidate.id,
    source,
    kind: s.candidate.kind,
    name: s.candidate.name,
    mealType,
    ingredients,
    nutrition: s.candidate.nutrition,
    prepTimeMinutes: s.candidate.prepTimeMinutes,
    explanation: s.explanation,
    score: roundTo(s.score, 1),
    scoreBreakdown: s.breakdown,
    ...(s.candidate.recipe ? { recipeId: s.candidate.recipe.id } : {}),
  };
}

export interface ExternalCandidate {
  id: string;
  name: string;
  parts: { food: Food; grams: number }[];
  prepTimeMinutes: number | null;
  /** Extra explanation lines (e.g. the AI's reasoning), shown before computed facts. */
  notes?: string[];
}

export type ExternalEvaluation = { ok: true; recommendation: Recommendation } | { ok: false; reason: string };

/**
 * Validates and scores a meal proposed outside the engine (e.g. by the AI provider):
 * HARD filters are re-applied locally, quantities are bounded, and nutrition is computed from
 * local food data — the proposer's own nutrition claims are never used.
 */
export function evaluateExternalCandidate(ctx: RecommendationContext, input: ExternalCandidate): ExternalEvaluation {
  if (input.parts.length === 0) return { ok: false, reason: 'no ingredients' };
  const restriction = checkAllRestrictions(input.parts.map((p) => p.food), ctx.preferences);
  if (!restriction.allowed) return { ok: false, reason: restriction.reasons.join('; ') };
  if (input.parts.some((p) => p.food.isArchived)) return { ok: false, reason: 'uses an archived food' };
  if (input.parts.some((p) => !(p.grams > 0) || p.grams > 1500)) return { ok: false, reason: 'implausible quantity' };
  if (input.parts.some((p) => kcalPer100(p.food) === null)) return { ok: false, reason: 'an ingredient has no energy data' };
  const maxPrep = ctx.request.maxPrepTimeMinutes ?? ctx.preferences.maxPrepTimeMinutes;
  if (maxPrep !== undefined && input.prepTimeMinutes !== null && input.prepTimeMinutes > maxPrep) return { ok: false, reason: 'exceeds max prep time' };
  const budget = computeBudget(ctx.request, ctx.goals, ctx.todayTotals);
  const parts = input.parts.map((p) => ({ food: p.food, grams: p.grams < 20 ? Math.max(1, Math.round(p.grams)) : Math.round(p.grams) }));
  const nutrition = sumNutrients(parts.map((p) => ({ grams: p.grams, nutrients: nutrientsForGrams(p.food, p.grams) })));
  if (ctx.request.maxCalories !== undefined && nutrition.energy.amount > ctx.request.maxCalories * 1.05) return { ok: false, reason: 'exceeds calorie limit' };
  const candidate: Candidate = {
    id: input.id,
    kind: parts.length === 1 ? 'food' : 'combo',
    name: input.name,
    parts: parts.map((p) => ({ food: p.food, grams: p.grams, foodId: p.food.id, name: p.food.name })),
    nutrition,
    totalGrams: parts.reduce((s, p) => s + p.grams, 0),
    prepTimeMinutes: input.prepTimeMinutes,
  };
  const scored = scoreCandidate(candidate, ctx, budget);
  if (!scored) return { ok: false, reason: 'cannot be evaluated with available data' };
  if (input.notes?.length) scored.explanation.unshift(...input.notes);
  return { ok: true, recommendation: toRecommendation(scored, ctx.request.mealType, 'ai') };
}

/** Foods that pass the user's hard restrictions (the only foods an AI may propose). */
export function allowedFoodPool(ctx: Pick<RecommendationContext, 'foods' | 'preferences' | 'request'>): Food[] {
  const maxPrep = ctx.request.maxPrepTimeMinutes ?? ctx.preferences.maxPrepTimeMinutes;
  return ctx.foods.filter(
    (f) =>
      !f.isArchived &&
      kcalPer100(f) !== null &&
      checkFoodRestrictions(f, ctx.preferences).allowed &&
      (maxPrep === undefined || f.prepTimeMinutes === undefined || f.prepTimeMinutes <= maxPrep),
  );
}
