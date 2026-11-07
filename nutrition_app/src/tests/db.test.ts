import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { NutritionDB, setDb } from '../data/db';
import { SCHEMA_V1 } from '../data/migrations';
import { foodRepository, goalsRepository, preferencesRepository } from '../data/repositories';
import { seedDatabase, SEED_FOODS } from '../data/seed';
import { searchFoods, setFoodFavorite, createCustomFood, deleteFood, getFavoriteFoods } from '../services/food';
import { DataError } from '../core/utils/errors';
import { freshDb, k, makeFood } from './helpers';

describe('database migrations', () => {
  it('upgrades v1 → v3 preserving data, backfilling search tokens and adding photos', async () => {
    const name = `migrate_${Date.now()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores(SCHEMA_V1);
    await v1.open();
    const food = makeFood('legacy_1', { energy: k(52) }, { name: 'Crème Fraîche Deluxe' });
    await v1.table('foods').add(food);
    await v1.table('mealEntries').add({ id: 'm1', date: '2026-01-01', mealType: 'lunch', loggedAt: '2026-01-01T12:00:00.000Z' });
    v1.close();

    const db = setDb(new NutritionDB(name));
    await db.open();
    expect(db.verno).toBe(3);
    const migrated = await db.foods.get('legacy_1');
    expect(migrated?.name).toBe('Crème Fraîche Deluxe');
    expect(migrated?.searchTokens).toEqual(expect.arrayContaining(['creme', 'fraiche', 'deluxe']));
    // new compound index works on migrated rows
    const rows = await db.mealEntries.where('[date+mealType]').equals(['2026-01-01', 'lunch']).toArray();
    expect(rows.map((r) => r.id)).toEqual(['m1']);
    expect(await db.meta.count()).toBe(0); // v2 table exists
    expect(await db.photos.count()).toBe(0); // v3 table exists
    expect(await db.mealEntries.where('photoId').equals('none').count()).toBe(0); // v3 index
  });
});

describe('repositories & seed', () => {
  beforeEach(async () => {
    await freshDb();
  });

  it('seeds the USDA catalog idempotently', async () => {
    expect(SEED_FOODS.length).toBeGreaterThan(150);
    const r1 = await seedDatabase();
    expect(r1).toMatchObject({ ran: true, inserted: SEED_FOODS.length, updated: 0 });
    const r2 = await seedDatabase();
    expect(r2.ran).toBe(false);
    expect(await foodRepository.count()).toBe(SEED_FOODS.length);
    const banana = await foodRepository.get('usda_173944');
    expect(banana?.source.type).toBe('usda_sr_legacy');
    expect(banana?.source.attribution).toMatch(/FoodData Central/);
    expect(banana?.nutrientsPer100g.energy).toEqual({ status: 'known', amount: 89 });
    // SR Legacy has no iodine/biotin data → missing, never zero
    expect(banana?.nutrientsPer100g.iodine).toBeUndefined();
  });

  it('searches foods by token prefix, alias and barcode with ranking', async () => {
    await seedDatabase();
    const res = await searchFoods('pechuga de pollo');
    expect(res[0]?.food.name).toMatch(/^Pechuga de pollo/);
    expect(res.every((r) => r.food.name.toLowerCase().includes('chicken'))).toBe(true);
    const alias = await searchFoods('zapallito'); // Latin-American alias for calabacín
    expect(alias[0]?.food.name).toMatch(/Calabacín/);
    const eggs = await searchFoods('huevos'); // plural
    expect(eggs[0]?.food.name).toMatch(/^Huevo/);
    await foodRepository.put(makeFood('food_bar', { energy: k(400) }, { name: 'Granola Bar', barcode: '3017620422003' }));
    const byCode = await searchFoods('3017620422003');
    expect(byCode[0]).toMatchObject({ matchType: 'barcode' });
    expect(await searchFoods('   ')).toEqual([]);
  });

  it('favorites boost search and can be listed', async () => {
    await seedDatabase();
    await setFoodFavorite('usda_171998', true);
    const res = await searchFoods('salmon');
    expect(res[0]?.food.id).toBe('usda_171998');
    expect(res[0]?.isFavorite).toBe(true);
    expect((await getFavoriteFoods()).map((f) => f.id)).toEqual(['usda_171998']);
    await expect(setFoodFavorite('nope', true)).rejects.toBeInstanceOf(DataError);
  });

  it('validates writes and reports typed errors', async () => {
    await expect(foodRepository.create(makeFood('', { energy: k(1) }))).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(foodRepository.create(makeFood('x', { energy: { status: 'known', amount: -5 } }))).rejects.toMatchObject({ code: 'VALIDATION' });
    await foodRepository.create(makeFood('dup', { energy: k(1) }));
    await expect(foodRepository.create(makeFood('dup', { energy: k(1) }))).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(foodRepository.getOrThrow('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('custom foods: create, delete; seed foods are archived instead', async () => {
    await seedDatabase();
    const f = await createCustomFood({ name: 'Mom’s lasagna', nutrientsPer100g: { energy: k(160), protein: k(9) } });
    expect(f.allergenInfo).toBe('unknown');
    expect(f.completeness.hasCoreMacros).toBe(false);
    await deleteFood(f.id);
    expect(await foodRepository.get(f.id)).toBeNull();
    await deleteFood('usda_173944');
    expect((await foodRepository.get('usda_173944'))?.isArchived).toBe(true);
    expect((await searchFoods('banana')).some((r) => r.food.id === 'usda_173944')).toBe(false);
  });

  it('goals are versioned by effective date', async () => {
    const t = (amount: number) => ({ energy: { amount, direction: 'around' as const, origin: 'user' as const } });
    await goalsRepository.put({ id: 'g1', effectiveFrom: '2026-01-01', targets: t(2000), createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' });
    await goalsRepository.put({ id: 'g2', effectiveFrom: '2026-03-01', targets: t(1800), createdAt: '2026-03-01T00:00:00Z', updatedAt: '2026-03-01T00:00:00Z' });
    expect(await goalsRepository.forDate('2025-12-31')).toBeNull();
    expect((await goalsRepository.forDate('2026-02-15'))?.targets.energy?.amount).toBe(2000);
    expect((await goalsRepository.forDate('2026-03-01'))?.targets.energy?.amount).toBe(1800);
  });

  it('preferences default and update transactionally', async () => {
    expect((await preferencesRepository.get()).weekStartsOn).toBe(1);
    const p = await preferencesRepository.update((x) => ({ ...x, allergies: ['peanuts'] }));
    expect(p.allergies).toEqual(['peanuts']);
    await expect(preferencesRepository.update((x) => ({ ...x, allergies: ['banana' as never] }))).rejects.toMatchObject({ code: 'VALIDATION' });
    expect((await preferencesRepository.get()).allergies).toEqual(['peanuts']);
  });
});
