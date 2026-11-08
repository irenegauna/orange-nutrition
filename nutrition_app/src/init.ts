import { getDb } from './data/db';
import { seedDatabase, type SeedResult } from './data/seed';
import { seedClassicRecipes, type ClassicSeedResult } from './data/seed/classicRecipes';
import { purgeExpiredProductCache } from './services/barcode';
import { purgeOrphanPhotos } from './services/ai/photos';
import { DataError } from './core/utils/errors';
import { toDataError } from './data/db/errors';

export interface InitializeResult {
  seed: SeedResult;
  classicRecipes: ClassicSeedResult;
  purgedCacheEntries: number;
  purgedPhotos: number;
}

/**
 * Opens the database (running migrations), seeds the offline food catalog when needed and
 * purges expired barcode cache entries. Safe to call on every app start.
 */
export async function initializeApp(): Promise<InitializeResult> {
  try {
    await getDb().open();
  } catch (e) {
    const err = toDataError(e, 'Open database');
    throw err.code === 'DB' ? new DataError('UNAVAILABLE', `Local database unavailable: ${err.message}`, undefined, { cause: e }) : err;
  }
  const seed = await seedDatabase();
  // After foods: classics reference catalog ids. A failure here must not block the app.
  const classicRecipes = await seedClassicRecipes().catch(() => ({ ran: false, inserted: 0, refreshed: 0, skipped: [] as string[] }));
  const purgedCacheEntries = await purgeExpiredProductCache().catch(() => 0);
  const purgedPhotos = await purgeOrphanPhotos().catch(() => 0);
  return { seed, classicRecipes, purgedCacheEntries, purgedPhotos };
}
