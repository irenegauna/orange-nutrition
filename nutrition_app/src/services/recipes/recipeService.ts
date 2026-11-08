import type { LocalDate, MealEntry, MealType, Quantity, Recipe, RecipeIngredient, RecipeNutrition } from '../../core/types/domain';
import { calculateRecipeNutrition, scaleTotals } from '../../core/nutrition';
import { totalsToValues } from '../../core/nutrition/values';
import { assertLocalDate, nowIso } from '../../core/utils/dates';
import { createId } from '../../core/utils/ids';
import { DataError } from '../../core/utils/errors';
import { quantityToGrams } from '../../core/utils/units';
import { getDb, guard } from '../../data/db';
import { foodRepository, mealEntryRepository, preferencesRepository, recipeRepository } from '../../data/repositories';
import { snapshotOf } from '../meals/snapshot';
import { metaRepository } from '../../data/repositories/metaRepository';

export interface IngredientInput {
  foodId: string;
  quantity: Quantity;
  note?: string;
}

export interface RecipeInput {
  name: string;
  description?: string;
  servings: number;
  ingredients?: IngredientInput[];
  cookedWeightGrams?: number;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  mealTypes?: MealType[];
  instructions?: string[];
  tags?: string[];
  /** The measured dish food this recipe is a home-made version of. */
  dishFoodId?: string;
}

async function buildIngredient(input: IngredientInput): Promise<RecipeIngredient> {
  const food = await foodRepository.getOrThrow(input.foodId);
  const grams = await guard('Add ingredient', async () => quantityToGrams(input.quantity, food));
  return { id: createId('ing'), foodId: food.id, quantity: input.quantity, grams, snapshot: snapshotOf(food), ...(input.note ? { note: input.note } : {}) };
}

export async function createRecipe(input: RecipeInput): Promise<Recipe> {
  const now = nowIso();
  const ingredients = await Promise.all((input.ingredients ?? []).map(buildIngredient));
  return recipeRepository.put({
    id: createId('rec'),
    name: input.name.trim(),
    ...(input.description ? { description: input.description } : {}),
    servings: input.servings,
    ingredients,
    ...(input.cookedWeightGrams ? { cookedWeightGrams: input.cookedWeightGrams } : {}),
    ...(input.prepTimeMinutes !== undefined ? { prepTimeMinutes: input.prepTimeMinutes } : {}),
    ...(input.cookTimeMinutes !== undefined ? { cookTimeMinutes: input.cookTimeMinutes } : {}),
    mealTypes: input.mealTypes ?? [],
    instructions: input.instructions ?? [],
    tags: input.tags ?? [],
    ...(input.dishFoodId ? { dishFoodId: input.dishFoodId } : {}),
    createdAt: now,
    updatedAt: now,
  });
}

/** Updates recipe metadata (ingredients via add/remove/updateIngredient). `null` clears optional fields. */
export async function updateRecipe(
  id: string,
  patch: Partial<Omit<RecipeInput, 'ingredients' | 'cookedWeightGrams' | 'prepTimeMinutes' | 'cookTimeMinutes'>> & {
    cookedWeightGrams?: number | null;
    prepTimeMinutes?: number | null;
    cookTimeMinutes?: number | null;
  },
): Promise<Recipe> {
  const db = getDb();
  return guard('Update recipe', () =>
    db.transaction('rw', db.recipes, async () => {
      const r = await recipeRepository.getOrThrow(id);
      const next: Recipe = { ...ownCopy(r), updatedAt: nowIso() };
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) delete (next as unknown as Record<string, unknown>)[k];
        else if (v !== undefined) (next as unknown as Record<string, unknown>)[k] = v;
      }
      return recipeRepository.put(next);
    }),
  );
}

/** Edited classic recipes become the user's: drop the builtin marker so seeding leaves them alone. */
function ownCopy(r: Recipe): Recipe {
  const { builtin: _b, ...rest } = r;
  return rest;
}

export async function deleteRecipe(id: string): Promise<void> {
  const r = await recipeRepository.getOrThrow(id);
  // Deleted classics must not come back on the next catalog refresh.
  if (r.builtin) {
    const removed = (await metaRepository.get<string[]>('removedClassicRecipes')) ?? [];
    if (!removed.includes(r.builtin.key)) await metaRepository.set('removedClassicRecipes', [...removed, r.builtin.key]);
  }
  await recipeRepository.delete(id);
  await preferencesRepository.update((p) => ({ ...p, favoriteRecipeIds: p.favoriteRecipeIds.filter((r) => r !== id) }));
}

export async function addIngredient(recipeId: string, input: IngredientInput): Promise<Recipe> {
  const ing = await buildIngredient(input);
  const r = await recipeRepository.getOrThrow(recipeId);
  return recipeRepository.put({ ...ownCopy(r), ingredients: [...r.ingredients, ing], updatedAt: nowIso() });
}

export async function updateIngredient(recipeId: string, ingredientId: string, patch: { quantity?: Quantity; note?: string }): Promise<Recipe> {
  const r = await recipeRepository.getOrThrow(recipeId);
  const idx = r.ingredients.findIndex((i) => i.id === ingredientId);
  if (idx < 0) throw new DataError('NOT_FOUND', `Ingredient ${ingredientId} not in recipe`);
  const ing = { ...r.ingredients[idx]! };
  if (patch.quantity) {
    const live = await foodRepository.get(ing.foodId);
    ing.quantity = patch.quantity;
    ing.grams = await guard('Update ingredient', async () => quantityToGrams(patch.quantity!, live ?? ing.snapshot));
    if (live) ing.snapshot = snapshotOf(live);
  }
  if (patch.note !== undefined) ing.note = patch.note;
  const ingredients = [...r.ingredients];
  ingredients[idx] = ing;
  return recipeRepository.put({ ...ownCopy(r), ingredients, updatedAt: nowIso() });
}

export async function removeIngredient(recipeId: string, ingredientId: string): Promise<Recipe> {
  const r = await recipeRepository.getOrThrow(recipeId);
  if (!r.ingredients.some((i) => i.id === ingredientId)) throw new DataError('NOT_FOUND', `Ingredient ${ingredientId} not in recipe`);
  return recipeRepository.put({ ...ownCopy(r), ingredients: r.ingredients.filter((i) => i.id !== ingredientId), updatedAt: nowIso() });
}

/** Computes nutrition from current food data (snapshots used for deleted foods). */
export async function getRecipeNutrition(recipeOrId: string | Recipe): Promise<RecipeNutrition> {
  const recipe = typeof recipeOrId === 'string' ? await recipeRepository.getOrThrow(recipeOrId) : recipeOrId;
  const foods = await foodRepository.getMany(recipe.ingredients.map((i) => i.foodId));
  return guard('Calculate recipe nutrition', async () => calculateRecipeNutrition(recipe, foods));
}

export const calculateRecipeTotals = async (id: string) => (await getRecipeNutrition(id)).total;
export const calculateRecipePerServing = async (id: string) => (await getRecipeNutrition(id)).perServing;

export interface LogRecipeInput {
  date: LocalDate;
  mealType: MealType;
  /** Number of recipe servings eaten (default 1). */
  servings?: number;
  note?: string;
}

/** Logs a recipe as a meal entry with a frozen per-100 g snapshot. */
export async function logRecipe(recipeId: string, input: LogRecipeInput): Promise<MealEntry> {
  assertLocalDate(input.date);
  const recipe = await recipeRepository.getOrThrow(recipeId);
  if (recipe.ingredients.length === 0) throw new DataError('VALIDATION', 'No se puede registrar una receta sin ingredientes');
  const n = await getRecipeNutrition(recipe);
  const servings = input.servings ?? 1;
  if (!(servings > 0)) throw new DataError('VALIDATION', 'Las raciones deben ser más de 0');
  const servingId = `${recipe.id}_serving`;
  const now = nowIso();
  return mealEntryRepository.add({
    id: createId('meal'),
    date: input.date,
    mealType: input.mealType,
    kind: 'recipe',
    recipeId: recipe.id,
    snapshot: {
      name: recipe.name,
      sourceType: 'recipe',
      nutrientsPer100g: n.per100g,
      servings: [{ id: servingId, label: '1 serving', grams: n.gramsPerServing, isDefault: true }],
    },
    quantity: { amount: servings, unit: 'serving', servingId },
    grams: n.gramsPerServing * servings,
    nutrients: totalsToValues(scaleTotals(n.perServing, servings)),
    ...(input.note ? { note: input.note } : {}),
    origin: 'recipe',
    loggedAt: now,
    createdAt: now,
    updatedAt: now,
  });
}

export const getRecipe = (id: string) => recipeRepository.get(id);
/** Recipes that are the home-made version of a measured dish (for "ver receta / personalizar"). */
export const getRecipesForDish = async (foodId: string) => (await recipeRepository.list()).filter((r) => r.dishFoodId === foodId);
export const listRecipes = () => recipeRepository.list();
export const searchRecipes = (q: string) => recipeRepository.search(q);

export async function setRecipeFavorite(recipeId: string, favorite: boolean): Promise<string[]> {
  const prefs = await preferencesRepository.update((p) => {
    const set = new Set(p.favoriteRecipeIds);
    if (favorite) set.add(recipeId);
    else set.delete(recipeId);
    return { ...p, favoriteRecipeIds: [...set] };
  });
  return prefs.favoriteRecipeIds;
}
