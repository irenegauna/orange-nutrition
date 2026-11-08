import type { Food } from '../../core/types/domain';
import { SEED_VERSION } from '../../core/constants/app';
import { getDb, guard } from '../db';
import { toFoodRecord } from '../repositories/foodRepository';
import { metaRepository, nutrientDefinitionRepository } from '../repositories/metaRepository';
import usdaSeed from './usdaFoods.json';
import bedcaSeed from './bedcaFoods.json';
import ciqualSeed from './ciqualFoods.json';

type SeedFile = { foods: Food[] };

/**
 * The bundled starter catalog:
 * - USDA FoodData Central SR Legacy (scripts/build-usda-seed.ts)
 * - BEDCA, Spanish food composition database (AESAN), non-commercial use with attribution (scripts/build-bedca-seed.ts)
 * - ANSES-CIQUAL 2025 gap-fill of Spanish dishes missing from BEDCA (scripts/build-ciqual-seed.ts)
 */
/**
 * Source rows left out of the bundle (never modified — BEDCA's licence forbids changing values).
 * bedca_2192 "Garbanzo, hervido": 1500 kJ (359 kcal)/100 g, about double what its own macros give — the dry value filed by mistake.
 */
const EXCLUDED_SEED_IDS = new Set(['bedca_2192']);

export const SEED_FOODS: readonly Food[] = [
  ...(usdaSeed as unknown as SeedFile).foods,
  ...(bedcaSeed as unknown as SeedFile).foods,
  ...(ciqualSeed as unknown as SeedFile).foods,
].filter((f) => !EXCLUDED_SEED_IDS.has(f.id));

export interface SeedResult {
  ran: boolean;
  inserted: number;
  updated: number;
  version: number;
}

/**
 * Idempotent seeding. Inserts/refreshes the seed foods (USDA, BEDCA, CIQUAL) when the stored seed version is older.
 * User and Open Food Facts foods are never touched. Safe to call on every app start.
 */
export async function seedDatabase(opts: { force?: boolean } = {}): Promise<SeedResult> {
  return guard('Seed database', async () => {
    const current = await metaRepository.get<number>('seedVersion');
    if (!opts.force && current !== undefined && current >= SEED_VERSION) {
      return { ran: false, inserted: 0, updated: 0, version: current };
    }
    const db = getDb();
    const records = SEED_FOODS.map(toFoodRecord);
    let inserted = 0;
    let updated = 0;
    await db.transaction('rw', [db.foods, db.meta, db.nutrientDefinitions], async () => {
      const existing = await db.foods.bulkGet(records.map((r) => r.id));
      existing.forEach((e) => (e ? updated++ : inserted++));
      // Keep user's archive choice on refresh.
      const merged = records.map((r, i) => (existing[i] ? { ...r, isArchived: existing[i]!.isArchived } : r));
      await db.foods.bulkPut(merged);
      await nutrientDefinitionRepository.sync();
      await db.meta.put({ key: 'seedVersion', value: SEED_VERSION });
    });
    return { ran: true, inserted, updated, version: SEED_VERSION };
  });
}
