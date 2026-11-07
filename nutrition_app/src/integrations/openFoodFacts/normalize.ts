import { NUTRIENT_DEFINITIONS, OFF_ATTRIBUTION, OFF_LICENSE } from '../../core/constants';
import { computeCompleteness } from '../../core/nutrition/values';
import type { Allergen, DietaryFlag, Food, FoodCategory, ServingDefinition } from '../../core/types/domain';
import type { NutrientValues } from '../../core/types/nutrients';
import { convertNutrientMass, kjToKcal, saltToSodiumMg } from '../../core/utils/units';
import { type OffProduct, readNumber } from './schema';

/**
 * Converts an Open Food Facts product into the shared Food schema.
 *
 * Rules:
 * - OFF `<nutrient>_100g` values are normalized by OFF to grams for every mass nutrient
 *   (e.g. calcium_100g = 0.12 means 120 mg). Energy is kcal / kJ.
 * - If `_100g` is absent but `_serving` and `serving_quantity` (g) exist, per-100 g is derived.
 * - Energy from kJ when kcal is absent (÷ 4.184).
 * - Sodium from salt when sodium is absent (÷ 2.5) → marked `estimated`.
 * - A value of exactly 0 → status `zero`. Absent → missing (never zero).
 */
export function normalizeOffNutrients(product: OffProduct): NutrientValues {
  const n = product.nutriments ?? {};
  const servingG = typeof product.serving_quantity === 'number' && product.serving_quantity > 0 ? product.serving_quantity : undefined;
  const per100 = (key: string): number | undefined => {
    const v = readNumber(n, `${key}_100g`);
    if (v !== undefined) return v;
    const s = readNumber(n, `${key}_serving`);
    return s !== undefined && servingG ? (s * 100) / servingG : undefined;
  };

  const out: NutrientValues = {};
  for (const def of NUTRIENT_DEFINITIONS) {
    if (def.id === 'energy') continue;
    let grams: number | undefined;
    for (const key of def.offKeys) {
      grams = per100(key);
      if (grams !== undefined) break;
    }
    if (grams === undefined) continue;
    const amount = def.unit === 'g' ? grams : convertNutrientMass(grams, 'g', def.unit === 'kcal' ? 'g' : def.unit);
    out[def.id] = amount === 0 ? { status: 'zero', amount: 0 } : { status: 'known', amount };
  }

  const kcal = per100('energy-kcal');
  const kj = per100('energy-kj') ?? per100('energy');
  if (kcal !== undefined) out.energy = kcal === 0 ? { status: 'zero', amount: 0 } : { status: 'known', amount: kcal };
  else if (kj !== undefined) out.energy = kj === 0 ? { status: 'zero', amount: 0 } : { status: 'known', amount: kjToKcal(kj) };

  if (!out.sodium) {
    const salt = per100('salt');
    if (salt !== undefined) out.sodium = salt === 0 ? { status: 'zero', amount: 0 } : { status: 'estimated', amount: saltToSodiumMg(salt) };
  }
  return out;
}

const ALLERGEN_TAGS: Record<string, Allergen> = {
  'en:milk': 'milk',
  'en:eggs': 'egg',
  'en:fish': 'fish',
  'en:crustaceans': 'shellfish',
  'en:molluscs': 'molluscs',
  'en:nuts': 'tree_nuts',
  'en:peanuts': 'peanuts',
  'en:gluten': 'gluten',
  'en:soybeans': 'soy',
  'en:sesame-seeds': 'sesame',
  'en:mustard': 'mustard',
  'en:celery': 'celery',
  'en:lupin': 'lupin',
  'en:sulphur-dioxide-and-sulphites': 'sulphites',
};

export function mapAllergenTags(tags: readonly string[] | null | undefined): Allergen[] {
  const out = new Set<Allergen>();
  for (const t of tags ?? []) {
    const a = ALLERGEN_TAGS[t];
    if (a) out.add(a);
    if (t === 'en:gluten') out.add('wheat'); // OFF groups wheat under gluten; conservative
  }
  return [...out];
}

function dietaryFlags(product: OffProduct, allergens: Allergen[]): DietaryFlag[] {
  const flags = new Set<DietaryFlag>();
  if (allergens.includes('milk')) flags.add('dairy');
  if (allergens.includes('egg')) flags.add('egg');
  if (allergens.includes('fish')) flags.add('fish');
  if (allergens.includes('shellfish') || allergens.includes('molluscs')) flags.add('shellfish');
  if (allergens.includes('gluten')) flags.add('gluten');
  const cats = product.categories_tags ?? [];
  if (cats.some((c) => /^en:(meats?|poultry|chicken|beef|pork|ham|sausages|charcuterie)/.test(c))) flags.add('meat');
  const analysis = product.ingredients_analysis_tags ?? [];
  // "non-vegetarian" without a known reason → mark meat conservatively
  if (analysis.includes('en:non-vegetarian') && !flags.has('fish') && !flags.has('shellfish')) flags.add('meat');
  return [...flags];
}

function guessCategory(product: OffProduct): FoodCategory {
  const cats = (product.categories_tags ?? []).join(' ');
  const rules: [RegExp, FoodCategory][] = [
    [/beverages|drinks|juices|waters/, 'beverages'],
    [/dairies|milks|yogurts|cheeses/, 'dairy'],
    [/meats|poultry/, 'meat'],
    [/fishes|seafood/, 'fish'],
    [/cereals|breads|pastas|rices/, 'grains'],
    [/legumes|beans|lentils/, 'legumes'],
    [/nuts|seeds/, 'nuts_seeds'],
    [/fruits/, 'fruits'],
    [/vegetables/, 'vegetables'],
    [/oils|fats/, 'oils_fats'],
    [/sweets|chocolates|confectioneries|biscuits|snacks/, 'sweets'],
    [/sauces|condiments/, 'condiments'],
  ];
  for (const [re, c] of rules) if (re.test(cats)) return c;
  return 'prepared';
}

/** Full product → Food. Falls back to "Product <barcode>" when the product has no name. */
export function normalizeOffProduct(barcode: string, product: OffProduct, now = new Date().toISOString()): Food {
  // Spanish-language app: prefer the Spanish name, then the product's main name, then English.
  const name = (product.product_name_es || product.product_name || product.product_name_en || product.generic_name_es || product.generic_name || '').trim() || `Producto ${barcode}`;
  const brand = product.brands?.split(',')[0]?.trim() || undefined;
  const nutrientsPer100g = normalizeOffNutrients(product);
  const allergens = mapAllergenTags(product.allergens_tags);
  const traces = mapAllergenTags(product.traces_tags);
  const servings: ServingDefinition[] = [];
  if (typeof product.serving_quantity === 'number' && product.serving_quantity > 0) {
    servings.push({ id: `off_${barcode}_serving`, label: product.serving_size?.trim() || `${product.serving_quantity} g`, grams: product.serving_quantity, isDefault: true });
  }
  const hasAllergenInfo = Array.isArray(product.allergens_tags);
  return {
    id: `off_${barcode}`,
    name,
    ...(brand ? { brand } : {}),
    barcode,
    category: guessCategory(product),
    role: 'other',
    form: 'ready',
    source: {
      type: 'open_food_facts',
      sourceId: barcode,
      originalName: name,
      attribution: OFF_ATTRIBUTION,
      license: OFF_LICENSE,
      url: `https://world.openfoodfacts.org/product/${barcode}`,
      retrievedAt: now,
    },
    nutrientsPer100g,
    completeness: computeCompleteness(nutrientsPer100g),
    servings,
    allergens,
    traces,
    dietaryFlags: dietaryFlags(product, allergens),
    allergenInfo: hasAllergenInfo ? 'declared' : 'unknown',
    aliases: [],
    ...(product.image_front_small_url ? { imageUrl: product.image_front_small_url } : {}),
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  };
}
