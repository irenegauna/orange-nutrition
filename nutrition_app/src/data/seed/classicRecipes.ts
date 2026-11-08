import type { MealType, Recipe } from '../../core/types/domain';
import { nowIso } from '../../core/utils/dates';
import { getDb, guard } from '../db';
import { fromFoodRecord } from '../repositories/foodRepository';
import { snapshotOf } from '../../services/meals/snapshot';
import type { Food, RecipeIngredient } from '../../core/types/domain';
import { normalizeText } from '../../core/utils/text';
import { metaRepository } from '../repositories/metaRepository';
import { CLASSIC_RECIPES, CLASSIC_RECIPES_VERSION } from './classicRecipesData';

/**
 * A classic Spanish home recipe, written for this app from traditional preparations
 * (ingredient lists are facts, quantities are typical home amounts — not copied from a book).
 * Ingredients point at bundled catalog foods (USDA / BEDCA / CIQUAL ids), in raw grams.
 */
export interface ClassicRecipeDef {
  key: string;
  name: string;
  servings: number;
  ingredients: { food: string; grams: number; note?: string }[];
  instructions: string[];
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  mealTypes: MealType[];
  tags: string[];
  /** Name prefix of the measured dish in BEDCA/CIQUAL ("tortilla de patata") — its lab values stay the default for photo & search. */
  dish?: string;
}

function ingredient(key: string, i: number, food: Food, grams: number, note?: string): RecipeIngredient {
  // Deterministic ids so refreshes don't churn; quantities in grams (unit 'g').
  return { id: `ing_classic_${key}_${i}`, foodId: food.id, quantity: { amount: grams, unit: 'g' }, grams, snapshot: snapshotOf(food), ...(note ? { note } : {}) };
}

export const classicRecipeId = (key: string) => `rec_classic_${key}`;

export interface ClassicSeedResult {
  ran: boolean;
  inserted: number;
  refreshed: number;
  /** Recipes skipped because an ingredient food is missing from the catalog (should be 0). */
  skipped: string[];
}

/**
 * Idempotent: inserts/refreshes the classic recipes when CLASSIC_RECIPES_VERSION increases.
 * Never touches a classic the user edited (it lost its `builtin` marker) or deleted (remembered in meta).
 */
export async function seedClassicRecipes(opts: { force?: boolean } = {}): Promise<ClassicSeedResult> {
  return guard('Seed classic recipes', async () => {
    const current = await metaRepository.get<number>('classicRecipesVersion');
    if (!opts.force && current !== undefined && current >= CLASSIC_RECIPES_VERSION) return { ran: false, inserted: 0, refreshed: 0, skipped: [] };
    const db = getDb();
    const removed = new Set((await metaRepository.get<string[]>('removedClassicRecipes')) ?? []);
    const res: ClassicSeedResult = { ran: true, inserted: 0, refreshed: 0, skipped: [] };
    await db.transaction('rw', [db.recipes, db.foods, db.meta], async () => {
      // Measured dishes, looked up by name so ids from future catalog imports link automatically.
      const dishes = await db.foods.filter((f) => f.source.type === 'bedca' || f.source.type === 'ciqual').toArray();
      const dishFor = (prefix: string) => {
        const p = normalizeText(prefix);
        return dishes.filter((f) => normalizeText(f.name).startsWith(p)).sort((a, b) => a.name.length - b.name.length)[0]?.id;
      };
      for (const def of CLASSIC_RECIPES) {
        if (removed.has(def.key)) continue;
        const id = classicRecipeId(def.key);
        const existing = await db.recipes.get(id);
        if (existing && !existing.builtin) continue; // the user made it theirs
        const foods = (await db.foods.bulkGet(def.ingredients.map((i) => i.food))).map((r) => (r ? fromFoodRecord(r) : undefined));
        if (foods.some((f) => !f)) {
          res.skipped.push(def.key);
          continue;
        }
        const now = nowIso();
        const recipe: Recipe = {
          id,
          name: def.name,
          servings: def.servings,
          ingredients: def.ingredients.map((ing, i) => ingredient(def.key, i, foods[i]!, ing.grams, ing.note)),
          ...(def.prepTimeMinutes !== undefined ? { prepTimeMinutes: def.prepTimeMinutes } : {}),
          ...(def.cookTimeMinutes !== undefined ? { cookTimeMinutes: def.cookTimeMinutes } : {}),
          mealTypes: def.mealTypes,
          instructions: def.instructions,
          tags: def.tags,
          builtin: { key: def.key, version: CLASSIC_RECIPES_VERSION },
          ...(def.dish && dishFor(def.dish) ? { dishFoodId: dishFor(def.dish)! } : {}),
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };
        await db.recipes.put(recipe);
        if (existing) res.refreshed++;
        else res.inserted++;
      }
      await db.meta.put({ key: 'classicRecipesVersion', value: CLASSIC_RECIPES_VERSION });
    });
    return res;
  });
}
