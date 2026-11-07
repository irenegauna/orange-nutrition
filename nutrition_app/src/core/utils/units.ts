import type { Food, FoodSnapshot, MassUnit, Quantity, QuantityUnit, VolumeUnit } from '../types/domain';
import type { NutrientUnit } from '../types/nutrients';

/**
 * Centralized unit conversion rules. Every conversion in the app must go through this module.
 */

/** Grams per unit. Avoirdupois ounce/pound (exact definitions). */
export const GRAMS_PER_MASS_UNIT: Readonly<Record<MassUnit, number>> = {
  mg: 0.001,
  g: 1,
  kg: 1000,
  oz: 28.349523125,
  lb: 453.59237,
};

/** Millilitres per unit. US customary measures (the basis of USDA household portions). */
export const ML_PER_VOLUME_UNIT: Readonly<Record<VolumeUnit, number>> = {
  ml: 1,
  l: 1000,
  tsp: 4.92892159375,
  tbsp: 14.78676478125,
  fl_oz: 29.5735295625,
  cup: 236.5882365,
};

export const KJ_PER_KCAL = 4.184;

/** EU Regulation 1169/2011 Annex I: salt = sodium × 2.5. */
export const SALT_PER_SODIUM = 2.5;

export class ConversionError extends Error {
  readonly code = 'CONVERSION';
  constructor(message: string) {
    super(message);
    this.name = 'ConversionError';
  }
}

export function isMassUnit(u: QuantityUnit): u is MassUnit {
  return u in GRAMS_PER_MASS_UNIT;
}

export function isVolumeUnit(u: QuantityUnit): u is VolumeUnit {
  return u in ML_PER_VOLUME_UNIT;
}

export function massToGrams(amount: number, unit: MassUnit): number {
  return amount * GRAMS_PER_MASS_UNIT[unit];
}

export function gramsToMass(grams: number, unit: MassUnit): number {
  return grams / GRAMS_PER_MASS_UNIT[unit];
}

export function volumeToMl(amount: number, unit: VolumeUnit): number {
  return amount * ML_PER_VOLUME_UNIT[unit];
}

const NUTRIENT_UNIT_TO_GRAMS: Readonly<Record<Exclude<NutrientUnit, 'kcal'>, number>> = {
  g: 1,
  mg: 1e-3,
  ug: 1e-6,
};

/** Converts a mass nutrient amount between g / mg / µg. */
export function convertNutrientMass(amount: number, from: Exclude<NutrientUnit, 'kcal'>, to: Exclude<NutrientUnit, 'kcal'>): number {
  if (from === to) return amount;
  return (amount * NUTRIENT_UNIT_TO_GRAMS[from]) / NUTRIENT_UNIT_TO_GRAMS[to];
}

export const kjToKcal = (kj: number) => kj / KJ_PER_KCAL;
export const kcalToKj = (kcal: number) => kcal * KJ_PER_KCAL;
export const saltToSodiumMg = (saltGrams: number) => (saltGrams / SALT_PER_SODIUM) * 1000;
export const sodiumMgToSaltG = (sodiumMg: number) => (sodiumMg / 1000) * SALT_PER_SODIUM;

/**
 * International Unit conversions (explicit, nutrient-specific):
 * - vitamin D: 1 IU = 0.025 µg
 * - vitamin A as retinol: 1 IU = 0.3 µg RAE
 * - vitamin A as dietary β-carotene: 1 IU = 0.05 µg RAE
 * - vitamin E natural (RRR-α-tocopherol): 1 IU = 0.67 mg
 * - vitamin E synthetic (all-rac-α-tocopherol): 1 IU = 0.45 mg
 */
export const IU_FACTORS = {
  vitaminD_ug: 0.025,
  vitaminA_retinol_ugRAE: 0.3,
  vitaminA_betaCarotene_ugRAE: 0.05,
  vitaminE_natural_mg: 0.67,
  vitaminE_synthetic_mg: 0.45,
} as const;

export function iuToCanonical(iu: number, kind: keyof typeof IU_FACTORS): number {
  return iu * IU_FACTORS[kind];
}

type Convertible = Pick<Food, 'servings' | 'densityGPerMl'> | Pick<FoodSnapshot, 'servings' | 'densityGPerMl'>;

/**
 * Resolves a quantity to grams for a given food.
 * - mass units convert directly
 * - 'serving' uses the referenced serving definition
 * - volume units use the food density, or a serving that declares its volume
 * Throws ConversionError if the quantity cannot be resolved (never guesses).
 */
export function quantityToGrams(quantity: Quantity, food: Convertible): number {
  const { amount, unit } = quantity;
  if (!Number.isFinite(amount) || amount < 0) throw new ConversionError(`Cantidad no válida: ${amount}`);
  if (isMassUnit(unit)) return massToGrams(amount, unit);
  if (unit === 'serving') {
    const serving =
      (quantity.servingId && food.servings.find((s) => s.id === quantity.servingId)) ||
      (!quantity.servingId ? food.servings.find((s) => s.isDefault) : undefined);
    if (!serving) throw new ConversionError(`La ración "${quantity.servingId ?? 'por defecto'}" no existe para este alimento`);
    return amount * serving.grams;
  }
  if (isVolumeUnit(unit)) {
    const ml = volumeToMl(amount, unit);
    if (food.densityGPerMl && food.densityGPerMl > 0) return ml * food.densityGPerMl;
    const volServing = food.servings.find((s) => s.volumeMl && s.volumeMl > 0);
    if (volServing && volServing.volumeMl) return ml * (volServing.grams / volServing.volumeMl);
    throw new ConversionError(`No se puede convertir ${unit} a gramos: este alimento no tiene densidad ni raciones por volumen`);
  }
  throw new ConversionError(`Unidad no admitida: ${String(unit)}`);
}
