import { beforeEach, describe, expect, it } from 'vitest';
import { checkFoodRestrictions, computeBudget, generateRecommendations, parseIntent } from '../core/recommendations';
import { sumNutrients } from '../core/nutrition';
import { defaultPreferences } from '../data/repositories';
import { seedDatabase } from '../data/seed';
import { recommend, recommendFromText } from '../services/recommendations';
import { setMacroGoals, setAllergies, setDiets, setAvailableIngredients } from '../services/goals';
import { createRecipe } from '../services/recipes';
import { addMealEntry } from '../services/meals';
import { foodRepository } from '../data/repositories';
import { freshDb, k, makeFood } from './helpers';

describe('intent parser', () => {
  it.each([
    ['Suggest dinner', 'meal', { mealType: 'dinner' }],
    ['high protein snack under 300 kcal', 'high_protein', { mealType: 'snack', maxCalories: 300 }],
    ['something low calorie for lunch', 'low_calorie', { mealType: 'lunch' }],
    ['I need more fibre', 'high_fiber', {}],
    ['foods rich in iron', 'micronutrient', { nutrientId: 'iron' }],
    ['what is high in vitamin B12?', 'micronutrient', { nutrientId: 'vitaminB12' }],
    ['give me a vitamin c boost', 'micronutrient', { nutrientId: 'vitaminC' }],
    ['what should I eat to hit my macros', 'fit_remaining', {}],
    ['quick breakfast', 'meal', { mealType: 'breakfast', maxPrepTimeMinutes: 15 }],
    ['dinner in 20 minutes', 'meal', { mealType: 'dinner', maxPrepTimeMinutes: 20 }],
  ] as const)('%s → %s', (text, intent, extra) => {
    const p = parseIntent(text);
    expect(p.request.intent).toBe(intent);
    expect(p.request).toMatchObject(extra);
  });

  it('extracts ingredient terms', () => {
    const p = parseIntent('What can I make with chicken, rice and broccoli?');
    expect(p.request.intent).toBe('use_ingredients');
    expect(p.ingredientTerms).toEqual(['chicken', 'rice', 'broccoli']);
  });

  it('falls back with low confidence', () => {
    const p = parseIntent('asdf qwerty');
    expect(p.request.intent).toBe('meal');
    expect(p.confidence).toBeLessThan(0.5);
  });
});

describe('hard restriction filters', () => {
  const prefs = { ...defaultPreferences(), allergies: ['peanuts' as const] };
  it('excludes allergens, traces and unknown metadata', () => {
    expect(checkFoodRestrictions(makeFood('pb', {}, { allergens: ['peanuts'] }), prefs).allowed).toBe(false);
    expect(checkFoodRestrictions(makeFood('bar', {}, { traces: ['peanuts'] }), prefs).allowed).toBe(false);
    expect(checkFoodRestrictions(makeFood('x', {}, { allergenInfo: 'unknown' }), prefs).allowed).toBe(false);
    expect(checkFoodRestrictions(makeFood('apple', {}), prefs).allowed).toBe(true);
    // keyword safety net applies to manufacturer-declared data only
    expect(checkFoodRestrictions(makeFood('c', {}, { name: 'Peanut cookies', allergenInfo: 'declared' }), prefs).allowed).toBe(false);
  });
  it('applies diets and dislikes', () => {
    const vegan = { ...defaultPreferences(), diets: ['vegan' as const], dislikedKeywords: ['olive'] };
    expect(checkFoodRestrictions(makeFood('honey', {}, { dietaryFlags: ['honey'] }), vegan).allowed).toBe(false);
    expect(checkFoodRestrictions(makeFood('cheese', {}, { allergens: ['milk'] }), vegan).allowed).toBe(false);
    expect(checkFoodRestrictions(makeFood('o', {}, { name: 'Olives, ripe' }), vegan).allowed).toBe(false);
    expect(checkFoodRestrictions(makeFood('lentils', {}), vegan).allowed).toBe(true);
  });
});

describe('recommendation engine (pure)', () => {
  const lean = makeFood('lean', { energy: k(165), protein: k(31), carbohydrate: k(0.01), fat: k(3.6), fiber: k(0.01) }, { name: 'Lean chicken', role: 'protein', form: 'cooked', prepTimeMinutes: 20 });
  const nuts = makeFood('nuts', { energy: k(579), protein: k(21), carbohydrate: k(22), fat: k(50), fiber: k(12.5) }, { name: 'Nuts mix', role: 'fat', allergens: ['tree_nuts'], prepTimeMinutes: 0 });
  const beans = makeFood('beans', { energy: k(132), protein: k(8.9), carbohydrate: k(23.7), fat: k(0.5), fiber: k(8.7) }, { name: 'Black beans', role: 'protein', form: 'cooked', prepTimeMinutes: 5 });
  const empty = sumNutrients([]);

  it('ranks high-protein foods first for high_protein intent', () => {
    const recs = generateRecommendations({
      request: { intent: 'high_protein', mealType: 'snack' },
      foods: [nuts, beans, lean],
      recipes: [],
      preferences: defaultPreferences(),
      goals: null,
      todayTotals: empty,
      eatenTodayFoodIds: new Set(),
    });
    expect(recs[0]?.name).toBe('Lean chicken');
    expect(recs[0]?.scoreBreakdown.proteinDensity).toBe(1);
    expect(recs[0]?.explanation.join(' ')).toMatch(/prote/);
    // nutrition computed from data for the suggested grams
    const g = recs[0]!.ingredients[0]!.grams;
    expect(recs[0]!.nutrition.protein.amount).toBeCloseTo((31 * g) / 100, 10);
  });

  it('allergies are hard exclusions regardless of score', () => {
    const recs = generateRecommendations({
      request: { intent: 'high_fiber', mealType: 'snack', limit: 10 },
      foods: [nuts, beans, lean],
      recipes: [],
      preferences: { ...defaultPreferences(), allergies: ['tree_nuts'] },
      goals: null,
      todayTotals: empty,
      eatenTodayFoodIds: new Set(),
    });
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.some((r) => r.ingredients.some((i) => i.foodId === 'nuts'))).toBe(false);
  });

  it('is deterministic', () => {
    const ctx = { request: { intent: 'meal' as const, mealType: 'dinner' as const }, foods: [nuts, beans, lean], recipes: [], preferences: defaultPreferences(), goals: null, todayTotals: empty, eatenTodayFoodIds: new Set<string>() };
    expect(generateRecommendations(ctx)).toEqual(generateRecommendations(ctx));
  });

  it('budgets from remaining calories', () => {
    const goals = { id: 'g', effectiveFrom: '2026-01-01', createdAt: '', updatedAt: '', targets: { energy: { amount: 2000, direction: 'around' as const, origin: 'user' as const } } };
    const consumed = sumNutrients([{ grams: 100, nutrients: { energy: k(1800) } }]);
    const b = computeBudget({ intent: 'meal', mealType: 'dinner' }, goals, consumed);
    expect(b.kcal).toBe(200);
    expect(b.remainingKcal).toBe(200);
    expect(computeBudget({ intent: 'meal', mealType: 'dinner', maxCalories: 120 }, goals, consumed).kcal).toBe(120);
  });
});

describe('recommendation service (with seed data)', () => {
  beforeEach(async () => {
    await freshDb();
    await seedDatabase();
  });

  it('suggests dinner plates that respect remaining calories', async () => {
    await setMacroGoals({ calories: 2000, protein: 140, carbohydrate: 200, fat: 70 }, '2026-01-01');
    const recs = await recommend({ intent: 'meal', mealType: 'dinner', date: '2026-11-07' });
    expect(recs.length).toBeGreaterThan(0);
    const top = recs[0]!;
    expect(top.kind).toBe('combo');
    expect(top.nutrition.energy.amount).toBeGreaterThan(400);
    expect(top.nutrition.energy.amount).toBeLessThan(1100);
    expect(top.ingredients.every((i) => i.grams > 0 && i.quantityLabel.length > 0)).toBe(true);
    expect(top.score).toBeGreaterThan(0);
    expect(top.score).toBeLessThanOrEqual(100);
  });

  it('vegan + peanut allergy never surfaces animal products or peanuts', async () => {
    await setDiets(['vegan']);
    await setAllergies(['peanuts']);
    const recs = await recommend({ intent: 'high_protein', mealType: 'lunch', date: '2026-11-07', limit: 15 });
    expect(recs.length).toBeGreaterThan(0);
    const foods = await foodRepository.getMany(recs.flatMap((r) => r.ingredients.map((i) => i.foodId)));
    for (const f of foods.values()) {
      expect(f.dietaryFlags.some((x) => ['meat', 'poultry', 'fish', 'shellfish', 'dairy', 'egg', 'honey'].includes(x))).toBe(false);
      expect(f.allergens).not.toContain('peanuts');
    }
  });

  it('micronutrient intent ranks foods rich in that nutrient', async () => {
    const recs = await recommend({ intent: 'micronutrient', nutrientId: 'vitaminC', mealType: 'snack', date: '2026-11-07' });
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0]!.nutrition.vitaminC.amount).toBeGreaterThan(30);
    expect(recs[0]!.explanation.join(' ')).toMatch(/Vitamin C/);
  });

  it('uses available ingredients and saved recipes', async () => {
    await setAvailableIngredients(['usda_172187', 'usda_168463', 'usda_172688']); // eggs, spinach, bread
    const recs = await recommend({ intent: 'use_ingredients', mealType: 'breakfast', date: '2026-11-07' });
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0]!.ingredients.every((i) => ['usda_172187', 'usda_168463', 'usda_172688'].includes(i.foodId))).toBe(true);
    await createRecipe({ name: 'Spinach omelette', servings: 1, prepTimeMinutes: 10, mealTypes: ['breakfast'], ingredients: [{ foodId: 'usda_171287', quantity: { amount: 150, unit: 'g' } }, { foodId: 'usda_168462', quantity: { amount: 60, unit: 'g' } }] });
    const withRecipe = await recommend({ intent: 'meal', mealType: 'breakfast', date: '2026-11-07', limit: 30 });
    expect(withRecipe.some((r) => r.kind === 'recipe' && r.name.startsWith('Spinach omelette'))).toBe(true);
  });

  it('accounts for food already eaten today', async () => {
    await setMacroGoals({ calories: 2000 }, '2026-01-01');
    await addMealEntry({ date: '2026-11-07', mealType: 'lunch', foodId: 'usda_169705', quantity: { amount: 450, unit: 'g' } }); // ~1700 kcal oats
    const recs = await recommend({ intent: 'meal', mealType: 'dinner', date: '2026-11-07' });
    expect(recs[0]!.nutrition.energy.amount).toBeLessThan(700);
  });

  it('text entry point resolves ingredients', async () => {
    const r = await recommendFromText('what can I make with salmon and quinoa', { date: '2026-11-07' });
    expect(r.parsed.request.intent).toBe('use_ingredients');
    expect(r.matchedIngredients.map((f) => f.name)).toEqual(expect.arrayContaining([expect.stringMatching(/Salmon/), expect.stringMatching(/Quinoa/)]));
    expect(r.recommendations.length).toBeGreaterThan(0);
  });
});
