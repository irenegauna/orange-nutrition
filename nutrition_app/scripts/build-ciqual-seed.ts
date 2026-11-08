/**
 * Builds src/data/seed/ciqualFoods.json: a SMALL gap-fill of typical Spanish foods/dishes that BEDCA
 * lacks, taken from the French food composition table ANSES-CIQUAL 2025.
 *
 *   node --experimental-transform-types scripts/build-ciqual-seed.ts      (or: npx tsx scripts/build-ciqual-seed.ts)
 *   CIQUAL_CACHE=/some/dir … to choose the download cache (default scripts/.cache/ciqual, git-ignored)
 *
 * DATA SOURCE & LICENCE
 * - Anses-Ciqual 2025 XML files (version 2025-11-03), official mirror on Zenodo
 *   (https://doi.org/10.5281/zenodo.17550133; also on Recherche Data Gouv, doi:10.57745/RDMHWY).
 *   Downloaded once and verified against the published MD5 checksums.
 * - Licence Ouverte / Etalab 2.0 (the Zenodo record also lists CC BY 4.0): reuse and modification
 *   allowed with attribution, without misleading about content, source or update date.
 *
 * SELECTION: only foods that are the SAME dish/product as a common Spanish one (listed in SELECTION).
 * When CIQUAL has no real equivalent the dish is skipped — never approximated with a different dish.
 * Checked and skipped for lack of an equivalent (or because BEDCA already has it): salmorejo, cocido
 * madrileño, lentejas estofadas, croquetas de jamón, patatas bravas, pulpo a la gallega, gambas al
 * ajillo, pisto (ratatouille is a different dish), huevos rotos, pimientos de Padrón, bocadillo de
 * jamón, migas, sopa de ajo, torrijas, polvorones, mantecados, tinto de verano, café cortado;
 * paella, gazpacho, crema catalana, churros, sangría, chorizo, salchichón, aceitunas, cacao soluble
 * are already in BEDCA.
 *
 * VALUES: copied from the table; conversions/derivations:
 * - "-" → missing (key left out); "traces" → { status: 'estimated', amount: 0 };
 *   "< x" → { status: 'estimated', amount: x } (upper bound stored as the estimate; isLowerBound NOT set);
 *   numbers → 'known' (0 → 'zero'). Decimal commas are parsed.
 * - Energy: "Energie, Règlement UE N° 1169/2011 (kcal/100 g)" (const 328).
 * - Protein: N × Jones factor (const 25000) — the physiologically meaningful protein value.
 * - Sodium: CIQUAL 2025 publishes salt (NaCl, g) only → sodium mg = salt × 1000 / 2.5, 'estimated'.
 * - Vitamin A (51104) is computed per IOM 2001 (β-carotene/12) = RAE → 'known'.
 * - Vitamin E: alpha-tocopherol (71010) → 'known'; fallback "Vitamine E" (53100, unspecified vitamers) → 'estimated'.
 * - Niacin (56310) is preformed niacin → 'known'. Folate: DFE (56702) → 'known'; fallback total folates (56700) → 'estimated'.
 * - Vitamin K: K1 (54101) → 'known'.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeCompleteness } from '../src/core/nutrition/values';
import type { Allergen, DietaryFlag, Food, FoodCategory, FoodForm, FoodRole, MetadataReliability, ServingDefinition } from '../src/core/types/domain';
import type { NutrientId, NutrientValue, NutrientValues } from '../src/core/types/nutrients';
import { portionsFor } from './portionsEs';

const here = dirname(fileURLToPath(import.meta.url));
const CACHE = process.env.CIQUAL_CACHE ?? join(here, '.cache', 'ciqual');
const OUT = join(here, '..', 'src', 'data', 'seed', 'ciqualFoods.json');
const VERSION = '2025_11_03';
const ZENODO = 'https://zenodo.org/api/records/17550133/files';
const FILES: Record<string, string> = {
  [`alim_${VERSION}.xml`]: '8e1171d63cee4b6010cfce25dd29243d',
  [`compo_${VERSION}.xml`]: '2da725585946434df320d8041631998b',
  [`const_${VERSION}.xml`]: 'd8f2f25fdacb887bc993a6eeaf80f203',
};

export const CIQUAL_ATTRIBUTION = 'Anses. 2025. Table de composition nutritionnelle des aliments Ciqual 2025 (mise à jour du 03/11/2025)';
export const CIQUAL_LICENSE =
  'Licence Ouverte / Etalab 2.0 (https://www.etalab.gouv.fr/licence-ouverte-open-licence/). Modifications: nombre en español, sodio calculado a partir de la sal (÷ 2,5).';
const CIQUAL_URL = 'https://doi.org/10.5281/zenodo.17550133';

interface Selection {
  code: number;
  name: string;
  category: FoodCategory;
  role: FoodRole;
  form: FoodForm;
  allergens: Allergen[];
  flags: DietaryFlag[];
  info: MetadataReliability;
  aliases: string[];
}

/** CIQUAL alim_code → Spanish food. Only close equivalents of the same dish/product. */
export const SELECTION: Selection[] = [
  {
    code: 22510, // Tortilla espagnole aux oignons (omelette aux pommes de terre et oignons), préemballée
    name: 'Tortilla de patatas con cebolla',
    category: 'prepared',
    role: 'protein',
    form: 'ready',
    allergens: ['egg'],
    flags: ['egg'],
    info: 'unknown', // pre-packed product: additives/frying oil not certain
    aliases: ['tortilla de patatas', 'tortilla de patata', 'tortilla española', 'tortilla', 'pincho de tortilla', 'tortilla de patata con cebolla'],
  },
  {
    code: 10002, // Calmar ou calamar ou encornet, à la romaine (beignet), préemballé
    name: 'Calamares a la romana',
    category: 'seafood',
    role: 'protein',
    form: 'ready',
    allergens: ['molluscs', 'wheat', 'gluten'],
    flags: ['shellfish', 'gluten'],
    info: 'unknown', // batter may contain egg/milk
    aliases: ['calamares', 'calamares fritos', 'calamares rebozados', 'rabas', 'calamar a la romana'],
  },
  {
    code: 25211, // Boulettes au boeuf, à la sauce tomate, préemballées
    name: 'Albóndigas de ternera con tomate',
    category: 'prepared',
    role: 'protein',
    form: 'ready',
    allergens: [],
    flags: ['meat'],
    info: 'unknown', // breadcrumbs/egg depend on the recipe
    aliases: ['albóndigas', 'albóndigas con tomate', 'albóndigas en salsa', 'albondigas'],
  },
  {
    code: 20240, // Piperade basquaise, préemballée
    name: 'Piperrada',
    category: 'prepared',
    role: 'vegetable',
    form: 'ready',
    allergens: [],
    flags: [],
    info: 'unknown',
    aliases: ['piperrada vasca', 'piperade'],
  },
  {
    code: 7744, // Couronne des rois (brioche) aux fruits confits, préemballée
    name: 'Roscón de Reyes (sin relleno)',
    category: 'sweets',
    role: 'snack',
    form: 'ready',
    allergens: ['wheat', 'gluten'],
    flags: ['gluten'],
    info: 'unknown', // brioche dough usually with egg, butter/milk
    aliases: ['roscón', 'roscón de reyes', 'rosco de reyes', 'roscon'],
  },
  {
    code: 13147, // Olives vertes, fourrées ou farcies (anchois, poivrons, etc.)
    name: 'Aceitunas rellenas (de anchoa, pimiento…)',
    category: 'fruits',
    role: 'snack',
    form: 'ready',
    allergens: [],
    flags: [],
    info: 'unknown', // filling varies (anchovy = fish)
    aliases: ['aceitunas rellenas', 'aceitunas rellenas de anchoa', 'olivas rellenas', 'aceitunas'],
  },
  {
    code: 5004, // Panaché (limonade et bière)
    name: 'Clara (cerveza con limonada)',
    category: 'beverages',
    role: 'beverage',
    form: 'ready',
    allergens: ['gluten'],
    flags: ['gluten', 'alcohol'],
    info: 'curated',
    aliases: ['clara', 'clara con limón', 'cerveza con limón', 'cerveza con gaseosa', 'panaché'],
  },
];

interface Mapping {
  id: NutrientId;
  priority: number;
  /** multiply the CIQUAL value (in its unit) to get our canonical unit */
  factor?: number;
  estimated?: string;
}

/** CIQUAL const_code → our nutrient (units already match our canonical units unless `factor`). */
export const CIQUAL_MAP: Record<string, Mapping> = {
  '328': { id: 'energy', priority: 0 },
  '25000': { id: 'protein', priority: 0 },
  '31000': { id: 'carbohydrate', priority: 0 },
  '40000': { id: 'fat', priority: 0 },
  '34100': { id: 'fiber', priority: 0 },
  '32000': { id: 'sugar', priority: 0 },
  '40302': { id: 'saturatedFat', priority: 0 },
  '10004': { id: 'sodium', priority: 0, factor: 1000 / 2.5, estimated: 'sodium derived from salt (NaCl ÷ 2.5)' },
  '10120': { id: 'magnesium', priority: 0 },
  '10150': { id: 'phosphorus', priority: 0 },
  '10190': { id: 'potassium', priority: 0 },
  '10200': { id: 'calcium', priority: 0 },
  '10251': { id: 'manganese', priority: 0 },
  '10260': { id: 'iron', priority: 0 },
  '10290': { id: 'copper', priority: 0 },
  '10300': { id: 'zinc', priority: 0 },
  '10340': { id: 'selenium', priority: 0 },
  '10530': { id: 'iodine', priority: 0 },
  '51104': { id: 'vitaminA', priority: 0 },
  '52100': { id: 'vitaminD', priority: 0 },
  '71010': { id: 'vitaminE', priority: 0 },
  '53100': { id: 'vitaminE', priority: 1, estimated: 'vitamin E with unspecified vitamers' },
  '54101': { id: 'vitaminK', priority: 0 },
  '55100': { id: 'vitaminC', priority: 0 },
  '56100': { id: 'thiamin', priority: 0 },
  '56200': { id: 'riboflavin', priority: 0 },
  '56310': { id: 'niacin', priority: 0 },
  '56400': { id: 'pantothenicAcid', priority: 0 },
  '56500': { id: 'vitaminB6', priority: 0 },
  '56600': { id: 'vitaminB12', priority: 0 },
  '56702': { id: 'folate', priority: 0 },
  '56700': { id: 'folate', priority: 1, estimated: 'total folates, not DFE' },
};

const decode = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim();

function ensureFiles(): void {
  mkdirSync(CACHE, { recursive: true });
  for (const [file, md5] of Object.entries(FILES)) {
    const path = join(CACHE, file);
    if (!existsSync(path)) {
      console.log(`Downloading ${file}`);
      execFileSync('curl', ['-sSfL', '-o', path, `${ZENODO}/${file}/content`], { stdio: 'inherit' });
    }
    const got = createHash('md5').update(readFileSync(path)).digest('hex');
    if (got !== md5) throw new Error(`MD5 mismatch for ${file}: ${got} (expected ${md5})`);
  }
}

const clean = (x: number) => Number(x.toPrecision(12));

function parseValue(raw: string, mapping: Mapping): NutrientValue | null {
  const s = decode(raw).replace(',', '.').trim();
  if (s === '' || s === '-') return null;
  if (/^traces$/i.test(s)) return { status: 'estimated', amount: 0 };
  const lt = s.match(/^<\s*([\d.]+)$/);
  if (lt) return { status: 'estimated', amount: clean(Number(lt[1]) * (mapping.factor ?? 1)) };
  const num = Number(s);
  if (!Number.isFinite(num) || num < 0) throw new Error(`Unparseable CIQUAL value "${raw}"`);
  const amount = clean(num * (mapping.factor ?? 1));
  if (amount === 0) return { status: 'zero', amount: 0 };
  return mapping.estimated ? { status: 'estimated', amount } : { status: 'known', amount };
}

function buildServings(foodId: string, warnings: string[]): ServingDefinition[] {
  const portions = portionsFor(foodId, '');
  if (!portions) return [];
  const out: ServingDefinition[] = portions.map((p, i) => {
    if (p.asPurchased) warnings.push(`${foodId}: as-purchased portion has no edible factor in CIQUAL; used as is`);
    const grams = Math.round(p.grams * 10) / 10;
    const shown = grams >= 10 ? Math.round(grams) : grams;
    return { id: `${foodId}_s${i + 1}`, label: p.label.replace('{g}', String(shown).replace('.', ',')), grams, ...(p.volumeMl ? { volumeMl: p.volumeMl } : {}) };
  });
  const def = portions.findIndex((p) => p.isDefault);
  out[def >= 0 ? def : 0]!.isDefault = true;
  return out;
}

function main() {
  ensureFiles();
  const wanted = new Set(SELECTION.map((s) => String(s.code)));

  const alimXml = readFileSync(join(CACHE, `alim_${VERSION}.xml`), 'utf8');
  const frNames = new Map<string, string>();
  for (const m of alimXml.matchAll(/<ALIM>([\s\S]*?)<\/ALIM>/g)) {
    const code = m[1]!.match(/<alim_code>\s*(\d+)\s*<\/alim_code>/)?.[1];
    const name = m[1]!.match(/<alim_nom_fr>([\s\S]*?)<\/alim_nom_fr>/)?.[1];
    if (code && name && wanted.has(code)) frNames.set(code, decode(name));
  }
  const missing = [...wanted].filter((c) => !frNames.has(c));
  if (missing.length) throw new Error(`CIQUAL codes not found: ${missing.join(', ')}`);

  const compoXml = readFileSync(join(CACHE, `compo_${VERSION}.xml`), 'utf8');
  const values = new Map<string, NutrientValues>();
  const prio = new Map<string, number>();
  for (const m of compoXml.matchAll(/<COMPO>([\s\S]*?)<\/COMPO>/g)) {
    const b = m[1]!;
    const code = b.match(/<alim_code>\s*(\d+)\s*<\/alim_code>/)?.[1];
    if (!code || !wanted.has(code)) continue;
    const constCode = b.match(/<const_code>\s*(\d+)\s*<\/const_code>/)?.[1];
    const mapping = constCode ? CIQUAL_MAP[constCode] : undefined;
    if (!mapping) continue;
    const teneur = b.match(/<teneur>([\s\S]*?)<\/teneur>/)?.[1];
    if (teneur === undefined) continue; // <teneur missing=" " />
    const key = `${code}:${mapping.id}`;
    const prev = prio.get(key);
    if (prev !== undefined && prev <= mapping.priority) continue;
    const v = parseValue(teneur, mapping);
    if (!v) continue;
    const vals = values.get(code) ?? {};
    vals[mapping.id] = v;
    values.set(code, vals);
    prio.set(key, mapping.priority);
  }

  const ts = `${VERSION.replace(/_/g, '-')}T00:00:00.000Z`;
  const warnings: string[] = [];
  const foods: Food[] = SELECTION.map((s) => {
    const id = `ciqual_${s.code}`;
    const vals = values.get(String(s.code)) ?? {};
    const servings = buildServings(id, warnings);
    if (!servings.length) warnings.push(`${id}: no serving`);
    return {
      id,
      name: s.name,
      category: s.category,
      role: s.role,
      form: s.form,
      source: { type: 'ciqual', sourceId: String(s.code), originalName: frNames.get(String(s.code))!, attribution: CIQUAL_ATTRIBUTION, license: CIQUAL_LICENSE, url: CIQUAL_URL, retrievedAt: ts },
      nutrientsPer100g: vals,
      completeness: computeCompleteness(vals),
      servings,
      allergens: s.allergens,
      traces: [],
      dietaryFlags: s.flags,
      allergenInfo: s.info,
      aliases: s.aliases,
      isArchived: false,
      createdAt: ts,
      updatedAt: ts,
    } satisfies Food;
  });

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ source: CIQUAL_ATTRIBUTION, license: CIQUAL_LICENSE, generatedAt: new Date().toISOString(), foods }) + '\n');
  console.log(`Wrote ${foods.length} foods to ${OUT}`);
  for (const f of foods) console.log(`  ${f.id} ${f.name} ← ${f.source.originalName} (${Math.round(f.completeness.score * 100)} %)`);
  for (const w of warnings) console.warn(`  warning ${w}`);
}

main();
