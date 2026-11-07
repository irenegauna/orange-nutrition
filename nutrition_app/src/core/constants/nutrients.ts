import type { NutrientDefinition, NutrientId } from '../types/nutrients';

type Def = Omit<NutrientDefinition, 'order'>;

const DEFS: Def[] = [
  // ----- Macronutrients -----
  { id: 'energy', name: 'Calorías', shortName: 'kcal', category: 'macronutrient', unit: 'kcal', displayDecimals: 0, usdaNutrientIds: [1008], offKeys: ['energy-kcal'], aliases: ['calories', 'calorie', 'kcal', 'energy', 'calorias', 'caloria', 'energia'] },
  { id: 'protein', name: 'Proteína', shortName: 'Proteína', category: 'macronutrient', unit: 'g', displayDecimals: 1, usdaNutrientIds: [1003], offKeys: ['proteins'], aliases: ['protein', 'proteins', 'proteina', 'proteinas'] },
  { id: 'carbohydrate', name: 'Hidratos de carbono', shortName: 'Hidratos', category: 'macronutrient', unit: 'g', displayDecimals: 1, usdaNutrientIds: [1005], offKeys: ['carbohydrates'], aliases: ['carbs', 'carbohydrate', 'carbohydrates', 'hidratos', 'carbohidratos', 'hidratos de carbono'] },
  { id: 'fat', name: 'Grasas', shortName: 'Grasas', category: 'macronutrient', unit: 'g', displayDecimals: 1, usdaNutrientIds: [1004], offKeys: ['fat'], aliases: ['fat', 'fats', 'lipids', 'grasa', 'grasas', 'lipidos'] },
  { id: 'fiber', name: 'Fibra', shortName: 'Fibra', category: 'macronutrient', unit: 'g', displayDecimals: 1, usdaNutrientIds: [1079], offKeys: ['fiber'], aliases: ['fiber', 'fibre', 'fibra'] },
  { id: 'sugar', name: 'Azúcares', shortName: 'Azúcar', category: 'macronutrient', unit: 'g', displayDecimals: 1, usdaNutrientIds: [2000], offKeys: ['sugars'], aliases: ['sugar', 'sugars', 'azucar', 'azucares'] },
  { id: 'saturatedFat', name: 'Grasas saturadas', shortName: 'G. saturadas', category: 'macronutrient', unit: 'g', displayDecimals: 1, usdaNutrientIds: [1258], offKeys: ['saturated-fat'], aliases: ['saturated fat', 'saturated', 'grasas saturadas', 'grasa saturada', 'saturadas'] },
  // ----- Minerals -----
  { id: 'calcium', name: 'Calcio', shortName: 'Ca', category: 'mineral', unit: 'mg', displayDecimals: 0, usdaNutrientIds: [1087], offKeys: ['calcium'], aliases: ['calcium', 'calcio'] },
  { id: 'iron', name: 'Hierro', shortName: 'Fe', category: 'mineral', unit: 'mg', displayDecimals: 1, usdaNutrientIds: [1089], offKeys: ['iron'], aliases: ['iron', 'hierro'] },
  { id: 'magnesium', name: 'Magnesio', shortName: 'Mg', category: 'mineral', unit: 'mg', displayDecimals: 0, usdaNutrientIds: [1090], offKeys: ['magnesium'], aliases: ['magnesium', 'magnesio'] },
  { id: 'phosphorus', name: 'Fósforo', shortName: 'P', category: 'mineral', unit: 'mg', displayDecimals: 0, usdaNutrientIds: [1091], offKeys: ['phosphorus'], aliases: ['phosphorus', 'fosforo'] },
  { id: 'potassium', name: 'Potasio', shortName: 'K', category: 'mineral', unit: 'mg', displayDecimals: 0, usdaNutrientIds: [1092], offKeys: ['potassium'], aliases: ['potassium', 'potasio'] },
  { id: 'sodium', name: 'Sodio', shortName: 'Na', category: 'mineral', unit: 'mg', displayDecimals: 0, usdaNutrientIds: [1093], offKeys: ['sodium'], aliases: ['sodium', 'sodio'] },
  { id: 'zinc', name: 'Zinc', shortName: 'Zn', category: 'mineral', unit: 'mg', displayDecimals: 1, usdaNutrientIds: [1095], offKeys: ['zinc'], aliases: ['zinc', 'zinc', 'cinc'] },
  { id: 'copper', name: 'Cobre', shortName: 'Cu', category: 'mineral', unit: 'mg', displayDecimals: 2, usdaNutrientIds: [1098], offKeys: ['copper'], aliases: ['copper', 'cobre'] },
  { id: 'manganese', name: 'Manganeso', shortName: 'Mn', category: 'mineral', unit: 'mg', displayDecimals: 2, usdaNutrientIds: [1101], offKeys: ['manganese'], aliases: ['manganese', 'manganeso'] },
  { id: 'selenium', name: 'Selenio', shortName: 'Se', category: 'mineral', unit: 'ug', displayDecimals: 1, usdaNutrientIds: [1103], offKeys: ['selenium'], aliases: ['selenium', 'selenio'] },
  { id: 'iodine', name: 'Yodo', shortName: 'I', category: 'mineral', unit: 'ug', displayDecimals: 0, usdaNutrientIds: [1100], offKeys: ['iodine'], aliases: ['iodine', 'yodo'] },
  // ----- Vitamins -----
  { id: 'vitaminA', name: 'Vitamina A (ER)', shortName: 'A', category: 'vitamin', unit: 'ug', displayDecimals: 0, usdaNutrientIds: [1106], offKeys: ['vitamin-a'], aliases: ['vitamin a', 'vit a', 'retinol', 'vitamina a', 'retinol'] },
  { id: 'thiamin', name: 'Vitamina B1 (tiamina)', shortName: 'B1', category: 'vitamin', unit: 'mg', displayDecimals: 2, usdaNutrientIds: [1165], offKeys: ['vitamin-b1'], aliases: ['vitamin b1', 'b1', 'thiamin', 'thiamine', 'vitamina b1', 'tiamina'] },
  { id: 'riboflavin', name: 'Vitamina B2 (riboflavina)', shortName: 'B2', category: 'vitamin', unit: 'mg', displayDecimals: 2, usdaNutrientIds: [1166], offKeys: ['vitamin-b2'], aliases: ['vitamin b2', 'b2', 'riboflavin', 'vitamina b2', 'riboflavina'] },
  { id: 'niacin', name: 'Vitamina B3 (niacina)', shortName: 'B3', category: 'vitamin', unit: 'mg', displayDecimals: 1, usdaNutrientIds: [1167], offKeys: ['vitamin-pp'], aliases: ['vitamin b3', 'b3', 'niacin', 'vitamina b3', 'niacina'] },
  { id: 'pantothenicAcid', name: 'Vitamina B5 (ácido pantoténico)', shortName: 'B5', category: 'vitamin', unit: 'mg', displayDecimals: 2, usdaNutrientIds: [1170], offKeys: ['pantothenic-acid'], aliases: ['vitamin b5', 'b5', 'pantothenic acid', 'pantothenic', 'vitamina b5', 'acido pantotenico'] },
  { id: 'vitaminB6', name: 'Vitamina B6', shortName: 'B6', category: 'vitamin', unit: 'mg', displayDecimals: 2, usdaNutrientIds: [1175], offKeys: ['vitamin-b6'], aliases: ['vitamin b6', 'b6', 'pyridoxine', 'vitamina b6', 'piridoxina'] },
  { id: 'biotin', name: 'Vitamina B7 (biotina)', shortName: 'B7', category: 'vitamin', unit: 'ug', displayDecimals: 1, usdaNutrientIds: [1176], offKeys: ['biotin'], aliases: ['vitamin b7', 'b7', 'biotin', 'vitamina b7', 'biotina'] },
  { id: 'folate', name: 'Vitamina B9 (folato, EFD)', shortName: 'B9', category: 'vitamin', unit: 'ug', displayDecimals: 0, usdaNutrientIds: [1190], offKeys: ['vitamin-b9', 'folates'], aliases: ['vitamin b9', 'b9', 'folate', 'folic acid', 'vitamina b9', 'folato', 'acido folico'] },
  { id: 'vitaminB12', name: 'Vitamina B12', shortName: 'B12', category: 'vitamin', unit: 'ug', displayDecimals: 2, usdaNutrientIds: [1178], offKeys: ['vitamin-b12'], aliases: ['vitamin b12', 'b12', 'cobalamin', 'vitamina b12', 'cobalamina'] },
  { id: 'vitaminC', name: 'Vitamina C', shortName: 'C', category: 'vitamin', unit: 'mg', displayDecimals: 1, usdaNutrientIds: [1162], offKeys: ['vitamin-c'], aliases: ['vitamin c', 'vit c', 'ascorbic acid', 'vitamina c', 'acido ascorbico'] },
  { id: 'vitaminD', name: 'Vitamina D', shortName: 'D', category: 'vitamin', unit: 'ug', displayDecimals: 1, usdaNutrientIds: [1114], offKeys: ['vitamin-d'], aliases: ['vitamin d', 'vit d', 'vitamina d'] },
  { id: 'vitaminE', name: 'Vitamina E (α-tocoferol)', shortName: 'E', category: 'vitamin', unit: 'mg', displayDecimals: 1, usdaNutrientIds: [1109], offKeys: ['vitamin-e'], aliases: ['vitamin e', 'vit e', 'tocopherol', 'vitamina e', 'tocoferol'] },
  { id: 'vitaminK', name: 'Vitamina K', shortName: 'K', category: 'vitamin', unit: 'ug', displayDecimals: 1, usdaNutrientIds: [1185], offKeys: ['vitamin-k'], aliases: ['vitamin k', 'vit k', 'phylloquinone', 'vitamina k', 'filoquinona'] },
];

/** All nutrient definitions in display order. */
export const NUTRIENT_DEFINITIONS: readonly NutrientDefinition[] = DEFS.map((d, i) => ({ ...d, order: i }));

/** Lookup by id. */
export const NUTRIENTS: Readonly<Record<NutrientId, NutrientDefinition>> = Object.fromEntries(
  NUTRIENT_DEFINITIONS.map((d) => [d.id, d]),
) as Record<NutrientId, NutrientDefinition>;

export function getNutrientDefinition(id: NutrientId): NutrientDefinition {
  return NUTRIENTS[id];
}

/** Nutrients that must be present for a food to be considered "macro complete". */
export const CORE_MACROS: readonly NutrientId[] = ['energy', 'protein', 'carbohydrate', 'fat'];
