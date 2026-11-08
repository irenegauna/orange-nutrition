import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDatabase, SEED_FOODS } from '../data/seed';
import { classicRecipeId, seedClassicRecipes } from '../data/seed/classicRecipes';
import { CLASSIC_RECIPES } from '../data/seed/classicRecipesData';
import { deleteRecipe, getRecipe, getRecipeNutrition, getRecipesForDish, updateRecipe } from '../services/recipes';
import { acceptAiPrivacyNotice, configureAiFetch, draftRecipeWithAI, setAiApiKey } from '../services/ai';
import { resetGeminiRateLimiter } from '../integrations/gemini';
import { freshDb } from './helpers';

const TORTILLA = classicRecipeId('tortilla-de-patata');

describe('classic Spanish recipes', () => {
  beforeEach(async () => {
    await freshDb();
    await seedDatabase();
  });

  it('every ingredient points at a bundled catalog food', () => {
    const ids = new Set(SEED_FOODS.map((f) => f.id));
    for (const r of CLASSIC_RECIPES) for (const i of r.ingredients) expect(ids.has(i.food), `${r.key}: ${i.food}`).toBe(true);
  });

  it('seeds all classics, linked to the measured dish when the catalog has it', async () => {
    const res = await seedClassicRecipes();
    expect(res.skipped).toEqual([]);
    expect(res.inserted).toBe(CLASSIC_RECIPES.length);
    const t = (await getRecipe(TORTILLA))!;
    expect(t.builtin?.key).toBe('tortilla-de-patata');
    expect(t.dishFoodId).toBe('ciqual_22510');
    expect((await getRecipesForDish('ciqual_22510')).map((r) => r.id)).toContain(TORTILLA);
    const n = await getRecipeNutrition(t);
    expect(n.perServing.energy).toBeGreaterThan(250);
    expect(n.perServing.energy).toBeLessThan(500);
    expect((await seedClassicRecipes()).ran).toBe(false); // idempotent
  });

  it('an edited classic becomes the user\'s and is never overwritten', async () => {
    await seedClassicRecipes();
    await updateRecipe(TORTILLA, { name: 'Mi tortilla' });
    expect((await getRecipe(TORTILLA))!.builtin).toBeUndefined();
    await seedClassicRecipes({ force: true });
    expect((await getRecipe(TORTILLA))!.name).toBe('Mi tortilla');
  });

  it('a deleted classic does not come back', async () => {
    await seedClassicRecipes();
    await deleteRecipe(TORTILLA);
    await seedClassicRecipes({ force: true });
    expect(await getRecipe(TORTILLA)).toBeUndefined();
  });
});

describe('draftRecipeWithAI', () => {
  beforeEach(async () => {
    resetGeminiRateLimiter();
    await freshDb();
    await seedDatabase();
  });
  afterEach(() => configureAiFetch(undefined));

  it('matches Gemini\'s ingredients to catalog foods and never takes nutrients from the AI', async () => {
    const answer = {
      isDish: true, name: 'Lentejas estofadas', servings: 4, instructions: ['Sofríe.', 'Cuece.'],
      ingredients: [
        { name: 'lentejas secas', searchTerms: ['lenteja'], grams: 320, preparation: 'dry' },
        { name: 'chorizo', searchTerms: ['chorizo'], grams: 120, preparation: 'raw' },
        { name: 'xqztv', searchTerms: ['xqztv'], grams: 10, preparation: 'raw' },
      ],
    };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ status: 'completed', outputs: [{ type: 'text', text: JSON.stringify(answer) }] }), { status: 200 }));
    configureAiFetch(fetchImpl as unknown as typeof fetch);
    await setAiApiKey('AIzaTEST-not-a-real-key-000000');
    await acceptAiPrivacyNotice();
    const d = await draftRecipeWithAI({ dish: 'lentejas', servings: 4 });
    expect(d.ingredients[0]!.matches[0]!.food.name).toMatch(/lenteja/i);
    expect(d.ingredients[0]!.matches[0]!.food.form).toBe('dry');
    expect(d.ingredients[1]!.matches[0]!.food.name).toMatch(/chorizo/i);
    expect(d.unmatchedCount).toBe(1);
    const body = String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body);
    expect(body).toMatch(/NEVER output calories/);
  });

  it('needs only a key and consent, not the photo switch', async () => {
    await expect(draftRecipeWithAI({ dish: 'pisto' })).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
});
