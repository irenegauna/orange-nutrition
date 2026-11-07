/**
 * Builds src/data/seed/usdaFoods.json from the public-domain USDA FoodData Central SR Legacy CSV.
 *
 *   npm run seed:build
 *
 * Downloads the dataset once into scripts/.cache (no API key needed). Every nutrient value in the
 * output comes from the dataset; absent nutrients are left missing (never zero-filled).
 * Food names/aliases come from usda-selection.ts and serving labels are translated with
 * servingLabelsEs.ts, so the catalog is in Spanish (Spain).
 */
import { createReadStream, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { NUTRIENT_DEFINITIONS, USDA_ATTRIBUTION, USDA_LICENSE } from '../src/core/constants';
import { computeCompleteness } from '../src/core/nutrition/values';
import type { Food, NutrientValues, ServingDefinition } from '../src/core/types';
import { USDA_SELECTION } from './usda-selection';
import { translateServingLabel } from './servingLabelsEs';

const here = dirname(fileURLToPath(import.meta.url));
const CACHE = join(here, '.cache');
const ZIP_URL = 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip';
const OUT = join(here, '..', 'src', 'data', 'seed', 'usdaFoods.json');

/** Derivation codes meaning the value was imputed from another food / recipe / label → 'estimated'. */
const ESTIMATED_DERIVATION = /^(BF|CA|BN|BD|DI|FL|O$|T$|PIE|PAE|RA|RC|RF|RK$|RP$|RKI|RPI|LC)/;

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

async function readCsv(file: string, onRow: (row: Record<string, string>) => void) {
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let header: string[] | null = null;
  for await (const line of rl) {
    if (!line) continue;
    const cells = parseCsvLine(line);
    if (!header) {
      header = cells;
      continue;
    }
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ''));
    onRow(row);
  }
}

function ensureDataset(): string {
  mkdirSync(CACHE, { recursive: true });
  const find = () => readdirSync(CACHE).find((d) => d.startsWith('FoodData_Central_sr_legacy'));
  let dir = find();
  if (!dir || !existsSync(join(CACHE, dir, 'food.csv'))) {
    const zip = join(CACHE, 'sr.zip');
    console.log(`Downloading ${ZIP_URL}`);
    execFileSync('curl', ['-sSfL', '-o', zip, ZIP_URL], { stdio: 'inherit' });
    execFileSync('unzip', ['-o', '-q', zip, '-d', CACHE], { stdio: 'inherit' });
    dir = find();
  }
  if (!dir) throw new Error('SR Legacy dataset not found after download');
  return join(CACHE, dir);
}

const VOLUME_ML: Record<string, number> = {
  cup: 236.5882365,
  tbsp: 14.78676478125,
  tablespoon: 14.78676478125,
  tsp: 4.92892159375,
  teaspoon: 4.92892159375,
  'fl oz': 29.5735295625,
  quart: 946.352946,
};

async function main() {
  const dir = ensureDataset();
  const wanted = new Map(USDA_SELECTION.map((r) => [String(r[0]), r]));
  if (wanted.size !== USDA_SELECTION.length) throw new Error('Duplicate fdcIds in selection');

  const descriptions = new Map<string, { description: string; publicationDate: string }>();
  await readCsv(join(dir, 'food.csv'), (r) => {
    if (wanted.has(r.fdc_id!)) descriptions.set(r.fdc_id!, { description: r.description!, publicationDate: r.publication_date! });
  });
  const missingIds = [...wanted.keys()].filter((id) => !descriptions.has(id));
  if (missingIds.length) throw new Error(`FDC ids not found in dataset: ${missingIds.join(', ')}`);

  const derivationCode = new Map<string, string>();
  await readCsv(join(dir, 'food_nutrient_derivation.csv'), (r) => derivationCode.set(r.id!, r.code!));

  // USDA nutrient id -> our nutrient id (with priority order)
  const usdaToOurs = new Map<string, { id: (typeof NUTRIENT_DEFINITIONS)[number]['id']; priority: number }>();
  for (const def of NUTRIENT_DEFINITIONS) def.usdaNutrientIds.forEach((u, priority) => usdaToOurs.set(String(u), { id: def.id, priority }));

  const nutrients = new Map<string, NutrientValues>();
  const priorities = new Map<string, number>();
  await readCsv(join(dir, 'food_nutrient.csv'), (r) => {
    if (!wanted.has(r.fdc_id!)) return;
    const map = usdaToOurs.get(r.nutrient_id!);
    if (!map || r.amount === '') return;
    const key = `${r.fdc_id}:${map.id}`;
    const prev = priorities.get(key);
    if (prev !== undefined && prev <= map.priority) return;
    priorities.set(key, map.priority);
    const amount = Number(r.amount);
    if (!Number.isFinite(amount) || amount < 0) return;
    const code = derivationCode.get(r.derivation_id!) ?? '';
    const values = nutrients.get(r.fdc_id!) ?? {};
    values[map.id] = amount === 0 ? { status: 'zero', amount: 0 } : ESTIMATED_DERIVATION.test(code) ? { status: 'estimated', amount } : { status: 'known', amount };
    nutrients.set(r.fdc_id!, values);
  });

  const portions = new Map<string, ServingDefinition[]>();
  await readCsv(join(dir, 'food_portion.csv'), (r) => {
    if (!wanted.has(r.fdc_id!)) return;
    const grams = Number(r.gram_weight);
    const amount = Number(r.amount) || 1;
    if (!(grams > 0)) return;
    const modifier = (r.modifier || r.portion_description || '').trim();
    const label = `${amount} ${modifier}`.trim();
    const unitMl = VOLUME_ML[modifier.toLowerCase()];
    const list = portions.get(r.fdc_id!) ?? [];
    list.push({ id: `usda_${r.fdc_id}_p${r.seq_num}`, label, grams, ...(unitMl ? { volumeMl: unitMl * amount } : {}) });
    portions.set(r.fdc_id!, list);
  });

  const foods: Food[] = USDA_SELECTION.map(([fdcId, name, category, role, form, prep, flags, allergens, aliases]) => {
    const id = String(fdcId);
    const meta = descriptions.get(id)!;
    const values = nutrients.get(id) ?? {};
    const servings = portions.get(id) ?? [];
    // Default-serving detection runs on USDA's English labels, before they are translated.
    const def = servings.find((s) => /medium|nlea serving/i.test(s.label)) ?? servings[0];
    if (def) def.isDefault = true;
    // Labels are shown to the user in Spanish (Spain); see scripts/servingLabelsEs.ts.
    for (const s of servings) s.label = translateServingLabel(s.label);
    const ts = new Date(`${meta.publicationDate}T00:00:00Z`).toISOString();
    return {
      id: `usda_${fdcId}`,
      name,
      category: category as Food['category'],
      role: role as Food['role'],
      form,
      source: {
        type: 'usda_sr_legacy',
        sourceId: id,
        originalName: meta.description, // USDA's English description, kept for attribution (not searched)
        attribution: USDA_ATTRIBUTION,
        license: USDA_LICENSE,
        url: `https://fdc.nal.usda.gov/food-details/${fdcId}/nutrients`,
        retrievedAt: ts,
      },
      nutrientsPer100g: values,
      completeness: computeCompleteness(values),
      servings,
      allergens: allergens as Food['allergens'],
      traces: [],
      dietaryFlags: flags as Food['dietaryFlags'],
      allergenInfo: 'curated',
      prepTimeMinutes: prep,
      aliases: aliases ?? [],
      isArchived: false,
      createdAt: ts,
      updatedAt: ts,
    } satisfies Food;
  });

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ source: USDA_ATTRIBUTION, license: USDA_LICENSE, generatedAt: new Date().toISOString(), foods }, null, 0) + '\n');
  const noEnergy = foods.filter((f) => !f.nutrientsPer100g.energy);
  console.log(`Wrote ${foods.length} foods to ${OUT}`);
  if (noEnergy.length) console.warn(`Foods without energy: ${noEnergy.map((f) => f.name).join(', ')}`);
  const avg = foods.reduce((s, f) => s + f.completeness.score, 0) / foods.length;
  console.log(`Average completeness: ${(avg * 100).toFixed(1)}%`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
