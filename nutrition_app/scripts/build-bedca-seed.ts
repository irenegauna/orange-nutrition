/**
 * Builds src/data/seed/bedcaFoods.json from BEDCA, the Spanish Food Composition Database (AESAN).
 *
 *   node --experimental-transform-types scripts/build-bedca-seed.ts      (or: npx tsx scripts/build-bedca-seed.ts)
 *   BEDCA_CACHE=/some/dir … to choose the raw-response cache (default scripts/.cache/bedca, git-ignored)
 *   BEDCA_OFFLINE=1 … never hit the network; foods missing from the cache are skipped
 *
 * DATA SOURCE & TERMS
 * - Public XML endpoint POST https://www.bedca.net/bdpub/procquery.php (Content-Type: text/xml):
 *   one "level 1" query per food group lists the public foods, one "level 2" query per food returns its
 *   component values. Requests are sequential, ≥ 1.6 s apart, retried gently, and EVERY raw response is
 *   cached on disk so re-runs never refetch.
 * - Terms of use (https://www.bedca.net/bdpub/UsoBD.pdf): non-commercial use is allowed with the
 *   attribution "AESAN/BEDCA Base de Datos Española de Composición de Alimentos v1.0 (2010)" and WITHOUT
 *   modifying the data or its meaning. This app is free and non-commercial. Values are therefore copied
 *   exactly; the ONLY transformations are unit conversions: kJ → kcal (÷ 4.184, rounded to 0.01 kcal),
 *   "per kg" (mu_id WKG) → per 100 g (÷ 10) and g/mg/µg rescaling. Names keep BEDCA's Spanish name
 *   (first letter capitalised, XML entities decoded).
 *
 * VALUE STATUS (BEDCA / EuroFIR value_type)
 * - numeric value, types AR (analytical), AV (average), MN (mean), W (weighted) → 'known' (0 → 'zero')
 * - BE (best estimate), E (estimated), X / UD (unspecified) → 'estimated'. Exception: ENERC is always
 *   delivered as BE because energy is by definition calculated from the macronutrients with standard
 *   factors; it is stored as 'known' (same convention as USDA energy).
 * - LZ (logical zero) → 'zero'; TR (trace) and BL (below limit of quantification, no value) →
 *   { status: 'estimated', amount: 0 }
 * - empty best_location for any other type, or absent component → key left out (= missing, NEVER 0)
 * - only mu_id W (per 100 g edible portion) and WKG (per kg edible portion) are used; values per ml (VM)
 *   or per dry weight (D) are skipped.
 *
 * DEFINITION MISMATCHES (stored as 'estimated', value unchanged):
 * - VITA: BEDCA gives vitamin A as retinol equivalents (RE, β-carotene/6); our canonical unit is µg RAE
 *   (β-carotene/12) → for foods with carotenoids RE overstates RAE.
 * - FOL: BEDCA "folato, total" is not expressed as dietary folate equivalents (DFE) → 'estimated'.
 * - NIAEQ: niacin equivalents include the tryptophan contribution (trp/60); our niacin is preformed
 *   niacin → 'estimated'. (NIA, preformed niacin, would be preferred as 'known' if BEDCA provided it.)
 * - VITE: "equivalentes de alfa-tocoferol" (all vitamers weighted) vs. our mg α-tocopherol → 'estimated'.
 *   (TOCPHA would be preferred as 'known' if present.)
 *
 * Classification (category / role / form), Spanish aliases and allergen/diet metadata are curated
 * here (`classify`, `ALIASES`); typical portions come from scripts/portionsEs.ts. Composite dishes and
 * processed products whose recipe/additives are not certain get allergenInfo 'unknown', which the app
 * treats as unsafe for users with allergies or diets.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeCompleteness } from '../src/core/nutrition/values';
import type { Allergen, DietaryFlag, Food, FoodCategory, FoodForm, FoodRole, MetadataReliability, ServingDefinition } from '../src/core/types/domain';
import type { NutrientId, NutrientValue, NutrientValues } from '../src/core/types/nutrients';
import { portionsFor } from './portionsEs';

const here = dirname(fileURLToPath(import.meta.url));
const CACHE = process.env.BEDCA_CACHE ?? join(here, '.cache', 'bedca');
const OUT = join(here, '..', 'src', 'data', 'seed', 'bedcaFoods.json');
const ENDPOINT = 'https://www.bedca.net/bdpub/procquery.php';
const DELAY_MS = 1600;
const GROUP_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export const BEDCA_ATTRIBUTION = 'AESAN/BEDCA Base de Datos Española de Composición de Alimentos v1.0 (2010)';
/** Short per-food licence note (the full text is in the JSON header, BEDCA_LICENSE). */
export const BEDCA_LICENSE_SHORT = 'Uso no comercial con atribución; datos sin modificar (https://www.bedca.net/bdpub/UsoBD.pdf)';
export const BEDCA_LICENSE =
  'Uso no comercial con cita de la fuente y sin modificar los datos ni su significado (condiciones de uso de BEDCA: https://www.bedca.net/bdpub/UsoBD.pdf). Valores copiados sin cambios; solo conversiones de unidades (kJ→kcal, por kg→por 100 g).';
const BEDCA_URL = 'https://www.bedca.net/bdpub/';

/** Foods not imported: infant/clinical/supplement products and isolated ingredients. */
const EXCLUDED: Record<string, string> = {
  '2494': 'Leche materna (lactantes)',
  '2572': 'Complejo vitamínico (suplemento)',
  '2563': 'Suplemento proteico (producto de uso nutricional específico)',
  '2509': 'Lactosa (ingrediente aislado)',
  '2548': 'Lecitina de soja (aditivo/suplemento)',
};

// ---------------------------------------------------------------------------
// Fetching (polite, cached)
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastRequest = 0;

async function post(body: string): Promise<string> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const wait = lastRequest + DELAY_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    try {
      const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body, signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text.includes('<foodresponse')) throw new Error('Unexpected response');
      return text;
    } catch (e) {
      console.warn(`  request failed (attempt ${attempt}): ${(e as Error).message}`);
      await sleep(5000 * attempt);
    }
  }
  throw new Error('BEDCA request failed after 4 attempts');
}

function groupQuery(groupId: number): string {
  return `<?xml version="1.0" encoding="utf-8"?><foodquery><type level="1"/><selection><atribute name="f_id"/><atribute name="f_ori_name"/><atribute name="f_eng_name"/><atribute name="f_origen"/><atribute name="edible_portion"/></selection><condition><cond1><atribute1 name="foodgroup_id"/></cond1><relation type="EQUAL"/><cond3>${groupId}</cond3></condition><condition><cond1><atribute1 name="f_origen"/></cond1><relation type="EQUAL"/><cond3>BEDCA</cond3></condition><order ordtype="ASC"><atribute3 name="f_ori_name"/></order></foodquery>`;
}

function detailQuery(fId: string): string {
  return `<?xml version="1.0" encoding="utf-8"?><foodquery><type level="2"/><selection><atribute name="f_id"/><atribute name="f_ori_name"/><atribute name="f_eng_name"/><atribute name="edible_portion"/><atribute name="c_id"/><atribute name="c_ori_name"/><atribute name="c_eng_name"/><atribute name="eur_name"/><atribute name="componentgroup_id"/><atribute name="best_location"/><atribute name="v_unit"/><atribute name="u_id"/><atribute name="u_descripcion"/><atribute name="value_type"/><atribute name="mu_id"/><atribute name="mu_descripcion"/></selection><condition><cond1><atribute1 name="f_id"/></cond1><relation type="EQUAL"/><cond3>${fId}</cond3></condition><condition><cond1><atribute1 name="publico"/></cond1><relation type="EQUAL"/><cond3>1</cond3></condition><order ordtype="ASC"><atribute3 name="componentgroup_id"/></order></foodquery>`;
}

async function cached(file: string, body: string): Promise<string> {
  if (existsSync(file)) return readFileSync(file, 'utf8');
  if (process.env.BEDCA_OFFLINE) return ''; // build from the cache only (testing)
  const text = await post(body);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  return text;
}

// ---------------------------------------------------------------------------
// XML parsing (the responses are flat and regular; no XML library needed)
// ---------------------------------------------------------------------------

const decode = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim();
const tag = (xml: string, name: string): string | undefined => {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]!) : undefined;
};

interface RawValue {
  eur: string;
  value: string;
  unit: string;
  type: string;
  mu: string;
}
interface RawFood {
  id: string;
  name: string;
  engName: string;
  edible: number;
  values: RawValue[];
}

function parseDetail(xml: string): RawFood | null {
  const food = xml.match(/<food>([\s\S]*?)<\/food>/);
  if (!food) return null;
  const body = food[1]!;
  const values: RawValue[] = [];
  for (const m of body.matchAll(/<foodvalue>([\s\S]*?)<\/foodvalue>/g)) {
    const b = m[1]!;
    values.push({ eur: tag(b, 'eur_name') ?? '', value: tag(b, 'best_location') ?? '', unit: tag(b, 'v_unit') ?? '', type: tag(b, 'value_type') ?? '', mu: tag(b, 'mu_id') ?? '' });
  }
  if (!values.length) return null;
  return { id: tag(body, 'f_id')!, name: tag(body, 'f_ori_name')!, engName: tag(body, 'f_eng_name') ?? '', edible: Number(tag(body, 'edible_portion') ?? '1') || 1, values };
}

// ---------------------------------------------------------------------------
// Nutrient mapping
// ---------------------------------------------------------------------------

type Unit = 'kcal' | 'g' | 'mg' | 'ug';
interface Mapping {
  id: NutrientId;
  unit: Unit;
  /** Lower = preferred when several BEDCA codes map to the same nutrient. */
  priority: number;
  /** Definition differs from our canonical one → stored as 'estimated'. */
  mismatch?: string;
}

/** eur_name (EuroFIR component code) → our nutrient. Codes verified against the real responses. */
export const BEDCA_MAP: Record<string, Mapping> = {
  ENERC: { id: 'energy', unit: 'kcal', priority: 0 },
  PROT: { id: 'protein', unit: 'g', priority: 0 },
  CHO: { id: 'carbohydrate', unit: 'g', priority: 0 }, // "carbohidratos" = available carbohydrate (fibre listed separately)
  FAT: { id: 'fat', unit: 'g', priority: 0 },
  FIBT: { id: 'fiber', unit: 'g', priority: 0 },
  SUGAR: { id: 'sugar', unit: 'g', priority: 0 },
  FASAT: { id: 'saturatedFat', unit: 'g', priority: 0 },
  CA: { id: 'calcium', unit: 'mg', priority: 0 },
  FE: { id: 'iron', unit: 'mg', priority: 0 },
  MG: { id: 'magnesium', unit: 'mg', priority: 0 },
  P: { id: 'phosphorus', unit: 'mg', priority: 0 },
  K: { id: 'potassium', unit: 'mg', priority: 0 },
  NA: { id: 'sodium', unit: 'mg', priority: 0 },
  ZN: { id: 'zinc', unit: 'mg', priority: 0 },
  CU: { id: 'copper', unit: 'mg', priority: 0 },
  MN: { id: 'manganese', unit: 'mg', priority: 0 },
  SE: { id: 'selenium', unit: 'ug', priority: 0 },
  ID: { id: 'iodine', unit: 'ug', priority: 0 },
  VITA: { id: 'vitaminA', unit: 'ug', priority: 1, mismatch: 'retinol equivalents (RE), not RAE' },
  VITAA: { id: 'vitaminA', unit: 'ug', priority: 0 }, // RAE, if ever provided
  THIA: { id: 'thiamin', unit: 'mg', priority: 0 },
  RIBF: { id: 'riboflavin', unit: 'mg', priority: 0 },
  NIA: { id: 'niacin', unit: 'mg', priority: 0 },
  NIAEQ: { id: 'niacin', unit: 'mg', priority: 1, mismatch: 'niacin equivalents (incl. tryptophan), not preformed niacin' },
  PANTAC: { id: 'pantothenicAcid', unit: 'mg', priority: 0 },
  VITB6: { id: 'vitaminB6', unit: 'mg', priority: 0 },
  BIOT: { id: 'biotin', unit: 'ug', priority: 0 },
  FOLDFE: { id: 'folate', unit: 'ug', priority: 0 },
  FOL: { id: 'folate', unit: 'ug', priority: 1, mismatch: 'total folate, not dietary folate equivalents (DFE)' },
  VITB12: { id: 'vitaminB12', unit: 'ug', priority: 0 },
  VITC: { id: 'vitaminC', unit: 'mg', priority: 0 },
  VITD: { id: 'vitaminD', unit: 'ug', priority: 0 },
  TOCPHA: { id: 'vitaminE', unit: 'mg', priority: 0 },
  VITE: { id: 'vitaminE', unit: 'mg', priority: 1, mismatch: 'alpha-tocopherol equivalents (all vitamers), not alpha-tocopherol' },
  VITK: { id: 'vitaminK', unit: 'ug', priority: 0 },
  VITK1: { id: 'vitaminK', unit: 'ug', priority: 0 },
};

const KNOWN_TYPES = new Set(['AR', 'AV', 'MN', 'W']);
const ESTIMATED_TYPES = new Set(['BE', 'E', 'X', 'UD']);
const UNIT_SCALE: Record<string, number> = { g: 1, mg: 1e-3, ug: 1e-6 };

/** Rounds away binary floating-point noise from unit conversions only. */
const clean = (x: number) => Number(x.toPrecision(12));

function toCanonical(value: number, fromUnit: string, mapping: Mapping): number | null {
  if (mapping.unit === 'kcal') {
    if (fromUnit === 'kJ') return Math.round((value / 4.184) * 100) / 100;
    if (fromUnit === 'kcal') return value;
    return null;
  }
  const from = UNIT_SCALE[fromUnit];
  const to = UNIT_SCALE[mapping.unit];
  if (!from || !to) return null;
  return from === to ? value : clean((value * from) / to);
}

interface ValueReport {
  estimatedByType: Map<string, number>;
  mismatch: Map<string, number>;
  skipped: Map<string, number>;
}
const report: ValueReport = { estimatedByType: new Map(), mismatch: new Map(), skipped: new Map() };
const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

function mapNutrients(food: RawFood): NutrientValues {
  const out: NutrientValues = {};
  const prio = new Map<NutrientId, number>();
  // When energy is reported both in kJ and kcal, kcal (no conversion) wins.
  const sorted = [...food.values].sort((a, b) => (a.unit === 'kcal' ? -1 : 0) - (b.unit === 'kcal' ? -1 : 0));
  for (const v of sorted) {
    const mapping = BEDCA_MAP[v.eur];
    if (!mapping) continue;
    if (v.mu !== 'W' && v.mu !== 'WKG') {
      inc(report.skipped, `${v.eur} mu_id=${v.mu}`);
      continue;
    }
    const prev = prio.get(mapping.id);
    if (prev !== undefined && prev <= mapping.priority) continue;

    let nv: NutrientValue | null = null;
    const raw = v.value.trim();
    if (v.type === 'LZ') nv = { status: 'zero', amount: 0 };
    else if (v.type === 'TR' || (v.type === 'BL' && raw === '')) nv = { status: 'estimated', amount: 0 };
    else if (raw !== '') {
      let num = Number(raw);
      if (!Number.isFinite(num) || num < 0) {
        inc(report.skipped, `${v.eur} invalid "${raw}"`);
        continue;
      }
      if (v.mu === 'WKG') num = clean(num / 10);
      const amount = toCanonical(num, v.unit, mapping);
      if (amount === null) {
        inc(report.skipped, `${v.eur} unit ${v.unit}`);
        continue;
      }
      // ENERC is always BE (calculated by definition) → known; any unlisted type is treated as estimated.
      const knownType = KNOWN_TYPES.has(v.type) || (v.eur === 'ENERC' && v.type === 'BE');
      if (!knownType && !ESTIMATED_TYPES.has(v.type) && v.type !== 'BL') inc(report.skipped, `unknown value_type ${v.type} → estimated`);
      if (amount === 0 && knownType) nv = { status: 'zero', amount: 0 };
      else if (mapping.mismatch || !knownType) {
        nv = { status: 'estimated', amount };
        if (mapping.mismatch) inc(report.mismatch, `${v.eur} (${mapping.mismatch})`);
        else inc(report.estimatedByType, `${v.eur}:${v.type}`);
      } else nv = { status: 'known', amount };
    }
    if (!nv) continue; // empty value → missing
    out[mapping.id] = nv;
    prio.set(mapping.id, mapping.priority);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Classification & allergens (curated rules on BEDCA names)
// ---------------------------------------------------------------------------

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface Meta {
  category: FoodCategory;
  role: FoodRole;
  form: FoodForm;
  allergens: Allergen[];
  flags: DietaryFlag[];
  info: MetadataReliability;
}

const COOKED_RE = /\b(asad|plancha|frit|al horno|hervid|cocid|estofad|parrilla|al vapor|escalfad|pasado por agua|revuelto|salteada|guisad)/;
const RAW_RE = /crud|fresc|congelad/;

const m = (category: FoodCategory, role: FoodRole, form: FoodForm, allergens: Allergen[] = [], flags: DietaryFlag[] = [], info: MetadataReliability = 'curated'): Meta => ({
  category,
  role,
  form,
  allergens,
  flags,
  info,
});

const CRUSTACEANS = /^(gamba|langostino|cigala|bogavante|langosta|cangrejo|centollo|necora|camaron|percebe)/;
const MOLLUSCS = /^(almeja|berberecho|mejillon|ostra|vieira|zamburina|chirla|calamar|chipiron|pulpo|sepia|bigaro)/;
const POULTRY = /^(pollo|pavo|gallina|pato|oca|perdiz|pichon|avestruz|higado de pollo|corazon de pollo|salchicha de pollo|grasa de pollo|foie gras)/;

function classify(group: number, name: string): Meta {
  const n = norm(name);
  const cooked = COOKED_RE.test(n);
  const raw = RAW_RE.test(n) && !cooked;

  switch (group) {
    // ---------------- Lácteos ----------------
    case 1: {
      const milk: Allergen[] = ['milk'];
      const dairy: DietaryFlag[] = ['dairy'];
      if (/soja/.test(n)) return m(/^bebida/.test(n) ? 'beverages' : 'dairy', /^bebida/.test(n) ? 'beverage' : 'dairy', 'ready', ['soy'], [], 'unknown');
      if (/^leche de almendra/.test(n)) return m('beverages', 'beverage', 'ready', ['tree_nuts'], [], 'unknown');
      if (/^leche de coco/.test(n)) return m('other', 'fat', 'ready', [], [], 'unknown');
      if (/^nata/.test(n)) return m('oils_fats', 'fat', 'ready', milk, dairy);
      if (/^(flan|natillas|crema catalana|leche merengada)/.test(n)) return m('sweets', 'snack', 'ready', ['milk', 'egg'], ['dairy', 'egg'], 'unknown');
      if (/^mousse de chocolate/.test(n)) return m('sweets', 'snack', 'ready', ['milk', 'egg'], ['dairy', 'egg'], 'unknown');
      if (/^(arroz con leche|helado|mousse|petit|batido)/.test(n)) return m('sweets', 'snack', 'ready', milk, dairy, 'unknown');
      if (/^queso/.test(n)) {
        if (/salmon/.test(n)) return m('dairy', 'dairy', 'ready', ['milk', 'fish'], ['dairy', 'fish'], 'unknown');
        if (/finas hierbas|frutas|fundido|porciones|para untar|al vino|cremoso/.test(n)) return m('dairy', 'dairy', 'ready', milk, dairy, 'unknown');
        return m('dairy', 'protein', 'ready', milk, dairy);
      }
      if (/^cremoso/.test(n)) return m('dairy', 'dairy', 'ready', milk, dairy, 'unknown');
      if (/^yogur/.test(n)) {
        const plain = /natural|griego|bulgaro/.test(n) && !/frutas|cereales|con nata|sabor (fresa|vainilla)/.test(n);
        return m('dairy', 'dairy', 'ready', milk, dairy, plain ? 'curated' : 'unknown');
      }
      if (/^preparado lacteo/.test(n)) return m('dairy', 'dairy', 'ready', milk, dairy, 'unknown');
      if (/^(leche|kefir|cuajada|requeson)/.test(n)) return m('dairy', 'dairy', 'ready', milk, dairy);
      return m('dairy', 'dairy', 'ready', milk, dairy, 'unknown');
    }
    // ---------------- Huevos ----------------
    case 2: {
      const form: FoodForm = /desecada/.test(n) ? 'dry' : cooked || /tortilla/.test(n) ? 'cooked' : 'raw';
      if (/mantequilla/.test(n)) return m('eggs', 'protein', form, ['egg', 'milk'], ['egg', 'dairy']);
      return m('eggs', 'protein', form, ['egg'], ['egg']);
    }
    // ---------------- Cárnicos ----------------
    case 3: {
      const flag: DietaryFlag = POULTRY.test(n) ? 'poultry' : 'meat';
      const cat: FoodCategory = flag === 'poultry' ? 'poultry' : 'meat';
      if (/^croquetas/.test(n)) return m('prepared', 'protein', 'cooked', ['gluten', 'wheat', 'milk', 'egg'], [/pollo/.test(n) ? 'poultry' : flag, 'gluten', 'dairy', 'egg'], 'unknown');
      if (/empanado/.test(n)) return m('prepared', 'protein', 'cooked', ['gluten', 'wheat'], [flag, 'gluten'], 'unknown');
      if (/^(callos|rabo de toro|conejo, entero, estofado)/.test(n)) return m('prepared', 'protein', 'cooked', [], [flag], 'unknown');
      if (/^pollo, frito/.test(n)) return m(cat, 'protein', 'cooked', [], [flag], 'unknown');
      // Cured / processed meat products: additives (milk proteins, soy, gluten, sulphites…) vary by brand.
      if (/^(butifarra|chistorra|choped|chorizo|fuet|longaniza|lomo embuchado|morcilla|mortadela|salami|salchich|sobrasada|pate|foie|bacon|bacon|jamon cocido|jamon asado|lacon|pavo, fiambre|pollo, fiambre)/.test(n)) {
        const form: FoodForm = /^(chistorra|longaniza|butifarra|salchicha, fresca|salchicha de pollo|bacon, crudo)/.test(n) ? 'raw' : /\b(frit|plancha|parrilla)/.test(n) ? 'cooked' : 'ready';
        return m(cat, 'protein', form, [], [flag], 'unknown');
      }
      if (/^(jamon serrano|jamon iberico|cecina)/.test(n)) return m(cat, 'protein', 'ready', [], [flag]);
      if (/^tocino/.test(n)) return m(cat, 'fat', 'raw', [], [flag]);
      return m(cat, 'protein', cooked ? 'cooked' : 'raw', [], [flag]);
    }
    // ---------------- Pescados y mariscos ----------------
    case 4: {
      const isCrust = CRUSTACEANS.test(n);
      const isMoll = MOLLUSCS.test(n);
      const isSnail = /^caracol/.test(n);
      const allergens: Allergen[] = isCrust ? ['shellfish'] : isMoll || isSnail ? ['molluscs'] : ['fish'];
      const flags: DietaryFlag[] = isCrust || isMoll ? ['shellfish'] : isSnail ? [] : ['fish'];
      const cat: FoodCategory = isCrust || isMoll || isSnail ? 'seafood' : 'fish';
      const preserved = /conserva|enlatad|en aceite|escabeche|al natural|ahumad|^caviar/.test(n);
      const form: FoodForm = cooked ? 'cooked' : preserved ? 'ready' : 'raw';
      if (/rebozad|rebozada|empanad|en harina/.test(n)) return m(cat, 'protein', 'cooked', [...allergens, 'gluten', 'wheat'], [...flags, 'gluten'], 'unknown');
      if (/frit|escabeche|calamar, conserva|calamares en aceite|cangrejo, en conserva/.test(n)) return m(cat, 'protein', form, allergens, flags, 'unknown');
      return m(cat, 'protein', form, allergens, flags);
    }
    // ---------------- Grasas y aceites ----------------
    case 5: {
      if (/^mayonesa/.test(n)) return m('condiments', 'condiment', 'ready', ['egg'], ['egg'], 'unknown');
      if (/^mantequilla, baja/.test(n)) return m('oils_fats', 'fat', 'ready', ['milk'], ['dairy'], 'unknown');
      if (/^mantequilla|^nata/.test(n)) return m('oils_fats', 'fat', 'ready', ['milk'], ['dairy']);
      if (/^margarina/.test(n)) return m('oils_fats', 'fat', 'ready', [], [], 'unknown');
      if (/^manteca/.test(n)) return m('oils_fats', 'fat', 'ready', [], ['meat']); // pork lard
      if (/^grasa de pollo/.test(n)) return m('oils_fats', 'fat', 'ready', [], ['poultry']);
      if (/higado de bacalao/.test(n)) return m('oils_fats', 'fat', 'ready', ['fish'], ['fish']);
      if (/cacahuete/.test(n)) return m('oils_fats', 'fat', 'ready', ['peanuts']);
      if (/sesamo/.test(n)) return m('oils_fats', 'fat', 'ready', ['sesame']);
      if (/nuez/.test(n)) return m('oils_fats', 'fat', 'ready', ['tree_nuts']);
      if (/soja/.test(n)) return m('oils_fats', 'fat', 'ready', ['soy']);
      if (/germen de trigo/.test(n)) return m('oils_fats', 'fat', 'ready', ['wheat', 'gluten']);
      return m('oils_fats', 'fat', 'ready');
    }
    // ---------------- Cereales ----------------
    case 6: {
      const wg: Allergen[] = ['wheat', 'gluten'];
      const dryForm: FoodForm = cooked ? 'cooked' : 'dry';
      if (/^(arroz|almidon de (arroz|maiz)|harina de maiz|quinoa|mijo)/.test(n) && !/hinchado/.test(n)) return m('grains', 'carb', dryForm);
      if (/^almidon de trigo/.test(n)) return m('grains', 'carb', 'dry', wg, ['gluten']);
      if (/^(avena|harina de avena|cebada|harina de cebada|centeno|harina de centeno)/.test(n)) return m('grains', 'carb', dryForm, ['gluten'], ['gluten']);
      if (/^(trigo|harina de trigo|semola de trigo|germen de trigo|salvado de trigo)/.test(n)) return m('grains', 'carb', dryForm, wg, ['gluten']);
      if (/^semilla de lino/.test(n)) return m('nuts_seeds', 'fat', 'ready');
      if (/^pasta alimenticia/.test(n)) {
        if (/rellena/.test(n)) return m('prepared', 'carb', 'cooked', [...wg, 'egg'], ['gluten', 'egg', 'meat'], 'unknown');
        if (/vegetales/.test(n)) return m('grains', 'carb', dryForm, wg, ['gluten'], 'unknown');
        if (/huevo/.test(n)) return m('grains', 'carb', dryForm, [...wg, 'egg'], ['gluten', 'egg']);
        return m('grains', 'carb', dryForm, wg, ['gluten']);
      }
      if (/^pan blanco, (de barra|tipo "baguette"|frito)|^pan blanco, de barra, sin sal|^pan integral$|^pan integral, sin sal/.test(n)) return m('grains', 'carb', 'ready', wg, ['gluten']);
      if (/^pan de leche/.test(n)) return m('grains', 'carb', 'ready', [...wg, 'milk'], ['gluten', 'dairy'], 'unknown');
      if (/^pan/.test(n)) return m('grains', 'carb', 'ready', /maiz/.test(n) ? [] : /centeno|cebada|avena/.test(n) ? ['gluten'] : wg, /maiz/.test(n) ? [] : ['gluten'], 'unknown');
      if (/^masa de hojaldre/.test(n)) return m('grains', 'carb', 'raw', wg, ['gluten'], 'unknown');
      if (/^(cereales|arroz hinchado|muesli|barrita|gofio)/.test(n)) {
        const hasWheat = /trigo|all-bran|eko/.test(n);
        const hasOats = /avena|muesli/.test(n);
        const flags: DietaryFlag[] = [...(hasWheat || hasOats ? (['gluten'] as DietaryFlag[]) : []), ...(/miel/.test(n) ? (['honey'] as DietaryFlag[]) : [])];
        return m('grains', 'carb', 'ready', hasWheat ? wg : hasOats ? ['gluten'] : [], flags, 'unknown');
      }
      if (/^miso/.test(n)) return m('condiments', 'condiment', 'ready', ['soy'], [], 'unknown');
      if (/^(magdalena|bizcocho)/.test(n)) return m('sweets', 'snack', 'ready', [...wg, 'egg'], ['gluten', 'egg'], 'unknown');
      if (/^sobao/.test(n)) return m('sweets', 'snack', 'ready', [...wg, 'egg', 'milk'], ['gluten', 'egg', 'dairy'], 'unknown');
      if (/^ensaimada/.test(n)) return m('sweets', 'snack', 'ready', wg, ['gluten', 'meat'], 'unknown'); // made with pork lard
      if (/^galleta.*(salada)/.test(n)) return m('grains', 'snack', 'ready', wg, ['gluten'], 'unknown');
      // bollería, galletas, pasteles, churros, rosquillas, torta de aceite…
      return m('sweets', 'snack', 'ready', wg, ['gluten'], 'unknown');
    }
    // ---------------- Legumbres, semillas, frutos secos ----------------
    case 7: {
      const legForm: FoodForm = cooked || /conserva/.test(n) ? (/conserva/.test(n) ? 'ready' : 'cooked') : /\bsec[oa]\b|^judia (blanca|pinta)$/.test(n) ? 'dry' : 'raw';
      if (/^judia verde/.test(n)) return m('vegetables', 'vegetable', 'raw');
      if (/^(almendra|anacardo|avellana|nuez|pistacho)/.test(n)) return m('nuts_seeds', 'fat', 'ready', ['tree_nuts']);
      if (/^crema de almendras/.test(n)) return m('nuts_seeds', 'fat', 'ready', ['tree_nuts'], [], 'unknown');
      if (/^frutos secos/.test(n)) return m('nuts_seeds', 'fat', 'ready', ['tree_nuts'], [], 'unknown');
      if (/^crema de cacahuete/.test(n)) return m('nuts_seeds', 'fat', 'ready', ['peanuts'], [], 'unknown');
      if (/^cacahuete/.test(n)) return m('nuts_seeds', 'fat', 'ready', ['peanuts']);
      if (/^(pinon|pipa|castana|chufa)/.test(n)) return m('nuts_seeds', /castana/.test(n) ? 'carb' : 'fat', /castana, cruda/.test(n) ? 'raw' : 'ready');
      if (/^sesamo/.test(n)) return m('nuts_seeds', 'fat', 'ready', ['sesame']);
      if (/^altramuz/.test(n)) return m('legumes', 'snack', 'ready', ['lupin']);
      if (/^soja, frita/.test(n)) return m('legumes', 'snack', 'ready', ['soy'], [], 'unknown');
      if (/^haba, frita/.test(n)) return m('legumes', 'snack', 'ready', [], [], 'unknown');
      if (/^(soja|tofu|harina de soja)/.test(n)) return m('legumes', 'protein', /^tofu/.test(n) ? 'ready' : /harina/.test(n) ? 'dry' : legForm, ['soy']);
      return m('legumes', 'protein', legForm);
    }
    // ---------------- Verduras y hortalizas ----------------
    case 8: {
      const needsCooking = /^(patata, cruda|boniato|acelga, cruda|alcachofa, cruda|berenjena$|calabaza, cruda|cardo$|judia verde, congelada|maiz, en mazorca|grelo|borraja|coliflor, congelada|espinaca, picada, congelada|puerro, crudo|niscalo|col blanca|col rizada|col de bruselas)/.test(n);
      const form: FoodForm = cooked ? 'cooked' : needsCooking ? 'raw' : 'ready';
      const role: FoodRole = /^(patata|boniato|maiz|tapioca|pure)/.test(n) ? 'carb' : /^(ajo|cebollino|albahaca|alcaparra|perejil)/.test(n) ? 'condiment' : 'vegetable';
      if (/^apio/.test(n)) return m('vegetables', role, form, ['celery']);
      if (/^pure.*queso|^pure, de patata, con leche/.test(n)) return m('vegetables', 'carb', /copos/.test(n) ? 'dry' : 'ready', ['milk'], ['dairy'], 'unknown');
      if (/^pure/.test(n)) return m('vegetables', 'carb', 'dry', [], [], 'unknown');
      if (/^(ensalada|menestra|pepinillos|alcaparra|soja, germinada|patata, prefrita|berenjena, frita)/.test(n)) return m('vegetables', role, form, [], [], 'unknown');
      return m('vegetables', role, form);
    }
    // ---------------- Frutas ----------------
    case 9: {
      if (/^(aceituna)/.test(n)) return m('fruits', 'snack', 'ready');
      if (/^(aguacate|coco, fresco)/.test(n)) return m('fruits', 'fat', 'ready');
      if (/^(uva pasa|melocoton, desecado|coco, desecado|pasta de fruta)/.test(n)) return m('fruits', /pasta/.test(n) ? 'snack' : 'fruit', 'ready', [], [], 'unknown'); // dried fruit may be sulphited
      return m('fruits', 'fruit', 'ready');
    }
    // ---------------- Azúcar, chocolate ----------------
    case 10: {
      if (/^(azucar|fructosa)/.test(n)) return m('sweeteners', 'condiment', 'ready');
      if (/^miel|^jalea real/.test(n)) return m('sweeteners', 'condiment', 'ready', [], ['honey']);
      if (/^mermelada/.test(n) && !/baja/.test(n)) return m('sweeteners', 'condiment', 'ready');
      if (/^(mermelada|confitura)/.test(n)) return m('sweeteners', 'condiment', 'ready', [], [], 'unknown');
      if (/^chocolate (con leche|blanco)/.test(n)) {
        const nuts: Allergen[] = /almendras|macadamia/.test(n) ? ['tree_nuts'] : [];
        return m('sweets', 'snack', 'ready', ['milk', ...nuts], ['dairy'], 'unknown');
      }
      if (/macadamia/.test(n)) return m('sweets', 'snack', 'ready', ['tree_nuts'], [], 'unknown');
      if (/^chocolate negro, con almendras/.test(n)) return m('sweets', 'snack', 'ready', ['tree_nuts'], [], 'unknown');
      if (/^crema de chocolate con avellanas/.test(n)) return m('sweets', 'snack', 'ready', ['tree_nuts', 'milk'], ['dairy'], 'unknown');
      if (/^crema (inglesa|pastelera)/.test(n)) return m('sweets', 'snack', 'ready', ['milk', 'egg'], ['dairy', 'egg'], 'unknown');
      if (/^turron/.test(n)) return m('sweets', 'snack', 'ready', ['tree_nuts', 'egg'], ['egg', 'honey'], 'unknown');
      if (/kit-kat/.test(n)) return m('sweets', 'snack', 'ready', ['milk', 'wheat', 'gluten'], ['dairy', 'gluten'], 'unknown');
      if (/mars|bounty/.test(n)) return m('sweets', 'snack', 'ready', ['milk'], ['dairy'], 'unknown');
      if (/^pastel/.test(n)) return m('sweets', 'snack', 'ready', ['wheat', 'gluten'], ['gluten'], 'unknown');
      return m('sweets', /^cacao/.test(n) ? 'other' : 'snack', 'ready', [], [], 'unknown');
    }
    // ---------------- Bebidas ----------------
    case 11: {
      const bev = (allergens: Allergen[] = [], flags: DietaryFlag[] = [], info: MetadataReliability = 'curated', form: FoodForm = 'ready') => m('beverages', 'beverage', form, allergens, flags, info);
      if (/^cerveza sin alcohol/.test(n)) return bev(['gluten'], ['gluten']);
      if (/^cerveza/.test(n)) return bev(['gluten'], ['gluten', 'alcohol']);
      if (/^(vino|cava|sidra)/.test(n)) return bev(['sulphites'], ['alcohol']);
      if (/^(vermut|sangria)/.test(n)) return bev(['sulphites'], ['alcohol'], 'unknown');
      if (/^(licor|cubata)/.test(n)) return bev(/crema/.test(n) ? ['milk'] : [], /crema/.test(n) ? ['alcohol', 'dairy'] : ['alcohol'], 'unknown');
      if (/^(aguardiente|anis|conac|ginebra|ron$|tequila|vodka|whisky)/.test(n)) return bev([], ['alcohol']);
      if (/con leche/.test(n)) return bev(['milk'], ['dairy']);
      if (/^cafe, (en grano|en polvo)/.test(n)) return bev([], [], 'curated', 'dry');
      if (/^(cafe, sucedaneo|cacao)/.test(n)) return bev([], [], 'unknown', 'dry');
      if (/^(horchata|bebida energetica|bebida isotonica)/.test(n)) return bev([], [], 'unknown');
      return bev();
    }
    // ---------------- Miscelánea ----------------
    case 12: {
      const spice = /^(ajo, en polvo|azafran|canela|comino|eneldo|guindilla|hinojo|jengibre|laurel|nuez moscada|oregano|pimenton|pimienta|romero|tomillo|vainilla)/;
      if (spice.test(n)) return m('spices', 'condiment', 'dry');
      if (/^(chile|menta|perejil)/.test(n)) return m('spices', 'condiment', 'ready');
      if (/^curry/.test(n)) return m('spices', 'condiment', 'dry', [], [], 'unknown');
      if (/^sal /.test(n)) return m('condiments', 'condiment', 'ready');
      if (/^vinagre (de vino|balsamico)/.test(n)) return m('condiments', 'condiment', 'ready', ['sulphites']);
      if (/^(gomasio|pasta de sesamo)/.test(n)) return m('condiments', 'condiment', 'ready', ['sesame']);
      if (/^mostaza/.test(n)) return m('condiments', 'condiment', 'ready', ['mustard'], [], 'unknown');
      if (/^mayonesa/.test(n)) return m('condiments', 'condiment', 'ready', ['egg'], ['egg'], 'unknown');
      if (/^salsa de soja/.test(n)) return m('condiments', 'condiment', 'ready', ['soy', 'wheat', 'gluten'], ['gluten'], 'unknown');
      if (/^salsa bechamel/.test(n)) return m('condiments', 'condiment', 'ready', ['milk', 'wheat', 'gluten'], ['dairy', 'gluten'], 'unknown');
      if (/^salsa carbonara/.test(n)) return m('condiments', 'condiment', 'ready', ['milk', 'egg'], ['dairy', 'egg', 'meat'], 'unknown');
      if (/^salsa (de queso|al roquefort)/.test(n)) return m('condiments', 'condiment', 'ready', ['milk'], ['dairy'], 'unknown');
      if (/^salsa bolonesa/.test(n)) return m('condiments', 'condiment', 'ready', [], ['meat'], 'unknown');
      if (/^(salsa|ketchup|tabasco|mojo|alioli|tomate frito|sofrito|vinagre|cubito|caldo|sopa)/.test(n)) return m('condiments', 'condiment', /sin reconstituir|cubito/.test(n) ? 'dry' : 'ready', [], [], 'unknown');
      if (/^paella marinera/.test(n)) return m('prepared', 'carb', 'cooked', ['shellfish', 'molluscs'], ['shellfish'], 'unknown');
      if (/^paella/.test(n)) return m('prepared', 'carb', 'cooked', [], [], 'unknown');
      if (/^fabada/.test(n)) return m('prepared', 'protein', 'cooked', [], ['meat'], 'unknown');
      if (/^(lasana|canelones)/.test(n)) return m('prepared', 'carb', 'cooked', ['wheat', 'gluten', 'milk'], ['gluten', 'dairy'], 'unknown');
      if (/^pizza/.test(n)) return m('prepared', 'carb', 'ready', ['wheat', 'gluten', 'milk'], ['gluten', 'dairy'], 'unknown');
      if (/^empanada de carne/.test(n)) return m('prepared', 'carb', 'ready', ['wheat', 'gluten'], ['gluten', 'meat'], 'unknown');
      if (/^(empanadilla|bocadillo|rollito|hojaldre|aperitivos de trigo|corteza de trigo)/.test(n)) return m('prepared', /aperitivo|corteza/.test(n) ? 'snack' : 'carb', 'ready', ['wheat', 'gluten'], ['gluten'], 'unknown');
      if (/^ensaladilla/.test(n)) return m('prepared', 'carb', 'ready', ['egg'], ['egg'], 'unknown');
      if (/^gazpacho/.test(n)) return m('prepared', 'vegetable', 'ready', [], [], 'unknown');
      if (/^flamenquin/.test(n)) return m('prepared', 'protein', 'cooked', ['wheat', 'gluten', 'egg'], ['meat', 'gluten', 'egg'], 'unknown');
      if (/^san jacobo/.test(n)) return m('prepared', 'protein', 'raw', ['wheat', 'gluten', 'milk', 'egg'], ['meat', 'gluten', 'dairy', 'egg'], 'unknown');
      if (/^(kebab|albondigas)/.test(n)) return m('prepared', 'protein', 'ready', [], /albondigas/.test(n) ? ['meat'] : [], 'unknown');
      if (/^seitan/.test(n)) return m('other', 'protein', 'ready', ['wheat', 'gluten'], ['gluten'], 'unknown');
      if (/^surimi/.test(n)) return m('fish', 'protein', 'ready', ['fish'], ['fish'], 'unknown');
      if (/^galletas saladas, con queso/.test(n)) return m('grains', 'snack', 'ready', ['wheat', 'gluten', 'milk'], ['gluten', 'dairy'], 'unknown');
      if (/^(crema de chocolate|crema de vainilla|flan)/.test(n)) return m('sweets', 'snack', 'ready', ['milk'], ['dairy'], 'unknown');
      if (/^patatas, fritas, chips/.test(n)) return m('other', 'snack', 'ready');
      if (/^palomitas/.test(n)) return m('other', 'snack', 'ready');
      if (/^(patatas chips|fritos de maiz|gusanito)/.test(n)) return m('other', 'snack', 'ready', [], [], 'unknown');
      if (/^(pudding|gelatina|crema de coco)/.test(n)) return m(/coco/.test(n) ? 'other' : 'sweets', /coco/.test(n) ? 'fat' : 'snack', 'ready', [], [], 'unknown');
      return m('other', 'other', 'ready', [], [], 'unknown');
    }
  }
  return m('other', 'other', 'ready', [], [], 'unknown');
}

// ---------------------------------------------------------------------------
// Aliases (Spanish only)
// ---------------------------------------------------------------------------

/** Curated extra search words per BEDCA f_id (common names, typical phrasing). */
const ALIASES: Record<string, string[]> = {
  '2273': ['jamón serrano', 'jamón', 'jamón curado'],
  '1781': ['jamón ibérico', 'jamón de bellota', 'pata negra'],
  '1777': ['jamón ibérico', 'jamón de cebo'],
  '965': ['jamón york', 'jamón dulce', 'jamón cocido'],
  '2318': ['boquerones fritos', 'boquerones', 'pescaíto frito'],
  '2316': ['boquerones', 'anchoa fresca'],
  '681': ['café con leche'],
  '2433': ['café solo', 'café', 'expreso', 'espresso'],
  '2434': ['café descafeinado', 'descafeinado'],
  '2597': ['paella'],
  '2596': ['paella de marisco', 'arroz marinero'],
  '2614': ['gazpacho andaluz'],
  '2617': ['ensaladilla'],
  '2616': ['fabada asturiana', 'fabes'],
  '2268': ['croquetas', 'croqueta'],
  '2668': ['churros'],
  '2442': ['horchata de chufa'],
  '785': ['turrón', 'turrón duro', 'turrón de alicante'],
  '2160': ['pan', 'barra de pan', 'pan de barra', 'pan blanco'],
  '1066': ['baguette', 'pan'],
  '2163': ['pan integral'],
  '2437': ['cerveza', 'caña'],
  '2465': ['vino tinto', 'vino'],
  '2462': ['vino blanco', 'vino'],
  '2464': ['vino rosado', 'vino'],
  '2508': ['manchego'],
  '2493': ['leche entera', 'leche'],
  '916': ['leche semidesnatada', 'leche'],
  '915': ['leche desnatada', 'leche'],
  '2543': ['aceite de oliva', 'aceite'],
  '2544': ['aove', 'aceite de oliva virgen extra', 'aceite'],
  '2541': ['aceite de girasol', 'aceite'],
  '2457': ['cola', 'refresco de cola'],
  '2277': ['lomo curado', 'caña de lomo'],
  '2347': ['merluza'],
  '2626': ['salmón'],
  '2340': ['langostinos'],
  '2337': ['gambas cocidas', 'gambas'],
  '2471': ['pulpo'],
  '2374': ['pulpo cocido'],
  '2345': ['mejillones'],
  '2459': ['sangría'],
  '2127': ['huevo', 'huevos'],
  '759': ['huevo frito', 'huevos fritos'],
  '2126': ['huevo duro', 'huevos duros', 'huevo cocido'],
  '779': ['tortilla francesa'],
  '761': ['huevos revueltos', 'revuelto'],
  '2403': ['patata', 'patatas'],
  '883': ['patatas fritas'],
  '2594': ['patatas fritas de bolsa', 'patatas chips', 'chips'],
  '2402': ['patata asada', 'patatas asadas'],
  '2404': ['patata cocida', 'patatas cocidas'],
  '2661': ['arroz blanco', 'arroz cocido'],
  '2660': ['arroz blanco', 'arroz crudo'],
  '1117': ['pasta', 'macarrones', 'espaguetis', 'fideos'],
  '1072': ['pasta cocida', 'pasta al huevo'],
  '2200': ['lentejas', 'lentejas cocidas'],
  '2192': ['garbanzos', 'garbanzos cocidos'],
  '2199': ['alubias blancas', 'judías blancas'],
  '2197': ['alubias pintas', 'judías pintas'],
  '2196': ['alubias blancas', 'judiones'],
  '2214': ['aceitunas', 'olivas'],
  '2215': ['aceitunas negras', 'olivas negras'],
  '2245': ['plátano', 'plátano de canarias', 'banana'],
  '2229': ['mandarinas'],
  '2235': ['naranjas'],
  '2231': ['manzanas'],
  '2421': ['tomates'],
  '2399': ['lechuga'],
  '2230': ['mandarina congelada'],
  '2280': ['morcilla'],
  '2264': ['chorizo'],
  '2310': ['salchichón'],
  '2311': ['sobrasada'],
  '1161': ['fuet', 'longaniza de vic'],
  '2309': ['salchichas de frankfurt', 'perritos'],
  '2680': ['carne picada', 'picada'],
  '2297': ['pechuga de pollo', 'pollo a la plancha'],
  '980': ['pollo asado'],
  '2262': ['chistorra'],
  '2620': ['empanada', 'empanada gallega'],
  '2619': ['empanadillas'],
  '2615': ['flamenquines'],
  '2589': ['pizza'],
  '2604': ['lasaña', 'lasagna'],
  '2478': ['canelones', 'canelón'],
  '2476': ['bocata', 'bocadillo'],
  '2560': ['tomate frito'],
  '2600': ['mostaza'],
  '2605': ['kétchup', 'catsup'],
  '790': ['alioli', 'allioli', 'ajoaceite'],
  '2601': ['mojo picón', 'mojo rojo'],
  '2486': ['flan'],
  '2497': ['natillas'],
  '2483': ['crema catalana'],
  '2479': ['arroz con leche'],
  '2485': ['cuajada'],
  '2507': ['queso de burgos', 'queso fresco'],
  '2520': ['yogur griego'],
  '2530': ['yogur desnatado', 'yogur natural desnatado'],
  '2669': ['cruasán', 'croissant'],
  '2678': ['magdalenas'],
  '2671': ['ensaimada'],
  '2670': ['dónut', 'donut'],
  '2659': ['regaliz'],
  '2643': ['miel'],
  '2642': ['azúcar', 'azúcar blanco'],
  '2651': ['chocolate con leche'],
  '788': ['chocolate negro'],
  '2648': ['cacao soluble', 'cacao en polvo'],
  '2425': ['agua', 'agua del grifo'],
  '2426': ['agua mineral', 'agua'],
  '2468': ['zumo de naranja'],
  '2460': ['sidra'],
  '2436': ['cava', 'champán'],
  '2438': ['cerveza sin alcohol', 'cerveza 0,0'],
  '2443': ['infusión', 'té', 'manzanilla', 'poleo'],
  '2440': ['cubata', 'cubalibre'],
  '2466': ['whisky', 'güisqui'],
  '2441': ['ginebra', 'gin'],
  '2652': ['gominolas', 'chuches', 'golosinas'],
  '2647': ['bombones'],
  '2201': ['nueces'],
  '896': ['almendras'],
  '2182': ['almendras tostadas'],
  '2219': ['avellanas'],
  '2207': ['pistachos'],
  '2205': ['pipas', 'pipas de girasol'],
  '2186': ['cacahuetes', 'maní'],
  '1121': ['tofu'],
};

/** Simple Spanish pluralisation of one word. */
function pluralWord(w: string): string {
  if (/[aeiouáéó]$/.test(w)) return w + 's';
  if (w.endsWith('z')) return w.slice(0, -1) + 'ces';
  if (/[sx]$/.test(w)) return w;
  const deaccent: Record<string, string> = { ón: 'ones', án: 'anes', én: 'enes', ín: 'ines', ún: 'unes', és: 'eses' };
  for (const [k, v] of Object.entries(deaccent)) if (w.endsWith(k)) return w.slice(0, -k.length) + v;
  return w + 'es';
}
const PREPS = new Set(['de', 'del', 'con', 'en', 'a', 'al', 'sin', 'para', 'y', 'tipo', 'por']);
function pluralPhrase(p: string): string {
  const words = p.split(' ');
  if (words.some((w) => PREPS.has(w))) return [pluralWord(words[0]!), ...words.slice(1)].join(' ');
  return words.map((w) => (/^\d/.test(w) ? w : pluralWord(w))).join(' ');
}
const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');

function buildAliases(id: string, name: string): string[] {
  const lower = name.toLowerCase().replace(/["“”]/g, '').replace(/\s+/g, ' ').trim();
  // Drop BEDCA's "sin especificar" markers and similar non-searchable fragments.
  const parts = lower
    .split(',')
    .map((s) => s.trim())
    .filter((p) => p && !/s\/e|sin especificar|genéric[oa]/.test(p));
  const out: string[] = [];
  const add = (s: string) => {
    const t = s.trim();
    if (t && t.length <= 60 && !out.includes(t)) out.push(t);
  };
  const curated = (ALIASES[id] ?? []).map((a) => a.toLowerCase());
  curated.forEach(add);
  const base = parts[0] ?? lower;
  const words = base.split(' ');
  const simple = /^[a-záéíóúñü]+$/;
  // Plural of a one-word base ("Cuajada" → "cuajadas") or of "noun de X" ("Helado de chocolate" → "helados de chocolate").
  if (parts.length === 1 && words.length === 1 && simple.test(base) && !base.endsWith('s')) add(pluralWord(base));
  else if (words.length <= 3 && words[1] === 'de' && simple.test(words[0]!) && !words[0]!.endsWith('s') && words[0] !== 'queso') add(pluralPhrase(base));
  // "Café, con leche" → "café con leche"; "Boquerón, frito" → "boquerón frito" (+ plural "boquerones fritos").
  if (parts.length >= 2) {
    const joined = parts.join(' ');
    if (joined.split(' ').length <= 5) add(joined);
    if (parts.length === 2 && words.length === 1 && parts[1]!.split(' ').length === 1 && simple.test(parts[1]!) && simple.test(base)) add(pluralPhrase(`${base} ${parts[1]}`));
  }
  // Unaccented spellings of the curated aliases (users often type without accents).
  for (const a of curated) {
    const plain = stripAccents(a);
    if (plain !== a) add(plain);
  }
  return out.filter((a) => a !== lower).slice(0, 8);
}

const tidyName = (s: string) => {
  const t = s.replace(/\s+/g, ' ').replace(/ ,/g, ',').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

// ---------------------------------------------------------------------------
// Servings
// ---------------------------------------------------------------------------

function buildServings(prefix: string, id: string, name: string, group: number, edible: number, warnings: string[]): ServingDefinition[] {
  const portions = portionsFor(id, name, group);
  if (!portions) return [];
  const out: ServingDefinition[] = [];
  portions.forEach((p, i) => {
    let grams = p.grams;
    if (p.asPurchased) {
      // Guard against implausible edible-portion factors in the source (e.g. 0.01 for garlic).
      if (!(edible >= 0.1 && edible <= 1)) {
        warnings.push(`${id}: edible portion ${edible} implausible, as-purchased portion "${p.label}" dropped`);
        return;
      }
      grams = p.grams * edible;
    }
    grams = Math.round(grams * 10) / 10;
    if (!(grams > 0)) return;
    const shown = grams >= 10 ? Math.round(grams) : grams;
    let label = p.label.replace('{g}', String(shown).replace('.', ','));
    // An as-purchased weight with edible factor 1 is already the edible weight: drop the "comestibles" note.
    if (p.asPurchased && edible === 1) label = label.replace(/ g (comestibles|sin cáscara|sin piel|sin hueso)\)/, ' g)');
    out.push({ id: `${prefix}_s${i + 1}`, label, grams, ...(p.volumeMl ? { volumeMl: p.volumeMl } : {}) });
  });
  const def = portions.findIndex((p) => p.isDefault);
  if (out.length) out[def >= 0 && def < out.length ? def : 0]!.isDefault = true;
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const listed: { id: string; group: number; name: string }[] = [];
  for (const g of GROUP_IDS) {
    const xml = await cached(join(CACHE, 'groups', `group_${g}.xml`), groupQuery(g));
    for (const mm of xml.matchAll(/<food>([\s\S]*?)<\/food>/g)) listed.push({ id: tag(mm[1]!, 'f_id')!, group: g, name: tag(mm[1]!, 'f_ori_name')! });
  }
  console.log(`${listed.length} public BEDCA foods listed`);

  const foods: Food[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];
  let n = 0;
  for (const item of listed) {
    n++;
    const file = join(CACHE, 'detail', `${item.id}.xml`);
    const xml = await cached(file, detailQuery(item.id));
    if (n % 100 === 0) console.log(`  ${n}/${listed.length}`);
    if (EXCLUDED[item.id]) {
      skipped.push(`${item.id} ${item.name} — excluded: ${EXCLUDED[item.id]}`);
      continue;
    }
    const raw = parseDetail(xml);
    if (!raw) {
      if (!xml) continue; // offline mode, not cached
      skipped.push(`${item.id} ${item.name} — empty response`);
      continue;
    }
    const values = mapNutrients(raw);
    if (!Object.keys(values).length) {
      skipped.push(`${item.id} ${item.name} — no mappable values`);
      continue;
    }
    const meta = classify(item.group, raw.name);
    const foodId = `bedca_${raw.id}`;
    const name = tidyName(raw.name);
    const ts = new Date(statSync(file).mtime.toISOString().slice(0, 10) + 'T00:00:00Z').toISOString();
    const servings = buildServings(foodId, foodId, name, item.group, raw.edible, warnings);
    if (!servings.length) warnings.push(`${foodId} ${name}: no serving`);
    foods.push({
      id: foodId,
      name,
      category: meta.category,
      role: meta.role,
      form: meta.form,
      source: { type: 'bedca', sourceId: raw.id, originalName: raw.name, attribution: BEDCA_ATTRIBUTION, license: BEDCA_LICENSE_SHORT, url: BEDCA_URL, retrievedAt: ts },
      nutrientsPer100g: values,
      completeness: computeCompleteness(values),
      servings,
      allergens: [...new Set(meta.allergens)],
      traces: [],
      dietaryFlags: [...new Set(meta.flags)],
      allergenInfo: meta.info,
      aliases: buildAliases(raw.id, name),
      isArchived: false,
      createdAt: ts,
      updatedAt: ts,
    } satisfies Food);
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ source: BEDCA_ATTRIBUTION, license: BEDCA_LICENSE, generatedAt: new Date().toISOString(), foods }) + '\n');
  console.log(`Wrote ${foods.length} foods to ${OUT} (${skipped.length} skipped)`);
  for (const s of skipped) console.log(`  skipped ${s}`);
  for (const w of warnings) console.warn(`  warning ${w}`);
  console.log('Estimated by value type:', Object.fromEntries(report.estimatedByType));
  console.log('Estimated by definition mismatch:', Object.fromEntries(report.mismatch));
  console.log('Skipped values:', Object.fromEntries(report.skipped));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
