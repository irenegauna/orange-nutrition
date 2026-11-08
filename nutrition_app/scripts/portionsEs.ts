/**
 * Typical Spanish portions (servings) for the BEDCA and CIQUAL seed foods.
 *
 * Used by scripts/build-bedca-seed.ts and scripts/build-ciqual-seed.ts. Every entry carries a
 * `source` tag:
 *
 * - 'ucm': Universidad Complutense de Madrid, Manual de Nutrición y Dietética (A. Carbajal Azcona),
 *   "Anexo: Pesos de medidas caseras y raciones habituales de consumo (por persona)" (UCM_URL).
 *   Includes the table "Pesos de alimentos servidos en comedores colectivos" reproduced in that annex
 *   (Salas-Salvadó et al., 2000). UCM weights are "as purchased" and often raw, so:
 *     * entries are only used for foods in the SAME form (a raw-rice ration is never used for a cooked dish);
 *     * weights that include inedible parts (peel, shell, bones, rind) are flagged `asPurchased: true` and
 *       the build multiplies them by BEDCA's own `edible_portion` factor, so the serving grams refer to the
 *       edible portion the nutrient values are expressed for (e.g. 1 huevo mediano 60 g × 0.88 = 53 g);
 *     * cooked rice / pasta / legume rations are derived from the UCM raw ration with the conversion
 *       factors UCM itself gives in the annex (cooked→raw: pasta × 0.5, rice and legumes × 0.4).
 * - an https URL: another reputable Spanish source for that specific portion.
 * - 'estimate': no published source found; a deliberately round, clearly-approximate portion whose
 *   label ends with "(aprox.)". Users can always log plain grams (the app adds a 'g' option itself).
 *
 * Labels are Spanish (Spain). `{g}` in a label is replaced by the final gram weight (rounded) at build time.
 * Liquids carry `volumeMl` (density ≈ 1 assumed for drinks; UCM gives drink measures in grams).
 * The FIRST portion returned for a food is the default one unless another has `isDefault: true`.
 *
 * Nothing in this file is a nutrient value.
 */

export const UCM_URL = 'https://www.ucm.es/data/cont/docs/458-2015-10-22-pesos-medidas-caseras-raciones-2015.pdf';
export const CONSUMER_TORTILLA_URL = 'https://www.consumer.es/alimentacion/cuanto-engorda-una-tortilla-de-patatas.html';

export type PortionSource = 'ucm' | 'estimate' | `https://${string}`;

export interface PortionEs {
  /** Spanish label; `{g}` is replaced with the final grams. */
  label: string;
  /** Grams as given by the source (before the edible-portion factor when `asPurchased`). */
  grams: number;
  volumeMl?: number;
  source: PortionSource;
  /** Weight includes inedible parts → multiplied by BEDCA's edible_portion factor at build time. */
  asPurchased?: boolean;
  isDefault?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** UCM portion with an explicit gram weight: "1 loncha (≈ 30 g)". */
const ucm = (what: string, grams: number, extra: Partial<PortionEs> = {}): PortionEs => ({ label: `${what} (≈ {g} g)`, grams, source: 'ucm', ...extra });
/** UCM portion, weight as purchased (peel/shell/bones) → edible grams computed at build time. */
const ucmAP = (what: string, grams: number, edibleWord = 'comestibles'): PortionEs => ({ label: `${what} (≈ {g} g ${edibleWord})`, grams, source: 'ucm', asPurchased: true });
/** UCM drink measure: "1 caña (200 ml)". */
const ucmMl = (what: string, ml: number): PortionEs => ({ label: `${what} (${ml} ml)`, grams: ml, volumeMl: ml, source: 'ucm' });
/** Approximate portion without a published source. */
const est = (what: string, grams: number, extra: Partial<PortionEs> = {}): PortionEs => ({ label: `${what} ≈ {g} g (aprox.)`, grams, source: 'estimate', ...extra });
const estMl = (what: string, ml: number): PortionEs => ({ label: `${what} ≈ ${ml} ml (aprox.)`, grams: ml, volumeMl: ml, source: 'estimate' });

// UCM rations reused by several rules (midpoints of the published ranges).
const QUESO_RACION = ucm('1 ración', 50); // QUESOS ración = 40–60 g
const CARNE_RACION = ucmAP('1 ración', 125); // CARNES ración = 100–150 g (as purchased)
const PESCADO_RACION = ucmAP('1 ración', 160); // PESCADOS ración = 125–200 g (as purchased)
const FRUTA_RACION = ucmAP('1 ración', 200); // Fruta fresca, ración (comedores colectivos) = 200 g
const VERDURA_RACION = ucmAP('1 ración', 250); // VERDURAS ración = 200–300 g
const VERDURA_CONSERVA = ucm('1 ración', 150); // Verduras en conserva = 150 g
const VERDURA_GUARNICION = ucmAP('1 guarnición', 100); // Verduras frescas, guarnición = 100 g
const ARROZ_CRUDO = [ucm('1 ración en crudo', 85), ucm('1 cucharada sopera colmada', 30), ucm('1 guarnición en crudo', 45)]; // ARROZ ración 70–100 g
const ARROZ_COCIDO = [ucm('1 ración (cocido)', Math.round(85 / 0.4)), ucm('1 guarnición (cocido)', Math.round(45 / 0.4))];
const PASTA_CRUDA = [ucm('1 ración en crudo', 85), ucm('1 ración para sopa', 22)]; // macarrones/espaguetis 70–100 g; fideos sopa 20–25 g
const PASTA_COCIDA = [ucm('1 ración (cocida)', Math.round(85 / 0.5))];
const LEGUMBRE_SECA = [ucm('1 ración en crudo', 85)]; // Legumbres 80–90 g
const LEGUMBRE_COCIDA = [ucm('1 ración (cocida)', Math.round(85 / 0.4))];
const FRUTOS_SECOS = [ucm('1 puñado / ración', 30)]; // FRUTOS SECOS, MEZCLA ración = 30 g
const ACEITE = [ucm('1 cucharada sopera rasa', 10), ucm('1 cucharada de postre', 5), ucm('1 cucharada sopera colmada', 14)];
const LICOR = [ucmMl('1 copa', 45)]; // LICORES copa = 30–60 g
const REFRESCO = [ucmMl('1 vaso', 200), ucmMl('1 lata', 330)];
const ZUMO = [ucmMl('1 vaso', 200)];
const CERVEZA = [ucmMl('1 caña', 200), ucmMl('1 botellín', 200), ucmMl('1 tercio / lata', 330)];
const LECHE = [ucmMl('1 vaso', 200), ucmMl('1 taza', 250), ucmMl('1 tazón', 360)];
const YOGUR = [ucm('1 yogur', 125)];
const ESPECIA = [est('1 cucharadita', 2)];
const HIERBA_FRESCA = [est('1 cucharada picada', 4)];
const SALSA = [est('1 cucharada sopera', 15), est('1 ración de salsa', 60)];
const COCIDO_CARNE = [est('1 ración', 120)];
const COCIDO_PESCADO = [est('1 ración', 130)];
const MARISCO = [est('1 ración', 100)];
const CEREAL_DESAYUNO = [est('1 ración (bol)', 30)];
const CHOCOLATE = [est('1 onza', 10), ucm('1 tableta', 150)];

// ---------------------------------------------------------------------------
// Explicit per-food portions (food id → portions). Checked before the rules.
// ---------------------------------------------------------------------------

export const PORTIONS_BY_ID: Record<string, PortionEs[]> = {
  // --- BEDCA: eggs ---
  bedca_2127: [ucmAP('1 huevo mediano', 60, 'sin cáscara'), ucmAP('1 huevo grande', 65, 'sin cáscara'), ucmAP('1 huevo pequeño', 55, 'sin cáscara')],
  // Cooked eggs: BEDCA gives edible_portion 1 (values for the peeled egg) → use the UCM weight × 0.88,
  // the edible-portion factor BEDCA gives for "Huevo de gallina fresco".
  bedca_2126: [ucm('1 huevo mediano (sin cáscara)', 53), ucm('1 huevo grande (sin cáscara)', 57)],
  bedca_758: [ucm('1 huevo mediano (sin cáscara)', 53)],
  bedca_760: [ucm('1 huevo mediano (sin cáscara)', 53)],
  bedca_759: [est('1 huevo frito', 55), est('2 huevos fritos', 110)],
  bedca_1173: [ucm('1 clara (60 % del huevo mediano)', 36)],
  bedca_2125: [ucm('1 yema (30 % del huevo mediano)', 18)],
  bedca_762: [est('1 cucharada sopera', 8)],
  bedca_761: [est('1 ración (2 huevos)', 115)],
  bedca_779: [ucm('1 tortilla de 1 huevo (huevo + 8 g de aceite)', 61), ucm('1 tortilla de 2 huevos', 122)],
  bedca_757: [est('1 huevo de codorniz', 9)],
  bedca_764: [est('1 huevo de pato', 70)],
  bedca_763: [est('1 huevo de pavo', 80)],

  // --- BEDCA: dairy specifics ---
  bedca_907: [ucm('1 cucharada sopera', 20), ucm('1 cucharada de postre', 10)],
  bedca_2492: [ucm('1 cucharada sopera', 20), ucm('1 cucharada de postre', 10)],
  bedca_912: [ucm('1 cucharada sopera rasa', 10), ucm('1 cucharada sopera colmada', 15)],
  bedca_2485: [ucm('1 cuajada', 150)],
  bedca_2486: [ucm('1 flan', 125)],
  bedca_876: [ucm('1 flan', 125)],
  bedca_2497: [ucm('1 natillas (tarrina)', 140)],
  bedca_2483: [ucm('1 crema catalana', 125)],
  bedca_2479: [ucm('1 arroz con leche (tarrina)', 170)],
  bedca_2496: [ucm('1 mousse', 70)],
  bedca_2507: [ucm('1 tarrina', 75), QUESO_RACION],
  bedca_2506: [ucm('1 quesito (porción)', 20)],
  bedca_2513: [ucm('1 cucharada sopera', 11)],
  bedca_2503: [ucm('1 loncha', 20), QUESO_RACION],
  bedca_2508: [QUESO_RACION, ucm('1 loncha gruesa (semicurado)', 45)],
  bedca_942: [QUESO_RACION],
  bedca_923: [ucm('1 cucharada sopera', 15)],
  bedca_2555: [ucm('1 cucharada sopera', 15)],
  bedca_911: [est('1 cucharada sopera', 15), estMl('1 vaso', 200)],
  bedca_2521: [est('1 botellín', 100)],
  bedca_928: [est('1 botellín', 100)],

  // --- BEDCA: meat ---
  bedca_2273: [ucm('1 loncha', 30), est('1 ración de tapa', 50)],
  bedca_1781: [ucm('1 loncha', 30), est('1 ración de tapa', 50)],
  bedca_1777: [ucm('1 loncha', 30), est('1 ración de tapa', 50)],
  bedca_965: [ucm('1 loncha fina', 20), ucm('1 loncha', 35)],
  bedca_2272: [ucm('1 loncha fina', 20), ucm('1 loncha', 35)],
  bedca_2271: [ucm('1 loncha fina', 20), ucm('1 loncha', 35)],
  bedca_2274: [est('1 ración', 100)],
  bedca_2286: [ucm('1 loncha', 25)],
  bedca_2287: [ucm('1 loncha', 25)],
  bedca_2293: [ucm('1 loncha', 25)],
  bedca_2294: [ucm('1 loncha', 25)],
  bedca_2264: [ucm('1 rodaja', 10), est('1 ración de tapa', 50)],
  bedca_2262: [est('1 ración', 60)],
  bedca_2310: [ucm('1 rodaja', 13), est('1 ración de tapa', 50)],
  bedca_2303: [ucm('1 loncha', 15)],
  bedca_2277: [ucm('1 loncha', 10), est('1 ración de tapa', 50)],
  bedca_2282: [ucm('1 loncha', 17)],
  bedca_2263: [ucm('1 loncha', 17)],
  bedca_2280: [ucm('1 rodaja', 15), ucm('1 morcilla', 100)],
  bedca_2281: [ucm('1 rodaja', 15), ucm('1 morcilla', 100)],
  bedca_2254: [ucm('1 butifarra mediana', 150), ucm('1 butifarra grande', 200)],
  bedca_1161: [est('1 ración (≈ 10 rodajas)', 40)],
  bedca_2322: [est('1 ración', 80)],
  bedca_2311: [est('1 tostada untada', 20)],
  bedca_2269: [ucm('para untar una tostada', 15)],
  bedca_2284: [ucm('para untar una tostada', 15)],
  bedca_968: [ucm('para untar una tostada', 15)],
  bedca_680: [ucm('1 loncha', 25), ucm('1 loncha delgada', 12)],
  bedca_682: [ucm('1 loncha', 25), ucm('1 loncha delgada', 12)],
  bedca_2260: [ucm('1 loncha', 25)],
  bedca_2283: [ucm('1 loncha', 25)],
  bedca_2317: [est('1 loncha', 20)],
  bedca_2256: [est('1 ración de tapa', 40)],
  bedca_2309: [ucm('1 salchicha grande', 45), ucm('1 salchicha pequeña', 25)],
  bedca_982: [ucm('1 salchicha', 25)],
  bedca_2305: [ucm('1 salchicha mediana', 100), ucm('1 salchicha pequeña', 40)],
  bedca_2308: [ucm('1 salchicha mediana', 100), ucm('1 salchicha pequeña', 40)],
  bedca_988: [est('1 salchicha', 80)],
  bedca_2680: [ucm('1 ración (carne picada)', 125), ucm('1 hamburguesa', 90)],
  bedca_2257: [ucmAP('1 chuleta', 100)],
  bedca_2697: [ucmAP('1 chuleta', 100)],
  bedca_2696: [ucmAP('1 chuleta', 100)],
  bedca_2266: [ucmAP('1 chuleta', 70)],
  bedca_2292: [est('1/4 de pollo (sin huesos)', 200)], // UCM 1/4 pollo = 300 g with bones; BEDCA edible_portion is 1 here
  bedca_993: [est('1 muslo (sin hueso)', 100)],
  bedca_2291: [est('1 ala (sin hueso)', 30)],
  bedca_980: [est('1/4 de pollo asado (sin hueso)', 150)],
  bedca_994: [ucmAP('1 pechuga', 150)],
  bedca_2288: [ucmAP('1 pechuga (ración)', 150)],
  bedca_2297: [est('1 pechuga a la plancha', 120)],
  bedca_990: [est('1 filete a la plancha', 120)],
  bedca_2268: [ucm('1 croqueta', 25), est('1 ración de tapa (6 croquetas)', 150)],
  bedca_687: [est('1 ración', 200)],
  bedca_2301: [est('1 ración', 250)],
  bedca_964: [est('1 ración', 200)],
  bedca_2290: [est('1 filete empanado', 120)],
  bedca_2295: [est('1 ración (sin hueso)', 150)],

  // --- BEDCA: fish & seafood specifics ---
  bedca_2312: [ucmAP('1 rodaja mediana', 125)],
  bedca_2630: [ucmAP('1 sardina mediana', 40)],
  bedca_2631: [est('1 sardina asada', 30), est('1 ración (6 sardinas)', 180)],
  bedca_2316: [ucmAP('1 boquerón mediano', 20), PESCADO_RACION],
  bedca_2318: [est('1 ración de tapa', 100)],
  bedca_2640: [ucmAP('5 almejas', 65)],
  bedca_2330: [ucmAP('5 chirlas', 40)],
  bedca_2306: [ucmAP('5 berberechos', 40)],
  bedca_2345: [ucmAP('1 mejillón', 30), ucmAP('1 ración (10 mejillones)', 300)],
  bedca_824: [est('1 ración (10 mejillones, sin concha)', 80)],
  bedca_829: [ucmAP('1 ostra', 50)],
  bedca_2326: [ucmAP('1 caracol', 10)],
  bedca_2627: [ucm('1 loncha', 20)],
  bedca_2129: [ucm('1 anchoa', 3.5)],
  bedca_2130: [ucm('1 lata', 82), ucm('1 lata pequeña', 56)],
  bedca_2131: [ucm('1 lata', 82), ucm('1 lata pequeña', 56)],
  bedca_2132: [ucm('1 lata', 82), ucm('1 lata pequeña', 56)],
  bedca_2133: [ucm('1 lata', 82), ucm('1 lata pequeña', 56)],
  bedca_801: [ucm('1 lata', 82), ucm('1 lata pequeña', 56)],
  bedca_2314: [ucm('1 lata', 82), ucm('1 lata pequeña', 56)],
  bedca_802: [ucm('1 lata', 82), ucm('1 lata pequeña', 56)],
  bedca_805: [ucm('1 lata', 82), ucm('1 lata pequeña', 56)],
  bedca_2632: [ucm('1 lata (escurrida)', 85), ucm('1 sardina en conserva grande', 20)],
  bedca_2633: [ucm('1 lata (escurrida)', 85), ucm('1 sardina en conserva grande', 20)],
  bedca_823: [ucm('1 lata (escurrida)', 70), ucm('1 mejillón en conserva mediano', 8)],
  bedca_2346: [ucm('1 lata (escurrida)', 70), ucm('1 mejillón en conserva mediano', 8)],
  bedca_2641: [ucm('1 lata (escurrida)', 65)],
  bedca_2307: [ucm('1 lata (escurrida)', 65)],
  bedca_1164: [est('1 lata (escurrida)', 70)],
  bedca_2323: [est('1 lata (escurrida)', 70)],
  bedca_810: [est('1 lata (escurrida)', 70)],
  bedca_2338: [est('1 cucharadita', 10)],
  bedca_2562: [est('1 barrita de surimi', 15)],
  bedca_2374: [est('1 ración de tapa', 150)],
  bedca_2348: [est('1 filete rebozado', 120)],
  bedca_834: [est('1 ración', 130)],
  bedca_2304: [est('1 ración', 130)],
  bedca_2342: [est('1 ración', 130)],

  // --- BEDCA: fats ---
  bedca_756: [ucm('para untar una tostada', 15), ucm('para untar una galleta', 5)],
  bedca_2550: [ucm('para untar una tostada', 15), ucm('para untar una galleta', 5)],
  bedca_2551: [ucm('para untar una tostada', 15), ucm('para untar una galleta', 5)],
  bedca_2552: [ucm('para untar una tostada', 15), ucm('para untar una galleta', 5)],
  bedca_2549: [ucm('1 cucharada de postre', 15), ucm('1 cucharada sopera', 30)],
  bedca_2547: [est('1 cucharada sopera', 15)],
  bedca_2553: [ucm('1 cucharada sopera', 28), ucm('1 cucharada de postre', 14)],
  bedca_2554: [ucm('1 cucharada sopera', 28), ucm('1 cucharada de postre', 14)],
  bedca_874: [ucm('1 cucharada sopera', 28), ucm('1 cucharada de postre', 14)],
  bedca_873: [ucm('1 cucharada sopera', 28), ucm('1 cucharada de postre', 14)],
  bedca_790: [est('1 cucharada sopera', 25)],

  // --- BEDCA: cereals & bakery ---
  bedca_2160: [ucm('1 rebanada', 30), ucm('1 panecillo / barrita', 80), est('1 bocadillo (1/4 de barra)', 60), est('1 bocadillo (1/2 barra)', 125)],
  bedca_1064: [ucm('1 rebanada', 30), ucm('1 panecillo / barrita', 80)],
  bedca_1066: [ucm('1 rebanada', 30), est('1 bocadillo (1/4 de baguette)', 60)],
  bedca_2163: [ucm('1 rebanada', 30), ucm('1 panecillo / barrita', 80)],
  bedca_2169: [ucm('1 rebanada', 30), ucm('1 panecillo / barrita', 80)],
  bedca_2167: [ucm('1 rebanada', 30)],
  bedca_1067: [ucm('1 rebanada', 30)],
  bedca_1070: [ucm('1 rebanada', 30)],
  bedca_1071: [ucm('1 rebanada', 30)],
  bedca_2161: [ucm('1 rebanada mediana', 20), ucm('1 rebanada grande', 40)],
  bedca_2164: [ucm('1 rebanada mediana', 20), ucm('1 rebanada grande', 40)],
  bedca_2165: [ucm('1 biscote / rebanada tostada', 10)],
  bedca_2166: [ucm('1 biscote / rebanada tostada', 10)],
  bedca_2170: [ucm('1 biscote / rebanada tostada', 10)],
  bedca_2173: [ucm('1 biscote / rebanada tostada', 10)],
  bedca_2162: [est('1 rebanada frita', 35)],
  bedca_2168: [ucm('1 bollito (tipo medias noches)', 30)],
  bedca_2174: [ucm('1 panecillo de hamburguesa', 55)],
  bedca_2171: [ucm('1 cucharada sopera rasa', 6), ucm('1 cucharada sopera colmada', 12)],
  bedca_2660: ARROZ_CRUDO,
  bedca_904: ARROZ_CRUDO,
  bedca_2661: ARROZ_COCIDO,
  bedca_1009: ARROZ_COCIDO,
  bedca_1117: PASTA_CRUDA,
  bedca_1118: PASTA_CRUDA,
  bedca_1073: PASTA_CRUDA,
  bedca_1074: PASTA_CRUDA,
  bedca_1072: PASTA_COCIDA,
  bedca_1076: PASTA_COCIDA,
  bedca_1077: [est('1 ración', 200)],
  bedca_2158: [ucm('1 ración', 40)],
  bedca_2155: [ucm('1 ración', 40)],
  bedca_2675: [ucm('1 galleta', 6), ucm('4 galletas', 24)],
  bedca_2673: [ucm('1 galleta', 8)],
  bedca_1052: [ucm('1 galleta', 8)],
  bedca_2674: [ucm('1 galleta', 8)],
  bedca_1051: [ucm('1 galleta (cookie) mediana', 15)],
  bedca_1050: [ucm('1 galleta', 10)],
  bedca_1046: [ucm('1 galleta', 10)],
  bedca_2672: [ucm('1 galleta salada', 4)],
  bedca_875: [ucm('1 galleta salada', 4)],
  bedca_1102: [est('1 galleta', 15)],
  bedca_1048: [est('1 galleta', 10)],
  bedca_2665: [ucm('1 unidad mediana', 80)],
  bedca_2669: [ucm('1 cruasán grande', 90), ucm('1 cruasán mini', 20)],
  bedca_1043: [ucm('1 cruasán grande', 90), ucm('1 cruasán mini', 20)],
  bedca_2670: [ucm('1 dónut', 50)],
  bedca_1044: [ucm('1 dónut', 50)],
  bedca_2671: [ucm('1 ensaimada grande', 90)],
  bedca_2678: [ucm('1 magdalena pequeña', 27), ucm('1 magdalena grande', 42)],
  bedca_2159: [ucm('1 palmera grande', 90)],
  bedca_1062: [ucm('1 napolitana (bollería mediana)', 80)],
  bedca_1086: [ucm('1 sobao', 40)],
  bedca_2175: [ucm('1 pasta de té', 20)],
  bedca_2668: [ucm('1 churro', 9), est('1 ración (6 churros)', 55)],
  bedca_2664: [est('1 porción', 50)],
  bedca_2176: [est('1 rosquilla', 30)],
  bedca_2180: [est('1 torta', 30)],
  bedca_1115: [est('1 porción', 100)],
  bedca_1116: [est('1 porción', 100)],
  bedca_1078: [est('1 porción', 100)],
  bedca_1060: [est('1 lámina', 250)],
  bedca_2177: [ucm('1 cucharada sopera', 10)],
  bedca_1111: [est('1 cucharada sopera', 10)],
  bedca_1084: [ucm('1 cucharada sopera colmada', 15), est('1 ración en crudo', 60)],
  bedca_1085: [est('1 ración', 150)],
  bedca_891: [est('1 ración', 150)],
  bedca_2676: [est('1 cucharada sopera', 15)],
  bedca_2157: [est('1 cucharada sopera', 15)],
  bedca_2178: [est('1 cucharada sopera', 10)],
  bedca_2667: [est('1 cucharada sopera', 10)],
  bedca_1055: [est('1 ración (bol)', 250)],

  // --- BEDCA: legumes, nuts ---
  bedca_2193: [ucm('1 latita (escurrida)', 95)],
  bedca_1045: [VERDURA_GUARNICION],
  bedca_1175: [VERDURA_GUARNICION],
  bedca_2194: [VERDURA_GUARNICION],
  bedca_1124: [VERDURA_GUARNICION],
  bedca_1121: [est('1 ración', 100)],
  bedca_2183: [est('1 puñado', 30)],
  bedca_2195: [est('1 puñado', 30)],
  bedca_2208: [est('1 puñado', 30)],
  bedca_2186: [ucm('1 ración', 20)],
  bedca_925: [ucm('1 ración', 20)],
  bedca_2185: [ucm('1 ración', 20)],
  bedca_2202: [ucmAP('1 nuez con cáscara', 13, 'sin cáscara'), ...FRUTOS_SECOS],
  bedca_2207: [ucmAP('1 puñado con cáscara', 45, 'sin cáscara')],
  bedca_2205: [ucmAP('1 puñado con cáscara', 25, 'sin cáscara')],
  bedca_2206: [est('1 puñado', 25)],
  bedca_2204: [est('1 puñado', 25)],
  bedca_2244: [ucm('1 cucharada sopera', 11)],
  bedca_2203: [ucm('1 cucharada sopera', 11)],
  bedca_2187: [ucmAP('1 castaña', 10, 'sin cáscara'), est('1 ración (10 castañas)', 80)],
  bedca_935: [ucmAP('1 castaña', 10, 'sin cáscara'), est('1 ración (10 castañas)', 80)],
  bedca_971: [est('1 puñado', 30)],
  bedca_1127: [est('1 cucharada sopera', 10)],
  bedca_2188: [est('1 cucharada', 15)],
  bedca_979: [est('1 cucharada', 15)],
  bedca_1125: [ucm('1 cucharada sopera rasa (como harina)', 10)],

  // --- BEDCA: vegetables ---
  bedca_2361: [ucm('1 diente de ajo', 5), ucm('1 cabeza de ajo', 50)], // BEDCA edible_portion 0.01 is implausible → UCM weight as is
  bedca_2362: [est('1 cucharada', 5)],
  bedca_1176: [ucmAP('1 alcachofa mediana', 95), ucmAP('1 alcachofa grande', 130)],
  bedca_2363: [ucm('1 alcachofa en conserva mediana', 25), ucm('1 lata (escurrida)', 240)],
  bedca_2370: [ucmAP('1 berenjena mediana', 270), ucmAP('1 berenjena pequeña', 200)],
  bedca_731: [ucmAP('1 boniato mediano', 150)],
  bedca_2376: [ucmAP('1 calabacín mediano', 100), ucmAP('1 calabacín grande', 200)],
  bedca_2381: [ucmAP('1 cebolla mediana', 150), ucmAP('1 cebolla pequeña', 100), ucmAP('1 cebolla grande', 270)],
  bedca_2385: [ucm('1 latita (escurrida)', 85)],
  bedca_1180: [ucmAP('1 col de Bruselas', 25), VERDURA_RACION],
  bedca_2388: [ucmAP('1 endibia grande', 150), ucmAP('1 hoja', 7)],
  bedca_1179: [ucmAP('1 espárrago grande', 25), VERDURA_RACION],
  bedca_2393: [est('1 espárrago en conserva', 20), VERDURA_CONSERVA],
  bedca_2399: [ucmAP('1 hoja grande', 10), VERDURA_RACION],
  bedca_880: [ucmAP('1 nabo mediano', 125)],
  bedca_2403: [ucmAP('1 patata mediana', 170), ucmAP('1 patata pequeña', 100), ucmAP('1 patata grande', 240)],
  // Cooked potatoes: BEDCA edible_portion is 1 → UCM 170 g × 0.81 (edible factor of 'Patata, cruda').
  bedca_2404: [ucm('1 patata mediana (pelada)', 138), est('1 ración (guiso)', 250)],
  bedca_2402: [ucm('1 patata mediana (pelada)', 138)],
  bedca_892: [est('1 cucharada sopera', 15)],
  bedca_2221: [VERDURA_RACION],
  bedca_2156: [est('1 ración en crudo', 70)],
  bedca_1169: [est('1 ración', 50)],
  bedca_797: [PESCADO_RACION],
  bedca_883: [est('1 ración', 150)],
  bedca_884: [est('1 ración', 150)],
  bedca_2405: [est('1 ración', 150)],
  bedca_2407: [ucmAP('1 pepino mediano', 125), ucm('1 ración', 100)],
  bedca_2409: [ucmAP('1 pimiento rojo mediano', 180), ucmAP('1 pimiento rojo grande', 280)],
  bedca_2408: [ucm('1 pimiento morrón grande', 67)],
  bedca_2410: [est('1 ración', 100)],
  bedca_2411: [ucmAP('1 puerro mediano', 75)],
  bedca_2415: [ucmAP('1 rábano mediano', 40), ucmAP('1 manojo', 200)],
  bedca_2416: [ucm('1 rodaja', 6), VERDURA_CONSERVA],
  bedca_2421: [ucmAP('1 tomate mediano', 150), ucmAP('1 tomate pequeño', 90), ucmAP('1 tomate grande', 250), ucmAP('1 rodaja', 20)],
  bedca_2423: [ucm('1 tomate entero enlatado', 70), VERDURA_CONSERVA],
  bedca_2424: [ucmAP('1 zanahoria mediana', 80), ucmAP('1 zanahoria pequeña', 40), ucmAP('1 zanahoria grande', 100)],
  bedca_2366: [VERDURA_RACION],
  bedca_2413: [ucm('1 cucharada sopera (copos)', 6)],
  bedca_886: [ucm('1 cucharada sopera (copos)', 6)],
  bedca_888: [ucm('1 cucharada sopera (copos)', 6)],
  bedca_2414: [ucm('1 cucharada sopera (copos)', 6)],
  bedca_887: [est('1 ración', 200)],
  bedca_2406: [est('1 pepinillo', 10)],
  bedca_2364: [est('1 cucharada', 10)],
  bedca_2389: [est('1 ración', 150)],
  bedca_730: [est('1 ración', 100)],
  bedca_894: [est('1 lámina rallada', 2)],
  bedca_2473: HIERBA_FRESCA,
  bedca_850: HIERBA_FRESCA,

  // --- BEDCA: fruit ---
  bedca_2214: [ucm('1 latita (escurrida)', 40), est('1 aceituna sin hueso', 4)],
  bedca_2215: [ucmAP('1 aceituna', 4, 'sin hueso'), ucmAP('10 aceitunas', 40, 'sin hueso')],
  bedca_2216: [ucmAP('1 aguacate mediano', 200)],
  bedca_2217: [est('1 ración', 70)],
  bedca_2218: [ucmAP('1 albaricoque mediano', 50), FRUTA_RACION],
  bedca_2213: [ucmAP('1 caqui mediano', 200), ucmAP('1 caqui grande', 250)],
  bedca_2220: [ucmAP('10 cerezas', 50), FRUTA_RACION],
  bedca_2222: [ucmAP('1 chirimoya mediana', 200), ucmAP('1 chirimoya grande', 350)],
  bedca_1172: [ucmAP('1 ciruela mediana', 50), ucmAP('1 ciruela grande', 80)],
  bedca_2223: [ucmAP('1 ciruela mediana', 50), ucmAP('1 ciruela grande', 80)],
  bedca_2224: [ucmAP('1 dátil', 10, 'sin hueso')],
  bedca_2225: [ucmAP('1 fresa mediana', 17), FRUTA_RACION],
  bedca_2226: [ucmAP('1 granada', 275)],
  bedca_2227: [ucmAP('1 higo / breva', 40), FRUTA_RACION],
  bedca_2228: [ucmAP('1 kiwi mediano', 100)],
  bedca_2229: [ucmAP('1 mandarina mediana', 85), ucmAP('1 mandarina grande', 120), ucmAP('1 mandarina pequeña', 60)],
  bedca_2231: [ucmAP('1 manzana mediana', 200), ucmAP('1 manzana pequeña', 150), ucmAP('1 manzana grande', 250)],
  bedca_2232: [ucmAP('1 melocotón mediano', 200)],
  bedca_2235: [ucmAP('1 naranja mediana', 225), ucmAP('1 naranja pequeña', 170), ucmAP('1 naranja grande', 270)],
  bedca_2236: [ucmAP('1 nectarina', 200)],
  bedca_2239: [ucmAP('1 paraguaya', 200)],
  bedca_956: [ucmAP('1 níspero grande', 100), ucmAP('1 níspero pequeño', 60)],
  bedca_2241: [ucmAP('1 pera mediana', 190), ucmAP('1 pera pequeña', 140), ucmAP('1 pera grande', 240)],
  bedca_2242: [ucmAP('1 rodaja', 160), FRUTA_RACION],
  bedca_2243: [ucm('1 rodaja mediana', 50), ucm('1 rodaja grande', 70)],
  bedca_2245: [ucmAP('1 plátano mediano', 160, 'sin piel'), ucmAP('1 plátano pequeño', 125, 'sin piel'), ucmAP('1 plátano grande', 225, 'sin piel')],
  bedca_2246: [ucmAP('1 pomelo', 375)],
  bedca_2249: [ucmAP('1 racimo mediano', 160), ucmAP('1 racimo grande', 250)],
  bedca_1017: [ucmAP('1 racimo mediano', 160), ucmAP('1 racimo grande', 250)],
  bedca_2251: [ucm('1 puñado', 40)],
  bedca_1001: [ucmAP('1 lima (como limón mediano)', 110)],
  bedca_946: [est('1 orejón', 8)],
  bedca_908: [est('1 cucharada sopera', 8)],
  bedca_2240: [est('1 porción', 30)],

  // --- BEDCA: sugar, chocolate ---
  bedca_2642: [ucm('1 sobre', 7), ucm('1 cucharada de postre rasa', 4), ucm('1 cucharada sopera rasa', 12)],
  bedca_780: [ucm('1 sobre', 7), ucm('1 cucharada de postre rasa', 4), ucm('1 cucharada sopera rasa', 12)],
  bedca_786: [est('1 cucharadita', 4)],
  bedca_2643: [ucm('1 cucharada de postre', 20), ucm('1 cucharada sopera', 40)],
  bedca_2648: [ucm('1 cucharada de postre', 9), ucm('1 cucharada sopera', 20)],
  bedca_2431: [ucm('1 cucharada de postre', 9), ucm('1 cucharada sopera', 20)],
  bedca_783: [ucm('para untar una tostada', 30), ucm('1 cucharada de postre', 15)],
  bedca_2647: [ucm('1 bombón mediano', 15)],
  bedca_2645: [ucm('1 caramelo', 7.5)],
  bedca_2649: [ucm('1 chicle', 3.5)],
  bedca_785: [est('1 porción', 30)],
  bedca_766: [est('1 barrita', 57)],
  bedca_770: [est('1 barrita', 41)],
  bedca_769: [est('1 barrita', 51)],
  bedca_2652: [est('1 gominola', 5), est('1 puñado', 30)],
  bedca_2659: [est('1 barrita', 10)],
  bedca_2653: [est('1 ampolla / cucharadita', 2)],
  bedca_784: [est('1 ración', 100)],
  bedca_787: [est('1 cucharada sopera', 20)],
  bedca_2658: [est('1 porción', 100)],

  // --- BEDCA: beverages specifics ---
  bedca_2433: [ucmMl('1 taza pequeña (café solo)', 50)],
  bedca_2434: [ucmMl('1 taza pequeña (café solo)', 50)],
  bedca_681: [estMl('1 taza', 200)],
  bedca_2432: [ucm('1 sobre', 2)],
  bedca_1109: [ucm('1 sobre', 2)],
  bedca_2435: [ucm('1 cucharada de postre colmada', 2)],
  bedca_1019: [est('1 dosis', 7)],
  bedca_2443: [estMl('1 taza', 200)],
  bedca_1094: [estMl('1 taza', 200)],
  bedca_2442: [estMl('1 vaso', 200)],
  bedca_2436: [ucmMl('1 copa', 100)],
  bedca_2460: [ucmMl('1 vaso', 160)],
  bedca_1095: [ucmMl('1 copa', 100)],
  bedca_2463: [ucmMl('1 copa', 75)],
  bedca_2459: [estMl('1 vaso', 200)],
  bedca_2440: [estMl('1 cubata', 250)],
  bedca_2462: [ucmMl('1 vaso / copa', 90)],
  bedca_2464: [ucmMl('1 vaso / copa', 90)],
  bedca_2465: [ucmMl('1 vaso / copa', 90)],
  bedca_2429: [ucmMl('1 lata', 330), ucmMl('1 vaso', 200)],
  bedca_2425: [ucmMl('1 vaso', 200)],
  bedca_2426: [ucmMl('1 vaso', 200)],
  bedca_1015: [ucmMl('1 vaso', 200)],

  // --- BEDCA: miscellaneous ---
  bedca_2605: [ucm('1 cucharada sopera', 17), ucm('1 sobre', 11)],
  bedca_2560: [ucm('1 cucharada sopera', 15), ucm('1 ración de salsa de tomate', 55)],
  bedca_2124: [ucm('1 cucharada sopera', 7), ucm('1 cucharada de postre', 3)],
  bedca_2556: [ucm('1 cucharada sopera', 7), ucm('1 cucharada de postre', 3)],
  bedca_2557: [ucm('1 cucharada sopera', 7), ucm('1 cucharada de postre', 3)],
  bedca_2622: [ucm('1 cubito', 11)],
  bedca_792: [estMl('1 taza', 250)],
  bedca_2564: [ucm('1 ración (sin reconstituir)', 25)],
  bedca_2565: [ucm('1 ración (sin reconstituir)', 25)],
  bedca_866: [ucm('1 pellizco', 2), ucm('1 cucharada de café rasa', 2)],
  bedca_2585: [ucm('1 pellizco', 2), ucm('1 cucharada de café rasa', 2)],
  bedca_2589: [ucm('1 ración', 160)],
  bedca_2597: [est('1 ración', 325)],
  bedca_2596: [est('1 ración', 325)],
  bedca_2616: [est('1 plato', 300)],
  bedca_2614: [estMl('1 vaso', 200), est('1 plato', 250)],
  bedca_2617: [est('1 ración de tapa', 100), est('1 plato', 200)],
  bedca_2604: [est('1 ración', 250)],
  bedca_2478: [est('1 ración (3 canelones)', 250)],
  bedca_2620: [est('1 porción', 120)],
  bedca_2619: [ucm('1 empanadilla', 30)],
  bedca_2615: [est('1 flamenquín', 150)],
  bedca_2123: [est('1 ración', 150)],
  bedca_2476: [est('1 bocadillo', 200)],
  bedca_2474: [ucm('1 albóndiga', 37), est('1 ración (5 albóndigas)', 185)],
  bedca_2587: [est('1 rollito', 60)],
  bedca_2569: [est('1 san jacobo', 120)],
  bedca_2568: [est('1 ración', 100)],
  bedca_1182: [est('1 cucharada sopera', 15)],
  bedca_2594: [ucm('1 bolsa', 100), est('1 bolsa pequeña', 40)],
  bedca_870: [ucm('1 bolsa', 100), est('1 bolsa pequeña', 40)],
  bedca_871: [est('1 bol', 30)],
  bedca_2602: [est('1 bolsa pequeña', 30)],
  bedca_2609: [est('1 bolsa pequeña', 30)],
  bedca_789: [est('1 bolsa pequeña', 30)],
  bedca_2574: [est('1 bolsa pequeña', 30)],
  bedca_2607: [est('1 porción', 50)],
  bedca_2588: [est('1 porción', 100)],
  bedca_2613: [est('1 tarrina', 100)],
  bedca_903: [est('1 tarrina', 100)],
  bedca_902: [est('1 tarrina', 100)],
  bedca_877: [est('1 tarrina', 100)],
  bedca_901: [est('1 cucharada sopera', 15)],
  bedca_2612: [est('1 cucharadita', 3)],
  bedca_2567: [est('1 cucharada', 15)],
  bedca_2601: [est('1 cucharada sopera', 15)],
  bedca_2600: [est('1 cucharadita', 5)],
  bedca_2575: [est('1 cucharada sopera', 15)],
  bedca_2561: [est('unas gotas', 1)],
  bedca_2475: [est('1 sobre (unas hebras)', 0.1)],
  bedca_855: [est('1 cucharada sopera', 15)],
  bedca_2593: HIERBA_FRESCA,
  bedca_872: HIERBA_FRESCA,

  // --- CIQUAL gap-fill ---
  ciqual_22510: [
    { label: '1 pincho (1/8 de tortilla, ≈ {g} g)', grams: 90, source: CONSUMER_TORTILLA_URL },
    { label: '1 ración (≈ {g} g)', grams: 135, source: CONSUMER_TORTILLA_URL, isDefault: true },
    { label: '1 tortilla entera de 24–28 cm (≈ {g} g)', grams: 700, source: CONSUMER_TORTILLA_URL },
  ],
  ciqual_10002: [est('1 ración de tapa', 150), est('1 anilla', 10)],
  ciqual_25211: [est('1 ración', 200)],
  ciqual_20240: [est('1 ración', 150)],
  ciqual_7744: [est('1 porción', 80)],
  ciqual_13147: [ucm('1 latita (escurrida)', 40), est('1 aceituna', 4)],
  ciqual_5004: CERVEZA,
};

// ---------------------------------------------------------------------------
// Name rules (BEDCA names, accent-insensitive). First match wins; used when no explicit entry exists.
// ---------------------------------------------------------------------------

export interface PortionRule {
  /** BEDCA food groups (1 lácteos … 12 miscelánea) the rule applies to. */
  groups: number[];
  /** Matched against the accent-stripped, lower-cased name. */
  re: RegExp;
  not?: RegExp;
  portions: PortionEs[];
}

const COOKED = /\b(asad|plancha|frit|al horno|hervid|cocid|estofad|parrilla|al vapor|guisad)/;

export const PORTION_RULES: PortionRule[] = [
  // Dairy
  { groups: [1], re: /^(leche de (vaca|cabra|oveja)|leche, (semi)?desnatada|preparado lacteo|leche merengada|leche fermentada)/, portions: LECHE },
  { groups: [1], re: /^kefir|^bebida de soja|^leche de almendra/, portions: [ucmMl('1 vaso', 200)] },
  { groups: [1], re: /^batido/, not: /fermentado/, portions: [ucmMl('1 botella individual', 200)] },
  { groups: [1], re: /^yogur.*liquido|^yogur liquido/, portions: [ucmMl('1 botella individual', 200)] },
  { groups: [1], re: /^(yogur|batido fermentado de soja)/, portions: YOGUR },
  { groups: [1], re: /^mousse de (yogur|queso)/, portions: [est('1 tarrina', 70)] },
  { groups: [1], re: /^petit/, portions: [est('1 petit suisse', 55)] },
  { groups: [1], re: /^helado/, portions: [ucm('1 bola mediana', 115), ucm('1 bola pequeña', 75), ucm('1 bola grande', 160)] },
  { groups: [1], re: /^queso para untar/, portions: [est('1 porción para untar', 20)] },
  { groups: [1], re: /^queso (fresco|de burgos)|^requeson|^cremoso/, portions: [QUESO_RACION] },
  { groups: [1], re: /^queso (edam|gouda|emmental|cheddar|tierno|gruyer)/, portions: [QUESO_RACION, ucm('1 loncha', 20)] },
  { groups: [1], re: /^queso/, portions: [QUESO_RACION] },

  // Meat
  { groups: [3], re: /^(higado|corazon|rinon|lengua|sesos|pulmon|molleja|vacuno, (higado|mollejas))/, not: COOKED, portions: [CARNE_RACION] },
  { groups: [3], re: /costilla|costillar/, not: COOKED, portions: [CARNE_RACION] },
  { groups: [3], re: /crud|^carne de|^(cerdo|cordero|pollo|ternera|vaca\/buey|pavo), parte|^avestruz|^conejo|^perdiz|^liebre|^gallina|^pato, entero, crudo/, not: COOKED, portions: [CARNE_RACION] },
  { groups: [3], re: COOKED, not: /^(huevo|pan|pasta|arroz|patata|pescad|lenguado|merluza|bacalao|atun|calamar|gamba|mejillon|pulpo|bigaro|bogavante|sardina|boqueron|anguila|carpa|caballa|perca|platija|rape|salmon|trucha|dorada|mero|mujol|lucio|pez|bonito|garbanzo|lenteja|judia|alubia|soja|haba|guisante|acelga|brecol|calabaza|calabacin|cebolla|col|coliflor|espinaca|seta|tomate|castana|almendra|cacahuete|harina|semola|tapioca|pimiento|berenjena)/, portions: COCIDO_CARNE },

  // Fish & seafood
  { groups: [4], re: /^(gamba|langostino|cigala|bogavante|langosta|cangrejo|centollo|necora|camaron|percebe|bigaro|vieira|zamburina)/, portions: MARISCO },
  { groups: [4], re: /^(calamar|chipiron|sepia|pulpo)/, not: COOKED, portions: [ucmAP('1 ración', 160)] },
  { groups: [4], re: /ahumad|salado/, portions: [est('1 ración', 50)] },
  { groups: [4], re: /conserva|enlatad|en aceite|escabeche|al natural/, portions: [est('1 lata (escurrida)', 70)] },
  { groups: [4], re: COOKED, portions: COCIDO_PESCADO },
  { groups: [4], re: /^(pescado|anguila|angula|arenque|atun|bacaladilla|bacalao|besugo|bonito|breca|caballa|cabracho|carpa|congrio|dorada|faneca|fletan|gallo|jurel|lenguado|lija|lubina|lucio|merluza|mero|mujol|palometa|panga|perca|pescadilla|pez espada|pijota|platija|rape|raya|rodaballo|salema|salmon|salmonete|sardina|sargo|tenca|trucha|vieja|volador)/, portions: [PESCADO_RACION] },

  // Oils
  { groups: [5], re: /^aceite/, portions: ACEITE },

  // Cereals
  { groups: [6], re: /^(cereales desayuno|cereales para el desayuno|cereales base|arroz hinchado)/, portions: CEREAL_DESAYUNO },
  { groups: [6], re: /^barrita/, portions: [est('1 barrita', 25)] },
  { groups: [6], re: /^(harina|almidon)/, portions: [ucm('1 cucharada sopera rasa', 10), ucm('1 cucharada sopera colmada', 17)] },
  { groups: [6], re: /^(avena|cebada|centeno|trigo|mijo|quinoa), /, portions: [est('1 ración en crudo', 70)] },

  // Legumes & nuts
  { groups: [7], re: /seca, remojada, hervida|hervid|cocidas|en conserva/, not: /^(nuez|almendra)/, portions: LEGUMBRE_COCIDA },
  { groups: [7], re: /\bsec[oa]\b|^judia (blanca|pinta)$/, portions: LEGUMBRE_SECA },
  { groups: [7], re: /^judia verde/, portions: [VERDURA_RACION] },
  { groups: [7], re: /^(almendra|anacardo|avellana|nuez|pistacho|frutos secos|pinon)/, portions: FRUTOS_SECOS },

  // Vegetables
  { groups: [8], re: /en conserva|conserva/, portions: [VERDURA_CONSERVA] },
  { groups: [8], re: /hervid|asad|cocid|plancha/, portions: [est('1 ración', 200)] },
  { groups: [8], re: /^(acelga|achicoria|apio|bambu|berro|borraja|brecol|calabaza|canonigos|cardo|champinon|col|coliflor|endibia|ensalada|escarola|espinaca|grelo|judia verde|lechuga|lombarda|menestra|niscalo|repollo|rucula|seta|maiz|chayote|palmito|soja, germinada)/, portions: [VERDURA_RACION] },

  // Fruit
  { groups: [9], re: /almibar|en su jugo|macedonia/, portions: [ucm('1 ración', 90)] },
  { groups: [9], re: /^(arandano|frambuesa|grosella|guayaba|litchi|mango|melon|sandia|papaya|membrillo|uva|coco, fresco|mandarina|nispero|pera|ciruela)/, portions: [FRUTA_RACION] },

  // Sweets
  { groups: [10], re: /^(mermelada|confitura)/, portions: [ucm('1 porción de cafetería', 15), ucm('1 cucharada de postre', 13)] },
  { groups: [10], re: /^chocolate|^cacao en polvo/, portions: CHOCOLATE },

  // Beverages
  { groups: [11], re: /^cerveza/, portions: CERVEZA },
  { groups: [11], re: /^(aguardiente|anis|conac|ginebra|licor|ron$|tequila|vodka|whisky)/, portions: LICOR },
  { groups: [11], re: /^(refresco|soda|limonada|bebida isotonica)/, portions: REFRESCO },
  { groups: [11], re: /^(zumo|nectar)/, portions: ZUMO },

  // Spices, sauces
  { groups: [12], re: /^salsa/, portions: SALSA },
  { groups: [12], re: /^(ajo, en polvo|canela|chile|comino|curry|eneldo|guindilla|hinojo|jengibre|laurel|nuez moscada|oregano|pimenton|pimienta|romero|tomillo|vainilla|complejo)/, portions: ESPECIA },
];

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Portions for a seed food (explicit entry first, then the name rules of its BEDCA group), or undefined. */
export function portionsFor(id: string, name: string, group?: number): PortionEs[] | undefined {
  const explicit = PORTIONS_BY_ID[id];
  if (explicit && explicit.length) return explicit;
  if (group === undefined) return undefined;
  const n = norm(name);
  for (const r of PORTION_RULES) {
    if (r.groups.includes(group) && r.re.test(n) && !(r.not && r.not.test(n))) return r.portions;
  }
  return undefined;
}
