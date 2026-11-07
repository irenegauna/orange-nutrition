import type { NutrientId } from '../types/nutrients';
import type { Sex } from '../types/domain';

/**
 * Vitamin & mineral reference intakes for the Spanish population (adults), AESAN Scientific
 * Committee (2019), "Ingestas Nutricionales de Referencia (INR) para la población española",
 * Rev Comité Científico AESAN 29:43-68; tables republished in Rev Esp Salud Pública
 * 2022;96:e202203034. Built on EFSA DRVs (mix of PRIs and AIs). Values per day, canonical units.
 *
 * Sodium is NOT taken from AESAN here: its 1,500 mg INR is an adequate intake, not an upper
 * limit. The limit used is EFSA (2019): 2.0 g sodium/day "safe and adequate" for adults.
 */
type Micros = Partial<Record<NutrientId, number>>;

const WOMAN: Micros = {
  vitaminA: 650, thiamin: 1.1, riboflavin: 1.2, niacin: 14, pantothenicAcid: 5, vitaminB6: 1.3, biotin: 30, folate: 330,
  vitaminB12: 2.4, vitaminC: 75, vitaminD: 12.5, vitaminE: 11, vitaminK: 70,
  calcium: 950, phosphorus: 700, iron: 18, magnesium: 300, potassium: 3500, selenium: 55, zinc: 8,
  copper: 1.1, manganese: 3, iodine: 150,
};

const MAN: Micros = {
  vitaminA: 750, thiamin: 1.2, riboflavin: 1.5, niacin: 17, pantothenicAcid: 5, vitaminB6: 1.7, biotin: 30, folate: 330,
  vitaminB12: 2.4, vitaminC: 75, vitaminD: 12.5, vitaminE: 13, vitaminK: 70,
  calcium: 950, phosphorus: 700, iron: 9.1, magnesium: 350, potassium: 3500, selenium: 70, zinc: 11,
  copper: 1.3, manganese: 3, iodine: 150,
};

interface Band {
  minAge: number;
  label: string;
  micros: Micros;
}

/** Adult age bands, oldest first so the first match wins. */
const BANDS: Record<Sex, Band[]> = {
  female: [
    { minAge: 70, label: 'Mujeres 70+', micros: { ...WOMAN, thiamin: 1.0, vitaminB6: 1.5, vitaminK: 90, vitaminD: 15, calcium: 1000, iron: 9, magnesium: 280, zinc: 7, copper: 1.2 } },
    { minAge: 60, label: 'Mujeres 60–69', micros: { ...WOMAN, thiamin: 1.0, vitaminB6: 1.5, vitaminK: 90, calcium: 1000, iron: 9, magnesium: 280, copper: 1.2 } },
    { minAge: 50, label: 'Mujeres 50–59', micros: { ...WOMAN, iron: 15 } },
    { minAge: 20, label: 'Mujeres 20–49', micros: WOMAN },
    // AESAN 14-19 band; only 18-19 year-olds reach it here (adults only).
    { minAge: 18, label: 'Mujeres 18–19', micros: { ...WOMAN, niacin: 15, vitaminB6: 1.2, vitaminK: 65, calcium: 1150, phosphorus: 800, iron: 15, zinc: 9, copper: 1.0, selenium: 60 } },
  ],
  male: [
    { minAge: 70, label: 'Hombres 70+', micros: { ...MAN, niacin: 16, riboflavin: 1.4, vitaminK: 80, vitaminD: 15, calcium: 1000, selenium: 60 } },
    { minAge: 60, label: 'Hombres 60–69', micros: { ...MAN, niacin: 16, vitaminK: 80, calcium: 1000 } },
    { minAge: 50, label: 'Hombres 50–59', micros: { ...MAN, vitaminK: 80 } },
    { minAge: 20, label: 'Hombres 20–49', micros: MAN },
    { minAge: 18, label: 'Hombres 18–19', micros: { ...MAN, vitaminB6: 1.5, calcium: 1150, phosphorus: 800, iron: 11, selenium: 60 } },
  ],
};

export function aesanMicronutrients(sex: Sex, age: number): { label: string; micros: Micros } {
  const band = BANDS[sex].find((b) => age >= b.minAge) ?? BANDS[sex][BANDS[sex].length - 1]!;
  return { label: `${band.label} (AESAN 2019)`, micros: band.micros };
}

/** EFSA (2019): safe and adequate sodium intake for adults (mg/day), used as an upper limit. */
export const EFSA_SODIUM_LIMIT_MG = 2000;

/**
 * EU labelling Reference Intakes for an average adult, Reg. (EU) 1169/2011 Annex XIII Part B.
 * Used for people without a profile, and to scale sugars/saturates to the person's energy.
 */
export const EU_REFERENCE_INTAKES = { energyKcal: 2000, protein: 50, carbohydrate: 260, fat: 70, saturatedFat: 20, sugar: 90 } as const;

/** EFSA (2010) adequate intake of dietary fibre for adults, g/day. */
export const EFSA_FIBRE_AI_G = 25;
