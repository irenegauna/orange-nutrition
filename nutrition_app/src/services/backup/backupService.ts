import { ZodError } from 'zod';
import { SEED_SOURCE_TYPES } from '../../core/types/domain';
import type { BackupPayload, CachedProduct, DailyGoals, Food, MealEntry, Recipe, UserPreferences } from '../../core/types/domain';
import { BACKUP_FORMAT, BACKUP_SCHEMA_VERSION } from '../../core/types/domain';
import { APP_VERSION } from '../../core/constants/app';
import { backupPayloadSchema, formatZodIssues } from '../../core/validation/schemas';
import { fnv1a } from '../../core/utils/ids';
import { nowIso } from '../../core/utils/dates';
import { DataError } from '../../core/utils/errors';
import { getDb, guard } from '../../data/db';
import { CURRENT_DB_VERSION } from '../../data/migrations';
import { toFoodRecord } from '../../data/repositories/foodRepository';

/**
 * JSON backup / restore. Personal data never leaves the device unless the user exports it.
 *
 * Safety guarantees:
 * - The ENTIRE payload is parsed and validated before any write.
 * - All writes happen in ONE IndexedDB transaction: on any failure nothing changes (rollback).
 * - `replace` mode clears tables inside that same transaction, so a failed import never loses data.
 */

export interface ExportOptions {
  /** Include USDA seed foods (default false — they are re-created by seeding). */
  includeSeedFoods?: boolean;
  /** Include the barcode cache (default false). */
  includeProductCache?: boolean;
}

export async function exportBackup(opts: ExportOptions = {}): Promise<BackupPayload> {
  return guard('Export backup', async () => {
    const db = getDb();
    return db.transaction('r', [db.foods, db.mealEntries, db.recipes, db.goals, db.preferences, db.cachedProducts], async () => {
      const foodRecs = await db.foods.toArray();
      const foods: Food[] = foodRecs
        .filter((f) => opts.includeSeedFoods || !SEED_SOURCE_TYPES.includes(f.source.type) || f.isArchived)
        .map(({ searchTokens: _s, ...f }) => f);
      const data: BackupPayload['data'] = {
        foods,
        mealEntries: await db.mealEntries.toArray(),
        recipes: await db.recipes.toArray(),
        goals: await db.goals.toArray(),
        preferences: await db.preferences.toArray(),
        ...(opts.includeProductCache ? { cachedProducts: await db.cachedProducts.toArray() } : {}),
      };
      return {
        format: BACKUP_FORMAT,
        schemaVersion: BACKUP_SCHEMA_VERSION,
        exportedAt: nowIso(),
        appVersion: APP_VERSION,
        dbVersion: CURRENT_DB_VERSION,
        data,
        counts: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, (v as unknown[]).length])),
        checksum: fnv1a(JSON.stringify(data)),
      };
    });
  });
}

/** Serialized backup ready for download (frontend creates the Blob / share sheet). */
export async function exportBackupJson(opts?: ExportOptions): Promise<{ json: string; filename: string }> {
  const payload = await exportBackup(opts);
  const stamp = payload.exportedAt.slice(0, 19).replace(/[:T]/g, '-');
  return { json: JSON.stringify(payload, null, 2), filename: `nutrition-backup-${stamp}.json` };
}

export interface BackupValidationResult {
  valid: boolean;
  payload?: BackupPayload;
  errors: string[];
  warnings: string[];
}

/** Migrates older backup schema versions to the current one (v1 is current). */
function migrateBackup(raw: Record<string, unknown>): Record<string, unknown> {
  return raw;
}

/** Validates a backup (string or parsed object) without touching the database. */
export function validateBackup(input: unknown): BackupValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let raw: unknown = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch {
      return { valid: false, errors: ['File is not valid JSON'], warnings };
    }
  }
  if (!raw || typeof raw !== 'object') return { valid: false, errors: ['Backup must be a JSON object'], warnings };
  const obj = raw as Record<string, unknown>;
  if (obj.format !== BACKUP_FORMAT) return { valid: false, errors: [`Not a nutrition_app backup (format: ${String(obj.format)})`], warnings };
  if (typeof obj.schemaVersion !== 'number' || obj.schemaVersion > BACKUP_SCHEMA_VERSION) {
    return { valid: false, errors: [`Unsupported backup schema version ${String(obj.schemaVersion)}; update the app first`], warnings };
  }
  const parsed = backupPayloadSchema.safeParse(migrateBackup(obj));
  if (!parsed.success) return { valid: false, errors: formatZodIssues(parsed.error), warnings };
  const payload = parsed.data as BackupPayload;

  if (fnv1a(JSON.stringify(payload.data)) !== payload.checksum) warnings.push('Checksum mismatch: the file may have been edited. Data passed validation.');

  // Referential & duplicate checks
  const dup = (name: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) errors.push(`Duplicate ${name} id "${id}" in backup`);
      seen.add(id);
    }
  };
  dup('food', payload.data.foods.map((f) => f.id));
  dup('meal entry', payload.data.mealEntries.map((e) => e.id));
  dup('recipe', payload.data.recipes.map((r) => r.id));
  dup('goals', payload.data.goals.map((g) => g.id));
  const goalDates = new Set<string>();
  for (const g of payload.data.goals) {
    if (goalDates.has(g.effectiveFrom)) errors.push(`Two goal sets share effectiveFrom ${g.effectiveFrom}`);
    goalDates.add(g.effectiveFrom);
  }
  const recipeIds = new Set(payload.data.recipes.map((r) => r.id));
  const orphanRecipeEntries = payload.data.mealEntries.filter((e) => e.recipeId && !recipeIds.has(e.recipeId)).length;
  if (orphanRecipeEntries) warnings.push(`${orphanRecipeEntries} meal entries reference recipes not in the backup (their nutrition snapshots are kept).`);

  return errors.length ? { valid: false, errors, warnings } : { valid: true, payload, errors, warnings };
}

export type DuplicateStrategy = 'skip' | 'overwrite' | 'newest';

export interface ImportOptions {
  /** merge (default): upsert into existing data. replace: wipe user data, then restore. */
  mode?: 'merge' | 'replace';
  /** For merge mode: what to do when an id already exists (default 'newest' by updatedAt). */
  onDuplicate?: DuplicateStrategy;
}

export interface TableImportStats {
  inserted: number;
  updated: number;
  skipped: number;
}

export interface ImportResult {
  mode: 'merge' | 'replace';
  stats: Record<'foods' | 'mealEntries' | 'recipes' | 'goals' | 'preferences' | 'cachedProducts', TableImportStats>;
  warnings: string[];
}

/**
 * Validates then restores a backup atomically. Throws DataError('VALIDATION') with readable
 * messages when invalid — existing data is never modified in that case.
 */
export async function importBackup(input: unknown, opts: ImportOptions = {}): Promise<ImportResult> {
  const v = validateBackup(input);
  if (!v.valid || !v.payload) throw new DataError('VALIDATION', 'Backup is invalid; nothing was imported', v.errors);
  const { data } = v.payload;
  const mode = opts.mode ?? 'merge';
  const strategy = opts.onDuplicate ?? 'newest';
  // Pre-build records (validation of derived fields) before opening the write transaction.
  let foodRecords;
  try {
    foodRecords = data.foods.map(toFoodRecord);
  } catch (e) {
    throw new DataError('VALIDATION', 'Backup contains invalid foods; nothing was imported', e instanceof ZodError ? formatZodIssues(e) : String(e));
  }

  const empty = (): TableImportStats => ({ inserted: 0, updated: 0, skipped: 0 });
  const stats: ImportResult['stats'] = { foods: empty(), mealEntries: empty(), recipes: empty(), goals: empty(), preferences: empty(), cachedProducts: empty() };

  const db = getDb();
  await guard('Import backup', () =>
    db.transaction('rw', [db.foods, db.mealEntries, db.recipes, db.goals, db.preferences, db.cachedProducts], async () => {
      if (mode === 'replace') {
        await db.foods.where('source.type').anyOf('user', 'open_food_facts', 'recipe').delete();
        await Promise.all([db.mealEntries.clear(), db.recipes.clear(), db.goals.clear(), db.preferences.clear()]);
        if (data.cachedProducts) await db.cachedProducts.clear();
      }

      async function upsert<T extends { updatedAt?: string }>(table: { bulkGet(keys: string[]): Promise<(T | undefined)[]>; bulkPut(items: T[]): Promise<unknown> }, items: T[], key: (t: T) => string, s: TableImportStats) {
        if (!items.length) return;
        const existing = await table.bulkGet(items.map(key));
        const toPut: T[] = [];
        items.forEach((item, i) => {
          const cur = existing[i];
          if (!cur) {
            s.inserted++;
            toPut.push(item);
          } else if (strategy === 'overwrite' || (strategy === 'newest' && (item.updatedAt ?? '') > (cur.updatedAt ?? ''))) {
            s.updated++;
            toPut.push(item);
          } else s.skipped++;
        });
        if (toPut.length) await table.bulkPut(toPut);
      }

      await upsert(db.foods, foodRecords, (f) => f.id, stats.foods);
      await upsert<MealEntry>(db.mealEntries, data.mealEntries, (e) => e.id, stats.mealEntries);
      await upsert<Recipe>(db.recipes, data.recipes, (r) => r.id, stats.recipes);
      // goals: one set per effectiveFrom — drop existing sets on the same date with a different id when incoming wins
      for (const g of data.goals as DailyGoals[]) {
        const clash = await db.goals.where('effectiveFrom').equals(g.effectiveFrom).first();
        if (clash && clash.id !== g.id) {
          if (strategy === 'skip' || (strategy === 'newest' && clash.updatedAt >= g.updatedAt)) {
            stats.goals.skipped++;
            continue;
          }
          await db.goals.delete(clash.id);
          stats.goals.updated++;
          await db.goals.put(g);
          continue;
        }
        await upsert<DailyGoals>(db.goals, [g], (x) => x.id, stats.goals);
      }
      await upsert<UserPreferences>(db.preferences, data.preferences, (p) => p.id, stats.preferences);
      if (data.cachedProducts) {
        for (const c of data.cachedProducts as CachedProduct[]) {
          const cur = await db.cachedProducts.get(c.barcode);
          if (!cur) stats.cachedProducts.inserted++;
          else if (strategy === 'overwrite' || (strategy === 'newest' && c.fetchedAt > cur.fetchedAt)) stats.cachedProducts.updated++;
          else {
            stats.cachedProducts.skipped++;
            continue;
          }
          await db.cachedProducts.put(c);
        }
      }
    }),
  );
  return { mode, stats, warnings: v.warnings };
}
